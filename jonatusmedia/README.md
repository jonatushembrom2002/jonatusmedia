# JonatusMedia

A responsive dark-theme media download website with a small Node.js backend. Requires Node.js 20+ and one dependency (`undici`).

## Run locally

```bash
cd  jonatusmedia
npm install
npm start
```

Open http://localhost:3000 in your browser. To use a different port: `PORT=8080 npm start` (macOS/Linux) or `$env:PORT=8080; npm start` (PowerShell).

## Supported behavior

- Instagram, Facebook, and YouTube page URLs: identifies platform and displays official authorized download/export guidance. Does **not** scrape or bypass platform download restrictions.
- Direct public HTTPS video/audio file URLs: server streams original bytes as an attachment, with a 500 MB limit. Requires the user to confirm authorization.
- Responsive, accessible interface and clipboard paste support.

## Security / production notes

- The downloader rejects private IP addresses, restricted protocols, custom ports, platform page URLs, and redirects, and pins DNS to a validated address.
- For a public deployment, add per-IP rate limiting, authentication or quotas, abuse monitoring, egress controls, and a reverse-proxy timeout. Streaming large files consumes bandwidth. Do not deploy an unrestricted public proxy without these protections.
- The browser buffers a downloaded file before saving it. For large files, consider a server-side streaming flow with a short-lived signed token.
- Some direct hosts block server-side fetches; no bypass is attempted.
- Do not use this tool to download content without permission.

## Project files

- `server.js` — HTTP server and authorized direct-file download endpoint
- `public/index.html` — page structure
- `public/styles.css` — dark theme and responsive styles
- `public/app.js` — UI and platform guidance
- `public/logo.svg` — brand icon
