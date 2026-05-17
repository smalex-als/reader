import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTextForStreaming } from './streamAudioText.js';

test('secondary stream splitting preserves word boundaries with collapsed whitespace', () => {
  const input = Array.from({ length: 180 }, (_, index) => `word${index}`).join('  \n');

  const chunks = splitTextForStreaming(input);
  const normalizedInput = input.split(/\s+/).filter(Boolean).join(' ');
  const normalizedOutput = chunks.join(' ').split(/\s+/).filter(Boolean).join(' ');

  assert.ok(chunks.length > 1);
  assert.equal(normalizedOutput, normalizedInput);
  assert.ok(chunks.every((chunk) => /^word\d+/.test(chunk)));
});
