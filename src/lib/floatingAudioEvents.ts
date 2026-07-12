export const FLOATING_AUDIO_SUBCHAPTER_SELECT_EVENT = 'reader:floating-audio-subchapter-select';

export type FloatingAudioSubchapterSelectDetail = {
  subchapter: {
    title: string;
    startSeconds: number;
    endSeconds?: number;
    durationSeconds?: number;
  };
  track: {
    title?: string;
    url?: string;
    chapterNumber?: number | null;
    versionId?: string | null;
  };
};

export function emitFloatingAudioSubchapterSelect(detail: FloatingAudioSubchapterSelectDetail) {
  window.dispatchEvent(new CustomEvent(FLOATING_AUDIO_SUBCHAPTER_SELECT_EVENT, { detail }));
}

export function onFloatingAudioSubchapterSelect(
  handler: (detail: FloatingAudioSubchapterSelectDetail) => void
) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<FloatingAudioSubchapterSelectDetail>).detail);
  };
  window.addEventListener(FLOATING_AUDIO_SUBCHAPTER_SELECT_EVENT, listener);
  return () => window.removeEventListener(FLOATING_AUDIO_SUBCHAPTER_SELECT_EVENT, listener);
}
