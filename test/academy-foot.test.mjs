/*  test/academy-foot.test.mjs — v0.4 stage 3 "academy-foot": the tazeTarget()/tgtLive() seam, the cutout
    line-up (robber vs Grandma), the taser range on the real taser code, the walk back to the cruiser.
    Run:  node --test test/*.test.mjs
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const GAME = extractGameScript(fs.readFileSync(INDEX_HTML, 'utf8'));
const TREES = [[-12, -12], [12, -12], [-12, 12], [12, 12], [-15, 2], [15, -3], [3, 15], [-4, -15]].map(([x, z]) => [-28 + x, z]);
const GAP_BOLLARDS = [[-28, -21.4], [-28, 21.4], [-49.4, 0], [-6.6, 0]];
const drill = G => G.DRILLS[G.acad.step].id;

function academy(opts = {}, seed = 1) {
  const G = loadGame({ seed });
  G.started = true; G.inputKind = 'keys';
  G.startAcademy(opts);
  return G;
}
function toDrill(G, id) {                                  // jump straight into a drill, on foot by the park (no drive)
  G.footStart(); G.acad.step = G.DRILLS.findIndex(d => d.id === id);
  G.acad.drillT0 = Math.max(1, G.gnow()); G.acad.pen0 = G.acad.pen; G.DRILLS[G.acad.step].setup(G.gnow());
}
/* scripted foot half: teleport next to each robber and cuff; stand under the slider and fire (roll 1: no juke) */
function lineupBot(G, maxS = 40) {
  let t = 0;
  while (drill(G) === 'lineup' && t < maxS) {
    const r = G.cutouts.find(c => c.up && !c.fold && c.kind === 'robber');
    if (r && G.gnow() >= G.cop.freezeUntil) { Object.assign(G.cop, { x: r.x - 1, z: r.z }); G.doAction(); }
    G.step(1 / 60); t += 1 / 60;
  }
  return t;
}
function taserBot(G, maxS = 40) {
  let t = 0;
  while (drill(G) === 'taser' && t < maxS) {
    if (G.taze.phase === 'idle' && G.slider.state !== 'tased' && G.slider.x > G.RAIL.x1 + 1 && G.slider.x < G.RAIL.x2 - 3 && G.slider.dir > 0) {
      Object.assign(G.cop, { x: G.slider.x, z: G.FIRE_Z, a: Math.PI, speed: 0 });
      G.fireTaze(G.gnow(), 1);
    }
    G.step(1 / 60); t += 1 / 60;
  }
  return t;
}
function returnBot(G) {
  Object.assign(G.cop, { x: G.car.x + 2.5, z: G.car.z, freezeUntil: 0 }); G.step(1 / 60);
  assert.equal(G.affordance(), 'enter'); G.doAction(); G.step(1 / 60);
}

/* ---------------------------------------------------------------- the seam */
test('F seam: tazeTarget() is the crook on patrol, the slider only on the range, null elsewhere in the academy', () => {
  const G = loadGame(); G.started = true;
  assert.equal(G.tazeTarget(), G.crook);
  assert.equal(G.tgtLive(null), false); assert.equal(G.tgtLive({ state: 'calm' }), true);
  assert.equal(G.tgtLive({ state: 'flee' }), true); assert.equal(G.tgtLive({ state: 'tased' }), false);
  G.startAcademy(); assert.equal(G.tazeTarget(), null);
  toDrill(G, 'lineup'); assert.equal(G.tazeTarget(), null);
  toDrill(G, 'taser'); assert.equal(G.tazeTarget(), G.slider);
  G.startPatrol(); assert.equal(G.tazeTarget(), G.crook);
  /* the taser functions read their target only through the seam */
  const src = GAME.slice(GAME.indexOf('function tazeOKRaw('), GAME.indexOf('function toggleSiren('));
  assert.doesNotMatch(src, /\bcrook\./, 'taser code reads crook.* directly');
});
test('F drills: lineup, taser, return spliced in before graduate; 6 dots on the chip', () => {
  const G = academy();
  assert.deepEqual(JSON.parse(JSON.stringify(G.DRILLS.map(d => d.id))), ['slalom', 'gates', 'exit', 'lineup', 'taser', 'return', 'graduate']);
  G.step(1 / 60);
  assert.equal(G.dom('acad').innerHTML, '🎓 1/6 <span class="dots">○○○○○○</span>');
});

/* ---------------------------------------------------------------- geometry */
test('F spots: every CUTOUT_SPOT ≥3 m from each tree, gap bollard and other spot, inside the hedge, north half', () => {
  const G = loadGame();
  assert.equal(G.CUTOUT_SPOTS.length, 8);
  G.CUTOUT_SPOTS.forEach((s, i) => {
    for (const [x, z] of TREES) assert.ok(Math.hypot(s.x - x, s.z - z) >= 3, `spot ${i} near tree ${x},${z}`);
    for (const [x, z] of GAP_BOLLARDS) assert.ok(Math.hypot(s.x - x, s.z - z) >= 3, `spot ${i} near gap bollard`);
    G.CUTOUT_SPOTS.forEach((o, j) => { if (j !== i) assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= 3, `spots ${i},${j}`); });
    assert.ok(s.x > -48.8 + 1 && s.x < -7.2 - 1 && s.z > -20.8 + 1 && s.z < 20.8 - 1, `spot ${i} outside the hedge`);
    assert.ok(s.z < -2, `spot ${i} not in the north half`);
    const [cx, cz] = G.collidePerson(s.x, s.z, 0.45); assert.ok(Math.hypot(cx - s.x, cz - s.z) < 1e-9, `spot ${i} is blocked`);
  });
  /* the trees and gap bollards the test assumes are really there */
  for (const [x, z] of TREES.concat(GAP_BOLLARDS)) assert.ok(G.BOLLARDS.some(b => Math.abs(b.x - x) < 1e-9 && Math.abs(b.z - z) < 1e-9), `${x},${z}`);
});
test('F rail: every rail point ≥8 m from each tree; the firing line is open ground', () => {
  const G = loadGame();
  for (let x = G.RAIL.x1; x <= G.RAIL.x2 + 1e-9; x += 0.25)
    for (const [tx, tz] of TREES) assert.ok(Math.hypot(x - tx, G.RAIL.z - tz) >= 8, `rail ${x} near tree ${tx},${tz}`);
  for (let x = G.RAIL.x1; x <= G.RAIL.x2; x += 1) {
    const [cx, cz] = G.collidePerson(x, G.FIRE_Z, 0.45); assert.ok(Math.hypot(cx - x, cz - G.FIRE_Z) < 1e-9, `firing line ${x}`);
  }
});

/* ---------------------------------------------------------------- line-up */
test('F line-up: pairs pop (popup), one robber + one decoy; decoys cycle grandma → mail → hotdog', () => {
  const G = academy(); toDrill(G, 'lineup'); G.step(1 / 60);
  const kinds = [];
  for (let r = 0; r < 3; r++) {
    const up = G.cutouts.filter(c => c.up && !c.fold);
    assert.equal(up.length, 2); assert.equal(up.filter(c => c.kind === 'robber').length, 1);
    kinds.push(up.find(c => c.kind !== 'robber').kind);
    assert.ok(Math.hypot(up[0].x - up[1].x, up[0].z - up[1].z) >= 3);
    const d = up.find(c => c.kind !== 'robber'); Object.assign(G.cop, { x: d.x - 1, z: d.z }); G.doAction(); G.step(1);
  }
  assert.deepEqual(kinds, ['grandma', 'mail', 'hotdog']);
  assert.equal(G.events.count('popup'), 4);
});
test('F line-up: cuffing a decoy does not advance, adds exactly 3 s, emits decoy + says OOPS; the pair folds, a new pair pops 0.8 s later', () => {
  const G = academy(); toDrill(G, 'lineup'); G.step(1 / 60);
  const pen = G.acad.pen, g = G.cutouts.find(c => c.kind === 'grandma');
  Object.assign(G.cop, { x: g.x + 1.2, z: g.z });
  G.step(1 / 60); assert.equal(G.affordance(), 'cuff'); assert.equal(G.dom('bAct').textContent, 'CUFF');
  G.doAction();
  assert.equal(G.acad.pen, pen + 3); assert.equal(G.acad.robbers, 0); assert.equal(drill(G), 'lineup');
  assert.equal(G.events.count('decoy'), 1); assert.equal(G.events.filter(e => e.type === 'decoy')[0].data.kind, 'grandma');
  assert.equal(G.dom('msg').textContent, "📣 OOPS! That's Grandma! 👵");
  assert.ok(G.cutouts.every(c => c.fold > 0), 'the pair folds');
  assert.equal(G.affordance(), null, 'the stagger: no CUFF');
  G.step(0.35); assert.equal(G.affordance(), null, 'folded boards never offer CUFF');
  G.step(0.3); assert.equal(G.events.count('popup'), 1);
  G.step(0.2); assert.equal(G.events.count('popup'), 2, 'the next pair');
  assert.equal(G.acad.pen, pen + 3, 'exactly 3 s');
  G.cutouts.forEach(c => { assert.equal(c.fold, 0); });
});
test('F line-up: 3 robber cuffs (0.6 s beat, cuffCutout) advance to the taser range; the time counts +3 s per decoy', () => {
  const G = academy(); toDrill(G, 'lineup'); G.step(1 / 60);
  const r = G.cutouts.find(c => c.kind === 'robber');
  Object.assign(G.cop, { x: r.x, z: r.z - 1.5 }); G.doAction();
  assert.equal(G.events.count('cuffCutout'), 1); assert.equal(G.acad.robbers, 1);
  assert.ok(Math.abs(G.cop.freezeUntil - G.gnow() - 600) < 1e-6);
  assert.equal(G.dom('msg').textContent, '📣 GOT HIM! Nice cuff! 🚔');
  G.step(1 / 60); assert.equal(G.dom('modeTxt').textContent, 'CUFFING');
  lineupBot(G);
  assert.equal(drill(G), 'taser');
  assert.equal(G.events.count('cuffCutout'), 3); assert.equal(G.events.count('decoy'), 0);
  assert.deepEqual(G.events.filter(e => e.type === 'drillDone').map(e => e.data.id), ['lineup']);
  assert.ok(G.acad.times.lineup > 1 && G.acad.times.lineup < 10, `lineup ${G.acad.times.lineup}`);
});
test('F line-up: CUFF only within 2.6 m of an upright board; nothing to hit from the crook', () => {
  const G = academy(); toDrill(G, 'lineup'); G.step(1 / 60);
  const c = G.cutouts[0];
  Object.assign(G.cop, { x: c.x - 2.7, z: c.z }); G.step(1 / 60); assert.notEqual(G.affordance(), 'cuff');
  Object.assign(G.cop, { x: c.x - 2.4, z: c.z }); G.step(1 / 60); assert.equal(G.affordance(), 'cuff');
  assert.equal(G.crook.state, 'calm'); assert.equal(G.busts, 0);
  assert.ok(G.cutouts.every(k => !G.BOLLARDS.some(b => b.x === k.x && b.z === k.z)), 'boards never collide');
});

/* ---------------------------------------------------------------- taser range */
function rangeShot(G, round) {
  G.acad.shot = round - 1; G.step(1 / 60);
  Object.assign(G.slider, { x: -28, dir: 1 }); G.step(1 / 60);
  Object.assign(G.cop, { x: G.slider.x, z: G.FIRE_Z, a: Math.PI, speed: 0 });
}
test('F taser: fireTaze(now,0) in round 2 jukes and misses (tazeMiss juked, the click line); round 1 never jukes', () => {
  const G = academy(); toDrill(G, 'taser'); rangeShot(G, 2);
  assert.equal(G.tazeOK(), true); assert.equal(G.slider.speed, 4.2);
  const x0 = G.slider.x;
  assert.equal(G.fireTaze(G.gnow(), 0), true); assert.ok(G.slider.juke, 'juked');
  G.step(0.4);
  assert.equal(G.taze.hit, false); assert.equal(G.acad.hits, 0); assert.equal(G.acad.shot, 2);
  assert.ok(G.slider.x < x0 - 2, 'slid back along the rail'); assert.equal(G.slider.z, G.RAIL.z);
  const m = G.events.filter(e => e.type === 'tazeMiss'); assert.equal(m.length, 1); assert.equal(m[0].data.juked, true);
  assert.equal(G.dom('msg').textContent, '📣 He heard you! Zap again from the line');
  const H = academy(); toDrill(H, 'taser'); rangeShot(H, 1);
  assert.equal(H.slider.speed, 3.5);
  assert.equal(H.fireTaze(H.gnow(), 0), true); assert.equal(H.slider.juke, null, 'round 1: calm, never jukes');
  H.step(0.4); assert.equal(H.taze.hit, true); assert.equal(H.dom('msg').textContent, '📣 BZZT! Nice shot! ⚡');
  assert.equal(H.events.count('tazeFire'), 1); assert.equal(H.events.count('tazeHit'), 1);
  const K = academy(); toDrill(K, 'taser'); rangeShot(K, 3); assert.equal(K.slider.speed, 5.0);
});
test('F taser: default roll — the first round-2 shot jukes, so a two-hit cadet still hears the click', () => {
  const G = academy(); toDrill(G, 'taser'); rangeShot(G, 2);
  assert.equal(G.fireTaze(G.gnow()), true); assert.ok(G.slider.juke, 'round 2, first shot: juked');
  const H = academy(); toDrill(H, 'taser'); rangeShot(H, 1);
  assert.equal(H.fireTaze(H.gnow()), true); assert.equal(H.slider.juke, null, 'round 1: calm, never jukes');
});
test('F taser: later range shots are not dodgeable by pattern — each shot index jukes at some times, not at others', () => {
  for (let shot = 2; shot <= 6; shot++) {
    let jk = 0; const N = 40;
    for (let i = 0; i < N; i++) {
      const G = academy(); toDrill(G, 'taser'); rangeShot(G, 3); G.acad.shot = shot;
      G.step(i * 0.037); Object.assign(G.slider, { x: -28 + (i % 7) * 0.13, dir: 1 }); G.step(1 / 60);
      Object.assign(G.cop, { x: G.slider.x, z: G.FIRE_Z, a: Math.PI, speed: 0 });
      assert.equal(G.fireTaze(G.gnow()), true, `shot ${shot} try ${i}`); if (G.slider.juke) jk++;
    }
    assert.ok(jk > 0 && jk < N, `shot ${shot}: ${jk}/${N} jukes (p 0.5) — never all, never none`);
  }
  const G = academy(); toDrill(G, 'taser'); G.acad.shot = 4;
  assert.equal(G.rangeRoll(1234), G.rangeRoll(1234), 'deterministic for the same shot, rail spot and time');
});
test('F taser (touch): the always-jogging cop holds still on the firing line, can turn to aim, and GO moves him off', () => {
  const G = academy(); G.inputKind = 'touch'; toDrill(G, 'taser'); G.inputKind = 'touch';
  Object.assign(G.cop, { x: -28, z: G.FIRE_Z + 3.5, a: Math.PI, speed: 3 });   // jogging north onto the line
  G.step(3); assert.equal(G.onFiringLine(), true, 'jogged onto the line and stopped there');
  assert.ok(G.cop.speed < 0.05, 'no GO on the line: standing still (' + G.cop.speed + ')');
  assert.doesNotMatch(G.hintFor(), /^AIM FROM THE LINE/);
  let fired = 0;                                                // turn to face the slider as it slides: fire when TAZE shows
  for (let i = 0; i < 60 * 12 && G.acad.hits < 2; i++) {
    G.cop.a = Math.atan2(G.slider.x - G.cop.x, G.slider.z - G.cop.z);   // (stand-in for tilt / drag steering)
    if (G.tazeOK()) { G.fireTaze(G.gnow(), 1); fired++; }
    G.step(1 / 60); assert.equal(G.onFiringLine() || G.DRILLS[G.acad.step].id !== 'taser', true, 'never drifted off the line');
  }
  assert.ok(fired >= 2 && G.acad.hits >= 2, `a touch cadet fires from the line (${fired} shots, ${G.acad.hits} hits)`);
  const K = academy(); toDrill(K, 'taser'); K.inputKind = 'touch';
  Object.assign(K.cop, { x: -28, z: K.FIRE_Z, a: 0, speed: 0 });
  K.setKeys({ gas: true }); K.step(1.2);
  assert.equal(K.onFiringLine(), false, 'GO sprints him off the line');
  const P = loadGame(); P.started = true; P.mode = 'foot'; P.inputKind = 'touch';
  Object.assign(P.cop, { x: -28, z: 12.5, a: 0, speed: 0, freezeUntil: 0 }); P.step(1);
  assert.ok(P.cop.speed > 2.5, 'patrol: the same spot, no hold — still the always-jog');
});
test('F taser: charges never block a shot (refill, pips ∞); 2 hits advance to return', () => {
  const G = academy(); toDrill(G, 'taser'); G.step(1 / 60);
  assert.equal(G.dom('pips').textContent, '∞');
  for (let i = 0; i < 5; i++) {                              // five misses in a row: aim at nothing but the slider
    G.acad.shot = 0; G.step(1 / 60);
    Object.assign(G.slider, { x: -28, dir: 1 }); G.step(1 / 60);
    Object.assign(G.cop, { x: G.slider.x, z: G.FIRE_Z, a: Math.PI, speed: 0 });
    assert.equal(G.fireTaze(G.gnow(), 1), true, 'shot ' + i);
    G.slider.x = -33; G.step(0.8);                          // yank it off the lead: a miss
    assert.equal(G.taze.charges, 3);
  }
  assert.equal(G.acad.hits, 0);
  taserBot(G);
  assert.equal(drill(G), 'return'); assert.equal(G.acad.hits, 2);
  assert.ok(G.acad.times.taser > 0);
  assert.equal(G.dom('msg').textContent, '📣 Back to the cruiser! 🚓');
  assert.equal(G.academyTarget().lab, 'Car');
});
test('F taser: the patrol taser is untouched — a charge still counts down, the crook still the target', () => {
  const G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'keys';
  Object.assign(G.crook, { state: 'flee', x: 0, z: -84, a: 0, speed: 0 });
  Object.assign(G.cop, { x: 0, z: -90, a: 0 });
  assert.equal(G.fireTaze(G.gnow(), 0.99), true); assert.equal(G.taze.charges, 2);
  G.updateActBtn(); assert.equal(G.dom('pips').textContent, '⚡⚡○');
});

/* ---------------------------------------------------------------- return + full course */
test('F return: ENTER at the cruiser completes it → graduate; tracker Target → Car', () => {
  const G = academy(); toDrill(G, 'return'); G.step(1 / 60);
  assert.equal(G.hintFor(), 'WALK TO THE CAR'); assert.equal(G.affordance(), null);
  returnBot(G);
  assert.equal(drill(G), 'graduate'); assert.equal(G.mode, 'drive');
  const H = academy(); toDrill(H, 'lineup'); H.step(1 / 60);
  assert.equal(H.academyTarget().lab, 'Target');
});
test('F single drill ?drill=lineup / ?drill=taser: on foot at the west gate, car in the bay, trial card, best kept', () => {
  for (const id of ['lineup', 'taser']) {
    const G = loadGame(); G.started = true; G.selectBadge('9191');
    G.ctx.location.search = '?drill=' + id; G.applyUrlMode(); G.beginGame();
    assert.equal(drill(G), id); assert.equal(G.mode, 'foot');
    assert.deepEqual([G.cop.x, G.cop.z], [-52, 0]); assert.deepEqual([G.car.x, G.car.z], [-65, 0]);
    if (id === 'lineup') lineupBot(G); else taserBot(G);
    assert.equal(drill(G), 'graduate');
    assert.equal(G.dom('cardH').textContent, 'TIME TRIAL 🏁');
    assert.ok(G.career.academy.best[id] > 0, id); assert.equal(G.career.academy.grad, false);
  }
});
test('F full course: scripted teleport run through all 6 drills → grad, best lineup + taser; no Math.random; patrol after', () => {
  const G = loadGame({ seed: 1 }); G.started = true; G.inputKind = 'keys'; G.selectBadge('4242');
  G.evalInGame('globalThis.__mr=0; { const r=Math.random; Math.random=function(){ globalThis.__mr++; return r(); }; }');
  G.startAcademy();
  G.acad.step = 1; G.DRILLS[1].setup(G.gnow()); G.acad.gi = G.GATES.length; G.acad.lapT0 = Math.max(1, G.gnow());
  Object.assign(G.car, { x: -65, z: 0, a: -Math.PI / 2, speed: 0 }); G.step(0.6);
  assert.equal(drill(G), 'exit'); G.doAction(); G.step(1 / 60);
  assert.equal(drill(G), 'lineup'); lineupBot(G);
  assert.equal(drill(G), 'taser'); taserBot(G);
  assert.equal(drill(G), 'return'); returnBot(G);
  assert.equal(drill(G), 'graduate');
  assert.equal(G.evalInGame('globalThis.__mr'), 0, 'Math.random was drawn during the academy');
  assert.equal(G.career.academy.grad, true);
  assert.ok(G.career.academy.best.lineup > 0 && G.career.academy.best.taser > 0);
  assert.match(G.dom('cardL').textContent, /Line-up \d+\.\ds · Taser \d+\.\ds$/);
  assert.equal(G.events.count('graduate'), 1);
  assert.deepEqual(G.events.filter(e => e.type === 'drillDone').map(e => e.data.id), ['gates', 'exit', 'lineup', 'taser', 'return']);
  G.startPatrol(); assert.equal(G.phase, 'patrol'); assert.equal(G.tazeTarget(), G.crook);
  assert.ok(!G.acadProps.g.visible);
});
test('F seed invariance: a full foot course leaves the seeded stream where respawnCrook() alone would', () => {
  const G1 = loadGame({ seed: 2 }), G2 = loadGame({ seed: 2 });
  G1.started = true; G1.startAcademy(); toDrill(G1, 'lineup'); lineupBot(G1); taserBot(G1); G1.exitAcademy();
  Object.assign(G1.car, { x: -100, z: -88, a: Math.PI / 2 }); G1.mode = 'drive';
  assert.equal(G1.evalInGame('Math.random()'), G2.evalInGame('Math.random()'), 'the seeded stream moved');
  G1.respawnCrook(); G2.respawnCrook();
  assert.deepEqual([G1.crook.x, G1.crook.z], [G2.crook.x, G2.crook.z]);
});
test('F kid text: foot lines ≤ 8 words + 1 emoji; hints ≤ 22 chars; OOPS lines as spec', () => {
  const G = loadGame();
  const emoji = s => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
  for (const d of G.DRILLS.filter(d => ['lineup', 'taser', 'return'].includes(d.id))) {
    assert.ok(d.line.replace(/\p{Extended_Pictographic}/gu, '').trim().split(/\s+/).length <= 8, d.line); assert.equal(emoji(d.line), 1, d.line);
  }
  for (const h of ['CUFF ROBBERS 3/3', 'AIM FROM THE LINE 2/2', 'TURN TO FACE HIM 2/2', 'ZAP HIM! 2/2', 'WALK TO THE CAR', 'TAP ENTER!']) assert.ok(h.length <= 22);
  for (const l of ["📣 OOPS! That\\'s Grandma! 👵", "📣 OOPS! That\\'s the mail carrier! 📬", "📣 OOPS! That\\'s the hot-dog guy! 🌭"])
    assert.ok(GAME.includes(l.replace(/\\'/g, "'")), l);
  assert.ok(GAME.includes("'📣 BZZT! Nice shot! ⚡'") && GAME.includes("'📣 He heard you! Zap again from the line'"));
  assert.ok(!GAME.includes('Get closer'), 'the range never says get closer (Playtest #3: it fought AIM FROM THE LINE)');
  assert.ok(GAME.includes(`say("⚡ ZAP! He's down — cuff him!"`) || GAME.includes(`"⚡ ZAP! He's down — cuff him!"`));
});
test('F props: boards lazy, one material per kind, .kind on each mesh; the board follows its record', () => {
  const G = academy(); toDrill(G, 'lineup'); G.step(1 / 60);
  const P = G.acadProps;
  assert.deepEqual(Object.keys(P.cutMat).sort(), ['grandma', 'hotdog', 'mail', 'robber']);
  assert.equal(P.cuts.length, 2);
  /* run one visual pass (tick() is never called by the harness) */
  G.evalInGame('academyVisuals(performance.now())');
  G.cutouts.forEach((c, i) => { assert.equal(P.cuts[i].kind, c.kind); if (c.kind !== 'robber') assert.equal(P.cuts[i].material, P.cutMat[c.kind]); assert.ok(P.cuts[i].visible); });
});
