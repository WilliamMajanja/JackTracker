#!/usr/bin/env python3
"""
JackTracker - Python Music Downloader
Entry point for running the application directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure the project root is in the Python path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

from jacktracker import create_app  # noqa: E402
from jacktracker.config import config  # noqa: E402


def main() -> None:
    """Main entry point."""
    app = create_app()
    app.run(
        host=config.host,
        port=config.port,
        debug=config.debug,
    )


if __name__ == "__main__":
    main()
