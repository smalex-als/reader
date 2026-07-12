import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { DATA_DIR } from '../server/config.js';
import { cleanNemotronTranscript, formatAsrDataPath } from '../server/lib/nemotronAsr.js';

test('formats shared ASR paths relative to the Reader data directory', () => {
  assert.equal(
    formatAsrDataPath(path.join(DATA_DIR, 'book-id', 'chapter001.mp3')),
    'book-id/chapter001.mp3'
  );
  assert.throws(
    () => formatAsrDataPath(path.resolve(DATA_DIR, '..', 'outside.mp3')),
    /must stay inside/
  );
});

test('replaces Nemotron language markers with line breaks', () => {
  assert.equal(
    cleanNemotronTranscript(
      "<en-US> Hello there. <en-US> How are you?\n<ru_RU> Привет."
    ),
    'Hello there.\nHow are you?\nПривет.'
  );
});
