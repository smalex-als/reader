import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { DATA_DIR } from '../server/config.js';
import {
  buildYouTubeDownloadArgs,
  extractYouTubeVideoTitle,
  formatChapterSourceAudioFilename,
  getYouTubeAudioDownload,
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
  assert.equal(args.at(-4), '/data/book/chapter001.source-job.download.%(ext)s');
  assert.equal(args.at(-3), '--print');
  assert.equal(args.at(-2), 'after_move:%(title)s');
  assert.equal(args.at(-1), 'https://youtu.be/abc123');
  assert.equal(formatChapterSourceAudioFilename(7), 'chapter007.mp3');
});

test('extracts the final YouTube title from yt-dlp output', () => {
  assert.equal(
    extractYouTubeVideoTitle('download message\nThis type of training CHANGED everything for me.\n'),
    'This type of training CHANGED everything for me.'
  );
});

test('migrates completed source audio into the playable base chapter filename', async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const directory = await fs.mkdtemp(path.join(DATA_DIR, '.youtube-import-test-'));
  const bookId = path.basename(directory);
  try {
    await fs.writeFile(path.join(directory, 'chapter001.source.mp3'), Buffer.from('fake mp3'));
    await fs.writeFile(path.join(directory, 'chapter001.source.json'), JSON.stringify({
      source: 'youtube',
      sourceUrl: 'https://youtu.be/abc123',
      jobId: 'legacy-job',
      status: 'completed'
    }));

    const status = await getYouTubeAudioDownload({ bookId, chapterNumber: 1 });

    assert.equal(status?.status, 'completed');
    assert.equal(status?.audioUrl, `/data/${bookId}/chapter001.mp3`);
    assert.equal((await fs.stat(path.join(directory, 'chapter001.mp3'))).isFile(), true);
    await assert.rejects(fs.stat(path.join(directory, 'chapter001.source.mp3')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(directory, 'chapter001.source.json')), { code: 'ENOENT' });
    assert.equal((await fs.stat(path.join(directory, 'chapter001.youtube.json'))).isFile(), true);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
