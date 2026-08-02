import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { remarkListItemBreaks } from '../src/lib/remarkListItemBreaks.ts';

test('turns soft line breaks inside list items into explicit breaks', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'list',
        children: [
          {
            type: 'listItem',
            children: [
              {
                type: 'paragraph',
                children: [
                  { type: 'text', value: 'The best score.\n' },
                  { type: 'strong', children: [{ type: 'text', value: 'Pattern:' }] },
                  { type: 'text', value: ' the best + noun\n' },
                  { type: 'strong', children: [{ type: 'text', value: 'Comparison:' }] },
                  { type: 'text', value: ' the previous score' }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  remarkListItemBreaks()(tree);

  const paragraph = tree.children[0].children[0].children[0];
  assert.deepEqual(paragraph.children.map((node) => node.type), [
    'text',
    'break',
    'text',
    'strong',
    'text',
    'break',
    'text',
    'strong',
    'text'
  ]);
});

test('keeps soft line breaks outside lists unchanged', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: 'First line\nsecond line' }]
      }
    ]
  };

  remarkListItemBreaks()(tree);

  assert.deepEqual(tree.children[0].children, [
    { type: 'text', value: 'First line\nsecond line' }
  ]);
});

test('renders list continuation lines as line breaks', () => {
  const markdown = [
    '1. The best score.',
    '   **Pattern:** the best + noun',
    '   **Comparison:** the previous score'
  ].join('\n');

  const html = renderToStaticMarkup(createElement(ReactMarkdown, {
    children: markdown,
    remarkPlugins: [remarkListItemBreaks]
  }));

  assert.match(
    html,
    /The best score\.<br\/>\s*<strong>Pattern:<\/strong> the best \+ noun<br\/>\s*<strong>Comparison:<\/strong>/
  );
});
