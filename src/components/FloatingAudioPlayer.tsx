import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFloatingAudioSubtitles } from '@/hooks/useFloatingAudioSubtitles';
import { PLAYBACK_RATE_OPTIONS, normalizePlaybackRate } from '@/lib/appConstants';
import { emitFloatingAudioSubchapterSelect, emitFloatingAudioTime } from '@/lib/floatingAudioEvents';
import {
  appActions,
  selectBookManifest,
  selectFloatingAudio,
  selectReaderSession,
  selectStreamUiControls,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type {
  FloatingAudioPlaybackState,
  FloatingAudioSubchapter,
  FloatingAudioTrack
} from '@/types/floatingAudio';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getSubchapterKey(entry: FloatingAudioSubchapter) {
  return `${entry.title}:${entry.startSeconds}`;
}

export default function FloatingAudioPlayer() {
  const dispatch = useAppDispatch();
  const { track } = useAppSelector(selectFloatingAudio);
  const { currentPage } = useAppSelector(selectReaderSession);
  const manifest = useAppSelector(selectBookManifest);
  const { playbackRate } = useAppSelector(selectStreamUiControls);
  const currentImage = manifest[currentPage] ?? null;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastEmittedSubchapterKeyRef = useRef<string | null>(null);
  const lastEmittedTrackKeyRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const subtitleCues = useFloatingAudioSubtitles(track?.srtUrl);
  const subchapters = useMemo(
    () =>
      (track?.subchapters ?? [])
        .filter((entry) => entry.title && Number.isFinite(entry.startSeconds) && entry.startSeconds >= 0)
        .sort((left, right) => left.startSeconds - right.startSeconds),
    [track?.subchapters]
  );
  const activeSubchapter = useMemo(() => {
    if (subchapters.length === 0) {
      return null;
    }
    return (
      [...subchapters]
        .reverse()
        .find((entry) => currentTime >= entry.startSeconds) ?? subchapters[0]
    );
  }, [currentTime, subchapters]);
  const syncPlaybackState = useCallback(
    (state: FloatingAudioPlaybackState, nextTrack: FloatingAudioTrack) => {
      dispatch(appActions.setFloatingAudioPlaybackState(state));
      dispatch(appActions.syncFloatingAudio(state, nextTrack, nextTrack.pageKey ?? currentImage));
    },
    [currentImage, dispatch]
  );

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.playbackRate = playbackRate;
    const handleLoaded = () => {
      const nextDuration = Number.isFinite(audio.duration)
        ? audio.duration
        : audio.seekable?.length
          ? audio.seekable.end(0)
          : 0;
      setDuration(nextDuration);
      if (!seeking) {
        setCurrentTime(audio.currentTime || 0);
      }
    };
    const handleTime = () => {
      if (seeking) {
        return;
      }
      setCurrentTime(audio.currentTime || 0);
    };
    const handlePlay = () => {
      setPlaying(true);
      if (track) {
        syncPlaybackState('playing', track);
      }
    };
    const handlePause = () => {
      setPlaying(false);
      if (track) {
        syncPlaybackState('paused', track);
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      if (track) {
        syncPlaybackState('ended', track);
      }
    };
    const handleError = () => {
      setPlaying(false);
      if (track) {
        syncPlaybackState('error', track);
      }
    };
    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('durationchange', handleLoaded);
    audio.addEventListener('loadeddata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('durationchange', handleLoaded);
      audio.removeEventListener('loadeddata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [playbackRate, seeking, syncPlaybackState, track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!track) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      lastEmittedSubchapterKeyRef.current = null;
      lastEmittedTrackKeyRef.current = null;
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setMinimized(false);
      return;
    }
    lastEmittedSubchapterKeyRef.current = null;
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.preload = 'metadata';
    audio.src = track.url;
    audio.load();
    if (track.startSeconds && track.startSeconds > 0) {
      audio.currentTime = track.startSeconds;
    }
    syncPlaybackState('loading', track);
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const nextCurrentTime = Math.max(0, track.startSeconds ?? 0);
    setCurrentTime(nextCurrentTime);
    if (nextDuration) {
      setDuration(nextDuration);
    }
    audio.play().catch(() => {
      setPlaying(false);
    });
  }, [syncPlaybackState, track]);


  useEffect(() => {
    if (!track) {
      return;
    }
    const trackKey = `${track.url}:${track.startSeconds ?? 0}`;
    if (lastEmittedTrackKeyRef.current !== trackKey) {
      lastEmittedTrackKeyRef.current = trackKey;
      return;
    }
    emitFloatingAudioTime({
      track,
      currentTime,
      duration,
      playing
    });
  }, [currentTime, duration, playing, track]);

  const emitSubchapterNavigation = useCallback(
    (entry: FloatingAudioSubchapter) => {
      if (!track) {
        return;
      }
      const key = getSubchapterKey(entry);
      if (lastEmittedSubchapterKeyRef.current === key) {
        return;
      }
      lastEmittedSubchapterKeyRef.current = key;
      emitFloatingAudioSubchapterSelect({ subchapter: entry, track });
    },
    [track]
  );

  useEffect(() => {
    if (!activeSubchapter) {
      return;
    }
    emitSubchapterNavigation(activeSubchapter);
  }, [activeSubchapter, emitSubchapterNavigation]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // ignore play failures
      }
    } else {
      audio.pause();
    }
  }, []);

  const handleSeek = useCallback((value: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = value;
    setCurrentTime(value);
  }, []);

  const handleSeekToSubchapter = useCallback(
    (entry: FloatingAudioSubchapter) => {
      handleSeek(entry.startSeconds);
      emitSubchapterNavigation(entry);
      void audioRef.current?.play();
    },
    [emitSubchapterNavigation, handleSeek]
  );

  const handleSeekStart = useCallback(() => {
    setSeeking(true);
  }, []);

  const handleSeekEnd = useCallback(() => {
    setSeeking(false);
  }, []);

  const handleClose = () => {
    if (track?.kind === 'page-tts' || track?.kind === 'text-tts') {
      dispatch(appActions.stopAudio());
    }
    dispatch(appActions.closeFloatingAudio());
  };

  const titleLine = useMemo(() => {
    if (!track) {
      return '';
    }
    return track.subtitle ? `${track.title} · ${track.subtitle}` : track.title;
  }, [track]);

  if (!track) {
    return null;
  }

  return (
    <div className={`floating-audio ${minimized ? 'floating-audio-minimized' : ''}`}>
      <div className="floating-audio-main">
        <div className="floating-audio-title">{titleLine}</div>
        {activeSubchapter ? (
          <div className="floating-audio-subtitle">{activeSubchapter.title}</div>
        ) : null}
        <div className="floating-audio-controls">
          <button type="button" className="button floating-audio-play" onClick={togglePlayback}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span className="floating-audio-time" aria-live="polite">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <select
            className="select floating-audio-speed"
            value={playbackRate}
            onChange={(event) =>
              dispatch(appActions.setPlaybackRate(normalizePlaybackRate(Number(event.target.value))))
            }
            aria-label="Playback speed"
            title="Playback speed"
          >
            {PLAYBACK_RATE_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
          <input
            type="range"
            className="floating-audio-range"
            min={0}
            max={Math.max(0, duration)}
            step={1}
            value={Math.min(currentTime, duration)}
            disabled={duration <= 0}
            onMouseDown={handleSeekStart}
            onMouseUp={handleSeekEnd}
            onMouseLeave={handleSeekEnd}
            onTouchStart={handleSeekStart}
            onTouchEnd={handleSeekEnd}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            onPointerCancel={handleSeekEnd}
            onChange={(event) => handleSeek(Number(event.target.value))}
          />
        </div>
        {!minimized && subchapters.length > 0 ? (
          <div className="floating-audio-subchapters" aria-label="Subchapters">
            {subchapters.map((entry) => {
              const active = activeSubchapter === entry;
              const end =
                typeof entry.endSeconds === 'number' && Number.isFinite(entry.endSeconds)
                  ? entry.endSeconds
                  : null;
              return (
                <button
                  key={`${entry.title}-${entry.startSeconds}`}
                  type="button"
                  className={`floating-audio-subchapter ${active ? 'floating-audio-subchapter-active' : ''}`}
                  onClick={() => handleSeekToSubchapter(entry)}
                  title={`${formatTime(entry.startSeconds)}${end !== null ? ` - ${formatTime(end)}` : ''}`}
                >
                  <span>{entry.title}</span>
                  <small>{formatTime(entry.startSeconds)}</small>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="floating-audio-actions">
        <button
          type="button"
          className="button floating-audio-icon-button"
          onClick={() => setMinimized((prev) => !prev)}
          aria-label={minimized ? 'Expand audio player' : 'Minimize audio player'}
          title={minimized ? 'Expand' : 'Minimize'}
        >
          {minimized ? '□' : '−'}
        </button>
        <button type="button" className="button floating-audio-icon-button" onClick={handleClose} aria-label="Close audio player" title="Close">
          ✕
        </button>
      </div>
    </div>
  );
}
