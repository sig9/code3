/*  test/art-juice.test.mjs — v0.4 stage 4 "art-juice": chunky faced people (the look-back glance is visible),
    mood faces, the batched static world (road paint, bollards, trees, walls: one draw call), confetti,
    the booking party (#cardS text unchanged), crook names + the dispatch radio, the speech bubble.
    Run:  node --test test/*.test.mjs
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const GAME = extractGameScript(HTML);

function chase(G) {                                        // a fleeing crook with the cruiser straight behind him
  G.started = true; G.mode = 'drive';
  Object.assign(G.crook, { x: 0, z: 0, a: 0, state: 'flee', alerted: true, speed: 6 });
  Object.assign(G.car, { x: 0, z: -20, a: 0, speed: 0 });
}

test('ART person: makePerson returns userData.{head,face,armL,armR}; the look-back turns the head and twists the torso', () => {
  const G = loadGame();
  const u = G.crookM.userData;
  for (const k of ['head', 'face', 'armL', 'armR', 'torso']) assert.ok(u[k], `userData.${k}`);
  assert.ok(G.copM.userData.head && G.copM.userData.face && G.copM.userData.armL && G.copM.userData.armR);
  chase(G);
  const now = G.gnow() + 1000;
  G.crook.glanceUntil = 0; G.crookVisuals(now, now / 1000);
  assert.equal(u.head.rotation.y, 0); assert.equal(u.torso.rotation.y, 0);
  G.crook.glanceUntil = now + 500; G.crookVisuals(now, now / 1000);   // forced glance: the threat is dead behind
  assert.ok(Math.abs(u.head.rotation.y) > Math.PI / 2, `head turns past 90° so the face shows to a chaser behind (${u.head.rotation.y})`);
  assert.equal(Math.abs(u.torso.rotation.y), 0.25);
  G.crook.glanceUntil = now - 1; G.crookVisuals(now, now / 1000);
  assert.equal(u.head.rotation.y, 0); assert.equal(u.torso.rotation.y, 0);
});

test('ART person: tick reads userData only — no child indices on the crook/cop', () => {
  assert.doesNotMatch(GAME, /(crookM|copM|whistle)\.children\[/);
  assert.match(GAME, /g\.userData\.head=head/);
});

test('ART mood: the crook face map swaps between the 4 shared mood textures (tased/cuffed dizzy, custody grumpy)', () => {
  const G = loadGame(); chase(G);
  const face = G.crookM.userData.face, M = G.MOODS_MASK, now = G.gnow() + 1000;
  const set = new Set(Object.values(M)); assert.equal(set.size, 4, '4 distinct mood textures');
  assert.deepEqual(Object.keys(M).sort(), ['dizzy', 'grumpy', 'normal', 'scared']);
  const at = (state, extra = {}) => { Object.assign(G.crook, { state, hitUntil: 0 }, extra); G.crookVisuals(now, now / 1000); return face.map; };
  assert.equal(at('calm'), M.normal);
  assert.equal(at('flee'), M.scared);
  assert.equal(at('tased'), M.dizzy);
  assert.equal(at('cuffed'), M.dizzy);
  assert.equal(at('custody'), M.grumpy);
  assert.equal(at('flee', { hitUntil: now + 300 }), M.dizzy, 'clipped by the cruiser');
  assert.notEqual(G.MOODS.normal, M.normal, 'the crook wears the masked set; everyone else the plain one');
  assert.equal(G.copM.userData.face.map, G.MOODS.normal);
});

test('ART names: crook.name/crime are deterministic for (badge, count) and seed-independent', () => {
  const run = seed => {
    const G = loadGame({ seed }); G.selectBadge('4821');
    const out = [];
    for (let k = 0; k < 6; k++) { G.career.booked = k; G.respawnCrook(); out.push(G.crook.name + '|' + G.crook.crime); }
    return { out, G };
  };
  const a = run(1), b = run(2);
  assert.deepEqual(a.out, b.out);
  for (const s of a.out) { const [n, c] = s.split('|'); assert.ok(a.G.CROOK_NAMES.includes(n)); assert.ok(a.G.CRIMES.includes(c)); }
  assert.ok(new Set(a.out).size >= 4, 'names vary chase to chase');
  assert.ok(a.G.CROOK_NAMES.length >= 20 && a.G.CRIMES.length >= 20);
  const c = run(1); c.G.selectBadge('1234'); c.G.career.booked = 0; c.G.respawnCrook();
  const again = loadGame({ seed: 3 }); again.selectBadge('1234'); again.career.booked = 0; again.respawnCrook();
  assert.equal(c.G.crook.name, again.crook.name);
});

test('ART names: the respawn pick is unchanged (nameCrook after the rand() use; layout fixture covers the stream)', () => {
  const src = GAME.slice(GAME.indexOf('function respawnCrook(){'));
  const body = src.slice(0, src.indexOf('\n}\n'));
  assert.ok(body.indexOf('nameCrook()') > body.indexOf('rand('), 'nameCrook after rand()');
  assert.doesNotMatch(GAME.slice(GAME.indexOf('function nameCrook'), GAME.indexOf('function nameCrook') + 300), /rand\(|Math\.random/);
});

test('ART radio: spawn in patrol dispatches the name, crime and place; an escape says he got away', () => {
  const G = loadGame(); G.started = true;
  G.respawnCrook(); for (const [id, t] of [...G.timers]) if (t.ms === 0) { G.timers.delete(id); t.fn(); }   // the pump is deferred
  const t = G.dom('radio').textContent;
  assert.equal(t, '📻 Wanted: ' + G.crook.name + '!');                // two short beats (kid-ux 11)
  assert.ok(G.dom('radio').classList.contains('show'));
  assert.match(G.radioQ[0], /^📻 Last seen near (the park|the plaza|the station|the alley|Main St)$/);
  G.emit('escape');
  assert.equal(G.dom('radio').textContent, '💨 ' + G.crook.name + ' got away!');
  assert.equal(G.placeName(-28, 0), 'the park'); assert.equal(G.placeName(-65, 0), 'the station');
});

test('ART radio: the escape line is not cut off by the next spawn; the radio hides under the booking card', () => {
  const G = loadGame(); G.started = true;
  G.emit('escape'); const esc = G.dom('radio').textContent;
  G.emit('spawn');
  assert.equal(G.dom('radio').textContent, esc, 'dispatch waits for the escape line');
  G.respawnCrook(); for (const [id, t] of [...G.timers]) if (t.ms === 0) { G.timers.delete(id); t.fn(); }
  assert.ok(G.dom('radio').classList.contains('show'));
  G.showCard(G.scoreBooked(G.gnow())); G.placeRadio();
  assert.ok(!G.dom('radio').classList.contains('show'), 'radio never sits under #card');
});

test('ART card: booking shows #cardN; #cardS text and the pinned card prefix are unchanged; graduation clears it', () => {
  const G = loadGame(); G.started = true;
  G.run.alertT = 0; G.run.paperwork = 1;
  const sc = G.scoreBooked(G.gnow()); G.showCard(sc);
  assert.equal(G.dom('cardS').textContent, '★ ★ ☆');
  assert.equal(G.dom('cardN').textContent, G.crook.name.toUpperCase() + ' · wanted for: ' + G.crook.crime);
  assert.match(HTML, /<div id="card"><div id="cardH">BOOKED<\/div><div id="cardS">★ ★ ★<\/div><div id="cardL"><\/div><div id="cardR"><\/div><button id="cardGo">/);
  assert.match(GAME, /insertBefore\(n,go\)/, '#cardN goes before #cardGo (after #cardR)');
  G.startAcademy(); G.graduate(G.gnow());
  assert.ok(!G.dom('cardN').textContent.includes(G.crook.name.toUpperCase()), 'graduation replaces the crook line (medal words now)');
});

test('ART confetti: 60 points, identical across seeds, falls under gravity, hidden after 2.5 s; BOOK and graduation burst it', () => {
  const shot = seed => { const G = loadGame({ seed }); G.confettiBurst(-65, 0, 1000); G.confettiStep(1800); return { G, p: Array.from(G.confetti.pos) }; };
  const a = shot(1), b = shot(2);
  assert.equal(a.p.length, 180);
  assert.deepEqual(a.p, b.p);
  assert.ok(a.p.every(Number.isFinite));
  const G = a.G;
  G.confettiStep(1000 + 400); const y1 = G.confetti.pos[1];
  G.confettiStep(1000 + 2400); const y2 = G.confetti.pos[1];
  assert.ok(y2 < y1, 'gravity pulls it down');
  assert.equal(G.confettiStep(1000 + 2600), false, 'hidden when idle');
  const n = G.confetti.burst; G.emit('book', { stars: 3, promoted: false }); assert.equal(G.confetti.burst, n + 1);
  G.emit('graduate', { lap: 30 }); assert.equal(G.confetti.burst, n + 2);
});

test('ART bubble: an alert pops "Can\'t catch me!" over him for 2 s; at most one per 6 s', () => {
  const G = loadGame(); chase(G);
  G.crookM.visible = true;
  const t0 = G.gnow() + 10000; G.advance(10000);
  G.emit('alert', { again: false }); G.bubbleVisuals(G.gnow());
  assert.equal(G.bubble.txt, "Can't catch me!"); assert.ok(G.bubble.s.visible);
  G.advance(2100); G.bubbleVisuals(G.gnow()); assert.ok(!G.bubble.s.visible, 'gone after 2 s');
  G.emit('glance'); G.bubbleVisuals(G.gnow()); assert.ok(!G.bubble.s.visible, 'no second bubble inside 6 s');
  G.advance(4000); G.emit('lost'); G.bubbleVisuals(G.gnow());
  assert.equal(G.bubble.txt, "Where'd he go?"); assert.ok(G.bubble.s.visible);
  assert.ok(t0 > 0);
});

test('ART world: QuadBatch builds from its own arrays; road paint, bollards, trees and walls are ONE mesh', () => {
  const G = loadGame();
  const q = new G.QuadBatch(); q.box(0, 0, 0, 1, 1, 1, 0xff0000);
  assert.equal(q.p.length / 3, 36); assert.equal(q.c.length, q.p.length); assert.equal(q.n.length, q.p.length);
  for (let i = 0; i < q.n.length; i += 3) assert.ok(Math.abs(Math.hypot(q.n[i], q.n[i + 1], q.n[i + 2]) - 1) < 1e-9);
  assert.ok(G.roadPaintM.userData.verts > 5000, 'dashes + 20 zebra crossings + bollards + trees + walls');
  const addB = GAME.slice(GAME.indexOf('function addBollard('), GAME.indexOf('function addBox('));
  assert.doesNotMatch(addB, /new THREE\.Mesh/, 'bollards are batched, not one mesh each');
  assert.doesNotMatch(GAME, /SphereGeometry\(0\.09/, 'dizzy stars are sprites now');
  assert.doesNotMatch(GAME, /ConeGeometry\(2\.2,4\.5/, 'tree crowns are batched boxes');
});

test('ART palette: 6 brighter values, same index formulas', () => {
  const m = GAME.match(/const PALETTE=\[([^\]]+)\]/); assert.ok(m);
  assert.equal(m[1].split(',').length, 6);
  assert.match(GAME, /PALETTE\[\(c\*3\+r\)%6\]/);
});
