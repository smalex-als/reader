import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FloatingAudioTrack } from '@/components/FloatingAudioPlayer';

interface ChapterViewerProps {
  bookId: string | null;
  chapterNumber: number | null;
  chapterTitle: string | null;
  pageRange: { start: number; end: number } | null;
  tocLoading: boolean;
  allowGenerate: boolean;
  allowEdit: boolean;
  onEditChapter: () => void;
  textFontSize: number;
  onTextFontSizeChange: (value: number) => void;
  textTheme:
    | 'dark'
    | 'dracula'
    | 'obsidian'
    | 'nord'
    | 'gruvbox'
    | 'solarized'
    | 'light'
    | 'warm';
  onTextThemeChange: (value: string) => void;
  streamVoice: string;
  refreshToken?: number;
  onFirstParagraphReady: (payload: { fullText: string; startIndex: number; key: string } | null) => void;
  onPlayParagraph: (payload: { fullText: string; startIndex: number; key: string }) => void;
  onPlayAudio: (payload: FloatingAudioTrack) => void;
  playingParagraphStart: number | null;
  playingParagraphMode: 'chapter' | 'narration' | null;
}

type AudioJobStatus = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
};

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
  onEditChapter,
  textFontSize,
  onTextFontSizeChange,
  textTheme,
  onTextThemeChange,
  streamVoice,
  refreshToken = 0,
  onFirstParagraphReady,
  onPlayParagraph,
  onPlayAudio,
  playingParagraphStart,
  playingParagraphMode
}: ChapterViewerProps) {
  const [contentMode, setContentMode] = useState<'chapter' | 'narration'>('chapter');
  const [chapterText, setChapterText] = useState('');
  const [narrationText, setNarrationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [missingNarrationFile, setMissingNarrationFile] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [narrationGenerating, setNarrationGenerating] = useState(false);
  const [narrationStatus, setNarrationStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterNarrationReady, setChapterNarrationReady] = useState(false);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);
  const audioPollTimers = useRef<Map<number, number>>(new Map());
  const audioPollAttempts = useRef<Map<number, number>>(new Map());
  const audioPollRef = useRef<(chapterNumber: number) => void>();
  const onPlayParagraphRef = useRef(onPlayParagraph);

  useEffect(() => {
    onPlayParagraphRef.current = onPlayParagraph;
  }, [onPlayParagraph]);

  const FONT_SIZE_OPTIONS = [
    { label: 'Compact', value: 18 },
    { label: 'Easy', value: 20 },
    { label: 'Comfortable', value: 24 },
    { label: 'Spacious', value: 26 },
    { label: 'Grand', value: 28 },
    { label: 'Theater', value: 30 },
    { label: 'Cinema', value: 34 }
  ];
  const COLOR_OPTIONS = [
    { label: 'Night', value: 'dark' },
    { label: 'Dracula', value: 'dracula' },
    { label: 'Obsidian', value: 'obsidian' },
    { label: 'Nord', value: 'nord' },
    { label: 'Gruvbox', value: 'gruvbox' },
    { label: 'Solarized', value: 'solarized' },
    { label: 'White', value: 'light' },
    { label: 'Warm', value: 'warm' }
  ];

  const textStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );

  const handleFontSizeChange = useCallback(
    (value: number) => {
      onTextFontSizeChange(value);
    },
    [onTextFontSizeChange]
  );

  const chapterLabel = useMemo(() => {
    if (!chapterNumber) {
      return 'Chapter';
    }
    return `Chapter ${chapterNumber}`;
  }, [chapterNumber]);

  useEffect(() => {
    setContentMode('chapter');
  }, [bookId, chapterNumber]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setNarrationText('');
      setError(null);
      setMissingFile(null);
      setLoading(false);
      setNarrationLoading(false);
      setNarrationError(null);
      setMissingNarrationFile(null);
      setAudioGenerating(false);
      setAudioError(null);
      setNarrationGenerating(false);
      setNarrationStatus(null);
      setChapterAudioReady(false);
      setChapterNarrationReady(false);
      setChapterAudioUrl(null);
      setAudioJob(null);
      return;
    }

    let canceled = false;
    const filename = formatChapterFilename(chapterNumber);
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setChapterText('');
    setLoading(true);
    setError(null);
    setMissingFile(null);
    setNarrationGenerating(false);
    setNarrationStatus(null);

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
        const trimmed = text.trim();
        setChapterText(trimmed);
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
  }, [bookId, chapterNumber, refreshToken, localRefreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setNarrationText('');
      setNarrationError(null);
      setMissingNarrationFile(null);
      setNarrationLoading(false);
      return;
    }

    let canceled = false;
    const filename = `chapter${String(chapterNumber).padStart(3, '0')}.narration.txt`;
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setNarrationText('');
    setNarrationLoading(true);
    setNarrationError(null);
    setMissingNarrationFile(null);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            const err = new Error('Narration text not found.');
            (err as Error & { missingFile?: string }).missingFile = filename;
            throw err;
          }
          throw new Error('Failed to load narration.');
        }
        return response.text();
      })
      .then((text) => {
        if (canceled) {
          return;
        }
        setNarrationText(text.trim());
      })
      .catch((err: Error & { missingFile?: string }) => {
        if (canceled) {
          return;
        }
        setNarrationText('');
        setMissingNarrationFile(err.missingFile ?? null);
        setNarrationError(err.message || 'Unable to load narration text.');
      })
      .finally(() => {
        if (!canceled) {
          setNarrationLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, refreshToken, localRefreshToken]);

  const loadChapterAudioStatus = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setChapterAudioReady(false);
      setChapterNarrationReady(false);
      setChapterAudioUrl(null);
      return;
    }
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/audio`);
      if (!response.ok) {
        throw new Error(`Audio status failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        chapters?: Array<{
          chapterNumber: number;
          narration?: { ready?: boolean };
          audio?: { ready?: boolean; url?: string; durationSeconds?: number | null };
        }>;
      };
      const entry = Array.isArray(payload.chapters)
        ? payload.chapters.find((item) => item.chapterNumber === chapterNumber)
        : null;
      setChapterNarrationReady(Boolean(entry?.narration?.ready));
      setChapterAudioReady(Boolean(entry?.audio?.ready));
      setChapterAudioUrl(entry?.audio?.url ?? null);
    } catch (err) {
      console.warn('Failed to load chapter audio status', err);
    }
  }, [bookId, chapterNumber]);

  useEffect(() => {
    void loadChapterAudioStatus();
  }, [loadChapterAudioStatus]);

  const clearAudioPoll = useCallback(() => {
    audioPollTimers.current.forEach((timer) => window.clearTimeout(timer));
    audioPollTimers.current.clear();
    audioPollAttempts.current.clear();
  }, []);

  useEffect(() => {
    setAudioJob(null);
    clearAudioPoll();
  }, [bookId, chapterNumber, clearAudioPoll]);

  const scheduleAudioPoll = useCallback(
    (currentChapter: number) => {
      const attempt = (audioPollAttempts.current.get(currentChapter) ?? 0) + 1;
      audioPollAttempts.current.set(currentChapter, attempt);
      const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
      const timer = window.setTimeout(() => {
        audioPollRef.current?.(currentChapter);
      }, delay);
      audioPollTimers.current.set(currentChapter, timer);
    },
    []
  );

  const pollAudioJobStatus = useCallback(
    async (currentChapter: number) => {
      if (!bookId || !currentChapter) {
        return;
      }
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${currentChapter}/audio/status`
        );
        if (!response.ok) {
          throw new Error(`Audio status failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          job?: { status?: AudioJobStatus['status']; error?: string | null; audioUrl?: string | null };
        };
        const job = payload?.job;
        if (!job?.status) {
          clearAudioPoll();
          return;
        }
        setAudioJob({
          status: job.status,
          error: job.error ?? null,
          audioUrl: job.audioUrl ?? null
        });
        if (job.status === 'completed') {
          clearAudioPoll();
          await loadChapterAudioStatus();
          return;
        }
        if (job.status === 'failed' || job.status === 'canceled') {
          clearAudioPoll();
          return;
        }
        scheduleAudioPoll(currentChapter);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to poll audio status.';
        setAudioError(message);
        scheduleAudioPoll(currentChapter);
      }
    },
    [bookId, clearAudioPoll, loadChapterAudioStatus, scheduleAudioPoll]
  );

  useEffect(() => {
    audioPollRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  useEffect(() => {
    const activeText = contentMode === 'narration' ? narrationText : chapterText;
    if (!activeText || !chapterNumber) {
      onFirstParagraphReady(null);
      return;
    }
    const paragraphs = activeText
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      onFirstParagraphReady(null);
      return;
    }
    const firstParagraph = paragraphs[0];
    const startIndex = activeText.indexOf(firstParagraph);
    const paragraphKey = `${contentMode}-${chapterNumber}-${hashText(firstParagraph)}-${startIndex}`;
    onFirstParagraphReady({
      fullText: activeText,
      startIndex: Math.max(0, startIndex),
      key: paragraphKey
    });
  }, [chapterNumber, chapterText, contentMode, narrationText, onFirstParagraphReady]);
  const canGenerate = Boolean(allowGenerate && bookId && chapterNumber && pageRange);
  const canGenerateNarration = Boolean(bookId && chapterNumber && chapterText && !missingFile && !loading);
  const canGenerateAudio = Boolean(canGenerateNarration && chapterNarrationReady);
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
      setLocalRefreshToken((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter text.';
      setError(message);
    } finally {
      setGenerating(false);
    }
  }, [bookId, canGenerate, chapterNumber, generating, pageRange]);
  const handleGenerateAudio = useCallback(async () => {
    if (!canGenerateAudio || !bookId || !chapterNumber || audioGenerating) {
      return;
    }
    setAudioGenerating(true);
    setAudioError(null);
    setNarrationStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice: streamVoice })
        }
      );
      if (!response.ok) {
        throw new Error(`Audio generation failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        job?: { status?: AudioJobStatus['status']; error?: string | null; audioUrl?: string | null };
      };
      if (payload?.job?.status) {
        setAudioJob({
          status: payload.job.status,
          error: payload.job.error ?? null,
          audioUrl: payload.job.audioUrl ?? null
        });
        scheduleAudioPoll(chapterNumber);
      } else {
        setNarrationStatus('Audio job queued.');
        scheduleAudioPoll(chapterNumber);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter audio.';
      setAudioError(message);
    } finally {
      setAudioGenerating(false);
    }
  }, [audioGenerating, bookId, canGenerateAudio, chapterNumber, scheduleAudioPoll, streamVoice]);

  const handleGenerateNarration = useCallback(async () => {
    if (!canGenerateNarration || !bookId || !chapterNumber || narrationGenerating) {
      return;
    }
    setNarrationGenerating(true);
    setAudioError(null);
    setNarrationStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/narration`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );
      if (!response.ok) {
        throw new Error(`Narration generation failed: ${response.status}`);
      }
      setNarrationStatus('Narration saved.');
      setLocalRefreshToken((prev) => prev + 1);
      await loadChapterAudioStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate narration.';
      setAudioError(message);
    } finally {
      setNarrationGenerating(false);
    }
  }, [bookId, canGenerateNarration, chapterNumber, loadChapterAudioStatus, narrationGenerating]);

  const handleCancelAudioJob = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      return;
    }
    clearAudioPoll();
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/cancel`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error(`Audio cancel failed: ${response.status}`);
      }
      setAudioJob({ status: 'canceled', error: null, audioUrl: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel chapter audio.';
      setAudioError(message);
    }
  }, [bookId, chapterNumber, clearAudioPoll]);


  useEffect(() => {
    return () => {
      clearAudioPoll();
    };
  }, [clearAudioPoll]);

  const isAudioJobActive = audioJob?.status === 'queued' || audioJob?.status === 'running';
  const audioActionLabel = chapterNarrationReady
    ? isAudioJobActive
      ? audioJob?.status === 'queued'
        ? 'Queued…'
        : 'Generating…'
      : audioGenerating
      ? 'Starting…'
      : 'Generate Audio'
    : narrationGenerating
    ? 'Generating…'
    : 'Generate Narration';
  const audioActionDisabled = chapterNarrationReady
    ? !canGenerateAudio || audioGenerating || isAudioJobActive
    : !canGenerateNarration || narrationGenerating;
  const handleAudioAction = useCallback(() => {
    if (chapterNarrationReady) {
      void handleGenerateAudio();
      return;
    }
    void handleGenerateNarration();
  }, [chapterNarrationReady, handleGenerateAudio, handleGenerateNarration]);

  const pageMeta = useMemo(() => {
    if (!pageRange) {
      return null;
    }
    const start = pageRange.start + 1;
    const end = Math.max(start, pageRange.end);
    return `Pages ${start}-${end}`;
  }, [pageRange]);

  const displayText = contentMode === 'narration' ? narrationText : chapterText;
  const displayLoading = contentMode === 'narration' ? narrationLoading : loading;
  const displayError = contentMode === 'narration' ? narrationError : error;
  const displayMissingFile = contentMode === 'narration' ? missingNarrationFile : missingFile;
  const contentModeLabel = contentMode === 'narration' ? 'Narration' : 'Chapter';

  const markdownComponents = useMemo(() => {
    const resolveStartIndex = (textValue: string, node?: any) => {
      if (!displayText) {
        return 0;
      }
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const lineStart = displayText.lastIndexOf('\n', nodeOffset - 1);
        return lineStart === -1 ? 0 : lineStart + 1;
      }
      if (textValue) {
        const foundIndex = displayText.indexOf(textValue);
        if (foundIndex !== -1) {
          const lineStart = displayText.lastIndexOf('\n', foundIndex - 1);
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
          ? `${contentMode}-${chapterNumber}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = playingParagraphStart === startIndex && playingParagraphMode === contentMode;
        return (
          <Tag className="text-viewer-block" data-playing={isPlaying ? 'true' : 'false'}>
            {children}
            {textValue ? (
              <button
                type="button"
                className="text-paragraph-stream"
                onClick={() =>
                  onPlayParagraphRef.current({
                    fullText: displayText,
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
  }, [chapterNumber, contentMode, displayText, playingParagraphMode, playingParagraphStart]);

  return (
    <div className="text-viewer" style={textStyle}>
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <span className="text-viewer-label">{chapterLabel}</span>
          <h2 className="text-viewer-heading">{chapterTitle ?? 'No chapter selected'}</h2>
        </div>
        {pageMeta ? <div className="text-viewer-meta">{pageMeta}</div> : null}
        <div className="text-viewer-actions">
          {chapterNumber ? (
            <div className="text-viewer-source segmented" role="tablist" aria-label="Displayed text source">
              <button
                type="button"
                className={`segmented-item ${contentMode === 'chapter' ? 'segmented-item-active' : ''}`}
                onClick={() => setContentMode('chapter')}
                aria-selected={contentMode === 'chapter'}
                role="tab"
              >
                Chapter
              </button>
              <button
                type="button"
                className={`segmented-item ${contentMode === 'narration' ? 'segmented-item-active' : ''}`}
                onClick={() => setContentMode('narration')}
                aria-selected={contentMode === 'narration'}
                role="tab"
              >
                Narration
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setSettingsOpen((prev) => !prev)}
            aria-expanded={settingsOpen}
            aria-controls="text-viewer-settings"
          >
            {settingsOpen ? 'Hide settings' : 'Text settings'}
          </button>
          {chapterNumber && !chapterAudioReady ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleAudioAction}
              disabled={audioActionDisabled}
            >
              {audioActionLabel}
            </button>
          ) : null}
          {chapterNumber && isAudioJobActive ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleCancelAudioJob}
            >
              Cancel
            </button>
          ) : null}
          {chapterAudioReady && chapterAudioUrl ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() =>
                  onPlayAudio({
                    title: chapterTitle ?? `Chapter ${chapterNumber}`,
                    subtitle: chapterNumber ? `Chapter ${chapterNumber}` : undefined,
                    url: chapterAudioUrl
                  })
                }
              >
                ▶ Play
              </button>
              <a
                className="button button-secondary"
                href={chapterAudioUrl}
                download
                aria-label="Download MP3 file"
                title="Download MP3 file"
              >
                ↓
              </a>
            </>
          ) : null}
          {allowEdit && chapterNumber ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={onEditChapter}
            >
              Edit
            </button>
          ) : null}
        </div>
        {settingsOpen ? (
          <div className="text-viewer-settings" id="text-viewer-settings">
            <div className="text-viewer-setting">
              <span className="text-viewer-setting-label">Font size</span>
              <div className="text-viewer-radio-group" role="radiogroup" aria-label="Text size">
                {FONT_SIZE_OPTIONS.map((option) => {
                  const inputId = `text-font-size-${option.value}`;
                  return (
                    <label key={option.value} className="text-viewer-radio" htmlFor={inputId}>
                      <input
                        id={inputId}
                        type="radio"
                        name="text-font-size"
                        value={option.value}
                        checked={textFontSize === option.value}
                        onChange={() => handleFontSizeChange(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="text-viewer-setting">
              <span className="text-viewer-setting-label">Color scheme</span>
              <div className="text-viewer-radio-group" role="radiogroup" aria-label="Color scheme">
                {COLOR_OPTIONS.map((option) => {
                  const inputId = `text-color-scheme-${option.value}`;
                  return (
                    <label key={option.value} className="text-viewer-radio" htmlFor={inputId}>
                      <input
                        id={inputId}
                        type="radio"
                        name="text-color-scheme"
                        value={option.value}
                        checked={textTheme === option.value}
                        onChange={() => onTextThemeChange(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </header>
      <section className="text-viewer-body">
        {tocLoading && <p className="text-viewer-status">Loading table of contents…</p>}
        {!tocLoading && !chapterNumber && (
          <p className="text-viewer-status">No table of contents found. Use Edit TOC to add chapters.</p>
        )}
        {!tocLoading && chapterNumber && displayLoading && (
          <p className="text-viewer-status">Loading {contentModeLabel.toLowerCase()} text…</p>
        )}
        {!tocLoading &&
          allowGenerate &&
          chapterNumber &&
          contentMode === 'chapter' &&
          !displayLoading &&
          displayMissingFile && (
          <div className="text-viewer-action">
            <p className="text-viewer-status">{displayMissingFile} is missing. Generate it now?</p>
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
        {!tocLoading &&
          chapterNumber &&
          contentMode === 'narration' &&
          !displayLoading &&
          displayMissingFile && (
          <div className="text-viewer-action">
            <p className="text-viewer-status">{displayMissingFile} is missing. Generate it now?</p>
            <button
              type="button"
              className="button"
              onClick={() => void handleGenerateNarration()}
              disabled={!canGenerateNarration || narrationGenerating}
            >
              {narrationGenerating ? 'Generating…' : 'Generate Narration'}
            </button>
          </div>
        )}
        {!tocLoading && chapterNumber && !displayLoading && !displayMissingFile && displayError && (
          <p className="text-viewer-status">{displayError}</p>
        )}
        {!tocLoading && chapterNumber && !displayLoading && !displayError && displayText && (
          <div className="text-viewer-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {displayText}
            </ReactMarkdown>
          </div>
        )}
        {!tocLoading &&
          chapterNumber &&
          !displayLoading &&
          !generating &&
          !displayMissingFile &&
          !displayError &&
          !displayText && (
          <p className="text-viewer-status">{contentModeLabel} text is empty.</p>
        )}
        {!tocLoading && allowGenerate && chapterNumber && contentMode === 'chapter' && !missingFile ? (
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
        {!tocLoading && chapterNumber && contentMode === 'narration' && chapterNarrationReady ? (
          <div className="text-viewer-regenerate">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleGenerateNarration()}
              disabled={!canGenerateNarration || narrationGenerating}
            >
              {narrationGenerating ? 'Regenerating…' : 'Regenerate Narration'}
            </button>
          </div>
        ) : null}
        {audioError ? <p className="text-viewer-status">{audioError}</p> : null}
        {audioJob?.status === 'failed' ? (
          <p className="text-viewer-status">
            {audioJob.error ?? 'Audio generation failed.'}
          </p>
        ) : null}
        {narrationStatus ? <p className="text-viewer-status">{narrationStatus}</p> : null}
      </section>
    </div>
  );
}
