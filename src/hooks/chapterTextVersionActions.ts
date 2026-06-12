import {
  cancelChapterVersionAudio,
  createChapterTextVersion,
  deleteChapterTextVersion,
  deleteChapterVersionAudio,
  fetchChapterText,
  fetchChapterTextVersions,
  fetchChapterVersionAudioStatus,
  fetchChapterVersionText,
  generateChapterText,
  startChapterVersionAudio,
  type ChapterTextVersionsResult
} from '@/api/chapterTextVersions';
import type { ChapterAudioJobStatus } from '@/api/chapterAudio';
import { createActionHandlerRegistry } from '@/lib/actionHandlers';
import type { ChapterAudioProvider } from '@/types/app';

export type AudioJobStatus = ChapterAudioJobStatus;

type ChapterTextVersionPayloads = {
  loadChapterText: {
    bookId: string;
    chapterNumber: number;
  };
  loadTextVersions: {
    bookId: string;
    chapterNumber: number;
  };
  loadVersionText: {
    file: string;
    versionId: string;
  };
  loadAudioStatus: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  pollAudioJobStatus: {
    bookId: string;
    chapterNumber: number;
  };
  generateChapterText: {
    bookId: string;
    chapterNumber: number;
    pageStart: number;
    pageEnd: number;
  };
  generateAudio: {
    bookId: string;
    chapterNumber: number;
    voice: string;
    versionId: string;
    provider: ChapterAudioProvider;
    force: boolean;
  };
  createVersion: {
    bookId: string;
    chapterNumber: number;
    promptId: string | null;
    sourceVersionId: string;
    model: string;
    customPrompt: string;
    addToLibrary: boolean;
    promptName: string;
  };
  deleteVersion: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  cancelAudioJob: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
  deleteAudio: {
    bookId: string;
    chapterNumber: number;
    versionId: string;
  };
};

export type ChapterTextVersionActions = {
  setChapterLoading: (loading: boolean) => void;
  setVersionLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setAudioGenerating: (generating: boolean) => void;
  setAudioDeleting: (deleting: boolean) => void;
  setVersionSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setVersionError: (error: string | null) => void;
  setAudioError: (error: string | null) => void;
  setVersionStatus: (status: string | null) => void;
  setMissingFile: (file: string | null) => void;
  setChapterText: (text: string) => void;
  setSelectedText: (text: string) => void;
  setSelectedTextVersionId: (versionId: string | null) => void;
  applyTextVersions: (result: ChapterTextVersionsResult, mode: 'load' | 'create' | 'delete') => void;
  applyAudioStatus: (job: AudioJobStatus | null, currentVersionId: string) => void;
  setAudioJob: (job: AudioJobStatus | null) => void;
  clearAudioPoll: () => void;
  scheduleAudioPoll: (chapterNumber: number) => void;
  refreshChapter: () => void;
  reloadAudioStatus: () => Promise<void>;
  resetTextVersionDraft: () => void;
  markAudioDeleted: () => void;
  setCreateVersionSucceeded: (succeeded: boolean) => void;
};

export const chapterTextVersionHandlers = createActionHandlerRegistry<
  null,
  ChapterTextVersionActions,
  ChapterTextVersionPayloads
>();
const { addActionHandler } = chapterTextVersionHandlers;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getMissingFile(error: unknown) {
  return error instanceof Error ? (error as Error & { missingFile?: string }).missingFile ?? null : null;
}

addActionHandler('loadChapterText', async (_state, actions, payload): Promise<void> => {
  actions.setChapterLoading(true);
  actions.setError(null);
  actions.setMissingFile(null);
  try {
    actions.setChapterText(await fetchChapterText(payload.bookId, payload.chapterNumber));
  } catch (error) {
    actions.setChapterText('');
    actions.setMissingFile(getMissingFile(error));
    actions.setError(getErrorMessage(error, 'Unable to load chapter text.'));
  } finally {
    actions.setChapterLoading(false);
  }
});

addActionHandler('loadTextVersions', async (_state, actions, payload): Promise<void> => {
  actions.setVersionLoading(true);
  actions.setVersionError(null);
  try {
    actions.applyTextVersions(await fetchChapterTextVersions(payload.bookId, payload.chapterNumber), 'load');
  } catch (error) {
    actions.applyTextVersions({ latestVersionId: null, versions: [], promptLibrary: [] }, 'load');
    actions.setVersionError(getErrorMessage(error, 'Unable to load chapter text versions.'));
  } finally {
    actions.setVersionLoading(false);
  }
});

addActionHandler('loadVersionText', async (_state, actions, payload): Promise<void> => {
  actions.setVersionError(null);
  actions.setVersionLoading(true);
  actions.setSelectedText('');
  actions.setSelectedTextVersionId(null);
  try {
    actions.setSelectedText(await fetchChapterVersionText(payload.file));
    actions.setSelectedTextVersionId(payload.versionId);
  } catch (error) {
    actions.setSelectedText('');
    actions.setSelectedTextVersionId(null);
    actions.setVersionError(getErrorMessage(error, 'Unable to load chapter text version.'));
  } finally {
    actions.setVersionLoading(false);
  }
});

addActionHandler('loadAudioStatus', async (_state, actions, payload): Promise<void> => {
  try {
    const job = await fetchChapterVersionAudioStatus(payload);
    actions.applyAudioStatus(job, payload.versionId);
  } catch (error) {
    console.warn('Failed to load chapter audio status', error);
  }
});

addActionHandler('pollAudioJobStatus', async (_state, actions, payload): Promise<void> => {
  try {
    const job = await fetchChapterVersionAudioStatus(payload);
    if (!job?.status) {
      actions.clearAudioPoll();
      return;
    }
    actions.setAudioJob(job);
    if (job.status === 'completed') {
      actions.clearAudioPoll();
      await actions.reloadAudioStatus();
      return;
    }
    if (job.status === 'failed' || job.status === 'canceled') {
      actions.clearAudioPoll();
      return;
    }
    actions.scheduleAudioPoll(payload.chapterNumber);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to poll audio status.'));
    actions.scheduleAudioPoll(payload.chapterNumber);
  }
});

addActionHandler('generateChapterText', async (_state, actions, payload): Promise<void> => {
  actions.setGenerating(true);
  actions.setError(null);
  try {
    await generateChapterText(payload);
    actions.refreshChapter();
  } catch (error) {
    actions.setError(getErrorMessage(error, 'Unable to generate chapter text.'));
  } finally {
    actions.setGenerating(false);
  }
});

addActionHandler('generateAudio', async (_state, actions, payload): Promise<void> => {
  actions.setAudioGenerating(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    const job = await startChapterVersionAudio(payload);
    if (job?.status) {
      actions.setAudioJob(job);
    } else {
      actions.setVersionStatus('Audio job queued.');
    }
    actions.scheduleAudioPoll(payload.chapterNumber);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to generate chapter audio.'));
  } finally {
    actions.setAudioGenerating(false);
  }
});

addActionHandler('createVersion', async (_state, actions, payload): Promise<void> => {
  actions.setVersionSaving(true);
  actions.setCreateVersionSucceeded(false);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    actions.applyTextVersions(await createChapterTextVersion(payload), 'create');
    actions.setVersionStatus('Version saved.');
    actions.resetTextVersionDraft();
    await actions.reloadAudioStatus();
    actions.setCreateVersionSucceeded(true);
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to create chapter text version.'));
  } finally {
    actions.setVersionSaving(false);
  }
});

addActionHandler('deleteVersion', async (_state, actions, payload): Promise<void> => {
  actions.setVersionSaving(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    actions.applyTextVersions(await deleteChapterTextVersion(payload), 'delete');
    actions.setVersionStatus('Version deleted.');
    await actions.reloadAudioStatus();
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to delete chapter text version.'));
  } finally {
    actions.setVersionSaving(false);
  }
});

addActionHandler('cancelAudioJob', async (_state, actions, payload): Promise<void> => {
  actions.clearAudioPoll();
  try {
    actions.setAudioJob(await cancelChapterVersionAudio(payload.bookId, payload.chapterNumber, payload.versionId));
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to cancel chapter audio.'));
  }
});

addActionHandler('deleteAudio', async (_state, actions, payload): Promise<void> => {
  actions.setAudioDeleting(true);
  actions.setAudioError(null);
  actions.setVersionStatus(null);
  try {
    await deleteChapterVersionAudio(payload);
    actions.markAudioDeleted();
    actions.setVersionStatus('MP3 deleted.');
    await actions.reloadAudioStatus();
  } catch (error) {
    actions.setAudioError(getErrorMessage(error, 'Unable to delete chapter audio.'));
  } finally {
    actions.setAudioDeleting(false);
  }
});
