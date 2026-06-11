import { useCallback, useEffect, useRef } from 'react';
import {
  appActions,
  selectToast,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ToastMessage } from '@/types/app';

const TOAST_DURATION = 3000;

export function useToast() {
  const dispatch = useAppDispatch();
  const toast = useAppSelector(selectToast);
  const timer = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    dispatch(appActions.dismissToast());
  }, [clearTimer, dispatch]);

  const showToast = useCallback(
    (message: string, kind: ToastMessage['kind'] = 'info') => {
      clearTimer();
      const toastMessage: ToastMessage = {
        id: String(Date.now()),
        message,
        kind,
        expiresAt: Date.now() + TOAST_DURATION
      };
      dispatch(appActions.showToast(toastMessage));
      timer.current = window.setTimeout(() => {
        dispatch(appActions.dismissToast());
      }, TOAST_DURATION);
    },
    [clearTimer, dispatch]
  );

  useEffect(() => dismiss, [dismiss]);

  return { toast, showToast, dismiss };
}
