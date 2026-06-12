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

type UseReaderFeatureCommandsOptions = {
  gotoInputRef: RefObject<HTMLInputElement>;
};

export function useReaderFeatureCommands({
  gotoInputRef
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
  useOcrEditMode();
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
    gotoInputRef
  });

  return readerCommands;
}
