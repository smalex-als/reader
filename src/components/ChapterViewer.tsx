import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChapterViewerProps {
  bookId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  pageRange: { start: number; end: number } | null;
  tocLoading: boolean;
}

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

export default function ChapterViewer({
  bookId,
  chapterNumber,
  chapterTitle,
  pageRange,
  tocLoading
}: ChapterViewerProps) {
  const [chapterText, setChapterText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  const canGenerate = Boolean(bookId && chapterNumber && pageRange);

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

  const pageMeta = useMemo(() => {
    if (!pageRange) {
      return null;
    }
    const start = pageRange.start + 1;
    const end = Math.max(start, pageRange.end);
    return `Pages ${start}-${end}`;
  }, [pageRange]);

  return (
    <div className="text-viewer">
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <span className="text-viewer-label">{chapterLabel}</span>
          <h2 className="text-viewer-heading">{chapterTitle ?? 'No chapter selected'}</h2>
        </div>
        {pageMeta ? <div className="text-viewer-meta">{pageMeta}</div> : null}
      </header>
      <section className="text-viewer-body">
        {tocLoading && <p className="text-viewer-status">Loading table of contents…</p>}
        {!tocLoading && !chapterNumber && (
          <p className="text-viewer-status">No table of contents found. Use Edit TOC to add chapters.</p>
        )}
        {!tocLoading && chapterNumber && loading && (
          <p className="text-viewer-status">Loading chapter text…</p>
        )}
        {!tocLoading && chapterNumber && !loading && missingFile && (
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
        {!tocLoading && chapterNumber && !loading && !error && chapterText && (
          <div className="text-viewer-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterText}</ReactMarkdown>
          </div>
        )}
        {!tocLoading && chapterNumber && !loading && !generating && !missingFile && !error && !chapterText && (
          <p className="text-viewer-status">Chapter text is empty.</p>
        )}
      </section>
    </div>
  );
}
