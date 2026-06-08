from __future__ import annotations

import io
import wave
import zipfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.backend.core.errors import ValidationError


class ExportClip(BaseModel):
    name: str
    audio_path: str


class ExportRequest(BaseModel):
    project_name: str
    clips: list[ExportClip]


router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/zip")
def export_zip(request: ExportRequest) -> StreamingResponse:
    if not request.clips:
        raise ValidationError("No generated clips to export.")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for index, clip in enumerate(request.clips, start=1):
            path = Path(clip.audio_path)
            if path.exists():
                archive.write(path, f"audio/{index:03d}-{clip.name}.wav")
        archive.writestr("README.txt", "VoiceStudio Pro export package.\n")

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{request.project_name}.zip"'},
    )

