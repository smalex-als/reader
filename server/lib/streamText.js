import { splitMarkdownPlaybackBlocks } from '../../shared/markdownCommandsCore.js';
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

function getBlockEnd(input, block) {
  return input.indexOf(block.rawText, block.startIndex) + block.rawText.length;
}

/**
 * Splits one section into parts that share a voice, ending a part wherever a
 * `::pause` or an effective `::voice` switch sits. A part keeps the source
 * ranges it covers instead of individual blocks, so a section without such
 * commands is still spoken as the single source slice it always was.
 */
function collectSectionParts(section, sectionIndex, state, options) {
  const input = normalizeFencedCodeBlocksForSpeech(section);
  const parts = [];
  let part = null;
  let rangeOpen = false;

  const addRange = (start, end) => {
    if (!part) {
      part = { sectionIndex, voice: state.voice, pauseAfterMs: 0, ranges: [] };
      parts.push(part);
    }
    const lastRange = part.ranges[part.ranges.length - 1];
    if (lastRange && rangeOpen) {
      lastRange[1] = end;
    } else {
      part.ranges.push([start, end]);
    }
    rangeOpen = true;
  };

  for (const block of splitMarkdownPlaybackBlocks(input)) {
    const { command } = block;
    if (command?.name === 'pause') {
      const target = part ?? state.lastPart;
      if (target) {
        target.pauseAfterMs += command.durationMs;
      }
      part = null;
      rangeOpen = false;
      continue;
    }
    if (command?.name === 'voice') {
      // A bare `::voice` returns to the chapter voice; a voice the chapter's
      // provider cannot produce is ignored rather than failing the whole MP3.
      const nextVoice = command.voice ? options.resolveVoice?.(command.voice) ?? state.voice : null;
      if (nextVoice !== state.voice) {
        state.voice = nextVoice;
        part = null;
        rangeOpen = false;
      }
      continue;
    }
    if (command?.name === 'skip' || command?.name === 'skip-end') {
      state.skipping = command.name === 'skip';
      rangeOpen = false;
      continue;
    }
    // `::say` is spoken even inside a skip region: it stands in for what was
    // skipped. Notes and `::stop` stay inside the range, where `stripMarkdown`
    // drops them, since a file has nowhere to stop.
    if (state.skipping && command?.name !== 'say') {
      rangeOpen = false;
      continue;
    }
    if (command && command.name !== 'say') {
      continue;
    }
    addRange(block.startIndex, getBlockEnd(input, block));
    state.lastPart = part;
  }

  return parts.map((entry) => ({
    ...entry,
    text: withTerminalPeriod(
      stripMarkdown(entry.ranges.map(([start, end]) => input.slice(start, end)).join('\n\n'))
    )
  }));
}

/**
 * Prepares a chapter for MP3 generation: sections carry subchapter titles, and
 * each section is split into parts that carry the `::voice` and `::pause`
 * commands. `options.resolveVoice` maps a command's voice name to a voice id,
 * or null when the chapter's provider cannot use it.
 */
export function prepareChapterSpeechSegments(text, options = {}) {
  const state = { skipping: false, voice: null, lastPart: null };
  const parts = splitMarkdownSections(text).flatMap((section, sectionIndex) =>
    collectSectionParts(section, sectionIndex, state, options).map((part) => ({
      ...part,
      title: getMarkdownSectionTitle(section)
    }))
  );

  // A part can strip down to nothing (an image, a code block); its pause still
  // belongs after whatever was spoken before it.
  const spokenParts = [];
  for (const part of parts) {
    if (part.text) {
      spokenParts.push(part);
    } else if (spokenParts.length > 0) {
      spokenParts[spokenParts.length - 1].pauseAfterMs += part.pauseAfterMs;
    }
  }

  const sections = [];
  for (const part of spokenParts) {
    let section = sections[sections.length - 1];
    if (section?.sectionIndex !== part.sectionIndex) {
      section = { sectionIndex: part.sectionIndex, title: part.title, parts: [] };
      sections.push(section);
    }
    section.parts.push({ text: part.text, voice: part.voice, pauseAfterMs: part.pauseAfterMs });
  }
  return sections.map((section) => ({
    title: section.title,
    text: section.parts.map((part) => part.text).join('\n\n'),
    parts: section.parts
  }));
}

/**
 * The text a chapter MP3 is generated from, with its voice switches and pauses
 * written in, so that editing only a command still marks the MP3 stale. Without
 * commands it is exactly the spoken text.
 */
export function formatChapterSpeechPlan(sections) {
  return sections
    .flatMap((section) =>
      section.parts.map((part) =>
        [
          part.voice ? `[voice ${part.voice}]` : '',
          part.text,
          part.pauseAfterMs ? `[pause ${part.pauseAfterMs}ms]` : ''
        ].filter(Boolean).join('\n')
      )
    )
    .join('\n\n');
}

export function prepareChapterSpeechSections(text) {
  return prepareChapterSpeechSegments(text).map((section) => section.text);
}
