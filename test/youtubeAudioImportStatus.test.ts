import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
