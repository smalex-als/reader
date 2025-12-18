import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'error';

export interface OcrJob {
  id: string;
  pageIndex: number;
  imageUrl: string;
  status: OcrJobStatus;
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
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function createJobId(counter: number) {
  return `ocr-${Date.now()}-${counter}`;
}

async function requestPageText(imageUrl: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ image: imageUrl });
  const response = await fetch(`/api/page-text?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

export function useOcrQueue({ manifest, showToast }: UseOcrQueueOptions) {
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [paused, setPaused] = useState(false);
  const idCounterRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wasBusyRef = useRef(false);

  const enqueuePages = useCallback(
    (pages: number[]) => {
      if (!manifest.length) {
        return;
      }
      setJobs((prev) => {
        const existing = new Set(prev.map((job) => job.imageUrl));
        const next = [...prev];
        pages.forEach((pageIndex) => {
          const imageUrl = manifest[pageIndex];
          if (!imageUrl || existing.has(imageUrl)) {
            return;
          }
          idCounterRef.current += 1;
          next.push({
            id: createJobId(idCounterRef.current),
            pageIndex,
            imageUrl,
            status: 'pending'
          });
          existing.add(imageUrl);
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
        await requestPageText(nextJob.imageUrl, controller.signal);
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
    enqueuePages,
    clearQueue,
    resetQueue,
    retryFailed,
    togglePause
  };
}
