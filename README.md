# Don Miguel App

Open-source Progressive Web App for the independent music project **Don Miguel de Cabarete**.

## Features
- Installable PWA
- YouTube-powered music/player experience
- Genre playlists
- Optional OneSignal web push notifications
- Automatic new-release checks via GitHub Actions + Render
- Responsive mobile/desktop UI
- App-specific Legal Notice and Privacy Policy

## Stack
ASP.NET Core · HTML/CSS/JavaScript · YouTube · OneSignal · Render · GitHub Actions

## Configuration
Real secrets are not stored in the repository. Configure them in Render Environment Variables and GitHub Actions Secrets. See `.env.example`.

Never commit `OneSignal__ApiKey`, `PushCheck__Secret`, YouTube API credentials, passwords or private tokens.

## License
The **software source code** is released under the MIT License. See `LICENSE`.

The license does **not** cover Don Miguel / Don Miguel de Cabarete branding, music, recordings, artwork, photographs, videos, logos or other media. See `BRAND-ASSETS.md`.

## Security

Do not commit API keys, passwords, or other secrets to this repository.

Sensitive values used by the app are configured through protected environment variables and GitHub Actions secrets.

## Live app
https://donmiguelapp.onrender.com
