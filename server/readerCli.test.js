import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { DATA_DIR, ROOT_DIR } from './config.js';
import { createApp } from './index.js';

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

  async function cli(...args) {
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
});
