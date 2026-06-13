import { useCallback, useEffect, useRef, useState } from 'react';
import type { UnitItem, UnitSet } from '@/types/app';

export function useUnitSelfCheckRuntime({
  clearSelfCheckFeedback,
  evaluateSelfCheck,
  selectedSet,
  selectedTopicId,
  selectedUnit,
  selfCheckLoading
}: {
  clearSelfCheckFeedback: () => void;
  evaluateSelfCheck: (payload: {
    unitSetId: string;
    topicId: string;
    question: string;
    answer: string;
  }) => Promise<void>;
  selectedSet: UnitSet | null;
  selectedTopicId: string | null;
  selectedUnit: UnitItem | null;
  selfCheckLoading: boolean;
}) {
  const [selfCheckOpen, setSelfCheckOpen] = useState(false);
  const [selfCheckIndex, setSelfCheckIndex] = useState(0);
  const [selfCheckAnswer, setSelfCheckAnswer] = useState('');
  const detailRef = useRef<HTMLDivElement | null>(null);
  const selfCheckQuestions = selectedUnit?.selfCheckQuestions ?? [];
  const currentSelfCheckQuestion = selfCheckQuestions[selfCheckIndex] ?? null;

  useEffect(() => {
    if (!selectedTopicId) {
      return;
    }
    detailRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setSelfCheckOpen(false);
    setSelfCheckIndex(0);
    setSelfCheckAnswer('');
    clearSelfCheckFeedback();
  }, [clearSelfCheckFeedback, selectedTopicId]);

  const openSelfCheck = useCallback(() => {
    setSelfCheckOpen(true);
    setSelfCheckIndex(0);
    setSelfCheckAnswer('');
    clearSelfCheckFeedback();
  }, [clearSelfCheckFeedback]);

  const closeSelfCheck = useCallback(() => {
    if (selfCheckLoading) {
      return;
    }
    setSelfCheckOpen(false);
  }, [selfCheckLoading]);

  const selectSelfCheckQuestion = useCallback(
    (index: number) => {
      setSelfCheckIndex(index);
      setSelfCheckAnswer('');
      clearSelfCheckFeedback();
    },
    [clearSelfCheckFeedback]
  );

  const goToNextSelfCheckQuestion = useCallback(() => {
    if (selfCheckIndex >= selfCheckQuestions.length - 1) {
      closeSelfCheck();
      return;
    }
    selectSelfCheckQuestion(selfCheckIndex + 1);
  }, [closeSelfCheck, selectSelfCheckQuestion, selfCheckIndex, selfCheckQuestions.length]);

  const updateSelfCheckAnswer = useCallback(
    (answer: string) => {
      setSelfCheckAnswer(answer);
      clearSelfCheckFeedback();
    },
    [clearSelfCheckFeedback]
  );

  const submitSelfCheckAnswer = useCallback(async () => {
    if (!selectedSet || !selectedUnit || !currentSelfCheckQuestion || !selfCheckAnswer.trim()) {
      return;
    }
    await evaluateSelfCheck({
      unitSetId: selectedSet.id,
      topicId: selectedUnit.id,
      question: currentSelfCheckQuestion,
      answer: selfCheckAnswer
    });
  }, [currentSelfCheckQuestion, evaluateSelfCheck, selectedSet, selectedUnit, selfCheckAnswer]);

  return {
    currentSelfCheckQuestion,
    detailRef,
    selfCheckAnswer,
    selfCheckIndex,
    selfCheckOpen,
    selfCheckQuestions,
    closeSelfCheck,
    goToNextSelfCheckQuestion,
    openSelfCheck,
    selectSelfCheckQuestion,
    submitSelfCheckAnswer,
    updateSelfCheckAnswer
  };
}
