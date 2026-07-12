import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useUploadChapter, useUploadPdf } from '@/hooks/useBookMutations';
import {
  selectBookUploadingChapter,
  selectBookUploadingPdf,
  useAppSelector
} from '@/state/appState';

export default function BookImportPanel({
  currentBook,
  mode,
  open
}: {
  currentBook: string | null;
  mode: 'chapter' | 'pdf';
  open: boolean;
}) {
  const uploadChapter = useUploadChapter();
  const uploadPdf = useUploadPdf();
  const uploadingChapter = useAppSelector(selectBookUploadingChapter);
  const uploadingPdf = useAppSelector(selectBookUploadingPdf);
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
    if (file) {
      void uploadChapter(file, { bookName: chapterBook, chapterTitle });
    }
  };

  const handleSelectPdf = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (file) {
      void uploadPdf(file);
    }
  };

  return (
    <div className="book-import-tab-panel">
      {mode === 'chapter' ? (
        <div className="book-upload book-upload-standalone">
          <div className="book-upload-header">
            <span className="book-upload-title">Text chapters</span>
            <span className="book-upload-hint">Leave book blank to use the current selection.</span>
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
              onClick={() => fileInputRef.current?.click()}
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
      ) : (
        <div className="book-upload book-upload-standalone book-upload-pdf">
          <div className="book-upload-header">
            <div>
              <span className="book-upload-title">New scanned book</span>
              <h3 className="book-upload-heading">Upload a PDF</h3>
            </div>
            <span className="book-upload-hint">The PDF will be converted into page images.</span>
          </div>
          <div className="book-upload-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => pdfInputRef.current?.click()}
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
      )}
    </div>
  );
}
