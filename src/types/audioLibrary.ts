import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

export type AudioLibraryItem = {
  id: string;
  bookId: string;
  bookTitle: string;
  bookAuthor?: string;
  chapterNumber: number;
  chapterTitle: string;
  versionId: string;
  provider: 'default' | 'xai' | 'yandex';
  voice: string | null;
  audioUrl: string;
  srtUrl: string | null;
  hasSubtitles: boolean;
  bytes: number | null;
  durationSeconds: number | null;
  generatedAt: string;
  subchapters: FloatingAudioSubchapter[];
};

export type SubtitleCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};
