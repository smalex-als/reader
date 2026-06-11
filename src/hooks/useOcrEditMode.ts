import { useCallback, useEffect, useRef } from 'react';
import {
  appActions,
  selectOcrEdit,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { PageText, PageTextOcrEngine } from '@/types/app';

interface UseOcrEditModeOptions {
  currentImage: string | null;
  currentText: PageText | null;
  isTextBook: boolean;
  fetchPageText: (options?: {
    force?: boolean;
    silent?: boolean;
    engine?: PageTextOcrEngine;
  }) => Promise<PageText | null>;
  savePageText: (nextText: string) => Promise<PageText | null>;
  updatePageTextBlocks: (
    updater: (blocks: PageText['blocks']) => PageText['blocks']
  ) => PageText | null;
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

export function useOcrEditMode(options: UseOcrEditModeOptions) {
  const {
    currentImage,
    currentText,
    isTextBook,
    fetchPageText,
    savePageText,
    updatePageTextBlocks,
    showToast
  } = options;

  const dispatch = useAppDispatch();
  const { editMode: ocrEditMode, saving: ocrEditSaving } = useAppSelector(selectOcrEdit);
  const ocrEditBaselineRef = useRef<string | null>(null);
  const ocrEditImageRef = useRef<string | null>(null);

  const setOcrEditMode = useCallback(
    (enabled: boolean) => {
      dispatch(appActions.setOcrEditMode(enabled));
    },
    [dispatch]
  );

  const setOcrEditSaving = useCallback(
    (saving: boolean) => {
      dispatch(appActions.setOcrEditSaving(saving));
    },
    [dispatch]
  );

  useEffect(() => {
    if (ocrEditImageRef.current === currentImage) {
      return;
    }
    ocrEditImageRef.current = currentImage;
    ocrEditBaselineRef.current = null;
    setOcrEditMode(false);
    setOcrEditSaving(false);
  }, [currentImage, setOcrEditMode, setOcrEditSaving]);

  const toggleOcrEditMode = useCallback(async () => {
    if (!currentImage || isTextBook) {
      return;
    }

    if (!ocrEditMode) {
      const pageText = currentText ?? (await fetchPageText({ silent: true }));
      if (!pageText || pageText.blocks.length === 0) {
        showToast('No OCR blocks available for editing', 'error');
        return;
      }
      ocrEditBaselineRef.current = pageText.text;
      setOcrEditMode(true);
      showToast('Block edit mode enabled', 'info');
      return;
    }

    const nextText = currentText?.text ?? '';
    const baselineText = ocrEditBaselineRef.current;
    setOcrEditMode(false);

    if (!nextText || nextText === baselineText) {
      ocrEditBaselineRef.current = nextText || baselineText;
      showToast('Block edit mode disabled', 'info');
      return;
    }

    setOcrEditSaving(true);
    const saved = await savePageText(nextText);
    setOcrEditSaving(false);
    if (saved) {
      ocrEditBaselineRef.current = saved.text;
      showToast('Block edits saved', 'success');
      return;
    }
    setOcrEditMode(true);
  }, [
    currentImage,
    currentText,
    fetchPageText,
    isTextBook,
    ocrEditMode,
    savePageText,
    setOcrEditMode,
    setOcrEditSaving,
    showToast
  ]);

  const toggleSpeechBlock = useCallback(
    async (blockId: string) => {
      if (!currentImage) {
        return;
      }
      const pageText = currentText ?? (await fetchPageText({ silent: true }));
      if (!pageText || pageText.blocks.length === 0) {
        showToast('No OCR blocks available', 'error');
        return;
      }
      const updated = updatePageTextBlocks((blocks) =>
        blocks.map((block) =>
          block.id === blockId ? { ...block, excludedFromSpeech: !block.excludedFromSpeech } : block
        )
      );
      const toggled = updated?.blocks.find((block) => block.id === blockId);
      if (toggled) {
        showToast(toggled.excludedFromSpeech ? 'Block excluded from speech' : 'Block restored to speech', 'info');
      }
    },
    [currentImage, currentText, fetchPageText, showToast, updatePageTextBlocks]
  );

  return {
    ocrEditMode,
    ocrEditSaving,
    toggleOcrEditMode,
    toggleSpeechBlock
  };
}
