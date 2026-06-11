import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterTextVersion, TocEntry, ToastMessage } from '@/types/app';
import type { FloatingAudioSubchapter, FloatingAudioTrack } from '@/types/floatingAudio';
import TrashIcon from '@/components/TrashIcon';

interface AudioViewProps {
  bookId: string | null;
  tocEntries: TocEntry[];
  tocLoading: boolean;
  mp3Voice: string;
  mp3VoiceOptions: readonly { id: string; label: string }[];
  onMp3VoiceChange: (voice: string) => void;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
  onOpenChapterText: (pageIndex: number, versionId?: string, chapterNumber?: number) => void;
  onPlayAudio: (payload: FloatingAudioTrack) => void;
}

type ChapterStatus = {
  audioReady: boolean;
  latestVersionId: string;
  audioVersionId: string | null;
};

type AudioChapter = {
  chapterNumber: number;
  title: string;
  page: number;
  latestVersionId: string;
  textVersions?: ChapterTextVersion[];
  audio: {
    ready: boolean;
    url: string;
    srtUrl?: string | null;
    versionId?: string | null;
    durationSeconds?: number | null;
    provider?: 'default' | 'xai' | 'yandex';
    subchapters?: FloatingAudioSubchapter[];
  };
};

type AudioJobStatus = {
  provider?: 'default' | 'xai' | 'yandex';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
  subchapters?: FloatingAudioSubchapter[];
  progress?: {
    percent: number;
    current: number;
    total: number;
    label?: string | null;
  } | null;
};

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function AudioView({
  bookId,
  tocEntries,
  tocLoading,
  mp3Voice,
  mp3VoiceOptions,
  onMp3VoiceChange,
  showToast,
  onOpenChapterText,
  onPlayAudio
}: AudioViewProps) {
  const [statusMap, setStatusMap] = useState<Record<number, ChapterStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [audioBusy, setAudioBusy] = useState<Record<number, boolean>>({});
  const [audioDeleting, setAudioDeleting] = useState<Record<number, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({});
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [audioJobs, setAudioJobs] = useState<Record<number, AudioJobStatus>>({});
  const pollTimers = useRef<Map<number, number>>(new Map());
  const pollAttempts = useRef<Map<number, number>>(new Map());
  const pollAudioJobStatusRef = useRef<(chapterNumber: number) => void>();

  const loadAudioStatus = useCallback(async () => {
    if (!bookId) {
      setChapters([]);
      setStatusMap({});
      return;
    }
    setStatusLoading(true);
    try {
      const response = await fetch(`/api/books/${encodeURIComponent(bookId)}/audio`);
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as { chapters?: AudioChapter[] };
      const nextChapters = Array.isArray(payload.chapters) ? payload.chapters : [];
      setChapters(nextChapters);
      const nextStatus: Record<number, ChapterStatus> = {};
      nextChapters.forEach((chapter) => {
        nextStatus[chapter.chapterNumber] = {
          audioReady: Boolean(chapter.audio?.ready),
          latestVersionId: chapter.latestVersionId ?? 'base',
          audioVersionId: chapter.audio?.versionId ?? null
        };
      });
      setStatusMap(nextStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load audio status.';
      showToast(message, 'error');
    } finally {
      setStatusLoading(false);
    }
  }, [bookId, showToast]);

  useEffect(() => {
    if (!bookId || tocEntries.length === 0) {
      setChapters([]);
      setStatusMap({});
      setStatusLoading(false);
      setAudioJobs({});
      return;
    }
    void loadAudioStatus();
  }, [bookId, loadAudioStatus, tocEntries.length]);

  const clearPoll = useCallback((chapterNumber: number) => {
    const timer = pollTimers.current.get(chapterNumber);
    if (timer) {
      window.clearTimeout(timer);
    }
    pollTimers.current.delete(chapterNumber);
    pollAttempts.current.delete(chapterNumber);
  }, []);

  const schedulePoll = useCallback((chapterNumber: number) => {
    const attempt = (pollAttempts.current.get(chapterNumber) ?? 0) + 1;
    pollAttempts.current.set(chapterNumber, attempt);
    const delay = Math.min(1000 * 2 ** (attempt - 1), 10000);
    const timer = window.setTimeout(() => {
      pollAudioJobStatusRef.current?.(chapterNumber);
    }, delay);
    pollTimers.current.set(chapterNumber, timer);
  }, []);

  const pollAudioJobStatus = useCallback(
    async (chapterNumber: number) => {
      if (!bookId) {
        return;
      }
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/status`
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as {
          job?: {
            provider?: AudioJobStatus['provider'];
            status?: AudioJobStatus['status'];
            error?: string | null;
            audioUrl?: string | null;
            subchapters?: FloatingAudioSubchapter[];
            progress?: AudioJobStatus['progress'];
          };
        };
        const job = payload?.job;
        const status = job?.status;
        if (!status) {
          clearPoll(chapterNumber);
          return;
        }
        setAudioJobs((prev) => ({
          ...prev,
          [chapterNumber]: {
            provider: job.provider ?? undefined,
            status,
            error: job.error ?? null,
            audioUrl: job.audioUrl ?? null,
            subchapters: job.subchapters ?? [],
            progress: job.progress ?? null
          }
        }));
        if (status === 'completed') {
          clearPoll(chapterNumber);
          await loadAudioStatus();
          return;
        }
        if (status === 'failed' || status === 'canceled') {
          clearPoll(chapterNumber);
          return;
        }
        schedulePoll(chapterNumber);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to read audio job status.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
        schedulePoll(chapterNumber);
      }
    },
    [bookId, clearPoll, loadAudioStatus, schedulePoll]
  );

  useEffect(() => {
    pollAudioJobStatusRef.current = pollAudioJobStatus;
  }, [pollAudioJobStatus]);

  const handleGenerateAudio = useCallback(
    async (chapterNumber: number, versionId: string, provider: 'default' | 'xai' | 'yandex' = 'default') => {
      if (!bookId || audioBusy[chapterNumber]) {
        return;
      }
      setAudioBusy((prev) => ({ ...prev, [chapterNumber]: true }));
      setErrorMap((prev) => ({ ...prev, [chapterNumber]: null }));
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              voice: mp3Voice,
              versionId,
              provider
            })
          }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as {
          job?: {
            provider?: AudioJobStatus['provider'];
            status?: AudioJobStatus['status'];
            error?: string | null;
            audioUrl?: string | null;
            subchapters?: FloatingAudioSubchapter[];
            progress?: AudioJobStatus['progress'];
          };
        };
        const job = payload?.job;
        const status = job?.status;
        if (status) {
          setAudioJobs((prev) => ({
            ...prev,
            [chapterNumber]: {
              provider: job.provider ?? provider,
              status,
              error: job.error ?? null,
              audioUrl: job.audioUrl ?? null,
              subchapters: job.subchapters ?? [],
              progress: job.progress ?? null
            }
          }));
          schedulePoll(chapterNumber);
        } else {
          showToast(`Audio job queued for chapter ${chapterNumber}`, 'success');
          schedulePoll(chapterNumber);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to generate audio.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      } finally {
        setAudioBusy((prev) => ({ ...prev, [chapterNumber]: false }));
      }
    },
    [audioBusy, bookId, mp3Voice, schedulePoll, showToast]
  );

  const handleCancelAudioJob = useCallback(
    async (chapterNumber: number) => {
      if (!bookId) {
        return;
      }
      clearPoll(chapterNumber);
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio/cancel`,
          { method: 'POST' }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        setAudioJobs((prev) => ({
          ...prev,
          [chapterNumber]: { status: 'canceled', error: null, audioUrl: null }
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to cancel audio job.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      }
    },
    [bookId, clearPoll]
  );

  const handleDeleteAudio = useCallback(
    async (chapterNumber: number, versionId: string) => {
      if (!bookId || audioDeleting[chapterNumber]) {
        return;
      }
      const confirmed = window.confirm(`Delete generated MP3 for chapter ${chapterNumber}?`);
      if (!confirmed) {
        return;
      }
      setAudioDeleting((prev) => ({ ...prev, [chapterNumber]: true }));
      setErrorMap((prev) => ({ ...prev, [chapterNumber]: null }));
      try {
        const params = new URLSearchParams({ versionId });
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/audio?${params.toString()}`,
          { method: 'DELETE' }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        setAudioJobs((prev) => {
          const next = { ...prev };
          delete next[chapterNumber];
          return next;
        });
        setStatusMap((prev) => ({
          ...prev,
          [chapterNumber]: {
            ...(prev[chapterNumber] ?? { latestVersionId: versionId }),
            audioReady: false,
            audioVersionId: null
          }
        }));
        setChapters((prev) =>
          prev.map((chapter) =>
            chapter.chapterNumber === chapterNumber
              ? {
                  ...chapter,
                  audio: {
                    ...chapter.audio,
                    ready: false,
                    url: '',
                    versionId: null,
                    durationSeconds: null,
                    subchapters: []
                  }
                }
              : chapter
          )
        );
        showToast(`Deleted MP3 for chapter ${chapterNumber}`, 'success');
        await loadAudioStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to delete audio.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      } finally {
        setAudioDeleting((prev) => ({ ...prev, [chapterNumber]: false }));
      }
    },
    [audioDeleting, bookId, loadAudioStatus, showToast]
  );

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => window.clearTimeout(timer));
      pollTimers.current.clear();
      pollAttempts.current.clear();
    };
  }, []);

  return (
    <div className="audio-viewer">
      <header className="audio-viewer-header">
        <div className="audio-viewer-title">
          <span className="audio-viewer-label">Audio</span>
          <h2 className="audio-viewer-heading">Chapter narration & audio</h2>
        </div>
        <div className="audio-viewer-meta">
          {tocLoading
            ? 'Loading table of contents…'
            : `${chapters.length} chapter${chapters.length === 1 ? '' : 's'}`}
        </div>
        {mp3VoiceOptions.length > 0 ? (
          <label className="toolbar-field">
            MP3 voice
            <select
              className="select"
              value={mp3Voice}
              onChange={(event) => onMp3VoiceChange(event.target.value)}
            >
              {mp3VoiceOptions.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      <section className="audio-viewer-body">
        {tocLoading || statusLoading ? (
          <p className="audio-viewer-status">Loading audio status…</p>
        ) : null}
        {!tocLoading && !statusLoading && chapters.length === 0 ? (
          <p className="audio-viewer-status">No chapters found. Use Edit TOC to add them.</p>
        ) : null}
        {!tocLoading && chapters.length > 0 ? (
          <div className="audio-list">
            {chapters.map((entry) => {
              const chapterStatus = statusMap[entry.chapterNumber];
              const latestVersionId = chapterStatus?.latestVersionId ?? entry.latestVersionId ?? 'base';
              const textVersions = entry.textVersions ?? [];
              const audioReady =
                (chapterStatus?.audioReady ?? false) &&
                (chapterStatus?.audioVersionId ?? entry.audio?.versionId ?? null) === latestVersionId;
              const jobStatus = audioJobs[entry.chapterNumber];
              const isAudioJobActive =
                jobStatus?.status === 'queued' || jobStatus?.status === 'running';
              const showAction = !audioReady;
              const actionLabel = isAudioJobActive
                ? jobStatus?.status === 'queued'
                  ? 'Queued…'
                  : 'Generating…'
                : audioBusy[entry.chapterNumber]
                ? 'Starting…'
                : 'Generate audio';
              const actionDisabled =
                audioBusy[entry.chapterNumber] || audioDeleting[entry.chapterNumber] || isAudioJobActive;
              const selectedMp3Provider = mp3Voice.startsWith('xai_')
                ? 'xai'
                : mp3Voice.startsWith('yandex_')
                  ? 'yandex'
                  : 'default';
              const generateLabel = isAudioJobActive
                ? actionLabel
                : selectedMp3Provider === 'yandex'
                  ? 'Generate Yandex'
                  : selectedMp3Provider === 'xai'
                    ? 'Generate xAI'
                    : 'Generate audio';
              return (
                <article key={`${entry.title}-${entry.page}-${entry.chapterNumber}`} className="audio-row">
                  <div className="audio-row-main">
                    <div className="audio-row-title">
                      <span className="audio-row-chapter">Chapter {entry.chapterNumber}</span>
                      <button
                        type="button"
                        className="audio-row-title-link audio-row-link"
                        onClick={() => onOpenChapterText(entry.page)}
                      >
                        {entry.title}
                      </button>
                    </div>
                    {textVersions.length > 0 ? (
                      <div className="audio-row-versions" aria-label={`Text versions for chapter ${entry.chapterNumber}`}>
                        <span className="audio-row-versions-label">Text versions</span>
                        {textVersions.map((version) => {
                          const isLatest = version.id === latestVersionId;
                          return (
                            <button
                              key={version.id}
                              type="button"
                              className={`audio-version-chip ${isLatest ? 'audio-version-chip-active' : ''}`}
                              onClick={() => onOpenChapterText(entry.page, version.id, entry.chapterNumber)}
                              title={version.promptName ? `${version.label} · ${version.promptName}` : version.label}
                            >
                              <span>{version.label}</span>
                              {version.promptName ? <small>{version.promptName}</small> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="audio-row-actions">
                    {showAction ? (
                      <>
                        <button
                          type="button"
                          className="button"
                          onClick={() =>
                            void handleGenerateAudio(
                              entry.chapterNumber,
                              latestVersionId,
                              selectedMp3Provider
                            )
                          }
                          disabled={actionDisabled}
                        >
                          {generateLabel}
                        </button>
                      </>
                    ) : null}
                    {isAudioJobActive ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => handleCancelAudioJob(entry.chapterNumber)}
                      >
                        Cancel
                      </button>
                    ) : null}
                    {audioReady && entry.audio?.url ? (
                      <>
                        <button
                          type="button"
                          className="button audio-native-play"
                          onClick={() =>
                            onPlayAudio({
                              title: entry.title,
                              subtitle: `Chapter ${entry.chapterNumber}`,
                              url: entry.audio.url,
                              srtUrl: entry.audio.srtUrl ?? null,
                              chapterNumber: entry.chapterNumber,
                              versionId: latestVersionId,
                              subchapters: entry.audio.subchapters ?? []
                            })
                          }
                          disabled={audioDeleting[entry.chapterNumber]}
                        >
                          ▶ Play
                        </button>
                        <a
                          className="button button-secondary"
                          href={entry.audio.url}
                          download
                          aria-label="Download MP3 file"
                          title="Download MP3 file"
                        >
                          ↓
                        </a>
                        <button
                          type="button"
                          className="button button-secondary audio-delete"
                          onClick={() => void handleDeleteAudio(entry.chapterNumber, latestVersionId)}
                          disabled={audioDeleting[entry.chapterNumber]}
                          aria-label="Delete MP3 file"
                          title="Delete MP3 file"
                        >
                          <TrashIcon size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {isAudioJobActive && jobStatus?.progress ? (
                    <div className="mp3-generation-progress audio-row-progress">
                      <div
                        className="mp3-generation-progress-track"
                        role="progressbar"
                        aria-valuenow={jobStatus.progress.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`MP3 generation progress for chapter ${entry.chapterNumber}`}
                      >
                        <div
                          className="mp3-generation-progress-fill"
                          style={{ width: `${jobStatus.progress.percent}%` }}
                        />
                      </div>
                      <div className="mp3-generation-progress-meta">
                        <span>{jobStatus.progress.label ?? 'Generating MP3'}</span>
                        <span>
                          {jobStatus.progress.percent}%
                          {jobStatus.progress.total > 0
                            ? ` · ${jobStatus.progress.current}/${jobStatus.progress.total}`
                            : ''}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {jobStatus?.status === 'failed' ? (
                    <p className="audio-row-error">
                      {jobStatus.error ?? 'Audio generation failed.'}
                    </p>
                  ) : null}
                  {errorMap[entry.chapterNumber] ? (
                    <p className="audio-row-error">{errorMap[entry.chapterNumber]}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
