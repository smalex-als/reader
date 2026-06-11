import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectModalOpen,
  selectPrintWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import { usePrintOptions } from '@/hooks/usePrintOptions';

export default function PrintModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectModalOpen('print'));
  const { selection: selectedId, loading } = useAppSelector(selectPrintWorkflow);
  const { createPrintPdf, printOptions: options } = usePrintOptions();

  const handleClose = () => {
    dispatch(appActions.closeModal('print'));
  };
  const handleSelect = (id: string) => {
    dispatch(appActions.setPrintSelection(id));
  };

  if (!open) {
    return null;
  }

  const hasOptions = options.length > 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Create printable PDF</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close print dialog"
            title="Close print dialog"
          >
            <CloseIcon />
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
                    onChange={() => handleSelect(option.id)}
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
          <button type="button" className="button button-secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void createPrintPdf()}
            disabled={loading || !hasOptions}
          >
            {loading ? 'Creating…' : 'Create PDF'}
          </button>
        </footer>
      </div>
    </div>
  );
}
