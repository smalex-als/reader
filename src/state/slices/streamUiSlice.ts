import type { StreamUiControlsState } from '@/state/appState';

export type StreamUiAction =
  | { type: 'streamUi/toggleAutoFollow' }
  | { type: 'streamUi/setSelectedBlockKey'; key: string | null }
  | { type: 'streamUi/setPlaybackRate'; rate: number };

const STREAM_UI_ACTION_TYPES = new Set<StreamUiAction['type']>([
  'streamUi/toggleAutoFollow',
  'streamUi/setSelectedBlockKey',
  'streamUi/setPlaybackRate'
]);

export const initialStreamUiState: StreamUiControlsState = {
  autoFollowStream: true,
  selectedStreamBlockKey: null,
  playbackRate: 1
};

export const streamUiActions = {
  toggleAutoFollowStream: () => ({ type: 'streamUi/toggleAutoFollow' as const }),
  setSelectedStreamBlockKey: (key: string | null) => ({
    type: 'streamUi/setSelectedBlockKey' as const,
    key
  }),
  setPlaybackRate: (rate: number) => ({ type: 'streamUi/setPlaybackRate' as const, rate })
};

export function isStreamUiAction(action: { type: string }): action is StreamUiAction {
  return STREAM_UI_ACTION_TYPES.has(action.type as StreamUiAction['type']);
}

export function reduceStreamUiState(
  state: StreamUiControlsState,
  action: StreamUiAction
): StreamUiControlsState {
  switch (action.type) {
    case 'streamUi/toggleAutoFollow':
      return { ...state, autoFollowStream: !state.autoFollowStream };
    case 'streamUi/setSelectedBlockKey':
      return { ...state, selectedStreamBlockKey: action.key };
    case 'streamUi/setPlaybackRate':
      return { ...state, playbackRate: action.rate };
  }
}
