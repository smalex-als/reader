import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { resolveTrappedFocusIndex } from '@/lib/modalFocus';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const modalStack: symbol[] = [];

function isTopModal(token: symbol) {
  return modalStack[modalStack.length - 1] === token;
}

function registerModal(token: symbol) {
  modalStack.push(token);
  return () => {
    const index = modalStack.lastIndexOf(token);
    if (index !== -1) {
      modalStack.splice(index, 1);
    }
  };
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true'
  );
}

type ModalShellLabel =
  | { ariaLabel: string; ariaLabelledBy?: never }
  | { ariaLabel?: never; ariaLabelledBy: string };

type ModalShellProps = ModalShellLabel & {
  children: ReactNode;
  className?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
};

export default function ModalShell({
  ariaLabel,
  ariaLabelledBy,
  children,
  className,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  onClose
}: ModalShellProps) {
  const backdropMouseDownRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const onCloseRef = useRef(onClose);
  const tokenRef = useRef(Symbol('modal'));

  useEffect(() => {
    onCloseRef.current = onClose;
    closeOnEscapeRef.current = closeOnEscape;
  }, [closeOnEscape, onClose]);

  useEffect(() => {
    const token = tokenRef.current;
    const restoreFocusTarget = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const unregister = registerModal(token);
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog || !isTopModal(token)) {
        return;
      }
      const initialTarget = initialFocusRef?.current ?? getFocusableElements(dialog)[0] ?? dialog;
      initialTarget.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopModal(token)) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (closeOnEscapeRef.current) {
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      const focusableElements = getFocusableElements(dialog);
      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      const nextIndex = resolveTrappedFocusIndex(
        currentIndex,
        focusableElements.length,
        event.shiftKey
      );
      event.preventDefault();
      if (nextIndex === -1) {
        dialog.focus({ preventScroll: true });
        return;
      }
      focusableElements[nextIndex]?.focus({ preventScroll: true });
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      const shouldRestoreFocus = isTopModal(token);
      document.removeEventListener('keydown', handleKeyDown);
      unregister();
      if (shouldRestoreFocus && restoreFocusTarget?.isConnected) {
        restoreFocusTarget.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef]);

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      closeOnBackdrop &&
      backdropMouseDownRef.current &&
      event.target === event.currentTarget &&
      isTopModal(tokenRef.current)
    ) {
      onCloseRef.current();
    }
    backdropMouseDownRef.current = false;
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        backdropMouseDownRef.current = event.target === event.currentTarget;
      }}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={['modal', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
