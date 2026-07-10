# Dependency maintenance

Snapshot from `npm outdated` on 2026-06-11 after upgrading OpenAI, Express, and in-range patch/minor dependencies.

| Area | Installed | Latest | Priority | Notes |
| --- | ---: | ---: | --- | --- |
| OpenAI SDK | 6.42.0 | Current | Done | Upgraded from `openai@4.104.0` to `openai@6.42.0`. The existing call sites compile against the new SDK. |
| Express | 5.2.1 | Current | Done | Upgraded from `express@4.22.2` to `express@5.2.1`. The SPA fallback route now uses the named wildcard syntax required by Express 5. |
| React | 18.3.1 | 19.2.7 | Defer until needed | Larger frontend migration surface. Pair with explicit UI smoke tests instead of bundling with server dependency upgrades. |
| Vite | 8.0.16 | Current | No action | This checkout is already past the older Vite 5/7 line. Keep `@vitejs/plugin-react` aligned with the installed Vite major. |
| TypeScript | 5.9.3 | 6.0.3 | Defer until needed | Major compiler upgrade. Run separately with focused type-check fixes if needed. |
| `mime-types` | 2.1.35 | 3.0.2 | Defer until needed | Major library upgrade. Current usage is stable. |
| `undici` | 6.27.0 | 8.x | Done (security patch) | Upgraded within the 6.x line to address the WebSocket fragment-count denial-of-service advisory without taking a major-version migration. |
| `multer` | 2.2.0 | Current | Done (security patch) | Upgraded from 2.1.1 and configured flat-field multipart limits at all upload entry points. |

## OpenAI SDK upgrade scope

The `openai@6` dependency upgrade landed on 2026-06-11.

Call sites to verify:

- `server/lib/openai.js`: client construction and shared error handling.
- `server/lib/ocr.js`: `responses.create` OCR path.
- `server/lib/toc.js`: TOC generation.
- `server/lib/chapters.js`: chapter generation.
- `server/lib/units.js`: unit adaptation.
- `server/lib/quiz.js`: quiz generation.
- `server/lib/vocabulary.js`: vocabulary generation.
- `server/lib/memoryCard.js`: memory card generation.
- `server/lib/narration.js`: narration adaptation.
- `server/lib/chapterTextVersions.js`: chapter text version generation.
- `server/lib/audio.js`: speech generation.
- `server/lib/selfCheck.js`: health/self-check path.
- `server/lib/imagePreview.js`: image edit path still uses direct REST fetch and should be checked against the current image endpoint contract.

Suggested validation:

1. `npm run lint` - passed on 2026-06-11.
2. `npm test` - passed on 2026-06-11.
3. `npm run build` - passed on 2026-06-11.
4. Manual smoke tests for OpenAI OCR, TOC generation, chapter/unit/quiz/vocabulary generation, memory cards, narration adaptation, OpenAI TTS, and image enhancement.

## Express 5 upgrade scope

The Express 5 dependency upgrade landed on 2026-06-11.

Compatibility change:

- `server/index.js`: changed the SPA fallback from `app.get('*', ...)` to `app.get('/{*splat}', ...)` because Express 5 rejects unnamed wildcard routes.

Validation:

1. `npm run lint` - passed on 2026-06-11.
2. `npm test` - passed on 2026-06-11.
3. `node -e "import('./server/index.js').then(({ createApp }) => { createApp(); console.log('createApp ok'); })"` - passed on 2026-06-11.
4. `npm run build` - passed on 2026-06-11.
5. Manual smoke tests still recommended for book loading, static data serving, uploads, OCR regeneration, audio routes, jobs/events routes, and print/PDF flows.

## Multipart and WebSocket security patch

The `multer@2.2.0` and `undici@6.27.0` upgrades landed on 2026-07-09.

- Multipart uploads now share one memory-upload configuration with explicit limits for file count, field count, part count, field size, headers, and field nesting.
- Upload forms use flat field names, so `fieldNestingDepth` is set to `0`.
- Multer limit violations return a `400` response, while oversized files continue to return `413`.
- `undici` remains on the 6.x line used by the streaming WebSocket client.
