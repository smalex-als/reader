const STREAM_CHUNK_SIZE = 1000;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;

export function stripMarkdown(text: string) {
  let output = text;
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`[^`]*`/g, '');
  output = output.replace(MARKDOWN_IMAGE_PATTERN, '$1');
  output = output.replace(MARKDOWN_LINK_PATTERN, '$1');
  output = output.replace(/[•●◦▪]/g, '-');
  output = output.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  output = output.replace(/^\s{0,3}>\s?/gm, '');
  output = output.replace(/^\s{0,3}[-*+]\s+/gm, '');
  output = output.replace(/^\s{0,3}---+\s*$/gm, '');
  output = output.replace(/\n{3,}/g, '\n\n');
  return output.trim();
}

export type StreamChunk = {
  text: string;
  offset: number;
};

export function splitStreamChunks(text: string, startIndex: number) {
  const input = stripMarkdown(text.slice(Math.max(0, startIndex)));
  const chunks: StreamChunk[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor, cursor + STREAM_CHUNK_SIZE);
    if (cursor + STREAM_CHUNK_SIZE >= input.length) {
      chunks.push({ text: slice.trim(), offset: cursor });
      break;
    }
    const breakWindow = slice.slice(Math.max(0, slice.length - 200));
    let breakIndex = breakWindow.lastIndexOf('\n\n');
    if (breakIndex === -1) {
      breakIndex = breakWindow.lastIndexOf('\n');
    }
    if (breakIndex === -1) {
      breakIndex = breakWindow.lastIndexOf(' ');
    }
    if (breakIndex === -1) {
      breakIndex = slice.length;
    } else {
      breakIndex += Math.max(0, slice.length - 200);
    }
    const chunk = input.slice(cursor, cursor + breakIndex);
    chunks.push({ text: chunk.trim(), offset: cursor });
    cursor += Math.max(1, breakIndex);
  }
  return chunks.filter((chunk) => chunk.text.length > 0);
}
