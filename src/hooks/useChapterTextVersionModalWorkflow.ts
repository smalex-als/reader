import { useCallback, useEffect, useRef, type SetStateAction } from 'react';
import {
  appActions,
  selectTextVersionModalWorkflow,
  useAppDispatch,
  useAppSelector
} from '@/state/appState';
import type { ChapterTextPrompt, ChapterTextVersion } from '@/types/app';

function resolveNext<T>(next: SetStateAction<T>, current: T) {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

export function useChapterTextVersionModalWorkflow({
  versions,
  promptLibrary,
  versionSaving,
  canCreateVersion
}: {
  versions: ChapterTextVersion[];
  promptLibrary: ChapterTextPrompt[];
  versionSaving: boolean;
  canCreateVersion: boolean;
}) {
  const dispatch = useAppDispatch();
  const workflow = useAppSelector(selectTextVersionModalWorkflow);
  const sourceVersionIdRef = useRef(workflow.sourceVersionId);
  const selectedPromptIdRef = useRef(workflow.selectedPromptId);

  useEffect(() => {
    sourceVersionIdRef.current = workflow.sourceVersionId;
  }, [workflow.sourceVersionId]);

  useEffect(() => {
    selectedPromptIdRef.current = workflow.selectedPromptId;
  }, [workflow.selectedPromptId]);

  useEffect(() => {
    dispatch(appActions.setTextVersionModalResources({
      versions,
      promptLibrary,
      versionSaving,
      canCreateVersion
    }));
  }, [canCreateVersion, dispatch, promptLibrary, versionSaving, versions]);

  const setSourceVersionId = useCallback(
    (next: SetStateAction<string>) => {
      dispatch(appActions.setTextVersionModalSourceVersionId(resolveNext(next, sourceVersionIdRef.current)));
    },
    [dispatch]
  );

  const setSelectedPromptId = useCallback(
    (next: SetStateAction<string>) => {
      dispatch(appActions.setTextVersionModalSelectedPromptId(resolveNext(next, selectedPromptIdRef.current)));
    },
    [dispatch]
  );

  return {
    ...workflow,
    setSourceVersionId,
    setSelectedPromptId
  };
}
