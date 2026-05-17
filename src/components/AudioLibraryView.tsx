import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FloatingAudioSubchapter, FloatingAudioTrack } from '@/components/FloatingAudioPlayer';
import { onFloatingAudioTime } from '@/lib/floatingAudioEvents';
import type { ToastMessage } from '@/types/app';

type AudioLibraryItem = {
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

type SubtitleCue = {
  startSeconds: number;
  endSeconds: number;
  text: string;
};

interface AudioLibraryViewProps {
  onPlayAudio: (payload: FloatingAudioTrack) => void;
  onOpenBook: (bookId: string, chapterNumber: number) => void;
  showToast: (message: string, kind?: ToastMessage['kind']) => void;
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload?.error ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function formatDuration(value: number | null) {
  if (!Number.isFinite(value ?? NaN) || value === null || value < 0) {
    return 'unknown length';
  }
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatBytes(value: number | null) {
  if (!Number.isFinite(value ?? NaN) || value === null || value < 0) {
    return '';
  }
  const mb = value / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseTimestamp(value: string) {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) {
    return null;
  }
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  const millis = Number.parseInt(match[4].padEnd(3, '0').slice(0, 3), 10);
  if (![hours, minutes, seconds, millis].every(Number.isFinite)) {
    return null;
  }
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseSrt(text: string): SubtitleCue[] {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .flatMap((block) => {
      const lines = block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeIndex < 0) {
        return [];
      }
      const [startRaw, endRaw] = lines[timeIndex].split('-->').map((part) => part.trim());
      const startSeconds = parseTimestamp(startRaw);
      const endSeconds = parseTimestamp(endRaw);
      const cueText = lines.slice(timeIndex + 1).join(' ').trim();
      if (startSeconds === null || endSeconds === null || !cueText) {
        return [];
      }
      return [{ startSeconds, endSeconds, text: cueText }];
    });
}


function toFloatingTrack(item: AudioLibraryItem, startSeconds?: number): FloatingAudioTrack {
  return {
    title: item.chapterTitle,
    subtitle: `${item.bookTitle} · Chapter ${item.chapterNumber}`,
    url: item.audioUrl,
    srtUrl: item.srtUrl,
    provider: item.provider,
    chapterNumber: item.chapterNumber,
    versionId: item.versionId,
    subchapters: item.subchapters,
    startSeconds
  };
}

export default function AudioLibraryView({ onPlayAudio, onOpenBook, showToast }: AudioLibraryViewProps) {
  const cueRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [items, setItems] = useState<AudioLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitlesLoading, setSubtitlesLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/audio');
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }
      const payload = (await response.json()) as { items?: AudioLibraryItem[] };
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load MP3 library.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return items;
    }
    return items.filter((item) =>
      [
        item.bookTitle,
        item.bookId,
        item.bookAuthor,
        item.chapterTitle,
        item.versionId,
        item.voice,
        item.provider
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [items, query]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  );
  const activeCueIndex = useMemo(
    () =>
      subtitleCues.findIndex(
        (cue) => currentTime >= cue.startSeconds && currentTime <= cue.endSeconds
      ),
    [currentTime, subtitleCues]
  );

  useEffect(() => {
    if (!selectedItem) {
      return;
    }
    return onFloatingAudioTime((detail) => {
      if (detail.track.url !== selectedItem.audioUrl) {
        return;
      }
      setCurrentTime(detail.currentTime);
    });
  }, [selectedItem]);

  useEffect(() => {
    let cancelled = false;
    cueRefs.current = {};
    setSubtitleCues([]);
    setCurrentTime(0);
    if (!selectedItem?.srtUrl) {
      setSubtitlesLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setSubtitlesLoading(true);
    void fetch(selectedItem.srtUrl)
      .then((response) => (response.ok ? response.text() : ''))
      .then((text) => {
        if (!cancelled) {
          setSubtitleCues(parseSrt(text));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSubtitleCues([]);
          showToast('Unable to load subtitles for this MP3', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSubtitlesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.srtUrl, showToast]);

  useEffect(() => {
    if (activeCueIndex < 0) {
      return;
    }
    cueRefs.current[activeCueIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeCueIndex]);

  const handleSelectItem = useCallback((item: AudioLibraryItem) => {
    setSelectedItemId(item.id);
  }, []);

  const handlePlayItem = useCallback(
    (item: AudioLibraryItem, startSeconds?: number) => {
      onPlayAudio(toFloatingTrack(item, startSeconds));
    },
    [onPlayAudio]
  );

  const handleCueSelect = useCallback(
    (cue: SubtitleCue) => {
      if (!selectedItem) {
        return;
      }
      setCurrentTime(cue.startSeconds);
      handlePlayItem(selectedItem, cue.startSeconds);
    },
    [handlePlayItem, selectedItem]
  );

  if (selectedItem) {
    const bytes = formatBytes(selectedItem.bytes);
    const meta = [
      selectedItem.bookTitle,
      `Chapter ${selectedItem.chapterNumber}`,
      formatDuration(selectedItem.durationSeconds),
      bytes,
      selectedItem.provider,
      selectedItem.voice,
      selectedItem.versionId,
      selectedItem.hasSubtitles ? 'SRT' : 'No subtitles'
    ].filter(Boolean);

    return (
      <div className="audio-library audio-library-detail">
        <header className="audio-library-detail-header">
          <button type="button" className="button button-secondary" onClick={() => setSelectedItemId(null)}>
            Back
          </button>
          <div className="audio-viewer-title">
            <span className="audio-viewer-label">MP3 File</span>
            <h2 className="audio-viewer-heading">{selectedItem.chapterTitle}</h2>
          </div>
          <div className="audio-library-detail-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => onOpenBook(selectedItem.bookId, selectedItem.chapterNumber)}
            >
              Open Book
            </button>
            <a className="button button-secondary" href={selectedItem.audioUrl} download>
              MP3
            </a>
            {selectedItem.srtUrl ? (
              <a className="button button-secondary" href={selectedItem.srtUrl} download>
                SRT
              </a>
            ) : null}
          </div>
        </header>

        <section className="audio-library-detail-summary" aria-label="MP3 details">
          <div className="audio-library-meta audio-library-detail-meta">
            {meta.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <button type="button" className="button" onClick={() => handlePlayItem(selectedItem)}>
            Play in floating player
          </button>
        </section>

        <section className="audio-library-transcript" aria-label="Subtitles transcript">
          {subtitlesLoading ? <p className="audio-viewer-status">Loading subtitles...</p> : null}
          {!subtitlesLoading && !selectedItem.srtUrl ? (
            <p className="audio-viewer-status">No SRT file exists for this MP3 yet.</p>
          ) : null}
          {!subtitlesLoading && selectedItem.srtUrl && subtitleCues.length === 0 ? (
            <p className="audio-viewer-status">No subtitle text found in this SRT file.</p>
          ) : null}
          {subtitleCues.map((cue, index) => (
            <button
              key={`${cue.startSeconds}-${index}`}
              ref={(element) => {
                cueRefs.current[index] = element;
              }}
              type="button"
              className={`audio-library-cue ${activeCueIndex === index ? 'audio-library-cue-active' : ''}`}
              onClick={() => handleCueSelect(cue)}
            >
              {cue.text}
            </button>
          ))}
        </section>
      </div>
    );
  }

  return (
    <div className="audio-library">
      <header className="audio-library-header">
        <div className="audio-viewer-title">
          <span className="audio-viewer-label">MP3 Library</span>
          <h2 className="audio-viewer-heading">Generated audio</h2>
        </div>
        <div className="audio-library-controls">
          <label className="toolbar-field audio-library-search">
            Search
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Book, chapter, voice"
            />
          </label>
          <button type="button" className="button" onClick={() => void loadItems()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="audio-library-body">
        {loading && items.length === 0 ? (
          <p className="audio-viewer-status">Loading generated MP3 files...</p>
        ) : null}
        {!loading && items.length === 0 ? (
          <p className="audio-viewer-status">No generated MP3 files found.</p>
        ) : null}
        {items.length > 0 && filteredItems.length === 0 ? (
          <p className="audio-viewer-status">No MP3 files match this search.</p>
        ) : null}

        <div className="audio-library-list">
          {filteredItems.map((item) => {
            const bytes = formatBytes(item.bytes);
            return (
              <article
                key={item.id}
                className="audio-library-row"
                role="button"
                tabIndex={0}
                onClick={() => handleSelectItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelectItem(item);
                  }
                }}
              >
                <div className="audio-library-main">
                  <div className="audio-library-title-row">
                    <span className="audio-library-book">{item.bookTitle}</span>
                    <span className="audio-library-chapter">Chapter {item.chapterNumber}</span>
                  </div>
                  <h3 className="audio-library-title">{item.chapterTitle}</h3>
                  <div className="audio-library-meta">
                    <span>{formatDuration(item.durationSeconds)}</span>
                    {bytes ? <span>{bytes}</span> : null}
                    <span>{item.provider}</span>
                    {item.voice ? <span>{item.voice}</span> : null}
                    <span>{item.versionId}</span>
                    {item.hasSubtitles ? <span>SRT</span> : <span>No subtitles</span>}
                    {item.subchapters.length > 0 ? <span>{item.subchapters.length} parts</span> : null}
                    {formatDate(item.generatedAt) ? <span>{formatDate(item.generatedAt)}</span> : null}
                  </div>
                </div>
                <div className="audio-library-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handlePlayItem(item);
                    }}
                  >
                    Play
                  </button>
                  <a className="button button-secondary" href={item.audioUrl} download onClick={(event) => event.stopPropagation()}>
                    MP3
                  </a>
                  {item.srtUrl ? (
                    <a className="button button-secondary" href={item.srtUrl} download onClick={(event) => event.stopPropagation()}>
                      SRT
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenBook(item.bookId, item.chapterNumber);
                    }}
                  >
                    Open Book
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
