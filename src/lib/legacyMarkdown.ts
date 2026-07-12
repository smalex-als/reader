type MarkdownNode = {
  align?: Array<null | 'center' | 'left' | 'right'>;
  children?: MarkdownNode[];
  position?: unknown;
  type: string;
  value?: string;
};

const LEGACY_CENTER_PATTERN = /^\s*<center(?:\s[^>]*)?>([\s\S]*?)<\/center>\s*$/i;
const LEGACY_TABLE_PATTERN = /^\s*<table(?:\s[^>]*)?>([\s\S]*?)<\/table>\s*$/i;
const TABLE_ROW_PATTERN = /<tr(?:\s[^>]*)?>([\s\S]*?)<\/tr>/gi;
const TABLE_CELL_PATTERN = /<t[dh](?:\s[^>]*)?>([\s\S]*?)<\/t[dh]>/gi;

function decodeLegacyHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();
}

function convertLegacyTable(node: MarkdownNode, tableBody: string): MarkdownNode {
  const rows: MarkdownNode[] = [];
  for (const rowMatch of tableBody.matchAll(TABLE_ROW_PATTERN)) {
    const cells: MarkdownNode[] = [];
    for (const cellMatch of rowMatch[1].matchAll(TABLE_CELL_PATTERN)) {
      cells.push({
        type: 'tableCell',
        children: [{ type: 'text', value: decodeLegacyHtmlText(cellMatch[1]) }]
      });
    }
    if (cells.length > 0) {
      rows.push({ type: 'tableRow', children: cells });
    }
  }
  if (rows.length === 0) {
    return node;
  }
  const columnCount = Math.max(...rows.map((row) => row.children?.length ?? 0));
  return {
    type: 'table',
    position: node.position,
    align: Array.from({ length: columnCount }, () => null),
    children: rows
  };
}

export function convertLegacyHtml(node: MarkdownNode): MarkdownNode {
  if (node.type !== 'html' || typeof node.value !== 'string') {
    return node;
  }
  const centeredMatch = node.value.match(LEGACY_CENTER_PATTERN);
  if (centeredMatch) {
    return {
      type: 'paragraph',
      position: node.position,
      children: [{ type: 'text', value: centeredMatch[1].trim() }]
    };
  }
  const tableMatch = node.value.match(LEGACY_TABLE_PATTERN);
  return tableMatch ? convertLegacyTable(node, tableMatch[1]) : node;
}

function transformLegacyCenteredHtml(node: MarkdownNode) {
  if (!node.children) {
    return;
  }
  node.children = node.children.map((child) => {
    const converted = convertLegacyHtml(child);
    transformLegacyCenteredHtml(converted);
    return converted;
  });
}

export function remarkLegacyCenteredHtml() {
  return (tree: MarkdownNode) => {
    transformLegacyCenteredHtml(tree);
  };
}
