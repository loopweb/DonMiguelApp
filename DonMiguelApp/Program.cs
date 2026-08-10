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

        if (file.Equals("sw.js", StringComparison.OrdinalIgnoreCase))
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
    return Results.Ok(new { version = "1.2.4" });
});

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapFallbackToFile("index.html");
app.Run();
