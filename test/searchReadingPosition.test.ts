import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialReaderSessionState,
  readerSessionActions as actions,
  reduceReaderSession as reduce
} from '../src/state/slices/readerSessionSlice.ts';

function readingBook() {
  return reduce(createInitialReaderSessionState(), actions.setReaderBookId('book-a'));
}

test('search remembers the first location and mode across multiple jumps', () => {
  let state = reduce(readingBook(), actions.setReaderViewMode('text'));
  state = reduce(state, actions.saveSearchReadingPosition());
  const original = state.searchReadingPosition;
  assert.deepEqual(original, { bookId: 'book-a', currentPage: 0, viewMode: 'text' });
  state = reduce(state, actions.setReaderCurrentPage(12));
  state = reduce(state, actions.setReaderViewMode('pages'));
  state = reduce(state, actions.saveSearchReadingPosition());
  assert.equal(state.searchReadingPosition, original);
});

test('switching books clears the return point; selecting the same book preserves it', () => {
  const saved = reduce(readingBook(), actions.saveSearchReadingPosition());
  assert.equal(reduce(saved, actions.setReaderBookId('book-a')).searchReadingPosition, saved.searchReadingPosition);
  assert.equal(reduce(saved, actions.setReaderBookId('book-b')).searchReadingPosition, null);
  assert.equal(reduce(saved, actions.setReaderBookId(null)).searchReadingPosition, null);
});

test('keeping the new location allows the next search to capture a fresh return point', () => {
  let state = reduce(readingBook(), actions.saveSearchReadingPosition());
  state = reduce(state, actions.setReaderCurrentPage(12));
  state = reduce(state, actions.clearSearchReadingPosition());
  assert.equal(state.readerSession.currentPage, 12);
  assert.equal(state.searchReadingPosition, null);
  state = reduce(state, actions.saveSearchReadingPosition());
  assert.equal(state.searchReadingPosition?.currentPage, 12);
});

test('no book means no return point', () => {
  const state = reduce(createInitialReaderSessionState(), actions.saveSearchReadingPosition());
  assert.equal(state.searchReadingPosition, null);
});
