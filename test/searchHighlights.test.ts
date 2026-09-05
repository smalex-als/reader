import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSearchHighlights } from '../src/lib/searchHighlights.ts';

test('highlights query words case-insensitively without changing snippet text', () => {
  const text = 'The Moon and sun. MOON!';
  const parts = splitSearchHighlights(text, 'moon sun');
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['Moon', 'sun', 'MOON']);
  assert.equal(parts.map((part) => part.text).join(''), text);
});

test('uses complete search tokens, including apostrophes and hyphens', () => {
  const parts = splitSearchHighlights("Cat scatter cat-like don't DON’T", "cat don't");
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['Cat', "don't"]);
});

test('punctuation and HTML stay plain text and an empty query produces no highlights', () => {
  const text = '<script>alert(1)</script> [moon] (sun)';
  assert.deepEqual(splitSearchHighlights(text, ''), [{ text, match: false }]);
  const parts = splitSearchHighlights(text, '[moon] (sun)');
  assert.deepEqual(parts.filter((part) => part.match).map((part) => part.text), ['moon', 'sun']);
  assert.equal(parts.map((part) => part.text).join(''), text);
});
