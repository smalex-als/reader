import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamState } from '@/types/app';

const SAMPLE_RATE = 24_000;
const SILENT_FRAME_LIMIT = 4;
const STREAM_SERVER = 'https://myserver.home:3000';
export const DEFAULT_STREAM_VOICE = 'en-Davis_man';

const INITIAL_STREAM_STATE: StreamState = {
  status: 'idle',
  pageKey: null,
  playbackSeconds: 0,
  modelSeconds: 0
};

export function useStreamingAudio(
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const playbackSamplesRef = useRef(0);
  const bufferSamplesRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const hasStartedPlaybackRef = useRef(false);
  const silentFramesRef = useRef(0);
  const sessionRef = useRef(0);
  const stopRequestedRef = useRef(false);
  const socketClosedRef = useRef(false);
  const firstAudioRef = useRef(false);

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
    hasStartedPlaybackRef.current = false;
    silentFramesRef.current = 0;
    firstAudioRef.current = false;

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
      const playedSeconds = playbackSamplesRef.current / SAMPLE_RATE;
      silencePlayback();
      closeSocket();
      setStreamState({
        ...INITIAL_STREAM_STATE,
        status,
        pageKey: null,
        playbackSeconds: playedSeconds,
        error
      });
      if (status === 'error' && error) {
        showToast(error, 'error');
      }
    },
    [closeSocket, showToast, silencePlayback]
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

  const appendAudio = useCallback((chunk: Float32Array) => {
    bufferSamplesRef.current += chunk.length;
    const node = workletRef.current;
    if (!node) {
      return;
    }
    try {
      node.port.postMessage({ type: 'append', payload: chunk.buffer }, [chunk.buffer]);
    } catch (error) {
      console.error('Failed to append audio to worklet', error);
    }
  }, []);

  const startStream = useCallback(
    async ({ text, pageKey, voice }: { text: string; pageKey: string; voice?: string }) => {
      const cleaned = text.trim();
      if (!cleaned) {
        showToast('No text available to stream', 'error');
        return;
      }
      if (streamState.status === 'connecting' || streamState.status === 'streaming') {
        showToast('Audio stream already running', 'info');
        return;
      }
      const sessionId = sessionRef.current + 1;
      sessionRef.current = sessionId;
      stopRequestedRef.current = false;
      firstAudioRef.current = false;
      setStreamState({
        status: 'connecting',
        pageKey,
        playbackSeconds: 0,
        modelSeconds: 0,
        error: undefined
      });

      try {
        await createAudioChain();
      } catch (error) {
        console.error('Unable to create audio worklet', error);
        finalizeStream('error', 'Audio setup failed');
        return;
      }

      const params = new URLSearchParams();
      params.set('text', cleaned);
      if (voice) {
        params.set('voice', voice);
      } else if (DEFAULT_STREAM_VOICE) {
        params.set('voice', DEFAULT_STREAM_VOICE);
      }
      params.set('cfg', '1.5');
      params.set('steps', '5');

      const wsUrl = new URL('/stream', STREAM_SERVER);
      wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl.search = params.toString();

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
          appendAudio(floatChunk);
          if (!firstAudioRef.current) {
            firstAudioRef.current = true;
            setStreamState((prev) => ({ ...prev, status: 'streaming' }));
          }
        };
        socket.onerror = (err) => {
          console.error('Streaming socket error', err);
          if (sessionRef.current === sessionId) {
            finalizeStream('error', 'Streaming connection failed');
          }
        };
        socket.onclose = () => {
          if (sessionRef.current === sessionId) {
            socketRef.current = null;
            socketClosedRef.current = true;
          }
        };
        socketRef.current = socket;
        showToast('Starting audio stream…', 'info');
        await audioCtxRef.current?.resume();
      } catch (error) {
        console.error('Unable to start stream', error);
        finalizeStream('error', 'Unable to start stream');
      }
    },
    [appendAudio, createAudioChain, finalizeStream, showToast, streamState.status]
  );

  const stopStream = useCallback(() => {
    stopRequestedRef.current = true;
    socketClosedRef.current = true;
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
  }, [finalizeStream]);

  return {
    streamState,
    startStream,
    stopStream
  };
}
