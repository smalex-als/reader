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
  score: number;
  textPath: string;
  snippet: string;
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

export interface AudioCacheEntry {
  url: string;
  source: 'file' | 'ai';
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
  audioCache: Record<string, AudioCacheEntry>;
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
