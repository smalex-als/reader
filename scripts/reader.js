#!/usr/bin/env node
import { parseArgs } from 'node:util';

const help = `Usage:
  reader books list [--url URL] [--json]
  reader chapters list BOOK_ID [--url URL] [--json]
  reader chapters show BOOK_ID CHAPTER_NUMBER [--url URL] [--json]
  reader chapters import-youtube BOOK_ID YOUTUBE_URL [--title TITLE] [--prompt-id ID] [--url URL] [--json]

Options:
  --url URL   Reader server (default: READER_URL or http://localhost:3000)
  --json      Print the API response as JSON
  --title     Chapter title for a YouTube import (optional)
  --prompt-id Saved post-processing prompt for a YouTube import (optional)
  --help, -h  Show help

Chapters are entries from the book's main table of contents.
The text output shows chapter numbers counting from 1 (and starting pages for scans).
Show prints the saved base chapter text without generating or rewriting it.
Import-youtube creates a chapter and starts the import in the background.
JSON preserves the API's zero-based page indices.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      title: { type: 'string' },
      'prompt-id': { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });
  if (values.help || positionals.length === 0) {
    console.log(help);
    return;
  }

  const [resource, action, bookId, chapter] = positionals;
  const books = resource === 'books' && action === 'list' && positionals.length === 2;
  const chapters = resource === 'chapters' && action === 'list' && positionals.length === 3 && bookId.trim();
  const show = resource === 'chapters' && action === 'show' && positionals.length === 4 && bookId.trim();
  const importYouTube = resource === 'chapters' && action === 'import-youtube' && positionals.length === 4 && bookId.trim();
  if (!books && !chapters && !show && !importYouTube) {
    throw new Error('Expected "books list", "chapters list BOOK_ID", "chapters show BOOK_ID CHAPTER_NUMBER", or "chapters import-youtube BOOK_ID YOUTUBE_URL". Use --help for usage.');
  }
  if (!importYouTube && (values.title !== undefined || values['prompt-id'] !== undefined)) {
    throw new Error('--title and --prompt-id are only supported for chapters import-youtube.');
  }
  if (show && (!/^[1-9]\d*$/.test(chapter) || !Number.isSafeInteger(Number(chapter)))) {
    throw new Error('Chapter number must be a positive integer.');
  }

  const base = new URL(values.url ?? process.env.READER_URL ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash) {
    throw new Error('Server URL must use HTTP or HTTPS without a query or fragment.');
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  const bookEndpoint = `api/books/${encodeURIComponent(bookId)}`;
  const endpoint = books ? 'api/books' : importYouTube ? `${bookEndpoint}/chapters/youtube` : show ? `${bookEndpoint}/chapters/${chapter}` : `${bookEndpoint}/toc`;
  async function request(endpoint, options = {}) {
    let response;
    try {
      response = await fetch(new URL(endpoint, base), {
        ...options,
        headers: { Accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(30_000)
      });
    } catch (error) {
      throw new Error(`Unable to reach Reader at ${base.origin}: ${error.cause?.message || error.message}`);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${payload?.error || response.statusText}`);
    }
    return payload;
  }
  const payload = await request(endpoint, importYouTube ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl: chapter, chapterTitle: values.title, postProcessPromptId: values['prompt-id'] })
  } : {});
  if (importYouTube) {
    if (typeof payload?.book !== 'string' || !Number.isSafeInteger(payload?.chapterNumber) || payload.chapterNumber < 1 ||
        typeof payload?.sourceAudioJob?.jobId !== 'string' || payload.sourceAudioJob.status !== 'queued') {
      throw new Error('Unexpected API response: YouTube import was not queued.');
    }
    console.log(values.json ? JSON.stringify(payload, null, 2) : `Chapter ${payload.chapterNumber} in ${payload.book}: YouTube import queued.`);
    return;
  }
  if (show) {
    if (typeof payload?.text !== 'string') {
      throw new Error('Unexpected API response: chapter text is missing.');
    }
    process.stdout.write(values.json ? `${JSON.stringify(payload, null, 2)}\n` : payload.text);
    return;
  }
  const entries = books ? payload?.books : payload?.toc;
  if (!Array.isArray(entries) || !entries.every((entry) => books
    ? typeof entry === 'string'
    : entry && typeof entry.title === 'string' && Number.isInteger(entry.page) && entry.page >= 0)) {
    throw new Error('Unexpected API response. Check that --url points to the Reader API server.');
  }
  if (values.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (entries.length === 0) {
    console.log(books ? 'No books found.' : 'No chapters in the table of contents.');
  } else {
    const meta = chapters ? await request(`${bookEndpoint}/meta`) : null;
    if (chapters && !['text', 'image'].includes(meta?.bookType)) {
      throw new Error('Unexpected API response: book type is missing.');
    }
    for (const [index, entry] of entries.entries()) {
      if (books) {
        console.log(entry);
      } else {
        const number = meta.bookType === 'text' ? entry.page + 1 : index + 1;
        const page = meta.bookType === 'image' ? `\t(page ${entry.page + 1})` : '';
        console.log(`${number}\t${entry.title.replace(/[\r\n\t]/g, ' ')}${page}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(`reader: ${error.message}`);
  process.exitCode = 1;
});
