from __future__ import annotations

import os
import sys
from pathlib import Path


APP_NAME = "VoiceStudioPro"


def app_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    root = Path(base) if base else Path.home() / ".local" / "share"
    path = root / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def runtime_dir() -> Path:
    path = app_data_dir() / "runtime"
    path.mkdir(parents=True, exist_ok=True)
    return path


def data_dir() -> Path:
    path = app_data_dir() / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def projects_dir() -> Path:
    path = data_dir() / "projects"
    path.mkdir(parents=True, exist_ok=True)
    return path


def voices_dir() -> Path:
    path = data_dir() / "voices"
    path.mkdir(parents=True, exist_ok=True)
    return path


def renders_dir() -> Path:
    path = data_dir() / "renders"
    path.mkdir(parents=True, exist_ok=True)
    return path


def frontend_dist_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent)) / "frontend" / "dist"
    return Path(__file__).resolve().parents[3] / "frontend" / "dist"
