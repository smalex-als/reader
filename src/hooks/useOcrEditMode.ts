import { useCallback, useEffect, useRef } from 'react';
import { usePageText } from '@/hooks/usePageText';
import { useToast } from '@/hooks/useToast';
import {
  appActions,
  selectBookManifest,
  selectBookType,
  selectOcrEdit,
  selectOcrEditRequest,
  selectPageTextWorkflow,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
export function useOcrEditMode() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { fetchPageText, savePageText, updatePageTextBlocks } = usePageText();
  const { currentPage } = useAppSelector(selectReaderSession);
  const bookType = useAppSelector(selectBookType);
  const manifest = useAppSelector(selectBookManifest);
  const { cache: textCache } = useAppSelector(selectPageTextWorkflow);
  const { editMode: ocrEditMode } = useAppSelector(selectOcrEdit);
  const ocrEditRequest = useAppSelector(selectOcrEditRequest);
  const currentImage = manifest[currentPage] ?? null;
  const currentText = currentImage ? textCache[currentImage] ?? null : null;
  const isTextBook = bookType === 'text';
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

  useEffect(() => {
    if (!ocrEditRequest) {
      return;
    }
    if (ocrEditRequest.kind === 'toggleMode') {
      void toggleOcrEditMode();
    } else {
      void toggleSpeechBlock(ocrEditRequest.blockId);
    }
    dispatch(appActions.clearOcrEditRequest());
  }, [dispatch, ocrEditRequest, toggleOcrEditMode, toggleSpeechBlock]);
}
