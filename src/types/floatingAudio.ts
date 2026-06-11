export type FloatingAudioSubchapter = {
  title: string;
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
};

export type FloatingAudioTrack = {
  title: string;
  url: string;
  srtUrl?: string | null;
  subtitle?: string;
  kind?: 'page-tts' | 'text-tts' | 'file';
  provider?: 'openai' | 'xai' | 'yandex' | 'default' | null;
  pageKey?: string | null;
  chapterNumber?: number | null;
  versionId?: string | null;
  subchapters?: FloatingAudioSubchapter[];
  startSeconds?: number;
};

export type FloatingAudioPlaybackState = 'loading' | 'playing' | 'paused' | 'ended' | 'error';
