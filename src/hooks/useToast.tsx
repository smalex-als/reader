import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToastMessage } from '@/types/app';

const TOAST_DURATION = 3000;

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const showToast = useCallback(
    (message: string, kind: ToastMessage['kind'] = 'info') => {
      clearTimer();
      const toastMessage: ToastMessage = {
        id: String(Date.now()),
        message,
        kind,
        expiresAt: Date.now() + TOAST_DURATION
      };
      setToast(toastMessage);
      timer.current = window.setTimeout(() => {
        setToast(null);
      }, TOAST_DURATION);
    },
    [clearTimer]
  );

  useEffect(() => dismiss, [dismiss]);

  return { toast, showToast, dismiss };
}
