import type { JobWorkerJob, JobWorkerLog, JobWorkerStatus } from '@/types/app';

type JobsResponse = {
  jobs?: unknown;
  error?: unknown;
};

const JOB_STATUSES = new Set<JobWorkerStatus>(['queued', 'running', 'completed', 'failed']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function normalizeDetails(value: unknown) {
  return value === undefined ? null : value;
}

function normalizeLog(value: unknown): JobWorkerLog | null {
  if (!isRecord(value)) {
    return null;
  }
  const timestamp = stringValue(value.timestamp);
  const message = stringValue(value.message);
  if (!timestamp && !message) {
    return null;
  }
  return {
    timestamp,
    message,
    details: normalizeDetails(value.details)
  };
}

function normalizeStatus(value: unknown): JobWorkerStatus {
  return typeof value === 'string' && JOB_STATUSES.has(value as JobWorkerStatus)
    ? (value as JobWorkerStatus)
    : 'queued';
}

function normalizeJob(value: unknown): JobWorkerJob | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = stringValue(value.id);
  const type = stringValue(value.type);
  if (!id || !type) {
    return null;
  }
  return {
    id,
    type,
    status: normalizeStatus(value.status),
    attempts: typeof value.attempts === 'number' ? value.attempts : 0,
    createdAt: stringValue(value.createdAt),
    startedAt: nullableString(value.startedAt),
    completedAt: nullableString(value.completedAt),
    updatedAt: nullableString(value.updatedAt),
    error: nullableString(value.error),
    errorDetails: normalizeDetails(value.errorDetails),
    result: normalizeDetails(value.result),
    logs: Array.isArray(value.logs) ? value.logs.map(normalizeLog).filter((log): log is JobWorkerLog => Boolean(log)) : [],
    payload: isRecord(value.payload) ? value.payload : {}
  };
}

export async function fetchJobWorkerJobs(): Promise<JobWorkerJob[]> {
  const response = await fetch('/api/jobs');
  const payload = (await response.json().catch(() => ({}))) as JobsResponse;
  if (!response.ok) {
    const message = typeof payload.error === 'string' ? payload.error : `Failed to load jobs: HTTP ${response.status}`;
    throw new Error(message);
  }
  return Array.isArray(payload.jobs)
    ? payload.jobs.map(normalizeJob).filter((job): job is JobWorkerJob => Boolean(job))
    : [];
}
