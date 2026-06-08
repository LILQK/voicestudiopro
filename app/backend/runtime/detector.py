from __future__ import annotations

import platform
import re
import subprocess
import sys

from app.backend.runtime.models import HardwareInfo, TorchVariant


def hidden_subprocess_options() -> dict:
    if sys.platform != "win32":
        return {}

    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    return {
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "startupinfo": startupinfo,
    }


def _run_nvidia_smi() -> str | None:
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,driver_version",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
            **hidden_subprocess_options(),
        )
    except (FileNotFoundError, subprocess.SubprocessError):
        return None

    if completed.returncode != 0:
        return None
    return completed.stdout.strip()


def _driver_major(driver: str | None) -> int | None:
    if not driver:
        return None
    match = re.match(r"^(\d+)", driver.strip())
    return int(match.group(1)) if match else None


def _select_torch(driver: str | None) -> tuple[TorchVariant, str, str | None]:
    major = _driver_major(driver)
    if major is None:
        return TorchVariant.cpu, "No NVIDIA driver detected; CPU runtime is safest.", None
    if major >= 550:
        return TorchVariant.cu124, "NVIDIA driver supports current CUDA 12.4 PyTorch wheels.", "12.4"
    if major >= 530:
        return TorchVariant.cu121, "NVIDIA driver supports CUDA 12.1 PyTorch wheels.", "12.1"
    return TorchVariant.cpu, "NVIDIA driver is too old for supported CUDA wheels; using CPU.", None


def detect_hardware() -> HardwareInfo:
    output = _run_nvidia_smi()
    gpu_names: list[str] = []
    driver: str | None = None

    if output:
        for line in output.splitlines():
            parts = [part.strip() for part in line.split(",")]
            if parts and parts[0]:
                gpu_names.append(parts[0])
            if len(parts) > 1 and not driver:
                driver = parts[1]

    variant, reason, cuda = _select_torch(driver)
    return HardwareInfo(
        os_name=f"{platform.system()} {platform.release()}",
        has_nvidia_gpu=bool(gpu_names),
        nvidia_driver=driver,
        cuda_from_driver=cuda,
        gpu_names=gpu_names,
        recommended_torch=variant,
        reason=reason,
    )
