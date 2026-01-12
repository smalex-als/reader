import { useCallback, useEffect, useRef, useState } from 'react';
import type { TocEntry, ToastMessage } from '@/types/app';
import type { FloatingAudioTrack } from '@/components/FloatingAudioPlayer';

interface AudioViewProps {
  bookId: string | null;
  tocEntries: TocEntry[];
  tocLoading: boolean;
  streamVoice: string;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
  onOpenChapterText: (pageIndex: number) => void;
  onPlayAudio: (payload: FloatingAudioTrack) => void;
}

type ChapterStatus = {
  narrationReady: boolean;
  audioReady: boolean;
};

type AudioChapter = {
  chapterNumber: number;
  title: string;
  page: number;
  narration: { ready: boolean; url: string };
  audio: { ready: boolean; url: string; durationSeconds?: number | null };
};

type AudioJobStatus = {
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  error?: string | null;
  audioUrl?: string | null;
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
  streamVoice,
  showToast,
  onOpenChapterText,
  onPlayAudio
}: AudioViewProps) {
  const [statusMap, setStatusMap] = useState<Record<number, ChapterStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState<Record<number, boolean>>({});
  const [audioBusy, setAudioBusy] = useState<Record<number, boolean>>({});
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
          narrationReady: Boolean(chapter.narration?.ready),
          audioReady: Boolean(chapter.audio?.ready)
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
          job?: { status?: AudioJobStatus['status']; error?: string | null; audioUrl?: string | null };
        };
        const job = payload?.job;
        if (!job?.status) {
          clearPoll(chapterNumber);
          return;
        }
        setAudioJobs((prev) => ({
          ...prev,
          [chapterNumber]: {
            status: job.status,
            error: job.error ?? null,
            audioUrl: job.audioUrl ?? null
          }
        }));
        if (job.status === 'completed') {
          clearPoll(chapterNumber);
          await loadAudioStatus();
          return;
        }
        if (job.status === 'failed' || job.status === 'canceled') {
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

  const handleGenerateNarration = useCallback(
    async (chapterNumber: number) => {
      if (!bookId || narrationBusy[chapterNumber]) {
        return;
      }
      setNarrationBusy((prev) => ({ ...prev, [chapterNumber]: true }));
      setErrorMap((prev) => ({ ...prev, [chapterNumber]: null }));
      try {
        const response = await fetch(
          `/api/books/${encodeURIComponent(bookId)}/chapters/${chapterNumber}/narration`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        showToast(`Narration saved for chapter ${chapterNumber}`, 'success');
        await loadAudioStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to generate narration.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      } finally {
        setNarrationBusy((prev) => ({ ...prev, [chapterNumber]: false }));
      }
    },
    [bookId, narrationBusy, loadAudioStatus, showToast]
  );

  const handleGenerateAudio = useCallback(
    async (chapterNumber: number) => {
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
            body: JSON.stringify({ voice: streamVoice })
          }
        );
        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }
        const payload = (await response.json()) as {
          job?: { status?: AudioJobStatus['status']; error?: string | null; audioUrl?: string | null };
        };
        const job = payload?.job;
        if (job?.status) {
          setAudioJobs((prev) => ({
            ...prev,
            [chapterNumber]: {
              status: job.status,
              error: job.error ?? null,
              audioUrl: job.audioUrl ?? null
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
    [audioBusy, bookId, schedulePoll, showToast, streamVoice]
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
              const narrationReady = chapterStatus?.narrationReady ?? false;
              const audioReady = chapterStatus?.audioReady ?? false;
              const jobStatus = audioJobs[entry.chapterNumber];
              const isAudioJobActive =
                jobStatus?.status === 'queued' || jobStatus?.status === 'running';
              const canGenerateAudio = narrationReady;
              const showAction = !audioReady;
              const actionLabel = narrationReady
                ? isAudioJobActive
                  ? jobStatus?.status === 'queued'
                    ? 'Queued…'
                    : 'Generating…'
                  : audioBusy[entry.chapterNumber]
                  ? 'Starting…'
                  : 'Generate audio'
                : narrationBusy[entry.chapterNumber]
                ? 'Generating…'
                : 'Generate narration';
              const actionDisabled = narrationReady
                ? audioBusy[entry.chapterNumber] || !canGenerateAudio || isAudioJobActive
                : narrationBusy[entry.chapterNumber];
              const handleAction = () => {
                if (narrationReady) {
                  void handleGenerateAudio(entry.chapterNumber);
                  return;
                }
                void handleGenerateNarration(entry.chapterNumber);
              };
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
                  </div>
                  <div className="audio-row-actions">
                    {showAction ? (
                      <button
                        type="button"
                        className="button"
                        onClick={handleAction}
                        disabled={actionDisabled}
                      >
                        {actionLabel}
                      </button>
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
                      <button
                        type="button"
                        className="button audio-native-play"
                        onClick={() =>
                          onPlayAudio({
                            title: entry.title,
                            subtitle: `Chapter ${entry.chapterNumber}`,
                            url: entry.audio.url
                          })
                        }
                      >
                        ▶ Play
                      </button>
                    ) : null}
                  </div>
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
