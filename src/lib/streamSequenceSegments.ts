import { normalizeFencedCodeBlocksForSpeech, splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import {
  splitMarkdownPlaybackBlocks,
  type MarkdownPlaybackBlock
} from '@/lib/markdownPlaybackBlocks';
import type { PageText } from '@/types/app';

export type PageStreamSegment = {
  text: string;
  pageKey: string;
  pageIndex: number | null;
};

export type ParagraphStreamSegment = {
  text: string;
  pageKey: string;
  pauseAfterMs?: number;
  voice?: string;
  stopAfter?: boolean;
};

export type ParagraphSegmentOptions = {
  resolveVoice?: (name: string) => string | null;
};

type CommandState = {
  skipping: boolean;
  voice: string | null;
};

function getTextModeFromBaseKey(baseKey: string) {
  return baseKey.startsWith('narration-') ? 'narration' : 'chapter';
}

function formatParagraphPageKey(baseKey: string, absoluteStart: number) {
  if (baseKey.startsWith('unit::')) {
    return `${baseKey}::paragraph-start-${absoluteStart}`;
  }
  return `${getTextModeFromBaseKey(baseKey)}::paragraph-start-${absoluteStart}`;
}

export function parseParagraphPageKey(pageKey: string) {
  const standardMatch = pageKey.match(/^(chapter|narration)::paragraph-start-(\d+)$/);
  if (standardMatch) {
    return { startIndex: Number.parseInt(standardMatch[2], 10) };
  }
  const unitMatch = pageKey.match(/^unit::.+::paragraph-start-(\d+)$/);
  return unitMatch
    ? { startIndex: Number.parseInt(unitMatch[1], 10) }
    : null;
}

function applyCommandState(
  state: CommandState,
  command: NonNullable<MarkdownPlaybackBlock['command']>,
  options: ParagraphSegmentOptions
) {
  if (command.name === 'skip') {
    state.skipping = true;
    return;
  }
  if (command.name === 'skip-end') {
    state.skipping = false;
    return;
  }
  if (command.name === 'voice') {
    // A bare `::voice` returns to whatever voice the session started with.
    state.voice = command.voice ? options.resolveVoice?.(command.voice) ?? null : null;
  }
}

/**
 * Replays the commands before `startIndex` so a stream started from the middle
 * of a chapter inherits the voice and skip region that were already in effect.
 */
function resolveCommandStateAt(
  fullText: string,
  startIndex: number,
  options: ParagraphSegmentOptions
): CommandState {
  const state: CommandState = { skipping: false, voice: null };
  if (startIndex <= 0) {
    return state;
  }
  for (const block of splitMarkdownPlaybackBlocks(fullText.slice(0, startIndex))) {
    if (block.command) {
      applyCommandState(state, block.command, options);
    }
  }
  return state;
}

export function createParagraphStreamSegments(
  fullText: string,
  startIndex: number,
  baseKey: string,
  options: ParagraphSegmentOptions = {}
): ParagraphStreamSegment[] {
  const input = normalizeFencedCodeBlocksForSpeech(fullText.slice(Math.max(0, startIndex)));
  const segments: ParagraphStreamSegment[] = [];
  const playbackBlocks = splitMarkdownPlaybackBlocks(input);
  const state = resolveCommandStateAt(fullText, startIndex, options);

  for (const block of playbackBlocks) {
    if (block.command) {
      // A pause lengthens the gap after whatever was spoken before it, a stop
      // parks playback there, and notes are never spoken.
      const previousSegment = segments[segments.length - 1];
      if (block.command.name === 'pause' && previousSegment) {
        previousSegment.pauseAfterMs = (previousSegment.pauseAfterMs ?? 0) + block.command.durationMs;
      }
      if (block.command.name === 'stop' && previousSegment) {
        previousSegment.stopAfter = true;
      }
      applyCommandState(state, block.command, options);
      continue;
    }
    if (state.skipping) {
      continue;
    }
    const spokenParagraph = stripMarkdown(block.rawText).trim();
    if (!spokenParagraph) {
      continue;
    }
    const absoluteStart = startIndex + block.startIndex;
    const pageKey = formatParagraphPageKey(baseKey, absoluteStart);
    const pushSegment = (text: string) => {
      const segment: ParagraphStreamSegment = { text, pageKey };
      if (state.voice) {
        segment.voice = state.voice;
      }
      segments.push(segment);
    };
    if (spokenParagraph.length <= 1240) {
      pushSegment(spokenParagraph);
      continue;
    }
    splitStreamChunks(spokenParagraph, 0).forEach(pushSegment);
  }
  return segments;
}

export function getPageStreamSegments(
  pageText: PageText,
  imageUrl: string,
  pageIndex: number | null = null
): PageStreamSegment[] {
  const orderedBlocks = [...pageText.blocks]
    .filter((block) => block.startIndex !== null && !block.excludedFromSpeech)
    .sort((left, right) => (left.startIndex ?? 0) - (right.startIndex ?? 0));

  if (orderedBlocks.length === 0) {
    const text = pageText.plainText.trim();
    return text ? [{ text, pageKey: `${imageUrl}::page`, pageIndex }] : [];
  }

  const segments: PageStreamSegment[] = [];
  for (let index = 0; index < orderedBlocks.length; index += 1) {
    const block = orderedBlocks[index];
    const startIndex = block.startIndex ?? 0;
    const endIndex = orderedBlocks[index + 1]?.startIndex ?? pageText.plainText.length;
    const text = pageText.plainText.slice(startIndex, endIndex).trim();
    if (text) {
      segments.push({ text, pageKey: `${imageUrl}::${block.id}`, pageIndex });
    }
  }
  return segments;
}
