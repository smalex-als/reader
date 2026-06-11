import { useCallback, useEffect } from 'react';
import {
  appActions,
  selectFullscreen,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useFullscreen(target: React.RefObject<HTMLElement>) {
  const dispatch = useAppDispatch();
  const isFullscreen = useAppSelector(selectFullscreen);

  useEffect(() => {
    function handleChange() {
      const element = document.fullscreenElement;
      const current = Boolean(element && (element === target.current || element.contains(target.current ?? null)));
      dispatch(appActions.setFullscreen(current));
    }

    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [dispatch, target]);

  const enterFullscreen = useCallback(async () => {
    if (!target.current) return;
    if (document.fullscreenElement) {
      return;
    }
    await target.current.requestFullscreen();
  }, [target]);

  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) return;
    await document.exitFullscreen();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [enterFullscreen, exitFullscreen, isFullscreen]);

  return { isFullscreen, toggleFullscreen };
}
