import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('YouTube chapter API validates, queues, reports status, and retries imports', async (t) => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const downloaderDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-youtube-api-'));
  const downloader = path.join(downloaderDirectory, 'yt-dlp');
  // Exercise the real asynchronous job path without contacting YouTube or OpenAI.
  await fs.writeFile(downloader, '#!/bin/sh\nprintf "Test downloader failure\\n" >&2\nexit 1\n', { mode: 0o755 });
  process.env.YT_DLP_BIN = downloader;
  process.env.REDIS_URL = '';
  const { createApp } = await import('../server/index.js');
  const dataDirectory = path.join(root, 'data');
  await fs.mkdir(dataDirectory, { recursive: true });
  const directory = await fs.mkdtemp(path.join(dataDirectory, '.youtube-api-test-'));
  const book = path.basename(directory);
  await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify({ type: 'text' }));
  await fs.writeFile(path.join(directory, 'toc.json'), '[]');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
    await fs.rm(downloaderDirectory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const endpoint = `/api/books/${book}/chapters/youtube`;
  const post = (url, body) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  for (const sourceUrl of [undefined, 'not a URL', 'https://example.com/video']) {
    assert.equal((await post(endpoint, { sourceUrl })).status, 400);
  }
  assert.equal((await post(endpoint, {
    sourceUrl: 'https://youtu.be/test-video', postProcessPromptId: 'missing-test-prompt'
  })).status, 400);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['book.json', 'toc.json']);
  assert.equal((await post('/api/books/missing-youtube-api-test/chapters/youtube', {
    sourceUrl: 'https://youtu.be/test-video'
  })).status, 404);

  const response = await post(endpoint, {
    source: 'blank', sourceUrl: ' https://youtu.be/test-video#fragment ', chapterTitle: 'Imported talk'
  });
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.book, book);
  assert.equal(payload.chapterNumber, 1);
  assert.equal(payload.chapterCount, 1);
  assert.equal(payload.chapterTitle, 'Imported talk');
  assert.equal(payload.sourceAudioJob.status, 'queued');
  assert.equal(payload.sourceAudioJob.sourceUrl, 'https://youtu.be/test-video');
  assert.ok(payload.sourceAudioJob.jobId);
  assert.equal(await fs.readFile(path.join(directory, 'chapter001.txt'), 'utf8'), 'https://youtu.be/test-video');

  async function waitForFailure(chapterNumber = 1) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const statusResponse = await fetch(`${base}/api/books/${book}/chapters/${chapterNumber}/youtube-audio/status`);
      assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
      const status = await statusResponse.json();
      if (status.job?.status === 'failed') {
        assert.match(status.job.error, /Test downloader failure/);
        return status.job;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail('Import did not report its download failure');
  }
  await waitForFailure();
  const retryResponse = await post(`/api/books/${book}/chapters/1/youtube-audio/retry`, {});
  assert.equal(retryResponse.status, 202);
  const retry = await retryResponse.json();
  assert.notEqual(retry.job.jobId, payload.sourceAudioJob.jobId);
  assert.equal(retry.job.sourceUrl, payload.sourceAudioJob.sourceUrl);
  await waitForFailure();
  const chapter = await (await fetch(`${base}/api/books/${book}/chapters/1`)).json();
  assert.equal(chapter.text, 'https://youtu.be/test-video');

  async function cli(...args) {
    const child = spawn(process.execPath, ['scripts/reader.js', ...args, '--url', base], {
      cwd: root, env: { ...process.env, READER_URL: 'http://invalid.test' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const [code] = await once(child, 'close');
    return { code, stdout, stderr };
  }
  assert.deepEqual(await cli('chapters', 'import-youtube', book, 'https://youtu.be/cli-video'), {
    code: 0, stdout: `Chapter 2 in ${book}: YouTube import queued.\n`, stderr: ''
  });
  await waitForFailure(2);
  const jsonImport = await cli('chapters', 'import-youtube', book, 'https://youtu.be/another-video',
    '--title', 'CLI chapter', '--json');
  assert.equal(jsonImport.code, 0, jsonImport.stderr);
  const imported = JSON.parse(jsonImport.stdout);
  assert.equal(imported.chapterNumber, 3);
  assert.equal(imported.chapterTitle, 'CLI chapter');
  assert.equal(imported.sourceAudioJob.sourceUrl, 'https://youtu.be/another-video');
  assert.equal(imported.sourceAudioJob.status, 'queued');
  await waitForFailure(3);
  const invalidPrompt = await cli('chapters', 'import-youtube', book, 'https://youtu.be/video',
    '--prompt-id', 'missing-test-prompt');
  assert.equal(invalidPrompt.code, 1);
  assert.match(invalidPrompt.stderr, /400.*post-processing prompt/);
  const invalidUrl = await cli('chapters', 'import-youtube', book, 'https://example.com/video');
  assert.equal(invalidUrl.code, 1);
  assert.equal(invalidUrl.stdout, '');
  assert.match(invalidUrl.stderr, /400.*Only YouTube URLs/);
  assert.equal((await cli('chapters', 'import-youtube', book)).code, 1);
  assert.equal((await cli('chapters', 'import-youtube', book, 'https://youtu.be/video', 'extra')).code, 1);
  assert.equal((await cli('books', 'list', '--title', 'Invalid')).code, 1);
  assert.match((await cli('chapters', 'import-youtube', 'missing-youtube-cli-test',
    'https://youtu.be/video')).stderr, /404.*Book not found/);
});
