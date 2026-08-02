import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const sourcePath = `../src/${specifier.slice(2)}.ts`;
      return nextResolve(new URL(sourcePath, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  }
});

const { createStreamingAudioController } = await import('../src/lib/streamingAudioController.ts');

test('an idle stop does not delay the next streaming session startup', async () => {
  const controller = createStreamingAudioController({
    openPcmStream: async () => {
      throw new Error('The disposed test session must not open a PCM stream');
    },
    callbacks: {
      onStateChange: () => {},
      onSegmentStart: () => {},
      onToast: () => {}
    }
  });
  controller.mount();

  const idleStop = controller.stopStream();
  const start = controller.startStream({
    text: 'First paragraph',
    pageKey: 'chapter::paragraph-start-0'
  });

  assert.equal(controller.getState().status, 'connecting');
  controller.enqueueStream({
    text: 'Second paragraph',
    pageKey: 'chapter::paragraph-start-16'
  });

  controller.dispose();
  await Promise.all([idleStop, start]);
});
