/*  test/review-fixes.test.mjs — v0.4 review fixes (the confirmed blockers/majors the harness can see).
    Run:  node --test test/*.test.mjs
      R1  slip ban: the banned subway stays closed until he is 30 m clear (not just the 3 s slipped window)
      R2  slalom: driving straight down the middle costs +1 s per cone (the weave rule)
      R3  start mode: v0.3 veterans default to PATROL; a hand pick survives a relaunch
      R4  graduation: NEW BEST and the medal agree with the 0.1 s times the card shows
      R5  CSS: side safe-area insets, #overlay insets, the short-landscape hint and start screen (static checks;
          the layout itself is measured by test/e2e/smoke.mjs --width 844 --height 340 and cdp-check)
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML } from './harness.mjs';

const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const CSS = HTML.slice(HTML.lastIndexOf('<style>'), HTML.lastIndexOf('</style>'));

function custodyInCar(G, pose) {
  G.started = true; G.mode = 'drive'; G.inputKind = 'keys';
  Object.assign(G.car, { speed: 0, mv: 0, mvRaw: 0, mvPrev: 0, wedged: false, contact: false }, pose);
  Object.assign(G.crook, { state: 'custody', inCar: true, x: G.car.x, z: G.car.z, alerted: true, cuffT: G.now() });
  Object.assign(G.run, { active: true, meter: 0, slips: 0, said50: false, said80: false, saidBay: false });
  G.setKeys({ left: false, right: false, gas: false, brake: false });
}

/* ---------------------------------------------------------------- R1 slip ban */
test('R1 slip ban: 20 s after a slip beside a subway he never escapes down the banned one', () => {
  // review probe poses: each escaped down the BANNED subway 3.0-3.2 s after the slip before the fix
  const poses = [{ x: 102, z: 26, a: -Math.PI / 2 }, { x: 104, z: 30, a: 0 }, { x: -6, z: 80, a: Math.PI / 2 },
    { x: 110, z: 20, a: Math.PI }, { x: 2, z: 78, a: -Math.PI / 2 }];
  let banned = 0;
  for (const pose of poses) {
    const G = loadGame();
    custodyInCar(G, pose); G.run.meter = 1; G.step(1 / 60);
    if (G.crook.state !== 'slipped' || G.crook.banSub < 0) continue;
    banned++;
    const ban = G.crook.banSub, n = G.NODES[ban];
    for (let k = 0; k < 60 * 20 && G.crook.state !== 'escaped'; k++) G.step(1 / 60);
    if (G.crook.state === 'escaped')
      assert.ok(Math.hypot(G.crook.x - n.x, G.crook.z - n.z) > 2.2, `pose ${JSON.stringify(pose)}: escaped down banned subway ${ban}`);
  }
  assert.ok(banned >= 1, 'at least one pose sets a ban');
});
test('R1 slip ban: the exact review repro (car at 102,26 facing -x) — no escape via subway 18 after 3 s', () => {
  const G = loadGame();
  custodyInCar(G, { x: 102, z: 26, a: -Math.PI / 2 }); G.run.meter = 1; G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped'); assert.ok(G.crook.banSub >= 0);
  const n = G.NODES[G.crook.banSub];
  for (let k = 0; k < 60 * 20; k++) {
    G.step(1 / 60);
    if (G.crook.state === 'escaped') { assert.ok(Math.hypot(G.crook.x - n.x, G.crook.z - n.z) > 2.2, 'banned subway used'); break; }
  }
});

/* ---------------------------------------------------------------- R2 slalom weave rule */
function slalomStraight(z) {
  const G = loadGame({ seed: 1 });
  G.started = true; G.inputKind = 'keys'; G.startAcademy({});
  Object.assign(G.car, { x: -100, z, a: Math.PI / 2, speed: 0 });
  G.setKeys({ gas: true });
  for (let t = 0; t < 20 && G.DRILLS[G.acad.step].id === 'slalom'; t += 1 / 60) { G.car.z = z; G.car.a = Math.PI / 2; G.step(1 / 60); }
  return G;
}
test('R2 slalom: flooring it straight down the centre line costs +1 s for every cone', () => {
  const G = slalomStraight(-84);
  assert.notEqual(G.DRILLS[G.acad.step].id, 'slalom', 'the slalom finished');
  assert.equal(G.acad.pen, 7);
  assert.equal(G.events.count('cone'), 7);
  assert.ok(G.CONES.every(c => c.hit && c.miss), 'every cone was a wrong-side pass');
});
test('R2 slalom: a straight line hugging one side still misses the cones on that side', () => {
  const G = slalomStraight(-80.2);             // north of every cone: right side of the south cones, wrong side of the north ones
  assert.ok(G.acad.pen >= 3, `pen ${G.acad.pen}`);
});
test('R2 slalom: passing each cone on the far side of the centre line is clean (+0 s)', () => {
  const G = loadGame({ seed: 1 });
  G.started = true; G.inputKind = 'keys'; G.startAcademy({});
  for (const c of G.CONES) {                   // teleport across each cone's x on the far side
    const z = c.z > G.SLALOM.z ? -86.5 : -81.5;
    Object.assign(G.car, { x: c.x - 0.4, z, a: Math.PI / 2 }); G.step(1 / 60);
    Object.assign(G.car, { x: c.x + 0.4, z }); G.step(1 / 60);
  }
  assert.equal(G.acad.pen, 0); assert.equal(G.events.count('cone'), 0);
});

/* ---------------------------------------------------------------- R3 start mode */
const seedVeteran = G => {
  G.ctx.localStorage.setItem('code3.badges', JSON.stringify({ list: [{ n: '4821' }], current: '4821' }));
  G.ctx.localStorage.setItem('code3.career.4821', JSON.stringify({ stars: 34, booked: 12, escapes: 3, slips: 1 }));
  G.dom('badgeIn').value = '4821';
};
test('R3 start mode: a v0.3 veteran (stars, no academy record) opens on PATROL, a fresh badge on ACADEMY', () => {
  const G = loadGame(); seedVeteran(G); G.renderBadges();
  assert.equal(G.startMode, 'patrol');
  assert.ok(G.dom('segPatrol').classList.contains('on'));
  const F = loadGame();
  F.ctx.localStorage.setItem('code3.badges', JSON.stringify({ list: [{ n: '1111' }], current: '1111' }));
  F.ctx.localStorage.setItem('code3.career.1111', JSON.stringify({ stars: 0, booked: 0, escapes: 0, slips: 0 }));
  F.dom('badgeIn').value = '1111'; F.renderBadges();
  assert.equal(F.startMode, 'academy', 'a brand-new career is steered to the academy');
  const V = loadGame();                        // no badges yet, but the v0.3 single career exists → it is adopted: patrol
  V.ctx.localStorage.setItem('code3.career', JSON.stringify({ stars: 5, booked: 2, escapes: 0, slips: 0 }));
  V.renderBadges();
  assert.equal(V.startMode, 'patrol');
});
test('R3 start mode: a hand pick is stored per badge and survives a relaunch', () => {
  const G = loadGame();
  G.ctx.localStorage.setItem('code3.badges', JSON.stringify({ list: [{ n: '2222' }], current: '2222' }));
  G.ctx.localStorage.setItem('code3.career.2222', JSON.stringify({ stars: 0, booked: 0, escapes: 0, slips: 0 }));
  G.dom('badgeIn').value = '2222'; G.renderBadges();
  assert.equal(G.startMode, 'academy');
  G.pickMode('patrol'); G.startWithBadge();
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career.2222')).startMode, 'patrol');
  const H = loadGame();                        // relaunch: same storage, fresh memory
  for (let i = 0; i < G.ctx.localStorage.length; i++) { const k = G.ctx.localStorage.key(i); H.ctx.localStorage.setItem(k, G.ctx.localStorage.getItem(k)); }
  H.dom('badgeIn').value = '2222'; H.renderBadges();
  assert.equal(H.startMode, 'patrol', 'PATROL pick kept');
  // no hand pick → nothing stored (the automatic preselection never becomes sticky)
  const K = loadGame();
  K.ctx.localStorage.setItem('code3.badges', JSON.stringify({ list: [{ n: '3333' }], current: '3333' }));
  K.dom('badgeIn').value = '3333'; K.renderBadges(); K.startWithBadge();
  assert.equal(JSON.parse(K.ctx.localStorage.getItem('code3.career.3333')).startMode, undefined);
});

/* ---------------------------------------------------------------- R4 graduation rounding */
test('R4 graduation: a lap that shows the same as the best is not a NEW BEST', () => {
  const G = loadGame(); G.started = true; G.startAcademy({});
  G.career.academy = { grad: true, best: { lap: 25.0 } };
  G.acad.only = null; G.acad.lap = 24.98; G.acad.times = { slalom: 10, gates: 14.98 };
  G.graduate(G.now());
  assert.equal(G.dom('cardR').textContent, 'Lap 0:25.0 · Best 0:25.0');
  assert.equal(G.events.count('newBest'), 0);
});
test('R4 graduation: a lap shown as the gold par earns gold', () => {
  const G = loadGame(); G.started = true; G.startAcademy({});
  G.acad.only = null; G.acad.lap = 25.04; G.acad.times = { gates: 25.04 };
  G.graduate(G.now());
  assert.match(G.dom('cardR').textContent, /^Lap 0:25\.0 /);
  assert.equal(G.dom('cardS').textContent, '🥇');
  assert.equal(G.career.academy.best.lap, 25);
});

/* ---------------------------------------------------------------- R5 CSS */
const rule = sel => { const m = CSS.match(new RegExp('(^|\\n)\\s*' + sel.replace(/[#.]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[2] : ''; };
test('R5 CSS: every edge-anchored in-play control adds the side safe-area inset', () => {
  for (const [sel, side] of [['#bAct', 'left'], ['#bTaze', 'left'], ['#bSiren', 'left'], ['#hint', 'left'], ['#actRing', 'left'],
    ['#credit', 'left'], ['#golab', 'right'], ['#settings', 'right']])
    assert.match(rule(sel), new RegExp(side + ':calc\\(\\d+px \\+ env\\(safe-area-inset-' + side + '\\)\\)'), sel);
  assert.match(rule('#hud'), /env\(safe-area-inset-left\)/); assert.match(rule('#hud'), /env\(safe-area-inset-right\)/);
});
test('R5 CSS: #overlay pads for all four safe-area insets (installed PWA, black-translucent status bar)', () => {
  const o = rule('#overlay');
  for (const s of ['top', 'right', 'bottom', 'left']) assert.match(o, new RegExp('env\\(safe-area-inset-' + s + '\\)'), s);
});
test('R5 CSS: short landscape moves #hint beside #bAct and lays the start screen out in two columns', () => {
  assert.match(CSS, /@media \(max-height:480px\)\{#hint\{left:calc\(124px \+ env\(safe-area-inset-left\)\);bottom:calc\(30px \+ env\(safe-area-inset-bottom\)\);\}\}/);
  assert.match(CSS, /@media \(orientation:landscape\) and \(max-height:500px\)\{\s*#overlay\{display:grid;/);
  assert.match(CSS, /@media \(max-height:860px\)\{\s*#overlay p\.sub\{display:none;\}/);
});

/* ---------------------------------------------------------------- round 2 review fixes
      R6  the chip's +Ns freezes with the lap clock; no bump penalty behind the graduation card; the medal in words
      R7  graduation bonus stars that cross a rank line fire 'rank' and say PROMOTED
      R8  the slalom never says "tilt" to a no-tilt kid
      R9  the crook line says 'cadet training' in the academy (there is no crook)
      R10 the next crook never has the same name as the last one
      R11 start screen says v0.4 and mentions the Academy; touch targets ≥ 44 px (static CSS)            */
function acadG(opts = {}) {
  const G = loadGame({ seed: 1 });
  G.started = true; G.inputKind = 'keys'; G.startAcademy(opts);
  return G;
}
test('R6 lap chip: after the lap closes, a later decoy penalty does not show on the chip or the lap', () => {
  const G = acadG();
  G.evalInGame("career.academy={grad:true,best:{}}");        // the clock shows once graduated
  G.acad.step = 1; G.DRILLS[1].setup(G.gnow()); G.acad.gi = G.GATES.length; G.acad.lapT0 = Math.max(1, G.gnow());
  Object.assign(G.car, { x: -65, z: 0, a: -Math.PI / 2, speed: 0 }); G.step(0.6);
  assert.notEqual(G.acad.lapEnd, 0, 'the gates closed the lap');
  const chip = G.dom('acad').innerHTML, lap = G.acad.lap;
  assert.doesNotMatch(chip, /class="pen"/, chip);
  G.acad.pen += 3; G.step(1 / 60);                          // a Grandma cuff in the line-up
  assert.doesNotMatch(G.dom('acad').innerHTML, /\+3s/, 'the chip shows the penalty inside the lap only');
  assert.equal(G.acad.lap, lap);
});
test('R6 graduation card: bumps behind the card cost nothing; #cardN names the medal and the next par', () => {
  const G = acadG();
  const gi = G.DRILLS.findIndex(d => d.id === 'graduate');
  G.acad.lap = G.ACADEMY_PAR.silver + 1; G.acad.times = { slalom: 10, gates: G.acad.lap - 10 };
  G.acad.step = gi; G.DRILLS[gi].setup(G.gnow());
  assert.ok(G.dom('card').classList.contains('grad'));
  assert.equal(G.dom('cardS').textContent, '🥉');
  assert.equal(G.dom('cardN').textContent, 'BRONZE! Next: silver under ' + G.fmtT(G.ACADEMY_PAR.silver).replace(/\.0$/, ''));
  const pen = G.acad.pen; G.events.clear();
  Object.assign(G.car, { mvRaw: 20, mvPrev: 20, speed: 0 }); G.step(1 / 60);
  assert.equal(G.acad.pen, pen, 'no +2 s behind the card'); assert.equal(G.events.count('crash'), 0);
});
test('R7 graduation bonus stars crossing a rank line: rank event + PROMOTED on #cardN, cardH unchanged', () => {
  const G = acadG();
  G.RULES.gradStars = 3; G.career.stars = 4;
  G.acad.lap = 20; G.acad.times = { slalom: 10, gates: 10 };
  G.events.clear(); G.graduate(G.gnow());
  assert.equal(G.career.stars, 7); assert.equal(G.rankFor(7), 'OFFICER');
  assert.equal(G.events.count('rank'), 1); assert.equal(G.events.filter(e => e.type === 'rank')[0].data.rank, 'OFFICER');
  assert.equal(G.dom('cardH').textContent, 'GRADUATED 🎓');
  assert.match(G.dom('cardN').textContent, /^PROMOTED: OFFICER · /);
  const H = acadG(); H.career.stars = 4; H.acad.lap = 20; H.events.clear(); H.graduate(H.gnow());
  assert.equal(H.events.count('rank'), 0, 'default 0 bonus stars: no promotion');
});
test('R8 slalom text: keys get STEER AROUND THE CONES, no-tilt touch the thumb line; tilt keeps TILT TO WEAVE; the toast never says tilt', () => {
  const G = acadG();
  assert.equal(G.hintFor(), 'STEER AROUND THE CONES');
  G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true'); assert.equal(G.hintFor(), 'SLIDE LEFT THUMB TO STEER');   // round3: touch is told how
  G.evalInGame('tilt.fallback=false'); assert.equal(G.hintFor(), 'TILT TO WEAVE');
  assert.doesNotMatch(G.DRILLS[0].line, /tilt/i);
  assert.ok('STEER AROUND THE CONES'.length <= 22);
});
test('R9 academy HUD: the crook line reads cadet training, and patrol takes it back', () => {
  const G = acadG(); G.step(1 / 60);
  assert.equal(G.dom('cstate').textContent, 'cadet training');
  G.startPatrol(); G.step(1 / 60);
  assert.notEqual(G.dom('cstate').textContent, 'cadet training');
});
test('R10 names: consecutive crooks never share a name (badges 1000-2999, 12 in a row); badge 3976 fixed', () => {
  const G = loadGame({ seed: 1 });
  G.evalInGame('globalThis.__mr=0; { const r=Math.random; Math.random=function(){ globalThis.__mr++; return r(); }; }');
  const name = (b, k) => G.CROOK_NAMES[G.evalInGame(`crookNameIdx(${b},${k})`)];
  for (let b = 1000; b < 3000; b++) { let prev = null; for (let k = 0; k < 12; k++) { const n = name(b, k); assert.notEqual(n, prev, `badge ${b} k ${k}`); prev = n; } }
  assert.notEqual(name(3976, 0), name(3976, 1));
  assert.equal(G.evalInGame('globalThis.__mr'), 0, 'no Math.random in the name pick');
});
test('R11 start screen and touch targets (static)', () => {
  assert.match(HTML, /<p class="sub">District prototype v0\.4 ·/);
  assert.match(HTML, /<div id="credit">code 3 · academy · prototype v0\.4<\/div>/);
  assert.match(HTML, /🎓 New\? Try the <b>Academy<\/b> first/);
  assert.match(CSS, /#cardGo\{[^}]*min-height:48px/);
  assert.match(CSS, /#settings button\{[^}]*min-height:44px/);
  assert.match(CSS, /#gear\{pointer-events:auto;[^}]*min-width:44px;min-height:44px/);
  assert.match(CSS, /#bSiren\{[^}]*height:44px/);
  assert.match(CSS, /#alt\{margin-top[^}]*padding:12px 16px/);
});
