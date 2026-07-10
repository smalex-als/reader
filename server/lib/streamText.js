import {
  normalizeFencedCodeBlocksForSpeech,
  splitStreamChunks,
  splitStreamParagraphChunks,
  stripMarkdown
} from '../../shared/streamTextCore.js';

export {
  normalizeFencedCodeBlocksForSpeech,
  splitStreamChunks,
  splitStreamParagraphChunks,
  stripMarkdown
};

const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+\S.*$/gm;

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
