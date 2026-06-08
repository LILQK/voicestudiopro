from __future__ import annotations

from app.backend.runtime.models import TorchVariant


TORCH_INDEX_URLS: dict[TorchVariant, str] = {
    TorchVariant.cpu: "https://download.pytorch.org/whl/cpu",
    TorchVariant.cu121: "https://download.pytorch.org/whl/cu121",
    TorchVariant.cu124: "https://download.pytorch.org/whl/cu124",
}


def torch_install_command(python_exe: str, variant: TorchVariant) -> list[str]:
    return [
        python_exe,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "torch",
        "torchaudio",
        "--index-url",
        TORCH_INDEX_URLS[variant],
    ]


def qwen_install_command(python_exe: str) -> list[str]:
    return [
        python_exe,
        "-m",
        "pip",
        "install",
        "--upgrade",
        "qwen-tts",
        "transformers",
        "accelerate",
        "soundfile",
    ]

