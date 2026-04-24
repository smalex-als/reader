import { useCallback, useEffect, useRef, useState } from 'react';
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

type QueuedStreamItem = {
  text: string;
  pageKey: string;
  voice: string;
  pauseAfterMs: number;
};

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

export function useStreamingAudio(
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
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
  const stopRequestedRef = useRef(false);
  const sourceEndedRef = useRef(false);
  const firstAudioRef = useRef(false);
  const queueRef = useRef<QueuedStreamItem[]>([]);
  const activeSegmentKeyRef = useRef<string | null>(null);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

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
    stopPlaybackTimer();
    clearFinalizeTimer();
    playbackSamplesRef.current = 0;
    bufferSamplesRef.current = 0;
    queuedSamplesRef.current = 0;
    hasStartedPlaybackRef.current = false;
    silentFramesRef.current = 0;
    firstAudioRef.current = false;
    activeSegmentKeyRef.current = null;
    pcmRemainderRef.current = null;

      const node = workletRef.current;
    if (node) {
      try {
        node.disconnect();
      } catch {
        // ignore disconnect errors
      }
      node.port.postMessage({ type: 'reset' });
      workletRef.current = null;
    }
    const ctx = audioCtxRef.current;
    if (ctx) {
      try {
        ctx.close();
      } catch {
        // ignore close errors
      }
      audioCtxRef.current = null;
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
  }, []);

  const finalizeStream = useCallback(
    (status: StreamState['status'] = 'idle', error?: string) => {
      sessionRef.current += 1;
      stopRequestedRef.current = false;
      clearQueue();
      const playedSeconds = playbackSamplesRef.current / SAMPLE_RATE;
      silencePlayback();
      closeStreamRequest();
      const nextState = {
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
      if (!data || data.type !== 'played' || typeof data.frames !== 'number') {
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
            finalizeStream();
          }, STREAM_DRAIN_GRACE_MS);
        }
      } else {
        clearFinalizeTimer();
      }
    },
    [clearFinalizeTimer, finalizeStream, startPlaybackTimer]
  );

  const createAudioChain = useCallback(async () => {
    silencePlayback();
    sourceEndedRef.current = false;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    await ctx.audioWorklet.addModule('/stream-worklet.js');
    const node = new AudioWorkletNode(ctx, 'stream-player');
    node.port.onmessage = (event) => handleWorkletMessage(event.data);
    node.connect(ctx.destination);
    audioCtxRef.current = ctx;
    workletRef.current = node;
  }, [handleWorkletMessage, silencePlayback]);

  const appendAudio = useCallback((chunk: Float32Array, pageKey: string | null) => {
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

  const appendSilence = useCallback((durationMs: number) => {
    if (durationMs <= 0) {
      return;
    }
    const sampleCount = Math.max(1, Math.round((durationMs / 1000) * SAMPLE_RATE));
    appendAudio(new Float32Array(sampleCount), null);
  }, [appendAudio]);

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
        sourceEndedRef.current = true;
        return;
      }

      sourceEndedRef.current = false;
      let receivedSegmentAudio = false;
      let receivedSampleCount = 0;
      setStreamState((prev) => ({
        ...prev,
        modelSeconds: 0,
        error: undefined,
        status: firstAudioRef.current ? prev.status : 'connecting'
      }));

      console.info(
        `[TTS stream text]\npageKey: ${nextItem.pageKey}\nvoice: ${nextItem.voice || DEFAULT_STREAM_VOICE}\n---\n${nextItem.text}\n---`
      );

      try {
        const abortController = new AbortController();
        requestAbortRef.current = abortController;
        const response = await fetch('/api/stream-audio/pcm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: nextItem.text,
            voice: nextItem.voice || DEFAULT_STREAM_VOICE
          }),
          signal: abortController.signal
        });
        if (!response.ok || !response.body) {
          throw new Error('Streaming request failed');
        }
        const reader = response.body.getReader();
        readerRef.current = reader;
        requestInFlightRef.current = false;
        await audioCtxRef.current?.resume();

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
          appendAudio(floatChunk, nextItem.pageKey);
          receivedSampleCount += sampleCount;
          if (!receivedSegmentAudio) {
            receivedSegmentAudio = true;
            firstAudioRef.current = true;
            setStreamState((prev) => ({ ...prev, status: prev.status === 'paused' ? 'paused' : 'streaming' }));
          }
        }

        if (receivedSampleCount > 0) {
          const minSampleCount = Math.round((MIN_SEGMENT_PLAYBACK_MS / 1000) * SAMPLE_RATE);
          if (receivedSampleCount < minSampleCount) {
            const missingDurationMs = ((minSampleCount - receivedSampleCount) / SAMPLE_RATE) * 1000;
            appendSilence(missingDurationMs);
          }
        }

        readerRef.current = null;
        requestAbortRef.current = null;
        requestInFlightRef.current = false;
        if (stopRequestedRef.current || sessionRef.current !== sessionId) {
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
        if ((error as Error)?.name === 'AbortError') {
          sourceEndedRef.current = true;
          return;
        }
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [appendAudio, appendSilence, finalizeStream]
  );

  const startStream = useCallback(
    async ({
      text,
      pageKey,
      voice,
    }: {
      text: string;
      pageKey: string;
      voice?: string;
    }) => {
      const cleaned = stripMarkdown(text).trim();
      if (!cleaned) {
        showToast('No text available to stream', 'error');
        return;
      }
      const currentStatus = streamStateRef.current.status;
      if (
        currentStatus === 'connecting' ||
        currentStatus === 'streaming' ||
        currentStatus === 'paused'
      ) {
        showToast('Audio stream already running', 'info');
        return;
      }
      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;
      stopRequestedRef.current = false;
      firstAudioRef.current = false;
      clearQueue();
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
        await createAudioChain();
      } catch (error) {
        console.error('Unable to create audio worklet', error);
        finalizeStream('error', 'Audio setup failed');
        return;
      }
      try {
        queueRef.current.push({
          text: cleaned,
          pageKey,
          voice: voice || DEFAULT_STREAM_VOICE,
          pauseAfterMs: getInterSegmentPauseMs(cleaned)
        });
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
      if (!readerRef.current && !requestInFlightRef.current) {
        void startQueuedRequest(sessionRef.current);
      }
    },
    [startQueuedRequest]
  );

  const pauseStream = useCallback(async () => {
    if (streamState.status !== 'streaming') {
      return;
    }
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
  }, [stopPlaybackTimer, streamState.status]);

  const resumeStream = useCallback(async () => {
    if (streamState.status !== 'paused') {
      return;
    }
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
  }, [startPlaybackTimer, streamState.status]);

  const stopStream = useCallback(() => {
    stopRequestedRef.current = true;
    sourceEndedRef.current = true;
    clearQueue();
    closeStreamRequest();
    finalizeStream();
  }, [clearQueue, closeStreamRequest, finalizeStream]);

  return {
    streamState,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream
  };
}
