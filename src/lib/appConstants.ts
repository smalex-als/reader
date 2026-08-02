import type { AppSettings } from '@/types/app';

export const PLAYBACK_RATE_OPTIONS = [1, 1.25, 1.5] as const;
export type PlaybackRate = (typeof PLAYBACK_RATE_OPTIONS)[number];

export const TEXT_FONT_SIZE_OPTIONS = [18, 20, 24, 26, 28, 30, 34];
export const TEXT_FONT_SIZE_MIN = TEXT_FONT_SIZE_OPTIONS[0];
export const TEXT_FONT_SIZE_MAX = TEXT_FONT_SIZE_OPTIONS[TEXT_FONT_SIZE_OPTIONS.length - 1];

export const TEXT_BRIGHTNESS_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;
export const TEXT_BRIGHTNESS_PERCENTAGES = [50, 58, 66, 75, 84, 92, 100] as const;

export const TEXT_THEME_OPTIONS = [
  'dark',
  'dracula',
  'obsidian',
  'nord',
  'gruvbox',
  'solarized',
  'light',
  'warm'
] as const;
export type TextTheme = (typeof TEXT_THEME_OPTIONS)[number];

export type MainView = 'reader' | 'audio-library' | 'units';
export type ViewMode = 'pages' | 'scroll' | 'text' | 'audio';

export type StreamVoice = string;
export type StreamVoiceOption = {
  id: string;
  label: string;
  provider: 'openai' | 'xai' | 'yandex' | 'streaming';
};

export const DEFAULT_SETTINGS: AppSettings = {
  zoom: 1,
  zoomMode: 'fit-width',
  rotation: 0,
  invert: false,
  brightness: 100,
  contrast: 100,
  dimOutsideBlocks: true,
  dimOutsideBlocksIntensity: 38,
  pan: { x: 0, y: 0 },
  textFontSize: TEXT_FONT_SIZE_OPTIONS[0],
  textBrightness: TEXT_BRIGHTNESS_OPTIONS[TEXT_BRIGHTNESS_OPTIONS.length - 1],
  textTheme: 'dark',
  studyMode: false
};

export function createDefaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, pan: { ...DEFAULT_SETTINGS.pan } };
}

export function normalizeTextFontSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.textFontSize;
  }
  let closest = TEXT_FONT_SIZE_OPTIONS[0];
  let smallestDelta = Math.abs(value - closest);
  for (const option of TEXT_FONT_SIZE_OPTIONS) {
    const delta = Math.abs(value - option);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = option;
    }
  }
  return closest;
}

export function normalizeTextBrightness(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.textBrightness;
  }
  let closest: number = TEXT_BRIGHTNESS_OPTIONS[0];
  let smallestDelta = Math.abs(value - closest);
  for (const option of TEXT_BRIGHTNESS_OPTIONS) {
    const delta = Math.abs(value - option);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closest = option;
    }
  }
  return closest;
}

export function getTextBrightnessPercentage(value: number): number {
  const normalized = normalizeTextBrightness(value);
  return TEXT_BRIGHTNESS_PERCENTAGES[normalized - 1];
}

export function normalizeTextTheme(value: string): TextTheme {
  if (value === 'slate') {
    return 'dracula';
  }
  return TEXT_THEME_OPTIONS.includes(value as TextTheme) ? (value as TextTheme) : 'dark';
}

export function normalizePlaybackRate(value: number): number {
  return PLAYBACK_RATE_OPTIONS.includes(value as PlaybackRate) ? value : 1;
}

export function getMainViewFromLocation(): MainView {
  const params = new URLSearchParams(window.location.search);
  return params.get('view') === 'units' ? 'units' : 'reader';
}
