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
  onPlayParagraph: (text: string, key: string) => void;
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
  onPlayParagraph
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

  const markdownComponents = useMemo(() => {
    const renderBlock = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children }: { children?: ReactNode }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const paragraphKey = chapterNumber ? `chapter-${chapterNumber}-${hashText(textValue)}` : '';
        return (
          <Tag className="text-viewer-block">
            {children}
            {textValue ? (
              <button
                type="button"
                className="text-paragraph-stream"
                onClick={() => onPlayParagraph(textValue, paragraphKey)}
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
  }, [chapterNumber, onPlayParagraph]);

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
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {chapterText}
            </ReactMarkdown>
          </div>
        )}
        {!tocLoading && chapterNumber && !loading && !generating && !missingFile && !error && !chapterText && (
          <p className="text-viewer-status">Chapter text is empty.</p>
        )}
        {!tocLoading && chapterNumber && !missingFile ? (
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
