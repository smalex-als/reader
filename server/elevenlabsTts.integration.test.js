import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('ElevenLabs voices, playback, WAV, and chapter MP3 work through Reader API', async (t) => {
  process.env.ELEVENLABS_API_KEY = 'elevenlabs-integration-test-key';
  process.env.ELEVENLABS_VOICE_IDS = '3EuKHIEZbSzrHGNmdYsx,gJEfHTTiifXEDmO687lC';
  delete process.env.ELEVENLABS_MODEL_ID;
  process.env.QWEN_TTS_SERVER = 'http://qwen.test:8001';
  process.env.REDIS_URL = '';
  const pcm = Buffer.alloc(4800); // 0.1 seconds of 24 kHz mono s16le.
  const requests = [];
  let upstreamError = null;
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).startsWith('http://qwen.test:8001/')) {
      return Response.json({ voices: [], max_text_length: 3000 });
    }
    if (!String(url).startsWith('https://api.elevenlabs.io/')) return originalFetch(url, options);
    assert.equal(options.headers['xi-api-key'], process.env.ELEVENLABS_API_KEY);
    assert.equal(options.method, 'POST');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model_id, 'eleven_v4');
    assert.equal(String(url), 'https://api.elevenlabs.io/v1/text-to-dialogue/stream?output_format=pcm_24000');
    assert.equal(payload.inputs.length, 1);
    const input = payload.inputs[0];
    assert(!input.text.includes('**'));
    assert(Array.from(input.text).length <= 2000);
    requests.push({ voice: input.voice_id, text: input.text });
    if (upstreamError) return Response.json({ detail: { message: 'Quota exceeded' } }, { status: upstreamError });
    return new Response(pcm, { headers: { 'Content-Type': 'audio/pcm' } });
  });

  const { createApp } = await import('./index.js');
  const { DATA_DIR } = await import('./config.js');
  const { clearCompletedChapterAudioJob } = await import('./lib/chapterAudioJobs.js');
  const reader = createApp().listen(0, '127.0.0.1');
  await once(reader, 'listening');
  t.after(() => new Promise((resolve) => reader.close(resolve)));
  const base = `http://127.0.0.1:${reader.address().port}`;
  const voices = ['elevenlabs_3EuKHIEZbSzrHGNmdYsx', 'elevenlabs_gJEfHTTiifXEDmO687lC'];
  const post = (endpoint, body) => fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  await t.test('lists both configured voices without exposing credentials', async () => {
    const response = await fetch(`${base}/api/stream-audio/voices`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.voices.filter((entry) => entry.provider === 'elevenlabs').map((entry) => entry.id), voices);
    assert(!JSON.stringify(payload).includes(process.env.ELEVENLABS_API_KEY));
    assert(payload.voices.some((entry) => entry.provider === 'streaming'));
  });

  await t.test('plays both voices and returns correctly sized WAV data', async () => {
    for (const voice of voices) {
      let response = await post('/api/stream-audio/pcm', { text: '**Привет!**', voice });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-audio-sample-rate'), '24000');
      assert.equal(response.headers.get('x-audio-channels'), '1');
      assert.equal(response.headers.get('x-audio-format'), 'pcm_s16le');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), pcm);
      assert.equal(requests.at(-1).voice, voice.slice(11));
      response = await post('/api/stream-audio/wav', { text: '**Привет!**', voice });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /audio\/wav/);
      const wav = Buffer.from(await response.arrayBuffer());
      assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
      assert.equal(wav.readUInt32LE(24), 24000);
      assert.equal(wav.readUInt32LE(40), pcm.length);
      assert.deepEqual(wav.subarray(44), pcm);
    }
  });

  await t.test('returns API errors as JSON before sending audio headers', async () => {
    for (const status of [401, 429]) {
      upstreamError = status;
      const response = await post('/api/stream-audio/pcm', { text: 'Error.', voice: voices[0] });
      assert.equal(response.status, status === 429 ? 429 : 502);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.match((await response.json()).error, /ElevenLabs TTS: Quota exceeded/);
    }
    upstreamError = null;
  });

  await t.test('generates MP3 with voice switching, pauses, and ElevenLabs library metadata', async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const directory = await fs.mkdtemp(path.join(DATA_DIR, 'elevenlabs-api-test-'));
    const book = path.basename(directory);
    t.after(async () => {
      await clearCompletedChapterAudioJob(book, 1);
      await fs.rm(directory, { recursive: true, force: true });
    });
    await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify({ type: 'text', title: 'ElevenLabs test' }));
    await fs.writeFile(path.join(directory, 'toc.json'), JSON.stringify([{ title: 'Глава', page: 0 }]));
    await fs.writeFile(path.join(directory, 'chapter001.txt'),
      `## Начало\n\nПервый абзац.\n\n::voice ${voices[1].slice(11)}\n\nВторой абзац.\n\n::pause 100ms\n\n## Конец\n\nТретий абзац.`);
    requests.length = 0;
    const endpoint = `/api/books/${book}/chapters/1/audio`;
    const response = await post(endpoint, { voice: voices[0], provider: 'elevenlabs', versionId: 'base' });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).job.provider, 'elevenlabs');
    let job;
    const deadline = Date.now() + 30000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = (await (await fetch(`${base}${endpoint}/status`)).json()).job;
    } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
    assert.equal(job.status, 'completed', job.error || JSON.stringify(job));
    assert.equal(job.provider, 'elevenlabs');
    const mp3 = await fetch(`${base}${job.audioUrl}`);
    assert.equal(mp3.status, 200);
    assert((await mp3.arrayBuffer()).byteLength > 0);
    const meta = JSON.parse(await fs.readFile(path.join(directory, 'chapter001.mp3.meta.json'), 'utf8'));
    assert.equal(meta.provider, 'elevenlabs');
    assert.equal(meta.voice, voices[0]);
    assert.equal(meta.subchapters.length, 2);
    assert(meta.subchapters[1].startSeconds >= 0.3);
    assert(requests.some((entry) => entry.voice === voices[0].slice(11)));
    assert(requests.some((entry) => entry.voice === voices[1].slice(11) && entry.text.includes('Второй абзац')));
    const library = await (await fetch(`${base}/api/audio`)).json();
    assert(library.items.some((item) => item.bookId === book && item.provider === 'elevenlabs'));
    const chapters = await (await fetch(`${base}/api/books/${book}/audio`)).json();
    assert(chapters.chapters.some((chapter) => chapter.audio?.provider === 'elevenlabs'));
  });
});
