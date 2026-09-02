import AudioChapterRow from '@/components/AudioChapterRow';
import ReaderStateCard from '@/components/ReaderStateCard';
import { useAudioViewActions } from '@/hooks/useAudioViewActions';
import { useAudioViewRuntimeActions } from '@/hooks/useAudioViewRuntimeActions';
import { useAudioViewRows } from '@/hooks/useAudioViewRows';
import {
  appActions,
  selectReaderSession,
  selectTocWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export default function AudioView() {
  const dispatch = useAppDispatch();
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
  const audioRows = useAudioViewRows({
    audioBusy,
    audioDeleting,
    audioJobs,
    chapters,
    errorMap,
    selectedMp3Provider,
    statusMap
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
            : `${audioRows.length} chapter${audioRows.length === 1 ? '' : 's'}`}
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
          <ReaderStateCard
            tone="loading"
            title="Loading chapter audio"
            description="Checking narration and generated audio files."
          />
        ) : null}
        {!tocLoading && !statusLoading && audioRows.length === 0 ? (
          <ReaderStateCard
            title="No chapters available for audio"
            description="Add a table of contents before generating chapter narration."
            action={{
              label: 'Edit TOC',
              onClick: () => dispatch(appActions.openModal('tocManage'))
            }}
          />
        ) : null}
        {!tocLoading && audioRows.length > 0 ? (
          <div className="audio-list">
            {audioRows.map((row) => (
              <AudioChapterRow
                key={row.key}
                cancelAudioJob={cancelAudioJob}
                confirmDeleteAudio={confirmDeleteAudio}
                generateAudio={generateAudio}
                openChapterText={openChapterText}
                playChapterAudio={playChapterAudio}
                row={row}
                selectedMp3Provider={selectedMp3Provider}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
