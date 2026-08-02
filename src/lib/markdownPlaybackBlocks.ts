export type MarkdownPlaybackBlock = {
  rawText: string;
  startIndex: number;
};

const MARKDOWN_LIST_ITEM_PATTERN = /^\s*(?:[-+*]|\d+[.)])\s+\S/;

export function splitMarkdownPlaybackBlocks(input: string): MarkdownPlaybackBlock[] {
  const blocks: MarkdownPlaybackBlock[] = [];
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

  let lineStart = 0;
  while (lineStart < input.length) {
    const newlineIndex = input.indexOf('\n', lineStart);
    const lineEnd = newlineIndex === -1 ? input.length : newlineIndex;
    const nextLineStart = newlineIndex === -1 ? input.length : newlineIndex + 1;
    const line = input.slice(lineStart, lineEnd);

    if (!line.trim()) {
      flushBlock();
      lineStart = nextLineStart;
      continue;
    }

    const isListItem = MARKDOWN_LIST_ITEM_PATTERN.test(line);
    if (isListItem) {
      flushBlock();
    }
    if (blockStart < 0) {
      blockStart = lineStart;
    }
    blockEnd = lineEnd;
    lineStart = nextLineStart;
  }
  flushBlock();

  return blocks;
}
