/*  test/academy-drive.test.mjs — v0.4 stage 2 "academy-drive": the Academy framework, the drive drills
    (slalom, gates + bay, exit), graduation + time trial, the start-screen mode, the hint pill.
    Run:  node --test test/*.test.mjs
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const GAME = extractGameScript(HTML);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const val = x => JSON.parse(JSON.stringify(x));

/* the scripted drive: keys only, pure pursuit through street waypoints, 22 m/s cap, creeps into the bay.
   The slalom weaves ±2.5 m about z=-84, on the far side from each cone (the weave rule: a straight run costs +1 s a cone) */
const WEAVE = [0, 1, 2, 3, 4, 5, 6].map(i => [-86 + 12 * i, i % 2 ? -81.5 : -86.5]);
const ROUTE = [...WEAVE, [-6, -84], [28, -84], [50, -84], [56, -70], [56, -56], [56, 0], [56, 22], [50, 28], [28, 28],
  [-28, 28], [-50, 28], [-56, 22], [-56, 10], [-58, 4], [-65, 0]];
function driveCourse(G, untilStep = 2, maxS = 120) {
  let wi = 0, t = 0;
  while (t < maxS && G.acad.step < untilStep) {
    const c = G.car, [wx, wz] = ROUTE[Math.min(wi, ROUTE.length - 1)], d = Math.hypot(wx - c.x, wz - c.z);
    if (d < 4 && wi < ROUTE.length - 1) wi++;
    const err = wrap(Math.atan2(wx - c.x, wz - c.z) - c.a), last = wi >= ROUTE.length - 2;
    const vmax = last ? Math.max(2, Math.min(12, d * 0.8)) : (Math.abs(err) > 0.5 ? 10 : 22);
    G.setKeys({ left: err > 0.05, right: err < -0.05, gas: c.speed < vmax, brake: c.speed > vmax + 3 });
    G.step(1 / 60); t += 1 / 60;
  }
  G.setKeys({ left: false, right: false, gas: false, brake: false });
  return t;
}
function academy(opts = {}, seed = 1) {
  const G = loadGame({ seed });
  G.started = true; G.inputKind = 'keys';
  G.startAcademy(opts);
  return G;
}
const drill = G => G.DRILLS[G.acad.step].id;
/* stage 3: the foot half (line-up, taser range, return) by teleport — the full course now ends there */
function footHalf(G) {
  for (let t = 0; drill(G) === 'lineup' && t < 40; t += 1 / 60) {
    const r = G.cutouts.find(c => c.up && !c.fold && c.kind === 'robber');
    if (r && G.gnow() >= G.cop.freezeUntil) { Object.assign(G.cop, { x: r.x - 1, z: r.z }); G.doAction(); }
    G.step(1 / 60);
  }
  for (let t = 0; drill(G) === 'taser' && t < 40; t += 1 / 60) {
    const S = G.slider;
    if (G.taze.phase === 'idle' && S.state !== 'tased' && S.x > G.RAIL.x1 + 1 && S.x < G.RAIL.x2 - 3 && S.dir > 0) {
      Object.assign(G.cop, { x: S.x, z: G.FIRE_Z, a: Math.PI, speed: 0 }); G.fireTaze(G.gnow(), 1);
    }
    G.step(1 / 60);
  }
  if (drill(G) === 'return') { Object.assign(G.cop, { x: G.car.x + 2.5, z: G.car.z, freezeUntil: 0 }); G.step(1 / 60); G.doAction(); G.step(1 / 60); }
}
function toGatesBay(G) {                                    // skip to gates with every ring passed
  G.acad.step = G.DRILLS.findIndex(d => d.id === 'gates'); G.acad.gi = G.GATES.length; G.acad.lapT0 = G.acad.drillT0 = Math.max(1, G.gnow());
}

/* ---------------------------------------------------------------- structure */
test('A struct: simulate = steer → stepPlayer → academyStep | (resolveTaze, updateCrook, updateRun) → updateActBtn', () => {
  const sim = GAME.slice(GAME.indexOf('function simulate('), GAME.indexOf('function stepPlayer('));
  assert.match(sim, /stepPlayer\(dt,now,go\);\s*if\(phase==='academy'\)academyStep\(dt,now\); else\{resolveTaze\(now\);updateCrook\(dt,now\);updateRun\(dt,now\);\}\s*updateActBtn\(\);/);
  const G = loadGame();
  assert.equal(G.phase, 'patrol');
  for (const k of ['acad', 'DRILLS', 'startAcademy', 'exitAcademy', 'startPatrol', 'academyStep', 'stepPlayer', 'hintFor', 'ACADEMY_PAR', 'buildAcademyProps'])
    assert.ok(G[k] !== undefined, k);
  assert.deepEqual(val(G.DRILLS.map(d => d.id)), ['slalom', 'gates', 'exit', 'lineup', 'taser', 'return', 'graduate']);   // stage 3 spliced the foot half in
  for (const d of G.DRILLS) for (const f of ['setup', 'update', 'aff', 'done']) assert.equal(typeof d[f], 'function', d.id + '.' + f);
  assert.ok(G.ACADEMY_PAR.gold < G.ACADEMY_PAR.silver && G.ACADEMY_PAR.silver < G.ACADEMY_PAR.bronze && G.ACADEMY_PAR.provisional);
});
test('A struct: #cardGo is the last child of #card; the pinned card prefix stays', () => {
  assert.match(HTML, /<div id="card"><div id="cardH">BOOKED<\/div><div id="cardS">★ ★ ★<\/div><div id="cardL"><\/div><div id="cardR"><\/div><button id="cardGo">GO ON PATROL →<\/button><\/div>/);
});
test('A props: lazy — none at load, built once, hidden in patrol, no Math.random consumed', () => {
  const G = loadGame();
  assert.equal(G.acadProps, null);
  const probe = G.evalInGame('Math.random()');
  const H = loadGame(); H.buildAcademyProps(); H.buildAcademyProps();
  assert.equal(H.evalInGame('Math.random()'), probe, 'building the props consumed the seeded stream');
  assert.equal(H.acadProps.g.visible, false);
  H.started = true; H.startAcademy(); assert.equal(H.acadProps.g.visible, true);
  H.startPatrol(); assert.equal(H.acadProps.g.visible, false); assert.ok(H.acadProps, 'kept built');
});
test('A props: every gate centre and the cones are on open street (seeds 1-3)', () => {
  for (const seed of [1, 2, 3]) {
    const G = loadGame({ seed });
    for (const [x, z] of G.GATES) { const [cx, cz] = G.collide(x, z, 0.01); assert.ok(Math.hypot(cx - x, cz - z) < 1e-9, `gate ${x},${z} inside a building`); }
    for (const c of G.CONES) { const [cx, cz] = G.collide(c.x, c.z, 0.5); assert.ok(Math.hypot(cx - c.x, cz - c.z) < 1e-9, `cone ${c.x}`); }
    assert.equal(G.CONES.length, 7);
    assert.deepEqual(val(G.CONES.map(c => c.x)), [-86, -74, -62, -50, -38, -26, -14]);
    assert.deepEqual(val(G.CONES.map(c => c.z)), [-81.5, -86.5, -81.5, -86.5, -81.5, -86.5, -81.5]);
  }
});

/* ---------------------------------------------------------------- patrol is untouched */
function patrolTrace(built) {
  const G = loadGame({ seed: 1 });
  if (built) G.buildAcademyProps();
  G.started = true; G.inputKind = 'keys'; G.respawnCrook();
  Object.assign(G.car, { x: G.crook.x - 25, z: G.crook.z, a: Math.PI / 2, speed: 0 });
  G.setKeys({ gas: true });
  const tr = [];
  for (let i = 0; i < 200; i++) {
    if (i === 120) G.setKeys({ gas: false, brake: true });
    G.step(1 / 60); tr.push([G.affordance(), G.crook.x, G.crook.z, G.crook.state]);
  }
  return tr;
}
test('A patrol regression: 200 seeded patrol ticks are identical with the academy props built', () => {
  const a = patrolTrace(false), b = patrolTrace(true);
  assert.ok(a.some(r => r[3] === 'flee'), 'the trace alerts the crook');
  assert.deepEqual(b, a);
});
test('A seed invariance: startAcademy(); exitAcademy(); respawnCrook() lands him where respawnCrook() alone does', () => {
  const G1 = loadGame({ seed: 1 }), G2 = loadGame({ seed: 1 });
  G1.started = true; G1.startAcademy(); G1.exitAcademy();
  Object.assign(G1.car, { x: -100, z: -88, a: Math.PI / 2 });
  G1.respawnCrook(); G2.respawnCrook();
  assert.deepEqual([G1.crook.x, G1.crook.z], [G2.crook.x, G2.crook.z]);
});

/* ---------------------------------------------------------------- the drills */
test('A drive bot: slalom then gates in order, bay hold, EXIT → graduation card; the course is short', () => {
  const G = academy();
  assert.equal(drill(G), 'slalom'); assert.equal(G.events.count('whistle'), 1);
  const t = driveCourse(G);
  assert.equal(drill(G), 'exit', `stuck in ${drill(G)} gi ${G.acad.gi}`);
  assert.deepEqual(G.events.filter(e => e.type === 'gate').map(e => e.data.i), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(G.events.filter(e => e.type === 'drillDone').map(e => e.data.id), ['slalom', 'gates']);
  assert.ok(t < 60, `bot course ${t}s`);
  assert.ok(Math.abs(G.acad.lap - (G.acad.times.slalom + G.acad.times.gates)) < 0.05, 'lap = slalom + gates');
  assert.ok(G.acad.lap < G.ACADEMY_PAR.gold, `bot lap ${G.acad.lap} earns gold`);
  assert.equal(G.affordance(), 'exit');
  G.doAction(); G.step(1 / 60);
  assert.equal(G.mode, 'foot'); assert.equal(drill(G), 'lineup');
  footHalf(G); assert.equal(drill(G), 'graduate');
  assert.equal(G.dom('cardH').textContent, 'GRADUATED 🎓');
  assert.equal(G.dom('cardS').textContent, '🥇');
  assert.match(G.dom('cardL').textContent, /^Slalom \d+\.\ds · Gates \d+\.\ds · Line-up \d+\.\ds · Taser \d+\.\ds$/);
  assert.match(G.dom('cardR').textContent, /^Lap 0:\d\d\.\d · Best 0:\d\d\.\d$/);
  assert.ok(G.dom('card').classList.contains('show') && G.dom('card').classList.contains('grad'));
  assert.equal(G.events.count('graduate'), 1); assert.equal(G.events.count('newBest'), 0);
  assert.equal(G.crook.state, 'calm', 'the crook AI never ran');
});
test('A gates: an out-of-order gate does not count', () => {
  const G = academy(); G.acad.step = 1; G.DRILLS[1].setup(G.gnow());
  Object.assign(G.car, { x: G.GATES[2][0], z: G.GATES[2][1] }); G.step(0.1);
  assert.equal(G.acad.gi, 0); assert.equal(G.events.count('gate'), 0);
  Object.assign(G.car, { x: G.GATES[0][0], z: G.GATES[0][1] + 4 }); G.step(0.1);
  assert.equal(G.acad.gi, 1); assert.equal(G.events.count('gate'), 1);
  Object.assign(G.car, { x: G.GATES[0][0], z: G.GATES[0][1] }); G.step(0.1);
  assert.equal(G.acad.gi, 1, 'passing gate 0 again does nothing');
  Object.assign(G.car, { x: G.GATES[1][0], z: G.GATES[1][1] - 5.5, speed: 0 }); G.step(0.1);
  assert.equal(G.acad.gi, 1, '5.5 m off the centre is outside the gate');
});
test('A slalom: a clipped cone adds 1 s exactly once; the clock starts on the line', () => {
  const G = academy();
  assert.equal(G.acad.lapT0, 0);
  const c = G.CONES[0];
  Object.assign(G.car, { x: c.x - 1.35, z: c.z, a: Math.PI / 2 });    // front circle centre right on the cone
  G.step(0.5);
  assert.ok(G.acad.lapT0 > 0, 'past x=-92: the clock runs');
  assert.equal(G.acad.pen, 1); assert.equal(G.events.count('cone'), 1); assert.ok(c.hit);
  G.step(0.5); assert.equal(G.acad.pen, 1, 'once per cone');
  assert.equal(G.BOLLARDS.some(b => b.x === c.x && b.z === c.z), false, 'cones never collide');
  assert.match(G.dom('acad').innerHTML, /\+1s/);
});
test('A gates: the bay hold completes it after 0.5 s at mv < 3, not before; SIREN nudge after gate 3', () => {
  const G = academy(); toGatesBay(G);
  Object.assign(G.car, { x: -65, z: 0, a: -Math.PI / 2, speed: 0 });
  G.step(0.45); assert.equal(drill(G), 'gates');
  G.step(0.1); assert.equal(drill(G), 'exit');
  assert.ok(G.acad.times.gates > 0);
  const H = academy(); H.acad.step = 1; H.DRILLS[1].setup(H.gnow()); H.acad.gi = 3;
  H.step(1 / 60);
  assert.equal(H.hintFor(), 'TAP SIREN!'); assert.ok(H.dom('bSiren').classList.contains('nudge'));
  H.toggleSiren(); H.step(1 / 60);
  assert.equal(H.hintFor(), 'DRIVE THROUGH RINGS'); assert.ok(!H.dom('bSiren').classList.contains('nudge'));
  const K = academy(); toGatesBay(K);
  Object.assign(K.car, { x: -65, z: 0, a: -Math.PI / 2, speed: 6 }); K.setKeys({ gas: true });
  for (let i = 0; i < 20; i++) { K.car.x = -65; K.car.z = 0; K.step(1 / 60); }
  assert.equal(drill(K), 'gates', 'rolling through the bay does not count');
});
test('A crash in the academy: +2 s and crash, no paperwork; crook AI and taser off', () => {
  const G = academy();
  const cx = G.crook.x, cz = G.crook.z;
  G.step(1.2);
  Object.assign(G.car, { mvRaw: 20, speed: 0 }); G.step(1 / 60);
  assert.equal(G.acad.pen, 2); assert.equal(G.events.count('crash'), 1); assert.equal(G.run.paperwork, 0);
  Object.assign(G.car, { x: cx - 10, z: cz, speed: 5 }); G.step(1);
  assert.deepEqual([G.crook.x, G.crook.z, G.crook.state], [cx, cz, 'calm'], 'he never hears you');
  G.mode = 'foot'; Object.assign(G.cop, { x: cx - 5, z: cz, a: Math.PI / 2 });
  assert.equal(G.tazeOK(), false);
});
test('A exit: doAction() EXIT completes the exit drill; the pulse ring marks it; bAct text/class unchanged', () => {
  const G = academy(); toGatesBay(G);
  Object.assign(G.car, { x: -65, z: 0, speed: 0 }); G.step(0.6);
  assert.equal(drill(G), 'exit');
  G.step(1 / 60);
  assert.equal(G.hintFor(), 'TAP EXIT!');
  assert.equal(G.dom('bAct').textContent, 'EXIT'); assert.equal(G.dom('bAct').className, 'hot');
  assert.ok(G.dom('actRing').classList.contains('on'));
  G.doAction(); G.step(1 / 60);
  assert.equal(drill(G), 'lineup'); assert.equal(G.events.count('drillDone'), 2);
  assert.ok(G.dom('bSiren').classList.contains('hide'));
});

/* ---------------------------------------------------------------- graduation + career */
function graduateNow(G) { toGatesBay(G); Object.assign(G.car, { x: -65, z: 0, speed: 0 }); G.step(0.6); G.doAction(); G.step(1 / 60); footHalf(G); }
test('A graduation writes career.academy for badge A only; Reset career clears it', () => {
  const G = loadGame(); G.started = true;
  G.selectBadge('1111'); G.startAcademy(); graduateNow(G);
  const A = JSON.parse(G.ctx.localStorage.getItem('code3.career.1111'));
  assert.equal(A.academy.grad, true); assert.ok(A.academy.t > 0); assert.ok(A.academy.best.lap > 0 && A.academy.best.gates > 0);
  G.selectBadge('2222');
  assert.equal(G.career.academy, undefined);
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career.2222')).academy, undefined);
  G.selectBadge('1111'); assert.equal(G.career.academy.grad, true);
  G.dom('bReset').dispatch('click'); G.dom('bReset').dispatch('click');
  assert.equal(G.career.academy, undefined);
  assert.equal(JSON.parse(G.ctx.localStorage.getItem('code3.career.1111')).academy, undefined);
});
test('A gradStars: 0 leaves the stars alone; 3 adds 3 exactly once', () => {
  const G = loadGame(); G.started = true; G.selectBadge('3333');
  G.startAcademy(); graduateNow(G); assert.equal(G.career.stars, 0);
  const H = loadGame(); H.started = true; H.selectBadge('4444'); H.RULES.gradStars = 3;
  H.startAcademy(); graduateNow(H); assert.equal(H.career.stars, 3);
  H.startAcademy({ trial: true }); graduateNow(H); assert.equal(H.career.stars, 3, 'once');
});
test('A time trial: a faster lap is a NEW BEST (newBest), a slower one is not; the clock shows once graduated', () => {
  const G = loadGame(); G.started = true; G.selectBadge('5555');
  G.startAcademy(); toGatesBay(G); G.acad.lapT0 = 1; G.advance(40000);
  Object.assign(G.car, { x: -65, z: 0, speed: 0 }); G.step(0.6); G.doAction(); G.step(1 / 60); footHalf(G);
  const slow = G.career.academy.best.lap; assert.ok(slow > 40);
  G.startAcademy({ trial: true }); G.step(1 / 60);
  assert.match(G.dom('acad').innerHTML, /0:00\.0/, 'trial: the clock is on the chip');
  graduateNow(G);
  assert.equal(G.dom('cardH').textContent, 'TIME TRIAL 🏁');
  assert.match(G.dom('cardR').textContent, / · NEW BEST$/); assert.equal(G.events.count('newBest'), 1);
  assert.ok(G.career.academy.best.lap < slow);
  G.startAcademy({ trial: true }); toGatesBay(G); G.acad.lapT0 = 1; G.advance(90000); Object.assign(G.car, { x: -65, z: 0, speed: 0 }); G.step(0.6); G.doAction(); G.step(1 / 60); footHalf(G);
  assert.doesNotMatch(G.dom('cardR').textContent, /NEW BEST/); assert.equal(G.events.count('newBest'), 1);
});
test('A single drill (?drill=slalom): a trial of that drill only; best.slalom kept, no graduation', () => {
  const G = loadGame(); G.started = true; G.selectBadge('6666');
  G.ctx.location.search = '?drill=slalom'; G.applyUrlMode();
  assert.equal(G.startMode, 'academy'); assert.equal(G.startOnly, 'slalom');
  G.beginGame();
  assert.equal(G.phase, 'academy'); assert.equal(G.acad.only, 'slalom'); assert.equal(G.acad.trial, true);
  driveCourse(G, 3);
  assert.equal(drill(G), 'graduate');
  assert.equal(G.dom('cardH').textContent, 'TIME TRIAL 🏁'); assert.equal(G.dom('cardS').textContent, '⏱');
  assert.match(G.dom('cardR').textContent, /^Time 0:0\d\.\d · Best 0:0\d\.\d$/);
  assert.ok(G.career.academy.best.slalom > 0); assert.equal(G.career.academy.grad, false);
  assert.equal(G.events.count('graduate'), 0);
  const H = loadGame(); H.started = true; H.startAcademy({ only: 'gates' });
  assert.equal(drill(H), 'gates'); assert.deepEqual([H.car.x, H.car.z], [-8, -84]);
});
test('A GO ON PATROL: startPatrol resets the car, hides props + card, respawns the crook, says the patrol line', () => {
  const G = loadGame(); G.started = true; G.startAcademy(); graduateNow(G);
  G.step(0.7); G.siren.on = true;                          // round3: armed after 600 ms, fires on the lift of its own press
  G.dom('cardGo').dispatch('pointerdown'); G.dom('cardGo').dispatch('pointerup');
  assert.equal(G.phase, 'patrol'); assert.equal(G.mode, 'drive'); assert.equal(G.siren.on, false);
  assert.deepEqual([G.car.x, G.car.z, G.car.a, G.car.speed], [-100, -88, Math.PI / 2, 0]);
  assert.ok(!G.dom('card').classList.contains('show') && !G.dom('card').classList.contains('grad'));
  assert.ok(!G.dom('acad').classList.contains('on')); assert.equal(G.acadProps.g.visible, false);
  assert.equal(G.crook.state, 'calm'); assert.equal(G.events.count('spawn'), 1);
  assert.match(G.dom('msg').textContent, /find the crook — cuff him before he reaches a subway 🚇$/);
  G.step(1); assert.equal(G.crookLabel(), 'unaware');
});

/* ---------------------------------------------------------------- start screen */
test('A start mode: a new badge preselects ACADEMY, a graduate PATROL + TIME TRIAL; ?academy preselects; chips get 🎓', () => {
  const G = loadGame();
  assert.equal(G.startMode, 'academy', 'no badge yet: academy');
  G.selectBadge('7777'); G.career.academy = { grad: true, t: 1, best: { lap: 30 } }; G.saveCareer();
  G.dom('badgeIn').value = '7777'; G.renderBadges();
  assert.equal(G.startMode, 'patrol'); assert.equal(G.dom('segAcad').textContent, '🎓 TIME TRIAL');
  assert.ok(G.dom('segPatrol').classList.contains('on'));
  assert.ok(G.dom('badges').children.some(c => c.textContent === '#7777 · CADET 0★ 🎓'));
  G.ctx.location.search = '?academy'; G.applyUrlMode(); G.renderBadges();
  assert.equal(G.startMode, 'academy'); assert.equal(G.startOnly, null);
  G.dom('segPatrol').dispatch('pointerdown'); assert.equal(G.startMode, 'patrol');
  const H = loadGame(); H.selectBadge('8888'); H.dom('badgeIn').value = '8888'; H.renderBadges();
  assert.equal(H.startMode, 'academy'); assert.equal(H.dom('segAcad').textContent, '🎓 ACADEMY');
  H.dom('segPatrol').dispatch('pointerdown'); H.renderBadges();
  assert.equal(H.startMode, 'patrol', 'a hand pick sticks for that badge');
  H.beginGame(); assert.equal(H.phase, 'patrol');
  assert.equal(H.dom('msg').textContent, '#8888 CADET on duty · find the crook — cuff him before he reaches a subway 🚇');
});

/* ---------------------------------------------------------------- hint pill */
test('A hintFor: the patrol verbs in scripted states', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'keys';
  G.step(1 / 60);
  assert.equal(G.hintFor(), 'FIND HIM!');
  assert.equal(G.dom('hint').textContent, 'FIND HIM!'); assert.ok(G.dom('hint').classList.contains('on'));
  Object.assign(G.crook, { state: 'flee', alerted: true, glanceT: G.now() + 9e5 });
  assert.equal(G.hintFor(), 'CHASE HIM!');
  Object.assign(G.car, { x: G.crook.x - 10, z: G.crook.z, speed: 20 });
  assert.equal(G.affordance(), 'slow'); assert.equal(G.hintFor(), 'SLOW DOWN, JUMP OUT!', 'EXIT dimmed: slow down first');
  G.car.speed = 0; assert.equal(G.affordance(), 'exit');
  assert.equal(G.hintFor(), 'JUMP OUT!');
  G.mode = 'foot'; Object.assign(G.cop, { x: G.crook.x - 1.5, z: G.crook.z, a: Math.PI / 2, freezeUntil: 0 });
  assert.equal(G.hintFor(), 'GRAB HIM!');
  G.updateActBtn(); assert.ok(G.dom('actRing').classList.contains('on'), 'GRAB ↔ CUFF pulses'); assert.equal(G.dom('bAct').className, 'cuff');
  Object.assign(G.cop, { x: G.crook.x - 6, z: G.crook.z }); G.crook.speed = 0;
  assert.equal(G.hintFor(), 'ZAP HIM!');
  G.mode = 'drive'; Object.assign(G.crook, { state: 'custody', inCar: true });
  Object.assign(G.car, { x: 0, z: -84, speed: 0, mv: 0 });
  assert.equal(G.hintFor(), 'DRIVE TO STATION');
  Object.assign(G.car, { x: -65, z: 0, mv: 5 }); assert.equal(G.hintFor(), 'STOP IN THE BAY');
  G.car.mv = 0; assert.equal(G.hintFor(), 'TAP BOOK!');
  G.crook.inCar = false; G.mode = 'foot'; assert.equal(G.hintFor(), 'WALK HIM TO THE CAR');
  G.hintsOn = false; G.updateActBtn(); assert.equal(G.dom('hint').textContent, ''); assert.ok(!G.dom('actRing').classList.contains('on'));
  G.dom('tHints').dispatch('click'); assert.equal(G.hintsOn, true); assert.equal(G.ctx.localStorage.getItem('code3.hints'), 'on');
});
test('A kid text: whistle lines ≤ 8 words + 1 emoji; hints ≤ 22 chars', () => {
  const G = loadGame();
  const emoji = s => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
  const lines = G.DRILLS.map(d => d.line).concat(['Tap SIREN — go fast! 🚨', 'Park in the bay! 🏢']);
  for (const l of lines) { assert.ok(l.replace(/\p{Extended_Pictographic}|—/gu, '').trim().split(/\s+/).length <= 8, l); assert.equal(emoji(l), 1, l); }
  assert.ok(GAME.includes("say('📣 Tap SIREN — go fast! 🚨'") && GAME.includes("say('📣 Park in the bay! 🏢'"));
  const hints = ['FIND HIM!', 'CHASE HIM!', 'JUMP OUT!', 'SLOW DOWN, JUMP OUT!', 'GRAB HIM!', 'ZAP HIM!', 'WALK HIM TO THE CAR', 'DRIVE TO STATION', 'STOP IN THE BAY', 'TAP BOOK!',
    'TILT TO WEAVE', 'DRIVE THROUGH RINGS', 'TAP SIREN!', 'TAP EXIT!', 'CUFF ROBBERS 3/3'];
  for (const h of hints) assert.ok(h.length <= 22, h);
  for (const d of G.DRILLS) if (typeof d.hint === 'string') assert.ok(hints.includes(d.hint), d.hint);
});
test('A HUD chip: step/N, dots, clock only in trial or once graduated', () => {
  const G = academy();
  G.step(1 / 60);
  assert.equal(G.dom('acad').innerHTML, '🎓 1/6 <span class="dots">○○○○○○</span>');
  assert.ok(G.dom('acad').classList.contains('on'));
  const T = academy({ trial: true }); T.step(1 / 60);
  assert.match(T.dom('acad').innerHTML, /^🎓 1\/6 <span class="dots">○○○○○○<\/span> 0:00\.0$/);
  assert.equal(G.fmtT(31.44), '0:31.4'); assert.equal(G.fmtT(59.96), '1:00.0'); assert.equal(G.fmtT(125.3), '2:05.3');
});
