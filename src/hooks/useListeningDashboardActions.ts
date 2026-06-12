import { useEffect, useRef } from 'react';
import { fetchListeningDashboard } from '@/api/listeningDashboard';
import {
  appActions,
  selectListeningDashboardWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useListeningDashboardActions() {
  const dispatch = useAppDispatch();
  const { refreshRequestId } = useAppSelector(selectListeningDashboardWorkflow);
  const handledRequestRef = useRef(0);

  useEffect(() => {
    if (refreshRequestId === 0 || handledRequestRef.current === refreshRequestId) {
      return;
    }

    handledRequestRef.current = refreshRequestId;
    let cancelled = false;

    dispatch(appActions.setListeningDashboardLoading(true));
    dispatch(appActions.setListeningDashboardError(null));

    fetchListeningDashboard()
      .then((data) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setListeningDashboardData(data));
        dispatch(appActions.setListeningDashboardError(null));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(
          appActions.setListeningDashboardError(
            error instanceof Error ? error.message : 'Unable to load listening dashboard.'
          )
        );
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setListeningDashboardLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, refreshRequestId]);
}
