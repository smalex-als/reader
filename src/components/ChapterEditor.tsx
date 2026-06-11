import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  appActions,
  selectBookSessionWorkflow,
  selectEditorState,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { TocEntry } from '@/types/app';

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

export default function ChapterEditor() {
  const dispatch = useAppDispatch();
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const { bookType, chapterCount } = useAppSelector(selectBookSessionWorkflow);
  const { chapterNumber: editorChapterNumber, textVersion } = useAppSelector(selectEditorState);
  const { entries: tocEntries } = useAppSelector(selectTocWorkflow);
  const sortedTocEntries = useMemo(
    () =>
      [...tocEntries]
        .filter((entry) => Number.isInteger(entry.page))
        .sort((left, right) => left.page - right.page),
    [tocEntries]
  );
  const currentChapterIndex = useMemo(() => {
    if (bookType === 'text') {
      return chapterCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [bookType, chapterCount, currentPage, sortedTocEntries]);
  const currentChapterEntry = useMemo(() => {
    if (bookType === 'text') {
      return sortedTocEntries.find((entry) => entry.page === currentPage) ?? null;
    }
    return currentChapterIndex !== null ? sortedTocEntries[currentChapterIndex] : null;
  }, [bookType, currentChapterIndex, currentPage, sortedTocEntries]);
  const chapterNumber = editorChapterNumber ?? (currentChapterIndex !== null ? currentChapterIndex + 1 : null);
  const chapterTitle = useMemo(() => {
    if (!editorChapterNumber) {
      return currentChapterEntry?.title ?? null;
    }
    return (
      sortedTocEntries.find((entry) => entry.page === editorChapterNumber - 1)?.title ??
      currentChapterEntry?.title ??
      null
    );
  }, [currentChapterEntry, editorChapterNumber, sortedTocEntries]);
  const versionId = textVersion?.versionId ?? null;
  const versionLabel = textVersion?.versionLabel ?? null;
  const initialText = textVersion?.text ?? null;
  const [draftText, setDraftText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editingTextVersion = Boolean(versionId);
  const handleClose = useCallback(() => {
    dispatch(appActions.setEditorOpen(false));
    dispatch(appActions.setEditorChapterNumber(null));
    dispatch(appActions.setEditorTextVersion(null));
  }, [dispatch]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setDraftText('');
      setDraftTitle('');
      setError(null);
      setLoading(false);
      return;
    }

    if (initialText !== null) {
      setDraftText(initialText);
      setDraftTitle(chapterTitle ?? '');
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
  }, [bookId, chapterNumber, chapterTitle, initialText]);

  const handleSave = useCallback(async () => {
    if (!bookId || !chapterNumber || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingTextVersion
        ? `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions/${encodeURIComponent(versionId || 'base')}`
        : `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draftText, title: draftTitle })
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.status}`);
      }
      const payload = (await response.json()) as { toc?: TocEntry[] };
      if (Array.isArray(payload.toc)) {
        dispatch(appActions.setTocEntries(payload.toc));
      }
      dispatch(appActions.refreshChapterView());
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save chapter.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [bookId, chapterNumber, dispatch, draftText, draftTitle, editingTextVersion, handleClose, saving, versionId]);

  return (
    <div className="chapter-editor">
      <header className="chapter-editor-header">
        <div className="chapter-editor-title">
          <span className="text-viewer-label">
            {editingTextVersion ? `Edit ${versionLabel ?? versionId ?? 'text version'}` : 'Edit Chapter'}
          </span>
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
          <button type="button" className="button button-secondary" onClick={handleClose} disabled={saving}>
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
