using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DonMiguelApp.Models;

namespace DonMiguelApp.Services;

public sealed class PushNotificationService(HttpClient http, IConfiguration config, ILogger<PushNotificationService> logger)
{
    private const string OneSignalBase = "https://api.onesignal.com";
    private readonly string _appId = config["OneSignal:AppId"] ?? "2cf0f3d8-b077-4ea6-b56b-e15831c8c24d";
    private readonly string _apiKey = config["OneSignal:ApiKey"] ?? string.Empty;
    private readonly string _appUrl = config["OneSignal:AppUrl"] ?? "https://donmiguelapp.onrender.com";

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_appId) &&
        !string.IsNullOrWhiteSpace(_apiKey);

    public async Task<bool> WasReleaseAlreadySentAsync(string videoId, CancellationToken ct)
    {
        EnsureConfigured();

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{OneSignalBase}/notifications?app_id={Uri.EscapeDataString(_appId)}&limit=50&kind=1");
        AddAuthorization(request);

        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);

        if (!doc.RootElement.TryGetProperty("notifications", out var notifications) ||
            notifications.ValueKind != JsonValueKind.Array)
            return false;

        var expectedName = ReleaseMessageName(videoId);

        foreach (var item in notifications.EnumerateArray())
        {
            if (item.TryGetProperty("name", out var nameElement) &&
                string.Equals(nameElement.GetString(), expectedName, StringComparison.Ordinal))
                return true;
        }

        return false;
    }

    public async Task<PushSendResult> SendReleaseAsync(VideoItem video, CancellationToken ct)
    {
        EnsureConfigured();

        var title = CleanTitle(video.Title);
        var payload = new
        {
            app_id = _appId,
            target_channel = "push",
            included_segments = new[] { "Subscribed Users" },
            name = ReleaseMessageName(video.Id),
            headings = new
            {
                en = "Don Miguel – New Release",
                de = "Don Miguel – New Release",
                es = "Don Miguel – New Release"
            },
            contents = new
            {
                en = $"{title} is now available.",
                de = $"{title} ist jetzt verfügbar.",
                es = $"{title} ya está disponible."
            },
            web_url = _appUrl,
            data = new
            {
                videoId = video.Id,
                releaseTitle = title
            }
        };

        var json = JsonSerializer.Serialize(payload);
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{OneSignalBase}/notifications")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        AddAuthorization(request);

        using var response = await http.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("OneSignal release push failed: HTTP {StatusCode} {Body}",
                (int)response.StatusCode, body);
            throw new InvalidOperationException($"OneSignal push failed with HTTP {(int)response.StatusCode}.");
        }

        string? id = null;
        int recipients = 0;
        string[] errors = Array.Empty<string>();

        try
        {
            using var doc = JsonDocument.Parse(body);

            if (doc.RootElement.TryGetProperty("id", out var idElement))
                id = idElement.GetString();

            if (doc.RootElement.TryGetProperty("recipients", out var recipientsElement) &&
                recipientsElement.TryGetInt32(out var parsedRecipients))
                recipients = parsedRecipients;

            if (doc.RootElement.TryGetProperty("errors", out var errorsElement) &&
                errorsElement.ValueKind == JsonValueKind.Array)
            {
                errors = errorsElement.EnumerateArray()
                    .Select(x => x.ToString())
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .ToArray();
            }
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Could not parse OneSignal response body: {Body}", body);
        }

        logger.LogInformation(
            "OneSignal push response: MessageId={MessageId}, Recipients={Recipients}, Errors={Errors}, RawBody={RawBody}",
            id ?? "<none>",
            recipients,
            errors.Length == 0 ? "<none>" : string.Join(" | ", errors),
            body);

        return new PushSendResult(
            Success: !string.IsNullOrWhiteSpace(id) && recipients > 0 && errors.Length == 0,
            MessageId: id,
            Recipients: recipients,
            Errors: errors,
            RawResponse: body
        );
    }

    private void AddAuthorization(HttpRequestMessage request)
    {
        request.Headers.Authorization = new AuthenticationHeaderValue("Key", _apiKey);
    }

    private void EnsureConfigured()
    {
        if (!IsConfigured)
            throw new InvalidOperationException("OneSignal server API is not configured.");
    }

    private static string ReleaseMessageName(string videoId) => $"dmc-release-{videoId}";

    private static string CleanTitle(string title)
    {
        if (string.IsNullOrWhiteSpace(title)) return "New release";

        var clean = title.Trim();
        var suffixes = new[]
        {
            " - Don Miguel de Cabarete",
            " – Don Miguel de Cabarete",
            " — Don Miguel de Cabarete"
        };

        foreach (var suffix in suffixes)
        {
            var pos = clean.IndexOf(suffix, StringComparison.OrdinalIgnoreCase);
            if (pos >= 0)
            {
                clean = clean[..pos].Trim();
                break;
            }
        }

        return clean;
    }
}

public sealed record PushSendResult(
    bool Success,
    string? MessageId,
    int Recipients,
    string[] Errors,
    string RawResponse
);

