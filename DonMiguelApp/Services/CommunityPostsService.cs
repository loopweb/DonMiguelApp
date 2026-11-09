using System.Text.Json;
using System.Text.RegularExpressions;

namespace DonMiguelApp.Services;

// Best-effort reader of public YouTube Posts page. YouTube provides no official
// Data API endpoint for Community posts. No external paid service is required.
public sealed class CommunityPostsService
{
    private readonly HttpClient _http;
    private readonly ILogger<CommunityPostsService> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private CommunityPost? _lastGood;
    private DateTimeOffset _checkedAt = DateTimeOffset.MinValue;
    private const string PostsUrl = "https://www.youtube.com/@migflow/posts";

    public CommunityPostsService(HttpClient http, ILogger<CommunityPostsService> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<CommunityPost?> GetLatestAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow - _checkedAt < TimeSpan.FromHours(6)) return _lastGood;
        await _lock.WaitAsync(ct);
        try
        {
            if (DateTimeOffset.UtcNow - _checkedAt < TimeSpan.FromHours(6)) return _lastGood;
            try
            {
                using var response = await _http.GetAsync(PostsUrl + "?hl=en", ct);
                response.EnsureSuccessStatusCode();
                var html = await response.Content.ReadAsStringAsync(ct);
                var json = ExtractInitialData(html);
                if (json is null) throw new InvalidOperationException("YouTube page has no initial data");
                using var document = JsonDocument.Parse(json);
                var post = FindPost(document.RootElement);
                if (post is null) throw new InvalidOperationException("No public post found in YouTube page");
                _lastGood = post;
                _checkedAt = DateTimeOffset.UtcNow;
            }
            catch (Exception e)
            {
                _logger.LogWarning("Community posts could not be refreshed: {Message}", e.Message);
                _checkedAt = DateTimeOffset.UtcNow; // throttle failed reads too
            }
            return _lastGood;
        }
        finally { _lock.Release(); }
    }

    private static string? ExtractInitialData(string html)
    {
        var match = Regex.Match(html, @"(?:var\s+ytInitialData\s*=|window\[\s*[""']ytInitialData[""']\s*\]\s*=)\s*\{", RegexOptions.CultureInvariant);
        if (!match.Success) return null;
        var start = match.Index + match.Length - 1;
        var depth = 0;
        var inString = false;
        var escaped = false;
        for (var i = start; i < html.Length; i++)
        {
            var c = html[i];
            if (inString)
            {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') inString = false;
            }
            else
            {
                if (c == '"') inString = true;
                else if (c == '{') depth++;
                else if (c == '}' && --depth == 0) return html[start..(i + 1)];
            }
        }
        return null;
    }

    private static CommunityPost? FindPost(JsonElement root)
    {
        if (root.ValueKind == JsonValueKind.Object)
        {
            // The first renderer in the Posts tab is normally the latest post.
            foreach (var key in new[] { "backstagePostRenderer", "postRenderer", "postViewModel" })
            {
                if (root.TryGetProperty(key, out var renderer))
                {
                    var id = FindString(renderer, "postId") ?? FindString(renderer, "postIdText");
                    var text = ReadText(renderer, "contentText") ?? ReadText(renderer, "content") ?? ReadText(renderer, "contentTextViewModel") ?? "";
                    var image = FindImage(renderer);
                    if (!string.IsNullOrWhiteSpace(id) && Regex.IsMatch(id, "^[a-zA-Z0-9_-]+$"))
                    {
                        return new CommunityPost(id, text, image, "https://www.youtube.com/post/" + id);
                    }
                }
            }
            foreach (var property in root.EnumerateObject())
            {
                var found = FindPost(property.Value);
                if (found is not null) return found;
            }
        }
        else if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in root.EnumerateArray())
            {
                var found = FindPost(child);
                if (found is not null) return found;
            }
        }
        return null;
    }

    private static string? FindString(JsonElement element, string key)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String) return value.GetString();
            foreach (var item in element.EnumerateObject())
            {
                var found = FindString(item.Value, key);
                if (!string.IsNullOrEmpty(found)) return found;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var item in element.EnumerateArray())
            {
                var found = FindString(item, key);
                if (!string.IsNullOrEmpty(found)) return found;
            }
        return null;
    }

    private static string? ReadText(JsonElement element, string key)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(key, out var node)) return null;
        if (node.ValueKind == JsonValueKind.String) return node.GetString();
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("simpleText", out var simple) && simple.ValueKind == JsonValueKind.String) return simple.GetString();
            if (node.TryGetProperty("runs", out var runs) && runs.ValueKind == JsonValueKind.Array)
                return string.Concat(runs.EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Object && x.TryGetProperty("text", out var t) ? t.GetString() : ""));
        }
        return null;
    }

    private static string? FindImage(JsonElement node)
    {
        // Only scan attachments, not channel avatars.
        if (node.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in new[] { "backstageAttachment", "image", "images" })
        {
            if (node.TryGetProperty(key, out var attachment))
            {
                var url = FindString(attachment, "url");
                if (url is not null && Uri.TryCreate(url, UriKind.Absolute, out var parsed) && parsed.Scheme == "https") return url;
            }
        }
        return null;
    }
}

public record CommunityPost(string Id, string Text, string? ImageUrl, string Url);
