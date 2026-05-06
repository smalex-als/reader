from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .cli import SyncMFAError, SyncOptions, sync_subtitles


DATA_DIR = Path(os.environ.get("SYNC_SUBTITLES_DATA_DIR", "/data")).resolve()
HOST = os.environ.get("SYNC_SUBTITLES_HOST", "0.0.0.0")
PORT = int(os.environ.get("SYNC_SUBTITLES_PORT", "3100"))
MAX_BODY_BYTES = int(os.environ.get("SYNC_SUBTITLES_MAX_BODY_BYTES", "1048576"))


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


def data_relative(path: Path) -> str:
    return path.resolve().relative_to(DATA_DIR).as_posix()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def status_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    metadata = field(payload, "statusMetadata", "status_metadata")
    return dict(metadata) if isinstance(metadata, dict) else {}


def write_request_status(payload: dict[str, Any], status: dict[str, Any]) -> None:
    status_value = field(payload, "status", "statusPath", "status_path")
    if status_value is None:
        return

    status_path = resolve_data_path(status_value)
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(
        json.dumps(
            {
                **status_metadata(payload),
                **status,
                "updatedAt": now_iso(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


class SubtitleRequestHandler(BaseHTTPRequestHandler):
    server_version = "sync-subtitles-mfa/0.1"

    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self.send_json(404, {"error": "not found"})
            return
        self.send_json(200, {"status": "ok"})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/generate":
            self.send_json(404, {"error": "not found"})
            return

        payload: dict[str, Any] | None = None
        try:
            payload = self.read_json()
            out_path = self.generate(payload)
        except ValueError as exc:
            if payload is not None:
                self.write_status_safely(payload, {"status": "failed", "completedAt": now_iso(), "error": str(exc)})
            self.send_json(400, {"status": "failed", "error": str(exc)})
            return
        except SyncMFAError as exc:
            if payload is not None:
                self.write_status_safely(payload, {"status": "failed", "completedAt": now_iso(), "error": str(exc)})
            self.send_json(500, {"status": "failed", "error": str(exc)})
            return

        self.write_status_safely(
            payload,
            {
                "status": "completed",
                "completedAt": now_iso(),
                "error": None,
                "out": data_relative(out_path),
            },
        )
        self.send_json(200, {"status": "completed", "out": data_relative(out_path)})

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

    def generate(self, payload: dict[str, Any]) -> Path:
        sentence_mode = str(field(payload, "sentenceMode", "sentence_mode") or "strict")
        if sentence_mode not in {"balanced", "strict"}:
            raise ValueError("sentenceMode must be 'balanced' or 'strict'")

        options = SyncOptions(
            audio=resolve_data_path(field(payload, "audio")),
            text=resolve_data_path(field(payload, "text")),
            out=resolve_data_path(field(payload, "out")),
            language=str(field(payload, "language") or "english_us_arpa"),
            max_line_chars=parse_int(field(payload, "maxLineChars", "max_line_chars"), 95),
            sentence_mode=sentence_mode,
            skip_validate=parse_bool(field(payload, "skipValidate", "skip_validate"), False),
            beam=parse_int(field(payload, "beam"), 100),
            retry_beam=parse_int(field(payload, "retryBeam", "retry_beam"), 400),
        )
        return sync_subtitles(options)

    def send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_status_safely(self, payload: dict[str, Any], status: dict[str, Any]) -> None:
        try:
            write_request_status(payload, status)
        except Exception as exc:
            print(f"failed to write subtitle status: {exc}", flush=True)

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
