# JackTracker

JackTracker is now a Python-first music downloader with a Flask backend and a server-rendered frontend. It queues music links, downloads high-quality audio with `spotDL` and `yt-dlp`, and exposes completed files directly in the browser.

## Features

- **Python frontend + backend**: Flask serves the UI, metadata API, queue API, and completed downloads from one process.
- **Spotify support with rate-limit fallback**: Spotify links use `spotDL` first. If `spotDL` reports a 24-hour/rate-limit error, JackTracker falls back to a sanitized `yt-dlp` search using the track and artist.
- **YouTube, Deezer, Audiomack, and more**: YouTube, Deezer, Audiomack, and other music URLs are routed through `yt-dlp` where the platform is supported by that tool.
- **Direct browser downloads**: Finished files are served from `/downloads` as MP3/audio downloads.
- **Live queue polling**: The browser polls the Python backend for progress and completion updates.
- **Safer process execution**: Downloader commands run without a shell and with validated URL/platform handling.

## Prerequisites

1. **Python 3.11+**
2. **FFmpeg** available on your system `PATH`
3. **spotDL and yt-dlp** available on your system `PATH`

Install the command-line downloaders with:

```bash
pip install spotdl yt-dlp
```

## Installation

Install the Python application dependency:

```bash
pip install -r requirements.txt
```

The legacy React/Vite project is still present for compatibility with existing checks. If you work on those files, install Node dependencies with:

```bash
npm ci
```

## Running the Python application

```bash
python app.py
```

Then open:

```text
http://localhost:3001
```

Optional environment variables:

- `PORT`: Flask port, default `3001`
- `HOST`: Flask host, default `127.0.0.1`
- `RATE_LIMIT_MAX_REQUESTS`: Requests per minute per client, default `120`
- `FLASK_DEBUG=1`: Enable Flask debug mode for local development

## How to use

1. Paste a Spotify, YouTube, Deezer, Audiomack, or other music streaming URL.
2. Click **Find & Download**.
3. JackTracker fetches lightweight metadata and starts the download.
4. Watch queue progress in the browser.
5. When complete, click the **MP3** link to download the file.

## Validation

Existing repository checks can be run with:

```bash
npm test
python -m py_compile app.py
```

`npm test` delegates to the existing Vite/TypeScript build so the legacy frontend still type-checks and bundles successfully.

## Troubleshooting

- **`spotdl: command not found` or `yt-dlp: command not found`**: Install the tools with `pip install spotdl yt-dlp` and ensure your Python scripts directory is on `PATH`.
- **FFmpeg errors**: Install FFmpeg and ensure its `bin` directory is on `PATH`.
- **Spotify 24-hour/rate-limit failures**: JackTracker automatically tries a `yt-dlp` search fallback. If the fallback also fails, retry later or provide a direct YouTube/Audiomack/Deezer URL.
- **Deezer/Audiomack failures**: Support depends on the currently installed `yt-dlp` extractor. Upgrade with `pip install --upgrade yt-dlp`.
