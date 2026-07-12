import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildYouTubeDownloadArgs,
  formatChapterSourceAudioFilename,
  normalizeYouTubeUrl
} from '../server/lib/chapterSourceAudio.js';

test('normalizes supported YouTube URLs and rejects other hosts', () => {
  assert.equal(
    normalizeYouTubeUrl(' https://youtu.be/abc123#fragment '),
    'https://youtu.be/abc123'
  );
  assert.equal(
    normalizeYouTubeUrl('https://www.youtube.com/watch?v=abc123'),
    'https://www.youtube.com/watch?v=abc123'
  );
  assert.throws(() => normalizeYouTubeUrl('https://example.com/video'), /Only YouTube URLs/);
  assert.throws(() => normalizeYouTubeUrl('not a URL'), /Valid YouTube URL/);
});

test('builds a single-video MP3 yt-dlp command without invoking a shell', () => {
  const args = buildYouTubeDownloadArgs({
    sourceUrl: 'https://youtu.be/abc123',
    outputTemplate: '/data/book/chapter001.source-job.download.%(ext)s'
  });

  assert.deepEqual(args.slice(0, 10), [
    '--ignore-config',
    '--no-playlist',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '0',
    '--force-overwrites',
    '--no-progress',
    '--output'
  ]);
  assert.equal(args.at(-2), '/data/book/chapter001.source-job.download.%(ext)s');
  assert.equal(args.at(-1), 'https://youtu.be/abc123');
  assert.equal(formatChapterSourceAudioFilename(7), 'chapter007.mp3');
});
