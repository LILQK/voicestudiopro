from __future__ import annotations

import json
import subprocess
import sys
import threading
import time
import venv
from pathlib import Path

from app.backend.core.config import settings
from app.backend.core.errors import RuntimeInstallError
from app.backend.core.paths import runtime_dir
from app.backend.runtime.detector import detect_hardware, hidden_subprocess_options
from app.backend.runtime.models import InstallRequest, RuntimeState, RuntimeStatus, TorchVariant
from app.backend.runtime.torch_selector import qwen_install_command, torch_install_command


class RuntimeInstaller:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = RuntimeState(status=RuntimeStatus.missing)
        self._thread: threading.Thread | None = None
        self._last_loaded_at = 0.0
        self._state_ttl_seconds = 10.0

    @property
    def manifest_path(self) -> Path:
        return runtime_dir() / "runtime.json"

    @property
    def venv_dir(self) -> Path:
        return runtime_dir() / "venv"

    @property
    def python_exe(self) -> Path:
        return self.venv_dir / "Scripts" / "python.exe" if sys.platform == "win32" else self.venv_dir / "bin" / "python"

    def load_state(self) -> RuntimeState:
        if self._thread and self._thread.is_alive():
            return self._state
        if time.monotonic() - self._last_loaded_at < self._state_ttl_seconds:
            return self._state

        hardware = detect_hardware()
        self._last_loaded_at = time.monotonic()
        if self.manifest_path.exists() and self.python_exe.exists():
            try:
                manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                manifest = {}
            self._state = RuntimeState(
                status=RuntimeStatus.ready,
                mock_inference=settings.mock_inference,
                hardware=hardware,
                torch_variant=TorchVariant(manifest.get("torch_variant", hardware.recommended_torch)),
                installed_packages=manifest.get("installed_packages", []),
                progress=1,
                message="Runtime is ready.",
            )
        elif settings.mock_inference:
            self._state = RuntimeState(
                status=RuntimeStatus.ready,
                mock_inference=True,
                hardware=hardware,
                torch_variant=hardware.recommended_torch,
                installed_packages=["mock-inference"],
                progress=1,
                message=f"Development runtime active. {hardware.reason}",
            )
        else:
            self._state = RuntimeState(
                status=RuntimeStatus.missing,
                mock_inference=False,
                hardware=hardware,
                torch_variant=hardware.recommended_torch,
                message=hardware.reason,
            )
        return self._state

    def install(self, request: InstallRequest) -> RuntimeState:
        if self._thread and self._thread.is_alive():
            return self._state

        hardware = detect_hardware()
        variant = request.torch_variant or hardware.recommended_torch
        self._state = RuntimeState(
            status=RuntimeStatus.installing,
            mock_inference=settings.mock_inference,
            hardware=hardware,
            torch_variant=variant,
            progress=0.03,
            message="Runtime installation queued...",
        )
        self._thread = threading.Thread(target=self._install_sync, args=(request,), daemon=True)
        self._thread.start()
        return self._state

    def _install_sync(self, request: InstallRequest) -> None:
        with self._lock:
            hardware = detect_hardware()
            variant = request.torch_variant or hardware.recommended_torch
            self._state = RuntimeState(
                status=RuntimeStatus.installing,
                hardware=hardware,
                torch_variant=variant,
                progress=0.05,
                message="Creating isolated Python runtime...",
            )

            try:
                if request.force and self.venv_dir.exists():
                    raise RuntimeInstallError(
                        "Force reinstall is reserved for the repair flow. Delete the runtime first from settings."
                    )
                if not self.python_exe.exists():
                    venv.EnvBuilder(with_pip=True, clear=False).create(self.venv_dir)

                self._state.progress = 0.2
                self._state.message = f"Installing Torch runtime ({variant.value})..."
                self._run(torch_install_command(str(self.python_exe), variant))

                packages = ["torch", "torchaudio"]
                if request.include_qwen:
                    self._state.progress = 0.65
                    self._state.message = "Installing QwenTTS dependencies..."
                    self._run(qwen_install_command(str(self.python_exe)))
                    packages.extend(["qwen-tts", "transformers", "accelerate", "soundfile"])

                manifest = {
                    "torch_variant": variant.value,
                    "installed_packages": packages,
                }
                self.manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
                self._state = RuntimeState(
                    status=RuntimeStatus.ready,
                    mock_inference=settings.mock_inference,
                    hardware=hardware,
                    torch_variant=variant,
                    installed_packages=packages,
                    progress=1,
                    message="Runtime is ready.",
                )
            except Exception as error:
                self._state.status = RuntimeStatus.error
                self._state.last_error = str(error)
                self._state.message = "Runtime installation failed."
            return self._state

    def _run(self, command: list[str]) -> None:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            **hidden_subprocess_options(),
        )
        if completed.returncode != 0:
            raise RuntimeInstallError(
                "Command failed while installing runtime.",
                {"command": command, "stderr": completed.stderr[-4000:]},
            )


runtime_installer = RuntimeInstaller()
