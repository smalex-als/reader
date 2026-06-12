import type { ChapterAudioJobStatus } from '@/api/chapterAudio';
import type { ChapterAudioProvider, ChapterTextPrompt, ChapterTextVersion } from '@/types/app';

export type ChapterTextVersionsResult = {
  latestVersionId: string | null;
  createdVersionId?: string | null;
  versions: ChapterTextVersion[];
  promptLibrary: ChapterTextPrompt[];
};

export type CreateChapterTextVersionInput = {
  bookId: string;
  chapterNumber: number;
  promptId: string | null;
  sourceVersionId: string;
  model: string;
  customPrompt: string;
  addToLibrary: boolean;
  promptName: string;
};

export type GenerateChapterTextInput = {
  bookId: string;
  chapterNumber: number;
  pageStart: number;
  pageEnd: number;
};

export type StartChapterVersionAudioInput = {
  bookId: string;
  chapterNumber: number;
  voice: string;
  versionId: string;
  provider: ChapterAudioProvider;
  force: boolean;
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

async function ensureOk(response: Response) {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

function normalizeTextVersionList(value: unknown) {
  return Array.isArray(value) ? (value as ChapterTextVersion[]) : [];
}

function normalizePromptLibrary(value: unknown) {
  return Array.isArray(value) ? (value as ChapterTextPrompt[]) : [];
}

function normalizeAudioJob(job: Partial<ChapterAudioJobStatus> | null | undefined, fallback?: {
  provider?: ChapterAudioProvider;
  versionId?: string;
}) {
  if (!job?.status) {
    return null;
  }
  return {
    provider: job.provider ?? fallback?.provider,
    status: job.status,
    error: job.error ?? null,
    audioUrl: job.audioUrl ?? null,
    versionId: job.versionId ?? fallback?.versionId ?? null,
    subchapters: job.subchapters ?? [],
    progress: job.progress ?? null
  } satisfies ChapterAudioJobStatus;
}

function normalizeTextVersionsPayload(payload: {
  latestVersionId?: string;
  createdVersionId?: string;
  versions?: unknown;
  promptLibrary?: unknown;
}): ChapterTextVersionsResult {
  return {
    latestVersionId: payload.latestVersionId ?? null,
    createdVersionId: payload.createdVersionId ?? null,
    versions: normalizeTextVersionList(payload.versions),
    promptLibrary: normalizePromptLibrary(payload.promptLibrary)
  };
}

export function getChapterTextUrl(bookId: string, chapterNumber: number) {
  const filename = `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
  return {
    filename,
    url: `/data/${encodeURIComponent(bookId)}/${filename}`
  };
}

export async function fetchChapterText(bookId: string, chapterNumber: number) {
  const { filename, url } = getChapterTextUrl(bookId, chapterNumber);
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      const error = new Error('Chapter text not found.');
      (error as Error & { missingFile?: string }).missingFile = filename;
      throw error;
    }
    throw new Error('Failed to load chapter.');
  }
  return (await response.text()).trim();
}

export async function fetchChapterVersionText(file: string) {
  const response = await fetch(file);
  if (!response.ok) {
    throw new Error(`Failed to load version (${response.status})`);
  }
  return (await response.text()).trim();
}

export async function fetchChapterTextVersions(bookId: string, chapterNumber: number) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions`
  );
  const payload = await readJson<{
    latestVersionId?: string;
    versions?: unknown;
    promptLibrary?: unknown;
  }>(response);
  return normalizeTextVersionsPayload(payload);
}

export async function generateChapterText(input: GenerateChapterTextInput) {
  const response = await fetch(`/api/books/${encodeURIComponent(input.bookId)}/chapters/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      chapterNumber: input.chapterNumber
    })
  });
  await ensureOk(response);
}

export async function createChapterTextVersion(input: CreateChapterTextVersionInput) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/text-versions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptId: input.promptId,
        sourceVersionId: input.sourceVersionId,
        model: input.model,
        customPrompt: input.customPrompt,
        addToLibrary: input.addToLibrary,
        promptName: input.promptName
      })
    }
  );
  const payload = await readJson<{
    latestVersionId?: string;
    createdVersionId?: string;
    versions?: unknown;
    promptLibrary?: unknown;
  }>(response);
  return normalizeTextVersionsPayload(payload);
}

export async function deleteChapterTextVersion(input: {
  bookId: string;
  chapterNumber: number;
  versionId: string;
}) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/text-versions/${input.versionId}`,
    { method: 'DELETE' }
  );
  const payload = await readJson<{
    latestVersionId?: string;
    versions?: unknown;
    promptLibrary?: unknown;
  }>(response);
  return normalizeTextVersionsPayload(payload);
}

export async function fetchChapterVersionAudioStatus(input: {
  bookId: string;
  chapterNumber: number;
  versionId?: string;
}) {
  const params = input.versionId ? `?${new URLSearchParams({ versionId: input.versionId }).toString()}` : '';
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/audio/status${params}`
  );
  const payload = await readJson<{ job?: Partial<ChapterAudioJobStatus> | null }>(response);
  return normalizeAudioJob(payload.job);
}

export async function startChapterVersionAudio(input: StartChapterVersionAudioInput) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/audio`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voice: input.voice,
        versionId: input.versionId,
        provider: input.provider,
        force: input.force
      })
    }
  );
  const payload = await readJson<{ job?: Partial<ChapterAudioJobStatus> | null }>(response);
  return normalizeAudioJob(payload.job, {
    provider: input.provider,
    versionId: input.versionId
  });
}

export async function cancelChapterVersionAudio(bookId: string, chapterNumber: number, versionId: string) {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/cancel`,
    { method: 'POST' }
  );
  await ensureOk(response);
  return {
    status: 'canceled',
    error: null,
    audioUrl: null,
    versionId,
    progress: null
  } satisfies ChapterAudioJobStatus;
}

export async function deleteChapterVersionAudio(input: {
  bookId: string;
  chapterNumber: number;
  versionId: string;
}) {
  const params = new URLSearchParams({ versionId: input.versionId });
  const response = await fetch(
    `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/audio?${params.toString()}`,
    { method: 'DELETE' }
  );
  await ensureOk(response);
}
