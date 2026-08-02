type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  [key: string]: unknown;
};

function splitSoftBreaks(node: MarkdownNode): MarkdownNode[] {
  const lines = node.value?.split('\n') ?? [];
  return lines.flatMap((line, index) => {
    const textNode = { ...node, value: line };
    return index === 0 ? [textNode] : [{ type: 'break' }, textNode];
  });
}

function preserveListItemBreaks(node: MarkdownNode, insideListItem = false) {
  if (!node.children) {
    return;
  }

  const nextChildren: MarkdownNode[] = [];
  for (const child of node.children) {
    const childInsideListItem = insideListItem || child.type === 'listItem';
    if (insideListItem && child.type === 'text' && child.value?.includes('\n')) {
      nextChildren.push(...splitSoftBreaks(child));
      continue;
    }
    preserveListItemBreaks(child, childInsideListItem);
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

export function remarkListItemBreaks() {
  return (tree: MarkdownNode) => preserveListItemBreaks(tree);
}
