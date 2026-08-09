import assert from 'node:assert/strict';
import test from 'node:test';
import { formatVoiceBadgeLabel, resolveVoiceCommandId } from '../src/lib/streamVoiceCommands.ts';

const OPTIONS = [
  { id: 'en-Mike_man', label: 'Mike', provider: 'streaming' as const },
  { id: 'en-Sara_woman', label: 'Sara', provider: 'streaming' as const },
  { id: 'alloy', label: 'Alloy', provider: 'openai' as const }
];

test('matches a full voice id exactly', () => {
  assert.equal(resolveVoiceCommandId('en-Sara_woman', OPTIONS), 'en-Sara_woman');
});

test('matches a voice id and label case-insensitively', () => {
  assert.equal(resolveVoiceCommandId('EN-SARA_WOMAN', OPTIONS), 'en-Sara_woman');
  assert.equal(resolveVoiceCommandId('sara', OPTIONS), 'en-Sara_woman');
});

test('matches the bare name inside a locale-prefixed id', () => {
  assert.equal(resolveVoiceCommandId('mike', OPTIONS), 'en-Mike_man');
});

test('returns null for an unknown voice so the current one is kept', () => {
  assert.equal(resolveVoiceCommandId('nobody', OPTIONS), null);
  assert.equal(resolveVoiceCommandId('', OPTIONS), null);
  assert.equal(resolveVoiceCommandId(null, OPTIONS), null);
});

test('falls back to the written name before the voice list has loaded', () => {
  assert.equal(resolveVoiceCommandId('sara', []), 'sara');
});

test('the badge label keeps only the leading name', () => {
  assert.equal(formatVoiceBadgeLabel('Emma - woman'), 'Emma');
  assert.equal(formatVoiceBadgeLabel('Carter - man'), 'Carter');
  assert.equal(formatVoiceBadgeLabel('Sara'), 'Sara');
});

test('the badge label keeps hyphenated names intact', () => {
  assert.equal(formatVoiceBadgeLabel('Anne-Marie - woman'), 'Anne-Marie');
});

test('the badge label tolerates stray separators and spacing', () => {
  assert.equal(formatVoiceBadgeLabel('  Emma-  woman '), 'Emma');
  assert.equal(formatVoiceBadgeLabel('- woman'), '- woman');
});
