import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import { HOTKEYS } from '@/lib/hotkeys';
import {
  appActions,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function HelpModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('help'));
  const handleClose = () => {
    dispatch(appActions.closeModal('help'));
  };

  if (!open) {
    return null;
  }

  return (
    <ModalShell ariaLabel="Keyboard shortcuts" onClose={handleClose}>
        <header className="modal-header">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close shortcuts"
            title="Close shortcuts"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          <ul className="hotkey-list">
            {HOTKEYS.map((hotkey) => (
              <li key={hotkey.keys} className="hotkey-row">
                <span className="hotkey-keys">{hotkey.keys}</span>
                <span className="hotkey-action">{hotkey.action}</span>
              </li>
            ))}
          </ul>
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-primary" onClick={handleClose}>
            Got it
          </button>
        </footer>
    </ModalShell>
  );
}
