import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import { type MainView } from '@/lib/appConstants';
import {
  appActions,
  selectNavigationState,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function resolveNext<T>(next: T | ((prev: T) => T), current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useUnitsRouteState() {
  const dispatch = useAppDispatch();
  const { mainView, selectedUnitSetId, selectedUnitTopicId } = useAppSelector(selectNavigationState);

  const setMainView = useCallback(
    (next: MainView | ((prev: MainView) => MainView)) => {
      dispatch(appActions.setMainView(resolveNext(next, mainView)));
    },
    [dispatch, mainView]
  );

  const setSelectedUnitSetId = useCallback(
    (next: string | null | ((prev: string | null) => string | null)) => {
      dispatch(appActions.setSelectedUnitSetId(resolveNext(next, selectedUnitSetId)));
    },
    [dispatch, selectedUnitSetId]
  );

  const setSelectedUnitTopicId = useCallback(
    (next: string | null | ((prev: string | null) => string | null)) => {
      dispatch(appActions.setSelectedUnitTopicId(resolveNext(next, selectedUnitTopicId)));
    },
    [dispatch, selectedUnitTopicId]
  );

  return {
    mainView,
    setMainView,
    selectedUnitSetId,
    setSelectedUnitSetId,
    selectedUnitTopicId,
    setSelectedUnitTopicId
  };
}

interface UseUnitsRouteSyncOptions {
  mainView: MainView;
  setMainView: Dispatch<SetStateAction<MainView>>;
  selectedUnitSetId: string | null;
  setSelectedUnitSetId: Dispatch<SetStateAction<string | null>>;
  selectedUnitTopicId: string | null;
  setSelectedUnitTopicId: Dispatch<SetStateAction<string | null>>;
  viewMode: 'pages' | 'scroll' | 'text' | 'audio';
}

export function useUnitsRouteSync(options: UseUnitsRouteSyncOptions) {
  const {
    mainView,
    setMainView,
    selectedUnitSetId,
    setSelectedUnitSetId,
    selectedUnitTopicId,
    setSelectedUnitTopicId,
    viewMode
  } = options;

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
        setMainView((current) => (current === 'units' ? 'reader' : current));
        return;
      }
      setMainView('units');
      setSelectedUnitSetId(params.get('unit'));
      setSelectedUnitTopicId(params.get('topic'));
    };
    window.addEventListener('popstate', handleUnitsLocationChange);
    window.addEventListener('hashchange', handleUnitsLocationChange);
    return () => {
      window.removeEventListener('popstate', handleUnitsLocationChange);
      window.removeEventListener('hashchange', handleUnitsLocationChange);
    };
  }, [setMainView, setSelectedUnitSetId, setSelectedUnitTopicId]);
}
