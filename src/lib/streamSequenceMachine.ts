export type PendingStreamSequenceRestart = {
  fullText: string;
  startIndex: number;
  baseKey: string;
  source: 'page' | 'chapter' | 'paragraph';
  voiceOverride?: string;
};

export type PendingSingleStreamRestart = {
  text: string;
  pageKey: string;
  voiceOverride?: string;
};

export type StreamSequencePendingRestart =
  | { kind: 'sequence'; value: PendingStreamSequenceRestart }
  | { kind: 'single'; value: PendingSingleStreamRestart };

export type StreamSequenceRestartReason = 'replacement' | 'voice-change';

export type StreamSequenceMachineState = {
  phase: 'idle' | 'starting' | 'active' | 'disposed';
  runId: number;
  startPending: boolean;
  pendingRestart: StreamSequencePendingRestart | null;
  restartReason: StreamSequenceRestartReason | null;
};

export type StreamSequenceMachineEvent =
  | { type: 'mount' }
  | { type: 'begin' }
  | {
      type: 'queue-restart';
      pending: StreamSequencePendingRestart;
      reason: StreamSequenceRestartReason;
    }
  | { type: 'stream-active' }
  | { type: 'consume-restart' }
  | { type: 'stop'; clearPending?: boolean }
  | { type: 'unmount' };

export function createStreamSequenceMachineState(): StreamSequenceMachineState {
  return {
    phase: 'idle',
    runId: 0,
    startPending: false,
    pendingRestart: null,
    restartReason: null
  };
}

export function transitionStreamSequenceMachine(
  state: StreamSequenceMachineState,
  event: StreamSequenceMachineEvent
): StreamSequenceMachineState {
  if (state.phase === 'disposed' && event.type !== 'mount') {
    return state;
  }

  switch (event.type) {
    case 'mount':
      return state.phase === 'disposed'
        ? {
            ...createStreamSequenceMachineState(),
            runId: state.runId
          }
        : state;
    case 'begin':
      return {
        ...state,
        phase: 'starting',
        runId: state.runId + 1,
        startPending: true,
        pendingRestart: null,
        restartReason: null
      };
    case 'queue-restart':
      return {
        ...state,
        pendingRestart: event.pending,
        restartReason: event.reason
      };
    case 'stream-active':
      return { ...state, phase: 'active', startPending: false };
    case 'consume-restart':
      return { ...state, pendingRestart: null, restartReason: null };
    case 'stop':
      return {
        ...state,
        phase: 'idle',
        runId: state.runId + 1,
        startPending: false,
        pendingRestart: event.clearPending ? null : state.pendingRestart,
        restartReason: event.clearPending ? null : state.restartReason
      };
    case 'unmount':
      return {
        ...state,
        phase: 'disposed',
        runId: state.runId + 1,
        startPending: false,
        pendingRestart: null,
        restartReason: null
      };
  }
}

export function isCurrentStreamSequenceRun(state: StreamSequenceMachineState, runId: number) {
  return state.phase !== 'disposed' && state.runId === runId;
}
