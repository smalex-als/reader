import { useCallback, useMemo } from 'react';
import type { AudioChapter } from '@/api/chapterAudio';
import { useConfirmation } from '@/components/ConfirmationProvider';
import type { StreamVoiceOption } from '@/lib/appConstants';
import { appActions, useAppDispatch } from '@/state/appState';
import type { ChapterAudioProvider } from '@/types/app';

function getMp3Provider(voice: string): ChapterAudioProvider {
  if (voice.startsWith('xai_')) {
    return 'xai';
  }
  if (voice.startsWith('yandex_')) {
    return 'yandex';
  }
  return 'default';
}

export function useAudioViewRuntimeActions({
  audioDeleting,
  deleteAudio,
  mp3Voice,
  streamVoiceOptions
}: {
  audioDeleting: Record<number, boolean>;
  deleteAudio: (payload: { chapterNumber: number; versionId: string }) => Promise<void>;
  mp3Voice: string;
  streamVoiceOptions: StreamVoiceOption[];
}) {
  const dispatch = useAppDispatch();
  const { confirmAction } = useConfirmation();
  const mp3VoiceOptions = useMemo(
    () =>
      streamVoiceOptions.filter(
        (option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'
      ),
    [streamVoiceOptions]
  );
  const selectedMp3Provider = useMemo(() => getMp3Provider(mp3Voice), [mp3Voice]);

  const handleMp3VoiceChange = useCallback(
    (voice: string) => {
      if (!mp3VoiceOptions.some((option) => option.id === voice)) {
        return;
      }
      dispatch(appActions.setMp3Voice(voice));
    },
    [dispatch, mp3VoiceOptions]
  );

  const openChapterText = useCallback(
    (pageIndex: number, versionId?: string, chapterNumber?: number) => {
      if (versionId && chapterNumber) {
        dispatch(appActions.requestChapterVersionNavigation(chapterNumber, versionId));
      } else {
        dispatch(appActions.clearChapterVersionNavigation());
      }
      dispatch(appActions.setReaderViewMode('text'));
      dispatch(appActions.requestPageNavigation(pageIndex));
    },
    [dispatch]
  );

  const playChapterAudio = useCallback(
    (chapter: AudioChapter, versionId: string) => {
      if (!chapter.audio?.url) {
        return;
      }
      dispatch(appActions.playFloatingAudio({
        title: chapter.title,
        subtitle: `Chapter ${chapter.chapterNumber}`,
        url: chapter.audio.url,
        chapterNumber: chapter.chapterNumber,
        versionId,
        subchapters: chapter.audio.subchapters ?? []
      }));
    },
    [dispatch]
  );

  const confirmDeleteAudio = useCallback(
    async ({ chapterNumber, chapterTitle, versionId }: {
      chapterNumber: number;
      chapterTitle: string;
      versionId: string;
    }) => {
      if (audioDeleting[chapterNumber]) {
        return;
      }
      await confirmAction({
        title: `Delete chapter ${chapterNumber} MP3?`,
        description: `Generated audio for “${chapterTitle}” will be permanently deleted. The chapter text is not affected.`,
        confirmLabel: 'Delete MP3',
        action: () => deleteAudio({ chapterNumber, versionId })
      });
    },
    [audioDeleting, confirmAction, deleteAudio]
  );

  return {
    confirmDeleteAudio,
    handleMp3VoiceChange,
    mp3VoiceOptions,
    openChapterText,
    playChapterAudio,
    selectedMp3Provider
  };
}
