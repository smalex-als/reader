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

type ToastProps = ComponentProps<typeof Toast>;
type PrintModalProps = ComponentProps<typeof PrintModal>;
type BookSelectModalProps = ComponentProps<typeof BookSelectModal>;
type HelpModalProps = ComponentProps<typeof HelpModal>;
type BookmarksModalProps = ComponentProps<typeof BookmarksModal>;
type TextModalProps = ComponentProps<typeof TextModal>;
type TocNavModalProps = ComponentProps<typeof TocNavModal>;
type TocModalProps = ComponentProps<typeof TocModal>;
type OcrQueueModalProps = ComponentProps<typeof OcrQueueModal>;

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
  ocrQueueModalProps
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
      <OcrQueueModal {...ocrQueueModalProps} />
    </>
  );
}
