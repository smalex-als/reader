import {
  createDefaultSettings,
  normalizeTextBrightness,
  normalizeTextFontSize,
  normalizeTextTheme,
  type StreamVoice,
  type StreamVoiceOption
} from '@/lib/appConstants';
import type { AppSettings, AudioState, ViewerMetrics } from '@/types/app';
import type { FloatingAudioPlaybackState, FloatingAudioTrack } from '@/types/floatingAudio';
import type {
  FloatingAudioState,
  PrintWorkflowState,
  ViewerWorkflowState,
  VoiceWorkflowState
} from '@/state/appState';

export type MediaPreferencesState = {
  audio: AudioState;
  floatingAudio: FloatingAudioState;
  printWorkflow: PrintWorkflowState;
  viewerWorkflow: ViewerWorkflowState;
  voiceWorkflow: VoiceWorkflowState;
};

export type MediaPreferencesAction =
  | { type: 'audio/reset' }
  | { type: 'audio/stop' }
  | { type: 'audio/syncFloating'; playbackState: FloatingAudioPlaybackState; track: FloatingAudioTrack; pageKey: string | null }
  | { type: 'floatingAudio/play'; track: FloatingAudioTrack }
  | { type: 'floatingAudio/close' }
  | { type: 'floatingAudio/setPlaybackState'; playbackState: FloatingAudioPlaybackState }
  | { type: 'printWorkflow/setSelection'; selection: string }
  | { type: 'printWorkflow/setLoading'; loading: boolean }
  | { type: 'viewerWorkflow/setSettings'; settings: AppSettings }
  | { type: 'viewerWorkflow/setMetrics'; metrics: ViewerMetrics | null }
  | { type: 'voiceWorkflow/setVoiceOptions'; options: StreamVoiceOption[]; defaultVoice: StreamVoice }
  | { type: 'voiceWorkflow/setStreamVoice'; voice: StreamVoice }
  | { type: 'voiceWorkflow/setMp3Voice'; voice: StreamVoice };

const MEDIA_PREFERENCES_ACTION_TYPES = new Set<MediaPreferencesAction['type']>([
  'audio/reset',
  'audio/stop',
  'audio/syncFloating',
  'floatingAudio/play',
  'floatingAudio/close',
  'floatingAudio/setPlaybackState',
  'printWorkflow/setSelection',
  'printWorkflow/setLoading',
  'viewerWorkflow/setSettings',
  'viewerWorkflow/setMetrics',
  'voiceWorkflow/setVoiceOptions',
  'voiceWorkflow/setStreamVoice',
  'voiceWorkflow/setMp3Voice'
]);

const initialAudioState: AudioState = {
  status: 'idle',
  url: null,
  source: null,
  provider: null,
  currentPageKey: null
};

export function createInitialMediaPreferencesState(): MediaPreferencesState {
  return {
    audio: initialAudioState,
    floatingAudio: { track: null, playbackState: 'idle' },
    printWorkflow: { selection: 'current', loading: false },
    viewerWorkflow: { settings: createDefaultSettings(), metrics: null },
    voiceWorkflow: {
      streamVoiceOptions: [],
      defaultStreamVoice: '',
      streamVoice: '',
      mp3Voice: ''
    }
  };
}

export const mediaPreferencesActions = {
  resetAudio: () => ({ type: 'audio/reset' as const }),
  stopAudio: () => ({ type: 'audio/stop' as const }),
  syncFloatingAudio: (
    playbackState: FloatingAudioPlaybackState,
    track: FloatingAudioTrack,
    pageKey: string | null
  ) => ({ type: 'audio/syncFloating' as const, playbackState, track, pageKey }),
  playFloatingAudio: (track: FloatingAudioTrack) => ({ type: 'floatingAudio/play' as const, track }),
  closeFloatingAudio: () => ({ type: 'floatingAudio/close' as const }),
  setFloatingAudioPlaybackState: (playbackState: FloatingAudioPlaybackState) => ({
    type: 'floatingAudio/setPlaybackState' as const,
    playbackState
  }),
  setPrintSelection: (selection: string) => ({ type: 'printWorkflow/setSelection' as const, selection }),
  setPrintLoading: (loading: boolean) => ({ type: 'printWorkflow/setLoading' as const, loading }),
  setViewerSettings: (settings: AppSettings) => ({ type: 'viewerWorkflow/setSettings' as const, settings }),
  setViewerMetrics: (metrics: ViewerMetrics | null) => ({ type: 'viewerWorkflow/setMetrics' as const, metrics }),
  setVoiceOptions: (options: StreamVoiceOption[], defaultVoice: StreamVoice) => ({
    type: 'voiceWorkflow/setVoiceOptions' as const,
    options,
    defaultVoice
  }),
  setStreamVoice: (voice: StreamVoice) => ({ type: 'voiceWorkflow/setStreamVoice' as const, voice }),
  setMp3Voice: (voice: StreamVoice) => ({ type: 'voiceWorkflow/setMp3Voice' as const, voice })
};

export function isMediaPreferencesAction(action: { type: string }): action is MediaPreferencesAction {
  return MEDIA_PREFERENCES_ACTION_TYPES.has(action.type as MediaPreferencesAction['type']);
}

export function reduceMediaPreferences(
  state: MediaPreferencesState,
  action: MediaPreferencesAction
): MediaPreferencesState {
  switch (action.type) {
    case 'audio/reset':
      return { ...state, audio: { ...initialAudioState } };
    case 'audio/stop':
      return {
        ...state,
        audio: { ...state.audio, status: 'idle', source: null, provider: null, currentPageKey: null }
      };
    case 'audio/syncFloating': {
      if (action.track.kind !== 'page-tts' && action.track.kind !== 'text-tts') return state;
      if (action.playbackState === 'ended') {
        return {
          ...state,
          audio: {
            ...state.audio,
            status: 'idle',
            url: action.track.url,
            source: state.audio.source ?? 'ai',
            provider: null,
            currentPageKey: null
          }
        };
      }
      return {
        ...state,
        audio: {
          ...state.audio,
          status: action.playbackState,
          url: action.track.url,
          source: state.audio.source ?? 'ai',
          provider: action.track.provider === 'xai' ? 'xai' : 'openai',
          currentPageKey: action.pageKey,
          error: action.playbackState === 'error' ? 'Playback failed' : undefined
        }
      };
    }
    case 'floatingAudio/play':
      return {
        ...state,
        floatingAudio: {
          track: action.track.kind ? action.track : { ...action.track, kind: 'file' },
          playbackState: 'loading'
        }
      };
    case 'floatingAudio/close':
      return { ...state, floatingAudio: { track: null, playbackState: 'idle' } };
    case 'floatingAudio/setPlaybackState':
      return { ...state, floatingAudio: { ...state.floatingAudio, playbackState: action.playbackState } };
    case 'printWorkflow/setSelection':
      return { ...state, printWorkflow: { ...state.printWorkflow, selection: action.selection } };
    case 'printWorkflow/setLoading':
      return { ...state, printWorkflow: { ...state.printWorkflow, loading: action.loading } };
    case 'viewerWorkflow/setSettings':
      return {
        ...state,
        viewerWorkflow: {
          ...state.viewerWorkflow,
          settings: {
            ...action.settings,
            textFontSize: normalizeTextFontSize(action.settings.textFontSize),
            textBrightness: normalizeTextBrightness(action.settings.textBrightness),
            textTheme: normalizeTextTheme(action.settings.textTheme)
          }
        }
      };
    case 'viewerWorkflow/setMetrics':
      return { ...state, viewerWorkflow: { ...state.viewerWorkflow, metrics: action.metrics } };
    case 'voiceWorkflow/setVoiceOptions': {
      const streamVoice = state.voiceWorkflow.streamVoice &&
        action.options.some((voice) => voice.id === state.voiceWorkflow.streamVoice)
        ? state.voiceWorkflow.streamVoice
        : action.defaultVoice;
      return {
        ...state,
        voiceWorkflow: {
          ...state.voiceWorkflow,
          streamVoiceOptions: action.options,
          defaultStreamVoice: action.defaultVoice,
          streamVoice
        }
      };
    }
    case 'voiceWorkflow/setStreamVoice':
      return { ...state, voiceWorkflow: { ...state.voiceWorkflow, streamVoice: action.voice } };
    case 'voiceWorkflow/setMp3Voice':
      return { ...state, voiceWorkflow: { ...state.voiceWorkflow, mp3Voice: action.voice } };
  }
}
