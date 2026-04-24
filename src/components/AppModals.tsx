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

type ToastProps = ComponentProps<typeof Toast>;
type PrintModalProps = ComponentProps<typeof PrintModal>;
type BookSelectModalProps = ComponentProps<typeof BookSelectModal>;
type HelpModalProps = ComponentProps<typeof HelpModal>;
type BookmarksModalProps = ComponentProps<typeof BookmarksModal>;
type TextModalProps = ComponentProps<typeof TextModal>;
type TocNavModalProps = ComponentProps<typeof TocNavModal>;
type TocModalProps = ComponentProps<typeof TocModal>;
type OcrQueueModalProps = ComponentProps<typeof OcrQueueModal>;
type SearchModalProps = ComponentProps<typeof SearchModal>;
type BookCardModalProps = ComponentProps<typeof BookCardModal>;
type SettingsModalProps = ComponentProps<typeof SettingsModal>;
type QuizModalProps = ComponentProps<typeof QuizModal>;
type ImagePreviewModalProps = ComponentProps<typeof ImagePreviewModal>;
type VocabularyModalProps = ComponentProps<typeof VocabularyModal>;
type ListeningDashboardModalProps = ComponentProps<typeof ListeningDashboardModal>;
type MemoryCardModalProps = ComponentProps<typeof MemoryCardModal>;
type PromptEditorModalProps = ComponentProps<typeof PromptEditorModal>;

interface AppModalsProps {
  portalTarget?: HTMLElement | null;
  toastProps: ToastProps;
  printModalProps: PrintModalProps;
  bookSelectModalProps: BookSelectModalProps;
  helpModalProps: HelpModalProps;
  bookmarksModalProps: BookmarksModalProps;
  textModalProps: TextModalProps;
  tocNavModalProps: TocNavModalProps;
  tocModalProps: TocModalProps;
  ocrQueueModalProps: OcrQueueModalProps;
  searchModalProps: SearchModalProps;
  bookCardModalProps: BookCardModalProps;
  settingsModalProps: SettingsModalProps;
  quizModalProps: QuizModalProps;
  imagePreviewModalProps: ImagePreviewModalProps;
  vocabularyModalProps: VocabularyModalProps;
  listeningDashboardModalProps: ListeningDashboardModalProps;
  memoryCardModalProps: MemoryCardModalProps;
  promptEditorModalProps: PromptEditorModalProps;
}

function renderInPortal(content: ReactNode, portalTarget?: HTMLElement | null) {
  if (!portalTarget) {
    return content;
  }
  return createPortal(content, portalTarget);
}

export default function AppModals({
  portalTarget,
  toastProps,
  printModalProps,
  bookSelectModalProps,
  helpModalProps,
  bookmarksModalProps,
  textModalProps,
  tocNavModalProps,
  tocModalProps,
  ocrQueueModalProps,
  searchModalProps,
  bookCardModalProps,
  settingsModalProps,
  quizModalProps,
  imagePreviewModalProps,
  vocabularyModalProps,
  listeningDashboardModalProps,
  memoryCardModalProps,
  promptEditorModalProps
}: AppModalsProps) {
  return (
    <>
      <Toast {...toastProps} />
      <PrintModal {...printModalProps} />
      <BookSelectModal {...bookSelectModalProps} />
      {renderInPortal(<HelpModal {...helpModalProps} />, portalTarget)}
      <BookmarksModal {...bookmarksModalProps} />
      {renderInPortal(<TextModal {...textModalProps} />, portalTarget)}
      {renderInPortal(<TocNavModal {...tocNavModalProps} />, portalTarget)}
      {renderInPortal(<TocModal {...tocModalProps} />, portalTarget)}
      {renderInPortal(<SearchModal {...searchModalProps} />, portalTarget)}
      {renderInPortal(<BookCardModal {...bookCardModalProps} />, portalTarget)}
      {renderInPortal(<SettingsModal {...settingsModalProps} />, portalTarget)}
      {renderInPortal(<QuizModal {...quizModalProps} />, portalTarget)}
      {renderInPortal(<VocabularyModal {...vocabularyModalProps} />, portalTarget)}
      {renderInPortal(<MemoryCardModal {...memoryCardModalProps} />, portalTarget)}
      {renderInPortal(<PromptEditorModal {...promptEditorModalProps} />, portalTarget)}
      {renderInPortal(<ListeningDashboardModal {...listeningDashboardModalProps} />, portalTarget)}
      {renderInPortal(<ImagePreviewModal {...imagePreviewModalProps} />, portalTarget)}
      <OcrQueueModal {...ocrQueueModalProps} />
    </>
  );
}
