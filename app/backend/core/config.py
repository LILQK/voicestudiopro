from __future__ import annotations

import os

from pydantic import BaseModel


class Settings(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8787
    app_title: str = "VoiceStudio Pro"
    qwen_model_id: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    mock_inference: bool = os.environ.get("VOICESTUDIO_MOCK_INFERENCE", "0").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


settings = Settings()
