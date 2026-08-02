import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  getTextBrightnessPercentage,
  getTextFontFamilyCssValue,
  normalizeTextFontFamily,
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

test('normalizes stored text font families and falls back for legacy settings', () => {
  assert.equal(normalizeTextFontFamily('source-serif'), 'source-serif');
  assert.equal(normalizeTextFontFamily(undefined), DEFAULT_SETTINGS.textFontFamily);
  assert.equal(normalizeTextFontFamily('unknown-font'), DEFAULT_SETTINGS.textFontFamily);
});

test('maps text font families to bundled CSS font stacks', () => {
  assert.match(getTextFontFamilyCssValue('literata'), /Literata Variable/);
  assert.match(getTextFontFamilyCssValue('source-serif'), /Source Serif 4 Variable/);
  assert.match(getTextFontFamilyCssValue('atkinson'), /Atkinson Hyperlegible Next Variable/);
  assert.match(getTextFontFamilyCssValue('system'), /system-ui/);
});
