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
