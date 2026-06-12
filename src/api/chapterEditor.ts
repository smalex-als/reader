import type { TocEntry } from '@/types/app';

export interface ChapterSaveResult {
  toc?: TocEntry[];
}

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

export async function fetchEditableChapterText(bookId: string, chapterNumber: number) {
  const filename = formatChapterFilename(chapterNumber);
  const response = await fetch(`/data/${encodeURIComponent(bookId)}/${filename}`);
  if (!response.ok) {
    throw new Error('Failed to load chapter.');
  }
  return response.text();
}

export async function saveEditableChapter(input: {
  bookId: string;
  chapterNumber: number;
  content: string;
  title: string;
  versionId: string | null;
}) {
  const url = input.versionId
    ? `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}/text-versions/${encodeURIComponent(input.versionId)}`
    : `/api/books/${encodeURIComponent(input.bookId)}/chapters/${input.chapterNumber}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      title: input.title
    })
  });
  if (!response.ok) {
    throw new Error(`Save failed: ${response.status}`);
  }
  return (await response.json()) as ChapterSaveResult;
}
