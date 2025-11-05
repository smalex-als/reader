import { useCallback, useEffect, useState } from 'react';

export function useFullscreen(target: React.RefObject<HTMLElement>) {
  const [isFullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    function handleChange() {
      const element = document.fullscreenElement;
      const current = Boolean(element && (element === target.current || element.contains(target.current ?? null)));
      setFullscreen(current);
    }

    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [target]);

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

  return { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen, setFullscreen };
}
