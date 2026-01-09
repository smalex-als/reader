import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    const releaseLock = async () => {
      if (!wakeLockRef.current) {
        return;
      }
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore release errors
      } finally {
        wakeLockRef.current = null;
      }
    };

    const requestLock = async () => {
      if (!enabled || cancelled) {
        return;
      }
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (!('wakeLock' in navigator)) {
        return;
      }
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // ignore wake lock errors
      }
    };

    const handleVisibility = () => {
      if (!enabled) {
        return;
      }
      if (!wakeLockRef.current && document.visibilityState === 'visible') {
        void requestLock();
      }
    };

    if (enabled) {
      void requestLock();
      document.addEventListener('visibilitychange', handleVisibility);
    } else {
      void releaseLock();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      void releaseLock();
    };
  }, [enabled]);
}
