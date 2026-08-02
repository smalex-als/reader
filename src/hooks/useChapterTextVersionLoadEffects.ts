import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  chapterTextVersionHandlers,
  type AudioJobStatus,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';
import { getChapterVersionFromLocation } from '@/lib/bookUrl';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

type ChapterTextVersionLoadEffectsParams = {
  bookId: string | null;
  chapterNumber: number | null;
  selectedVersionId: string;
  selectedVersion: ChapterTextVersion | null;
  chapterText: string;
  missingFile: string | null;
  refreshToken: number;
  localRefreshToken: number;
  actions: ChapterTextVersionActions;
  setSourceVersionId: (next: SetStateAction<string>) => void;
  setSelectedPromptId: (next: SetStateAction<string>) => void;
  text: {
    setChapterText: Dispatch<SetStateAction<string>>;
    setSelectedText: Dispatch<SetStateAction<string>>;
    setSelectedTextVersionId: Dispatch<SetStateAction<string | null>>;
  };
  versions: {
    setVersions: Dispatch<SetStateAction<ChapterTextVersion[]>>;
    setPromptLibrary: Dispatch<SetStateAction<ChapterTextPrompt[]>>;
    setSelectedVersionId: Dispatch<SetStateAction<string>>;
  };
  status: {
    setLoading: Dispatch<SetStateAction<boolean>>;
    setVersionLoading: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setMissingFile: Dispatch<SetStateAction<string | null>>;
    setVersionError: Dispatch<SetStateAction<string | null>>;
    setAudioGenerating: Dispatch<SetStateAction<boolean>>;
    setAudioError: Dispatch<SetStateAction<string | null>>;
    setVersionSaving: Dispatch<SetStateAction<boolean>>;
    setVersionStatus: Dispatch<SetStateAction<string | null>>;
  };
  audio: {
    setChapterAudioReady: Dispatch<SetStateAction<boolean>>;
    setChapterAudioVersionId: Dispatch<SetStateAction<string | null>>;
    setChapterAudioUrl: Dispatch<SetStateAction<string | null>>;
    setChapterAudioSubchapters: Dispatch<SetStateAction<FloatingAudioSubchapter[]>>;
    setAudioJob: Dispatch<SetStateAction<AudioJobStatus | null>>;
  };
};

export function useChapterTextVersionLoadEffects({
  bookId,
  chapterNumber,
  selectedVersionId,
  selectedVersion,
  chapterText,
  missingFile,
  refreshToken,
  localRefreshToken,
  actions,
  setSourceVersionId,
  setSelectedPromptId,
  text,
  versions,
  status,
  audio
}: ChapterTextVersionLoadEffectsParams) {
  const {
    setChapterText,
    setSelectedText,
    setSelectedTextVersionId
  } = text;
  const {
    setVersions,
    setPromptLibrary,
    setSelectedVersionId
  } = versions;
  const {
    setLoading,
    setVersionLoading,
    setError,
    setMissingFile,
    setVersionError,
    setAudioGenerating,
    setAudioError,
    setVersionSaving,
    setVersionStatus
  } = status;
  const {
    setChapterAudioReady,
    setChapterAudioVersionId,
    setChapterAudioUrl,
    setChapterAudioSubchapters,
    setAudioJob
  } = audio;

  const resetVersionSelection = useCallback(() => {
    setVersions([]);
    setPromptLibrary([]);
    setSelectedVersionId(getChapterVersionFromLocation() ?? 'base');
    setSourceVersionId('base');
    setSelectedPromptId('');
  }, [setPromptLibrary, setSelectedPromptId, setSelectedVersionId, setSourceVersionId, setVersions]);

  const resetAudioState = useCallback(() => {
    setChapterAudioReady(false);
    setChapterAudioVersionId(null);
    setChapterAudioUrl(null);
    setChapterAudioSubchapters([]);
  }, [setChapterAudioReady, setChapterAudioSubchapters, setChapterAudioUrl, setChapterAudioVersionId]);

  const loadChapterAudioStatus = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      resetAudioState();
      return;
    }
    await chapterTextVersionHandlers.runAction('loadAudioStatus', null, actions, {
      bookId,
      chapterNumber,
      versionId: selectedVersionId || 'base'
    });
  }, [actions, bookId, chapterNumber, resetAudioState, selectedVersionId]);

  const loadTextVersions = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      resetVersionSelection();
      setVersionError(null);
      setVersionLoading(false);
      return;
    }
    await chapterTextVersionHandlers.runAction('loadTextVersions', null, actions, {
      bookId,
      chapterNumber
    });
  }, [actions, bookId, chapterNumber, resetVersionSelection, setVersionError, setVersionLoading]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setSelectedText('');
      setSelectedTextVersionId(null);
      resetVersionSelection();
      setError(null);
      setMissingFile(null);
      setLoading(false);
      setVersionLoading(false);
      setVersionError(null);
      setAudioGenerating(false);
      setAudioError(null);
      setVersionSaving(false);
      setVersionStatus(null);
      resetAudioState();
      setAudioJob(null);
      return;
    }

    let canceled = false;
    setChapterText('');
    setSelectedText('');
    setSelectedTextVersionId(null);
    setVersionStatus(null);

    const scopedActions: ChapterTextVersionActions = {
      ...actions,
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
  }, [
    actions,
    bookId,
    chapterNumber,
    localRefreshToken,
    refreshToken,
    resetAudioState,
    resetVersionSelection,
    setAudioError,
    setAudioGenerating,
    setAudioJob,
    setChapterText,
    setError,
    setLoading,
    setMissingFile,
    setSelectedText,
    setSelectedTextVersionId,
    setVersionError,
    setVersionLoading,
    setVersionSaving,
    setVersionStatus
  ]);

  useEffect(() => {
    if (!bookId || !chapterNumber || missingFile) {
      resetVersionSelection();
      return;
    }
    void loadTextVersions();
  }, [bookId, chapterNumber, loadTextVersions, localRefreshToken, missingFile, refreshToken, resetVersionSelection]);

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
      ...actions,
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
  }, [
    actions,
    bookId,
    chapterNumber,
    chapterText,
    selectedVersion,
    setSelectedText,
    setSelectedTextVersionId,
    setVersionError,
    setVersionLoading
  ]);

  useEffect(() => {
    void loadChapterAudioStatus();
  }, [loadChapterAudioStatus]);
}
