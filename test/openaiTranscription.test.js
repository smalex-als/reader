import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTranscriptionChunkArgs,
  cleanTranscriptionText,
  extractOpenAITranscriptionText,
  OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTION_SAFE_FILE_BYTES
} from '../server/lib/openaiTranscription.js';

test('uses the requested OpenAI transcription model and stays below the upload limit', () => {
  assert.equal(OPENAI_TRANSCRIPTION_MODEL, 'gpt-transcribe');
  assert.ok(OPENAI_TRANSCRIPTION_SAFE_FILE_BYTES < 25 * 1024 * 1024);
});

test('cleans language markers and spacing from transcription text', () => {
  assert.equal(
    cleanTranscriptionText('Hello there. <en-US>  How are you?\n<en-US>Fine.'),
    'Hello there.\nHow are you?\nFine.'
  );
});

test('builds ffmpeg arguments for small mono transcription chunks', () => {
  const args = buildTranscriptionChunkArgs({
    audioPath: '/data/book/chapter001.mp3',
    outputPattern: '/tmp/chunk-%04d.mp3'
  });

  assert.deepEqual(args.slice(0, 7), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    '/data/book/chapter001.mp3',
    '-map'
  ]);
  assert.equal(args.at(-1), '/tmp/chunk-%04d.mp3');
  assert.ok(args.includes('-segment_time'));
  assert.ok(args.includes('64k'));
});

test('extracts text from OpenAI transcription responses', () => {
  assert.equal(extractOpenAITranscriptionText({ text: '  chapter text  ' }), 'chapter text');
  assert.equal(extractOpenAITranscriptionText('  direct text  '), 'direct text');
  assert.equal(extractOpenAITranscriptionText({}), '');
});
