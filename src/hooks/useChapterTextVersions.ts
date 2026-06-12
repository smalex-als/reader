import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  chapterTextVersionHandlers,
  type AudioJobStatus,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';
import {
  getChapterAudioProvider,
  getChapterTextVersionDisplayState,
  selectChapterTextVersion
} from '@/hooks/chapterTextVersionState';
import { useChapterAudioPolling } from '@/hooks/useChapterAudioPolling';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useChapterTextVersionActionBridge } from '@/hooks/useChapterTextVersionActionBridge';
import { useChapterTextVersionRefs } from '@/hooks/useChapterTextVersionRefs';
import {
  appActions,
  selectRefreshTokens,
  selectTextVersionModalWorkflow,
  selectVoiceWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

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
  const chapterTextVersionActionsRef = useRef<ChapterTextVersionActions | null>(null);
  const {
    bookIdRef,
    chapterNumberRef,
    sourceVersionIdRef,
    selectedPromptIdRef,
    selectedVersionIdRef
  } = useChapterTextVersionRefs({
    bookId,
    chapterNumber,
    sourceVersionId,
    selectedPromptId,
    selectedVersionId
  });

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
    () => selectChapterTextVersion(versions, selectedVersionId),
    [selectedVersionId, versions]
  );
  const resetAudioJob = useCallback(() => {
    setAudioJob(null);
  }, []);
  const { clearAudioPoll, scheduleAudioPoll } = useChapterAudioPolling({
    bookId,
    chapterNumber,
    actionsRef: chapterTextVersionActionsRef,
    resetAudioJob
  });
  const refreshChapter = useCallback(() => {
    setLocalRefreshToken((prev) => prev + 1);
  }, []);
  const chapterTextVersionActions = useChapterTextVersionActionBridge({
    refs: {
      bookIdRef,
      chapterNumberRef,
      selectedVersionIdRef,
      actionsRef: chapterTextVersionActionsRef
    },
    status: {
      setLoading,
      setVersionLoading,
      setGenerating,
      setAudioGenerating,
      setAudioDeleting,
      setVersionSaving,
      setError,
      setVersionError,
      setAudioError,
      setVersionStatus,
      setMissingFile
    },
    text: {
      setChapterText,
      setSelectedText,
      setSelectedTextVersionId
    },
    versions: {
      setVersions,
      setPromptLibrary,
      setSelectedVersionId,
      setSourceVersionId,
      setSelectedPromptId,
      refreshChapter
    },
    audio: {
      setChapterAudioReady,
      setChapterAudioVersionId,
      setChapterAudioUrl,
      setChapterAudioSubchapters,
      setAudioJob,
      clearAudioPoll,
      scheduleAudioPoll
    }
  });

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

  const { displayText, displayLoading, displayError } = getChapterTextVersionDisplayState({
    bookId,
    chapterNumber,
    selectedVersionId,
    selectedVersion,
    selectedTextVersionId,
    chapterText,
    selectedText,
    loading,
    versionLoading,
    error,
    versionError
  });
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
    return handleGenerateAudioWithProvider(getChapterAudioProvider(mp3Voice));
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
