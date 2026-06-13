import { useMemo } from 'react';
import type { AudioChapter, ChapterAudioJobStatus } from '@/api/chapterAudio';
import type { ChapterAudioProvider, ChapterTextVersion } from '@/types/app';

type ChapterStatus = {
  audioReady: boolean;
  latestVersionId: string;
  audioVersionId: string | null;
};

export type AudioViewRow = {
  actionDisabled: boolean;
  audioReady: boolean;
  entry: AudioChapter;
  errorMessage: string | null;
  generateLabel: string;
  isAudioJobActive: boolean;
  jobStatus: ChapterAudioJobStatus | undefined;
  key: string;
  latestVersionId: string;
  playDisabled: boolean;
  showAction: boolean;
  textVersions: ChapterTextVersion[];
};

function getGenerateLabel({
  actionLabel,
  isAudioJobActive,
  selectedMp3Provider
}: {
  actionLabel: string;
  isAudioJobActive: boolean;
  selectedMp3Provider: ChapterAudioProvider;
}) {
  if (isAudioJobActive) {
    return actionLabel;
  }
  if (selectedMp3Provider === 'yandex') {
    return 'Generate Yandex';
  }
  if (selectedMp3Provider === 'xai') {
    return 'Generate xAI';
  }
  return 'Generate audio';
}

export function useAudioViewRows({
  audioBusy,
  audioDeleting,
  audioJobs,
  chapters,
  errorMap,
  selectedMp3Provider,
  statusMap
}: {
  audioBusy: Record<number, boolean>;
  audioDeleting: Record<number, boolean>;
  audioJobs: Record<number, ChapterAudioJobStatus>;
  chapters: AudioChapter[];
  errorMap: Record<number, string | null>;
  selectedMp3Provider: ChapterAudioProvider;
  statusMap: Record<number, ChapterStatus>;
}) {
  return useMemo(
    () =>
      chapters.map((entry): AudioViewRow => {
        const chapterStatus = statusMap[entry.chapterNumber];
        const latestVersionId = chapterStatus?.latestVersionId ?? entry.latestVersionId ?? 'base';
        const audioReady =
          (chapterStatus?.audioReady ?? false) &&
          (chapterStatus?.audioVersionId ?? entry.audio?.versionId ?? null) === latestVersionId;
        const jobStatus = audioJobs[entry.chapterNumber];
        const isAudioJobActive = jobStatus?.status === 'queued' || jobStatus?.status === 'running';
        const actionLabel = isAudioJobActive
          ? jobStatus?.status === 'queued'
            ? 'Queued…'
            : 'Generating…'
          : audioBusy[entry.chapterNumber]
            ? 'Starting…'
            : 'Generate audio';

        return {
          actionDisabled:
            audioBusy[entry.chapterNumber] || audioDeleting[entry.chapterNumber] || isAudioJobActive,
          audioReady,
          entry,
          errorMessage: errorMap[entry.chapterNumber] ?? null,
          generateLabel: getGenerateLabel({
            actionLabel,
            isAudioJobActive,
            selectedMp3Provider
          }),
          isAudioJobActive,
          jobStatus,
          key: `${entry.title}-${entry.page}-${entry.chapterNumber}`,
          latestVersionId,
          playDisabled: Boolean(audioDeleting[entry.chapterNumber]),
          showAction: !audioReady,
          textVersions: entry.textVersions ?? []
        };
      }),
    [audioBusy, audioDeleting, audioJobs, chapters, errorMap, selectedMp3Provider, statusMap]
  );
}
