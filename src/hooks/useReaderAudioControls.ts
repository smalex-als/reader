import { useCallback, useEffect, useRef } from 'react';
import { useAudioController } from '@/hooks/useAudioController';
import { useCurrentChapterContext } from '@/hooks/useCurrentChapterLabel';
import { useFloatingAudio } from '@/hooks/useFloatingAudio';
import { useReaderLifecycleEffects } from '@/hooks/useReaderLifecycleEffects';
import { useStreamControls } from '@/hooks/useStreamControls';
import { useStreamHistoryLogger } from '@/hooks/useStreamHistoryLogger';
import { useStreamSequence } from '@/hooks/useStreamSequence';
import { useStreamingAudio } from '@/hooks/useStreamingAudio';
import { useMp3Voice, useStreamVoices } from '@/hooks/useStreamVoices';
import { usePlaybackWakeLock } from '@/hooks/useWakeLock';

export function useReaderAudioControls() {
  const { bookId, chapterNumber } = useCurrentChapterContext();
  const streamSegmentStartRef = useRef<(pageKey: string) => void>(() => undefined);

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
  } = useStreamingAudio({
    onSegmentStart: useCallback((pageKey: string) => {
      streamSegmentStartRef.current(pageKey);
    }, [])
  });

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
    restartStreamFromPageKey,
    handleStreamSegmentStart
  } = useStreamSequence({
    startStream,
    enqueueStream,
    stopStream,
    pauseStream,
    resumeStream,
    pauseStreamAtStart
  });
  useEffect(() => {
    streamSegmentStartRef.current = handleStreamSegmentStart;
  }, [handleStreamSegmentStart]);
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
