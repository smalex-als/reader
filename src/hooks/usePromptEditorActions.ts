import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createPrompt as createPromptApi,
  deletePrompt as deletePromptApi,
  fetchPromptLibrary,
  updatePrompt,
  type PromptLibraryResult
} from '@/api/chapterTextPrompts';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
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

const promptEditorHandlers = createActionHandlerRegistry<
  PromptEditorWorkflowState,
  PromptEditorActions,
  PromptEditorActionPayloads
>();
const { addActionHandler } = promptEditorHandlers;

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
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setError,
    setStatus: actions.setStatus,
    fallbackError: 'Unable to load prompts.',
    request: fetchPromptLibrary,
    onSuccess: actions.setPrompts,
    onError: () => actions.setPrompts({ prompts: [] })
  });
});

addActionHandler('createPrompt', async (_global, actions, draft): Promise<void> => {
  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    setStatus: actions.setStatus,
    fallbackError: getCommandFallbackError('createPrompt'),
    successStatus: getCommandStatus('createPrompt'),
    request: () => createPromptApi(draft),
    onSuccess: actions.applyPromptResult
  });
});

addActionHandler('savePrompt', async (global, actions, payload): Promise<void> => {
  const prompt = global.prompts.find((item) => item.id === payload.promptId);
  if (!prompt) {
    return;
  }

  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    setStatus: actions.setStatus,
    fallbackError: getCommandFallbackError('savePrompt'),
    successStatus: getCommandStatus('savePrompt'),
    request: () => updatePrompt(payload.promptId, payload.draft),
    onSuccess: actions.applyPromptResult
  });
});

addActionHandler('deletePrompt', async (global, actions, payload): Promise<void> => {
  const prompt = global.prompts.find((item) => item.id === payload.promptId);
  if (!prompt || prompt.builtIn) {
    return;
  }

  await runRequest({
    setBusy: actions.setSaving,
    setError: actions.setError,
    setStatus: actions.setStatus,
    fallbackError: getCommandFallbackError('deletePrompt'),
    successStatus: getCommandStatus('deletePrompt'),
    request: () => deletePromptApi(payload.promptId),
    onSuccess: actions.applyPromptResult
  });
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
      await promptEditorHandlers.runAction(action, globalRef.current, actions, payload);
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
