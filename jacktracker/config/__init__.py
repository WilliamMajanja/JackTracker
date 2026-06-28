from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Config:
    """Application configuration loaded from environment variables."""

    # Flask settings
    host: str = "127.0.0.1"
    port: int = 3001
    debug: bool = False
    secret_key: str = "dev-secret-change-in-production"

    # Rate limiting
    rate_limit_max_requests: int = 120
    rate_limit_window_seconds: int = 60

    # Download settings
    downloads_dir: Path = Path(__file__).resolve().parent.parent.parent / "downloads"
    download_time_tolerance_seconds: int = 1
    max_error_output_length: int = 2000

    # External tools
    spotdl_output_template: str = "{artist} - {title}.{output-ext}"
    ytdlp_output_template: str = "%(title)s.%(ext)s"
    allowed_commands: frozenset[str] = frozenset({"spotdl", "yt-dlp"})

    # Security
    enable_csp: bool = True
    enable_hsts: bool = False  # Set True behind HTTPS proxy
    session_cookie_secure: bool = False  # Set True behind HTTPS proxy
    session_cookie_httponly: bool = True
    session_cookie_samesite: str = "Lax"

    # Logging
    log_level: str = "INFO"
    log_format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # User agent for external requests
    user_agent: str = "JackTracker/1.0"

    # Platform hosts
    spotify_hosts: frozenset[str] = frozenset({"open.spotify.com", "play.spotify.com"})
    youtube_hosts: frozenset[str] = frozenset({"youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"})
    deezer_hosts: frozenset[str] = frozenset({"deezer.com", "www.deezer.com"})
    audiomack_hosts: frozenset[str] = frozenset({"audiomack.com", "www.audiomack.com"})

    # Search limits
    search_term_max_length: int = 120

    # Audio extensions
    audio_extensions: frozenset[str] = frozenset({".mp3", ".m4a", ".opus", ".ogg", ".wav", ".flac"})

    # Regex patterns (compiled at runtime)
    rate_limit_pattern_str: str = r"(429|too many requests|rate.?limit|24\s*h|24.?hour|daily limit)"
    progress_pattern_str: str = r"(\d{1,3}(?:\.\d+)?)%"
    safe_search_pattern_str: str = r"[^\w\s.''(),-]"

    # Telegram bot settings
    telegram_bot_token: str = ""
    telegram_allowed_chat_ids: tuple[int, ...] = field(default_factory=tuple)


def parse_int_list(value: str | None) -> tuple[int, ...]:
    """Parse comma-separated integers from env var."""
    if not value:
        return ()
    try:
        return tuple(int(x.strip()) for x in value.split(",") if x.strip())
    except ValueError:
        return ()


def get_config() -> Config:
    """Load configuration from environment variables with defaults."""
    return Config(
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "3001")),
        debug=os.environ.get("FLASK_DEBUG", "0") == "1",
        secret_key=os.environ.get("SECRET_KEY", "dev-secret-change-in-production"),
        rate_limit_max_requests=int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "120")),
        rate_limit_window_seconds=int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60")),
        downloads_dir=Path(os.environ.get("DOWNLOADS_DIR", str(Config().downloads_dir))),
        download_time_tolerance_seconds=int(os.environ.get("DOWNLOAD_TIME_TOLERANCE_SECONDS", "1")),
        max_error_output_length=int(os.environ.get("MAX_ERROR_OUTPUT_LENGTH", "2000")),
        enable_csp=os.environ.get("ENABLE_CSP", "1") == "1",
        enable_hsts=os.environ.get("ENABLE_HSTS", "0") == "1",
        session_cookie_secure=os.environ.get("SESSION_COOKIE_SECURE", "0") == "1",
        session_cookie_httponly=os.environ.get("SESSION_COOKIE_HTTPONLY", "1") == "1",
        session_cookie_samesite=os.environ.get("SESSION_COOKIE_SAMESITE", "Lax"),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        user_agent=os.environ.get("USER_AGENT", "JackTracker/1.0"),
        telegram_bot_token=os.environ.get("TELEGRAM_BOT_TOKEN", ""),
        telegram_allowed_chat_ids=parse_int_list(os.environ.get("TELEGRAM_ALLOWED_CHAT_IDS")),
    )


config = get_config()
