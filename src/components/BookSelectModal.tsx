import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import CloseIcon from '@/components/CloseIcon';
import ModalShell from '@/components/ModalShell';
import { useDeleteBook, useUploadChapter, useUploadPdf } from '@/hooks/useBookMutations';
import {
  appActions,
  selectBookCardWorkflow,
  selectBookIds,
  selectBookUploadingChapter,
  selectBookUploadingPdf,
  selectModalOpen,
  selectReaderSession,
  selectRefreshTokens,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import {
  loadBookMeta,
  loadBookSortMode,
  loadLibraryStateFromServer,
  saveBookSortMode,
  setBookDeferred
} from '@/lib/storage';

type BookSortMode = 'alphabetical' | 'recent' | 'deferred';

export default function BookSelectModal() {
  const dispatch = useAppDispatch();
  const deleteBook = useDeleteBook();
  const uploadChapter = useUploadChapter();
  const uploadPdf = useUploadPdf();
  const open = useAppSelector(selectModalOpen('bookSelect'));
  const { bookId: currentBook } = useAppSelector(selectReaderSession);
  const books = useAppSelector(selectBookIds);
  const uploadingChapter = useAppSelector(selectBookUploadingChapter);
  const uploadingPdf = useAppSelector(selectBookUploadingPdf);
  const { bookCards: cardRefreshToken } = useAppSelector(selectRefreshTokens);
  const {
    cardsByBook: bookCards,
    cardsLoading,
    cardsError
  } = useAppSelector(selectBookCardWorkflow);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [chapterBook, setChapterBook] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [sortMode, setSortMode] = useState<BookSortMode>(() => loadBookSortMode());
  const [bookMeta, setBookMeta] = useState(() => loadBookMeta());

  useEffect(() => {
    if (open) {
      setChapterBook(currentBook ?? '');
      setBookMeta(loadBookMeta());
      setSortMode(loadBookSortMode());
    }
  }, [currentBook, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void loadLibraryStateFromServer().then((state) => {
      if (cancelled) {
        return;
      }
      setBookMeta(state.bookMeta);
      setSortMode(state.bookSortMode);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    dispatch(appActions.loadBookCards());
  }, [books, cardRefreshToken, dispatch, open]);

  useEffect(() => {
    saveBookSortMode(sortMode);
  }, [sortMode]);

  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const formatLastOpened = (value?: string) => {
    if (!value) {
      return 'Never opened';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Never opened';
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const sortedBooks = [...books].sort((left, right) => {
    const leftMeta = bookMeta[left] ?? {};
    const rightMeta = bookMeta[right] ?? {};

    if (sortMode === 'recent') {
      const leftTime = leftMeta.lastOpenedAt ? new Date(leftMeta.lastOpenedAt).getTime() : 0;
      const rightTime = rightMeta.lastOpenedAt ? new Date(rightMeta.lastOpenedAt).getTime() : 0;
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }
      return collator.compare(left, right);
    }

    if (sortMode === 'deferred') {
      const leftDeferred = Boolean(leftMeta.deferred);
      const rightDeferred = Boolean(rightMeta.deferred);
      if (leftDeferred !== rightDeferred) {
        return leftDeferred ? -1 : 1;
      }
      return collator.compare(left, right);
    }

    return collator.compare(left, right);
  });

  const handleSelectChapter = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    void uploadChapter(file, { bookName: chapterBook, chapterTitle });
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSelectPdf = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    void uploadPdf(file);
  };

  const handleTriggerPdfUpload = () => {
    pdfInputRef.current?.click();
  };
  const handleClose = () => {
    dispatch(appActions.closeModal('bookSelect'));
  };
  const handleSelectBook = (book: string) => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('reader'));
    dispatch(appActions.setReaderBookId(book));
    dispatch(appActions.closeModal('bookSelect'));
  };
  if (!open) {
    return null;
  }

  return (
    <ModalShell ariaLabel="Select a book" onClose={handleClose} className="modal-wide book-select-modal">
        <header className="modal-header book-select-header">
          <div className="book-select-heading">
            <h2 className="modal-title">Your library</h2>
            <span className="book-select-heading-meta">
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </span>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={handleClose}
              aria-label="Close book selector"
              title="Close book selector"
            >
              <CloseIcon />
            </button>
          </div>
        </header>
        <section className="modal-body book-select-body">
          <div className="book-select-toolbar">
            <div>
              <span className="book-select-toolbar-label">Book feed</span>
              <p className="book-select-toolbar-copy">Pick up where you left off or save something for later.</p>
            </div>
            <div className="segmented" role="tablist" aria-label="Book sort">
              <button
                type="button"
                className={`segmented-item ${sortMode === 'recent' ? 'segmented-item-active' : ''}`}
                onClick={() => setSortMode('recent')}
                role="tab"
                aria-selected={sortMode === 'recent'}
              >
                Recent
              </button>
              <button
                type="button"
                className={`segmented-item ${sortMode === 'deferred' ? 'segmented-item-active' : ''}`}
                onClick={() => setSortMode('deferred')}
                role="tab"
                aria-selected={sortMode === 'deferred'}
              >
                Saved
              </button>
              <button
                type="button"
                className={`segmented-item ${sortMode === 'alphabetical' ? 'segmented-item-active' : ''}`}
                onClick={() => setSortMode('alphabetical')}
                role="tab"
                aria-selected={sortMode === 'alphabetical'}
              >
                A-Z
              </button>
            </div>
          </div>
          {books.length === 0 ? (
            <p className="modal-status">No books found. Upload a chapter to create one.</p>
          ) : (
            <ul className="book-select-list">
              {sortedBooks.map((book) => {
                const active = currentBook === book;
                const meta = bookMeta[book] ?? {};
                const isDeferred = Boolean(meta.deferred);
                const card = bookCards[book];
                const displayTitle = card?.title?.trim() || book;
                const displayAuthor = card?.author?.trim() || '';
                const displayCategory = card?.category?.trim() || '';
                const displayCover = card?.coverImage ?? null;
                return (
                  <li key={book}>
                    <article className={`book-select-row ${active ? 'book-select-row-active' : ''}`}>
                      <button
                        type="button"
                        className={`book-select-button ${active ? 'book-select-button-active' : ''}`}
                        onClick={() => handleSelectBook(book)}
                      >
                        <span className="book-select-cover">
                          {displayCover ? (
                            <img src={displayCover} alt={displayTitle} className="book-select-cover-image" />
                          ) : (
                            <span className="book-select-cover-placeholder">
                              {card?.bookType === 'text' ? 'TXT' : 'IMG'}
                            </span>
                          )}
                        </span>
                        <span className="book-select-labels">
                          <span className="book-select-name-row">
                            <span className="book-select-name">{displayTitle}</span>
                            {active ? <span className="book-select-marker">Current</span> : null}
                            {isDeferred ? <span className="book-select-tag">Saved</span> : null}
                          </span>
                          {displayAuthor || displayCategory ? (
                            <span className="book-select-meta-row">
                              {displayAuthor ? <span>{displayAuthor}</span> : null}
                              {displayCategory ? <span>{displayCategory}</span> : null}
                            </span>
                          ) : null}
                          <span className="book-select-subtitle">
                            Last opened: {formatLastOpened(meta.lastOpenedAt)}
                          </span>
                          <span className="book-select-subtitle book-select-id">{book}</span>
                        </span>
                        <span className="book-select-open" aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false">
                            <path d="m9 18 6-6-6-6" />
                          </svg>
                        </span>
                      </button>
                      <div className="book-select-actions">
                        <button
                          type="button"
                          className="button button-ghost book-select-action"
                          onClick={() => dispatch(appActions.openBookCard(book))}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`button button-ghost book-select-action book-select-deferred ${isDeferred ? 'book-select-deferred-active' : ''}`}
                          onClick={() => {
                            const nextDeferred = !isDeferred;
                            setBookDeferred(book, nextDeferred);
                            setBookMeta((prev) => ({
                              ...prev,
                              [book]: {
                                ...prev[book],
                                deferred: nextDeferred
                              }
                            }));
                          }}
                          aria-label={isDeferred ? `Remove ${book} from saved` : `Mark ${book} as saved`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M6 4h12v17l-6-4-6 4Z" />
                          </svg>
                          {isDeferred ? 'Saved' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="button button-ghost book-select-action book-select-delete"
                          onClick={() => void deleteBook(book)}
                          aria-label={`Delete ${book}`}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                            <path d="M4 7h16" />
                            <path d="M9 7V4h6v3" />
                            <path d="m6 7 1 14h10l1-14" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          {cardsLoading ? <p className="modal-status">Loading book cards…</p> : null}
          {cardsError ? <p className="modal-status">{cardsError}</p> : null}
          <div className="book-select-import-heading">
            <span className="book-select-toolbar-label">Add to library</span>
            <p className="book-select-toolbar-copy">Import a text chapter or start a scanned book from PDF.</p>
          </div>
          <div className="book-select-imports">
          <div className="book-upload book-upload-chapter">
            <div className="book-upload-header">
              <span className="book-upload-title">Text chapters</span>
              <span className="book-upload-hint">
                Leave book blank to use the current selection.
              </span>
            </div>
            <div className="book-upload-fields">
              <label className="book-upload-field">
                Book
                <input
                  type="text"
                  className="input"
                  placeholder={currentBook ?? 'New book name'}
                  value={chapterBook}
                  onChange={(event) => setChapterBook(event.target.value)}
                />
              </label>
              <label className="book-upload-field">
                Chapter title
                <input
                  type="text"
                  className="input"
                  placeholder="Optional"
                  value={chapterTitle}
                  onChange={(event) => setChapterTitle(event.target.value)}
                />
              </label>
          </div>
          <div className="book-upload-actions">
            <button
              type="button"
              className="button"
              onClick={handleTriggerUpload}
              disabled={uploadingChapter}
            >
              {uploadingChapter ? 'Uploading…' : 'Upload Chapter'}
            </button>
          </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              style={{ display: 'none' }}
              onChange={handleSelectChapter}
            />
          </div>
          <div className="book-upload">
            <div className="book-upload-header">
              <span className="book-upload-title">Import</span>
              <span className="book-upload-hint">Upload a PDF to create a scanned book.</span>
            </div>
            <div className="book-upload-actions">
              <button
                type="button"
                className="button"
                onClick={handleTriggerPdfUpload}
                disabled={uploadingPdf}
              >
                {uploadingPdf ? 'Uploading…' : 'Upload PDF'}
              </button>
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              style={{ display: 'none' }}
              onChange={handleSelectPdf}
            />
          </div>
          </div>
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-primary" onClick={handleClose}>
            Done
          </button>
        </footer>
    </ModalShell>
  );
}
