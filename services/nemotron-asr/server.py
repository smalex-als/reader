from __future__ import annotations

import json
import os
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from transcribe import NemotronTranscriber


DATA_DIR = Path(os.environ.get("NEMOTRON_ASR_DATA_DIR", "/data")).resolve()
HOST = os.environ.get("NEMOTRON_ASR_HOST", "0.0.0.0")
PORT = int(os.environ.get("NEMOTRON_ASR_PORT", "3300"))
MODEL = os.environ.get("NEMOTRON_ASR_MODEL", "nvidia/nemotron-3.5-asr-streaming-0.6b")
DEVICE = os.environ.get("NEMOTRON_ASR_DEVICE", "cuda")
PRECISION = os.environ.get("NEMOTRON_ASR_PRECISION", "fp16")
CHUNK_SECONDS = int(os.environ.get("NEMOTRON_ASR_CHUNK_SECONDS", "600"))
MAX_BODY_BYTES = int(os.environ.get("NEMOTRON_ASR_MAX_BODY_BYTES", "65536"))
KEEP_MODEL_LOADED = os.environ.get("NEMOTRON_ASR_KEEP_MODEL_LOADED", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def resolve_data_path(value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("path must be a non-empty string")
    raw = Path(value)
    resolved = raw.resolve() if raw.is_absolute() else (DATA_DIR / raw).resolve()
    try:
        resolved.relative_to(DATA_DIR)
    except ValueError as exc:
        raise ValueError(f"path must stay under {DATA_DIR}") from exc
    return resolved


def timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


@dataclass
class Job:
    id: str
    audio: str
    output: str
    language: str
    status: str = "queued"
    createdAt: str = field(default_factory=timestamp)
    startedAt: str | None = None
    completedAt: str | None = None
    error: str | None = None
    outputBytes: int | None = None


class JobQueue:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        self.order: list[str] = []
        self.condition = threading.Condition()
        self.transcriber = NemotronTranscriber(MODEL, DEVICE, PRECISION, CHUNK_SECONDS)
        threading.Thread(target=self._work, name="nemotron-asr-worker", daemon=True).start()

    def enqueue(self, payload: dict[str, Any]) -> Job:
        audio = str(payload.get("audio", "")).strip()
        output = str(payload.get("output", "")).strip()
        language = str(payload.get("language", "auto")).strip() or "auto"
        audio_path = resolve_data_path(audio)
        output_path = resolve_data_path(output)
        if not audio_path.is_file():
            raise ValueError(f"audio file not found: {audio}")
        if output_path.suffix.lower() != ".txt":
            raise ValueError("output must be a .txt file")
        requested_id = str(payload.get("id", "")).strip()
        job_id = requested_id[:120] if requested_id else uuid.uuid4().hex
        with self.condition:
            existing = self.jobs.get(job_id)
            if existing:
                if existing.status == "failed":
                    existing.status = "queued"
                    existing.startedAt = None
                    existing.completedAt = None
                    existing.error = None
                    existing.outputBytes = None
                    self.condition.notify()
                return existing
            job = Job(id=job_id, audio=audio, output=output, language=language)
            self.jobs[job.id] = job
            self.order.append(job.id)
            self.condition.notify()
            return job

    def get(self, job_id: str) -> Job | None:
        with self.condition:
            return self.jobs.get(job_id)

    def _work(self) -> None:
        while True:
            with self.condition:
                job = next(
                    (self.jobs[job_id] for job_id in self.order if self.jobs[job_id].status == "queued"),
                    None,
                )
                while job is None:
                    self.condition.wait()
                    job = next(
                        (self.jobs[job_id] for job_id in self.order if self.jobs[job_id].status == "queued"),
                        None,
                    )
                job.status = "running"
                job.startedAt = timestamp()
            try:
                job.outputBytes = self.transcriber.transcribe(
                    resolve_data_path(job.audio),
                    resolve_data_path(job.output),
                    job.language,
                )
                job.status = "completed"
            except Exception as exc:  # noqa: BLE001 - errors are exposed as job status
                job.status = "failed"
                job.error = f"{type(exc).__name__}: {exc}"
                print(f"Nemotron ASR job failed {job.id}: {job.error}", flush=True)
            finally:
                job.completedAt = timestamp()
                if not KEEP_MODEL_LOADED:
                    self.transcriber.unload()


QUEUE = JobQueue()


class Handler(BaseHTTPRequestHandler):
    server_version = "nemotron-asr/1.0"

    def do_GET(self) -> None:
        pathname = urlparse(self.path).path
        if pathname == "/health":
            self.send_json(200, {"status": "ok", "model": MODEL, "device": DEVICE})
            return
        if pathname.startswith("/jobs/"):
            job = QUEUE.get(pathname.removeprefix("/jobs/").strip("/"))
            if not job:
                self.send_json(404, {"error": "Job not found"})
                return
            self.send_json(200, {"job": asdict(job)})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/jobs":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("invalid request size")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("JSON object is required")
            job = QUEUE.enqueue(payload)
            self.send_json(202, {"job": asdict(job)})
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc)})

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Nemotron ASR listening on http://{HOST}:{PORT}; model={MODEL}; device={DEVICE}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
