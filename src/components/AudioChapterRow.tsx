import TrashIcon from '@/components/TrashIcon';
import type { AudioViewRow } from '@/hooks/useAudioViewRows';
import type { ChapterAudioProvider } from '@/types/app';

type AudioChapterRowProps = {
  cancelAudioJob: (chapterNumber: number) => Promise<void>;
  confirmDeleteAudio: (chapterNumber: number, versionId: string) => Promise<void>;
  generateAudio: (payload: {
    chapterNumber: number;
    versionId: string;
    provider: ChapterAudioProvider;
  }) => Promise<void>;
  openChapterText: (pageIndex: number, versionId?: string, chapterNumber?: number) => void;
  playChapterAudio: (entry: AudioViewRow['entry'], versionId: string) => void;
  row: AudioViewRow;
  selectedMp3Provider: ChapterAudioProvider;
};

export default function AudioChapterRow({
  cancelAudioJob,
  confirmDeleteAudio,
  generateAudio,
  openChapterText,
  playChapterAudio,
  row,
  selectedMp3Provider
}: AudioChapterRowProps) {
  const { entry } = row;

  return (
    <article className="audio-row">
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
        {row.textVersions.length > 0 ? (
          <div className="audio-row-versions" aria-label={`Text versions for chapter ${entry.chapterNumber}`}>
            <span className="audio-row-versions-label">Text versions</span>
            {row.textVersions.map((version) => {
              const isLatest = version.id === row.latestVersionId;
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
        {row.showAction ? (
          <button
            type="button"
            className="button"
            onClick={() =>
              void generateAudio({
                chapterNumber: entry.chapterNumber,
                versionId: row.latestVersionId,
                provider: selectedMp3Provider
              })
            }
            disabled={row.actionDisabled}
          >
            {row.generateLabel}
          </button>
        ) : null}
        {row.isAudioJobActive ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void cancelAudioJob(entry.chapterNumber)}
          >
            Cancel
          </button>
        ) : null}
        {row.audioReady && entry.audio?.url ? (
          <>
            <button
              type="button"
              className="button audio-native-play"
              onClick={() => playChapterAudio(entry, row.latestVersionId)}
              disabled={row.playDisabled}
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
              onClick={() => void confirmDeleteAudio(entry.chapterNumber, row.latestVersionId)}
              disabled={row.playDisabled}
              aria-label="Delete MP3 file"
              title="Delete MP3 file"
            >
              <TrashIcon size={16} />
            </button>
          </>
        ) : null}
      </div>
      {row.isAudioJobActive && row.jobStatus?.progress ? (
        <div className="mp3-generation-progress audio-row-progress">
          <div
            className="mp3-generation-progress-track"
            role="progressbar"
            aria-valuenow={row.jobStatus.progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`MP3 generation progress for chapter ${entry.chapterNumber}`}
          >
            <div
              className="mp3-generation-progress-fill"
              style={{ width: `${row.jobStatus.progress.percent}%` }}
            />
          </div>
          <div className="mp3-generation-progress-meta">
            <span>{row.jobStatus.progress.label ?? 'Generating MP3'}</span>
            <span>
              {row.jobStatus.progress.percent}%
              {row.jobStatus.progress.total > 0
                ? ` · ${row.jobStatus.progress.current}/${row.jobStatus.progress.total}`
                : ''}
            </span>
          </div>
        </div>
      ) : null}
      {row.jobStatus?.status === 'failed' ? (
        <p className="audio-row-error">
          {row.jobStatus.error ?? 'Audio generation failed.'}
        </p>
      ) : null}
      {row.errorMessage ? (
        <p className="audio-row-error">{row.errorMessage}</p>
      ) : null}
    </article>
  );
}
