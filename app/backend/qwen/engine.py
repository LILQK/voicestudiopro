from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

from app.backend.core.config import settings
from app.backend.core.errors import InferenceError
from app.backend.core.paths import renders_dir
from app.backend.runtime.detector import hidden_subprocess_options
from app.backend.runtime.installer import runtime_installer


class QwenEngine:
    """Direct Python adapter for QwenTTS.

    The concrete upstream Python API has moved across QwenTTS examples. This class keeps the rest
    of VoiceStudio stable: only this adapter should change when we bind to the exact installed
    QwenTTS package.
    """

    def __init__(self) -> None:
        self._loaded = False
        self._model: object | None = None

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        if settings.mock_inference:
            self._loaded = True
            return

        self._loaded = True

    def synthesize(self, text: str, voice_path: str | None, job_id: str, paragraph_id: str) -> Path:
        self.ensure_loaded()
        output_path = renders_dir() / job_id / f"{paragraph_id}.wav"
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if settings.mock_inference:
            self._write_placeholder_wav(output_path, text)
            return output_path

        return self._run_qwen_worker(output_path, text, voice_path)

    def create_voice_prompt(self, reference_audio_path: str, reference_text: str, output_path: Path) -> Path:
        self.ensure_loaded()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if settings.mock_inference:
            output_path.write_bytes(b"mock voice prompt")
            return output_path

        return self._run_qwen_worker(
            output_path=output_path,
            text="",
            voice_path=None,
            extra_payload={
                "task": "create_voice_prompt",
                "reference_audio_path": reference_audio_path,
                "reference_text": reference_text,
                "x_vector_only_mode": False,
            },
        )

    def _run_qwen_worker(
        self,
        output_path: Path,
        text: str,
        voice_path: str | None,
        extra_payload: dict | None = None,
    ) -> Path:
        if not voice_path and not extra_payload:
            raise InferenceError(
                "Real QwenTTS generation requires a reusable voice prompt .pt file for now."
            )

        prompt_path = Path(voice_path) if voice_path else None
        if prompt_path and prompt_path.suffix.lower() not in {".pt", ".pth"}:
            raise InferenceError(
                "Real QwenTTS generation currently expects a Qwen voice prompt .pt/.pth file.",
                {"voice_path": voice_path},
            )

        python_exe = runtime_installer.python_exe
        if not python_exe.exists():
            python_exe = Path(sys.executable)

        payload = {
            "model_id": settings.qwen_model_id,
            "text": text,
            "language": "Auto",
            "voice_prompt_path": str(prompt_path) if prompt_path else None,
            "output_path": str(output_path),
        }
        if extra_payload:
            payload.update(extra_payload)

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(payload, handle)
            payload_path = Path(handle.name)

        worker_path = Path(__file__).with_name("runtime_worker.py")
        completed = subprocess.run(
            [str(python_exe), str(worker_path), str(payload_path)],
            capture_output=True,
            text=True,
            check=False,
            timeout=3600,
            **hidden_subprocess_options(),
        )

        try:
            payload_path.unlink(missing_ok=True)
        except OSError:
            pass

        if completed.returncode != 0:
            raise InferenceError(
                "QwenTTS worker failed.",
                {
                    "stderr": completed.stderr[-4000:],
                    "stdout": completed.stdout[-1000:],
                    "python": str(python_exe),
                },
            )
        return output_path

    def _write_placeholder_wav(self, path: Path, text: str) -> None:
        sample_rate = 24_000
        duration = max(0.7, min(4.0, len(text) / 90))
        frames = int(sample_rate * duration)
        amplitude = 6000
        frequency = 220

        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            for index in range(frames):
                envelope = min(1, index / 1200, (frames - index) / 1200)
                value = int(amplitude * envelope * math.sin(2 * math.pi * frequency * index / sample_rate))
                wav_file.writeframesraw(value.to_bytes(2, "little", signed=True))


qwen_engine = QwenEngine()
