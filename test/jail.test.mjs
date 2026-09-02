/*  test/jail.test.mjs — S4 jail run + scoring against the real game logic.
    Run:  node --test test/*.test.mjs
    Covers: Precinct 3 layout, the escape meter table, the escort tether, scoring + rank + localStorage,
    the slip → re-cuff → book → card → respawn flow, BOOK gating and the paperwork detector.
    Fixed geometry only (the station block, the perimeter, the alley/park/plaza colliders).
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML } from './harness.mjs';

const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);   // objects cross the vm realm: compare by value

const inAABB = (b, x, z) => x > b.x1 && x < b.x2 && z > b.z1 && z < b.z2;
const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.z1 < b.z2 && a.z2 > b.z1;
const near = (b, x, z, m) => x > b.x1 - m && x < b.x2 + m && z > b.z1 - m && z < b.z2 + m;
const PAR = 45;

/* a crook in custody in the back of the cruiser, the cop driving */
function custodyInCar(G, pose) {
  G.started = true; G.mode = 'drive'; G.inputKind = 'keys';
  Object.assign(G.car, { speed: 0, mv: 0, mvRaw: 0, mvPrev: 0, wedged: false, contact: false }, pose);
  Object.assign(G.crook, { state: 'custody', inCar: true, x: G.car.x, z: G.car.z, alerted: true, cuffT: G.now() });
  Object.assign(G.run, { active: true, meter: 0, slips: 0, said50: false, said80: false, saidBay: false });
  G.setKeys({ left: false, right: false, gas: false, brake: false });
}
const stepUntil = (G, pred, maxS) => {                    // steps 1/60 until pred() or maxS; returns elapsed s or null
  const t0 = G.now();
  for (let i = 0; i < Math.round(maxS * 60); i++) { G.step(1 / 60); if (pred()) return (G.now() - t0) / 1000; }
  return null;
};

/* ---------------------------------------------------------------- layout */
test('S4 layout: Precinct 3 at block (0,1) — bay clear of buildings, nodes and bollards; 35 nodes all reaching 3 subways; inBay', () => {
  const G = loadGame();
  const { BAY, BUILDINGS, NODES, BOLLARDS, SUBWAYS } = G;
  same(BAY, { x1: -70, x2: -60, z1: -10, z2: 10 });
  same(G.STATION, { x: -65, z: 0 });
  for (const b of BUILDINGS) assert.ok(!overlap(BAY, b), `BAY overlaps building ${JSON.stringify(b)}`);
  for (const box of [{ x1: -106, x2: -70, z1: -22, z2: 22 }, { x1: -70, x2: -62, z1: -22, z2: -10 }, { x1: -70, x2: -62, z1: 10, z2: 22 }])
    assert.ok(BUILDINGS.some(b => b.x1 === box.x1 && b.x2 === box.x2 && b.z1 === box.z1 && b.z2 === box.z2), `station box ${JSON.stringify(box)} missing`);
  for (const n of NODES) assert.ok(!near(BAY, n.x, n.z, 3), `node (${n.x},${n.z}) within 3 m of the bay`);
  for (const b of BOLLARDS) assert.ok(!near(BAY, b.x, b.z, 3), `bollard (${b.x},${b.z}) within 3 m of the bay`);
  assert.equal(NODES.length, 35);
  assert.equal(SUBWAYS.length, 3);
  for (let i = 0; i < NODES.length; i++) for (const s of SUBWAYS) assert.ok(G.bfsPath(i, s), `node ${i} cannot reach subway ${s}`);
  assert.equal(G.inBay(-65, 0), true);
  assert.equal(G.inBay(-58, 0), false);
  assert.equal(G.inBay(-65, 10), false, 'edges are exclusive');
  assert.equal(G.inBay(-69, -9), true);
  // a car (r 1.6) nosed in at the bay centre is not pushed by any collider
  const [cx, cz] = G.collide(-65, 0, 1.6);
  assert.ok(Math.hypot(cx + 65, cz) < 1e-9, 'a car parked at (-65,0) is not displaced by walls');
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /\['alleyNS','station','build'\]/);
  assert.ok(html.includes('addBeam(-65,0,0x4da3ff)'), 'blue station beam');
  assert.ok(html.includes("addBeam(kx,kz,0x5ee08a)"), 'subway beams go through addBeam too');
  { const st = html.indexOf("t==='station'"); const branch = html.slice(st, html.indexOf('}else if(', st + 1));
    const code = branch.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(branch.length > 200 && !/\brand\(/.test(code), 'the station branch makes no rand() calls (deterministic geometry)'); }
});

/* ---------------------------------------------------------------- escape meter */
test('S4 meter: parked outside the bay → slipped at 4.0–4.1 s, run.slips 1, he is out of the car on the far side', () => {
  const G = loadGame();
  custodyInCar(G, { x: -40, z: 28, a: Math.PI / 2 });      // on the z=28 street, well outside the bay
  const t = stepUntil(G, () => G.crook.state === 'slipped', 6);
  assert.ok(t !== null && t >= 4.0 && t <= 4.1, `slipped at ${t} s`);
  assert.equal(G.run.slips, 1);
  assert.equal(G.crook.inCar, false);
  assert.equal(G.run.meter, 0); assert.equal(G.run.active, false);
  assert.equal(G.dom('msg').textContent, "💨 He slipped the cuffs — he's running!");
  assert.equal(G.dom('cstate').textContent, 'slipped the cuffs!');
  // out on the passenger side (opposite the cop's exit spot at +cos(a),-sin(a)) and clear of the capsule
  const sx = -Math.cos(G.car.a), sz = Math.sin(G.car.a);
  assert.ok((G.crook.x - G.car.x) * sx + (G.crook.z - G.car.z) * sz > 1.5, 'crook steps out on the far side');
  assert.ok(!G.inCar(G.crook.x, G.crook.z, 0.45), 'not inside the cruiser capsule');
  assert.ok(G.crook.path && G.crook.path.length, 'he has a route');
  assert.equal(G.crook.tired, false); assert.equal(G.crook.stam, 6);
});

test('S4 meter: 0.5 at >8 m/s on the open road drains to 0 within 4.5 s', () => {
  const G = loadGame();
  custodyInCar(G, { x: -100, z: -88, a: Math.PI / 2, speed: 20, mv: 20, mvRaw: 20, mvPrev: 20 });
  G.run.meter = 0.5;
  G.setKeys({ gas: true });
  const t = stepUntil(G, () => G.run.meter === 0, 4.5);
  assert.ok(t !== null, `meter still ${G.run.meter.toFixed(3)} after 4.5 s (car.mv ${G.car.mv.toFixed(1)})`);
  assert.equal(G.crook.state, 'custody');
  assert.equal(G.dom('cpct').textContent, '0%');
});

test('S4 meter: parked IN the bay 10 s → meter unchanged, no slip, "Stop in the bay" said once', () => {
  const G = loadGame();
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });      // nose-in, facing -x
  G.run.meter = 0.3;
  G.step(10);
  assert.equal(G.run.meter, 0.3);
  assert.equal(G.crook.state, 'custody');
  assert.equal(G.run.slips, 0);
  assert.equal(G.run.saidBay, true);
  assert.equal(G.dom('msg').textContent, 'Stop in the bay, tap BOOK');
});

test('S4 meter: a car pinned against a wall with the gas held (speed > 0, mv ≈ 0) slips him at ~4 s', () => {
  const G = loadGame();
  custodyInCar(G, { x: -97, z: -79.6, a: 0 });             // already pinned on the alley building face (the B5a wedge spot), heading +z
  G.setKeys({ gas: true });
  let sawRev = false;
  const t = stepUntil(G, () => { if (G.car.speed > 0 && G.car.mv < 1) sawRev = true; return G.crook.state === 'slipped'; }, 6);
  assert.ok(sawRev, 'the engine revs with no ground motion during the wait');
  assert.ok(t !== null && t >= 3.9 && t <= 4.6, `slipped at ${t} s`);
});

test('S4 meter: escort on foot with the cop standing on keys → slip at ~25 s, with the 50 % and 80 % lines on the way', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: -30, z: 28, a: Math.PI / 2, speed: 0, freezeUntil: 0 });
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0, mv: 0 });
  Object.assign(G.crook, { state: 'custody', inCar: false, x: -32, z: 28, alerted: true });
  Object.assign(G.run, { active: true, meter: 0, slips: 0, said50: false, said80: false });
  const t50 = stepUntil(G, () => G.run.said50, 30);
  assert.ok(t50 !== null && Math.abs(t50 - 12.5) < 0.1, `50 % at ${t50} s`);
  assert.equal(G.dom('msg').textContent, "🔓 He's squirming — keep moving!");
  assert.equal(G.dom('cfill').className, 'warn');
  const t80 = stepUntil(G, () => G.run.said80, 30);
  assert.ok(t80 !== null && Math.abs(t50 + t80 - 20) < 0.1, `80 % at ${t50 + t80} s`);
  assert.equal(G.dom('msg').textContent, "🔓 He's nearly out of the cuffs!");
  assert.equal(G.dom('cfill').className, 'hot');
  const t100 = stepUntil(G, () => G.crook.state === 'slipped', 30);
  assert.ok(t100 !== null && Math.abs(t50 + t80 + t100 - 25) < 0.1, `slip at ${t50 + t80 + t100} s`);
  assert.equal(G.dom('cline').classList.contains('on'), false, 'the meter line hides once he is loose');
});

test('S4 meter: HUD line 4 shows only while he is in custody; width and class track the meter', () => {
  const G = loadGame();
  custodyInCar(G, { x: -40, z: 28, a: Math.PI / 2 });
  G.step(1 / 60);
  assert.equal(G.dom('cline').classList.contains('on'), true);
  G.run.meter = 0.42; G.step(1 / 60);
  assert.equal(G.dom('cfill').style.width, '42%'); assert.equal(G.dom('cpct').textContent, '42%');
  assert.equal(G.dom('cfill').className, '');
  G.crook.state = 'flee'; G.crook.inCar = false; G.crook.path = null; G.step(1 / 60);
  assert.equal(G.run.active, false);
  assert.equal(G.dom('cline').classList.contains('on'), false);
});

/* ---------------------------------------------------------------- escort */
test('S4 escort: a 5 s sprint with turns keeps him 1.0–3.5 m behind, never in a building, never in the cruiser', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0, mv: 0 });
  // start on the z=84 perimeter street heading +x (walls at z=90; the (0,2) alley block spans x -22..22 on the south side)
  Object.assign(G.cop, { x: -50, z: 84, a: Math.PI / 2, speed: 0, freezeUntil: 0 });
  Object.assign(G.crook, { state: 'custody', inCar: false, x: -52, z: 84, a: Math.PI / 2, alerted: true });
  Object.assign(G.run, { active: true, meter: 0 });
  G.setKeys({ gas: true });
  let minD = Infinity, maxD = 0;
  const check = () => {
    const d = Math.hypot(G.cop.x - G.crook.x, G.cop.z - G.crook.z);
    minD = Math.min(minD, d); maxD = Math.max(maxD, d);
    for (const b of G.BUILDINGS) assert.ok(!inAABB(b, G.crook.x, G.crook.z), `crook inside a building at (${G.crook.x.toFixed(1)},${G.crook.z.toFixed(1)}) t=${G.now()}`);
    assert.ok(!G.inCar(G.crook.x, G.crook.z, 0.45), 'crook inside the cruiser capsule');
  };
  const run = (s, k) => { G.setKeys(k); for (let i = 0; i < Math.round(s * 60); i++) { G.step(1 / 60); check(); } };
  run(1.2, { gas: true });                                  // settle into the sprint
  minD = Infinity; maxD = 0;
  run(1.0, { gas: true, left: true });                      // swing left (toward the wall side)
  run(1.0, { gas: true, right: true, left: false });        // and back right
  run(1.0, { gas: true, right: true });                     // keep turning: a U-turn on the street
  run(1.0, { gas: true, right: false, left: true });
  run(1.0, { gas: true, left: false });
  assert.ok(minD >= 1.0 && maxD <= 3.5, `tether distance ranged ${minD.toFixed(2)}–${maxD.toFixed(2)} m`);
  assert.equal(G.crook.state, 'custody');
  assert.equal(G.dom('cstate').textContent, 'in custody');
});

test('S4 escort: an ENTER with him in tow seats him in the car; EXIT leaves him there and the meter runs at 0.25/s', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0, mv: 0 });
  Object.assign(G.cop, { x: -97.5, z: -87, a: Math.PI / 2, speed: 0, freezeUntil: 0 });
  Object.assign(G.crook, { state: 'custody', inCar: false, x: -99.5, z: -87, alerted: true });
  Object.assign(G.run, { active: true, meter: 0 });
  assert.equal(G.affordance(), 'enter');
  G.doAction();
  assert.equal(G.mode, 'drive'); assert.equal(G.crook.inCar, true);
  assert.equal(G.dom('msg').textContent, 'Back in the cruiser — drive him to the station');
  G.step(0.5);
  assert.equal(G.crook.x, G.car.x); assert.equal(G.crook.z, G.car.z);
  assert.equal(G.affordance(), 'exit', 'outside the bay the button is EXIT, not BOOK');
  const m0 = G.run.meter;
  G.doAction();                                             // cop gets out
  assert.equal(G.mode, 'foot'); assert.equal(G.crook.inCar, true, 'the crook stays in the car');
  G.step(2);
  assert.ok(Math.abs(G.run.meter - m0 - 0.5) < 0.02, `meter +0.5 in 2 s with him left in the car (${(G.run.meter - m0).toFixed(3)})`);
  assert.equal(G.crook.x, G.car.x);
  assert.equal(G.affordance(), 'enter');
  G.doAction();                                             // back in: still 'drive him to the station'
  assert.equal(G.crook.inCar, true); assert.equal(G.mode, 'drive');
});

/* ---------------------------------------------------------------- scoring + career */
test('S4 scoring: (30 s, 0 pw) 3★ · (50, 0) 2★ · (30, 1) 2★ · (50, 2) 1★ · never alerted = par met', () => {
  const G = loadGame();
  const score = (parS, pw, alerted = true) => {
    G.run.alertT = alerted ? 1000 : 0; G.run.cuffT = 1000 + parS * 1000; G.run.paperwork = pw;
    return G.scoreBooked(G.run.cuffT + 5000);
  };
  let s = score(30, 0); assert.equal(s.n, 3); assert.equal(s.par, true); assert.equal(s.style, true); assert.equal(s.parS, 30);
  s = score(50, 0); assert.equal(s.n, 2); assert.equal(s.par, false); assert.equal(s.style, true);
  s = score(30, 1); assert.equal(s.n, 2); assert.equal(s.par, true); assert.equal(s.style, false);
  s = score(50, 2); assert.equal(s.n, 1);
  s = score(0, 0, false); assert.equal(s.n, 3, 'sneaked up on him: par met'); assert.equal(s.parS, 0);
  s = score(45, 0); assert.equal(s.par, true, 'exactly par counts');
  assert.equal(G.career.stars, 14); assert.equal(G.career.booked, 6);
});

test('S4 scoring: a slip at 20 s and a re-cuff at 50 s loses par (the par clock starts at the first alert and never resets)', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0, mv: 0 });
  G.step(1);                                                // t = 1 s
  // the alert: a calm crook 8 m from the cop on foot
  Object.assign(G.crook, { state: 'calm', x: -30, z: 28, alerted: false });
  Object.assign(G.cop, { x: -30, z: 36, a: 0, speed: 0 });
  G.step(1 / 60);
  assert.equal(G.crook.state, 'flee');
  const tA = G.run.alertT; assert.ok(Math.abs(tA - G.now()) < 1e-6, 'alertT stamped on the first alert');
  // first cuff at +10 s
  G.step(10 - 1 / 60);
  Object.assign(G.cop, { x: G.crook.x, z: G.crook.z, speed: 0 }); G.crook.state = 'flee';
  assert.equal(G.affordance(), 'cuff'); G.doAction();
  G.step(2.6);
  assert.equal(G.crook.state, 'custody');
  G.run.meter = 1; G.step(1 / 60);                          // slip at ~+20 s
  assert.equal(G.crook.state, 'slipped');
  assert.equal(G.run.alertT, tA, 'the slip keeps the par clock');
  // re-alerts after the slip do not restamp it
  G.crook.state = 'flee'; G.crook.lost = true; G.step(1 / 60);
  assert.equal(G.run.alertT, tA);
  // park him (calm, cop out of earshot) so he does not reach a subway while the clock runs to +50 s
  G.crook.state = 'calm'; Object.assign(G.cop, { x: 100, z: 80 });
  G.step(50 - (G.now() - tA) / 1000);
  assert.equal(G.crook.state, 'calm'); assert.equal(G.run.alertT, tA);
  Object.assign(G.cop, { x: G.crook.x, z: G.crook.z, speed: 0, freezeUntil: 0 }); G.crook.state = 'flee';
  assert.equal(G.affordance(), 'cuff'); G.doAction();
  G.step(2.6);
  assert.equal(G.crook.state, 'custody');
  assert.ok(G.run.meter < 0.01, `custody again with an empty meter (${G.run.meter.toFixed(4)}: 0.1 s of escort)`);
  const s = G.scoreBooked(G.now());
  assert.equal(s.par, false, `parS ${s.parS.toFixed(1)} > 45`);
  assert.ok(s.parS > 49 && s.parS < 53, `parS ${s.parS}`);
  assert.equal(s.style, true);
  assert.equal(s.n, 2);
});

test('S4 scoring: an escape is 0 stars, career.escapes +1 and saved', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0 });
  const sub = G.NODES[G.SUBWAYS[1]];
  Object.assign(G.crook, { state: 'flee', x: sub.x - 1, z: sub.z, alerted: true, path: null });
  const stars = G.career.stars, esc = G.career.escapes;
  G.step(1 / 60);
  assert.equal(G.crook.state, 'escaped');
  assert.equal(G.career.stars, stars);
  assert.equal(G.career.escapes, esc + 1);
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career')).escapes, esc + 1);
  assert.equal(G.escapes, 1);
});

test('S4 rank: thresholds 6 / 15 / 30 with promoted exactly there; nextRank; the card headline', () => {
  const G = loadGame();
  assert.equal(G.rankFor(0), 'CADET'); assert.equal(G.rankFor(5), 'CADET'); assert.equal(G.rankFor(6), 'OFFICER');
  assert.equal(G.rankFor(14), 'OFFICER'); assert.equal(G.rankFor(15), 'DETECTIVE'); assert.equal(G.rankFor(29), 'DETECTIVE');
  assert.equal(G.rankFor(30), 'SERGEANT'); assert.equal(G.rankFor(99), 'SERGEANT');
  same(G.nextRank(0), { n: 'OFFICER', t: 6 }); same(G.nextRank(7), { n: 'DETECTIVE', t: 15 });
  same(G.nextRank(29), { n: 'SERGEANT', t: 30 }); assert.equal(G.nextRank(30), null);
  const one = () => { G.run.alertT = 1000; G.run.cuffT = 51000; G.run.paperwork = 1; return G.scoreBooked(60000); };   // 1 star each (par 50 s, paperwork)
  for (const [from, want] of [[5, true], [4, false], [14, true], [13, false], [29, true], [28, false], [30, false]]) {
    G.career.stars = from; const s = one();
    assert.equal(s.n, 1); assert.equal(s.promoted, want, `${from} → ${from + 1}: promoted ${s.promoted}`);
    G.showCard(s);
    assert.equal(G.dom('cardH').textContent, want ? 'PROMOTED → ' + G.rankFor(from + 1) : 'BOOKED');
    assert.equal(G.dom('cardS').textContent, '★ ☆ ☆');
  }
  G.career.stars = 7; G.showCard({ n: 2, par: true, style: false, parS: 38.2, promoted: false });
  assert.equal(G.dom('cardL').textContent, 'cuff ✓ · par 38s/45s ✓ · paperwork 1 ✗');
  assert.equal(G.dom('cardR').textContent, 'OFFICER · 7★ · Detective at 15');
  G.career.stars = 31; G.showCard({ n: 3, par: true, style: true, parS: 20, promoted: false });
  assert.equal(G.dom('cardR').textContent, 'SERGEANT · 31★');
  assert.equal(G.dom('cardS').textContent, '★ ★ ★');
  assert.equal(G.dom('cstars').textContent, '31'); assert.equal(G.dom('rank').textContent, 'SERGEANT');
});

test('S4 career: saveCareer writes code3.career, loadCareer round-trips, a fresh world reads it, bad JSON → defaults, reset zeroes it', () => {
  const G = loadGame();
  same(G.career, { stars: 0, booked: 0, escapes: 0, slips: 0 });
  Object.assign(G.career, { stars: 17, booked: 8, escapes: 2, slips: 3 });
  G.saveCareer();
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career')).stars, 17);
  same(G.loadCareer(), { stars: 17, booked: 8, escapes: 2, slips: 3 });
  G.ctx.localStorage.setItem('code3.career', '{"stars":9}');
  same(G.loadCareer(), { stars: 9, booked: 0, escapes: 0, slips: 0 }, 'missing fields fill from defaults');
  G.ctx.localStorage.setItem('code3.career', 'not json');
  same(G.loadCareer(), { stars: 0, booked: 0, escapes: 0, slips: 0 });
  G.ctx.localStorage.setItem('code3.career', '{"stars":"x"}');
  same(G.loadCareer(), { stars: 0, booked: 0, escapes: 0, slips: 0 });
  // the HUD reflects the loaded career on boot
  G.saveCareer();
  assert.equal(G.dom('cstars').textContent, '0', 'HUD was set at boot from an empty store');
  G.dom('bReset').dispatch('pointerdown');
  same(G.career, { stars: 0, booked: 0, escapes: 0, slips: 0 });
  assert.equal(G.dom('msg').textContent, 'Career reset');
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career')).stars, 0);
});

/* ---------------------------------------------------------------- slip flow */
test('S4 slip flow: meter 1 → slipped → uncuffable 3.0 s → cuff at 3.1 s → custody (meter 0) → bay → BOOK → card → respawn at 2 s', () => {
  const G = loadGame();
  custodyInCar(G, { x: -40, z: 28, a: Math.PI / 2 });
  G.run.meter = 1;
  G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped');
  const tSlip = G.crook.slipT;
  // the cop jumps out and stands on him: no CUFF, no TAZE through 3.0 s
  G.doAction(); assert.equal(G.mode, 'foot');
  G.cop.freezeUntil = 0;
  const onHim = () => Object.assign(G.cop, { x: G.crook.x, z: G.crook.z, a: G.crook.a, speed: 0, mv: 0 });
  while (G.now() - tSlip <= 3000) {
    onHim();
    assert.notEqual(G.affordance(), 'cuff', `cuffable at +${((G.now() - tSlip) / 1000).toFixed(2)} s`);
    assert.equal(G.tazeOK(), false, 'not tazeable while slipped');
    assert.equal(G.crook.state, 'slipped');
    assert.ok(G.crook.speed >= 0, 'still running');
    G.step(1 / 60);
  }
  G.step(0.1); onHim();
  assert.equal(G.crook.state, 'flee', 'immunity over at 3 s (no alert line)');
  assert.equal(G.affordance(), 'cuff');
  G.doAction();
  assert.equal(G.crook.state, 'cuffed'); assert.equal(G.busts, 1);
  G.step(2.6);
  assert.equal(G.crook.state, 'custody'); assert.ok(G.run.meter < 0.01, `meter reset on the re-cuff (${G.run.meter.toFixed(4)})`); assert.equal(G.crook.inCar, false);
  assert.equal(G.dom('msg').textContent, '🚔 Get him to the car');
  assert.equal(G.dom('modeTxt').textContent, 'ON FOOT');
  // back in the car, then the car placed in the bay, stopped
  Object.assign(G.cop, { x: G.car.x + 2, z: G.car.z });
  assert.equal(G.affordance(), 'enter'); G.doAction();
  assert.equal(G.crook.inCar, true);
  Object.assign(G.car, { x: -65, z: 0, a: -Math.PI / 2, speed: 0, mv: 0, mvRaw: 0, mvPrev: 0 });
  G.step(1 / 60);
  assert.equal(G.affordance(), 'book');
  assert.equal(G.dom('bAct').textContent, 'BOOK'); assert.ok(G.dom('bAct').classList.contains('cuff'));
  const stars0 = G.career.stars;
  G.fire('keydown', { code: 'KeyH' });                       // H books
  assert.equal(G.crook.state, 'booked');
  assert.equal(G.career.booked, 1);
  assert.ok(G.career.stars >= stars0 + 1);
  assert.ok(G.dom('card').classList.contains('show'));
  assert.match(G.dom('cardL').textContent, /^cuff ✓ · par \d+s\/45s [✓✗] · paperwork 0 ✓$/);
  assert.equal(G.dom('cardH').textContent, 'BOOKED');
  assert.equal(G.run.active, false);
  G.step(1 / 60);
  assert.equal(G.dom('cstate').textContent, 'booked');
  assert.equal(G.dom('cline').classList.contains('on'), false);
  G.step(1.9);
  assert.equal(G.crook.state, 'booked', 'card still up at 1.95 s');
  assert.ok(G.dom('card').classList.contains('show'));
  G.step(0.15);
  assert.equal(G.crook.state, 'calm', 'respawned after the 2 s card');
  assert.ok(!G.dom('card').classList.contains('show'));
  assert.ok(Math.hypot(G.crook.x - G.car.x, G.crook.z - G.car.z) >= 70, 'new crook ≥70 m from the car');
  assert.equal(G.crook.inCar, false); assert.equal(G.run.paperwork, 0); assert.equal(G.run.alertT, 0); assert.equal(G.run.slips, 0);
  assert.equal(G.dom('msg').textContent, 'New crook spotted in the district 👀');
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career')).booked, 1);
});

test('S4 slip: a slipped crook who reaches a subway escapes; Space books; the escaped/booked tracker reads Car on foot', () => {
  const G = loadGame();
  custodyInCar(G, { x: -40, z: 28, a: Math.PI / 2 });
  G.run.meter = 1; G.step(1 / 60);
  assert.equal(G.crook.state, 'slipped');
  const sub = G.NODES[G.SUBWAYS[1]];
  Object.assign(G.crook, { x: sub.x - 1, z: sub.z });
  G.step(1 / 60);
  assert.equal(G.crook.state, 'escaped');
  assert.equal(G.career.escapes, 1);
  // Space = BOOK in the bay
  const H = loadGame();
  custodyInCar(H, { x: -65, z: 0, a: -Math.PI / 2 });
  H.step(1 / 60);
  H.fire('keydown', { code: 'Space' });
  assert.equal(H.crook.state, 'booked');
});

/* ---------------------------------------------------------------- book gating */
test('S4 book gating: in the bay but moving → exit; custody outside the bay → exit; in the bay without custody → exit', () => {
  const G = loadGame();
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2, speed: 5, mv: 5, mvRaw: 5, mvPrev: 5 });
  assert.equal(G.affordance(), 'exit', 'rolling through the bay at 5 m/s');
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2, speed: 0, mv: 2.9 });
  assert.equal(G.affordance(), 'book', 'under 3 m/s measured counts as stopped');
  custodyInCar(G, { x: -58, z: 0, a: -Math.PI / 2 });
  assert.equal(G.affordance(), 'exit', '2 m short of the bay');
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });
  G.crook.state = 'flee'; G.crook.inCar = false;
  assert.equal(G.affordance(), 'exit', 'no one in custody');
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });
  G.crook.inCar = false;
  assert.equal(G.affordance(), 'exit', 'custody but he is not in the car');
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2, speed: 12, mv: 12 });
  assert.equal(G.affordance(), 'slow', 'too fast even to exit');
  custodyInCar(G, { x: -65, z: 0, a: -Math.PI / 2 });
  G.mode = 'foot';
  assert.notEqual(G.affordance(), 'book', 'BOOK is a driver\'s action');
  G.updateActBtn();
  assert.notEqual(G.dom('bAct').textContent, 'BOOK');
});

/* ---------------------------------------------------------------- paperwork */
test('S4 paperwork: 20 m/s into a wall counts once with the line; a second hit inside 1 s is ignored; a later one counts', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive'; G.inputKind = 'keys';
  // heading +z on the x=-97 lane toward the alley building face at z=-78 (the B5a wall), 20 m/s
  Object.assign(G.car, { x: -97, z: -84, a: 0, speed: 20, mv: 20, mvRaw: 20, mvPrev: 20 });
  G.run.paperwork = 0; G.run.hitT = -1e9;
  G.step(0.5);
  assert.equal(G.run.paperwork, 1, 'one crash');
  assert.equal(G.dom('msg').textContent, '📋 Paperwork +1');
  const tHit = G.run.hitT;
  // a second slam 0.5 s later: reset the pose and speed and drive into it again
  Object.assign(G.car, { x: -97, z: -84, a: 0, speed: 20, mv: 20, mvRaw: 20, mvPrev: 20 });
  G.step(0.5 - (G.now() - tHit) / 1000 + 0.2);
  assert.equal(G.run.paperwork, 1, 'inside the 1 s debounce');
  G.step(1);
  Object.assign(G.car, { x: -97, z: -84, a: 0, speed: 20, mv: 20, mvRaw: 20, mvPrev: 20 });
  G.step(0.5);
  assert.equal(G.run.paperwork, 2, 'a crash after the debounce counts');
  // open-road driving never counts
  const H = loadGame();
  H.started = true; H.mode = 'drive';
  Object.assign(H.car, { x: -100, z: -88, a: Math.PI / 2, speed: 0 });
  H.setKeys({ gas: true }); H.step(3); H.setKeys({ gas: false, brake: true }); H.step(2);
  assert.equal(H.run.paperwork, 0, 'hard braking is not a crash');
  // the count survives the chase and lands on the card, then resets on respawn
  custodyInCar(H, { x: -65, z: 0, a: -Math.PI / 2 });
  H.run.paperwork = 1; H.step(1 / 60);
  H.doAction();
  assert.match(H.dom('cardL').textContent, /paperwork 1 ✗$/);
  assert.equal(H.dom('cardS').textContent, '★ ★ ☆');
});

/* ---------------------------------------------------------------- HUD / controls budget */
test('S4 HUD + budget: score chip lines, #card and #cline markup, no new touchables, BOOK reuses #bAct', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.match(html, /<div id="card"><div id="cardH">/);
  assert.match(html, /<span id="cline">🔒 <span id="cbar"><i id="cfill"><\/i><\/span> <span id="cpct">/);
  assert.match(html, /<button id="bReset">Reset career<\/button>/);
  assert.match(html, /stop in the bay, tap <b[^>]*>BOOK<\/b>/);
  assert.match(html, /#card\{position:fixed;[^}]*z-index:8/);
  assert.match(html, /#cfill\.hot\{[^}]*var\(--red\)/);
  const buttons = html.match(/<button id="b[A-Z][a-zA-Z]*"/g).map(m => m.slice(12, -1));
  assert.deepEqual(buttons.sort(), ['bAct', 'bBadge', 'bCal', 'bRespawn', 'bReset', 'bSiren', 'bTaze'].sort(), 'no new in-play touchables (bReset and bBadge live in the settings panel)');
  assert.equal((html.match(/<script id="game">/g) || []).length, 1);
  assert.equal(html.split('</script>').length - 1, 2, 'one three.js include + the game script: still one file');
});
