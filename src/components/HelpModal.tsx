interface Hotkey {
  keys: string;
  action: string;
}

interface HelpModalProps {
  open: boolean;
  hotkeys: Hotkey[];
  onClose: () => void;
}

export default function HelpModal({ open, hotkeys, onClose }: HelpModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Keyboard shortcuts</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
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
          <button type="button" className="button button-primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}
