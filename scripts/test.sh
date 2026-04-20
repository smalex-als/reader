python - <<'PY' | curl -sS -X POST http://localhost:3000/api/stream-audio/pcm \
  -H 'Content-Type: application/json' \
  --data-binary @- | ffplay -autoexit -nodisp -f s16le -ar 24000 -ch_layout mono -
import json
from pathlib import Path
text = Path("test-stream-audio-wav-stream.txt").read_text(encoding="utf-8")
print(json.dumps({"voice": "alloy", "text": text}))
PY
