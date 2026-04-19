import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AddIcon from '@/components/AddIcon';
import CloseIcon from '@/components/CloseIcon';
import type { FloatingAudioTrack } from '@/components/FloatingAudioPlayer';
import TrashIcon from '@/components/TrashIcon';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';

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
  versionId?: string | null;
};

type ChapterAudioStatusEntry = {
  chapterNumber: number;
  latestVersionId?: string | null;
  audio?: { ready?: boolean; url?: string | null; versionId?: string | null };
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

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
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
  const [chapterText, setChapterText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [versions, setVersions] = useState<ChapterTextVersion[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<ChapterTextPrompt[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('base');
  const [loading, setLoading] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterAudioVersionId, setChapterAudioVersionId] = useState<string | null>(null);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [promptName, setPromptName] = useState('');
  const [savePromptToLibrary, setSavePromptToLibrary] = useState(false);
  const audioPollTimers = useRef<Map<number, number>>(new Map());
  const audioPollAttempts = useRef<Map<number, number>>(new Map());
  const audioPollRef = useRef<(chapterNumber: number) => void>();
  const onPlayParagraphRef = useRef(onPlayParagraph);
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [selectedVersionId, versions]
  );

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

  const chapterLabel = useMemo(() => {
    if (!chapterNumber) {
      return 'Chapter';
    }
    return `Chapter ${chapterNumber}`;
  }, [chapterNumber]);

  const handleFontSizeChange = useCallback(
    (value: number) => {
      onTextFontSizeChange(value);
    },
    [onTextFontSizeChange]
  );

  const loadChapterAudioStatus = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      return;
    }
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/audio`);
      if (!response.ok) {
        throw new Error(`Audio status failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        chapters?: ChapterAudioStatusEntry[];
      };
      const entry = Array.isArray(payload.chapters)
        ? payload.chapters.find((item) => item.chapterNumber === chapterNumber)
        : null;
      const audioVersionId = entry?.audio?.versionId ?? null;
      const currentVersionId = selectedVersionId || entry?.latestVersionId || 'base';
      setChapterAudioVersionId(audioVersionId);
      setChapterAudioReady(Boolean(entry?.audio?.ready) && audioVersionId === currentVersionId);
      setChapterAudioUrl(entry?.audio?.url ?? null);
    } catch (err) {
      console.warn('Failed to load chapter audio status', err);
    }
  }, [bookId, chapterNumber, selectedVersionId]);

  const loadTextVersions = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setVersionError(null);
      setVersionLoading(false);
      return;
    }
    setVersionLoading(true);
    setVersionError(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions`
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      const nextSelectedVersionId =
        payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base';
      setSelectedVersionId((current) =>
        current && nextVersions.some((version) => version.id === current) ? current : nextSelectedVersionId
      );
      setSelectedPromptId((current) => current || payload.promptLibrary?.[0]?.id || 'narration-default');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load chapter text versions.';
      setVersions([]);
      setPromptLibrary([]);
      setVersionError(message);
    } finally {
      setVersionLoading(false);
    }
  }, [bookId, chapterNumber]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setSelectedText('');
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setError(null);
      setMissingFile(null);
      setLoading(false);
      setVersionLoading(false);
      setVersionError(null);
      setAudioGenerating(false);
      setAudioError(null);
      setVersionSaving(false);
      setVersionStatus(null);
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setAudioJob(null);
      return;
    }

    let canceled = false;
    const filename = formatChapterFilename(chapterNumber);
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setChapterText('');
    setSelectedText('');
    setLoading(true);
    setError(null);
    setMissingFile(null);
    setVersionStatus(null);

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
  }, [bookId, chapterNumber, refreshToken, localRefreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || missingFile) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      return;
    }
    void loadTextVersions();
  }, [bookId, chapterNumber, loadTextVersions, localRefreshToken, missingFile, refreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || !selectedVersion) {
      setSelectedText('');
      return;
    }
    if (selectedVersion.id === 'base') {
      setSelectedText(chapterText);
      return;
    }
    let canceled = false;
    setVersionError(null);
    setVersionLoading(true);
    fetch(selectedVersion.file)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load version (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        if (!canceled) {
          setSelectedText(text.trim());
        }
      })
      .catch((err) => {
        if (!canceled) {
          setSelectedText('');
          setVersionError(err instanceof Error ? err.message : 'Unable to load chapter text version.');
        }
      })
      .finally(() => {
        if (!canceled) {
          setVersionLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, chapterText, selectedVersion]);

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

  const scheduleAudioPoll = useCallback((currentChapter: number) => {
    const attempt = (audioPollAttempts.current.get(currentChapter) ?? 0) + 1;
    audioPollAttempts.current.set(currentChapter, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      audioPollRef.current?.(currentChapter);
    }, delay);
    audioPollTimers.current.set(currentChapter, timer);
  }, []);

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
          job?: AudioJobStatus;
        };
        const job = payload?.job;
        if (!job?.status) {
          clearAudioPoll();
          return;
        }
        setAudioJob({
          status: job.status,
          error: job.error ?? null,
          audioUrl: job.audioUrl ?? null,
          versionId: job.versionId ?? null
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

  const displayText = selectedVersionId === 'base' ? chapterText : selectedText;
  const displayLoading = loading || versionLoading;
  const displayError = error || versionError;

  useEffect(() => {
    if (!displayText || !chapterNumber) {
      onFirstParagraphReady(null);
      return;
    }
    const paragraphs = displayText
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      onFirstParagraphReady(null);
      return;
    }
    const firstParagraph = paragraphs[0];
    const startIndex = displayText.indexOf(firstParagraph);
    onFirstParagraphReady({
      fullText: displayText,
      startIndex: Math.max(0, startIndex),
      key: `chapter-${chapterNumber}-${selectedVersionId}-${hashText(firstParagraph)}-${startIndex}`
    });
  }, [chapterNumber, displayText, onFirstParagraphReady, selectedVersionId]);

  const canGenerate = Boolean(allowGenerate && bookId && chapterNumber && pageRange);
  const canCreateVersion = Boolean(bookId && chapterNumber && chapterText && !missingFile && !loading);
  const canGenerateAudio = Boolean(bookId && chapterNumber && displayText && !displayLoading);

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
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice: streamVoice, versionId: selectedVersionId })
        }
      );
      if (!response.ok) {
        throw new Error(`Audio generation failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        job?: AudioJobStatus;
      };
      if (payload?.job?.status) {
        setAudioJob({
          status: payload.job.status,
          error: payload.job.error ?? null,
          audioUrl: payload.job.audioUrl ?? null,
          versionId: payload.job.versionId ?? selectedVersionId
        });
        scheduleAudioPoll(chapterNumber);
      } else {
        setVersionStatus('Audio job queued.');
        scheduleAudioPoll(chapterNumber);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter audio.';
      setAudioError(message);
    } finally {
      setAudioGenerating(false);
    }
  }, [audioGenerating, bookId, canGenerateAudio, chapterNumber, scheduleAudioPoll, selectedVersionId, streamVoice]);

  const handleCreateVersion = useCallback(async () => {
    if (!canCreateVersion || !bookId || !chapterNumber || versionSaving) {
      return;
    }
    setVersionSaving(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptId: selectedPromptId || null,
            customPrompt,
            addToLibrary: savePromptToLibrary,
            promptName
          })
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        createdVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      setSelectedVersionId(
        payload.createdVersionId ?? payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base'
      );
      setVersionStatus('Version saved.');
      setVersionModalOpen(false);
      setCustomPrompt('');
      setPromptName('');
      setSavePromptToLibrary(false);
      await loadChapterAudioStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create chapter text version.';
      setAudioError(message);
    } finally {
      setVersionSaving(false);
    }
  }, [
    bookId,
    canCreateVersion,
    chapterNumber,
    customPrompt,
    loadChapterAudioStatus,
    promptName,
    savePromptToLibrary,
    selectedPromptId,
    versionSaving
  ]);

  const handleDeleteVersion = useCallback(async () => {
    if (!bookId || !chapterNumber || !selectedVersion || !selectedVersion.deletable || versionSaving) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedVersion.label}?`);
    if (!confirmed) {
      return;
    }
    setVersionSaving(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions/${selectedVersion.id}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      setSelectedVersionId(payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base');
      setVersionStatus('Version deleted.');
      await loadChapterAudioStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete chapter text version.';
      setAudioError(message);
    } finally {
      setVersionSaving(false);
    }
  }, [bookId, chapterNumber, loadChapterAudioStatus, selectedVersion, versionSaving]);

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
      setAudioJob({ status: 'canceled', error: null, audioUrl: null, versionId: selectedVersionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel chapter audio.';
      setAudioError(message);
    }
  }, [bookId, chapterNumber, clearAudioPoll, selectedVersionId]);

  useEffect(() => {
    return () => {
      clearAudioPoll();
    };
  }, [clearAudioPoll]);

  const isAudioJobActive = audioJob?.status === 'queued' || audioJob?.status === 'running';
  const selectedPromptTemplate =
    customPrompt || promptLibrary.find((prompt) => prompt.id === selectedPromptId)?.template || '';

  const closeVersionModal = useCallback(() => {
    if (versionSaving) {
      return;
    }
    setVersionModalOpen(false);
  }, [versionSaving]);

  useEffect(() => {
    if (!versionModalOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeVersionModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeVersionModal, versionModalOpen]);

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
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = playingParagraphStart === startIndex && playingParagraphMode === 'chapter';
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
  }, [chapterNumber, displayText, playingParagraphMode, playingParagraphStart, selectedVersionId]);

  return (
    <div className="text-viewer" style={textStyle}>
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <span className="text-viewer-label">{chapterLabel}</span>
          <h2 className="text-viewer-heading">{chapterTitle ?? 'No chapter selected'}</h2>
        </div>
        {pageMeta ? <div className="text-viewer-meta">{pageMeta}</div> : null}
        <div className="text-viewer-actions">
          {chapterNumber && versions.length > 0 ? (
            <label className="text-viewer-version-select">
              <span>Version</span>
              <select
                value={selectedVersionId}
                onChange={(event) => setSelectedVersionId(event.target.value)}
                disabled={displayLoading || versionSaving}
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label}
                    {version.promptName ? ` · ${version.promptName}` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="button button-ghost modal-icon-button"
            onClick={() => setVersionModalOpen(true)}
            disabled={!canCreateVersion || versionSaving}
            aria-label="Create text version"
            title="Create text version"
          >
            <AddIcon />
          </button>
          {selectedVersion?.deletable ? (
            <button
              type="button"
              className="button button-ghost modal-icon-button"
              onClick={() => void handleDeleteVersion()}
              disabled={versionSaving}
              aria-label="Delete selected version"
              title="Delete selected version"
            >
              <TrashIcon />
            </button>
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
              onClick={() => void handleGenerateAudio()}
              disabled={!canGenerateAudio || audioGenerating || isAudioJobActive}
            >
              {isAudioJobActive
                ? audioJob?.status === 'queued'
                  ? 'Queued…'
                  : 'Generating…'
                : audioGenerating
                  ? 'Starting…'
                  : 'Generate Audio'}
            </button>
          ) : null}
          {chapterNumber && isAudioJobActive ? (
            <button type="button" className="button button-secondary" onClick={handleCancelAudioJob}>
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
                    subtitle: selectedVersion?.label,
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
            <button type="button" className="button button-secondary" onClick={onEditChapter}>
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
          <p className="text-viewer-status">Loading chapter text…</p>
        )}
        {!tocLoading && allowGenerate && chapterNumber && !displayLoading && missingFile && (
          <div className="text-viewer-action">
            <p className="text-viewer-status">{missingFile} is missing. Generate it now?</p>
            <button type="button" className="button" onClick={handleGenerate} disabled={!canGenerate || generating}>
              {generating ? 'Generating…' : 'Generate Chapter'}
            </button>
          </div>
        )}
        {!tocLoading && chapterNumber && !displayLoading && !missingFile && displayError && (
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
          !missingFile &&
          !displayError &&
          !displayText && <p className="text-viewer-status">Chapter text is empty.</p>}
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
        {audioError ? <p className="text-viewer-status">{audioError}</p> : null}
        {audioJob?.status === 'failed' ? (
          <p className="text-viewer-status">{audioJob.error ?? 'Audio generation failed.'}</p>
        ) : null}
        {versionStatus ? <p className="text-viewer-status">{versionStatus}</p> : null}
        {chapterAudioVersionId && chapterAudioVersionId !== selectedVersionId && chapterAudioUrl ? (
          <p className="text-viewer-status">Existing MP3 belongs to another text version. Generate audio to update it.</p>
        ) : null}
      </section>
      {versionModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal modal-wide text-version-modal">
            <header className="modal-header">
              <h2 className="modal-title">Create Text Version</h2>
              <button
                type="button"
                className="button button-ghost modal-icon-button"
                onClick={closeVersionModal}
                aria-label="Close version modal"
                title="Close version modal"
                disabled={versionSaving}
              >
                <CloseIcon />
              </button>
            </header>
            <section className="modal-body text-version-modal-body">
              <div className="text-viewer-setting">
                <span className="text-viewer-setting-label">Prompt</span>
                <select
                  className="text-viewer-select"
                  value={selectedPromptId}
                  onChange={(event) => setSelectedPromptId(event.target.value)}
                  disabled={versionSaving}
                >
                  {promptLibrary.map((prompt) => (
                    <option key={prompt.id} value={prompt.id}>
                      {prompt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-viewer-setting text-version-modal-field">
                <span className="text-viewer-setting-label">Custom prompt</span>
                <p className="text-viewer-placeholder-help">
                  Available placeholders: <code>{'{{book_title}}'}</code>, <code>{'{{chapter_title}}'}</code>,{' '}
                  <code>{'{{chapter_number}}'}</code>, <code>{'{{chapter_text}}'}</code>, <code>{'{{title}}'}</code>
                </p>
                <textarea
                  className="modal-textarea text-viewer-prompt-textarea"
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value)}
                  placeholder={selectedPromptTemplate || 'Write a prompt with placeholders like {{book_title}}'}
                  disabled={versionSaving}
                />
                <label className="text-viewer-checkbox">
                  <input
                    type="checkbox"
                    checked={savePromptToLibrary}
                    onChange={(event) => setSavePromptToLibrary(event.target.checked)}
                    disabled={versionSaving}
                  />
                  <span>Save this prompt to the library</span>
                </label>
              </div>
              {savePromptToLibrary ? (
                <div className="text-viewer-setting text-version-modal-field text-version-modal-field-compact">
                  <span className="text-viewer-setting-label">Prompt name</span>
                  <input
                    className="text-viewer-input"
                    value={promptName}
                    onChange={(event) => setPromptName(event.target.value)}
                    placeholder="Prompt name"
                    disabled={versionSaving}
                  />
                </div>
              ) : null}
            </section>
            <footer className="modal-footer modal-footer-right">
              <button
                type="button"
                className="button button-secondary"
                onClick={closeVersionModal}
                disabled={versionSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button"
                onClick={() => void handleCreateVersion()}
                disabled={!canCreateVersion || versionSaving}
              >
                {versionSaving ? 'Creating…' : 'Create Version'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
