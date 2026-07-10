import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialStreamUiState,
  reduceStreamUiState,
  streamUiActions
} from '../src/state/slices/streamUiSlice.ts';
import { initialUiState, reduceUiState, uiActions } from '../src/state/slices/uiSlice.ts';

test('UI slice owns modal and editor transitions', () => {
  const withSettingsOpen = reduceUiState(initialUiState, uiActions.openModal('settings'));
  assert.equal(withSettingsOpen.modals.settings, true);
  assert.equal(initialUiState.modals.settings, false);

  const withEditorChapter = reduceUiState(
    withSettingsOpen,
    uiActions.setEditorChapterNumber(12)
  );
  assert.equal(withEditorChapter.editor.chapterNumber, 12);
  assert.equal(withEditorChapter.modals, withSettingsOpen.modals);
});

test('stream UI slice updates independently from runtime playback state', () => {
  const withoutAutoFollow = reduceStreamUiState(
    initialStreamUiState,
    streamUiActions.toggleAutoFollowStream()
  );
  assert.equal(withoutAutoFollow.autoFollowStream, false);

  const withSelectedBlock = reduceStreamUiState(
    withoutAutoFollow,
    streamUiActions.setSelectedStreamBlockKey('page::block')
  );
  assert.equal(withSelectedBlock.selectedStreamBlockKey, 'page::block');
  assert.equal(withSelectedBlock.playbackRate, 1);
});
