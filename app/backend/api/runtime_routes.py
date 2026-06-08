from __future__ import annotations

from fastapi import APIRouter

from app.backend.runtime.installer import runtime_installer
from app.backend.runtime.models import InstallRequest, RuntimeState


router = APIRouter(prefix="/api/runtime", tags=["runtime"])


@router.get("", response_model=RuntimeState)
def runtime_status() -> RuntimeState:
    return runtime_installer.load_state()


@router.post("/install", response_model=RuntimeState)
def install_runtime(request: InstallRequest) -> RuntimeState:
    return runtime_installer.install(request)

