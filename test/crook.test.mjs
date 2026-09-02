/*  test/crook.test.mjs — crook AI + graph tests against the real game logic.
    Run:  node --test test/
    Two tests are REGRESSION tests for playtest #2 findings B1 and B2:
    they FAIL today by design and must pass after Build stage 1.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, routeMinDist, INDEX_HTML } from './harness.mjs';

const nodeIndex = (G, x, z) => {
  const i = G.NODES.findIndex(n => n.x === x && n.z === z);
  assert.notEqual(i, -1, `no node at (${x},${z})`);
  return i;
};

test('graph connectivity: every node reaches every subway', () => {
  const G = loadGame();
  assert.equal(G.SUBWAYS.length, 3, 'three subway escape points');
  for (let i = 0; i < G.NODES.length; i++) {
    for (const s of G.SUBWAYS) {
      const p = G.bfsPath(i, s, null);
      assert.ok(p, `node ${i} (${G.NODES[i].x},${G.NODES[i].z}) cannot reach subway ${s}`);
      assert.equal(p[0], i); assert.equal(p[p.length - 1], s);
      for (let k = 1; k < p.length; k++)
        assert.ok(G.EDGE[p[k - 1]].includes(p[k]), `path step ${p[k - 1]}→${p[k]} is not an edge`);
    }
  }
});

// B1 REGRESSION — SUBWAY OVERSHOOT. Fails today, must pass after Build stage 1.
// Once the goal subway is the nearest node, repath() yields path=[goal], pi=1 (>= length):
// no steering, no arrival check, and the crook runs past the entrance into the wall.
test('B1: a fleeing crook one block from a subway goes down it (escape counted)', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';                    // cruiser parked far away at (-100,-88)
  const goal = nodeIndex(G, 112, 28);                    // subway at (112,28) — IX['4,2']
  assert.ok(G.SUBWAYS.includes(goal));
  Object.assign(G.crook, { x: 98, z: 28, a: Math.PI / 2, speed: 7, state: 'flee',
    path: [goal], pi: 1, target: goal, repathT: G.now(), stam: 6, tired: false });
  const before = G.escapes;
  G.step(3);
  assert.equal(G.crook.state, 'escaped', `crook state is '${G.crook.state}' at x=${G.crook.x.toFixed(1)} (overshot the entrance)`);
  assert.equal(G.escapes, before + 1, 'escape counter increments');
});

// B2 REGRESSION — CROOK RUNS AT THE COP. Fails today, must pass after Build stage 1.
// repath() only skips nodes within 14 m of the threat; a cruiser mid-block on a 56 m
// block is near no node, so the "shortest" route goes straight through it.
test('B2: an alerted crook does not route through the cruiser', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.crook, { x: -112, z: 84, a: 0, speed: 0, state: 'calm' });
  Object.assign(G.car, { x: -84, z: 84, a: Math.PI / 2, speed: 20 });   // heading +x at 20 m/s
  G.setKeys({ gas: true });                                              // keep it rolling
  G.step(0.2);
  assert.equal(G.crook.state, 'flee', 'crook hears the moving cruiser 28 m away');
  assert.ok(G.crook.path && G.crook.pi < G.crook.path.length, 'crook has a route');
  const route = G.crook.path.map(i => `(${G.NODES[i].x},${G.NODES[i].z})`).join(' > ');
  const d = routeMinDist(G, G.car.x, G.car.z);
  assert.ok(d >= 12, `route ${route} passes within ${d.toFixed(1)} m of the cruiser at (${G.car.x.toFixed(1)},${G.car.z.toFixed(1)})`);
});

test('sanity: a calm crook stays calm with the cruiser parked 100 m away', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.crook, { x: 112, z: 84, state: 'calm' });
  Object.assign(G.car, { x: 12, z: 84, a: Math.PI / 2, speed: 0 });      // parked, engine quiet (radius 16)
  G.step(5);
  assert.equal(G.car.speed, 0, 'car did not move');
  assert.equal(G.crook.state, 'calm');
  assert.deepEqual([G.crook.x, G.crook.z], [112, 84], 'crook did not move');
  assert.equal(G.dom('cstate').textContent, 'unaware');
});

/* ---------------------------------------------------------------- S1 additions (routing, respawn, plaza) */
test('respawn: never on a subway node, >70 m from the threat and from the car (200 respawns, seeds 1–5)', () => {
  let n = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const G = loadGame({ seed });
    for (let k = 0; k < 40; k++) {
      G.mode = k % 2 ? 'foot' : 'drive';                        // threat = cop or car; the car is checked either way
      Object.assign(G.cop, { x: (k * 37) % 200 - 100, z: (k * 53) % 160 - 80 });
      Object.assign(G.car, { x: (k * 71) % 220 - 110, z: (k * 29) % 170 - 85 });
      G.respawnCrook(); n++;
      const i = G.NODES.findIndex(nd => nd.x === G.crook.x && nd.z === G.crook.z);
      assert.notEqual(i, -1, 'respawn lands on a graph node');
      assert.ok(!G.SUBWAYS.includes(i) && G.NODES[i].tag !== 'subway', `respawned ON a subway at (${G.crook.x},${G.crook.z})`);
      const th = G.threatPos();
      assert.ok(Math.hypot(G.crook.x - th.x, G.crook.z - th.z) > 70, 'far from the threat');
      assert.ok(Math.hypot(G.crook.x - G.car.x, G.crook.z - G.car.z) > 70, 'far from the car');
      assert.equal(G.crook.state, 'calm');
      assert.equal(G.crook.path, null); assert.equal(G.crook.target, -1); assert.equal(G.crook.planHot, false);
    }
  }
  assert.equal(n, 200);
});

test('plaza: a crook routed across the plaza clears the fountain instead of orbiting or pinning on it', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -20, z: -84, a: Math.PI / 2, speed: 0 });   // parked 37 m off: out of earshot (16 m) but
  const plaza = nodeIndex(G, 28, -56), next = nodeIndex(G, 56, -28), goal = nodeIndex(G, 112, 28);   // within 60 m, so he does not 'lose' you and slow to a walk (S2)
  assert.equal(G.NODES[plaza].tag, 'plaza');
  assert.equal(G.reachR(plaza), 6, 'plaza node sits inside the r=4.6 fountain: reached at 6 m');
  assert.equal(G.reachR(next), 2.2);
  // both plaza diagonals run dead through the fountain centre: the leg to (56,−28) is aimed beside it
  Object.assign(G.crook, { x: 14, z: -70 });
  const ap = G.aimPoint(G.NODES[next]);
  assert.ok(Math.abs(Math.hypot(ap.x - 28, ap.z + 56) - 5.9) < 1e-6, 'aim point sits 5.9 m off the fountain centre');
  assert.deepEqual(G.aimPoint(G.NODES[plaza]), G.NODES[plaza], 'the plaza node itself is aimed at directly');
  Object.assign(G.crook, { x: 14, z: -70, a: Math.atan2(14, 14), speed: 7, state: 'flee',
    path: [plaza, next], pi: 0, target: goal, glanceT: G.now() + 5000, stam: 6, tired: false });
  let minF = Infinity, tFlip = null;
  for (let k = 0; k < 240; k++) {                                 // 4 s, no glance replan (glanceT in the future)
    G.step(1 / 60);
    minF = Math.min(minF, Math.hypot(G.crook.x - 28, G.crook.z + 56));
    if (tFlip === null && G.crook.path[G.crook.pi] === next) tFlip = G.now();   // S2 replans at the corner: next waypoint, not pi
  }
  assert.ok(tFlip !== null && tFlip <= 2500, `plaza waypoint not reached in time (flip at ${tFlip} ms)`);
  assert.equal(G.crook.path[G.crook.pi], next);
  assert.ok(minF >= 5.0, `inside the fountain collider: ${minF.toFixed(2)} m from centre`);
  const dF = Math.hypot(G.crook.x - 28, G.crook.z + 56), dN = Math.hypot(G.crook.x - 56, G.crook.z + 28);
  assert.ok(dF > 6.5, `still against the fountain at 4 s (${dF.toFixed(1)} m)`);
  assert.ok(dN < 40, `no progress around the fountain toward (56,−28): ${dN.toFixed(1)} m left of 59.4`);
  assert.equal(G.crook.state, 'flee');
});

test('router units: forbidden/costed edges, position-seeded plan, least-bad plan when cornered', () => {
  const G = loadGame();
  G.mode = 'drive';
  assert.equal(G.EDGES.length, 65, 'undirected edge list');
  assert.equal(G.EDGES.filter(e => e.foot).length, 10, 'foot-only edges (alley/park)');
  for (const e of G.EDGES) assert.ok(G.EDGE[e.a].includes(e.b) && Math.abs(e.len - Math.hypot(G.NODES[e.a].x - G.NODES[e.b].x, G.NODES[e.a].z - G.NODES[e.b].z)) < 1e-9);
  const A = { x: 0, z: 0 }, B = { x: 56, z: 0 };
  assert.equal(G.segDist(28, 10, 0, 0, 56, 0), 10);
  assert.equal(G.segDist(-10, 0, 0, 0, 56, 0), 10);
  assert.equal(G.edgeCost(A, B, { x: 28, z: 0, R: 40 }, false), Infinity, 'threat on the segment: forbidden');
  const hot = G.edgeCost(A, B, { x: 28, z: 0, R: 40 }, true);
  assert.ok(Number.isFinite(hot) && hot > 56 * 20, 'hotOK: finite but ≥20× length');
  assert.equal(G.edgeCost(A, B, { x: 28, z: 100, R: 40 }, false), 56, 'far threat: plain length');
  const near = G.edgeCost(A, B, { x: 28, z: 20, R: 40 }, false);
  assert.ok(near > 56 && near < hot, 'near threat: costed, not forbidden');
  assert.equal(G.threat().R, 40); assert.equal(G.threat().car, true);
  G.mode = 'foot'; assert.equal(G.threat().R, 24); assert.equal(G.threat().car, false);
  G.mode = 'drive';
  // NE spawn, cruiser far away → straight to the (112,28) subway, path never contains the node he stands on
  const sub = nodeIndex(G, 112, 28);
  Object.assign(G.crook, { x: 112, z: 84 }); Object.assign(G.car, { x: -100, z: -88 });
  G.plan();
  assert.deepEqual(Array.from(G.crook.path), [sub]);           // Array.from: the path is a vm-realm array
  assert.equal(G.crook.target, sub); assert.equal(G.crook.pi, 0); assert.equal(G.crook.planHot, false);
  // B1 pose: mid-block, subway is the nearest node → path is just the subway
  Object.assign(G.crook, { x: 98, z: 28 }); G.plan();
  assert.deepEqual(Array.from(G.crook.path), [sub]);
  // cornered: threat 2 m away forbids every seed leg → least-bad plan, still non-empty
  Object.assign(G.crook, { x: 112, z: 84 }); Object.assign(G.car, { x: 110, z: 84 });
  G.plan();
  assert.ok(G.crook.path.length > 0, 'a cornered crook still gets a path');
  assert.equal(G.crook.planHot, true);
  assert.ok(G.crook.target >= 0 && G.SUBWAYS.includes(G.crook.target));
  assert.equal(G.crook.pi, 0);
});

test('gate bollard: a leg dead-radial through the park-gate bollard does not pin the crook', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: -28, z: -60 });
  const nN = nodeIndex(G, -28, -22.5), nC = nodeIndex(G, -28, 0), nS = nodeIndex(G, -28, 22.5), goal = nodeIndex(G, 0, 84);
  Object.assign(G.crook, { x: -28, z: -30, a: 0, speed: 7, state: 'flee', path: [nN, nC, nS, goal], pi: 0,
    target: goal, repathT: G.now(), stam: 6, tired: false });
  let stuck = 0, maxStuck = 0, last = [G.crook.x, G.crook.z];
  for (let k = 0; k < 600; k++) {
    G.step(1 / 60);
    const d = Math.hypot(G.crook.x - last[0], G.crook.z - last[1]); last = [G.crook.x, G.crook.z];
    stuck = d < 0.02 ? stuck + 1 : 0; maxStuck = Math.max(maxStuck, stuck);
  }
  assert.ok(maxStuck < 30, `crook stood still for ${maxStuck} consecutive frames`);
  assert.ok(G.crook.z > 0, `he should be through the gate and across the park by 10 s, z=${G.crook.z.toFixed(1)}`);
});

test('close-range plan: a threat between the crook and the nearest node sends him the OTHER way', () => {
  // QA S1: every seed leg starts at the crook, so a threat < 6 m used to forbid ALL first legs and the
  // hot rerun degenerated to "shortest first leg" — straight through the cop. First legs are now judged
  // from 2 m ahead of him, and a hot plan never picks a leg that points into the threat.
  const north = nodeIndex(G0(), -56, 84), south = nodeIndex(G0(), -56, 28);
  function G0() { return loadGame(); }
  for (const gap of [1, 2, 4, 5.5]) {                     // 1 m: hot rerun; 4 m: the QA repro
    const G = loadGame();
    G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
    Object.assign(G.cop, { x: -56, z: 66 + gap, a: Math.PI });   // cop just NORTH, between him and (-56,84)
    Object.assign(G.crook, { x: -56, z: 66, a: Math.PI, state: 'flee', stam: 6, tired: false });   // facing south already
    G.plan();
    assert.notEqual(G.crook.path[0], north, `gap ${gap}: first leg runs through the cop`);
    assert.equal(G.crook.path[0], south, `gap ${gap}: expected the open street south`);
    assert.equal(G.crook.planHot, gap + 2 < 6, `gap ${gap}: hot rerun only when even the leg away (judged from 2 m ahead) is < 6 m`);
    assert.ok(routeMinDist(G, G.cop.x, G.cop.z) >= Math.min(gap, 4) - 1e-9, `gap ${gap}: route within ${routeMinDist(G, G.cop.x, G.cop.z).toFixed(2)} m of the cop`);
    let minD = Infinity;                                   // cop stands still: he must never come within cuffing range
    for (let k = 0; k < 180; k++) { G.step(1 / 60); minD = Math.min(minD, Math.hypot(G.cop.x - G.crook.x, G.cop.z - G.crook.z)); }
    assert.ok(minD >= gap - 1e-6, `gap ${gap}: he closed on the standing cop to ${minD.toFixed(2)} m`);
  }
  // QA repro verbatim (default heading +z, i.e. facing the cop, speed 0): he turns and runs south
  { const G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
    Object.assign(G.cop, { x: -56, z: 70, a: Math.PI }); Object.assign(G.crook, { x: -56, z: 66, state: 'flee' });
    G.plan(); assert.equal(G.crook.path[0], south);
    let minD = Infinity;
    for (let k = 0; k < 180; k++) { G.step(1 / 60); minD = Math.min(minD, Math.hypot(G.cop.x - G.crook.x, G.cop.z - G.crook.z)); }
    assert.ok(minD >= 3, `turned into the cop: closest ${minD.toFixed(2)} m (was 0.03 m before the fix)`);
    assert.ok(G.crook.z < 55, `not running south: z=${G.crook.z.toFixed(1)}`); }
  // drive analogue: cruiser 5 m north of him
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -56, z: 71, a: 0, speed: 0 });
  Object.assign(G.crook, { x: -56, z: 66, state: 'flee' });
  G.plan();
  assert.equal(G.crook.path[0], south);
  assert.ok(routeMinDist(G, G.car.x, G.car.z) >= 4.9);
  // cornered on the map edge with the threat 1 m to the west: the only legs are west (through him) and
  // south (past him at 2.2 m) — hot plan, and it still goes south, not west
  const H = loadGame(); H.started = true; H.mode = 'drive';
  Object.assign(H.car, { x: 111, z: 84 }); Object.assign(H.crook, { x: 112, z: 84, state: 'flee' });
  H.plan();
  assert.equal(H.crook.planHot, true);
  assert.equal(H.crook.path[0], nodeIndex(H, 112, 56));
});

/* ---------------------------------------------------------------- S2 smart crook */
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const minCapsule = G => Math.min(...G.carCircles().map(c => Math.hypot(G.crook.x - c.x, G.crook.z - c.z)));
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('S2 B2 stationary: cruiser parked mid-block east of him — first leg north, never within 20 m over 5 s', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -84, z: 84, a: Math.PI / 2, speed: 0 });
  Object.assign(G.crook, { x: -112, z: 84, a: Math.PI / 2, speed: 0, state: 'flee', stam: 6, tired: false });   // parked = 16 m earshot: he is already fleeing
  const north = nodeIndex(G, -112, 28), east = nodeIndex(G, -56, 84);   // facing +x (east), +z is on the right = south; (-112,28) is north
  G.step(1 / 60);
  assert.equal(G.crook.path[G.crook.pi], north, 'first leg runs up the side street, away from the cruiser');
  let minD = Infinity;
  for (let k = 0; k < 300; k++) {
    G.step(1 / 60);
    minD = Math.min(minD, dist2(G.crook, G.car));
    assert.notEqual(G.crook.path[G.crook.pi], east, `step ${k}: heading for the cruiser`);
  }
  assert.ok(minD >= 20, `came within ${minD.toFixed(1)} m of the parked cruiser`);
});

test('S2 B2 charging: cruiser driving AT him — first leg never east (into it), never runs through it', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -84, z: 84, a: -Math.PI / 2, speed: 20 });   // heading −x at him, 20 m/s
  Object.assign(G.crook, { x: -112, z: 84, a: 0, speed: 0, state: 'calm' });
  G.setKeys({ gas: true });
  const east = nodeIndex(G, -56, 84);
  let minD = Infinity, minC = Infinity, tMove = null, hold = 0;
  for (let k = 0; k < 300; k++) {
    G.step(1 / 60);
    if (k === 0) assert.equal(G.crook.state, 'flee');
    if (G.dom('cstate').textContent === 'heard you!') { hold++; assert.equal(G.crook.speed, 0); }
    if (tMove === null && G.crook.speed > 0) tMove = G.now();
    minD = Math.min(minD, dist2(G.crook, G.car)); minC = Math.min(minC, minCapsule(G));
    if (G.crook.path && G.crook.pi < G.crook.path.length)
      assert.notEqual(G.crook.path[G.crook.pi], east, `step ${k}: first leg points into the charging cruiser`);
  }
  // a car doing 20→26 m/s covers the 28 m in 1.2 s. He still gets his 0.4 s 'heard you!' — but as a startle: he
  // dives out of the car's line (3.5 m up the side street) facing it, then bolts. The hold is only cut when the
  // bumper would reach him before it ends; a charging car is not that.
  assert.ok(hold >= 23 && hold <= 25, `alert hold ${hold} frames`);
  assert.ok(tMove !== null && tMove >= 400 && tMove <= 450, `ran at ${tMove} ms (the hold is 0.4 s)`);
  assert.ok(minD >= 5, `the car got within ${minD.toFixed(2)} m of him`);
  assert.ok(minC >= 4, `capsule ${minC.toFixed(2)} m: shoved`);
  assert.equal(G.crook.hitCount, 0, 'clipped');
  assert.ok(G.crook.z < 70 && G.crook.x < -100, `he did not get down the side street: (${G.crook.x.toFixed(1)},${G.crook.z.toFixed(1)})`);
  assert.ok(dist2(G.crook, G.car) > 12, 'and he is clear of the stopped car by 5 s');
});

test('S2 never-toward sweep: 300 seeded poses — a cold plan keeps its first leg ≥6 m from the threat, a hot plan only when nothing ≥6 m reaches a subway', () => {
  const G = loadGame();
  const rnd = mulberry32(7);
  const R = (a, b) => a + rnd() * (b - a);
  let cold = 0, hot = 0;
  for (let c = 0; c < 300; c++) {
    const n = Math.floor(rnd() * G.NODES.length), N = G.NODES[n];
    Object.assign(G.crook, { x: N.x + R(-3, 3), z: N.z + R(-3, 3), a: R(-Math.PI, Math.PI), path: null, pi: 0, target: -1, speed: 0 });
    G.mode = rnd() < 0.5 ? 'drive' : 'foot';
    const me = G.mode === 'drive' ? G.car : G.cop;
    const ta = R(-Math.PI, Math.PI), tr = c % 3 ? R(1, 40) : R(40, 200);   // two in three threats close in: exercise the hot rerun
    Object.assign(me, { x: Math.max(-115, Math.min(115, G.crook.x + Math.sin(ta) * tr)), z: Math.max(-87, Math.min(87, G.crook.z + Math.cos(ta) * tr)),
      a: R(-Math.PI, Math.PI), speed: G.mode === 'drive' ? R(0, 30) : R(0, 7) });
    if (G.mode === 'foot') Object.assign(G.car, { x: R(-115, 115), z: R(-87, 87) });
    G.plan();
    const th = G.threat(), path = G.crook.path;
    if (!path.length) continue;
    const near = G.nearestNode(G.crook.x, G.crook.z), B = G.NODES[path[0]];
    const segD = (ax, az, bx, bz) => Math.min(G.segDist(th.x, th.z, ax, az, bx, bz), G.segDist(th.px, th.pz, ax, az, bx, bz));   // now and in 1.5 s
    const seedD = S => {                                        // as the router judges a first leg: from 2 m ahead of him
      const len = dist2(G.crook, S), t = len > 0 ? Math.min(2, len) / len : 0;
      return segD(G.crook.x + (S.x - G.crook.x) * t, G.crook.z + (S.z - G.crook.z) * t, S.x, S.z);
    };
    const hotFromHim = S => G.hotLeg(G.crook.x, G.crook.z, S.x, S.z, th);   // the shared leg-hot rule (14 m car / 10 m foot, threat ahead)
    if (!G.crook.planHot) {
      cold++;
      // standing on a node (< reachR) the router judged crook→node and node→path[0]; otherwise crook→path[0] itself
      const onNode = dist2(G.crook, G.NODES[near]) < G.reachR(near) && near !== path[0];
      const d = onNode ? Math.min(seedD(G.NODES[near]), segD(G.NODES[near].x, G.NODES[near].z, B.x, B.z)) : seedD(B);
      const gone = G.receding(G.crook.x, G.crook.z, B.x, B.z, th);   // a car ahead pulling away along the leg at >12 m/s has passed him
      assert.ok(gone || seedD(B) >= 6 - 1e-9 || (onNode && d >= 6 - 1e-9), `case ${c}: cold plan, first leg ${Math.max(seedD(B), onNode ? d : 0).toFixed(2)} m from the threat`);
      assert.ok(!hotFromHim(B), `case ${c}: cold plan, but legHot() would flag its first leg at once (he would dither)`);
      assert.equal(G.legHot(th), false, `case ${c}: cold plan with a hot first leg`);
      continue;
    }
    hot++;
    // BFS over edges ≥6 m from the threat (now and projected), from the seed legs that are themselves ≥6 m and
    // not hot; a first leg out of a node he stands on is judged from him too (that is what legHot() will see)
    const seeds = [...G.seedLegs().keys()];
    const segOK = (ax, az, bx, bz) => segD(ax, az, bx, bz) >= 6;
    const standing = i => dist2(G.crook, G.NODES[i]) < G.reachR(i);
    const seen = new Set(), q = [];
    for (const s of seeds) if (standing(s) || (seedD(G.NODES[s]) >= 6 && !hotFromHim(G.NODES[s]))) { seen.add(s); q.push(s); }
    while (q.length) {
      const u = q.shift();
      for (const v of G.EDGE[u]) if (!seen.has(v) && segOK(G.NODES[u].x, G.NODES[u].z, G.NODES[v].x, G.NODES[v].z) && !(standing(u) && hotFromHim(G.NODES[v]))) { seen.add(v); q.push(v); }
    }
    for (const s of G.SUBWAYS) assert.ok(!seen.has(s), `case ${c}: hot plan although a ≥6 m route reaches subway (${G.NODES[s].x},${G.NODES[s].z})`);
  }
  assert.ok(cold > 200 && hot > 5, `sweep mix: ${cold} cold, ${hot} hot`);
});

test('S2 leg reaction: cruiser racing up his street → dead stop, double-back to the (0,84) subway, escapes', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  const sub = nodeIndex(G, 0, 84), far = nodeIndex(G, -112, -84);
  Object.assign(G.crook, { x: -20, z: 84, a: -Math.PI / 2, speed: 7, state: 'flee', stam: 6, tired: false, glanceT: G.now() + 5000,
    path: [nodeIndex(G, -56, 84), nodeIndex(G, -112, 84), nodeIndex(G, -112, 28), nodeIndex(G, -112, -28), far], pi: 0, target: far });
  Object.assign(G.car, { x: -70, z: 84, a: Math.PI / 2, speed: 20 });     // heading +x at him
  G.setKeys({ gas: true });
  assert.equal(G.legHot(G.threat()), true, 'the projected cruiser sits on his leg');
  let tDb = null, minD = Infinity, tEsc = null, dbAt = 0;
  for (let k = 0; k < 1200; k++) {
    G.step(1 / 60);
    if (G.crook.state === 'flee') minD = Math.min(minD, minCapsule(G));
    if (tDb === null && G.crook.dbUntil > G.now()) {
      tDb = G.now(); dbAt = G.crook.dbCount;
      assert.equal(G.crook.path[G.crook.pi], sub, 'double-back leads to the (0,84) subway');
      assert.equal(G.crook.target, sub); assert.equal(G.crook.speed, 0); assert.equal(G.dom('cstate').textContent, 'doubling back');
    }
    if (tEsc === null && G.crook.state === 'escaped') { tEsc = G.now(); break; }
  }
  assert.ok(tDb !== null && tDb <= 600, `no double-back within 0.6 s (at ${tDb} ms)`);
  assert.equal(dbAt, 1);
  /* He doubles back INTO the oncoming cruiser's lane and it races past him at 34 m/s: the car is on his leg
     for a moment but pulling away along it faster than he can run (receding — not a wall), so no second
     reversal; he keeps going and is down the stairs by 4 s. The design's "car never within 5 m" cannot hold
     on this geometry: he runs the street's centre line and the car passes ON it — he is shoved along the
     bumper (capsule contact, 1.7 m), never run through. */
  assert.ok(minD >= 1.7 - 1e-6, `run through by the cruiser: ${minD.toFixed(2)} m from a capsule centre`);
  assert.ok(tEsc !== null && tEsc <= 4500, `not escaped by 4.5 s (state ${G.crook.state} at (${G.crook.x.toFixed(1)},${G.crook.z.toFixed(1)}))`);
  assert.equal(G.crook.target, sub);
  assert.equal(G.crook.dbCount, 1, `${G.crook.dbCount} double-backs: the passing car must not turn him round again`);
});

test('S2 hysteresis: a threat hopping every 0.5 s between two spots that flip the best subway → ≤2 goal switches in 10 s', () => {
  const run = html => {
    const G = loadGame({ html });
    G.started = true; G.mode = 'drive';
    // from (56,28): (112,28) is 56 m east, (0,84) is 89.6 m via the x=28 alley. A cruiser at (112,0) costs the east
    // leg ×1.72 (96 > 89.6), one at (0,0) costs the alley route ×1.72 (115 > 56): the cheapest goal flips every hop
    Object.assign(G.crook, { x: 56, z: 28, a: Math.PI / 2, speed: 0, state: 'flee', stam: 6, tired: false });
    const spots = [[112, 0], [0, 0]];
    let last = -1, switches = 0;
    for (let k = 0; k < 600; k++) {
      const s = spots[Math.floor(k / 30) % 2];
      Object.assign(G.car, { x: s[0], z: s[1], a: 0, speed: 0 });
      if (k % 30 === 0) G.plan();                        // a plan at every hop: the goal rule itself is under test
      G.step(1 / 60);
      if (G.crook.target !== last) { if (last >= 0) switches++; last = G.crook.target; }
    }
    return switches;
  };
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.ok(html.includes('/*HYST*/'), 'hysteresis marker present');
  const without = run(html.replace('/*HYST*/', 'true||'));  // the same setup with the hysteresis rule disabled
  assert.ok(without >= 3, `vacuous setup: only ${without} switches without hysteresis`);
  const withH = run(undefined);
  assert.ok(withH <= 2, `${withH} goal switches in 10 s (without hysteresis: ${without})`);
});

test('S2 catch: on foot 12 m behind him on a straight street he is cuffable within 20 s (stamina unchanged)', () => {
  const G = loadGame();
  G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.cop, { x: -112, z: 72, a: Math.PI, speed: 0 });
  Object.assign(G.crook, { x: -112, z: 60, a: Math.PI, speed: 7, state: 'flee', stam: 6, tired: false });
  G.setKeys({ gas: true });
  let tCuff = null;
  for (let k = 0; k < 1200; k++) {
    G.step(1 / 60);
    if (G.affordance() === 'cuff') { tCuff = G.now(); break; }
    assert.equal(G.crook.state, 'flee', `step ${k}: ${G.crook.state}`);
  }
  assert.ok(tCuff !== null, `never in cuffing range (gap ${dist2(G.cop, G.crook).toFixed(1)} m at 20 s)`);
  assert.ok(tCuff > 5000, `caught suspiciously early (${tCuff} ms)`);
});

test('S2 lost: out of earshot he walks (sneaking); hearing you again re-alerts him', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 12, z: 84, a: Math.PI / 2, speed: 0 });      // parked 100 m away
  Object.assign(G.crook, { x: 112, z: 84, a: Math.PI, speed: 7, state: 'flee', stam: 6, tired: false });
  G.step(2.9);
  assert.equal(G.crook.lost, false);
  G.step(1.1);
  assert.equal(G.crook.lost, true);
  assert.equal(G.dom('cstate').textContent, 'sneaking');
  assert.ok(G.crook.speed < 3.2, `still running at ${G.crook.speed.toFixed(2)} m/s`);
  assert.ok(G.crook.qUntil > G.now(), "'?' tell showing");
  Object.assign(G.car, { x: G.crook.x - Math.sin(G.crook.a) * 10, z: G.crook.z - Math.cos(G.crook.a) * 10 });   // pull up 10 m behind him
  G.step(1 / 60);
  assert.equal(G.crook.lost, false);
  assert.ok(G.crook.alertUntil > G.now(), 're-alerted');
  assert.equal(G.dom('cstate').textContent, 'heard you!');
  assert.equal(G.crook.speed, 0);
});

test('S2 alert freeze: 0.4 s dead stop facing the cruiser, with a route already planned — for a charging car too', () => {
  /* the common alert: the player on the gas (20→34 m/s) heard from 32 m. He gets the full hold, eyes on the car,
     speed 0 — and, because a calm crook stands on the street's centre line, the hold is a startle: he dives
     3.5 m out of the car's line (toward the curb) during it, then bolts; a car holding its line misses him. */
  for (const v of [20, 30]) {
    const G = loadGame();
    G.started = true; G.mode = 'drive';
    Object.assign(G.crook, { x: 56, z: 84, a: 0, speed: 0, state: 'calm' });      // a corner, mid-street
    Object.assign(G.car, { x: 0, z: 84, a: Math.PI / 2, speed: v });             // heading +x, gas held
    G.setKeys({ gas: true });
    while (G.crook.state === 'calm') G.step(1 / 60);
    const t0 = G.now();
    assert.ok(G.crook.alertUntil - t0 > 350, `v=${v}: a full 0.4 s hold`);
    assert.equal(G.dom('cstate').textContent, 'heard you!');
    assert.ok(Math.abs(wrapPi(G.crook.a - Math.atan2(G.car.x - G.crook.x, G.car.z - G.crook.z))) < 0.01, 'faces the cruiser');
    assert.ok(G.crook.popUntil > t0, "'!' pops");
    const until = G.crook.alertUntil;
    let frames = 0, minC = Infinity;
    while (G.now() + 1000 / 60 < until) {
      G.step(1 / 60); frames++; minC = Math.min(minC, minCapsule(G));
      assert.equal(G.crook.speed, 0); assert.equal(G.dom('cstate').textContent, 'heard you!');
      assert.ok(Math.abs(wrapPi(G.crook.a - Math.atan2(G.car.x - G.crook.x, G.car.z - G.crook.z))) < 0.01, 'eyes on the cruiser through the hold');
      if (G.now() - t0 >= 200) assert.ok(G.crook.path.length > 0, 'route exists during the hold (at 0.2 s)');
    }
    assert.ok(frames >= 22, `v=${v}: held ${frames} frames`);
    assert.ok(Math.abs(G.crook.z - 84) >= 3.4 && Math.abs(G.crook.x - 56) < 0.5, `v=${v}: dived out of its line to (${G.crook.x.toFixed(1)},${G.crook.z.toFixed(1)})`);
    for (let k = 0; k < 120; k++) { G.step(1 / 60); minC = Math.min(minC, minCapsule(G)); }
    assert.ok(G.crook.speed > 3 && G.dom('cstate').textContent === 'fleeing!', 'running after the hold');
    assert.ok(minC >= 4, `v=${v}: the car passed ${minC.toFixed(2)} m from him`);
    assert.equal(G.crook.hitCount, 0);
  }
  // a parked car (16 m earshot) or a cop on foot: no line to dive out of — he stands where he is
  const P = loadGame(); P.started = true; P.mode = 'drive';
  Object.assign(P.crook, { x: -112, z: 84, a: 0, speed: 0, state: 'calm' });
  Object.assign(P.car, { x: -98, z: 84, a: Math.PI / 2, speed: 0 });
  P.step(1 / 60); assert.equal(P.crook.state, 'flee');
  while (P.now() + 1000 / 60 < P.crook.alertUntil) P.step(1 / 60);
  assert.deepEqual([P.crook.x, P.crook.z], [-112, 84], 'did not move during the hold');
});

test('S2 reversals: a cruiser parked 30 m off does not make him dither — ≤2 double-backs in 20 s', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: -112, z: 24, a: 0, speed: 0 });
  Object.assign(G.crook, { x: -112, z: 54, a: 0, speed: 7, state: 'flee', stam: 6, tired: false });
  let maxDb = 0;
  for (let k = 0; k < 1200 && G.crook.state === 'flee'; k++) { G.step(1 / 60); maxDb = Math.max(maxDb, G.crook.dbCount); }
  assert.ok(maxDb <= 2, `${maxDb} double-backs`);
});

/* ---------------------------------------------------------------- S2 fixes (QA round 2) */
test('S2 guard: cruiser parked at the curb by the subway he is committed to — no dithering, he picks another way', () => {
  // the leg-hot radius (14 m car / 10 m foot) and the planner's forbidden radius disagreed: a leg 6–14 m from a
  // parked car was legal to plan onto and hot to run — 6 double-backs in 8 s, 7 m toward the car and back
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 300, z: 300, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 28.38, z: 83.74, a: 2.25, speed: 7, state: 'flee', stam: 6, tired: false });
  G.plan();
  assert.equal(G.crook.target, nodeIndex(G, 0, 84), 'committed to the (0,84) subway');
  Object.assign(G.car, { x: 3.57, z: 77.19, a: Math.PI / 2, speed: 0 });   // pulls up at the curb by the entrance
  let minD = Infinity, flips = 0, lastFirst = -1;
  for (let k = 0; k < 1200 && G.crook.state === 'flee'; k++) {
    G.step(1 / 60);
    minD = Math.min(minD, dist2(G.crook, G.car));
    const f = G.crook.path && G.crook.path[G.crook.pi];
    if (f !== undefined && f !== lastFirst) { if (lastFirst >= 0 && G.crook.path.length && G.crook.pi === 0) flips++; lastFirst = f; }
  }
  assert.ok(G.crook.dbCount <= 2, `${G.crook.dbCount} double-backs`);
  assert.ok(minD >= 14, `walked into the parked cruiser: ${minD.toFixed(1)} m`);
  assert.ok(G.crook.state === 'escaped' || dist2(G.crook, G.car) > 40, `still hanging about the cruiser at 20 s (${dist2(G.crook, G.car).toFixed(1)} m)`);
  // foot analogue: a cop standing 8.9 m off — he must get away, not shuttle 7 m toward him and back (was 19 double-backs)
  const H = loadGame(); H.started = true; H.mode = 'foot'; H.inputKind = 'keys';
  Object.assign(H.cop, { x: -7.7, z: -20.4, a: 0, speed: 0 }); Object.assign(H.car, { x: 200, z: 200, a: 0, speed: 0 });
  Object.assign(H.crook, { x: -2, z: -27, a: -1.6, speed: 7, state: 'flee', stam: 6, tired: false });
  let t25 = null;
  for (let k = 0; k < 600; k++) { H.step(1 / 60); if (t25 === null && dist2(H.crook, H.cop) > 25) t25 = H.now(); }
  assert.ok(t25 !== null && t25 <= 10000, `never got 25 m from a standing cop (at 10 s: ${dist2(H.crook, H.cop).toFixed(1)} m)`);
  assert.ok(H.crook.dbCount <= 2, `${H.crook.dbCount} double-backs`);
});

test('S2 standing-threat sweep: 90 seeded park-area poses with a cop standing 4–12 m off — ≤2 double-backs each, always gets clear', () => {
  const rnd = mulberry32(9), R = (a, b) => a + rnd() * (b - a);
  const pts = [[0, -28], [-56, -28], [0, 28], [-56, 28], [-5.5, 0], [-50.5, 0], [-28, -22.5], [-28, 22.5], [-28, 0]];
  const hist = {};
  for (let c = 0; c < 90; c++) {
    const p = pts[c % pts.length], ta = R(-Math.PI, Math.PI), tr = R(4, 12);
    const G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
    Object.assign(G.cop, { x: p[0] + Math.sin(ta) * tr, z: p[1] + Math.cos(ta) * tr, a: 0, speed: 0 }); Object.assign(G.car, { x: 200, z: 200, a: 0, speed: 0 });
    Object.assign(G.crook, { x: p[0] + R(-3, 3), z: p[1] + R(-3, 3), a: R(-Math.PI, Math.PI), speed: 7, state: 'flee', stam: 6, tired: false });
    for (let k = 0; k < 1200 && G.crook.state === 'flee'; k++) G.step(1 / 60);
    hist[G.crook.dbCount] = (hist[G.crook.dbCount] || 0) + 1;
    assert.ok(G.crook.dbCount <= 2, `case ${c} at (${p}): ${G.crook.dbCount} double-backs`);
    assert.ok(G.crook.state !== 'flee' || dist2(G.crook, G.cop) > 15, `case ${c} at (${p}): still ${dist2(G.crook, G.cop).toFixed(1)} m from a standing cop after 20 s`);
  }
  assert.ok((hist[0] || 0) + (hist[1] || 0) >= 85, `dithering: ${JSON.stringify(hist)}`);
});

test('S2 seeding: the node dead ahead on a collinear split street is a seed; a leg out of an alley is not priced above going back in', () => {
  // (a) streets are stored whole AND split at alley ends: from (56,80) heading south the (56,56) alley end is 24 m ahead,
  //     but the single nearest edge was the whole (56,28)-(56,84) street, so he could only reach it via the corner 4 m BEHIND him
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 0, z: 84, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 56, z: 80, a: Math.PI, speed: 7, state: 'flee', stam: 6, tired: false, target: -1, path: null });
  G.plan();
  assert.equal(G.crook.path[0], nodeIndex(G, 56, 56), `first leg ${G.crook.path.map(i => `(${G.NODES[i].x},${G.NODES[i].z})`).join('>')}`);
  assert.ok(G.seedLegs().has(nodeIndex(G, 56, 56)), 'the split-street node is a seed');
  // (b) 6.5 m into the alley past its middle node, heading out: the leg out is an alley leg too (×0.6 vs a car), so no
  //     reason to run back to the middle node first (was (84,56)>(112,56) — 6.5 m backwards)
  Object.assign(G.car, { x: 300, z: 300, a: 0, speed: 0 });
  Object.assign(G.crook, { x: 90.5, z: 56.5, a: Math.PI / 2, target: -1, path: null });
  G.plan();
  assert.equal(G.crook.path[0], nodeIndex(G, 112, 56));
  // sweep: 3–10 m past every alley/park node along each of its legs, heading away, threat 200 m off: never back to that node
  let back = 0, total = 0;
  for (let i = 0; i < G.NODES.length; i++) {
    if (!['alley', 'park'].includes(G.NODES[i].tag)) continue;
    for (const j of G.EDGE[i]) {
      const A = G.NODES[i], B = G.NODES[j], L = Math.hypot(B.x - A.x, B.z - A.z);
      for (const d of [3, 4, 6, 8, 10]) {
        const t = d / L;
        Object.assign(G.crook, { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, a: Math.atan2(B.x - A.x, B.z - A.z), target: -1, path: null });
        G.plan(); total++;
        if (G.crook.path[0] === i && G.crook.path[1] === j) back++;   // back to the node, then out along the same leg
      }
    }
  }
  assert.equal(back, 0, `${back}/${total} plans send him back to the alley/park node he just left`);
});

test('S2 re-alert: a shorter line the second time; a cop already sprinting at him from inside 14 m gets a 0.15 s flinch, not a 0.4 s freeze', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 12, z: 84, a: Math.PI / 2, speed: 0 });      // parked 100 m away
  Object.assign(G.crook, { x: 112, z: 84, a: Math.PI, speed: 0, state: 'calm' });
  Object.assign(G.car, { x: 100, z: 84 });                                // 12 m: heard
  G.step(1 / 60);
  assert.equal(G.dom('msg').textContent, "❗ He heard you — he's bolting for a subway!");
  Object.assign(G.car, { x: 12, z: 84 });                                 // drives off: 100 m away (the map clamps the car, so no (300,300))
  G.step(4);
  assert.equal(G.crook.lost, true);
  Object.assign(G.car, { x: G.crook.x - Math.sin(G.crook.a) * 10, z: G.crook.z - Math.cos(G.crook.a) * 10 });
  G.step(1 / 60);
  assert.equal(G.crook.lost, false);
  assert.equal(G.dom('msg').textContent, '❗ He spotted you again!');
  assert.ok(G.crook.alertUntil - G.now() > 350, 'the parked car is no threat to stand still for: full hold');
  // foot: cop 10 m off, calm crook
  const H = loadGame(); H.started = true; H.mode = 'foot'; H.inputKind = 'keys';
  Object.assign(H.cop, { x: -112, z: 74, a: Math.PI, speed: 0 }); Object.assign(H.car, { x: 200, z: 200, a: 0, speed: 0 });
  Object.assign(H.crook, { x: -112, z: 64, a: Math.PI, speed: 0, state: 'calm' });
  H.step(1 / 60);
  assert.equal(H.crook.state, 'flee');
  const hold = H.crook.alertUntil - H.now();
  assert.ok(hold > 100 && hold < 200, `foot flinch ${hold.toFixed(0)} ms`);
  assert.equal(H.dom('cstate').textContent, 'heard you!');
});

/* ---------------------------------------------------------------- S2 fixes (QA round 3): sidewalk, shed, stagger, no ping-pong */
test('S2 sidewalk: on a street leg with a car about he runs 4 m off the centre line — overtaken at 30 m/s and met head-on, the car never touches him', () => {
  const far = nodeIndex(loadGame(), -112, -84);
  const westbound = G => Object.assign(G.crook, { x: -20, z: 84, a: -Math.PI / 2, speed: 7, state: 'flee', stam: 6, tired: false, glanceT: G.now() + 5000,
    path: [nodeIndex(G, -56, 84), nodeIndex(G, -112, 84), nodeIndex(G, -112, 28), nodeIndex(G, -112, -28), far], pi: 0, target: far });
  // overtaken from behind (the S1 model carried him 20 m down the street on the bumper)
  let G = loadGame(); G.started = true; G.mode = 'drive'; westbound(G);
  Object.assign(G.car, { x: 30, z: 84, a: -Math.PI / 2, speed: 30 }); G.setKeys({ gas: true });
  let minC = Infinity, lane = 0;
  for (let k = 0; k < 300; k++) { G.step(1 / 60); minC = Math.min(minC, minCapsule(G)); if (k === 150) lane = G.crook.z; }
  assert.ok(Math.abs(lane - 84) >= 3.5 && Math.abs(lane - 84) <= 4.5, `2.5 s in he runs at z=${lane.toFixed(1)}, not on the sidewalk`);
  assert.ok(minC >= 3, `capsule ${minC.toFixed(2)} m: shoved along by the passing cruiser`);
  assert.equal(G.crook.hitCount, 0);
  // met head-on (the leg-reaction pose): doubles back in the car's lane, but is off the centre line as it passes
  G = loadGame(); G.started = true; G.mode = 'drive'; westbound(G);
  Object.assign(G.car, { x: -70, z: 84, a: Math.PI / 2, speed: 20 }); G.setKeys({ gas: true });
  minC = Infinity;
  for (let k = 0; k < 300 && G.crook.state === 'flee'; k++) { G.step(1 / 60); minC = Math.min(minC, minCapsule(G)); }
  assert.ok(minC >= 3, `capsule ${minC.toFixed(2)} m`);
  assert.equal(G.crook.state, 'escaped');
  assert.equal(G.crook.hitCount, 0);
  // a cop on foot: no lane — he runs the centre line (the catch test needs him under the cop's nose)
  G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.car, { x: 200, z: 200, a: 0, speed: 0 }); Object.assign(G.cop, { x: -112, z: 76, a: Math.PI, speed: 0 });
  Object.assign(G.crook, { x: -112, z: 60, a: Math.PI, speed: 7, state: 'flee', stam: 6, tired: false });
  G.step(3);
  assert.ok(Math.abs(G.crook.x + 112) < 0.5, `on foot he drifted to x=${G.crook.x.toFixed(1)}`);
});

test('S2 rammed: a cruiser at speed sheds him sideways off the bumper and he staggers 0.6 s — an event, not a bounce', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive';
  const far = nodeIndex(G, -112, -84);
  Object.assign(G.crook, { x: -20, z: 80, a: -Math.PI / 2, speed: 7, state: 'flee', stam: 6, tired: false, glanceT: G.now() + 9000, legT: G.now(),
    path: [nodeIndex(G, -56, 84), nodeIndex(G, -112, 84), nodeIndex(G, -112, 28), nodeIndex(G, -112, -28), far], pi: 0, target: far });
  Object.assign(G.car, { x: -4, z: 80, a: -Math.PI / 2, speed: 30 }); G.setKeys({ gas: true });   // 16 m behind, down his sidewalk, straight at him: 0.5 s, no time to cross
  let tHit = null, carried = 0, x0 = 0;
  for (let k = 0; k < 240; k++) {
    G.step(1 / 60);
    if (tHit === null && G.crook.hitCount) {
      tHit = G.now(); x0 = G.crook.x;
      assert.equal(G.dom('cstate').textContent, 'staggered!');
      assert.equal(G.crook.speed, 0);
      assert.equal(G.dom('msg').textContent, "💥 Clipped him — he's reeling!");
      assert.ok(G.crook.hitUntil - G.now() >= 580 && G.crook.hitUntil - G.now() <= 600);
    } else if (tHit !== null && G.now() < G.crook.hitUntil) {
      carried = Math.max(carried, Math.abs(G.crook.x - x0));
      assert.equal(G.crook.speed, 0, 'held through the stagger');
    }
  }
  assert.ok(tHit !== null && tHit < 2500, 'never clipped');
  assert.equal(G.crook.hitCount, 1, `clipped ${G.crook.hitCount} times by one pass`);
  assert.ok(carried < 3, `carried ${carried.toFixed(1)} m along the street on the bumper`);
  assert.ok(Math.abs(G.crook.z - 80) > 1.5, `shed sideways to z=${G.crook.z.toFixed(1)}`);
  assert.equal(G.dom('cstate').textContent, 'fleeing!');
  assert.ok(G.crook.speed > 3, 'up and running again');
  // the S1 push is unchanged for a parked cruiser: a cop walking into it slides round it, not sideways along it
  const H = loadGame(); H.mode = 'foot';
  Object.assign(H.car, { x: 0, z: 0, a: 0, speed: 0 });
  const [px, pz] = H.collidePerson(0, 3.0, 0.45);            // 0.4 m into the nose
  assert.ok(Math.abs(px) < 1e-6 && pz >= 3.05 - 1e-9, `radial push off a parked car: (${px.toFixed(2)},${pz.toFixed(2)})`);
});

test('S2 rammed all match: a cruiser that turns round as fast as he does (steers at him, gas held, 30 s) — no ping-pong (≤4 double-backs), no stall', () => {
  const wrap = wrapPi;
  const ram = (cx, cz, px, pz, ca) => {
    const G = loadGame(); G.started = true; G.mode = 'drive';
    Object.assign(G.crook, { x: cx, z: cz, a: ca, speed: 0, state: 'calm', stam: 6, tired: false });
    Object.assign(G.car, { x: px, z: pz, a: 0, speed: 0 });
    let last = [px, pz], phase = 'fwd', rs = null, rt = 0, stuckT = 0, lastMove = 0, lastPos = [cx, cz], stalls = 0, lastDb = 0, lastDbT = -1e9;
    for (let k = 0; k < 30 * 60; k++) {
      const now = G.now(), da = wrap(Math.atan2(G.crook.x - G.car.x, G.crook.z - G.car.z) - G.car.a), kk = G.keys;
      const moved = Math.hypot(G.car.x - last[0], G.car.z - last[1]); last = [G.car.x, G.car.z];
      if (phase === 'rev') { kk.gas = false; kk.brake = true; kk.left = kk.right = false; if ((G.car.speed < -1 && Math.hypot(G.car.x - rs[0], G.car.z - rs[1]) > 7) || now - rt > 3000) phase = 'fwd'; }
      else { if (Math.abs(G.car.speed) > 5 && moved < 0.02) { stuckT += 1000 / 60; if (stuckT > 400) { phase = 'rev'; rs = [G.car.x, G.car.z]; rt = now; stuckT = 0; } } else stuckT = 0; kk.left = da > 0.12; kk.right = da < -0.12; kk.gas = true; kk.brake = false; }
      G.step(1 / 60);
      const c = G.crook; if (c.state !== 'flee') break;
      const held = G.now() < c.alertUntil || G.now() < c.dbUntil || G.now() < c.hitUntil;
      const mv = Math.hypot(c.x - lastPos[0], c.z - lastPos[1]); lastPos = [c.x, c.z]; if (mv > 0.02 || held || c.lost) lastMove = G.now();
      if (G.now() - lastMove > 1500) { stalls++; lastMove = G.now(); }
      if (c.dbCount !== lastDb) {    // a second reversal inside 5 s of the first, with the car moving on him, is exactly the ping-pong
        assert.ok(G.now() - lastDbT >= 5000 || Math.abs(G.car.speed) <= 8, `double-back ${c.dbCount} only ${((G.now() - lastDbT) / 1000).toFixed(1)} s after the last at (${c.x.toFixed(0)},${c.z.toFixed(0)})`);
        lastDb = c.dbCount; lastDbT = G.now();
      }
    }
    return { db: G.crook.dbCount, stalls, hits: G.crook.hitCount, state: G.crook.state };
  };
  for (const [cx, cz, px, pz, ca] of [[-111, -33, -110, 26, 1.0], [-35, 83, -59, 47, 0.5], [3, -67, 4, -28, 2.0], [0, -65, -53, -12, 4]]) {
    const r = ram(cx, cz, px, pz, ca);
    assert.ok(r.db <= 4, `from (${cx},${cz}): ${r.db} double-backs in 30 s`);
    assert.equal(r.stalls, 0, `from (${cx},${cz}): stalled`);
  }
});

test("S2 tells: a re-alert clears the '?' — '!' and '?' never show together", () => {
  const G = loadGame(); G.started = true; G.mode = 'drive';
  Object.assign(G.car, { x: 12, z: 84, a: Math.PI / 2, speed: 0 });
  Object.assign(G.crook, { x: 112, z: 84, a: Math.PI, speed: 7, state: 'flee', stam: 6, tired: false });
  G.step(4);
  assert.equal(G.crook.lost, true); assert.ok(G.crook.qUntil > G.now());
  Object.assign(G.car, { x: G.crook.x - Math.sin(G.crook.a) * 10, z: G.crook.z - Math.cos(G.crook.a) * 10 });
  G.step(1 / 60);
  assert.equal(G.crook.lost, false);
  assert.ok(G.crook.popUntil > G.now() && G.crook.qUntil <= G.now(), "'?' still up beside the '!'");
});
