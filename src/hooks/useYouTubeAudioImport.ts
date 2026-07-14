import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchYouTubeAudioImportStatus,
  retryYouTubeAudioImport,
  type YouTubeAudioImportStatus
} from '@/api/youtubeAudioImport';
import {
  appActions,
  selectTocWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

const ACTIVE_POLL_DELAY_MS = 2000;
const FAILED_RECHECK_LIMIT = 10;

export function useYouTubeAudioImport({
  bookId,
  chapterNumber
}: {
  bookId: string | null;
  chapterNumber: number | null;
}) {
  const dispatch = useAppDispatch();
  const { entries: tocEntries } = useAppSelector(selectTocWorkflow);
  const [status, setStatus] = useState<YouTubeAudioImportStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pollNonce, setPollNonce] = useState(0);
  const refreshedJobs = useRef(new Set<string>());

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setStatus(null);
      setLoading(false);
      setRequestError(null);
      return;
    }
    let canceled = false;
    let timer: number | null = null;
    let failedRechecks = 0;
    setLoading(true);
    setRequestError(null);

    const poll = async () => {
      try {
        const next = await fetchYouTubeAudioImportStatus(bookId, chapterNumber);
        if (canceled) {
          return;
        }
        setStatus(next);
        setRequestError(null);
        setLoading(false);
        if (next?.status === 'failed') {
          failedRechecks += 1;
        } else {
          failedRechecks = 0;
        }
        if (
          next?.status === 'queued' ||
          next?.status === 'running' ||
          next?.status === 'transcribing' ||
          next?.status === 'post-processing' ||
          (next?.status === 'failed' && failedRechecks <= FAILED_RECHECK_LIMIT)
        ) {
          timer = window.setTimeout(() => void poll(), ACTIVE_POLL_DELAY_MS);
        }
      } catch (error) {
        if (canceled) {
          return;
        }
        setLoading(false);
        const message = error instanceof Error ? error.message : 'Unable to load YouTube audio status';
        setRequestError(`${message}. Retrying…`);
        timer = window.setTimeout(() => void poll(), ACTIVE_POLL_DELAY_MS);
      }
    };

    void poll();
    return () => {
      canceled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [bookId, chapterNumber, pollNonce]);

  useEffect(() => {
    const hasUsableTranscript = Boolean(
      status?.status === 'completed' ||
      (status?.status === 'failed' && status.transcriptReady)
    );
    if (!bookId || !chapterNumber || !status || !hasUsableTranscript) {
      return;
    }
    const key = `${bookId}:${chapterNumber}:${status.jobId}`;
    if (refreshedJobs.current.has(key)) {
      return;
    }
    refreshedJobs.current.add(key);
    if (status.videoTitle?.trim()) {
      dispatch(appActions.setTocEntries(
        tocEntries.map((entry) =>
          entry.page === chapterNumber - 1
            ? { ...entry, title: status.videoTitle!.trim() }
            : entry
        )
      ));
    }
    dispatch(appActions.refreshChapterView());
  }, [bookId, chapterNumber, dispatch, status, tocEntries]);

  const retry = useCallback(async () => {
    if (!bookId || !chapterNumber || retrying) {
      return;
    }
    setRetrying(true);
    setRequestError(null);
    try {
      const next = await retryYouTubeAudioImport(bookId, chapterNumber);
      setStatus(next);
      setPollNonce((current) => current + 1);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Unable to retry YouTube audio import');
    } finally {
      setRetrying(false);
    }
  }, [bookId, chapterNumber, retrying]);

  return {
    status,
    loading,
    retrying,
    requestError,
    retry
  };
}
