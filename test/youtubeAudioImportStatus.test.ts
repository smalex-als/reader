import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getYouTubeDownloadFailureDetail,
  getYouTubeAudioImportStatusForChapter,
  isActiveYouTubeAudioImportState,
  shouldNavigateToCompletedYouTubeVersion
} from '../src/lib/youtubeAudioImportStatus.ts';
import type { YouTubeAudioImportStatus } from '../src/api/youtubeAudioImport.ts';

test('chapter navigation never carries a completed import title or version to the next chapter', () => {
  const previousStatus: YouTubeAudioImportStatus = {
    source: 'youtube', sourceUrl: 'https://youtu.be/previous', jobId: 'previous-job',
    status: 'completed', videoTitle: 'Previous video', postProcessVersionId: 'v2'
  };
  const previousSnapshot = { bookId: 'book', chapterNumber: 2, status: previousStatus };
  assert.equal(getYouTubeAudioImportStatusForChapter(previousSnapshot, 'book', 2), previousStatus);

  // The first render after Next Chapter still holds the previous request's
  // state. Neither the header nor the TOC/version effects may consume it.
  assert.equal(getYouTubeAudioImportStatusForChapter(previousSnapshot, 'book', 3), null);
  assert.equal(getYouTubeAudioImportStatusForChapter(previousSnapshot, 'other-book', 2), null);
  assert.equal(getYouTubeAudioImportStatusForChapter(previousSnapshot, null, null), null);
  assert.equal(getYouTubeAudioImportStatusForChapter(null, 'book', 3), null);

  const lastStatus = { ...previousStatus, jobId: 'last-job', videoTitle: 'Last video' };
  const lastSnapshot = { bookId: 'book', chapterNumber: 3, status: lastStatus };
  assert.equal(getYouTubeAudioImportStatusForChapter(lastSnapshot, 'book', 3)?.videoTitle, 'Last video');
  assert.equal(getYouTubeAudioImportStatusForChapter(lastSnapshot, 'book', 2), null);
  // A delayed retry response from chapter 2 remains hidden in chapter 3.
  assert.equal(getYouTubeAudioImportStatusForChapter(previousSnapshot, 'book', 3), null);
});

test('a chapter without a YouTube import keeps its own title', () => {
  const snapshot = { bookId: 'book', chapterNumber: 3, status: null };
  assert.equal(getYouTubeAudioImportStatusForChapter(snapshot, 'book', 3), null);
});

test('does not navigate when an already completed YouTube import is loaded', () => {
  assert.equal(
    shouldNavigateToCompletedYouTubeVersion({
      status: 'completed',
      wasActive: false,
      postProcessVersionId: 'v1'
    }),
    false
  );
});

test('navigates when an observed active YouTube import completes', () => {
  assert.equal(isActiveYouTubeAudioImportState('post-processing'), true);
  assert.equal(
    shouldNavigateToCompletedYouTubeVersion({
      status: 'completed',
      wasActive: true,
      postProcessVersionId: 'v2'
    }),
    true
  );
});

test('does not navigate until the completed import has a generated version', () => {
  assert.equal(
    shouldNavigateToCompletedYouTubeVersion({
      status: 'completed',
      wasActive: true,
      postProcessVersionId: null
    }),
    false
  );
});

test('explains missing runtime before the resulting HTTP 403 without displaying the command', () => {
  const error = 'Command failed: yt-dlp --output /app/data/book/file WARNING: No supported JavaScript runtime could be found. ERROR: unable to download video data: HTTP Error 403: Forbidden';
  const detail = getYouTubeDownloadFailureDetail(error);
  assert.match(detail!, /JavaScript runtime/);
  assert.doesNotMatch(detail!, /Command failed|\/app\/data/);
});

test('does not claim that every HTTP 403 is a runtime failure', () => {
  const detail = getYouTubeDownloadFailureDetail('ERROR: unable to download video data: HTTP Error 403: Forbidden');
  assert.match(detail!, /HTTP 403/);
  assert.doesNotMatch(detail!, /JavaScript runtime/);
});

test('unknown and missing download errors retain the normal failure guidance', () => {
  assert.equal(getYouTubeDownloadFailureDetail(null), null);
  assert.equal(getYouTubeDownloadFailureDetail('Connection timed out'), null);
});
