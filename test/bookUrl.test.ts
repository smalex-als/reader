import assert from 'node:assert/strict';
import test from 'node:test';
import { getChapterVersionFromSearch } from '../src/lib/bookUrl.ts';

test('reads the selected chapter version from a refreshed URL', () => {
  assert.equal(
    getChapterVersionFromSearch('?book=tallent-scout&view=text&version=v2'),
    'v2'
  );
});

test('ignores an empty chapter version parameter', () => {
  assert.equal(getChapterVersionFromSearch('?book=tallent-scout&version=%20'), null);
  assert.equal(getChapterVersionFromSearch('?book=tallent-scout'), null);
  assert.equal(getChapterVersionFromSearch('?version=v2'), null);
});
