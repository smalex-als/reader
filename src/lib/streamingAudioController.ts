import {
  canAcceptStreamingPageAudio,
  canEnqueueStreamingAudio,
  createStreamingSessionState,
  isCurrentAudioChain,
  isCurrentStreamingSession,
  isStreamingPlaybackPaused,
  transitionStreamingSession,
  type StreamingSessionEvent
} from '@/lib/streamingSessionMachine';
import {
  createSilenceChunk,
  getStreamPcmCacheKey,
  Pcm16Decoder,
  StreamAudioQueue,
  StreamPcmCache,
  type CachedStreamChunk
} from '@/lib/streamingPcm';
import { stripMarkdown } from '@/lib/streamText';
import type { StreamState } from '@/types/app';

const SAMPLE_RATE = 24_000;
const SILENT_FRAME_LIMIT = 4;
const SHORT_SEGMENT_PAUSE_MS = 700;
const MEDIUM_SEGMENT_PAUSE_MS = 700;
const LONG_SEGMENT_PAUSE_MS = 1000;
const MIN_SEGMENT_PLAYBACK_MS = 350;
const STREAM_DRAIN_GRACE_MS = 180;
const STREAM_PCM_CACHE_LIMIT = 5;

export const DEFAULT_STREAM_VOICE = 'en-Mike_man';

export const INITIAL_STREAM_STATE: StreamState = {
  status: 'idle',
  pageKey: null,
  playbackSeconds: 0,
  modelSeconds: 0
};

type OpenPcmStream = (payload: {
  text: string;
  voice: string;
  signal: AbortSignal;
}) => Promise<ReadableStreamDefaultReader<Uint8Array>>;

type StreamingAudioControllerCallbacks = {
  onStateChange: (state: StreamState) => void;
  onSegmentStart: (pageKey: string) => void;
  onToast: (message: string, type: 'info' | 'error') => void;
};

export type StartStreamPayload = {
  text: string;
  pageKey: string;
  voice?: string;
  pauseAfterMs?: number;
  pauseAtStartOnComplete?: boolean;
  replaceCurrent?: boolean;
};

export type EnqueueStreamPayload = {
  text: string;
  pageKey: string;
  voice?: string;
  pauseAfterMs?: number;
};

export type StreamingAudioController = {
  getState: () => StreamState;
  mount: () => void;
  dispose: () => void;
  startStream: (payload: StartStreamPayload) => Promise<void>;
  enqueueStream: (payload: EnqueueStreamPayload) => void;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  stopAfterCurrentStream: () => void;
  pauseStreamAtStart: (pageKey: string) => void;
};

type StreamWorkletMessage = {
  type?: unknown;
  samples?: unknown;
  frames?: unknown;
  pageKey?: unknown;
  silent?: unknown;
};

function countSentences(text: string) {
  return text.match(/[.!?]+(?:\s|$)/g)?.length ?? 0;
}

function getInterSegmentPauseMs(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  const sentenceCount = countSentences(trimmed);
  if (trimmed.length <= 90 || sentenceCount <= 1) {
    return SHORT_SEGMENT_PAUSE_MS;
  }
  if (trimmed.length <= 180 || sentenceCount <= 2) {
    return MEDIUM_SEGMENT_PAUSE_MS;
  }
  return LONG_SEGMENT_PAUSE_MS;
}

function resolveSegmentPauseMs(text: string, explicitPauseMs?: number) {
  if (typeof explicitPauseMs === 'number' && Number.isFinite(explicitPauseMs) && explicitPauseMs >= 0) {
    return Math.round(explicitPauseMs);
  }
  return getInterSegmentPauseMs(text);
}

function createAudioContext() {
  const AudioContextConstructor = window.AudioContext ||
    (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new AudioContextConstructor({ sampleRate: SAMPLE_RATE });
}

export function createStreamingAudioController({
  openPcmStream,
  callbacks
}: {
  openPcmStream: OpenPcmStream;
  callbacks: StreamingAudioControllerCallbacks;
}): StreamingAudioController {
  let streamState = INITIAL_STREAM_STATE;
  let sessionMachine = createStreamingSessionState();
  let audioContext: AudioContext | null = null;
  let worklet: AudioWorkletNode | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let requestAbortController: AbortController | null = null;
  let requestInFlight = false;
  let playbackSamples = 0;
  let bufferSamples = 0;
  let queuedSamples = 0;
  let playbackTimer: number | null = null;
  let finalizeTimer: number | null = null;
  let hasStartedPlayback = false;
  let silentFrames = 0;
  let audioShutdown = Promise.resolve();
  let activeRequestTask: Promise<void> | null = null;
  let streamStop: Promise<void> | null = null;
  const decoder = new Pcm16Decoder();
  const queue = new StreamAudioQueue();
  const cache = new StreamPcmCache(STREAM_PCM_CACHE_LIMIT);

  function transition(event: StreamingSessionEvent) {
    sessionMachine = transitionStreamingSession(sessionMachine, event);
    return sessionMachine;
  }

  function setState(next: StreamState | ((previous: StreamState) => StreamState)) {
    streamState = typeof next === 'function' ? next(streamState) : next;
    callbacks.onStateChange(streamState);
  }

  function stopPlaybackTimer() {
    if (playbackTimer !== null) {
      window.clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  function clearFinalizeTimer() {
    if (finalizeTimer !== null) {
      window.clearTimeout(finalizeTimer);
      finalizeTimer = null;
    }
  }

  function startPlaybackTimer() {
    stopPlaybackTimer();
    playbackTimer = window.setInterval(() => {
      setState((previous) => ({
        ...previous,
        playbackSeconds: playbackSamples / SAMPLE_RATE
      }));
    }, 250);
  }

  function silencePlayback() {
    transition({ type: 'invalidate-audio-chain' });
    stopPlaybackTimer();
    clearFinalizeTimer();
    playbackSamples = 0;
    bufferSamples = 0;
    queuedSamples = 0;
    hasStartedPlayback = false;
    silentFrames = 0;
    decoder.reset();

    const staleWorklet = worklet;
    worklet = null;
    if (staleWorklet) {
      try {
        staleWorklet.port.onmessage = null;
        staleWorklet.port.postMessage({ type: 'reset' });
      } catch {
        // Ignore stale worklet errors during shutdown.
      }
      try {
        staleWorklet.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown.
      }
      try {
        staleWorklet.port.close();
      } catch {
        // Ignore port close errors during shutdown.
      }
    }

    const staleContext = audioContext;
    audioContext = null;
    if (staleContext) {
      const closeContext = staleContext.state === 'closed'
        ? Promise.resolve()
        : staleContext.close().catch(() => {});
      audioShutdown = audioShutdown.then(() => closeContext, () => closeContext);
    }
  }

  function closeStreamRequest() {
    const staleReader = reader;
    reader = null;
    const staleAbortController = requestAbortController;
    requestAbortController = null;
    staleAbortController?.abort();
    const cancelReader = staleReader
      ? staleReader.cancel().catch(() => {})
      : Promise.resolve();
    const settleRequest = activeRequestTask?.catch(() => {}) ?? Promise.resolve();
    requestInFlight = false;
    transition({ type: 'request-finished' });
    return Promise.all([cancelReader, settleRequest]).then(() => undefined);
  }

  function finalizeStream(
    status: StreamState['status'] = 'idle',
    error?: string,
    preservePauseAtStart = true
  ) {
    const completedSession = transition({
      type: 'complete',
      status: status === 'error' ? 'error' : 'idle',
      preservePauseAtStart
    });
    queue.clear();
    const playedSeconds = playbackSamples / SAMPLE_RATE;
    silencePlayback();
    closeStreamRequest();
    const nextState: StreamState = completedSession.status === 'paused' && completedSession.pageKey
      ? {
          ...INITIAL_STREAM_STATE,
          status: 'paused',
          pageKey: completedSession.pageKey,
          playbackSeconds: 0,
          error: undefined
        }
      : {
          ...INITIAL_STREAM_STATE,
          status,
          pageKey: null,
          playbackSeconds: playedSeconds,
          error
        };
    setState(nextState);
    if (status === 'error' && error) {
      callbacks.onToast(error, 'error');
    }
  }

  function pauseCompletedStreamAtStart(pageKey: string) {
    transition({ type: 'pause-at-start', pageKey });
    queue.clear();
    closeStreamRequest();
    silencePlayback();
    setState({
      ...INITIAL_STREAM_STATE,
      status: 'paused',
      pageKey,
      playbackSeconds: 0,
      error: undefined
    });
  }

  function handleWorkletMessage(data: StreamWorkletMessage) {
    if (!data || typeof data.type !== 'string') {
      return;
    }
    if (data.type === 'trimmed' && typeof data.samples === 'number') {
      bufferSamples = Math.max(0, bufferSamples - data.samples);
      queuedSamples = Math.max(0, queuedSamples - data.samples);
      return;
    }
    if (data.type !== 'played' || typeof data.frames !== 'number') {
      return;
    }
    playbackSamples += data.frames;

    if (typeof data.pageKey === 'string' && data.pageKey !== sessionMachine.activeSegmentPageKey) {
      transition({ type: 'segment-started', pageKey: data.pageKey });
      setState((previous) => ({ ...previous, pageKey: data.pageKey as string }));
    }
    if (!data.silent && !hasStartedPlayback) {
      hasStartedPlayback = true;
      startPlaybackTimer();
    }
    silentFrames = data.silent ? silentFrames + 1 : 0;
    bufferSamples = Math.max(0, bufferSamples - data.frames);

    const shouldStop = sessionMachine.sourceEnded &&
      bufferSamples === 0 &&
      silentFrames >= SILENT_FRAME_LIMIT;
    if (!shouldStop) {
      clearFinalizeTimer();
      return;
    }
    if (finalizeTimer === null) {
      finalizeTimer = window.setTimeout(() => {
        finalizeTimer = null;
        const pauseAtStartPageKey = sessionMachine.pauseAtStartPageKey;
        if (pauseAtStartPageKey) {
          pauseCompletedStreamAtStart(pauseAtStartPageKey);
          return;
        }
        finalizeStream();
      }, STREAM_DRAIN_GRACE_MS);
    }
  }

  async function createAudioChain(sessionId: number) {
    silencePlayback();
    await audioShutdown;
    if (!isCurrentStreamingSession(sessionMachine, sessionId)) {
      return false;
    }
    const audioChainId = transition({ type: 'begin-audio-chain' }).audioChainId;
    const context = createAudioContext();
    await context.audioWorklet.addModule('/stream-worklet.js');
    if (
      !isCurrentStreamingSession(sessionMachine, sessionId) ||
      !isCurrentAudioChain(sessionMachine, audioChainId)
    ) {
      void context.close().catch(() => {});
      return false;
    }
    const node = new AudioWorkletNode(context, 'stream-player');
    node.port.onmessage = (event) => {
      if (isCurrentAudioChain(sessionMachine, audioChainId)) {
        handleWorkletMessage(event.data as StreamWorkletMessage);
      }
    };
    node.connect(context.destination);
    audioContext = context;
    worklet = node;
    return true;
  }

  async function resumePlaybackContext(sessionId: number) {
    if (isStreamingPlaybackPaused(sessionMachine) || !isCurrentStreamingSession(sessionMachine, sessionId)) {
      return false;
    }
    const context = audioContext;
    if (!context || context.state === 'closed') {
      return false;
    }
    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    if (isStreamingPlaybackPaused(sessionMachine) || !isCurrentStreamingSession(sessionMachine, sessionId)) {
      if (context.state === 'running') {
        try {
          await context.suspend();
        } catch {
          // Ignore suspend errors for stale sessions.
        }
      }
      return false;
    }
    return true;
  }

  function appendAudio(chunk: Float32Array, pageKey: string | null) {
    if (!canAcceptStreamingPageAudio(sessionMachine, pageKey)) {
      return;
    }
    bufferSamples += chunk.length;
    queuedSamples += chunk.length;
    if (!worklet) {
      return;
    }
    try {
      worklet.port.postMessage(
        { type: 'append', payload: chunk.buffer, pageKey },
        [chunk.buffer]
      );
    } catch (error) {
      console.error('Failed to append audio to worklet', error);
    }
  }

  function appendSilence(durationMs: number) {
    const silenceChunk = createSilenceChunk(durationMs, SAMPLE_RATE);
    if (silenceChunk) {
      appendAudio(silenceChunk, null);
    }
  }

  async function runQueuedRequest(sessionId: number): Promise<void> {
    if (!isCurrentStreamingSession(sessionMachine, sessionId) || reader || requestInFlight) {
      return;
    }
    requestInFlight = true;
    const nextItem = queue.dequeue();
    if (!nextItem) {
      requestInFlight = false;
      transition({ type: 'source-ended' });
      return;
    }

    callbacks.onSegmentStart(nextItem.pageKey);
    transition({ type: 'request-started', pageKey: nextItem.pageKey });
    const voice = nextItem.voice || DEFAULT_STREAM_VOICE;
    const cacheKey = getStreamPcmCacheKey(nextItem.text, nextItem.pageKey, voice);
    const cachedChunks = cache.get(cacheKey);
    let receivedSegmentAudio = false;
    let receivedSampleCount = 0;
    setState((previous) => ({
      ...previous,
      modelSeconds: 0,
      error: undefined,
      status: sessionMachine.hasStartedAudio ? previous.status : 'connecting'
    }));

    if (cachedChunks) {
      requestInFlight = false;
      transition({ type: 'request-finished' });
      await resumePlaybackContext(sessionId);
      if (!isCurrentStreamingSession(sessionMachine, sessionId)) {
        return;
      }
      const audioStartedSession = transition({ type: 'audio-started' });
      setState((previous) => ({
        ...previous,
        status: audioStartedSession.status === 'paused' || previous.status === 'paused'
          ? 'paused'
          : 'streaming'
      }));
      for (const cachedChunk of cachedChunks) {
        if (!isCurrentStreamingSession(sessionMachine, sessionId)) {
          return;
        }
        appendAudio(cachedChunk.samples, cachedChunk.pageKey);
      }
      if (sessionMachine.stopAfterCurrentPageKey) {
        queue.clear();
        transition({ type: 'source-ended' });
        return;
      }
      if (queue.size > 0) {
        if (nextItem.pauseAfterMs > 0) {
          appendSilence(nextItem.pauseAfterMs);
        }
        void startQueuedRequest(sessionId);
        return;
      }
      transition({ type: 'source-ended' });
      return;
    }

    console.info(
      `[TTS stream text]\npageKey: ${nextItem.pageKey}\nvoice: ${voice}\n---\n${nextItem.text}\n---`
    );

    try {
      const segmentChunks: CachedStreamChunk[] = [];
      const abortController = new AbortController();
      requestAbortController = abortController;
      reader = await openPcmStream({ text: nextItem.text, voice, signal: abortController.signal });
      requestInFlight = false;
      await resumePlaybackContext(sessionId);

      while (isCurrentStreamingSession(sessionMachine, sessionId)) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (!value || value.byteLength === 0) {
          continue;
        }
        const floatChunk = decoder.decode(value);
        if (!floatChunk || floatChunk.length === 0) {
          continue;
        }
        segmentChunks.push({ samples: floatChunk.slice(), pageKey: nextItem.pageKey });
        appendAudio(floatChunk, nextItem.pageKey);
        receivedSampleCount += floatChunk.length;
        if (!receivedSegmentAudio) {
          receivedSegmentAudio = true;
          const audioStartedSession = transition({ type: 'audio-started' });
          setState((previous) => ({
            ...previous,
            status: audioStartedSession.status === 'paused' || previous.status === 'paused'
              ? 'paused'
              : 'streaming'
          }));
        }
      }

      if (receivedSampleCount > 0) {
        const minSampleCount = Math.round((MIN_SEGMENT_PLAYBACK_MS / 1000) * SAMPLE_RATE);
        if (receivedSampleCount < minSampleCount) {
          const missingDurationMs = ((minSampleCount - receivedSampleCount) / SAMPLE_RATE) * 1000;
          const silenceChunk = createSilenceChunk(missingDurationMs, SAMPLE_RATE);
          if (silenceChunk) {
            segmentChunks.push({ samples: silenceChunk.slice(), pageKey: null });
            appendAudio(silenceChunk, null);
          }
        }
      }

      reader = null;
      requestAbortController = null;
      requestInFlight = false;
      decoder.reset();
      if (!isCurrentStreamingSession(sessionMachine, sessionId)) {
        return;
      }
      transition({ type: 'request-finished' });
      if (receivedSampleCount > 0) {
        cache.set(cacheKey, segmentChunks);
      }
      if (sessionMachine.stopAfterCurrentPageKey) {
        queue.clear();
        transition({ type: 'source-ended' });
        return;
      }
      if (queue.size > 0) {
        if (nextItem.pauseAfterMs > 0) {
          appendSilence(nextItem.pauseAfterMs);
        }
        void startQueuedRequest(sessionId);
        return;
      }
      transition({ type: 'source-ended' });
    } catch (error) {
      requestInFlight = false;
      const sessionIsCurrent = isCurrentStreamingSession(sessionMachine, sessionId);
      if (sessionIsCurrent) {
        transition({ type: 'request-finished' });
      }
      if ((error as Error)?.name === 'AbortError') {
        if (sessionIsCurrent) {
          transition({ type: 'source-ended' });
        }
        return;
      }
      if (!sessionIsCurrent) {
        return;
      }
      console.error('Unable to start stream', error);
      finalizeStream('error', 'Unable to start stream');
    }
  }

  function startQueuedRequest(sessionId: number): Promise<void> {
    let task: Promise<void>;
    task = runQueuedRequest(sessionId).finally(() => {
      if (activeRequestTask === task) {
        activeRequestTask = null;
      }
    });
    activeRequestTask = task;
    return task;
  }

  async function startStream({
    text,
    pageKey,
    voice,
    pauseAfterMs,
    pauseAtStartOnComplete = false,
    replaceCurrent = false
  }: StartStreamPayload) {
    if (streamStop) {
      await streamStop;
    }
    const cleaned = stripMarkdown(text).trim();
    if (!cleaned) {
      callbacks.onToast('No text available to stream', 'error');
      return;
    }
    const currentStatus = streamState.status;
    const replacingPausedStream = replaceCurrent && currentStatus === 'paused';
    if (
      !replacingPausedStream &&
      (currentStatus === 'connecting' || currentStatus === 'streaming' || currentStatus === 'paused')
    ) {
      callbacks.onToast('Audio stream already running', 'info');
      return;
    }
    const resolvedVoice = voice || DEFAULT_STREAM_VOICE;
    const sessionId = transition({
      type: 'start',
      pageKey,
      voice: resolvedVoice,
      pauseAtStartOnComplete
    }).sessionId;
    queue.clear();
    queue.enqueue({
      text: cleaned,
      pageKey,
      voice: resolvedVoice,
      pauseAfterMs: resolveSegmentPauseMs(cleaned, pauseAfterMs)
    });
    setState({
      status: 'connecting',
      pageKey,
      playbackSeconds: 0,
      modelSeconds: 0,
      error: undefined
    });

    try {
      if (!await createAudioChain(sessionId)) {
        return;
      }
    } catch (error) {
      console.error('Unable to create audio worklet', error);
      finalizeStream('error', 'Audio setup failed');
      return;
    }
    try {
      await startQueuedRequest(sessionId);
    } catch (error) {
      console.error('Unable to start stream', error);
      finalizeStream('error', 'Unable to start stream');
    }
  }

  function enqueueStream({ text, pageKey, voice, pauseAfterMs }: EnqueueStreamPayload) {
    const cleaned = stripMarkdown(text).trim();
    if (!cleaned || !canEnqueueStreamingAudio(sessionMachine)) {
      return;
    }
    queue.enqueue({
      text: cleaned,
      pageKey,
      voice: voice || DEFAULT_STREAM_VOICE,
      pauseAfterMs: resolveSegmentPauseMs(cleaned, pauseAfterMs)
    });
    if (worklet && !reader && !requestInFlight) {
      void startQueuedRequest(sessionMachine.sessionId);
    }
  }

  async function pauseStream() {
    if (streamState.status !== 'streaming') {
      return;
    }
    transition({ type: 'pause' });
    stopPlaybackTimer();
    setState((previous) => ({ ...previous, status: 'paused' }));
    if (audioContext?.state === 'running') {
      try {
        await audioContext.suspend();
      } catch {
        // Ignore suspend errors.
      }
    }
  }

  async function resumeStream() {
    if (streamState.status !== 'paused') {
      return;
    }
    const sessionId = sessionMachine.sessionId;
    const context = audioContext;
    if (context && context.state !== 'running') {
      try {
        await context.resume();
      } catch {
        // Ignore resume errors.
      }
    }
    if (!isCurrentStreamingSession(sessionMachine, sessionId) || sessionMachine.status !== 'paused') {
      if (context?.state === 'running') {
        void context.suspend().catch(() => {});
      }
      return;
    }
    const resumedSession = transition({ type: 'resume' });
    if (resumedSession.hasStartedAudio || hasStartedPlayback) {
      startPlaybackTimer();
    }
    setState((previous) => ({ ...previous, status: 'streaming' }));
  }

  function stopStream() {
    if (streamStop) {
      return streamStop;
    }
    if (streamState.status === 'idle') {
      return Promise.resolve();
    }
    transition({ type: 'source-ended' });
    queue.clear();
    const completedSession = transition({
      type: 'complete',
      status: 'idle',
      preservePauseAtStart: false
    });
    const playedSeconds = playbackSamples / SAMPLE_RATE;
    silencePlayback();
    const requestShutdown = closeStreamRequest();
    const audioChainShutdown = audioShutdown;
    const stoppedSessionId = completedSession.sessionId;
    streamStop = Promise.all([requestShutdown, audioChainShutdown])
      .then(() => {
        if (
          sessionMachine.status !== 'disposed' &&
          sessionMachine.sessionId === stoppedSessionId
        ) {
          setState({
            ...INITIAL_STREAM_STATE,
            playbackSeconds: playedSeconds
          });
        }
      })
      .finally(() => {
        streamStop = null;
      });
    return streamStop;
  }

  function stopAfterCurrentStream() {
    const pageKey = sessionMachine.activeSegmentPageKey ?? streamState.pageKey;
    if (!pageKey) {
      queue.clear();
      return;
    }
    transition({ type: 'stop-after-current', pageKey });
    queue.clear();
    worklet?.port.postMessage({ type: 'trim-after-page-key', pageKey });
    const activeRequestPageKey = sessionMachine.activeRequestPageKey;
    if (activeRequestPageKey && activeRequestPageKey !== pageKey) {
      closeStreamRequest();
      transition({ type: 'source-ended' });
    }
  }

  function pauseStreamAtStart(pageKey: string) {
    transition({ type: 'pause-at-start', pageKey });
    queue.clear();
    closeStreamRequest();
    silencePlayback();
    setState({
      ...INITIAL_STREAM_STATE,
      status: 'paused',
      pageKey,
      playbackSeconds: 0,
      error: undefined
    });
  }

  function mount() {
    transition({ type: 'mount' });
  }

  function dispose() {
    transition({ type: 'unmount' });
    queue.clear();
    silencePlayback();
    closeStreamRequest();
  }

  return {
    getState: () => streamState,
    mount,
    dispose,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream,
    stopAfterCurrentStream,
    pauseStreamAtStart
  };
}
