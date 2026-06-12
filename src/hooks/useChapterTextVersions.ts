import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  type AudioJobStatus,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';
import {
  getChapterTextVersionDisplayState,
  selectChapterTextVersion
} from '@/hooks/chapterTextVersionState';
import { useChapterAudioPolling } from '@/hooks/useChapterAudioPolling';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useChapterTextVersionActionBridge } from '@/hooks/useChapterTextVersionActionBridge';
import { useChapterTextVersionCommands } from '@/hooks/useChapterTextVersionCommands';
import { useChapterTextVersionLoadEffects } from '@/hooks/useChapterTextVersionLoadEffects';
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

  useChapterTextVersionLoadEffects({
    bookId,
    chapterNumber,
    selectedVersionId,
    selectedVersion,
    chapterText,
    missingFile,
    refreshToken,
    localRefreshToken,
    actions: chapterTextVersionActions,
    setSourceVersionId,
    setSelectedPromptId,
    text: {
      setChapterText,
      setSelectedText,
      setSelectedTextVersionId
    },
    versions: {
      setVersions,
      setPromptLibrary,
      setSelectedVersionId
    },
    status: {
      setLoading,
      setVersionLoading,
      setError,
      setMissingFile,
      setVersionError,
      setAudioGenerating,
      setAudioError,
      setVersionSaving,
      setVersionStatus
    },
    audio: {
      setChapterAudioReady,
      setChapterAudioVersionId,
      setChapterAudioUrl,
      setChapterAudioSubchapters,
      setAudioJob
    }
  });

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

  const {
    handleGenerate,
    handleGenerateAudio,
    handleDeleteAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  } = useChapterTextVersionCommands({
    bookId,
    chapterNumber,
    chapterRange,
    canGenerate,
    generating,
    canGenerateAudio,
    audioGenerating,
    audioDeleting,
    isAudioJobActive,
    mp3Voice,
    selectedVersionId,
    selectedVersion,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    canCreateVersion,
    versionSaving,
    selectedPromptId,
    sourceVersionId,
    versionModel,
    customPrompt,
    savePromptToLibrary,
    promptName,
    actions: chapterTextVersionActions
  });

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
