import { useCallback, useEffect, useRef, useState } from 'react';
import { openStreamPcmReader } from '@/api/streamingAudio';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import { appActions, useAppDispatch } from '@/state/appState';
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
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const finalizeStreamRef = useRef<(status?: StreamState['status'], error?: string) => void>(() => {});
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
  const sessionRef = useRef(0);
  const audioChainSessionRef = useRef(0);
  const audioShutdownRef = useRef<Promise<void>>(Promise.resolve());
  const playbackPausedRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const sourceEndedRef = useRef(false);
  const firstAudioRef = useRef(false);
  const queueRef = useRef<QueuedStreamItem[]>([]);
  const activeSegmentKeyRef = useRef<string | null>(null);
  const activeRequestPageKeyRef = useRef<string | null>(null);
  const stopAfterCurrentPageKeyRef = useRef<string | null>(null);
  const pauseAtStartPageKeyRef = useRef<string | null>(null);
  const pcmCacheRef = useRef<Map<string, CachedStreamChunk[]>>(new Map());
  const onSegmentStartRef = useRef(onSegmentStart);

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
    dispatch(appActions.setStreamRuntime(streamState));
  }, [dispatch, streamState]);

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
    audioChainSessionRef.current += 1;
    stopPlaybackTimer();
    clearFinalizeTimer();
    playbackSamplesRef.current = 0;
    bufferSamplesRef.current = 0;
    queuedSamplesRef.current = 0;
    hasStartedPlaybackRef.current = false;
    silentFramesRef.current = 0;
    firstAudioRef.current = false;
    activeSegmentKeyRef.current = null;
    activeRequestPageKeyRef.current = null;
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
  }, [clearFinalizeTimer, stopPlaybackTimer]);

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
    activeRequestPageKeyRef.current = null;
  }, []);

  const finalizeStream = useCallback(
    (status: StreamState['status'] = 'idle', error?: string) => {
      sessionRef.current += 1;
      const pauseAtStartPageKey = status === 'idle' ? pauseAtStartPageKeyRef.current : null;
      stopRequestedRef.current = false;
      playbackPausedRef.current = Boolean(pauseAtStartPageKey);
      stopAfterCurrentPageKeyRef.current = null;
      pauseAtStartPageKeyRef.current = null;
      clearQueue();
      const playedSeconds = playbackSamplesRef.current / SAMPLE_RATE;
      silencePlayback();
      closeStreamRequest();
      const nextState = pauseAtStartPageKey
        ? {
            ...INITIAL_STREAM_STATE,
            status: 'paused' as const,
            pageKey: pauseAtStartPageKey,
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
    [clearQueue, closeStreamRequest, showToast, silencePlayback]
  );

  const pauseCompletedStreamAtStart = useCallback(
    (pageKey: string) => {
      sessionRef.current += 1;
      stopRequestedRef.current = false;
      playbackPausedRef.current = true;
      sourceEndedRef.current = true;
      stopAfterCurrentPageKeyRef.current = null;
      pauseAtStartPageKeyRef.current = null;
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
    [clearQueue, closeStreamRequest, silencePlayback]
  );

  useEffect(() => {
    finalizeStreamRef.current = finalizeStream;
  }, [finalizeStream]);

  useEffect(() => {
    return () => {
      finalizeStreamRef.current();
    };
  }, []);

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

      if (typeof data.pageKey === 'string' && data.pageKey !== activeSegmentKeyRef.current) {
        activeSegmentKeyRef.current = data.pageKey;
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
        (sourceEndedRef.current || stopRequestedRef.current) &&
        bufferSamplesRef.current === 0 &&
        silentFramesRef.current >= SILENT_FRAME_LIMIT;
      if (shouldStop) {
        if (finalizeTimerRef.current === null) {
          finalizeTimerRef.current = window.setTimeout(() => {
            finalizeTimerRef.current = null;
            const pauseAtStartPageKey = pauseAtStartPageKeyRef.current;
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
    [clearFinalizeTimer, finalizeStream, pauseCompletedStreamAtStart, startPlaybackTimer]
  );

  const createAudioChain = useCallback(async (sessionId: number) => {
    silencePlayback();
    await audioShutdownRef.current;
    if (sessionRef.current !== sessionId || stopRequestedRef.current) {
      return false;
    }
    const audioChainSession = audioChainSessionRef.current + 1;
    audioChainSessionRef.current = audioChainSession;
    sourceEndedRef.current = false;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    await ctx.audioWorklet.addModule('/stream-worklet.js');
    if (
      sessionRef.current !== sessionId ||
      stopRequestedRef.current ||
      audioChainSessionRef.current !== audioChainSession
    ) {
      void ctx.close().catch(() => {});
      return false;
    }
    const node = new AudioWorkletNode(ctx, 'stream-player');
    node.port.onmessage = (event) => {
      if (audioChainSessionRef.current !== audioChainSession) {
        return;
      }
      handleWorkletMessage(event.data);
    };
    node.connect(ctx.destination);
    audioCtxRef.current = ctx;
    workletRef.current = node;
    return true;
  }, [handleWorkletMessage, silencePlayback]);

  const resumePlaybackContext = useCallback(async (sessionId: number) => {
    if (playbackPausedRef.current || sessionRef.current !== sessionId || stopRequestedRef.current) {
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
    if (playbackPausedRef.current || sessionRef.current !== sessionId || stopRequestedRef.current) {
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
    const stopAfterPageKey = stopAfterCurrentPageKeyRef.current;
    if (stopAfterPageKey && pageKey !== null && pageKey !== stopAfterPageKey) {
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
      if (sessionRef.current !== sessionId || stopRequestedRef.current) {
        return;
      }
      if (readerRef.current || requestInFlightRef.current) {
        return;
      }
      requestInFlightRef.current = true;
      const nextItem = queueRef.current.shift();
      if (!nextItem) {
        requestInFlightRef.current = false;
        activeRequestPageKeyRef.current = null;
        sourceEndedRef.current = true;
        return;
      }

      onSegmentStartRef.current?.(nextItem.pageKey);
      sourceEndedRef.current = false;
      activeRequestPageKeyRef.current = nextItem.pageKey;
      const cacheKey = getStreamPcmCacheKey(nextItem.text, nextItem.pageKey, nextItem.voice || DEFAULT_STREAM_VOICE);
      const cachedChunks = pcmCacheRef.current.get(cacheKey);
      let receivedSegmentAudio = false;
      let receivedSampleCount = 0;
      setStreamState((prev) => ({
        ...prev,
        modelSeconds: 0,
        error: undefined,
        status: firstAudioRef.current ? prev.status : 'connecting'
      }));

      if (cachedChunks) {
        pcmCacheRef.current.delete(cacheKey);
        pcmCacheRef.current.set(cacheKey, cachedChunks);
        requestInFlightRef.current = false;
        activeRequestPageKeyRef.current = null;
        await resumePlaybackContext(sessionId);
        firstAudioRef.current = true;
        setStreamState((prev) => ({
          ...prev,
          status: playbackPausedRef.current || prev.status === 'paused' ? 'paused' : 'streaming'
        }));
        for (const cachedChunk of cachedChunks) {
          if (sessionRef.current !== sessionId || stopRequestedRef.current) {
            sourceEndedRef.current = true;
            return;
          }
          appendAudio(cachedChunk.samples.slice(), cachedChunk.pageKey);
        }
        if (stopAfterCurrentPageKeyRef.current) {
          clearQueue();
          sourceEndedRef.current = true;
          return;
        }
        if (queueRef.current.length > 0) {
          if (nextItem.pauseAfterMs > 0) {
            appendSilence(nextItem.pauseAfterMs);
          }
          void startQueuedRequest(sessionId);
          return;
        }
        sourceEndedRef.current = true;
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

        while (sessionRef.current === sessionId && !stopRequestedRef.current) {
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
            firstAudioRef.current = true;
            setStreamState((prev) => ({
              ...prev,
              status: playbackPausedRef.current || prev.status === 'paused' ? 'paused' : 'streaming'
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
        activeRequestPageKeyRef.current = null;
        if (stopRequestedRef.current || sessionRef.current !== sessionId) {
          sourceEndedRef.current = true;
          return;
        }
        if (receivedSampleCount > 0) {
          cachePcmSegment(cacheKey, segmentChunks);
        }
        if (stopAfterCurrentPageKeyRef.current) {
          clearQueue();
          sourceEndedRef.current = true;
          return;
        }
        if (queueRef.current.length > 0) {
          if (nextItem.pauseAfterMs > 0) {
            appendSilence(nextItem.pauseAfterMs);
          }
          void startQueuedRequest(sessionId);
          return;
        }
        sourceEndedRef.current = true;
      } catch (error) {
        requestInFlightRef.current = false;
        activeRequestPageKeyRef.current = null;
        if ((error as Error)?.name === 'AbortError') {
          sourceEndedRef.current = true;
          return;
        }
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [appendAudio, appendSilence, clearQueue, finalizeStream, openPcmStream, resumePlaybackContext]
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
      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;
      stopRequestedRef.current = false;
      playbackPausedRef.current = false;
      firstAudioRef.current = false;
      stopAfterCurrentPageKeyRef.current = null;
      pauseAtStartPageKeyRef.current = pauseAtStartOnComplete ? pageKey : null;
      clearQueue();
      queueRef.current.push({
        text: cleaned,
        pageKey,
        voice: voice || DEFAULT_STREAM_VOICE,
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
    [clearQueue, createAudioChain, finalizeStream, showToast, startQueuedRequest]
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
      if (!cleaned || stopRequestedRef.current || sessionRef.current === 0) {
        return;
      }
      queueRef.current.push({
        text: cleaned,
        pageKey,
        voice: voice || DEFAULT_STREAM_VOICE,
        pauseAfterMs: getInterSegmentPauseMs(cleaned)
      });
      if (workletRef.current && !readerRef.current && !requestInFlightRef.current) {
        void startQueuedRequest(sessionRef.current);
      }
    },
    [startQueuedRequest]
  );

  const pauseStream = useCallback(async () => {
    if (streamStateRef.current.status !== 'streaming') {
      return;
    }
    playbackPausedRef.current = true;
    stopPlaybackTimer();
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'running') {
      try {
        await ctx.suspend();
      } catch {
        // ignore suspend errors
      }
    }
    setStreamState((prev) => {
      const nextState = { ...prev, status: 'paused' as const };
      streamStateRef.current = nextState;
      return nextState;
    });
  }, [stopPlaybackTimer]);

  const resumeStream = useCallback(async () => {
    if (streamStateRef.current.status !== 'paused') {
      return;
    }
    playbackPausedRef.current = false;
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        // ignore resume errors
      }
    }
    if (hasStartedPlaybackRef.current) {
      startPlaybackTimer();
    }
    setStreamState((prev) => {
      const nextState = { ...prev, status: 'streaming' as const };
      streamStateRef.current = nextState;
      return nextState;
    });
  }, [startPlaybackTimer]);

  const stopStream = useCallback(() => {
    stopRequestedRef.current = true;
    playbackPausedRef.current = false;
    sourceEndedRef.current = true;
    stopAfterCurrentPageKeyRef.current = null;
    pauseAtStartPageKeyRef.current = null;
    clearQueue();
    closeStreamRequest();
    finalizeStream();
  }, [clearQueue, closeStreamRequest, finalizeStream]);

  const stopAfterCurrentStream = useCallback(() => {
    const pageKey = activeSegmentKeyRef.current ?? streamStateRef.current.pageKey;
    if (!pageKey) {
      clearQueue();
      return;
    }
    stopAfterCurrentPageKeyRef.current = pageKey;
    pauseAtStartPageKeyRef.current = pageKey;
    clearQueue();
    const node = workletRef.current;
    node?.port.postMessage({ type: 'trim-after-page-key', pageKey });
    const activeRequestPageKey = activeRequestPageKeyRef.current;
    if (activeRequestPageKey && activeRequestPageKey !== pageKey) {
      closeStreamRequest();
      sourceEndedRef.current = true;
    }
  }, [clearQueue, closeStreamRequest]);

  const pauseStreamAtStart = useCallback(
    (pageKey: string) => {
      stopAfterCurrentPageKeyRef.current = null;
      pauseAtStartPageKeyRef.current = null;
      stopRequestedRef.current = false;
      playbackPausedRef.current = true;
      sourceEndedRef.current = true;
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
    [clearQueue, closeStreamRequest, silencePlayback]
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
