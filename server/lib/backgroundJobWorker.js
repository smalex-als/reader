import {
  CHAPTER_AUDIO_JOB_NAME,
  startBackgroundJobWorker
} from './backgroundJobs.js';
import { runChapterAudioJob } from './chapterAudioJobs.js';

export function startReaderBackgroundJobWorker() {
  return startBackgroundJobWorker(async (job) => {
    if (job.name !== CHAPTER_AUDIO_JOB_NAME) {
      throw new Error(`Unsupported background job: ${job.name}`);
    }
    await job.updateProgress({ percent: 5, label: 'Queued' });
    await runChapterAudioJob({
      ...job.data,
      throwOnFailure: true
    });
    await job.updateProgress({ percent: 100, label: 'MP3 ready' });
  });
}
