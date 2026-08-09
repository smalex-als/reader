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

/**
 * The badge rides on a data attribute rather than in the node's children so
 * that the block's own text — which the play key and source offsets are
 * derived from — stays exactly what the author wrote.
 */
function withVoiceBadge(node: MarkdownNode, label: string): MarkdownNode {
  const existingProperties = (node.data?.hProperties ?? {}) as Record<string, unknown>;
  return {
    ...node,
    data: {
      ...node.data,
      hProperties: { ...existingProperties, 'data-voice': label }
    }
  };
}

export type RemarkMarkdownCommandsOptions = {
  resolveVoiceLabel?: (voice: string | null) => string | null;
};

function transformCommands(node: MarkdownNode, options: RemarkMarkdownCommandsOptions) {
  if (!node.children) {
    return;
  }
  const nextChildren: MarkdownNode[] = [];
  let skipping = false;
  let pendingVoiceLabel: string | null = null;
  for (const child of node.children) {
    const command = resolveParagraphCommand(child);
    if (command) {
      // Notes are the only command with a visible counterpart; every other
      // marker is a playback instruction and leaves no trace in the document.
      if (command.name === 'note' && command.text) {
        nextChildren.push(toNoteNode(child, command.text));
      }
      if (command.name === 'skip') {
        skipping = true;
      }
      if (command.name === 'skip-end') {
        skipping = false;
      }
      if (command.name === 'voice') {
        pendingVoiceLabel = options.resolveVoiceLabel?.(command.voice) ?? command.voice;
      }
      continue;
    }
    transformCommands(child, options);
    // The badge marks the first block that is actually spoken in the new
    // voice, so a skipped block must not consume it.
    if (pendingVoiceLabel && !skipping) {
      nextChildren.push(withVoiceBadge(child, pendingVoiceLabel));
      pendingVoiceLabel = null;
      continue;
    }
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

export function remarkMarkdownCommands(options: RemarkMarkdownCommandsOptions = {}) {
  return (tree: MarkdownNode) => {
    transformCommands(tree, options);
  };
}
