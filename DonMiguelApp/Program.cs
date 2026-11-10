using DonMiguelApp.Services;

var builder = WebApplication.CreateBuilder(args);

// Do not log full outbound YouTube request URLs (they contain the API key).
builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.Warning);

// Render exposes the public service through its PORT environment variable.
var renderPort = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrWhiteSpace(renderPort))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{renderPort}");
}
builder.Services.AddHttpClient<YouTubeService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("DonMiguelApp/3.0");
});

builder.Services.AddHttpClient<PushNotificationService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("DonMiguelApp/1.5");
});

builder.Services.AddHttpClient("CommunityPosts", client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
    client.DefaultRequestHeaders.AcceptLanguage.ParseAdd("en-US,en;q=0.9");
    // Without this, YouTube answers requests from European servers with its
    // cookie-consent page instead of the channel page.
    client.DefaultRequestHeaders.Add("Cookie", "SOCS=CAI; CONSENT=YES+cb");
})
// Send exactly the cookie header above (no automatic cookie handling).
.ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { UseCookies = false });

builder.Services.AddSingleton<CommunityPostsService>(sp => new CommunityPostsService(
    sp.GetRequiredService<IHttpClientFactory>().CreateClient("CommunityPosts"),
    sp.GetRequiredService<ILogger<CommunityPostsService>>()));

var app = builder.Build();
if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("RENDER")))
{
    app.UseHttpsRedirection();
}
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        var file = Path.GetFileName(path);

        if (file.Equals("sw.js", StringComparison.OrdinalIgnoreCase)
         || file.Equals("dmc-push-worker.js", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
        }
        else if (file.Equals("index.html", StringComparison.OrdinalIgnoreCase)
              || file.Equals("app.js", StringComparison.OrdinalIgnoreCase)
              || file.Equals("styles.css", StringComparison.OrdinalIgnoreCase)
              || file.Equals("manifest.webmanifest", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache, must-revalidate, max-age=0";
        }
    }
});

app.MapGet("/api/youtube/community/latest", async (CommunityPostsService posts, CancellationToken ct) =>
{
    var post = await posts.GetLatestAsync(ct);
    return post is null ? Results.NoContent() : Results.Ok(post);
});

// The newest community posts (up to six), newest first. Empty list if none.
app.MapGet("/api/youtube/community/posts", async (CommunityPostsService posts, CancellationToken ct) =>
    Results.Ok(await posts.GetRecentAsync(ct)));

// Troubleshooting: what happened when the server last read the YouTube posts page.
// "?refresh=1" reads the page again right away (at most once a minute).
app.MapGet("/api/youtube/community/status", async (HttpContext context, CommunityPostsService posts, CancellationToken ct) =>
{
    if (context.Request.Query.ContainsKey("refresh")) await posts.GetRecentAsync(true, ct);
    context.Response.Headers.CacheControl = "no-store";
    return Results.Ok(posts.GetStatus());
});

app.MapGet("/api/status", (YouTubeService yt, IConfiguration cfg) => Results.Ok(new
{
    configured = yt.IsConfigured,
    handle = cfg["YouTube:Handle"] ?? "@migflow"
}));

app.MapGet("/api/youtube/channel", async (YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetChannelAsync(ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});


app.MapGet("/api/youtube/latest", async (YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetLatestVideoAsync(ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});

app.MapGet("/api/youtube/videos", async (YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetVideosAsync(ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});

app.MapGet("/api/youtube/playlists", async (YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetPlaylistsAsync(ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});

app.MapGet("/api/youtube/playlists/{playlistId}/videos", async (string playlistId, YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetPlaylistVideosAsync(playlistId, ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});

app.MapGet("/api/youtube/comments/{videoId}", async (string videoId, YouTubeService yt, CancellationToken ct) =>
{
    try { return Results.Ok(await yt.GetCommentsAsync(videoId, ct)); }
    catch (Exception ex) { return Results.Problem(ex.Message, statusCode: 503); }
});

app.MapGet("/api/app-version", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
    return Results.Ok(new { version = "2.1.6" });
});


app.MapPost("/api/push/check-release", async (
    HttpContext context,
    YouTubeService yt,
    PushNotificationService push,
    IConfiguration cfg,
    CancellationToken ct) =>
{
    var configuredSecret = cfg["PushCheck:Secret"] ?? string.Empty;
    var suppliedSecret = context.Request.Headers["X-DMC-Push-Secret"].ToString();

    if (string.IsNullOrWhiteSpace(configuredSecret) ||
        string.IsNullOrWhiteSpace(suppliedSecret) ||
        !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.UTF8.GetBytes(configuredSecret),
            System.Text.Encoding.UTF8.GetBytes(suppliedSecret)))
    {
        return Results.Unauthorized();
    }

    if (!push.IsConfigured)
        return Results.Problem("OneSignal server API is not configured.", statusCode: 503);

    var latest = await yt.GetLatestVideoAsync(ct);
    if (latest is null)
        return Results.Ok(new { action = "none", reason = "No public release found." });

    var maxAgeHours = Math.Clamp(cfg.GetValue("PushCheck:MaxReleaseAgeHours", 12), 1, 72);
    var age = DateTimeOffset.UtcNow - latest.PublishedAt;

    if (latest.PublishedAt != DateTimeOffset.MinValue &&
        age > TimeSpan.FromHours(maxAgeHours))
    {
        return Results.Ok(new
        {
            action = "none",
            reason = "Latest release is outside notification window.",
            videoId = latest.Id,
            publishedAt = latest.PublishedAt
        });
    }

    if (await push.WasReleaseAlreadySentAsync(latest.Id, ct))
    {
        return Results.Ok(new
        {
            action = "none",
            reason = "Release push already sent.",
            videoId = latest.Id
        });
    }

    var sendResult = await push.SendReleaseAsync(latest, ct);

    if (!sendResult.Success)
    {
        return Results.Ok(new
        {
            action = "not-sent",
            reason = "OneSignal did not confirm a deliverable push.",
            videoId = latest.Id,
            title = latest.Title,
            messageId = sendResult.MessageId,
            recipients = sendResult.Recipients,
            errors = sendResult.Errors,
            oneSignalResponse = sendResult.RawResponse
        });
    }

    return Results.Ok(new
    {
        action = "sent",
        videoId = latest.Id,
        title = latest.Title,
        messageId = sendResult.MessageId,
        recipients = sendResult.Recipients
    });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));




app.MapGet("/push/dmc/dmc-push-worker.js", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
    const string js = """
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
""";
    return Results.Text(js, "application/javascript; charset=utf-8");
});

app.MapFallbackToFile("index.html");
app.Run();
