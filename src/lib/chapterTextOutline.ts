export type TextOutlineItem = {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  offset: number;
};

function slugifyHeading(input: string) {
  return input
    .toLowerCase()
    .replace(/[`*_~[\]()]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeOutlineTitle(input: string) {
  const escapedMarkdown: string[] = [];
  const protectedInput = input
    .replace(/^#{1,6}\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*{}[\]()#+\-.!_>~|])/g, (_match, character: string) => {
      const index = escapedMarkdown.push(character) - 1;
      return `\uE000${index}\uE001`;
    });

  return protectedInput
    .replace(/[*~`]+/g, '')
    .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, '')
    .replace(/\uE000(\d+)\uE001/g, (_match, index: string) => escapedMarkdown[Number(index)] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseFallbackOutline(input: string): TextOutlineItem[] {
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const paragraphPattern = /\S[\s\S]*?(?=(?:\n\s*\n)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphPattern.exec(input)) !== null) {
    const rawParagraph = match[0]?.trim();
    if (!rawParagraph) {
      continue;
    }
    const firstLine = normalizeOutlineTitle(rawParagraph.split('\n')[0] ?? '');
    if (!firstLine) {
      continue;
    }
    const isCompact = rawParagraph.length <= 120;
    const hasFewWords = firstLine.split(/\s+/).length <= 10;
    const looksLikeHeading = !/[.!?]$/.test(firstLine) || /^chapter\b/i.test(firstLine) || /:$/.test(firstLine);
    if (!isCompact || !hasFewWords || !looksLikeHeading) {
      continue;
    }
    const baseId = slugifyHeading(firstLine) || `section-${items.length + 1}`;
    const duplicateIndex = seen.get(baseId) ?? 0;
    seen.set(baseId, duplicateIndex + 1);
    items.push({
      id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
      title: firstLine.replace(/:$/, ''),
      level: /^chapter\b/i.test(firstLine) ? 1 : 2,
      offset: match.index
    });
  }

  return items;
}

export function parseTextOutline(input: string): TextOutlineItem[] {
  if (!input) {
    return [];
  }
  const items: TextOutlineItem[] = [];
  const seen = new Map<string, number>();
  const lines = input.split('\n');
  let offset = 0;
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const title = normalizeOutlineTitle(match[2]);
      if (title) {
        const baseId = slugifyHeading(title) || `section-${items.length + 1}`;
        const duplicateIndex = seen.get(baseId) ?? 0;
        seen.set(baseId, duplicateIndex + 1);
        items.push({
          id: duplicateIndex === 0 ? baseId : `${baseId}-${duplicateIndex + 1}`,
          title,
          level,
          offset
        });
      }
    }
    offset += line.length + 1;
  }
  return items.length > 0 ? items : parseFallbackOutline(input);
}
