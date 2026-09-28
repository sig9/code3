/*  test/foundations.test.mjs — v0.4 stage 1 "foundations": seams + guards.
    Run:  node --test test/*.test.mjs
    Covers: the seeded-layout snapshot (fixtures/layout-v03.json, generated from UNMODIFIED v0.3), the
    Math.random / performance.now allowlists, the single-file structure, the event bus (one emit per action),
    the game clock + pause, the RULES switchboard (each rule in its NON-default position — the defaults are
    covered by the v0.3 tests), the slip gap fixes, the clickBlip → __sfx hand-off and hash32.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const GAME = extractGameScript(HTML);
const val = x => JSON.parse(JSON.stringify(x));           // objects cross the vm realm: compare by value
const nodeIndex = (G, x, z) => { const i = G.NODES.findIndex(n => n.x === x && n.z === z); assert.notEqual(i, -1); return i; };

/* ---------------------------------------------------------------- source scanner
   Splits the game script into top-level statements (braces tracked with comments, strings and simple regex
   literals skipped) and names each: `function X` → X, `const|let|var X=` → X (the LAST declarator of a
   `let a=0, b=…;` list is not needed: every allowlisted symbol is a single declaration), the block-generation
   loop → 'blockgen', anything else → 'top:<first 30 chars>'. Returns [{name, code}] with comments and strings
   blanked out, so a call inside a string or comment never counts. */
function topLevelStatements(src) {
  let out = '', i = 0;
  const n = src.length;
  let lastSig = '';                                       // last significant char, to tell a regex from a division
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      out += c + ' '.repeat(Math.max(0, j - i - 1)) + c; i = j + 1; lastSig = c; continue;
    }
    if (c === '/' && /[(,=:[!&|?{};]/.test(lastSig || ';')) {   // a regex literal
      let j = i + 1, cls = false;
      while (j < n && (src[j] !== '/' || cls)) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; }
      out += '/' + ' '.repeat(Math.max(0, j - i - 1)) + '/'; i = j + 1; lastSig = '/'; continue;
    }
    out += c; if (!/\s/.test(c)) lastSig = c; i++;
  }
  const stmts = []; let depth = 0, start = 0;
  const push = end => { const code = out.slice(start, end).trim(); if (code) stmts.push({ name: nameOf(code), code }); start = end; };
  for (let k = 0; k < out.length; k++) {
    const ch = out[k];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0 && ch === '}') {
      // a function/block statement ends at its closing brace unless an expression continues (`};` `},` `)`)
      const rest = out.slice(k + 1).match(/^\s*(\S)/); if (!rest || !/[;,).]/.test(rest[1])) push(k + 1);
    } }
    else if (ch === ';' && depth === 0) push(k + 1);
  }
  push(out.length);
  return stmts;
}
function nameOf(code) {
  let m = code.match(/^(?:async\s+)?function\s+([\w$]+)/); if (m) return m[1];
  m = code.match(/^(?:const|let|var)\s+([\w$]+)\s*=/); if (m) return m[1];
  if (/^for\s*\(\s*let\s+c\s*=\s*0\s*;\s*c\s*<\s*4/.test(code)) return 'blockgen';
  return 'top:' + code.slice(0, 30).replace(/\s+/g, ' ');
}
function callSites(re) {
  const counts = {};
  for (const s of topLevelStatements(GAME)) {
    const k = (s.code.match(re) || []).length;
    if (k) counts[s.name] = (counts[s.name] || 0) + k;
  }
  return counts;
}

/* ---------------------------------------------------------------- guards */
test('F guard: layout-v03.json — BUILDINGS, BOLLARDS, NODES, EDGE and the first respawn match v0.3 for seeds 1-3', () => {
  const fx = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'layout-v03.json'), 'utf8'));
  for (const seed of [1, 2, 3]) {
    const G = loadGame({ seed }), want = fx.seeds[seed];
    assert.ok(want, `fixture has seed ${seed}`);
    assert.deepEqual(val(G.BUILDINGS), want.BUILDINGS, `seed ${seed}: BUILDINGS (a new Math.random()/rand() call before block generation shifts them)`);
    assert.deepEqual(val(G.BOLLARDS), want.BOLLARDS, `seed ${seed}: BOLLARDS`);
    assert.deepEqual(val(G.NODES), want.NODES, `seed ${seed}: NODES`);
    assert.deepEqual(val(G.EDGE), want.EDGE, `seed ${seed}: EDGE`);
    G.respawnCrook();
    assert.deepEqual({ x: G.crook.x, z: G.crook.z, node: G.nearestNode(G.crook.x, G.crook.z) }, want.respawn,
      `seed ${seed}: first respawn (a new Math.random()/rand() call at load shifts the pick)`);
  }
});

/* The seeded stream: v0.3's calls, pinned by count per top-level statement. v0.4 code uses hash32() only.
   (alertCrook and crookStep are v0.3's look-back timers — not in the stage plan's list, but already there.) */
const RANDOM_ALLOW = { rand: 1, blockgen: 10, newBadgeNumber: 1, respawnCrook: 1, slip: 1, fireTaze: 1, startJuke: 1, alertCrook: 1, crookStep: 1 };
test('F guard: Math.random()/rand( only at the v0.3 sites (rand def, block generation, newBadgeNumber, respawnCrook, slip, fireTaze, startJuke, alertCrook, crookStep)', () => {
  const got = callSites(/Math\.random\s*\(|(?<![\w$.])rand\s*\(/g);
  assert.deepEqual(got, RANDOM_ALLOW, 'a new Math.random()/rand() call: use hash32(a,b) instead (the seeded layout + respawn depend on the stream)');
});
test('F guard: the scanner catches a Math.random() added to hudCareer (mutation check)', () => {
  const mutated = GAME.replace("function hudCareer(){", "function hudCareer(){ const j=Math.random();");
  assert.notEqual(mutated, GAME);
  const counts = {};
  for (const s of topLevelStatements(mutated)) { const k = (s.code.match(/Math\.random\s*\(|(?<![\w$.])rand\s*\(/g) || []).length; if (k) counts[s.name] = (counts[s.name] || 0) + k; }
  assert.notDeepEqual(counts, RANDOM_ALLOW);
  assert.equal(counts.hudCareer, 1);
});
test('F guard: performance.now() only in gnow, setPaused and calibrate (all logic time is gnow())', () => {
  const got = callSites(/performance\.now\s*\(/g);
  assert.deepEqual(Object.keys(got).sort(), ['calibrate', 'gnow', 'setPaused']);
});
test('F guard: structure — exactly one <script id="game">, no local <script src>, audio/sfx never inside #game', () => {
  assert.equal((HTML.match(/<script id="game">/g) || []).length, 1);
  const srcs = [...HTML.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/g)].map(m => m[1]);
  for (const s of srcs) assert.match(s, /^https:\/\//, `local <script src="${s}">`);
  assert.doesNotMatch(GAME, /__sfx\s*=/, 'the audio lane defines __sfx, the game only reads it');
});

/* ---------------------------------------------------------------- helpers */
function custodyInCar(G, pose) {
  G.started = true; G.mode = 'drive'; G.inputKind = 'keys';
  Object.assign(G.car, { speed: 0, mv: 0, mvRaw: 0, mvPrev: 0, wedged: false, contact: false }, pose);
  Object.assign(G.crook, { state: 'custody', inCar: true, x: G.car.x, z: G.car.z, alerted: true, cuffT: G.now() });
  Object.assign(G.run, { active: true, meter: 0, slips: 0, said50: false, said80: false, saidBay: false });
  G.setKeys({ left: false, right: false, gas: false, brake: false });
}
function crossing(G, { d = 6, speed = 7 } = {}) {        // taser.test.mjs's crossing crook
  G.started = true; G.mode = 'foot';
  Object.assign(G.cop, { x: -30, z: 23, a: 0, speed: 0, mv: 0, freezeUntil: 0 });
  const path = [nodeIndex(G, 0, 28), nodeIndex(G, 56, 28), nodeIndex(G, 112, 28)];
  Object.assign(G.crook, { x: -30, z: 23 + d, a: Math.PI / 2, speed, state: 'flee', stam: 6, tired: false,
    alerted: true, path, pi: 0, target: path[2], glanceT: G.now() + 20000, legT: G.now(), alertUntil: 0, dbUntil: 0 });
  G.step(1 / 60);
}
function footNextTo(G, dx = 1.5) {                        // cop on foot beside a calm crook far from the car
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0 });
  Object.assign(G.cop, { x: 30, z: 28, a: 0, speed: 0, mv: 0, freezeUntil: 0 });
  Object.assign(G.crook, { x: 30 + dx, z: 28, a: 0, speed: 0, state: 'calm', alerted: false });
}
function rammed(G) {                                      // crook.test.mjs's S2 rammed setup
  G.started = true; G.mode = 'drive';
  const far = nodeIndex(G, -112, -84);
  Object.assign(G.crook, { x: -20, z: 80, a: -Math.PI / 2, speed: 7, state: 'flee', stam: 6, tired: false, glanceT: G.now() + 9000, legT: G.now(),
    path: [nodeIndex(G, -56, 84), nodeIndex(G, -112, 84), nodeIndex(G, -112, 28), nodeIndex(G, -112, -28), far], pi: 0, target: far });
  Object.assign(G.car, { x: -4, z: 80, a: -Math.PI / 2, speed: 30 }); G.setKeys({ gas: true });
  for (let k = 0; k < 240 && !G.crook.hitCount; k++) G.step(1 / 60);
  assert.equal(G.crook.hitCount, 1, 'clipped');
}

/* ---------------------------------------------------------------- event bus */
test('F events: cuff, book{stars,promoted}, enter, exit fire exactly once per action', () => {
  const G = loadGame();
  footNextTo(G); G.step(1 / 60); G.crook.state = 'calm';
  G.events.clear(); assert.equal(G.affordance(), 'cuff'); G.doAction();
  assert.equal(G.events.count('cuff'), 1);

  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });
  G.events.clear(); G.doAction();
  assert.equal(G.events.count('book'), 1);
  const b = G.events.find(e => e.type === 'book').data;
  assert.equal(b.stars, 3); assert.equal(typeof b.promoted, 'boolean');

  const H = loadGame(); H.started = true; H.mode = 'drive'; Object.assign(H.car, { speed: 0 });
  H.events.clear(); assert.equal(H.affordance(), 'exit'); H.doAction();
  assert.equal(H.events.count('exit'), 1); assert.equal(H.mode, 'foot');
  H.step(1 / 60); H.events.clear(); assert.equal(H.affordance(), 'enter'); H.doAction();
  assert.equal(H.events.count('enter'), 1); assert.equal(H.mode, 'drive');
});
test('F events: rank{rank} rides a promoting booking', () => {
  const G = loadGame();
  G.career.stars = 5;
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });
  G.events.clear(); G.doAction();
  assert.deepEqual(val(G.events.find(e => e.type === 'book').data), { stars: 3, promoted: true });
  assert.deepEqual(val(G.events.filter(e => e.type === 'rank').map(e => e.data)), [{ rank: 'OFFICER' }]);
});
test('F events: tazeFire at the click, then tazeHit — or tazeMiss{juked}', () => {
  const G = loadGame(); crossing(G);
  G.events.clear(); assert.equal(G.fireTaze(G.gnow(), 1), true);
  assert.equal(G.events.count('tazeFire'), 1); assert.equal(G.events.count('tazeHit'), 0);
  G.step(0.8);
  assert.equal(G.events.count('tazeHit'), 1); assert.equal(G.events.count('tazeMiss'), 0); assert.equal(G.events.count('tazeFire'), 1);
  const H = loadGame(); crossing(H);
  H.events.clear(); assert.equal(H.fireTaze(H.gnow(), 0), true);   // roll 0: he jukes
  H.step(0.8);
  assert.equal(H.events.count('tazeFire'), 1); assert.equal(H.events.count('tazeHit'), 0);
  assert.deepEqual(val(H.events.filter(e => e.type === 'tazeMiss').map(e => e.data)), [{ juked: true }]);
});
test('F events: alert{again}, glance, siren{on}, spawn', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 20, z: 28, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 30, z: 28, state: 'calm', alerted: false });
  G.events.clear(); G.step(1 / 60);
  assert.deepEqual(val(G.events.filter(e => e.type === 'alert').map(e => e.data)), [{ again: false }]);
  G.crook.glanceT = G.gnow(); G.crook.alertUntil = 0; G.events.clear(); G.step(1 / 60);
  assert.equal(G.events.count('glance'), 1);
  G.events.clear(); G.toggleSiren(); G.toggleSiren();
  assert.deepEqual(val(G.events.filter(e => e.type === 'siren').map(e => e.data)), [{ on: true }, { on: false }]);
  G.events.clear(); G.respawnCrook();
  assert.equal(G.events.count('spawn'), 1);
});
test('F events: slip, escape, crash, clip', () => {
  const G = loadGame();
  custodyInCar(G, { x: 20, z: 28, a: Math.PI / 2 });
  G.run.meter = 1; G.events.clear(); G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped'); assert.equal(G.events.count('slip'), 1);

  const E = loadGame(); E.started = true; E.mode = 'drive';
  const sub = E.NODES[E.SUBWAYS[1]];
  Object.assign(E.crook, { x: sub.x, z: sub.z - 1, state: 'flee', alerted: true, glanceT: E.now() + 9000 });
  E.events.clear(); E.step(1 / 60);
  assert.equal(E.crook.state, 'escaped'); assert.equal(E.events.count('escape'), 1);

  const C = loadGame(); C.started = true; C.mode = 'drive'; C.inputKind = 'keys';
  Object.assign(C.car, { x: -97, z: -84, a: 0, speed: 20, mv: 20, mvRaw: 20, mvPrev: 20 });
  C.run.paperwork = 0; C.run.hitT = -1e9; C.events.clear(); C.step(0.5);
  assert.equal(C.run.paperwork, 1); assert.equal(C.events.count('crash'), 1);

  const R = loadGame(); R.events.clear(); rammed(R);
  assert.equal(R.events.count('clip'), 1);
});
test('F events: a throwing listener never breaks the game; clickBlip hands off to __sfx.click()', () => {
  const G = loadGame();
  G.onFx(() => { throw new Error('boom'); });
  crossing(G);
  let clicks = 0; G.ctx.__sfx = { click() { clicks++; } };
  assert.equal(G.fireTaze(G.gnow(), 1), true);
  assert.equal(clicks, 1, 'the taser click goes to the audio module');
  assert.equal(G.events.count('tazeFire'), 1, 'later listeners still run');
});

/* ---------------------------------------------------------------- clock + pause */
test('F pause: cuff, pause, 10 s of wall time, resume, 1 s → still inside the 2.5 s cuff beat', () => {
  const G = loadGame();
  footNextTo(G); G.step(1 / 60); G.crook.state = 'calm';
  G.doAction(); assert.equal(G.crook.state, 'cuffed');
  assert.equal(G.setPaused(true), true); assert.equal(G.paused, true);
  const g0 = G.gnow(); G.advance(10000);
  assert.equal(G.gnow(), g0, 'the game clock stands still while paused');
  G.setKeys({ gas: true });
  assert.equal(G.setPaused(false), false); assert.equal(G.paused, false);
  assert.equal(G.keys.gas, false, 'held inputs are dropped on resume');
  G.step(1);
  assert.ok(G.gnow() < G.cop.freezeUntil, `gnow ${G.gnow()} < freezeUntil ${G.cop.freezeUntil}`);
  assert.equal(G.crook.state, 'cuffed');
  G.step(2); assert.equal(G.crook.state, 'custody');
});
test('F pause: the gear pauses while started (closing resumes); blur shows the veil only while started; its tap resumes', () => {
  const G = loadGame();
  G.fire('blur'); assert.equal(G.paused, false, 'title screen: never paused');
  G.dom('gear').dispatch('pointerdown'); assert.equal(G.paused, false);
  G.dom('gear').dispatch('pointerdown');
  G.started = true;
  G.dom('gear').dispatch('pointerdown'); assert.equal(G.paused, true, 'settings open');
  G.dom('gear').dispatch('pointerdown'); assert.equal(G.paused, false, 'settings closed');
  G.fire('blur'); assert.equal(G.paused, true); assert.ok(G.dom('pause').classList.contains('on'));
  G.dom('pause').dispatch('pointerdown'); assert.equal(G.paused, false); assert.ok(!G.dom('pause').classList.contains('on'));
});
test('F pause: action buttons and action keys do nothing while paused', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive'; Object.assign(G.car, { speed: 0 });
  G.setPaused(true);
  G.dom('bAct').dispatch('pointerdown', { pointerType: 'touch' });
  G.fire('keydown', { code: 'Space' }); G.fire('keydown', { code: 'KeyE' });
  assert.equal(G.mode, 'drive', 'no EXIT under the pause veil');
  const s0 = G.siren.on;
  G.dom('bSiren').dispatch('pointerdown'); G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, s0, 'no siren toggle while paused');
  G.setPaused(false);
  G.fire('keydown', { code: 'Space' });
  assert.equal(G.mode, 'foot', 'Space exits again once resumed');
});

/* ---------------------------------------------------------------- RULES (non-default positions) */
test('F rules: defaults equal v0.3 (slipSubwayBan the one flagged exception); loadRules merges code3.rules, ignores junk', () => {
  const G = loadGame();
  assert.deepEqual(val(G.RULES), { ramCost: 'none', enterGraceS: 0, bookMaxMv: 3, parFromSlip: false, slipSubwayBan: true, gradStars: 0 });
  G.ctx.localStorage.setItem('code3.rules', JSON.stringify({ ramCost: 'burst', gradStars: 3, bookMaxMv: 'fast', bogus: 1 }));
  G.loadRules();
  assert.deepEqual(val(G.RULES), { ramCost: 'burst', enterGraceS: 0, bookMaxMv: 3, parFromSlip: false, slipSubwayBan: true, gradStars: 3 });
  G.ctx.localStorage.setItem('code3.rules', '{not json');
  G.loadRules(); assert.equal(G.RULES.ramCost, 'none');
});
test('F rules: each rule is read at exactly one site', () => {
  for (const k of ['ramCost', 'enterGraceS', 'bookMaxMv', 'parFromSlip', 'slipSubwayBan', 'gradStars'])   // gradStars: graduate() (stage 2)
    assert.equal((GAME.match(new RegExp('RULES\\.' + k + '\\b', 'g')) || []).length, 1, k);
});
test('F rules: ramCost paperwork / burst', () => {
  const P = loadGame(); P.RULES.ramCost = 'paperwork'; P.run.paperwork = 0; rammed(P);
  assert.equal(P.run.paperwork, 1, 'a ram costs paperwork');
  const B = loadGame(); B.RULES.ramCost = 'burst'; rammed(B);
  assert.ok(B.crook.burstUntil > B.crook.hitUntil, 'he comes out of the stagger spooked');
  const N = loadGame(); rammed(N);
  assert.equal(N.crook.burstUntil, 0); assert.equal(N.run.paperwork, 0);
});
test('F rules: enterGraceS holds the meter N s after ENTER with him aboard', () => {
  for (const [grace, wantZeroAt3s] of [[4, true], [0, false]]) {
    const G = loadGame(); G.RULES.enterGraceS = grace;
    custodyInCar(G, { x: 20, z: 28, a: Math.PI / 2 });
    G.crook.inCar = false; G.mode = 'foot';
    Object.assign(G.cop, { x: 20, z: 30.5, a: 0, speed: 0, freezeUntil: 0 });
    G.step(1 / 60); G.run.meter = 0;
    assert.equal(G.affordance(), 'enter'); G.doAction();
    assert.equal(G.crook.inCar, true);
    G.step(3);
    assert.equal(G.run.meter === 0, wantZeroAt3s, `grace ${grace}: meter ${G.run.meter.toFixed(3)} after 3 s parked`);
    if (grace) { G.step(2); assert.ok(G.run.meter > 0.1, 'fills once the grace is over'); }
  }
});
test('F rules: bookMaxMv 6 books at 5 m/s in the bay', () => {
  const G = loadGame(); G.RULES.bookMaxMv = 6;
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2, speed: 5, mv: 5, mvRaw: 5, mvPrev: 5 });
  assert.equal(G.affordance(), 'book');
});
test('F rules: parFromSlip restarts the par clock at the slip', () => {
  const G = loadGame(); G.RULES.parFromSlip = true;
  custodyInCar(G, { x: 20, z: 28, a: Math.PI / 2 }); G.run.alertT = 1;
  G.run.meter = 1; G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped'); assert.equal(G.run.alertT, G.gnow());
  const H = loadGame(); custodyInCar(H, { x: 20, z: 28, a: Math.PI / 2 }); H.run.alertT = 1;
  H.run.meter = 1; H.step(1 / 60); assert.equal(H.run.alertT, 1, 'default: par keeps the first alert');
});

/* ---------------------------------------------------------------- gap fixes */
test('F gap (a): a slip beside a wall never drops him inside the car capsule', () => {
  // cop door toward the south perimeter wall; v0.3 pushed him off the wall into the capsule
  for (const pose of [{ x: -30, z: -88.7, a: -Math.PI / 2 }, { x: -60.7, z: -16, a: 0.1 }, { x: -60.7, z: -16, a: 0.3 }, { x: 20, z: 28, a: Math.PI / 2 }]) {
    const G = loadGame();
    custodyInCar(G, pose); G.run.meter = 1; G.step(1 / 60);
    assert.equal(G.crook.state, 'slipped');
    assert.equal(G.inCar(G.crook.x, G.crook.z, 0.45), false, `pose ${JSON.stringify(pose)} → (${G.crook.x.toFixed(2)},${G.crook.z.toFixed(2)})`);
  }
  // open street: still the far door, 2.5 m off (the v0.3 spot)
  const G = loadGame(); custodyInCar(G, { x: 20, z: 28, a: Math.PI / 2 }); G.run.meter = 1; G.step(1 / 60);
  assert.ok(Math.abs(G.crook.z - 28 - 2.5) < 0.2 && Math.abs(G.crook.x - 20) < 0.3, `far door (${G.crook.x.toFixed(2)},${G.crook.z.toFixed(2)})`);
});
test('F gap (b): a slip 3 m from the (0,0) subway is a chase, not an instant escape', () => {
  // car 3 m south of the (-112,-84) subway, far door toward it: v0.3 dropped him 0.5 m from the node → escaped in 2 steps
  const G = loadGame();
  const s = nodeIndex(G, -112, -84);
  custodyInCar(G, { x: -112, z: -87, a: Math.PI / 2 });
  G.run.meter = 1; G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped'); assert.equal(G.crook.banSub, s);
  for (let k = 0; k < 180; k++) { G.step(1 / 60); assert.notEqual(G.crook.state, 'escaped', `escaped at step ${k}`); }
  assert.notEqual(G.crook.target, G.crook.banSub);
  // the ban clears on respawn
  G.respawnCrook(); assert.equal(G.crook.banSub, -1);
  // RULES.slipSubwayBan off = v0.3: no ban, and the adjacent subway takes him
  const H = loadGame(); H.RULES.slipSubwayBan = false;
  custodyInCar(H, { x: -112, z: -87, a: Math.PI / 2 });
  H.run.meter = 1; H.step(1 / 60);
  assert.equal(H.crook.banSub, -1);
  for (let k = 0; k < 180 && H.crook.state !== 'escaped'; k++) H.step(1 / 60);
  assert.equal(H.crook.state, 'escaped', 'v0.3 behaviour: straight down the subway');
});
test('F gap (b): the ban lifts once he is 30 m from the subway', () => {
  const G = loadGame();
  custodyInCar(G, { x: -112, z: -87, a: Math.PI / 2 });
  G.run.meter = 1; G.step(1 / 60);
  assert.ok(G.crook.banSub >= 0);
  G.crook.x = -112; G.crook.z = -40; G.crook.state = 'flee'; G.step(1 / 60);
  assert.equal(G.crook.banSub, -1);
});
test('F gap (c) dropped: the in-bay BOOK-dimmed guard would break jail.test "rolling through the bay at 5 m/s → exit"', () => {
  const G = loadGame();
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2, speed: 5, mv: 5, mvRaw: 5, mvPrev: 5 });
  assert.equal(G.affordance(), 'exit');
});
test('F named head: makePerson tags userData.head (the look-back turns it, not children[2])', () => {
  assert.match(GAME, /g\.userData\.head=head/);
  assert.match(GAME, /crookM\.userData\.head/);
  assert.doesNotMatch(GAME, /crookM\.children\[2\]/);
});

/* ---------------------------------------------------------------- hash32 + settings */
test('F hash32: deterministic, in [0,1), spread', () => {
  const G = loadGame();
  assert.equal(G.hash32(3, 7), G.hash32(3, 7));
  assert.notEqual(G.hash32(3, 7), G.hash32(7, 3));
  let sum = 0, lo = 1, hi = 0;
  const seen = new Set();
  for (let a = 0; a < 50; a++) for (let b = 0; b < 40; b++) {
    const v = G.hash32(a, b); assert.ok(v >= 0 && v < 1); sum += v; lo = Math.min(lo, v); hi = Math.max(hi, v); seen.add(v);
  }
  assert.ok(Math.abs(sum / 2000 - 0.5) < 0.03, `mean ${sum / 2000}`);
  assert.ok(lo < 0.01 && hi > 0.99); assert.ok(seen.size > 1990);
});
test('F settings: House rules buttons cycle a rule and persist it to code3.rules', () => {
  const G = loadGame();
  const rows = () => G.dom('rules').children.slice(-6);   // the stub's innerHTML='' does not clear children
  assert.equal(rows().length, 6);
  const btn = rows()[0].children[1];
  assert.equal(btn.textContent, 'nothing');
  btn.dispatch('click');
  assert.equal(G.RULES.ramCost, 'paperwork');
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.rules')).ramCost, 'paperwork');
  assert.equal(rows()[0].children[1].textContent, 'paperwork');
  for (const r of rows()) assert.ok(r.children[0].textContent.split(/\s+/).length <= 8, 'labels ≤ 8 words');
});
