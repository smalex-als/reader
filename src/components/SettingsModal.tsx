import type { ComponentProps } from 'react';
import CloseIcon from '@/components/CloseIcon';
import Toolbar from '@/components/Toolbar';
import {
  appActions,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

type ToolbarProps = ComponentProps<typeof Toolbar>;

interface SettingsModalProps {
  toolbarProps: Omit<ToolbarProps, 'layout'>;
}

export default function SettingsModal({ toolbarProps }: SettingsModalProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('settings'));
  const handleClose = () => {
    dispatch(appActions.closeModal('settings'));
  };

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
            onClick={handleClose}
            aria-label="Close settings"
            title="Close settings"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body modal-settings-body">
          <Toolbar
            {...toolbarProps}
            layout="modal"
          />
        </section>
      </div>
    </div>
  );
}
