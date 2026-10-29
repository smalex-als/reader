import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchStreamVoices } from '../src/api/streamVoices.ts';

test('keeps Qwen voice choices and surfaces a provider failure alongside other voices', async (t) => {
  const voices = [
    { id: 'en-Mike_man', label: 'Mike - man', provider: 'streaming' },
    { id: 'elevenlabs_3EuKHIEZbSzrHGNmdYsx', label: 'Nikolay - ElevenLabs', provider: 'elevenlabs' },
    { id: 'elevenlabs_gJEfHTTiifXEDmO687lC', label: 'Prince Nur - ElevenLabs', provider: 'elevenlabs' },
    { id: 'qwen_voice_alexey.pt', label: 'Alexey - Qwen', provider: 'qwen' }
  ];
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    defaultVoice: 'en-Mike_man', voices,
    providerErrors: { qwen: 'Qwen TTS connection failed (ECONNREFUSED)' }
  }));
  const result = await fetchStreamVoices();
  assert.deepEqual(result.voices, voices);
  assert.equal(result.defaultVoice, 'en-Mike_man');
  assert.match(result.qwenError ?? '', /ECONNREFUSED/);
});

test('accepts a healthy catalog and older Reader responses without provider diagnostics', async (t) => {
  const payload = {
    voices: [{ id: 'qwen_voice_alexey.pt', label: 'Alexey - Qwen', provider: 'qwen' }],
    defaultVoice: 'missing'
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json(payload));
  const result = await fetchStreamVoices();
  assert.equal(result.defaultVoice, 'qwen_voice_alexey.pt');
  assert.equal(result.qwenError, null);
});

test('reports an unsuccessful Reader response as a request error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Unavailable' }, { status: 502 }));
  await assert.rejects(fetchStreamVoices(), /Voice request failed: 502/);
});
