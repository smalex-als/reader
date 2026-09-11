import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getYouTubeDownloadFailureDetail,
  isActiveYouTubeAudioImportState,
  shouldNavigateToCompletedYouTubeVersion
} from '../src/lib/youtubeAudioImportStatus.ts';

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
