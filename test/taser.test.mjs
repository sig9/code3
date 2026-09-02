/*  test/taser.test.mjs — S3 taser + siren against the real game logic.
    Run:  node --test test/*.test.mjs
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
/* cop on foot at (-30,23) facing +z (the building face is z=22); the crook crosses left→right 6 m in front of him on the z=28 street
   (a=+π/2 is +x), running east to the (112,28) subway with a far look-back so only corners re-plan him */
function crossing(G, { d = 6, speed = 7, tired = false } = {}) {
  G.started = true; G.mode = 'foot';
  Object.assign(G.cop, { x: -30, z: 23, a: 0, speed: 0, mv: 0, freezeUntil: 0 });
  const path = [nodeIndex(G, 0, 28), nodeIndex(G, 56, 28), nodeIndex(G, 112, 28)];
  Object.assign(G.crook, { x: -30, z: 23 + d, a: Math.PI / 2, speed, state: 'flee', stam: tired ? 0 : 6, tired,
    alerted: true, path, pi: 0, target: path[2], glanceT: G.now() + 20000, legT: G.now(), alertUntil: 0, dbUntil: 0 });
  G.step(1 / 60);                                          // one tick so the HUD/buttons reflect the pose
}

test('S3 cone gate: 6 m ahead ok; 20° off, 2.4 m (CUFF territory), 8.5 m, drive, no charges, mid-click → no', () => {
  const G = loadGame();
  const rows = [
    ['6 m dead ahead', () => crossing(G, { d: 6 }), true],
    ['6 m at 20°', () => { crossing(G, { d: 6 }); G.cop.a = 20 * Math.PI / 180; }, false],
    ['2.4 m', () => crossing(G, { d: 2.4 }), false],
    ['8.5 m', () => crossing(G, { d: 8.5 }), false],
    ['drive mode', () => { crossing(G, { d: 6 }); G.mode = 'drive'; }, false],
    ['0 charges', () => { crossing(G, { d: 6 }); G.taze.charges = 0; }, false],
    ["phase 'click'", () => { crossing(G, { d: 6 }); G.taze.phase = 'click'; }, false],
  ];
  for (const [name, setup, want] of rows) {
    G.taze.charges = 3; G.taze.phase = 'idle';
    setup();
    G.taze.okT = -1e9;                                     // each row is judged cold (crossing() ticks once, which would arm the hysteresis hold)
    assert.equal(G.tazeOK(), want, `tazeOK() with ${name}`);
  }
  G.taze.charges = 3; G.taze.phase = 'idle';
  crossing(G, { d: 6 }); G.cop.a = 15 * Math.PI / 180;
  assert.equal(G.tazeOK(), true, '15° is still inside the ±17.5° show cone');
});

test('S3 hit: lead on a crossing crook at 7 m/s — tased at +0.35 s, stopped by +0.5 s, cuffable, back to flee (stam ≤2, not tired) after 3 s', () => {
  const G = loadGame();
  crossing(G);
  const t0 = G.now();
  assert.equal(G.fireTaze(t0, 1), true, 'fires');                 // roll 1 ≥ p: no juke
  assert.equal(G.taze.charges, 2); assert.equal(G.taze.phase, 'click');
  const lead = Math.hypot(G.taze.ax - G.crook.x, G.taze.az - G.crook.z);
  assert.ok(Math.abs(lead - 2.45) < 1e-9, `aim leads him 2.45 m along his heading (${lead.toFixed(3)})`);
  assert.ok(Math.abs(Math.atan2(G.taze.ax - G.crook.x, G.taze.az - G.crook.z) - G.crook.a) < 1e-9, 'lead is along his heading');
  G.step(0.30);
  assert.equal(G.crook.state, 'flee', 'still in flight at +0.30 s');
  let tasedAt = null;
  for (let k = 0; k < 6; k++) { G.step(1 / 60); if (G.crook.state === 'tased') { tasedAt = G.now(); break; } }
  assert.ok(tasedAt !== null && tasedAt - t0 <= 400, `tased by +0.35 s (state ${G.crook.state} at +${(G.now() - t0) | 0} ms)`);
  assert.equal(G.dom('msg').textContent, "⚡ ZAP! He's down — cuff him!");
  assert.equal(G.dom('cstate').textContent, 'tased ⚡');
  assert.equal(G.taze.phase, 'flash');
  G.step(0.15);
  assert.ok(G.crook.speed < 0.5, `speed ${G.crook.speed.toFixed(2)} < 0.5 by +0.5 s`);
  assert.equal(G.crook.state, 'tased');
  Object.assign(G.cop, { x: G.crook.x, z: G.crook.z - 2 });          // walk up to 2 m
  assert.equal(G.affordance(), 'cuff', 'a tased crook is cuffable');
  assert.equal(G.tazeOK(), false, 'no second green button: TAZE is off while CUFF is on');
  G.crook.stam = 5;
  G.step(3.1 - (G.now() - tasedAt) / 1000);                         // 3 s after the hit
  assert.equal(G.crook.state, 'flee', 'back on his feet');
  assert.ok(G.crook.stam <= 2, `stamina capped at 2 (${G.crook.stam.toFixed(2)})`);
  assert.equal(G.crook.tired, false);
  assert.equal(G.taze.phase, 'idle');
});

test('S3 miss: the click makes him juke — spooked (×1.4) for 2 s, one charge spent, 0.75 s refire lockout', () => {
  const G = loadGame();
  crossing(G);
  const t0 = G.now();
  assert.equal(G.fireTaze(t0, 0), true);                         // roll 0 < 0.70: juke
  assert.ok(G.crook.juke && G.crook.juke.until === t0 + 350, 'juke set for 350 ms');
  assert.ok(Math.abs(Math.hypot(G.crook.juke.dx, G.crook.juke.dz) - 1) < 1e-9, 'unit lateral');
  assert.ok(Math.abs(G.crook.juke.dz) < 0.05, 'lateral to the cop\'s line of sight (+z) → along x');
  assert.equal(G.taze.charges, 2);
  let maxSpd = 0;
  for (let k = 0; k < 60; k++) {                                   // +1 s, the cop keeping pace 6 m off his flank
    G.step(1 / 60);
    Object.assign(G.cop, { x: G.crook.x, z: G.crook.z - 6, a: 0 });   // so only the phase gates tazeOK()
    assert.equal(G.tazeOK(), G.now() - t0 >= 750, `refire lockout at +${(G.now() - t0) | 0} ms`);
    maxSpd = Math.max(maxSpd, G.crook.speed);
  }
  assert.equal(G.crook.state, 'flee', 'a miss leaves him fleeing');
  const missAt = G.crook.burstUntil - 2000;                        // resolved on the first step at/after t0+350
  assert.ok(missAt - (t0 + 350) >= -1e-6 && missAt - (t0 + 350) < 1000 / 60 + 1e-6, `burst = miss + 2 s (miss at +${(missAt - t0).toFixed(1)} ms)`);
  assert.match(G.dom('msg').textContent, /Missed — he juked/);
  G.step(0.35);
  assert.ok(G.crook.speed > 8, `spooked: speed ${G.crook.speed.toFixed(2)} > 8 within 1 s of the miss`);
  assert.equal(G.dom('cstate').textContent, 'spooked!');
  Object.assign(G.cop, { x: G.crook.x, z: G.crook.z - 6, a: 0 });
  assert.equal(G.taze.phase, 'idle'); assert.equal(G.tazeOK(), true, 'TAZE is back after the 0.75 s lockout');
  G.step(3.5 - (G.now() - t0) / 1000 + 0.35);                     // 3.5 s after the miss
  assert.ok(G.crook.speed < 7.5, `back under 7.5 by 3.5 s (${G.crook.speed.toFixed(2)})`);
  assert.equal(G.dom('cstate').textContent, 'fleeing!');
});
test('S3 no-juke miss line: a crook that stands his ground and is still missed is "spooked and faster"', () => {
  const G = loadGame();
  crossing(G, { d: 7.5 });
  G.fireTaze(G.now(), 1);                                          // no juke
  G.cop.a = 0.45;                                                  // the cop swings 26° during the flight: outside ±30°? no — inside; move the aim instead
  G.taze.ax += 3;                                                  // a botched lead
  G.step(0.4);
  assert.equal(G.crook.state, 'flee'); assert.equal(G.crook.juke, null);
  assert.equal(G.dom('msg').textContent, "⚡ Missed — he's spooked and faster");
  assert.ok(G.crook.burstUntil > G.now());
});

test('S3 empty: a last-charge MISS reports the taser empty after its flash; a last-charge HIT keeps the ZAP line and says it when he gets up', () => {
  let G = loadGame();
  crossing(G);
  G.taze.charges = 1;
  G.fireTaze(G.now(), 1); G.taze.ax += 3;                        // botched lead → miss
  G.step(0.8);
  assert.equal(G.taze.charges, 0);
  assert.equal(G.dom('msg').textContent, "Taser's empty — run him down");
  assert.equal(G.tazeOK(), false);
  assert.equal(G.dom('pips').textContent, '○○○');

  G = loadGame();
  crossing(G);
  G.taze.charges = 1;
  G.fireTaze(G.now(), 1);                                          // clean hit
  G.step(0.8);
  assert.equal(G.crook.state, 'tased');
  assert.equal(G.taze.charges, 0); assert.equal(G.taze.phase, 'idle');
  assert.equal(G.dom('msg').textContent, "⚡ ZAP! He's down — cuff him!", 'the empty line must not replace ZAP while he is down');
  G.step(2.7);                                                     // tased expiry at +3.0 s after the +0.35 s hit
  assert.equal(G.crook.state, 'flee');
  assert.match(G.dom('msg').textContent, /taser's empty/i);
});

test('S3 resolve on a crook already cuffed or escaped is silent: no Missed line, no burst', () => {
  for (const end of ['cuffed', 'escaped']) {
    const G = loadGame();
    crossing(G, { d: 6 });
    G.fireTaze(G.now(), 1);
    G.step(0.1);
    G.crook.state = end; G.crook.cuffT = G.now(); G.crook.burstUntil = 0;
    G.dom('msg').textContent = 'END';
    G.step(0.4);                                                   // flight resolves at +0.35 s
    assert.equal(G.crook.state, end);
    assert.equal(G.taze.phase, 'flash'); assert.equal(G.taze.hit, false);
    assert.equal(G.dom('msg').textContent, 'END', `${end}: the toast is not overwritten`);
    assert.equal(G.crook.burstUntil, 0, `${end}: no spook burst`);
  }
});

test('S3 show cone requires a landable shot: 7.8 m straight away at 7 m/s → ok and a standing cop hits; spooked at 9.8 m/s from 7.5 m → no', () => {
  const G = loadGame();
  const away = (d, speed, burst) => {                              // cop standing on the z=28 street facing +x, crook d ahead running east
    G.started = true; G.mode = 'foot';
    Object.assign(G.cop, { x: 20, z: 28, a: Math.PI / 2, speed: 0, mv: 0, freezeUntil: 0 });
    const path = [nodeIndex(G, 56, 28), nodeIndex(G, 112, 28)];
    Object.assign(G.crook, { x: 20 + d, z: 28, a: Math.PI / 2, speed, state: 'flee', stam: 6, tired: false, alerted: true,
      path, pi: 0, target: path[1], glanceT: G.now() + 20000, legT: G.now(), alertUntil: 0, dbUntil: 0, juke: null,
      burstUntil: burst ? G.now() + 2000 : 0 });
    G.taze.charges = 3; G.taze.phase = 'idle';
    G.step(1 / 60);
  };
  away(7.8, 7, false);
  assert.equal(G.tazeOK(), true);
  assert.ok(G.fireTaze(G.now(), 1));
  G.step(0.4);
  assert.equal(G.crook.state, 'tased', 'green TAZE at 7.8 m on a receding crook lands for a standing cop');
  away(7.5, 9.8, true);
  assert.equal(G.tazeOK(), false, 'spooked and receding from 7.5 m: not landable, so no green button');
  away(6.5, 9.8, true);
  assert.equal(G.tazeOK(), true);
  away(7.8, 7, false); G.crook.a = -Math.PI / 2;                    // running at the cop: always landable
  assert.equal(G.tazeOK(), true);
});

test('S3 siren cannot be armed on the title screen', () => {
  const G = loadGame();
  G.started = false; G.mode = 'drive';
  assert.equal(G.toggleSiren(), false);
  assert.equal(G.siren.on, false);
  G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, false);
  G.started = true;
  assert.equal(G.toggleSiren(), true);
  assert.equal(G.siren.on, true);
});

test('S3 HUD: line 2 carries speed · pips · state with no label, the hidden tool button is not tappable, the toast has no fixed 64 px top', () => {
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  // S4 moved the crook state to its own line 3 and put ★stars · rank after the pips; the pips still follow the speed unlabeled
  assert.match(html, /<span id="l2"><span class="nw"><span id="spd">0<\/span> mph · <span id="pips">⚡⚡⚡<\/span> ·<\/span> <span class="nw">★<span id="cstars">0<\/span> <span id="rank">CADET<\/span><\/span><br>\s*crook: <span id="cstate">unaware<\/span><\/span>/);
  assert.match(html, /<span id="c3">🚨<\/span>🚔 <b id="busts">/, '🚨 leads line 1 so it is never a clipped tail');
  assert.match(html, /#score\{[^}]*white-space:nowrap/);
  assert.match(html, /#l2\{[^}]*white-space:normal/, 'the crook state may wrap instead of being hidden');
  assert.match(html, /@media \(max-width:400px\)\{[^}]*#tlab\{display:none;\}/, 'the tracker label goes under 400 px');
  assert.match(html, /\.hide\{[^}]*pointer-events:none/);
  assert.ok(!/#msg\{position:fixed;top:calc\(64px/.test(html));
  assert.ok(html.includes('function placeMsg('));
});

test('S3 juke odds (10k seeded fires each): fresh 0.70, tired 0.25, inside 4 m halves; a crook on the west wall always jukes east', () => {
  const G = loadGame({ seed: 7 });
  const odds = (setup) => {
    let n = 0;
    for (let i = 0; i < 10000; i++) {
      G.taze.charges = 3; G.taze.phase = 'idle'; G.crook.juke = null;
      setup();
      assert.equal(G.fireTaze(G.now()), true);
      if (G.crook.juke) n++;
    }
    return n / 10000;
  };
  const fresh = odds(() => crossing(G));
  assert.ok(Math.abs(fresh - 0.70) < 0.03, `fresh ${fresh}`);
  const tired = odds(() => crossing(G, { tired: true }));
  assert.ok(Math.abs(tired - 0.25) < 0.03, `tired ${tired}`);
  const close = odds(() => crossing(G, { d: 3 }));
  assert.ok(Math.abs(close - 0.35) < 0.03, `<4 m ${close}`);
  const calm = odds(() => { crossing(G); G.crook.state = 'calm'; });
  assert.equal(calm, 0, 'a calm crook never jukes');
  /* against the west perimeter wall (x = -117.55): west is blocked, so the juke goes east every time */
  for (let i = 0; i < 200; i++) {
    G.taze.charges = 3; G.taze.phase = 'idle'; G.crook.juke = null;
    crossing(G);
    Object.assign(G.crook, { x: -117.55, z: 28, a: 0 });
    Object.assign(G.cop, { x: -117.55, z: 23, a: 0 });
    assert.equal(G.fireTaze(G.now(), 0), true);
    assert.ok(G.crook.juke, 'juked');
    assert.ok(G.crook.juke.dx > 0.99, `east (dx=${G.crook.juke.dx.toFixed(2)})`);
  }
});

test('S3 siren: a block of earshot, faster car, quiet again on dismount, foot toggle is a no-op', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';                             // parked at (-100,-88): earshot 16 m
  Object.assign(G.crook, { x: -40, z: -88, a: 0, speed: 0, state: 'calm' });
  G.step(200 / 60);
  assert.equal(G.crook.state, 'calm', 'calm at 60 m from a parked car');
  assert.equal(G.hearingRadius(), 16);
  assert.equal(G.toggleSiren(), true);
  assert.equal(G.siren.on, true);
  assert.equal(G.dom('msg').textContent, '🚨 Sirens! Everyone within a block heard you');
  assert.equal(G.hearingRadius(), 70, '70 m in the car with the siren');
  G.step(1 / 60);
  assert.equal(G.crook.state, 'flee', 'flees on the next tick');
  assert.equal(G.dom('msg').textContent, '❗ He heard the siren — bolting for a subway!');
  assert.match(G.dom('msg').textContent, /siren/);
  assert.equal(G.dom('c3').classList.contains('on'), true, '🚨 pulses in the score chip');
  G.mode = 'foot';
  assert.equal(G.hearingRadius(), 12, '12 m on foot even with the siren on');
  G.mode = 'drive';
  G.setKeys({ gas: true });
  let max = 0;
  for (let k = 0; k < 360; k++) { G.step(1 / 60); max = Math.max(max, G.car.speed); if (k === 179) assert.ok(G.car.speed >= 41, `≥41 m/s by 3 s (${G.car.speed.toFixed(1)})`); }
  assert.ok(max >= 41 && max <= 42, `clamp 42 (max ${max.toFixed(1)})`);
  G.setKeys({ gas: false });
  G.car.speed = 0;
  assert.equal(G.affordance(), 'exit');
  G.doAction();
  assert.equal(G.mode, 'foot');
  assert.equal(G.siren.on, false, 'EXIT clears the siren');
  assert.equal(G.toggleSiren(), false, 'no siren on foot');
  assert.equal(G.siren.on, false);
  G.step(1 / 60);
  assert.equal(G.dom('c3').classList.contains('on'), false);
  /* without the siren the same car tops at 34 */
  const H = loadGame(); H.started = true; H.mode = 'drive'; H.setKeys({ gas: true }); H.step(3);
  assert.ok(H.car.speed <= 34 && H.car.speed > 33, `34 clamp without the siren (${H.car.speed.toFixed(1)})`);
});

test('S3 keys: T fires only on foot with him in the cone; L only in the car', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive';
  G.fire('keydown', { code: 'KeyT' });
  assert.equal(G.taze.charges, 3, 'T in the car spends nothing');
  G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, true, 'L toggles the siren in the car');
  G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, false);
  crossing(G);                                                     // foot, crook 6 m dead ahead
  G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, false, 'L on foot leaves the siren off');
  G.fire('keydown', { code: 'KeyT' });
  assert.equal(G.taze.charges, 2, 'T on foot with him in the cone spends one charge');
  assert.equal(G.taze.phase, 'click');
  G.fire('keydown', { code: 'KeyT' });
  assert.equal(G.taze.charges, 2, 'no double fire mid-click');
});

test('S3 budget: TAZE and SIREN are never both visible; #bAct still morphs', () => {
  const G = loadGame();
  const vis = id => !G.dom(id).classList.contains('hide');
  const check = (label) => {
    G.updateActBtn();
    assert.ok(!(vis('bTaze') && vis('bSiren')), `both tool buttons visible: ${label}`);
    assert.equal(vis('bSiren'), G.mode === 'drive' && G.started, `SIREN iff driving: ${label}`);
    assert.equal(vis('bTaze'), G.tazeOK(), `TAZE iff tazeOK: ${label}`);
  };
  check('before start');
  G.started = true; G.mode = 'drive'; check('drive'); assert.equal(G.dom('bAct').textContent, 'EXIT');
  G.car.speed = 20; check('drive fast'); assert.equal(G.dom('bAct').textContent, 'EXIT'); assert.ok(G.dom('bAct').classList.contains('off'));
  G.car.speed = 0;
  crossing(G); check('foot, crook in cone'); assert.equal(vis('bTaze'), true);
  assert.equal(G.dom('bAct').textContent, '—');
  G.fireTaze(G.now(), 1); check('foot, mid-click');
  G.step(0.4); check('foot, tased'); assert.equal(G.crook.state, 'tased');
  Object.assign(G.cop, { x: G.crook.x, z: G.crook.z - 2 }); check('foot, cuff range');
  assert.equal(G.dom('bAct').textContent, 'CUFF'); assert.equal(vis('bTaze'), false);
  G.doAction(); check('cuffed'); assert.equal(G.crook.state, 'cuffed');
  G.step(2.6); check('after the cuff beat');                       // freeze over, crook respawned
  Object.assign(G.cop, { x: G.car.x + 2, z: G.car.z }); check('foot, at the car');
  assert.equal(G.dom('bAct').textContent, 'ENTER');
  G.doAction(); check('back in the car'); assert.equal(G.mode, 'drive');
  G.toggleSiren(); check('siren on'); assert.ok(G.dom('bSiren').classList.contains('on'));
  G.doAction(); check('exit with the siren on'); assert.equal(G.siren.on, false);
});

test('S3 files: index.html is one file; SPEC.md maps the siren to L', () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.equal((html.match(/<script id="game">/g) || []).length, 1);
  assert.ok(!/<script src="(?!https:\/\/cdnjs)/.test(html), 'no local script files');
  assert.ok(html.includes('id="bTaze"') && html.includes('id="bSiren"') && html.includes('id="pips"') && html.includes('id="c3"'));
  const spec = fs.readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8');
  assert.match(spec, /\*\*L\*\* — siren/);
  assert.doesNotMatch(spec, /\*\*S\*\* — siren/);
});

test('S3 fix: TAZE has hysteresis — a heading wandering ±14° around him never drops the button; 20° from cold is still no', () => {
  const G = loadGame();
  crossing(G, { d: 6 });
  G.taze.okT = -1e9; G.cop.a = 20 * Math.PI / 180;
  assert.equal(G.tazeOK(), false, 'cold: 20° is outside the ±17.5° show cone');
  G.cop.a = 0; assert.equal(G.tazeOK(), true);
  G.cop.a = 20 * Math.PI / 180; assert.equal(G.tazeOK(), true, 'warm: 20° keeps it (hold to ±25°)');
  G.cop.a = 27 * Math.PI / 180; assert.equal(G.tazeOK(), false, 'past 25° it drops (the ±30° resolve cone stays honest)');
  G.cop.a = 20 * Math.PI / 180; assert.equal(G.tazeOK(), true, 'within 250 ms of the last ok the wide cone still applies');
  G.step(0.3); Object.assign(G.crook, { x: -30, z: 29 }); G.taze.okT = G.now() - 300; G.cop.a = 20 * Math.PI / 180;
  assert.equal(G.tazeOK(), false, '250 ms after the last ok the cone is back to ±17.5°');
  // the QA repro: crook 6 m ahead running along +x, cop jogging behind, heading wandering ±14°
  G.started = true; G.mode = 'foot'; G.inputKind = 'touch';
  Object.assign(G.cop, { x: -40, z: 28, a: Math.PI / 2, speed: 3, mv: 3, freezeUntil: 0 });
  Object.assign(G.crook, { x: -34, z: 28, a: Math.PI / 2, speed: 7, state: 'flee', stam: 6, tired: false, alerted: true,
    path: [nodeIndex(G, 0, 28), nodeIndex(G, 56, 28), nodeIndex(G, 112, 28)], pi: 0, target: nodeIndex(G, 112, 28), glanceT: G.now() + 20000, legT: G.now() });
  G.taze.okT = -1e9;
  let toggles = 0, prev = null, frame = 0;
  for (let k = 0; k < 90; k++) {                        // 1.5 s at 60 Hz, holding position relative to him (jog vs sprint gap aside)
    G.cop.a = Math.PI / 2 + 0.25 * Math.sin(frame++ / 10);
    G.crook.x = G.cop.x + 6; G.crook.z = G.cop.z; G.crook.a = Math.PI / 2; G.crook.speed = 7;
    const ok = G.tazeOK(); if (prev !== null && ok !== prev) toggles++; prev = ok;
    G.step(1 / 60);
  }
  assert.equal(prev, true, 'button up at the end');
  assert.equal(toggles, 0, 'no flicker while the cop\'s heading wanders ±14°');
});

test('S3 fix: siren off at 42 m/s bleeds down through the drag instead of a one-tick dump to 34', () => {
  const G = loadGame();
  G.started = true; G.mode = 'drive'; G.car.speed = 0;
  assert.equal(G.toggleSiren(), true);
  Object.assign(G.car, { x: -112, z: -84, a: Math.PI / 2 });
  G.setKeys({ gas: true }); G.step(6);
  assert.ok(G.car.speed >= 41, 'siren top speed ' + G.car.speed.toFixed(1));
  Object.assign(G.car, { x: -112, z: -84, a: Math.PI / 2 });   // back to the west end: open road for the decay, no wall
  const v0 = G.car.speed;
  G.toggleSiren(); G.step(1 / 60);
  assert.ok(v0 - G.car.speed < 1.0, 'one tick after siren off the loss is under 1 m/s (' + (v0 - G.car.speed).toFixed(2) + ')');
  let above = 0; while (G.car.speed > 34.01 && above < 600) { G.step(1 / 60); above++; }
  assert.ok(above >= 12 && above <= 60, 'settles to 34 over 0.2–1 s (' + above + ' ticks)');
  G.step(1); assert.ok(Math.abs(G.car.speed - 34) < 0.05, 'and holds the 34 cap under gas');
});

test('S3 fix: vibrate() is never called on a keyboard press before a real gesture (Chrome console error)', () => {
  const G = loadGame();
  let calls = 0; G.ctx.navigator.vibrate = () => { calls++; return true; };
  G.started = true; G.mode = 'drive'; G.inputKind = 'keys';
  G.fire('keydown', { code: 'KeyL' }); G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, false); assert.equal(calls, 0, 'no vibrate without a gesture');
  G.inputKind = 'touch'; G.toggleSiren();
  assert.equal(calls, 1, 'vibrates after touch input');
  G.ctx.navigator.vibrate = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => G.toggleSiren(), 'a throwing vibrate() is swallowed');
});

test('S3 fix: Respawn crook during a taser flight voids the bolt — the new calm crook is neither spooked nor tased', () => {
  const G = loadGame();
  crossing(G);
  assert.equal(G.fireTaze(G.now(), 1), true);
  G.step(0.1);
  G.respawnCrook(); G.dom('msg').textContent = '';
  assert.equal(G.taze.phase, 'idle'); assert.equal(G.taze.charges, 3);
  G.step(0.5);
  assert.equal(G.crook.state, 'calm');
  assert.equal(G.crook.burstUntil, 0, 'not spooked');
  assert.ok(!/Missed|ZAP/.test(G.dom('msg').textContent), 'no taser toast: ' + G.dom('msg').textContent);
});
