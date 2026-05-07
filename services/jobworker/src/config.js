import path from 'node:path';

export const HOST = process.env.JOBWORKER_HOST || '0.0.0.0';
export const PORT = Number.parseInt(process.env.JOBWORKER_PORT || '3200', 10);
export const DATA_DIR = path.resolve(process.env.JOBWORKER_DATA_DIR || '/data');
export const STORE_PATH = path.join(DATA_DIR, 'jobworker-jobs.json');
export const MAX_BODY_BYTES = Number.parseInt(process.env.JOBWORKER_MAX_BODY_BYTES || '1048576', 10);
export const READER_SUBTITLE_SUBMIT_URL =
  process.env.JOBWORKER_READER_SUBTITLE_SUBMIT_URL || 'http://reader:3000/api/jobs/subtitles/submit';
