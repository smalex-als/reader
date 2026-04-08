# Scanned Book Reader

A Vite + React + TypeScript single-page app for browsing scanned books, paired with a lightweight
Node/Express server for OCR and PDF tooling.

## Features

- Book picker with page navigation, zoom, rotate, fit, invert, brightness/contrast, and pan.
- OCR page text modal with `Deepseek OCR` / `OpenAI` regeneration and batch OCR queue.
- OCR block overlays on page images with click-to-stream playback.
- OCR block edit mode to exclude/include blocks from speech directly on the page; exclusions are saved back into the OCR text file.
- Page dimming controls for OCR overlays, including toolbar toggle and adjustable dim level.
- Audio playback (reuse existing MP3s or generate with OpenAI).
- Streaming audio via WebSocket (external stream server).
- Bookmarks, table of contents (manual or generated), and print-to-PDF.
- PDF upload to convert scans into a new book (requires `pdftoppm`).

## Quick start

```
npm install
node server.js
npm run dev
```

The app runs on Vite (default `http://localhost:5173`), and the API/static server runs on
`http://localhost:3000`.

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
  <bookId>/
    page-001.jpg
    page-001.txt
    page-001.mp3
    bookmarks.txt
    toc.json
```

- Books are directories under `data/`.
- Supported page images: png, jpg, jpeg, gif, webp.
- OCR text uses `.txt`, and audio uses `.mp3`.
- `bookmarks.txt` is a JSON array of `{ page, image, label }`.
- `toc.json` is a JSON array of `{ title, page }` where `page` is 0-based.

## Configuration

Server environment variables:

- `OPENAI_API_KEY` (required for OpenAI OCR, TOC generation, and TTS audio generation)
- `OCR_DEEPSEEK_HOST` (base URL for Deepseek OCR server; default `http://myserver.home:11434`)
- `OCR_DEEPSEEK_MODEL` (default `deepseek-ocr`)
- `OCR_DEEPSEEK_PROMPT` (default `\n<|grounding|>Convert the document to markdown.`)
- `HOST` (default `0.0.0.0`)
- `PORT` (default `3000`)
- `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to enable HTTPS
- `STREAM_SERVER` (WebSocket server for streaming audio; defaults to `VITE_STREAM_SERVER`)
- `STREAM_VOICE` (default stream voice id; defaults to `VITE_STREAM_VOICE`)
- `MAX_UPLOAD_MB` (max upload size for multipart uploads like PDF import; default `300`)

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
- Prompt text lives in `server/prompts/` for easy editing and review.
- PDF upload uses `pdftoppm` from Poppler. Install it before using `/api/upload/pdf`.

## Useful hotkeys

- `T`: open/close `Page Text`
- `O`: run OCR for the current page in the background
- `E`: toggle OCR block edit mode on the page
- `S`: start/stop stream audio
- `P`: play/stop page audio
- `G`: focus the page number input
- `F`: toggle fullscreen
- `?`: open help

## API highlights

- `GET /api/books`
- `DELETE /api/books/:id`
- `GET /api/books/:id/manifest`
- `POST /api/books/text`
- `POST /api/books/text/empty`
- `POST /api/books/:id/chapters`
- `POST /api/books/:id/chapters/empty`
- `POST /api/books/:id/chapters/:chapter/audio`
- `GET /api/page-text?image=/data/...`
- `POST /api/page-audio`
- `POST /api/upload/pdf`
- `POST /api/books/:id/print`
- `GET/POST/DELETE /api/books/:id/bookmarks`
- `GET/POST /api/books/:id/toc`, `POST /api/books/:id/toc/generate`
