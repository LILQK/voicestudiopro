from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, File, Form, Response, UploadFile

from app.backend.storage.json_store import voice_store
from app.backend.storage.schemas import VoicePreset


router = APIRouter(prefix="/api/voices", tags=["voices"])


class RenameVoiceRequest(BaseModel):
    name: str


@router.get("", response_model=list[VoicePreset])
def list_voices() -> list[VoicePreset]:
    return voice_store.list()


@router.post("", response_model=VoicePreset)
async def create_voice(
    name: str = Form(...),
    file: UploadFile = File(...),
    transcript: str = Form(""),
) -> VoicePreset:
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ".pt"
    content = await file.read()
    if suffix not in {".pt", ".pth"}:
        if not transcript.strip():
            from app.backend.core.errors import ValidationError

            raise ValidationError("Reference transcript is required to create a Qwen voice prompt.")
        return voice_store.create_from_reference(
            name=name,
            audio_content=content,
            audio_suffix=suffix,
            transcript=transcript.strip(),
        )
    return voice_store.save_file(name=name, content=content, suffix=suffix)


@router.patch("/{voice_id}", response_model=VoicePreset)
def rename_voice(voice_id: str, request: RenameVoiceRequest) -> VoicePreset:
    from app.backend.core.errors import ValidationError

    name = request.name.strip()
    if not name:
        raise ValidationError("New voice name is required.")
    return voice_store.rename(voice_id, name)


@router.delete("/{voice_id}", status_code=204)
def delete_voice(voice_id: str) -> Response:
    voice_store.delete(voice_id)
    return Response(status_code=204)
