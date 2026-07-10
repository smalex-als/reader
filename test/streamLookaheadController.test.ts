import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StreamLookaheadController,
  type StreamLookaheadEnvironment
} from '../src/lib/streamLookaheadController.ts';

function createEnvironment(enqueued: string[]): StreamLookaheadEnvironment<string> {
  const manifest = ['page-0', 'page-1', 'page-2', 'page-3'];
  return {
    manifest,
    isRunCurrent: (runId) => runId === 1,
    getPageText: (imageUrl) => imageUrl,
    getPageSegments: (pageText, imageUrl, pageIndex) => [{
      text: pageText,
      pageKey: `${imageUrl}::block`,
      pageIndex
    }],
    getImageUrlFromPageKey: (pageKey) => pageKey.split('::')[0] || null,
    enqueue: (segment, voice) => {
      enqueued.push(`${voice}:${segment.pageKey}`);
    }
  };
}

test('paragraph lookahead enqueues only the configured number of segments', () => {
  const enqueued: string[] = [];
  const controller = new StreamLookaheadController<string>(2, 2);
  const environment = createEnvironment(enqueued);
  controller.startParagraph({
    runId: 1,
    voice: 'voice-a',
    pendingSegments: [
      { text: 'one', pageKey: 'paragraph-1' },
      { text: 'two', pageKey: 'paragraph-2' },
      { text: 'three', pageKey: 'paragraph-3' }
    ],
    lastActivePageKey: 'paragraph-0'
  });

  controller.fillParagraph(1, environment);
  assert.deepEqual(enqueued, ['voice-a:paragraph-1', 'voice-a:paragraph-2']);

  controller.handleSegmentStart('paragraph-1', environment);
  assert.deepEqual(enqueued, [
    'voice-a:paragraph-1',
    'voice-a:paragraph-2',
    'voice-a:paragraph-3'
  ]);
});

test('scroll lookahead refills one page when playback crosses a page boundary', () => {
  const enqueued: string[] = [];
  const controller = new StreamLookaheadController<string>(2, 2);
  const environment = createEnvironment(enqueued);
  controller.startScroll({
    runId: 1,
    voice: 'voice-a',
    nextPageIndex: 1,
    pendingSegments: [{ text: 'remaining', pageKey: 'page-0::remaining', pageIndex: 0 }],
    lastActivePageIndex: 0
  });

  controller.fillScroll(1, environment);
  assert.deepEqual(enqueued, [
    'voice-a:page-0::remaining',
    'voice-a:page-1::block',
    'voice-a:page-2::block'
  ]);

  controller.handleSegmentStart('page-1::block', environment);
  assert.equal(enqueued.at(-1), 'voice-a:page-3::block');
});

test('study-mode suppression discards pending lookahead work', () => {
  const enqueued: string[] = [];
  const controller = new StreamLookaheadController<string>();
  const environment = createEnvironment(enqueued);
  controller.startParagraph({
    runId: 1,
    voice: 'voice-a',
    pendingSegments: [{ text: 'one', pageKey: 'paragraph-1' }],
    lastActivePageKey: null
  });
  controller.suppressForStudy(environment.manifest.length);
  controller.fillParagraph(1, environment);
  assert.deepEqual(enqueued, []);
});
