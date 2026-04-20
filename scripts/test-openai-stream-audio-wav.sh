#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEXT_FILE="${1:-$ROOT_DIR/scripts/test-stream-audio-wav-stream.txt}"
VOICE="${OPENAI_STREAM_VOICE:-alloy}"
MODEL="${OPENAI_STREAM_MODEL:-gpt-4o-mini-tts}"
FORMAT="${OPENAI_STREAM_FORMAT:-wav}"

if [[ ! -f "$TEXT_FILE" ]]; then
  echo "Text file not found: $TEXT_FILE" >&2
  exit 1
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set." >&2
  exit 1
fi

if command -v ffplay >/dev/null 2>&1; then
  PLAYER=(ffplay -autoexit -nodisp -loglevel warning -)
elif command -v mpv >/dev/null 2>&1; then
  PLAYER=(mpv --no-video -)
else
  echo "Neither ffplay nor mpv is installed." >&2
  exit 1
fi

json_payload() {
  python - "$TEXT_FILE" "$VOICE" "$MODEL" "$FORMAT" <<'PY'
import json
import pathlib
import sys

text_path = pathlib.Path(sys.argv[1])
voice = sys.argv[2]
model = sys.argv[3]
response_format = sys.argv[4]
text = text_path.read_text(encoding="utf-8")
print(json.dumps({
    "model": model,
    "voice": voice,
    "response_format": response_format,
    "input": text
}))
PY
}

echo "Text file: $TEXT_FILE"
echo "Voice: $VOICE"
echo "Model: $MODEL"
echo "Format: $FORMAT"
echo "Player: ${PLAYER[*]}"
echo "Starting OpenAI streaming wav test..."

json_payload | curl -sS \
  https://api.openai.com/v1/audio/speech \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H 'Content-Type: application/json' \
  --data-binary @- | "${PLAYER[@]}"
