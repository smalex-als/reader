import http from 'node:http';
import { HOST, MAX_BODY_BYTES, PORT } from './config.js';
import { errorMessage, serializeError } from './lib.js';
import { JobQueue } from './queue.js';
import { subtitlesHandler } from './handlers/subtitles.js';

const handlers = new Map();

function registerHandler(handler) {
  handlers.set(handler.type, handler);
  for (const alias of handler.aliases ?? []) {
    handlers.set(alias, handler);
  }
}

registerHandler(subtitlesHandler);

const queue = new JobQueue({ handlers });

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('Request body is too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });
  res.end(body);
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { status: 'ok' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/jobs') {
      await queue.load();
      sendJson(res, 200, { jobs: queue.jobs.map((job) => queue.publicJob(job)) });
      return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/jobs/')) {
      await queue.load();
      const id = decodeURIComponent(url.pathname.slice('/jobs/'.length));
      const job = queue.jobs.find((entry) => entry.id === id);
      if (!job) {
        sendJson(res, 404, { error: 'Job not found' });
        return;
      }
      sendJson(res, 200, { job: queue.publicJob(job) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/jobs') {
      const body = await readJsonBody(req);
      const type = body.type;
      const payload = body.payload ?? {};
      const job = await queue.enqueue({ type, payload });
      sendJson(res, 202, { job: queue.publicJob(job) });
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/jobs/')) {
      const type = decodeURIComponent(url.pathname.slice('/jobs/'.length));
      const payload = await readJsonBody(req);
      const job = await queue.enqueue({ type, payload });
      sendJson(res, 202, { job: queue.publicJob(job) });
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { error: errorMessage(error), errorDetails: serializeError(error) });
  }
}

await queue.load();
queue.schedule();

const server = http.createServer((req, res) => {
  void handleRequest(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`jobworker listening on ${HOST}:${PORT}`);
});
