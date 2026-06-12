import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelChapterAudioJob,
  deleteChapterAudio,
  fetchBookAudioChapters,
  fetchChapterAudioJobStatus,
  startChapterAudioJob
} from '@/api/chapterAudio';
import type {
  AudioChapter,
  ChapterAudioJobStatus,
  ChapterAudioProvider
} from '@/api/chapterAudio';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';

type ChapterStatus = {
  audioReady: boolean;
  latestVersionId: string;
  audioVersionId: string | null;
};

type AudioViewState = {
  statusMap: Record<number, ChapterStatus>;
  statusLoading: boolean;
  audioBusy: Record<number, boolean>;
  audioDeleting: Record<number, boolean>;
  errorMap: Record<number, string | null>;
  chapters: AudioChapter[];
  audioJobs: Record<number, ChapterAudioJobStatus>;
};

type AudioViewPayloads = {
  loadAudioStatus: {
    bookId: string | null;
  };
  pollAudioJobStatus: {
    bookId: string | null;
    chapterNumber: number;
  };
  generateAudio: {
    bookId: string | null;
    chapterNumber: number;
    versionId: string;
    voice: string;
    provider: ChapterAudioProvider;
  };
  cancelAudioJob: {
    bookId: string | null;
    chapterNumber: number;
  };
  deleteAudio: {
    bookId: string | null;
    chapterNumber: number;
    versionId: string;
  };
};

type AudioViewActions = {
  applyChapters: (chapters: AudioChapter[]) => void;
  resetAudioStatus: () => void;
  setStatusLoading: (loading: boolean) => void;
  setAudioBusy: (chapterNumber: number, busy: boolean) => void;
  setAudioDeleting: (chapterNumber: number, deleting: boolean) => void;
  setChapterError: (chapterNumber: number, message: string | null) => void;
  setRequestError: (message: string | null) => void;
  setAudioJob: (chapterNumber: number, job: ChapterAudioJobStatus) => void;
  removeAudioJob: (chapterNumber: number) => void;
  markChapterAudioDeleted: (chapterNumber: number, versionId: string) => void;
  clearPoll: (chapterNumber: number) => void;
  schedulePoll: (chapterNumber: number) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
};

const audioViewHandlers = createActionHandlerRegistry<
  AudioViewState,
  AudioViewActions,
  AudioViewPayloads
>();
const { addActionHandler } = audioViewHandlers;

function getChapterStatusMap(chapters: AudioChapter[]) {
  const nextStatus: Record<number, ChapterStatus> = {};
  chapters.forEach((chapter) => {
    nextStatus[chapter.chapterNumber] = {
      audioReady: Boolean(chapter.audio?.ready),
      latestVersionId: chapter.latestVersionId ?? 'base',
      audioVersionId: chapter.audio?.versionId ?? null
    };
  });
  return nextStatus;
}

addActionHandler('loadAudioStatus', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    actions.resetAudioStatus();
    return;
  }

  await runRequest({
    setBusy: actions.setStatusLoading,
    setError: actions.setRequestError,
    fallbackError: 'Unable to load audio status.',
    request: () => fetchBookAudioChapters(payload.bookId!),
    onSuccess: actions.applyChapters,
    onError: (error) => {
      actions.showError(error instanceof Error ? error.message : 'Unable to load audio status.');
    }
  });
});

addActionHandler('pollAudioJobStatus', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }

  try {
    const job = await fetchChapterAudioJobStatus(payload.bookId, payload.chapterNumber);
    if (!job?.status) {
      actions.clearPoll(payload.chapterNumber);
      return;
    }
    actions.setAudioJob(payload.chapterNumber, job);
    if (job.status === 'completed') {
      actions.clearPoll(payload.chapterNumber);
      const chapters = await fetchBookAudioChapters(payload.bookId);
      actions.applyChapters(chapters);
      return;
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      actions.clearPoll(payload.chapterNumber);
      return;
    }
    actions.schedulePoll(payload.chapterNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read audio job status.';
    actions.setChapterError(payload.chapterNumber, message);
    actions.schedulePoll(payload.chapterNumber);
  }
});

addActionHandler('generateAudio', async (state, actions, payload): Promise<void> => {
  if (!payload.bookId || state.audioBusy[payload.chapterNumber]) {
    return;
  }

  actions.setAudioBusy(payload.chapterNumber, true);
  actions.setChapterError(payload.chapterNumber, null);
  try {
    const job = await startChapterAudioJob({
      bookId: payload.bookId,
      chapterNumber: payload.chapterNumber,
      versionId: payload.versionId,
      voice: payload.voice,
      provider: payload.provider
    });
    if (job?.status) {
      actions.setAudioJob(payload.chapterNumber, job);
    } else {
      actions.showSuccess(`Audio job queued for chapter ${payload.chapterNumber}`);
    }
    actions.schedulePoll(payload.chapterNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate audio.';
    actions.setChapterError(payload.chapterNumber, message);
  } finally {
    actions.setAudioBusy(payload.chapterNumber, false);
  }
});

addActionHandler('cancelAudioJob', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId) {
    return;
  }

  actions.clearPoll(payload.chapterNumber);
  try {
    const job = await cancelChapterAudioJob(payload.bookId, payload.chapterNumber);
    actions.setAudioJob(payload.chapterNumber, job);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel audio job.';
    actions.setChapterError(payload.chapterNumber, message);
  }
});

addActionHandler('deleteAudio', async (state, actions, payload): Promise<void> => {
  if (!payload.bookId || state.audioDeleting[payload.chapterNumber]) {
    return;
  }

  actions.setAudioDeleting(payload.chapterNumber, true);
  actions.setChapterError(payload.chapterNumber, null);
  try {
    await deleteChapterAudio({
      bookId: payload.bookId,
      chapterNumber: payload.chapterNumber,
      versionId: payload.versionId
    });
    actions.removeAudioJob(payload.chapterNumber);
    actions.markChapterAudioDeleted(payload.chapterNumber, payload.versionId);
    actions.showSuccess(`Deleted MP3 for chapter ${payload.chapterNumber}`);
    const chapters = await fetchBookAudioChapters(payload.bookId);
    actions.applyChapters(chapters);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete audio.';
    actions.setChapterError(payload.chapterNumber, message);
  } finally {
    actions.setAudioDeleting(payload.chapterNumber, false);
  }
});

export function useAudioViewActions(input: {
  bookId: string | null;
  canLoadAudioStatus: boolean;
  mp3Voice: string;
}) {
  const { showToast } = useToast();
  const pollTimers = useRef<Map<number, number>>(new Map());
  const pollAttempts = useRef<Map<number, number>>(new Map());
  const pollAudioJobStatusRef = useRef<(chapterNumber: number) => void>();
  const [statusMap, setStatusMap] = useState<Record<number, ChapterStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [audioBusy, setAudioBusyState] = useState<Record<number, boolean>>({});
  const [audioDeleting, setAudioDeletingState] = useState<Record<number, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({});
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [audioJobs, setAudioJobs] = useState<Record<number, ChapterAudioJobStatus>>({});
  const state = useMemo(
    () => ({
      statusMap,
      statusLoading,
      audioBusy,
      audioDeleting,
      errorMap,
      chapters,
      audioJobs
    }),
    [audioBusy, audioDeleting, audioJobs, chapters, errorMap, statusLoading, statusMap]
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearPoll = useCallback((chapterNumber: number) => {
    const timer = pollTimers.current.get(chapterNumber);
    if (timer) {
      window.clearTimeout(timer);
    }
    pollTimers.current.delete(chapterNumber);
    pollAttempts.current.delete(chapterNumber);
  }, []);

  const schedulePoll = useCallback((chapterNumber: number) => {
    const attempt = (pollAttempts.current.get(chapterNumber) ?? 0) + 1;
    pollAttempts.current.set(chapterNumber, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      pollAudioJobStatusRef.current?.(chapterNumber);
    }, delay);
    pollTimers.current.set(chapterNumber, timer);
  }, []);

  const actions = useMemo<AudioViewActions>(
    () => ({
      applyChapters: (nextChapters) => {
        setChapters(nextChapters);
        setStatusMap(getChapterStatusMap(nextChapters));
      },
      resetAudioStatus: () => {
        setChapters([]);
        setStatusMap({});
        setStatusLoading(false);
        setAudioJobs({});
      },
      setStatusLoading,
      setAudioBusy: (chapterNumber, busy) => {
        setAudioBusyState((prev) => ({ ...prev, [chapterNumber]: busy }));
      },
      setAudioDeleting: (chapterNumber, deleting) => {
        setAudioDeletingState((prev) => ({ ...prev, [chapterNumber]: deleting }));
      },
      setChapterError: (chapterNumber, message) => {
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      },
      setRequestError: () => undefined,
      setAudioJob: (chapterNumber, job) => {
        setAudioJobs((prev) => ({
          ...prev,
          [chapterNumber]: job
        }));
      },
      removeAudioJob: (chapterNumber) => {
        setAudioJobs((prev) => {
          const next = { ...prev };
          delete next[chapterNumber];
          return next;
        });
      },
      markChapterAudioDeleted: (chapterNumber, versionId) => {
        setStatusMap((prev) => ({
          ...prev,
          [chapterNumber]: {
            ...(prev[chapterNumber] ?? { latestVersionId: versionId }),
            audioReady: false,
            audioVersionId: null
          }
        }));
        setChapters((prev) =>
          prev.map((chapter) =>
            chapter.chapterNumber === chapterNumber
              ? {
                  ...chapter,
                  audio: {
                    ...chapter.audio,
                    ready: false,
                    url: '',
                    versionId: null,
                    durationSeconds: null,
                    subchapters: []
                  }
                }
              : chapter
          )
        );
      },
      clearPoll,
      schedulePoll,
      showError: (message) => showToast(message, 'error'),
      showSuccess: (message) => showToast(message, 'success')
    }),
    [clearPoll, schedulePoll, showToast]
  );

  const runAction = useCallback(
    async <T extends keyof AudioViewPayloads>(action: T, payload: AudioViewPayloads[T]) => {
      await audioViewHandlers.runAction(action, stateRef.current, actions, payload);
    },
    [actions]
  );

  const loadAudioStatus = useCallback(
    () => runAction('loadAudioStatus', { bookId: input.bookId }),
    [input.bookId, runAction]
  );

  const pollAudioJobStatus = useCallback(
    (chapterNumber: number) =>
      runAction('pollAudioJobStatus', {
        bookId: input.bookId,
        chapterNumber
      }),
    [input.bookId, runAction]
  );

  useEffect(() => {
    pollAudioJobStatusRef.current = (chapterNumber) => {
      void pollAudioJobStatus(chapterNumber);
    };
  }, [pollAudioJobStatus]);

  useEffect(() => {
    if (!input.bookId || !input.canLoadAudioStatus) {
      void runAction('loadAudioStatus', { bookId: null });
      return;
    }
    void loadAudioStatus();
  }, [input.bookId, input.canLoadAudioStatus, loadAudioStatus, runAction]);

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => window.clearTimeout(timer));
      pollTimers.current.clear();
      pollAttempts.current.clear();
    };
  }, []);

  return {
    statusMap,
    statusLoading,
    audioBusy,
    audioDeleting,
    errorMap,
    chapters,
    audioJobs,
    generateAudio: useCallback(
      (payload: {
        chapterNumber: number;
        versionId: string;
        provider: ChapterAudioProvider;
      }) =>
        runAction('generateAudio', {
          bookId: input.bookId,
          chapterNumber: payload.chapterNumber,
          versionId: payload.versionId,
          voice: input.mp3Voice,
          provider: payload.provider
        }),
      [input.bookId, input.mp3Voice, runAction]
    ),
    cancelAudioJob: useCallback(
      (chapterNumber: number) =>
        runAction('cancelAudioJob', {
          bookId: input.bookId,
          chapterNumber
        }),
      [input.bookId, runAction]
    ),
    deleteAudio: useCallback(
      (payload: { chapterNumber: number; versionId: string }) =>
        runAction('deleteAudio', {
          bookId: input.bookId,
          chapterNumber: payload.chapterNumber,
          versionId: payload.versionId
        }),
      [input.bookId, runAction]
    )
  };
}
