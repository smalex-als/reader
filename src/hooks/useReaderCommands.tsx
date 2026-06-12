import { createContext, useContext, type ReactNode } from 'react';
import type { TocVariant, QuizModal } from '@/state/appState';
import type { TocEntry } from '@/types/app';

export type StudyAudioParagraphPayload = {
  fullText: string;
  startIndex: number;
  key: string;
};

export type ReaderCommands = {
  fitWidth: () => void;
  fitHeight: () => void;
  toggleOcrEditMode: () => void;
  toggleFullscreen: () => void;
  toggleStudyMode: () => void;
  playOcrBlock: (payload: { imageUrl: string; startIndex: number; blockId: string }) => void;
  toggleOcrBlockSpeech: (blockId: string) => void;
  queueRemainingOcrPages: () => void;
  queueAllOcrPages: () => void;
  forceUpdateAllOcrPages: () => void;
  retryFailedOcrPages: () => void;
  clearOcrQueue: () => void;
  toggleOcrQueuePause: () => void;
  stopStudyAudio: () => void;
  playStudyAudioSingle: (payload: { text: string; pageKey: string }) => void;
  regenerateStudyAudioQuiz: (modal: QuizModal) => void;
  playStudyAudioUnitTopicParagraph: (payload: StudyAudioParagraphPayload) => void;
  playStudyAudioChapterParagraph: (payload: StudyAudioParagraphPayload) => void;
  generateToc: (variant: TocVariant) => void;
  saveToc: (variant: TocVariant) => void;
  addTocEntry: (pageIndex: number, variant: TocVariant) => void;
  removeTocEntry: (index: number, variant: TocVariant) => void;
  updateTocEntry: (index: number, entry: TocEntry, variant: TocVariant) => void;
  generateChapterText: (index: number) => void;
};

const ReaderCommandContext = createContext<ReaderCommands | null>(null);

export function ReaderCommandProvider({
  value,
  children
}: {
  value: ReaderCommands;
  children: ReactNode;
}) {
  return (
    <ReaderCommandContext.Provider value={value}>
      {children}
    </ReaderCommandContext.Provider>
  );
}

export function useReaderCommands() {
  const commands = useContext(ReaderCommandContext);
  if (!commands) {
    throw new Error('useReaderCommands must be used inside ReaderCommandProvider');
  }
  return commands;
}
