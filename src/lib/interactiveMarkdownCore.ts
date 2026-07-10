import { isValidElement, type ReactNode } from 'react';
import type { Element as HastElement } from 'hast';

export function extractMarkdownNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractMarkdownNodeText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractMarkdownNodeText(node.props.children);
  }
  return '';
}

export function resolveMarkdownTextRange(
  sourceText: string,
  textValue: string,
  node?: HastElement
) {
  if (!sourceText) {
    return { startIndex: 0, endIndex: 0 };
  }
  const nodeOffset = node?.position?.start.offset;
  if (typeof nodeOffset === 'number') {
    const startIndex = Math.max(0, sourceText.lastIndexOf('\n', nodeOffset - 1) + 1);
    const nodeEnd = node?.position?.end.offset;
    const endIndex =
      typeof nodeEnd === 'number' && nodeEnd > startIndex
        ? nodeEnd
        : startIndex + textValue.length;
    return { startIndex, endIndex };
  }
  if (textValue) {
    const foundIndex = sourceText.indexOf(textValue);
    if (foundIndex !== -1) {
      return {
        startIndex: Math.max(0, sourceText.lastIndexOf('\n', foundIndex - 1) + 1),
        endIndex: foundIndex + textValue.length
      };
    }
  }
  return { startIndex: 0, endIndex: 0 };
}

export function isMarkdownRangeActive(
  activeStart: number | null,
  startIndex: number,
  endIndex: number
) {
  return (
    activeStart !== null &&
    activeStart >= startIndex &&
    activeStart < Math.max(endIndex, startIndex + 1)
  );
}
