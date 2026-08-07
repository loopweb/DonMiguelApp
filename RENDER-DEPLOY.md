# Don Miguel App – Render deployment

## GitHub
Upload the complete contents of this folder to the root of the GitHub repository.
Do NOT commit the YouTube API key.

## Render
1. New > Web Service.
2. Connect the GitHub repository.
3. Runtime: Docker.
4. Dockerfile Path: `./DonMiguelApp/Dockerfile`.
5. Docker Context: `./DonMiguelApp`.
6. Plan: Free.
7. Add environment variable:
   - Key: `YouTube__ApiKey`
   - Value: your YouTube Data API key
8. Create Web Service.

The app reads the Render `PORT` variable automatically.
