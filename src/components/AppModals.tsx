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

type TocModalProps = ComponentProps<typeof TocModal>;
type OcrQueueModalProps = ComponentProps<typeof OcrQueueModal>;
type SettingsModalProps = ComponentProps<typeof SettingsModal>;
type QuizModalProps = ComponentProps<typeof QuizModal>;
type VocabularyModalProps = ComponentProps<typeof VocabularyModal>;
type MemoryCardModalProps = ComponentProps<typeof MemoryCardModal>;

interface AppModalsProps {
  portalTarget?: HTMLElement | null;
  tocModalProps: TocModalProps;
  ocrQueueModalProps: OcrQueueModalProps;
  settingsModalProps: SettingsModalProps;
  quizModalProps: QuizModalProps;
  vocabularyModalProps: VocabularyModalProps;
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
  tocModalProps,
  ocrQueueModalProps,
  settingsModalProps,
  quizModalProps,
  vocabularyModalProps,
  memoryCardModalProps
}: AppModalsProps) {
  return (
    <>
      <Toast />
      <PrintModal />
      <BookSelectModal />
      {renderInPortal(<HelpModal />, portalTarget)}
      <BookmarksModal />
      {renderInPortal(<TextModal />, portalTarget)}
      {renderInPortal(<TocNavModal />, portalTarget)}
      {renderInPortal(<TocModal {...tocModalProps} />, portalTarget)}
      {renderInPortal(<SearchModal />, portalTarget)}
      {renderInPortal(<BookCardModal />, portalTarget)}
      {renderInPortal(<SettingsModal {...settingsModalProps} />, portalTarget)}
      {renderInPortal(<QuizModal {...quizModalProps} />, portalTarget)}
      {renderInPortal(<VocabularyModal {...vocabularyModalProps} />, portalTarget)}
      {renderInPortal(<MemoryCardModal {...memoryCardModalProps} />, portalTarget)}
      {renderInPortal(<PromptEditorModal />, portalTarget)}
      {renderInPortal(<ListeningDashboardModal />, portalTarget)}
      {renderInPortal(<ImagePreviewModal />, portalTarget)}
      {renderInPortal(<JobWorkerModal />, portalTarget)}
      <OcrQueueModal {...ocrQueueModalProps} />
    </>
  );
}
