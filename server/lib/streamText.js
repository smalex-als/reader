const STREAM_CHUNK_SIZE = 1000;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]+\)/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu;
const INLINE_MATH_PATTERN = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g;

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

export function stripMarkdown(text) {
  let output = text;
  output = output.replace(INLINE_MATH_PATTERN, (_, inlineRound, inlineSquare, inlineDollar) =>
    normalizeFormulaText(inlineRound || inlineSquare || inlineDollar || '')
  );
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
