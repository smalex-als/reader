import { parseMarkdownCommandLine } from '../../shared/markdownCommandsCore.js';

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * A command is only recognised when it is the entire paragraph, which mirrors
 * the rule the speech pipeline applies in `splitMarkdownPlaybackBlocks`.
 */
function resolveParagraphCommand(node: MarkdownNode) {
  if (node.type !== 'paragraph' || node.children?.length !== 1) {
    return null;
  }
  const [child] = node.children;
  return child.type === 'text' && typeof child.value === 'string'
    ? parseMarkdownCommandLine(child.value)
    : null;
}

function toNoteNode(node: MarkdownNode, text: string): MarkdownNode {
  return {
    ...node,
    data: {
      ...node.data,
      hName: 'aside',
      hProperties: { className: ['text-viewer-note'] }
    },
    children: [{ type: 'text', value: text }]
  };
}

function transformCommands(node: MarkdownNode) {
  if (!node.children) {
    return;
  }
  const nextChildren: MarkdownNode[] = [];
  for (const child of node.children) {
    const command = resolveParagraphCommand(child);
    if (command?.name === 'pause') {
      continue;
    }
    if (command?.name === 'note') {
      if (command.text) {
        nextChildren.push(toNoteNode(child, command.text));
      }
      continue;
    }
    transformCommands(child);
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

export function remarkMarkdownCommands() {
  return (tree: MarkdownNode) => {
    transformCommands(tree);
  };
}
