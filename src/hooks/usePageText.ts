import { useCallback, useMemo, useState } from 'react';
import { parseOcrLayout, serializeOcrLayout } from '@/lib/ocrLayout';
import { appActions, selectModalOpen, useAppDispatch, useAppSelector } from '@/state/appState';
import type { PageText, PageTextOcrEngine } from '@/types/app';

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function usePageText(
  currentImage: string | null,
  showToast: (message: string, kind?: 'info' | 'success' | 'error') => void
) {
  const dispatch = useAppDispatch();
  const textModalOpen = useAppSelector(selectModalOpen('text'));
  const [textCache, setTextCache] = useState<Record<string, PageText>>({});
  const [textLoading, setTextLoading] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [regeneratedText, setRegeneratedText] = useState(false);

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
        setTextLoading(true);
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
        setTextCache((prev) => ({ ...prev, [image]: entry }));
        if (updateCurrentState) {
          setRegeneratedText(data.source === 'ai' || force);
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
          setTextLoading(false);
        }
      }
    },
    [currentImage, showToast, textCache]
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
      setTextSaving(true);
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
        setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
        setRegeneratedText(false);
        showToast('Page text saved', 'success');
        return entry;
      } catch (error) {
        console.error(error);
        showToast('Unable to save page text', 'error');
        return null;
      } finally {
        setTextSaving(false);
      }
    },
    [currentImage, showToast]
  );

  const resetTextState = useCallback(() => {
    setTextCache({});
    dispatch(appActions.closeModal('text'));
    setTextLoading(false);
    setTextSaving(false);
    setRegeneratedText(false);
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
      setTextCache((prev) => ({ ...prev, [currentImage]: entry }));
      return entry;
    },
    [currentImage, textCache]
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
