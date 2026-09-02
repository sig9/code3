import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

const ls = (G) => G.ctx.localStorage;

test('badge: no badge chosen keeps the single v0.3 career key', () => {
  const G = loadGame({ seed: 1 });
  assert.equal(G.badge, null);
  assert.equal(G.careerKey(), 'code3.career');
});

test('badge: each badge number keeps its own career, and the list remembers them', () => {
  const G = loadGame({ seed: 1 });
  assert.equal(G.selectBadge('4821'), '4821');
  assert.equal(G.careerKey(), 'code3.career.4821');
  G.career.stars = 7; G.career.booked = 3; G.saveCareer();
  assert.equal(JSON.parse(ls(G).getItem('code3.career.4821')).stars, 7);

  assert.equal(G.selectBadge(' 7 '), '7');            // digits only
  assert.equal(G.career.stars, 0);                     // a fresh badge starts clean
  G.career.stars = 2; G.saveCareer();

  assert.equal(G.selectBadge('4821'), '4821');         // back to the first badge
  assert.equal(G.career.stars, 7); assert.equal(G.career.booked, 3);

  const b = G.loadBadges();
  assert.equal(b.list.map(x => x.n).join(','), '4821,7'); // most recent first
  assert.equal(b.current, '4821');
});

test('badge: an empty entry mints a new 4-digit badge that is not already on the phone', () => {
  const G = loadGame({ seed: 1 });
  G.selectBadge('1234');
  const n = G.selectBadge('');
  assert.match(n, /^\d{4}$/);
  assert.notEqual(n, '1234');
  assert.equal(G.careerKey(), 'code3.career.' + n);
});

test('badge: the first badge on a phone adopts the old single career', () => {
  const G = loadGame({ seed: 1 });
  ls(G).setItem('code3.career', JSON.stringify({ stars: 5, booked: 2, escapes: 1, slips: 0 }));
  G.selectBadge('9001');
  assert.equal(G.career.stars, 5); assert.equal(G.career.booked, 2);
  G.selectBadge('9002');                               // a second badge does not inherit it
  assert.equal(G.career.stars, 0);
});

test('badge: bookings and escapes save under the badge key', () => {
  const G = loadGame({ seed: 1 });
  G.selectBadge('31');
  G.career.escapes = 4; G.saveCareer();
  assert.equal(JSON.parse(ls(G).getItem('code3.career.31')).escapes, 4);
  assert.equal(ls(G).getItem('code3.career'), null);
});
