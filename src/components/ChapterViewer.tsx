import { isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChapterViewerProps {
  bookId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  pageRange: { start: number; end: number } | null;
  tocLoading: boolean;
  allowGenerate: boolean;
  allowEdit: boolean;
  onPlayParagraph: (payload: { fullText: string; startIndex: number; key: string }) => void;
  onChapterUpdated: (toc: { title: string; page: number }[]) => void;
}

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }
  if (isValidElement(node)) {
    return extractTextFromNode(node.props.children);
  }
  return '';
}

function hashText(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export default function ChapterViewer({
  bookId,
  chapterNumber,
  chapterTitle,
  pageRange,
  tocLoading,
  allowGenerate,
  allowEdit,
  onPlayParagraph,
  onChapterUpdated
}: ChapterViewerProps) {
  const [chapterText, setChapterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const chapterLabel = useMemo(() => {
    if (!chapterNumber) {
      return 'Chapter';
    }
    return `Chapter ${chapterNumber}`;
  }, [chapterNumber]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setError(null);
      setMissingFile(null);
      setLoading(false);
      return;
    }

    let canceled = false;
    const filename = formatChapterFilename(chapterNumber);
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setLoading(true);
    setError(null);
    setMissingFile(null);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            const err = new Error('Chapter text not found.');
            (err as Error & { missingFile?: string }).missingFile = filename;
            throw err;
          }
          throw new Error('Failed to load chapter.');
        }
        return response.text();
      })
      .then((text) => {
        if (canceled) {
          return;
        }
        setChapterText(text.trim());
      })
      .catch((err: Error & { missingFile?: string }) => {
        if (canceled) {
          return;
        }
        setChapterText('');
        setMissingFile(err.missingFile ?? null);
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
  }, [bookId, chapterNumber, refreshToken]);

  useEffect(() => {
    if (!editing) {
      setDraftText(chapterText);
      setDraftTitle(chapterTitle ?? '');
    }
  }, [chapterText, chapterTitle, editing]);

  const canGenerate = Boolean(allowGenerate && bookId && chapterNumber && pageRange);
  const canEdit = Boolean(allowEdit && bookId && chapterNumber);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !bookId || !chapterNumber || !pageRange || generating) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/chapters/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageStart: pageRange.start,
          pageEnd: pageRange.end,
          chapterNumber
        })
      });
      if (!response.ok) {
        throw new Error(`Generate failed: ${response.status}`);
      }
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter text.';
      setError(message);
    } finally {
      setGenerating(false);
    }
  }, [bookId, canGenerate, chapterNumber, generating, pageRange]);

  const handleSave = useCallback(async () => {
    if (!canEdit || !bookId || !chapterNumber || saving) {
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
      const payload = (await response.json()) as { toc?: { title: string; page: number }[] };
      if (Array.isArray(payload.toc)) {
        onChapterUpdated(payload.toc);
      }
      setChapterText(draftText.trim());
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save chapter.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [bookId, canEdit, chapterNumber, draftText, draftTitle, onChapterUpdated, saving]);

  const pageMeta = useMemo(() => {
    if (!pageRange) {
      return null;
    }
    const start = pageRange.start + 1;
    const end = Math.max(start, pageRange.end);
    return `Pages ${start}-${end}`;
  }, [pageRange]);

  const markdownComponents = useMemo(() => {
    const resolveStartIndex = (textValue: string, node?: any) => {
      if (!chapterText) {
        return 0;
      }
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const lineStart = chapterText.lastIndexOf('\n', nodeOffset - 1);
        return lineStart === -1 ? 0 : lineStart + 1;
      }
      if (textValue) {
        const foundIndex = chapterText.indexOf(textValue);
        if (foundIndex !== -1) {
          const lineStart = chapterText.lastIndexOf('\n', foundIndex - 1);
          return lineStart === -1 ? 0 : lineStart + 1;
        }
      }
      return 0;
    };

    const renderBlock = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const startIndex = resolveStartIndex(textValue, node);
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${hashText(textValue)}-${startIndex}`
          : '';
        return (
          <Tag className="text-viewer-block">
            {children}
            {textValue ? (
              <button
                type="button"
                className="text-paragraph-stream"
                onClick={() =>
                  onPlayParagraph({
                    fullText: chapterText,
                    startIndex,
                    key: paragraphKey
                  })
                }
                aria-label="Play from here"
                title="Play from here"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M8 5v14l11-7-11-7z" />
                </svg>
              </button>
            ) : null}
          </Tag>
        );
      };
    };

    return {
      p: renderBlock('p'),
      h1: renderBlock('h1'),
      h2: renderBlock('h2'),
      h3: renderBlock('h3'),
      h4: renderBlock('h4'),
      h5: renderBlock('h5'),
      h6: renderBlock('h6')
    };
  }, [chapterNumber, chapterText, onPlayParagraph]);

  return (
    <div className="text-viewer">
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <span className="text-viewer-label">{chapterLabel}</span>
          {editing ? (
            <input
              type="text"
              className="input text-viewer-title-input"
              placeholder="Chapter title"
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              disabled={saving}
            />
          ) : (
            <h2 className="text-viewer-heading">{chapterTitle ?? 'No chapter selected'}</h2>
          )}
        </div>
        {pageMeta ? <div className="text-viewer-meta">{pageMeta}</div> : null}
        {allowEdit && chapterNumber ? (
          <div className="text-viewer-actions">
            {editing ? (
              <>
                <button type="button" className="button" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setEditing(false);
                    setDraftText(chapterText);
                    setDraftTitle(chapterTitle ?? '');
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
            )}
          </div>
        ) : null}
      </header>
      <section className="text-viewer-body">
        {tocLoading && <p className="text-viewer-status">Loading table of contents…</p>}
        {!tocLoading && !chapterNumber && (
          <p className="text-viewer-status">No table of contents found. Use Edit TOC to add chapters.</p>
        )}
        {!tocLoading && chapterNumber && loading && (
          <p className="text-viewer-status">Loading chapter text…</p>
        )}
        {!tocLoading && allowGenerate && chapterNumber && !loading && missingFile && (
          <div className="text-viewer-action">
            <p className="text-viewer-status">{missingFile} is missing. Generate it now?</p>
            <button
              type="button"
              className="button"
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? 'Generating…' : 'Generate Chapter'}
            </button>
          </div>
        )}
        {!tocLoading && chapterNumber && !loading && !missingFile && error && (
          <p className="text-viewer-status">{error}</p>
        )}
        {!tocLoading && chapterNumber && !loading && editing ? (
          <div className="text-viewer-editor">
            <textarea
              className="text-viewer-textarea"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              disabled={saving}
            />
          </div>
        ) : null}
        {!tocLoading && chapterNumber && !loading && !error && !editing && chapterText && (
          <div className="text-viewer-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {chapterText}
            </ReactMarkdown>
          </div>
        )}
        {!tocLoading &&
          chapterNumber &&
          !loading &&
          !generating &&
          !missingFile &&
          !error &&
          !editing &&
          !chapterText && (
          <p className="text-viewer-status">Chapter text is empty.</p>
        )}
        {!tocLoading && allowGenerate && chapterNumber && !missingFile ? (
          <div className="text-viewer-regenerate">
            <button
              type="button"
              className="button button-secondary"
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
            >
              {generating ? 'Regenerating…' : 'Regenerate Chapter'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
