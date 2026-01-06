import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

interface BookSelectModalProps {
  open: boolean;
  books: string[];
  currentBook: string | null;
  onSelect: (bookId: string) => void;
  onDelete: (bookId: string) => void;
  onUploadChapter: (file: File, details: { bookName: string; chapterTitle: string }) => void;
  uploadingChapter: boolean;
  onUploadPdf: (file: File) => void;
  uploadingPdf: boolean;
  onClose: () => void;
}

export default function BookSelectModal({
  open,
  books,
  currentBook,
  onSelect,
  onDelete,
  onUploadChapter,
  uploadingChapter,
  onUploadPdf,
  uploadingPdf,
  onClose
}: BookSelectModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [chapterBook, setChapterBook] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');

  useEffect(() => {
    if (open) {
      setChapterBook(currentBook ?? '');
    }
  }, [currentBook, open]);

  const handleSelectChapter = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) {
      return;
    }
    onUploadChapter(file, { bookName: chapterBook, chapterTitle });
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
    onUploadPdf(file);
  };

  const handleTriggerPdfUpload = () => {
    pdfInputRef.current?.click();
  };

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
            <p className="modal-status">No books found. Upload a chapter to create one.</p>
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
          <div className="book-upload">
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
        </section>
        <footer className="modal-footer">
          <button type="button" className="button button-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
