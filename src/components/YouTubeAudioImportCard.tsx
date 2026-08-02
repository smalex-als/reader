import type { YouTubeAudioImportStatus } from '@/api/youtubeAudioImport';

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return null;
  }
  const megabytes = value / (1024 * 1024);
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`;
}

function getStatusCopy(status: YouTubeAudioImportStatus) {
  switch (status.status) {
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
    case 'transcribing':
      return {
        title: 'Transcribing chapter',
        detail: 'The MP3 is ready. OpenAI gpt-transcribe is converting the audio into chapter text.'
      };
    case 'post-processing':
      return {
        title: 'Applying text prompt',
        detail: status.postProcessPromptName
          ? `Creating a new version with “${status.postProcessPromptName}”.`
          : 'Creating a new text version from the OpenAI transcript.'
      };
    case 'completed':
      return {
        title: status.transcriptReady ? 'Chapter ready' : 'Audio ready',
        detail: status.postProcessVersionId
          ? `The transcript, MP3, and “${status.postProcessPromptName ?? 'post-processed'}” version are ready.`
          : status.transcriptReady
          ? 'The transcript and MP3 are ready to use.'
          : 'The MP3 is available in this chapter and in Audio Library.'
      };
    case 'failed':
      return {
        title: status.failureStage === 'post-processing'
          ? 'Post-processing failed'
          : status.audioUrl
            ? 'Transcription failed'
            : 'Download failed',
        detail: status.failureStage === 'post-processing'
          ? 'The MP3 and base transcript are safe. Retry to create the selected text version.'
          : status.audioUrl
          ? 'The MP3 is safe. Retry OpenAI gpt-transcribe without downloading the video.'
          : 'The latest download attempt failed. The queue may retry automatically, or you can retry now.'
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
  const copy = getStatusCopy(status);
  const active =
    status.status === 'queued' ||
    status.status === 'running' ||
    status.status === 'transcribing' ||
    status.status === 'post-processing';
  const size = formatBytes(status.bytes);

  return (
    <section
      className="youtube-audio-import"
      data-status={status.status}
      aria-label="YouTube audio import"
      aria-live="polite"
    >
      <div className="youtube-audio-import-icon" aria-hidden="true">
        {status.status === 'completed'
          ? '✓'
          : status.status === 'failed'
            ? '!'
            : status.status === 'transcribing' || status.status === 'post-processing'
              ? '…'
              : '↓'}
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
        <p>{requestError ?? (status.status === 'failed' ? status.error ?? copy.detail : copy.detail)}</p>
        {active ? (
          <div className="youtube-audio-import-progress" role="progressbar" aria-label={copy.title}>
            <span />
          </div>
        ) : null}
        <div className="youtube-audio-import-footer">
          {status.audioUrl ? (
            <>
              <button type="button" className="button" onClick={() => onPlay(status.audioUrl!)}>
                ▶ Play audio
              </button>
              {size ? <span>{size}</span> : null}
            </>
          ) : null}
          {status.status === 'failed' ? (
            <button type="button" className="button" onClick={onRetry} disabled={retrying}>
              {retrying
                ? 'Retrying…'
                : status.failureStage === 'post-processing'
                  ? 'Retry post-processing'
                  : status.audioUrl
                    ? 'Retry transcription'
                    : 'Retry download'}
            </button>
          ) : null}
          {active ? <span>Usually takes a few minutes</span> : null}
        </div>
      </div>
    </section>
  );
}
