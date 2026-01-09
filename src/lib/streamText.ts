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

export function splitStreamChunks(text: string, startIndex: number) {
  const input = stripMarkdown(text);
  const chunks: { text: string; startIndex: number }[] = [];
  let cursor = Math.max(0, startIndex);
  while (cursor < input.length) {
    const slice = input.slice(cursor, cursor + STREAM_CHUNK_SIZE);
    if (cursor + STREAM_CHUNK_SIZE >= input.length) {
      const textValue = slice.trim();
      if (textValue) {
        chunks.push({ text: textValue, startIndex: cursor });
      }
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
    const chunk = input.slice(cursor, cursor + breakIndex).trim();
    if (chunk) {
      chunks.push({ text: chunk, startIndex: cursor });
    }
    cursor += Math.max(1, breakIndex);
  }
  return chunks;
}
