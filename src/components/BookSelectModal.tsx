interface BookSelectModalProps {
  open: boolean;
  books: string[];
  currentBook: string | null;
  onSelect: (bookId: string) => void;
  onDelete: (bookId: string) => void;
  onUploadPdf: () => void;
  uploadingPdf: boolean;
  onClose: () => void;
}

export default function BookSelectModal({
  open,
  books,
  currentBook,
  onSelect,
  onDelete,
  onUploadPdf,
  uploadingPdf,
  onClose
}: BookSelectModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal-header">
          <h2 className="modal-title">Select a book</h2>
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <section className="modal-body">
          {books.length === 0 ? (
            <p className="modal-status">No books found. Add files to /data to begin.</p>
          ) : (
            <ul className="book-select-list">
              {books.map((book) => {
                const active = currentBook === book;
                return (
                  <li key={book}>
                    <div className="book-select-row">
                      <button
                        type="button"
                        className={`book-select-button ${active ? 'book-select-button-active' : ''}`}
                        onClick={() => onSelect(book)}
                      >
                        {book}
                        {active ? <span className="book-select-marker">Current</span> : null}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost book-select-delete"
                        onClick={() => onDelete(book)}
                        aria-label={`Delete ${book}`}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <footer className="modal-footer">
          <button type="button" className="button" onClick={onUploadPdf} disabled={uploadingPdf}>
            {uploadingPdf ? 'Uploading…' : 'Upload PDF'}
          </button>
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
