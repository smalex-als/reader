import { useCallback } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { saveLastPage } from '@/lib/storage';
import type { MainView } from '@/lib/appConstants';
import type { TocEntry } from '@/types/app';

type ViewMode = 'pages' | 'scroll' | 'text' | 'audio';

interface UseDashboardNavigationOptions {
  bookId: string | null;
  setBookId: (bookId: string | null) => void;
  renderPage: (page: number) => void;
  setMainView: (view: MainView) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedUnitSetId: (id: string | null) => void;
  setSelectedUnitTopicId: (id: string | null) => void;
  setSettingsOpen: (open: boolean) => void;
  closeListeningDashboard: () => void;
}

export function useDashboardNavigation({
  bookId,
  setBookId,
  renderPage,
  setMainView,
  setViewMode,
  setSelectedUnitSetId,
  setSelectedUnitTopicId,
  setSettingsOpen,
  closeListeningDashboard
}: UseDashboardNavigationOptions) {
  const handleOpenDashboardBook = useCallback(
    (targetBookId: string) => {
      closeListeningDashboard();
      setBookId(targetBookId);
    },
    [closeListeningDashboard, setBookId]
  );

  const handleOpenDashboardChapter = useCallback(
    async (
      targetBookId: string,
      targetChapterNumber: number | null,
      _targetSubchapterTitle?: string | null,
      targetPageNumber?: number | null,
      _targetPageKeyEnd?: string | null
    ) => {
      if (!targetChapterNumber || targetChapterNumber < 1) {
        closeListeningDashboard();
        setBookId(targetBookId);
        return;
      }

      let targetPage = targetChapterNumber - 1;
      try {
        const [manifestResponse, mainResponse] = await Promise.all([
          fetchJson<{ manifest?: string[] }>(`/api/books/${encodeURIComponent(targetBookId)}/manifest`),
          fetchJson<{ toc: TocEntry[] }>(`/api/books/${encodeURIComponent(targetBookId)}/toc`)
        ]);
        const manifestEntries = Array.isArray(manifestResponse.manifest) ? manifestResponse.manifest : [];
        const tocEntries = Array.isArray(mainResponse.toc) ? mainResponse.toc : [];
        const normalizedPageNumber = Number.isInteger(targetPageNumber) ? Number(targetPageNumber) : null;
        if (
          normalizedPageNumber !== null &&
          normalizedPageNumber >= 0 &&
          normalizedPageNumber < manifestEntries.length
        ) {
          targetPage = normalizedPageNumber;
        }
        const tocEntry = tocEntries[targetChapterNumber - 1];
        if (targetPage === targetChapterNumber - 1 && tocEntry && Number.isInteger(tocEntry.page)) {
          targetPage = tocEntry.page;
        }
      } catch (error) {
        console.error(error);
      }

      saveLastPage(targetBookId, targetPage);
      closeListeningDashboard();
      if (bookId === targetBookId) {
        renderPage(targetPage);
        return;
      }
      setBookId(targetBookId);
    },
    [bookId, closeListeningDashboard, renderPage, setBookId]
  );

  const handleOpenDashboardUnit = useCallback(
    (unitSetId: string, topicId: string) => {
      closeListeningDashboard();
      setMainView('units');
      setSelectedUnitSetId(unitSetId);
      setSelectedUnitTopicId(topicId);
    },
    [closeListeningDashboard, setMainView, setSelectedUnitSetId, setSelectedUnitTopicId]
  );

  const handleOpenAudioLibrary = useCallback(() => {
    setSettingsOpen(false);
    setMainView('audio-library');
  }, [setMainView, setSettingsOpen]);

  const handleOpenLibraryBook = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      setMainView('reader');
      setViewMode('audio');
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
      }
    },
    [setBookId, setMainView, setViewMode]
  );

  const handleOpenUnitSource = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      setSelectedUnitSetId(null);
      setSelectedUnitTopicId(null);
      setMainView('reader');
      setViewMode('text');
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
        if (bookId === targetBookId) {
          renderPage(targetChapterNumber - 1);
        }
      }
    },
    [bookId, renderPage, setBookId, setMainView, setSelectedUnitSetId, setSelectedUnitTopicId, setViewMode]
  );

  return {
    handleOpenDashboardBook,
    handleOpenDashboardChapter,
    handleOpenDashboardUnit,
    handleOpenAudioLibrary,
    handleOpenLibraryBook,
    handleOpenUnitSource
  };
}
