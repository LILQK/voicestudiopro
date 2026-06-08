from __future__ import annotations

import json
import sys
from pathlib import Path


def _load_voice_clone_prompt(path: str):
    import torch
    from qwen_tts.inference.qwen3_tts_model import VoiceClonePromptItem

    prompt = torch.load(path, map_location="cpu", weights_only=False)
    if isinstance(prompt, dict) and "items" in prompt:
        prompt = prompt["items"]

    if isinstance(prompt, list):
        normalized = []
        for item in prompt:
            if isinstance(item, VoiceClonePromptItem):
                normalized.append(item)
                continue
            if isinstance(item, dict):
                normalized.append(
                    VoiceClonePromptItem(
                        ref_code=item.get("ref_code"),
                        ref_spk_embedding=item["ref_spk_embedding"],
                        x_vector_only_mode=bool(item.get("x_vector_only_mode", False)),
                        icl_mode=bool(item.get("icl_mode", True)),
                        ref_text=item.get("ref_text"),
                    )
                )
                continue
            normalized.append(item)
        return normalized

    return prompt


def main() -> int:
    payload_path = Path(sys.argv[1])
    payload = json.loads(payload_path.read_text(encoding="utf-8"))

    import torch
    import soundfile as sf
    from qwen_tts import Qwen3TTSModel

    use_cuda = torch.cuda.is_available()
    dtype = torch.bfloat16 if use_cuda else torch.float32
    device_map = "cuda:0" if use_cuda else "cpu"

    model = Qwen3TTSModel.from_pretrained(
        payload["model_id"],
        device_map=device_map,
        dtype=dtype,
        attn_implementation=None,
    )

    if payload.get("task") == "create_voice_prompt":
        prompt_items = model.create_voice_clone_prompt(
            ref_audio=payload["reference_audio_path"],
            ref_text=payload["reference_text"],
            x_vector_only_mode=payload.get("x_vector_only_mode", False),
        )
        torch.save(prompt_items, payload["output_path"])
        return 0

    voice_clone_prompt = _load_voice_clone_prompt(payload["voice_prompt_path"])
    wavs, sample_rate = model.generate_voice_clone(
        text=payload["text"],
        language=payload.get("language", "Auto"),
        voice_clone_prompt=voice_clone_prompt,
    )
    output_path = Path(payload["output_path"])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, wavs[0], sample_rate)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
