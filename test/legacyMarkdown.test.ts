import assert from 'node:assert/strict';
import test from 'node:test';
import { convertLegacyHtml } from '../src/lib/legacyMarkdown.ts';

test('converts legacy centered html into a plain markdown paragraph', () => {
  const position = { start: { line: 1, column: 1, offset: 0 } };
  const converted = convertLegacyHtml({
    type: 'html',
    value: '<center>Figure 10.1: Leaderboard </center>',
    position
  });

  assert.deepEqual(converted, {
    type: 'paragraph',
    position,
    children: [{ type: 'text', value: 'Figure 10.1: Leaderboard' }]
  });
});

test('leaves unrelated html unchanged', () => {
  const node = { type: 'html', value: '<aside>Note</aside>' };
  assert.equal(convertLegacyHtml(node), node);
});

test('converts simple legacy html tables into markdown table nodes', () => {
  const converted = convertLegacyHtml({
    type: 'html',
    value: '<table><tr><td>Field</td><td>Description</td></tr><tr><td>user_id</td><td>User&#x27;s ID</td></tr></table>'
  });

  assert.deepEqual(converted, {
    type: 'table',
    position: undefined,
    align: [null, null],
    children: [
      {
        type: 'tableRow',
        children: [
          { type: 'tableCell', children: [{ type: 'text', value: 'Field' }] },
          { type: 'tableCell', children: [{ type: 'text', value: 'Description' }] }
        ]
      },
      {
        type: 'tableRow',
        children: [
          { type: 'tableCell', children: [{ type: 'text', value: 'user_id' }] },
          { type: 'tableCell', children: [{ type: 'text', value: "User's ID" }] }
        ]
      }
    ]
  });
});
