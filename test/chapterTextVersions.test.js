import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTextIntoChunks } from '../server/lib/chapterTextVersions.js';

test('keeps short text in a single chunk', () => {
  assert.deepEqual(splitTextIntoChunks('  Short text.  ', 100), ['Short text.']);
});

test('groups paragraphs into chunks under the limit', () => {
  const paragraph = 'a'.repeat(40);
  const chunks = splitTextIntoChunks([paragraph, paragraph, paragraph].join('\n\n'), 90);
  assert.deepEqual(chunks, [`${paragraph}\n\n${paragraph}`, paragraph]);
});

test('splits a long transcript without paragraph breaks at sentence boundaries', () => {
  const sentence = 'This is one spoken sentence.';
  const text = Array.from({ length: 200 }, () => sentence).join(' ');
  const chunks = splitTextIntoChunks(text, 500);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 500);
    assert.ok(chunk.endsWith('.'));
  }
  assert.equal(chunks.join(' '), text);
});

test('hard-splits text that has no sentence or word boundaries', () => {
  const chunks = splitTextIntoChunks('x'.repeat(250), 100);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [100, 100, 50]);
});
