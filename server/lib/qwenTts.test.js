import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createQwenTtsClient, splitQwenText } from './qwenTts.js';

const voice = 'qwen_voice_Alexey.pt';
const catalog = { voices: [{ id: 'voice_Alexey.pt', name: 'Alexey' }], max_text_length: 3000 };
const json = (body, status = 200) => Response.json(body, { status });

// Stereo 48 kHz input with an optional JUNK chunk. Reader must decode the WAV
// container and resample, rather than stripping a fixed 44-byte header.
function wavFixture() {
  const frames = 4800;
  const wav = Buffer.alloc(56 + frames * 4);
  wav.write('RIFF');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(192000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('JUNK', 36);
  wav.writeUInt32LE(4, 40);
  wav.write('data', 48);
  wav.writeUInt32LE(frames * 4, 52);
  for (let frame = 0; frame < frames; frame += 1) {
    const sample = Math.round(Math.sin(frame / 20) * 10000);
    wav.writeInt16LE(sample, 56 + frame * 4);
    wav.writeInt16LE(sample, 58 + frame * 4);
  }
  return wav;
}
const audio = () => new Response(wavFixture(), { headers: { 'Content-Type': 'audio/wav' } });

test('splits paragraphs and long words without losing Russian or Unicode characters', () => {
  const paragraph = 'Первое предложение. Второе предложение. '.repeat(130).trim();
  const text = `${paragraph}\n\n${'😀'.repeat(3001)}\n\nКонец.`;
  const chunks = splitQwenText(text);
  assert(chunks.length > 3);
  assert(chunks.every((chunk) => Array.from(chunk).length <= 3000 && chunk.trim()));
  assert.equal(chunks.join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
  assert(!chunks.some((chunk) => /[\uD800-\uDFFF]/u.test(chunk.replace(/😀/gu, ''))));
  assert.deepEqual(splitQwenText(''), []);
});

test('loads live voice names and sends exact case-sensitive IDs as JSON; decodes and resamples WAV', async () => {
  const requests = [];
  const client = createQwenTtsClient({ fetchImpl: async (url, options) => {
    if (url.endsWith('/api/voices')) return json(catalog);
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return audio();
  } });
  assert.deepEqual(await client.getVoices(), { voices: catalog.voices, maxTextLength: 3000 });
  const pcm = await client.generatePcmBuffer({ text: 'Привет!\n\nПроверка.', voice });
  assert.deepEqual(requests.map((request) => request.body), [
    { voice: 'voice_Alexey.pt', text: 'Привет!' }, { voice: 'voice_Alexey.pt', text: 'Проверка.' }
  ]);
  assert.equal(requests[0].headers['Content-Type'], 'application/json');
  assert.equal(pcm.length, 2 * 2400 * 2); // 2 x 0.1 s, 24 kHz, mono, 16 bits
  assert(pcm.some((byte) => byte !== 0));
});

test('honors max_text_length from the current catalog', async () => {
  const chunks = [];
  const client = createQwenTtsClient({ fetchImpl: async (url, options) => {
    if (url.endsWith('/api/voices')) return json({ ...catalog, max_text_length: 8 });
    chunks.push(JSON.parse(options.body).text);
    return audio();
  } });
  await client.generatePcmBuffer({ text: 'Длинный текст без абзацев.', voice });
  assert(chunks.length > 1);
  assert(chunks.every((chunk) => Array.from(chunk).length <= 8));
  assert.equal(chunks.join('').replace(/\s/g, ''), 'Длинныйтекстбезабзацев.');
});

test('serializes simultaneous requests and retries 409 without overlapping generations', async () => {
  let active = 0;
  let maxActive = 0;
  let attempts = 0;
  const texts = [];
  const client = createQwenTtsClient({ retryDelayMs: 1, fetchImpl: async (url, options) => {
    if (url.endsWith('/api/voices')) return json(catalog);
    active += 1;
    maxActive = Math.max(active, maxActive);
    await delay(10);
    active -= 1;
    attempts += 1;
    if (attempts === 1) return json({ detail: 'Busy' }, 409);
    texts.push(JSON.parse(options.body).text);
    return audio();
  } });
  await Promise.all([
    client.generatePcmBuffer({ text: 'Первый.', voice }),
    client.generatePcmBuffer({ text: 'Второй.', voice })
  ]);
  assert.equal(maxActive, 1);
  assert.equal(attempts, 3);
  assert.deepEqual(texts, ['Первый.', 'Второй.']);
});

test('preserves JSON validation errors and refreshes catalog after upstream 404', async () => {
  for (const status of [404, 422, 502]) {
    let catalogRequests = 0;
    const client = createQwenTtsClient({ fetchImpl: async (url) => {
      if (url.endsWith('/api/voices')) {
        catalogRequests += 1;
        return json(catalog);
      }
      return json({ detail: status === 422 ? [{ loc: ['body', 'text'], msg: 'Too long' }] : 'Upstream error' }, status);
    } });
    await assert.rejects(client.generatePcmBuffer({ text: 'Привет.', voice }), (error) => {
      assert.equal(error.status, status);
      assert.match(error.message, status === 422 ? /body.text: Too long/ : /Upstream error/);
      return true;
    });
    assert.equal(catalogRequests, status === 404 ? 2 : 1);
  }
});

test('rejects blank text and missing or stale voices before synthesis', async () => {
  let generations = 0;
  const client = createQwenTtsClient({ fetchImpl: async (url) => {
    if (url.endsWith('/api/voices')) return json(catalog);
    generations += 1;
    return audio();
  } });
  await assert.rejects(client.generatePcmBuffer({ text: '  ', voice }), { status: 422 });
  await assert.rejects(client.generatePcmBuffer({ text: 'Текст.', voice: '' }), { status: 422 });
  await assert.rejects(client.generatePcmBuffer({ text: 'Текст.', voice: 'qwen_missing.pt' }), { status: 404 });
  assert.equal(generations, 0);
});

test('rejects JSON, empty WAV, and a WAV container with no valid audio', async () => {
  for (const response of [json({ detail: 'Not audio' }), new Response('', { headers: { 'Content-Type': 'audio/wav' } }),
    new Response(Buffer.from('RIFF' + ' '.repeat(4) + 'WAVE' + ' '.repeat(100)), { headers: { 'Content-Type': 'audio/wav' } })]) {
    const client = createQwenTtsClient({ fetchImpl: async (url) => url.endsWith('/api/voices') ? json(catalog) : response });
    await assert.rejects(client.generatePcmBuffer({ text: 'Текст.', voice }), { status: 502 });
  }
});

test('limits busy retries and releases the queue after a timeout or client cancellation', async () => {
  let busy = true;
  const client = createQwenTtsClient({ timeoutMs: 100, retryDelayMs: 5, fetchImpl: async (url) => {
    if (url.endsWith('/api/voices')) return json(catalog);
    return busy ? json({ detail: 'Busy' }, 409) : json({ detail: 'Model error after recovery' }, 502);
  } });
  await assert.rejects(client.generatePcmBuffer({ text: 'Текст.', voice }), { status: 504 });
  const controller = new AbortController();
  const pending = client.generatePcmBuffer({ text: 'Отмена.', voice, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  busy = false;
  await assert.rejects(client.generatePcmBuffer({ text: 'Снова.', voice }), { status: 502 });
});

test('maps connection failures and a voice-list timeout to HTTP errors', async () => {
  const offline = createQwenTtsClient({ fetchImpl: async () => { throw new TypeError('connection refused'); } });
  await assert.rejects(offline.getVoices(), { status: 502 });
  const slow = createQwenTtsClient({ voicesTimeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    await delay(1000, undefined, { signal });
  } });
  await assert.rejects(slow.getVoices(), { status: 504 });
});

test('aborts an active HTTP generation and skips a canceled request waiting in the queue', async () => {
  const activeController = new AbortController();
  const queuedController = new AbortController();
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const requests = [];
  const client = createQwenTtsClient({ fetchImpl: async (url, options) => {
    if (url.endsWith('/api/voices')) return json(catalog);
    requests.push(JSON.parse(options.body).text);
    markStarted();
    await delay(1000, undefined, { signal: options.signal });
    return audio();
  } });
  const active = client.generatePcmBuffer({ text: 'Активный.', voice, signal: activeController.signal });
  const activeResult = assert.rejects(active, { name: 'AbortError' });
  await started;
  const queued = client.generatePcmBuffer({ text: 'В очереди.', voice, signal: queuedController.signal });
  const queuedResult = assert.rejects(queued, { name: 'AbortError' });
  queuedController.abort();
  activeController.abort();
  await Promise.all([activeResult, queuedResult]);
  assert.deepEqual(requests, ['Активный.']);
});
