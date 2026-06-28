from __future__ import annotations

import json
import re
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

from jacktracker.config import config

# Compile regex patterns
RATE_LIMIT_PATTERN = re.compile(config.rate_limit_pattern_str, re.I)
PROGRESS_PATTERN = re.compile(config.progress_pattern_str)
SAFE_SEARCH_PATTERN = re.compile(config.safe_search_pattern_str, re.UNICODE)

# In-memory job storage (use Redis in production for multi-worker)
jobs: dict[str, dict[str, Any]] = {}
request_counts: dict[str, dict[str, float]] = {}
lock = threading.Lock()


def is_supported_url(value: str) -> bool:
    """Validate that the value is a supported HTTP/HTTPS URL."""
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def platform_for(url: str) -> str:
    """Determine the platform from the URL hostname."""
    host = urlparse(url).hostname or ""
    if host in config.spotify_hosts:
        return "spotify"
    if host in config.youtube_hosts:
        return "youtube"
    if host in config.deezer_hosts or host.endswith(".deezer.com"):
        return "deezer"
    if host in config.audiomack_hosts:
        return "audiomack"
    return "generic"


def generic_metadata(
    url: str,
    title: str = "Queued music link",
    artist: str = "Unknown artist",
    thumbnail: str = "/static/logo.svg",
) -> list[dict[str, str]]:
    """Generate generic metadata for unsupported platforms."""
    return [{
        "trackName": title,
        "artistName": artist,
        "albumName": "Unknown album",
        "albumArtUrl": thumbnail,
        "url": url,
    }]


def fetch_json(url: str) -> dict[str, Any]:
    """Fetch JSON from a URL with timeout."""
    req = Request(url, headers={"User-Agent": config.user_agent})
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_oembed_metadata(url: str) -> list[dict[str, str]]:
    """Fetch metadata using oEmbed endpoints."""
    platform = platform_for(url)
    endpoint = ""

    if platform == "spotify":
        endpoint = "https://open.spotify.com/oembed?" + urlencode({"url": url})
    elif platform == "youtube":
        endpoint = "https://www.youtube.com/oembed?" + urlencode({"url": url, "format": "json"})
    elif platform == "audiomack":
        endpoint = "https://audiomack.com/oembed?" + urlencode({"url": url})

    if not endpoint:
        return generic_metadata(url)

    data = fetch_json(endpoint)
    raw_title = str(data.get("title") or "Queued music link")
    author = str(data.get("author_name") or "Unknown artist")
    title, artist = raw_title.split(" \u2022 ", 1) if " \u2022 " in raw_title else (raw_title, author)
    return generic_metadata(url, title, artist, str(data.get("thumbnail_url") or "/static/logo.svg"))


def get_metadata(url: str) -> list[dict[str, str]]:
    """Get track metadata with fallback to generic."""
    try:
        return fetch_oembed_metadata(url)
    except (OSError, URLError, ValueError, TimeoutError):
        return generic_metadata(url)


def normalize_search_term(value: str) -> str:
    """Sanitize search term for safe use in yt-dlp queries."""
    cleaned = SAFE_SEARCH_PATTERN.sub(" ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip()[:config.search_term_max_length]


def update_job(job_id: str, **changes: Any) -> None:
    """Thread-safe job update."""
    with lock:
        jobs.setdefault(job_id, {}).update(changes)


def list_download_files() -> dict[str, float]:
    """List download directory files with modification times."""
    return {path.name: path.stat().st_mtime for path in config.downloads_dir.iterdir() if path.is_file()}


def is_new_or_modified_audio(path: Path, before: dict[str, float], started_at: float) -> bool:
    """Check if a file is a new or modified audio file from the download."""
    if path.suffix.lower() not in config.audio_extensions:
        return False

    previous_mtime = before.get(path.name)
    current_mtime = path.stat().st_mtime
    is_new_file = previous_mtime is None
    was_modified = previous_mtime is not None and current_mtime != previous_mtime
    modified_during_download = current_mtime >= started_at - config.download_time_tolerance_seconds
    return is_new_file or (was_modified and modified_during_download)


def trim_error_output(output: str) -> str:
    """Trim error output to keep start and end."""
    if len(output) <= config.max_error_output_length:
        return output

    half_limit = config.max_error_output_length // 2
    return f"{output[:half_limit]}\n...\n{output[-half_limit:]}"


def find_new_download(before: dict[str, float], started_at: float) -> str | None:
    """Find the newly downloaded audio file."""
    candidates = [
        path for path in config.downloads_dir.iterdir()
        if path.is_file() and is_new_or_modified_audio(path, before, started_at)
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime).name


def build_ytdlp_args(target: str) -> list[str]:
    """Build yt-dlp command arguments."""
    return [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist",
        "-o", str(config.downloads_dir / config.ytdlp_output_template),
        target,
    ]


def build_spotify_fallback_target(artist_name: str, track_name: str) -> str:
    """Build a yt-dlp search query for Spotify fallback."""
    query = " ".join(filter(None, [normalize_search_term(artist_name), normalize_search_term(track_name)]))
    return f"ytsearch1:{query} audio" if query else ""


def run_download_command(job_id: str, command: str, args: list[str]) -> tuple[int, str]:
    """Run a download command and capture output with progress updates."""
    if command not in config.allowed_commands:
        return -1, f"Unsupported download command: {command}"

    process = subprocess.Popen(
        [command, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=False,
    )
    output: list[str] = []

    if process.stdout is None:
        raise RuntimeError("Downloader output stream was not available")

    for line in process.stdout:
        output.append(line)
        match = PROGRESS_PATTERN.search(line)
        if match:
            progress = min(float(match.group(1)), 100.0)
            update_job(job_id, progress=progress, status="downloading")

    return process.wait(), "".join(output)


def download_worker(job_id: str, payload: dict[str, str]) -> None:
    """Background worker to handle downloads."""
    url = payload["url"]
    track_name = payload.get("trackName", "")
    artist_name = payload.get("artistName", "")
    platform = platform_for(url)
    before = list_download_files()
    started_at = time.time()

    update_job(job_id, status="downloading", progress=0, message="Starting download...")

    if platform == "spotify":
        command = "spotdl"
        args = [
            "download", url,
            "--output", str(config.downloads_dir / config.spotdl_output_template),
            "--format", "mp3",
            "--simple-tui"
        ]
    else:
        command = "yt-dlp"
        args = build_ytdlp_args(url)

    try:
        code, output = run_download_command(job_id, command, args)
    except FileNotFoundError:
        update_job(job_id, status="error", errorMessage=f"Tool missing: {command}")
        return

    # Spotify rate limit fallback
    if platform == "spotify" and code != 0 and RATE_LIMIT_PATTERN.search(output):
        fallback_target = build_spotify_fallback_target(artist_name, track_name)
        if fallback_target:
            update_job(job_id, message="spotDL rate-limited; trying yt-dlp search fallback...")
            try:
                code, output = run_download_command(job_id, "yt-dlp", build_ytdlp_args(fallback_target))
            except FileNotFoundError:
                update_job(job_id, status="error", errorMessage="Tool missing: yt-dlp")
                return

    if code == 0:
        filename = find_new_download(before, started_at)
        download_url = f"/downloads/{quote(filename)}" if filename else None
        update_job(job_id, status="complete", progress=100, downloadUrl=download_url, message="Ready")
    else:
        update_job(job_id, status="error", errorMessage="Download failed", output=trim_error_output(output))
