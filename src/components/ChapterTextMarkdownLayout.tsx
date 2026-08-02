import { useEffect, useMemo, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextOutlineItem } from '@/lib/chapterTextOutline';
import { createInteractiveMarkdownComponents } from '@/lib/interactiveMarkdown';
import { remarkLegacyCenteredHtml } from '@/lib/legacyMarkdown';
import { hashText } from '@/lib/textHash';
import { appActions, useAppDispatch } from '@/state/appState';

const CHAPTER_MARKDOWN_BLOCK_TAGS = ['p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

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
    return createInteractiveMarkdownComponents({
      sourceText: displayText,
      activeStart: playingParagraphMode === 'chapter' ? playingParagraphStart : null,
      blockTags: CHAPTER_MARKDOWN_BLOCK_TAGS,
      getBlockAttributes: ({ node }) => {
        const nodeOffset = node?.position?.start.offset;
        const outlineItem = typeof nodeOffset === 'number' ? outlineByOffset.get(nodeOffset) : undefined;
        return {
          id: outlineItem?.id,
          'data-outline-id': outlineItem?.id
        };
      },
      onBlockClick: ({ startIndex, text }) => {
        const paragraphKey = chapterNumber
          ? `chapter-${chapterNumber}-${selectedVersionId}-${hashText(text)}-${startIndex}`
          : '';
        dispatch(appActions.requestPlayStudyAudioParagraph({
          fullText: displayText,
          startIndex,
          key: paragraphKey
        }));
      }
    });
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
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkLegacyCenteredHtml]} components={markdownComponents}>
          {displayText}
        </ReactMarkdown>
      </div>
    </div>
  );
}
