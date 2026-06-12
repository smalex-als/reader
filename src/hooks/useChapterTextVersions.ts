import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  cancelChapterVersionAudio,
  createChapterTextVersion,
  deleteChapterTextVersion,
  deleteChapterVersionAudio,
  fetchChapterText,
  fetchChapterTextVersions,
  fetchChapterVersionAudioStatus,
  fetchChapterVersionText,
  generateChapterText,
  startChapterVersionAudio,
  type ChapterTextVersionsResult
} from '@/api/chapterTextVersions';
import type { ChapterAudioJobStatus } from '@/api/chapterAudio';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import {
  appActions,
  selectRefreshTokens,
  selectTextVersionModalWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ChapterAudioProvider, ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

type AudioJobStatus = ChapterAudioJobStatus;

type ChapterTextVersionPayloads = {
  loadChapterText: {
    bookId: string;
    chapterNumber: number;
  };
  loadTextVersions: {
    bookId: string;
    chapterNumber: number;
  };
  loadVersionText: {
    file: string;
    versionId: string;
  };
  loadAudioStatus: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  pollAudioJobStatus: {
    bookId: string;
    chapterNumber: number;
  };
  generateChapterText: {
    bookId: string;
    chapterNumber: number;
    pageStart: number;
    pageEnd: number;
  };
  generateAudio: {
    bookId: string;
    chapterNumber: number;
    voice: string;
    versionId: string;
    provider: ChapterAudioProvider;
    force: boolean;
  };
  createVersion: {
    bookId: string;
    chapterNumber: number;
    promptId: string | null;
    sourceVersionId: string;
    model: string;
    customPrompt: string;
    addToLibrary: boolean;
    promptName: string;
  };
  deleteVersion: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  cancelAudioJob: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  deleteAudio: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
};

type ChapterTextVersionActions = {
  setChapterLoading: (loading: boolean) => void;
  setVersionLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setAudioGenerating: (generating: boolean) => void;
  setAudioDeleting: (deleting: boolean) => void;
  setVersionSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setVersionError: (error: string | null) => void;
  setAudioError: (error: string | null) => void;
  setVersionStatus: (status: string | null) => void;
  setMissingFile: (file: string | null) => void;
  setChapterText: (text: string) => void;
  setSelectedText: (text: string) => void;
  setSelectedTextVersionId: (versionId: string | null) => void;
  applyTextVersions: (result: ChapterTextVersionsResult, mode: 'load' | 'create' | 'delete') => void;
  applyAudioStatus: (job: AudioJobStatus | null, currentVersionId: string) => void;
  setAudioJob: (job: AudioJobStatus | null) => void;
  clearAudioPoll: () => void;
  scheduleAudioPoll: (chapterNumber: number) => void;
  refreshChapter: () => void;
  reloadAudioStatus: () => Promise<void>;
  resetTextVersionDraft: () => void;
  markAudioDeleted: () => void;
  setCreateVersionSucceeded: (succeeded: boolean) => void;
};

const chapterTextVersionHandlers = createActionHandlerRegistry<
  null,
  ChapterTextVersionActions,
  ChapterTextVersionPayloads
>();
const { addActionHandler } = chapterTextVersionHandlers;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getMissingFile(error: unknown) {
  return error instanceof Error ? (error as Error & { missingFile?: string }).missingFile ?? null : null;
}

function normalizeVersionSelection(result: ChapterTextVersionsResult, fallback = 'base') {
  return result.createdVersionId ?? result.latestVersionId ?? result.versions[result.versions.length - 1]?.id ?? fallback;
}

addActionHandler('loadChapterText', async (_state, actions, payload): Promise<void> => {
  actions.setChapterLoading(true);
  actions.setError(null);
  actions.setMissingFile(null);
  try {
    actions.setChapterText(await fetchChapterText(payload.bookId, payload.chapterNumber));
  } catch (error) {
    actions.setChapterText('');
    actions.setMissingFile(getMissingFile(error));
    actions.setError(getErrorMessage(error, 'Unable to load chapter text.'));
  } finally {
    actions.setChapterLoading(false);
  }
});

addActionHandler('loadTextVersions', async (_state, actions, payload): Promise<void> => {
  actions.setVersionLoading(true);
  actions.setVersionError(null);
  try {
    actions.applyTextVersions(await fetchChapterTextVersions(payload.bookId, payload.chapterNumber), 'load');
  } catch (error) {
    actions.applyTextVersions({ latestVersionId: null, versions: [], promptLibrary: [] }, 'load');
    actions.setVersionError(getErrorMessage(error, 'Unable to load chapter text versions.'));
  } finally {
    actions.setVersionLoading(false);
  }
});

addActionHandler('loadVersionText', async (_state, actions, payload): Promise<void> => {
  actions.setVersionError(null);
  actions.setVersionLoading(true);
  actions.setSelectedText('');
  actions.setSelectedTextVersionId(null);
  try {
    actions.setSelectedText(await fetchChapterVersionText(payload.file));
    actions.setSelectedTextVersionId(payload.versionId);
  } catch (error) {
    actions.setSelectedText('');
    actions.setSelectedTextVersionId(null);
    actions.setVersionError(getErrorMessage(error, 'Unable to load chapter text version.'));
  } finally {
    actions.setVersionLoading(false);
  }
});

addActionHandler('loadAudioStatus', async (_state, actions, payload): Promise<void> => {
  try {
    const job = await fetchChapterVersionAudioStatus(payload);
    actions.applyAudioStatus(job, payload.versionId);
  } catch (error) {
    console.warn('Failed to load chapter audio status', error);
  }
});

addActionHandler('pollAudioJobStatus', async (_state, actions, payload): Promise<void> => {
  try {
    const job = await fetchChapterVersionAudioStatus(payload);
    if (!job?.status) {
      actions.clearAudioPoll();
      return;
    }
    actions.setAudioJob(job);
    if (job.status === 'completed') {
      actions.clearAudioPoll();
      await actions.reloadAudioStatus();
      return;
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      actions.clearAudioPoll();
      return;
    }
    actions.scheduleAudioPoll(payload.chapterNumber);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to poll audio status.'));
    actions.scheduleAudioPoll(payload.chapterNumber);
  }
});

addActionHandler('generateChapterText', async (_state, actions, payload): Promise<void> => {
  actions.setGenerating(true);
  actions.setError(null);
  try {
    await generateChapterText(payload);
    actions.refreshChapter();
  } catch (error) {
    actions.setError(getErrorMessage(error, 'Unable to generate chapter text.'));
  } finally {
    actions.setGenerating(false);
  }
});

addActionHandler('generateAudio', async (_state, actions, payload): Promise<void> => {
  actions.setAudioGenerating(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    const job = await startChapterVersionAudio(payload);
    if (job?.status) {
      actions.setAudioJob(job);
    } else {
      actions.setVersionStatus('Audio job queued.');
    }
    actions.scheduleAudioPoll(payload.chapterNumber);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to generate chapter audio.'));
  } finally {
    actions.setAudioGenerating(false);
  }
});

addActionHandler('createVersion', async (_state, actions, payload): Promise<void> => {
  actions.setVersionSaving(true);
  actions.setCreateVersionSucceeded(false);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    actions.applyTextVersions(await createChapterTextVersion(payload), 'create');
    actions.setVersionStatus('Version saved.');
    actions.resetTextVersionDraft();
    await actions.reloadAudioStatus();
    actions.setCreateVersionSucceeded(true);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to create chapter text version.'));
  } finally {
    actions.setVersionSaving(false);
  }
});

addActionHandler('deleteVersion', async (_state, actions, payload): Promise<void> => {
  actions.setVersionSaving(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    actions.applyTextVersions(await deleteChapterTextVersion(payload), 'delete');
    actions.setVersionStatus('Version deleted.');
    await actions.reloadAudioStatus();
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to delete chapter text version.'));
  } finally {
    actions.setVersionSaving(false);
  }
});

addActionHandler('cancelAudioJob', async (_state, actions, payload): Promise<void> => {
  actions.clearAudioPoll();
  try {
    actions.setAudioJob(await cancelChapterVersionAudio(payload.bookId, payload.chapterNumber, payload.versionId));
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to cancel chapter audio.'));
  }
});

addActionHandler('deleteAudio', async (_state, actions, payload): Promise<void> => {
  actions.setAudioDeleting(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    await deleteChapterVersionAudio(payload);
    actions.markAudioDeleted();
    actions.setVersionStatus('MP3 deleted.');
    await actions.reloadAudioStatus();
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to delete chapter audio.'));
  } finally {
    actions.setAudioDeleting(false);
  }
});

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useChapterTextVersions() {
  const dispatch = useAppDispatch();
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();
  const { chapterView: refreshToken } = useAppSelector(selectRefreshTokens);
  const { mp3Voice } = useAppSelector(selectVoiceWorkflow);
  const {
    sourceVersionId,
    versionModel,
    selectedPromptId,
    customPrompt,
    promptName,
    savePromptToLibrary
  } = useAppSelector(selectTextVersionModalWorkflow);
  const [chapterText, setChapterText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextVersionId, setSelectedTextVersionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ChapterTextVersion[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<ChapterTextPrompt[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('base');
  const [loading, setLoading] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioDeleting, setAudioDeleting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterAudioVersionId, setChapterAudioVersionId] = useState<string | null>(null);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [chapterAudioSubchapters, setChapterAudioSubchapters] = useState<FloatingAudioSubchapter[]>([]);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);
  const audioPollTimers = useRef<Map<number, number>>(new Map());
  const audioPollAttempts = useRef<Map<number, number>>(new Map());
  const audioPollRef = useRef<(chapterNumber: number) => void>();
  const bookIdRef = useRef(bookId);
  const chapterNumberRef = useRef(chapterNumber);
  const sourceVersionIdRef = useRef(sourceVersionId);
  const selectedPromptIdRef = useRef(selectedPromptId);
  const selectedVersionIdRef = useRef(selectedVersionId);
  const chapterTextVersionActionsRef = useRef<ChapterTextVersionActions | null>(null);

  useEffect(() => {
    bookIdRef.current = bookId;
  }, [bookId]);

  useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  useEffect(() => {
    sourceVersionIdRef.current = sourceVersionId;
  }, [sourceVersionId]);

  useEffect(() => {
    selectedPromptIdRef.current = selectedPromptId;
  }, [selectedPromptId]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  const setSourceVersionId = useCallback(
    (next: SetStateAction<string>) => {
      dispatch(appActions.setTextVersionModalSourceVersionId(resolveNext(next, sourceVersionIdRef.current)));
    },
    [dispatch]
  );
  const setSelectedPromptId = useCallback(
    (next: SetStateAction<string>) => {
      dispatch(appActions.setTextVersionModalSelectedPromptId(resolveNext(next, selectedPromptIdRef.current)));
    },
    [dispatch]
  );

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [selectedVersionId, versions]
  );

  const clearAudioPoll = useCallback(() => {
    audioPollTimers.current.forEach((timer) => window.clearTimeout(timer));
    audioPollTimers.current.clear();
    audioPollAttempts.current.clear();
  }, []);

  const scheduleAudioPoll = useCallback((currentChapter: number) => {
    const attempt = (audioPollAttempts.current.get(currentChapter) ?? 0) + 1;
    audioPollAttempts.current.set(currentChapter, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      audioPollRef.current?.(currentChapter);
    }, delay);
    audioPollTimers.current.set(currentChapter, timer);
  }, []);

  const chapterTextVersionActions = useMemo<ChapterTextVersionActions>(
    () => ({
      setChapterLoading: setLoading,
      setVersionLoading,
      setGenerating,
      setAudioGenerating,
      setAudioDeleting,
      setVersionSaving,
      setError,
      setVersionError,
      setAudioError,
      setVersionStatus,
      setMissingFile,
      setChapterText,
      setSelectedText,
      setSelectedTextVersionId,
      applyTextVersions: (result, mode) => {
        const nextVersions = result.versions;
        setVersions(nextVersions);
        setPromptLibrary(result.promptLibrary);
        const nextVersionId = normalizeVersionSelection(result);
        if (mode === 'load') {
          setSelectedVersionId((current) =>
            current && nextVersions.some((version) => version.id === current) ? current : nextVersionId
          );
          setSourceVersionId((current) =>
            current && nextVersions.some((version) => version.id === current) ? current : nextVersionId
          );
          setSelectedPromptId((current) => current || result.promptLibrary[0]?.id || 'narration-default');
          return;
        }
        setSelectedVersionId(nextVersionId);
        if (mode === 'create') {
          setSourceVersionId(nextVersionId);
        }
      },
      applyAudioStatus: (job, currentVersionId) => {
        const audioVersionId = job?.status === 'completed' ? job.versionId ?? null : null;
        setChapterAudioVersionId(audioVersionId);
        setChapterAudioReady(Boolean(job?.audioUrl) && audioVersionId === currentVersionId);
        setChapterAudioUrl(job?.audioUrl ?? null);
        setChapterAudioSubchapters(job?.subchapters ?? []);
      },
      setAudioJob,
      clearAudioPoll,
      scheduleAudioPoll,
      refreshChapter: () => setLocalRefreshToken((prev) => prev + 1),
      reloadAudioStatus: async () => {
        const currentBookId = bookIdRef.current;
        const currentChapterNumber = chapterNumberRef.current;
        if (!currentBookId || !currentChapterNumber) {
          return;
        }
        const actions = chapterTextVersionActionsRef.current;
        if (!actions) {
          return;
        }
        await chapterTextVersionHandlers.runAction(
          'loadAudioStatus',
          null,
          actions,
          {
            bookId: currentBookId,
            chapterNumber: currentChapterNumber,
            versionId: selectedVersionIdRef.current || 'base'
          }
        );
      },
      resetTextVersionDraft: () => dispatch(appActions.resetTextVersionModalDraft()),
      markAudioDeleted: () => {
        setChapterAudioReady(false);
        setChapterAudioVersionId(null);
        setChapterAudioUrl(null);
        setAudioJob(null);
      },
      setCreateVersionSucceeded: () => {}
    }),
    [
      clearAudioPoll,
      dispatch,
      scheduleAudioPoll,
      setSelectedPromptId,
      setSourceVersionId
    ]
  );

  useEffect(() => {
    chapterTextVersionActionsRef.current = chapterTextVersionActions;
  }, [chapterTextVersionActions]);

  const loadChapterAudioStatus = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setChapterAudioSubchapters([]);
      return;
    }
    await chapterTextVersionHandlers.runAction('loadAudioStatus', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      versionId: selectedVersionId || 'base'
    });
  }, [bookId, chapterNumber, chapterTextVersionActions, selectedVersionId]);

  const loadTextVersions = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      setSelectedPromptId('');
      setVersionError(null);
      setVersionLoading(false);
      return;
    }
    await chapterTextVersionHandlers.runAction('loadTextVersions', null, chapterTextVersionActions, {
      bookId,
      chapterNumber
    });
  }, [bookId, chapterNumber, chapterTextVersionActions, setSelectedPromptId, setSourceVersionId]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setSelectedText('');
      setSelectedTextVersionId(null);
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      setSelectedPromptId('');
      setError(null);
      setMissingFile(null);
      setLoading(false);
      setVersionLoading(false);
      setVersionError(null);
      setAudioGenerating(false);
      setAudioError(null);
      setVersionSaving(false);
      setVersionStatus(null);
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setAudioJob(null);
      return;
    }

    let canceled = false;
    setChapterText('');
    setSelectedText('');
    setSelectedTextVersionId(null);
    setVersionStatus(null);

    const scopedActions: ChapterTextVersionActions = {
      ...chapterTextVersionActions,
      setChapterLoading: (value) => {
        if (!canceled) setLoading(value);
      },
      setError: (value) => {
        if (!canceled) setError(value);
      },
      setMissingFile: (value) => {
        if (!canceled) setMissingFile(value);
      },
      setChapterText: (value) => {
        if (!canceled) setChapterText(value);
      }
    };
    void chapterTextVersionHandlers.runAction('loadChapterText', null, scopedActions, {
      bookId,
      chapterNumber
    });

    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, chapterTextVersionActions, refreshToken, localRefreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || missingFile) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      setSelectedPromptId('');
      return;
    }
    void loadTextVersions();
  }, [bookId, chapterNumber, loadTextVersions, localRefreshToken, missingFile, refreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || !selectedVersion) {
      setSelectedText('');
      setSelectedTextVersionId(null);
      return;
    }
    if (selectedVersion.id === 'base') {
      setSelectedText(chapterText);
      setSelectedTextVersionId('base');
      return;
    }
    let canceled = false;
    const scopedActions: ChapterTextVersionActions = {
      ...chapterTextVersionActions,
      setVersionLoading: (value) => {
        if (!canceled) setVersionLoading(value);
      },
      setVersionError: (value) => {
        if (!canceled) setVersionError(value);
      },
      setSelectedText: (value) => {
        if (!canceled) setSelectedText(value);
      },
      setSelectedTextVersionId: (value) => {
        if (!canceled) setSelectedTextVersionId(value);
      }
    };
    void chapterTextVersionHandlers.runAction('loadVersionText', null, scopedActions, {
      file: selectedVersion.file,
      versionId: selectedVersion.id
    });
    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, chapterText, chapterTextVersionActions, selectedVersion]);

  useEffect(() => {
    void loadChapterAudioStatus();
  }, [loadChapterAudioStatus]);

  useEffect(() => {
    setAudioJob(null);
    clearAudioPoll();
  }, [bookId, chapterNumber, clearAudioPoll]);

  const pollAudioJobStatus = useCallback(
    async (currentChapter: number) => {
      if (!bookId || !currentChapter) {
        return;
      }
      await chapterTextVersionHandlers.runAction('pollAudioJobStatus', null, chapterTextVersionActions, {
        bookId,
        chapterNumber: currentChapter
      });
    },
    [bookId, chapterTextVersionActions]
  );

  useEffect(() => {
    audioPollRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  const derivedTextPending = Boolean(
    bookId &&
      chapterNumber &&
      selectedVersionId !== 'base' &&
      selectedVersion &&
      selectedTextVersionId !== selectedVersionId &&
      !versionError
  );
  const displayText =
    selectedVersionId === 'base'
      ? chapterText
      : selectedTextVersionId === selectedVersionId
        ? selectedText
        : '';
  const displayLoading = loading || versionLoading || derivedTextPending;
  const displayError = error || versionError;
  const canGenerate = Boolean(bookId && chapterNumber && chapterRange);
  const canCreateVersion = Boolean(bookId && chapterNumber && chapterText && !missingFile && !loading);
  const canGenerateAudio = Boolean(bookId && chapterNumber && displayText && !displayLoading);
  const isAudioJobActive = audioJob?.status === 'queued' || audioJob?.status === 'running';

  useEffect(() => {
    dispatch(appActions.setTextVersionModalResources({
      versions,
      promptLibrary,
      versionSaving,
      canCreateVersion
    }));
  }, [canCreateVersion, dispatch, promptLibrary, versionSaving, versions]);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !bookId || !chapterNumber || !chapterRange || generating) {
      return;
    }
    await chapterTextVersionHandlers.runAction('generateChapterText', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      pageStart: chapterRange.start,
      pageEnd: chapterRange.end
    });
  }, [bookId, canGenerate, chapterNumber, chapterRange, chapterTextVersionActions, generating]);

  const handleGenerateAudioWithProvider = useCallback(async (provider: 'default' | 'xai' | 'yandex') => {
    if (!canGenerateAudio || !bookId || !chapterNumber || audioGenerating) {
      return;
    }
    await chapterTextVersionHandlers.runAction('generateAudio', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      voice: mp3Voice,
      versionId: selectedVersionId,
      provider,
      force: chapterAudioReady && chapterAudioVersionId === selectedVersionId
    });
  }, [
    audioGenerating,
    bookId,
    canGenerateAudio,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterTextVersionActions,
    chapterNumber,
    mp3Voice,
    selectedVersionId
  ]);

  const handleGenerateAudio = useCallback(() => {
    const provider = mp3Voice.startsWith('xai_') ? 'xai' : mp3Voice.startsWith('yandex_') ? 'yandex' : 'default';
    return handleGenerateAudioWithProvider(provider);
  }, [handleGenerateAudioWithProvider, mp3Voice]);

  const handleCreateVersion = useCallback(async () => {
    if (!canCreateVersion || !bookId || !chapterNumber || versionSaving) {
      return;
    }
    let created = false;
    await chapterTextVersionHandlers.runAction(
      'createVersion',
      null,
      {
        ...chapterTextVersionActions,
        setCreateVersionSucceeded: (succeeded) => {
          created = succeeded;
        }
      },
      {
        bookId,
        chapterNumber,
        promptId: selectedPromptId || null,
        sourceVersionId,
        model: versionModel,
        customPrompt,
        addToLibrary: savePromptToLibrary,
        promptName
      }
    );
    return created;
  }, [
    bookId,
    canCreateVersion,
    chapterTextVersionActions,
    chapterNumber,
    customPrompt,
    promptName,
    savePromptToLibrary,
    selectedPromptId,
    sourceVersionId,
    versionModel,
    versionSaving
  ]);

  const handleDeleteVersion = useCallback(async () => {
    if (!bookId || !chapterNumber || !selectedVersion || !selectedVersion.deletable || versionSaving) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedVersion.label}?`);
    if (!confirmed) {
      return;
    }
    await chapterTextVersionHandlers.runAction('deleteVersion', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      versionId: selectedVersion.id
    });
  }, [bookId, chapterNumber, chapterTextVersionActions, selectedVersion, versionSaving]);

  const handleCancelAudioJob = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      return;
    }
    await chapterTextVersionHandlers.runAction('cancelAudioJob', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      versionId: selectedVersionId
    });
  }, [bookId, chapterNumber, chapterTextVersionActions, selectedVersionId]);

  const handleDeleteAudio = useCallback(async () => {
    if (!bookId || !chapterNumber || !chapterAudioUrl || audioDeleting || isAudioJobActive) {
      return;
    }
    const targetVersionId = chapterAudioVersionId || selectedVersionId || 'base';
    const confirmed = window.confirm('Delete generated MP3 for this chapter?');
    if (!confirmed) {
      return;
    }
    await chapterTextVersionHandlers.runAction('deleteAudio', null, chapterTextVersionActions, {
      bookId,
      chapterNumber,
      versionId: targetVersionId
    });
  }, [
    audioDeleting,
    bookId,
    chapterAudioUrl,
    chapterAudioVersionId,
    chapterTextVersionActions,
    chapterNumber,
    isAudioJobActive,
    selectedVersionId
  ]);

  return {
    chapterText,
    displayText,
    displayLoading,
    displayError,
    versions,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    generating,
    canGenerate,
    missingFile,
    audioGenerating,
    audioDeleting,
    audioError,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    chapterAudioSubchapters,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    canGenerateAudio,
    handleGenerate,
    handleGenerateAudio,
    handleDeleteAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  };
}
