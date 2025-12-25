import { useEffect, useMemo, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);

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
          throw new Error(response.status === 404 ? 'Chapter text not found.' : 'Failed to load chapter.');
        }
        return response.text();
      })
      .then((text) => {
        if (canceled) {
          return;
        }
        setChapterText(text.trim());
      })
      .catch((err: Error) => {
        if (canceled) {
          return;
        }
        setChapterText('');
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
  }, [bookId, chapterNumber]);

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
        {!tocLoading && chapterNumber && !loading && error && (
          <p className="text-viewer-status">
            {error} Generate chapter files from the TOC to view the text.
          </p>
        )}
        {!tocLoading && chapterNumber && !loading && !error && chapterText && (
          <div className="text-viewer-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{chapterText}</ReactMarkdown>
          </div>
        )}
        {!tocLoading && chapterNumber && !loading && !error && !chapterText && (
          <p className="text-viewer-status">Chapter text is empty.</p>
        )}
      </section>
    </div>
  );
}
