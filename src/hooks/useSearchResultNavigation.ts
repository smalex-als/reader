import {
  appActions,
  selectBookType,
  selectReaderSession,
  selectSearchReadingPosition,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useSearchResultNavigation() {
  const dispatch = useAppDispatch();
  const { bookId, currentPage, viewMode } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const savedPosition = useAppSelector(selectSearchReadingPosition);
  const readingPosition = savedPosition?.bookId === bookId ? savedPosition : null;

  const openSearchResult = (page: number) => {
    if (!bookId) {
      return;
    }
    const resultMode = bookType === 'text' ? 'text' : viewMode === 'scroll' ? 'scroll' : 'pages';
    if (page !== currentPage || resultMode !== viewMode) {
      dispatch(appActions.saveSearchReadingPosition());
    }
    dispatch(appActions.setReaderViewMode(resultMode));
    dispatch(appActions.requestPageNavigation(page));
  };

  const returnToReading = () => {
    if (!readingPosition) {
      return;
    }
    dispatch(appActions.setReaderViewMode(readingPosition.viewMode));
    dispatch(appActions.requestPageNavigation(readingPosition.currentPage));
    dispatch(appActions.clearSearchReadingPosition());
    dispatch(appActions.closeModal('search'));
    dispatch(appActions.closeModal('tocNav'));
    dispatch(appActions.closeModal('bookmarks'));
  };

  return {
    openSearchResult,
    returnToReading,
    readingPosition,
    readingPositionLabel: readingPosition
      ? `${bookType === 'text' ? 'Chapter' : 'Page'} ${readingPosition.currentPage + 1}`
      : '',
    keepReadingHere: () => dispatch(appActions.clearSearchReadingPosition())
  };
}
