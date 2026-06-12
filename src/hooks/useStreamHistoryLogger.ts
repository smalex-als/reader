import { useEffect, useMemo, useRef } from 'react';
import { logStreamHistory } from '@/lib/analytics';
import {
  selectBookChapterCount,
  selectBookManifest,
  selectBookType,
  selectReaderSession,
  selectStreamRuntime,
  selectTocWorkflow,
  useAppSelector
} from '@/state/appState';

function parseUnitStreamPageKey(pageKey: string | null) {
  if (typeof pageKey !== 'string') {
    return null;
  }
  const match = pageKey.match(/^unit::([^:]+)::([^:]+)::paragraph-start-\d+$/);
  if (!match) {
    return null;
  }
  try {
    return {
      unitSetId: decodeURIComponent(match[1]),
      topicId: decodeURIComponent(match[2])
    };
  } catch {
    return null;
  }
}

export function useStreamHistoryLogger() {
  const { bookId, currentPage } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const chapterCount = useAppSelector(selectBookChapterCount);
  const manifest = useAppSelector(selectBookManifest);
  const { entries: tocEntries, detailedEntries: detailedTocEntries } = useAppSelector(selectTocWorkflow);
  const streamState = useAppSelector(selectStreamRuntime);
  const sortedTocEntries = useMemo(() => {
    return [...tocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [tocEntries]);
  const sortedDetailedTocEntries = useMemo(() => {
    return [...detailedTocEntries]
      .filter((entry) => Number.isInteger(entry.page))
      .sort((a, b) => a.page - b.page);
  }, [detailedTocEntries]);
  const isTextBook = bookType === 'text';
  const navigationCount = isTextBook ? chapterCount : manifest.length;
  const currentChapterIndex = useMemo(() => {
    if (isTextBook) {
      return navigationCount > 0 ? currentPage : null;
    }
    if (sortedTocEntries.length === 0) {
      return null;
    }
    const nextIndex = sortedTocEntries.findIndex((entry) => entry.page > currentPage);
    if (nextIndex === -1) {
      return sortedTocEntries.length - 1;
    }
    return Math.max(0, nextIndex - 1);
  }, [currentPage, isTextBook, navigationCount, sortedTocEntries]);
  const currentChapterEntry = useMemo(() => {
    if (isTextBook) {
      return sortedTocEntries.find((entry) => entry.page === currentPage) ?? null;
    }
    return currentChapterIndex !== null ? sortedTocEntries[currentChapterIndex] : null;
  }, [currentChapterIndex, currentPage, isTextBook, sortedTocEntries]);
  const nextChapterEntry =
    !isTextBook && currentChapterIndex !== null
      ? sortedTocEntries[currentChapterIndex + 1]
      : null;
  const currentSubchapterEntry = useMemo(() => {
    if (sortedDetailedTocEntries.length === 0) {
      return null;
    }
    const chapterStart = currentChapterEntry?.page ?? 0;
    const chapterEnd = nextChapterEntry?.page ?? manifest.length;
    const candidates = sortedDetailedTocEntries.filter((entry) => {
      if (!Number.isInteger(entry.page)) {
        return false;
      }
      return entry.page >= chapterStart && entry.page <= currentPage && entry.page < chapterEnd;
    });
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }, [currentChapterEntry?.page, currentPage, manifest.length, nextChapterEntry?.page, sortedDetailedTocEntries]);
  const chapterNumber = currentChapterIndex !== null ? currentChapterIndex + 1 : null;
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

    const unitLocator = parseUnitStreamPageKey(streamState.pageKey);
    const sessionBookId = unitLocator ? unitLocator.unitSetId : bookId;

    if (!session && isActive && sessionBookId) {
      sessionRef.current = {
        bookId: sessionBookId,
        chapterNumber: unitLocator ? null : chapterNumber,
        chapterTitle: unitLocator ? null : currentChapterEntry?.title ?? null,
        subchapterTitle: unitLocator ? null : currentSubchapterEntry?.title ?? null,
        pageNumber: unitLocator ? null : currentPage,
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
      session.pageNumber = parseUnitStreamPageKey(streamState.pageKey) ? null : currentPage;
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
