import type { BookFeedItem } from '@/hooks/useBookLibraryFeed';

type BookFeedCardProps = {
  item: BookFeedItem;
  onDelete: (bookId: string) => void;
  onEdit: (bookId: string) => void;
  onSelect: (bookId: string) => void;
  onToggleSaved: (bookId: string) => void;
};

export default function BookFeedCard({
  item,
  onDelete,
  onEdit,
  onSelect,
  onToggleSaved
}: BookFeedCardProps) {
  return (
    <article className={`book-select-row ${item.active ? 'book-select-row-active' : ''}`}>
      <button
        type="button"
        className={`book-select-button ${item.active ? 'book-select-button-active' : ''}`}
        onClick={() => onSelect(item.id)}
      >
        <span className="book-select-cover">
          {item.coverImage ? (
            <img src={item.coverImage} alt={item.title} className="book-select-cover-image" loading="lazy" />
          ) : (
            <span className="book-select-cover-placeholder">
              {item.bookType === 'text' ? 'TXT' : 'IMG'}
            </span>
          )}
        </span>
        <span className="book-select-labels">
          <span className="book-select-name-row">
            <span className="book-select-name">{item.title}</span>
            {item.active ? <span className="book-select-marker">Current</span> : null}
            {item.saved ? <span className="book-select-tag">Saved</span> : null}
          </span>
          {item.author || item.category ? (
            <span className="book-select-meta-row">
              {item.author ? <span>{item.author}</span> : null}
              {item.category ? <span>{item.category}</span> : null}
            </span>
          ) : null}
          <span className="book-select-subtitle">Last opened: {item.lastOpenedLabel}</span>
          <span className="book-select-subtitle book-select-id">{item.id}</span>
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
          onClick={() => onEdit(item.id)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
          Edit
        </button>
        <button
          type="button"
          className={`button button-ghost book-select-action book-select-deferred ${item.saved ? 'book-select-deferred-active' : ''}`}
          onClick={() => onToggleSaved(item.id)}
          aria-label={item.saved ? `Remove ${item.id} from saved` : `Mark ${item.id} as saved`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 4h12v17l-6-4-6 4Z" />
          </svg>
          {item.saved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          className="button button-ghost book-select-action book-select-delete"
          onClick={() => onDelete(item.id)}
          aria-label={`Delete ${item.id}`}
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
  );
}
