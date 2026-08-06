import {
  parseMarkdownCommandLine,
  type MarkdownCommand
} from '../../shared/markdownCommandsCore.js';

export type MarkdownPlaybackBlock = {
  rawText: string;
  startIndex: number;
  command?: MarkdownCommand;
};

type SourceLine = {
  text: string;
  start: number;
  end: number;
};

const MARKDOWN_LIST_ITEM_PATTERN = /^\s*(?:[-+*]|\d+[.)])\s+\S/;

function splitSourceLines(input: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let lineStart = 0;
  while (lineStart < input.length) {
    const newlineIndex = input.indexOf('\n', lineStart);
    const end = newlineIndex === -1 ? input.length : newlineIndex;
    lines.push({ text: input.slice(lineStart, end), start: lineStart, end });
    lineStart = newlineIndex === -1 ? input.length : newlineIndex + 1;
  }
  return lines;
}

function isBlankLine(line: SourceLine | undefined) {
  return !line || !line.text.trim();
}

export function splitMarkdownPlaybackBlocks(input: string): MarkdownPlaybackBlock[] {
  const blocks: MarkdownPlaybackBlock[] = [];
  const lines = splitSourceLines(input);
  let blockStart = -1;
  let blockEnd = -1;

  const flushBlock = () => {
    if (blockStart < 0 || blockEnd <= blockStart) {
      return;
    }
    const rawText = input.slice(blockStart, blockEnd).trim();
    if (rawText) {
      blocks.push({ rawText, startIndex: blockStart });
    }
    blockStart = -1;
    blockEnd = -1;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.text.trim()) {
      flushBlock();
      continue;
    }

    // `blockStart < 0` means the previous line was blank, so together with a
    // blank line after we know the command stands alone as its own block.
    const command = blockStart < 0 && isBlankLine(lines[index + 1])
      ? parseMarkdownCommandLine(line.text)
      : null;
    if (command) {
      blocks.push({ rawText: line.text.trim(), startIndex: line.start, command });
      continue;
    }

    if (MARKDOWN_LIST_ITEM_PATTERN.test(line.text)) {
      flushBlock();
    }
    if (blockStart < 0) {
      blockStart = line.start;
    }
    blockEnd = line.end;
  }
  flushBlock();

  return blocks;
}
