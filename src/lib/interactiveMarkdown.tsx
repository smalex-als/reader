import {
  createElement,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react';
import type { Element as HastElement } from 'hast';
import type { Components, ExtraProps } from 'react-markdown';
import {
  extractMarkdownNodeText,
  isMarkdownRangeActive,
  resolveMarkdownTextRange
} from '@/lib/interactiveMarkdownCore';

export {
  extractMarkdownNodeText,
  isMarkdownRangeActive,
  resolveMarkdownTextRange
} from '@/lib/interactiveMarkdownCore';

export type InteractiveMarkdownTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'ul' | 'ol';

export type InteractiveMarkdownBlock = {
  endIndex: number;
  node?: HastElement;
  startIndex: number;
  tag: InteractiveMarkdownTag;
  text: string;
};

export type InteractiveMarkdownBlockAttributes = {
  className?: string;
  id?: string;
  'data-outline-id'?: string;
};

type InteractiveMarkdownOptions = {
  activeStart: number | null;
  blockTags: readonly InteractiveMarkdownTag[];
  getBlockAttributes?: (block: InteractiveMarkdownBlock) => InteractiveMarkdownBlockAttributes;
  isBlockActive?: (block: InteractiveMarkdownBlock) => boolean;
  onBlockClick: (block: InteractiveMarkdownBlock) => void;
  sourceText: string;
};

export function shouldIgnoreInteractiveMarkdownClick(event: ReactMouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]')) {
    return true;
  }
  return Boolean(window.getSelection()?.toString().trim());
}

function mergeClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function createInteractiveMarkdownComponents({
  activeStart,
  blockTags,
  getBlockAttributes,
  isBlockActive,
  onBlockClick,
  sourceText
}: InteractiveMarkdownOptions): Components {
  const resolveBlock = (
    tag: InteractiveMarkdownTag,
    children: ReactNode,
    node?: HastElement
  ): InteractiveMarkdownBlock => {
    const text = extractMarkdownNodeText(children).trim();
    const { startIndex, endIndex } = resolveMarkdownTextRange(sourceText, text, node);
    return { tag, text, startIndex, endIndex, node };
  };

  const renderTextBlock = <Tag extends Exclude<InteractiveMarkdownTag, 'ul' | 'ol'>>(tag: Tag) => {
    return ({ children, node, className, ...props }: ComponentPropsWithoutRef<Tag> & ExtraProps) => {
      const block = resolveBlock(tag, children, node);
      const attributes = getBlockAttributes?.(block) ?? {};
      const active = isBlockActive?.(block) ?? isMarkdownRangeActive(
        activeStart,
        block.startIndex,
        block.endIndex
      );
      return createElement(tag, {
        ...props,
        ...attributes,
        className: mergeClassNames('text-viewer-block', className, attributes.className),
        'data-playing': active ? 'true' : 'false',
        'data-streamable': block.text ? 'true' : undefined,
        'data-paragraph-start': block.startIndex,
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
          if (!block.text || shouldIgnoreInteractiveMarkdownClick(event)) {
            return;
          }
          onBlockClick(block);
        }
      }, children);
    };
  };

  const renderList = <Tag extends 'ul' | 'ol'>(tag: Tag) => {
    return ({ children, node, className, ...props }: ComponentPropsWithoutRef<Tag> & ExtraProps) => {
      const block = resolveBlock(tag, children, node);
      const attributes = getBlockAttributes?.(block) ?? {};
      const active = isBlockActive?.(block) ?? isMarkdownRangeActive(
        activeStart,
        block.startIndex,
        block.endIndex
      );
      return (
        <div
          {...attributes}
          className={mergeClassNames(
            'text-viewer-block text-viewer-list-block',
            attributes.className
          )}
          data-playing={active ? 'true' : 'false'}
          data-streamable={block.text ? 'true' : undefined}
          data-paragraph-start={block.startIndex}
          onClick={(event) => {
            if (!block.text || shouldIgnoreInteractiveMarkdownClick(event)) {
              return;
            }
            onBlockClick(block);
          }}
        >
          {createElement(tag, { ...props, className }, children)}
        </div>
      );
    };
  };

  const components: Components = {};
  for (const tag of blockTags) {
    if (tag === 'ul' || tag === 'ol') {
      components[tag] = renderList(tag);
    } else {
      components[tag] = renderTextBlock(tag);
    }
  }
  return components;
}
