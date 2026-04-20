#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEXT_FILE="${1:-$ROOT_DIR/scripts/test-stream-audio-wav-stream.txt}"
ENDPOINT="${STREAM_PCM_ENDPOINT:-http://localhost:3000/api/stream-audio/pcm}"
VOICE="${STREAM_PCM_VOICE:-alloy}"
SAMPLE_RATE="${STREAM_PCM_SAMPLE_RATE:-24000}"

if [[ ! -f "$TEXT_FILE" ]]; then
  echo "Text file not found: $TEXT_FILE" >&2
  exit 1
fi

if command -v ffplay >/dev/null 2>&1; then
  PLAYER=(ffplay -autoexit -nodisp -f s16le -ar "$SAMPLE_RATE" -ch_layout mono -)
elif command -v mpv >/dev/null 2>&1; then
  PLAYER=(mpv --no-video --demuxer=rawaudio --demuxer-rawaudio-format=s16le --demuxer-rawaudio-rate="$SAMPLE_RATE" --demuxer-rawaudio-channels=1 -)
else
  echo "Neither ffplay nor mpv is installed." >&2
  exit 1
fi

json_payload() {
  python - "$TEXT_FILE" "$VOICE" <<'PY'
import json
import pathlib
import sys

text_path = pathlib.Path(sys.argv[1])
voice = sys.argv[2]
text = text_path.read_text(encoding="utf-8")
print(json.dumps({"voice": voice, "text": text}))
PY
}

echo "Endpoint: $ENDPOINT"
echo "Text file: $TEXT_FILE"
echo "Voice: $VOICE"
echo "Sample rate: $SAMPLE_RATE"
echo "Player: ${PLAYER[*]}"
echo "Starting streaming pcm test..."

json_payload | curl -sS \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json' \
  --data-binary @- | "${PLAYER[@]}"
