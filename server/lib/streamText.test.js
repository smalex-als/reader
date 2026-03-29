import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMarkdown } from './streamText.js';

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
    'Two examples are Google Places API reference 7 and Yelp business endpoints reference 8.\nData model\nRead volume is high because the following features are commonly used:\nSearch for nearby businesses.\nView the detailed information of a business.'
  );
});
