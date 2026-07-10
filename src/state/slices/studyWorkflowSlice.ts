import type {
  MemoryCardWorkflowState,
  QuizModal,
  QuizWorkflowState,
  VocabularyWorkflowState
} from '@/state/appState';
import type { ChapterMemoryCard, ChapterVocabulary, Quiz } from '@/types/app';

export type StudyWorkflowState = {
  quizWorkflow: QuizWorkflowState;
  vocabularyWorkflow: VocabularyWorkflowState;
  memoryCardWorkflow: MemoryCardWorkflowState;
};

export type StudyWorkflowAction =
  | { type: 'quizWorkflow/reset'; modal: QuizModal }
  | { type: 'quizWorkflow/setLoading'; modal: QuizModal; loading: boolean }
  | { type: 'quizWorkflow/setError'; modal: QuizModal; error: string | null }
  | { type: 'quizWorkflow/setQuiz'; modal: QuizModal; quiz: Quiz | null }
  | { type: 'vocabularyWorkflow/reset' }
  | { type: 'vocabularyWorkflow/setLoading'; loading: boolean }
  | { type: 'vocabularyWorkflow/setError'; error: string | null }
  | { type: 'vocabularyWorkflow/setVocabulary'; vocabulary: ChapterVocabulary | null }
  | { type: 'memoryCardWorkflow/reset' }
  | { type: 'memoryCardWorkflow/setLoading'; loading: boolean }
  | { type: 'memoryCardWorkflow/setError'; error: string | null }
  | { type: 'memoryCardWorkflow/setMemoryCard'; memoryCard: ChapterMemoryCard | null };

const STUDY_WORKFLOW_ACTION_TYPES = new Set<StudyWorkflowAction['type']>([
  'quizWorkflow/reset',
  'quizWorkflow/setLoading',
  'quizWorkflow/setError',
  'quizWorkflow/setQuiz',
  'vocabularyWorkflow/reset',
  'vocabularyWorkflow/setLoading',
  'vocabularyWorkflow/setError',
  'vocabularyWorkflow/setVocabulary',
  'memoryCardWorkflow/reset',
  'memoryCardWorkflow/setLoading',
  'memoryCardWorkflow/setError',
  'memoryCardWorkflow/setMemoryCard'
]);

const createEmptyQuizWorkflowEntry = () => ({
  loading: false,
  error: null,
  quiz: null
});

export const initialStudyWorkflowState: StudyWorkflowState = {
  quizWorkflow: {
    chapterQuiz: createEmptyQuizWorkflowEntry(),
    unitQuiz: createEmptyQuizWorkflowEntry()
  },
  vocabularyWorkflow: {
    loading: false,
    error: null,
    vocabulary: null
  },
  memoryCardWorkflow: {
    loading: false,
    error: null,
    memoryCard: null
  }
};

export const studyWorkflowActions = {
  resetQuiz: (modal: QuizModal) => ({ type: 'quizWorkflow/reset' as const, modal }),
  setQuizLoading: (modal: QuizModal, loading: boolean) => ({
    type: 'quizWorkflow/setLoading' as const,
    modal,
    loading
  }),
  setQuizError: (modal: QuizModal, error: string | null) => ({
    type: 'quizWorkflow/setError' as const,
    modal,
    error
  }),
  setQuiz: (modal: QuizModal, quiz: Quiz | null) => ({
    type: 'quizWorkflow/setQuiz' as const,
    modal,
    quiz
  }),
  resetVocabulary: () => ({ type: 'vocabularyWorkflow/reset' as const }),
  setVocabularyLoading: (loading: boolean) => ({
    type: 'vocabularyWorkflow/setLoading' as const,
    loading
  }),
  setVocabularyError: (error: string | null) => ({
    type: 'vocabularyWorkflow/setError' as const,
    error
  }),
  setVocabulary: (vocabulary: ChapterVocabulary | null) => ({
    type: 'vocabularyWorkflow/setVocabulary' as const,
    vocabulary
  }),
  resetMemoryCard: () => ({ type: 'memoryCardWorkflow/reset' as const }),
  setMemoryCardLoading: (loading: boolean) => ({
    type: 'memoryCardWorkflow/setLoading' as const,
    loading
  }),
  setMemoryCardError: (error: string | null) => ({
    type: 'memoryCardWorkflow/setError' as const,
    error
  }),
  setMemoryCard: (memoryCard: ChapterMemoryCard | null) => ({
    type: 'memoryCardWorkflow/setMemoryCard' as const,
    memoryCard
  })
};

export function isStudyWorkflowAction(action: { type: string }): action is StudyWorkflowAction {
  return STUDY_WORKFLOW_ACTION_TYPES.has(action.type as StudyWorkflowAction['type']);
}

export function reduceStudyWorkflow(
  state: StudyWorkflowState,
  action: StudyWorkflowAction
): StudyWorkflowState {
  switch (action.type) {
    case 'quizWorkflow/reset':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: createEmptyQuizWorkflowEntry()
        }
      };
    case 'quizWorkflow/setLoading':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            loading: action.loading
          }
        }
      };
    case 'quizWorkflow/setError':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            error: action.error
          }
        }
      };
    case 'quizWorkflow/setQuiz':
      return {
        ...state,
        quizWorkflow: {
          ...state.quizWorkflow,
          [action.modal]: {
            ...state.quizWorkflow[action.modal],
            quiz: action.quiz
          }
        }
      };
    case 'vocabularyWorkflow/reset':
      return { ...state, vocabularyWorkflow: initialStudyWorkflowState.vocabularyWorkflow };
    case 'vocabularyWorkflow/setLoading':
      return {
        ...state,
        vocabularyWorkflow: { ...state.vocabularyWorkflow, loading: action.loading }
      };
    case 'vocabularyWorkflow/setError':
      return {
        ...state,
        vocabularyWorkflow: { ...state.vocabularyWorkflow, error: action.error }
      };
    case 'vocabularyWorkflow/setVocabulary':
      return {
        ...state,
        vocabularyWorkflow: { ...state.vocabularyWorkflow, vocabulary: action.vocabulary }
      };
    case 'memoryCardWorkflow/reset':
      return { ...state, memoryCardWorkflow: initialStudyWorkflowState.memoryCardWorkflow };
    case 'memoryCardWorkflow/setLoading':
      return {
        ...state,
        memoryCardWorkflow: { ...state.memoryCardWorkflow, loading: action.loading }
      };
    case 'memoryCardWorkflow/setError':
      return {
        ...state,
        memoryCardWorkflow: { ...state.memoryCardWorkflow, error: action.error }
      };
    case 'memoryCardWorkflow/setMemoryCard':
      return {
        ...state,
        memoryCardWorkflow: { ...state.memoryCardWorkflow, memoryCard: action.memoryCard }
      };
  }
}
