export type YouTubeAudioImportState =
  | 'queued'
  | 'running'
  | 'transcribing'
  | 'post-processing'
  | 'completed'
  | 'failed';

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
