Build "Scanned Book Reader", a Vite + React 18 + TypeScript single-page app served by a lightweight Node HTTP server.

Front end
- Populate the list of books by calling `GET /api/books`. When a book is chosen, call `GET /api/books/:id/manifest` to obtain page image URLs (under `/data/{bookId}/filename.ext`).
- Controls: Prev/Next, page counter, Zoom In/Out, Reset (100%), Fit Width/Height, Rotate 90 degrees, Invert colors, brightness/contrast sliders (50-200), Go-to page, Fullscreen. All update app state, call helpers like `renderPage`, `applyZoomMode`, `applyFilters`, `updatePan`, and persist changes.
- Implement mouse drag panning within the viewer, wheel-based panning, clamped to content bounds. Support keyboard shortcuts: arrows/PageUp/PageDown/Space for navigation, +/-/0 zoom controls, W/H fit, R rotate, I invert, X text modal, P play audio, G focus goto input, F fullscreen, B book selector, Shift+/ help, Esc closes modal.
- Maintain a toast helper that shows temporary status messages.
- Modal `textModal` toggles open/close; fetch page text via `/api/page-text?image=/data/...` (append `skipCache=1` to force regeneration). Cache text per page; mark generated content when the source is `ai` or regeneration is forced.
- Audio: manage `Audio` element, cache URLs. Attempt to reuse existing `.mp3` next to the image (`/data/.../page.mp3`). Otherwise POST `/api/page-audio` with `{ image, voice? }` (the server loads text as needed) and use returned URL. Handle play/pause/end states, stop audio when navigating.
- Streaming audio: connect to `VITE_STREAM_SERVER` (WebSocket `/stream` endpoint) and stream audio to a worklet via `/public/stream-worklet.js`. Allow voice selection, defaulting to `VITE_STREAM_VOICE`.
- Bookmarks: toggle and list entries, read/write via the bookmarks API.
- OCR queue: batch enqueue pages for `/api/page-text`, pause/resume, retry failed jobs, and show progress.
- Table of contents: view entries in a nav modal, edit entries in a manage modal, generate entries from OCR snippets.
- Print: choose pages and call `POST /api/books/:id/print` (limit 10 pages) to download a PDF.
- Upload PDF: `POST /api/upload/pdf` to create a new book from scans (requires `pdftoppm`).
- Keep CSS responsive flex layout, toolbar styling, fullscreen viewer, toast animation, modal overlay, inverse colors via CSS filters. Use kebab-case class names.

Back end (`server.js`)
- Express HTTP server. Serve static assets from `dist/` if built, otherwise project root. Serve `/data` directory for images/text/audio.
- `GET /api/books`: list immediate subdirectories of `./data` (sorted, case-insensitive, numeric-aware) and return `{ books: string[] }`.
- `GET /api/books/:id/manifest`: list image files (png/jpg/jpeg/gif/webp) inside the book directory; return `{ book, manifest: string[] }` with `/data/...` URLs.
- `GET /api/page-text?image=/data/...`: if matching `.txt` file exists and `skipCache` is not set, return `{ source: 'file', text }`. Otherwise generate OCR text, persist `.txt`, and return `{ source: 'ai', text }`.
- OCR backend: default `llmproxy` that POSTs to `LLMPROXY_ENDPOINT` with `TEXT_PROMPT`, `LLMPROXY_MODEL`, and `LLMPROXY_AUTH`. Alternate backend `openai` runs `gpt-5.2` vision with `TEXT_PROMPT` (requires `OPENAI_API_KEY`).
- `POST /api/page-audio`: accept JSON `{ image, voice? }`, validate under `/data`, reuse existing `.mp3` or call OpenAI TTS (`gpt-4o-mini-tts`) using a default "santa" profile unless another valid voice is requested. Load or generate the corresponding page text server-side, save generated audio alongside the image, and return `{ source:'ai'|'file', url }`.
- `POST /api/upload/pdf`: accept multipart PDF uploads, convert to JPEG pages with `pdftoppm`, and create a new book directory.
- `POST /api/books/:id/print`: accept `{ pages: string[] }`, create a PDF from PNG/JPEG images (max 10 pages).
- Bookmarks: `GET/POST/DELETE /api/books/:id/bookmarks` read/write `bookmarks.txt`.
- Table of contents: `GET/POST /api/books/:id/toc` read/write `toc.json` (0-based pages). `POST /api/books/:id/toc/generate` uses OCR snippets and OpenAI `gpt-5.2` with `TOC_PROMPT`.
- `GET /api/health` returns `{ status: 'ok' }`.
- Support `HOST`/`PORT` and optional `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH`. Log every API/static request. Include helpers for MIME lookup, path resolution, body parsing, and JSON responses.

Quality & testing
- Type-check with `tsconfig.json`. Manual smoke test flow: load a book, navigate pages, exercise zoom/rotate/invert, open text modal, play audio, test streaming audio, run batch OCR, edit/save TOC, print a PDF, reload to confirm state restoration.

Deliver the full project ready to run via `npm install`, `npm run dev` (front end), and `node server.js` for the API/static server.
