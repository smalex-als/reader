# Scanned Book Reader

A Vite + React + TypeScript single-page app for browsing scanned books, paired with a lightweight
Node/Express server for OCR, narration, and PDF tooling.

## Features

- Book picker with page navigation, zoom, rotate, fit, invert, brightness/contrast, and pan.
- OCR page text modal with regeneration and batch OCR queue.
- Narration playback (reuse existing MP3s or generate with OpenAI).
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

## Data layout

```
data/
  <bookId>/
    page-001.jpg
    page-001.txt
    page-001.narration.txt
    page-001.mp3
    bookmarks.txt
    toc.json
```

- Books are directories under `data/`.
- Supported page images: png, jpg, jpeg, gif, webp.
- OCR text uses `.txt`, narration text uses `.narration.txt`, and audio uses `.mp3`.
- `bookmarks.txt` is a JSON array of `{ page, image, label }`.
- `toc.json` is a JSON array of `{ title, page }` where `page` is 0-based.

## Configuration

Server environment variables:

- `OPENAI_API_KEY` (required for OCR if `OCR_BACKEND` is `openai`, narration adaptation, TOC generation,
  and TTS audio generation)
- `HOST` (default `0.0.0.0`)
- `PORT` (default `3000`)
- `HTTPS_KEY_PATH` and `HTTPS_CERT_PATH` to enable HTTPS

Front-end environment variables:

- `VITE_STREAM_SERVER` (WebSocket server for streaming audio)
- `VITE_STREAM_VOICE` (default stream voice id)

Notes:

- OCR backend is configured in `server.js` via `OCR_BACKEND`. The default is `llmproxy`, configured
  via `LLMPROXY_ENDPOINT`, `LLMPROXY_MODEL`, and `LLMPROXY_AUTH`.
- PDF upload uses `pdftoppm` from Poppler. Install it before using `/api/upload/pdf`.

## API highlights

- `GET /api/books`
- `GET /api/books/:id/manifest`
- `GET /api/page-text?image=/data/...`
- `POST /api/page-audio`
- `POST /api/upload/pdf`
- `POST /api/books/:id/print`
- `GET/POST/DELETE /api/books/:id/bookmarks`
- `GET/POST /api/books/:id/toc`, `POST /api/books/:id/toc/generate`
