import { normalizeFencedCodeBlocksForSpeech, splitStreamChunks, stripMarkdown } from '@/lib/streamText';
import { splitMarkdownPlaybackBlocks } from '@/lib/markdownPlaybackBlocks';
import type { PageText } from '@/types/app';

export type PageStreamSegment = {
  text: string;
  pageKey: string;
  pageIndex: number | null;
};

export type ParagraphStreamSegment = {
  text: string;
  pageKey: string;
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

export function createParagraphStreamSegments(
  fullText: string,
  startIndex: number,
  baseKey: string
): ParagraphStreamSegment[] {
  const input = normalizeFencedCodeBlocksForSpeech(fullText.slice(Math.max(0, startIndex)));
  const segments: ParagraphStreamSegment[] = [];
  const playbackBlocks = splitMarkdownPlaybackBlocks(input);

  for (const block of playbackBlocks) {
    const spokenParagraph = stripMarkdown(block.rawText).trim();
    if (!spokenParagraph) {
      continue;
    }
    const absoluteStart = startIndex + block.startIndex;
    const pageKey = formatParagraphPageKey(baseKey, absoluteStart);
    if (spokenParagraph.length <= 1240) {
      segments.push({ text: spokenParagraph, pageKey });
      continue;
    }
    splitStreamChunks(spokenParagraph, 0).forEach((text) => {
      segments.push({ text, pageKey });
    });
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
