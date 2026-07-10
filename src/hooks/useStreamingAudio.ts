import { useEffect, useRef, useState } from 'react';
import { openStreamPcmReader } from '@/api/streamingAudio';
import { useToast } from '@/hooks/useToast';
import {
  createStreamingAudioController,
  INITIAL_STREAM_STATE,
  type StreamingAudioController
} from '@/lib/streamingAudioController';
import { useSetStreamRuntime } from '@/state/streamRuntimeStore';
import type { StreamState } from '@/types/app';

export { DEFAULT_STREAM_VOICE } from '@/lib/streamingAudioController';

export function useStreamingAudio({
  onSegmentStart
}: {
  onSegmentStart?: (pageKey: string) => void;
} = {}) {
  const setStreamRuntime = useSetStreamRuntime();
  const { showToast } = useToast();
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const onSegmentStartRef = useRef(onSegmentStart);
  const showToastRef = useRef(showToast);
  const controllerRef = useRef<StreamingAudioController | null>(null);

  onSegmentStartRef.current = onSegmentStart;
  showToastRef.current = showToast;

  if (!controllerRef.current) {
    controllerRef.current = createStreamingAudioController({
      openPcmStream: openStreamPcmReader,
      callbacks: {
        onStateChange: setStreamState,
        onSegmentStart: (pageKey) => onSegmentStartRef.current?.(pageKey),
        onToast: (message, type) => showToastRef.current(message, type)
      }
    });
  }
  const controller = controllerRef.current;

  useEffect(() => {
    setStreamRuntime(streamState);
  }, [setStreamRuntime, streamState]);

  useEffect(() => {
    controller.mount();
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return {
    streamState,
    startStream: controller.startStream,
    enqueueStream: controller.enqueueStream,
    pauseStream: controller.pauseStream,
    resumeStream: controller.resumeStream,
    stopStream: controller.stopStream,
    stopAfterCurrentStream: controller.stopAfterCurrentStream,
    pauseStreamAtStart: controller.pauseStreamAtStart
  };
}
