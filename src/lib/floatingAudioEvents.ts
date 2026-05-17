export const FLOATING_AUDIO_SUBCHAPTER_SELECT_EVENT = 'reader:floating-audio-subchapter-select';
export const FLOATING_AUDIO_TIME_EVENT = 'reader:floating-audio-time';

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

export type FloatingAudioTimeDetail = {
  track: {
    title?: string;
    url?: string;
    chapterNumber?: number | null;
    versionId?: string | null;
  };
  currentTime: number;
  duration: number;
  playing: boolean;
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

export function emitFloatingAudioTime(detail: FloatingAudioTimeDetail) {
  window.dispatchEvent(new CustomEvent(FLOATING_AUDIO_TIME_EVENT, { detail }));
}

export function onFloatingAudioTime(handler: (detail: FloatingAudioTimeDetail) => void) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<FloatingAudioTimeDetail>).detail);
  };
  window.addEventListener(FLOATING_AUDIO_TIME_EVENT, listener);
  return () => window.removeEventListener(FLOATING_AUDIO_TIME_EVENT, listener);
}
