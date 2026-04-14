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
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
};

export function useTocManager({ bookId, manifestLength, viewMode, showToast }: TocManagerOptions) {
  const [tocOpen, setTocOpen] = useState(false);
  const [tocManageOpen, setTocManageOpen] = useState(false);
  const [tocEntries, setTocEntries] = useState<TocEntry[]>([]);
  const [detailedTocEntries, setDetailedTocEntries] = useState<TocEntry[]>([]);
  const [tocVariant, setTocVariant] = useState<'main' | 'detailed'>('main');
  const [tocLoading, setTocLoading] = useState(false);
  const [tocGenerating, setTocGenerating] = useState(false);
  const [tocSaving, setTocSaving] = useState(false);
  const [chapterGeneratingIndex, setChapterGeneratingIndex] = useState<number | null>(null);

  const sortedTocEntries = useMemo(() => {
    return [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [tocEntries]);
  const sortedDetailedTocEntries = useMemo(() => {
    return [...detailedTocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [detailedTocEntries]);

  const loadToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    setTocLoading(true);
    try {
      const [mainData, detailedData] = await Promise.all([
        fetchJson<{ toc: TocEntry[] }>(
          `/api/books/${encodeURIComponent(bookId)}/toc?includeStats=1`
        ),
        fetchJson<{ toc: TocEntry[] }>(
          `/api/books/${encodeURIComponent(bookId)}/toc?variant=detailed&includeStats=1`
        )
      ]);
      setTocEntries(Array.isArray(mainData.toc) ? mainData.toc : []);
      setDetailedTocEntries(Array.isArray(detailedData.toc) ? detailedData.toc : []);
    } catch (error) {
      console.error(error);
      showToast('Unable to load table of contents', 'error');
    } finally {
      setTocLoading(false);
    }
  }, [bookId, showToast]);

  const handleGenerateToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    if (!bookId) {
      return;
    }
    setTocGenerating(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc/generate?variant=${variant}${
          variant === 'detailed' ? '&detailLevel=detailed' : ''
        }`,
        { method: 'POST' }
      );
      if (variant === 'detailed') {
        setDetailedTocEntries(Array.isArray(response.toc) ? response.toc : []);
        setTocVariant('detailed');
        showToast('Detailed table of contents generated', 'success');
      } else {
        setTocEntries(Array.isArray(response.toc) ? response.toc : []);
        setTocVariant('main');
        showToast('Table of contents generated', 'success');
      }
      await loadToc();
    } catch (error) {
      console.error(error);
      showToast(
        variant === 'detailed'
          ? 'Unable to generate detailed table of contents'
          : 'Unable to generate table of contents',
        'error'
      );
    } finally {
      setTocGenerating(false);
    }
  }, [bookId, loadToc, showToast]);

  const handleSaveToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    if (!bookId) {
      return;
    }
    setTocSaving(true);
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc${
          variant === 'detailed' ? '?variant=detailed' : ''
        }`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toc: variant === 'detailed' ? detailedTocEntries : tocEntries })
        }
      );
      if (variant === 'detailed') {
        setDetailedTocEntries(Array.isArray(response.toc) ? response.toc : []);
        showToast('Detailed table of contents saved', 'success');
      } else {
        setTocEntries(Array.isArray(response.toc) ? response.toc : []);
        showToast('Table of contents saved', 'success');
      }
      await loadToc();
    } catch (error) {
      console.error(error);
      showToast(
        variant === 'detailed'
          ? 'Unable to save detailed table of contents'
          : 'Unable to save table of contents',
        'error'
      );
    } finally {
      setTocSaving(false);
    }
  }, [bookId, detailedTocEntries, loadToc, showToast, tocEntries]);

  const handleAddTocEntry = useCallback((currentPage: number, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
      return;
    }
    setTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
  }, []);

  const handleRemoveTocEntry = useCallback((index: number, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => prev.filter((_, idx) => idx !== index));
      return;
    }
    setTocEntries((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const handleUpdateTocEntry = useCallback((index: number, next: TocEntry, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
      return;
    }
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
    setDetailedTocEntries([]);
    setTocVariant('main');
    setTocOpen(false);
    setTocManageOpen(false);
  }, [bookId]);

  useEffect(() => {
    if (tocOpen || tocManageOpen || viewMode === 'text' || viewMode === 'audio') {
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
    detailedTocEntries,
    setDetailedTocEntries,
    tocVariant,
    setTocVariant,
    sortedTocEntries,
    sortedDetailedTocEntries,
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
