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
    private IReadOnlyList<CommunityPost> _lastGood = Array.Empty<CommunityPost>();
    // Next time the YouTube page may be read again: 6 h after a success,
    // but only 10 min after a failed read, so one hiccup (e.g. a cold start)
    // no longer hides the news for hours.
    private DateTimeOffset _nextCheck = DateTimeOffset.MinValue;
    private const string PostsUrl = "https://www.youtube.com/@migflow/posts";
    private const int MaxPosts = 6;

    public CommunityPostsService(HttpClient http, ILogger<CommunityPostsService> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<CommunityPost?> GetLatestAsync(CancellationToken ct)
    {
        var posts = await GetRecentAsync(ct);
        return posts.Count > 0 ? posts[0] : null;
    }

    // The newest posts of the channel, newest first (at most six).
    public async Task<IReadOnlyList<CommunityPost>> GetRecentAsync(CancellationToken ct)
    {
        if (DateTimeOffset.UtcNow < _nextCheck) return _lastGood;
        await _lock.WaitAsync(ct);
        try
        {
            if (DateTimeOffset.UtcNow < _nextCheck) return _lastGood;
            try
            {
                using var response = await _http.GetAsync(PostsUrl + "?hl=en", ct);
                response.EnsureSuccessStatusCode();
                var html = await response.Content.ReadAsStringAsync(ct);
                var posts = ParsePosts(html, MaxPosts);
                if (posts.Count == 0) throw new InvalidOperationException("No public post found in YouTube page");
                _lastGood = posts;
                _nextCheck = DateTimeOffset.UtcNow.AddHours(6);
            }
            catch (Exception e)
            {
                _logger.LogWarning("Community posts could not be refreshed: {Message}", e.Message);
                _nextCheck = DateTimeOffset.UtcNow.AddMinutes(10); // retry soon after a failure
            }
            return _lastGood;
        }
        finally { _lock.Release(); }
    }

    // Reads the posts out of the HTML of the channel's Posts page.
    public static List<CommunityPost> ParsePosts(string html, int max)
    {
        var json = ExtractInitialData(html);
        if (json is null) throw new InvalidOperationException("YouTube page has no initial data");
        using var document = JsonDocument.Parse(json);
        var posts = new List<CommunityPost>();
        CollectPosts(document.RootElement, posts, max);
        return posts;
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

    private static void CollectPosts(JsonElement root, List<CommunityPost> posts, int max)
    {
        if (posts.Count >= max) return;
        if (root.ValueKind == JsonValueKind.Object)
        {
            // Posts appear in page order, newest first.
            foreach (var key in new[] { "backstagePostRenderer", "postRenderer", "postViewModel" })
            {
                if (!root.TryGetProperty(key, out var renderer)) continue;
                var id = FindString(renderer, "postId") ?? FindString(renderer, "postIdText");
                if (string.IsNullOrWhiteSpace(id) || !Regex.IsMatch(id, "^[a-zA-Z0-9_-]+$")) continue;
                if (posts.Any(p => p.Id == id)) return;
                var text = ReadText(renderer, "contentText") ?? ReadText(renderer, "content") ?? ReadText(renderer, "contentTextViewModel") ?? "";
                var image = FindImage(renderer);
                var runs = ReadPostRuns(renderer);
                var published = ReadText(renderer, "publishedTimeText");
                posts.Add(new CommunityPost(id, text, image, "https://www.youtube.com/post/" + id, runs, published));
                // Do not descend into the post itself (it may quote another post).
                return;
            }
            foreach (var property in root.EnumerateObject())
            {
                CollectPosts(property.Value, posts, max);
                if (posts.Count >= max) return;
            }
        }
        else if (root.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in root.EnumerateArray())
            {
                CollectPosts(child, posts, max);
                if (posts.Count >= max) return;
            }
        }
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

    // YouTube can abbreviate displayed URLs while keeping the actual destination
    // inside each text run's navigationEndpoint. Preserve both for the client.
    // Different YouTube renderers represent linked text differently:
    // classic 'runs' attach navigationEndpoint to each text segment;
    // newer view models attach commandRuns with offsets into the full string.
    private static List<CommunityTextRun>? ReadPostRuns(JsonElement renderer)
    {
        foreach (var key in new[] { "contentText", "content", "contentTextViewModel" })
        {
            if (!renderer.TryGetProperty(key, out var content)) continue;
            var runs = FindTextRuns(content);
            if (runs is not null) return runs;
        }
        return null;
    }

    private static List<CommunityTextRun>? FindTextRuns(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("runs", out var array) && array.ValueKind == JsonValueKind.Array)
            {
                var result = new List<CommunityTextRun>();
                foreach (var run in array.EnumerateArray())
                {
                    if (run.ValueKind != JsonValueKind.Object ||
                        !run.TryGetProperty("text", out var text) || text.ValueKind != JsonValueKind.String) continue;
                    result.Add(new CommunityTextRun(text.GetString() ?? "", FindRunLink(run)));
                }
                if (result.Count > 0) return result;
            }
            // New text view model: the plain content and clickable spans are separate.
            if (node.TryGetProperty("content", out var rawText) && rawText.ValueKind == JsonValueKind.String
                && node.TryGetProperty("commandRuns", out var commandRuns)
                && commandRuns.ValueKind == JsonValueKind.Array)
            {
                var full = rawText.GetString() ?? "";
                var links = new List<(int Start, int End, string Url)>();
                foreach (var command in commandRuns.EnumerateArray())
                {
                    if (command.ValueKind != JsonValueKind.Object) continue;
                    if (!command.TryGetProperty("startIndex", out var start) || !start.TryGetInt32(out var index) ||
                        !command.TryGetProperty("length", out var length) || !length.TryGetInt32(out var len)) continue;
                    var url = FindRunLink(command);
                    if (url is null || index < 0 || len <= 0 || index > full.Length - len) continue;
                    links.Add((index, index + len, url));
                }
                links.Sort((a, b) => a.Start.CompareTo(b.Start));
                var parts = new List<CommunityTextRun>();
                var offset = 0;
                foreach (var link in links)
                {
                    if (link.Start < offset) continue;
                    if (link.Start > offset) parts.Add(new CommunityTextRun(full[offset..link.Start], null));
                    parts.Add(new CommunityTextRun(full[link.Start..link.End], link.Url));
                    offset = link.End;
                }
                if (offset < full.Length) parts.Add(new CommunityTextRun(full[offset..], null));
                if (parts.Count > 0) return parts;
            }
            foreach (var prop in node.EnumerateObject())
            {
                var nested = FindTextRuns(prop.Value);
                if (nested is not null) return nested;
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (var entry in node.EnumerateArray())
            {
                var nested = FindTextRuns(entry);
                if (nested is not null) return nested;
            }
        }
        return null;
    }

    private static string? FindRunLink(JsonElement run)
    {
        // Direct endpoints take priority over generic metadata, which sometimes
        // points at a YouTube redirect instead of the original destination.
        var endpoint = run;
        if (run.TryGetProperty("navigationEndpoint", out var navigation)) endpoint = navigation;
        else if (run.TryGetProperty("onTap", out var onTap)) endpoint = onTap;
        else if (run.TryGetProperty("command", out var command)) endpoint = command;
        if (endpoint.ValueKind != JsonValueKind.Object) return null;
        string? raw = null;
        if (endpoint.TryGetProperty("urlEndpoint", out var urlEndpoint))
            raw = FindString(urlEndpoint, "url");
        if (string.IsNullOrWhiteSpace(raw) && endpoint.TryGetProperty("commandMetadata", out var metadata))
            raw = FindString(metadata, "url");
        if (string.IsNullOrWhiteSpace(raw)) raw = FindString(endpoint, "url");
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (raw.StartsWith("/", StringComparison.Ordinal)) raw = "https://www.youtube.com" + raw;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var parsed) ||
            (parsed.Scheme != "https" && parsed.Scheme != "http")) return null;

        // Redirect URLs use 'q' or 'url' to store the real destination.
        if ((parsed.Host.Equals("youtube.com", StringComparison.OrdinalIgnoreCase) ||
             parsed.Host.EndsWith(".youtube.com", StringComparison.OrdinalIgnoreCase)) &&
            parsed.AbsolutePath.Equals("/redirect", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var part in parsed.Query.TrimStart('?').Split('&'))
            {
                var pieces = part.Split('=', 2);
                if (pieces.Length != 2 || (pieces[0] != "q" && pieces[0] != "url")) continue;
                var decoded = Uri.UnescapeDataString(pieces[1].Replace("+", "%20"));
                if (Uri.TryCreate(decoded, UriKind.Absolute, out var target) &&
                    (target.Scheme == "https" || target.Scheme == "http")) return target.AbsoluteUri;
            }
        }
        return parsed.AbsoluteUri;
    }

    private static string? FindImage(JsonElement node)
    {
        // Only scan attachments, not channel avatars.
        if (node.ValueKind != JsonValueKind.Object) return null;
        foreach (var key in new[] { "backstageAttachment", "image", "images" })
        {
            if (node.TryGetProperty(key, out var attachment))
            {
                var url = FindLargestThumbnail(attachment) ?? FindString(attachment, "url");
                if (url is not null && Uri.TryCreate(url, UriKind.Absolute, out var parsed) && parsed.Scheme == "https") return url;
            }
        }
        return null;
    }

    // YouTube lists each picture in several sizes; the first one is tiny.
    // Take the widest of the first picture (capped, so tiles stay light).
    private static string? FindLargestThumbnail(JsonElement node)
    {
        if (node.ValueKind == JsonValueKind.Object)
        {
            if (node.TryGetProperty("thumbnails", out var list) && list.ValueKind == JsonValueKind.Array)
            {
                string? best = null;
                var bestWidth = -1;
                foreach (var item in list.EnumerateArray())
                {
                    if (item.ValueKind != JsonValueKind.Object ||
                        !item.TryGetProperty("url", out var u) || u.ValueKind != JsonValueKind.String) continue;
                    var width = item.TryGetProperty("width", out var w) && w.TryGetInt32(out var parsedWidth) ? parsedWidth : 0;
                    if (width > 1280) continue;
                    if (width > bestWidth) { bestWidth = width; best = u.GetString(); }
                }
                if (best is not null) return best.StartsWith("//", StringComparison.Ordinal) ? "https:" + best : best;
            }
            foreach (var property in node.EnumerateObject())
            {
                var found = FindLargestThumbnail(property.Value);
                if (found is not null) return found;
            }
        }
        else if (node.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in node.EnumerateArray())
            {
                var found = FindLargestThumbnail(item);
                if (found is not null) return found;
            }
        }
        return null;
    }
}

public record CommunityTextRun(string Text, string? Url);
public record CommunityPost(string Id, string Text, string? ImageUrl, string Url, List<CommunityTextRun>? Runs = null, string? Published = null);
