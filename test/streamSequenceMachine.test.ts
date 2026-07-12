import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStreamSequenceMachineState,
  isCurrentStreamSequenceRun,
  transitionStreamSequenceMachine
} from '../src/lib/streamSequenceMachine.ts';

test('voice-change restarts survive the stop boundary and invalidate the old run', () => {
  let state = transitionStreamSequenceMachine(createStreamSequenceMachineState(), { type: 'begin' });
  const staleRunId = state.runId;
  state = transitionStreamSequenceMachine(state, {
    type: 'queue-restart',
    reason: 'voice-change',
    pending: {
      kind: 'single',
      value: { text: 'hello', pageKey: 'page-1', voiceOverride: 'voice-b' }
    }
  });
  state = transitionStreamSequenceMachine(state, { type: 'stop' });

  assert.equal(isCurrentStreamSequenceRun(state, staleRunId), false);
  assert.equal(state.restartReason, 'voice-change');
  assert.equal(state.pendingRestart?.kind, 'single');

  state = transitionStreamSequenceMachine(state, { type: 'consume-restart' });
  state = transitionStreamSequenceMachine(state, { type: 'begin' });
  assert.equal(state.phase, 'starting');
  assert.equal(state.pendingRestart, null);
});

test('sequence unmount clears pending work and invalidates run tokens', () => {
  let state = transitionStreamSequenceMachine(createStreamSequenceMachineState(), { type: 'begin' });
  const staleRunId = state.runId;
  state = transitionStreamSequenceMachine(state, {
    type: 'queue-restart',
    reason: 'replacement',
    pending: {
      kind: 'sequence',
      value: {
        fullText: 'chapter text',
        startIndex: 0,
        baseKey: 'chapter-1',
        source: 'chapter'
      }
    }
  });
  state = transitionStreamSequenceMachine(state, { type: 'unmount' });

  assert.equal(state.phase, 'disposed');
  assert.equal(state.pendingRestart, null);
  assert.equal(isCurrentStreamSequenceRun(state, staleRunId), false);
});

test('explicit stop clears a pending restart', () => {
  let state = transitionStreamSequenceMachine(createStreamSequenceMachineState(), { type: 'begin' });
  state = transitionStreamSequenceMachine(state, {
    type: 'queue-restart',
    reason: 'voice-change',
    pending: {
      kind: 'single',
      value: { text: 'hello', pageKey: 'page-1', voiceOverride: 'voice-b' }
    }
  });

  state = transitionStreamSequenceMachine(state, { type: 'stop', clearPending: true });

  assert.equal(state.phase, 'idle');
  assert.equal(state.pendingRestart, null);
  assert.equal(state.restartReason, null);
});

test('mount reactivates a Strict Mode cleanup without reviving the old run', () => {
  let state = transitionStreamSequenceMachine(createStreamSequenceMachineState(), { type: 'begin' });
  const staleRunId = state.runId;

  state = transitionStreamSequenceMachine(state, { type: 'unmount' });
  state = transitionStreamSequenceMachine(state, { type: 'mount' });

  assert.equal(state.phase, 'idle');
  assert.equal(state.startPending, false);
  assert.equal(isCurrentStreamSequenceRun(state, staleRunId), false);
});
