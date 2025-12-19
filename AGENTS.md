# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React + TypeScript app (components, hooks, styles, types, lib).
- `public/`: static assets (e.g., `stream-worklet.js`).
- `server.js`: Express API/static server, OCR, audio, PDF tooling.
- `data/`: book folders, page images, OCR text, narration, audio, bookmarks, TOC.
- `docs/`: internal notes (e.g., `docs/creation-prompt.md`).
- `scripts/`: helper scripts.
- `dist/`: production build output (served when present).

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: run Vite dev server (frontend).
- `node server.js`: run API/static server (serves `dist/` if built).
- `npm run build`: type-check then build the frontend.
- `npm run lint`: type-check only (no ESLint configured).

## Coding Style & Naming Conventions

- TypeScript + React function components.
- Use kebab-case CSS class names (see `src/styles/index.css`).
- Prefer clear, descriptive names for hooks (`useX`) and components (`XModal`, `Viewer`, `Toolbar`).
- Formatting is handled implicitly by existing style; no repo formatter configured.

## Testing Guidelines

- No automated test framework is configured.
- Use manual smoke tests: load a book, navigate pages, open text modal, play narration, try streaming, edit TOC, and print PDF.

## Commit & Pull Request Guidelines

- Recent commits use short, imperative summaries (e.g., "remove logging", "use ollama").
- PRs should include a concise description, manual test notes, and screenshots when UI changes are visible.

## Security & Configuration Tips

- Set `OPENAI_API_KEY` for OCR (when using the OpenAI backend), narration adaptation, TOC generation, and TTS.
- Streaming audio uses `VITE_STREAM_SERVER` and optional `VITE_STREAM_VOICE`.
- PDF upload requires `pdftoppm` installed locally.
