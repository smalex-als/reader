import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast from '@/components/Toast';
import TextModal from '@/components/TextModal';
import PrintModal from '@/components/PrintModal';
import HelpModal from '@/components/HelpModal';
import BookSelectModal from '@/components/BookSelectModal';
import OcrQueueModal from '@/components/OcrQueueModal';
import TocModal from '@/components/TocModal';
import ReaderNavigator from '@/components/ReaderNavigator';
import BookCardModal from '@/components/BookCardModal';
import SettingsModal from '@/components/SettingsModal';
import QuizModal from '@/components/QuizModal';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import VocabularyModal from '@/components/VocabularyModal';
import ListeningDashboardModal from '@/components/ListeningDashboardModal';
import MemoryCardModal from '@/components/MemoryCardModal';
import PromptEditorModal from '@/components/PromptEditorModal';
import { useBookCardActions } from '@/hooks/useBookCardActions';

interface AppModalsProps {
  portalTarget?: HTMLElement | null;
}

function renderInPortal(content: ReactNode, portalTarget?: HTMLElement | null) {
  if (!portalTarget) {
    return content;
  }
  return createPortal(content, portalTarget);
}

export default function AppModals({
  portalTarget
}: AppModalsProps) {
  useBookCardActions();

  return (
    <>
      <Toast />
      <PrintModal />
      <BookSelectModal />
      {renderInPortal(<HelpModal />, portalTarget)}
      {renderInPortal(<ReaderNavigator />, portalTarget)}
      {renderInPortal(<TextModal />, portalTarget)}
      {renderInPortal(<TocModal />, portalTarget)}
      {renderInPortal(<BookCardModal />, portalTarget)}
      {renderInPortal(<SettingsModal />, portalTarget)}
      {renderInPortal(<QuizModal />, portalTarget)}
      {renderInPortal(<VocabularyModal />, portalTarget)}
      {renderInPortal(<MemoryCardModal />, portalTarget)}
      {renderInPortal(<PromptEditorModal />, portalTarget)}
      {renderInPortal(<ListeningDashboardModal />, portalTarget)}
      {renderInPortal(<ImagePreviewModal />, portalTarget)}
      <OcrQueueModal />
    </>
  );
}
