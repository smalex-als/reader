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

test('hides stop and voice markers', () => {
  const html = renderMarkdown('Intro.\n\n::stop\n\n::voice sara\n\nOutro.');

  assert.doesNotMatch(html, /::stop/);
  assert.doesNotMatch(html, /::voice/);
  assert.doesNotMatch(html, /sara/);
  assert.match(html, /<p>Outro\.<\/p>/);
});

test('never renders say text into the document', () => {
  const html = renderMarkdown('Intro.\n\n::say A table of yields follows.\n\nOutro.');

  assert.doesNotMatch(html, /::say/);
  assert.doesNotMatch(html, /A table of yields follows/);
  assert.match(html, /<p>Outro\.<\/p>/);
});
