import { useCallback, useEffect } from 'react';
import { fetchJson } from '@/lib/fetchJson';
import { saveLastPage } from '@/lib/storage';
import {
  appActions,
  selectDashboardNavigationRequest,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { TocEntry } from '@/types/app';

export function useDashboardNavigation() {
  const dispatch = useAppDispatch();
  const { bookId } = useAppSelector(selectReaderSession);
  const dashboardNavigationRequest = useAppSelector(selectDashboardNavigationRequest);
  const closeListeningDashboard = useCallback(() => {
    dispatch(appActions.closeModal('listeningDashboard'));
  }, [dispatch]);

  const setBookId = useCallback(
    (targetBookId: string | null) => {
      dispatch(appActions.setReaderBookId(targetBookId));
    },
    [dispatch]
  );

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
        dispatch(appActions.requestPageNavigation(targetPage));
        return;
      }
      setBookId(targetBookId);
    },
    [bookId, closeListeningDashboard, dispatch, setBookId]
  );

  const handleOpenDashboardUnit = useCallback(
    (unitSetId: string, topicId: string) => {
      closeListeningDashboard();
      dispatch(appActions.setMainView('units'));
      dispatch(appActions.setSelectedUnitSetId(unitSetId));
      dispatch(appActions.setSelectedUnitTopicId(topicId));
    },
    [closeListeningDashboard, dispatch]
  );

  const handleOpenAudioLibrary = useCallback(() => {
    dispatch(appActions.closeModal('settings'));
    dispatch(appActions.setMainView('audio-library'));
  }, [dispatch]);

  const handleOpenLibraryBook = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      dispatch(appActions.setMainView('reader'));
      dispatch(appActions.setReaderViewMode('audio'));
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
      }
    },
    [dispatch, setBookId]
  );

  const handleOpenUnitSource = useCallback(
    (targetBookId: string, targetChapterNumber: number) => {
      dispatch(appActions.setSelectedUnitSetId(null));
      dispatch(appActions.setSelectedUnitTopicId(null));
      dispatch(appActions.setMainView('reader'));
      dispatch(appActions.setReaderViewMode('text'));
      setBookId(targetBookId);
      if (Number.isInteger(targetChapterNumber) && targetChapterNumber > 0) {
        saveLastPage(targetBookId, targetChapterNumber - 1);
        if (bookId === targetBookId) {
          dispatch(appActions.requestPageNavigation(targetChapterNumber - 1));
        }
      }
    },
    [bookId, dispatch, setBookId]
  );

  useEffect(() => {
    if (!dashboardNavigationRequest) {
      return;
    }
    if (dashboardNavigationRequest.kind === 'dashboardBook') {
      handleOpenDashboardBook(dashboardNavigationRequest.bookId);
    } else if (dashboardNavigationRequest.kind === 'dashboardChapter') {
      void handleOpenDashboardChapter(
        dashboardNavigationRequest.bookId,
        dashboardNavigationRequest.chapterNumber,
        dashboardNavigationRequest.subchapterTitle,
        dashboardNavigationRequest.pageNumber,
        dashboardNavigationRequest.pageKeyEnd
      );
    } else if (dashboardNavigationRequest.kind === 'dashboardUnit') {
      handleOpenDashboardUnit(dashboardNavigationRequest.unitSetId, dashboardNavigationRequest.topicId);
    } else if (dashboardNavigationRequest.kind === 'audioLibraryBook') {
      handleOpenLibraryBook(dashboardNavigationRequest.bookId, dashboardNavigationRequest.chapterNumber);
    } else {
      handleOpenUnitSource(dashboardNavigationRequest.bookId, dashboardNavigationRequest.chapterNumber);
    }
    dispatch(appActions.clearDashboardNavigation());
  }, [
    dashboardNavigationRequest,
    dispatch,
    handleOpenDashboardBook,
    handleOpenDashboardChapter,
    handleOpenDashboardUnit,
    handleOpenLibraryBook,
    handleOpenUnitSource
  ]);

  return {
    handleOpenAudioLibrary
  };
}
