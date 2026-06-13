import { useAudioViewActions } from '@/hooks/useAudioViewActions';
import { useAudioViewRuntimeActions } from '@/hooks/useAudioViewRuntimeActions';
import {
  selectReaderSession,
  selectTocWorkflow,
  selectVoiceWorkflow,
  useAppSelector
} from '@/state/appState';
import TrashIcon from '@/components/TrashIcon';

export default function AudioView() {
  const { bookId } = useAppSelector(selectReaderSession);
  const { entries: tocEntries, loading: tocLoading } = useAppSelector(selectTocWorkflow);
  const { streamVoiceOptions, mp3Voice } = useAppSelector(selectVoiceWorkflow);
  const {
    statusMap,
    statusLoading,
    audioBusy,
    audioDeleting,
    errorMap,
    chapters,
    audioJobs,
    generateAudio,
    cancelAudioJob,
    deleteAudio
  } = useAudioViewActions({
    bookId,
    canLoadAudioStatus: tocEntries.length > 0,
    mp3Voice
  });
  const {
    confirmDeleteAudio,
    handleMp3VoiceChange,
    mp3VoiceOptions,
    openChapterText,
    playChapterAudio,
    selectedMp3Provider
  } = useAudioViewRuntimeActions({
    audioDeleting,
    deleteAudio,
    mp3Voice,
    streamVoiceOptions
  });

  return (
    <div className="audio-viewer">
      <header className="audio-viewer-header">
        <div className="audio-viewer-title">
          <span className="audio-viewer-label">Audio</span>
          <h2 className="audio-viewer-heading">Chapter narration & audio</h2>
        </div>
        <div className="audio-viewer-meta">
          {tocLoading
            ? 'Loading table of contents…'
            : `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`}
        </div>
        {mp3VoiceOptions.length > 0 ? (
          <label className="toolbar-field">
            MP3 voice
            <select
              className="select"
              value={mp3Voice}
              onChange={(event) => handleMp3VoiceChange(event.target.value)}
            >
              {mp3VoiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      <section className="audio-viewer-body">
        {tocLoading || statusLoading ? (
          <p className="audio-viewer-status">Loading audio status…</p>
        ) : null}
        {!tocLoading && !statusLoading && chapters.length === 0 ? (
          <p className="audio-viewer-status">No chapters found. Use Edit TOC to add them.</p>
        ) : null}
        {!tocLoading && chapters.length > 0 ? (
          <div className="audio-list">
            {chapters.map((entry) => {
              const chapterStatus = statusMap[entry.chapterNumber];
              const latestVersionId = chapterStatus?.latestVersionId ?? entry.latestVersionId ?? 'base';
              const textVersions = entry.textVersions ?? [];
              const audioReady =
                (chapterStatus?.audioReady ?? false) &&
                (chapterStatus?.audioVersionId ?? entry.audio?.versionId ?? null) === latestVersionId;
              const jobStatus = audioJobs[entry.chapterNumber];
              const isAudioJobActive =
                jobStatus?.status === 'queued' || jobStatus?.status === 'running';
              const showAction = !audioReady;
              const actionLabel = isAudioJobActive
                ? jobStatus?.status === 'queued'
                  ? 'Queued…'
                  : 'Generating…'
                : audioBusy[entry.chapterNumber]
                ? 'Starting…'
                : 'Generate audio';
              const actionDisabled =
                audioBusy[entry.chapterNumber] || audioDeleting[entry.chapterNumber] || isAudioJobActive;
              const generateLabel = isAudioJobActive
                ? actionLabel
                : selectedMp3Provider === 'yandex'
                  ? 'Generate Yandex'
                  : selectedMp3Provider === 'xai'
                    ? 'Generate xAI'
                    : 'Generate audio';
              return (
                <article key={`${entry.title}-${entry.page}-${entry.chapterNumber}`} className="audio-row">
                  <div className="audio-row-main">
                    <div className="audio-row-title">
                      <span className="audio-row-chapter">Chapter {entry.chapterNumber}</span>
                      <button
                        type="button"
                        className="audio-row-title-link audio-row-link"
                        onClick={() => openChapterText(entry.page)}
                      >
                        {entry.title}
                      </button>
                    </div>
                    {textVersions.length > 0 ? (
                      <div className="audio-row-versions" aria-label={`Text versions for chapter ${entry.chapterNumber}`}>
                        <span className="audio-row-versions-label">Text versions</span>
                        {textVersions.map((version) => {
                          const isLatest = version.id === latestVersionId;
                          return (
                            <button
                              key={version.id}
                              type="button"
                              className={`audio-version-chip ${isLatest ? 'audio-version-chip-active' : ''}`}
                              onClick={() => openChapterText(entry.page, version.id, entry.chapterNumber)}
                              title={version.promptName ? `${version.label} · ${version.promptName}` : version.label}
                            >
                              <span>{version.label}</span>
                              {version.promptName ? <small>{version.promptName}</small> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="audio-row-actions">
                    {showAction ? (
                      <>
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            void generateAudio({
                              chapterNumber: entry.chapterNumber,
                              versionId: latestVersionId,
                              provider: selectedMp3Provider
                            })
                          }
                          disabled={actionDisabled}
                        >
                          {generateLabel}
                        </button>
                      </>
                    ) : null}
                    {isAudioJobActive ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void cancelAudioJob(entry.chapterNumber)}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {audioReady && entry.audio?.url ? (
                      <>
                        <button
                          type="button"
                          className="button audio-native-play"
                          onClick={() => playChapterAudio(entry, latestVersionId)}
                          disabled={audioDeleting[entry.chapterNumber]}
                        >
                          ▶ Play
                        </button>
                        <a
                          className="button button-secondary"
                          href={entry.audio.url}
                          download
                          aria-label="Download MP3 file"
                          title="Download MP3 file"
                        >
                          ↓
                        </a>
                        <button
                          type="button"
                          className="button button-secondary audio-delete"
                          onClick={() => void confirmDeleteAudio(entry.chapterNumber, latestVersionId)}
                          disabled={audioDeleting[entry.chapterNumber]}
                          aria-label="Delete MP3 file"
                          title="Delete MP3 file"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {isAudioJobActive && jobStatus?.progress ? (
                    <div className="mp3-generation-progress audio-row-progress">
                      <div
                        className="mp3-generation-progress-track"
                        role="progressbar"
                        aria-valuenow={jobStatus.progress.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`MP3 generation progress for chapter ${entry.chapterNumber}`}
                      >
                        <div
                          className="mp3-generation-progress-fill"
                          style={{ width: `${jobStatus.progress.percent}%` }}
                        />
                      </div>
                      <div className="mp3-generation-progress-meta">
                        <span>{jobStatus.progress.label ?? 'Generating MP3'}</span>
                        <span>
                          {jobStatus.progress.percent}%
                          {jobStatus.progress.total > 0
                            ? ` · ${jobStatus.progress.current}/${jobStatus.progress.total}`
                            : ''}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {jobStatus?.status === 'failed' ? (
                    <p className="audio-row-error">
                      {jobStatus.error ?? 'Audio generation failed.'}
                    </p>
                  ) : null}
                  {errorMap[entry.chapterNumber] ? (
                    <p className="audio-row-error">{errorMap[entry.chapterNumber]}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
