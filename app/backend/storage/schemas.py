from __future__ import annotations

from pydantic import BaseModel, Field


class VoicePreset(BaseModel):
    id: str
    name: str
    kind: str = "prompt"
    path: str
    size: int
    created_at: float


class Paragraph(BaseModel):
    id: str
    text: str
    voice_id: str | None = None
    speaker_model_id: str | None = None
    speaker_overridden: bool = False
    status: str = "pending"
    audio_path: str | None = None
    audio_url: str | None = None
    error: str | None = None


class Project(BaseModel):
    id: str
    name: str
    text: str = ""
    selected_model_id: str | None = None
    paragraphs: list[Paragraph] = Field(default_factory=list)
    created_at: float
    updated_at: float
