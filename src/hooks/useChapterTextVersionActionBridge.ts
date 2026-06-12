import { useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import {
  chapterTextVersionHandlers,
  type AudioJobStatus,
  type ChapterTextVersionActions
} from '@/hooks/chapterTextVersionActions';
import { normalizeVersionSelection } from '@/hooks/chapterTextVersionState';
import { appActions, useAppDispatch } from '@/state/appState';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

type ChapterTextVersionActionBridgeParams = {
  refs: {
    bookIdRef: RefObject<string | null>;
    chapterNumberRef: RefObject<number | null>;
    selectedVersionIdRef: RefObject<string>;
    actionsRef: RefObject<ChapterTextVersionActions | null>;
  };
  status: {
    setLoading: Dispatch<SetStateAction<boolean>>;
    setVersionLoading: Dispatch<SetStateAction<boolean>>;
    setGenerating: Dispatch<SetStateAction<boolean>>;
    setAudioGenerating: Dispatch<SetStateAction<boolean>>;
    setAudioDeleting: Dispatch<SetStateAction<boolean>>;
    setVersionSaving: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setVersionError: Dispatch<SetStateAction<string | null>>;
    setAudioError: Dispatch<SetStateAction<string | null>>;
    setVersionStatus: Dispatch<SetStateAction<string | null>>;
    setMissingFile: Dispatch<SetStateAction<string | null>>;
  };
  text: {
    setChapterText: Dispatch<SetStateAction<string>>;
    setSelectedText: Dispatch<SetStateAction<string>>;
    setSelectedTextVersionId: Dispatch<SetStateAction<string | null>>;
  };
  versions: {
    setVersions: Dispatch<SetStateAction<ChapterTextVersion[]>>;
    setPromptLibrary: Dispatch<SetStateAction<ChapterTextPrompt[]>>;
    setSelectedVersionId: Dispatch<SetStateAction<string>>;
    setSourceVersionId: (next: SetStateAction<string>) => void;
    setSelectedPromptId: (next: SetStateAction<string>) => void;
    refreshChapter: () => void;
  };
  audio: {
    setChapterAudioReady: Dispatch<SetStateAction<boolean>>;
    setChapterAudioVersionId: Dispatch<SetStateAction<string | null>>;
    setChapterAudioUrl: Dispatch<SetStateAction<string | null>>;
    setChapterAudioSubchapters: Dispatch<SetStateAction<FloatingAudioSubchapter[]>>;
    setAudioJob: Dispatch<SetStateAction<AudioJobStatus | null>>;
    clearAudioPoll: () => void;
    scheduleAudioPoll: (chapterNumber: number) => void;
  };
};

export function useChapterTextVersionActionBridge({
  refs,
  status,
  text,
  versions,
  audio
}: ChapterTextVersionActionBridgeParams) {
  const dispatch = useAppDispatch();
  const {
    bookIdRef,
    chapterNumberRef,
    selectedVersionIdRef,
    actionsRef
  } = refs;
  const {
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
  } = status;
  const {
    setChapterText,
    setSelectedText,
    setSelectedTextVersionId
  } = text;
  const {
    setVersions,
    setPromptLibrary,
    setSelectedVersionId,
    setSourceVersionId,
    setSelectedPromptId,
    refreshChapter
  } = versions;
  const {
    setChapterAudioReady,
    setChapterAudioVersionId,
    setChapterAudioUrl,
    setChapterAudioSubchapters,
    setAudioJob,
    clearAudioPoll,
    scheduleAudioPoll
  } = audio;

  return useMemo<ChapterTextVersionActions>(
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
      refreshChapter,
      reloadAudioStatus: async () => {
        const currentBookId = bookIdRef.current;
        const currentChapterNumber = chapterNumberRef.current;
        if (!currentBookId || !currentChapterNumber) {
          return;
        }
        const actions = actionsRef.current;
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
      actionsRef,
      bookIdRef,
      chapterNumberRef,
      clearAudioPoll,
      dispatch,
      refreshChapter,
      scheduleAudioPoll,
      selectedVersionIdRef,
      setAudioDeleting,
      setAudioError,
      setAudioGenerating,
      setAudioJob,
      setChapterAudioReady,
      setChapterAudioSubchapters,
      setChapterAudioUrl,
      setChapterAudioVersionId,
      setChapterText,
      setError,
      setGenerating,
      setLoading,
      setMissingFile,
      setPromptLibrary,
      setSelectedPromptId,
      setSelectedText,
      setSelectedTextVersionId,
      setSelectedVersionId,
      setSourceVersionId,
      setVersionError,
      setVersionLoading,
      setVersionSaving,
      setVersionStatus,
      setVersions
    ]
  );
}
