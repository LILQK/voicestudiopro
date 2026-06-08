from __future__ import annotations

from enum import Enum
from pydantic import BaseModel


class RuntimeStatus(str, Enum):
    missing = "missing"
    detecting = "detecting"
    installing = "installing"
    ready = "ready"
    error = "error"


class TorchVariant(str, Enum):
    cpu = "cpu"
    cu121 = "cu121"
    cu124 = "cu124"


class HardwareInfo(BaseModel):
    os_name: str
    has_nvidia_gpu: bool
    nvidia_driver: str | None = None
    cuda_from_driver: str | None = None
    gpu_names: list[str] = []
    recommended_torch: TorchVariant
    reason: str


class RuntimeState(BaseModel):
    status: RuntimeStatus
    mock_inference: bool = False
    hardware: HardwareInfo | None = None
    torch_variant: TorchVariant | None = None
    installed_packages: list[str] = []
    progress: float = 0
    message: str = "Runtime has not been installed yet."
    last_error: str | None = None


class InstallRequest(BaseModel):
    torch_variant: TorchVariant | None = None
    include_qwen: bool = True
    force: bool = False
