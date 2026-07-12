# Nemotron ASR service

GPU-backed asynchronous transcription service used by YouTube chapter imports.

- `GET /health` reports service readiness.
- `POST /jobs` accepts `{ id, audio, output, language }`; paths are relative to the shared `/data` volume.
- `GET /jobs/:id` returns `queued`, `running`, `completed`, or `failed`.

The Docker Compose `asr` profile mounts Reader's `data/` directory at `/data` and keeps the model cache in the `nemotron-cache` volume. The host requires NVIDIA Container Toolkit.

After a job, Nemotron is removed from GPU memory by default. Set `NEMOTRON_ASR_KEEP_MODEL_LOADED=true` to keep it loaded between jobs.
