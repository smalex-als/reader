import { useCallback } from 'react';
import {
  chapterTextVersionHandlers,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';
import { getChapterAudioProvider } from '@/hooks/chapterTextVersionState';
import type { ChapterTextVersion } from '@/types/app';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type ChapterTextVersionCommandsParams = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
  canGenerate: boolean;
  generating: boolean;
  canGenerateAudio: boolean;
  audioGenerating: boolean;
  audioDeleting: boolean;
  isAudioJobActive: boolean;
  mp3Voice: string;
  selectedVersionId: string;
  selectedVersion: ChapterTextVersion | null;
  chapterAudioReady: boolean;
  chapterAudioVersionId: string | null;
  chapterAudioUrl: string | null;
  canCreateVersion: boolean;
  versionSaving: boolean;
  selectedPromptId: string;
  sourceVersionId: string;
  versionModel: string;
  customPrompt: string;
  savePromptToLibrary: boolean;
  promptName: string;
  actions: ChapterTextVersionActions;
};

export function useChapterTextVersionCommands({
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
  actions
}: ChapterTextVersionCommandsParams) {
  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !bookId || !chapterNumber || !chapterRange || generating) {
      return;
    }
    await chapterTextVersionHandlers.runAction('generateChapterText', null, actions, {
      bookId,
      chapterNumber,
      pageStart: chapterRange.start,
      pageEnd: chapterRange.end
    });
  }, [actions, bookId, canGenerate, chapterNumber, chapterRange, generating]);

  const handleGenerateAudioWithProvider = useCallback(async (provider: 'default' | 'xai' | 'yandex') => {
    if (!canGenerateAudio || !bookId || !chapterNumber || audioGenerating) {
      return;
    }
    await chapterTextVersionHandlers.runAction('generateAudio', null, actions, {
      bookId,
      chapterNumber,
      voice: mp3Voice,
      versionId: selectedVersionId,
      provider,
      force: chapterAudioReady && chapterAudioVersionId === selectedVersionId
    });
  }, [
    actions,
    audioGenerating,
    bookId,
    canGenerateAudio,
    chapterAudioReady,
    chapterAudioVersionId,
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
        ...actions,
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
    actions,
    bookId,
    canCreateVersion,
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
    await chapterTextVersionHandlers.runAction('deleteVersion', null, actions, {
      bookId,
      chapterNumber,
      versionId: selectedVersion.id
    });
  }, [actions, bookId, chapterNumber, selectedVersion, versionSaving]);

  const handleCancelAudioJob = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      return;
    }
    await chapterTextVersionHandlers.runAction('cancelAudioJob', null, actions, {
      bookId,
      chapterNumber,
      versionId: selectedVersionId
    });
  }, [actions, bookId, chapterNumber, selectedVersionId]);

  const handleDeleteAudio = useCallback(async () => {
    if (!bookId || !chapterNumber || !chapterAudioUrl || audioDeleting || isAudioJobActive) {
      return;
    }
    const targetVersionId = chapterAudioVersionId || selectedVersionId || 'base';
    const confirmed = window.confirm('Delete generated MP3 for this chapter?');
    if (!confirmed) {
      return;
    }
    await chapterTextVersionHandlers.runAction('deleteAudio', null, actions, {
      bookId,
      chapterNumber,
      versionId: targetVersionId
    });
  }, [
    actions,
    audioDeleting,
    bookId,
    chapterAudioUrl,
    chapterAudioVersionId,
    chapterNumber,
    isAudioJobActive,
    selectedVersionId
  ]);

  return {
    handleGenerate,
    handleGenerateAudio,
    handleDeleteAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  };
}
