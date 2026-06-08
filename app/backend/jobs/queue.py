from __future__ import annotations

import threading
import uuid

from app.backend.core.errors import ValidationError
from app.backend.jobs.schemas import (
    GenerationJob,
    GenerationRequest,
    JobStatus,
    ParagraphResult,
)
from app.backend.core.config import settings
from app.backend.qwen.engine import qwen_engine
from app.backend.storage.json_store import voice_store


class GenerationQueue:
    def __init__(self) -> None:
        self._jobs: dict[str, GenerationJob] = {}
        self._cancelled: set[str] = set()
        self._lock = threading.Lock()

    def create(self, request: GenerationRequest) -> GenerationJob:
        if not settings.mock_inference:
            missing_voice = [paragraph.id for paragraph in request.paragraphs if not paragraph.voice_id]
            if missing_voice:
                raise ValidationError(
                    "Select a Qwen voice prompt before generating real audio.",
                    {"paragraph_ids": missing_voice},
                )

        job = GenerationJob(id=str(uuid.uuid4()), status=JobStatus.queued)
        with self._lock:
            self._jobs[job.id] = job
        thread = threading.Thread(target=self._run, args=(job.id, request), daemon=True)
        thread.start()
        return job

    def get(self, job_id: str) -> GenerationJob | None:
        with self._lock:
            return self._jobs.get(job_id)

    def cancel(self, job_id: str) -> GenerationJob | None:
        self._cancelled.add(job_id)
        with self._lock:
            job = self._jobs.get(job_id)
            if job and job.status in {JobStatus.queued, JobStatus.running}:
                job.status = JobStatus.cancelled
                job.message = "Cancelled"
            return job

    def _run(self, job_id: str, request: GenerationRequest) -> None:
        message = "Generating demo placeholder audio" if settings.mock_inference else "Generating QwenTTS audio"
        self._update(job_id, status=JobStatus.running, message=message)
        total = max(1, len(request.paragraphs))

        for index, paragraph in enumerate(request.paragraphs):
            if job_id in self._cancelled:
                self._update(job_id, status=JobStatus.cancelled, message="Cancelled")
                return

            try:
                voice_path = None
                if paragraph.voice_id:
                    voice_path = voice_store.get(paragraph.voice_id).path
                output_path = qwen_engine.synthesize(paragraph.text, voice_path, job_id, paragraph.id)
                result = ParagraphResult(
                    paragraph_id=paragraph.id,
                    status="ok",
                    audio_url=f"/api/audio/{job_id}/{output_path.name}",
                )
            except Exception as error:
                result = ParagraphResult(
                    paragraph_id=paragraph.id,
                    status="error",
                    error=str(error),
                )

            with self._lock:
                job = self._jobs[job_id]
                job.results.append(result)
                job.progress = (index + 1) / total
                suffix = " demo clips" if settings.mock_inference else " clips"
                job.message = f"Generated {index + 1} of {total}{suffix}"

        done = "Completed demo generation" if settings.mock_inference else "Completed"
        with self._lock:
            has_errors = any(result.status == "error" for result in self._jobs[job_id].results)
        if has_errors:
            self._update(
                job_id,
                status=JobStatus.partial_error,
                progress=1,
                message="Completed with errors",
            )
            return

        self._update(job_id, status=JobStatus.completed, progress=1, message=done)

    def _update(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        progress: float | None = None,
        message: str | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs[job_id]
            if status:
                job.status = status
            if progress is not None:
                job.progress = progress
            if message:
                job.message = message


generation_queue = GenerationQueue()
