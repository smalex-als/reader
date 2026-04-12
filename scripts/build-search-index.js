#!/usr/bin/env node

import { buildBookSearchIndex } from '../server/lib/search.js';
import { listBooks } from '../server/lib/books.js';

async function main() {
  const target = process.argv[2];
  const books = target && target !== '--all' ? [target] : await listBooks();

  for (const bookId of books) {
    const index = await buildBookSearchIndex(bookId);
    // eslint-disable-next-line no-console
    console.log(`Indexed ${bookId}: ${index.documents.length} documents`);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
