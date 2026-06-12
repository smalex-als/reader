import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  fetchAllToc,
  generateChapterText,
  generateToc,
  saveToc
} from '@/api/toc';
import {
  appActions,
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectModalOpen,
  selectReaderSession,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector,
  type TocVariant
} from '@/state/appState';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import type { TocEntry } from '@/types/app';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

type TocPayloads = {
  loadToc: {
    bookId: string | null;
  };
  generateToc: {
    bookId: string | null;
    variant: TocVariant;
  };
  saveToc: {
    bookId: string | null;
    variant: TocVariant;
    toc: TocEntry[];
  };
  generateChapter: {
    bookId: string | null;
    index: number;
    pageStart: number;
    pageEnd: number;
    chapterNumber: number;
  };
};

type TocActions = {
  setEntries: (entries: TocEntry[]) => void;
  setDetailedEntries: (entries: TocEntry[]) => void;
  setVariant: (variant: TocVariant) => void;
  setLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setSaving: (saving: boolean) => void;
  setChapterGeneratingIndex: (index: number | null) => void;
  setError: (error: string | null) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const tocHandlers = createActionHandlerRegistry<unknown, TocActions, TocPayloads>();
const { addActionHandler } = tocHandlers;

function applyAllToc(actions: TocActions, toc: { main: TocEntry[]; detailed: TocEntry[] }) {
  actions.setEntries(toc.main);
  actions.setDetailedEntries(toc.detailed);
}

async function reloadAllToc(bookId: string, actions: TocActions) {
  try {
    applyAllToc(actions, await fetchAllToc(bookId));
  } catch (error) {
    console.error(error);
    actions.showError('Unable to load table of contents');
  }
}

addActionHandler('loadToc', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load table of contents',
    request: () => fetchAllToc(payload.bookId!),
    onSuccess: (toc) => applyAllToc(actions, toc),
    onError: (error) => {
      console.error(error);
      actions.showError('Unable to load table of contents');
    }
  });
});

addActionHandler('generateToc', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }
  await runRequest({
    setBusy: actions.setGenerating,
    setError: actions.setError,
    fallbackError:
      payload.variant === 'detailed'
        ? 'Unable to generate detailed table of contents'
        : 'Unable to generate table of contents',
    request: () => generateToc(payload.bookId!, payload.variant),
    onSuccess: async (toc) => {
      if (payload.variant === 'detailed') {
        actions.setDetailedEntries(toc);
        actions.setVariant('detailed');
        actions.showSuccess('Detailed table of contents generated');
      } else {
        actions.setEntries(toc);
        actions.setVariant('main');
        actions.showSuccess('Table of contents generated');
      }
      await reloadAllToc(payload.bookId!, actions);
    },
    onError: (error) => {
      console.error(error);
      actions.showError(
        payload.variant === 'detailed'
          ? 'Unable to generate detailed table of contents'
          : 'Unable to generate table of contents'
      );
    }
  });
});

addActionHandler('saveToc', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }
  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    fallbackError:
      payload.variant === 'detailed'
        ? 'Unable to save detailed table of contents'
        : 'Unable to save table of contents',
    request: () =>
      saveToc({
        bookId: payload.bookId!,
        variant: payload.variant,
        toc: payload.toc
      }),
    onSuccess: async (toc) => {
      if (payload.variant === 'detailed') {
        actions.setDetailedEntries(toc);
        actions.showSuccess('Detailed table of contents saved');
      } else {
        actions.setEntries(toc);
        actions.showSuccess('Table of contents saved');
      }
      await reloadAllToc(payload.bookId!, actions);
    },
    onError: (error) => {
      console.error(error);
      actions.showError(
        payload.variant === 'detailed'
          ? 'Unable to save detailed table of contents'
          : 'Unable to save table of contents'
      );
    }
  });
});

addActionHandler('generateChapter', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }
  actions.setChapterGeneratingIndex(payload.index);
  try {
    const result = await generateChapterText({
      bookId: payload.bookId,
      pageStart: payload.pageStart,
      pageEnd: payload.pageEnd,
      chapterNumber: payload.chapterNumber
    });
    actions.showSuccess(`Chapter text saved: ${result.file}`);
  } catch (error) {
    console.error(error);
    actions.showError('Unable to generate chapter text');
  } finally {
    actions.setChapterGeneratingIndex(null);
  }
});

export function useTocManager() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { bookId } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
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
  const manifestLength = bookType === 'text' ? chapterCount : manifest.length;
  const tocActions = useMemo<TocActions>(
    () => ({
      setEntries: (entries) => dispatch(appActions.setTocEntries(entries)),
      setDetailedEntries: (entries) => dispatch(appActions.setDetailedTocEntries(entries)),
      setVariant: (variant) => dispatch(appActions.setTocVariant(variant)),
      setLoading: (loading) => dispatch(appActions.setTocLoading(loading)),
      setGenerating: (generating) => dispatch(appActions.setTocGenerating(generating)),
      setSaving: (saving) => dispatch(appActions.setTocSaving(saving)),
      setChapterGeneratingIndex: (index) => dispatch(appActions.setTocChapterGeneratingIndex(index)),
      setError: () => undefined,
      showError: (message) => showToast(message, 'error'),
      showSuccess: (message) => showToast(message, 'success')
    }),
    [dispatch, showToast]
  );
  const runTocAction = useCallback(
    async <T extends keyof TocPayloads>(action: T, payload: TocPayloads[T]) => {
      await tocHandlers.runAction(action, undefined, tocActions, payload);
    },
    [tocActions]
  );

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
    await runTocAction('loadToc', { bookId });
  }, [bookId, runTocAction]);

  const handleGenerateToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    await runTocAction('generateToc', { bookId, variant });
  }, [bookId, runTocAction]);

  const handleSaveToc = useCallback(async (variant: 'main' | 'detailed' = 'main') => {
    await runTocAction('saveToc', {
      bookId,
      variant,
      toc: variant === 'detailed' ? detailedTocEntries : tocEntries
    });
  }, [bookId, detailedTocEntries, runTocAction, tocEntries]);

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

      await runTocAction('generateChapter', {
        bookId,
        index,
        pageStart,
        pageEnd,
        chapterNumber
      });
    },
    [bookId, manifestLength, runTocAction, showToast, tocEntries]
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
