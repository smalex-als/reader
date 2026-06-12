import type { RefObject } from 'react';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import {
  type ReaderCommands,
  type StudyAudioParagraphPayload
} from '@/hooks/useReaderCommands';
import { useReaderCommandBindings } from '@/hooks/useReaderCommandBindings';
import { useShareLink } from '@/hooks/useShareLink';
import { useTocManager } from '@/hooks/useTocManager';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

type MaybePromise = Promise<void> | void;

type OcrBlockPayload = {
  imageUrl: string;
  startIndex: number;
  blockId: string;
};

type UseReaderFeatureCommandsOptions = {
  fitWidth: () => void;
  fitHeight: () => void;
  gotoInputRef: RefObject<HTMLInputElement>;
  toggleFullscreen: () => MaybePromise;
  playOcrBlock: (payload: OcrBlockPayload) => MaybePromise;
  playStudyAudioParagraph: (payload: StudyAudioParagraphPayload) => MaybePromise;
  playStudyAudioSingle: (payload: { text: string; pageKey: string }) => MaybePromise;
  setSelectedStreamBlockKey: (key: string | null) => void;
  stopStudyAudio: () => void;
};

export function useReaderFeatureCommands({
  fitWidth,
  fitHeight,
  gotoInputRef,
  toggleFullscreen,
  playOcrBlock,
  playStudyAudioParagraph,
  playStudyAudioSingle,
  setSelectedStreamBlockKey,
  stopStudyAudio
}: UseReaderFeatureCommandsOptions): ReaderCommands {
  useUnitsRouteSync();

  const {
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  } = useTocManager();
  const {
    toggleOcrEditMode,
    toggleSpeechBlock
  } = useOcrEditMode();
  const {
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    retryFailed,
    togglePause
  } = useOcrQueue();

  useDashboardNavigation();
  useShareLink();

  const readerCommands = useReaderCommandBindings({
    fitWidth,
    fitHeight,
    toggleOcrEditMode,
    toggleFullscreen,
    playOcrBlock,
    toggleOcrBlockSpeech: toggleSpeechBlock,
    setSelectedStreamBlockKey,
    queueRemainingOcrPages: queueRemainingPages,
    queueAllOcrPages: queueAllPages,
    forceUpdateAllOcrPages: forceUpdateAllPages,
    retryFailedOcrPages: retryFailed,
    clearOcrQueue: clearQueue,
    toggleOcrQueuePause: togglePause,
    stopStudyAudio,
    playStudyAudioSingle,
    playStudyAudioParagraph,
    generateToc: handleGenerateToc,
    saveToc: handleSaveToc,
    addTocEntry: handleAddTocEntry,
    removeTocEntry: handleRemoveTocEntry,
    updateTocEntry: handleUpdateTocEntry,
    generateChapterText: handleGenerateChapter
  });

  useHotkeys({
    gotoInputRef,
    fitWidth,
    fitHeight,
    toggleOcrEditMode: readerCommands.toggleOcrEditMode,
    toggleFullscreen: readerCommands.toggleFullscreen
  });

  return readerCommands;
}
