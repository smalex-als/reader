export type ZoomMode = 'custom' | 'fit-width' | 'fit-height';
export type PageTextOcrEngine = 'deepseek_ocr' | 'openai';

export interface PageTextBlock {
  id: string;
  kind: string;
  text: string;
  bounds: [number, number, number, number];
  excludedFromSpeech: boolean;
  startIndex: number | null;
  streamStartIndex: number | null;
}

export interface PageText {
  text: string;
  plainText: string;
  blocks: PageTextBlock[];
  source: 'file' | 'ai';
}

export type OcrJobStatus = 'pending' | 'running' | 'completed' | 'error';

export interface OcrJob {
  id: string;
  pageIndex: number;
  imageUrl: string;
  status: OcrJobStatus;
  force?: boolean;
  error?: string;
}

export interface OcrQueueState {
  total: number;
  processed: number;
  failed: number;
  running: boolean;
  paused: boolean;
}

export type JobWorkerStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface JobWorkerLog {
  timestamp: string;
  message: string;
  details: unknown;
}

export interface JobWorkerJob {
  id: string;
  type: string;
  status: JobWorkerStatus;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  errorDetails: unknown;
  result: unknown;
  logs: JobWorkerLog[];
  payload: Record<string, unknown>;
}

export interface Bookmark {
  page: number;
  image: string;
  label: string;
}

export interface TocEntry {
  title: string;
  page: number;
  level?: number;
  stats?: {
    wordCount: number;
    charCount: number;
    listeningSeconds: number;
  };
}

export interface SearchResult {
  id: string;
  kind: 'page' | 'chapter';
  page: number;
  chapterNumber: number | null;
  title: string;
  subtitle?: string | null;
  score: number;
  textPath: string;
  snippet: string;
}

export interface ChapterQuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface ChapterQuiz {
  contextKey: string;
  chapterNumber?: number;
  unitSetId?: string;
  topicId?: string;
  title: string;
  questions: ChapterQuizQuestion[];
  source: 'file' | 'openai';
  file?: string;
}

export type Quiz = ChapterQuiz;

export interface ChapterVocabularyItem {
  id: string;
  term: string;
  definition: string;
}

export interface ChapterVocabulary {
  chapterNumber: number;
  title: string;
  items: ChapterVocabularyItem[];
  source: 'file' | 'openai';
  file?: string;
}

export interface ChapterMemoryCard {
  chapterNumber: number;
  title: string;
  text: string;
  source: 'file' | 'openai';
  file?: string;
}

export interface UnitItem {
  id: string;
  order: number;
  title: string;
  summary: string;
  learningGoal: string;
  content: string;
  contentFile?: string | null;
  keyPoints: string[];
  selfCheckQuestions: string[];
  read: boolean;
  hasQuiz: boolean;
}

export interface UnitSet {
  id: string;
  title: string;
  summary: string;
  learningGoal: string;
  sourceBookId: string | null;
  sourceChapterNumber: number | null;
  sourceChapterTitle: string | null;
  sourceVersionId: string | null;
  source: 'openai' | 'fallback';
  createdAt: string;
  updatedAt: string;
  units: UnitItem[];
}

export interface SelfCheckEvaluation {
  verdict: string;
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
  referenceAnswer: string;
}

export interface SelfCheckResult {
  question: string;
  answer: string;
  evaluatedAt: string;
  evaluation: SelfCheckEvaluation;
}

export interface ChapterTextPrompt {
  id: string;
  name: string;
  template: string;
  builtIn?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChapterTextPromptDraft {
  name: string;
  template: string;
}

export interface ChapterTextVersion {
  id: string;
  index: number;
  kind: 'base' | 'derived';
  label: string;
  file: string;
  filename: string;
  stats?: {
    wordCount: number;
    charCount: number;
    listeningSeconds: number;
  };
  createdAt?: string | null;
  promptId?: string | null;
  promptName?: string | null;
  deletable: boolean;
}

export interface ImagePreviewTarget {
  bookId: string;
  imageFilename: string;
  imageUrl: string;
  cropUrl: string;
  enhancedUrl?: string | null;
  bounds: [number, number, number, number];
  caption?: string | null;
}

export interface BookSearchResponse {
  book: string;
  query: string;
  count: number;
  builtAt: string;
  results: SearchResult[];
}

export interface BookCard {
  book: string;
  title: string;
  author: string;
  category: string;
  coverImage: string | null;
  defaultCoverImage: string | null;
  bookType: 'image' | 'text';
}

export interface BookCardUpdate {
  title: string;
  author: string;
  category: string;
  coverImage: string;
}

export interface ViewerPan {
  x: number;
  y: number;
}

export interface ViewerMetrics {
  containerWidth: number;
  containerHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
}

export interface AppSettings {
  zoom: number;
  zoomMode: ZoomMode;
  rotation: number;
  invert: boolean;
  brightness: number;
  contrast: number;
  dimOutsideBlocks: boolean;
  dimOutsideBlocksIntensity: number;
  pan: ViewerPan;
  textFontSize: number;
  textTheme:
    | 'dark'
    | 'dracula'
    | 'obsidian'
    | 'nord'
    | 'gruvbox'
    | 'solarized'
    | 'light'
    | 'warm';
  studyMode: boolean;
}

export interface AppState {
  books: string[];
  bookId: string | null;
  manifest: string[];
  currentPage: number;
  settings: AppSettings;
  fullscreen: boolean;
  toast: ToastMessage | null;
  textModalOpen: boolean;
  textCache: Record<string, PageText>;
  audioState: AudioState;
  streamState: StreamState;
  loading: boolean;
  metrics: ViewerMetrics | null;
}

export interface ToastMessage {
  id: string;
  message: string;
  kind?: 'info' | 'success' | 'error';
  expiresAt: number;
}

export interface AudioState {
  status: 'idle' | 'loading' | 'generating' | 'playing' | 'paused' | 'error';
  url: string | null;
  source: 'file' | 'ai' | null;
  provider?: 'openai' | 'xai' | null;
  error?: string;
  currentPageKey: string | null;
}

export interface StreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'paused' | 'error';
  pageKey: string | null;
  playbackSeconds: number;
  modelSeconds: number;
  error?: string;
}

export interface ListeningDashboardTotals {
  sessions: number;
  totalSeconds: number;
  averageSeconds: number;
  daysActive: number;
  lastListenedAt: string | null;
}

export interface ListeningDashboardDay {
  date: string;
  sessions: number;
  totalSeconds: number;
}

export interface ListeningDashboardSource {
  sourceType: string;
  label: string;
  sessions: number;
  totalSeconds: number;
}

export interface ListeningDashboardBook {
  bookId: string;
  sessions: number;
  totalSeconds: number;
  lastListenedAt: string | null;
}

export interface ListeningDashboardChapter {
  bookId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  subchapterTitle?: string | null;
  pageNumber?: number | null;
  pageKeyEnd?: string | null;
  sessions: number;
  totalSeconds: number;
  lastListenedAt: string | null;
}

export interface ListeningDashboardUnit {
  unitSetId: string;
  unitSetTitle: string | null;
  topicId: string;
  topicTitle: string | null;
  sourceBookId?: string | null;
  sourceChapterNumber?: number | null;
  sourceChapterTitle?: string | null;
  sessions: number;
  totalSeconds: number;
  lastListenedAt: string | null;
}

export interface ListeningDashboardSession {
  timestamp: string;
  bookId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  subchapterTitle?: string | null;
  pageNumber?: number | null;
  pageKeyStart?: string | null;
  pageKeyEnd?: string | null;
  sourceType: string;
  sourceLabel: string;
  unitSetId?: string | null;
  topicId?: string | null;
  unitSetTitle?: string | null;
  topicTitle?: string | null;
  unitSourceBookId?: string | null;
  unitSourceChapterNumber?: number | null;
  unitSourceChapterTitle?: string | null;
  listenedSeconds: number;
  sessionCount: number;
  endReason: 'completed' | 'stopped' | 'interrupted' | 'error' | 'unload';
}

export interface ListeningDashboardData {
  generatedAt: string;
  totals: ListeningDashboardTotals;
  byDay: ListeningDashboardDay[];
  bySource: ListeningDashboardSource[];
  topBooks: ListeningDashboardBook[];
  topChapters: ListeningDashboardChapter[];
  topUnits: ListeningDashboardUnit[];
  recentSessions: ListeningDashboardSession[];
}
