export type StreamingSessionStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'paused'
  | 'error'
  | 'disposed';

export type StreamingStartReason = 'initial' | 'restart' | 'voice-change';

export type StreamingSessionState = {
  status: StreamingSessionStatus;
  sessionId: number;
  audioChainId: number;
  voice: string | null;
  pageKey: string | null;
  activeSegmentPageKey: string | null;
  activeRequestPageKey: string | null;
  stopAfterCurrentPageKey: string | null;
  pauseAtStartPageKey: string | null;
  sourceEnded: boolean;
  hasStartedAudio: boolean;
  lastStartReason: StreamingStartReason | null;
};

export type StreamingSessionEvent =
  | { type: 'mount' }
  | { type: 'start'; pageKey: string; voice: string; pauseAtStartOnComplete?: boolean }
  | { type: 'invalidate-audio-chain' }
  | { type: 'begin-audio-chain' }
  | { type: 'request-started'; pageKey: string }
  | { type: 'request-finished' }
  | { type: 'segment-started'; pageKey: string }
  | { type: 'audio-started' }
  | { type: 'source-ended' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop-after-current'; pageKey: string }
  | { type: 'complete'; status?: 'idle' | 'error'; preservePauseAtStart?: boolean }
  | { type: 'pause-at-start'; pageKey: string }
  | { type: 'unmount' };

export function createStreamingSessionState(): StreamingSessionState {
  return {
    status: 'idle',
    sessionId: 0,
    audioChainId: 0,
    voice: null,
    pageKey: null,
    activeSegmentPageKey: null,
    activeRequestPageKey: null,
    stopAfterCurrentPageKey: null,
    pauseAtStartPageKey: null,
    sourceEnded: true,
    hasStartedAudio: false,
    lastStartReason: null
  };
}

function getStartReason(state: StreamingSessionState, voice: string): StreamingStartReason {
  if (state.voice && state.voice !== voice) {
    return 'voice-change';
  }
  return state.sessionId === 0 ? 'initial' : 'restart';
}

export function transitionStreamingSession(
  state: StreamingSessionState,
  event: StreamingSessionEvent
): StreamingSessionState {
  if (state.status === 'disposed' && event.type !== 'mount') {
    return state;
  }

  switch (event.type) {
    case 'mount':
      return state.status === 'disposed'
        ? {
            ...createStreamingSessionState(),
            sessionId: state.sessionId,
            audioChainId: state.audioChainId
          }
        : state;
    case 'start':
      return {
        ...state,
        status: 'connecting',
        sessionId: state.sessionId + 1,
        audioChainId: state.audioChainId + 1,
        voice: event.voice,
        pageKey: event.pageKey,
        activeSegmentPageKey: null,
        activeRequestPageKey: null,
        stopAfterCurrentPageKey: null,
        pauseAtStartPageKey: event.pauseAtStartOnComplete ? event.pageKey : null,
        sourceEnded: false,
        hasStartedAudio: false,
        lastStartReason: getStartReason(state, event.voice)
      };
    case 'invalidate-audio-chain':
      return {
        ...state,
        audioChainId: state.audioChainId + 1,
        activeSegmentPageKey: null,
        activeRequestPageKey: null,
        hasStartedAudio: false
      };
    case 'begin-audio-chain':
      return {
        ...state,
        audioChainId: state.audioChainId + 1,
        sourceEnded: false
      };
    case 'request-started':
      return { ...state, activeRequestPageKey: event.pageKey, sourceEnded: false };
    case 'request-finished':
      return { ...state, activeRequestPageKey: null };
    case 'segment-started':
      return { ...state, activeSegmentPageKey: event.pageKey, pageKey: event.pageKey };
    case 'audio-started':
      return {
        ...state,
        status: state.status === 'paused' ? 'paused' : 'streaming',
        hasStartedAudio: true
      };
    case 'source-ended':
      return { ...state, activeRequestPageKey: null, sourceEnded: true };
    case 'pause':
      return state.status === 'streaming' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'streaming' } : state;
    case 'stop-after-current':
      return {
        ...state,
        stopAfterCurrentPageKey: event.pageKey,
        pauseAtStartPageKey: event.pageKey
      };
    case 'complete': {
      const pauseAtStartPageKey = event.status !== 'error' && event.preservePauseAtStart !== false
        ? state.pauseAtStartPageKey
        : null;
      return {
        ...state,
        status: pauseAtStartPageKey ? 'paused' : (event.status ?? 'idle'),
        sessionId: state.sessionId + 1,
        pageKey: pauseAtStartPageKey,
        activeSegmentPageKey: null,
        activeRequestPageKey: null,
        stopAfterCurrentPageKey: null,
        pauseAtStartPageKey: null,
        sourceEnded: true,
        hasStartedAudio: false
      };
    }
    case 'pause-at-start':
      return {
        ...state,
        status: 'paused',
        sessionId: state.sessionId + 1,
        pageKey: event.pageKey,
        activeSegmentPageKey: null,
        activeRequestPageKey: null,
        stopAfterCurrentPageKey: null,
        pauseAtStartPageKey: null,
        sourceEnded: true,
        hasStartedAudio: false
      };
    case 'unmount':
      return {
        ...state,
        status: 'disposed',
        sessionId: state.sessionId + 1,
        audioChainId: state.audioChainId + 1,
        pageKey: null,
        activeSegmentPageKey: null,
        activeRequestPageKey: null,
        stopAfterCurrentPageKey: null,
        pauseAtStartPageKey: null,
        sourceEnded: true,
        hasStartedAudio: false
      };
  }
}

export function isCurrentStreamingSession(state: StreamingSessionState, sessionId: number) {
  return state.status !== 'disposed' && state.sessionId === sessionId;
}

export function isCurrentAudioChain(state: StreamingSessionState, audioChainId: number) {
  return state.status !== 'disposed' && state.audioChainId === audioChainId;
}

export function isStreamingPlaybackPaused(state: StreamingSessionState) {
  return state.status === 'paused';
}

export function canEnqueueStreamingAudio(state: StreamingSessionState) {
  return state.sessionId > 0 && state.status !== 'idle' && state.status !== 'error' && state.status !== 'disposed';
}

export function canAcceptStreamingPageAudio(
  state: StreamingSessionState,
  pageKey: string | null
) {
  return !state.stopAfterCurrentPageKey || pageKey === null || pageKey === state.stopAfterCurrentPageKey;
}
