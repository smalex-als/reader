import {
  createContext,
  createElement,
  type ComponentPropsWithoutRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useContext
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

export type InteractiveMarkdownTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'ul' | 'ol' | 'li';

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

const InteractiveListItemContext = createContext(false);

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
  const hasInteractiveListItems = blockTags.includes('li');

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
      const insideInteractiveListItem = useContext(InteractiveListItemContext);
      if (insideInteractiveListItem && tag !== 'li') {
        return createElement(tag, { ...props, className }, children);
      }
      const block = resolveBlock(tag, children, node);
      const attributes = getBlockAttributes?.(block) ?? {};
      const active = isBlockActive?.(block) ?? (
        tag === 'li'
          ? activeStart === block.startIndex
          : isMarkdownRangeActive(activeStart, block.startIndex, block.endIndex)
      );
      const renderedChildren = tag === 'li' ? (
        <InteractiveListItemContext.Provider value={true}>
          {children}
        </InteractiveListItemContext.Provider>
      ) : children;
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
          event.stopPropagation();
          onBlockClick(block);
        }
      }, renderedChildren);
    };
  };

  const renderList = <Tag extends 'ul' | 'ol'>(tag: Tag) => {
    return ({ children, node, className, ...props }: ComponentPropsWithoutRef<Tag> & ExtraProps) => {
      const block = resolveBlock(tag, children, node);
      const attributes = getBlockAttributes?.(block) ?? {};
      if (hasInteractiveListItems) {
        return (
          <div className="text-viewer-list-block">
            {createElement(tag, { ...props, className }, children)}
          </div>
        );
      }
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
            event.stopPropagation();
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
    switch (tag) {
      case 'ul':
        components.ul = renderList('ul');
        break;
      case 'ol':
        components.ol = renderList('ol');
        break;
      case 'li':
        components.li = renderTextBlock('li');
        break;
      case 'p':
        components.p = renderTextBlock('p');
        break;
      case 'h1':
        components.h1 = renderTextBlock('h1');
        break;
      case 'h2':
        components.h2 = renderTextBlock('h2');
        break;
      case 'h3':
        components.h3 = renderTextBlock('h3');
        break;
      case 'h4':
        components.h4 = renderTextBlock('h4');
        break;
      case 'h5':
        components.h5 = renderTextBlock('h5');
        break;
      case 'h6':
        components.h6 = renderTextBlock('h6');
        break;
    }
  }
  return components;
}
