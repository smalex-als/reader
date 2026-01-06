import { useCallback, useEffect, useState } from 'react';
import type { TocEntry } from '@/types/app';

interface ChapterEditorProps {
  bookId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  onClose: () => void;
  onSaved: (toc: TocEntry[] | null) => void;
}

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

export default function ChapterEditor({
  bookId,
  chapterNumber,
  chapterTitle,
  onClose,
  onSaved
}: ChapterEditorProps) {
  const [draftText, setDraftText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setDraftText('');
      setDraftTitle('');
      setError(null);
      setLoading(false);
      return;
    }

    let canceled = false;
    const filename = formatChapterFilename(chapterNumber);
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setLoading(true);
    setError(null);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to load chapter.');
        }
        return response.text();
      })
      .then((text) => {
        if (canceled) {
          return;
        }
        setDraftText(text.trim());
        setDraftTitle(chapterTitle ?? '');
      })
      .catch((err: Error) => {
        if (canceled) {
          return;
        }
        setError(err.message || 'Unable to load chapter text.');
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, chapterTitle]);

  const handleSave = useCallback(async () => {
    if (!bookId || !chapterNumber || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draftText, title: draftTitle })
        }
      );
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      const payload = (await response.json()) as { toc?: TocEntry[] };
      onSaved(Array.isArray(payload.toc) ? payload.toc : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save chapter.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [bookId, chapterNumber, draftText, draftTitle, onSaved, saving]);

  return (
    <div className="chapter-editor">
      <header className="chapter-editor-header">
        <div className="chapter-editor-title">
          <span className="text-viewer-label">Edit Chapter</span>
          <input
            type="text"
            className="input chapter-editor-title-input"
            placeholder="Chapter title"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            disabled={loading || saving}
          />
        </div>
        <div className="chapter-editor-actions">
          <button type="button" className="button" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
            Close
          </button>
        </div>
      </header>
      <section className="chapter-editor-body">
        {loading ? <p className="text-viewer-status">Loading chapter text…</p> : null}
        {error ? <p className="text-viewer-status">{error}</p> : null}
        {!loading ? (
          <textarea
            className="chapter-editor-textarea"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            disabled={saving}
          />
        ) : null}
      </section>
    </div>
  );
}
