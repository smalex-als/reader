import type { PageTextBlock } from '@/types/app';

const OCR_BLOCK_HEADER_PATTERN =
  /<\|ref\|>([^<]+)<\|\/ref\|><\|det\|>\[\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]\]<\|\/det\|>/g;

export function parseOcrLayout(rawText: string): { plainText: string; blocks: PageTextBlock[] } {
  const input = typeof rawText === 'string' ? rawText : '';
  const matches = Array.from(input.matchAll(OCR_BLOCK_HEADER_PATTERN));
  if (matches.length === 0) {
    return {
      plainText: input,
      blocks: []
    };
  }

  const blocks: PageTextBlock[] = [];
  let plainText = '';

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = nextMatch?.index ?? input.length;
    const kind = (match[1] || '').trim();
    const text = input.slice(contentStart, contentEnd).trim();
    const hasText = text.length > 0;
    const separator = hasText && plainText ? '\n\n' : '';
    const startIndex = hasText ? plainText.length + separator.length : null;

    if (hasText) {
      plainText += `${separator}${text}`;
    }

    blocks.push({
      id: `ocr-block-${index}`,
      kind,
      text,
      bounds: [
        Number.parseInt(match[2] || '0', 10),
        Number.parseInt(match[3] || '0', 10),
        Number.parseInt(match[4] || '0', 10),
        Number.parseInt(match[5] || '0', 10)
      ],
      startIndex,
      streamStartIndex: null
    });
  }

  let nextStreamStartIndex: number | null = null;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.startIndex !== null) {
      nextStreamStartIndex = block.startIndex;
    }
    block.streamStartIndex = nextStreamStartIndex;
  }

  return {
    plainText,
    blocks
  };
}
