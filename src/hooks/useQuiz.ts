import { useCallback, useEffect, useRef } from 'react';
import {
  appActions,
  selectModalOpen,
  selectQuizWorkflow,
  useAppDispatch,
  useAppSelector,
  type QuizModal
} from '@/state/appState';
import type { Quiz } from '@/types/app';

type UseQuizOptions = {
  targetKey: string | null;
  modal: QuizModal;
  unavailableMessage: string;
  buildUrl: () => string | null;
  buildPostBody?: (force: boolean) => Record<string, unknown>;
};

export function useQuiz({ targetKey, modal, unavailableMessage, buildUrl, buildPostBody }: UseQuizOptions) {
  const dispatch = useAppDispatch();
  const quizOpen = useAppSelector(selectModalOpen(modal));
  const { loading: quizLoading, error: quizError, quiz } = useAppSelector(selectQuizWorkflow(modal));
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    dispatch(appActions.resetQuiz(modal));
  }, [dispatch, modal, targetKey]);

  const loadQuiz = useCallback(async (force = false) => {
    const baseUrl = buildUrl();
    if (!baseUrl || !targetKey) {
      dispatch(appActions.setQuizError(modal, unavailableMessage));
      dispatch(appActions.setQuiz(modal, null));
      dispatch(appActions.openModal(modal));
      return;
    }

    dispatch(appActions.openModal(modal));
    dispatch(appActions.setQuizLoading(modal, true));
    dispatch(appActions.setQuizError(modal, null));
    dispatch(appActions.setQuiz(modal, null));
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      let response = await fetch(baseUrl);
      if (response.status === 404 || force) {
        response = await fetch(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPostBody ? buildPostBody(force) : { force })
        });
      }
      if (!response.ok) {
        throw new Error(`Quiz request failed: ${response.status}`);
      }

      const payload = (await response.json()) as Omit<Quiz, 'contextKey'> & { contextKey?: string };

      if (requestIdRef.current !== requestId) {
        return;
      }
      dispatch(appActions.setQuiz(modal, {
        contextKey: payload.contextKey ?? targetKey,
        chapterNumber: payload.chapterNumber,
        unitSetId: payload.unitSetId,
        topicId: payload.topicId,
        title: payload.title,
        questions: Array.isArray(payload.questions) ? payload.questions : [],
        source: payload.source,
        file: payload.file
      }));
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load quiz.';
      dispatch(appActions.setQuizError(modal, message));
      dispatch(appActions.setQuiz(modal, null));
    } finally {
      if (requestIdRef.current === requestId) {
        dispatch(appActions.setQuizLoading(modal, false));
      }
    }
  }, [buildPostBody, buildUrl, dispatch, modal, targetKey, unavailableMessage]);

  const openQuiz = useCallback(async () => {
    await loadQuiz(false);
  }, [loadQuiz]);

  const regenerateQuiz = useCallback(async () => {
    await loadQuiz(true);
  }, [loadQuiz]);

  const closeQuiz = useCallback(() => {
    dispatch(appActions.closeModal(modal));
  }, [dispatch, modal]);

  return {
    quizOpen,
    quizLoading,
    quizError,
    quiz,
    openQuiz,
    regenerateQuiz,
    closeQuiz
  };
}
