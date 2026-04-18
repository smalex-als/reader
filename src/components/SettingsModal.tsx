import type { ComponentProps } from 'react';
import CloseIcon from '@/components/CloseIcon';
import Toolbar from '@/components/Toolbar';

type ToolbarProps = ComponentProps<typeof Toolbar>;

interface SettingsModalProps {
  open: boolean;
  toolbarProps: ToolbarProps;
  onClose: () => void;
}

export default function SettingsModal({ open, toolbarProps, onClose }: SettingsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-settings">
        <header className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={onClose}
            aria-label="Close settings"
            title="Close settings"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body modal-settings-body">
          <Toolbar {...toolbarProps} layout="modal" />
        </section>
      </div>
    </div>
  );
}
