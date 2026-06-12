import type { ChapterMemoryCard, ChapterVocabulary } from '@/types/app';

export type ChapterArtifactTarget = {
  bookId: string;
  chapterNumber: number;
  pageRange?: {
    start: number;
    end: number;
  } | null;
};

export type ChapterArtifactKind = 'memory-card' | 'vocabulary';

async function readErrorMessage(response: Response, kind: ChapterArtifactKind) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `${kind} request failed: ${response.status}`;
  } catch {
    return `${kind} request failed: ${response.status}`;
  }
}

function getArtifactUrl(kind: ChapterArtifactKind, target: ChapterArtifactTarget) {
  return `/api/books/${encodeURIComponent(target.bookId)}/chapters/${target.chapterNumber}/${kind}`;
}

function getArtifactPostBody(target: ChapterArtifactTarget, force: boolean) {
  return {
    force,
    ...(target.pageRange
      ? {
          pageStart: target.pageRange.start,
          pageEnd: target.pageRange.end
        }
      : {})
  };
}

async function loadChapterArtifact<T>(
  kind: ChapterArtifactKind,
  target: ChapterArtifactTarget,
  force: boolean
) {
  const url = getArtifactUrl(kind, target);
  let response = await fetch(url);
  if (response.status === 404 || force) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(getArtifactPostBody(target, force))
    });
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, kind));
  }
  return (await response.json()) as T;
}

export async function loadChapterMemoryCard(target: ChapterArtifactTarget, force = false) {
  const payload = await loadChapterArtifact<{
    title: string;
    text: string;
    source: ChapterMemoryCard['source'];
    chapterNumber: number;
    file?: string;
  }>('memory-card', target, force);

  return {
    chapterNumber: payload.chapterNumber,
    title: payload.title,
    text: payload.text,
    source: payload.source,
    file: payload.file
  };
}

export async function loadChapterVocabulary(target: ChapterArtifactTarget, force = false) {
  const payload = await loadChapterArtifact<{
    title: string;
    items: ChapterVocabulary['items'];
    source: ChapterVocabulary['source'];
    chapterNumber: number;
    file?: string;
  }>('vocabulary', target, force);

  return {
    chapterNumber: payload.chapterNumber,
    title: payload.title,
    items: Array.isArray(payload.items) ? payload.items : [],
    source: payload.source,
    file: payload.file
  };
}
