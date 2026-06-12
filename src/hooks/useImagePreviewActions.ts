import { useCallback, useEffect, useMemo, useRef } from 'react';
import { enhanceImagePreview } from '@/api/imagePreview';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import { makeImagePreviewKey, normalizeImageCaption } from '@/lib/imagePreview';
import {
  appActions,
  selectImagePreviewWorkflow,
  useAppDispatch,
  useAppSelector,
  type ImagePreviewWorkflowState
} from '@/state/appState';
import type { ImagePreviewTarget } from '@/types/app';

type ImagePreviewActionPayloads = {
  enhancePreview: {
    preview: ImagePreviewTarget;
  };
  showOriginal: {
    preview: ImagePreviewTarget;
  };
};

type ImagePreviewActions = {
  setEnhancing: (enhancing: boolean) => void;
  setError: (error: string | null) => void;
  setEnhancedUrl: (preview: ImagePreviewTarget, url: string | null) => void;
};

const imagePreviewHandlers = createActionHandlerRegistry<
  ImagePreviewWorkflowState,
  ImagePreviewActions,
  ImagePreviewActionPayloads
>();
const { addActionHandler } = imagePreviewHandlers;

addActionHandler('enhancePreview', async (_global, actions, { preview }): Promise<void> => {
  await runRequest({
    setBusy: actions.setEnhancing,
    setError: actions.setError,
    fallbackError: 'Unable to enhance image.',
    request: () =>
      enhanceImagePreview({
        bookId: preview.bookId,
        imageFilename: preview.imageFilename,
        bounds: preview.bounds,
        caption: normalizeImageCaption(preview.caption)
      }),
    onSuccess: (url) => {
      actions.setEnhancedUrl(preview, url);
    }
  });
});

addActionHandler('showOriginal', (_global, actions, { preview }): void => {
  actions.setEnhancedUrl(preview, null);
});

export function useImagePreviewActions() {
  const dispatch = useAppDispatch();
  const imagePreview = useAppSelector(selectImagePreviewWorkflow);
  const globalRef = useRef(imagePreview);

  useEffect(() => {
    globalRef.current = imagePreview;
  }, [imagePreview]);

  const actions = useMemo<ImagePreviewActions>(
    () => ({
      setEnhancing: (enhancing) => {
        dispatch(appActions.setImagePreviewEnhancing(enhancing));
      },
      setError: (error) => {
        dispatch(appActions.setImagePreviewError(error));
      },
      setEnhancedUrl: (preview, url) => {
        const previewKey = makeImagePreviewKey(preview.bookId, preview.imageFilename, preview.bounds);
        dispatch(appActions.setImagePreviewCachedEnhancedUrl(previewKey, url));
        dispatch(appActions.setImagePreviewEnhancedUrl(url));
      }
    }),
    [dispatch]
  );

  const runAction = useCallback(
    async <T extends keyof ImagePreviewActionPayloads>(
      action: T,
      payload: ImagePreviewActionPayloads[T]
    ) => {
      await imagePreviewHandlers.runAction(action, globalRef.current, actions, payload);
    },
    [actions]
  );

  const enhancePreview = useCallback(
    (preview: ImagePreviewTarget) => runAction('enhancePreview', { preview }),
    [runAction]
  );
  const showOriginal = useCallback(
    (preview: ImagePreviewTarget) => runAction('showOriginal', { preview }),
    [runAction]
  );

  return {
    enhancePreview,
    showOriginal
  };
}
