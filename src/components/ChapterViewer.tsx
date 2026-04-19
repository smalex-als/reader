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
  onPlayParagraph: (payload: { fullText: string; startIndex: number; key: string }) => void;
  onPlayAudio: (payload: FloatingAudioTrack) => void;
  playingParagraphStart: number | null;
  playingParagraphMode: 'chapter' | 'narration' | null;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const onPlayParagraphRef = useRef(onPlayParagraph);

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
    audioGenerating,
    audioError,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    canGenerateAudio,
    handleGenerate,
    handleGenerateAudio,
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
      <CreateTextVersionModal
        open={versionModalOpen}
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
