import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';

type ChapterRange = {
  start: number;
  end: number;
} | null;

type AudioJobStatus = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
  versionId?: string | null;
};

type ChapterAudioStatusEntry = {
  chapterNumber: number;
  latestVersionId?: string | null;
  audio?: { ready?: boolean; url?: string | null; versionId?: string | null };
};

type UseChapterTextVersionsOptions = {
  bookId: string | null;
  chapterNumber: number | null;
  chapterRange: ChapterRange;
  refreshToken?: number;
  streamVoice: string;
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
  streamVoice
}: UseChapterTextVersionsOptions) {
  const [chapterText, setChapterText] = useState('');
  const [selectedText, setSelectedText] = useState('');
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
  const [audioError, setAudioError] = useState<string | null>(null);
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionStatus, setVersionStatus] = useState<string | null>(null);
  const [chapterAudioReady, setChapterAudioReady] = useState(false);
  const [chapterAudioVersionId, setChapterAudioVersionId] = useState<string | null>(null);
  const [chapterAudioUrl, setChapterAudioUrl] = useState<string | null>(null);
  const [audioJob, setAudioJob] = useState<AudioJobStatus | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState('');
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
      return;
    }
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/audio`);
      if (!response.ok) {
        throw new Error(`Audio status failed: ${response.status}`);
      }
      const payload = (await response.json()) as {
        chapters?: ChapterAudioStatusEntry[];
      };
      const entry = Array.isArray(payload.chapters)
        ? payload.chapters.find((item) => item.chapterNumber === chapterNumber)
        : null;
      const audioVersionId = entry?.audio?.versionId ?? null;
      const currentVersionId = selectedVersionId || entry?.latestVersionId || 'base';
      setChapterAudioVersionId(audioVersionId);
      setChapterAudioReady(Boolean(entry?.audio?.ready) && audioVersionId === currentVersionId);
      setChapterAudioUrl(entry?.audio?.url ?? null);
    } catch (err) {
      console.warn('Failed to load chapter audio status', err);
    }
  }, [bookId, chapterNumber, selectedVersionId]);

  const loadTextVersions = useCallback(async () => {
    if (!bookId || !chapterNumber) {
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
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
      setVersions([]);
      setPromptLibrary([]);
      setSelectedVersionId('base');
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
      return;
    }
    void loadTextVersions();
  }, [bookId, chapterNumber, loadTextVersions, localRefreshToken, missingFile, refreshToken]);

  useEffect(() => {
    if (!bookId || !chapterNumber || !selectedVersion) {
      setSelectedText('');
      return;
    }
    if (selectedVersion.id === 'base') {
      setSelectedText(chapterText);
      return;
    }
    let canceled = false;
    setVersionError(null);
    setVersionLoading(true);
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
        }
      })
      .catch((err) => {
        if (!canceled) {
          setSelectedText('');
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
          status: job.status,
          error: job.error ?? null,
          audioUrl: job.audioUrl ?? null,
          versionId: job.versionId ?? null
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

  const displayText = selectedVersionId === 'base' ? chapterText : selectedText;
  const displayLoading = loading || versionLoading;
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

  const handleGenerateAudio = useCallback(async () => {
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
          body: JSON.stringify({ voice: streamVoice, versionId: selectedVersionId })
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
          status: payload.job.status,
          error: payload.job.error ?? null,
          audioUrl: payload.job.audioUrl ?? null,
          versionId: payload.job.versionId ?? selectedVersionId
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
  }, [audioGenerating, bookId, canGenerateAudio, chapterNumber, scheduleAudioPoll, selectedVersionId, streamVoice]);

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
      setSelectedVersionId(
        payload.createdVersionId ?? payload.latestVersionId ?? nextVersions[nextVersions.length - 1]?.id ?? 'base'
      );
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
      setAudioJob({ status: 'canceled', error: null, audioUrl: null, versionId: selectedVersionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to cancel chapter audio.';
      setAudioError(message);
    }
  }, [bookId, chapterNumber, clearAudioPoll, selectedVersionId]);

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
    audioError,
    versionSaving,
    versionStatus,
    chapterAudioReady,
    chapterAudioVersionId,
    chapterAudioUrl,
    audioJob,
    isAudioJobActive,
    canCreateVersion,
    canGenerateAudio,
    handleGenerate,
    handleGenerateAudio,
    handleCreateVersion,
    handleDeleteVersion,
    handleCancelAudioJob
  };
}
