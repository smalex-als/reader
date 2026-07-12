import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeOutlineTitle,
  parseTextOutline
} from '../src/lib/chapterTextOutline.ts';

test('normalizes markdown formatting in outline titles', () => {
  assert.equal(normalizeOutlineTitle('**Smart Screening**'), 'Smart Screening');
  assert.equal(
    normalizeOutlineTitle('**0\\. Global Summary — [Employer Previews](https://example.com)**'),
    '0. Global Summary — Employer Previews'
  );
  assert.equal(
    normalizeOutlineTitle('### **Rules** (`global_policy`) \\*literal\\*'),
    'Rules (global_policy) *literal*'
  );
});

test('parses markdown headings into plain outline titles', () => {
  const outline = parseTextOutline([
    '# **Smart Screening**',
    '',
    '## **Rules — Multi-Country Rules Edge Cases**',
    '',
    '### **0\\. Global Summary**'
  ].join('\n'));

  assert.deepEqual(
    outline.map(({ title, level }) => ({ title, level })),
    [
      { title: 'Smart Screening', level: 1 },
      { title: 'Rules — Multi-Country Rules Edge Cases', level: 2 },
      { title: '0. Global Summary', level: 3 }
    ]
  );
});
