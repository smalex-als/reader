import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

test('Qwen voices, playback, WAV download, and chapter MP3 work through Reader API', async (t) => {
  let upstreamError = null;
  let voiceName = 'Alexey';
  let wav;
  const generations = [];
  const upstream = createServer(async (req, res) => {
    if (req.url === '/api/voices') {
      res.setHeader('Content-Type', 'application/json');
      if (upstreamError === 'offline') {
        res.writeHead(502).end(JSON.stringify({ detail: 'Offline' }));
        return;
      }
      res.end(JSON.stringify({ voices: [
        { id: 'voice_alexey.pt', name: voiceName },
        { id: 'voice_petukhov.pt', name: 'Petukhov' }
      ], max_text_length: 3000 }));
      return;
    }
    assert.equal(req.url, '/api/synthesize');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.deepEqual(Object.keys(payload).sort(), ['text', 'voice']);
    assert(Array.from(payload.text).length <= 3000);
    assert(['voice_alexey.pt', 'voice_petukhov.pt'].includes(payload.voice));
    generations.push(payload);
    if (typeof upstreamError === 'number') {
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(upstreamError).end(JSON.stringify({ detail: upstreamError === 422
        ? [{ loc: ['body', 'text'], msg: 'Invalid text' }] : 'Model unavailable' }));
      return;
    }
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('X-Generation-Seconds', '0.1');
    res.end(wav);
  }).listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  process.env.QWEN_TTS_SERVER = `http://127.0.0.1:${upstream.address().port}`;
  process.env.REDIS_URL = '';
  const { createApp } = await import('./index.js');
  const { DATA_DIR } = await import('./config.js');
  const { buildWavHeader } = await import('./lib/streamAudio.js');
  const { clearCompletedChapterAudioJob } = await import('./lib/chapterAudioJobs.js');
  const pcm = Buffer.alloc(4800); // 0.1 s of 24 kHz mono PCM
  wav = Buffer.concat([buildWavHeader(pcm.length), pcm]);
  const reader = createApp().listen(0, '127.0.0.1');
  await once(reader, 'listening');
  t.after(() => new Promise((resolve) => reader.close(resolve)));
  const base = `http://127.0.0.1:${reader.address().port}`;
  const post = (endpoint, body) => fetch(`${base}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });

  await t.test('loads renamed voices live and keeps other providers available when Qwen is offline', async () => {
    upstreamError = 'offline';
    let payload = await (await fetch(`${base}/api/stream-audio/voices`)).json();
    assert.match(payload.providerErrors.qwen, /Offline/);
    assert(!payload.voices.some((voice) => voice.provider === 'qwen'));
    assert(payload.voices.some((voice) => voice.provider === 'streaming'));
    upstreamError = null;
    let response = await fetch(`${base}/api/stream-audio/voices`);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    payload = await response.json();
    assert.deepEqual(payload.providerErrors, {});
    assert(payload.voices.some((voice) => voice.id === 'qwen_voice_alexey.pt' && voice.label === 'Alexey - Qwen' && voice.provider === 'qwen'));
    assert(payload.voices.some((voice) => voice.provider === 'xai'));
    voiceName = 'Алексей';
    payload = await (await fetch(`${base}/api/stream-audio/voices`)).json();
    assert(payload.voices.some((voice) => voice.label === 'Алексей - Qwen'));
    upstreamError = 'offline';
    response = await fetch(`${base}/api/stream-audio/voices`);
    assert.equal(response.status, 200);
    payload = await response.json();
    assert(payload.voices.some((voice) => voice.provider === 'streaming'));
    assert(payload.voices.some((voice) => voice.id === 'qwen_voice_alexey.pt' && voice.label === 'Алексей - Qwen'));
    assert.match(payload.providerErrors.qwen, /Offline/);
    assert.match(payload.providerErrors.qwen, /QWEN_TTS_SERVER/);
    upstreamError = null;
    payload = await (await fetch(`${base}/api/stream-audio/voices`)).json();
    assert.deepEqual(payload.providerErrors, {});
  });

  await t.test('returns playable PCM and a complete WAV through the same-origin API', async () => {
    const body = { voice: 'qwen_voice_alexey.pt', text: 'Привет!\n\nПроверка.' };
    let response = await post('/api/stream-audio/pcm', body);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-audio-sample-rate'), '24000');
    assert.equal(response.headers.get('x-audio-channels'), '1');
    assert.equal(response.headers.get('x-audio-format'), 'pcm_s16le');
    assert.equal((await response.arrayBuffer()).byteLength, 9600);
    response = await post('/api/stream-audio/wav', body);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /audio\/wav/);
    const result = Buffer.from(await response.arrayBuffer());
    assert.equal(result.toString('ascii', 0, 4), 'RIFF');
    assert.equal(result.toString('ascii', 8, 12), 'WAVE');
    assert.equal(result.readUInt32LE(40), result.length - 44);
    assert.equal(result.length, 9644);
  });

  await t.test('returns JSON errors instead of passing error bodies to the audio player', async () => {
    for (const status of [404, 422, 502]) {
      upstreamError = status;
      const response = await post('/api/stream-audio/pcm', { voice: 'qwen_voice_alexey.pt', text: 'Ошибка.' });
      assert.equal(response.status, status);
      assert.match(response.headers.get('content-type'), /application\/json/);
      assert.match((await response.json()).error, status === 422 ? /body.text: Invalid text/ : /Model unavailable/);
    }
    upstreamError = null;
  });

  await t.test('generates a chapter MP3 with dynamic ::voice commands, pauses, and Qwen metadata', async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const directory = await fs.mkdtemp(path.join(DATA_DIR, 'qwen-api-test-'));
    const book = path.basename(directory);
    t.after(async () => {
      await clearCompletedChapterAudioJob(book, 1);
      await fs.rm(directory, { recursive: true, force: true });
    });
    // The cloud test host may have ffmpeg without the lame CLI. In that case,
    // adapt the existing CLI contract to ffmpeg's real libmp3lame encoder.
    try {
      execFileSync('lame', ['--version'], { stdio: 'ignore' });
    } catch {
      const binDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-qwen-encoder-'));
      await fs.writeFile(path.join(binDirectory, 'lame'), '#!/bin/sh\nexec ffmpeg -hide_banner -loglevel error -y -i "$3" -codec:a libmp3lame "$4"\n', { mode: 0o755 });
      const previousPath = process.env.PATH;
      process.env.PATH = `${binDirectory}:${previousPath}`;
      t.after(async () => { process.env.PATH = previousPath; await fs.rm(binDirectory, { recursive: true, force: true }); });
    }
    await fs.writeFile(path.join(directory, 'book.json'), JSON.stringify({ type: 'text', title: 'Qwen integration test' }));
    await fs.writeFile(path.join(directory, 'toc.json'), JSON.stringify([{ title: 'Глава', page: 1 }]));
    await fs.writeFile(path.join(directory, 'chapter001.txt'), '## Начало\n\nПервый абзац.\n\n::voice petukhov\n\nВторой абзац.\n\n::pause 100ms\n\n## Конец\n\nТретий абзац.');
    generations.length = 0;
    const endpoint = `/api/books/${book}/chapters/1/audio`;
    const response = await post(endpoint, { voice: 'qwen_voice_alexey.pt', provider: 'qwen', versionId: 'base' });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).job.provider, 'qwen');
    let job;
    const deadline = Date.now() + 60000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 50));
      job = (await (await fetch(`${base}${endpoint}/status`)).json()).job;
    } while (['queued', 'running'].includes(job.status) && Date.now() < deadline);
    assert.equal(job.status, 'completed', job.error || JSON.stringify(job));
    assert.equal(job.provider, 'qwen');
    const mp3 = await fetch(`${base}${job.audioUrl}`);
    assert.equal(mp3.status, 200);
    assert((await mp3.arrayBuffer()).byteLength > 0);
    const meta = JSON.parse(await fs.readFile(path.join(directory, 'chapter001.mp3.meta.json'), 'utf8'));
    assert.equal(meta.provider, 'qwen');
    assert.equal(meta.voice, 'qwen_voice_alexey.pt');
    assert.equal(meta.subchapters.length, 2);
    assert(meta.subchapters[1].startSeconds >= 0.3); // speech plus explicit pause
    assert(generations.some((entry) => entry.voice === 'voice_alexey.pt'));
    assert(generations.some((entry) => entry.voice === 'voice_petukhov.pt' && entry.text.includes('Второй абзац')));
    const library = await (await fetch(`${base}/api/audio`)).json();
    assert(library.items.some((item) => item.bookId === book && item.provider === 'qwen'));
  });
});
