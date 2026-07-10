import assert from 'node:assert/strict';
import test from 'node:test';
import { createSelectorStore } from '../src/state/createSelectorStore.ts';

test('selector store skips identity-equal updates', () => {
  const initialState = { count: 0 };
  const store = createSelectorStore(initialState);
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.setState(initialState);
  assert.equal(notifications, 0);

  store.setState((state) => ({ ...state, count: state.count + 1 }));
  assert.equal(notifications, 1);
  assert.deepEqual(store.getState(), { count: 1 });

  unsubscribe();
  store.setState({ count: 2 });
  assert.equal(notifications, 1);
});
