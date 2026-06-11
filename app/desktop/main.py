from __future__ import annotations

import base64
import socket
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request

import uvicorn
import webview

from app.backend.app_factory import create_app
from app.backend.core.config import settings
from app.backend.core.logging import configure_logging


def find_available_port(host: str, preferred_port: int) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((host, preferred_port))
        except OSError:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as fallback:
                fallback.bind((host, 0))
                return int(fallback.getsockname()[1])
        return preferred_port


def run_backend(port: int) -> None:
    uvicorn.run(create_app(), host=settings.host, port=port, log_level="info")


def wait_for_backend(base_url: str, timeout_seconds: float = 20) -> bool:
    deadline = time.monotonic() + timeout_seconds
    health_url = f"{base_url}/api/health"

    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=0.8) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            time.sleep(0.2)

    return False


class NativeApi:
    def __init__(self) -> None:
        # pywebview recursively exposes public attributes to JavaScript.
        self._window: webview.Window | None = None

    def save_export(
        self,
        file_name: str,
        base64_data: str,
        file_types: list[str] | None = None,
    ) -> dict[str, str | bool]:
        if self._window is None:
            return {"ok": False, "cancelled": False, "error": "Native window is not ready."}

        selected_paths = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=file_name,
            file_types=file_types or ("All files (*.*)",),
        )
        if not selected_paths:
            return {"ok": False, "cancelled": True}

        destination = Path(selected_paths[0])
        try:
            destination.write_bytes(base64.b64decode(base64_data, validate=True))
        except Exception as exc:
            return {"ok": False, "cancelled": False, "error": str(exc)}

        return {"ok": True, "cancelled": False, "path": str(destination)}


def main() -> None:
    configure_logging()
    port = find_available_port(settings.host, settings.port)
    base_url = f"http://{settings.host}:{port}"
    thread = threading.Thread(target=run_backend, args=(port,), daemon=True)
    thread.start()
    native_api = NativeApi()

    if not wait_for_backend(base_url):
        webview.create_window(
            "VoiceStudio Pro",
            html=(
                "<main style='font-family: Segoe UI, sans-serif; padding: 32px'>"
                "<h1>VoiceStudio Pro could not start</h1>"
                "<p>The local backend did not become ready in time. "
                "Close other running VoiceStudio or dev server instances and try again.</p>"
                "</main>"
            ),
            width=720,
            height=420,
        )
        webview.start()
        return

    window = webview.create_window(
        "VoiceStudio Pro",
        base_url,
        js_api=native_api,
        width=1360,
        height=860,
        min_size=(1100, 720),
    )
    native_api._window = window
    webview.start()


if __name__ == "__main__":
    main()
