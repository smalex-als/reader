import { useEffect, useMemo, useState } from 'react';
import { fetchSubtitleText } from '@/api/audioLibrary';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import { parseSrt } from '@/lib/subtitles';
import type { SubtitleCue } from '@/types/audioLibrary';

type FloatingAudioSubtitlePayloads = {
  loadSubtitles: {
    srtUrl: string;
  };
};

type FloatingAudioSubtitleActions = {
  setSubtitleCues: (cues: SubtitleCue[]) => void;
};

const subtitleHandlers = createActionHandlerRegistry<
  null,
  FloatingAudioSubtitleActions,
  FloatingAudioSubtitlePayloads
>();
const { addActionHandler } = subtitleHandlers;

addActionHandler('loadSubtitles', async (_state, actions, payload): Promise<void> => {
  try {
    const text = await fetchSubtitleText(payload.srtUrl);
    actions.setSubtitleCues(parseSrt(text));
  } catch {
    actions.setSubtitleCues([]);
  }
});

export function useFloatingAudioSubtitles(srtUrl: string | null | undefined) {
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const actions = useMemo<FloatingAudioSubtitleActions>(
    () => ({
      setSubtitleCues
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    setSubtitleCues([]);
    if (!srtUrl) {
      return () => {
        cancelled = true;
      };
    }
    void subtitleHandlers.runAction(
      'loadSubtitles',
      null,
      {
        ...actions,
        setSubtitleCues: (cues) => {
          if (!cancelled) {
            setSubtitleCues(cues);
          }
        }
      },
      { srtUrl }
    );
    return () => {
      cancelled = true;
    };
  }, [actions, srtUrl]);

  return subtitleCues;
}
