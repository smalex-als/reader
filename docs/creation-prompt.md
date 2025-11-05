Build “Scanned Book Reader”, a Vite + React 18 + TypeScript single-page app served by a lightweight Node HTTP server.

Front end
- Populate the list of Books by calling `GET /api/books`. When a book is chosen, call `GET /api/books/:id/manifest` to obtain page image URLs (under `/data/{bookId}/filename.ext`).
- Controls: Prev/Next, page counter, Zoom In/Out, Reset (100%), Fit Width/Height, Rotate 90°, Invert colors, brightness/contrast sliders (50–200), Go-to page, Fullscreen. All update `app` state, call helpers like `renderPage`, `applyZoomMode`, `applyFilters`, `updateTransform`, and persist changes.
- Implement mouse drag panning within the viewer, wheel-based panning, clamped to content bounds. Support keyboard shortcuts: arrows/PageUp/PageDown/Space for navigation, +/-/0 zoom controls, W/H fit, R rotate, I invert, X text modal, P play audio, G focus goto input, F fullscreen, Esc closes modal.
- Maintain a toast helper that shows temporary status messages in `toast`.
- Modal `textModal` toggles open/close; fetch page text via `deriveTextUrl` (same path with `.txt` extension). If no file exists, call `/api/page-text?image=/data/...` (append `skipCache=1` to force regeneration). Cache text per page; mark generated content with “• Generated”.
- Audio: manage `Audio` element, cache URLs. Attempt to reuse existing `.mp3` next to the image (`/data/.../page.mp3`). Otherwise POST `/api/page-audio` with `{ image, voice? }` (the server loads text as needed) and use returned URL. Handle play/pause/end states, stop audio when navigating.
- Keep CSS responsive flex layout, toolbar styling, fullscreen viewer, toast animation, modal overlay, inverse colors via CSS filters. Use kebab-case class names.

Back end (`server.js`)
- Express HTTP server. Serve static assets from `dist/` if built, otherwise project root. Serve `/data` directory for images/text/audio.
- `GET /api/books`: list immediate subdirectories of `./data` (sorted, case-insensitive, numeric-aware) and return `{ books: string[] }`.
- `GET /api/books/:id/manifest`: list image files (png/jpg/jpeg/gif/webp) inside the book directory; return `{ book, manifest: string[] }` with `/data/...` URLs.
- `GET /api/page-text?image=/data/...`: if matching `.txt` file exists, stream it back `{ source:'file', text }` unless `skipCache=1|true|yes` is provided. With skip or missing file, require `process.env.OPENAI_API_KEY`, run an OpenAI vision request (model `gpt-4o`) using the provided `TEXT_PROMPT`, persist the regenerated `.txt`, return `{ source:'ai', text }`. Handle 404/400 errors for invalid paths.
- `POST /api/page-audio`: accept JSON `{ image, voice? }`, validate under `/data`, reuse existing `.mp3` or call OpenAI TTS (`gpt-4o-mini-tts`) using a default “santa” profile unless another valid voice is requested. Load or generate the corresponding page text server-side, save generated audio alongside the image, and return `{ source:'ai'|'file', url }`.
- Support `HOST`/`PORT` env overrides. Log every API/static request. Include helpers for MIME lookup, path resolution, body parsing, JSON/plain responses.

Quality & testing
- Type-check with `tsconfig.json`. Manual smoke test flow: load a book, navigate pages, exercise zoom/rotate/invert, open text modal, play narration (with generation if needed), reload to confirm state restoration.

Deliver the full project ready to run via `npm install`, `npm run dev` (front end), and `node server.js` for the API/static server.
