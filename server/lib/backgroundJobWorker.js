import {
  CHAPTER_AUDIO_JOB_NAME,
  startBackgroundJobWorker,
  YOUTUBE_AUDIO_JOB_NAME
} from './backgroundJobs.js';
import { runChapterAudioJob } from './chapterAudioJobs.js';
import { runYouTubeAudioDownloadJob } from './chapterSourceAudio.js';

export function startReaderBackgroundJobWorker() {
  return startBackgroundJobWorker(async (job) => {
    if (job.name === CHAPTER_AUDIO_JOB_NAME) {
      await job.updateProgress({ percent: 5, label: 'Queued' });
      await runChapterAudioJob({
        ...job.data,
        throwOnFailure: true
      });
      await job.updateProgress({ percent: 100, label: 'MP3 ready' });
      return;
    }
    if (job.name === YOUTUBE_AUDIO_JOB_NAME) {
      await job.updateProgress({ percent: 10, label: 'Downloading YouTube audio' });
      await runYouTubeAudioDownloadJob(job.data);
      await job.updateProgress({ percent: 100, label: 'Source MP3 ready' });
      return;
    }
    throw new Error(`Unsupported background job: ${job.name}`);
  });
}
