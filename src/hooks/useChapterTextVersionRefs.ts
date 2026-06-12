import { useEffect, useRef } from 'react';

export function useChapterTextVersionRefs({
  bookId,
  chapterNumber,
  sourceVersionId,
  selectedPromptId,
  selectedVersionId
}: {
  bookId: string | null;
  chapterNumber: number | null;
  sourceVersionId: string;
  selectedPromptId: string;
  selectedVersionId: string;
}) {
  const bookIdRef = useRef(bookId);
  const chapterNumberRef = useRef(chapterNumber);
  const sourceVersionIdRef = useRef(sourceVersionId);
  const selectedPromptIdRef = useRef(selectedPromptId);
  const selectedVersionIdRef = useRef(selectedVersionId);

  useEffect(() => {
    bookIdRef.current = bookId;
  }, [bookId]);

  useEffect(() => {
    chapterNumberRef.current = chapterNumber;
  }, [chapterNumber]);

  useEffect(() => {
    sourceVersionIdRef.current = sourceVersionId;
  }, [sourceVersionId]);

  useEffect(() => {
    selectedPromptIdRef.current = selectedPromptId;
  }, [selectedPromptId]);

  useEffect(() => {
    selectedVersionIdRef.current = selectedVersionId;
  }, [selectedVersionId]);

  return {
    bookIdRef,
    chapterNumberRef,
    sourceVersionIdRef,
    selectedPromptIdRef,
    selectedVersionIdRef
  };
}
