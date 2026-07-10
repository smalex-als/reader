import { useEffect, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import {
  appActions,
  selectBookCardBookId,
  selectBookCardWorkflow,
  selectBookCardOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

const CATEGORY_SUGGESTIONS = [
  'Fiction',
  'IT',
  'Business',
  'Health',
  'Cooking',
  'Education',
  'Other'
] as const;

export default function BookCardModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectBookCardOpen);
  const bookId = useAppSelector(selectBookCardBookId);
  const {
    editor: { card, loading, saving, error: loadError }
  } = useAppSelector(selectBookCardWorkflow);
  const activeCard = card?.book === bookId ? card : null;
  const [draft, setDraft] = useState({
    title: '',
    author: '',
    category: '',
    coverImage: '',
    defaultCoverImage: ''
  });
  const handleClose = () => {
    dispatch(appActions.closeBookCard());
  };

  useEffect(() => {
    if (!open || !bookId) {
      return;
    }
    dispatch(appActions.loadBookCardEditor(bookId));
  }, [bookId, dispatch, open]);

  useEffect(() => {
    if (!activeCard) {
      return;
    }
    setDraft({
      title: activeCard.title ?? activeCard.book,
      author: activeCard.author ?? '',
      category: activeCard.category ?? '',
      coverImage: activeCard.coverImage ?? '',
      defaultCoverImage: activeCard.defaultCoverImage ?? ''
    });
  }, [activeCard]);

  if (!open || !bookId) {
    return null;
  }

  return (
    <ModalShell
      ariaLabel="Book card"
      onClose={handleClose}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
    >
        <header className="modal-header">
          <h2 className="modal-title">Book Card</h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close book card"
            title="Close book card"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          {loading ? <p className="modal-status">Loading book card…</p> : null}
          {loadError ? <p className="modal-status">{loadError}</p> : null}
          {activeCard ? (
            <div className="book-card-editor book-card-editor-modal">
              <div className="book-card-editor-grid">
                <label className="book-upload-field">
                  Title
                  <input
                    type="text"
                    className="input"
                    value={draft.title}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((prev) => ({ ...prev, title: value }));
                    }}
                  />
                </label>
                <label className="book-upload-field">
                  Author
                  <input
                    type="text"
                    className="input"
                    value={draft.author}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((prev) => ({ ...prev, author: value }));
                    }}
                  />
                </label>
                <label className="book-upload-field">
                  Category
                  <input
                    type="text"
                    className="input"
                    list="book-card-category-suggestions"
                    value={draft.category}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setDraft((prev) => ({ ...prev, category: value }));
                    }}
                  />
                </label>
                <div className="book-card-cover-settings">
                  <span className="book-card-cover-title">Cover</span>
                  <div className="book-card-cover-preview">
                    {draft.coverImage ? (
                      <img
                        src={draft.coverImage}
                        alt={draft.title || bookId}
                        className="book-select-cover-image"
                      />
                    ) : (
                      <span className="book-select-cover-placeholder">
                        {activeCard.bookType === 'text' ? 'TXT' : 'IMG'}
                      </span>
                    )}
                  </div>
                  <div className="book-card-cover-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          coverImage: prev.defaultCoverImage
                        }))
                      }
                      disabled={!draft.defaultCoverImage}
                    >
                      Use First Image
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          coverImage: ''
                        }))
                      }
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
              <p className="book-select-subtitle book-select-id">{bookId}</p>
            </div>
          ) : null}
          <datalist id="book-card-category-suggestions">
            {CATEGORY_SUGGESTIONS.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </section>
        <footer className="modal-footer modal-footer-right">
          <button type="button" className="button button-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="button"
            disabled={saving || !activeCard}
            onClick={() => {
              if (!activeCard) {
                return;
              }
              dispatch(appActions.saveBookCardEditor(bookId, {
                title: draft.title,
                author: draft.author,
                category: draft.category,
                coverImage: draft.coverImage
              }));
            }}
          >
            {saving ? 'Saving…' : 'Save Card'}
          </button>
        </footer>
    </ModalShell>
  );
}
