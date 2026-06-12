import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createPrompt as createPromptApi,
  deletePrompt as deletePromptApi,
  fetchPromptLibrary,
  updatePrompt,
  type PromptLibraryResult
} from '@/api/chapterTextPrompts';
import {
  appActions,
  selectPromptEditorWorkflow,
  useAppDispatch,
  useAppSelector,
  type PromptEditorWorkflowState
} from '@/state/appState';
import type { ChapterTextPromptDraft } from '@/types/app';

type PromptEditorActionPayloads = {
  loadPrompts: undefined;
  createPrompt: ChapterTextPromptDraft;
  savePrompt: {
    promptId: string;
    draft: ChapterTextPromptDraft;
  };
  deletePrompt: {
    promptId: string;
  };
};

type PromptEditorActions = {
  applyPromptResult: (result: PromptLibraryResult) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setStatus: (status: string | null) => void;
  setPrompts: (result: PromptLibraryResult) => void;
};

type PromptEditorActionHandler<T extends keyof PromptEditorActionPayloads> = (
  global: PromptEditorWorkflowState,
  actions: PromptEditorActions,
  payload: PromptEditorActionPayloads[T]
) => Promise<void>;

const actionHandlers: Partial<Record<keyof PromptEditorActionPayloads, unknown>> = {};

function addActionHandler<T extends keyof PromptEditorActionPayloads>(
  action: T,
  handler: PromptEditorActionHandler<T>
) {
  actionHandlers[action] = handler;
}

function getCommandStatus(kind: 'createPrompt' | 'savePrompt' | 'deletePrompt') {
  switch (kind) {
    case 'createPrompt':
      return 'Prompt created.';
    case 'savePrompt':
      return 'Prompt saved.';
    case 'deletePrompt':
      return 'Prompt deleted.';
    default:
      return null;
  }
}

function getCommandFallbackError(kind: 'createPrompt' | 'savePrompt' | 'deletePrompt') {
  switch (kind) {
    case 'createPrompt':
      return 'Unable to create prompt.';
    case 'savePrompt':
      return 'Unable to save prompt.';
    case 'deletePrompt':
      return 'Unable to delete prompt.';
    default:
      return 'Unable to update prompts.';
  }
}

addActionHandler('loadPrompts', async (_global, actions): Promise<void> => {
  actions.setLoading(true);
  actions.setError(null);
  actions.setStatus(null);

  try {
    const result = await fetchPromptLibrary();
    actions.setPrompts(result);
  } catch (error) {
    actions.setPrompts({ prompts: [] });
    actions.setError(error instanceof Error ? error.message : 'Unable to load prompts.');
  } finally {
    actions.setLoading(false);
  }
});

addActionHandler('createPrompt', async (_global, actions, draft): Promise<void> => {
  actions.setSaving(true);
  actions.setError(null);
  actions.setStatus(null);

  try {
    const result = await createPromptApi(draft);
    actions.applyPromptResult(result);
    actions.setStatus(getCommandStatus('createPrompt'));
  } catch (error) {
    actions.setError(error instanceof Error ? error.message : getCommandFallbackError('createPrompt'));
  } finally {
    actions.setSaving(false);
  }
});

addActionHandler('savePrompt', async (global, actions, payload): Promise<void> => {
  const prompt = global.prompts.find((item) => item.id === payload.promptId);
  if (!prompt) {
    return;
  }

  actions.setSaving(true);
  actions.setError(null);
  actions.setStatus(null);

  try {
    const result = await updatePrompt(payload.promptId, payload.draft);
    actions.applyPromptResult(result);
    actions.setStatus(getCommandStatus('savePrompt'));
  } catch (error) {
    actions.setError(error instanceof Error ? error.message : getCommandFallbackError('savePrompt'));
  } finally {
    actions.setSaving(false);
  }
});

addActionHandler('deletePrompt', async (global, actions, payload): Promise<void> => {
  const prompt = global.prompts.find((item) => item.id === payload.promptId);
  if (!prompt || prompt.builtIn) {
    return;
  }

  actions.setSaving(true);
  actions.setError(null);
  actions.setStatus(null);

  try {
    const result = await deletePromptApi(payload.promptId);
    actions.applyPromptResult(result);
    actions.setStatus(getCommandStatus('deletePrompt'));
  } catch (error) {
    actions.setError(error instanceof Error ? error.message : getCommandFallbackError('deletePrompt'));
  } finally {
    actions.setSaving(false);
  }
});

export function usePromptEditorActions() {
  const dispatch = useAppDispatch();
  const promptEditor = useAppSelector(selectPromptEditorWorkflow);
  const globalRef = useRef(promptEditor);

  useEffect(() => {
    globalRef.current = promptEditor;
  }, [promptEditor]);

  const actions = useMemo<PromptEditorActions>(
    () => ({
      applyPromptResult: (result) => {
        dispatch(appActions.setPromptEditorPrompts(result.prompts, result.selectedPromptId));
        dispatch(appActions.refreshChapterView());
      },
      setLoading: (loading) => {
        dispatch(appActions.setPromptEditorLoading(loading));
      },
      setSaving: (saving) => {
        dispatch(appActions.setPromptEditorSaving(saving));
      },
      setError: (error) => {
        dispatch(appActions.setPromptEditorError(error));
      },
      setStatus: (status) => {
        dispatch(appActions.setPromptEditorStatus(status));
      },
      setPrompts: (result) => {
        dispatch(appActions.setPromptEditorPrompts(result.prompts, result.selectedPromptId));
      }
    }),
    [dispatch]
  );

  const runAction = useCallback(
    async <T extends keyof PromptEditorActionPayloads>(
      action: T,
      payload: PromptEditorActionPayloads[T]
    ) => {
      const handler = actionHandlers[action] as PromptEditorActionHandler<T> | undefined;
      if (!handler) {
        return;
      }
      await handler(globalRef.current, actions, payload);
    },
    [actions]
  );

  const loadPrompts = useCallback(() => runAction('loadPrompts', undefined), [runAction]);
  const createPrompt = useCallback(
    (draft: ChapterTextPromptDraft) => runAction('createPrompt', draft),
    [runAction]
  );
  const savePrompt = useCallback(
    (promptId: string, draft: ChapterTextPromptDraft) => runAction('savePrompt', { promptId, draft }),
    [runAction]
  );
  const deletePrompt = useCallback(
    (promptId: string) => runAction('deletePrompt', { promptId }),
    [runAction]
  );
  const selectPrompt = useCallback(
    (promptId: string) => {
      dispatch(appActions.setPromptEditorSelectedId(promptId));
    },
    [dispatch]
  );

  return {
    loadPrompts,
    createPrompt,
    savePrompt,
    deletePrompt,
    selectPrompt
  };
}
