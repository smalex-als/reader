import { Queue, Worker } from 'bullmq';
import {
  BACKGROUND_JOB_CONCURRENCY,
  REDIS_URL
} from '../config.js';

export const BACKGROUND_QUEUE_NAME = 'reader-background';
export const CHAPTER_AUDIO_JOB_NAME = 'chapter-audio';

let queue = null;
let worker = null;

export function createRedisConnectionOptions(redisUrl, { workerConnection = false } = {}) {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  const database = parsed.pathname && parsed.pathname !== '/'
    ? Number.parseInt(parsed.pathname.slice(1), 10)
    : 0;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isInteger(database) && database >= 0 ? database : 0,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: workerConnection ? null : 1
  };
}

export function isBackgroundQueueEnabled() {
  return Boolean(REDIS_URL);
}

function getConnection(options) {
  return createRedisConnectionOptions(REDIS_URL, options);
}

function getQueue() {
  if (!queue) {
    queue = new Queue(BACKGROUND_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
      }
    });
    queue.on('error', (error) => {
      console.error('Background queue error', error);
    });
  }
  return queue;
}

export async function enqueueBackgroundJob(name, data, { jobId } = {}) {
  if (!isBackgroundQueueEnabled()) {
    return null;
  }
  return getQueue().add(name, data, jobId ? { jobId } : undefined);
}

export async function cancelBackgroundJob(jobId) {
  if (!isBackgroundQueueEnabled() || !jobId) {
    return false;
  }
  const job = await getQueue().getJob(jobId);
  if (!job) {
    return false;
  }
  const state = await job.getState();
  if (!['waiting', 'delayed', 'prioritized', 'paused'].includes(state)) {
    return false;
  }
  await job.remove();
  return true;
}

export function startBackgroundJobWorker(processor) {
  if (!isBackgroundQueueEnabled() || worker) {
    return worker;
  }
  worker = new Worker(BACKGROUND_QUEUE_NAME, processor, {
    connection: getConnection({ workerConnection: true }),
    concurrency: BACKGROUND_JOB_CONCURRENCY
  });
  worker.on('completed', (job) => {
    console.log(`Background job completed: ${job.name} (${job.id})`);
  });
  worker.on('failed', (job, error) => {
    console.error(`Background job failed: ${job?.name ?? 'unknown'} (${job?.id ?? 'unknown'})`, error);
  });
  worker.on('error', (error) => {
    console.error('Background worker error', error);
  });
  return worker;
}

export async function closeBackgroundJobs() {
  const activeWorker = worker;
  const activeQueue = queue;
  worker = null;
  queue = null;
  await activeWorker?.close();
  await activeQueue?.close();
}
