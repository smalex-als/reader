import { useCallback, useMemo } from 'react';
import { useToast } from '@/hooks/useToast';
import { parseOcrLayout, serializeOcrLayout } from '@/lib/ocrLayout';
import {
  appActions,
  selectModalOpen,
  selectPageTextWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { PageText, PageTextOcrEngine } from '@/types/app';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function usePageText(currentImage: string | null) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const textModalOpen = useAppSelector(selectModalOpen('text'));
  const {
    cache: textCache,
    loading: textLoading,
    saving: textSaving,
    regenerated: regeneratedText
  } = useAppSelector(selectPageTextWorkflow);

  const setRegeneratedText = useCallback(
    (regenerated: boolean) => {
      dispatch(appActions.setRegeneratedPageText(regenerated));
    },
    [dispatch]
  );

  const fetchPageTextByImage = useCallback(
    async (
      image: string,
      options: { force?: boolean; silent?: boolean; engine?: PageTextOcrEngine; updateCurrentState?: boolean } = {}
    ): Promise<PageText | null> => {
      const { force = false, silent = false, engine, updateCurrentState = image === currentImage } = options;
      const cached = textCache[image];
      if (cached && !force) {
        return cached;
      }

      if (updateCurrentState) {
        dispatch(appActions.setPageTextLoading(true));
      }
      try {
        const params = new URLSearchParams({ image });
        if (force) {
          params.set('skipCache', '1');
        }
        if (engine) {
          params.set('engine', engine);
        }
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(
          `/api/page-text?${params.toString()}`
        );
        const parsed = parseOcrLayout(data.text);
        const entry: PageText = {
          text: data.text,
          plainText: parsed.plainText,
          blocks: parsed.blocks,
          source: data.source
        };
        dispatch(appActions.setPageTextEntry(image, entry));
        if (updateCurrentState) {
          dispatch(appActions.setRegeneratedPageText(data.source === 'ai' || force));
        }
        if (!silent && updateCurrentState) {
          const action = data.source === 'ai' ? 'generated' : 'loaded';
          if (parsed.blocks.length === 0 && parsed.plainText.trim()) {
            showToast(`Page text ${action}, but OCR coordinates were not found`, 'info');
          } else {
            showToast(`Page text ${action}`, 'success');
          }
        }
        return entry;
      } catch (error) {
        console.error(error);
        if (!silent && updateCurrentState) {
          showToast('Unable to load page text', 'error');
        }
        return null;
      } finally {
        if (updateCurrentState) {
          dispatch(appActions.setPageTextLoading(false));
        }
      }
    },
    [currentImage, dispatch, showToast, textCache]
  );

  const fetchPageText = useCallback(
    async (options: { force?: boolean; silent?: boolean; engine?: PageTextOcrEngine } = {}): Promise<PageText | null> => {
      if (!currentImage) {
        return null;
      }
      return fetchPageTextByImage(currentImage, options);
    },
    [currentImage, fetchPageTextByImage]
  );

  const toggleTextModal = useCallback(() => {
    if (!textModalOpen) {
      void fetchPageText();
    }
    dispatch(appActions.setModalOpen('text', !textModalOpen));
  }, [dispatch, fetchPageText, textModalOpen]);

  const closeTextModal = useCallback(() => {
    dispatch(appActions.closeModal('text'));
  }, [dispatch]);

  const savePageText = useCallback(
    async (nextText: string): Promise<PageText | null> => {
      if (!currentImage) {
        return null;
      }
      dispatch(appActions.setPageTextSaving(true));
      try {
        const data = await fetchJson<{ source: 'file' | 'ai'; text: string }>(`/api/page-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: currentImage, text: nextText })
        });
        const parsed = parseOcrLayout(data.text);
        const entry: PageText = {
          text: data.text,
          plainText: parsed.plainText,
          blocks: parsed.blocks,
          source: data.source
        };
        dispatch(appActions.setPageTextEntry(currentImage, entry));
        dispatch(appActions.setRegeneratedPageText(false));
        showToast('Page text saved', 'success');
        return entry;
      } catch (error) {
        console.error(error);
        showToast('Unable to save page text', 'error');
        return null;
      } finally {
        dispatch(appActions.setPageTextSaving(false));
      }
    },
    [currentImage, dispatch, showToast]
  );

  const resetTextState = useCallback(() => {
    dispatch(appActions.resetPageText());
    dispatch(appActions.closeModal('text'));
  }, [dispatch]);

  const currentText = useMemo(() => {
    return currentImage ? textCache[currentImage] ?? null : null;
  }, [currentImage, textCache]);

  const updatePageTextBlocks = useCallback(
    (updater: (blocks: PageText['blocks']) => PageText['blocks']): PageText | null => {
      if (!currentImage) {
        return null;
      }
      const current = textCache[currentImage];
      if (!current || current.blocks.length === 0) {
        return null;
      }
      const nextBlocks = updater(current.blocks);
      const nextText = serializeOcrLayout(nextBlocks);
      const parsed = parseOcrLayout(nextText);
      const entry: PageText = {
        text: nextText,
        plainText: parsed.plainText,
        blocks: parsed.blocks,
        source: current.source
      };
      dispatch(appActions.setPageTextEntry(currentImage, entry));
      return entry;
    },
    [currentImage, dispatch, textCache]
  );

  return {
    closeTextModal,
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    regeneratedText,
    resetTextState,
    savePageText,
    setRegeneratedText,
    textCache,
    textLoading,
    textModalOpen,
    textSaving,
    toggleTextModal,
    updatePageTextBlocks
  };
}
