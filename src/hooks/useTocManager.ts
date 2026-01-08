import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TocEntry, ToastMessage } from '@/types/app';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

type TocManagerOptions = {
  bookId: string | null;
  manifestLength: number;
  viewMode: 'pages' | 'text';
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
};

export function useTocManager({ bookId, manifestLength, viewMode, showToast }: TocManagerOptions) {
  const [tocOpen, setTocOpen] = useState(false);
  const [tocManageOpen, setTocManageOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocGenerating, setTocGenerating] = useState(false);
  const [tocSaving, setTocSaving] = useState(false);
  const [chapterGeneratingIndex, setChapterGeneratingIndex] = useState<number | null>(null);

  const sortedTocEntries = useMemo(() => {
    return [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [tocEntries]);

  const loadToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocLoading(true);
    try {
      const data = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc`
      );
      setTocEntries(Array.isArray(data.toc) ? data.toc : []);
    } catch (error) {
      console.error(error);
      showToast('Unable to load table of contents', 'error');
    } finally {
      setTocLoading(false);
    }
  }, [bookId, showToast]);

  const handleGenerateToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocGenerating(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc/generate`,
        { method: 'POST' }
      );
      setTocEntries(Array.isArray(response.toc) ? response.toc : []);
      showToast('Table of contents generated', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to generate table of contents', 'error');
    } finally {
      setTocGenerating(false);
    }
  }, [bookId, showToast]);

  const handleSaveToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocSaving(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toc: tocEntries })
        }
      );
      setTocEntries(Array.isArray(response.toc) ? response.toc : []);
      showToast('Table of contents saved', 'success');
    } catch (error) {
      console.error(error);
      showToast('Unable to save table of contents', 'error');
    } finally {
      setTocSaving(false);
    }
  }, [bookId, showToast, tocEntries]);

  const handleAddTocEntry = useCallback((currentPage: number) => {
    setTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
  }, []);

  const handleRemoveTocEntry = useCallback((index: number) => {
    setTocEntries((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleUpdateTocEntry = useCallback((index: number, next: TocEntry) => {
    setTocEntries((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
  }, []);

  const handleGenerateChapter = useCallback(
    async (index: number) => {
      if (!bookId) {
        return;
      }
      const entry = tocEntries[index];
      if (!entry) {
        showToast('Chapter entry not found', 'error');
        return;
      }
      const pageStart = entry.page;
      const sortedPages = tocEntries
        .map((tocEntry) => tocEntry.page)
        .filter((page) => Number.isInteger(page))
        .sort((a, b) => a - b);
      const chapterNumber = sortedPages.indexOf(pageStart) + 1;
      if (chapterNumber <= 0) {
        showToast('Chapter order could not be determined', 'error');
        return;
      }
      const nextPageCandidates = tocEntries
        .map((tocEntry) => tocEntry.page)
        .filter((page) => Number.isInteger(page) && page > pageStart)
        .sort((a, b) => a - b);
      const pageEnd = nextPageCandidates[0] ?? manifestLength;

      if (pageStart < 0 || pageStart >= manifestLength) {
        showToast('Chapter start page is out of range', 'error');
        return;
      }
      if (!Number.isInteger(pageEnd) || pageEnd <= pageStart || pageEnd > manifestLength) {
        showToast('Chapter end page is invalid', 'error');
        return;
      }

      setChapterGeneratingIndex(index);
      try {
        const result = await fetchJson<{ file: string }>(
          `/api/books/${encodeURIComponent(bookId)}/chapters/generate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pageStart,
              pageEnd,
              chapterNumber
            })
          }
        );
        showToast(`Chapter text saved: ${result.file}`, 'success');
      } catch (error) {
        console.error(error);
        showToast('Unable to generate chapter text', 'error');
      } finally {
        setChapterGeneratingIndex(null);
      }
    },
    [bookId, manifestLength, showToast, tocEntries]
  );

  useEffect(() => {
    setTocEntries([]);
    setTocOpen(false);
    setTocManageOpen(false);
  }, [bookId]);

  useEffect(() => {
    if (tocOpen || tocManageOpen || viewMode === 'text') {
      void loadToc();
    }
  }, [loadToc, tocManageOpen, tocOpen, viewMode]);

  return {
    tocOpen,
    setTocOpen,
    tocManageOpen,
    setTocManageOpen,
    tocEntries,
    setTocEntries,
    sortedTocEntries,
    tocLoading,
    tocGenerating,
    tocSaving,
    chapterGeneratingIndex,
    handleGenerateToc,
    handleSaveToc,
    handleAddTocEntry,
    handleRemoveTocEntry,
    handleUpdateTocEntry,
    handleGenerateChapter
  };
}
