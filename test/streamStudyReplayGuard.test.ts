import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamStudyReplayGuard } from '../src/lib/streamStudyReplayGuard.ts';

test('explicit stop blocks stale study replay until runtime reaches idle', () => {
  const guard = new StreamStudyReplayGuard();

  assert.equal(guard.shouldSync('paused'), true);

  guard.blockUntilIdle();
  assert.equal(guard.shouldSync('paused'), false);
  assert.equal(guard.shouldSync('idle'), false);
  assert.equal(guard.shouldSync('idle'), true);
});

test('new playback clears a pending explicit-stop guard', () => {
  const guard = new StreamStudyReplayGuard();

  guard.blockUntilIdle();
  guard.allowPlayback();

  assert.equal(guard.shouldSync('connecting'), true);
});
