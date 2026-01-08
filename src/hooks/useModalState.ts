import { useCallback, useState } from 'react';

export function useModalState() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [ocrQueueOpen, setOcrQueueOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorChapterNumber, setEditorChapterNumber] = useState<number | null>(null);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const openOcrQueue = useCallback(() => setOcrQueueOpen(true), []);
  const closeOcrQueue = useCallback(() => setOcrQueueOpen(false), []);

  return {
    helpOpen,
    setHelpOpen,
    openHelp,
    closeHelp,
    ocrQueueOpen,
    setOcrQueueOpen,
    openOcrQueue,
    closeOcrQueue,
    editorOpen,
    setEditorOpen,
    editorChapterNumber,
    setEditorChapterNumber
  };
}
