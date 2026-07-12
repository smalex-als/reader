import path from 'node:path';
import {
  DATA_DIR,
  NEMOTRON_ASR_LANGUAGE,
  NEMOTRON_ASR_POLL_INTERVAL_MS,
  NEMOTRON_ASR_TIMEOUT_MS,
  NEMOTRON_ASR_URL
} from '../config.js';

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Nemotron ASR failed with HTTP ${response.status}`);
  }
  return payload;
}

export function formatAsrDataPath(filePath) {
  const relative = path.relative(DATA_DIR, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Nemotron ASR paths must stay inside the Reader data directory');
  }
  return relative.split(path.sep).join('/');
}

export async function requestNemotronTranscription({
  audioPath,
  outputPath,
  jobId,
  language = NEMOTRON_ASR_LANGUAGE
}) {
  if (!NEMOTRON_ASR_URL) {
    return null;
  }
  const timeoutMs = Number.isFinite(NEMOTRON_ASR_TIMEOUT_MS) && NEMOTRON_ASR_TIMEOUT_MS > 0
    ? NEMOTRON_ASR_TIMEOUT_MS
    : 60 * 60 * 1000;
  const pollDelayMs = Number.isFinite(NEMOTRON_ASR_POLL_INTERVAL_MS) && NEMOTRON_ASR_POLL_INTERVAL_MS > 0
    ? NEMOTRON_ASR_POLL_INTERVAL_MS
    : 2000;
  const deadline = Date.now() + timeoutMs;
  const queued = await readJson(await fetch(`${NEMOTRON_ASR_URL}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: jobId,
      audio: formatAsrDataPath(audioPath),
      output: formatAsrDataPath(outputPath),
      language
    })
  }));
  const asrJobId = queued?.job?.id;
  if (!asrJobId) {
    throw new Error('Nemotron ASR did not return a job id');
  }

  while (Date.now() <= deadline) {
    const payload = await readJson(await fetch(
      `${NEMOTRON_ASR_URL}/jobs/${encodeURIComponent(asrJobId)}`,
      { cache: 'no-store' }
    ));
    const job = payload?.job;
    if (!job) {
      throw new Error(`Nemotron ASR job disappeared: ${asrJobId}`);
    }
    if (job.status === 'completed') {
      return job;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || `Nemotron ASR job failed: ${asrJobId}`);
    }
    await sleep(pollDelayMs);
  }
  throw new Error(`Nemotron ASR timed out after ${timeoutMs}ms`);
}
