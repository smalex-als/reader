import type { ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

export type ChapterAudioProvider = 'default' | 'xai' | 'yandex';

export type ChapterAudioJobStatus = {
  provider?: ChapterAudioProvider;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
  versionId?: string | null;
  subchapters?: FloatingAudioSubchapter[];
  progress?: {
    percent: number;
    current: number;
    total: number;
    label?: string | null;
  } | null;
};

export type AudioChapter = {
  chapterNumber: number;
  title: string;
  page: number;
  latestVersionId: string;
  textVersions?: ChapterTextVersion[];
  audio: {
    ready: boolean;
    url: string;
    srtUrl?: string | null;
    versionId?: string | null;
    durationSeconds?: number | null;
    provider?: ChapterAudioProvider;
    subchapters?: FloatingAudioSubchapter[];
  };
};

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
}

function normalizeChapterAudioJob(
  job: Partial<ChapterAudioJobStatus> | null | undefined,
  fallbackProvider?: ChapterAudioProvider
): ChapterAudioJobStatus | null {
  if (!job?.status) {
    return null;
  }
  return {
    provider: job.provider ?? fallbackProvider,
    status: job.status,
    error: job.error ?? null,
    audioUrl: job.audioUrl ?? null,
    versionId: job.versionId ?? null,
    subchapters: job.subchapters ?? [],
    progress: job.progress ?? null
  };
}

export async function fetchBookAudioChapters(bookId: string) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/audio`);
  const payload = await readJson<{ chapters?: AudioChapter[] }>(response);
  return Array.isArray(payload.chapters) ? payload.chapters : [];
}

export async function startChapterAudioJob(input: {
  bookId: string;
  chapterNumber: number;
  versionId: string;
  voice: string;
  provider: ChapterAudioProvider;
}) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/audio`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: input.voice,
        versionId: input.versionId,
        provider: input.provider
      })
    }
  );
  const payload = await readJson<{ job?: Partial<ChapterAudioJobStatus> }>(response);
  return normalizeChapterAudioJob(payload.job, input.provider);
}

export async function fetchChapterAudioJobStatus(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/status`
  );
  const payload = await readJson<{ job?: Partial<ChapterAudioJobStatus> | null }>(response);
  return normalizeChapterAudioJob(payload.job);
}

export async function cancelChapterAudioJob(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/cancel`,
    { method: 'POST' }
  );
  const payload = await readJson<{ job?: Partial<ChapterAudioJobStatus> | null }>(response);
  return normalizeChapterAudioJob(payload.job) ?? {
    status: 'canceled',
    error: null,
    audioUrl: null
  };
}

export async function deleteChapterAudio(input: {
  bookId: string;
  chapterNumber: number;
  versionId: string;
}) {
  const params = new URLSearchParams({ versionId: input.versionId });
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/audio?${params.toString()}`,
    { method: 'DELETE' }
  );
  await readJson(response);
}
