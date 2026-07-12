import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import TextSettingsPanel from '@/components/TextSettingsPanel';
import { useAudioLibraryActions } from '@/hooks/useAudioLibraryActions';
import {
  appActions,
  selectViewerWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { AudioLibraryItem, SubtitleCue } from '@/types/audioLibrary';
import type { FloatingAudioTrack } from '@/types/floatingAudio';

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

function toFloatingTrack(item: AudioLibraryItem, startSeconds?: number): FloatingAudioTrack {
  return {
    title: item.chapterTitle,
    subtitle: `${item.bookTitle} · Chapter ${item.chapterNumber}`,
    url: item.audioUrl,
    provider: item.provider,
    chapterNumber: item.chapterNumber,
    versionId: item.versionId,
    subchapters: item.subchapters,
    startSeconds
  };
}

export default function AudioLibraryView() {
  const dispatch = useAppDispatch();
  const { settings } = useAppSelector(selectViewerWorkflow);
  const { textFontSize } = settings;
  const {
    items,
    loading,
    subtitleCues,
    subtitlesLoading,
    loadItems,
    loadSubtitles
  } = useAudioLibraryActions();
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  const transcriptStyle = useMemo(
    () => ({ '--text-viewer-font-size': `${textFontSize}px` } as CSSProperties),
    [textFontSize]
  );

  useEffect(() => {
    void loadSubtitles(selectedItem?.srtUrl ?? null);
  }, [loadSubtitles, selectedItem?.srtUrl]);

  const handleSelectItem = useCallback((item: AudioLibraryItem) => {
    setSelectedItemId(item.id);
  }, []);

  const handlePlayItem = useCallback(
    (item: AudioLibraryItem, startSeconds?: number) => {
      dispatch(appActions.playFloatingAudio(toFloatingTrack(item, startSeconds)));
    },
    [dispatch]
  );

  const handleCueSelect = useCallback(
    (cue: SubtitleCue) => {
      if (!selectedItem) {
        return;
      }
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
              onClick={() =>
                dispatch(
                  appActions.requestAudioLibraryBookNavigation(
                    selectedItem.bookId,
                    selectedItem.chapterNumber
                  )
                )
              }
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
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-expanded={settingsOpen}
              aria-controls="audio-library-text-settings"
            >
              {settingsOpen ? 'Hide settings' : 'Text settings'}
            </button>
          </div>
        </header>

        {settingsOpen ? (
          <TextSettingsPanel
            id="audio-library-text-settings"
            className="audio-library-settings"
            controlPrefix="audio"
          />
        ) : null}

        <section className="audio-library-detail-summary" aria-label="MP3 details">
          <div className="audio-library-meta audio-library-detail-meta">
            {meta.map((value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <button
            type="button"
            className="button button-secondary modal-icon-button"
            onClick={() => handlePlayItem(selectedItem)}
            aria-label="Play in floating player"
            title="Play in floating player"
          >
            ▶
          </button>
        </section>

        <section className="audio-library-transcript" style={transcriptStyle} aria-label="Subtitles transcript">
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
              type="button"
              className="audio-library-cue"
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
                      dispatch(
                        appActions.requestAudioLibraryBookNavigation(item.bookId, item.chapterNumber)
                      );
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
