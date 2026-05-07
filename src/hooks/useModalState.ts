import { useCallback, useState } from 'react';

export function useModalState() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [listeningDashboardOpen, setListeningDashboardOpen] = useState(false);
  const [ocrQueueOpen, setOcrQueueOpen] = useState(false);
  const [jobWorkerOpen, setJobWorkerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookCardOpen, setBookCardOpen] = useState(false);
  const [bookCardBookId, setBookCardBookId] = useState<string | null>(null);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapterNumber, setEditorChapterNumber] = useState<number | null>(null);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openListeningDashboard = useCallback(() => setListeningDashboardOpen(true), []);
  const closeListeningDashboard = useCallback(() => setListeningDashboardOpen(false), []);
  const openOcrQueue = useCallback(() => setOcrQueueOpen(true), []);
  const closeOcrQueue = useCallback(() => setOcrQueueOpen(false), []);
  const openJobWorker = useCallback(() => setJobWorkerOpen(true), []);
  const closeJobWorker = useCallback(() => setJobWorkerOpen(false), []);
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
  const openPromptEditor = useCallback(() => setPromptEditorOpen(true), []);
  const closePromptEditor = useCallback(() => setPromptEditorOpen(false), []);

  return {
    helpOpen,
    setHelpOpen,
    openHelp,
    closeHelp,
    listeningDashboardOpen,
    setListeningDashboardOpen,
    openListeningDashboard,
    closeListeningDashboard,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    jobWorkerOpen,
    setJobWorkerOpen,
    openJobWorker,
    closeJobWorker,
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
    promptEditorOpen,
    setPromptEditorOpen,
    openPromptEditor,
    closePromptEditor,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber
  };
}
