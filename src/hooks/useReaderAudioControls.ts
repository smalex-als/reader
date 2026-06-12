import { useAudioController } from '@/hooks/useAudioController';
import { useFloatingAudio } from '@/hooks/useFloatingAudio';
import { useReaderLifecycleEffects } from '@/hooks/useReaderLifecycleEffects';
import { useStreamControls } from '@/hooks/useStreamControls';
import { useStreamHistoryLogger } from '@/hooks/useStreamHistoryLogger';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useMp3Voice, useStreamVoices } from '@/hooks/useStreamVoices';
import { usePlaybackWakeLock } from '@/hooks/useWakeLock';

type UseReaderAudioControlsOptions = {
  bookId: string | null;
  chapterNumber: number | null;
};

export function useReaderAudioControls({
  bookId,
  chapterNumber
}: UseReaderAudioControlsOptions) {
  useStreamVoices();
  useMp3Voice();

  const {
    resetAudioCache,
    stopAudio
  } = useAudioController();
  const {
    startStream,
    enqueueStream,
    pauseStream,
    resumeStream,
    stopStream,
    stopAfterCurrentStream,
    pauseStreamAtStart
  } = useStreamingAudio();

  useFloatingAudio();
  usePlaybackWakeLock();
  useReaderLifecycleEffects({
    bookId,
    chapterNumber,
    resetAudioCache,
    stopAudio,
    stopStream
  });

  const {
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    handleStopStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock,
    restartStreamFromPageKey
  } = useStreamSequence({
    startStream,
    enqueueStream,
    stopStream,
    pauseStream,
    resumeStream,
    pauseStreamAtStart
  });
  useStreamControls({
    startStreamSequence,
    handlePlayPageBlock,
    handlePlayChapterParagraph,
    handlePlaySingleStream,
    restartStreamFromPageKey,
    handleStopStream,
    handleStopAfterCurrentStream: stopAfterCurrentStream,
    handleToggleStreamPause,
    handlePlayNextStudyBlock
  });

  useStreamHistoryLogger();
}
