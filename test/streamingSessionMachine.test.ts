import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAcceptStreamingPageAudio,
  createStreamingSessionState,
  isCurrentAudioChain,
  isCurrentStreamingSession,
  transitionStreamingSession
} from '../src/lib/streamingSessionMachine.ts';

function transition(
  state: ReturnType<typeof createStreamingSessionState>,
  event: Parameters<typeof transitionStreamingSession>[1]
) {
  return transitionStreamingSession(state, event);
}

test('voice changes start a new session and invalidate old async work', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  const staleSessionId = state.sessionId;
  state = transition(state, { type: 'begin-audio-chain' });
  const staleAudioChainId = state.audioChainId;

  state = transition(state, {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-b'
  });

  assert.equal(state.lastStartReason, 'voice-change');
  assert.equal(state.voice, 'voice-b');
  assert.equal(isCurrentStreamingSession(state, staleSessionId), false);
  assert.equal(isCurrentAudioChain(state, staleAudioChainId), false);

  const afterStaleResume = transition(state, { type: 'resume' });
  assert.equal(afterStaleResume, state);
});

test('stale sessions remain invalid after stop and restart', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  const staleSessionId = state.sessionId;
  state = transition(state, { type: 'complete' });
  state = transition(state, { type: 'start', pageKey: 'page-2', voice: 'voice-a' });

  assert.equal(isCurrentStreamingSession(state, staleSessionId), false);
  assert.equal(state.status, 'connecting');
  assert.equal(state.pageKey, 'page-2');
});

test('pause and resume preserve the active session', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  state = transition(state, { type: 'audio-started' });
  const sessionId = state.sessionId;
  state = transition(state, { type: 'pause' });
  assert.equal(state.status, 'paused');
  assert.equal(state.sessionId, sessionId);

  state = transition(state, { type: 'resume' });
  assert.equal(state.status, 'streaming');
  assert.equal(state.sessionId, sessionId);
});

test('stop-after-current rejects later page audio and pauses at the boundary', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  state = transition(state, { type: 'segment-started', pageKey: 'page-1' });
  state = transition(state, { type: 'request-started', pageKey: 'page-2' });
  state = transition(state, { type: 'stop-after-current', pageKey: 'page-1' });

  assert.equal(canAcceptStreamingPageAudio(state, 'page-1'), true);
  assert.equal(canAcceptStreamingPageAudio(state, 'page-2'), false);

  state = transition(state, { type: 'complete' });
  assert.equal(state.status, 'paused');
  assert.equal(state.pageKey, 'page-1');
});

test('explicit stop discards the study pause-at-start boundary', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a',
    pauseAtStartOnComplete: true
  });
  state = transition(state, { type: 'segment-started', pageKey: 'page-1' });

  state = transition(state, {
    type: 'complete',
    preservePauseAtStart: false
  });

  assert.equal(state.status, 'idle');
  assert.equal(state.pageKey, null);
  assert.equal(state.pauseAtStartPageKey, null);
});

test('component unmount disposes the machine and invalidates all tokens', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  const sessionId = state.sessionId;
  state = transition(state, { type: 'begin-audio-chain' });
  const audioChainId = state.audioChainId;
  state = transition(state, { type: 'unmount' });

  assert.equal(state.status, 'disposed');
  assert.equal(isCurrentStreamingSession(state, sessionId), false);
  assert.equal(isCurrentAudioChain(state, audioChainId), false);

  const ignored = transition(state, { type: 'resume' });
  assert.equal(ignored, state);
});

test('mount reactivates a Strict Mode cleanup without reviving stale tokens', () => {
  let state = transition(createStreamingSessionState(), {
    type: 'start',
    pageKey: 'page-1',
    voice: 'voice-a'
  });
  const staleSessionId = state.sessionId;
  const staleAudioChainId = state.audioChainId;

  state = transition(state, { type: 'unmount' });
  state = transition(state, { type: 'mount' });

  assert.equal(state.status, 'idle');
  assert.equal(isCurrentStreamingSession(state, staleSessionId), false);
  assert.equal(isCurrentAudioChain(state, staleAudioChainId), false);
});
