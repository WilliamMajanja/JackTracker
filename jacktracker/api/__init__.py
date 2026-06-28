from __future__ import annotations

from flask import Blueprint, jsonify, request
from jacktracker.services import (
    is_supported_url,
    get_metadata,
    download_worker,
    update_job,
    jobs,
)
import threading
import uuid

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.post("/metadata")
def metadata() -> tuple[Any, int]:
    """Fetch metadata for a music URL."""
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_supported_url(url):
        return jsonify({"error": "A valid http(s) URL is required"}), 400

    return jsonify(get_metadata(url))


@api_bp.post("/download")
def start_download() -> tuple[Any, int]:
    """Start a download job."""
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()

    if not is_supported_url(url):
        return jsonify({"error": "A valid http(s) URL is required"}), 400

    job_id = str(data.get("id") or uuid.uuid4())
    update_job(job_id, id=job_id, status="queued", progress=0, url=url)

    thread = threading.Thread(target=download_worker, args=(job_id, data), daemon=True)
    thread.start()

    return jsonify({"id": job_id, "status": "queued"}), 202


@api_bp.get("/download/<job_id>")
def download_status(job_id: str) -> tuple[Any, int]:
    """Get download job status."""
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Download not found"}), 404
    return jsonify(job)
