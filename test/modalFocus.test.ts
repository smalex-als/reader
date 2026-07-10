import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrappedFocusIndex } from '../src/lib/modalFocus.ts';

test('cycles focus forward and backward inside a modal', () => {
  assert.equal(resolveTrappedFocusIndex(0, 3, false), 1);
  assert.equal(resolveTrappedFocusIndex(2, 3, false), 0);
  assert.equal(resolveTrappedFocusIndex(0, 3, true), 2);
});

test('chooses an edge when focus starts outside the modal', () => {
  assert.equal(resolveTrappedFocusIndex(-1, 3, false), 0);
  assert.equal(resolveTrappedFocusIndex(-1, 3, true), 2);
  assert.equal(resolveTrappedFocusIndex(-1, 0, false), -1);
});
