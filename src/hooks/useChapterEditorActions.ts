import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchEditableChapterText, saveEditableChapter } from '@/api/chapterEditor';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  useAppDispatch
} from '@/state/appState';

type ChapterEditorState = {
  draftText: string;
  draftTitle: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

type ChapterEditorPayloads = {
  loadDraft: {
    bookId: string | null;
    chapterNumber: number | null;
    chapterTitle: string | null;
    initialText: string | null;
    requestId: number;
  };
  saveDraft: {
    bookId: string | null;
    chapterNumber: number | null;
    versionId: string | null;
  };
  closeEditor: undefined;
};

type ChapterEditorActions = {
  getDraftText: () => string;
  getDraftTitle: () => string;
  setDraftText: (text: string) => void;
  setDraftTitle: (title: string) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  closeEditor: () => void;
  applySaveResult: (toc?: unknown) => void;
  isLoadRequestActive: (requestId: number) => boolean;
};

const chapterEditorHandlers = createActionHandlerRegistry<
  ChapterEditorState,
  ChapterEditorActions,
  ChapterEditorPayloads
>();
const { addActionHandler } = chapterEditorHandlers;

addActionHandler('loadDraft', async (_state, actions, payload): Promise<void> => {
  if (!payload.bookId || !payload.chapterNumber) {
    actions.setDraftText('');
    actions.setDraftTitle('');
    actions.setError(null);
    actions.setLoading(false);
    return;
  }
  const bookId = payload.bookId;
  const chapterNumber = payload.chapterNumber;

  if (payload.initialText !== null) {
    actions.setDraftText(payload.initialText);
    actions.setDraftTitle(payload.chapterTitle ?? '');
    actions.setError(null);
    actions.setLoading(false);
    return;
  }

  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    fallbackError: 'Unable to load chapter text.',
    isActive: () => actions.isLoadRequestActive(payload.requestId),
    request: () => fetchEditableChapterText(bookId, chapterNumber),
    onSuccess: (text) => {
      actions.setDraftText(text.trim());
      actions.setDraftTitle(payload.chapterTitle ?? '');
    }
  });
});

addActionHandler('saveDraft', async (state, actions, payload): Promise<void> => {
  if (!payload.bookId || !payload.chapterNumber || state.saving) {
    return;
  }
  const bookId = payload.bookId;
  const chapterNumber = payload.chapterNumber;

  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    fallbackError: 'Unable to save chapter.',
    request: () =>
      saveEditableChapter({
        bookId,
        chapterNumber,
        content: actions.getDraftText(),
        title: actions.getDraftTitle(),
        versionId: payload.versionId
      }),
    onSuccess: (result) => {
      actions.applySaveResult(result.toc);
      actions.closeEditor();
    }
  });
});

addActionHandler('closeEditor', (_state, actions): void => {
  actions.closeEditor();
});

export function useChapterEditorActions() {
  const dispatch = useAppDispatch();
  const latestLoadRequestRef = useRef(0);
  const [draftText, setDraftText] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = useMemo(
    () => ({
      draftText,
      draftTitle,
      loading,
      saving,
      error
    }),
    [draftText, draftTitle, error, loading, saving]
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useMemo<ChapterEditorActions>(
    () => ({
      getDraftText: () => stateRef.current.draftText,
      getDraftTitle: () => stateRef.current.draftTitle,
      setDraftText,
      setDraftTitle,
      setLoading,
      setSaving,
      setError,
      closeEditor: () => {
        dispatch(appActions.setEditorOpen(false));
        dispatch(appActions.setEditorChapterNumber(null));
        dispatch(appActions.setEditorTextVersion(null));
      },
      applySaveResult: (toc) => {
        if (Array.isArray(toc)) {
          dispatch(appActions.setTocEntries(toc));
        }
        dispatch(appActions.refreshChapterView());
      },
      isLoadRequestActive: (requestId) => latestLoadRequestRef.current === requestId
    }),
    [dispatch]
  );

  const runAction = useCallback(
    async <T extends keyof ChapterEditorPayloads>(action: T, payload: ChapterEditorPayloads[T]) => {
      await chapterEditorHandlers.runAction(action, stateRef.current, actions, payload);
    },
    [actions]
  );

  const loadDraft = useCallback(
    (payload: Omit<ChapterEditorPayloads['loadDraft'], 'requestId'>) => {
      latestLoadRequestRef.current += 1;
      return runAction('loadDraft', {
        ...payload,
        requestId: latestLoadRequestRef.current
      });
    },
    [runAction]
  );

  return {
    draftText,
    draftTitle,
    loading,
    saving,
    error,
    setDraftText,
    setDraftTitle,
    loadDraft,
    saveDraft: useCallback((payload: ChapterEditorPayloads['saveDraft']) => runAction('saveDraft', payload), [runAction]),
    closeEditor: useCallback(() => runAction('closeEditor', undefined), [runAction])
  };
}
