from __future__ import annotations

import time
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.backend.core.config import settings
from app.backend.core.errors import NotFoundError, ValidationError
from app.backend.core.paths import renders_dir
from app.backend.qwen.engine import qwen_engine
from app.backend.runtime.installer import runtime_installer
from app.backend.storage.json_store import voice_store


router = APIRouter(prefix="/api/qwen", tags=["qwen-compat"])


def _voice_to_legacy(voice) -> dict:
    path = Path(voice.path)
    return {
        "name": voice.name,
        "size": voice.size,
        "mtimeMs": path.stat().st_mtime * 1000 if path.exists() else voice.created_at * 1000,
    }


def _find_voice_by_name(name: str):
    normalized = name.strip()
    for voice in voice_store.list():
        if voice.name == normalized or Path(voice.path).name == normalized:
            return voice
    raise NotFoundError("Voice preset not found.")


@router.get("/status")
def status() -> dict:
    runtime = runtime_installer.load_state()
    return {
        "status": "ready" if runtime.status == "ready" and not settings.mock_inference else "error",
        "launchedByApp": False,
        "attempts": 0,
        "startupElapsedMs": 0,
        "lastError": runtime.last_error,
        "apiUrl": "python://qwen-tts",
    }


@router.get("/voices")
def voices() -> dict:
    return {"voices": [_voice_to_legacy(voice) for voice in voice_store.list()], "voicesDir": ""}


@router.post("/voices")
async def create_voice(
    name: str = Form(...),
    ref_txt: str = Form(""),
    file: UploadFile | None = File(None),
) -> dict:
    if file is None:
        raise ValidationError("Reference audio or prompt file is required.")
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ".pt"
    content = await file.read()
    if suffix in {".pt", ".pth"}:
        voice = voice_store.save_file(name, content, suffix)
    else:
        if not ref_txt.strip():
            raise ValidationError("Reference transcript is required.")
        voice = voice_store.create_from_reference(name, content, suffix, ref_txt.strip())
    return {"voice": _voice_to_legacy(voice)}


@router.patch("/voices/{voice_name}")
def rename_voice(voice_name: str, payload: dict) -> dict:
    voice = _find_voice_by_name(voice_name)
    next_name = str(payload.get("name", "")).strip()
    if not next_name:
        raise ValidationError("New voice name is required.")
    meta_path = Path(voice.path).with_suffix(".json")
    voice.name = next_name
    meta_path.write_text(voice.model_dump_json(indent=2), encoding="utf-8")
    return {"voice": _voice_to_legacy(voice)}


@router.delete("/voices/{voice_name}")
def delete_voice(voice_name: str) -> dict:
    voice = _find_voice_by_name(voice_name)
    path = Path(voice.path)
    meta_path = path.with_suffix(".json")
    path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)
    return {"ok": True}


async def _payload_from_request(request: Request) -> tuple[dict, list[UploadFile]]:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        payload = {key: value for key, value in form.items() if not hasattr(value, "filename")}
        files = [value for value in form.values() if hasattr(value, "filename")]
        return payload, files
    return await request.json(), []


@router.post("/load_prompt_and_gen")
async def load_prompt_and_gen(request: Request) -> dict:
    started = time.time()
    payload, files = await _payload_from_request(request)
    text = str(payload.get("text") or payload.get("targetText") or "").strip()
    if not text:
        raise ValidationError("Text is required.")

    voice_name = str(payload.get("voicePreset") or "").strip()
    voice_path: str | None = None
    if voice_name:
        voice_path = _find_voice_by_name(voice_name).path
    elif files:
        uploaded = files[0]
        content = await uploaded.read()
        suffix = "." + uploaded.filename.rsplit(".", 1)[-1].lower() if uploaded.filename and "." in uploaded.filename else ".pt"
        voice = voice_store.save_file(uploaded.filename or "uploaded.pt", content, suffix)
        voice_path = voice.path
    else:
        raise ValidationError("Select a voice prompt before generating audio.")

    job_id = str(uuid.uuid4())
    paragraph_id = str(uuid.uuid4())
    output_path = qwen_engine.synthesize(text, voice_path, job_id, paragraph_id)
    return {
        "data": {"url": f"/api/audio/{job_id}/{output_path.name}"},
        "upstreamStatus": 200,
        "elapsedMs": int((time.time() - started) * 1000),
        "transport": "python_qwen_tts",
    }


@router.post("/run_voice_clone")
async def run_voice_clone(request: Request) -> dict:
    return await load_prompt_and_gen(request)


@router.post("/save_prompt")
async def save_prompt(
    ref_txt: str = Form(""),
    file: UploadFile = File(...),
    use_xvec: bool = Form(False),
) -> dict:
    content = await file.read()
    voice = voice_store.create_from_reference(
        name=f"voice_clone_prompt_{uuid.uuid4().hex[:8]}",
        audio_content=content,
        audio_suffix="." + file.filename.rsplit(".", 1)[-1].lower(),
        transcript=ref_txt,
    )
    return {"data": {"url": voice.path}, "upstreamStatus": 200, "elapsedMs": 0}


@router.get("/audio-file")
def audio_file(url: str) -> FileResponse:
    if url.startswith("/api/audio/"):
        parts = url.strip("/").split("/")
        if len(parts) >= 4:
            path = renders_dir() / parts[-2] / parts[-1]
            if path.exists():
                return FileResponse(path, media_type="audio/wav", filename=path.name)
    path = Path(url)
    if path.exists():
        return FileResponse(path, media_type="audio/wav", filename=path.name)
    raise NotFoundError("Audio file not found.")


@router.delete("/audio-file")
def delete_audio_file(url: str) -> dict:
    if url.startswith("/api/audio/"):
        parts = url.strip("/").split("/")
        if len(parts) >= 4:
            (renders_dir() / parts[-2] / parts[-1]).unlink(missing_ok=True)
    return {"ok": True, "deleted": True, "upstreamStatus": 200}

