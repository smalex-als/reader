# Scanned Book Reader

A Vite + React + TypeScript single-page reader for scanned books and text books, paired with a
Node/Express server for OCR, audio, chapter tools, search, and image enhancement.

## Features

- Book picker with page navigation, zoom, rotate, fit, invert, brightness/contrast, and pan.
- Book picker state shared through the server: recent books, saved books, last page per book, and sort mode sync across devices.
- OCR page text modal with `Deepseek OCR` / `OpenAI` regeneration and batch OCR queue.
- OCR block overlays on page images with click-to-stream playback.
- OCR block edit mode to exclude/include blocks from speech directly on the page; exclusions are saved back into the OCR text file.
- Page dimming controls for OCR overlays, including toolbar toggle and adjustable dim level.
- Page audio playback with `OpenAI TTS` and `xAI TTS`.
- Streaming audio via WebSocket (external stream server), including a floating stream control bubble.
- Backend streaming audio test endpoints for raw PCM and experimental streaming WAV output.
- Chapter text view with versioning: create prompt-based text variants, switch between versions, and generate chapter MP3s with the default stream provider or `xAI`.
- Text chapters can be created from a YouTube URL; `yt-dlp` downloads an MP3 through BullMQ, then OpenAI `gpt-transcribe` replaces the temporary URL body with a transcript. The chapter shows persistent download/transcription/completed/failed status, playback, and retry controls.
- Redis/BullMQ background processing for long-running chapter MP3 generation, with retries and durable queued work.
- Study tools per chapter: `Quiz`, `Vocabulary`, and `Memory Card`.
- Unit study sets: turn a chapter into standalone topic-based units, open topics by URL, stream topic paragraphs, mark topics read/unread, and create quizzes for individual topics.
- Listening dashboard backed by `.stream-history.log`, including grouped sessions, top books/chapters, and navigation back into the book.
- Image preview modal with AI enhancement using OpenAI image editing for illustration-style rerenders.
- Bookmarks, table of contents (manual or generated), detailed TOC support, search, and print-to-PDF.
- PDF upload to convert scans into a new book (requires `pdftoppm`).

## Quick start

```
npm install
node server.js
npm run dev
```

The app runs on Vite (default `http://localhost:5173`), and the API/static server runs on
`http://localhost:3000`.

Without `REDIS_URL`, long-running jobs use the existing in-process fallback.

## Local Docker

The shortest way to build and start Reader with Redis is:

```bash
cd /Users/smalex/jsprojects/reader
make local-up
```

Then open `http://localhost:3000`, or run `make local-open`.

Useful Make targets:

```bash
make local-ps       # container status
make local-logs     # follow Reader and Redis logs
make local-health   # verify the API and BullMQ mode
make local-restart  # restart Reader and Redis
make local-stop     # stop containers without removing them
make local-down     # stop and remove containers
make check          # lint, tests, and production build
```

Run `make help` to print the available commands. To use another host port:

```bash
READER_PORT=3100 make local-up
```

The local Docker profile connects chapter streaming audio to
`http://192.168.1.174:3005`. Override it when needed:

```bash
LOCAL_STREAM_SERVER=http://host.docker.internal:3005 make local-up
```

The equivalent full Docker Compose command is:

```bash
cd /Users/smalex/jsprojects/reader

docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  up --build -d redis reader
```

Open the app at `http://localhost:3000`. Set `READER_PORT` to publish a different host port.

Check container status:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  ps
```

Follow Reader and Redis logs:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  logs -f reader redis
```

Stop and remove the local containers:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.local.yml \
  down
```

The Redis data remains in the named Docker volume. Add `-v` to `down` only when you intentionally
want to delete that queued-job data as well.

## Server deployment

`./deploy-local.sh` is the server deployment entrypoint. It pulls `origin/main`, starts Redis, Reader, and the HTTPS nginx profile, then verifies their health endpoints. The Reader port is not published directly by the server Compose configuration.

Run it from the repository checkout on the server:

```bash
make server-deploy
```

Server stack commands:

```bash
make server-up       # build and start Redis, Reader, and HTTPS nginx
make server-start    # start existing server containers
make server-ps       # container status
make server-logs     # follow nginx, Reader, and Redis logs
make server-health   # verify both Reader and the external HTTPS proxy
make server-restart  # restart the complete server stack
make server-stop     # stop containers without removing them
make server-down     # stop and remove containers
```

For a production build:

```
npm run build
node server.js
```

The server serves `dist/` if it exists, otherwise it serves the project root.

## Server layout

- `server/index.js`: Express app setup, middleware, routing, error handling.
- `server/routes/`: API route groups (books, media, health).
- `server/lib/`: OCR, audio, PDF, bookmarks, TOC, and path helpers.
- `server/config.js`: server constants and prompts.
- `server/prompts/`: OCR and TOC prompt text files.
- `server.js`: entrypoint that starts the server.

## Data layout

```
data/
  .library-state.json
  .stream-history.log
  .units/
    unit-001/
      manifest.json
      progress.json
      01-topic-title.json
      01-topic-title.quiz.json
  _generated/
  <bookId>/
    page-001.jpg
    page-001.txt
    page-001.mp3
    chapter001.txt
    chapter001.mp3
    chapter001.youtube.json
    bookmarks.txt
    toc.json
    toc.detailed.json
```

- Books are directories under `data/`.
- `.library-state.json` stores shared reader library state (`lastBook`, per-book `lastPages`, `bookMeta`, and `bookSortMode`).
- Supported page images: png, jpg, jpeg, gif, webp.
- OCR text uses `.txt`, and audio uses `.mp3`.
- Generated assets such as enhanced previews and text-audio files are stored under `data/_generated/`.
- `bookmarks.txt` is a JSON array of `{ page, image, label }`.
- `toc.json` is a JSON array of `{ title, page }` where `page` is 0-based.
- `toc.detailed.json` stores subchapter-level entries for finer navigation and logging.
- `.stream-history.log` stores listening history used by the dashboard.
- `.units/` stores standalone unit sets. Each unit set is a `unit-###` directory with a `manifest.json`, one JSON file per topic, optional topic quizzes beside the topic files using the same filename prefix, and read/unread state in `progress.json`.

## Chapter commands

Chapter Markdown supports a small set of playback directives. A command is a line
that starts with `::` and stands alone as its own Markdown block, meaning it has a
blank line before and after it:

```
The narrator finishes a thought here.

::pause 2s

::note double-check this against the plate on page 114

::voice sara

The next section begins in another voice.

::skip

| Year | Yield |
| ---- | ----- |
| 1801 | 412   |

::say A table of yields from 1801 onwards follows.

::skip-end

::stop

Playback parks here until you press play again.
```

- `::pause <duration>` inserts extra silence after the preceding block during
  streaming playback. Durations accept `2s`, `1.5s`, `500ms`, or a bare number of
  seconds (`::pause 3`). Without an argument it defaults to 1s, and values are
  clamped to 30s.
- `::stop` is a breakpoint rather than silence: playback parks at the following
  block, and the next play press resumes from there.
- `::note <text>` (alias `::comment <text>`) renders as a muted aside in the text
  view and is never spoken.
- `::skip` … `::skip-end` marks a region that still renders normally but is never
  spoken — useful for tables, code and figure captions. An unterminated `::skip`
  runs to the end of the chapter.
- `::say <text>` is the mirror of `::note`: spoken but never rendered. It is
  spoken even inside a `::skip` region, so a spoken summary can sit next to the
  content it stands in for.
- `::voice <name>` switches the narration voice from that point on. The name
  matches a voice id (`en-Sara_woman`), its label (`Sara`), or just the bare name
  (`sara`). A bare `::voice` returns to the voice selected in the reader, and an
  unknown name leaves the current voice alone. The text view marks the switch
  with a small badge on the first block that is actually spoken in the new voice,
  so a `::skip` region or a `::say` line does not take the badge.

Except for `::note`, commands leave no trace in the rendered document. Starting
playback from the middle of a chapter replays the earlier commands first, so the
voice and any open `::skip` region are still in effect.

A `::` line that sits inside a paragraph is ordinary text, not a command, which
matches how Markdown already treats it as a soft-wrapped line. Unknown command
names are left alone and render as written.

## Configuration

Server environment variables:

- `OPENAI_API_KEY` (required for OpenAI OCR, TOC generation, YouTube `gpt-transcribe`, TTS, and image enhancement)
- `XAI_API_KEY` (required for xAI TTS generation)
- `YANDEX_API_KEY` and `YANDEX_FOLDER_ID` (required for Yandex stream voices)
- `YANDEX_STREAM_VOICES` (comma-separated Yandex stream voices; defaults to `alena,jane,zahar,oksana,ermil,marina`)
- `YANDEX_TTS_LANG`, `YANDEX_TTS_SPEED`, and `YANDEX_TTS_SAMPLE_RATE` (optional Yandex stream voice settings; defaults to `ru-RU`, `1.0`, and `48000`; audio is resampled to the app stream rate)
- `OCR_DEEPSEEK_HOST` (base URL for Deepseek OCR server; default `http://reader.test:11434`)
- `OCR_DEEPSEEK_CONCURRENCY` (max active Deepseek OCR requests; default `1`, so extra requests wait server-side instead of overloading the model)
- `OCR_DEEPSEEK_MODEL` (default `deepseek-ocr`)
- `OCR_DEEPSEEK_PROMPT` (default `\n<|grounding|>Convert the\ndocument to markdown.`)
- `HOST` (default `0.0.0.0`)
- `PORT` (default `3000`)
- `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to enable HTTPS
- `STREAM_SERVER` (WebSocket server for streaming audio; defaults to `VITE_STREAM_SERVER`)
- `STREAM_VOICE` (default stream voice id; defaults to `VITE_STREAM_VOICE`)
- `OCR_TIMEOUT_MS` (timeout for OCR requests in milliseconds; default `20000`. On timeout the server writes an empty page text file and returns empty OCR text.)
- `MAX_UPLOAD_MB` (max upload size for multipart uploads like PDF import; default `300`)
- `REDIS_URL` (enables the BullMQ background queue, for example `redis://localhost:6379`)
- `BACKGROUND_JOB_CONCURRENCY` (number of long-running jobs processed concurrently; default `1`)
- `YT_DLP_BIN` (yt-dlp executable used by YouTube chapter imports; default `yt-dlp`)
YouTube imports use `gpt-transcribe` and upload the downloaded MP3 to OpenAI; recordings above the API file-size limit are converted into 15-minute mono chunks and transcribed sequentially.

Front-end environment variables:

- `VITE_STREAM_SERVER` (WebSocket server for streaming audio)
- `VITE_STREAM_VOICE` (default stream voice id)

Notes:

- The current page text flow supports two OCR engines from the UI:
  - `OpenAI` uses the existing OpenAI OCR path.
  - `Deepseek OCR` calls `${OCR_DEEPSEEK_HOST}/api/generate`.
- OCR prompt files live in `server/prompts/`. You can add model- or backend-specific prompts using
  `text.<model>.txt` or `text.<backend>.txt` (sanitized to lowercase; non-alphanumerics become `_`), with
  `text.txt` as the fallback.
- OCR text files may contain coordinate-tagged blocks such as `<|ref|>...<|det|>[[...]]...`. Blocks marked
  with `<|speech_removed|><|/speech_removed|>` stay in the file but are skipped during speech playback.
- Text books can be created by uploading chapter files; chapters are stored as `chapter###.txt` and TOC
  entries are created automatically.
- Chapter text supports prompt-based derived versions. The base chapter text is preserved; derived versions can
  be created and deleted from the text presentation UI.
- Unit sets are generated from the text view with `Create Unit`. The chapter content is adapted using
  `server/prompts/chapter-units.txt`; each topic is saved as its own JSON file.
- Prompt text lives in `server/prompts/` for easy editing and review.
- PDF upload uses `pdftoppm` from Poppler. Install it before using `/api/upload/pdf`.
- Image enhancement in the preview window uses OpenAI image editing and currently targets illustration-style output.

## Useful hotkeys

- `1`, `2`, `3`: switch between page / scroll / text view
- `0`: open listening dashboard
- `T`: open/close `Page Text`
- `O`: run OCR for the current page in the background
- `E`: toggle OCR block edit mode on the page
- `S`: start/stop stream audio
- `P`: play/stop `OpenAI TTS`
- `X`: play/stop `xAI TTS`
- `7`: open `Quiz`
- `8`: open `Vocabulary`
- `G`: focus the page number input
- `F`: toggle fullscreen
- `?`: open help

## Streaming audio test scripts

These scripts are intended for backend verification and latency comparison.

- `scripts/test-stream-audio-wav-stream.txt`: shared long-form sample text for stream tests.
- `scripts/test-stream-audio-wav-stream.sh`: exercises `POST /api/stream-audio/wav` and plays the response through `ffplay` or `mpv`.
- `scripts/test-stream-audio-pcm.sh`: exercises `POST /api/stream-audio/pcm` and plays raw PCM with the correct player flags.
- `scripts/test-openai-stream-audio-wav.sh`: sends the same sample text directly to OpenAI TTS and plays the result for comparison with the local streaming backend.

Examples:

```bash
./scripts/test-stream-audio-pcm.sh
STREAM_WAV_ENDPOINT='http://localhost:3000/api/stream-audio/wav' ./scripts/test-stream-audio-wav-stream.sh
./scripts/test-openai-stream-audio-wav.sh
```

## API highlights

Library state:
- `GET/PUT /api/library/state`

Books:
- `GET /api/books`
- `GET /api/books/cards`
- `GET/PUT /api/books/:id/meta`
- `DELETE /api/books/:id`
- `GET /api/books/:id/manifest`
- `POST /api/books/text`
- `POST /api/books/text/empty`
- `POST /api/upload/pdf`
- `POST /api/books/:id/print`

Chapters and narration:
- `POST /api/books/:id/chapters`
- `POST /api/books/:id/chapters/empty`
- `PUT /api/books/:id/chapters/:chapter`
- `DELETE /api/books/:id/chapters/:chapter`
- `POST /api/books/:id/chapters/generate`
- `POST /api/books/:id/chapters/:chapter/narration`
- `GET /api/books/:id/chapters/:chapter/text-versions`
- `POST /api/books/:id/chapters/:chapter/text-versions`
- `DELETE /api/books/:id/chapters/:chapter/text-versions/:versionId`
- `POST /api/books/:id/chapters/:chapter/audio`
- `GET /api/books/:id/chapters/:chapter/audio/status`
- `POST /api/books/:id/chapters/:chapter/audio/cancel`
- `GET /api/books/:id/audio`
- `GET/POST /api/books/:id/chapters/:chapter/quiz`
- `GET/POST /api/books/:id/chapters/:chapter/vocabulary`
- `GET/POST /api/books/:id/chapters/:chapter/memory-card`

Units:
- `GET /api/units`
- `POST /api/units`
- `PATCH /api/units/:unitId/topics/:topicId`
- `GET/POST /api/units/:unitId/topics/:topicId/quiz`

Page media:
- `GET /api/page-text?image=/data/...`
- `POST /api/page-audio`
- `GET /api/page-audio/stream`
- `POST /api/text-audio`
- `POST /api/text-audio/stream`
- `POST /api/stream-audio/pcm`
- `POST /api/stream-audio/wav` — not used by the app; manual/backend test only, experimental streaming WAV
- `GET /api/books/:id/image-preview?...`
- `POST /api/books/:id/image-preview/enhance`

Bookmarks and table of contents:
- `GET/POST/DELETE /api/books/:id/bookmarks`
- `GET/POST /api/books/:id/toc`
- `POST /api/books/:id/toc/generate`

Search and health:
- `GET /api/books/:id/search`
- `POST /api/books/:id/search/index`
- `GET /api/stream-history/dashboard`
- `GET /api/health` — reports `backgroundJobs: bullmq` when Redis is configured, otherwise `inline`
