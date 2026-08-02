import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createInteractiveMarkdownComponents } from '@/lib/interactiveMarkdown';

const UNIT_MARKDOWN_BLOCK_TAGS = ['p', 'ul', 'ol', 'li'] as const;

export default function UnitTopicMarkdown({
  activeParagraphStart,
  playTextBlock,
  text
}: {
  activeParagraphStart: number | null;
  playTextBlock: (startIndex: number) => void;
  text: string;
}) {
  const markdownComponents = useMemo(
    () => createInteractiveMarkdownComponents({
      sourceText: text,
      activeStart: activeParagraphStart,
      blockTags: UNIT_MARKDOWN_BLOCK_TAGS,
      onBlockClick: ({ startIndex }) => playTextBlock(startIndex)
    }),
    [activeParagraphStart, playTextBlock, text]
  );

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
}
