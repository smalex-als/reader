import { useEffect, useState } from 'react';
import { fetchChapterTextVersions, fetchChapterVersionText } from '@/api/chapterTextVersions';
import type { ChapterTextVersion } from '@/types/app';

export function useComparisonVersions(bookId: string, chapterNumber: number) {
  const key = `${bookId}:${chapterNumber}`;
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    versions: ChapterTextVersion[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let canceled = false;
    setResult(null);
    void fetchChapterTextVersions(bookId, chapterNumber).then(
      ({ versions }) => {
        if (!canceled) setResult({ key, versions, error: null });
      },
      () => {
        if (!canceled) setResult({ key, versions: [], error: 'Could not load versions for this chapter.' });
      }
    );
    return () => { canceled = true; };
  }, [bookId, chapterNumber, key, retry]);
  const current = result?.key === key ? result : null;
  return {
    versions: current?.versions ?? [],
    loading: !current,
    error: current?.error ?? null,
    retry: () => setRetry((value) => value + 1)
  };
}

export function useComparisonText(file: string | undefined) {
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ file: string; text: string; error: string | null } | null>(null);
  useEffect(() => {
    let canceled = false;
    setResult(null);
    if (!file) return;
    void fetchChapterVersionText(file).then(
      (text) => {
        if (!canceled) setResult({ file, text, error: null });
      },
      () => {
        if (!canceled) setResult({ file, text: '', error: 'Could not load this version.' });
      }
    );
    return () => { canceled = true; };
  }, [file, retry]);
  const current = result?.file === file ? result : null;
  return {
    text: current?.text ?? '',
    loading: Boolean(file) && !current,
    error: current?.error ?? null,
    retry: () => setRetry((value) => value + 1)
  };
}
