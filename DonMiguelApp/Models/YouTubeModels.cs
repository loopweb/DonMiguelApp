namespace DonMiguelApp.Models;

public sealed record VideoItem(
    string Id,
    string Title,
    string Description,
    string Thumbnail,
    DateTimeOffset PublishedAt,
    string Duration,
    string ChannelTitle,
    long ViewCount);

public sealed record PlaylistItem(
    string Id,
    string Title,
    string Description,
    string Thumbnail,
    int ItemCount);

public sealed record ChannelInfo(
    string Id,
    string Title,
    string Description,
    string Thumbnail,
    string UploadsPlaylistId);

public sealed record CommentItem(
    string Id,
    string Author,
    string AuthorImage,
    string Text,
    DateTimeOffset PublishedAt,
    long LikeCount);
