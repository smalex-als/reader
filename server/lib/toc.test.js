import test from 'node:test';
import assert from 'node:assert/strict';
import { stripOcrCoordinates } from './toc.js';

test('strips OCR coordinate blocks from TOC page text', () => {
  const input = [
    '<|ref|>title<|/ref|><|det|>[[253, 143, 739, 348]]<|/det|>',
    '# Strength Band Training',
    '<|ref|>text<|/ref|><|det|>[[352, 364, 643, 385]]<|/det|>',
    'SECOND EDITION'
  ].join(' ');

  const output = stripOcrCoordinates(input).replace(/\s+/g, ' ').trim();

  assert.equal(
    output,
    '<|ref|>title<|/ref|> # Strength Band Training <|ref|>text<|/ref|> SECOND EDITION'
  );
  assert.equal(output.includes('[[253, 143, 739, 348]]'), false);
});

test('leaves plain OCR text unchanged', () => {
  assert.equal(stripOcrCoordinates('Plain OCR text.'), 'Plain OCR text.');
});
