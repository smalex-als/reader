import { useCallback, useEffect, useRef, useState } from 'react';
import { appActions, selectModalOpen, useAppDispatch, useAppSelector, type SimpleModal } from '@/state/appState';
import type { Quiz } from '@/types/app';

type UseQuizOptions = {
  targetKey: string | null;
  modal: Extract<SimpleModal, 'chapterQuiz' | 'unitQuiz'>;
  unavailableMessage: string;
  buildUrl: () => string | null;
  buildPostBody?: (force: boolean) => Record<string, unknown>;
};

export function useQuiz({ targetKey, modal, unavailableMessage, buildUrl, buildPostBody }: UseQuizOptions) {
  const dispatch = useAppDispatch();
  const quizOpen = useAppSelector(selectModalOpen(modal));
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    setQuiz(null);
    setQuizError(null);
    setQuizLoading(false);
  }, [targetKey]);

  const loadQuiz = useCallback(async (force = false) => {
    const baseUrl = buildUrl();
    if (!baseUrl || !targetKey) {
      setQuizError(unavailableMessage);
      setQuiz(null);
      dispatch(appActions.openModal(modal));
      return;
    }

    dispatch(appActions.openModal(modal));
    setQuizLoading(true);
    setQuizError(null);
    setQuiz(null);
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
      setQuiz({
        contextKey: payload.contextKey ?? targetKey,
        chapterNumber: payload.chapterNumber,
        unitSetId: payload.unitSetId,
        topicId: payload.topicId,
        title: payload.title,
        questions: Array.isArray(payload.questions) ? payload.questions : [],
        source: payload.source,
        file: payload.file
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load quiz.';
      setQuizError(message);
      setQuiz(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setQuizLoading(false);
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
