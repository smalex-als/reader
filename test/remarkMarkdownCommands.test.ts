import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { remarkMarkdownCommands } from '../src/lib/remarkMarkdownCommands.ts';

function renderMarkdown(markdown: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    children: markdown,
    remarkPlugins: [remarkMarkdownCommands]
  }));
}

test('renders a note as an aside and never as literal command text', () => {
  const html = renderMarkdown('First paragraph.\n\n::note verify against page 114\n\nSecond paragraph.');

  assert.match(html, /<aside class="text-viewer-note">verify against page 114<\/aside>/);
  assert.doesNotMatch(html, /::note/);
});

test('renders a comment alias the same way as a note', () => {
  const html = renderMarkdown('::comment an editorial aside');

  assert.match(html, /<aside class="text-viewer-note">an editorial aside<\/aside>/);
});

test('removes pause commands from the rendered document', () => {
  const html = renderMarkdown('First paragraph.\n\n::pause 2s\n\nSecond paragraph.');

  assert.doesNotMatch(html, /::pause/);
  assert.doesNotMatch(html, /2s/);
  assert.match(html, /<p>First paragraph\.<\/p>/);
  assert.match(html, /<p>Second paragraph\.<\/p>/);
});

test('leaves a command-looking line inside a paragraph untouched', () => {
  const html = renderMarkdown('First line.\n::pause 2s\nSecond line.');

  assert.match(html, /::pause 2s/);
});

test('leaves unknown commands as ordinary text', () => {
  const html = renderMarkdown('::teleport somewhere');

  assert.match(html, /<p>::teleport somewhere<\/p>/);
});

test('drops a note that carries no text', () => {
  const html = renderMarkdown('First paragraph.\n\n::note\n\nSecond paragraph.');

  assert.doesNotMatch(html, /::note/);
  assert.doesNotMatch(html, /<aside/);
});

test('keeps skipped text visible while hiding its markers', () => {
  const html = renderMarkdown('Intro.\n\n::skip\n\nA table nobody reads aloud.\n\n::skip-end\n\nOutro.');

  assert.match(html, /A table nobody reads aloud\./);
  assert.doesNotMatch(html, /::skip/);
});

test('hides stop and voice markers, leaving the voice only as a badge', () => {
  const html = renderMarkdown('Intro.\n\n::stop\n\n::voice sara\n\nOutro.');

  assert.doesNotMatch(html, /::stop/);
  assert.doesNotMatch(html, /::voice/);
  assert.match(html, /<p data-voice="sara">Outro\.<\/p>/);
});

test('never renders say text into the document', () => {
  const html = renderMarkdown('Intro.\n\n::say A table of yields follows.\n\nOutro.');

  assert.doesNotMatch(html, /::say/);
  assert.doesNotMatch(html, /A table of yields follows/);
  assert.match(html, /<p>Outro\.<\/p>/);
});

function renderWithVoiceLabels(markdown: string) {
  return renderToStaticMarkup(createElement(ReactMarkdown, {
    children: markdown,
    remarkPlugins: [[remarkMarkdownCommands, {
      resolveVoiceLabel: (voice: string | null) => voice === null ? 'Mike' : `${voice[0].toUpperCase()}${voice.slice(1)}`
    }]]
  }));
}

test('marks the first spoken paragraph after a voice change', () => {
  const html = renderWithVoiceLabels('Narrator line.\n\n::voice sara\n\nHer line.\n\nStill her line.');

  assert.match(html, /<p data-voice="Sara">Her line\.<\/p>/);
  assert.match(html, /<p>Still her line\.<\/p>/);
  assert.match(html, /<p>Narrator line\.<\/p>/);
});

test('a bare voice command is labelled with the reader voice', () => {
  const html = renderWithVoiceLabels('::voice sara\n\nHer line.\n\n::voice\n\nNarrator again.');

  assert.match(html, /<p data-voice="Sara">Her line\.<\/p>/);
  assert.match(html, /<p data-voice="Mike">Narrator again\.<\/p>/);
});

test('a skipped block does not absorb the voice badge', () => {
  const html = renderWithVoiceLabels(
    'Intro.\n\n::voice sara\n\n::skip\n\nA skipped table.\n\n::skip-end\n\nHer line.'
  );

  assert.match(html, /<p>A skipped table\.<\/p>/);
  assert.match(html, /<p data-voice="Sara">Her line\.<\/p>/);
});

test('a say command does not absorb the voice badge', () => {
  const html = renderWithVoiceLabels('::voice sara\n\n::say Spoken only.\n\nHer line.');

  assert.match(html, /<p data-voice="Sara">Her line\.<\/p>/);
});

test('marks a heading when it is the first block after the change', () => {
  const html = renderWithVoiceLabels('::voice sara\n\n## Her section\n\nHer line.');

  assert.match(html, /<h2 data-voice="Sara">Her section<\/h2>/);
});

test('a voice change with nothing spoken after it marks nothing', () => {
  const html = renderWithVoiceLabels('Narrator line.\n\n::voice sara');

  assert.doesNotMatch(html, /data-voice/);
});

test('renders no badge when no label resolver is supplied for a bare voice', () => {
  const html = renderMarkdown('::voice\n\nA line.');

  assert.doesNotMatch(html, /data-voice/);
});
