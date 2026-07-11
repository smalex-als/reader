import type { ChapterTextPrompt, ChapterTextVersion, TocEntry } from '@/types/app';
import type { TextVersionModalWorkflowState, TocVariant, TocWorkflowState } from '@/state/appState';

export type ChapterToolsState = {
  tocWorkflow: TocWorkflowState;
  textVersionModalWorkflow: TextVersionModalWorkflowState;
};

export type ChapterToolsAction =
  | { type: 'tocWorkflow/reset' }
  | { type: 'tocWorkflow/setVariant'; variant: TocVariant }
  | { type: 'tocWorkflow/setEntries'; entries: TocEntry[] }
  | { type: 'tocWorkflow/setDetailedEntries'; entries: TocEntry[] }
  | { type: 'tocWorkflow/setLoading'; loading: boolean }
  | { type: 'tocWorkflow/setGenerating'; generating: boolean }
  | { type: 'tocWorkflow/setSaving'; saving: boolean }
  | { type: 'tocWorkflow/setChapterGeneratingIndex'; index: number | null }
  | { type: 'textVersionModal/open'; sourceVersionId: string }
  | { type: 'textVersionModal/close' }
  | { type: 'textVersionModal/setSourceVersionId'; sourceVersionId: string }
  | { type: 'textVersionModal/setVersionModel'; versionModel: string }
  | { type: 'textVersionModal/setSelectedPromptId'; selectedPromptId: string }
  | { type: 'textVersionModal/setCustomPrompt'; customPrompt: string }
  | { type: 'textVersionModal/setPromptName'; promptName: string }
  | { type: 'textVersionModal/setSavePromptToLibrary'; savePromptToLibrary: boolean }
  | { type: 'textVersionModal/setResources'; versions: ChapterTextVersion[]; promptLibrary: ChapterTextPrompt[]; versionSaving: boolean; canCreateVersion: boolean }
  | { type: 'textVersionModal/requestCreate' }
  | { type: 'textVersionModal/resetDraft' };

const CHAPTER_TOOLS_ACTION_TYPES = new Set<ChapterToolsAction['type']>([
  'tocWorkflow/reset',
  'tocWorkflow/setVariant',
  'tocWorkflow/setEntries',
  'tocWorkflow/setDetailedEntries',
  'tocWorkflow/setLoading',
  'tocWorkflow/setGenerating',
  'tocWorkflow/setSaving',
  'tocWorkflow/setChapterGeneratingIndex',
  'textVersionModal/open',
  'textVersionModal/close',
  'textVersionModal/setSourceVersionId',
  'textVersionModal/setVersionModel',
  'textVersionModal/setSelectedPromptId',
  'textVersionModal/setCustomPrompt',
  'textVersionModal/setPromptName',
  'textVersionModal/setSavePromptToLibrary',
  'textVersionModal/setResources',
  'textVersionModal/requestCreate',
  'textVersionModal/resetDraft'
]);

export const initialChapterToolsState: ChapterToolsState = {
  tocWorkflow: {
    variant: 'main',
    entries: [],
    detailedEntries: [],
    loading: false,
    generating: false,
    saving: false,
    chapterGeneratingIndex: null
  },
  textVersionModalWorkflow: {
    open: false,
    versions: [],
    promptLibrary: [],
    sourceVersionId: 'base',
    versionModel: 'gpt-5.6-sol',
    selectedPromptId: '',
    customPrompt: '',
    promptName: '',
    savePromptToLibrary: false,
    versionSaving: false,
    canCreateVersion: false,
    createRequestId: 0
  }
};

export const chapterToolsActions = {
  resetTocWorkflow: () => ({ type: 'tocWorkflow/reset' as const }),
  setTocVariant: (variant: TocVariant) => ({ type: 'tocWorkflow/setVariant' as const, variant }),
  setTocEntries: (entries: TocEntry[]) => ({ type: 'tocWorkflow/setEntries' as const, entries }),
  setDetailedTocEntries: (entries: TocEntry[]) => ({ type: 'tocWorkflow/setDetailedEntries' as const, entries }),
  setTocLoading: (loading: boolean) => ({ type: 'tocWorkflow/setLoading' as const, loading }),
  setTocGenerating: (generating: boolean) => ({ type: 'tocWorkflow/setGenerating' as const, generating }),
  setTocSaving: (saving: boolean) => ({ type: 'tocWorkflow/setSaving' as const, saving }),
  setTocChapterGeneratingIndex: (index: number | null) => ({ type: 'tocWorkflow/setChapterGeneratingIndex' as const, index }),
  openTextVersionModal: (sourceVersionId: string) => ({ type: 'textVersionModal/open' as const, sourceVersionId }),
  closeTextVersionModal: () => ({ type: 'textVersionModal/close' as const }),
  setTextVersionModalSourceVersionId: (sourceVersionId: string) => ({ type: 'textVersionModal/setSourceVersionId' as const, sourceVersionId }),
  setTextVersionModalVersionModel: (versionModel: string) => ({ type: 'textVersionModal/setVersionModel' as const, versionModel }),
  setTextVersionModalSelectedPromptId: (selectedPromptId: string) => ({ type: 'textVersionModal/setSelectedPromptId' as const, selectedPromptId }),
  setTextVersionModalCustomPrompt: (customPrompt: string) => ({ type: 'textVersionModal/setCustomPrompt' as const, customPrompt }),
  setTextVersionModalPromptName: (promptName: string) => ({ type: 'textVersionModal/setPromptName' as const, promptName }),
  setTextVersionModalSavePromptToLibrary: (savePromptToLibrary: boolean) => ({ type: 'textVersionModal/setSavePromptToLibrary' as const, savePromptToLibrary }),
  setTextVersionModalResources: (payload: { versions: ChapterTextVersion[]; promptLibrary: ChapterTextPrompt[]; versionSaving: boolean; canCreateVersion: boolean }) => ({
    type: 'textVersionModal/setResources' as const,
    ...payload
  }),
  requestTextVersionCreate: () => ({ type: 'textVersionModal/requestCreate' as const }),
  resetTextVersionModalDraft: () => ({ type: 'textVersionModal/resetDraft' as const })
};

export function isChapterToolsAction(action: { type: string }): action is ChapterToolsAction {
  return CHAPTER_TOOLS_ACTION_TYPES.has(action.type as ChapterToolsAction['type']);
}

export function reduceChapterTools(
  state: ChapterToolsState,
  action: ChapterToolsAction
): ChapterToolsState {
  switch (action.type) {
    case 'tocWorkflow/reset':
      return { ...state, tocWorkflow: initialChapterToolsState.tocWorkflow };
    case 'tocWorkflow/setVariant':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, variant: action.variant } };
    case 'tocWorkflow/setEntries':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, entries: action.entries } };
    case 'tocWorkflow/setDetailedEntries':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, detailedEntries: action.entries } };
    case 'tocWorkflow/setLoading':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, loading: action.loading } };
    case 'tocWorkflow/setGenerating':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, generating: action.generating } };
    case 'tocWorkflow/setSaving':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, saving: action.saving } };
    case 'tocWorkflow/setChapterGeneratingIndex':
      return { ...state, tocWorkflow: { ...state.tocWorkflow, chapterGeneratingIndex: action.index } };
    case 'textVersionModal/open':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, open: true, sourceVersionId: action.sourceVersionId } };
    case 'textVersionModal/close':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, open: false } };
    case 'textVersionModal/setSourceVersionId':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, sourceVersionId: action.sourceVersionId } };
    case 'textVersionModal/setVersionModel':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, versionModel: action.versionModel } };
    case 'textVersionModal/setSelectedPromptId':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, selectedPromptId: action.selectedPromptId } };
    case 'textVersionModal/setCustomPrompt':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, customPrompt: action.customPrompt } };
    case 'textVersionModal/setPromptName':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, promptName: action.promptName } };
    case 'textVersionModal/setSavePromptToLibrary':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, savePromptToLibrary: action.savePromptToLibrary } };
    case 'textVersionModal/setResources':
      return {
        ...state,
        textVersionModalWorkflow: {
          ...state.textVersionModalWorkflow,
          versions: action.versions,
          promptLibrary: action.promptLibrary,
          versionSaving: action.versionSaving,
          canCreateVersion: action.canCreateVersion
        }
      };
    case 'textVersionModal/requestCreate':
      return { ...state, textVersionModalWorkflow: { ...state.textVersionModalWorkflow, createRequestId: state.textVersionModalWorkflow.createRequestId + 1 } };
    case 'textVersionModal/resetDraft':
      return {
        ...state,
        textVersionModalWorkflow: {
          ...state.textVersionModalWorkflow,
          customPrompt: '',
          promptName: '',
          savePromptToLibrary: false
        }
      };
  }
}
