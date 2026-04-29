Build "Scanned Book Reader", a Vite + React 18 + TypeScript single-page app served by a lightweight Node HTTP server.

Front end
- Populate the list of books by calling `GET /api/books`. When a book is chosen, call `GET /api/books/:id/manifest` to obtain page image URLs (under `/data/{bookId}/filename.ext`).
- Initialize shared library state from `GET /api/library/state`, then keep `lastBook`, per-book `lastPage`, recent/saved metadata, and sort mode synced via `PUT /api/library/state`.
- Controls: Prev/Next, page counter, Zoom In/Out, Reset (100%), Fit Width/Height, Rotate 90 degrees, Invert colors, brightness/contrast sliders (50-200), Go-to page, Fullscreen. All update app state, call helpers like `renderPage`, `applyZoomMode`, `applyFilters`, `updatePan`, and persist changes.
- Implement mouse drag panning within the viewer, wheel-based panning, clamped to content bounds. Support keyboard shortcuts: arrows/PageUp/PageDown/Space for navigation, +/-/0 zoom controls, W/H fit, R rotate, I invert, X text modal, S streaming audio, G focus goto input, F fullscreen, B book selector, Shift+/ help, Esc closes modal.
- Maintain a toast helper that shows temporary status messages.
- Modal `textModal` toggles open/close; fetch page text via `/api/page-text?image=/data/...` (append `skipCache=1` to force regeneration). Cache text per page; mark generated content when the source is `ai` or regeneration is forced.
- Streaming audio: send text to the server streaming endpoints and play PCM audio through `/public/stream-worklet.js`. Allow voice selection, defaulting to `VITE_STREAM_VOICE`.
- Bookmarks: toggle and list entries, read/write via the bookmarks API.
- OCR queue: batch enqueue pages for `/api/page-text`, pause/resume, retry failed jobs, and show progress.
- Table of contents: view entries in a nav modal, edit entries in a manage modal, generate entries from OCR snippets.
- Print: choose pages and call `POST /api/books/:id/print` (limit 10 pages) to download a PDF.
- Upload PDF: `POST /api/upload/pdf` to create a new book from scans (requires `pdftoppm`).
- Keep CSS responsive flex layout, toolbar styling, fullscreen viewer, toast animation, modal overlay, inverse colors via CSS filters. Use kebab-case class names.

Back end (`server.js`)
- Express HTTP server. Serve static assets from `dist/` if built, otherwise project root. Serve `/data` directory for images/text/audio.
- `GET /api/books`: list immediate subdirectories of `./data` (sorted, case-insensitive, numeric-aware) and return `{ books: string[] }`.
- `GET/PUT /api/library/state`: read/write shared library session state in `data/.library-state.json`, including `lastBook`, `lastPages`, `bookMeta`, and `bookSortMode`.
- `GET /api/books/:id/manifest`: list image files (png/jpg/jpeg/gif/webp) inside the book directory; return `{ book, manifest: string[] }` with `/data/...` URLs.
- `GET /api/page-text?image=/data/...`: if matching `.txt` file exists and `skipCache` is not set, return `{ source: 'file', text }`. Otherwise generate OCR text, persist `.txt`, and return `{ source: 'ai', text }`.
- OCR backend: default `llmproxy` that POSTs to `LLMPROXY_ENDPOINT` with `TEXT_PROMPT`, `LLMPROXY_MODEL`, and `LLMPROXY_AUTH`. Alternate backend `openai` runs `gpt-5.2` vision with `TEXT_PROMPT` (requires `OPENAI_API_KEY`). Use `openai_compat` for OpenAI-compatible endpoints with `OCR_OPENAI_BASE_URL` and `OCR_OPENAI_MODEL`.
- OCR prompts can be model- or backend-specific: add `server/prompts/text.<model>.txt` or `text.<backend>.txt` (normalized to lowercase with non-alphanumerics replaced by `_`). Falls back to `text.txt`.
- `POST /api/stream-audio/pcm`: accept `{ text, voice? }`, generate streaming PCM audio via the selected provider, and return raw PCM with audio metadata headers.
- `POST /api/upload/pdf`: accept multipart PDF uploads, convert to JPEG pages with `pdftoppm`, and create a new book directory.
- `POST /api/books/:id/print`: accept `{ pages: string[] }`, create a PDF from PNG/JPEG images (max 10 pages).
- Bookmarks: `GET/POST/DELETE /api/books/:id/bookmarks` read/write `bookmarks.txt`.
- Table of contents: `GET/POST /api/books/:id/toc` read/write `toc.json` (0-based pages). `POST /api/books/:id/toc/generate` uses OCR snippets and OpenAI `gpt-5.2` with `TOC_PROMPT`.
- Additional endpoints by category:
- Library state: `GET/PUT /api/library/state`.
- Book metadata: `GET /api/books/cards`, `GET/PUT /api/books/:id/meta`, `GET /api/books/:id/audio`.
- Chapters and narration: `POST /api/books/:id/chapters/generate`, `PUT /api/books/:id/chapters/:chapter`, `POST /api/books/:id/chapters/:chapter/narration`, `GET /api/books/:id/chapters/:chapter/audio/status`, `POST /api/books/:id/chapters/:chapter/audio/cancel`.
- Search: `GET /api/books/:id/search`, `POST /api/books/:id/search/index`.
- `GET /api/health` returns `{ status: 'ok' }`.
- Support `HOST`/`PORT` and optional `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH`. Log every API/static request. Include helpers for MIME lookup, path resolution, body parsing, and JSON responses.

Quality & testing
- Type-check with `tsconfig.json`. Manual smoke test flow: load a book, navigate pages, exercise zoom/rotate/invert, open text modal, play audio, test streaming audio, run batch OCR, edit/save TOC, print a PDF, reload to confirm state restoration.

Deliver the full project ready to run via `npm install`, `npm run dev` (front end), and `node server.js` for the API/static server.
