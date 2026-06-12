import { useMemo } from 'react';
import { selectStreamRuntime, useAppSelector } from '@/state/appState';

export function useChapterTextPlaybackMarker() {
  const streamState = useAppSelector(selectStreamRuntime);
  const streamPositionActive =
    streamState.status === 'connecting' || streamState.status === 'streaming' || streamState.status === 'paused';

  return useMemo(() => {
    if (!streamPositionActive || typeof streamState.pageKey !== 'string') {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    const match = streamState.pageKey.match(/^(chapter|narration)::paragraph-start-(\d+)$/);
    if (!match) {
      return { mode: null as 'chapter' | 'narration' | null, startIndex: null as number | null };
    }
    return {
      mode: match[1] as 'chapter' | 'narration',
      startIndex: Number.parseInt(match[2], 10)
    };
  }, [streamPositionActive, streamState.pageKey]);
}
