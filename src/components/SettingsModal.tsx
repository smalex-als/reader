import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import Toolbar from '@/components/Toolbar';
import {
  appActions,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function SettingsModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('settings'));
  const handleClose = () => {
    dispatch(appActions.closeModal('settings'));
  };

  if (!open) {
    return null;
  }

  return (
    <ModalShell ariaLabel="Settings" onClose={handleClose} className="modal-settings">
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
          <Toolbar />
        </section>
    </ModalShell>
  );
}
