import type { ChapterTextVersionsResult } from '@/api/chapterTextVersions';
import type { ChapterAudioProvider, ChapterTextVersion } from '@/types/app';

export function normalizeVersionSelection(result: ChapterTextVersionsResult, fallback = 'base') {
  return result.createdVersionId ?? result.latestVersionId ?? result.versions[result.versions.length - 1]?.id ?? fallback;
}

export function selectChapterTextVersion(
  versions: ChapterTextVersion[],
  selectedVersionId: string
) {
  return versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null;
}

export function getChapterTextVersionDisplayState({
  bookId,
  chapterNumber,
  selectedVersionId,
  selectedVersion,
  selectedTextVersionId,
  chapterText,
  selectedText,
  loading,
  versionLoading,
  error,
  versionError
}: {
  bookId: string | null;
  chapterNumber: number | null;
  selectedVersionId: string;
  selectedVersion: ChapterTextVersion | null;
  selectedTextVersionId: string | null;
  chapterText: string;
  selectedText: string;
  loading: boolean;
  versionLoading: boolean;
  error: string | null;
  versionError: string | null;
}) {
  const derivedTextPending = Boolean(
    bookId &&
      chapterNumber &&
      selectedVersionId !== 'base' &&
      selectedVersion &&
      selectedTextVersionId !== selectedVersionId &&
      !versionError
  );
  const displayText =
    selectedVersionId === 'base'
      ? chapterText
      : selectedTextVersionId === selectedVersionId
        ? selectedText
        : '';

  return {
    displayText,
    displayLoading: loading || versionLoading || derivedTextPending,
    displayError: error || versionError
  };
}

export function getChapterAudioProvider(voice: string): ChapterAudioProvider {
  if (voice.startsWith('xai_')) {
    return 'xai';
  }
  if (voice.startsWith('yandex_')) {
    return 'yandex';
  }
  return 'default';
}
