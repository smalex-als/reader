import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  getTextBrightnessPercentage,
  normalizeTextBrightness
} from '../src/lib/appConstants.ts';

test('normalizes text brightness to one of seven supported levels', () => {
  assert.equal(normalizeTextBrightness(0), 1);
  assert.equal(normalizeTextBrightness(3.4), 3);
  assert.equal(normalizeTextBrightness(8), 7);
  assert.equal(normalizeTextBrightness(Number.NaN), DEFAULT_SETTINGS.textBrightness);
});

test('maps text brightness levels to a monotonic opacity scale', () => {
  const percentages = [1, 2, 3, 4, 5, 6, 7].map(getTextBrightnessPercentage);
  assert.deepEqual(percentages, [50, 58, 66, 75, 84, 92, 100]);
});
