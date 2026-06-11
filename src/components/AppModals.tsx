import type { ComponentProps, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast from '@/components/Toast';
import TextModal from '@/components/TextModal';
import BookmarksModal from '@/components/BookmarksModal';
import PrintModal from '@/components/PrintModal';
import HelpModal from '@/components/HelpModal';
import BookSelectModal from '@/components/BookSelectModal';
import OcrQueueModal from '@/components/OcrQueueModal';
import TocModal from '@/components/TocModal';
import TocNavModal from '@/components/TocNavModal';
import SearchModal from '@/components/SearchModal';
import BookCardModal from '@/components/BookCardModal';
import SettingsModal from '@/components/SettingsModal';
import QuizModal from '@/components/QuizModal';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import VocabularyModal from '@/components/VocabularyModal';
import ListeningDashboardModal from '@/components/ListeningDashboardModal';
import MemoryCardModal from '@/components/MemoryCardModal';
import PromptEditorModal from '@/components/PromptEditorModal';
import JobWorkerModal from '@/components/JobWorkerModal';

type BookmarksModalProps = ComponentProps<typeof BookmarksModal>;
type TocNavModalProps = ComponentProps<typeof TocNavModal>;
type TocModalProps = ComponentProps<typeof TocModal>;
type OcrQueueModalProps = ComponentProps<typeof OcrQueueModal>;
type SearchModalProps = ComponentProps<typeof SearchModal>;
type SettingsModalProps = ComponentProps<typeof SettingsModal>;
type QuizModalProps = ComponentProps<typeof QuizModal>;
type VocabularyModalProps = ComponentProps<typeof VocabularyModal>;
type ListeningDashboardModalProps = ComponentProps<typeof ListeningDashboardModal>;
type MemoryCardModalProps = ComponentProps<typeof MemoryCardModal>;

interface AppModalsProps {
  portalTarget?: HTMLElement | null;
  bookmarksModalProps: BookmarksModalProps;
  tocNavModalProps: TocNavModalProps;
  tocModalProps: TocModalProps;
  ocrQueueModalProps: OcrQueueModalProps;
  searchModalProps: SearchModalProps;
  settingsModalProps: SettingsModalProps;
  quizModalProps: QuizModalProps;
  vocabularyModalProps: VocabularyModalProps;
  listeningDashboardModalProps: ListeningDashboardModalProps;
  memoryCardModalProps: MemoryCardModalProps;
}

function renderInPortal(content: ReactNode, portalTarget?: HTMLElement | null) {
  if (!portalTarget) {
    return content;
  }
  return createPortal(content, portalTarget);
}

export default function AppModals({
  portalTarget,
  bookmarksModalProps,
  tocNavModalProps,
  tocModalProps,
  ocrQueueModalProps,
  searchModalProps,
  settingsModalProps,
  quizModalProps,
  vocabularyModalProps,
  listeningDashboardModalProps,
  memoryCardModalProps
}: AppModalsProps) {
  return (
    <>
      <Toast />
      <PrintModal />
      <BookSelectModal />
      {renderInPortal(<HelpModal />, portalTarget)}
      <BookmarksModal {...bookmarksModalProps} />
      {renderInPortal(<TextModal />, portalTarget)}
      {renderInPortal(<TocNavModal {...tocNavModalProps} />, portalTarget)}
      {renderInPortal(<TocModal {...tocModalProps} />, portalTarget)}
      {renderInPortal(<SearchModal {...searchModalProps} />, portalTarget)}
      {renderInPortal(<BookCardModal />, portalTarget)}
      {renderInPortal(<SettingsModal {...settingsModalProps} />, portalTarget)}
      {renderInPortal(<QuizModal {...quizModalProps} />, portalTarget)}
      {renderInPortal(<VocabularyModal {...vocabularyModalProps} />, portalTarget)}
      {renderInPortal(<MemoryCardModal {...memoryCardModalProps} />, portalTarget)}
      {renderInPortal(<PromptEditorModal />, portalTarget)}
      {renderInPortal(<ListeningDashboardModal {...listeningDashboardModalProps} />, portalTarget)}
      {renderInPortal(<ImagePreviewModal />, portalTarget)}
      {renderInPortal(<JobWorkerModal />, portalTarget)}
      <OcrQueueModal {...ocrQueueModalProps} />
    </>
  );
}
