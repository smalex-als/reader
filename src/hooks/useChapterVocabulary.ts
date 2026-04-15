import { useCallback, useEffect, useState } from 'react';
import type { ChapterVocabulary } from '@/types/app';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type UseChapterVocabularyOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
};

export function useChapterVocabulary({ bookId, chapterNumber, chapterRange }: UseChapterVocabularyOptions) {
  const [vocabularyOpen, setVocabularyOpen] = useState(false);
  const [vocabularyLoading, setVocabularyLoading] = useState(false);
  const [vocabularyError, setVocabularyError] = useState<string | null>(null);
  const [vocabulary, setVocabulary] = useState<ChapterVocabulary | null>(null);

  useEffect(() => {
    setVocabulary(null);
    setVocabularyError(null);
  }, [bookId, chapterNumber]);

  const loadVocabulary = useCallback(async (force = false) => {
    if (!bookId || !chapterNumber) {
      setVocabularyError('Move to a page inside a known chapter to open vocabulary.');
      setVocabulary(null);
      setVocabularyOpen(true);
      return;
    }

    setVocabularyOpen(true);
    setVocabularyLoading(true);
    setVocabularyError(null);

    try {
      const baseUrl = `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/vocabulary`;
      let response = await fetch(baseUrl);
      if (response.status === 404 || force) {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            force,
            ...(chapterRange
              ? {
                  pageStart: chapterRange.start,
                  pageEnd: chapterRange.end
                }
              : {})
          })
        });
      }
      if (!response.ok) {
        throw new Error(`Vocabulary request failed: ${response.status}`);
      }

      const payload = (await response.json()) as {
        title: string;
        items: ChapterVocabulary['items'];
        source: ChapterVocabulary['source'];
        chapterNumber: number;
        file?: string;
      };

      setVocabulary({
        chapterNumber: payload.chapterNumber,
        title: payload.title,
        items: Array.isArray(payload.items) ? payload.items : [],
        source: payload.source,
        file: payload.file
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load vocabulary.';
      setVocabularyError(message);
      setVocabulary(null);
    } finally {
      setVocabularyLoading(false);
    }
  }, [bookId, chapterNumber, chapterRange]);

  const openVocabulary = useCallback(async () => {
    await loadVocabulary(false);
  }, [loadVocabulary]);

  const regenerateVocabulary = useCallback(async () => {
    await loadVocabulary(true);
  }, [loadVocabulary]);

  const closeVocabulary = useCallback(() => {
    setVocabularyOpen(false);
  }, []);

  return {
    vocabularyOpen,
    vocabulary,
    vocabularyLoading,
    vocabularyError,
    openVocabulary,
    regenerateVocabulary,
    closeVocabulary
  };
}
