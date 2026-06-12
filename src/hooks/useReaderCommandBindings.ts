import { useCallback, useMemo } from 'react';
import {
  type ReaderCommands,
  type StudyAudioParagraphPayload
} from '@/hooks/useReaderCommands';
import { makeStreamLocator } from '@/lib/streamLocator';
import type { TocVariant } from '@/state/appState';
import type { TocEntry } from '@/types/app';

type MaybePromise = Promise<void> | void;

type OcrBlockPayload = {
  imageUrl: string;
  startIndex: number;
  blockId: string;
};

type UseReaderCommandBindingsOptions = {
  fitWidth: () => void;
  fitHeight: () => void;
  toggleOcrEditMode: () => MaybePromise;
  toggleFullscreen: () => MaybePromise;
  playOcrBlock: (payload: OcrBlockPayload) => MaybePromise;
  toggleOcrBlockSpeech: (blockId: string) => MaybePromise;
  setSelectedStreamBlockKey: (key: string | null) => void;
  queueRemainingOcrPages: () => void;
  queueAllOcrPages: () => void;
  forceUpdateAllOcrPages: () => void;
  retryFailedOcrPages: () => void;
  clearOcrQueue: () => void;
  toggleOcrQueuePause: () => void;
  stopStudyAudio: () => void;
  playStudyAudioSingle: (payload: { text: string; pageKey: string }) => MaybePromise;
  playStudyAudioParagraph: (payload: StudyAudioParagraphPayload) => MaybePromise;
  generateToc: (variant: TocVariant) => MaybePromise;
  saveToc: (variant: TocVariant) => MaybePromise;
  addTocEntry: (pageIndex: number, variant: TocVariant) => void;
  removeTocEntry: (index: number, variant: TocVariant) => void;
  updateTocEntry: (index: number, entry: TocEntry, variant: TocVariant) => void;
  generateChapterText: (index: number) => MaybePromise;
};

export function useReaderCommandBindings({
  fitWidth,
  fitHeight,
  toggleOcrEditMode,
  toggleFullscreen,
  playOcrBlock,
  toggleOcrBlockSpeech,
  setSelectedStreamBlockKey,
  queueRemainingOcrPages,
  queueAllOcrPages,
  forceUpdateAllOcrPages,
  retryFailedOcrPages,
  clearOcrQueue,
  toggleOcrQueuePause,
  stopStudyAudio,
  playStudyAudioSingle,
  playStudyAudioParagraph,
  generateToc,
  saveToc,
  addTocEntry,
  removeTocEntry,
  updateTocEntry,
  generateChapterText
}: UseReaderCommandBindingsOptions): ReaderCommands {
  const handlePlayOcrBlock = useCallback(
    (payload: OcrBlockPayload) => {
      setSelectedStreamBlockKey(makeStreamLocator(payload.imageUrl, payload.blockId));
      void playOcrBlock(payload);
    },
    [playOcrBlock, setSelectedStreamBlockKey]
  );

  const handleToggleOcrBlockSpeech = useCallback(
    (blockId: string) => {
      void toggleOcrBlockSpeech(blockId);
    },
    [toggleOcrBlockSpeech]
  );

  const handlePlayStudyAudioParagraph = useCallback(
    (payload: StudyAudioParagraphPayload) => {
      void playStudyAudioParagraph({
        fullText: payload.fullText,
        startIndex: payload.startIndex,
        key: payload.key
      });
    },
    [playStudyAudioParagraph]
  );

  const handleToggleOcrEditMode = useCallback(() => {
    void toggleOcrEditMode();
  }, [toggleOcrEditMode]);

  const handleToggleFullscreen = useCallback(() => {
    void toggleFullscreen();
  }, [toggleFullscreen]);

  return useMemo<ReaderCommands>(
    () => ({
      fitWidth,
      fitHeight,
      toggleOcrEditMode: handleToggleOcrEditMode,
      toggleFullscreen: handleToggleFullscreen,
      playOcrBlock: handlePlayOcrBlock,
      toggleOcrBlockSpeech: handleToggleOcrBlockSpeech,
      queueRemainingOcrPages,
      queueAllOcrPages,
      forceUpdateAllOcrPages,
      retryFailedOcrPages,
      clearOcrQueue,
      toggleOcrQueuePause,
      stopStudyAudio,
      playStudyAudioSingle: (payload) => void playStudyAudioSingle(payload),
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
      fitHeight,
      fitWidth,
      forceUpdateAllOcrPages,
      generateChapterText,
      generateToc,
      handlePlayOcrBlock,
      handlePlayStudyAudioParagraph,
      handleToggleFullscreen,
      handleToggleOcrBlockSpeech,
      handleToggleOcrEditMode,
      playStudyAudioSingle,
      queueAllOcrPages,
      queueRemainingOcrPages,
      removeTocEntry,
      retryFailedOcrPages,
      saveToc,
      stopStudyAudio,
      toggleOcrQueuePause,
      updateTocEntry
    ]
  );
}
