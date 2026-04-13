import { useCallback, useState } from 'react';

export function useModalState() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [ocrQueueOpen, setOcrQueueOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookCardOpen, setBookCardOpen] = useState(false);
  const [bookCardBookId, setBookCardBookId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapterNumber, setEditorChapterNumber] = useState<number | null>(null);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openOcrQueue = useCallback(() => setOcrQueueOpen(true), []);
  const closeOcrQueue = useCallback(() => setOcrQueueOpen(false), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const openBookCard = useCallback((bookId: string) => {
    setBookCardBookId(bookId);
    setBookCardOpen(true);
  }, []);
  const closeBookCard = useCallback(() => {
    setBookCardOpen(false);
    setBookCardBookId(null);
  }, []);

  return {
    helpOpen,
    setHelpOpen,
    openHelp,
    closeHelp,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    searchOpen,
    setSearchOpen,
    openSearch,
    closeSearch,
    bookCardOpen,
    setBookCardOpen,
    bookCardBookId,
    setBookCardBookId,
    openBookCard,
    closeBookCard,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber
  };
}
