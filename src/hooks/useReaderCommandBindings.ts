import { useCallback, useMemo } from 'react';
import {
  type ReaderCommands,
  type StudyAudioParagraphPayload
} from '@/hooks/useReaderCommands';
import {
  appActions,
  type TocVariant,
  useAppDispatch
} from '@/state/appState';
import type { TocEntry } from '@/types/app';

type MaybePromise = Promise<void> | void;

type OcrBlockPayload = {
  imageUrl: string;
  startIndex: number;
  blockId: string;
};

type UseReaderCommandBindingsOptions = {
  queueRemainingOcrPages: () => void;
  queueAllOcrPages: () => void;
  forceUpdateAllOcrPages: () => void;
  retryFailedOcrPages: () => void;
  clearOcrQueue: () => void;
  toggleOcrQueuePause: () => void;
  generateToc: (variant: TocVariant) => MaybePromise;
  saveToc: (variant: TocVariant) => MaybePromise;
  addTocEntry: (pageIndex: number, variant: TocVariant) => void;
  removeTocEntry: (index: number, variant: TocVariant) => void;
  updateTocEntry: (index: number, entry: TocEntry, variant: TocVariant) => void;
  generateChapterText: (index: number) => MaybePromise;
};

export function useReaderCommandBindings({
  queueRemainingOcrPages,
  queueAllOcrPages,
  forceUpdateAllOcrPages,
  retryFailedOcrPages,
  clearOcrQueue,
  toggleOcrQueuePause,
  generateToc,
  saveToc,
  addTocEntry,
  removeTocEntry,
  updateTocEntry,
  generateChapterText
}: UseReaderCommandBindingsOptions): ReaderCommands {
  const dispatch = useAppDispatch();

  const handlePlayOcrBlock = useCallback(
    (payload: OcrBlockPayload) => {
      dispatch(appActions.requestPlayOcrBlock(payload));
    },
    [dispatch]
  );

  const handlePlayStudyAudioParagraph = useCallback(
    (payload: StudyAudioParagraphPayload) => {
      dispatch(appActions.requestPlayStudyAudioParagraph(payload));
    },
    [dispatch]
  );

  return useMemo<ReaderCommands>(
    () => ({
      fitWidth: () => dispatch(appActions.requestFitWidth()),
      fitHeight: () => dispatch(appActions.requestFitHeight()),
      toggleOcrEditMode: () => dispatch(appActions.requestToggleOcrEditMode()),
      toggleFullscreen: () => dispatch(appActions.requestToggleFullscreen()),
      playOcrBlock: handlePlayOcrBlock,
      toggleOcrBlockSpeech: (blockId) => dispatch(appActions.requestToggleOcrBlockSpeech(blockId)),
      queueRemainingOcrPages,
      queueAllOcrPages,
      forceUpdateAllOcrPages,
      retryFailedOcrPages,
      clearOcrQueue,
      toggleOcrQueuePause,
      stopStudyAudio: () => dispatch(appActions.requestStopStream()),
      playStudyAudioSingle: (payload) => dispatch(appActions.requestPlayStudyAudioSingle(payload)),
      playStudyAudioUnitTopicParagraph: handlePlayStudyAudioParagraph,
      playStudyAudioChapterParagraph: handlePlayStudyAudioParagraph,
      generateToc: (variant) => void generateToc(variant),
      saveToc: (variant) => void saveToc(variant),
      addTocEntry,
      removeTocEntry,
      updateTocEntry,
      generateChapterText: (index) => void generateChapterText(index)
    }),
    [
      addTocEntry,
      clearOcrQueue,
      forceUpdateAllOcrPages,
      generateChapterText,
      generateToc,
      handlePlayOcrBlock,
      handlePlayStudyAudioParagraph,
      dispatch,
      queueAllOcrPages,
      queueRemainingOcrPages,
      removeTocEntry,
      retryFailedOcrPages,
      saveToc,
      toggleOcrQueuePause,
      updateTocEntry
    ]
  );
}
