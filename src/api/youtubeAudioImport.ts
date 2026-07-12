export type YouTubeAudioImportStatus = {
  source: 'youtube';
  sourceUrl: string;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queuedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  error?: string | null;
  audioUrl?: string | null;
  bytes?: number | null;
  videoTitle?: string | null;
};

async function readStatus(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    job?: YouTubeAudioImportStatus | null;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload?.job ?? null;
}

export async function fetchYouTubeAudioImportStatus(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/youtube-audio/status`,
    { cache: 'no-store' }
  );
  return readStatus(response);
}

export async function retryYouTubeAudioImport(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/youtube-audio/retry`,
    { method: 'POST' }
  );
  return readStatus(response);
}
