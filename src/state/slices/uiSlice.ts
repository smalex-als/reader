import type {
  AppToolbarTab,
  AppUiState,
  ChapterEditorTextVersion,
  SimpleModal
} from '@/state/appState';
import type { ImagePreviewTarget, ToastMessage } from '@/types/app';

export type UiAction =
  | { type: 'modal/open'; modal: SimpleModal }
  | { type: 'modal/close'; modal: SimpleModal }
  | { type: 'modal/setOpen'; modal: SimpleModal; open: boolean }
  | { type: 'bookCard/open'; bookId: string }
  | { type: 'bookCard/close' }
  | { type: 'bookCard/setOpen'; open: boolean }
  | { type: 'bookCard/setBookId'; bookId: string | null }
  | { type: 'fullscreen/set'; fullscreen: boolean }
  | { type: 'toast/show'; toast: ToastMessage }
  | { type: 'toast/dismiss' }
  | { type: 'imagePreview/open'; preview: ImagePreviewTarget }
  | { type: 'imagePreview/close' }
  | { type: 'imagePreview/setEnhancedUrl'; url: string | null }
  | { type: 'editor/setOpen'; open: boolean }
  | { type: 'editor/setChapterNumber'; chapterNumber: number | null }
  | { type: 'editor/setTextVersion'; textVersion: ChapterEditorTextVersion | null }
  | { type: 'settingsToolbar/setTab'; tab: AppToolbarTab };

const UI_ACTION_TYPES = new Set<UiAction['type']>([
  'modal/open',
  'modal/close',
  'modal/setOpen',
  'bookCard/open',
  'bookCard/close',
  'bookCard/setOpen',
  'bookCard/setBookId',
  'fullscreen/set',
  'toast/show',
  'toast/dismiss',
  'imagePreview/open',
  'imagePreview/close',
  'imagePreview/setEnhancedUrl',
  'editor/setOpen',
  'editor/setChapterNumber',
  'editor/setTextVersion',
  'settingsToolbar/setTab'
]);

export const initialUiState: AppUiState = {
  modals: {
    help: false,
    listeningDashboard: false,
    ocrQueue: false,
    jobWorker: false,
    search: false,
    promptEditor: false,
    settings: false,
    tocNav: false,
    tocManage: false,
    text: false,
    print: false,
    bookmarks: false,
    chapterQuiz: false,
    unitQuiz: false,
    vocabulary: false,
    memoryCard: false,
    bookSelect: false,
    bookCard: false
  },
  fullscreen: false,
  toast: null,
  bookCardBookId: null,
  imagePreview: null,
  editor: {
    open: false,
    chapterNumber: null,
    textVersion: null
  },
  settingsToolbar: {
    activeTab: 'image'
  }
};

export const uiActions = {
  openModal: (modal: SimpleModal) => ({ type: 'modal/open' as const, modal }),
  closeModal: (modal: SimpleModal) => ({ type: 'modal/close' as const, modal }),
  setModalOpen: (modal: SimpleModal, open: boolean) => ({ type: 'modal/setOpen' as const, modal, open }),
  openBookCard: (bookId: string) => ({ type: 'bookCard/open' as const, bookId }),
  closeBookCard: () => ({ type: 'bookCard/close' as const }),
  setBookCardOpen: (open: boolean) => ({ type: 'bookCard/setOpen' as const, open }),
  setBookCardBookId: (bookId: string | null) => ({ type: 'bookCard/setBookId' as const, bookId }),
  setFullscreen: (fullscreen: boolean) => ({ type: 'fullscreen/set' as const, fullscreen }),
  showToast: (toast: ToastMessage) => ({ type: 'toast/show' as const, toast }),
  dismissToast: () => ({ type: 'toast/dismiss' as const }),
  openImagePreview: (preview: ImagePreviewTarget) => ({ type: 'imagePreview/open' as const, preview }),
  closeImagePreview: () => ({ type: 'imagePreview/close' as const }),
  setImagePreviewEnhancedUrl: (url: string | null) => ({ type: 'imagePreview/setEnhancedUrl' as const, url }),
  setEditorOpen: (open: boolean) => ({ type: 'editor/setOpen' as const, open }),
  setEditorChapterNumber: (chapterNumber: number | null) => ({
    type: 'editor/setChapterNumber' as const,
    chapterNumber
  }),
  setEditorTextVersion: (textVersion: ChapterEditorTextVersion | null) => ({
    type: 'editor/setTextVersion' as const,
    textVersion
  }),
  setSettingsToolbarTab: (tab: AppToolbarTab) => ({ type: 'settingsToolbar/setTab' as const, tab })
};

export function isUiAction(action: { type: string }): action is UiAction {
  return UI_ACTION_TYPES.has(action.type as UiAction['type']);
}

export function reduceUiState(state: AppUiState, action: UiAction): AppUiState {
  switch (action.type) {
    case 'modal/open':
      return { ...state, modals: { ...state.modals, [action.modal]: true } };
    case 'modal/close':
      return { ...state, modals: { ...state.modals, [action.modal]: false } };
    case 'modal/setOpen':
      return { ...state, modals: { ...state.modals, [action.modal]: action.open } };
    case 'bookCard/open':
      return { ...state, modals: { ...state.modals, bookCard: true }, bookCardBookId: action.bookId };
    case 'bookCard/close':
      return { ...state, modals: { ...state.modals, bookCard: false }, bookCardBookId: null };
    case 'bookCard/setOpen':
      return { ...state, modals: { ...state.modals, bookCard: action.open } };
    case 'bookCard/setBookId':
      return { ...state, bookCardBookId: action.bookId };
    case 'fullscreen/set':
      return { ...state, fullscreen: action.fullscreen };
    case 'toast/show':
      return { ...state, toast: action.toast };
    case 'toast/dismiss':
      return { ...state, toast: null };
    case 'imagePreview/open':
      return { ...state, imagePreview: action.preview };
    case 'imagePreview/close':
      return { ...state, imagePreview: null };
    case 'imagePreview/setEnhancedUrl':
      return {
        ...state,
        imagePreview: state.imagePreview ? { ...state.imagePreview, enhancedUrl: action.url } : null
      };
    case 'editor/setOpen':
      return { ...state, editor: { ...state.editor, open: action.open } };
    case 'editor/setChapterNumber':
      return { ...state, editor: { ...state.editor, chapterNumber: action.chapterNumber } };
    case 'editor/setTextVersion':
      return { ...state, editor: { ...state.editor, textVersion: action.textVersion } };
    case 'settingsToolbar/setTab':
      return { ...state, settingsToolbar: { activeTab: action.tab } };
  }
}
