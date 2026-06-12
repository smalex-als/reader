import { useCallback, useEffect, useRef } from 'react';
import { loadQuizTarget } from '@/api/quiz';
import type { QuizTarget } from '@/api/quiz';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import {
  appActions,
  useAppDispatch,
  type QuizModal
} from '@/state/appState';
import type { Quiz } from '@/types/app';

type UseQuizOptions = {
  targetKey: string | null;
  target: QuizTarget | null;
  modal: QuizModal;
  unavailableMessage: string;
};

type QuizPayloads = {
  loadQuiz: {
    targetKey: string | null;
    target: QuizTarget | null;
    modal: QuizModal;
    unavailableMessage: string;
    force: boolean;
    requestId: number;
  };
};

type QuizActions = {
  openModal: (modal: QuizModal) => void;
  setLoading: (modal: QuizModal, loading: boolean) => void;
  setError: (modal: QuizModal, error: string | null) => void;
  setQuiz: (modal: QuizModal, quiz: Quiz | null) => void;
  isRequestActive: (requestId: number) => boolean;
};

const quizHandlers = createActionHandlerRegistry<unknown, QuizActions, QuizPayloads>();
const { addActionHandler } = quizHandlers;

addActionHandler('loadQuiz', async (_state, actions, payload): Promise<void> => {
  if (!payload.target || !payload.targetKey) {
    actions.setError(payload.modal, payload.unavailableMessage);
    actions.setQuiz(payload.modal, null);
    actions.setLoading(payload.modal, false);
    actions.openModal(payload.modal);
    return;
  }

  actions.openModal(payload.modal);
  actions.setQuiz(payload.modal, null);
  await runRequest({
    setBusy: (loading) => actions.setLoading(payload.modal, loading),
    setError: (error) => actions.setError(payload.modal, error),
    fallbackError: 'Unable to load quiz.',
    isActive: () => actions.isRequestActive(payload.requestId),
    request: () => loadQuizTarget(payload.target!, payload.force),
    onSuccess: (quiz) => {
      actions.setQuiz(payload.modal, {
        contextKey: quiz.contextKey ?? payload.targetKey!,
        chapterNumber: quiz.chapterNumber,
        unitSetId: quiz.unitSetId,
        topicId: quiz.topicId,
        title: quiz.title,
        questions: quiz.questions,
        source: quiz.source,
        file: quiz.file
      });
    },
    onError: () => {
      actions.setQuiz(payload.modal, null);
    }
  });
});

export function useQuiz({ targetKey, target, modal, unavailableMessage }: UseQuizOptions) {
  const dispatch = useAppDispatch();
  const requestIdRef = useRef(0);
  const runAction = useCallback(
    async <T extends keyof QuizPayloads>(action: T, payload: QuizPayloads[T]) => {
      const actions: QuizActions = {
        openModal: (targetModal) => dispatch(appActions.openModal(targetModal)),
        setLoading: (targetModal, loading) => dispatch(appActions.setQuizLoading(targetModal, loading)),
        setError: (targetModal, error) => dispatch(appActions.setQuizError(targetModal, error)),
        setQuiz: (targetModal, quiz) => dispatch(appActions.setQuiz(targetModal, quiz)),
        isRequestActive: (requestId) => requestIdRef.current === requestId
      };
      await quizHandlers.runAction(action, undefined, actions, payload);
    },
    [dispatch]
  );

  useEffect(() => {
    requestIdRef.current += 1;
    dispatch(appActions.resetQuiz(modal));
  }, [dispatch, modal, targetKey]);

  const loadQuiz = useCallback(async (force = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    await runAction('loadQuiz', {
      targetKey,
      target,
      modal,
      unavailableMessage,
      force,
      requestId
    });
  }, [modal, runAction, target, targetKey, unavailableMessage]);

  const openQuiz = useCallback(async () => {
    await loadQuiz(false);
  }, [loadQuiz]);

  const regenerateQuiz = useCallback(async () => {
    await loadQuiz(true);
  }, [loadQuiz]);

  return {
    openQuiz,
    regenerateQuiz
  };
}
