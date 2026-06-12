import { useCallback, useEffect, useRef } from 'react';
import type { ChapterTextVersionActions } from '@/hooks/chapterTextVersionActions';
import { useChapterAudioPolling } from '@/hooks/useChapterAudioPolling';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useChapterTextVersionActionBridge } from '@/hooks/useChapterTextVersionActionBridge';
import { useChapterTextVersionCommands } from '@/hooks/useChapterTextVersionCommands';
import { useChapterTextVersionLoadEffects } from '@/hooks/useChapterTextVersionLoadEffects';
import { useChapterTextVersionModalWorkflow } from '@/hooks/useChapterTextVersionModalWorkflow';
import { useChapterTextVersionRefs } from '@/hooks/useChapterTextVersionRefs';
import { useChapterTextVersionState } from '@/hooks/useChapterTextVersionState';
import {
  selectRefreshTokens,
  selectVoiceWorkflow,
  useAppSelector
} from '@/state/appState';

export function useChapterTextVersions() {
  const { bookId, chapterNumber, pageRange: chapterRange } = useCurrentChapterContext();
  const { chapterView: refreshToken } = useAppSelector(selectRefreshTokens);
  const { mp3Voice } = useAppSelector(selectVoiceWorkflow);
  const {
    state,
    publicState,
    setters,
    setterGroups,
    derived
  } = useChapterTextVersionState({
    bookId,
    chapterNumber,
    chapterRange
  });
  const {
    setAudioJob,
    setLocalRefreshToken,
    setSelectedVersionId
  } = setters;
  const {
    sourceVersionId,
    versionModel,
    selectedPromptId,
    customPrompt,
    promptName,
    savePromptToLibrary,
    setSourceVersionId,
    setSelectedPromptId
  } = useChapterTextVersionModalWorkflow({
    versions: state.versions,
    promptLibrary: state.promptLibrary,
    versionSaving: state.versionSaving,
    canCreateVersion: derived.canCreateVersion
  });
  const chapterTextVersionActionsRef = useRef<ChapterTextVersionActions | null>(null);
  const {
    bookIdRef,
    chapterNumberRef,
    selectedVersionIdRef
  } = useChapterTextVersionRefs({
    bookId,
    chapterNumber,
    selectedVersionId: state.selectedVersionId
  });

  const resetAudioJob = useCallback(() => {
    setAudioJob(null);
  }, [setAudioJob]);
  const { clearAudioPoll, scheduleAudioPoll } = useChapterAudioPolling({
    bookId,
    chapterNumber,
    actionsRef: chapterTextVersionActionsRef,
    resetAudioJob
  });
  const refreshChapter = useCallback(() => {
    setLocalRefreshToken((prev) => prev + 1);
  }, [setLocalRefreshToken]);
  const chapterTextVersionActions = useChapterTextVersionActionBridge({
    refs: {
      bookIdRef,
      chapterNumberRef,
      selectedVersionIdRef,
      actionsRef: chapterTextVersionActionsRef
    },
    status: setterGroups.status,
    text: setterGroups.text,
    versions: {
      ...setterGroups.versions,
      setSourceVersionId,
      setSelectedPromptId,
      refreshChapter
    },
    audio: {
      ...setterGroups.audio,
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
    selectedVersionId: state.selectedVersionId,
    selectedVersion: derived.selectedVersion,
    chapterText: state.chapterText,
    missingFile: state.missingFile,
    refreshToken,
    localRefreshToken: state.localRefreshToken,
    actions: chapterTextVersionActions,
    setSourceVersionId,
    setSelectedPromptId,
    text: setterGroups.text,
    versions: setterGroups.versions,
    status: setterGroups.loadStatus,
    audio: setterGroups.audio
  });

  const commands = useChapterTextVersionCommands({
    bookId,
    chapterNumber,
    chapterRange,
    canGenerate: derived.canGenerate,
    generating: state.generating,
    canGenerateAudio: derived.canGenerateAudio,
    audioGenerating: state.audioGenerating,
    audioDeleting: state.audioDeleting,
    isAudioJobActive: derived.isAudioJobActive,
    mp3Voice,
    selectedVersionId: state.selectedVersionId,
    selectedVersion: derived.selectedVersion,
    chapterAudioReady: state.chapterAudioReady,
    chapterAudioVersionId: state.chapterAudioVersionId,
    chapterAudioUrl: state.chapterAudioUrl,
    canCreateVersion: derived.canCreateVersion,
    versionSaving: state.versionSaving,
    selectedPromptId,
    sourceVersionId,
    versionModel,
    customPrompt,
    savePromptToLibrary,
    promptName,
    actions: chapterTextVersionActions
  });

  return {
    ...publicState,
    setSelectedVersionId,
    ...commands
  };
}
