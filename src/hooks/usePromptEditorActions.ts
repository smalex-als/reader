import { useEffect, useRef } from 'react';
import {
  createPrompt,
  deletePrompt,
  fetchPromptLibrary,
  updatePrompt,
  type PromptLibraryResult
} from '@/api/chapterTextPrompts';
import {
  appActions,
  selectPromptEditorWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';

function getCommandStatus(kind: 'create' | 'save' | 'delete') {
  switch (kind) {
    case 'create':
      return 'Prompt created.';
    case 'save':
      return 'Prompt saved.';
    case 'delete':
      return 'Prompt deleted.';
    default:
      return null;
  }
}

function getCommandFallbackError(kind: 'create' | 'save' | 'delete') {
  switch (kind) {
    case 'create':
      return 'Unable to create prompt.';
    case 'save':
      return 'Unable to save prompt.';
    case 'delete':
      return 'Unable to delete prompt.';
    default:
      return 'Unable to update prompts.';
  }
}

function applyPromptResult(dispatch: ReturnType<typeof useAppDispatch>, result: PromptLibraryResult) {
  dispatch(appActions.setPromptEditorPrompts(result.prompts, result.selectedPromptId));
  dispatch(appActions.refreshChapterView());
}

export function usePromptEditorActions() {
  const dispatch = useAppDispatch();
  const { loadRequestId, commandRequest } = useAppSelector(selectPromptEditorWorkflow);
  const handledLoadRequestRef = useRef(0);
  const handledCommandRequestRef = useRef(0);

  useEffect(() => {
    if (loadRequestId === 0 || handledLoadRequestRef.current === loadRequestId) {
      return;
    }

    handledLoadRequestRef.current = loadRequestId;
    let cancelled = false;

    dispatch(appActions.setPromptEditorLoading(true));
    dispatch(appActions.setPromptEditorError(null));
    dispatch(appActions.setPromptEditorStatus(null));

    fetchPromptLibrary()
      .then((result) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setPromptEditorPrompts(result.prompts, result.selectedPromptId));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(appActions.setPromptEditorPrompts([]));
        dispatch(appActions.setPromptEditorError(error instanceof Error ? error.message : 'Unable to load prompts.'));
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setPromptEditorLoading(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [dispatch, loadRequestId]);

  useEffect(() => {
    if (!commandRequest || handledCommandRequestRef.current === commandRequest.id) {
      return;
    }

    handledCommandRequestRef.current = commandRequest.id;
    let cancelled = false;

    dispatch(appActions.setPromptEditorSaving(true));
    dispatch(appActions.setPromptEditorError(null));
    dispatch(appActions.setPromptEditorStatus(null));

    const request =
      commandRequest.kind === 'create'
        ? createPrompt(commandRequest.draft)
        : commandRequest.kind === 'save'
        ? updatePrompt(commandRequest.promptId, commandRequest.draft)
        : deletePrompt(commandRequest.promptId);

    request
      .then((result) => {
        if (cancelled) {
          return;
        }
        applyPromptResult(dispatch, result);
        dispatch(appActions.setPromptEditorStatus(getCommandStatus(commandRequest.kind)));
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        dispatch(
          appActions.setPromptEditorError(
            error instanceof Error ? error.message : getCommandFallbackError(commandRequest.kind)
          )
        );
      })
      .finally(() => {
        if (!cancelled) {
          dispatch(appActions.setPromptEditorSaving(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commandRequest, dispatch]);
}
