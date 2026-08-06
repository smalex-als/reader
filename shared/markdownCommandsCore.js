const COMMAND_LINE_PATTERN = /^[ \t]{0,3}::([A-Za-z][A-Za-z0-9-]*)(?:[ \t]+([^\n]*?))?[ \t]*$/;
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)[ \t]*(ms|s)?$/i;

export const DEFAULT_PAUSE_MS = 1000;
export const MAX_PAUSE_MS = 30000;

export function parsePauseDurationMs(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) {
    return DEFAULT_PAUSE_MS;
  }
  const match = raw.match(DURATION_PATTERN);
  if (!match) {
    return DEFAULT_PAUSE_MS;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return DEFAULT_PAUSE_MS;
  }
  const milliseconds = match[2]?.toLowerCase() === 'ms' ? amount : amount * 1000;
  return Math.min(MAX_PAUSE_MS, Math.max(0, Math.round(milliseconds)));
}

export function parseMarkdownCommandLine(line) {
  const input = typeof line === 'string' ? line.replace(/\r$/, '') : '';
  if (!input.includes('::')) {
    return null;
  }
  const match = input.match(COMMAND_LINE_PATTERN);
  if (!match) {
    return null;
  }
  const name = match[1].toLowerCase();
  const argument = (match[2] || '').trim();
  if (name === 'pause') {
    return { name: 'pause', durationMs: parsePauseDurationMs(argument) };
  }
  if (name === 'note' || name === 'comment') {
    return { name: 'note', text: argument };
  }
  return null;
}

function isBlankLine(line) {
  return typeof line !== 'string' || line.trim() === '';
}

/**
 * Commands only count when they stand alone as their own Markdown block, which
 * keeps the speech pipeline and the rendered document in agreement about what
 * is a command and what is ordinary prose.
 */
export function isStandaloneCommandLine(lines, index) {
  const previousIsBlank = index === 0 || isBlankLine(lines[index - 1]);
  const nextIsBlank = index === lines.length - 1 || isBlankLine(lines[index + 1]);
  return previousIsBlank && nextIsBlank && parseMarkdownCommandLine(lines[index]) !== null;
}

export function removeMarkdownCommandLines(text) {
  const input = typeof text === 'string' ? text : '';
  if (!input.includes('::')) {
    return input;
  }
  const lines = input.split('\n');
  const kept = lines.filter((_, index) => !isStandaloneCommandLine(lines, index));
  return kept.length === lines.length ? input : kept.join('\n');
}
