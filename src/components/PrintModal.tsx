interface PrintOption {
  id: string;
  label: string;
  detail: string;
  disabled?: boolean;
}

interface PrintModalProps {
  open: boolean;
  options: PrintOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export default function PrintModal({
  open,
  options,
  selectedId,
  onSelect,
  onClose,
  onConfirm,
  loading = false
}: PrintModalProps) {
  if (!open) {
    return null;
  }

  const hasOptions = options.length > 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Create printable PDF</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {!hasOptions && <p className="modal-status">No pages available to print.</p>}
          {hasOptions ? (
            <div className="print-options">
              {options.map((option) => (
                <label
                  key={option.id}
                  className={`print-option ${selectedId === option.id ? 'print-option-active' : ''} ${
                    option.disabled ? 'print-option-disabled' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="print-option"
                    value={option.id}
                    checked={selectedId === option.id}
                    disabled={option.disabled || loading}
                    onChange={() => onSelect(option.id)}
                  />
                  <div className="print-option-body">
                    <span className="print-option-title">{option.label}</span>
                    <span className="print-option-detail">{option.detail}</span>
                  </div>
                </label>
              ))}
            </div>
          ) : null}
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={onConfirm}
            disabled={loading || !hasOptions}
          >
            {loading ? 'Creating…' : 'Create PDF'}
          </button>
        </footer>
      </div>
    </div>
  );
}
