import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import ChapterTextMarkdownLayout from '@/components/ChapterTextMarkdownLayout';
import AddChapterModal from '@/components/AddChapterModal';
import ChapterToolsPanel from '@/components/ChapterToolsPanel';
import CreateTextVersionModal from '@/components/CreateTextVersionModal';
import { useChapterActions } from '@/hooks/useBookMutations';
import { useChapterTextPlaybackMarker } from '@/hooks/useChapterTextPlaybackMarker';
import { useChapterTextVersionModalRuntime } from '@/hooks/useChapterTextVersionModalRuntime';
import { useChapterTextOutline } from '@/hooks/useChapterTextOutline';
import { useChapterTextVersions } from '@/hooks/useChapterTextVersions';
import { useChapterVersionSelectionNavigation } from '@/hooks/useChapterVersionNavigation';
import { useChapterViewerActions } from '@/hooks/useChapterViewerActions';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useDisplayedChapterText } from '@/hooks/useDisplayedChapterText';
import { useUnitActions } from '@/hooks/useUnitActions';
import { formatListeningTime } from '@/lib/listeningTime';
import {
  selectBookDeletingChapter,
  selectBookType,
  selectBookUploadingChapter,
  selectTocWorkflow,
  selectViewerWorkflow,
  selectVoiceWorkflow,
  useAppSelector
} from '@/state/appState';

export default function ChapterViewer() {
  const { handleCreateChapter, handleDeleteChapter } = useChapterActions();
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { loading: tocLoading } = useAppSelector(selectTocWorkflow);
  const bookType = useAppSelector(selectBookType);
  const chapterCreating = useAppSelector(selectBookUploadingChapter);
  const chapterDeleting = useAppSelector(selectBookDeletingChapter);
  const { streamVoiceOptions, mp3Voice } = useAppSelector(selectVoiceWorkflow);
  const { textFontSize } = settings;
  const activeTextParagraph = useChapterTextPlaybackMarker();
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const textViewerRef = useRef<HTMLDivElement | null>(null);

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
  const {
    mp3VoiceOptions,
    handleMp3VoiceChange,
    openAudioView,
    openChapterEditor,
    playChapterAudio
  } = useChapterViewerActions({
    chapterNumber,
    chapterTitle,
    displayText: displayText ?? '',
    selectedVersion,
    selectedVersionId,
    streamVoiceOptions
  });
  const {
    activeOutlineId,
    outlineItems,
    outlineByOffset,
    outlineOpen,
    setOutlineOpen,
    handleOutlineSelect
  } = useChapterTextOutline({
    chapterNumber,
    selectedVersionId,
    displayText: displayText ?? '',
    displayLoading,
    textViewerRef
  });
  const { handleVersionChange } = useChapterVersionSelectionNavigation({
    bookId,
    chapterNumber,
    versions,
    selectedVersionId,
    setSelectedVersionId
  });
  const { openVersionModal } = useChapterTextVersionModalRuntime({
    selectedVersionId,
    versionSaving,
    handleCreateVersion
  });
  useDisplayedChapterText({
    chapterNumber,
    chapterTitle,
    displayText: displayText ?? '',
    selectedVersionId,
    selectedVersionLabel: selectedVersion?.label ?? null
  });

  const handleToolsToggle = useCallback(() => {
    setToolsOpen((current) => {
      const next = !current;
      if (!next) {
        setSettingsOpen(false);
      }
      return next;
    });
  }, []);

  const pageMeta = useMemo(() => {
    if (!pageRange) {
      return null;
    }
    const start = pageRange.start + 1;
    const end = Math.max(start, pageRange.end);
    return `Pages ${start}-${end}`;
  }, [pageRange]);

  return (
    <div ref={textViewerRef} className="text-viewer" style={textStyle}>
      <header className="text-viewer-header">
        <div className="text-viewer-title">
          <div className="text-viewer-title-kicker">
            <span className="text-viewer-label">{chapterLabel}</span>
            <button
              type="button"
              className="text-viewer-audio-link"
              onClick={openAudioView}
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
              onClick={openChapterEditor}
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
          <ChapterToolsPanel
            settings={{
              open: settingsOpen,
              onToggle: () => setSettingsOpen((current) => !current)
            }}
            outline={{
              available: outlineItems.length > 0,
              open: outlineOpen,
              onToggle: () => setOutlineOpen((current) => !current)
            }}
            chapter={{
              visible: bookType === 'text',
              number: chapterNumber,
              creating: chapterCreating,
              deleting: chapterDeleting || displayLoading,
              onCreate: () => setAddChapterOpen(true),
              onDelete: () => {
                if (chapterNumber) {
                  void handleDeleteChapter(chapterNumber);
                }
              }
            }}
            versions={{
              canCreate: canCreateVersion,
              canDelete: Boolean(selectedVersion?.deletable),
              saving: versionSaving,
              onCreate: openVersionModal,
              onDelete: () => void handleDeleteVersion()
            }}
            audio={{
              audioDeleting,
              audioGenerating,
              audioJob,
              canGenerateAudio,
              chapterAudioReady,
              chapterAudioSubchapters,
              chapterAudioUrl,
              chapterAudioVersionId,
              chapterNumber,
              isAudioJobActive,
              mp3Voice,
              mp3VoiceOptions,
              onCancelAudioJob: handleCancelAudioJob,
              onDeleteAudio: () => void handleDeleteAudio(),
              onGenerateAudio: () => void handleGenerateAudio(),
              onPlayAudio: playChapterAudio,
              onVoiceChange: handleMp3VoiceChange,
              selectedVersionId
            }}
            study={{
              creating: unitCreating,
              disabled: !chapterNumber || !displayText?.trim() || displayLoading || unitCreating,
              onCreate: () => void handleCreateUnit({
                text: displayText ?? '',
                chapterTitle,
                versionLabel: selectedVersion?.label ?? null,
                versionId: selectedVersionId
              })
            }}
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
        <ChapterTextMarkdownLayout
          activeOutlineId={activeOutlineId}
          chapterNumber={chapterNumber}
          displayError={displayError}
          displayLoading={displayLoading}
          displayText={displayText ?? ''}
          handleOutlineSelect={handleOutlineSelect}
          missingFile={missingFile}
          outlineByOffset={outlineByOffset}
          outlineItems={outlineItems}
          outlineOpen={outlineOpen}
          playingParagraphMode={playingParagraphMode}
          playingParagraphStart={playingParagraphStart}
          selectedVersionId={selectedVersionId}
          textViewerRef={textViewerRef}
          tocLoading={tocLoading}
        />
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
      <AddChapterModal
        busy={chapterCreating}
        open={addChapterOpen}
        onClose={() => {
          if (!chapterCreating) {
            setAddChapterOpen(false);
          }
        }}
        onSubmit={async ({ chapterTitle: nextTitle, source, sourceUrl }) => {
          await handleCreateChapter({
            bookName: '',
            chapterTitle: nextTitle,
            source,
            sourceUrl
          });
          setAddChapterOpen(false);
        }}
      />
      <CreateTextVersionModal />
    </div>
  );
}
