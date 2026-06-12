import { useCallback, useMemo } from 'react';
import type { StreamVoiceOption } from '@/lib/appConstants';
import { appActions, useAppDispatch } from '@/state/appState';
import type { ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

export function useChapterViewerActions({
  chapterNumber,
  chapterTitle,
  displayText,
  selectedVersion,
  selectedVersionId,
  streamVoiceOptions
}: {
  chapterNumber: number | null;
  chapterTitle: string | null;
  displayText: string;
  selectedVersion: ChapterTextVersion | null;
  selectedVersionId: string;
  streamVoiceOptions: StreamVoiceOption[];
}) {
  const dispatch = useAppDispatch();
  const mp3VoiceOptions = useMemo(
    () =>
      streamVoiceOptions.filter(
        (option) => option.provider === 'streaming' || option.provider === 'yandex' || option.provider === 'xai'
      ),
    [streamVoiceOptions]
  );

  const handleMp3VoiceChange = useCallback(
    (voice: string) => {
      if (!mp3VoiceOptions.some((option) => option.id === voice)) {
        return;
      }
      dispatch(appActions.setMp3Voice(voice));
    },
    [dispatch, mp3VoiceOptions]
  );

  const openAudioView = useCallback(() => {
    dispatch(appActions.clearChapterVersionNavigation());
    dispatch(appActions.setReaderViewMode('audio'));
  }, [dispatch]);

  const openChapterEditor = useCallback(() => {
    if (!chapterNumber) {
      return;
    }
    dispatch(appActions.setEditorChapterNumber(chapterNumber));
    dispatch(appActions.setEditorTextVersion({
      versionId: selectedVersionId || 'base',
      versionLabel: selectedVersion?.label ?? null,
      text: displayText
    }));
    dispatch(appActions.setEditorOpen(true));
  }, [chapterNumber, dispatch, displayText, selectedVersion?.label, selectedVersionId]);

  const playChapterAudio = useCallback(
    ({
      audioUrl,
      subchapters
    }: {
      audioUrl: string;
      subchapters: FloatingAudioSubchapter[];
    }) => {
      dispatch(appActions.playFloatingAudio({
        title: chapterTitle ?? `Chapter ${chapterNumber}`,
        subtitle: selectedVersion?.label,
        url: audioUrl,
        chapterNumber,
        versionId: selectedVersionId,
        subchapters
      }));
    },
    [chapterNumber, chapterTitle, dispatch, selectedVersion?.label, selectedVersionId]
  );

  return {
    mp3VoiceOptions,
    handleMp3VoiceChange,
    openAudioView,
    openChapterEditor,
    playChapterAudio
  };
}
