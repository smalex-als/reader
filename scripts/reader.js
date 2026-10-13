#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const help = `Usage:
  reader books list [--url URL] [--json]
  reader prompts list [--url URL] [--json]
  reader chapters list BOOK_ID [--url URL] [--json]
  reader chapters show BOOK_ID CHAPTER_NUMBER [--url URL] [--json]
  reader chapters import-youtube BOOK_ID YOUTUBE_URL [--title TITLE] [--prompt-id ID] [--wait] [--url URL] [--json]
  reader help

Commands:
  books list                 List books
  prompts list               List prompt IDs, names, and processing models
  chapters list              List a book's chapters
  chapters show              Print saved chapter text
  chapters import-youtube    Import a YouTube video as a new chapter

Options:
  --url URL   Reader server (default: READER_URL or http://localhost:3000)
  --json      Print the API response as JSON
  --title     Chapter title for a YouTube import (optional)
  --prompt-id Saved post-processing prompt for a YouTube import (optional)
  --wait      Wait for download, transcription, and optional post-processing
  --help, -h  Show help

Chapters are entries from the book's main table of contents.
The text output shows chapter numbers counting from 1 (and starting pages for scans).
Show prints the saved base chapter text without generating or rewriting it.
Import-youtube starts the import in the background; --wait returns after completion.
Prompts list prints ID, name, and processing model, separated by tabs.
Use prompts list --json to include templates and all prompt settings.
JSON preserves the API's zero-based page indices.
With npm, run: npm run reader -- help (or npm run reader -- --help).`;

async function waitForYouTubeImport(payload, request, showProgress) {
  const endpoint = `api/books/${encodeURIComponent(payload.book)}/chapters/${payload.chapterNumber}/youtube-audio/status`;
  const activeStatuses = new Set(['queued', 'running', 'transcribing', 'post-processing']);
  let previousStatus;
  for (;;) {
    const { job } = await request(endpoint) ?? {};
    if (!job || typeof job.jobId !== 'string' ||
        (!activeStatuses.has(job.status) && job.status !== 'completed' && job.status !== 'failed')) {
      throw new Error('Unexpected API response: YouTube import status is missing or invalid.');
    }
    if (job.jobId !== payload.sourceAudioJob.jobId) {
      throw new Error('YouTube import was replaced by another job.');
    }
    if (job.status === 'failed') {
      throw new Error(`YouTube import failed for chapter ${payload.chapterNumber}: ${job.error || 'Unknown error'}`);
    }
    if (job.status === 'completed') {
      return { ...payload, sourceAudioJob: job };
    }
    if (showProgress && job.status !== previousStatus) {
      console.error(`Chapter ${payload.chapterNumber}: ${job.status}`);
    }
    previousStatus = job.status;
    await delay(1000);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      title: { type: 'string' },
      'prompt-id': { type: 'string' },
      wait: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });
  if (values.help || positionals.length === 0 || positionals[0] === 'help') {
    console.log(help);
    return;
  }

  const [resource, action, bookId, chapter] = positionals;
  const books = resource === 'books' && action === 'list' && positionals.length === 2;
  const prompts = resource === 'prompts' && action === 'list' && positionals.length === 2;
  const chapters = resource === 'chapters' && action === 'list' && positionals.length === 3 && bookId.trim();
  const show = resource === 'chapters' && action === 'show' && positionals.length === 4 && bookId.trim();
  const importYouTube = resource === 'chapters' && action === 'import-youtube' && positionals.length === 4 && bookId.trim();
  if (!books && !prompts && !chapters && !show && !importYouTube) {
    throw new Error('Expected "books list", "prompts list", "chapters list BOOK_ID", "chapters show BOOK_ID CHAPTER_NUMBER", or "chapters import-youtube BOOK_ID YOUTUBE_URL". Use --help for usage.');
  }
  if (!importYouTube && (values.title !== undefined || values['prompt-id'] !== undefined || values.wait)) {
    throw new Error('--title, --prompt-id, and --wait are only supported for chapters import-youtube.');
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
  const endpoint = books ? 'api/books' : prompts ? 'api/chapter-text-prompts' : importYouTube ? `${bookEndpoint}/chapters/youtube` : show ? `${bookEndpoint}/chapters/${chapter}` : `${bookEndpoint}/toc`;
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
  if (prompts) {
    if (!Array.isArray(payload?.prompts) || !payload.prompts.every((prompt) =>
      typeof prompt?.id === 'string' && prompt.id.trim() && typeof prompt.name === 'string' && prompt.name.trim() &&
      typeof prompt.model === 'string' && prompt.model.trim())) {
      throw new Error('Unexpected API response: prompt IDs, names, or models are missing.');
    }
    if (values.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (payload.prompts.length === 0) {
      console.log('No prompts found.');
    } else {
      for (const prompt of payload.prompts) {
        console.log([prompt.id, prompt.name, prompt.model].map((value) => value.replace(/[\r\n\t]/g, ' ')).join('\t'));
      }
    }
    return;
  }
  if (importYouTube) {
    if (typeof payload?.book !== 'string' || !Number.isSafeInteger(payload?.chapterNumber) || payload.chapterNumber < 1 ||
        typeof payload?.sourceAudioJob?.jobId !== 'string' || payload.sourceAudioJob.status !== 'queued') {
      throw new Error('Unexpected API response: YouTube import was not queued.');
    }
    const result = values.wait ? await waitForYouTubeImport(payload, request, !values.json) : payload;
    console.log(values.json ? JSON.stringify(result, null, 2) :
      `Chapter ${result.chapterNumber} in ${result.book}: YouTube import ${values.wait ? 'completed' : 'queued'}.`);
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
