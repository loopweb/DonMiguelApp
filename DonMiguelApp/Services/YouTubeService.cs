using System.Globalization;
using System.Text.Json;
using System.Xml;
using DonMiguelApp.Models;

namespace DonMiguelApp.Services;

public sealed class YouTubeService(HttpClient http, IConfiguration config, ILogger<YouTubeService> logger)
{
    private readonly string _apiKey = config["YouTube:ApiKey"] ?? string.Empty;
    private readonly string _handle = config["YouTube:Handle"] ?? "@migflow";
    private readonly int _maxResults = Math.Clamp(config.GetValue("YouTube:MaxResults", 200), 1, 500);

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<ChannelInfo?> GetChannelAsync(CancellationToken ct)
    {
        EnsureConfigured();
        var url = $"https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle={Uri.EscapeDataString(_handle)}&key={Uri.EscapeDataString(_apiKey)}";
        using var doc = await GetJsonAsync(url, ct);
        var item = doc.RootElement.GetProperty("items").EnumerateArray().FirstOrDefault();
        if (item.ValueKind == JsonValueKind.Undefined) return null;

        var snippet = item.GetProperty("snippet");
        var uploads = item.GetProperty("contentDetails").GetProperty("relatedPlaylists").GetProperty("uploads").GetString() ?? "";
        return new ChannelInfo(
            item.GetProperty("id").GetString() ?? "",
            snippet.GetProperty("title").GetString() ?? "Don Miguel de Cabarete",
            snippet.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
            BestThumbnail(snippet.GetProperty("thumbnails")),
            uploads);
    }


    public async Task<VideoItem?> GetLatestVideoAsync(CancellationToken ct)
    {
        EnsureConfigured();
        var channel = await GetChannelAsync(ct);
        if (channel is null || string.IsNullOrWhiteSpace(channel.UploadsPlaylistId)) return null;

        var url = $"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId={Uri.EscapeDataString(channel.UploadsPlaylistId)}&maxResults=1&key={Uri.EscapeDataString(_apiKey)}";
        using var page = await GetJsonAsync(url, ct);
        var item = page.RootElement.GetProperty("items").EnumerateArray().FirstOrDefault();
        if (item.ValueKind == JsonValueKind.Undefined) return null;

        var snippet = item.GetProperty("snippet");
        var id = item.GetProperty("contentDetails").GetProperty("videoId").GetString() ?? "";
        if (string.IsNullOrWhiteSpace(id)) return null;

        var detailsMap = await GetVideoDetailsAsync(new[] { id }, ct);
        var details = detailsMap.GetValueOrDefault(id, new VideoDetails("", 0));
        var published = snippet.TryGetProperty("publishedAt", out var p) &&
                        DateTimeOffset.TryParse(p.GetString(), out var dt)
            ? dt
            : DateTimeOffset.MinValue;

        return new VideoItem(
            id,
            snippet.GetProperty("title").GetString() ?? "",
            snippet.TryGetProperty("description", out var desc) ? desc.GetString() ?? "" : "",
            BestThumbnail(snippet.GetProperty("thumbnails")),
            published,
            details.Duration,
            snippet.TryGetProperty("channelTitle", out var c) ? c.GetString() ?? channel.Title : channel.Title,
            details.ViewCount);
    }

    public async Task<IReadOnlyList<VideoItem>> GetVideosAsync(CancellationToken ct)
    {
        EnsureConfigured();
        var channel = await GetChannelAsync(ct) ?? throw new InvalidOperationException("YouTube-Kanal wurde nicht gefunden.");
        var raw = new List<JsonElement>();
        string? pageToken = null;

        while (raw.Count < _maxResults)
        {
            var pageSize = Math.Min(50, _maxResults - raw.Count);
            var tokenPart = string.IsNullOrWhiteSpace(pageToken) ? "" : $"&pageToken={Uri.EscapeDataString(pageToken)}";
            var url = $"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId={Uri.EscapeDataString(channel.UploadsPlaylistId)}&maxResults={pageSize}{tokenPart}&key={Uri.EscapeDataString(_apiKey)}";
            using var page = await GetJsonAsync(url, ct);
            raw.AddRange(page.RootElement.GetProperty("items").EnumerateArray().Select(x => x.Clone()));
            pageToken = page.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
            if (string.IsNullOrWhiteSpace(pageToken)) break;
        }

        var uniqueRaw = raw
            .Where(x => x.TryGetProperty("contentDetails", out var details) && details.TryGetProperty("videoId", out _))
            .GroupBy(x => x.GetProperty("contentDetails").GetProperty("videoId").GetString() ?? "")
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .Select(g => g.First())
            .ToList();

        var ids = uniqueRaw.Select(x => x.GetProperty("contentDetails").GetProperty("videoId").GetString()!).ToArray();
        var detailsMap = await GetVideoDetailsAsync(ids, ct);

        return uniqueRaw.Select(x =>
        {
            var snippet = x.GetProperty("snippet");
            var id = x.GetProperty("contentDetails").GetProperty("videoId").GetString() ?? "";
            var published = snippet.TryGetProperty("publishedAt", out var p) && DateTimeOffset.TryParse(p.GetString(), out var dt) ? dt : DateTimeOffset.MinValue;
            var details = detailsMap.GetValueOrDefault(id, new VideoDetails("", 0));
            return new VideoItem(
                id,
                snippet.GetProperty("title").GetString() ?? "",
                snippet.TryGetProperty("description", out var desc) ? desc.GetString() ?? "" : "",
                BestThumbnail(snippet.GetProperty("thumbnails")),
                published,
                details.Duration,
                snippet.TryGetProperty("channelTitle", out var c) ? c.GetString() ?? channel.Title : channel.Title,
                details.ViewCount);
        }).OrderByDescending(x => x.PublishedAt).ToArray();
    }


    public async Task<IReadOnlyList<VideoItem>> GetPlaylistVideosAsync(string playlistId, CancellationToken ct)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(playlistId)) return Array.Empty<VideoItem>();

        var raw = new List<JsonElement>();
        string? pageToken = null;
        while (raw.Count < 500)
        {
            var tokenPart = string.IsNullOrWhiteSpace(pageToken) ? "" : $"&pageToken={Uri.EscapeDataString(pageToken)}";
            var url = $"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId={Uri.EscapeDataString(playlistId)}&maxResults=50{tokenPart}&key={Uri.EscapeDataString(_apiKey)}";
            using var page = await GetJsonAsync(url, ct);
            raw.AddRange(page.RootElement.GetProperty("items").EnumerateArray().Select(x => x.Clone()));
            pageToken = page.RootElement.TryGetProperty("nextPageToken", out var next) ? next.GetString() : null;
            if (string.IsNullOrWhiteSpace(pageToken)) break;
        }

        var uniqueRaw = raw
            .Where(x => x.TryGetProperty("contentDetails", out var details) && details.TryGetProperty("videoId", out _))
            .GroupBy(x => x.GetProperty("contentDetails").GetProperty("videoId").GetString() ?? "")
            .Where(g => !string.IsNullOrWhiteSpace(g.Key))
            .Select(g => g.First())
            .ToList();

        var ids = uniqueRaw.Select(x => x.GetProperty("contentDetails").GetProperty("videoId").GetString()!).ToArray();
        var detailsMap = await GetVideoDetailsAsync(ids, ct);

        return uniqueRaw.Select(x =>
        {
            var snippet = x.GetProperty("snippet");
            var id = x.GetProperty("contentDetails").GetProperty("videoId").GetString() ?? "";
            var published = snippet.TryGetProperty("publishedAt", out var p) && DateTimeOffset.TryParse(p.GetString(), out var dt) ? dt : DateTimeOffset.MinValue;
            var details = detailsMap.GetValueOrDefault(id, new VideoDetails("", 0));
            return new VideoItem(
                id,
                snippet.GetProperty("title").GetString() ?? "",
                snippet.TryGetProperty("description", out var desc) ? desc.GetString() ?? "" : "",
                BestThumbnail(snippet.GetProperty("thumbnails")),
                published,
                details.Duration,
                snippet.TryGetProperty("channelTitle", out var c) ? c.GetString() ?? "Don Miguel de Cabarete" : "Don Miguel de Cabarete",
                details.ViewCount);
        }).ToArray();
    }

    public async Task<IReadOnlyList<PlaylistItem>> GetPlaylistsAsync(CancellationToken ct)
    {
        EnsureConfigured();
        var channel = await GetChannelAsync(ct) ?? throw new InvalidOperationException("YouTube-Kanal wurde nicht gefunden.");
        var url = $"https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&channelId={Uri.EscapeDataString(channel.Id)}&maxResults=50&key={Uri.EscapeDataString(_apiKey)}";
        using var doc = await GetJsonAsync(url, ct);
        return doc.RootElement.GetProperty("items").EnumerateArray().Select(x =>
        {
            var snippet = x.GetProperty("snippet");
            return new PlaylistItem(
                x.GetProperty("id").GetString() ?? "",
                snippet.GetProperty("title").GetString() ?? "",
                snippet.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
                BestThumbnail(snippet.GetProperty("thumbnails")),
                x.GetProperty("contentDetails").GetProperty("itemCount").GetInt32());
        }).ToArray();
    }

    public async Task<IReadOnlyList<CommentItem>> GetCommentsAsync(string videoId, CancellationToken ct)
    {
        EnsureConfigured();
        if (string.IsNullOrWhiteSpace(videoId)) return Array.Empty<CommentItem>();
        var url = $"https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId={Uri.EscapeDataString(videoId)}&maxResults=20&order=relevance&textFormat=plainText&key={Uri.EscapeDataString(_apiKey)}";
        try
        {
            using var doc = await GetJsonAsync(url, ct);
            return doc.RootElement.GetProperty("items").EnumerateArray().Select(x =>
            {
                var top = x.GetProperty("snippet").GetProperty("topLevelComment");
                var snippet = top.GetProperty("snippet");
                var published = snippet.TryGetProperty("publishedAt", out var p) && DateTimeOffset.TryParse(p.GetString(), out var dt) ? dt : DateTimeOffset.MinValue;
                return new CommentItem(
                    top.GetProperty("id").GetString() ?? "",
                    snippet.TryGetProperty("authorDisplayName", out var a) ? a.GetString() ?? "YouTube" : "YouTube",
                    snippet.TryGetProperty("authorProfileImageUrl", out var image) ? image.GetString() ?? "" : "",
                    snippet.TryGetProperty("textDisplay", out var text) ? text.GetString() ?? "" : "",
                    published,
                    snippet.TryGetProperty("likeCount", out var likes) ? likes.GetInt64() : 0);
            }).ToArray();
        }
        catch (HttpRequestException ex)
        {
            logger.LogInformation(ex, "Kommentare für Video {VideoId} konnten nicht geladen werden.", videoId);
            return Array.Empty<CommentItem>();
        }
    }

    private async Task<Dictionary<string, VideoDetails>> GetVideoDetailsAsync(string[] ids, CancellationToken ct)
    {
        var result = new Dictionary<string, VideoDetails>();
        foreach (var chunk in ids.Chunk(50))
        {
            var url = $"https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id={Uri.EscapeDataString(string.Join(',', chunk))}&key={Uri.EscapeDataString(_apiKey)}";
            using var doc = await GetJsonAsync(url, ct);
            foreach (var item in doc.RootElement.GetProperty("items").EnumerateArray())
            {
                var id = item.GetProperty("id").GetString() ?? "";
                var iso = item.GetProperty("contentDetails").GetProperty("duration").GetString() ?? "";
                var views = item.TryGetProperty("statistics", out var stats) && stats.TryGetProperty("viewCount", out var viewCount) && long.TryParse(viewCount.GetString(), out var parsed) ? parsed : 0;
                result[id] = new VideoDetails(FormatDuration(iso), views);
            }
        }
        return result;
    }

    private async Task<JsonDocument> GetJsonAsync(string url, CancellationToken ct)
    {
        using var response = await http.GetAsync(url, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            logger.LogWarning("YouTube API Fehler {Status}: {Body}", response.StatusCode, body);
            throw new HttpRequestException($"YouTube API antwortet mit {(int)response.StatusCode}.");
        }
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        return await JsonDocument.ParseAsync(stream, cancellationToken: ct);
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured) throw new InvalidOperationException("YouTube API-Key fehlt. Bitte über User Secrets oder Umgebungsvariable eintragen.");
    }

    private static string BestThumbnail(JsonElement thumbnails)
    {
        foreach (var key in new[] { "maxres", "standard", "high", "medium", "default" })
            if (thumbnails.TryGetProperty(key, out var item) && item.TryGetProperty("url", out var url)) return url.GetString() ?? "";
        return "";
    }

    private static string FormatDuration(string iso)
    {
        try
        {
            var span = XmlConvert.ToTimeSpan(iso);
            return span.TotalHours >= 1 ? span.ToString(@"h\:mm\:ss", CultureInfo.InvariantCulture) : span.ToString(@"m\:ss", CultureInfo.InvariantCulture);
        }
        catch { return ""; }
    }

    private sealed record VideoDetails(string Duration, long ViewCount);
}
