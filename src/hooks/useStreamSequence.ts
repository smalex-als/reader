import { useEffect, useRef } from 'react';
import { useAudioController } from '@/hooks/useAudioController';
import { useToast } from '@/hooks/useToast';
import {
  createStreamSequenceController,
  type StreamSequenceController
} from '@/lib/streamSequenceController';
import {
  appActions,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectChapterTextContext,
  selectPageTextWorkflow,
  selectReaderSession,
  selectViewerWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { useStreamRuntimeSelector } from '@/state/streamRuntimeStore';
import type { StreamState } from '@/types/app';

type StreamSequenceOptions = {
  startStream: (payload: {
    text: string;
    pageKey: string;
    voice: string;
    pauseAfterMs?: number;
    pauseAtStartOnComplete?: boolean;
    replaceCurrent?: boolean;
  }) => Promise<void>;
  enqueueStream: (payload: {
    text: string;
    pageKey: string;
    voice: string;
    pauseAfterMs?: number;
  }) => void;
  stopStream: () => Promise<void>;
  pauseStream: () => Promise<void>;
  resumeStream: () => Promise<void>;
  pauseStreamAtStart: (pageKey: string) => void;
};

const selectStreamSequenceRuntime = (state: StreamState) => ({
  status: state.status,
  pageKey: state.pageKey,
  playbackSeconds: state.playbackSeconds === 0 ? 0 : 1
});
const streamSequenceRuntimeEqual = (
  previous: ReturnType<typeof selectStreamSequenceRuntime>,
  next: ReturnType<typeof selectStreamSequenceRuntime>
) => (
  previous.status === next.status &&
  previous.pageKey === next.pageKey &&
  previous.playbackSeconds === next.playbackSeconds
);

export function useStreamSequence({
  startStream,
  enqueueStream,
  stopStream,
  pauseStream,
  resumeStream,
  pauseStreamAtStart
}: StreamSequenceOptions) {
  const { showToast } = useToast();
  const { stopAudio } = useAudioController();
  const dispatch = useAppDispatch();
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const { firstChapterParagraph } = useAppSelector(selectChapterTextContext);
  const streamState = useStreamRuntimeSelector(selectStreamSequenceRuntime, streamSequenceRuntimeEqual);
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { streamVoice, streamVoiceOptions } = useAppSelector(selectVoiceWorkflow);
  const { cache: textCache } = useAppSelector(selectPageTextWorkflow);
  const controllerRef = useRef<StreamSequenceController | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createStreamSequenceController({
      scheduler: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timer) => window.clearTimeout(timer as number)
      }
    });
  }
  const controller = controllerRef.current;
  controller.updateEnvironment({
    bookId,
    currentPage,
    viewMode,
    bookType,
    chapterCount,
    manifest,
    firstChapterParagraph,
    streamState,
    studyMode: settings.studyMode,
    streamVoice,
    streamVoiceOptions,
    textCache,
    startStream,
    enqueueStream,
    stopStream,
    pauseStream,
    resumeStream,
    pauseStreamAtStart,
    stopAudio,
    showToast: (message, type) => showToast(message, type),
    requestNextPage: () => dispatch(appActions.requestNextPageNavigation())
  });

  useEffect(() => {
    controller.mount();
    return () => {
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    controller.syncRuntime();
  });

  return {
    startStreamSequence: controller.startStreamSequence,
    handlePlayPageBlock: controller.handlePlayPageBlock,
    handlePlayChapterParagraph: controller.handlePlayChapterParagraph,
    handlePlaySingleStream: controller.handlePlaySingleStream,
    handleStopStream: controller.handleStopStream,
    handleToggleStreamPause: controller.handleToggleStreamPause,
    handlePlayNextStudyBlock: controller.handlePlayNextStudyBlock,
    restartStreamFromPageKey: controller.restartStreamFromPageKey,
    handleStreamSegmentStart: controller.handleStreamSegmentStart
  };
}
