import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectModalOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

interface Hotkey {
  keys: string;
  action: string;
}

interface HelpModalProps {
  hotkeys: Hotkey[];
}

export default function HelpModal({ hotkeys }: HelpModalProps) {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('help'));
  const handleClose = () => {
    dispatch(appActions.closeModal('help'));
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
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
            {hotkeys.map((hotkey) => (
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
      </div>
    </div>
  );
}
