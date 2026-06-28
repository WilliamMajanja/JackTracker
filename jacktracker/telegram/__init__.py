from __future__ import annotations

import asyncio
import logging
import threading
import uuid
from typing import Any

from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

from jacktracker.config import config
from jacktracker.services import (
    get_metadata,
    download_worker,
    update_job,
    jobs,
    is_supported_url,
)

logger = logging.getLogger(__name__)

_bot_thread: threading.Thread | None = None
_application: Application | None = None


async def start_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if config.telegram_allowed_chat_ids and chat_id not in config.telegram_allowed_chat_ids:
        await update.message.reply_text("Unauthorized.")
        return
    await update.message.reply_text(
        "JackTracker Bot\n\n"
        "Send me a music URL and I'll download it for you!\n"
        "Supported: Spotify, YouTube, Deezer, Audiomack, and more."
    )


async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if config.telegram_allowed_chat_ids and chat_id not in config.telegram_allowed_chat_ids:
        await update.message.reply_text("Unauthorized.")
        return

    text = update.message.text.strip()
    if not is_supported_url(text):
        await update.message.reply_text("Please send a valid music URL (http/https).")
        return

    msg = await update.message.reply_text("Fetching track info...")

    try:
        metadata_list = get_metadata(text)
    except Exception as e:
        await msg.edit_text(f"Failed to fetch metadata: {e}")
        return

    if not metadata_list:
        await msg.edit_text("Could not fetch track info. Try again or use a different URL.")
        return

    item = metadata_list[0]
    track_name = item.get("trackName", "Unknown Track")
    artist_name = item.get("artistName", "Unknown Artist")

    await msg.edit_text(
        f"{track_name} - {artist_name}\nStarting download..."
    )

    job_id = str(uuid.uuid4())

    payload = {
        "url": text,
        "trackName": track_name,
        "artistName": artist_name,
        "id": job_id,
    }

    update_job(job_id, id=job_id, status="queued", progress=0, url=text,
               trackName=track_name, artistName=artist_name)

    thread = threading.Thread(target=download_worker, args=(job_id, payload), daemon=True)
    thread.start()

    context.chat_data[job_id] = {
        "chat_id": chat_id,
        "message_id": msg.message_id,
        "track_name": track_name,
        "artist_name": artist_name,
    }

    context.job_queue.run_repeating(
        check_download_status,
        interval=3,
        first=3,
        data={"job_id": job_id},
        name=f"dl_{job_id}",
    )


async def check_download_status(context: ContextTypes.DEFAULT_TYPE) -> None:
    job = context.job
    if not job:
        return
    job_id = job.data["job_id"]
    status_data = context.chat_data.get(job_id, {})

    chat_id = status_data.get("chat_id")
    message_id = status_data.get("message_id")
    track_name = status_data.get("track_name", "Track")
    artist_name = status_data.get("artist_name", "Artist")

    if not chat_id or not message_id:
        job.schedule_removal()
        return

    dl_job = jobs.get(job_id, {})
    status = dl_job.get("status", "")

    try:
        if status == "downloading":
            progress = dl_job.get("progress", 0)
            await context.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=f"Downloading... {progress:.0f}%",
            )
        elif status == "complete":
            download_url = dl_job.get("downloadUrl", "")
            filename = download_url.split("/")[-1] if download_url else ""
            filepath = config.downloads_dir / filename if filename else None

            if filepath and filepath.exists():
                try:
                    with open(filepath, "rb") as f:
                        await context.bot.send_document(
                            chat_id=chat_id,
                            document=f,
                            filename=filename,
                            caption=f"{track_name} - {artist_name}",
                        )
                    await context.bot.delete_message(chat_id=chat_id, message_id=message_id)
                except Exception as e:
                    await context.bot.edit_message_text(
                        chat_id=chat_id,
                        message_id=message_id,
                        text=f"Complete! File: {download_url}",
                    )
            else:
                await context.bot.edit_message_text(
                    chat_id=chat_id,
                    message_id=message_id,
                    text=f"Complete!\n{download_url}",
                )
            job.schedule_removal()
        elif status == "error":
            error = dl_job.get("errorMessage", "Unknown error")
            await context.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=f"Error: {error}",
            )
            job.schedule_removal()
    except Exception:
        pass


async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Telegram bot error: %s", context.error)


def run_bot_async() -> None:
    """Run the Telegram bot application (blocking)."""
    global _application
    _application = Application.builder().token(config.telegram_bot_token).build()

    _application.add_handler(CommandHandler("start", start_cmd))
    _application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_url))
    _application.add_error_handler(error_handler)

    _application.run_polling(allowed_updates=Update.ALL_TYPES)


def start_bot() -> None:
    """Start the Telegram bot in a background daemon thread."""
    if not config.telegram_bot_token:
        logger.info("Telegram bot not configured (TELEGRAM_BOT_TOKEN not set)")
        return

    global _bot_thread
    if _bot_thread and _bot_thread.is_alive():
        logger.info("Telegram bot already running")
        return

    _bot_thread = threading.Thread(target=run_bot_async, daemon=True, name="telegram-bot")
    _bot_thread.start()
    logger.info("Telegram bot started in background thread")
