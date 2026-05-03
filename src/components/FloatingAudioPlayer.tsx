import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { emitFloatingAudioSubchapterSelect } from '@/lib/floatingAudioEvents';

export type FloatingAudioSubchapter = {
  title: string;
  startSeconds: number;
  endSeconds?: number;
  durationSeconds?: number;
};

export type FloatingAudioTrack = {
  title: string;
  url: string;
  subtitle?: string;
  kind?: 'page-tts' | 'text-tts' | 'file';
  provider?: 'openai' | 'xai' | null;
  pageKey?: string | null;
  chapterNumber?: number | null;
  versionId?: string | null;
  subchapters?: FloatingAudioSubchapter[];
};

export type FloatingAudioPlaybackState = 'loading' | 'playing' | 'paused' | 'ended' | 'error';

interface FloatingAudioPlayerProps {
  track: FloatingAudioTrack | null;
  playbackRate: number;
  playbackRateOptions: readonly number[];
  onPlaybackRateChange: (rate: number) => void;
  onClose: () => void;
  onPlaybackStateChange?: (state: FloatingAudioPlaybackState, track: FloatingAudioTrack) => void;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function FloatingAudioPlayer({
  track,
  playbackRate,
  playbackRateOptions,
  onPlaybackRateChange,
  onClose,
  onPlaybackStateChange
}: FloatingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
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
        onPlaybackStateChange?.('playing', track);
      }
    };
    const handlePause = () => {
      setPlaying(false);
      if (track) {
        onPlaybackStateChange?.('paused', track);
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      if (track) {
        onPlaybackStateChange?.('ended', track);
      }
    };
    const handleError = () => {
      setPlaying(false);
      if (track) {
        onPlaybackStateChange?.('error', track);
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
  }, [onPlaybackStateChange, playbackRate, seeking, track]);

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
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
    audio.preload = 'metadata';
    audio.currentTime = 0;
    audio.src = track.url;
    audio.load();
    onPlaybackStateChange?.('loading', track);
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (nextDuration) {
      setDuration(nextDuration);
    }
    audio.play().catch(() => {
      setPlaying(false);
    });
  }, [onPlaybackStateChange, track]);

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
      if (track) {
        emitFloatingAudioSubchapterSelect({ subchapter: entry, track });
      }
      void audioRef.current?.play();
    },
    [handleSeek, track]
  );

  const handleSeekStart = useCallback(() => {
    setSeeking(true);
  }, []);

  const handleSeekEnd = useCallback(() => {
    setSeeking(false);
  }, []);

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
    <div className="floating-audio">
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
            onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
            aria-label="Playback speed"
            title="Playback speed"
          >
            {playbackRateOptions.map((rate) => (
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
        {subchapters.length > 0 ? (
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
      <button type="button" className="button floating-audio-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
