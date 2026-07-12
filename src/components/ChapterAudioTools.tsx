import TrashIcon from '@/components/TrashIcon';
import type { AudioJobStatus } from '@/hooks/chapterTextVersionActions';
import type { StreamVoiceOption } from '@/lib/appConstants';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

export type ChapterAudioToolsProps = {
  audioDeleting: boolean;
  audioGenerating: boolean;
  audioJob: AudioJobStatus | null;
  canGenerateAudio: boolean;
  chapterAudioReady: boolean;
  chapterAudioSubchapters: FloatingAudioSubchapter[];
  chapterAudioUrl: string | null;
  chapterAudioVersionId: string | null;
  chapterNumber: number | null;
  isAudioJobActive: boolean;
  mp3Voice: string;
  mp3VoiceOptions: StreamVoiceOption[];
  onCancelAudioJob: () => void;
  onDeleteAudio: () => void;
  onGenerateAudio: () => void;
  onPlayAudio: (payload: { audioUrl: string; subchapters: FloatingAudioSubchapter[] }) => void;
  onVoiceChange: (voice: string) => void;
  selectedVersionId: string;
};

export default function ChapterAudioTools({
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
  onCancelAudioJob,
  onDeleteAudio,
  onGenerateAudio,
  onPlayAudio,
  onVoiceChange,
  selectedVersionId
}: ChapterAudioToolsProps) {
  return (
    <section className="text-viewer-tools-section" aria-label="Audio tools">
      <h3 className="text-viewer-tools-title">Audio</h3>
      <div className="text-viewer-tools-body">
        <div className="text-viewer-tools-row">
          {chapterNumber && mp3VoiceOptions.length > 0 ? (
            <label className="text-viewer-version-select text-viewer-voice-select">
              <span>MP3 voice</span>
              <select
                value={mp3Voice}
                onChange={(event) => onVoiceChange(event.target.value)}
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
              onClick={onGenerateAudio}
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
            <button type="button" className="button button-secondary" onClick={onCancelAudioJob}>
              Cancel
            </button>
          ) : null}
          {chapterAudioReady && chapterAudioUrl ? (
            <>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => onPlayAudio({
                  audioUrl: chapterAudioUrl,
                  subchapters: chapterAudioSubchapters
                })}
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
                onClick={onDeleteAudio}
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
  );
}
