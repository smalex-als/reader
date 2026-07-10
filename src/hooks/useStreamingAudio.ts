import { useCallback, useEffect, useRef, useState } from 'react';
import { openStreamPcmReader } from '@/api/streamingAudio';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
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
import { useSetStreamRuntime } from '@/state/streamRuntimeStore';
import type { StreamState } from '@/types/app';
import { stripMarkdown } from '@/lib/streamText';

const SAMPLE_RATE = 24_000;
const SILENT_FRAME_LIMIT = 4;
export const DEFAULT_STREAM_VOICE = 'en-Mike_man';
const SHORT_SEGMENT_PAUSE_MS = 700;
const MEDIUM_SEGMENT_PAUSE_MS = 700;
const LONG_SEGMENT_PAUSE_MS = 1000;
const MIN_SEGMENT_PLAYBACK_MS = 350;
const STREAM_DRAIN_GRACE_MS = 180;
const STREAM_PCM_CACHE_LIMIT = 5;

type QueuedStreamItem = {
  text: string;
  pageKey: string;
  voice: string;
  pauseAfterMs: number;
};

type CachedStreamChunk = {
  samples: Float32Array;
  pageKey: string | null;
};

type StreamingAudioPayloads = {
  openPcmStream: {
    text: string;
    voice: string;
    signal: AbortSignal;
  };
};

type StreamingAudioActions = {
  setReader: (reader: ReadableStreamDefaultReader<Uint8Array>) => void;
};

const streamingAudioHandlers = createActionHandlerRegistry<
  null,
  StreamingAudioActions,
  StreamingAudioPayloads
>();
const { addActionHandler } = streamingAudioHandlers;

addActionHandler('openPcmStream', async (_state, actions, payload): Promise<void> => {
  const reader = await openStreamPcmReader(payload);
  actions.setReader(reader);
});

const INITIAL_STREAM_STATE: StreamState = {
  status: 'idle',
  pageKey: null,
  playbackSeconds: 0,
  modelSeconds: 0
};

function countSentences(text: string) {
  const matches = text.match(/[.!?]+(?:\s|$)/g);
  return matches?.length ?? 0;
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

function getStreamPcmCacheKey(text: string, pageKey: string, voice: string) {
  return `${voice}\u001f${pageKey}\u001f${text}`;
}

export function useStreamingAudio({
  onSegmentStart
}: {
  onSegmentStart?: (pageKey: string) => void;
} = {}) {
  const setStreamRuntime = useSetStreamRuntime();
  const { showToast } = useToast();
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const disposeStreamRef = useRef<() => void>(() => {});
  const streamStateRef = useRef<StreamState>(INITIAL_STREAM_STATE);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);
  const pcmRemainderRef = useRef<Uint8Array | null>(null);
  const playbackSamplesRef = useRef(0);
  const bufferSamplesRef = useRef(0);
  const queuedSamplesRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);
  const hasStartedPlaybackRef = useRef(false);
  const silentFramesRef = useRef(0);
  const sessionMachineRef = useRef(createStreamingSessionState());
  const audioShutdownRef = useRef<Promise<void>>(Promise.resolve());
  const queueRef = useRef<QueuedStreamItem[]>([]);
  const pcmCacheRef = useRef<Map<string, CachedStreamChunk[]>>(new Map());
  const onSegmentStartRef = useRef(onSegmentStart);

  const transitionSession = useCallback((event: StreamingSessionEvent) => {
    const nextState = transitionStreamingSession(sessionMachineRef.current, event);
    sessionMachineRef.current = nextState;
    return nextState;
  }, []);

  useEffect(() => {
    onSegmentStartRef.current = onSegmentStart;
  }, [onSegmentStart]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  const cachePcmSegment = useCallback((cacheKey: string, chunks: CachedStreamChunk[]) => {
    if (chunks.length === 0) {
      return;
    }
    const cache = pcmCacheRef.current;
    cache.delete(cacheKey);
    cache.set(
      cacheKey,
      chunks.map((chunk) => ({
        pageKey: chunk.pageKey,
        samples: chunk.samples.slice()
      }))
    );
    while (cache.size > STREAM_PCM_CACHE_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      cache.delete(oldestKey);
    }
  }, []);

  useEffect(() => {
    streamStateRef.current = streamState;
    setStreamRuntime(streamState);
  }, [setStreamRuntime, streamState]);

  const stopPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current !== null) {
      window.clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current !== null) {
      window.clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const startPlaybackTimer = useCallback(() => {
    stopPlaybackTimer();
    playbackTimerRef.current = window.setInterval(() => {
      setStreamState((prev) => ({
        ...prev,
        playbackSeconds: playbackSamplesRef.current / SAMPLE_RATE
      }));
    }, 250);
  }, [stopPlaybackTimer]);

  const silencePlayback = useCallback(() => {
    transitionSession({ type: 'invalidate-audio-chain' });
    stopPlaybackTimer();
    clearFinalizeTimer();
    playbackSamplesRef.current = 0;
    bufferSamplesRef.current = 0;
    queuedSamplesRef.current = 0;
    hasStartedPlaybackRef.current = false;
    silentFramesRef.current = 0;
    pcmRemainderRef.current = null;

    const node = workletRef.current;
    workletRef.current = null;
    if (node) {
      try {
        node.port.onmessage = null;
        node.port.postMessage({ type: 'reset' });
      } catch {
        // ignore stale worklet errors
      }
      try {
        node.disconnect();
      } catch {
        // ignore disconnect errors
      }
      try {
        node.port.close();
      } catch {
        // ignore port close errors
      }
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) {
      const closeContext = ctx.state === 'closed' ? Promise.resolve() : ctx.close().catch(() => {});
      audioShutdownRef.current = audioShutdownRef.current.then(
        () => closeContext,
        () => closeContext
      );
    }
  }, [clearFinalizeTimer, stopPlaybackTimer, transitionSession]);

  const closeStreamRequest = useCallback(() => {
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      void reader.cancel().catch(() => {});
    }
    const abortController = requestAbortRef.current;
    requestAbortRef.current = null;
    abortController?.abort();
    requestInFlightRef.current = false;
    transitionSession({ type: 'request-finished' });
  }, [transitionSession]);

  const finalizeStream = useCallback(
    (status: StreamState['status'] = 'idle', error?: string) => {
      const completedSession = transitionSession({
        type: 'complete',
        status: status === 'error' ? 'error' : 'idle'
      });
      clearQueue();
      const playedSeconds = playbackSamplesRef.current / SAMPLE_RATE;
      silencePlayback();
      closeStreamRequest();
      const nextState = completedSession.status === 'paused' && completedSession.pageKey
        ? {
            ...INITIAL_STREAM_STATE,
            status: 'paused' as const,
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
      streamStateRef.current = nextState;
      setStreamState(nextState);
      if (status === 'error' && error) {
        showToast(error, 'error');
      }
    },
    [clearQueue, closeStreamRequest, showToast, silencePlayback, transitionSession]
  );

  const pauseCompletedStreamAtStart = useCallback(
    (pageKey: string) => {
      transitionSession({ type: 'pause-at-start', pageKey });
      clearQueue();
      closeStreamRequest();
      silencePlayback();
      const nextState: StreamState = {
        ...INITIAL_STREAM_STATE,
        status: 'paused',
        pageKey,
        playbackSeconds: 0,
        error: undefined
      };
      streamStateRef.current = nextState;
      setStreamState(nextState);
    },
    [clearQueue, closeStreamRequest, silencePlayback, transitionSession]
  );

  const disposeStream = useCallback(() => {
    transitionSession({ type: 'unmount' });
    clearQueue();
    silencePlayback();
    closeStreamRequest();
  }, [clearQueue, closeStreamRequest, silencePlayback, transitionSession]);

  useEffect(() => {
    disposeStreamRef.current = disposeStream;
  }, [disposeStream]);

  useEffect(() => {
    transitionSession({ type: 'mount' });
    return () => {
      disposeStreamRef.current();
    };
  }, [transitionSession]);

  const handleWorkletMessage = useCallback(
    (data: any) => {
      if (!data || typeof data.type !== 'string') {
        return;
      }
      if (data.type === 'trimmed' && typeof data.samples === 'number') {
        bufferSamplesRef.current = Math.max(0, bufferSamplesRef.current - data.samples);
        queuedSamplesRef.current = Math.max(0, queuedSamplesRef.current - data.samples);
        return;
      }
      if (data.type !== 'played' || typeof data.frames !== 'number') {
        return;
      }
      const frames = data.frames;
      playbackSamplesRef.current += frames;

      if (
        typeof data.pageKey === 'string' &&
        data.pageKey !== sessionMachineRef.current.activeSegmentPageKey
      ) {
        transitionSession({ type: 'segment-started', pageKey: data.pageKey });
        setStreamState((prev) => ({ ...prev, pageKey: data.pageKey }));
      }

      if (!data.silent && !hasStartedPlaybackRef.current) {
        hasStartedPlaybackRef.current = true;
        startPlaybackTimer();
      }

      if (data.silent) {
        silentFramesRef.current += 1;
      } else {
        silentFramesRef.current = 0;
      }

      bufferSamplesRef.current = Math.max(0, bufferSamplesRef.current - frames);

      const shouldStop =
        sessionMachineRef.current.sourceEnded &&
        bufferSamplesRef.current === 0 &&
        silentFramesRef.current >= SILENT_FRAME_LIMIT;
      if (shouldStop) {
        if (finalizeTimerRef.current === null) {
          finalizeTimerRef.current = window.setTimeout(() => {
            finalizeTimerRef.current = null;
            const pauseAtStartPageKey = sessionMachineRef.current.pauseAtStartPageKey;
            if (pauseAtStartPageKey) {
              pauseCompletedStreamAtStart(pauseAtStartPageKey);
              return;
            }
            finalizeStream();
          }, STREAM_DRAIN_GRACE_MS);
        }
      } else {
        clearFinalizeTimer();
      }
    },
    [clearFinalizeTimer, finalizeStream, pauseCompletedStreamAtStart, startPlaybackTimer, transitionSession]
  );

  const createAudioChain = useCallback(async (sessionId: number) => {
    silencePlayback();
    await audioShutdownRef.current;
    if (!isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
      return false;
    }
    const audioChainSession = transitionSession({ type: 'begin-audio-chain' }).audioChainId;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    await ctx.audioWorklet.addModule('/stream-worklet.js');
    if (
      !isCurrentStreamingSession(sessionMachineRef.current, sessionId) ||
      !isCurrentAudioChain(sessionMachineRef.current, audioChainSession)
    ) {
      void ctx.close().catch(() => {});
      return false;
    }
    const node = new AudioWorkletNode(ctx, 'stream-player');
    node.port.onmessage = (event) => {
      if (!isCurrentAudioChain(sessionMachineRef.current, audioChainSession)) {
        return;
      }
      handleWorkletMessage(event.data);
    };
    node.connect(ctx.destination);
    audioCtxRef.current = ctx;
    workletRef.current = node;
    return true;
  }, [handleWorkletMessage, silencePlayback, transitionSession]);

  const resumePlaybackContext = useCallback(async (sessionId: number) => {
    if (
      isStreamingPlaybackPaused(sessionMachineRef.current) ||
      !isCurrentStreamingSession(sessionMachineRef.current, sessionId)
    ) {
      return false;
    }
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      return false;
    }
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    if (
      isStreamingPlaybackPaused(sessionMachineRef.current) ||
      !isCurrentStreamingSession(sessionMachineRef.current, sessionId)
    ) {
      if (ctx.state === 'running') {
        try {
          await ctx.suspend();
        } catch {
          // ignore suspend errors
        }
      }
      return false;
    }
    return true;
  }, []);

  const appendAudio = useCallback((chunk: Float32Array, pageKey: string | null) => {
    if (!canAcceptStreamingPageAudio(sessionMachineRef.current, pageKey)) {
      return;
    }
    bufferSamplesRef.current += chunk.length;
    queuedSamplesRef.current += chunk.length;
    const node = workletRef.current;
    if (!node) {
      return;
    }
    try {
      node.port.postMessage({ type: 'append', payload: chunk.buffer, pageKey }, [chunk.buffer]);
    } catch (error) {
      console.error('Failed to append audio to worklet', error);
    }
  }, []);

  const createSilenceChunk = useCallback((durationMs: number) => {
    if (durationMs <= 0) {
      return null;
    }
    const sampleCount = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
    return new Float32Array(sampleCount);
  }, []);

  const appendSilence = useCallback((durationMs: number) => {
    const silenceChunk = createSilenceChunk(durationMs);
    if (!silenceChunk) {
      return;
    }
    appendAudio(silenceChunk, null);
  }, [appendAudio, createSilenceChunk]);

  const openPcmStream = useCallback(
    async (
      payload: StreamingAudioPayloads['openPcmStream']
    ): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
      await streamingAudioHandlers.runAction(
        'openPcmStream',
        null,
        {
          setReader: (reader) => {
            readerRef.current = reader;
          }
        },
        payload
      );
      const streamReader = readerRef.current;
      if (!streamReader) {
        throw new Error('Streaming request failed');
      }
      return streamReader;
    },
    []
  );

  const startQueuedRequest = useCallback(
    async (sessionId: number) => {
      if (!isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
        return;
      }
      if (readerRef.current || requestInFlightRef.current) {
        return;
      }
      requestInFlightRef.current = true;
      const nextItem = queueRef.current.shift();
      if (!nextItem) {
        requestInFlightRef.current = false;
        transitionSession({ type: 'source-ended' });
        return;
      }

      onSegmentStartRef.current?.(nextItem.pageKey);
      transitionSession({ type: 'request-started', pageKey: nextItem.pageKey });
      const cacheKey = getStreamPcmCacheKey(nextItem.text, nextItem.pageKey, nextItem.voice || DEFAULT_STREAM_VOICE);
      const cachedChunks = pcmCacheRef.current.get(cacheKey);
      let receivedSegmentAudio = false;
      let receivedSampleCount = 0;
      setStreamState((prev) => ({
        ...prev,
        modelSeconds: 0,
        error: undefined,
        status: sessionMachineRef.current.hasStartedAudio ? prev.status : 'connecting'
      }));

      if (cachedChunks) {
        pcmCacheRef.current.delete(cacheKey);
        pcmCacheRef.current.set(cacheKey, cachedChunks);
        requestInFlightRef.current = false;
        transitionSession({ type: 'request-finished' });
        await resumePlaybackContext(sessionId);
        if (!isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
          return;
        }
        const audioStartedSession = transitionSession({ type: 'audio-started' });
        setStreamState((prev) => ({
          ...prev,
          status: audioStartedSession.status === 'paused' || prev.status === 'paused' ? 'paused' : 'streaming'
        }));
        for (const cachedChunk of cachedChunks) {
          if (!isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
            return;
          }
          appendAudio(cachedChunk.samples.slice(), cachedChunk.pageKey);
        }
        if (sessionMachineRef.current.stopAfterCurrentPageKey) {
          clearQueue();
          transitionSession({ type: 'source-ended' });
          return;
        }
        if (queueRef.current.length > 0) {
          if (nextItem.pauseAfterMs > 0) {
            appendSilence(nextItem.pauseAfterMs);
          }
          void startQueuedRequest(sessionId);
          return;
        }
        transitionSession({ type: 'source-ended' });
        return;
      }

      console.info(
        `[TTS stream text]\npageKey: ${nextItem.pageKey}\nvoice: ${nextItem.voice || DEFAULT_STREAM_VOICE}\n---\n${nextItem.text}\n---`
      );

      try {
        const segmentChunks: CachedStreamChunk[] = [];
        const abortController = new AbortController();
        requestAbortRef.current = abortController;
        const reader = await openPcmStream({
          text: nextItem.text,
          voice: nextItem.voice || DEFAULT_STREAM_VOICE,
          signal: abortController.signal
        });
        requestInFlightRef.current = false;
        await resumePlaybackContext(sessionId);

        while (isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (!value || value.byteLength === 0) {
            continue;
          }
          const combined = pcmRemainderRef.current
            ? (() => {
                const next = new Uint8Array(pcmRemainderRef.current.byteLength + value.byteLength);
                next.set(pcmRemainderRef.current, 0);
                next.set(value, pcmRemainderRef.current.byteLength);
                pcmRemainderRef.current = null;
                return next;
              })()
            : value;
          const evenByteLength = combined.byteLength - (combined.byteLength % 2);
          if (evenByteLength <= 0) {
            pcmRemainderRef.current = combined;
            continue;
          }
          if (evenByteLength < combined.byteLength) {
            pcmRemainderRef.current = combined.slice(evenByteLength);
          }
          const sampleCount = Math.floor(evenByteLength / 2);
          if (sampleCount <= 0) {
            continue;
          }
          const view = new DataView(combined.buffer, combined.byteOffset, evenByteLength);
          const floatChunk = new Float32Array(sampleCount);
          for (let index = 0; index < sampleCount; index += 1) {
            floatChunk[index] = view.getInt16(index * 2, true) / 32768;
          }
          segmentChunks.push({ samples: floatChunk.slice(), pageKey: nextItem.pageKey });
          appendAudio(floatChunk, nextItem.pageKey);
          receivedSampleCount += sampleCount;
          if (!receivedSegmentAudio) {
            receivedSegmentAudio = true;
            const audioStartedSession = transitionSession({ type: 'audio-started' });
            setStreamState((prev) => ({
              ...prev,
              status: audioStartedSession.status === 'paused' || prev.status === 'paused' ? 'paused' : 'streaming'
            }));
          }
        }

        if (receivedSampleCount > 0) {
          const minSampleCount = Math.round((MIN_SEGMENT_PLAYBACK_MS / 1000) * SAMPLE_RATE);
          if (receivedSampleCount < minSampleCount) {
            const missingDurationMs = ((minSampleCount - receivedSampleCount) / SAMPLE_RATE) * 1000;
            const silenceChunk = createSilenceChunk(missingDurationMs);
            if (silenceChunk) {
              segmentChunks.push({ samples: silenceChunk.slice(), pageKey: null });
              appendAudio(silenceChunk, null);
            }
          }
        }

        readerRef.current = null;
        requestAbortRef.current = null;
        requestInFlightRef.current = false;
        if (!isCurrentStreamingSession(sessionMachineRef.current, sessionId)) {
          return;
        }
        transitionSession({ type: 'request-finished' });
        if (receivedSampleCount > 0) {
          cachePcmSegment(cacheKey, segmentChunks);
        }
        if (sessionMachineRef.current.stopAfterCurrentPageKey) {
          clearQueue();
          transitionSession({ type: 'source-ended' });
          return;
        }
        if (queueRef.current.length > 0) {
          if (nextItem.pauseAfterMs > 0) {
            appendSilence(nextItem.pauseAfterMs);
          }
          void startQueuedRequest(sessionId);
          return;
        }
        transitionSession({ type: 'source-ended' });
      } catch (error) {
        requestInFlightRef.current = false;
        const sessionIsCurrent = isCurrentStreamingSession(sessionMachineRef.current, sessionId);
        if (sessionIsCurrent) {
          transitionSession({ type: 'request-finished' });
        }
        if ((error as Error)?.name === 'AbortError') {
          if (sessionIsCurrent) {
            transitionSession({ type: 'source-ended' });
          }
          return;
        }
        if (!sessionIsCurrent) {
          return;
        }
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [
      appendAudio,
      appendSilence,
      clearQueue,
      finalizeStream,
      openPcmStream,
      resumePlaybackContext,
      transitionSession
    ]
  );

  const startStream = useCallback(
    async ({
      text,
      pageKey,
      voice,
      pauseAtStartOnComplete = false,
      replaceCurrent = false
    }: {
      text: string;
      pageKey: string;
      voice?: string;
      pauseAtStartOnComplete?: boolean;
      replaceCurrent?: boolean;
    }) => {
      const cleaned = stripMarkdown(text).trim();
      if (!cleaned) {
        showToast('No text available to stream', 'error');
        return;
      }
      const currentStatus = streamStateRef.current.status;
      const replacingPausedStream = replaceCurrent && currentStatus === 'paused';
      if (
        !replacingPausedStream &&
        (currentStatus === 'connecting' ||
          currentStatus === 'streaming' ||
          currentStatus === 'paused')
      ) {
        showToast('Audio stream already running', 'info');
        return;
      }
      const resolvedVoice = voice || DEFAULT_STREAM_VOICE;
      const sessionId = transitionSession({
        type: 'start',
        pageKey,
        voice: resolvedVoice,
        pauseAtStartOnComplete
      }).sessionId;
      clearQueue();
      queueRef.current.push({
        text: cleaned,
        pageKey,
        voice: resolvedVoice,
        pauseAfterMs: getInterSegmentPauseMs(cleaned)
      });
      const nextState: StreamState = {
        status: 'connecting',
        pageKey,
        playbackSeconds: 0,
        modelSeconds: 0,
        error: undefined
      };
      streamStateRef.current = nextState;
      setStreamState(nextState);

      try {
        const audioReady = await createAudioChain(sessionId);
        if (!audioReady) {
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
    },
    [clearQueue, createAudioChain, finalizeStream, showToast, startQueuedRequest, transitionSession]
  );

  const enqueueStream = useCallback(
    ({
      text,
      pageKey,
      voice,
    }: {
      text: string;
      pageKey: string;
      voice?: string;
    }) => {
      const cleaned = stripMarkdown(text).trim();
      if (!cleaned || !canEnqueueStreamingAudio(sessionMachineRef.current)) {
        return;
      }
      queueRef.current.push({
        text: cleaned,
        pageKey,
        voice: voice || DEFAULT_STREAM_VOICE,
        pauseAfterMs: getInterSegmentPauseMs(cleaned)
      });
      if (workletRef.current && !readerRef.current && !requestInFlightRef.current) {
        void startQueuedRequest(sessionMachineRef.current.sessionId);
      }
    },
    [startQueuedRequest]
  );

  const pauseStream = useCallback(async () => {
    if (streamStateRef.current.status !== 'streaming') {
      return;
    }
    transitionSession({ type: 'pause' });
    stopPlaybackTimer();
    setStreamState((prev) => {
      const nextState = { ...prev, status: 'paused' as const };
      streamStateRef.current = nextState;
      return nextState;
    });
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'running') {
      try {
        await ctx.suspend();
      } catch {
        // ignore suspend errors
      }
    }
  }, [stopPlaybackTimer, transitionSession]);

  const resumeStream = useCallback(async () => {
    if (streamStateRef.current.status !== 'paused') {
      return;
    }
    const sessionId = sessionMachineRef.current.sessionId;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors
      }
    }
    if (
      !isCurrentStreamingSession(sessionMachineRef.current, sessionId) ||
      sessionMachineRef.current.status !== 'paused'
    ) {
      if (ctx?.state === 'running') {
        void ctx.suspend().catch(() => {});
      }
      return;
    }
    const resumedSession = transitionSession({ type: 'resume' });
    if (resumedSession.hasStartedAudio || hasStartedPlaybackRef.current) {
      startPlaybackTimer();
    }
    setStreamState((prev) => {
      const nextState = { ...prev, status: 'streaming' as const };
      streamStateRef.current = nextState;
      return nextState;
    });
  }, [startPlaybackTimer, transitionSession]);

  const stopStream = useCallback(() => {
    transitionSession({ type: 'source-ended' });
    clearQueue();
    closeStreamRequest();
    finalizeStream();
  }, [clearQueue, closeStreamRequest, finalizeStream, transitionSession]);

  const stopAfterCurrentStream = useCallback(() => {
    const pageKey = sessionMachineRef.current.activeSegmentPageKey ?? streamStateRef.current.pageKey;
    if (!pageKey) {
      clearQueue();
      return;
    }
    transitionSession({ type: 'stop-after-current', pageKey });
    clearQueue();
    const node = workletRef.current;
    node?.port.postMessage({ type: 'trim-after-page-key', pageKey });
    const activeRequestPageKey = sessionMachineRef.current.activeRequestPageKey;
    if (activeRequestPageKey && activeRequestPageKey !== pageKey) {
      closeStreamRequest();
      transitionSession({ type: 'source-ended' });
    }
  }, [clearQueue, closeStreamRequest, transitionSession]);

  const pauseStreamAtStart = useCallback(
    (pageKey: string) => {
      transitionSession({ type: 'pause-at-start', pageKey });
      clearQueue();
      closeStreamRequest();
      silencePlayback();
      const nextState: StreamState = {
        ...INITIAL_STREAM_STATE,
        status: 'paused',
        pageKey,
        playbackSeconds: 0,
        error: undefined
      };
      streamStateRef.current = nextState;
      setStreamState(nextState);
    },
    [clearQueue, closeStreamRequest, silencePlayback, transitionSession]
  );

  return {
    streamState,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream,
    stopAfterCurrentStream,
    pauseStreamAtStart
  };
}
