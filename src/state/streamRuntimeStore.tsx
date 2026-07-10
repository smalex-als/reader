import { createContext, useContext, useRef, type ReactNode } from 'react';
import {
  createSelectorStore,
  useStoreSelector,
  type EqualityFn,
  type SelectorStore
} from '@/state/createSelectorStore';
import type { StreamState } from '@/types/app';

export const INITIAL_STREAM_RUNTIME_STATE: StreamState = {
  status: 'idle',
  pageKey: null,
  playbackSeconds: 0,
  modelSeconds: 0
};

const StreamRuntimeContext = createContext<SelectorStore<StreamState> | null>(null);
const selectStreamRuntime = (state: StreamState) => state;
const selectStreamActivity = (state: StreamState) => ({
  status: state.status,
  pageKey: state.pageKey
});
const streamActivityEqual: EqualityFn<ReturnType<typeof selectStreamActivity>> = (previous, next) => (
  previous.status === next.status && previous.pageKey === next.pageKey
);

function useStreamRuntimeStore() {
  const store = useContext(StreamRuntimeContext);
  if (!store) {
    throw new Error('Stream runtime hooks must be used inside StreamRuntimeProvider');
  }
  return store;
}

export function StreamRuntimeProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<SelectorStore<StreamState> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createSelectorStore(INITIAL_STREAM_RUNTIME_STATE);
  }

  return (
    <StreamRuntimeContext.Provider value={storeRef.current}>
      {children}
    </StreamRuntimeContext.Provider>
  );
}

export function useStreamRuntimeSelector<Selection>(
  selector: (state: StreamState) => Selection,
  isEqual?: EqualityFn<Selection>
) {
  return useStoreSelector(useStreamRuntimeStore(), selector, isEqual);
}

export function useStreamRuntime() {
  return useStreamRuntimeSelector(selectStreamRuntime);
}

export function useStreamActivity() {
  return useStreamRuntimeSelector(selectStreamActivity, streamActivityEqual);
}

export function useSetStreamRuntime() {
  return useStreamRuntimeStore().setState;
}
