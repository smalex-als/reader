import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  appActions,
  selectModalOpen,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector,
  type TocVariant
} from '@/state/appState';
import { useToast } from '@/hooks/useToast';
import type { TocEntry } from '@/types/app';

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
};

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useTocManager({ bookId, manifestLength, viewMode }: TocManagerOptions) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const tocOpen = useAppSelector(selectModalOpen('tocNav'));
  const tocManageOpen = useAppSelector(selectModalOpen('tocManage'));
  const {
    variant: tocVariant,
    entries: tocEntries,
    detailedEntries: detailedTocEntries,
    loading: tocLoading,
    generating: tocGenerating,
    saving: tocSaving,
    chapterGeneratingIndex
  } = useAppSelector(selectTocWorkflow);

  const setTocEntries: Dispatch<SetStateAction<TocEntry[]>> = useCallback(
    (next) => {
      dispatch(appActions.setTocEntries(resolveNext(next, tocEntries)));
    },
    [dispatch, tocEntries]
  );

  const setDetailedTocEntries: Dispatch<SetStateAction<TocEntry[]>> = useCallback(
    (next) => {
      dispatch(appActions.setDetailedTocEntries(resolveNext(next, detailedTocEntries)));
    },
    [detailedTocEntries, dispatch]
  );

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

  const setTocOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      dispatch(appActions.setModalOpen('tocNav', resolveNext(next, tocOpen)));
    },
    [dispatch, tocOpen]
  );

  const setTocManageOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      dispatch(appActions.setModalOpen('tocManage', resolveNext(next, tocManageOpen)));
    },
    [dispatch, tocManageOpen]
  );

  const setTocVariant = useCallback(
    (variant: TocVariant) => {
      dispatch(appActions.setTocVariant(variant));
    },
    [dispatch]
  );

  const loadToc = useCallback(async () => {
    if (!bookId) {
      return;
    }
    dispatch(appActions.setTocLoading(true));
    try {
      const [mainData, detailedData] = await Promise.all([
        fetchJson<{ toc: TocEntry[] }>(
          `/api/books/${encodeURIComponent(bookId)}/toc?includeStats=1`
        ),
        fetchJson<{ toc: TocEntry[] }>(
          `/api/books/${encodeURIComponent(bookId)}/toc?variant=detailed&includeStats=1`
        )
      ]);
      dispatch(appActions.setTocEntries(Array.isArray(mainData.toc) ? mainData.toc : []));
      dispatch(appActions.setDetailedTocEntries(Array.isArray(detailedData.toc) ? detailedData.toc : []));
    } catch (error) {
      console.error(error);
      showToast('Unable to load table of contents', 'error');
    } finally {
      dispatch(appActions.setTocLoading(false));
    }
  }, [bookId, dispatch, showToast]);

  const handleGenerateToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    if (!bookId) {
      return;
    }
    dispatch(appActions.setTocGenerating(true));
    try {
      const response = await fetchJson<{ toc: TocEntry[] }>(
        `/api/books/${encodeURIComponent(bookId)}/toc/generate?variant=${variant}${
          variant === 'detailed' ? '&detailLevel=detailed' : ''
        }`,
        { method: 'POST' }
      );
      if (variant === 'detailed') {
        dispatch(appActions.setDetailedTocEntries(Array.isArray(response.toc) ? response.toc : []));
        dispatch(appActions.setTocVariant('detailed'));
        showToast('Detailed table of contents generated', 'success');
      } else {
        dispatch(appActions.setTocEntries(Array.isArray(response.toc) ? response.toc : []));
        dispatch(appActions.setTocVariant('main'));
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
      dispatch(appActions.setTocGenerating(false));
    }
  }, [bookId, dispatch, loadToc, showToast]);

  const handleSaveToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    if (!bookId) {
      return;
    }
    dispatch(appActions.setTocSaving(true));
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
        dispatch(appActions.setDetailedTocEntries(Array.isArray(response.toc) ? response.toc : []));
        showToast('Detailed table of contents saved', 'success');
      } else {
        dispatch(appActions.setTocEntries(Array.isArray(response.toc) ? response.toc : []));
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
      dispatch(appActions.setTocSaving(false));
    }
  }, [bookId, detailedTocEntries, dispatch, loadToc, showToast, tocEntries]);

  const handleAddTocEntry = useCallback((currentPage: number, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
      return;
    }
    setTocEntries((prev) => [...prev, { title: '', page: currentPage }]);
  }, [setDetailedTocEntries, setTocEntries]);

  const handleRemoveTocEntry = useCallback((index: number, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => prev.filter((_, idx) => idx !== index));
      return;
    }
    setTocEntries((prev) => prev.filter((_, idx) => idx !== index));
  }, [setDetailedTocEntries, setTocEntries]);

  const handleUpdateTocEntry = useCallback((index: number, next: TocEntry, variant: 'main' | 'detailed' = 'main') => {
    if (variant === 'detailed') {
      setDetailedTocEntries((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
      return;
    }
    setTocEntries((prev) => prev.map((entry, idx) => (idx === index ? next : entry)));
  }, [setDetailedTocEntries, setTocEntries]);

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

      dispatch(appActions.setTocChapterGeneratingIndex(index));
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
        dispatch(appActions.setTocChapterGeneratingIndex(null));
      }
    },
    [bookId, dispatch, manifestLength, showToast, tocEntries]
  );

  useEffect(() => {
    dispatch(appActions.resetTocWorkflow());
    dispatch(appActions.closeModal('tocNav'));
    dispatch(appActions.closeModal('tocManage'));
  }, [bookId, dispatch]);

  useEffect(() => {
    void loadToc();
  }, [loadToc]);

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
