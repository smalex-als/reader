import { isValidElement, useMemo, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }
  if (isValidElement(node)) {
    return extractTextFromNode(node.props.children);
  }
  return '';
}

function shouldIgnoreBlockClick(event: ReactMouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]')) {
    return true;
  }
  return Boolean(window.getSelection()?.toString().trim());
}

export default function UnitTopicMarkdown({
  activeParagraphStart,
  playTextBlock,
  text
}: {
  activeParagraphStart: number | null;
  playTextBlock: (startIndex: number) => void;
  text: string;
}) {
  const markdownComponents = useMemo(() => {
    const resolveTextRange = (textValue: string, node?: any) => {
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const start = Math.max(0, text.lastIndexOf('\n', nodeOffset - 1) + 1);
        const nodeEnd = node?.position?.end?.offset;
        const end = typeof nodeEnd === 'number' && nodeEnd > start ? nodeEnd : start + textValue.length;
        return { start, end };
      }
      if (textValue) {
        const foundIndex = text.indexOf(textValue);
        if (foundIndex !== -1) {
          const start = Math.max(0, text.lastIndexOf('\n', foundIndex - 1) + 1);
          return { start, end: foundIndex + textValue.length };
        }
      }
      return { start: 0, end: 0 };
    };

    const isPlayingRange = (startIndex: number, endIndex: number) => {
      return (
        activeParagraphStart !== null &&
        activeParagraphStart >= startIndex &&
        activeParagraphStart < Math.max(endIndex, startIndex + 1)
      );
    };

    const renderList = (Tag: 'ul' | 'ol') => {
      return ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        return (
          <div
            className="text-viewer-block text-viewer-list-block"
            data-playing={isPlayingRange(startIndex, endIndex) ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex);
            }}
          >
            <Tag {...props}>{children}</Tag>
          </div>
        );
      };
    };

    return {
      p: ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        return (
          <p
            className="text-viewer-block"
            data-playing={isPlayingRange(startIndex, endIndex) ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event: ReactMouseEvent<HTMLParagraphElement>) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex);
            }}
          >
            {children}
          </p>
        );
      },
      ul: renderList('ul'),
      ol: renderList('ol')
    };
  }, [activeParagraphStart, playTextBlock, text]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
}
