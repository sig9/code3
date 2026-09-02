/*  test/fixes.test.mjs — CODE 3 v0.3 stage S1 "Fixes" against the real game logic.
    Run:  node --test test/*.test.mjs
    Covers the playtest #2 findings that are not routing (those live in crook.test.mjs):
      favicon  — inline data-URI icon, no 404
      B3       — the cop stands still on keys, jogs on touch, and is frozen 2.5 s for the cuff beat
      B4       — the cruiser is solid for people (cop, crook, and the EXIT spot)
      B5       — the speedometer reads measured motion: 0 when wedged against a wall
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML } from './harness.mjs';

const nodeIndex = (G, x, z) => {
  const i = G.NODES.findIndex(n => n.x === x && n.z === z);
  assert.notEqual(i, -1, `no node at (${x},${z})`);
  return i;
};
const CAPSULE = 1.25 + 0.45;                       // car circle radius + person radius
const minCapsuleDist = (G, x, z) => Math.min(...G.carCircles().map(c => Math.hypot(x - c.x, z - c.z)));
const carPose = G => [G.car.x, G.car.z, G.car.a];

/* ---------------------------------------------------------------- favicon */
test('favicon: inline data-URI icon lives in <head> (no 404 on GitHub Pages)', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.ok(html.includes('<link rel="icon" href="data:'), 'favicon <link> missing');
  assert.ok(html.indexOf('<link rel="icon"') < html.indexOf('</head>'), 'favicon <link> must be inside <head>');
});

/* ---------------------------------------------------------------- B3 stand still + cuff freeze */
test('B3a: on keys with no input the cop stands still — displacement exactly 0', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: 0, z: 0, a: 0, speed: 0 });
  G.step(2);
  assert.equal(Math.hypot(G.cop.x, G.cop.z), 0);
  assert.equal(G.cop.speed, 0);
  assert.equal(G.dom('modeTxt').textContent, 'ON FOOT');
});

test('B3b: on touch the cop keeps jogging (SPEC: always moving forward) — >4 m in 2 s', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'touch';
  Object.assign(G.cop, { x: 0, z: 0, a: 0, speed: 0 });
  G.step(2);
  const d = Math.hypot(G.cop.x, G.cop.z);
  assert.ok(d > 4, `cop jogged only ${d.toFixed(2)} m`);
});

test('B3c: the cuff freezes the cop for 2.5 s (CUFFING), then he moves and the crook is in custody', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: 0, z: 0, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 0, z: 1.5, a: 0, speed: 0, state: 'flee', path: null });
  assert.equal(G.affordance(), 'cuff');
  G.doAction();
  assert.equal(G.crook.state, 'cuffed');
  assert.equal(G.busts, 1);
  G.setKeys({ gas: true });                                   // he is mashing sprint the whole time
  G.step(2.4);
  assert.ok(Math.hypot(G.cop.x, G.cop.z) < 0.01, `cop drifted ${Math.hypot(G.cop.x, G.cop.z).toFixed(2)} m during the cuff beat`);
  assert.equal(G.dom('modeTxt').textContent, 'CUFFING');
  assert.equal(G.dom('cstate').textContent, 'cuffed');
  G.step(1.1);                                                // t = 3.5 s: freeze over, crook respawned
  assert.ok(Math.hypot(G.cop.x, G.cop.z) > 2, 'cop moves again after the freeze');
  assert.equal(G.dom('modeTxt').textContent, 'SPRINTING');
  assert.equal(G.crook.state, 'custody');                     // S4: the cuff is the midpoint — he is escorted, not respawned
  assert.equal(G.crook.inCar, false);
  assert.equal(G.run.active, true);
  assert.ok(G.run.meter < 0.1, `escort meter barely started (${G.run.meter.toFixed(3)})`);
});

test('B3d: input family follows the last input — handled key → keys, action button → touch', () => {
  const G = loadGame();
  assert.equal(G.inputKind, 'keys', 'harness navigator.maxTouchPoints=0 → keys');
  G.inputKind = 'touch';
  G.fire('keydown', { code: 'KeyZ' });
  assert.equal(G.inputKind, 'touch', 'an unhandled key changes nothing');
  G.fire('keydown', { code: 'ArrowUp' });
  assert.equal(G.inputKind, 'keys');
  G.fire('keyup', { code: 'ArrowUp' });
  G.dom('bAct').dispatch('pointerdown', { pointerType: 'mouse' });
  assert.equal(G.inputKind, 'keys', 'a mouse click on the on-screen button is not touch');
  G.evalInGame("renderer.domElement.dispatch('pointerdown', { pointerType: 'mouse', clientX: 100 })");
  assert.equal(G.inputKind, 'keys', 'a mouse click on the canvas (to focus it) is not touch');
  G.dom('bAct').dispatch('pointerdown', { pointerType: 'touch' });
  assert.equal(G.inputKind, 'touch');
  G.fire('keydown', { code: 'ArrowUp' }); G.fire('keyup', { code: 'ArrowUp' });
  assert.equal(G.inputKind, 'keys');
  G.evalInGame("renderer.domElement.dispatch('pointerdown', { pointerType: 'touch', clientX: 100 })");
  assert.equal(G.inputKind, 'touch');
});

test('B3e: a desktop player who clicks CUFF with the mouse gets no wander-off after the beat', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: 0, z: 0, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 0, z: 1.5, a: 0, speed: 0, state: 'flee', path: null });
  G.dom('bAct').dispatch('pointerdown', { pointerType: 'mouse' });   // the on-screen CUFF button
  assert.equal(G.crook.state, 'cuffed');
  assert.equal(G.inputKind, 'keys');
  G.step(2.6);                                                       // beat over, no keys held
  const [x, z] = [G.cop.x, G.cop.z];
  G.step(2);
  assert.ok(Math.hypot(G.cop.x - x, G.cop.z - z) < 0.01, 'cop walked off by himself');
  assert.equal(G.dom('modeTxt').textContent, 'ON FOOT');
});

test('B3f: no ENTER (or CUFF) during the cuff beat — the button reads — until the freeze ends', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: 0, z: 3, a: 0, speed: 0 });            // cruiser within ENTER range
  Object.assign(G.cop, { x: 0, z: 0, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 0, z: -1.5, a: 0, speed: 0, state: 'flee', path: null });
  assert.equal(G.affordance(), 'cuff');
  G.doAction();
  G.step(0.5);
  assert.equal(G.dom('modeTxt').textContent, 'CUFFING');
  assert.equal(G.affordance(), null);
  assert.equal(G.dom('bAct').textContent, '—');
  G.doAction();                                                      // Space/tap does nothing
  assert.equal(G.mode, 'foot');
  G.step(2.1);
  assert.equal(G.affordance(), 'enter');
});

/* ---------------------------------------------------------------- B4 solid cruiser */
test('B4a: collidePerson keeps a person ≥1.70 m from both cruiser capsule centres; car untouched', () => {
  const G = loadGame();
  const pose = carPose(G);
  const [A, B] = G.carCircles();
  assert.ok(Math.abs(Math.hypot(A.x - B.x, A.z - B.z) - 2.7) < 1e-9, 'circles 1.35 m fore/aft');
  assert.equal(A.r, 1.25);
  for (const start of [[-100, -82], [-94, -88], [-106, -88], [-97, -85], [-100, -88.001]]) {
    let [x, z] = start;
    for (let k = 0; k < 60; k++) {                            // shove 0.1 m/step at the car centre
      const dx = G.car.x - x, dz = G.car.z - z, d = Math.hypot(dx, dz) || 1;
      [x, z] = G.collidePerson(x + dx / d * 0.1, z + dz / d * 0.1, 0.45);
      const md = minCapsuleDist(G, x, z);
      assert.ok(md >= CAPSULE - 1e-6, `from (${start}) step ${k}: ${md.toFixed(4)} m from a capsule centre`);
    }
  }
  assert.deepEqual(carPose(G), pose, 'car pose unchanged');
});

test('B4b: a sprinting cop is stopped by the parked cruiser (x ≥ −96.96); car unmoved', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  const pose = carPose(G);
  Object.assign(G.cop, { x: -94, z: -88, a: -Math.PI / 2, speed: 0 });   // heading −x at the car at (−100,−88)
  G.setKeys({ gas: true });
  G.step(1);
  assert.ok(G.cop.x >= -96.96, `cop walked into the car: x=${G.cop.x.toFixed(2)}`);
  assert.ok(G.cop.x < -96, `cop did not even reach the car: x=${G.cop.x.toFixed(2)}`);
  assert.ok(minCapsuleDist(G, G.cop.x, G.cop.z) >= CAPSULE - 1e-6);
  assert.deepEqual(carPose(G), pose, 'car pose unchanged');
});

test('B4c: a fleeing crook slides around the parked cruiser — never inside it, and gets past', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot';
  Object.assign(G.cop, { x: 0, z: 0 });                        // threat far away
  const sub = nodeIndex(G, -112, -84);
  Object.assign(G.crook, { x: -92, z: -88, a: -Math.PI / 2, speed: 0, state: 'flee',
    path: [sub], pi: 0, target: sub, glanceT: G.now() + 5000, stam: 6, tired: false });   // forced path: no glance replan
  let minD = Infinity;
  for (let k = 0; k < 180; k++) {                               // 3 s, checked every step
    G.step(1 / 60);
    minD = Math.min(minD, minCapsuleDist(G, G.crook.x, G.crook.z));
    assert.ok(minD >= CAPSULE - 1e-6, `step ${k}: crook ${minD.toFixed(4)} m from a capsule centre`);
  }
  assert.ok(minD < 2.5, 'he did meet the car on the way');
  assert.ok(G.crook.x < -102.6, `he should be past the tail of the car by 3 s, x=${G.crook.x.toFixed(1)}`);
  assert.ok(['flee', 'escaped'].includes(G.crook.state), 'still running (or already down the subway 20 m on)');
});

test('B4d: EXIT puts the cop beside the cruiser, clear of the capsule, with ENTER available', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  assert.equal(G.affordance(), 'exit');
  G.doAction();
  assert.equal(G.mode, 'foot');
  assert.ok(minCapsuleDist(G, G.cop.x, G.cop.z) >= CAPSULE - 1e-6);
  assert.ok(Math.hypot(G.cop.x - G.car.x, G.cop.z - G.car.z) < 3.5);
  assert.equal(G.affordance(), 'enter');
});

test('B4e: EXIT beside a building (or the perimeter) lands on the free side, clear of the wall', () => {
  for (const pose of [{ x: -70, z: -79.6, a: -Math.PI / 2 },        // exit side faces block (0,0) at z=−78
                      { x: -100, z: -88, a: Math.PI / 2 }]) {       // start pose: exit side faces the wall
    const G = loadGame();
    G.started = true; G.mode = 'drive';
    Object.assign(G.car, pose);
    G.doAction();
    assert.equal(G.mode, 'foot');
    const [wx, wz] = G.collide(G.cop.x, G.cop.z, 0.45);
    assert.ok(Math.hypot(wx - G.cop.x, wz - G.cop.z) < 1e-9, `cop placed inside a wall at (${G.cop.x.toFixed(2)},${G.cop.z.toFixed(2)})`);
    assert.ok(minCapsuleDist(G, G.cop.x, G.cop.z) >= CAPSULE - 1e-6);
    assert.ok(Math.abs(G.cop.z) <= 89.55 && Math.abs(G.cop.x) <= 117.55, 'inside the movement clamp');
    assert.equal(G.affordance(), 'enter');
  }
});

test('B4f: a moving cruiser cannot shove a person through the park hedge', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  // park centred (−28,0): its east hedge spans x −7.2..−6; the crook stands on the street side of it
  Object.assign(G.car, { x: 0, z: 5, a: -Math.PI / 2, speed: 0 });   // heading −x at the hedge
  Object.assign(G.crook, { x: -5.0, z: 5, a: 0, speed: 0, state: 'calm', path: null });
  for (let k = 0; k < 180; k++) {
    G.setKeys({ gas: k < 30 });
    G.step(1 / 60);
    if (Math.abs(G.crook.z) > 2)                                  // the 4 m gate gap at z∈[−2,2] is his to use
      assert.ok(G.crook.x >= -6 + 0.45 - 1e-6, `step ${k}: crook pushed into the hedge, x=${G.crook.x.toFixed(2)}`);
    const md = minCapsuleDist(G, G.crook.x, G.crook.z);
    assert.ok(md >= CAPSULE - 1e-6, `step ${k}: crook ${md.toFixed(3)} m from a capsule centre`);
  }
  assert.ok(G.car.x < -1, 'the car did drive at him');
});

/* ---------------------------------------------------------------- B5 speed from motion */
test('B5a: wedged against a wall the speedometer reads 0; commanded speed is dumped', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -97, z: -84, a: 0, speed: 0 });   // heading +z into the block(0,0) face at z=−78
  G.setKeys({ gas: true });
  G.step(2);
  assert.ok(Math.abs(G.car.z + 79.6) < 0.05, `car should be pinned at z≈−79.6, got ${G.car.z.toFixed(2)}`);
  assert.equal(String(G.dom('spd').textContent), '0');         // String(): the stub DOM keeps the raw number
  assert.ok(G.car.speed < 4, `commanded speed ${G.car.speed.toFixed(1)} should be dumped`);
  assert.ok(G.car.speed > 0.5, 'throttle held: the engine still revs (crook can hear it)');
  assert.equal(G.hearingRadius(), 32);
  G.setKeys({ gas: false });
  G.step(1);
  assert.equal(G.car.speed, 0, 'no throttle, no motion → speed 0');
  assert.equal(String(G.dom('spd').textContent), '0');
});

test('B5b: on open road the speedometer tracks the commanded speed (±3 mph accelerating, ±1 steady)', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  G.setKeys({ gas: true });
  G.step(2);
  assert.ok(G.car.speed > 20, 'car is moving');
  let diff = Math.abs(Number(G.dom('spd').textContent) - Math.round(G.car.speed * 2.2));
  assert.ok(diff <= 3, `HUD ${G.dom('spd').textContent} vs ${Math.round(G.car.speed * 2.2)} mph`);
  G.step(3);                                                   // steady state
  diff = Math.abs(Number(G.dom('spd').textContent) - Math.round(G.car.speed * 2.2));
  assert.ok(diff <= 1, `steady: HUD ${G.dom('spd').textContent} vs ${Math.round(G.car.speed * 2.2)} mph`);
});

test('B5c: a shallow slide along a wall is not a wedge — speed and steering are kept (no crawl)', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  // the pose a straight chase from the start reaches at t≈3 s: sliding up the west face of block (1,0)
  Object.assign(G.car, { x: -51.6, z: -73.7, a: 1.24, speed: 30 });
  G.setKeys({ gas: true });
  let tClear = null;
  for (let k = 0; k < 180; k++) {
    G.step(1 / 60);
    if (k > 12) assert.ok(G.car.speed > 25, `step ${k}: commanded speed dumped to ${G.car.speed.toFixed(1)} while sliding`);
    assert.ok(!G.car.wedged, `step ${k}: sliding contact flagged as wedged`);
    if (G.car.z > -60) { tClear = G.now(); break; }
  }
  assert.ok(tClear !== null && tClear <= 1500, `still scraping along the wall after ${tClear} ms`);
  assert.ok(Number(G.dom('spd').textContent) > 15, 'HUD shows real motion while sliding');
});

test('B5d: a wedged car keeps its pivot authority — light tilt steers it free in a few seconds', () => {
  for (const [steer, limit] of [[1, 2200], [0.5, 2500], [0.3, 3000]]) {   // pre-S1: 1433 / 1683 / 1967 ms
    const G = loadGame();
    G.started = true; G.mode = 'drive';
    Object.assign(G.car, { x: -97, z: -84, a: 0, speed: 30 });        // head-on into the block face
    G.setKeys({ gas: true });
    G.step(1);
    assert.ok(G.car.wedged, 'pinned head-on: wedged');
    assert.equal(String(G.dom('spd').textContent), '0');
    const x0 = G.car.x, z0 = G.car.z;
    G.evalInGame('tilt.fallback=true; touchSteer=' + steer);           // phone: tilt only, no reverse
    let t = null;
    for (let k = 0; k < 600; k++) { G.step(1 / 60); if (Math.hypot(G.car.x - x0, G.car.z - z0) > 6) { t = G.now(); break; } }
    assert.ok(t !== null && t <= limit, `steer ${steer}: ${t === null ? 'never' : t + ' ms'} to get 6 m clear (limit ${limit})`);
  }
});

test('B5e: on foot the speedometer reads measured motion too — 0 when blocked by the cruiser', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: -94, z: -88, a: -Math.PI / 2, speed: 0 });
  G.setKeys({ gas: true });
  G.step(0.5);
  assert.ok(Number(G.dom('spd').textContent) >= 10, 'sprinting in the open reads a real speed');
  G.step(1.5);
  assert.ok(G.cop.x >= -96.96, 'blocked by the car');
  assert.ok(G.cop.speed > 7, 'he is still pushing (commanded speed)');
  assert.equal(String(G.dom('spd').textContent), '0');
});
