const OCR_BLOCK_HEADER_PATTERN =
  /<\|ref\|>([^<]+)<\|\/ref\|><\|det\|>\[\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]\]<\|\/det\|>/g;
const OCR_SPEECH_EXCLUDED_MARKER = '<|speech_removed|>';
const OCR_SPEECH_EXCLUDED_END_MARKER = '<|/speech_removed|>';
const HEADING_BLOCK_KINDS = new Set(['title', 'sub_title']);

function normalizeBlockTextForSpeech(kind, text) {
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

function parseSpeechExclusion(text) {
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

export function extractPlainTextFromOcrLayout(rawText) {
  const input = typeof rawText === 'string' ? rawText : '';
  const matches = Array.from(input.matchAll(OCR_BLOCK_HEADER_PATTERN));
  if (matches.length === 0) {
    return input;
  }

  let plainText = '';
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = nextMatch?.index ?? input.length;
    const kind = (match[1] || '').trim();
    const parsedText = parseSpeechExclusion(input.slice(contentStart, contentEnd).trim());
    if (parsedText.excludedFromSpeech) {
      continue;
    }
    const speechText = normalizeBlockTextForSpeech(kind, parsedText.text);
    if (!speechText) {
      continue;
    }
    plainText += plainText ? `\n\n${speechText}` : speechText;
  }

  return plainText;
}
