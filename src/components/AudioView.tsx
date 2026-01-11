import { useCallback, useEffect, useRef, useState } from 'react';
import type { TocEntry, ToastMessage } from '@/types/app';

interface AudioViewProps {
  bookId: string | null;
  tocEntries: TocEntry[];
  tocLoading: boolean;
  streamVoice: string;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
  onOpenChapterText: (pageIndex: number) => void;
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
  onOpenChapterText
}: AudioViewProps) {
  const [statusMap, setStatusMap] = useState<Record<number, ChapterStatus>>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [narrationBusy, setNarrationBusy] = useState<Record<number, boolean>>({});
  const [audioBusy, setAudioBusy] = useState<Record<number, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<number, string | null>>({});
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [playingChapter, setPlayingChapter] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      return;
    }
    void loadAudioStatus();
  }, [bookId, loadAudioStatus, tocEntries.length]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

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
        showToast(`Audio generated for chapter ${chapterNumber}`, 'success');
        await loadAudioStatus();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to generate audio.';
        setErrorMap((prev) => ({ ...prev, [chapterNumber]: message }));
      } finally {
        setAudioBusy((prev) => ({ ...prev, [chapterNumber]: false }));
      }
    },
    [audioBusy, bookId, loadAudioStatus, showToast, streamVoice]
  );

  const handlePlayAudio = useCallback(
    async (chapterNumber: number) => {
      if (!bookId) {
        return;
      }
      const entry = chapters.find((item) => item.chapterNumber === chapterNumber);
      const audioUrl = entry?.audio?.url;
      if (!audioUrl) {
        showToast('Audio file not found', 'error');
        return;
      }
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audioRef.current = audio;
      }
      if (playingChapter === chapterNumber && !audio.paused) {
        audio.pause();
        setPlayingChapter(null);
        return;
      }
      audio.pause();
      audio.src = audioUrl;
      audio.onended = () => setPlayingChapter(null);
      try {
        await audio.play();
        setPlayingChapter(chapterNumber);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to play audio.';
        showToast(message, 'error');
        setPlayingChapter(null);
      }
    },
    [bookId, chapters, playingChapter, showToast]
  );

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
              const canGenerateAudio = narrationReady;
              const playLabel = playingChapter === entry.chapterNumber ? 'Stop' : 'Play';
              const playDisabled = !audioReady || audioBusy[entry.chapterNumber];
              const actionLabel = audioReady
                ? playLabel
                : narrationReady
                ? audioBusy[entry.chapterNumber]
                  ? 'Generating…'
                  : 'Generate audio'
                : narrationBusy[entry.chapterNumber]
                ? 'Generating…'
                : 'Generate narration';
              const actionDisabled =
                (audioReady && playDisabled) ||
                (!audioReady && narrationReady && (audioBusy[entry.chapterNumber] || !canGenerateAudio)) ||
                (!audioReady && !narrationReady && narrationBusy[entry.chapterNumber]);
              const durationSeconds = entry.audio?.durationSeconds;
              const durationLabel =
                typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
                  ? `${Math.floor(durationSeconds / 60)}:${String(
                      Math.floor(durationSeconds % 60)
                    ).padStart(2, '0')}`
                  : null;
              const handleAction = () => {
                if (audioReady) {
                  void handlePlayAudio(entry.chapterNumber);
                  return;
                }
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
                    <button
                      type="button"
                      className="button"
                      onClick={handleAction}
                      disabled={actionDisabled}
                      title={!narrationReady && !audioReady ? 'Generate narration first' : undefined}
                    >
                      {actionLabel}
                    </button>
                    {durationLabel ? (
                      <span className="audio-row-duration" aria-label={`Duration ${durationLabel}`}>
                        {durationLabel}
                      </span>
                    ) : null}
                  </div>
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
