import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/useToast';

export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'error';

export interface OcrJob {
  id: string;
  pageIndex: number;
  imageUrl: string;
  status: OcrJobStatus;
  force?: boolean;
  error?: string;
}

interface OcrQueueProgress {
  total: number;
  processed: number;
  completed: number;
  failed: number;
  running: boolean;
  pending: number;
}

interface UseOcrQueueOptions {
  manifest: string[];
  currentPage: number;
}

function createJobId(counter: number) {
  return `ocr-${Date.now()}-${counter}`;
}

async function requestPageText(imageUrl: string, options: { signal?: AbortSignal; force?: boolean } = {}) {
  const params = new URLSearchParams({ image: imageUrl });
  if (options.force) {
    params.set('skipCache', '1');
  }
  const response = await fetch(`/api/page-text?${params.toString()}`, { signal: options.signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export function useOcrQueue({ manifest, currentPage }: UseOcrQueueOptions) {
  const { showToast } = useToast();
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

  const queueState = useMemo(
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
      try {
        await requestPageText(nextJob.imageUrl, {
          signal: controller.signal,
          force: nextJob.force
        });
        setJobs((prev) =>
          prev.map((job) => (job.id === nextJob.id ? { ...job, status: 'completed' } : job))
        );
      } catch (error) {
        if (controller.signal.aborted) {
          setJobs((prev) =>
            prev.map((job) => (job.id === nextJob.id ? { ...job, status: 'pending' } : job))
          );
        } else {
          const message = error instanceof Error ? error.message : 'Request failed';
          setJobs((prev) =>
            prev.map((job) =>
              job.id === nextJob.id ? { ...job, status: 'error', error: message } : job
            )
          );
        }
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
