import fs from 'node:fs/promises';
import { DATA_DIR, STORE_PATH } from './config.js';
import { createJobId, errorMessage, nowIso, serializeError } from './lib.js';

export class JobQueue {
  constructor({ handlers }) {
    this.handlers = handlers;
    this.jobs = [];
    this.loaded = false;
    this.processing = false;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const raw = await fs.readFile(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
      this.jobs.splice(0, this.jobs.length, ...entries);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }

    let recovered = false;
    for (const job of this.jobs) {
      if (job.status === 'running') {
        job.status = 'queued';
        job.error = 'Recovered from interrupted worker run';
        job.updatedAt = nowIso();
        recovered = true;
      }
    }
    if (recovered) {
      await this.save();
    }
  }

  async save() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const body = JSON.stringify({ jobs: this.jobs }, null, 2);
    this.writeQueue = this.writeQueue.then(() => fs.writeFile(STORE_PATH, body, 'utf8'));
    await this.writeQueue;
  }

  resolveHandler(type) {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(`Unknown job type: ${type}`);
    }
    return handler;
  }

  async enqueue({ type, payload }) {
    await this.load();
    const handler = this.resolveHandler(type);
    const normalizedPayload = await handler.normalize(payload);
    const duplicate = handler.findDuplicate?.(this.jobs, normalizedPayload);
    if (duplicate) {
      return duplicate;
    }

    const completed = await handler.createCompletedJob?.(normalizedPayload);
    if (completed) {
      const job = this.createJob({ type: handler.type, payload: normalizedPayload, status: 'completed' });
      job.completedAt = nowIso();
      job.result = completed.result ?? null;
      this.addLogEntry(job, 'Completed from existing output', job.result);
      this.jobs.push(job);
      await this.save();
      await handler.onCompleted?.(job, job.result);
      return job;
    }

    const job = this.createJob({ type: handler.type, payload: normalizedPayload, status: 'queued' });
    this.addLogEntry(job, 'Queued');
    this.jobs.push(job);
    await this.save();
    await handler.onQueued?.(job);
    this.schedule();
    return job;
  }

  createJob({ type, payload, status }) {
    const timestamp = nowIso();
    return {
      id: createJobId(),
      type,
      status,
      payload,
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      error: null,
      errorDetails: null,
      result: null,
      logs: []
    };
  }

  addLogEntry(job, message, details = null) {
    const entry = {
      timestamp: nowIso(),
      message,
      details
    };
    const logs = Array.isArray(job.logs) ? job.logs : [];
    job.logs = [...logs, entry].slice(-200);
    job.updatedAt = entry.timestamp;
    return entry;
  }

  async log(job, message, details = null) {
    this.addLogEntry(job, message, details);
    await this.save();
  }

  schedule() {
    setImmediate(() => {
      void this.processNext();
    });
  }

  async processNext() {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      await this.load();
      const job = this.jobs.find((entry) => entry.status === 'queued');
      if (!job) {
        return;
      }
      await this.run(job);
    } finally {
      this.processing = false;
      if (this.jobs.some((entry) => entry.status === 'queued')) {
        this.schedule();
      }
    }
  }

  async run(job) {
    const handler = this.resolveHandler(job.type);
    job.status = 'running';
    job.attempts = (job.attempts ?? 0) + 1;
    job.startedAt = nowIso();
    job.updatedAt = job.startedAt;
    job.error = null;
    job.errorDetails = null;
    this.addLogEntry(job, 'Started');
    await this.save();
    await handler.onStarted?.(job);

    try {
      const result = await handler.run(job, {
        log: (message, details = null) => this.log(job, message, details)
      });
      job.status = 'completed';
      job.completedAt = nowIso();
      job.updatedAt = job.completedAt;
      job.result = result ?? null;
      this.addLogEntry(job, 'Completed', job.result);
      await this.save();
      await handler.onCompleted?.(job, result);
    } catch (error) {
      job.status = 'failed';
      job.error = errorMessage(error);
      job.errorDetails = serializeError(error);
      job.completedAt = nowIso();
      job.updatedAt = job.completedAt;
      this.addLogEntry(job, 'Failed', job.errorDetails);
      await this.save();
      await handler.onFailed?.(job, error);
      console.warn('Job failed', { jobId: job.id, type: job.type, error: job.errorDetails });
    }
  }

  publicJob(job) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts ?? 0,
      createdAt: job.createdAt,
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      updatedAt: job.updatedAt ?? null,
      error: job.error ?? null,
      errorDetails: job.errorDetails ?? null,
      result: job.result ?? null,
      logs: Array.isArray(job.logs) ? job.logs : [],
      payload: job.payload
    };
  }
}
