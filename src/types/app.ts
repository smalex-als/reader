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
  chapterNumber: number;
  title: string;
  questions: ChapterQuizQuestion[];
  source: 'file' | 'openai';
  file?: string;
}

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

export interface ChapterTextPrompt {
  id: string;
  name: string;
  template: string;
  builtIn?: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ChapterTextVersion {
  id: string;
  index: number;
  kind: 'base' | 'derived';
  label: string;
  file: string;
  filename: string;
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
  recentSessions: ListeningDashboardSession[];
}
