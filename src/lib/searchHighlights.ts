// Match the whole-word token rules used by server/lib/search.js.
const SEARCH_WORD_PATTERN = /[a-z0-9]+(?:['’-][a-z0-9]+)*/gi;

export function splitSearchHighlights(text: string, query: string) {
  const terms = new Set((query.match(SEARCH_WORD_PATTERN) ?? []).map((term) => term.toLowerCase()));
  const parts: Array<{ text: string; match: boolean }> = [];
  let offset = 0;
  for (const word of text.matchAll(SEARCH_WORD_PATTERN)) {
    if (!terms.has(word[0].toLowerCase())) {
      continue;
    }
    const start = word.index ?? 0;
    if (start > offset) {
      parts.push({ text: text.slice(offset, start), match: false });
    }
    parts.push({ text: word[0], match: true });
    offset = start + word[0].length;
  }
  if (offset < text.length) {
    parts.push({ text: text.slice(offset), match: false });
  }
  return parts;
}
