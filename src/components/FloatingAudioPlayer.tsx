import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type FloatingAudioTrack = {
  title: string;
  url: string;
  subtitle?: string;
};

interface FloatingAudioPlayerProps {
  track: FloatingAudioTrack | null;
  onClose: () => void;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return '0:00';
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function FloatingAudioPlayer({ track, onClose }: FloatingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;
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
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('durationchange', handleLoaded);
    audio.addEventListener('loadeddata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('durationchange', handleLoaded);
      audio.removeEventListener('loadeddata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [seeking]);

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
    const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (nextDuration) {
      setDuration(nextDuration);
    }
    audio.play().catch(() => {
      setPlaying(false);
    });
  }, [track?.url]);

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
        <div className="floating-audio-controls">
          <button type="button" className="button floating-audio-play" onClick={togglePlayback}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <span className="floating-audio-time" aria-live="polite">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
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
      </div>
      <button type="button" className="button floating-audio-close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
