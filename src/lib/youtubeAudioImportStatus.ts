export type YouTubeAudioImportState =
  | 'queued'
  | 'running'
  | 'transcribing'
  | 'post-processing'
  | 'completed'
  | 'failed';

export function getYouTubeDownloadFailureDetail(error?: string | null) {
  if (!error) return null;
  if (/No supported JavaScript runtime|JavaScript runtime.*(?:not found|unsupported)|JS runtime.*(?:not found|unsupported)/i.test(error)) {
    return 'The server could not use a supported JavaScript runtime for YouTube. Update Reader, then retry the download.';
  }
  if (/HTTP(?: Error)?\s*403|403:\s*Forbidden/i.test(error)) {
    return 'YouTube refused the audio download (HTTP 403). Update the downloader and retry. If it still fails, check whether the video is accessible from this server.';
  }
  return null;
}

export function isActiveYouTubeAudioImportState(status: YouTubeAudioImportState) {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'transcribing' ||
    status === 'post-processing'
  );
}

export function shouldNavigateToCompletedYouTubeVersion({
  status,
  wasActive,
  postProcessVersionId
}: {
  status: YouTubeAudioImportState;
  wasActive: boolean;
  postProcessVersionId: string | null | undefined;
}) {
  return status === 'completed' && wasActive && Boolean(postProcessVersionId);
}
