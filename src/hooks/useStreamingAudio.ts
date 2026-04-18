import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamState } from '@/types/app';
import { stripMarkdown } from '@/lib/streamText';

const SAMPLE_RATE = 24_000;
const SILENT_FRAME_LIMIT = 4;
const STREAM_SERVER = 'https://reader.test:3000';
export const DEFAULT_STREAM_VOICE = 'en-Mike_man';
const SHORT_SEGMENT_PAUSE_MS = 700;
const MEDIUM_SEGMENT_PAUSE_MS = 700;
const LONG_SEGMENT_PAUSE_MS = 1000;

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
  const streamStateRef = useRef<StreamState>(INITIAL_STREAM_STATE);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const playbackSamplesRef = useRef(0);
  const bufferSamplesRef = useRef(0);
  const queuedSamplesRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const hasStartedPlaybackRef = useRef(false);
  const silentFramesRef = useRef(0);
  const sessionRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const socketClosedRef = useRef(false);
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
    playbackSamplesRef.current = 0;
    bufferSamplesRef.current = 0;
    queuedSamplesRef.current = 0;
    hasStartedPlaybackRef.current = false;
    silentFramesRef.current = 0;
    firstAudioRef.current = false;
    activeSegmentKeyRef.current = null;

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
  }, [stopPlaybackTimer]);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      socket.close();
    }
    socketRef.current = null;
  }, []);

  const finalizeStream = useCallback(
    (status: StreamState['status'] = 'idle', error?: string) => {
      sessionRef.current += 1;
      stopRequestedRef.current = false;
      clearQueue();
      const playedSeconds = playbackSamplesRef.current / SAMPLE_RATE;
      silencePlayback();
      closeSocket();
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
    [clearQueue, closeSocket, showToast, silencePlayback]
  );

  useEffect(() => {
    return () => finalizeStream();
  }, [finalizeStream]);

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
        (socketClosedRef.current || stopRequestedRef.current) &&
        bufferSamplesRef.current === 0 &&
        silentFramesRef.current >= SILENT_FRAME_LIMIT;
      if (shouldStop) {
        finalizeStream();
      }
    },
    [finalizeStream, startPlaybackTimer]
  );

  const createAudioChain = useCallback(async () => {
    silencePlayback();
    socketClosedRef.current = false;
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

  const startQueuedSocket = useCallback(
    async (sessionId: number) => {
      if (sessionRef.current !== sessionId || stopRequestedRef.current) {
        return;
      }
      if (socketRef.current) {
        return;
      }
      const nextItem = queueRef.current.shift();
      if (!nextItem) {
        socketClosedRef.current = true;
        return;
      }

      socketClosedRef.current = false;
      let receivedSegmentAudio = false;
      setStreamState((prev) => ({
        ...prev,
        modelSeconds: 0,
        error: undefined,
        status: firstAudioRef.current ? prev.status : 'connecting'
      }));

      const params = new URLSearchParams();
      params.set('text', nextItem.text);
      params.set('voice', nextItem.voice || DEFAULT_STREAM_VOICE);
      params.set('cfg', '1.5');
      params.set('steps', '5');

      const wsUrl = new URL('/stream', STREAM_SERVER);
      if (wsUrl.protocol === 'https:') {
        wsUrl.protocol = 'wss:';
      } else if (wsUrl.protocol === 'http:') {
        wsUrl.protocol = 'ws:';
      } else if (wsUrl.protocol !== 'ws:' && wsUrl.protocol !== 'wss:') {
        wsUrl.protocol = 'ws:';
      }
      wsUrl.search = params.toString();

      console.info(
        `[TTS stream text]\npageKey: ${nextItem.pageKey}\nvoice: ${nextItem.voice || DEFAULT_STREAM_VOICE}\n---\n${nextItem.text}\n---`
      );

      try {
        const socket = new WebSocket(wsUrl);
        socket.binaryType = 'arraybuffer';
        socket.onmessage = (event) => {
          if (sessionRef.current !== sessionId) {
            return;
          }
          if (typeof event.data === 'string') {
            try {
              const payload = JSON.parse(event.data);
              if (payload?.event === 'model_progress' && typeof payload?.data?.generated_sec === 'number') {
                setStreamState((prev) => ({ ...prev, modelSeconds: payload.data.generated_sec }));
              }
            } catch {
              // ignore malformed payloads
            }
            return;
          }

          if (!(event.data instanceof ArrayBuffer)) {
            return;
          }
          const rawBuffer = event.data.slice(0);
          const view = new DataView(rawBuffer);
          const floatChunk = new Float32Array(view.byteLength / 2);
          for (let i = 0; i < floatChunk.length; i += 1) {
            floatChunk[i] = view.getInt16(i * 2, true) / 32768;
          }
          appendAudio(floatChunk, nextItem.pageKey);
          if (!receivedSegmentAudio) {
            receivedSegmentAudio = true;
            firstAudioRef.current = true;
            setStreamState((prev) => ({ ...prev, status: prev.status === 'paused' ? 'paused' : 'streaming' }));
          }
        };
        socket.onerror = (err) => {
          console.error('Streaming socket error', err);
          if (sessionRef.current === sessionId) {
            finalizeStream('error', 'Streaming connection failed');
          }
        };
        socket.onclose = () => {
          if (sessionRef.current !== sessionId) {
            return;
          }
          socketRef.current = null;
          if (stopRequestedRef.current) {
            socketClosedRef.current = true;
            return;
          }
          if (queueRef.current.length > 0) {
            if (nextItem.pauseAfterMs > 0) {
              appendSilence(nextItem.pauseAfterMs);
            }
            void startQueuedSocket(sessionId);
            return;
          }
          socketClosedRef.current = true;
        };
        socketRef.current = socket;
        await audioCtxRef.current?.resume();
      } catch (error) {
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [appendAudio, appendSilence, finalizeStream]
  );

  const startStream = useCallback(
    async ({ text, pageKey, voice }: { text: string; pageKey: string; voice?: string }) => {
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
        await startQueuedSocket(sessionId);
      } catch (error) {
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [clearQueue, createAudioChain, finalizeStream, showToast, startQueuedSocket]
  );

  const enqueueStream = useCallback(
    ({ text, pageKey, voice }: { text: string; pageKey: string; voice?: string }) => {
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
      if (!socketRef.current) {
        void startQueuedSocket(sessionRef.current);
      }
    },
    [startQueuedSocket]
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
    socketClosedRef.current = true;
    clearQueue();
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.CONNECTING || socketRef.current.readyState === WebSocket.OPEN)
    ) {
      try {
        socketRef.current.send(JSON.stringify({ command: 'stop' }));
      } catch {
        // ignore send errors
      }
      try {
        socketRef.current.close();
      } catch {
        // ignore close errors
      }
    }
    socketRef.current = null;
    finalizeStream();
  }, [clearQueue, finalizeStream]);

  return {
    streamState,
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream
  };
}
