const STREAM_CHUNK_SIZE = 1000;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;

export function stripMarkdown(text) {
  let output = text;
  output = output.replace(/```[\s\S]*?```/g, '');
  output = output.replace(/`[^`]*`/g, '');
  output = output.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  output = output.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  output = output.replace(HTML_TAG_PATTERN, ' ');
  output = output.replace(MARKDOWN_IMAGE_PATTERN, '$1');
  output = output.replace(MARKDOWN_LINK_PATTERN, '$1');
  output = output.replace(/\*\*(.*?)\*\*/g, '$1');
  output = output.replace(/\*(.*?)\*/g, '$1');
  output = output.replace(/__(.*?)__/g, '$1');
  output = output.replace(/_(.*?)_/g, '$1');
  output = output.replace(/[•●◦▪]/g, '-');
  output = output.replace(/^\s{0,3}#{1,6}\s+/gm, '');
  output = output.replace(/^\s{0,3}>\s?/gm, '');
  output = output.replace(/^\s{0,3}[-*+]\s+/gm, '');
  output = output.replace(/^\s{0,3}---+\s*$/gm, '');
  output = output.replace(ZERO_WIDTH_PATTERN, '');
  output = output.replace(/\uFE0F/g, '');
  output = output.replace(CONTROL_PATTERN, ' ');
  output = output.replace(EMOJI_PATTERN, ' ');
  output = output.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, ' ');
  output = output.replace(/[ \t]+\n/g, '\n');
  output = output.replace(/\n[ \t]+/g, '\n');
  output = output.replace(/[ \t]{2,}/g, ' ');
  output = output.replace(/\n{3,}/g, '\n\n');
  return output.trim();
}

export function splitStreamChunks(text, startIndex) {
  const input = stripMarkdown(text.slice(Math.max(0, startIndex)));
  const chunks = [];
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor, cursor + STREAM_CHUNK_SIZE);
    if (cursor + STREAM_CHUNK_SIZE >= input.length) {
      chunks.push(slice.trim());
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
    chunks.push(chunk.trim());
    cursor += Math.max(1, breakIndex);
  }
  return chunks.filter((chunk) => chunk.length > 0);
}
