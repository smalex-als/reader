import type { PageTextBlock } from '@/types/app';

const OCR_BLOCK_HEADER_PATTERN =
  /<\|ref\|>([^<]+)<\|\/ref\|><\|det\|>\[\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]\]<\|\/det\|>/g;
const OCR_SPEECH_EXCLUDED_MARKER = '<|speech_removed|>';
const OCR_SPEECH_EXCLUDED_END_MARKER = '<|/speech_removed|>';
const HEADING_BLOCK_KINDS = new Set(['title', 'sub_title']);

function normalizeBlockTextForSpeech(kind: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  if (!HEADING_BLOCK_KINDS.has(kind.toLowerCase())) {
    return trimmed;
  }
  if (/[.!?:…]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function parseSpeechExclusion(text: string) {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(OCR_SPEECH_EXCLUDED_MARKER)) {
    return { excludedFromSpeech: false, text };
  }
  const endIndex = trimmed.indexOf(OCR_SPEECH_EXCLUDED_END_MARKER);
  if (endIndex === -1) {
    return { excludedFromSpeech: false, text };
  }
  return {
    excludedFromSpeech: true,
    text: trimmed.slice(endIndex + OCR_SPEECH_EXCLUDED_END_MARKER.length).trimStart()
  };
}

export function serializeOcrLayout(blocks: PageTextBlock[]) {
  return blocks
    .map((block) => {
      const header = `<|ref|>${block.kind}<|/ref|><|det|>[[${block.bounds.join(', ')}]]<|/det|>`;
      const text = block.excludedFromSpeech
        ? `${OCR_SPEECH_EXCLUDED_MARKER}${OCR_SPEECH_EXCLUDED_END_MARKER}\n${block.text}`.trimEnd()
        : block.text;
      return `${header}\n${text}`.trimEnd();
    })
    .join('\n\n');
}

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
    const parsedText = parseSpeechExclusion(input.slice(contentStart, contentEnd).trim());
    const text = parsedText.text;
    const speechText = normalizeBlockTextForSpeech(kind, text);
    const hasText = speechText.length > 0 && !parsedText.excludedFromSpeech;
    const separator = hasText && plainText ? '\n\n' : '';
    const startIndex = hasText ? plainText.length + separator.length : null;

    if (hasText) {
      plainText += `${separator}${speechText}`;
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
      excludedFromSpeech: parsedText.excludedFromSpeech,
      startIndex,
      streamStartIndex: null
    });
  }

  let nextStreamStartIndex: number | null = null;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.startIndex !== null && !block.excludedFromSpeech) {
      nextStreamStartIndex = block.startIndex;
    }
    block.streamStartIndex = block.excludedFromSpeech ? null : nextStreamStartIndex;
  }

  return {
    plainText,
    blocks
  };
}
