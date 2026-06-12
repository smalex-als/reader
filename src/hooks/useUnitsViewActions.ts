import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  evaluateUnitTopicSelfCheck,
  fetchUnitSets,
  updateUnitTopicRead
} from '@/api/units';
import { useToast } from '@/hooks/useToast';
import { createActionHandlerRegistry, runRequest } from '@/lib/actionHandlers';
import type { SelfCheckResult, UnitSet } from '@/types/app';

type UnitsViewState = {
  items: UnitSet[];
  loading: boolean;
  selfCheckLoading: boolean;
  selfCheckError: string | null;
  selfCheckResult: SelfCheckResult | null;
};

type UnitsViewPayloads = {
  loadItems: undefined;
  toggleTopicRead: {
    unitSetId: string;
    topicId: string;
    read: boolean;
  };
  evaluateSelfCheck: {
    unitSetId: string;
    topicId: string;
    question: string;
    answer: string;
  };
};

type UnitsViewActions = {
  setItems: (items: UnitSet[]) => void;
  setLoading: (loading: boolean) => void;
  replaceUnitSet: (item: UnitSet) => void;
  setTopicUpdating: (updating: boolean) => void;
  setTopicError: (message: string | null) => void;
  setSelfCheckLoading: (loading: boolean) => void;
  setSelfCheckError: (message: string | null) => void;
  setSelfCheckResult: (result: SelfCheckResult | null) => void;
  showError: (message: string) => void;
};

const unitsViewHandlers = createActionHandlerRegistry<
  UnitsViewState,
  UnitsViewActions,
  UnitsViewPayloads
>();
const { addActionHandler } = unitsViewHandlers;

addActionHandler('loadItems', async (_state, actions): Promise<void> => {
  await runRequest({
    setBusy: actions.setLoading,
    setError: actions.setTopicError,
    fallbackError: 'Unable to load units.',
    request: fetchUnitSets,
    onSuccess: actions.setItems,
    onError: (error) => {
      actions.showError(error instanceof Error ? error.message : 'Unable to load units.');
    }
  });
});

addActionHandler('toggleTopicRead', async (_state, actions, payload): Promise<void> => {
  await runRequest({
    setBusy: actions.setTopicUpdating,
    setError: actions.setTopicError,
    fallbackError: 'Unable to update topic.',
    request: () => updateUnitTopicRead(payload),
    onSuccess: (item) => {
      if (item) {
        actions.replaceUnitSet(item);
      }
    },
    onError: (error) => {
      actions.showError(error instanceof Error ? error.message : 'Unable to update topic.');
    }
  });
});

addActionHandler('evaluateSelfCheck', async (_state, actions, payload): Promise<void> => {
  await runRequest({
    setBusy: actions.setSelfCheckLoading,
    setError: actions.setSelfCheckError,
    fallbackError: 'Unable to check answer.',
    request: () => evaluateUnitTopicSelfCheck(payload),
    onSuccess: actions.setSelfCheckResult
  });
});

export function useUnitsViewActions() {
  const { showToast } = useToast();
  const [items, setItems] = useState<UnitSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setTopicUpdating] = useState(false);
  const [, setTopicError] = useState<string | null>(null);
  const [selfCheckLoading, setSelfCheckLoading] = useState(false);
  const [selfCheckError, setSelfCheckError] = useState<string | null>(null);
  const [selfCheckResult, setSelfCheckResult] = useState<SelfCheckResult | null>(null);
  const state = useMemo(
    () => ({
      items,
      loading,
      selfCheckLoading,
      selfCheckError,
      selfCheckResult
    }),
    [items, loading, selfCheckError, selfCheckLoading, selfCheckResult]
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const actions = useMemo<UnitsViewActions>(
    () => ({
      setItems,
      setLoading,
      replaceUnitSet: (item) => {
        setItems((current) => current.map((unitSet) => (unitSet.id === item.id ? item : unitSet)));
      },
      setTopicUpdating,
      setTopicError,
      setSelfCheckLoading,
      setSelfCheckError,
      setSelfCheckResult,
      showError: (message) => showToast(message, 'error')
    }),
    [showToast]
  );

  const runAction = useCallback(
    async <T extends keyof UnitsViewPayloads>(action: T, payload: UnitsViewPayloads[T]) => {
      await unitsViewHandlers.runAction(action, stateRef.current, actions, payload);
    },
    [actions]
  );

  const clearSelfCheckFeedback = useCallback(() => {
    setSelfCheckError(null);
    setSelfCheckResult(null);
  }, []);

  return {
    items,
    loading,
    selfCheckLoading,
    selfCheckError,
    selfCheckResult,
    clearSelfCheckFeedback,
    loadItems: useCallback(() => runAction('loadItems', undefined), [runAction]),
    toggleTopicRead: useCallback(
      (payload: UnitsViewPayloads['toggleTopicRead']) => runAction('toggleTopicRead', payload),
      [runAction]
    ),
    evaluateSelfCheck: useCallback(
      (payload: UnitsViewPayloads['evaluateSelfCheck']) => runAction('evaluateSelfCheck', payload),
      [runAction]
    )
  };
}
