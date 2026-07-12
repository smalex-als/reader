from __future__ import annotations

import json
import gc
import subprocess
import tempfile
from pathlib import Path


def split_to_wav_chunks(audio_path: Path, chunk_seconds: int, temp_dir: Path) -> list[Path]:
    chunk_pattern = temp_dir / "chunk_%05d.wav"
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(audio_path),
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
    ]
    if chunk_seconds > 0:
        command.extend(
            [
                "-f",
                "segment",
                "-segment_time",
                str(chunk_seconds),
                "-reset_timestamps",
                "1",
                str(chunk_pattern),
            ]
        )
    else:
        command.append(str(temp_dir / f"{audio_path.stem}.16k.wav"))
    subprocess.run(command, check=True)
    chunks = sorted(temp_dir.glob("chunk_*.wav")) or sorted(temp_dir.glob("*.16k.wav"))
    if not chunks:
        raise RuntimeError(f"ffmpeg did not create WAV chunks for {audio_path}")
    return chunks


def get_duration_seconds(audio_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-hide_banner",
            "-loglevel",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(audio_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def normalize_transcription(result: object) -> str:
    if isinstance(result, tuple):
        result = result[0]
    if isinstance(result, list):
        if not result:
            return ""
        result = result[0]
    return str(getattr(result, "text", result)).strip()


class NemotronTranscriber:
    def __init__(self, model_name: str, device_name: str, precision: str, chunk_seconds: int) -> None:
        self.model_name = model_name
        self.device_name = device_name
        self.precision = precision
        self.chunk_seconds = chunk_seconds
        self._model = None

    def _load_model(self):
        if self._model is not None:
            return self._model
        import torch
        import nemo.collections.asr as nemo_asr

        if self.device_name == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA is not available in the Nemotron ASR container")
        device = torch.device(self.device_name)
        model = nemo_asr.models.ASRModel.from_pretrained(model_name=self.model_name).to(device)
        if self.device_name == "cuda" and self.precision == "fp16":
            model = model.half()
        model.eval()
        self._model = model
        return model

    def transcribe(self, audio_path: Path, output_path: Path, language: str) -> int:
        model = self._load_model()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_output = output_path.with_name(f".{output_path.name}.tmp")
        with tempfile.TemporaryDirectory(prefix="nemotron-asr-") as temp_name:
            temp_dir = Path(temp_name)
            chunks = split_to_wav_chunks(audio_path, self.chunk_seconds, temp_dir)
            manifest_path = temp_dir / "manifest.json"
            rows = []
            for wav_path in chunks:
                rows.append(
                    json.dumps(
                        {
                            "audio_filepath": str(wav_path),
                            "duration": get_duration_seconds(wav_path),
                            "text": "",
                            "target_lang": language,
                            "lang": language,
                            "language": language,
                            "prompt_mode": "auto" if language == "auto" else "langID",
                        },
                        ensure_ascii=False,
                    )
                )
            manifest_path.write_text("\n".join(rows) + "\n", encoding="utf-8")
            result = model.transcribe(
                [str(manifest_path)],
                batch_size=1,
                target_lang=language,
                verbose=True,
            )
            if isinstance(result, tuple):
                result = result[0]
            if not isinstance(result, list):
                result = [result]
            transcript = "\n".join(
                text for item in result if (text := normalize_transcription(item))
            ).strip()
        if not transcript:
            raise RuntimeError("Nemotron returned an empty transcript")
        temporary_output.write_text(transcript + "\n", encoding="utf-8")
        temporary_output.replace(output_path)
        return output_path.stat().st_size

    def unload(self) -> None:
        if self._model is None:
            return
        self._model = None
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
