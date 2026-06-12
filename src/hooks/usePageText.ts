import { useCallback, useMemo } from 'react';
import { fetchPageTextForImage, savePageTextForImage } from '@/api/pageText';
import { useToast } from '@/hooks/useToast';
import { parseOcrLayout, serializeOcrLayout } from '@/lib/ocrLayout';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  selectBookSessionWorkflow,
  selectModalOpen,
  selectPageTextWorkflow,
  selectReaderSession,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { PageText, PageTextOcrEngine } from '@/types/app';

type PageTextPayloads = {
  fetchPageText: {
    image: string;
    force: boolean;
    silent: boolean;
    engine?: PageTextOcrEngine;
    updateCurrentState: boolean;
  };
  savePageText: {
    image: string;
    text: string;
  };
};

type PageTextActions = {
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setEntry: (image: string, entry: PageText) => void;
  setRegenerated: (regenerated: boolean) => void;
  showToast: (message: string, kind: 'success' | 'error' | 'info') => void;
  setResult: (entry: PageText | null) => void;
};

const pageTextHandlers = createActionHandlerRegistry<unknown, PageTextActions, PageTextPayloads>();
const { addActionHandler } = pageTextHandlers;

function showPageTextLoadedToast(actions: PageTextActions, entry: PageText) {
  const action = entry.source === 'ai' ? 'generated' : 'loaded';
  if (entry.blocks.length === 0 && entry.plainText.trim()) {
    actions.showToast(`Page text ${action}, but OCR coordinates were not found`, 'info');
    return;
  }
  actions.showToast(`Page text ${action}`, 'success');
}

addActionHandler('fetchPageText', async (_state, actions, payload): Promise<void> => {
  if (payload.updateCurrentState) {
    actions.setLoading(true);
  }

  try {
    const entry = await fetchPageTextForImage({
      image: payload.image,
      force: payload.force,
      engine: payload.engine
    });
    actions.setEntry(payload.image, entry);
    if (payload.updateCurrentState) {
      actions.setRegenerated(entry.source === 'ai' || payload.force);
    }
    if (!payload.silent && payload.updateCurrentState) {
      showPageTextLoadedToast(actions, entry);
    }
    actions.setResult(entry);
  } catch (error) {
    console.error(error);
    if (!payload.silent && payload.updateCurrentState) {
      actions.showToast('Unable to load page text', 'error');
    }
    actions.setResult(null);
  } finally {
    if (payload.updateCurrentState) {
      actions.setLoading(false);
    }
  }
});

addActionHandler('savePageText', async (_state, actions, payload): Promise<void> => {
  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    fallbackError: 'Unable to save page text',
    request: () => savePageTextForImage({
      image: payload.image,
      text: payload.text
    }),
    onSuccess: (entry) => {
      actions.setEntry(payload.image, entry);
      actions.setRegenerated(false);
      actions.showToast('Page text saved', 'success');
      actions.setResult(entry);
    },
    onError: (error) => {
      console.error(error);
      actions.showToast('Unable to save page text', 'error');
      actions.setResult(null);
    }
  });
});

export function usePageText(imageOverride?: string | null) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { currentPage } = useAppSelector(selectReaderSession);
  const { manifest } = useAppSelector(selectBookSessionWorkflow);
  const textModalOpen = useAppSelector(selectModalOpen('text'));
  const {
    cache: textCache,
    loading: textLoading
  } = useAppSelector(selectPageTextWorkflow);
  const selectedImage = manifest[currentPage] ?? null;
  const currentImage = imageOverride === undefined ? selectedImage : imageOverride;

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

      let result: PageText | null = null;
      const actions: PageTextActions = {
        setLoading: (loading) => dispatch(appActions.setPageTextLoading(loading)),
        setSaving: (saving) => dispatch(appActions.setPageTextSaving(saving)),
        setError: () => undefined,
        setEntry: (targetImage, entry) => dispatch(appActions.setPageTextEntry(targetImage, entry)),
        setRegenerated: (regenerated) => dispatch(appActions.setRegeneratedPageText(regenerated)),
        showToast,
        setResult: (entry) => {
          result = entry;
        }
      };
      await pageTextHandlers.runAction('fetchPageText', undefined, actions, {
        image,
        force,
        silent,
        engine,
        updateCurrentState
      });
      return result;
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

  const savePageText = useCallback(
    async (nextText: string): Promise<PageText | null> => {
      if (!currentImage) {
        return null;
      }
      let result: PageText | null = null;
      const actions: PageTextActions = {
        setLoading: (loading) => dispatch(appActions.setPageTextLoading(loading)),
        setSaving: (saving) => dispatch(appActions.setPageTextSaving(saving)),
        setError: () => undefined,
        setEntry: (image, entry) => dispatch(appActions.setPageTextEntry(image, entry)),
        setRegenerated: (regenerated) => dispatch(appActions.setRegeneratedPageText(regenerated)),
        showToast,
        setResult: (entry) => {
          result = entry;
        }
      };
      await pageTextHandlers.runAction('savePageText', undefined, actions, {
        image: currentImage,
        text: nextText
      });
      return result;
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
    currentText,
    fetchPageText,
    fetchPageTextByImage,
    resetTextState,
    savePageText,
    textLoading,
    toggleTextModal,
    updatePageTextBlocks
  };
}
