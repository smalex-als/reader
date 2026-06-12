import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import AddIcon from '@/components/AddIcon';
import ChapterTextMarkdownLayout from '@/components/ChapterTextMarkdownLayout';
import CreateTextVersionModal from '@/components/CreateTextVersionModal';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import TrashIcon from '@/components/TrashIcon';
import { useChapterActions } from '@/hooks/useBookMutations';
import { useChapterTextVersionModalRuntime } from '@/hooks/useChapterTextVersionModalRuntime';
import { useChapterTextOutline } from '@/hooks/useChapterTextOutline';
import { useChapterTextVersions } from '@/hooks/useChapterTextVersions';
import { useChapterVersionSelectionNavigation } from '@/hooks/useChapterVersionNavigation';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useDisplayedChapterText } from '@/hooks/useDisplayedChapterText';
import { useUnitActions } from '@/hooks/useUnitActions';
import { formatListeningTime } from '@/lib/listeningTime';
import {
  appActions,
  selectBookDeletingChapter,
  selectBookType,
  selectBookUploadingChapter,
  selectStreamRuntime,
  selectTocWorkflow,
  selectViewerWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function ChapterViewer() {
  const dispatch = useAppDispatch();
  const { handleCreateChapter, handleDeleteChapter } = useChapterActions();
  const { settings } = useAppSelector(selectViewerWorkflow);
  const streamState = useAppSelector(selectStreamRuntime);
  const { loading: tocLoading } = useAppSelector(selectTocWorkflow);
  const bookType = useAppSelector(selectBookType);
  const chapterCreating = useAppSelector(selectBookUploadingChapter);
  const chapterDeleting = useAppSelector(selectBookDeletingChapter);
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
  const [toolsOpen, setToolsOpen] = useState(false);
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
      <CreateTextVersionModal />
    </div>
  );
}
