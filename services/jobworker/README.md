# Job Worker

Generic one-at-a-time HTTP job worker for long-running reader tasks.

## API

- `GET /health`
- `GET /jobs`
- `GET /jobs/:id`
- `POST /jobs` with `{ "type": "...", "payload": { ... } }`
- `POST /jobs/:type` with the payload as the request body

Jobs are persisted in `/data/jobworker-jobs.json`. Running jobs are recovered as queued on restart.
The subtitle handler uses the async `sync-subtitles` API: it queues work with
`POST /jobs`, polls `GET /jobs/:id`, then downloads `GET /jobs/:id/result`.
It submits the generated SRT back to the reader container through
`JOBWORKER_READER_SUBTITLE_SUBMIT_URL`; the reader is responsible for writing
the final file into its data directory.

## Adding a Job Type

Create a handler under `src/handlers/` and register it in `src/server.js`.

A handler can implement:

- `type`: canonical job type.
- `aliases`: optional POST aliases.
- `normalize(payload)`: validate and normalize the request body.
- `findDuplicate(jobs, payload)`: return an existing queued/running job if needed.
- `createCompletedJob(payload)`: return a completed result when output already exists.
- `onQueued(job)`, `onStarted(job)`, `onCompleted(job, result)`, `onFailed(job, error)`: lifecycle hooks.
- `run(job, { log })`: execute the task. Use `await log(message, details)` for UI-visible logs.
