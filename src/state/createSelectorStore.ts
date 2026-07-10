import { useCallback, useRef, useSyncExternalStore } from 'react';

export type EqualityFn<T> = (previous: T, next: T) => boolean;

export type SelectorStore<State> = {
  getState: () => State;
  setState: (next: State | ((state: State) => State)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createSelectorStore<State>(initialState: State): SelectorStore<State> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (next) => {
      const nextState = typeof next === 'function'
        ? (next as (state: State) => State)(state)
        : next;
      if (Object.is(state, nextState)) {
        return;
      }
      state = nextState;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export function useStoreSelector<State, Selection>(
  store: SelectorStore<State>,
  selector: (state: State) => Selection,
  isEqual: EqualityFn<Selection> = Object.is
) {
  const cacheRef = useRef<{
    state: State;
    selector: (state: State) => Selection;
    selection: Selection;
  } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.getState();
    const cached = cacheRef.current;
    if (cached && cached.state === state && cached.selector === selector) {
      return cached.selection;
    }

    const nextSelection = selector(state);
    const selection = cached && isEqual(cached.selection, nextSelection)
      ? cached.selection
      : nextSelection;
    cacheRef.current = { state, selector, selection };
    return selection;
  }, [isEqual, selector, store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
