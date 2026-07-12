import type { YouTubeAudioImportStatus } from '@/api/youtubeAudioImport';

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return null;
  }
  const megabytes = value / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

function getStatusCopy(status: YouTubeAudioImportStatus['status']) {
  switch (status) {
    case 'queued':
      return {
        title: 'Waiting to download',
        detail: 'The job is queued and will start automatically.'
      };
    case 'running':
      return {
        title: 'Downloading YouTube audio',
        detail: 'Audio is being downloaded and converted to MP3. You can leave this chapter.'
      };
    case 'completed':
      return {
        title: 'Audio ready',
        detail: 'The MP3 is available in this chapter and in Audio Library.'
      };
    case 'failed':
      return {
        title: 'Download failed',
        detail: 'The latest attempt failed. The queue may retry automatically, or you can retry now.'
      };
  }
}

export default function YouTubeAudioImportCard({
  status,
  requestError,
  retrying,
  onPlay,
  onRetry
}: {
  status: YouTubeAudioImportStatus;
  requestError: string | null;
  retrying: boolean;
  onPlay: (audioUrl: string) => void;
  onRetry: () => void;
}) {
  const copy = getStatusCopy(status.status);
  const active = status.status === 'queued' || status.status === 'running';
  const size = formatBytes(status.bytes);

  return (
    <section
      className="youtube-audio-import"
      data-status={status.status}
      aria-label="YouTube audio import"
      aria-live="polite"
    >
      <div className="youtube-audio-import-icon" aria-hidden="true">
        {status.status === 'completed' ? '✓' : status.status === 'failed' ? '!' : '↓'}
      </div>
      <div className="youtube-audio-import-content">
        <div className="youtube-audio-import-heading">
          <div>
            <div className="youtube-audio-import-kicker">YouTube audio</div>
            <h3>{copy.title}</h3>
          </div>
          <a href={status.sourceUrl} target="_blank" rel="noreferrer" className="youtube-audio-import-source">
            Open video ↗
          </a>
        </div>
        <p>{requestError ?? copy.detail}</p>
        {active ? (
          <div className="youtube-audio-import-progress" role="progressbar" aria-label={copy.title}>
            <span />
          </div>
        ) : null}
        <div className="youtube-audio-import-footer">
          {status.status === 'completed' && status.audioUrl ? (
            <>
              <button type="button" className="button" onClick={() => onPlay(status.audioUrl!)}>
                ▶ Play audio
              </button>
              {size ? <span>{size}</span> : null}
            </>
          ) : null}
          {status.status === 'failed' ? (
            <button type="button" className="button" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Retrying…' : 'Retry download'}
            </button>
          ) : null}
          {active ? <span>Usually takes a few minutes</span> : null}
        </div>
      </div>
    </section>
  );
}
