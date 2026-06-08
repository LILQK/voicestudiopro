from __future__ import annotations

from fastapi import APIRouter

from app.backend.core.errors import NotFoundError
from app.backend.jobs.queue import generation_queue
from app.backend.jobs.schemas import GenerationJob, GenerationRequest


router = APIRouter(prefix="/api/generation", tags=["generation"])


@router.post("/jobs", response_model=GenerationJob)
def create_job(request: GenerationRequest) -> GenerationJob:
    return generation_queue.create(request)


@router.get("/jobs/{job_id}", response_model=GenerationJob)
def get_job(job_id: str) -> GenerationJob:
    job = generation_queue.get(job_id)
    if not job:
        raise NotFoundError("Generation job not found.")
    return job


@router.post("/jobs/{job_id}/cancel", response_model=GenerationJob)
def cancel_job(job_id: str) -> GenerationJob:
    job = generation_queue.cancel(job_id)
    if not job:
        raise NotFoundError("Generation job not found.")
    return job

