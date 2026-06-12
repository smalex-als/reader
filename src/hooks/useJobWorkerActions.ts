import { useEffect, useRef } from 'react';
import { fetchJobWorkerJobs } from '@/api/jobs';
import {
  appActions,
  selectJobWorkerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

export function useJobWorkerActions() {
  const dispatch = useAppDispatch();
  const { refreshRequestId } = useAppSelector(selectJobWorkerWorkflow);
  const handledRequestRef = useRef(0);

  useEffect(() => {
    if (refreshRequestId === 0 || handledRequestRef.current === refreshRequestId) {
      return;
    }

    handledRequestRef.current = refreshRequestId;
    let cancelled = false;

    dispatch(appActions.setJobWorkerLoading(true));
    dispatch(appActions.setJobWorkerError(null));

    fetchJobWorkerJobs()
      .then((jobs) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setJobWorkerJobs(jobs));
        dispatch(appActions.setJobWorkerError(null));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setJobWorkerError(error instanceof Error ? error.message : String(error)));
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setJobWorkerLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, refreshRequestId]);
}
