import { useEffect, useRef } from 'react';

export function useChapterTextVersionRefs({
  bookId,
  chapterNumber,
  selectedVersionId
}: {
  bookId: string | null;
  chapterNumber: number | null;
  selectedVersionId: string;
}) {
  const bookIdRef = useRef(bookId);
  const chapterNumberRef = useRef(chapterNumber);
  const selectedVersionIdRef = useRef(selectedVersionId);

  useEffect(() => {
    bookIdRef.current = bookId;
  }, [bookId]);

  useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  return {
    bookIdRef,
    chapterNumberRef,
    selectedVersionIdRef
  };
}
