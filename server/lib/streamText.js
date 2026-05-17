const STREAM_CHUNK_SIZE = 1000;
const STREAM_CHUNK_LOOKAHEAD = 240;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;
const RAW_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>)\]]+/gi;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
const INLINE_MATH_PATTERN = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g;
const HTTP_METHOD_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s,;)"']*)/g;
const NUMERIC_CITATION_PATTERN = /\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/g;
const DASH_LIKE_PATTERN = /[‐‑‒–—―−]+/g;
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+\S.*$/gm;
const OCR_BLOCK_HEADER_PATTERN =
  /<\|ref\|>([^<]+)<\|\/ref\|><\|det\|>\[\[(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\]\]<\|\/det\|>/g;
const OCR_SPEECH_EXCLUDED_MARKER = '<|speech_removed|>';
const OCR_SPEECH_EXCLUDED_END_MARKER = '<|/speech_removed|>';
const SPEECH_TERMINAL_PUNCTUATION_PATTERN = /[.!?:;…]$/u;
const TRAILING_QUOTE_OR_BRACKET_PATTERN = /["')\]}»”’]+$/u;
const TRAILING_SENTENCE_CLOSER_PATTERN = /["')\]}»”’]/u;

function removeExcludedOcrBlocks(text) {
  const input = typeof text === 'string' ? text : '';
  const matches = Array.from(input.matchAll(OCR_BLOCK_HEADER_PATTERN));
  if (matches.length === 0) {
    return input;
  }

  const parts = [];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const nextMatch = matches[index + 1];
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = nextMatch?.index ?? input.length;
    const rawContent = input.slice(contentStart, contentEnd).trim();
    if (!rawContent.startsWith(OCR_SPEECH_EXCLUDED_MARKER)) {
      parts.push(rawContent);
      continue;
    }
    const endIndex = rawContent.indexOf(OCR_SPEECH_EXCLUDED_END_MARKER);
    if (endIndex === -1) {
      parts.push(rawContent);
    }
  }

  return parts.filter(Boolean).join('\n\n');
}

function speakIdentifier(identifier) {
  return identifier
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^v\d+$/i.test(part)) {
        return `v ${part.slice(1)}`;
      }
      if (/^[A-Z]{2,5}$/.test(part)) {
        return part.split('').join(' ');
      }
      return part.toLowerCase();
    })
    .join(' ');
}

function speakApiPath(path) {
  return path
    .split('/')
    .filter((segment, index) => index !== 0 || segment.length > 0)
    .map((segment, index) => {
      if (index === 0 && segment === '') {
        return 'slash';
      }
      if (!segment) {
        return 'slash';
      }
      return `slash ${speakIdentifier(segment)}`;
    })
    .join(' ')
    .trim();
}

function speakApiValue(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  if (value.startsWith('/')) {
    return speakApiPath(value);
  }
  if (/^[A-Z]{2,5}$/.test(value)) {
    return value.split('').join(' ');
  }
  if (/^[A-Za-z0-9_./-]+$/.test(value) && /[A-Za-z]/.test(value)) {
    return speakIdentifier(value);
  }
  return value;
}

function normalizeApiExamples(text) {
  let output = text;

  output = output.replace(HTTP_METHOD_PATTERN, (_, method, path) => {
    const match = path.match(/^(.+?)([.,:;])?$/);
    const cleanPath = match?.[1] || path;
    const trailing = match?.[2] || '';
    return `${method.toLowerCase()} ${speakApiPath(cleanPath)}${trailing}`;
  });
  output = output.replace(/"([A-Za-z][A-Za-z0-9_-]*)"\s*:/g, (_, key) => `${speakIdentifier(key)}:`);
  output = output.replace(/:\s*"([^"\n]+)"/g, (_, value) => `: ${speakApiValue(value)}`);
  output = output.replace(/([{\[\]}])/g, ' $1 ');
  output = output.replace(/[ \t]{2,}/g, ' ');
  output = output.replace(/[ \t]+\n/g, '\n');
  output = output.replace(/\n[ \t]+/g, '\n');

  return output.trim();
}

function readBracketGroup(input, startIndex) {
  if (input[startIndex] !== '{') {
    return null;
  }

  let depth = 0;
  for (let index = startIndex; index < input.length; index += 1) {
    const char = input[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          value: input.slice(startIndex + 1, index),
          endIndex: index + 1
        };
      }
    }
  }

  return null;
}

function replaceFractions(input) {
  let output = '';

  for (let index = 0; index < input.length; index += 1) {
    if (!input.startsWith('\\frac', index)) {
      output += input[index];
      continue;
    }

    let cursor = index + 5;
    while (cursor < input.length && /\s/.test(input[cursor])) {
      cursor += 1;
    }

    const numerator = readBracketGroup(input, cursor);
    if (!numerator) {
      output += input[index];
      continue;
    }

    cursor = numerator.endIndex;
    while (cursor < input.length && /\s/.test(input[cursor])) {
      cursor += 1;
    }

    const denominator = readBracketGroup(input, cursor);
    if (!denominator) {
      output += input[index];
      continue;
    }

    output += `${numerator.value} divided by ${denominator.value}`;
    index = denominator.endIndex - 1;
  }

  return output;
}

function speakTemperatureUnit(unit) {
  const normalized = unit.toUpperCase();
  if (normalized === 'C') {
    return 'Celsius';
  }
  if (normalized === 'F') {
    return 'Fahrenheit';
  }
  if (normalized === 'K') {
    return 'Kelvin';
  }
  return unit;
}

function normalizeFormulaText(text) {
  let output = text;

  for (let pass = 0; pass < 4; pass += 1) {
    const next = replaceFractions(output);
    if (next === output) {
      break;
    }
    output = next;
  }

  output = output.replace(/\\text\s*\{([^{}]*)\}/g, '$1');
  output = output.replace(/\^\{\s*\\circ\s*\}\s*([CFK])\b/g, (_, unit) => {
    return ` degrees ${speakTemperatureUnit(unit)}`;
  });
  output = output.replace(/\\circ\s*([CFK])\b/g, (_, unit) => {
    return ` degrees ${speakTemperatureUnit(unit)}`;
  });
  output = output.replace(/\^\{\s*\\circ\s*\}/g, ' degrees');
  output = output.replace(/\\circ\b/g, ' degrees');
  output = output.replace(/\[\s*(\d+)\s*,\s*(\d+)\s*\]/g, '$1 to $2');
  output = output.replace(/\\approx|\\sim/g, ' approximately ');
  output = output.replace(/\\times|\\cdot/g, ' times ');
  output = output.replace(/\\div/g, ' divided by ');
  output = output.replace(/\\pm/g, ' plus or minus ');
  output = output.replace(/\\geq|\\ge/g, ' greater than or equal to ');
  output = output.replace(/\\leq|\\le/g, ' less than or equal to ');
  output = output.replace(/\\neq/g, ' not equal to ');
  output = output.replace(/\\rightarrow|\\to/g, ' goes to ');
  output = output.replace(/\\infty/g, ' infinity ');
  output = output.replace(/\\%/g, ' percent');
  output = output.replace(/\^(\d+)/g, ' to the power of $1');
  output = output.replace(/\^\{([^{}]+)\}/g, ' to the power of $1');
  output = output.replace(/_(\d+)/g, ' sub $1');
  output = output.replace(/_\{([^{}]+)\}/g, ' sub $1');
  output = output.replace(/[{}\\]/g, ' ');
  output = output.replace(/\s*=\s*/g, ' equals ');
  output = output.replace(/\s*>\s*/g, ' greater than ');
  output = output.replace(/\s*<\s*/g, ' less than ');
  output = output.replace(/\s+/g, ' ');

  return output.trim();
}

function normalizePlainTemperatureText(text) {
  return text
    .replace(/(\d+)\s*[°º]\s*([CFK])\b/g, (_, value, unit) => {
      return `${value} degrees ${speakTemperatureUnit(unit)}`;
    })
    .replace(/(\d+)\s*[°º](?=[\s.,:;!?)]|$)/g, '$1 degrees');
}

function normalizeSpokenTemperatureUnits(text) {
  return text.replace(/\bdegrees\s+([CFK])\b/g, (_, unit) => {
    return `degrees ${speakTemperatureUnit(unit)}`;
  });
}

function normalizeTypographyForSpeech(text) {
  return text
    .replace(/([:;])[ \t]*[‐‑‒–—―−]+[ \t]*/g, '$1 ')
    .replace(DASH_LIKE_PATTERN, ' - ')
    .replace(/[ \t]+-[ \t]+/g, ', ');
}

function normalizeMarkdownHeadingForSpeech(heading) {
  const cleaned = heading.replace(/[ \t]+#{1,}[ \t]*$/, '').trim();
  if (!cleaned) {
    return '';
  }
  const punctuationTarget = cleaned.replace(TRAILING_QUOTE_OR_BRACKET_PATTERN, '');
  return SPEECH_TERMINAL_PUNCTUATION_PATTERN.test(punctuationTarget) ? cleaned : `${cleaned}.`;
}

function normalizeFencedCodeBlocksForSpeech(text) {
  return text.replace(/```[ \t]*([^\r\n`]*)\r?\n([\s\S]*?)```/g, (_, language, content) => {
    const normalizedLanguage = String(language || '').trim().toLowerCase();
    if (['text', 'txt', 'plain', 'plaintext'].includes(normalizedLanguage)) {
      return String(content || '').trim();
    }
    return ' ';
  });
}

export function stripMarkdown(text) {
  let output = removeExcludedOcrBlocks(text);
  output = normalizeFencedCodeBlocksForSpeech(output);
  output = output.replace(MARKDOWN_IMAGE_PATTERN, '$1');
  output = output.replace(MARKDOWN_LINK_PATTERN, '$1');
  output = output.replace(RAW_URL_PATTERN, ' ');
  output = normalizeApiExamples(output);
  output = normalizeTypographyForSpeech(output);
  output = output.replace(INLINE_MATH_PATTERN, (_, inlineRound, inlineSquare, inlineDollar) =>
    normalizeFormulaText(inlineRound || inlineSquare || inlineDollar || '')
  );
  output = normalizePlainTemperatureText(output);
  output = normalizeSpokenTemperatureUnits(output);
  output = output.replace(NUMERIC_CITATION_PATTERN, (_, refs) => `reference ${refs.replace(/\s*,\s*/g, ', ')}`);
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`[^`]*`/g, '');
  output = output.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  output = output.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  output = output.replace(HTML_TAG_PATTERN, ' ');
  output = output.replace(/^\s{0,3}(?:\*\s*){3,}$/gm, '');
  output = output.replace(/\*\*(.*?)\*\*/g, '$1');
  output = output.replace(/\*(.*?)\*/g, '$1');
  output = output.replace(/__(.*?)__/g, '$1');
  output = output.replace(/_(.*?)_/g, '$1');
  output = output.replace(/[•●◦▪]/g, '-');
  output = output.replace(/^[ \t]{0,3}#{1,6}[ \t]+([^\r\n]*?)[ \t]*$/gm, (_, heading) =>
    normalizeMarkdownHeadingForSpeech(heading)
  );
  output = output.replace(/^\s{0,3}>\s?/gm, '');
  output = output.replace(/^\s{0,3}[-*+]\s+/gm, '');
  output = output.replace(/^\s{0,3}---+\s*$/gm, '');
  output = output.replace(/([0-9])%/g, '$1 percent');
  output = output.replace(/\s*[=><]\s*/g, ' ');
  output = output.replace(ZERO_WIDTH_PATTERN, '');
  output = output.replace(/\uFE0F/g, '');
  output = output.replace(CONTROL_PATTERN, ' ');
  output = output.replace(EMOJI_PATTERN, ' ');
  output = output.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ');
  output = output.replace(/[ \t]+\n/g, '\n');
  output = output.replace(/\n[ \t]+/g, '\n');
  output = output.replace(/[ \t]{2,}/g, ' ');
  output = output.replace(/[ \t]+([.,:;!?])/g, '$1');
  output = output.replace(/\n{3,}/g, '\n\n');
  return output.trim();
}

function splitMarkdownSections(text) {
  const input = typeof text === 'string' ? text : '';
  const matches = Array.from(input.matchAll(MARKDOWN_HEADING_PATTERN));
  if (matches.length === 0) {
    return splitUppercaseHeadingSections(input);
  }

  const sections = [];
  const firstHeadingIndex = matches[0]?.index ?? 0;
  const intro = input.slice(0, firstHeadingIndex).trim();
  if (intro) {
    sections.push(intro);
  }

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = matches[index + 1]?.index ?? input.length;
    const section = input.slice(start, end).trim();
    if (section) {
      sections.push(section);
    }
  }

  return sections.length > 0 ? sections.flatMap(splitUppercaseHeadingSections) : splitUppercaseHeadingSections(input);
}

function isUppercaseHeadingLine(line) {
  const trimmed = line.trim();
  if (trimmed.length < 4 || trimmed.length > 120) {
    return false;
  }
  if (!/[A-Z]/.test(trimmed) || /[a-z]/.test(trimmed)) {
    return false;
  }
  const words = trimmed.match(/[A-Z]{2,}/g) || [];
  return words.length >= 2;
}

function splitUppercaseHeadingSections(text) {
  const input = typeof text === 'string' ? text : '';
  const lines = input.split(/\r?\n/);
  const sections = [];
  let current = [];

  const flushCurrent = () => {
    const section = current.join('\n').trim();
    if (section) {
      sections.push(section);
    }
    current = [];
  };

  for (const line of lines) {
    if (isUppercaseHeadingLine(line)) {
      flushCurrent();
      sections.push(line.trim());
      continue;
    }
    current.push(line);
  }

  flushCurrent();
  return sections.length > 0 ? sections : [input];
}

function withTerminalPeriod(text) {
  const trimmed = text.trim();
  if (!trimmed || /[.!?]["')\]]*$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function getMarkdownSectionTitle(section) {
  const match = section.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*(?:\n|$)/);
  if (!match) {
    return null;
  }
  return stripMarkdown(match[1]).trim() || null;
}

export function prepareChapterSpeechSegments(text) {
  return splitMarkdownSections(text)
    .map((section) => ({
      title: getMarkdownSectionTitle(section),
      text: withTerminalPeriod(stripMarkdown(section))
    }))
    .filter((section) => section.text);
}

export function prepareChapterSpeechSections(text) {
  return prepareChapterSpeechSegments(text).map((section) => section.text);
}

function findSentenceBreakBackward(input, start, end) {
  for (let index = Math.min(end - 1, input.length - 1); index >= start; index -= 1) {
    const char = input[index];
    if (char !== '.' && char !== '!' && char !== '?') {
      continue;
    }
    let breakIndex = index + 1;
    while (breakIndex < input.length && TRAILING_SENTENCE_CLOSER_PATTERN.test(input[breakIndex])) {
      breakIndex += 1;
    }
    const nextChar = input[breakIndex] ?? '';
    if (!nextChar || /\s|["')\]]/.test(nextChar)) {
      return breakIndex;
    }
  }
  return -1;
}

function findBreakBackward(input, start, end) {
  if (end <= start) {
    return -1;
  }
  let index = input.lastIndexOf('\n\n', end - 1);
  if (index >= start) {
    return index + 2;
  }
  index = input.lastIndexOf('\n', end - 1);
  if (index >= start) {
    return index + 1;
  }
  index = findSentenceBreakBackward(input, start, end);
  if (index >= start) {
    return index;
  }
  index = input.lastIndexOf(' ', end - 1);
  if (index >= start) {
    return index + 1;
  }
  return -1;
}

function findBreakForward(input, idealEnd, maxEnd) {
  if (maxEnd <= idealEnd) {
    return -1;
  }
  let index = input.indexOf('\n\n', idealEnd);
  if (index !== -1 && index < maxEnd) {
    return index + 2;
  }
  index = input.indexOf('\n', idealEnd);
  if (index !== -1 && index < maxEnd) {
    return index + 1;
  }
  for (let cursor = idealEnd; cursor < maxEnd; cursor += 1) {
    const char = input[cursor];
    if (char !== '.' && char !== '!' && char !== '?') {
      continue;
    }
    let breakIndex = cursor + 1;
    while (breakIndex < input.length && TRAILING_SENTENCE_CLOSER_PATTERN.test(input[breakIndex])) {
      breakIndex += 1;
    }
    const nextChar = input[breakIndex] ?? '';
    if (!nextChar || /\s|["')\]]/.test(nextChar)) {
      return breakIndex;
    }
  }
  index = input.indexOf(' ', idealEnd);
  if (index !== -1 && index < maxEnd) {
    return index + 1;
  }
  return -1;
}

function findChunkEnd(input, cursor, chunkSize, lookahead) {
  const idealEnd = Math.min(cursor + chunkSize, input.length);
  if (idealEnd >= input.length) {
    return input.length;
  }
  const maxEnd = Math.min(input.length, idealEnd + lookahead);
  const forwardBreak = findBreakForward(input, idealEnd, maxEnd);
  if (forwardBreak > cursor) {
    return forwardBreak;
  }
  const backwardBreak = findBreakBackward(input, cursor, idealEnd);
  if (backwardBreak > cursor) {
    return backwardBreak;
  }
  return idealEnd;
}

export function splitStreamChunks(
  text,
  startIndex,
  chunkSize = STREAM_CHUNK_SIZE,
  lookahead = STREAM_CHUNK_LOOKAHEAD
) {
  const resolvedChunkSize = Number.isInteger(chunkSize) && chunkSize > 0 ? chunkSize : STREAM_CHUNK_SIZE;
  const resolvedLookahead = Number.isInteger(lookahead) && lookahead >= 0 ? lookahead : STREAM_CHUNK_LOOKAHEAD;
  const input = stripMarkdown(text.slice(Math.max(0, startIndex)));
  const chunks = [];
  let cursor = 0;
  while (cursor < input.length) {
    const chunkEnd = findChunkEnd(input, cursor, resolvedChunkSize, resolvedLookahead);
    const chunk = input.slice(cursor, chunkEnd).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    cursor = Math.max(cursor + 1, chunkEnd);
  }
  return chunks;
}
