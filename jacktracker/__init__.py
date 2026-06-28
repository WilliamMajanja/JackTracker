from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, send_from_directory
from jacktracker.config import config
from jacktracker.api import api_bp
from jacktracker.utils import init_security_headers, init_rate_limiter
from jacktracker.telegram import start_bot


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Create and configure the Flask application."""
    app = Flask(
        __name__,
        template_folder="../templates",
        static_folder="../static",
        static_url_path="/static",
    )

    # Load configuration
    if test_config:
        app.config.update(test_config)
    else:
        app.config.update(
            SECRET_KEY=config.secret_key,
            SESSION_COOKIE_SECURE=config.session_cookie_secure,
            SESSION_COOKIE_HTTPONLY=config.session_cookie_httponly,
            SESSION_COOKIE_SAMESITE=config.session_cookie_samesite,
        )

    # Ensure download directory exists
    config.downloads_dir.mkdir(exist_ok=True)

    # Configure logging
    configure_logging(app)

    # Initialize security headers
    init_security_headers(app)

    # Initialize rate limiter
    init_rate_limiter(app)

    # Register blueprints
    app.register_blueprint(api_bp)

    # Start Telegram bot (non-blocking, daemon thread)
    start_bot()

    # Routes
    @app.get("/")
    def index() -> str:
        return render_template("index.html")

    @app.get("/downloads/<path:filename>")
    def download_file(filename: str) -> Any:
        safe_name = Path(filename).name
        path = config.downloads_dir / safe_name

        # Validate file exists and is an audio file
        if safe_name != filename or not path.exists() or path.suffix.lower() not in config.audio_extensions:
            return jsonify({"error": "Download not found"}), 404

        return send_from_directory(config.downloads_dir, safe_name, as_attachment=True)

    # Health check endpoint
    @app.get("/health")
    def health() -> Any:
        return jsonify({"status": "healthy", "version": "1.0.0"})

    # Error handlers
    @app.errorhandler(404)
    def not_found(e: Any) -> Any:
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def internal_error(e: Any) -> Any:
        app.logger.exception("Internal server error")
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(429)
    def rate_limit_exceeded(e: Any) -> Any:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429

    return app


def configure_logging(app: Flask) -> None:
    """Configure application logging."""
    log_level = getattr(logging, config.log_level.upper(), logging.INFO)

    # Clear default handlers
    app.logger.handlers.clear()

    # Create formatter
    formatter = logging.Formatter(config.log_format)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)
    app.logger.addHandler(console_handler)

    # Set log level
    app.logger.setLevel(log_level)

    # Reduce noise from third-party loggers
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)


# Create app instance for WSGI servers
app = create_app()

if __name__ == "__main__":
    app.run(
        host=config.host,
        port=config.port,
        debug=config.debug,
    )
