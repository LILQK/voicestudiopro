from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    partial_error = "partial_error"
    cancelled = "cancelled"
    error = "error"


class GenerationParagraph(BaseModel):
    id: str
    text: str
    voice_id: str | None = None


class GenerationRequest(BaseModel):
    project_id: str | None = None
    paragraphs: list[GenerationParagraph]


class ParagraphResult(BaseModel):
    paragraph_id: str
    status: str
    audio_url: str | None = None
    error: str | None = None


class GenerationJob(BaseModel):
    id: str
    status: JobStatus
    progress: float = 0
    message: str = "Queued"
    results: list[ParagraphResult] = Field(default_factory=list)
