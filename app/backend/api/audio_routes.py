from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.backend.core.errors import NotFoundError
from app.backend.core.paths import renders_dir


router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.get("/{job_id}/{file_name}")
def get_audio(job_id: str, file_name: str) -> FileResponse:
    path = renders_dir() / job_id / file_name
    if not path.exists():
        raise NotFoundError("Audio file not found.")
    return FileResponse(path, media_type="audio/wav", filename=file_name)

