import { useId, useRef, type ReactNode } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';

type ConfirmationModalProps = {
  busy?: boolean;
  children: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
};

export default function ConfirmationModal({
  busy = false,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
  title
}: ConfirmationModalProps) {
  const titleId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalShell
      ariaLabelledBy={titleId}
      className="modal-confirmation"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      initialFocusRef={cancelButtonRef}
      onClose={onCancel}
    >
      <header className="modal-header">
        <h2 id={titleId} className="modal-title">{title}</h2>
        <button
          type="button"
          className="button button-ghost modal-icon-button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close confirmation"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="modal-body confirmation-modal-body">{children}</div>
      <footer className="modal-footer confirmation-modal-actions">
        <button
          ref={cancelButtonRef}
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </footer>
    </ModalShell>
  );
}
