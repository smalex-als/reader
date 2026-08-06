export type MarkdownPauseCommand = { name: 'pause'; durationMs: number };
export type MarkdownNoteCommand = { name: 'note'; text: string };
export type MarkdownStopCommand = { name: 'stop' };
export type MarkdownSkipCommand = { name: 'skip' };
export type MarkdownSkipEndCommand = { name: 'skip-end' };
export type MarkdownVoiceCommand = { name: 'voice'; voice: string | null };
export type MarkdownCommand =
  | MarkdownPauseCommand
  | MarkdownNoteCommand
  | MarkdownStopCommand
  | MarkdownSkipCommand
  | MarkdownSkipEndCommand
  | MarkdownVoiceCommand;

export declare const DEFAULT_PAUSE_MS: number;
export declare const MAX_PAUSE_MS: number;

export function parsePauseDurationMs(value: string | undefined): number;
export function parseMarkdownCommandLine(line: string): MarkdownCommand | null;
export function isStandaloneCommandLine(lines: string[], index: number): boolean;
export function removeSkippedRegions(text: string): string;
export function removeMarkdownCommandLines(text: string): string;
