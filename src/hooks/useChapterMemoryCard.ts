import { useCallback, useEffect, useState } from 'react';
import type { ChapterMemoryCard } from '@/types/app';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type UseChapterMemoryCardOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
};

export function useChapterMemoryCard({ bookId, chapterNumber, chapterRange }: UseChapterMemoryCardOptions) {
  const [memoryCardOpen, setMemoryCardOpen] = useState(false);
  const [memoryCardLoading, setMemoryCardLoading] = useState(false);
  const [memoryCardError, setMemoryCardError] = useState<string | null>(null);
  const [memoryCard, setMemoryCard] = useState<ChapterMemoryCard | null>(null);

  useEffect(() => {
    setMemoryCard(null);
    setMemoryCardError(null);
  }, [bookId, chapterNumber]);

  const loadMemoryCard = useCallback(async (force = false) => {
    if (!bookId || !chapterNumber) {
      setMemoryCardError('Move to a page inside a known chapter to open a memory card.');
      setMemoryCard(null);
      setMemoryCardOpen(true);
      return;
    }

    setMemoryCardOpen(true);
    setMemoryCardLoading(true);
    setMemoryCardError(null);

    try {
      const baseUrl = `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/memory-card`;
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
        throw new Error(`Memory card request failed: ${response.status}`);
      }

      const payload = (await response.json()) as {
        title: string;
        text: string;
        source: ChapterMemoryCard['source'];
        chapterNumber: number;
        file?: string;
      };

      setMemoryCard({
        chapterNumber: payload.chapterNumber,
        title: payload.title,
        text: payload.text,
        source: payload.source,
        file: payload.file
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load memory card.';
      setMemoryCardError(message);
      setMemoryCard(null);
    } finally {
      setMemoryCardLoading(false);
    }
  }, [bookId, chapterNumber, chapterRange]);

  const openMemoryCard = useCallback(async () => {
    await loadMemoryCard(false);
  }, [loadMemoryCard]);

  const regenerateMemoryCard = useCallback(async () => {
    await loadMemoryCard(true);
  }, [loadMemoryCard]);

  const closeMemoryCard = useCallback(() => {
    setMemoryCardOpen(false);
  }, []);

  return {
    memoryCardOpen,
    memoryCardLoading,
    memoryCardError,
    memoryCard,
    openMemoryCard,
    regenerateMemoryCard,
    closeMemoryCard
  };
}
