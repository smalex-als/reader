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
  ChapterAudioJobStatus
} from '@/api/chapterAudio';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  AudioJobPollingController,
  type AudioJobPollContext
} from '@/lib/audioJobPollingController';
import type { ChapterAudioProvider } from '@/types/app';

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
  schedulePoll: (chapterNumber: number, bookId: string) => void;
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
    actions.schedulePoll(payload.chapterNumber, payload.bookId);
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
  const pollAudioJobStatusRef = useRef<(
    chapterNumber: number,
    context: AudioJobPollContext
  ) => Promise<boolean>>();
  const pollingControllerRef = useRef<AudioJobPollingController>();
  if (!pollingControllerRef.current) {
    pollingControllerRef.current = new AudioJobPollingController({
      scheduler: {
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timer) => window.clearTimeout(timer as number)
      },
      poll: (chapterNumber, context) =>
        pollAudioJobStatusRef.current?.(chapterNumber, context) ?? Promise.resolve(false)
    });
  }
  const pollingController = pollingControllerRef.current;
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
      clearPoll: (chapterNumber) => pollingController.clear(chapterNumber),
      schedulePoll: (chapterNumber, bookId) => pollingController.schedule(chapterNumber, bookId),
      showError: (message) => showToast(message, 'error'),
      showSuccess: (message) => showToast(message, 'success')
    }),
    [pollingController, showToast]
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

  const pollAudioJobStatus = useCallback(async (
    chapterNumber: number,
    context: AudioJobPollContext
  ) => {
    const bookId = input.bookId;
    if (!bookId) {
      return false;
    }
    try {
      const job = await fetchChapterAudioJobStatus(bookId, chapterNumber);
      if (!context.isCurrent()) {
        return false;
      }
      if (!job?.status) {
        return false;
      }
      actions.setAudioJob(chapterNumber, job);
      if (job.status === 'completed') {
        const nextChapters = await fetchBookAudioChapters(bookId);
        if (context.isCurrent()) {
          actions.applyChapters(nextChapters);
        }
        return false;
      }
      return job.status !== 'failed' && job.status !== 'canceled';
    } catch (error) {
      if (!context.isCurrent()) {
        return false;
      }
      const message = error instanceof Error ? error.message : 'Unable to read audio job status.';
      actions.setChapterError(chapterNumber, message);
      return true;
    }
  }, [actions, input.bookId]);

  useEffect(() => {
    pollAudioJobStatusRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  useEffect(() => {
    pollingController.mount();
    return () => pollingController.dispose();
  }, [pollingController]);

  useEffect(() => {
    pollingController.setScope(input.bookId);
    pollingController.reset();
    if (!input.bookId || !input.canLoadAudioStatus) {
      void runAction('loadAudioStatus', { bookId: null });
      return;
    }
    void loadAudioStatus();
  }, [input.bookId, input.canLoadAudioStatus, loadAudioStatus, pollingController, runAction]);

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
