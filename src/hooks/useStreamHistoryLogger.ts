import { useEffect, useRef } from 'react';
import { logStreamHistory } from '@/lib/analytics';
import type { StreamState, TocEntry } from '@/types/app';

interface UseStreamHistoryLoggerOptions {
  bookId: string | null;
  chapterNumber: number | null;
  currentChapterEntry: TocEntry | null;
  currentSubchapterEntry: TocEntry | null;
  currentPage: number;
  streamState: StreamState;
}

export function useStreamHistoryLogger(options: UseStreamHistoryLoggerOptions) {
  const { bookId, chapterNumber, currentChapterEntry, currentSubchapterEntry, currentPage, streamState } = options;

  const sessionRef = useRef<{
    bookId: string;
    chapterNumber: number | null;
    chapterTitle: string | null;
    subchapterTitle: string | null;
    pageNumber: number | null;
    pageKeyStart: string | null;
    startedAt: string;
    lastPageKey: string | null;
  } | null>(null);
  const previousStreamStatusRef = useRef(streamState.status);

  useEffect(() => {
    const session = sessionRef.current;
    const previousStatus = previousStreamStatusRef.current;
    const currentStatus = streamState.status;
    const wasActive =
      previousStatus === 'connecting' || previousStatus === 'streaming' || previousStatus === 'paused';
    const isActive = currentStatus === 'connecting' || currentStatus === 'streaming' || currentStatus === 'paused';

    if (!session && isActive && bookId) {
      sessionRef.current = {
        bookId,
        chapterNumber,
        chapterTitle: currentChapterEntry?.title ?? null,
        subchapterTitle: currentSubchapterEntry?.title ?? null,
        pageNumber: currentPage,
        pageKeyStart: streamState.pageKey,
        startedAt: new Date().toISOString(),
        lastPageKey: streamState.pageKey
      };
      previousStreamStatusRef.current = currentStatus;
      return;
    }

    if (session && typeof streamState.pageKey === 'string' && streamState.pageKey) {
      session.lastPageKey = streamState.pageKey;
    }
    if (session) {
      session.pageNumber = currentPage;
    }

    if (session && wasActive && !isActive) {
      const listenedSeconds = Math.round(streamState.playbackSeconds * 1000) / 1000;
      if (listenedSeconds >= 1) {
        const endReason =
          currentStatus === 'error'
            ? 'error'
            : currentStatus === 'idle'
              ? 'stopped'
              : 'interrupted';
        logStreamHistory({
          bookId: session.bookId,
          chapterNumber: session.chapterNumber,
          chapterTitle: session.chapterTitle,
          subchapterTitle: session.subchapterTitle,
          pageNumber: session.pageNumber,
          pageKeyStart: session.pageKeyStart,
          pageKeyEnd: session.lastPageKey ?? streamState.pageKey,
          startedAt: session.startedAt,
          endedAt: new Date().toISOString(),
          listenedSeconds,
          endReason
        });
      }
      sessionRef.current = null;
    }

    previousStreamStatusRef.current = currentStatus;
  }, [
    bookId,
    chapterNumber,
    currentPage,
    currentChapterEntry,
    currentSubchapterEntry,
    streamState.pageKey,
    streamState.playbackSeconds,
    streamState.status
  ]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      const listenedSeconds = Math.round(streamState.playbackSeconds * 1000) / 1000;
      if (listenedSeconds < 1) {
        return;
      }
      logStreamHistory({
        bookId: session.bookId,
        chapterNumber: session.chapterNumber,
        chapterTitle: session.chapterTitle,
        subchapterTitle: session.subchapterTitle,
        pageNumber: session.pageNumber,
        pageKeyStart: session.pageKeyStart,
        pageKeyEnd: session.lastPageKey ?? streamState.pageKey,
        startedAt: session.startedAt,
        endedAt: new Date().toISOString(),
        listenedSeconds,
        endReason: 'unload'
      });
      sessionRef.current = null;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [streamState.pageKey, streamState.playbackSeconds]);
}
