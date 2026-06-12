import { isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AddIcon from '@/components/AddIcon';
import CreateTextVersionModal from '@/components/CreateTextVersionModal';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import TrashIcon from '@/components/TrashIcon';
import { useChapterActions } from '@/hooks/useBookSession';
import { useChapterTextVersions } from '@/hooks/useChapterTextVersions';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useUnitActions } from '@/hooks/useUnitActions';
import { onFloatingAudioSubchapterSelect } from '@/lib/floatingAudioEvents';
import { formatListeningTime } from '@/lib/listeningTime';
import {
  appActions,
  selectBookSessionWorkflow,
  selectChapterVersionNavigationRequest,
  selectStreamRuntime,
  selectTextVersionModalWorkflow,
  selectTocWorkflow,
  selectViewerWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

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

function normalizeNavigationTitle(input: string) {
  return normalizeOutlineTitle(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
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

function isTextBlockVisible(containerRect: DOMRect, blockRect: DOMRect) {
  const comfortableTop = containerRect.top + 96;
  const comfortableBottom = containerRect.bottom - 96;
  return blockRect.top >= comfortableTop && blockRect.bottom <= comfortableBottom;
}

export default function ChapterViewer() {
  const dispatch = useAppDispatch();
  const { handleCreateChapter, handleDeleteChapter } = useChapterActions();
  const { settings } = useAppSelector(selectViewerWorkflow);
  const streamState = useAppSelector(selectStreamRuntime);
  const { loading: tocLoading } = useAppSelector(selectTocWorkflow);
  const {
    bookType,
    uploadingChapter: chapterCreating,
    deletingChapter: chapterDeleting
  } = useAppSelector(selectBookSessionWorkflow);
  const versionNavigationRequest = useAppSelector(selectChapterVersionNavigationRequest);
  const {
    open: versionModalOpen,
    createRequestId: textVersionCreateRequestId
  } = useAppSelector(selectTextVersionModalWorkflow);
  const { streamVoiceOptions, mp3Voice } = useAppSelector(selectVoiceWorkflow);
  const { textFontSize } = settings;
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';
  const activeTextParagraph = useMemo(() => {
    if (!streamPositionActive || typeof streamState.pageKey !== 'string') {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    const match = streamState.pageKey.match(/^(chapter|narration)::paragraph-start-(\d+)$/);
    if (!match) {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    return {
      mode: match[1] as 'chapter' | 'narration',
      startIndex: Number.parseInt(match[2], 10)
    };
  }, [streamPositionActive, streamState.pageKey]);
  const playingParagraphStart = activeTextParagraph.startIndex;
  const playingParagraphMode = activeTextParagraph.mode;
  const allowEdit = true;
  const allowGenerate = bookType !== 'text';
  const {
    bookId,
    chapterNumber,
    chapterTitle,
    chapterLabel,
    pageRange
  } = useCurrentChapterContext();
  const {
    unitCreating,
    handleCreateUnit
  } = useUnitActions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [urlVersionReady, setUrlVersionReady] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const textViewerRef = useRef<HTMLDivElement | null>(null);
  const appliedVersionNavigationRequestRef = useRef<number | null>(null);

  const {
    displayText,
    displayLoading,
    displayError,
    versions,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    generating,
    canGenerate,
    missingFile,
    audioError,
    audioGenerating,
    audioDeleting,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    chapterAudioSubchapters,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    canGenerateAudio,
    handleGenerate,
    handleGenerateAudio,
    handleDeleteAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  } = useChapterTextVersions();
  const textStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );
  const mp3VoiceOptions = useMemo(
    () =>
      streamVoiceOptions.filter(
        (option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'
      ),
    [streamVoiceOptions]
  );
  const handleMp3VoiceChange = useCallback(
    (voice: string) => {
      if (!mp3VoiceOptions.some((option) => option.id === voice)) {
        return;
      }
      dispatch(appActions.setMp3Voice(voice));
    },
    [dispatch, mp3VoiceOptions]
  );
  const outlineItems = useMemo(() => parseTextOutline(displayText ?? ''), [displayText]);
  const outlineByOffset = useMemo(() => new Map(outlineItems.map((item) => [item.offset, item])), [outlineItems]);

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

  const handleVersionChange = useCallback(
    (nextVersionId: string) => {
      if (nextVersionId === selectedVersionId) {
        return;
      }
      dispatch(appActions.setFirstChapterParagraph(null));
      dispatch(appActions.setDisplayedChapterText(null));
      setSelectedVersionId(nextVersionId);
    },
    [dispatch, selectedVersionId, setSelectedVersionId]
  );

  const handleToolsToggle = useCallback(() => {
    setToolsOpen((current) => {
      const next = !current;
      if (!next) {
        setSettingsOpen(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setUrlVersionReady(false);
  }, [bookId, chapterNumber]);

  useEffect(() => {
    if (!versionNavigationRequest) {
      return;
    }
    if (appliedVersionNavigationRequestRef.current === versionNavigationRequest.id) {
      return;
    }
    if (chapterNumber !== versionNavigationRequest.chapterNumber) {
      return;
    }
    if (!versions.some((version) => version.id === versionNavigationRequest.versionId)) {
      return;
    }
    appliedVersionNavigationRequestRef.current = versionNavigationRequest.id;
    handleVersionChange(versionNavigationRequest.versionId);
    setUrlVersionReady(true);
  }, [chapterNumber, handleVersionChange, versionNavigationRequest, versions]);

  useEffect(() => {
    if (urlVersionReady || !chapterNumber || versions.length === 0) {
      return;
    }
    const requestedNavigationVersion =
      versionNavigationRequest?.chapterNumber === chapterNumber &&
      versions.some((version) => version.id === versionNavigationRequest.versionId)
        ? versionNavigationRequest.versionId
        : null;
    if (requestedNavigationVersion) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const requestedVersionId = params.get('version')?.trim() || '';
    if (requestedVersionId && versions.some((version) => version.id === requestedVersionId)) {
      if (requestedVersionId !== selectedVersionId) {
        handleVersionChange(requestedVersionId);
        return;
      }
    }
    setUrlVersionReady(true);
  }, [
    chapterNumber,
    handleVersionChange,
    selectedVersionId,
    urlVersionReady,
    versionNavigationRequest,
    versions
  ]);

  useEffect(() => {
    if (!urlVersionReady || !chapterNumber) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const nextVersionId = selectedVersionId || 'base';
    if (params.get('version') === nextVersionId) {
      return;
    }
    params.set('version', nextVersionId);
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [chapterNumber, selectedVersionId, urlVersionReady]);

  useEffect(() => {
    if (!displayText || !chapterNumber) {
      dispatch(appActions.setFirstChapterParagraph(null));
      return;
    }
    const paragraphs = displayText
      .split(/\n\s*\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      dispatch(appActions.setFirstChapterParagraph(null));
      return;
    }
    const firstParagraph = paragraphs[0];
    const startIndex = displayText.indexOf(firstParagraph);
    dispatch(appActions.setFirstChapterParagraph({
      fullText: displayText,
      startIndex: Math.max(0, startIndex),
      key: `chapter-${chapterNumber}-${selectedVersionId}-${hashText(firstParagraph)}-${startIndex}`
    }));
  }, [chapterNumber, dispatch, displayText, selectedVersionId]);

  useEffect(() => {
    if (!displayText || !chapterNumber) {
      dispatch(appActions.setDisplayedChapterText(null));
      return;
    }
    dispatch(appActions.setDisplayedChapterText({
      text: displayText,
      chapterTitle,
      versionLabel: selectedVersion?.label ?? null,
      versionId: selectedVersionId
    }));
  }, [chapterNumber, chapterTitle, dispatch, displayText, selectedVersion?.label, selectedVersionId]);

  const closeVersionModal = useCallback(() => {
    if (versionSaving) {
      return;
    }
    dispatch(appActions.closeTextVersionModal());
  }, [dispatch, versionSaving]);

  const openVersionModal = useCallback(() => {
    dispatch(appActions.openTextVersionModal(selectedVersionId || 'base'));
  }, [dispatch, selectedVersionId]);

  const handledTextVersionCreateRequestRef = useRef(0);
  useEffect(() => {
    if (
      textVersionCreateRequestId === 0 ||
      handledTextVersionCreateRequestRef.current === textVersionCreateRequestId
    ) {
      return;
    }
    handledTextVersionCreateRequestRef.current = textVersionCreateRequestId;
    void handleCreateVersion().then((created) => {
      if (created) {
        dispatch(appActions.closeTextVersionModal());
      }
    });
  }, [dispatch, handleCreateVersion, textVersionCreateRequestId]);

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
    return onFloatingAudioSubchapterSelect(({ subchapter, track }) => {
      if (typeof track.chapterNumber === 'number' && chapterNumber !== track.chapterNumber) {
        return;
      }
      if (track.versionId && selectedVersionId !== track.versionId) {
        return;
      }
      const requestedTitle = normalizeNavigationTitle(subchapter.title);
      if (!requestedTitle || displayLoading || !displayText || outlineItems.length === 0) {
        return;
      }
      const exactMatch = outlineItems.find((item) => normalizeNavigationTitle(item.title) === requestedTitle);
      const looseMatch =
        exactMatch ??
        outlineItems.find((item) => {
          const outlineTitle = normalizeNavigationTitle(item.title);
          return outlineTitle.includes(requestedTitle) || requestedTitle.includes(outlineTitle);
        });
      if (looseMatch) {
        handleOutlineSelect(looseMatch.id);
      }
    });
  }, [chapterNumber, displayLoading, displayText, handleOutlineSelect, outlineItems, selectedVersionId]);

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

  useEffect(() => {
    if (playingParagraphMode !== 'chapter' || playingParagraphStart === null) {
      return;
    }
    const container = textViewerRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-paragraph-start="${playingParagraphStart}"][data-playing="true"]`
    );
    if (!container || !target) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (isTextBlockVisible(containerRect, targetRect)) {
      return;
    }
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 120;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [playingParagraphMode, playingParagraphStart]);

  const markdownComponents = useMemo(() => {
    const currentDisplayText = displayText ?? '';

    const shouldIgnoreBlockClick = (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return false;
      }
      if (target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]')) {
        return true;
      }
      return Boolean(window.getSelection()?.toString().trim());
    };

    const resolveTextRange = (textValue: string, node?: any) => {
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
      return (
        playingParagraphStart !== null &&
        playingParagraphMode === 'chapter' &&
        playingParagraphStart >= startIndex &&
        playingParagraphStart < Math.max(endIndex, startIndex + 1)
      );
    };

    const playTextBlock = (startIndex: number, paragraphKey: string) => {
      dispatch(appActions.requestStudyAudioChapterParagraph({
        fullText: currentDisplayText,
        startIndex,
        key: paragraphKey
      }));
    };

    const renderBlock = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const outlineItem = outlineByOffset.get(node?.position?.start?.offset);
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <Tag
            id={outlineItem?.id}
            className="text-viewer-block"
            data-playing={isPlaying ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-outline-id={outlineItem?.id ?? undefined}
            data-paragraph-start={startIndex}
            onClick={(event) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex, paragraphKey);
            }}
          >
            {children}
          </Tag>
        );
      };
    };

    const renderList = (Tag: 'ul' | 'ol') => {
      return ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <div
            className="text-viewer-block text-viewer-list-block"
            data-playing={isPlaying ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex, paragraphKey);
            }}
          >
            <Tag {...props}>{children}</Tag>
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
  }, [
    chapterNumber,
    dispatch,
    displayText,
    outlineByOffset,
    playingParagraphMode,
    playingParagraphStart,
    selectedVersionId
  ]);

  const renderedTextLayout = useMemo(() => {
    if (tocLoading || !chapterNumber || displayLoading || missingFile || displayError || !displayText) {
      return null;
    }
    return (
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
    );
  }, [
    activeOutlineId,
    chapterNumber,
    displayError,
    displayLoading,
    displayText,
    handleOutlineSelect,
    markdownComponents,
    missingFile,
    outlineItems,
    outlineOpen,
    tocLoading
  ]);

  return (
    <div ref={textViewerRef} className="text-viewer" style={textStyle}>
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <div className="text-viewer-title-kicker">
            <span className="text-viewer-label">{chapterLabel}</span>
            <button
              type="button"
              className="text-viewer-audio-link"
              onClick={() => {
                dispatch(appActions.clearChapterVersionNavigation());
                dispatch(appActions.setReaderViewMode('audio'));
              }}
            >
              Audio
            </button>
          </div>
          <h2 className="text-viewer-heading">{chapterTitle ?? 'No chapter selected'}</h2>
        </div>
        {pageMeta ? <div className="text-viewer-meta">{pageMeta}</div> : null}
        <div className="text-viewer-actions">
          {chapterNumber && versions.length > 0 ? (
            <label className="text-viewer-version-select text-viewer-current-version">
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
                    {` · ${formatListeningTime(version.stats?.listeningSeconds)}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {allowEdit && chapterNumber ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                dispatch(appActions.setEditorChapterNumber(chapterNumber));
                dispatch(appActions.setEditorTextVersion({
                  versionId: selectedVersionId || 'base',
                  versionLabel: selectedVersion?.label ?? null,
                  text: displayText ?? ''
                }));
                dispatch(appActions.setEditorOpen(true));
              }}
              disabled={!displayText?.trim() || displayLoading}
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            onClick={handleToolsToggle}
            aria-expanded={toolsOpen}
            aria-controls="text-viewer-tools"
          >
            Tools
          </button>
        </div>
        {toolsOpen ? (
          <div className="text-viewer-tools-panel" id="text-viewer-tools">
            <section className="text-viewer-tools-section" aria-label="View tools">
              <h3 className="text-viewer-tools-title">View</h3>
              <div className="text-viewer-tools-body">
                <div className="text-viewer-tools-row">
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
                </div>
              </div>
            </section>
            {bookType === 'text' ? (
              <section className="text-viewer-tools-section" aria-label="Chapter tools">
                <h3 className="text-viewer-tools-title">Chapter</h3>
                <div className="text-viewer-tools-body">
                  <div className="text-viewer-tools-row">
                    <button
                      type="button"
                      className="button button-ghost modal-icon-button"
                      onClick={() => void handleCreateChapter({ bookName: '', chapterTitle: '' })}
                      disabled={chapterCreating}
                      aria-label="Create chapter"
                      title="Create chapter"
                    >
                      <AddIcon />
                    </button>
                    {chapterNumber ? (
                      <button
                        type="button"
                        className="button button-ghost modal-icon-button"
                        onClick={() => void handleDeleteChapter(chapterNumber)}
                        disabled={chapterDeleting || displayLoading}
                        aria-label="Delete chapter"
                        title="Delete chapter"
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}
            <section className="text-viewer-tools-section" aria-label="Version tools">
              <h3 className="text-viewer-tools-title">Versions</h3>
              <div className="text-viewer-tools-body">
                <div className="text-viewer-tools-row">
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
                </div>
              </div>
            </section>
            <section className="text-viewer-tools-section" aria-label="Audio tools">
              <h3 className="text-viewer-tools-title">Audio</h3>
              <div className="text-viewer-tools-body">
                <div className="text-viewer-tools-row">
                  {chapterNumber && mp3VoiceOptions.length > 0 ? (
                    <label className="text-viewer-version-select text-viewer-voice-select">
                      <span>MP3 voice</span>
                      <select
                        value={mp3Voice}
                        onChange={(event) => handleMp3VoiceChange(event.target.value)}
                        disabled={isAudioJobActive || audioGenerating}
                      >
                        {mp3VoiceOptions.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {chapterNumber ? (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void handleGenerateAudio()}
                      disabled={!canGenerateAudio || audioGenerating || audioDeleting || isAudioJobActive || !mp3Voice}
                    >
                      {audioGenerating
                        ? 'Queuing MP3…'
                        : chapterAudioReady && chapterAudioVersionId === selectedVersionId
                          ? 'Regenerate MP3'
                          : 'Generate MP3'}
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
                          dispatch(appActions.playFloatingAudio({
                            title: chapterTitle ?? `Chapter ${chapterNumber}`,
                            subtitle: selectedVersion?.label,
                            url: chapterAudioUrl,
                            chapterNumber,
                            versionId: selectedVersionId,
                            subchapters: chapterAudioSubchapters
                          }))
                        }
                        disabled={audioDeleting}
                      >
                        ▶ Play
                      </button>
                      <a
                        className="button button-secondary modal-icon-button"
                        href={chapterAudioUrl}
                        download
                        aria-label="Download MP3 file"
                        title="Download MP3 file"
                      >
                        ↓
                      </a>
                      <button
                        type="button"
                        className="button button-secondary modal-icon-button"
                        onClick={() => void handleDeleteAudio()}
                        disabled={audioDeleting || isAudioJobActive}
                        aria-label="Delete MP3 file"
                        title="Delete MP3 file"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </>
                  ) : null}
                </div>
                {isAudioJobActive && audioJob?.progress ? (
                  <div className="mp3-generation-progress">
                    <div
                      className="mp3-generation-progress-track"
                      role="progressbar"
                      aria-valuenow={audioJob.progress.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="MP3 generation progress"
                    >
                      <div
                        className="mp3-generation-progress-fill"
                        style={{ width: `${audioJob.progress.percent}%` }}
                      />
                    </div>
                    <div className="mp3-generation-progress-meta">
                      <span>{audioJob.progress.label ?? 'Generating MP3'}</span>
                      <span>
                        {audioJob.progress.percent}%
                        {audioJob.progress.total > 0
                          ? ` · ${audioJob.progress.current}/${audioJob.progress.total}`
                          : ''}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
            <section className="text-viewer-tools-section" aria-label="Study tools">
              <h3 className="text-viewer-tools-title">Study</h3>
              <div className="text-viewer-tools-body">
                <div className="text-viewer-tools-row">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() =>
                      void handleCreateUnit({
                        text: displayText ?? '',
                        chapterTitle,
                        versionLabel: selectedVersion?.label ?? null,
                        versionId: selectedVersionId
                      })
                    }
                    disabled={!chapterNumber || !displayText?.trim() || displayLoading || unitCreating}
                  >
                    {unitCreating ? 'Creating...' : 'Create a unit'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
        {settingsOpen ? (
          <TextSettingsPanel
            id="text-viewer-settings"
            controlPrefix="text"
          />
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
        {!tocLoading && !allowGenerate && chapterNumber && !displayLoading && missingFile && (
          <p className="text-viewer-status">{missingFile} is missing.</p>
        )}
        {!tocLoading && chapterNumber && !displayLoading && !missingFile && displayError && (
          <p className="text-viewer-status">{displayError}</p>
        )}
        {renderedTextLayout}
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
      <CreateTextVersionModal />
    </div>
  );
}
