import { isValidElement, useEffect, useMemo, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextOutlineItem } from '@/hooks/useChapterTextOutline';
import { hashText } from '@/lib/textHash';
import { appActions, useAppDispatch } from '@/state/appState';

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

function isTextBlockVisible(containerRect: DOMRect, blockRect: DOMRect) {
  const comfortableTop = containerRect.top + 96;
  const comfortableBottom = containerRect.bottom - 96;
  return blockRect.top >= comfortableTop && blockRect.bottom <= comfortableBottom;
}

type ChapterTextMarkdownLayoutProps = {
  activeOutlineId: string | null;
  chapterNumber: number | null;
  displayError: string | null;
  displayLoading: boolean;
  displayText: string;
  handleOutlineSelect: (id: string) => void;
  missingFile: string | null;
  outlineByOffset: Map<number, TextOutlineItem>;
  outlineItems: TextOutlineItem[];
  outlineOpen: boolean;
  playingParagraphMode: 'chapter' | 'narration' | null;
  playingParagraphStart: number | null;
  selectedVersionId: string;
  textViewerRef: RefObject<HTMLDivElement | null>;
  tocLoading: boolean;
};

export default function ChapterTextMarkdownLayout({
  activeOutlineId,
  chapterNumber,
  displayError,
  displayLoading,
  displayText,
  handleOutlineSelect,
  missingFile,
  outlineByOffset,
  outlineItems,
  outlineOpen,
  playingParagraphMode,
  playingParagraphStart,
  selectedVersionId,
  textViewerRef,
  tocLoading
}: ChapterTextMarkdownLayoutProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (playingParagraphMode !== 'chapter' || playingParagraphStart === null) {
      return;
    }
    const container = textViewerRef.current;
    const target = container?.querySelector<HTMLElement>(
      `[data-paragraph-start="${playingParagraphStart}"][data-playing="true"]`
    );
    if (!container || !target) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (isTextBlockVisible(containerRect, targetRect)) {
      return;
    }
    const top = container.scrollTop + (targetRect.top - containerRect.top) - 120;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [playingParagraphMode, playingParagraphStart, textViewerRef]);

  const markdownComponents = useMemo(() => {
    const shouldIgnoreBlockClick = (event: ReactMouseEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return false;
      }
      if (target.closest('a, button, input, select, textarea, [role="button"], [contenteditable="true"]')) {
        return true;
      }
      return Boolean(window.getSelection()?.toString().trim());
    };

    const resolveTextRange = (textValue: string, node?: any) => {
      if (!displayText) {
        return { start: 0, end: 0 };
      }
      const nodeOffset = node?.position?.start?.offset;
      if (typeof nodeOffset === 'number') {
        const lineStart = displayText.lastIndexOf('\n', nodeOffset - 1);
        const start = lineStart === -1 ? 0 : lineStart + 1;
        const nodeEnd = node?.position?.end?.offset;
        const end = typeof nodeEnd === 'number' && nodeEnd > start ? nodeEnd : start + textValue.length;
        return { start, end };
      }
      if (textValue) {
        const foundIndex = displayText.indexOf(textValue);
        if (foundIndex !== -1) {
          const lineStart = displayText.lastIndexOf('\n', foundIndex - 1);
          const start = lineStart === -1 ? 0 : lineStart + 1;
          return { start, end: foundIndex + textValue.length };
        }
      }
      return { start: 0, end: 0 };
    };

    const isPlayingRange = (startIndex: number, endIndex: number) => {
      return (
        playingParagraphStart !== null &&
        playingParagraphMode === 'chapter' &&
        playingParagraphStart >= startIndex &&
        playingParagraphStart < Math.max(endIndex, startIndex + 1)
      );
    };

    const playTextBlock = (startIndex: number, paragraphKey: string) => {
      dispatch(appActions.requestPlayStudyAudioParagraph({
        fullText: displayText,
        startIndex,
        key: paragraphKey
      }));
    };

    const renderBlock = (Tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
      return ({ children, node }: { children?: ReactNode; node?: any }) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const outlineItem = outlineByOffset.get(node?.position?.start?.offset);
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <Tag
            id={outlineItem?.id}
            className="text-viewer-block"
            data-playing={isPlaying ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-outline-id={outlineItem?.id ?? undefined}
            data-paragraph-start={startIndex}
            onClick={(event) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex, paragraphKey);
            }}
          >
            {children}
          </Tag>
        );
      };
    };

    const renderList = (Tag: 'ul' | 'ol') => {
      return ({ children, node, ...props }: any) => {
        const textValue = extractTextFromNode(children ?? '').trim();
        const { start: startIndex, end: endIndex } = resolveTextRange(textValue, node);
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(textValue)}-${startIndex}`
          : '';
        const isPlaying = isPlayingRange(startIndex, endIndex);
        return (
          <div
            className="text-viewer-block text-viewer-list-block"
            data-playing={isPlaying ? 'true' : 'false'}
            data-streamable={textValue ? 'true' : undefined}
            data-paragraph-start={startIndex}
            onClick={(event) => {
              if (!textValue || shouldIgnoreBlockClick(event)) {
                return;
              }
              playTextBlock(startIndex, paragraphKey);
            }}
          >
            <Tag {...props}>{children}</Tag>
          </div>
        );
      };
    };

    return {
      p: renderBlock('p'),
      ul: renderList('ul'),
      ol: renderList('ol'),
      h1: renderBlock('h1'),
      h2: renderBlock('h2'),
      h3: renderBlock('h3'),
      h4: renderBlock('h4'),
      h5: renderBlock('h5'),
      h6: renderBlock('h6')
    };
  }, [
    chapterNumber,
    displayText,
    dispatch,
    outlineByOffset,
    playingParagraphMode,
    playingParagraphStart,
    selectedVersionId
  ]);

  if (tocLoading || !chapterNumber || displayLoading || missingFile || displayError || !displayText) {
    return null;
  }

  return (
    <div className="text-viewer-layout" data-outline-open={outlineOpen ? 'true' : 'false'}>
      {outlineOpen && outlineItems.length > 0 ? (
        <aside className="text-viewer-outline" id="text-viewer-outline" aria-label="Text outline">
          <div className="text-viewer-outline-header">Outline</div>
          <div className="text-viewer-outline-list">
            {outlineItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="text-viewer-outline-item"
                data-level={item.level}
                data-active={activeOutlineId === item.id ? 'true' : 'false'}
                onClick={() => handleOutlineSelect(item.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </aside>
      ) : null}
      <div className="text-viewer-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {displayText}
        </ReactMarkdown>
      </div>
    </div>
  );
}
