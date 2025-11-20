export type ZoomMode = 'custom' | 'fit-width' | 'fit-height';

export interface PageText {
  text: string;
  source: 'file' | 'ai';
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
  pan: ViewerPan;
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
