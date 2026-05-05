from __future__ import annotations

import json
import os
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

from flask import Flask, jsonify, render_template, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)

RATE_LIMIT_WINDOW_SECONDS = 60
DOWNLOAD_TIME_TOLERANCE_SECONDS = 1
SEARCH_TERM_MAX_LENGTH = 120
MAX_ERROR_OUTPUT_LENGTH = 2000
SPOTDL_OUTPUT_TEMPLATE = "{artist} - {title}.{output-ext}"
YTDLP_OUTPUT_TEMPLATE = "%(title)s.%(ext)s"
USER_AGENT = "JackTracker/1.0"
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".opus", ".ogg", ".wav", ".flac"}
RATE_LIMIT_PATTERN = re.compile(r"(429|too many requests|rate.?limit|24\s*h|24.?hour|daily limit)", re.I)
PROGRESS_PATTERN = re.compile(r"(\d{1,3}(?:\.\d+)?)%")
SAFE_SEARCH_PATTERN = re.compile(r"[^\w\s.'’(),-]", re.UNICODE)
SPOTIFY_HOSTS = {"open.spotify.com", "play.spotify.com"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"}
DEEZER_HOSTS = {"deezer.com", "www.deezer.com"}
AUDIOMACK_HOSTS = {"audiomack.com", "www.audiomack.com"}
ALLOWED_COMMANDS = {"spotdl", "yt-dlp"}

app = Flask(__name__)
jobs: dict[str, dict[str, Any]] = {}
request_counts: dict[str, dict[str, float]] = {}
lock = threading.Lock()


def read_int_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        raise RuntimeError(f"{name} must be an integer") from None


RATE_LIMIT_MAX_REQUESTS = read_int_env("RATE_LIMIT_MAX_REQUESTS", 120)


def is_supported_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def platform_for(url: str) -> str:
    host = urlparse(url).hostname or ""
    if host in SPOTIFY_HOSTS:
        return "spotify"
    if host in YOUTUBE_HOSTS:
        return "youtube"
    if host in DEEZER_HOSTS or host.endswith(".deezer.com"):
        return "deezer"
    if host in AUDIOMACK_HOSTS:
        return "audiomack"
    return "generic"


def generic_metadata(url: str, title: str = "Queued music link", artist: str = "Unknown artist", thumbnail: str = "/static/logo.svg") -> list[dict[str, str]]:
    return [{
        "trackName": title,
        "artistName": artist,
        "albumName": "Unknown album",
        "albumArtUrl": thumbnail,
        "url": url,
    }]


def fetch_json(url: str) -> dict[str, Any]:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_oembed_metadata(url: str) -> list[dict[str, str]]:
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
    title, artist = raw_title.split(" • ", 1) if " • " in raw_title else (raw_title, author)
    return generic_metadata(url, title, artist, str(data.get("thumbnail_url") or "/static/logo.svg"))


def get_metadata(url: str) -> list[dict[str, str]]:
    try:
        return fetch_oembed_metadata(url)
    except (OSError, URLError, ValueError, TimeoutError):
        return generic_metadata(url)


def normalize_search_term(value: str) -> str:
    cleaned = SAFE_SEARCH_PATTERN.sub(" ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip()[:SEARCH_TERM_MAX_LENGTH]


def update_job(job_id: str, **changes: Any) -> None:
    with lock:
        jobs.setdefault(job_id, {}).update(changes)


def list_download_files() -> dict[str, float]:
    return {path.name: path.stat().st_mtime for path in DOWNLOADS_DIR.iterdir() if path.is_file()}


def is_new_or_modified_audio(path: Path, before: dict[str, float], started_at: float) -> bool:
    if path.suffix.lower() not in AUDIO_EXTENSIONS:
        return False

    previous_mtime = before.get(path.name)
    current_mtime = path.stat().st_mtime
    is_new_file = previous_mtime is None
    was_modified = previous_mtime is not None and current_mtime != previous_mtime
    modified_during_download = current_mtime >= started_at - DOWNLOAD_TIME_TOLERANCE_SECONDS
    return is_new_file or was_modified or modified_during_download


def find_new_download(before: dict[str, float], started_at: float) -> str | None:
    candidates = [path for path in DOWNLOADS_DIR.iterdir() if path.is_file() and is_new_or_modified_audio(path, before, started_at)]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime).name


def build_ytdlp_args(target: str) -> list[str]:
    return [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--no-playlist",
        "-o", str(DOWNLOADS_DIR / YTDLP_OUTPUT_TEMPLATE),
        target,
    ]


def build_spotify_fallback_target(artist_name: str, track_name: str) -> str:
    query = " ".join(filter(None, [normalize_search_term(artist_name), normalize_search_term(track_name)]))
    return f"ytsearch1:{query} audio" if query else ""


def run_download_command(job_id: str, command: str, args: list[str]) -> tuple[int, str]:
    if command not in ALLOWED_COMMANDS:
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
    url = payload["url"]
    track_name = payload.get("trackName", "")
    artist_name = payload.get("artistName", "")
    platform = platform_for(url)
    before = list_download_files()
    started_at = time.time()

    update_job(job_id, status="downloading", progress=0, message="Starting download...")

    if platform == "spotify":
        command = "spotdl"
        args = ["download", url, "--output", str(DOWNLOADS_DIR / SPOTDL_OUTPUT_TEMPLATE), "--format", "mp3", "--simple-tui"]
    else:
        command = "yt-dlp"
        args = build_ytdlp_args(url)

    try:
        code, output = run_download_command(job_id, command, args)
    except FileNotFoundError:
        update_job(job_id, status="error", errorMessage=f"Tool missing: {command}")
        return

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
        update_job(job_id, status="error", errorMessage="Download failed", output=output[-MAX_ERROR_OUTPUT_LENGTH:])


@app.before_request
def rate_limit() -> Any:
    key = request.remote_addr or "unknown"
    now = time.time()
    with lock:
        entry = request_counts.get(key, {"count": 0, "reset_at": now + RATE_LIMIT_WINDOW_SECONDS})
        if entry["reset_at"] <= now:
            entry = {"count": 0, "reset_at": now + RATE_LIMIT_WINDOW_SECONDS}
        entry["count"] += 1
        request_counts[key] = entry
        is_limited = entry["count"] > RATE_LIMIT_MAX_REQUESTS
    if is_limited:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429
    return None


@app.get("/")
def index() -> str:
    return render_template("index.html")


@app.post("/api/metadata")
def metadata() -> Any:
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()
    if not is_supported_url(url):
        return jsonify({"error": "A valid http(s) URL is required"}), 400
    return jsonify(get_metadata(url))


@app.post("/api/download")
def start_download() -> Any:
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()
    if not is_supported_url(url):
        return jsonify({"error": "A valid http(s) URL is required"}), 400

    job_id = str(data.get("id") or uuid.uuid4())
    update_job(job_id, id=job_id, status="queued", progress=0, url=url)
    thread = threading.Thread(target=download_worker, args=(job_id, data), daemon=True)
    thread.start()
    return jsonify({"id": job_id, "status": "queued"}), 202


@app.get("/api/download/<job_id>")
def download_status(job_id: str) -> Any:
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Download not found"}), 404
    return jsonify(job)


@app.get("/downloads/<path:filename>")
def download_file(filename: str) -> Any:
    safe_name = Path(filename).name
    path = DOWNLOADS_DIR / safe_name
    if safe_name != filename or not path.exists() or path.suffix.lower() not in AUDIO_EXTENSIONS:
        return jsonify({"error": "Download not found"}), 404
    return send_from_directory(DOWNLOADS_DIR, safe_name, as_attachment=True)


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=read_int_env("PORT", 3001), debug=os.environ.get("FLASK_DEBUG") == "1")
