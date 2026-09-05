import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentWorkflowActions as actions,
  initialContentWorkflowState as initial,
  reduceContentWorkflow as reduce
} from '../src/state/slices/contentWorkflowSlice.ts';

test('typing is idle; only a successful submitted search can produce an empty result state', () => {
  const typed = reduce(initial, actions.setSearchQuery('moon'));
  assert.equal(typed.searchWorkflow.status, 'idle');
  assert.equal(typed.searchWorkflow.submittedQuery, '');
  const loading = reduce(typed, actions.startSearch(' moon ', 1));
  assert.equal(loading.searchWorkflow.status, 'loading');
  assert.equal(loading.searchWorkflow.submittedQuery, 'moon');
  const empty = reduce(loading, actions.completeSearch([], 1));
  assert.equal(empty.searchWorkflow.status, 'success');
  assert.deepEqual(empty.searchWorkflow.results, []);
  const editing = reduce(empty, actions.setSearchQuery('sun'));
  assert.equal(editing.searchWorkflow.status, 'idle');
  assert.equal(editing.searchWorkflow.submittedQuery, '');
});

test('failure stays distinct from no matches and retry can recover', () => {
  const failed = reduce(reduce(initial, actions.startSearch('moon', 2)), actions.failSearch(2));
  assert.equal(failed.searchWorkflow.status, 'error');
  assert.equal(failed.searchWorkflow.submittedQuery, 'moon');
  const retry = reduce(failed, actions.startSearch(failed.searchWorkflow.submittedQuery, 3));
  assert.equal(retry.searchWorkflow.status, 'loading');
  const recovered = reduce(retry, actions.completeSearch([], 3));
  assert.equal(recovered.searchWorkflow.status, 'success');
});

test('editing or clearing a query ignores its pending response', () => {
  const loading = reduce(initial, actions.startSearch('moon', 4));
  for (const query of ['sun', '']) {
    const edited = reduce(loading, actions.setSearchQuery(query));
    assert.equal(edited.searchWorkflow.status, 'idle');
    assert.equal(reduce(edited, actions.completeSearch([], 4)), edited);
    assert.equal(reduce(edited, actions.failSearch(4)), edited);
  }
});

test('responses from an older search or book cannot overwrite the current state', () => {
  const older = reduce(initial, actions.startSearch('moon', 5));
  const newer = reduce(older, actions.startSearch('sun', 6));
  assert.equal(reduce(newer, actions.completeSearch([], 5)), newer);
  assert.equal(reduce(newer, actions.failSearch(5)), newer);
  const reset = reduce(newer, actions.resetSearch());
  assert.equal(reduce(reset, actions.completeSearch([], 6)), reset);
  assert.equal(reduce(reset, actions.failSearch(6)), reset);
});
