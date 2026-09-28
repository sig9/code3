/*  test/leftovers.test.mjs — v0.4 build leftovers (Playtest #3 + QA minors) the harness can see.
    Run:  node --test test/*.test.mjs
      L1  taser range: the juke toast and the pill agree (shoot again from the line; never "get closer")
      L2  touch: the always-jogging cop can stand on the firing line (academy only) — see academy-foot 'F taser (touch)'
      L3  HUD: the steering column sits right of #bAct (no #meter/#bAct, #mlab/#golab overlap) — static CSS checks;
          the layout itself is audited by test/e2e/smoke.mjs (badOverlaps must be [], exit 3 otherwise)
      L4  #radio clears the left thumb column in short landscape; nothing sits under the booking card
      L5  patrol hint: SLOW DOWN, JUMP OUT! while EXIT is dimmed
      L6  QA minors: paused guards, Hints toggle after a reload, the escape radio's 3.5 s, fresh debug-respawn names
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const GAME = extractGameScript(HTML);
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const rule = sel => { const i = CSS.indexOf('\n  ' + sel + '{'); assert.ok(i >= 0, sel); return CSS.slice(i, CSS.indexOf('}', i)); };
const words = s => s.replace(/\p{Extended_Pictographic}|—/gu, '').trim().split(/\s+/).length;
const emoji = s => (s.match(/\p{Extended_Pictographic}/gu) || []).length;

function range(G) {
  G.started = true; G.inputKind = 'keys'; G.startAcademy(); G.footStart();
  G.acad.step = G.DRILLS.findIndex(d => d.id === 'taser'); G.acad.drillT0 = 1; G.DRILLS[G.acad.step].setup(G.gnow());
}

test('L1 range: after a juke the toast says zap again from the line, and the pill agrees', () => {
  const G = loadGame(); range(G);
  G.acad.shot = 1; G.step(1 / 60); Object.assign(G.slider, { x: -28, dir: 1 }); G.step(1 / 60);
  Object.assign(G.cop, { x: G.slider.x, z: G.FIRE_Z, a: Math.PI, speed: 0 });
  assert.equal(G.fireTaze(G.gnow(), 0), true); G.step(0.4);
  const t = G.dom('msg').textContent;
  assert.equal(t, '📣 He heard you! Zap again from the line');
  assert.ok(words(t) <= 8 && emoji(t) === 1, t);
  assert.match(t, /line/i); assert.doesNotMatch(t, /closer/i);
  assert.equal(G.onFiringLine(), true);
  assert.doesNotMatch(G.hintFor(), /^AIM FROM THE LINE/, 'standing where the toast says: the pill does not argue');
  G.cop.z = G.FIRE_Z - 3; assert.match(G.hintFor(), /^AIM FROM THE LINE \d\/2$/, 'stepping closer: the pill sends him back');
});

test('L3 CSS: meter, its label and the GO label live in the strip right of #bAct; safe-area aware; never touchable', () => {
  for (const s of ['#meter', '#mlab']) {
    const r = rule(s);
    assert.match(r, /left:calc\(124px \+ env\(safe-area-inset-left\)\)/, s + ' starts right of #bAct (16 + 96 + 12 px)');
    assert.match(r, /right:calc\(16px \+ env\(safe-area-inset-right\)\)/, s);
    assert.match(r, /pointer-events:none/, s); assert.doesNotMatch(r, /left:50%/, s);
  }
  const b = n => +rule(n).match(/bottom:calc\((\d+)px/)[1];
  assert.ok(b('#mlab') >= b('#golab') + 27 + 4, '#mlab above #golab (27 px tall)');
  assert.ok(b('#meter') >= b('#mlab') + 13 + 4, '#meter above #mlab (13 px tall)');
  assert.match(rule('#golab'), /pointer-events:none/);
});

test('L4 radio: short landscape keeps it clear of the thumb column; the toast and radio hide under the card', () => {
  assert.match(CSS, /@media \(max-height:480px\)\{#radio\{max-width:calc\(100vw - 248px/);
  assert.match(CSS, /#msg\.show\.undercard\{opacity:0;\}/);
  const G = loadGame(); G.started = true;
  G.showCard(G.scoreBooked(G.gnow())); G.placeCard();
  assert.ok(G.dom('msg').classList.contains('undercard'), 'the toast waits under the card');
  G.radio('📻 test'); assert.ok(!G.dom('radio').classList.contains('show'), 'radio never sits under #card');
  G.dom('card').classList.remove('show'); G.placeCard();
  assert.ok(!G.dom('msg').classList.contains('undercard'));
});

test('L5 patrol hint: SLOW DOWN, JUMP OUT! while EXIT is dimmed; JUMP OUT! only when EXIT is live', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'keys';
  Object.assign(G.crook, { state: 'flee', alerted: true });
  Object.assign(G.car, { x: G.crook.x - 10, z: G.crook.z, speed: 20 });
  assert.equal(G.affordance(), 'slow'); assert.equal(G.hintFor(), 'SLOW DOWN, JUMP OUT!');
  G.updateActBtn(); assert.ok(!G.dom('actRing').classList.contains('on'), 'no pulse on a dimmed EXIT');
  G.car.speed = 5; assert.equal(G.affordance(), 'exit'); assert.equal(G.hintFor(), 'JUMP OUT!');
  G.updateActBtn(); assert.ok(G.dom('actRing').classList.contains('on'), 'JUMP OUT ↔ EXIT pulses');
  assert.ok('SLOW DOWN, JUMP OUT!'.length <= 22 && words('SLOW DOWN, JUMP OUT!') <= 8);
});

test('L6a paused: TAZE and the T key do nothing under the pause veil', () => {
  const G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.crook, { state: 'flee', x: 0, z: -84, a: 0, speed: 0 });
  Object.assign(G.cop, { x: 0, z: -90, a: 0, freezeUntil: 0 }); G.step(1 / 60);
  assert.equal(G.tazeOK(), true);
  G.setPaused(true);
  G.dom('bTaze').dispatch('pointerdown', { pointerType: 'touch' }); G.fire('keydown', { code: 'KeyT' });
  assert.equal(G.taze.phase, 'idle', 'no shot while paused'); assert.equal(G.events.count('tazeFire'), 0);
  G.setPaused(false); G.fire('keydown', { code: 'KeyT' }); assert.equal(G.events.count('tazeFire'), 1);
});

test('L6b Hints toggle: a relaunch with hints off shows "off" (and no pill)', () => {
  const G = loadGame({ storage: { 'code3.hints': 'off' } });
  assert.equal(G.hintsOn, false);
  assert.equal(G.dom('tHints').textContent, 'off'); assert.ok(!G.dom('tHints').classList.contains('on'));
  G.started = true; G.step(1 / 60); assert.equal(G.dom('hint').textContent, '');
  const H = loadGame(); assert.equal(H.dom('tHints').textContent, 'on');
});

test('L6d escape radio: the got-away line keeps its full 3.5 s even when the next crook spawns at once', () => {
  const G = loadGame(); G.started = true;
  G.emit('escape'); const line = G.dom('radio').textContent;
  const hide = [...G.timers.values()].filter(t => t.ms === 3500);
  assert.ok(hide.length >= 1, 'a 3.5 s hide timer');
  G.respawnCrook(); G.step(2.2);
  assert.equal(G.dom('radio').textContent, line, 'still the escape line at 2.2 s');
  assert.ok(G.dom('radio').classList.contains('show'));
});

test('L6e debug Respawn: each press names a different crook (hash32 only)', () => {
  const G = loadGame(); G.started = true;
  const names = [G.crook.name];
  for (let i = 0; i < 4; i++) { G.dom('bRespawn').dispatch('click'); names.push(G.crook.name); }
  for (let i = 1; i < names.length; i++) assert.notEqual(names[i], names[i - 1], names.join(', '));
  assert.ok(!/Math\.random|rand\(/.test(GAME.slice(GAME.indexOf('function nameCrook'), GAME.indexOf('function nameCrook') + 300)));
});
