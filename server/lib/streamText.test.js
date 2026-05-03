import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareChapterSpeechSections,
  prepareChapterSpeechSegments,
  splitStreamChunks,
  stripMarkdown
} from './streamText.js';

test('removes html table tags before speech cleanup', () => {
  const input =
    '<table><tr><td></td><td>Pros</td><td>Cons</td></tr><tr><td>Event time</td><td>More accurate</td><td>Can be wrong</td></tr></table>';

  const output = stripMarkdown(input);

  assert.equal(output, 'Pros Cons Event time More accurate Can be wrong');
});

test('removes emoji and non-speakable control characters', () => {
  const input = 'Fast path 🚀 works\u200B well\u0007 for users';

  const output = stripMarkdown(input);

  assert.equal(output, 'Fast path works well for users');
});

test('normalizes common inline latex formulas into speakable text', () => {
  const input =
    'Assume \\(70\\%\\) occupied. TPS = \\(\\frac{240,000}{10^5 \\text{ seconds in a day}} \\approx 3\\).';

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'Assume 70 percent occupied. TPS 240,000 divided by 10 to the power of 5 seconds in a day approximately 3.'
  );
});

test('normalizes dollar-delimited math and simple operators', () => {
  const input = 'Value is $x_1 = y^2 \\times 4$ today.';

  const output = stripMarkdown(input);

  assert.equal(output, 'Value is x sub 1 equals y to the power of 2 times 4 today.');
});

test('normalizes degree notation into speakable temperature text', () => {
  const input = 'Preheat the oven to \\(200^{\\circ}C\\).';

  const output = stripMarkdown(input);

  assert.equal(output, 'Preheat the oven to 200 degrees Celsius.');
});

test('normalizes plain degree symbols into speakable temperature text', () => {
  const input = 'Bake at 180°C, then finish at 350°F or hold at 90°.';

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'Bake at 180 degrees Celsius, then finish at 350 degrees Fahrenheit or hold at 90 degrees.'
  );
});

test('normalizes http api examples into speakable text', () => {
  const input = 'GET /v1/hotels/ID/rooms/ID Delete uses DELETE /v1/reservations/ID.';

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'get slash v 1 slash hotels slash I D slash rooms slash I D Delete uses delete slash v 1 slash reservations slash I D.'
  );
});

test('normalizes json-style request fields into speakable text', () => {
  const input =
    '{ "startDate":"2021-04-28", "hotelID":"245", "roomID":"U12354673389", "reservationID":"13422445" }';

  const output = stripMarkdown(input);

  assert.equal(
    output,
    '{ start date: 2021-04-28, hotel I D: 245, room I D: u 12354673389, reservation I D: 13422445 }'
  );
});

test('skips ocr blocks marked as removed from speech', () => {
  const input = [
    '<|ref|>text<|/ref|><|det|>[[1, 2, 3, 4]]<|/det|>',
    'Keep this block.',
    '',
    '<|ref|>text<|/ref|><|det|>[[5, 6, 7, 8]]<|/det|>',
    '<|speech_removed|><|/speech_removed|>',
    'Skip this block.',
    '',
    '<|ref|>text<|/ref|><|det|>[[9, 10, 11, 12]]<|/det|>',
    'Keep this one too.'
  ].join('\n');

  const output = stripMarkdown(input);

  assert.equal(output, 'Keep this block.\n\nKeep this one too.');
});

test('normalizes numeric citations into speakable references', () => {
  const input = 'Places API [7] and Yelp business endpoints [8] are common examples.';

  const output = stripMarkdown(input);

  assert.equal(output, 'Places API reference 7 and Yelp business endpoints reference 8 are common examples.');
});

test('normalizes unicode dashes into smooth speech pauses', () => {
  const input =
    'Police cars in Germany — with lights and registration marks — were seen nearby. Two-phase commit – Saga.';

  const output = stripMarkdown(input);

  assert.equal(output, 'Police cars in Germany, with lights and registration marks, were seen nearby. Two-phase commit, Saga.');
});

test('removes markdown asterisk dividers before speech cleanup', () => {
  const input = ['Intro paragraph.', '***', 'Next section.', '* * *', 'Final section.'].join('\n');

  const output = stripMarkdown(input);

  assert.equal(output, 'Intro paragraph.\n\nNext section.\n\nFinal section.');
});

test('does not treat bracketed hash slot ranges as citations', () => {
  const input =
    'The first node contains hash slots \\([0, 5500]\\).\n- The second node contains hash slots \\([5501, 11000]\\).';

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'The first node contains hash slots 0 to 5500.\nThe second node contains hash slots 5501 to 11000.'
  );
});

test('preserves markdown line structure long enough to strip headings and bullets', () => {
  const input = [
    'Two examples are Google Places API [7] and Yelp business endpoints [8].',
    '## Data model',
    'Read volume is high because the following features are commonly used:',
    '- Search for nearby businesses.',
    '- View the detailed information of a business.'
  ].join('\n');

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'Two examples are Google Places API reference 7 and Yelp business endpoints reference 8.\nData model.\nRead volume is high because the following features are commonly used:\nSearch for nearby businesses.\nView the detailed information of a business.'
  );
});

test('adds sentence punctuation to markdown headings for speech', () => {
  const input = [
    '# Core Idea',
    '',
    '## GPT-5.5 prompting guide',
    '',
    'Prompt GPT-5.5 with outcome-first goals, concise style controls, retrieval budgets, and validation loops.'
  ].join('\n');

  const output = stripMarkdown(input);

  assert.equal(
    output,
    'Core Idea.\n\nGPT-5.5 prompting guide.\n\nPrompt GPT-5.5 with outcome-first goals, concise style controls, retrieval budgets, and validation loops.'
  );
});

test('prepares chapter speech sections from markdown headings', () => {
  const input = [
    'Intro without punctuation',
    '## Data model',
    'The table stores hotel info',
    '## API design',
    'Requests are routed by region!'
  ].join('\n');

  const output = prepareChapterSpeechSections(input);

  assert.deepEqual(output, [
    'Intro without punctuation.',
    'Data model\nThe table stores hotel info.',
    'API design\nRequests are routed by region!'
  ]);
});

test('preserves subchapter titles while preparing chapter speech', () => {
  const input = [
    'Preface text',
    '## **Data model**',
    'The table stores hotel info',
    '### API design',
    'Requests are routed by region'
  ].join('\n');

  const output = prepareChapterSpeechSegments(input);

  assert.deepEqual(output, [
    { title: null, text: 'Preface text.' },
    { title: 'Data model', text: 'Data model\nThe table stores hotel info.' },
    { title: 'API design', text: 'API design\nRequests are routed by region.' }
  ]);
});

test('keeps markdown subchapters in separate speech chunks', () => {
  const input = [
    '## First section',
    'A'.repeat(600),
    '## Second section',
    'B'.repeat(600)
  ].join('\n');

  const sections = prepareChapterSpeechSections(input);
  const chunks = sections.flatMap((section) => splitStreamChunks(section, 0, 1000, 240));

  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /^First section\nA+/);
  assert.match(chunks[1], /^Second section\nB+/);
});

test('prefers line breaks over mid-line chunk splits', () => {
  const firstLine = 'A'.repeat(650);
  const secondLine = 'B'.repeat(650);
  const input = `${firstLine}\n${secondLine}`;

  const output = splitStreamChunks(input, 0);

  assert.equal(output.length, 2);
  assert.equal(output[0], firstLine);
  assert.equal(output[1], secondLine);
});

test('uses sentence endings before falling back to spaces', () => {
  const firstSentence = 'A'.repeat(995) + '.';
  const secondSentence = 'B'.repeat(400) + '.';
  const input = `${firstSentence} ${secondSentence}`;

  const output = splitStreamChunks(input, 0);

  assert.equal(output.length, 2);
  assert.equal(output[0], firstSentence);
  assert.equal(output[1], secondSentence);
});
