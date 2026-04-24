import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AddIcon from '@/components/AddIcon';
import CreateTextVersionModal from '@/components/CreateTextVersionModal';
import type { FloatingAudioTrack } from '@/components/FloatingAudioPlayer';
import TrashIcon from '@/components/TrashIcon';
import { useChapterTextVersions } from '@/hooks/useChapterTextVersions';

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
  onDisplayedTextChange?: (payload: {
    text: string;
    chapterTitle: string | null;
    versionLabel: string | null;
    versionId: string | null;
  } | null) => void;
  onPlayParagraph: (payload: { fullText: string; startIndex: number; key: string }) => void;
  onPlayAudio: (payload: FloatingAudioTrack) => void;
  playingParagraphStart: number | null;
  playingParagraphMode: 'chapter' | 'narration' | null;
}

type TextOutlineItem = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  offset: number;
};

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

function slugifyHeading(input: string) {
  return input
    .toLowerCase()
    .replace(/[`*_~[\]()]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeOutlineTitle(input: string) {
  return input
    .replace(/^#{1,6}\s+/, '')
    .replace(/[`*_~[\]()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFallbackOutline(input: string): TextOutlineItem[] {
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const paragraphPattern = /\S[\s\S]*?(?=(?:\n\s*\n)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(input)) !== null) {
    const rawParagraph = match[0]?.trim();
    if (!rawParagraph) {
      continue;
    }
    const firstLine = normalizeOutlineTitle(rawParagraph.split('\n')[0] ?? '');
    if (!firstLine) {
      continue;
    }
    const isCompact = rawParagraph.length <= 120;
    const hasFewWords = firstLine.split(/\s+/).length <= 10;
    const looksLikeHeading = !/[.!?]$/.test(firstLine) || /^chapter\b/i.test(firstLine) || /:$/.test(firstLine);
    if (!isCompact || !hasFewWords || !looksLikeHeading) {
      continue;
    }
    const baseId = slugifyHeading(firstLine) || `section-${items.length + 1}`;
    const duplicateIndex = seen.get(baseId) ?? 0;
    seen.set(baseId, duplicateIndex + 1);
    items.push({
      id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
      title: firstLine.replace(/:$/, ''),
      level: /^chapter\b/i.test(firstLine) ? 1 : 2,
      offset: match.index
    });
  }

  return items;
}

function parseTextOutline(input: string): TextOutlineItem[] {
  if (!input) {
    return [];
  }
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const lines = input.split('\n');
  let offset = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const title = match[2].trim();
      if (title) {
        const baseId = slugifyHeading(title) || `section-${items.length + 1}`;
        const duplicateIndex = seen.get(baseId) ?? 0;
        seen.set(baseId, duplicateIndex + 1);
        items.push({
          id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
          title,
          level,
          offset
        });
      }
    }
    offset += line.length + 1;
  }
  return items.length > 0 ? items : parseFallbackOutline(input);
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
  onDisplayedTextChange,
  onPlayParagraph,
  onPlayAudio,
  playingParagraphStart,
  playingParagraphMode
}: ChapterViewerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const onPlayParagraphRef = useRef(onPlayParagraph);
  const textViewerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onPlayParagraphRef.current = onPlayParagraph;
  }, [onPlayParagraph]);

  const {
    displayText,
    displayLoading,
    displayError,
    versions,
    promptLibrary,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    sourceVersionId,
    setSourceVersionId,
    versionModel,
    setVersionModel,
    selectedPromptId,
    setSelectedPromptId,
    customPrompt,
    setCustomPrompt,
    promptName,
    setPromptName,
    savePromptToLibrary,
    setSavePromptToLibrary,
    selectedPromptTemplate,
    generating,
    canGenerate,
    missingFile,
    audioError,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    handleGenerate,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  } = useChapterTextVersions({
    bookId,
    chapterNumber,
    chapterRange: pageRange,
    refreshToken,
    streamVoice
  });
  const displayTextRef = useRef(displayText);
  const chapterNumberRef = useRef(chapterNumber);
  const selectedVersionIdRef = useRef(selectedVersionId);
  const playingParagraphStartRef = useRef(playingParagraphStart);
  const playingParagraphModeRef = useRef(playingParagraphMode);
  const outlineByOffsetRef = useRef<Map<number, TextOutlineItem>>(new Map());

  useEffect(() => {
    displayTextRef.current = displayText;
  }, [displayText]);

  useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  useEffect(() => {
    playingParagraphStartRef.current = playingParagraphStart;
  }, [playingParagraphStart]);

  useEffect(() => {
    playingParagraphModeRef.current = playingParagraphMode;
  }, [playingParagraphMode]);

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
  const outlineItems = useMemo(() => parseTextOutline(displayText ?? ''), [displayText]);
  const outlineByOffset = useMemo(() => new Map(outlineItems.map((item) => [item.offset, item])), [outlineItems]);

  useEffect(() => {
    outlineByOffsetRef.current = outlineByOffset;
  }, [outlineByOffset]);

  useEffect(() => {
    setActiveOutlineId(outlineItems[0]?.id ?? null);
  }, [outlineItems]);

  useEffect(() => {
    if (outlineItems.length === 0) {
      setOutlineOpen(false);
      return;
    }
    setOutlineOpen(true);
  }, [outlineItems.length]);

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

  const handleVersionChange = useCallback(
    (nextVersionId: string) => {
      if (nextVersionId === selectedVersionId) {
        return;
      }
      onFirstParagraphReady(null);
      onDisplayedTextChange?.(null);
      setSelectedVersionId(nextVersionId);
    },
    [onDisplayedTextChange, onFirstParagraphReady, selectedVersionId, setSelectedVersionId]
  );

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

  useEffect(() => {
    if (!onDisplayedTextChange) {
      return;
    }
    if (!displayText || !chapterNumber) {
      onDisplayedTextChange(null);
      return;
    }
    onDisplayedTextChange({
      text: displayText,
      chapterTitle,
      versionLabel: selectedVersion?.label ?? null,
      versionId: selectedVersionId
    });
  }, [chapterNumber, chapterTitle, displayText, onDisplayedTextChange, selectedVersion?.label, selectedVersionId]);

  const closeVersionModal = useCallback(() => {
    if (versionSaving) {
      return;
    }
    setVersionModalOpen(false);
  }, [versionSaving]);

  const openVersionModal = useCallback(() => {
    setSourceVersionId(selectedVersionId || 'base');
    setVersionModalOpen(true);
  }, [selectedVersionId, setSourceVersionId]);

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

  const handleOutlineSelect = useCallback((id: string) => {
    setActiveOutlineId(id);
    const container = textViewerRef.current;
    const target = container?.querySelector<HTMLElement>(`[data-outline-id="${id}"]`);
    if (!container || !target) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 24;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const container = textViewerRef.current;
    if (!container || outlineItems.length === 0) {
      return;
    }
    const updateActiveOutline = () => {
      const headings = [...container.querySelectorAll<HTMLElement>('[data-outline-id]')];
      if (headings.length === 0) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      let nextActiveId = headings[0]?.dataset.outlineId ?? null;
      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        if (rect.top - containerRect.top <= 96) {
          nextActiveId = heading.dataset.outlineId ?? nextActiveId;
        } else {
          break;
        }
      }
      setActiveOutlineId((current) => (current === nextActiveId ? current : nextActiveId));
    };

    updateActiveOutline();
    container.addEventListener('scroll', updateActiveOutline, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveOutline);
  }, [outlineItems]);

  const pageMeta = useMemo(() => {
    if (!pageRange) {
      return null;
    }
    const start = pageRange.start + 1;
    const end = Math.max(start, pageRange.end);
    return `Pages ${start}-${end}`;
  }, [pageRange]);

  const markdownComponents = useMemo(() => {
    const resolveTextRange = (textValue: string, node?: any) => {
      const currentDisplayText = displayTextRef.current;
      if (!currentDisplayText) {
        return { start: 0, end: 0 };
      }
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const lineStart = currentDisplayText.lastIndexOf('\n', nodeOffset - 1);
        const start = lineStart === -1 ? 0 : lineStart + 1;
        const nodeEnd = node?.position?.end?.offset;
        const end = typeof nodeEnd === 'number' && nodeEnd > start ? nodeEnd : start + textValue.length;
        return { start, end };
      }
      if (textValue) {
        const foundIndex = currentDisplayText.indexOf(textValue);
        if (foundIndex !== -1) {
          const lineStart = currentDisplayText.lastIndexOf('\n', foundIndex - 1);
          const start = lineStart === -1 ? 0 : lineStart + 1;
          return { start, end: foundIndex + textValue.length };
        }
      }
      return { start: 0, end: 0 };
    };

    const isPlayingRange = (startIndex: number, endIndex: number) => {
      const playingStart = playingParagraphStartRef.current;
      return (
        playingStart !== null &&
        playingParagraphModeRef.current === 'chapter' &&
        playingStart >= startIndex &&
        playingStart < Math.max(endIndex, startIndex + 1)
      );
    };

    const renderBlock = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const outlineItem = outlineByOffsetRef.current.get(node?.position?.start?.offset);
        const currentChapterNumber = chapterNumberRef.current;
        const currentSelectedVersionId = selectedVersionIdRef.current;
        const paragraphKey = currentChapterNumber
          ? `chapter-${currentChapterNumber}-${currentSelectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <Tag
            id={outlineItem?.id}
            className="text-viewer-block"
            data-playing={isPlaying ? 'true' : 'false'}
            data-outline-id={outlineItem?.id ?? undefined}
          >
            {children}
            {textValue ? (
              <button
                type="button"
                className="text-paragraph-stream"
                onClick={() =>
                  onPlayParagraphRef.current({
                    fullText: displayTextRef.current,
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

    const renderList = (Tag: 'ul' | 'ol') => {
      return ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const currentChapterNumber = chapterNumberRef.current;
        const currentSelectedVersionId = selectedVersionIdRef.current;
        const paragraphKey = currentChapterNumber
          ? `chapter-${currentChapterNumber}-${currentSelectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <div className="text-viewer-block text-viewer-list-block" data-playing={isPlaying ? 'true' : 'false'}>
            <Tag {...props}>{children}</Tag>
            {textValue ? (
              <button
                type="button"
                className="text-paragraph-stream"
                onClick={() =>
                  onPlayParagraphRef.current({
                    fullText: displayTextRef.current,
                    startIndex,
                    key: paragraphKey
                  })
                }
                aria-label="Play list from here"
                title="Play list from here"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M8 5v14l11-7-11-7z" />
                </svg>
              </button>
            ) : null}
          </div>
        );
      };
    };

    return {
      p: renderBlock('p'),
      ul: renderList('ul'),
      ol: renderList('ol'),
      h1: renderBlock('h1'),
      h2: renderBlock('h2'),
      h3: renderBlock('h3'),
      h4: renderBlock('h4'),
      h5: renderBlock('h5'),
      h6: renderBlock('h6')
    };
  }, []);

  return (
    <div ref={textViewerRef} className="text-viewer" style={textStyle}>
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
                onChange={(event) => handleVersionChange(event.target.value)}
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
            onClick={openVersionModal}
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
          {outlineItems.length > 0 ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setOutlineOpen((prev) => !prev)}
              aria-expanded={outlineOpen}
              aria-controls="text-viewer-outline"
            >
              {outlineOpen ? 'Hide outline' : 'Show outline'}
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
          <div className="text-viewer-layout" data-outline-open={outlineOpen ? 'true' : 'false'}>
            {outlineOpen && outlineItems.length > 0 ? (
              <aside className="text-viewer-outline" id="text-viewer-outline" aria-label="Text outline">
                <div className="text-viewer-outline-header">Outline</div>
                <div className="text-viewer-outline-list">
                  {outlineItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="text-viewer-outline-item"
                      data-level={item.level}
                      data-active={activeOutlineId === item.id ? 'true' : 'false'}
                      onClick={() => handleOutlineSelect(item.id)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}
            <div className="text-viewer-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {displayText}
              </ReactMarkdown>
            </div>
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
      <CreateTextVersionModal
        open={versionModalOpen}
        versions={versions}
        sourceVersionId={sourceVersionId}
        onSourceVersionIdChange={setSourceVersionId}
        versionModel={versionModel}
        onVersionModelChange={setVersionModel}
        promptLibrary={promptLibrary}
        selectedPromptId={selectedPromptId}
        onSelectedPromptIdChange={setSelectedPromptId}
        customPrompt={customPrompt}
        onCustomPromptChange={setCustomPrompt}
        selectedPromptTemplate={selectedPromptTemplate}
        savePromptToLibrary={savePromptToLibrary}
        onSavePromptToLibraryChange={setSavePromptToLibrary}
        promptName={promptName}
        onPromptNameChange={setPromptName}
        versionSaving={versionSaving}
        canCreateVersion={canCreateVersion}
        onClose={closeVersionModal}
        onCreate={() => void handleCreateVersion().then((created) => {
          if (created) {
            setVersionModalOpen(false);
          }
        })}
      />
    </div>
  );
}
