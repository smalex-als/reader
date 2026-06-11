import { useEffect, useState } from 'react';
import CloseIcon from '@/components/CloseIcon';
import {
  appActions,
  selectBookCardBookId,
  selectBookCardOpen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { BookCard } from '@/types/app';

const CATEGORY_SUGGESTIONS = [
  'Fiction',
  'IT',
  'Business',
  'Health',
  'Cooking',
  'Education',
  'Other'
] as const;

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export default function BookCardModal() {
  const dispatch = useAppDispatch();
  const open = useAppSelector(selectBookCardOpen);
  const bookId = useAppSelector(selectBookCardBookId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [card, setCard] = useState<BookCard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    let cancelled = false;
    setCard({
      book: bookId,
      title: bookId,
      author: '',
      category: '',
      coverImage: null,
      defaultCoverImage: null,
      bookType: 'image'
    });
    setDraft({
      title: bookId,
      author: '',
      category: '',
      coverImage: '',
      defaultCoverImage: ''
    });
    setLoadError(null);
    setLoading(true);
    void fetchJson<BookCard>(`/api/books/${encodeURIComponent(bookId)}/meta`)
      .then((nextCard) => {
        if (cancelled) {
          return;
        }
        setCard(nextCard);
        setDraft({
          title: nextCard.title ?? bookId,
          author: nextCard.author ?? '',
          category: nextCard.category ?? '',
          coverImage: nextCard.coverImage ?? '',
          defaultCoverImage: nextCard.defaultCoverImage ?? ''
        });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setLoadError('Unable to load saved book card data');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, open]);

  if (!open || !bookId) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
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
          {card ? (
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
                        {card.bookType === 'text' ? 'TXT' : 'IMG'}
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
            disabled={saving || !card}
            onClick={() => {
              if (!card) {
                return;
              }
              setSaving(true);
              void fetchJson<BookCard>(`/api/books/${encodeURIComponent(bookId)}/meta`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: draft.title,
                  author: draft.author,
                  category: draft.category,
                  coverImage: draft.coverImage
                })
              })
                .then(() => {
                  dispatch(appActions.refreshBookCards());
                  handleClose();
                })
                .catch((error) => {
                  console.error(error);
                })
                .finally(() => {
                  setSaving(false);
                });
            }}
          >
            {saving ? 'Saving…' : 'Save Card'}
          </button>
        </footer>
      </div>
    </div>
  );
}
