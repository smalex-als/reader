import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChapterGenerationModel } from './chapters.js';

test('accepts supported chapter generation models', () => {
  assert.equal(normalizeChapterGenerationModel('gpt-5.6-sol'), 'gpt-5.6-sol');
  assert.equal(normalizeChapterGenerationModel('gpt-5.6-terra'), 'gpt-5.6-terra');
  assert.equal(normalizeChapterGenerationModel('gpt-5.6-luna'), 'gpt-5.6-luna');
});

test('falls back to sol for missing or unsupported chapter generation models', () => {
  assert.equal(normalizeChapterGenerationModel(undefined), 'gpt-5.6-sol');
  assert.equal(normalizeChapterGenerationModel('unsupported-model'), 'gpt-5.6-sol');
});
