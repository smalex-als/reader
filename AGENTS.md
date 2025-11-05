# Repository Guidelines

## Project Structure & Module Organization
- `book.html` contains the full application: semantic HTML, inline styles, and vanilla JavaScript that manage the page viewer, thumbnail rail, and toolbar.
- The JavaScript keeps shared state in the `app` object and persists session data under the `scanned-book-reader:v1` key; extend this pattern when introducing new controls.
- Keep new assets in clearly named folders (for example, `assets/` or `examples/`) and reference them with relative paths so the static page continues to load without a build step.

## Build, Test, and Development Commands
- Serve the reader and bundled sample data with `node server.js` (set `HOST`/`PORT` to override defaults); the server also exposes `GET /api/books` and `GET /api/books/:id/manifest` for quick manifest generation.
- Set `OPENAI_API_KEY` before starting the server to enable on-demand text extraction when `.txt` transcripts are missing.
- Open the app directly in a browser for quick checks, or start a local server for CORS-safe manifest testing: `npx http-server .` (Node) or `python3 -m http.server 8000`.
- Use LiveReload tooling such as `npx live-server book.html` when iterating on UI changes; no bundler is required.

## Coding Style & Naming Conventions
- Follow the existing two-space indentation for HTML, CSS, and JS; keep imports inline and avoid introducing frameworks unless justified.
- Use descriptive, camelCase function and variable names (`loadManifest`, `renderThumbs`) and kebab-case CSS class names (`.thumbs`, `.page-counter`).
- Persist user-facing strings through the toast helper to maintain consistent feedback patterns.

## Testing Guidelines
- Manual smoke tests are required: select a book from the Book menu, confirm pages render from the server, toggle zoom/rotation controls, flip inverse colors, open the text preview, and reload to confirm state restoration.
- If adding automated coverage, place new files under `tests/` and mirror the UI flows with Playwright or Cypress; name specs after the feature (e.g., `tests/rotation.spec.ts`).
- Document any new test scripts in this guide once introduced.

## Commit & Pull Request Guidelines
- Use concise, present-tense commit messages; prefer Conventional Commit prefixes (`feat:`, `fix:`, `refactor:`) to signal intent.
- Each PR should describe the user-facing change, list manual verification steps, and include screenshots or GIFs when the UI shifts.
- Reference related issues or TODOs, and call out any assumptions about supported browsers or file formats.
