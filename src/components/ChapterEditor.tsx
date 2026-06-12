import { useCallback, useEffect, useMemo } from 'react';
import { useChapterEditorActions } from '@/hooks/useChapterEditorActions';
import {
  selectBookSessionWorkflow,
  selectEditorState,
  selectReaderSession,
  selectTocWorkflow,
  useAppSelector
} from '@/state/appState';

export default function ChapterEditor() {
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
  const {
    draftText,
    draftTitle,
    loading,
    saving,
    error,
    setDraftText,
    setDraftTitle,
    loadDraft,
    saveDraft,
    closeEditor
  } = useChapterEditorActions();
  const editingTextVersion = Boolean(versionId);

  useEffect(() => {
    void loadDraft({
      bookId,
      chapterNumber,
      chapterTitle,
      initialText
    });
  }, [bookId, chapterNumber, chapterTitle, initialText, loadDraft]);

  const handleSave = useCallback(() => {
    void saveDraft({
      bookId,
      chapterNumber,
      versionId
    });
  }, [bookId, chapterNumber, saveDraft, versionId]);

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
          <button type="button" className="button button-secondary" onClick={() => void closeEditor()} disabled={saving}>
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
