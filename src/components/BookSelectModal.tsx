import { useEffect, useState } from 'react';
import BookFeedCard from '@/components/BookFeedCard';
import BookImportPanel from '@/components/BookImportPanel';
import CloseIcon from '@/components/CloseIcon';
import ConfirmationModal from '@/components/ConfirmationModal';
import ModalShell from '@/components/ModalShell';
import { useBookLibraryFeed } from '@/hooks/useBookLibraryFeed';
import { useDeleteBook } from '@/hooks/useBookMutations';
import {
  appActions,
  selectModalOpen,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { BookSortMode } from '@/lib/storage';

const SORT_OPTIONS: Array<{ label: string; value: BookSortMode }> = [
  { label: 'Recent', value: 'recent' },
  { label: 'Saved', value: 'deferred' },
  { label: 'A-Z', value: 'alphabetical' }
];

type LibraryTab = 'library' | 'pdf' | 'chapter';

const LIBRARY_TABS: Array<{ label: string; value: LibraryTab }> = [
  { label: 'Library', value: 'library' },
  { label: 'Upload PDF', value: 'pdf' },
  { label: 'Text chapter', value: 'chapter' }
];

export default function BookSelectModal() {
  const dispatch = useAppDispatch();
  const deleteBook = useDeleteBook();
  const open = useAppSelector(selectModalOpen('bookSelect'));
  const { bookId: currentBook } = useAppSelector(selectReaderSession);
  const {
    cardsError,
    cardsLoading,
    items,
    setSortMode,
    sortMode,
    toggleSaved,
    totalBooks
  } = useBookLibraryFeed({ currentBook, open });
  const [pendingDeleteBook, setPendingDeleteBook] = useState<string | null>(null);
  const [deletingBook, setDeletingBook] = useState(false);
  const [activeTab, setActiveTab] = useState<LibraryTab>('library');

  useEffect(() => {
    if (open) {
      setActiveTab('library');
    }
  }, [open]);

  const handleClose = () => {
    dispatch(appActions.closeModal('bookSelect'));
  };

  const handleSelectBook = (book: string) => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('reader'));
    dispatch(appActions.setReaderBookId(book));
    dispatch(appActions.closeModal('bookSelect'));
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteBook || deletingBook) {
      return;
    }
    setDeletingBook(true);
    try {
      await deleteBook(pendingDeleteBook);
      setPendingDeleteBook(null);
    } finally {
      setDeletingBook(false);
    }
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
            {totalBooks} {totalBooks === 1 ? 'book' : 'books'}
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
        <div className="book-select-view-tabs" role="tablist" aria-label="Library sections">
          {LIBRARY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`book-select-view-tab ${activeTab === tab.value ? 'book-select-view-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.value)}
              role="tab"
              aria-selected={activeTab === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'library' ? (
          <div role="tabpanel" className="book-select-feed-panel">
            <div className="book-select-toolbar">
              <div>
                <span className="book-select-toolbar-label">Book feed</span>
                <p className="book-select-toolbar-copy">Pick up where you left off or save something for later.</p>
              </div>
              <div className="segmented" role="tablist" aria-label="Book sort">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`segmented-item ${sortMode === option.value ? 'segmented-item-active' : ''}`}
                    onClick={() => setSortMode(option.value)}
                    role="tab"
                    aria-selected={sortMode === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {items.length === 0 ? (
              <p className="modal-status">No books found. Upload a PDF or text chapter to create one.</p>
            ) : (
              <ul className="book-select-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <BookFeedCard
                      item={item}
                      onDelete={setPendingDeleteBook}
                      onEdit={(book) => dispatch(appActions.openBookCard(book))}
                      onSelect={handleSelectBook}
                      onToggleSaved={toggleSaved}
                    />
                  </li>
                ))}
              </ul>
            )}
            {cardsLoading ? <p className="modal-status">Loading book cards…</p> : null}
            {cardsError ? <p className="modal-status">{cardsError}</p> : null}
          </div>
        ) : (
          <div role="tabpanel">
            <BookImportPanel currentBook={currentBook} mode={activeTab} open={open} />
          </div>
        )}
      </section>
      <footer className="modal-footer">
        <button type="button" className="button button-primary" onClick={handleClose}>
          Done
        </button>
      </footer>
      {pendingDeleteBook ? (
        <ConfirmationModal
          title="Delete this book?"
          confirmLabel="Delete book"
          busy={deletingBook}
          onCancel={() => setPendingDeleteBook(null)}
          onConfirm={() => void handleConfirmDelete()}
        >
          <p className="confirmation-modal-copy">
            <strong>{pendingDeleteBook}</strong> and all of its files will be permanently deleted.
            This action cannot be undone.
          </p>
        </ConfirmationModal>
      ) : null}
    </ModalShell>
  );
}
