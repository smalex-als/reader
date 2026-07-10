import type {
  AppNavigationState,
  ChapterParagraph,
  DashboardNavigationRequest,
  OcrEditRequest,
  PageNavigationRequest,
  ShellControlRequest,
  StreamControlRequest
} from '@/state/appState';
import type { MainView } from '@/lib/appConstants';

export type NavigationState = {
  navigation: AppNavigationState;
  pageNavigationRequest: PageNavigationRequest | null;
  dashboardNavigationRequest: DashboardNavigationRequest | null;
  streamControlRequest: StreamControlRequest | null;
  shellControlRequest: ShellControlRequest | null;
  ocrEditRequest: OcrEditRequest | null;
};

export type NavigationAction =
  | { type: 'navigation/setMainView'; view: MainView }
  | { type: 'navigation/setSelectedUnitSetId'; id: string | null }
  | { type: 'navigation/setSelectedUnitTopicId'; id: string | null }
  | { type: 'pageNavigation/request'; pageIndex: number }
  | { type: 'pageNavigation/requestPrevious' }
  | { type: 'pageNavigation/requestNext' }
  | { type: 'pageNavigation/clear' }
  | { type: 'dashboardNavigation/requestBook'; bookId: string }
  | {
      type: 'dashboardNavigation/requestChapter';
      bookId: string;
      chapterNumber: number | null;
      subchapterTitle?: string | null;
      pageNumber?: number | null;
      pageKeyEnd?: string | null;
    }
  | { type: 'dashboardNavigation/requestUnit'; unitSetId: string; topicId: string }
  | { type: 'dashboardNavigation/requestAudioLibraryBook'; bookId: string; chapterNumber: number }
  | { type: 'dashboardNavigation/requestUnitSource'; bookId: string; chapterNumber: number }
  | { type: 'dashboardNavigation/clear' }
  | { type: 'streamControl/requestPlayVisible' }
  | { type: 'streamControl/requestPlayNextStudyBlock' }
  | { type: 'streamControl/requestPlayOcrBlock'; imageUrl: string; startIndex: number; blockId: string }
  | { type: 'streamControl/requestPlayStudyAudioSingle'; text: string; pageKey: string }
  | { type: 'streamControl/requestPlayStudyAudioParagraph'; fullText: string; startIndex: number; key: string }
  | { type: 'streamControl/requestStop' }
  | { type: 'streamControl/requestStopAfterCurrent' }
  | { type: 'streamControl/requestTogglePause' }
  | { type: 'streamControl/requestSetVoice'; voice: string }
  | { type: 'streamControl/clear' }
  | { type: 'shellControl/requestFitWidth' }
  | { type: 'shellControl/requestFitHeight' }
  | { type: 'shellControl/requestToggleFullscreen' }
  | { type: 'shellControl/clear' }
  | { type: 'ocrEdit/requestToggleMode' }
  | { type: 'ocrEdit/requestToggleSpeechBlock'; blockId: string }
  | { type: 'ocrEdit/clearRequest' };

const NAVIGATION_ACTION_TYPES = new Set<NavigationAction['type']>([
  'navigation/setMainView',
  'navigation/setSelectedUnitSetId',
  'navigation/setSelectedUnitTopicId',
  'pageNavigation/request',
  'pageNavigation/requestPrevious',
  'pageNavigation/requestNext',
  'pageNavigation/clear',
  'dashboardNavigation/requestBook',
  'dashboardNavigation/requestChapter',
  'dashboardNavigation/requestUnit',
  'dashboardNavigation/requestAudioLibraryBook',
  'dashboardNavigation/requestUnitSource',
  'dashboardNavigation/clear',
  'streamControl/requestPlayVisible',
  'streamControl/requestPlayNextStudyBlock',
  'streamControl/requestPlayOcrBlock',
  'streamControl/requestPlayStudyAudioSingle',
  'streamControl/requestPlayStudyAudioParagraph',
  'streamControl/requestStop',
  'streamControl/requestStopAfterCurrent',
  'streamControl/requestTogglePause',
  'streamControl/requestSetVoice',
  'streamControl/clear',
  'shellControl/requestFitWidth',
  'shellControl/requestFitHeight',
  'shellControl/requestToggleFullscreen',
  'shellControl/clear',
  'ocrEdit/requestToggleMode',
  'ocrEdit/requestToggleSpeechBlock',
  'ocrEdit/clearRequest'
]);

function getInitialNavigation(): AppNavigationState {
  if (typeof window === 'undefined') {
    return {
      mainView: 'reader',
      selectedUnitSetId: null,
      selectedUnitTopicId: null
    };
  }
  const params = new URLSearchParams(window.location.search);
  const mainView = params.get('view') === 'units' ? 'units' : 'reader';
  return {
    mainView,
    selectedUnitSetId: mainView === 'units' ? params.get('unit') : null,
    selectedUnitTopicId: mainView === 'units' ? params.get('topic') : null
  };
}

export function createInitialNavigationState(): NavigationState {
  return {
    navigation: getInitialNavigation(),
    pageNavigationRequest: null,
    dashboardNavigationRequest: null,
    streamControlRequest: null,
    shellControlRequest: null,
    ocrEditRequest: null
  };
}

export const navigationActions = {
  setMainView: (view: MainView) => ({ type: 'navigation/setMainView' as const, view }),
  setSelectedUnitSetId: (id: string | null) => ({
    type: 'navigation/setSelectedUnitSetId' as const,
    id
  }),
  setSelectedUnitTopicId: (id: string | null) => ({
    type: 'navigation/setSelectedUnitTopicId' as const,
    id
  }),
  requestPageNavigation: (pageIndex: number) => ({
    type: 'pageNavigation/request' as const,
    pageIndex
  }),
  requestPreviousPageNavigation: () => ({ type: 'pageNavigation/requestPrevious' as const }),
  requestNextPageNavigation: () => ({ type: 'pageNavigation/requestNext' as const }),
  clearPageNavigation: () => ({ type: 'pageNavigation/clear' as const }),
  requestDashboardBookNavigation: (bookId: string) => ({
    type: 'dashboardNavigation/requestBook' as const,
    bookId
  }),
  requestDashboardChapterNavigation: (
    bookId: string,
    chapterNumber: number | null,
    subchapterTitle?: string | null,
    pageNumber?: number | null,
    pageKeyEnd?: string | null
  ) => ({
    type: 'dashboardNavigation/requestChapter' as const,
    bookId,
    chapterNumber,
    subchapterTitle,
    pageNumber,
    pageKeyEnd
  }),
  requestDashboardUnitNavigation: (unitSetId: string, topicId: string) => ({
    type: 'dashboardNavigation/requestUnit' as const,
    unitSetId,
    topicId
  }),
  requestAudioLibraryBookNavigation: (bookId: string, chapterNumber: number) => ({
    type: 'dashboardNavigation/requestAudioLibraryBook' as const,
    bookId,
    chapterNumber
  }),
  requestUnitSourceNavigation: (bookId: string, chapterNumber: number) => ({
    type: 'dashboardNavigation/requestUnitSource' as const,
    bookId,
    chapterNumber
  }),
  clearDashboardNavigation: () => ({ type: 'dashboardNavigation/clear' as const }),
  requestPlayVisibleStream: () => ({ type: 'streamControl/requestPlayVisible' as const }),
  requestPlayNextStudyBlock: () => ({ type: 'streamControl/requestPlayNextStudyBlock' as const }),
  requestPlayOcrBlock: (payload: { imageUrl: string; startIndex: number; blockId: string }) => ({
    type: 'streamControl/requestPlayOcrBlock' as const,
    ...payload
  }),
  requestPlayStudyAudioSingle: (payload: { text: string; pageKey: string }) => ({
    type: 'streamControl/requestPlayStudyAudioSingle' as const,
    ...payload
  }),
  requestPlayStudyAudioParagraph: (payload: ChapterParagraph) => ({
    type: 'streamControl/requestPlayStudyAudioParagraph' as const,
    ...payload
  }),
  requestStopStream: () => ({ type: 'streamControl/requestStop' as const }),
  requestStopAfterCurrentStream: () => ({ type: 'streamControl/requestStopAfterCurrent' as const }),
  requestToggleStreamPause: () => ({ type: 'streamControl/requestTogglePause' as const }),
  requestStreamVoiceChange: (voice: string) => ({
    type: 'streamControl/requestSetVoice' as const,
    voice
  }),
  clearStreamControlRequest: () => ({ type: 'streamControl/clear' as const }),
  requestFitWidth: () => ({ type: 'shellControl/requestFitWidth' as const }),
  requestFitHeight: () => ({ type: 'shellControl/requestFitHeight' as const }),
  requestToggleFullscreen: () => ({ type: 'shellControl/requestToggleFullscreen' as const }),
  clearShellControlRequest: () => ({ type: 'shellControl/clear' as const }),
  requestToggleOcrEditMode: () => ({ type: 'ocrEdit/requestToggleMode' as const }),
  requestToggleOcrBlockSpeech: (blockId: string) => ({
    type: 'ocrEdit/requestToggleSpeechBlock' as const,
    blockId
  }),
  clearOcrEditRequest: () => ({ type: 'ocrEdit/clearRequest' as const })
};

export function isNavigationAction(action: { type: string }): action is NavigationAction {
  return NAVIGATION_ACTION_TYPES.has(action.type as NavigationAction['type']);
}

function nextRequestId(request: { id: number } | null) {
  return (request?.id ?? 0) + 1;
}

export function reduceNavigation(
  state: NavigationState,
  action: NavigationAction
): NavigationState {
  switch (action.type) {
    case 'navigation/setMainView':
      return { ...state, navigation: { ...state.navigation, mainView: action.view } };
    case 'navigation/setSelectedUnitSetId':
      return { ...state, navigation: { ...state.navigation, selectedUnitSetId: action.id } };
    case 'navigation/setSelectedUnitTopicId':
      return { ...state, navigation: { ...state.navigation, selectedUnitTopicId: action.id } };
    case 'pageNavigation/request':
      return {
        ...state,
        pageNavigationRequest: {
          id: nextRequestId(state.pageNavigationRequest),
          kind: 'page',
          pageIndex: action.pageIndex
        }
      };
    case 'pageNavigation/requestPrevious':
      return {
        ...state,
        pageNavigationRequest: {
          id: nextRequestId(state.pageNavigationRequest),
          kind: 'previous'
        }
      };
    case 'pageNavigation/requestNext':
      return {
        ...state,
        pageNavigationRequest: {
          id: nextRequestId(state.pageNavigationRequest),
          kind: 'next'
        }
      };
    case 'pageNavigation/clear':
      return { ...state, pageNavigationRequest: null };
    case 'dashboardNavigation/requestBook':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: nextRequestId(state.dashboardNavigationRequest),
          kind: 'dashboardBook',
          bookId: action.bookId
        }
      };
    case 'dashboardNavigation/requestChapter':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: nextRequestId(state.dashboardNavigationRequest),
          kind: 'dashboardChapter',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber,
          subchapterTitle: action.subchapterTitle,
          pageNumber: action.pageNumber,
          pageKeyEnd: action.pageKeyEnd
        }
      };
    case 'dashboardNavigation/requestUnit':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: nextRequestId(state.dashboardNavigationRequest),
          kind: 'dashboardUnit',
          unitSetId: action.unitSetId,
          topicId: action.topicId
        }
      };
    case 'dashboardNavigation/requestAudioLibraryBook':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: nextRequestId(state.dashboardNavigationRequest),
          kind: 'audioLibraryBook',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber
        }
      };
    case 'dashboardNavigation/requestUnitSource':
      return {
        ...state,
        dashboardNavigationRequest: {
          id: nextRequestId(state.dashboardNavigationRequest),
          kind: 'unitSource',
          bookId: action.bookId,
          chapterNumber: action.chapterNumber
        }
      };
    case 'dashboardNavigation/clear':
      return { ...state, dashboardNavigationRequest: null };
    case 'streamControl/requestPlayVisible':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'playVisible'
        }
      };
    case 'streamControl/requestPlayNextStudyBlock':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'playNextStudyBlock'
        }
      };
    case 'streamControl/requestPlayOcrBlock':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'playOcrBlock',
          imageUrl: action.imageUrl,
          startIndex: action.startIndex,
          blockId: action.blockId
        }
      };
    case 'streamControl/requestPlayStudyAudioSingle':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'playStudyAudioSingle',
          text: action.text,
          pageKey: action.pageKey
        }
      };
    case 'streamControl/requestPlayStudyAudioParagraph':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'playStudyAudioParagraph',
          fullText: action.fullText,
          startIndex: action.startIndex,
          key: action.key
        }
      };
    case 'streamControl/requestStop':
      return {
        ...state,
        streamControlRequest: { id: nextRequestId(state.streamControlRequest), kind: 'stop' }
      };
    case 'streamControl/requestStopAfterCurrent':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'stopAfterCurrent'
        }
      };
    case 'streamControl/requestTogglePause':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'togglePause'
        }
      };
    case 'streamControl/requestSetVoice':
      return {
        ...state,
        streamControlRequest: {
          id: nextRequestId(state.streamControlRequest),
          kind: 'setVoice',
          voice: action.voice
        }
      };
    case 'streamControl/clear':
      return { ...state, streamControlRequest: null };
    case 'shellControl/requestFitWidth':
      return {
        ...state,
        shellControlRequest: { id: nextRequestId(state.shellControlRequest), kind: 'fitWidth' }
      };
    case 'shellControl/requestFitHeight':
      return {
        ...state,
        shellControlRequest: { id: nextRequestId(state.shellControlRequest), kind: 'fitHeight' }
      };
    case 'shellControl/requestToggleFullscreen':
      return {
        ...state,
        shellControlRequest: {
          id: nextRequestId(state.shellControlRequest),
          kind: 'toggleFullscreen'
        }
      };
    case 'shellControl/clear':
      return { ...state, shellControlRequest: null };
    case 'ocrEdit/requestToggleMode':
      return {
        ...state,
        ocrEditRequest: { id: nextRequestId(state.ocrEditRequest), kind: 'toggleMode' }
      };
    case 'ocrEdit/requestToggleSpeechBlock':
      return {
        ...state,
        ocrEditRequest: {
          id: nextRequestId(state.ocrEditRequest),
          kind: 'toggleSpeechBlock',
          blockId: action.blockId
        }
      };
    case 'ocrEdit/clearRequest':
      return { ...state, ocrEditRequest: null };
  }
}
