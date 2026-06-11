import CloseIcon from '@/components/CloseIcon';
import { useRemoveBookmark } from '@/hooks/useBookmarks';
import {
  appActions,
  selectBookmarkWorkflow,
  selectModalOpen,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { Bookmark } from '@/types/app';

interface BookmarksModalProps {
  onSelect: (bookmark: Bookmark) => void;
}

export default function BookmarksModal({
  onSelect
}: BookmarksModalProps) {
  const dispatch = useAppDispatch();
  const removeBookmark = useRemoveBookmark();
  const open = useAppSelector(selectModalOpen('bookmarks'));
  const { bookId: currentBook, currentPage } = useAppSelector(selectReaderSession);
  const { items: bookmarks, loading } = useAppSelector(selectBookmarkWorkflow);
  const handleClose = () => {
    dispatch(appActions.closeModal('bookmarks'));
  };

  if (!open) {
    return null;
  }

  const sorted = [...bookmarks].sort((a, b) => a.page - b.page);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">
            Bookmarks
            {currentBook ? <span className="modal-marker">• {currentBook}</span> : null}
          </h2>
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={handleClose}
            aria-label="Close bookmarks"
            title="Close bookmarks"
          >
            <CloseIcon />
          </button>
        </header>
        <section className="modal-body">
          {loading && <p className="modal-status">Loading bookmarks…</p>}
          {!loading && sorted.length === 0 ? (
            <p className="modal-status">No bookmarks saved for this book.</p>
          ) : null}
          {!loading && sorted.length > 0 ? (
            <ul className="bookmark-list">
              {sorted.map((bookmark) => {
                const isActive = bookmark.page === currentPage;
                return (
                  <li
                    key={`${bookmark.image}-${bookmark.page}`}
                    className={`bookmark-item ${isActive ? 'bookmark-item-active' : ''}`}
                  >
                    <div className="bookmark-meta">
                      <div className="bookmark-meta-row">
                        <span className="bookmark-title">{bookmark.label}</span>
                        <span className="bookmark-subtitle">Page {bookmark.page + 1}</span>
                        {isActive ? <span className="bookmark-badge">Current</span> : null}
                      </div>
                      <span className="bookmark-path">{bookmark.image}</span>
                    </div>
                    <div className="bookmark-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => onSelect(bookmark)}
                      >
                        Go to page
                      </button>
                      <button
                        type="button"
                        className="button button-ghost"
                        onClick={() => void removeBookmark(bookmark.page)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
