from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure the project root is in the Python path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

from jacktracker import create_app  # noqa: E402

# Create the application instance for gunicorn
application = create_app()

if __name__ == "__main__":
    # For direct execution (development)
    application.run()
