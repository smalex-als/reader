import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import type { Element as HastElement } from 'hast';
import {
  extractMarkdownNodeText,
  isMarkdownRangeActive,
  resolveMarkdownTextRange
} from '../src/lib/interactiveMarkdownCore.ts';

test('extracts text from nested React markdown children', () => {
  const node = createElement('strong', null, 'Hello ', createElement('em', null, 'world'));
  assert.equal(extractMarkdownNodeText(node), 'Hello world');
});

test('resolves a markdown block range from typed node offsets', () => {
  const sourceText = 'Heading\n\nParagraph text\n';
  const node = {
    type: 'element',
    tagName: 'p',
    properties: {},
    children: [],
    position: {
      start: { line: 3, column: 1, offset: 9 },
      end: { line: 3, column: 15, offset: 23 }
    }
  } satisfies HastElement;

  assert.deepEqual(resolveMarkdownTextRange(sourceText, 'Paragraph text', node), {
    startIndex: 9,
    endIndex: 23
  });
});

test('falls back to the matching source line when node offsets are unavailable', () => {
  const sourceText = 'Heading\n\nParagraph text\n';
  assert.deepEqual(resolveMarkdownTextRange(sourceText, 'Paragraph text'), {
    startIndex: 9,
    endIndex: 23
  });
});

test('matches active offsets within a markdown block range', () => {
  assert.equal(isMarkdownRangeActive(12, 9, 23), true);
  assert.equal(isMarkdownRangeActive(23, 9, 23), false);
  assert.equal(isMarkdownRangeActive(null, 9, 23), false);
});
