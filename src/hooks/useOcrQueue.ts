import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requestOcrPageText } from '@/api/ocrQueue';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import {
  appActions,
  selectBookManifest,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { OcrJob, OcrQueueState } from '@/types/app';

interface OcrQueueProgress {
  total: number;
  processed: number;
  completed: number;
  failed: number;
  running: boolean;
  pending: number;
}

function createJobId(counter: number) {
  return `ocr-${Date.now()}-${counter}`;
}

type OcrQueuePayloads = {
  processJob: {
    job: OcrJob;
    signal: AbortSignal;
  };
};

type OcrQueueActions = {
  completeJob: (jobId: string) => void;
  requeueJob: (jobId: string) => void;
  failJob: (jobId: string, error: string) => void;
};

const ocrQueueHandlers = createActionHandlerRegistry<unknown, OcrQueueActions, OcrQueuePayloads>();
const { addActionHandler } = ocrQueueHandlers;

addActionHandler('processJob', async (_state, actions, payload): Promise<void> => {
  try {
    await requestOcrPageText({
      imageUrl: payload.job.imageUrl,
      signal: payload.signal,
      force: payload.job.force
    });
    actions.completeJob(payload.job.id);
  } catch (error) {
    if (payload.signal.aborted) {
      actions.requeueJob(payload.job.id);
      return;
    }
    const message = error instanceof Error ? error.message : 'Request failed';
    actions.failJob(payload.job.id, message);
  }
});

export function useOcrQueue() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [paused, setPaused] = useState(false);
  const idCounterRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wasBusyRef = useRef(false);

  const enqueuePages = useCallback(
    (pages: number[], options: { force?: boolean } = {}) => {
      if (!manifest.length) {
        return;
      }
      const { force = false } = options;
      setJobs((prev) => {
        const next = [...prev];
        const existingByImage = new Map(next.map((job, index) => [job.imageUrl, index]));
        pages.forEach((pageIndex) => {
          const imageUrl = manifest[pageIndex];
          if (!imageUrl) {
            return;
          }
          const existingIndex = existingByImage.get(imageUrl);
          if (existingIndex !== undefined) {
            if (!force) {
              return;
            }
            next[existingIndex] = {
              ...next[existingIndex],
              status: 'pending',
              error: undefined,
              force: true
            };
            return;
          }
          idCounterRef.current += 1;
          next.push({
            id: createJobId(idCounterRef.current),
            pageIndex,
            imageUrl,
            status: 'pending',
            force
          });
          existingByImage.set(imageUrl, next.length - 1);
        });
        return next;
      });
    },
    [manifest]
  );

  const clearQueue = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    activeJobIdRef.current = null;
    setJobs([]);
    setPaused(false);
  }, []);

  const resetQueue = useCallback(() => {
    clearQueue();
  }, [clearQueue]);

  useEffect(() => {
    resetQueue();
    dispatch(appActions.closeModal('ocrQueue'));
  }, [bookId, dispatch, resetQueue]);

  const retryFailed = useCallback(() => {
    setJobs((prev) =>
      prev.map((job) =>
        job.status === 'error' ? { ...job, status: 'pending', error: undefined } : job
      )
    );
  }, []);

  const togglePause = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) {
        abortRef.current?.abort();
      }
      return next;
    });
  }, []);

  const progress = useMemo<OcrQueueProgress>(() => {
    const total = jobs.length;
    const completed = jobs.filter((job) => job.status === 'completed').length;
    const failed = jobs.filter((job) => job.status === 'error').length;
    const pending = jobs.filter((job) => job.status === 'pending').length;
    const running = jobs.some((job) => job.status === 'running');
    const processed = completed + failed;
    return { total, processed, completed, failed, running, pending };
  }, [jobs]);

  const queueAllPages = useCallback(() => {
    const pages = manifest.map((_, index) => index);
    enqueuePages(pages);
  }, [enqueuePages, manifest]);

  const forceUpdateAllPages = useCallback(() => {
    const pages = manifest.map((_, index) => index);
    enqueuePages(pages, { force: true });
  }, [enqueuePages, manifest]);

  const queueRemainingPages = useCallback(() => {
    const pages = manifest.map((_, index) => index).filter((index) => index >= currentPage);
    enqueuePages(pages);
  }, [currentPage, enqueuePages, manifest]);

  const queueState = useMemo<OcrQueueState>(
    () => ({
      total: progress.total,
      processed: progress.processed,
      failed: progress.failed,
      running: progress.running,
      paused
    }),
    [paused, progress]
  );

  useEffect(() => {
    dispatch(appActions.setOcrQueueSnapshot({
      jobs,
      paused,
      queueState
    }));
  }, [dispatch, jobs, paused, queueState]);

  useEffect(() => {
    const busy = progress.pending > 0 || progress.running;
    if (wasBusyRef.current && !busy && progress.total > 0) {
      const message =
        progress.failed > 0
          ? `Batch OCR finished with ${progress.failed} failed page${progress.failed === 1 ? '' : 's'}.`
          : 'Batch OCR complete.';
      showToast(message, progress.failed > 0 ? 'error' : 'success');
    }
    wasBusyRef.current = busy;
  }, [progress.failed, progress.pending, progress.running, progress.total, showToast]);

  useEffect(() => {
    if (paused || activeJobIdRef.current) {
      return;
    }
    const nextJob = jobs.find((job) => job.status === 'pending');
    if (!nextJob) {
      return;
    }
    activeJobIdRef.current = nextJob.id;
    setJobs((prev) =>
      prev.map((job) => (job.id === nextJob.id ? { ...job, status: 'running' } : job))
    );
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      const actions: OcrQueueActions = {
        completeJob: (jobId) => {
          setJobs((prev) =>
            prev.map((job) => (job.id === jobId ? { ...job, status: 'completed' } : job))
          );
        },
        requeueJob: (jobId) => {
          setJobs((prev) =>
            prev.map((job) => (job.id === jobId ? { ...job, status: 'pending' } : job))
          );
        },
        failJob: (jobId, error) => {
          setJobs((prev) =>
            prev.map((job) => (job.id === jobId ? { ...job, status: 'error', error } : job))
          );
        }
      };
      try {
        await ocrQueueHandlers.runAction('processJob', undefined, actions, {
          job: nextJob,
          signal: controller.signal
        });
      } finally {
        activeJobIdRef.current = null;
        abortRef.current = null;
      }
    })();
  }, [jobs, paused]);

  return {
    jobs,
    paused,
    progress,
    queueState,
    enqueuePages,
    queueAllPages,
    forceUpdateAllPages,
    queueRemainingPages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  };
}
