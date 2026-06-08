from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path

from app.backend.core.errors import NotFoundError
from app.backend.core.paths import projects_dir, voices_dir
from app.backend.storage.schemas import Project, VoicePreset
from app.backend.qwen.engine import qwen_engine


def _now() -> float:
    return time.time()


class ProjectStore:
    def list(self) -> list[Project]:
        projects = []
        for path in projects_dir().glob("*.json"):
            projects.append(Project.model_validate_json(path.read_text(encoding="utf-8")))
        return sorted(projects, key=lambda item: item.updated_at, reverse=True)

    def get(self, project_id: str) -> Project:
        path = projects_dir() / f"{project_id}.json"
        if not path.exists():
            raise NotFoundError("Project not found.")
        return Project.model_validate_json(path.read_text(encoding="utf-8"))

    def save(self, project: Project) -> Project:
        project.updated_at = _now()
        path = projects_dir() / f"{project.id}.json"
        path.write_text(project.model_dump_json(indent=2), encoding="utf-8")
        return project

    def create(self, name: str) -> Project:
        timestamp = _now()
        project = Project(id=str(uuid.uuid4()), name=name, created_at=timestamp, updated_at=timestamp)
        return self.save(project)


class VoiceStore:
    def list(self) -> list[VoicePreset]:
        items = []
        for path in voices_dir().glob("*.json"):
            items.append(VoicePreset.model_validate_json(path.read_text(encoding="utf-8")))
        return sorted(items, key=lambda item: item.created_at, reverse=True)

    def save_file(self, name: str, content: bytes, suffix: str) -> VoicePreset:
        voice_id = str(uuid.uuid4())
        voice_path = voices_dir() / f"{voice_id}{suffix}"
        voice_path.write_bytes(content)
        preset = VoicePreset(
            id=voice_id,
            name=name,
            path=str(voice_path),
            size=len(content),
            created_at=_now(),
        )
        (voices_dir() / f"{voice_id}.json").write_text(
            preset.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return preset

    def create_from_reference(self, name: str, audio_content: bytes, audio_suffix: str, transcript: str) -> VoicePreset:
        voice_id = str(uuid.uuid4())
        reference_path = voices_dir() / f"{voice_id}-reference{audio_suffix}"
        reference_path.write_bytes(audio_content)
        prompt_path = voices_dir() / f"{voice_id}.pt"
        qwen_engine.create_voice_prompt(
            reference_audio_path=str(reference_path),
            reference_text=transcript,
            output_path=prompt_path,
        )
        preset = VoicePreset(
            id=voice_id,
            name=name,
            path=str(prompt_path),
            size=prompt_path.stat().st_size,
            created_at=_now(),
        )
        (voices_dir() / f"{voice_id}.json").write_text(
            preset.model_dump_json(indent=2),
            encoding="utf-8",
        )
        return preset

    def get(self, voice_id: str) -> VoicePreset:
        path = voices_dir() / f"{voice_id}.json"
        if not path.exists():
            raise NotFoundError("Voice preset not found.")
        return VoicePreset.model_validate_json(path.read_text(encoding="utf-8"))


project_store = ProjectStore()
voice_store = VoiceStore()
