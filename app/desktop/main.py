from __future__ import annotations

import threading
import time

import uvicorn
import webview

from app.backend.app_factory import create_app
from app.backend.core.config import settings
from app.backend.core.logging import configure_logging


def run_backend() -> None:
    uvicorn.run(create_app(), host=settings.host, port=settings.port, log_level="info")


def main() -> None:
    configure_logging()
    thread = threading.Thread(target=run_backend, daemon=True)
    thread.start()
    time.sleep(0.8)
    webview.create_window(
        "VoiceStudio Pro",
        f"http://{settings.host}:{settings.port}",
        width=1360,
        height=860,
        min_size=(1100, 720),
    )
    webview.start()


if __name__ == "__main__":
    main()

