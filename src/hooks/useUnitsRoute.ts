import { useEffect } from 'react';
import {
  appActions,
  selectNavigationState,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useUnitsRouteState() {
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);

  return {
    mainView,
    selectedUnitSetId,
    selectedUnitTopicId
  };
}

export function useUnitsRouteSync() {
  const dispatch = useAppDispatch();
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);
  const { viewMode } = useAppSelector(selectReaderSession);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (mainView === 'units') {
      params.set('view', 'units');
      params.delete('book');
      params.delete('page');
      if (selectedUnitSetId) {
        params.set('unit', selectedUnitSetId);
      } else {
        params.delete('unit');
      }
      if (selectedUnitSetId && selectedUnitTopicId) {
        params.set('topic', selectedUnitTopicId);
      } else {
        params.delete('topic');
      }
    } else {
      params.delete('unit');
      params.delete('topic');
      if (params.get('view') === 'units') {
        params.set('view', viewMode);
      }
    }
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [mainView, selectedUnitSetId, selectedUnitTopicId, viewMode]);

  useEffect(() => {
    const handleUnitsLocationChange = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') !== 'units') {
        if (mainView === 'units') {
          dispatch(appActions.setMainView('reader'));
        }
        return;
      }
      dispatch(appActions.setMainView('units'));
      dispatch(appActions.setSelectedUnitSetId(params.get('unit')));
      dispatch(appActions.setSelectedUnitTopicId(params.get('topic')));
    };
    window.addEventListener('popstate', handleUnitsLocationChange);
    window.addEventListener('hashchange', handleUnitsLocationChange);
    return () => {
      window.removeEventListener('popstate', handleUnitsLocationChange);
      window.removeEventListener('hashchange', handleUnitsLocationChange);
    };
  }, [dispatch, mainView]);
}
