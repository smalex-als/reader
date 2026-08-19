export function normalizeFencedCodeBlocksForSpeech(text: string): string;
export function normalizeInlineCodeForSpeech(text: string): string;
export function stripMarkdown(text: string): string;
export function splitStreamChunks(
  text: string,
  startIndex: number,
  chunkSize?: number,
  lookahead?: number
): string[];
export function splitStreamParagraphChunks(text: string, startIndex: number): string[];
