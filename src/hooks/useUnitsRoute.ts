import { useEffect, useState } from 'react';
import { getMainViewFromLocation, type MainView } from '@/lib/appConstants';

export function useUnitsRouteState() {
  const [mainView, setMainView] = useState<MainView>(() => getMainViewFromLocation());
  const [selectedUnitSetId, setSelectedUnitSetId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'units' ? params.get('unit') : null;
  });
  const [selectedUnitTopicId, setSelectedUnitTopicId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'units' ? params.get('topic') : null;
  });

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
  setMainView: React.Dispatch<React.SetStateAction<MainView>>;
  selectedUnitSetId: string | null;
  setSelectedUnitSetId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedUnitTopicId: string | null;
  setSelectedUnitTopicId: React.Dispatch<React.SetStateAction<string | null>>;
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
