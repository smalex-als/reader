#!/usr/bin/env node
import { parseArgs } from 'node:util';

const help = `Usage:
  reader books list [--url URL] [--json]
  reader chapters list BOOK_ID [--url URL] [--json]

Options:
  --url URL   Reader server (default: READER_URL or http://localhost:3000)
  --json      Print the API response as JSON
  --help, -h  Show help

Chapters are entries from the book's main table of contents.
The text output shows the starting page/chapter number, counting from 1.
JSON preserves the API's zero-based page indices.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  });
  if (values.help || positionals.length === 0) {
    console.log(help);
    return;
  }

  const [resource, action, bookId] = positionals;
  const books = resource === 'books' && action === 'list' && positionals.length === 2;
  const chapters = resource === 'chapters' && action === 'list' && positionals.length === 3 && bookId.trim();
  if (!books && !chapters) {
    throw new Error('Expected "books list" or "chapters list BOOK_ID". Use --help for usage.');
  }

  const base = new URL(values.url ?? process.env.READER_URL ?? 'http://localhost:3000');
  if (!['http:', 'https:'].includes(base.protocol) || base.search || base.hash) {
    throw new Error('Server URL must use HTTP or HTTPS without a query or fragment.');
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  const endpoint = books ? 'api/books' : `api/books/${encodeURIComponent(bookId)}/toc`;
  let response;
  try {
    response = await fetch(new URL(endpoint, base), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new Error(`Unable to reach Reader at ${base.origin}: ${error.message}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${payload?.error || response.statusText}`);
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
    for (const entry of entries) {
      console.log(books ? entry : `${entry.page + 1}\t${entry.title.replace(/[\r\n\t]/g, ' ')}`);
    }
  }
}

main().catch((error) => {
  console.error(`reader: ${error.message}`);
  process.exitCode = 1;
});
