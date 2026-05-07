from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field as dataclass_field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

from .cli import SyncMFAError, SyncOptions, sync_subtitles


DATA_DIR = Path(os.environ.get("SYNC_SUBTITLES_DATA_DIR", "/data")).resolve()
HOST = os.environ.get("SYNC_SUBTITLES_HOST", "0.0.0.0")
PORT = int(os.environ.get("SYNC_SUBTITLES_PORT", "3100"))
MAX_BODY_BYTES = int(os.environ.get("SYNC_SUBTITLES_MAX_BODY_BYTES", "1048576"))
MAX_JOBS = int(os.environ.get("SYNC_SUBTITLES_MAX_JOBS", "200"))

JobStatus = Literal["queued", "running", "completed", "failed"]


@dataclass
class SubtitleJob:
    id: str
    payload: dict[str, Any]
    filename: str
    status: JobStatus = "queued"
    created_at: float = dataclass_field(default_factory=time.time)
    updated_at: float = dataclass_field(default_factory=time.time)
    started_at: float | None = None
    completed_at: float | None = None
    error: str | None = None
    result: bytes | None = None
    result_bytes: int | None = None
    logs: list[dict[str, Any]] = dataclass_field(default_factory=list)


def resolve_data_path(value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("path value must be a non-empty string")

    raw_path = Path(value)
    resolved = raw_path.resolve() if raw_path.is_absolute() else (DATA_DIR / raw_path).resolve()
    try:
        resolved.relative_to(DATA_DIR)
    except ValueError as exc:
        raise ValueError(f"path must stay under {DATA_DIR}: {value}") from exc
    return resolved


def parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return bool(value)


def parse_int(value: Any, default: int) -> int:
    if value is None or value == "":
        return default
    return int(value)


def field(payload: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in payload:
            return payload[name]
    return None


def now_iso(timestamp: float | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp or time.time()))


class SubtitleJobQueue:
    def __init__(self) -> None:
        self.jobs: dict[str, SubtitleJob] = {}
        self.order: list[str] = []
        self.lock = threading.Lock()
        self.condition = threading.Condition(self.lock)
        self.worker = threading.Thread(target=self._run_forever, name="sync-subtitles-worker", daemon=True)
        self.worker.start()

    def enqueue(self, payload: dict[str, Any]) -> SubtitleJob:
        requested_out = field(payload, "out")
        filename = Path(requested_out).name if isinstance(requested_out, str) and requested_out.strip() else "subtitles.srt"
        job = SubtitleJob(id=f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}", payload=payload, filename=filename)
        self._add_log(job, "Queued")
        with self.condition:
            self.jobs[job.id] = job
            self.order.append(job.id)
            self._trim_completed_locked()
            self.condition.notify()
        return job

    def list_jobs(self) -> list[SubtitleJob]:
        with self.lock:
            return [self.jobs[job_id] for job_id in self.order if job_id in self.jobs]

    def get(self, job_id: str) -> SubtitleJob | None:
        with self.lock:
            return self.jobs.get(job_id)

    def _run_forever(self) -> None:
        while True:
            with self.condition:
                job = self._next_queued_locked()
                while job is None:
                    self.condition.wait()
                    job = self._next_queued_locked()
                job.status = "running"
                job.started_at = time.time()
                job.updated_at = job.started_at
                self._add_log(job, "Started")
            self._run_job(job)

    def _next_queued_locked(self) -> SubtitleJob | None:
        for job_id in self.order:
            job = self.jobs.get(job_id)
            if job and job.status == "queued":
                return job
        return None

    def _run_job(self, job: SubtitleJob) -> None:
        try:
            srt_bytes, _filename = generate_subtitles(job.payload, job.filename)
            with self.lock:
                job.status = "completed"
                job.result = srt_bytes
                job.result_bytes = len(srt_bytes)
                job.completed_at = time.time()
                job.updated_at = job.completed_at
                self._add_log(job, "Completed", {"responseBytes": job.result_bytes})
        except Exception as exc:  # noqa: BLE001 - convert worker errors into job status
            with self.lock:
                job.status = "failed"
                job.error = f"{type(exc).__name__}: {exc}"
                if isinstance(exc, SyncMFAError):
                    job.error = str(exc)
                job.completed_at = time.time()
                job.updated_at = job.completed_at
                self._add_log(job, "Failed", {"error": job.error})
            print(f"sync-subtitles job failed {job.id}: {job.error}", flush=True)

    def _add_log(self, job: SubtitleJob, message: str, details: dict[str, Any] | None = None) -> None:
        job.logs = [
            *job.logs,
            {
                "timestamp": now_iso(),
                "message": message,
                "details": details,
            },
        ][-100:]

    def _trim_completed_locked(self) -> None:
        removable = [
            job_id
            for job_id in self.order
            if (job := self.jobs.get(job_id)) and job.status in {"completed", "failed"}
        ]
        while len(self.order) > MAX_JOBS and removable:
            job_id = removable.pop(0)
            self.jobs.pop(job_id, None)
            self.order.remove(job_id)


JOB_QUEUE = SubtitleJobQueue()


def build_options(payload: dict[str, Any], out_path: Path) -> SyncOptions:
    sentence_mode = str(field(payload, "sentenceMode", "sentence_mode") or "strict")
    if sentence_mode not in {"balanced", "strict"}:
        raise ValueError("sentenceMode must be 'balanced' or 'strict'")

    return SyncOptions(
        audio=resolve_data_path(field(payload, "audio")),
        text=resolve_data_path(field(payload, "text")),
        out=out_path,
        language=str(field(payload, "language") or "english_us_arpa"),
        max_line_chars=parse_int(field(payload, "maxLineChars", "max_line_chars"), 95),
        sentence_mode=sentence_mode,
        skip_validate=parse_bool(field(payload, "skipValidate", "skip_validate"), False),
        beam=parse_int(field(payload, "beam"), 100),
        retry_beam=parse_int(field(payload, "retryBeam", "retry_beam"), 400),
    )


def generate_subtitles(payload: dict[str, Any], filename: str | None = None) -> tuple[bytes, str]:
    requested_out = field(payload, "out")
    output_filename = "subtitles.srt"
    if isinstance(requested_out, str) and requested_out.strip():
        output_filename = Path(requested_out).name
    if filename:
        output_filename = filename
    with tempfile.TemporaryDirectory(prefix="sync-subtitles-http-") as temp_dir:
        out_path = Path(temp_dir) / output_filename
        sync_subtitles(build_options(payload, out_path))
        return out_path.read_bytes(), output_filename


def public_job(job: SubtitleJob, *, include_payload: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": job.id,
        "status": job.status,
        "filename": job.filename,
        "createdAt": now_iso(job.created_at),
        "startedAt": now_iso(job.started_at) if job.started_at else None,
        "completedAt": now_iso(job.completed_at) if job.completed_at else None,
        "updatedAt": now_iso(job.updated_at),
        "error": job.error,
        "resultBytes": job.result_bytes,
        "logs": job.logs,
    }
    if include_payload:
        payload["payload"] = job.payload
    return payload


class SubtitleRequestHandler(BaseHTTPRequestHandler):
    server_version = "sync-subtitles-mfa/0.1"

    def do_GET(self) -> None:
        pathname = urlparse(self.path).path
        if pathname == "/health":
            self.send_json(200, {"status": "ok"})
            return
        if pathname == "/jobs":
            self.send_json(200, {"jobs": [public_job(job) for job in JOB_QUEUE.list_jobs()]})
            return
        if pathname.startswith("/jobs/"):
            parts = pathname.strip("/").split("/")
            job = JOB_QUEUE.get(parts[1]) if len(parts) >= 2 else None
            if job is None:
                self.send_json(404, {"error": "job not found"})
                return
            if len(parts) == 3 and parts[2] == "result":
                if job.status != "completed" or job.result is None:
                    self.send_json(409, {"status": job.status, "error": "job result is not ready"})
                    return
                self.send_file(200, job.result, job.filename)
                return
            if len(parts) == 2:
                self.send_json(200, {"job": public_job(job)})
                return
            self.send_json(404, {"error": "not found"})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self) -> None:
        pathname = urlparse(self.path).path
        if pathname == "/jobs":
            try:
                payload = self.read_json()
                job = JOB_QUEUE.enqueue(payload)
            except ValueError as exc:
                self.send_json(400, {"status": "failed", "error": str(exc)})
                return
            self.send_json(202, {"job": public_job(job)})
            return

        self.send_json(404, {"error": "not found"})

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or "0")
        if length <= 0:
            raise ValueError("request body is required")
        if length > MAX_BODY_BYTES:
            raise ValueError("request body is too large")

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("request body must be valid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("request body must be a JSON object")
        return payload

    def send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, status_code: int, body: bytes, filename: str) -> None:
        self.send_response(status_code)
        self.send_header("content-type", "application/x-subrip; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("content-disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), SubtitleRequestHandler)
    print(f"sync-subtitles-mfa server listening on {HOST}:{PORT}, data_dir={DATA_DIR}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
