import type { RefObject } from 'react';
import { useDashboardNavigation } from '@/hooks/useDashboardNavigation';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useOcrEditMode } from '@/hooks/useOcrEditMode';
import { useOcrQueue } from '@/hooks/useOcrQueue';
import type { ReaderCommands } from '@/hooks/useReaderCommands';
import { useReaderCommandBindings } from '@/hooks/useReaderCommandBindings';
import { useShareLink } from '@/hooks/useShareLink';
import { useTocManager } from '@/hooks/useTocManager';
import { useUnitsRouteSync } from '@/hooks/useUnitsRoute';

type MaybePromise = Promise<void> | void;

type UseReaderFeatureCommandsOptions = {
  fitWidth: () => void;
  fitHeight: () => void;
  gotoInputRef: RefObject<HTMLInputElement>;
  toggleFullscreen: () => MaybePromise;
};

export function useReaderFeatureCommands({
  fitWidth,
  fitHeight,
  gotoInputRef,
  toggleFullscreen
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
    toggleOcrBlockSpeech: toggleSpeechBlock,
    queueRemainingOcrPages: queueRemainingPages,
    queueAllOcrPages: queueAllPages,
    forceUpdateAllOcrPages: forceUpdateAllPages,
    retryFailedOcrPages: retryFailed,
    clearOcrQueue: clearQueue,
    toggleOcrQueuePause: togglePause,
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
