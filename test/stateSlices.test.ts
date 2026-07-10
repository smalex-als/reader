import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentWorkflowActions,
  initialContentWorkflowState,
  reduceContentWorkflow
} from '../src/state/slices/contentWorkflowSlice.ts';
import {
  initialStreamUiState,
  reduceStreamUiState,
  streamUiActions
} from '../src/state/slices/streamUiSlice.ts';
import { initialUiState, reduceUiState, uiActions } from '../src/state/slices/uiSlice.ts';
import {
  initialStudyWorkflowState,
  reduceStudyWorkflow,
  studyWorkflowActions
} from '../src/state/slices/studyWorkflowSlice.ts';
import {
  createInitialNavigationState,
  navigationActions,
  reduceNavigation
} from '../src/state/slices/navigationSlice.ts';
import {
  createInitialReaderSessionState,
  readerSessionActions,
  reduceReaderSession
} from '../src/state/slices/readerSessionSlice.ts';
import {
  chapterToolsActions,
  initialChapterToolsState,
  reduceChapterTools
} from '../src/state/slices/chapterToolsSlice.ts';
import {
  initialLibraryWorkflowState,
  libraryWorkflowActions,
  reduceLibraryWorkflow
} from '../src/state/slices/libraryWorkflowSlice.ts';

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

test('study workflow slice isolates quiz, vocabulary, and memory-card transitions', () => {
  const loadingQuiz = reduceStudyWorkflow(
    initialStudyWorkflowState,
    studyWorkflowActions.setQuizLoading('chapterQuiz', true)
  );
  assert.equal(loadingQuiz.quizWorkflow.chapterQuiz.loading, true);
  assert.equal(loadingQuiz.quizWorkflow.unitQuiz, initialStudyWorkflowState.quizWorkflow.unitQuiz);

  const withVocabularyError = reduceStudyWorkflow(
    loadingQuiz,
    studyWorkflowActions.setVocabularyError('Unable to load vocabulary')
  );
  assert.equal(withVocabularyError.vocabularyWorkflow.error, 'Unable to load vocabulary');
  assert.equal(withVocabularyError.quizWorkflow, loadingQuiz.quizWorkflow);

  const resetVocabulary = reduceStudyWorkflow(
    withVocabularyError,
    studyWorkflowActions.resetVocabulary()
  );
  assert.deepEqual(resetVocabulary.vocabularyWorkflow, initialStudyWorkflowState.vocabularyWorkflow);
});

test('content workflow slice preserves unrelated domains', () => {
  const loadingSearch = reduceContentWorkflow(
    initialContentWorkflowState,
    contentWorkflowActions.setSearchLoading(true)
  );
  assert.equal(loadingSearch.searchWorkflow.loading, true);
  assert.equal(loadingSearch.pageTextWorkflow, initialContentWorkflowState.pageTextWorkflow);

  const withPageText = reduceContentWorkflow(
    loadingSearch,
    contentWorkflowActions.setPageTextEntry('/data/book/page-1.jpg', {
      text: 'Page text',
      plainText: 'Page text',
      blocks: [],
      source: 'ocr'
    })
  );
  assert.equal(withPageText.pageTextWorkflow.cache['/data/book/page-1.jpg']?.plainText, 'Page text');
  assert.equal(withPageText.searchWorkflow, loadingSearch.searchWorkflow);

  const withPreview = reduceContentWorkflow(
    withPageText,
    contentWorkflowActions.setImagePreviewCachedEnhancedUrl('crop-1', '/data/crop-1-enhanced.jpg')
  );
  assert.equal(withPreview.imagePreviewWorkflow.enhancedUrls['crop-1'], '/data/crop-1-enhanced.jpg');
});

test('navigation slice sequences requests without touching unrelated request domains', () => {
  const initial = createInitialNavigationState();
  const withPageRequest = reduceNavigation(
    initial,
    navigationActions.requestPageNavigation(4)
  );
  assert.deepEqual(withPageRequest.pageNavigationRequest, {
    id: 1,
    kind: 'page',
    pageIndex: 4
  });
  assert.equal(withPageRequest.navigation, initial.navigation);

  const withStreamRequest = reduceNavigation(
    withPageRequest,
    navigationActions.requestStreamVoiceChange('ash')
  );
  assert.deepEqual(withStreamRequest.streamControlRequest, {
    id: 1,
    kind: 'setVoice',
    voice: 'ash'
  });
  assert.equal(withStreamRequest.pageNavigationRequest, withPageRequest.pageNavigationRequest);

  const withNextStreamRequest = reduceNavigation(
    withStreamRequest,
    navigationActions.requestStopAfterCurrentStream()
  );
  assert.deepEqual(withNextStreamRequest.streamControlRequest, {
    id: 2,
    kind: 'stopAfterCurrent'
  });
});

test('reader session slice keeps request counters and workflow domains isolated', () => {
  const initial = createInitialReaderSessionState();
  const withChapterRequest = reduceReaderSession(
    initial,
    readerSessionActions.requestChapterVersionNavigation(7, 'adapted')
  );
  assert.deepEqual(withChapterRequest.chapterVersionNavigationRequest, {
    id: 1,
    chapterNumber: 7,
    versionId: 'adapted'
  });
  assert.equal(withChapterRequest.bookSessionWorkflow, initial.bookSessionWorkflow);

  const withRefresh = reduceReaderSession(withChapterRequest, readerSessionActions.refreshUnits());
  assert.equal(withRefresh.unitWorkflow.refreshToken, 1);
  assert.equal(withRefresh.chapterVersionNavigationRequest, withChapterRequest.chapterVersionNavigationRequest);
});

test('chapter tools slice resets drafts without discarding loaded resources', () => {
  const withPrompt = reduceChapterTools(
    initialChapterToolsState,
    chapterToolsActions.setTextVersionModalCustomPrompt('Simplify this chapter')
  );
  const resetDraft = reduceChapterTools(withPrompt, chapterToolsActions.resetTextVersionModalDraft());
  assert.equal(resetDraft.textVersionModalWorkflow.customPrompt, '');
  assert.equal(resetDraft.tocWorkflow, initialChapterToolsState.tocWorkflow);
});

test('library workflow slice preserves a valid prompt selection and sequences editor loads', () => {
  const prompts = [
    { id: 'brief', name: 'Brief', template: 'Summarize briefly' },
    { id: 'detailed', name: 'Detailed', template: 'Summarize in detail' }
  ];
  const withPrompts = reduceLibraryWorkflow(
    initialLibraryWorkflowState,
    libraryWorkflowActions.setPromptEditorPrompts(prompts, 'detailed')
  );
  assert.equal(withPrompts.promptEditorWorkflow.selectedId, 'detailed');

  const withEditorLoad = reduceLibraryWorkflow(
    withPrompts,
    libraryWorkflowActions.loadBookCardEditor('my-book')
  );
  assert.deepEqual(withEditorLoad.bookCardWorkflow.editor.loadRequest, {
    id: 1,
    bookId: 'my-book'
  });
  assert.equal(withEditorLoad.promptEditorWorkflow, withPrompts.promptEditorWorkflow);
});
