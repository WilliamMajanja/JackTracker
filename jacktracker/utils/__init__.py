from __future__ import annotations

import time
import threading
from functools import wraps
from typing import Callable, Any

from flask import Flask, request, jsonify, Response
from jacktracker.config import config

lock = threading.Lock()
request_counts: dict[str, dict[str, float]] = {}


def init_security_headers(app: Flask) -> None:
    """Initialize security headers for all responses."""

    @app.after_request
    def add_security_headers(response: Response) -> Response:
        # Content Security Policy
        if config.enable_csp:
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self'; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self'"
            )
            response.headers["Content-Security-Policy"] = csp

        # HSTS (only enable behind HTTPS proxy)
        if config.enable_hsts:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Other security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

        # Remove server header
        response.headers.pop("Server", None)

        return response


def init_rate_limiter(app: Flask) -> None:
    """Initialize rate limiting middleware."""

    @app.before_request
    def rate_limit() -> Response | None:
        key = request.remote_addr or "unknown"
        now = time.time()

        with lock:
            entry = request_counts.get(key, {"count": 0, "reset_at": now + config.rate_limit_window_seconds})
            if entry["reset_at"] <= now:
                entry = {"count": 0, "reset_at": now + config.rate_limit_window_seconds}
            entry["count"] += 1
            request_counts[key] = entry
            is_limited = entry["count"] > config.rate_limit_max_requests

        if is_limited:
            response = jsonify({"error": "Too many requests. Please try again shortly."})
            response.status_code = 429
            response.headers["Retry-After"] = str(int(entry["reset_at"] - now) + 1)
            return response
        return None


def validate_json_request(required_fields: list[str] | None = None) -> Callable:
    """Decorator to validate JSON request body."""

    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            if not request.is_json:
                return jsonify({"error": "Content-Type must be application/json"}), 400

            data = request.get_json(silent=True)
            if data is None:
                return jsonify({"error": "Invalid JSON body"}), 400

            if required_fields:
                missing = [field for field in required_fields if field not in data]
                if missing:
                    return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

            return f(*args, **kwargs)

        return wrapped

    return decorator


def sanitize_input(value: str, max_length: int = 1000) -> str:
    """Sanitize user input."""
    if not isinstance(value, str):
        return ""
    # Remove null bytes and control characters
    cleaned = value.replace("\x00", "").strip()
    # Limit length
    return cleaned[:max_length]
