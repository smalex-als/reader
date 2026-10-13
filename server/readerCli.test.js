import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import test from 'node:test';
import { DATA_DIR, ROOT_DIR } from './config.js';
import { createApp } from './index.js';

async function runCli(url, ...args) {
  const child = spawn(process.execPath, ['scripts/reader.js', ...args, '--url', url], {
    cwd: ROOT_DIR, env: { ...process.env, READER_URL: 'http://invalid.test' }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}

test('Reader CLI reads saved chapters through the API', async (t) => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const directory = await fs.mkdtemp(path.join(DATA_DIR, '.cli-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const bookId = path.basename(directory);
  const text = '# Example\n\nПривет, reader!';
  await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify({ type: 'text' }));
  await fs.writeFile(path.join(directory, 'chapter001.txt'), text);
  await fs.writeFile(path.join(directory, 'chapter003.txt'), 'Third chapter\n');
  await fs.writeFile(path.join(directory, 'toc.json'), JSON.stringify([
    { title: 'Example', page: 0 }, { title: 'Third', page: 2 }
  ]));
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;

  const cli = (...args) => runCli(url, ...args);

  assert.deepEqual(await cli('chapters', 'show', bookId, '1'), { code: 0, stdout: text, stderr: '' });
  const json = await cli('chapters', 'show', bookId, '3', '--json');
  assert.equal(json.code, 0);
  assert.deepEqual(JSON.parse(json.stdout), { book: bookId, chapterNumber: 3, text: 'Third chapter\n' });
  assert.equal((await cli('chapters', 'list', bookId)).stdout, '1\tExample\n3\tThird\n');
  const missing = await cli('chapters', 'show', bookId, '2');
  assert.equal(missing.code, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /404.*Chapter text not found/);
  assert.match((await cli('chapters', 'show', `${bookId}-missing`, '1')).stderr, /404.*Book not found/);
  for (const number of ['0', '-1', '1.5', '1abc', '9007199254740992']) {
    assert.equal((await cli('chapters', 'show', bookId, number)).code, 1);
    assert.equal((await fetch(`${url}/api/books/${bookId}/chapters/${number}`)).status, 400);
  }
  assert.equal((await cli('chapters', 'show', bookId)).code, 1);

  // A scanned chapter's file number follows TOC order, not its starting page.
  await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify({ type: 'image' }));
  await Promise.all(Array.from({ length: 6 }, (_, index) =>
    fs.writeFile(path.join(directory, `page${index}.png`), '')));
  await fs.writeFile(path.join(directory, 'toc.json'), JSON.stringify([{ title: 'Example', page: 5 }]));
  assert.equal((await cli('chapters', 'list', bookId)).stdout, '1\tExample\t(page 6)\n');
  assert.equal((await cli('chapters', 'show', bookId, '1')).stdout, text);
  assert.equal((await cli('books', 'list', '--json')).code, 0);
  const prompts = await cli('prompts', 'list');
  assert.equal(prompts.code, 0, prompts.stderr);
  assert.match(prompts.stdout, /^youtube-transcript-summary\tSummarize YouTube Transcript\tgpt-5\.6-sol$/m);
  assert.match(prompts.stdout, /^transcript-cleanup\tClean Transcript\tgpt-5\.6-sol$/m);
  const promptJson = await cli('prompts', 'list', '--json');
  assert.equal(promptJson.code, 0, promptJson.stderr);
  const summary = JSON.parse(promptJson.stdout).prompts.find((prompt) => prompt.id === 'youtube-transcript-summary');
  assert.ok(summary.template.length > 0);
  assert.equal(summary.builtIn, true);
});

test('Reader CLI lists custom prompts and handles empty, invalid, and failed responses', async (t) => {
  let status = 200;
  let payload = { prompts: [{ id: 'custom-prompt', name: 'Мой промпт\nдля главы', model: 'custom-model', template: 'Full\ntext' }] };
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, method: req.method });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/reader/`;
  assert.deepEqual(await runCli(url, 'prompts', 'list'), {
    code: 0, stdout: 'custom-prompt\tМой промпт для главы\tcustom-model\n', stderr: ''
  });
  assert.deepEqual(requests[0], { path: '/reader/api/chapter-text-prompts', method: 'GET' });
  const json = await runCli(url, 'prompts', 'list', '--json');
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), payload);
  payload = { prompts: [] };
  assert.deepEqual(await runCli(url, 'prompts', 'list'), { code: 0, stdout: 'No prompts found.\n', stderr: '' });
  for (const invalid of [{}, { prompts: 'invalid' }, { prompts: [null] }, { prompts: [{ name: 'No ID' }] },
    { prompts: [{ id: 'no-model', name: 'Missing model' }] },
    { prompts: [{ id: 'invalid-model', name: 'Invalid model', model: 42 }] }]) {
    payload = invalid;
    const result = await runCli(url, 'prompts', 'list', '--json');
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unexpected API response/);
  }
  status = 503;
  payload = { error: 'Prompt library unavailable' };
  const failed = await runCli(url, 'prompts', 'list');
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /HTTP 503: Prompt library unavailable/);
  const requestCount = requests.length;
  assert.equal((await runCli(url, 'prompts', 'list', 'extra')).code, 1);
  assert.equal((await runCli(url, 'prompts', 'list', '--title', 'Wrong flag')).code, 1);
  assert.equal(requests.length, requestCount);
});

test('Reader help lists prompt commands and processing models without requiring a server', async () => {
  for (const args of [[], ['help'], ['--help'], ['-h'], ['prompts', 'list', '--help']]) {
    const result = await runCli('http://invalid.test', ...args);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /reader prompts list \[--url URL\] \[--json\]/);
    assert.match(result.stdout, /prompts list\s+List prompt IDs, names, and processing models/);
    assert.match(result.stdout, /npm run reader -- help/);
  }
  for (const args of [['run', '--silent', 'reader'], ['run', '--silent', 'reader', '--', 'help']]) {
    const child = spawn('npm', args, {
      cwd: ROOT_DIR, env: { ...process.env, READER_URL: 'http://invalid.test' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, 0, stderr);
    assert.match(stdout, /reader prompts list/);
    assert.match(stdout, /processing models/);
  }
});

test('Reader CLI waits for the entire YouTube job and reports failures', async (t) => {
  const queued = {
    book: 'test-book', chapterNumber: 4,
    sourceAudioJob: { jobId: 'import-job', status: 'queued' }
  };
  let statuses = [
    { status: 'transcribing', transcriptReady: false },
    { status: 'post-processing', transcriptReady: true },
    { status: 'completed', transcriptReady: true, postProcessVersionId: 'summary-v1' }
  ];
  let statusCode = 200;
  let pollCount = 0;
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, path: req.url, body });
    const isImport = req.method === 'POST' && req.url === '/reader/api/books/test-book/chapters/youtube';
    const isStatus = req.method === 'GET' && req.url === '/reader/api/books/test-book/chapters/4/youtube-audio/status';
    if (!isImport && !isStatus) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(isImport ? 202 : statusCode, { 'Content-Type': 'application/json' });
    if (isImport) {
      res.end(JSON.stringify(queued));
    } else {
      const status = statuses[Math.min(pollCount++, statuses.length - 1)];
      res.end(JSON.stringify(statusCode !== 200 ? { error: 'Status unavailable' } : {
        book: queued.book, chapterNumber: queued.chapterNumber,
        job: status === null ? null : { ...queued.sourceAudioJob, ...status }
      }));
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/reader/`;
  const importArgs = ['chapters', 'import-youtube', 'test-book', 'https://youtu.be/video'];

  const completed = await runCli(url, ...importArgs, '--prompt-id', 'youtube-transcript-summary', '--wait', '--json');
  assert.equal(completed.code, 0, completed.stderr);
  assert.equal(completed.stderr, '');
  assert.equal(pollCount, 3, 'must wait past transcriptReady until post-processing completes');
  assert.deepEqual(JSON.parse(requests[0].body), {
    sourceUrl: 'https://youtu.be/video', postProcessPromptId: 'youtube-transcript-summary'
  });
  const result = JSON.parse(completed.stdout);
  assert.equal(result.chapterNumber, 4);
  assert.equal(result.sourceAudioJob.status, 'completed');
  assert.equal(result.sourceAudioJob.postProcessVersionId, 'summary-v1');
  assert.equal(result.sourceAudioJob.transcriptReady, true);

  pollCount = 0;
  statuses = [{ status: 'completed' }];
  assert.deepEqual(await runCli(url, ...importArgs, '--wait'), {
    code: 0, stdout: 'Chapter 4 in test-book: YouTube import completed.\n', stderr: ''
  });
  pollCount = 0;
  statuses = [{ status: 'failed', error: 'Transcription failed' }];
  const failed = await runCli(url, ...importArgs, '--wait', '--json');
  assert.equal(failed.code, 1);
  assert.equal(failed.stdout, '');
  assert.match(failed.stderr, /YouTube import failed for chapter 4: Transcription failed/);

  for (const invalidStatus of [null, { status: 'unexpected' }, { jobId: 'replacement-job', status: 'completed' }]) {
    pollCount = 0;
    statuses = [invalidStatus];
    const invalid = await runCli(url, ...importArgs, '--wait');
    assert.equal(invalid.code, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /status is missing or invalid|replaced by another job/);
  }
  statusCode = 503;
  const unavailable = await runCli(url, ...importArgs, '--wait');
  assert.equal(unavailable.code, 1);
  assert.equal(unavailable.stdout, '');
  assert.match(unavailable.stderr, /HTTP 503: Status unavailable/);

  pollCount = 0;
  const background = await runCli(url, ...importArgs);
  assert.equal(background.code, 0, background.stderr);
  assert.match(background.stdout, /import queued/);
  assert.equal(pollCount, 0, 'background import must return without polling');
  const requestCount = requests.length;
  assert.equal((await runCli(url, 'prompts', 'list', '--wait')).code, 1);
  assert.equal(requests.length, requestCount);
});
