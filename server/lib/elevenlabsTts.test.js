import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createElevenLabsTtsClient, splitElevenLabsText } from './elevenlabsTts.js';

const voice = 'elevenlabs_3EuKHIEZbSzrHGNmdYsx';
const audio = (bytes = Buffer.from([1, 2, 3, 4])) => new Response(bytes, {
  headers: { 'Content-Type': 'audio/pcm' }
});

test('streams 24 kHz PCM with server credentials, the model, and case-sensitive voice IDs', async () => {
  const requests = [];
  const client = createElevenLabsTtsClient({ apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, ...options });
      return audio();
    }
  });
  for (const selected of [voice, 'elevenlabs_gJEfHTTiifXEDmO687lC']) {
    assert.deepEqual(await client.generatePcmBuffer({ text: 'Привет!', voice: selected }), Buffer.from([1, 2, 3, 4]));
    const request = requests.at(-1);
    assert.equal(request.url, 'https://api.elevenlabs.io/v1/text-to-dialogue/stream?output_format=pcm_24000');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['xi-api-key'], 'test-key');
    assert.deepEqual(JSON.parse(request.body), {
      inputs: [{ text: 'Привет!', voice_id: selected.slice(11) }], model_id: 'eleven_v4'
    });
  }
});

test('keeps the Text to Speech endpoint when an older model is selected', async () => {
  const client = createElevenLabsTtsClient({ apiKey: 'key', modelId: 'eleven_multilingual_v2',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/3EuKHIEZbSzrHGNmdYsx/stream?output_format=pcm_24000');
      assert.deepEqual(JSON.parse(options.body), { text: 'Привет!', model_id: 'eleven_multilingual_v2' });
      return audio();
    }
  });
  assert.deepEqual(await client.generatePcmBuffer({ text: 'Привет!', voice }), Buffer.from([1, 2, 3, 4]));
});

test('splits long multilingual text without losing characters or breaking surrogate pairs', async () => {
  const text = 'Русский текст. '.repeat(350) + '𐐀'.repeat(2100);
  const chunks = splitElevenLabsText(text);
  assert(chunks.length > 3);
  assert(chunks.every((chunk) => Array.from(chunk).length <= 2000));
  assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert(!chunks.some((chunk) => /[\uD800-\uDFFF]/u.test(chunk.replace(/𐐀/gu, ''))));
  const sent = [];
  const client = createElevenLabsTtsClient({ apiKey: 'key', fetchImpl: async (_url, options) => {
    sent.push(JSON.parse(options.body).inputs[0].text);
    return audio();
  } });
  const pcm = await client.generatePcmBuffer({ text, voice });
  assert.deepEqual(sent, chunks);
  assert.equal(pcm.length, chunks.length * 4);
});

test('starts playback before completion and aligns samples across odd-sized network chunks', async () => {
  let controller;
  const client = createElevenLabsTtsClient({ apiKey: 'key', fetchImpl: async () => new Response(new ReadableStream({
    start(value) { controller = value; }
  }), { headers: { 'Content-Type': 'application/octet-stream' } }) });
  const stream = client.createPcmStream({ text: 'Hello.', voice });
  const iterator = stream[Symbol.asyncIterator]();
  const first = iterator.next();
  // Readable.from starts the request lazily.
  await delay(0);
  controller.enqueue(Buffer.from([1, 2, 3]));
  assert.deepEqual((await first).value, Buffer.from([1, 2]));
  controller.enqueue(Buffer.from([4]));
  controller.close();
  assert.deepEqual((await iterator.next()).value, Buffer.from([3, 4]));
  assert.equal((await iterator.next()).done, true);
});

test('rejects missing credentials, blank text, and malformed voices before an API request', async () => {
  const fetchImpl = async () => assert.fail('Unexpected API request');
  await assert.rejects(createElevenLabsTtsClient({ apiKey: '', fetchImpl }).generatePcmBuffer({ text: 'Hello', voice }),
    (error) => error.status === 503 && /ELEVENLABS_API_KEY/.test(error.message));
  const client = createElevenLabsTtsClient({ apiKey: 'key', fetchImpl });
  await assert.rejects(client.generatePcmBuffer({ text: ' ', voice }), /No text/);
  await assert.rejects(client.generatePcmBuffer({ text: 'Hello', voice: 'elevenlabs_../bad' }), /voice is required/);
});

test('reports provider errors, rate limits, connection failures, and invalid audio', async () => {
  for (const [response, status, message] of [
    [Response.json({ detail: { status: 'quota_exceeded', message: 'Quota exceeded' } }, { status: 401 }), 502, /Quota exceeded/],
    [Response.json({ detail: 'Too many requests' }, { status: 429 }), 429, /Too many requests/],
    [new Response('Gateway error', { status: 502 }), 502, /Request failed \(502\)/],
    [Response.json({ error: 'not audio' }), 502, /unexpected audio format/],
    [new Response('RIFF', { headers: { 'Content-Type': 'audio/wav' } }), 502, /unexpected audio format/],
    [audio(Buffer.alloc(0)), 502, /invalid or empty PCM/],
    [audio(Buffer.from([1, 2, 3])), 502, /invalid or empty PCM/]
  ]) {
    const client = createElevenLabsTtsClient({ apiKey: 'key', fetchImpl: async () => response });
    await assert.rejects(client.generatePcmBuffer({ text: 'Hello', voice }),
      (error) => error.status === status && message.test(error.message));
  }
  const client = createElevenLabsTtsClient({ apiKey: 'key', fetchImpl: async () => { throw new Error('Offline'); } });
  await assert.rejects(client.generatePcmBuffer({ text: 'Hello', voice }), /ElevenLabs TTS generation failed: Offline/);
});

test('honors cancellation and a timeout while reading the response body', async () => {
  let requestSignal;
  const client = createElevenLabsTtsClient({ apiKey: 'key', timeoutMs: 20, fetchImpl: async (_url, { signal }) => {
    requestSignal = signal;
    return new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      }
    }), { headers: { 'Content-Type': 'audio/pcm' } });
  } });
  const timeout = client.generatePcmBuffer({ text: 'Hello', voice });
  const keepAlive = delay(40);
  await assert.rejects(timeout, (error) => error.status === 504);
  assert(requestSignal.aborted);
  await keepAlive;
  const controller = new AbortController();
  const canceled = client.generatePcmBuffer({ text: 'Hello', voice, signal: controller.signal });
  controller.abort();
  await assert.rejects(canceled, { name: 'AbortError' });
});
