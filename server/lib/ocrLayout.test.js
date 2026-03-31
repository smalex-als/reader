import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlainTextFromOcrLayout } from './ocrLayout.js';

test('extracts plain text from OCR layout blocks', () => {
  const input = [
    '<|ref|>sub_title<|/ref|><|det|>[[191, 92, 686, 177]]<|/det|>',
    'Storage',
    '',
    '<|ref|>text<|/ref|><|det|>[[10, 10, 20, 20]]<|/det|>',
    'Keep replicas in two zones.'
  ].join('\n');

  const output = extractPlainTextFromOcrLayout(input);

  assert.equal(output, 'Storage.\n\nKeep replicas in two zones.');
});

test('skips OCR blocks excluded from speech', () => {
  const input = [
    '<|ref|>text<|/ref|><|det|>[[1, 2, 3, 4]]<|/det|>',
    'Visible text.',
    '',
    '<|ref|>text<|/ref|><|det|>[[5, 6, 7, 8]]<|/det|>',
    '<|speech_removed|><|/speech_removed|>',
    'Hidden text.'
  ].join('\n');

  const output = extractPlainTextFromOcrLayout(input);

  assert.equal(output, 'Visible text.');
});

test('returns raw text when no OCR layout markers are present', () => {
  const input = 'Plain OCR output without layout markers.';

  const output = extractPlainTextFromOcrLayout(input);

  assert.equal(output, input);
});
