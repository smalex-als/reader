import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';
import type { FloatingAudioSubchapter } from '@/types/floatingAudio';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type AudioJobStatus = {
  provider?: 'default' | 'xai' | 'yandex';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
  versionId?: string | null;
  subchapters?: FloatingAudioSubchapter[];
  progress?: {
    percent: number;
    current: number;
    total: number;
    label?: string | null;
  } | null;
};

type UseChapterTextVersionsOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
  refreshToken?: number;
  mp3Voice: string;
};

function formatChapterFilename(chapterNumber: number) {
  return `chapter${String(chapterNumber).padStart(3, '0')}.txt`;
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function useChapterTextVersions({
  bookId,
  chapterNumber,
  chapterRange,
  refreshToken = 0,
  mp3Voice
}: UseChapterTextVersionsOptions) {
  const [chapterText, setChapterText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [selectedTextVersionId, setSelectedTextVersionId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ChapterTextVersion[]>([]);
  const [promptLibrary, setPromptLibrary] = useState<ChapterTextPrompt[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState('base');
  const [loading, setLoading] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingFile, setMissingFile] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [localRefreshToken, setLocalRefreshToken] = useState(0);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [audioDeleting, setAudioDeleting] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterAudioVersionId, setChapterAudioVersionId] = useState<string | null>(null);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [chapterAudioSubchapters, setChapterAudioSubchapters] = useState<FloatingAudioSubchapter[]>([]);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [sourceVersionId, setSourceVersionId] = useState('base');
  const [versionModel, setVersionModel] = useState('gpt-5.5');
  const [customPrompt, setCustomPrompt] = useState('');
  const [promptName, setPromptName] = useState('');
  const [savePromptToLibrary, setSavePromptToLibrary] = useState(false);
  const audioPollTimers = useRef<Map<number, number>>(new Map());
  const audioPollAttempts = useRef<Map<number, number>>(new Map());
  const audioPollRef = useRef<(chapterNumber: number) => void>();

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedVersionId) ?? versions[0] ?? null,
    [selectedVersionId, versions]
  );

  const loadChapterAudioStatus = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setChapterAudioSubchapters([]);
      return;
    }
    try {
      const params = new URLSearchParams({ versionId: selectedVersionId || 'base' });
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/status?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Audio status failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        job?: AudioJobStatus | null;
      };
      const job = payload.job ?? null;
      const audioVersionId = job?.status === 'completed' ? job.versionId ?? null : null;
      const currentVersionId = selectedVersionId || 'base';
      setChapterAudioVersionId(audioVersionId);
      setChapterAudioReady(Boolean(job?.audioUrl) && audioVersionId === currentVersionId);
      setChapterAudioUrl(job?.audioUrl ?? null);
      setChapterAudioSubchapters(job?.subchapters ?? []);
    } catch (err) {
      console.warn('Failed to load chapter audio status', err);
    }
  }, [bookId, chapterNumber, selectedVersionId]);

  const loadTextVersions = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      setVersionError(null);
      setVersionLoading(false);
      return;
    }
    setVersionLoading(true);
    setVersionError(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions`
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      const nextSelectedVersionId =
        payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base';
      setSelectedVersionId((current) =>
        current && nextVersions.some((version) => version.id === current) ? current : nextSelectedVersionId
      );
      setSourceVersionId((current) =>
        current && nextVersions.some((version) => version.id === current) ? current : nextSelectedVersionId
      );
      setSelectedPromptId((current) => current || payload.promptLibrary?.[0]?.id || 'narration-default');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load chapter text versions.';
      setVersions([]);
      setPromptLibrary([]);
      setVersionError(message);
    } finally {
      setVersionLoading(false);
    }
  }, [bookId, chapterNumber]);

  useEffect(() => {
    if (!bookId || !chapterNumber) {
      setChapterText('');
      setSelectedText('');
      setSelectedTextVersionId(null);
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      setError(null);
      setMissingFile(null);
      setLoading(false);
      setVersionLoading(false);
      setVersionError(null);
      setAudioGenerating(false);
      setAudioError(null);
      setVersionSaving(false);
      setVersionStatus(null);
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setAudioJob(null);
      return;
    }

    let canceled = false;
    const filename = formatChapterFilename(chapterNumber);
    const url = `/data/${encodeURIComponent(bookId)}/${filename}`;

    setChapterText('');
    setSelectedText('');
    setSelectedTextVersionId(null);
    setLoading(true);
    setError(null);
    setMissingFile(null);
    setVersionStatus(null);

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            const err = new Error('Chapter text not found.');
            (err as Error & { missingFile?: string }).missingFile = filename;
            throw err;
          }
          throw new Error('Failed to load chapter.');
        }
        return response.text();
      })
      .then((text) => {
        if (!canceled) {
          setChapterText(text.trim());
        }
      })
      .catch((err: Error & { missingFile?: string }) => {
        if (!canceled) {
          setChapterText('');
          setMissingFile(err.missingFile ?? null);
          setError(err.message || 'Unable to load chapter text.');
        }
      })
      .finally(() => {
        if (!canceled) {
          setLoading(false);
        }
      });

    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, refreshToken, localRefreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || missingFile) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
      setSourceVersionId('base');
      return;
    }
    void loadTextVersions();
  }, [bookId, chapterNumber, loadTextVersions, localRefreshToken, missingFile, refreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || !selectedVersion) {
      setSelectedText('');
      setSelectedTextVersionId(null);
      return;
    }
    if (selectedVersion.id === 'base') {
      setSelectedText(chapterText);
      setSelectedTextVersionId('base');
      return;
    }
    let canceled = false;
    setVersionError(null);
    setVersionLoading(true);
    setSelectedText('');
    setSelectedTextVersionId(null);
    fetch(selectedVersion.file)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load version (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        if (!canceled) {
          setSelectedText(text.trim());
          setSelectedTextVersionId(selectedVersion.id);
        }
      })
      .catch((err) => {
        if (!canceled) {
          setSelectedText('');
          setSelectedTextVersionId(null);
          setVersionError(err instanceof Error ? err.message : 'Unable to load chapter text version.');
        }
      })
      .finally(() => {
        if (!canceled) {
          setVersionLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [bookId, chapterNumber, chapterText, selectedVersion]);

  useEffect(() => {
    void loadChapterAudioStatus();
  }, [loadChapterAudioStatus]);

  const clearAudioPoll = useCallback(() => {
    audioPollTimers.current.forEach((timer) => window.clearTimeout(timer));
    audioPollTimers.current.clear();
    audioPollAttempts.current.clear();
  }, []);

  useEffect(() => {
    setAudioJob(null);
    clearAudioPoll();
  }, [bookId, chapterNumber, clearAudioPoll]);

  const scheduleAudioPoll = useCallback((currentChapter: number) => {
    const attempt = (audioPollAttempts.current.get(currentChapter) ?? 0) + 1;
    audioPollAttempts.current.set(currentChapter, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      audioPollRef.current?.(currentChapter);
    }, delay);
    audioPollTimers.current.set(currentChapter, timer);
  }, []);

  const pollAudioJobStatus = useCallback(
    async (currentChapter: number) => {
      if (!bookId || !currentChapter) {
        return;
      }
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${currentChapter}/audio/status`
        );
        if (!response.ok) {
          throw new Error(`Audio status failed: ${response.status}`);
        }
        const payload = (await response.json()) as {
          job?: AudioJobStatus;
        };
        const job = payload?.job;
        if (!job?.status) {
          clearAudioPoll();
          return;
        }
        setAudioJob({
          provider: job.provider ?? undefined,
          status: job.status,
          error: job.error ?? null,
          audioUrl: job.audioUrl ?? null,
          versionId: job.versionId ?? null,
          subchapters: job.subchapters ?? [],
          progress: job.progress ?? null
        });
        if (job.status === 'completed') {
          clearAudioPoll();
          await loadChapterAudioStatus();
          return;
        }
        if (job.status === 'failed' || job.status === 'canceled') {
          clearAudioPoll();
          return;
        }
        scheduleAudioPoll(currentChapter);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to poll audio status.';
        setAudioError(message);
        scheduleAudioPoll(currentChapter);
      }
    },
    [bookId, clearAudioPoll, loadChapterAudioStatus, scheduleAudioPoll]
  );

  useEffect(() => {
    audioPollRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  const derivedTextPending = Boolean(
    bookId &&
      chapterNumber &&
      selectedVersionId !== 'base' &&
      selectedVersion &&
      selectedTextVersionId !== selectedVersionId &&
      !versionError
  );
  const displayText =
    selectedVersionId === 'base'
      ? chapterText
      : selectedTextVersionId === selectedVersionId
        ? selectedText
        : '';
  const displayLoading = loading || versionLoading || derivedTextPending;
  const displayError = error || versionError;
  const canGenerate = Boolean(bookId && chapterNumber && chapterRange);
  const canCreateVersion = Boolean(bookId && chapterNumber && chapterText && !missingFile && !loading);
  const canGenerateAudio = Boolean(bookId && chapterNumber && displayText && !displayLoading);
  const isAudioJobActive = audioJob?.status === 'queued' || audioJob?.status === 'running';
  const selectedPromptTemplate =
    customPrompt || promptLibrary.find((prompt) => prompt.id === selectedPromptId)?.template || '';

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !bookId || !chapterNumber || !chapterRange || generating) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/chapters/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageStart: chapterRange.start,
          pageEnd: chapterRange.end,
          chapterNumber
        })
      });
      if (!response.ok) {
        throw new Error(`Generate failed: ${response.status}`);
      }
      setLocalRefreshToken((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter text.';
      setError(message);
    } finally {
      setGenerating(false);
    }
  }, [bookId, canGenerate, chapterNumber, chapterRange, generating]);

  const handleGenerateAudioWithProvider = useCallback(async (provider: 'default' | 'xai' | 'yandex') => {
    if (!canGenerateAudio || !bookId || !chapterNumber || audioGenerating) {
      return;
    }
    setAudioGenerating(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voice: mp3Voice,
            versionId: selectedVersionId,
            provider,
            force: chapterAudioReady && chapterAudioVersionId === selectedVersionId
          })
        }
      );
      if (!response.ok) {
        throw new Error(`Audio generation failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        job?: AudioJobStatus;
      };
      if (payload?.job?.status) {
        setAudioJob({
          provider: payload.job.provider ?? provider,
          status: payload.job.status,
          error: payload.job.error ?? null,
          audioUrl: payload.job.audioUrl ?? null,
          versionId: payload.job.versionId ?? selectedVersionId,
          progress: payload.job.progress ?? null
        });
        scheduleAudioPoll(chapterNumber);
      } else {
        setVersionStatus('Audio job queued.');
        scheduleAudioPoll(chapterNumber);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to generate chapter audio.';
      setAudioError(message);
    } finally {
      setAudioGenerating(false);
    }
  }, [
    audioGenerating,
    bookId,
    canGenerateAudio,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterNumber,
    mp3Voice,
    scheduleAudioPoll,
    selectedVersionId
  ]);

  const handleGenerateAudio = useCallback(() => {
    const provider = mp3Voice.startsWith('xai_') ? 'xai' : mp3Voice.startsWith('yandex_') ? 'yandex' : 'default';
    return handleGenerateAudioWithProvider(provider);
  }, [handleGenerateAudioWithProvider, mp3Voice]);

  const handleCreateVersion = useCallback(async () => {
    if (!canCreateVersion || !bookId || !chapterNumber || versionSaving) {
      return;
    }
    setVersionSaving(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptId: selectedPromptId || null,
            sourceVersionId,
            model: versionModel,
            customPrompt,
            addToLibrary: savePromptToLibrary,
            promptName
          })
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        createdVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      const nextVersionId =
        payload.createdVersionId ?? payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base';
      setSelectedVersionId(nextVersionId);
      setSourceVersionId(nextVersionId);
      setVersionStatus('Version saved.');
      setCustomPrompt('');
      setPromptName('');
      setSavePromptToLibrary(false);
      await loadChapterAudioStatus();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create chapter text version.';
      setAudioError(message);
      return false;
    } finally {
      setVersionSaving(false);
    }
  }, [
    bookId,
    canCreateVersion,
    chapterNumber,
    customPrompt,
    loadChapterAudioStatus,
    promptName,
    savePromptToLibrary,
    selectedPromptId,
    sourceVersionId,
    versionModel,
    versionSaving
  ]);

  const handleDeleteVersion = useCallback(async () => {
    if (!bookId || !chapterNumber || !selectedVersion || !selectedVersion.deletable || versionSaving) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedVersion.label}?`);
    if (!confirmed) {
      return;
    }
    setVersionSaving(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/text-versions/${selectedVersion.id}`,
        {
          method: 'DELETE'
        }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as {
        latestVersionId?: string;
        versions?: ChapterTextVersion[];
        promptLibrary?: ChapterTextPrompt[];
      };
      const nextVersions = Array.isArray(payload.versions) ? payload.versions : [];
      setVersions(nextVersions);
      setPromptLibrary(Array.isArray(payload.promptLibrary) ? payload.promptLibrary : []);
      setSelectedVersionId(payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base');
      setVersionStatus('Version deleted.');
      await loadChapterAudioStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete chapter text version.';
      setAudioError(message);
    } finally {
      setVersionSaving(false);
    }
  }, [bookId, chapterNumber, loadChapterAudioStatus, selectedVersion, versionSaving]);

  const handleCancelAudioJob = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      return;
    }
    clearAudioPoll();
    try {
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/cancel`,
        { method: 'POST' }
      );
      if (!response.ok) {
        throw new Error(`Audio cancel failed: ${response.status}`);
      }
      setAudioJob({ status: 'canceled', error: null, audioUrl: null, versionId: selectedVersionId, progress: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel chapter audio.';
      setAudioError(message);
    }
  }, [bookId, chapterNumber, clearAudioPoll, selectedVersionId]);

  const handleDeleteAudio = useCallback(async () => {
    if (!bookId || !chapterNumber || !chapterAudioUrl || audioDeleting || isAudioJobActive) {
      return;
    }
    const targetVersionId = chapterAudioVersionId || selectedVersionId || 'base';
    const confirmed = window.confirm('Delete generated MP3 for this chapter?');
    if (!confirmed) {
      return;
    }
    setAudioDeleting(true);
    setAudioError(null);
    setVersionStatus(null);
    try {
      const params = new URLSearchParams({ versionId: targetVersionId });
      const response = await fetch(
        `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio?${params.toString()}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      setChapterAudioReady(false);
      setChapterAudioVersionId(null);
      setChapterAudioUrl(null);
      setAudioJob(null);
      setVersionStatus('MP3 deleted.');
      await loadChapterAudioStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to delete chapter audio.';
      setAudioError(message);
    } finally {
      setAudioDeleting(false);
    }
  }, [
    audioDeleting,
    bookId,
    chapterAudioUrl,
    chapterAudioVersionId,
    chapterNumber,
    isAudioJobActive,
    loadChapterAudioStatus,
    selectedVersionId
  ]);

  return {
    chapterText,
    displayText,
    displayLoading,
    displayError,
    versions,
    promptLibrary,
    selectedVersion,
    selectedVersionId,
    setSelectedVersionId,
    sourceVersionId,
    setSourceVersionId,
    versionModel,
    setVersionModel,
    selectedPromptId,
    setSelectedPromptId,
    customPrompt,
    setCustomPrompt,
    promptName,
    setPromptName,
    savePromptToLibrary,
    setSavePromptToLibrary,
    selectedPromptTemplate,
    generating,
    canGenerate,
    missingFile,
    audioGenerating,
    audioDeleting,
    audioError,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    chapterAudioSubchapters,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    canGenerateAudio,
    handleGenerate,
    handleGenerateAudio,
    handleDeleteAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  };
}
