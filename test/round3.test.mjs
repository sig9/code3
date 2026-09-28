/*  test/round3.test.mjs — v0.4 review round 3, batch "touch-input".
    Run:  node --test test/*.test.mjs
      T1  touch steering is taught: slalom + patrol pill say SLIDE LEFT THUMB TO STEER for no-tilt touch players
      T2  lifting the GO pointer keeps the steering thumb's input (steering pointer tracked by id)
      T3  the exit line says the right verb (tilt / thumb / arrows); the v0.3 tilt line stays for tilt
      T4  GO ON PATROL: armed after CARD_ARM ms, fires on the lift of a press that began on the button
      T5  the empty-taser toast never overwrites CUFFED
      T6  siren in the academy: drill lines, never the patrol line; a no-op behind the graduation card
    Batch "ios-pwa-audio":
      P1  short landscape: the countdown (#cd) never shares a grid cell with the A2HS pill (#a2hs)
      P2  hidden tab zeroes the siren/engine gains at once; visible-while-paused keeps them at 0
      P3  SW registers only on https *.github.io or ?sw=1; ?sw=0 unregisters + deletes code3-* caches
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadGame, INDEX_HTML, extractGameScript } from './harness.mjs';

const GAME = extractGameScript(fs.readFileSync(INDEX_HTML, 'utf8'));
const words = s => s.replace(/[^\p{L}\p{N}' ]+/gu, ' ').trim().split(/\s+/).filter(Boolean).length;

/* ---------------------------------------------------------------- T1 */
test('T1 slalom hint: thumb for no-tilt touch, keys wording for keys, tilt wording for tilt', () => {
  const G = loadGame(); G.started = true; G.startAcademy(); G.step(1 / 60);
  G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  assert.equal(G.hintFor(), 'SLIDE LEFT THUMB TO STEER');
  assert.ok(words(G.THUMB_HINT) <= 8);
  G.inputKind = 'keys'; assert.equal(G.hintFor(), 'STEER AROUND THE CONES');
  G.inputKind = 'touch'; G.evalInGame('tilt.fallback=false'); assert.equal(G.hintFor(), 'TILT TO WEAVE');
});
test('T1 patrol pill: a no-tilt touch start shows the thumb hint until the first left-half touch', () => {
  const G = loadGame(); G.hintsOn = true;
  G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  G.started = true; G.mode = 'drive'; G.step(1 / 60);
  assert.equal(G.hintFor(), 'SLIDE LEFT THUMB TO STEER');
  assert.equal(G.dom('hint').textContent, 'SLIDE LEFT THUMB TO STEER');
  const cv = G.renderer.domElement;
  cv.dispatch('pointerdown', { pointerId: 5, clientX: 300, pointerType: 'touch' });   // GO does not count
  assert.equal(G.thumbUsed, false);
  cv.dispatch('pointerdown', { pointerId: 6, clientX: 40, pointerType: 'touch' });
  assert.equal(G.thumbUsed, true);
  assert.match(G.hintFor(), /^(FIND HIM!|CHASE HIM!)$/);
  const K = loadGame(); K.inputKind = 'keys'; K.evalInGame('tilt.fallback=true'); K.started = true; K.mode = 'drive';
  assert.notEqual(K.hintFor(), 'SLIDE LEFT THUMB TO STEER', 'keyboard players keep the patrol wording');
});

/* ---------------------------------------------------------------- T2 */
test('T2 lifting GO keeps the steering thumb; lifting the steering thumb straightens', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive'; G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  const cv = G.renderer.domElement;
  cv.dispatch('pointerdown', { pointerId: 11, clientX: 30, pointerType: 'touch', buttons: 1 });
  const s0 = G.touchSteer; assert.ok(s0 < -0.9, `steering hard left (${s0})`);
  cv.dispatch('pointerdown', { pointerId: 12, clientX: 300, pointerType: 'touch', buttons: 1 });
  cv.dispatch('pointermove', { pointerId: 12, clientX: 150, pointerType: 'touch', buttons: 1 });   // GO sliding left: not steering
  assert.equal(G.touchSteer, s0);
  cv.dispatch('pointerup', { pointerId: 12, clientX: 300, pointerType: 'touch', buttons: 0 });
  cv.dispatch('pointerleave', { pointerId: 12, clientX: 300, pointerType: 'touch', buttons: 0 });
  assert.equal(G.touchSteer, s0, 'GO lift keeps the wheel turned');
  cv.dispatch('pointermove', { pointerId: 11, clientX: 97.5, pointerType: 'touch', buttons: 1 });
  assert.equal(G.touchSteer, 0, 'the steering thumb still steers');
  cv.dispatch('pointermove', { pointerId: 11, clientX: 30, pointerType: 'touch', buttons: 1 });
  cv.dispatch('pointerup', { pointerId: 11, clientX: 30, pointerType: 'touch', buttons: 0 });
  assert.equal(G.touchSteer, 0); assert.equal(G.steerPid, null);
});

/* ---------------------------------------------------------------- T3 */
test('T3 exit line: tilt keeps the v0.3 line; thumb and arrows get their own verb', () => {
  const lines = {};
  for (const [kind, fb] of [['touch', false], ['touch', true], ['keys', true]]) {
    const G = loadGame(); G.started = true; G.mode = 'drive'; G.inputKind = kind; G.evalInGame('tilt.fallback=' + fb);
    Object.assign(G.car, { speed: 0, mv: 0 }); G.doAction('exit');
    assert.equal(G.mode, 'foot');
    lines[kind + fb] = G.dom('msg').textContent;
  }
  assert.equal(lines.touchfalse, 'On foot — tilt to weave, hold right side to sprint');
  assert.equal(lines.touchtrue, 'On foot — thumb steers, hold right to run');
  assert.match(lines.touchtrue, /hold right/, 'a thumb player learns to hold GO to run (jog 3.0 m/s otherwise)');
  assert.equal(lines.keystrue, 'On foot — arrow keys to steer and run');
  for (const l of [lines.touchtrue, lines.keystrue]) { assert.doesNotMatch(l, /tilt/i); assert.ok(words(l) <= 8, l); }
});

/* ---------------------------------------------------------------- T4 */
function toGradCard() {
  const G = loadGame(); G.started = true; G.startAcademy({ only: 'slalom' });
  G.car.x = -50; G.step(0.1); G.car.x = -4; G.step(0.1);
  assert.equal(G.DRILLS[G.acad.step].id, 'graduate'); assert.ok(G.dom('card').classList.contains('grad'));
  return G;
}
test('T4 GO ON PATROL ignores a press in the first CARD_ARM ms, a pointer from elsewhere, and a bare pointerdown', () => {
  const G = toGradCard(), go = G.dom('cardGo');
  assert.ok(G.CARD_ARM >= 500 && G.CARD_ARM <= 900);
  go.dispatch('pointerdown', { pointerId: 3 }); go.dispatch('pointerup', { pointerId: 3 });
  assert.equal(G.phase, 'academy', 'too soon: the card stays');
  G.step(0.2);
  go.dispatch('pointerdown', { pointerId: 4 });                   // pressed before arming …
  G.step(0.6);
  go.dispatch('pointerup', { pointerId: 4 });                     // … and lifted after: still ignored
  assert.equal(G.phase, 'academy');
  go.dispatch('pointerdown', { pointerId: 7 });
  assert.equal(G.phase, 'academy', 'pointerdown alone never fires');
  go.dispatch('pointerup', { pointerId: 8 });                     // a different pointer lifting over it
  assert.equal(G.phase, 'academy');
  go.dispatch('pointerdown', { pointerId: 9 }); go.dispatch('pointerup', { pointerId: 9 });
  assert.equal(G.phase, 'patrol'); assert.ok(!G.dom('card').classList.contains('show'));
});

/* ---------------------------------------------------------------- T5 */
test('T5 a last charge fired just before a cuff never overwrites CUFFED', () => {
  const G = loadGame(); G.started = true; G.mode = 'foot'; G.inputKind = 'touch';
  Object.assign(G.cop, { x: -30, z: 23, a: 0, speed: 0, mv: 0, freezeUntil: 0 });
  Object.assign(G.crook, { x: -30, z: 27, a: 0, speed: 0, state: 'flee', alerted: true, glanceT: G.now() + 20000 });
  G.step(1 / 60);
  G.taze.charges = 1; G.fireTaze(G.now(), 1);
  assert.equal(G.taze.charges, 0);
  Object.assign(G.crook, { x: -30, z: 24.5, speed: 0 });
  assert.equal(G.affordance(), 'cuff'); G.doAction();
  assert.equal(G.crook.state, 'cuffed');
  const cuffMsg = G.dom('msg').textContent; assert.match(cuffMsg, /CUFFED/);
  for (let k = 0; k < 60; k++) G.step(1 / 60);
  assert.equal(G.taze.phase, 'idle');
  assert.equal(G.dom('msg').textContent, cuffMsg);
  assert.match(GAME, /taze\.charges===0&&!taze\.hit&&tgtLive\(tazeTarget\(\)\)\)say\("Taser's empty — run him down",3000\)/);
});

/* ---------------------------------------------------------------- T6 */
test('T6 academy siren: the gates drill praises, never the patrol line; patrol keeps the v0.3 line', () => {
  const G = loadGame(); G.started = true; G.startAcademy({ only: 'gates' }); G.step(1 / 60);
  G.acad.gi = 3;
  assert.equal(G.toggleSiren(), true); assert.equal(G.siren.on, true);
  assert.equal(G.dom('msg').textContent, '📣 Nice! Now zoom!');
  G.toggleSiren(); assert.equal(G.dom('msg').textContent, '📣 Siren off');
  const H = loadGame(); H.started = true; H.mode = 'drive'; H.toggleSiren();
  assert.equal(H.dom('msg').textContent, '🚨 Sirens! Everyone within a block heard you');
});
test('T6 behind the graduation card the siren (KeyL) does nothing', () => {
  const G = toGradCard(); G.events.clear();
  const msg = G.dom('msg').textContent;
  G.fire('keydown', { code: 'KeyL' });
  assert.equal(G.siren.on, false); assert.equal(G.events.count('siren'), 0);
  assert.equal(G.dom('msg').textContent, msg);
  assert.equal(G.toggleSiren(), false);
});

/* ================================================================ batch "kid-ux"
      K11 the dispatch waits for the on-duty toast, in two short beats (never both on screen)
      K12 TRY AGAIN ↻ on the graduation card restarts the lap as a time trial; #cardGo stays last
      K13 the medal line praises first, then a friendly next goal — never "missed"
      K14 a wrong-side cone pass says why, once a run
      K15 line-up / taser pills show the count
      K16 House rules rows in plain kid words (keys + stored values unchanged)
      K18 FIND HIM has no fixed arrow
*/
const fireTimer = (G, ms) => { for (const [id, t] of [...G.timers]) if (t.ms === ms) { G.timers.delete(id); t.fn(); return true; } return false; };

test('K11 on-duty toast first, then "Wanted: <name>!", then "Last seen near …" — one at a time, each ≤8 words', () => {
  const G = loadGame(); G.evalInGame("startMode='patrol'"); G.beginGame();
  const msg = G.dom('msg'), rad = G.dom('radio');
  assert.ok(msg.classList.contains('show')); assert.match(msg.textContent, /find the crook/);
  assert.ok(!rad.classList.contains('show'), 'the dispatch waits while the toast shows');
  assert.equal(G.radioQ.length, 2);
  assert.ok(fireTimer(G, 3400), 'the toast hides');
  assert.ok(!msg.classList.contains('show'));
  assert.ok(rad.classList.contains('show')); assert.equal(rad.textContent, '📻 Wanted: ' + G.crook.name + '!');
  assert.ok(fireTimer(G, 3500));
  assert.ok(rad.classList.contains('show')); assert.match(rad.textContent, /^📻 Last seen near (the park|the plaza|the station|the alley|Main St)$/);
  assert.ok(fireTimer(G, 3500)); assert.ok(!rad.classList.contains('show')); assert.equal(G.radioQ.length, 0);
  for (const n of ['Pickpocket Pam', 'Captain Crumbs', 'Sneaky Pete']) assert.ok(words('📻 Wanted: ' + n + '!') <= 8);
  assert.ok(words('📻 Last seen near the station') <= 8);
  // a toast that pops while a beat is up: the next beat waits for it too
  const H = loadGame(); H.started = true; H.respawnCrook(); assert.ok(fireTimer(H, 0), 'deferred pump');
  assert.ok(H.dom('radio').classList.contains('show'));
  H.evalInGame("say('x',2000)"); fireTimer(H, 3500);
  assert.ok(!H.dom('radio').classList.contains('show'), 'never under a fresh toast');
  fireTimer(H, 2000); assert.match(H.dom('radio').textContent, /^📻 Last seen near /);
  // leaving patrol drops the queue
  const A = loadGame(); A.evalInGame("startMode='patrol'"); A.beginGame(); A.startAcademy(); assert.ok(fireTimer(A, 3200), "the drill toast hides");
  assert.ok(!A.dom('radio').classList.contains('show')); assert.equal(A.radioQ.length, 0);
});

test('K12 TRY AGAIN ↻: off-play, armed like GO ON PATROL, restarts the same lap as a time trial; #cardGo stays last', () => {
  const G = toGradCard(), card = G.dom('card'), again = G.dom('cardAgain');
  assert.ok(again, '#cardAgain exists'); assert.equal(again.textContent, 'TRY AGAIN ↻');
  // the stub DOM has no parentNode: the order is pinned in the source (checked live in headless Chrome by smoke.mjs)
  assert.match(GAME, /b\.id='cardAgain'; const go=\$\('cardGo'\); go\.parentNode\.insertBefore\(b,go\)/, 'inserted before #cardGo: #cardGo stays last');
  again.dispatch('pointerdown', { pointerId: 3 }); again.dispatch('pointerup', { pointerId: 3 });
  assert.ok(card.classList.contains('grad'), 'too soon: the card stays');
  G.step(0.7);
  again.dispatch('pointerdown', { pointerId: 4 }); again.dispatch('pointerup', { pointerId: 5 });
  assert.ok(card.classList.contains('grad'), 'another pointer lifting: ignored');
  again.dispatch('pointerdown', { pointerId: 6 }); again.dispatch('pointerup', { pointerId: 6 });
  assert.equal(G.phase, 'academy'); assert.ok(!card.classList.contains('show')); assert.ok(!card.classList.contains('grad'));
  assert.equal(G.acad.trial, true); assert.equal(G.acad.only, 'slalom'); assert.equal(G.DRILLS[G.acad.step].id, 'slalom');
  const F = loadGame(); F.started = true; F.startAcademy();
  const gi = F.DRILLS.findIndex(d => d.id === 'graduate');
  F.acad.lap = 30; F.acad.times = { slalom: 10, gates: 20 }; F.acad.step = gi; F.DRILLS[gi].setup(F.gnow());
  F.tryAgain(); assert.equal(F.acad.trial, true); assert.equal(F.acad.only, null); assert.equal(F.acad.step, 0);
  const CSS = fs.readFileSync(INDEX_HTML, 'utf8');
  assert.match(CSS, /#card\.grad #cardAgain\{display:block;\}/);
  assert.match(CSS, /#cardAgain\{[^}]*pointer-events:auto/);
});

test('K13 medal line: praise first, then "Next: …" — never "missed" / "is under"; the par is untouched', () => {
  const P = { gold: 25, silver: 30, bronze: 36 };
  const run = (lap, grad) => {
    const G = loadGame(); G.started = true; G.startAcademy();
    for (const k of Object.keys(P)) assert.equal(G.ACADEMY_PAR[k], P[k]);
    if (grad) G.career.academy = { grad: true, best: {} };
    G.acad.lap = lap; G.acad.times = { slalom: 10, gates: lap - 10 };
    G.graduate(G.gnow()); return G.dom('cardN').textContent;
  };
  assert.equal(run(52.3, false), 'You graduated! Next: bronze under 0:36');
  assert.equal(run(52.3, true), 'Nice driving! Next: bronze under 0:36');
  assert.equal(run(33, false), 'BRONZE! Next: silver under 0:30');
  assert.equal(run(28, true), 'SILVER! Next: gold under 0:25');
  assert.equal(run(20, true), 'GOLD 🥇 top time!');
  for (const l of [run(52.3, false), run(52.3, true), run(33, false), run(28, true)]) {
    assert.doesNotMatch(l, /miss|is under/i); assert.ok(words(l) <= 8, l); assert.match(l, /^[^:]+! Next: /, l);
  }
});

test('K14 a wrong-side cone pass says why once a run; a touch does not; a restart says it again', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'keys'; G.startAcademy(); G.step(1 / 60);
  assert.ok(words(G.CONE_MISS_LINE) <= 8); assert.equal((G.CONE_MISS_LINE.match(/\p{Extended_Pictographic}/gu) || []).length, 1);
  const cs = G.CONES.slice().sort((a, b) => a.x - b.x), c0 = cs[0], c1 = cs[1];
  G.evalInGame("say('-',3000)");
  Object.assign(G.car, { x: c0.x - 3, z: G.SLALOM.z, a: Math.PI / 2, speed: 0 });   // straight down the middle: no touch, wrong side G.step(1 / 60);
  G.car.x = c0.x + 3; G.step(1 / 60);
  assert.ok(c0.miss, 'wrong-side pass tipped the cone');
  assert.equal(G.dom('msg').textContent, G.CONE_MISS_LINE);
  G.evalInGame("say('-',3000)");
  Object.assign(G.car, { x: c1.x - 3, z: G.SLALOM.z }); G.step(1 / 60);
  G.car.x = c1.x + 3; G.step(1 / 60);
  assert.ok(c1.miss); assert.equal(G.dom('msg').textContent, '-', 'said once a run');
  G.startAcademy(); assert.equal(G.acad.missSaid, false);
});

test('K15 line-up and taser pills show the count', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'keys';
  G.startAcademy({ only: 'lineup' }); G.step(1 / 60);
  assert.equal(G.hintFor(), 'CUFF ROBBERS 0/' + G.LINEUP_NEED);
  G.acad.robbers = 1; assert.equal(G.hintFor(), 'CUFF ROBBERS 1/3');
  G.startAcademy({ only: 'taser' }); G.step(1 / 60);
  assert.match(G.hintFor(), /^(ZAP HIM!|AIM FROM THE LINE|TURN TO FACE HIM|WAIT FOR HIM…) 0\/2$/);
  G.acad.hits = 1; assert.match(G.hintFor(), / 1\/2$/);
  for (const h of ['CUFF ROBBERS 1/3', 'ZAP HIM! 1/2', 'AIM FROM THE LINE 1/2', 'TURN TO FACE HIM 1/2']) assert.ok(words(h) <= 8, h);
  assert.equal(G.LINEUP_NEED, 3); assert.equal(G.RANGE_NEED, 2);
});

test('K16 House rules: plain kid labels (≤8 words), same keys and stored values', () => {
  const G = loadGame();
  assert.equal(JSON.stringify(G.RULE_UI.map(r => r[0])), JSON.stringify(['ramCost', 'enterGraceS', 'bookMaxMv', 'parFromSlip', 'slipSubwayBan', 'gradStars']));
  assert.equal(JSON.stringify(G.RULE_UI.map(r => r[2].map(v => v[0]))), JSON.stringify([['none', 'paperwork', 'burst'], [0, 2, 4], [3, 1, 6], [false, true], [true, false], [0, 1, 3]]));
  for (const [k, label, vals] of G.RULE_UI) {
    assert.ok(words(label) <= 8, label);
    assert.doesNotMatch(label, /\bpar\b|\bslip\b|ENTER|below speed/i, label);
    assert.equal(vals[0][0], G.RULES_DEF[k], 'the first value is the default');
    for (const [, w] of vals) assert.ok(words(w) <= 3, w);
  }
});

test('K18 FIND HIM has no fixed arrow (the tracker points the way)', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'keys'; G.step(1 / 60);
  assert.equal(G.hintFor(), 'FIND HIM!');
  G.mode = 'foot'; assert.equal(G.hintFor(), 'FIND HIM!');
  assert.ok(!GAME.includes('FIND HIM →'));
});

/* ================================================================ batch "ios-pwa-audio" */
const HTML = fs.readFileSync(INDEX_HTML, 'utf8');

/* ---------------------------------------------------------------- P1 */
test('P1 short landscape: #cd and #a2hs sit in different grid cells (#cd takes #alt\'s row)', () => {
  const mq = HTML.match(/@media \(orientation:landscape\) and \(max-height:500px\)\{([\s\S]*?)\n  \}/);
  assert.ok(mq, 'short-landscape media query present');
  const cell = sel => {
    let col = null, row = null;
    for (const m of mq[1].matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const sels = m[1].split(',').map(x => x.trim().split(/\s+/).pop());
      if (!sels.includes(sel)) continue;
      const c = m[2].match(/grid-column:([^;]+)/), r = m[2].match(/grid-row:([^;]+)/);
      if (c) col = c[1].trim(); if (r) row = r[1].trim();
    }
    return col + '/' + row;
  };
  assert.equal(cell('#a2hs'), '2/6');
  assert.equal(cell('#cd'), '2/5');
  assert.equal(cell('#alt'), '2/5', '#cd reuses the #alt cell');
  assert.notEqual(cell('#cd'), cell('#a2hs'));
  // #alt is always hidden when the countdown shows, so the shared 2/5 cell never double-books
  const cdt = GAME.match(/function countdownThen\([\s\S]*?\n\}/)[0];
  assert.match(cdt, /\$\('alt'\)\.style\.display='none'/);
});

/* ---------------------------------------------------------------- P2 */
const AUDIO_SRC = (HTML.match(/^<script id="audio">([\s\S]*?)<\/script>/m) || [])[1];
function miniAudio(game) {
  const nodes = [], intervals = [], docL = {};
  class P { constructor(v = 0) { this.value = v; this.target = v; }
    setValueAtTime(v) { this.value = v; this.target = v; (this.sets ||= []).push(v); return this; }
    linearRampToValueAtTime() { return this; } exponentialRampToValueAtTime() { return this; }
    setTargetAtTime(v) { this.target = v; return this; } cancelScheduledValues() { this.target = this.value; return this; } }
  class N { constructor(k) { this.kind = k; nodes.push(this); } connect(n) { return n; } disconnect() {} }
  class AC { constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); } suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createOscillator() { const o = new N('osc'); o.frequency = new P(440); o.start = () => {}; o.stop = () => {}; return o; }
    createGain() { const g = new N('gain'); g.gain = new P(1); return g; }
    createBiquadFilter() { const f = new N('filt'); f.frequency = new P(350); f.Q = new P(1); return f; }
    createBufferSource() { const s = new N('src'); s.start = () => {}; s.stop = () => {}; return s; }
    createBuffer(ch, n) { const d = new Float32Array(n); return { getChannelData: () => d, length: n }; } }
  const el = () => ({ children: [], classList: { toggle() {} }, appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; }, addEventListener() {} });
  const document = { hidden: false, addEventListener(ev, fn) { (docL[ev] ||= []).push(fn); },
    getElementById: () => null, createElement: el };
  const __game = { started: true, mode: 'drive', siren: { on: true }, car: { mv: 20 }, paused: false, onFx() {}, ...game };
  const sb = { document, __game, console, AudioContext: AC,
    localStorage: { getItem: () => null, setItem() {} },
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval: id => { intervals[id - 1] = null; } };
  vm.createContext(sb); vm.runInContext(AUDIO_SRC, sb);
  const fire = ev => (docL[ev] || []).forEach(f => f({}));
  return { sb, nodes, document, __game, fire, poll: () => intervals.forEach(f => f && f()) };
}
test('P2 hidden zeroes siren+engine gains immediately; returning while paused keeps them at 0, live again ramps up', () => {
  const a = miniAudio(); a.fire('click'); a.poll();
  const saw = a.nodes.find(n => n.kind === 'osc' && n.type === 'sawtooth');
  assert.ok(saw, 'siren running');
  const gains = a.nodes.filter(n => n.kind === 'gain' && n.gain.target > 0 && n.gain.target < 0.2);
  assert.ok(gains.length >= 2, 'siren + engine gains at driving levels');
  // the game's own listener pauses the game on hide (pauseVeil); audio must zero NOW, not on the next poll tick
  a.document.hidden = true; a.__game.paused = true; a.fire('visibilitychange');
  for (const g of gains) { assert.equal(g.gain.value, 0); assert.equal(g.gain.target, 0); }
  a.document.hidden = false; a.fire('visibilitychange');      // back, but still behind the PAUSED veil
  for (const g of gains) assert.equal(g.gain.target, 0, 'no blip while paused');
  a.poll(); for (const g of gains) assert.equal(g.gain.target, 0);
  const lfo = a.nodes.find(n => n.kind === 'osc' && n.type === 'triangle');
  lfo.frequency.sets = [];
  a.__game.paused = false; a.poll();                           // live again: ramps up, and the yelp replays
  assert.ok(gains.every(g => g.gain.target > 0), 'ramps up once the game is live');
  assert.ok(lfo.frequency.sets.includes(6), 'the 1.5 s yelp replays after coming back');
});

/* ---------------------------------------------------------------- P3 */
const PWA_SRC = (HTML.match(/<script id="pwa">([\s\S]*?)<\/script>/) || [])[1];
function runPwa(href, { sw = true } = {}) {
  const u = new URL(href), log = { registered: [], unregistered: 0, deleted: [] };
  const regs = [{ unregister() { log.unregistered++; return Promise.resolve(true); } },
                { unregister() { log.unregistered++; return Promise.resolve(true); } }];
  const winL = {};
  const navigator = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36', maxTouchPoints: 0 };
  if (sw) navigator.serviceWorker = { register: p => { log.registered.push(p); return Promise.resolve({}); },
    getRegistrations: () => Promise.resolve(regs) };
  const caches = { keys: () => Promise.resolve(['code3-v0.4.0', 'code3-v0.3', 'other-app']),
    delete: k => { log.deleted.push(k); return Promise.resolve(true); } };
  const sb = { navigator, caches, location: { protocol: u.protocol, hostname: u.hostname, search: u.search },
    addEventListener: (ev, fn) => { (winL[ev] ||= []).push(fn); }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem() {} }, document: { getElementById: () => null } };
  sb.window = sb;
  vm.createContext(sb); vm.runInContext(PWA_SRC, sb);
  (winL.load || []).forEach(f => f());
  return log;
}
const flush = () => new Promise(r => setTimeout(r, 0));
test('P3 SW gate: real site and ?sw=1 register; http/localhost and https tunnels do not', () => {
  const reg = href => runPwa(href).registered.length === 1;
  assert.equal(reg('https://sig9.github.io/code3/'), true, 'production GitHub Pages');
  assert.equal(reg('https://abc-def.trycloudflare.com/'), false, 'https tunnel: no sticky SW');
  assert.equal(reg('https://example.ngrok.app/index.html'), false);
  assert.equal(reg('http://localhost:8080/'), false);
  assert.equal(reg('http://sig9.github.io/code3/'), false, 'github.io over http does not register');
  assert.equal(reg('https://github.io.evil.com/'), false);
  assert.equal(reg('http://localhost:8080/?sw=1'), true, '?sw=1 opt-in');
  assert.equal(reg('https://abc.trycloudflare.com/?x=2&sw=1'), true, '?sw=1 opt-in on any origin');
  assert.equal(reg('https://abc.trycloudflare.com/?sw=10'), false);
  assert.equal(runPwa('https://sig9.github.io/code3/', { sw: false }).registered.length, 0, 'no serviceWorker API → no-op');
});
test('P3 kill switch: ?sw=0 unregisters every worker, deletes only code3-* caches, and does not register', async () => {
  const log = runPwa('https://sig9.github.io/code3/?sw=0'); await flush(); await flush();
  assert.equal(log.registered.length, 0);
  assert.equal(log.unregistered, 2);
  assert.deepEqual(log.deleted.sort(), ['code3-v0.3', 'code3-v0.4.0']);
  const plain = runPwa('https://sig9.github.io/code3/'); await flush(); await flush();
  assert.equal(plain.unregistered, 0); assert.deepEqual(plain.deleted, []);
});

/* ================================================================ review round 1 (after round 3)
      RR1 booking / escape / GO ON PATROL: the "New crook" / on-duty toast first, the dispatch after it — never both;
         an old crook's radio line never sits beside the new crook's toast
      RR3 academy siren: "Nice! Now zoom!" only once the drill asked for it (gate 3 on, before the bay); ≤1 emoji
      RR5 slalom pill for thumb players: the steering tip retires after the first left-thumb touch
*/
const emojiCount = s => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
function patrolDue(G) { G.evalInGame("startMode='patrol'"); G.beginGame(); for (const [id] of [...G.timers]) G.timers.delete(id);
  G.dom('msg').classList.remove('show'); G.dom('radio').classList.remove('show'); G.radioQ = []; }
for (const kind of ['booked', 'escaped']) test(`RR1 after a ${kind} crook the "New crook" toast shows alone, then the dispatch`, () => {
  const G = loadGame(); patrolDue(G);
  G.radioQ = ['📻 Last seen near Main St']; G.dom('radio').classList.add('show');      // an old-crook line still up
  if (kind === 'booked') { G.crook.state = 'booked'; G.crook.bookedT = G.gnow() - 2100; }
  else { G.crook.state = 'escaped'; G.crook.cuffT = G.gnow() - 2100; }
  G.step(1 / 60);
  const msg = G.dom('msg'), rad = G.dom('radio');
  assert.equal(msg.textContent, 'New crook spotted in the district 👀'); assert.ok(msg.classList.contains('show'));
  assert.ok(!rad.classList.contains('show'), 'no old-crook dispatch line beside the new toast');
  assert.deepEqual([...G.radioQ].map(l => l.slice(0, 10)), ['📻 Wanted:', '📻 Last se']);
  assert.ok(fireTimer(G, 0)); assert.ok(!rad.classList.contains('show'), 'the deferred pump waits for the toast');
  assert.ok(fireTimer(G, 2400)); assert.ok(!msg.classList.contains('show'));
  assert.ok(rad.classList.contains('show')); assert.equal(rad.textContent, '📻 Wanted: ' + G.crook.name + '!');
});
test('RR1 GO ON PATROL: the on-duty toast first, the dispatch after it', () => {
  const G = toGradCard(); for (const [id] of [...G.timers]) G.timers.delete(id); G.dom('msg').classList.remove('show');
  G.startPatrol();
  const msg = G.dom('msg'), rad = G.dom('radio');
  assert.equal(G.phase, 'patrol'); assert.ok(msg.classList.contains('show')); assert.match(msg.textContent, /find the crook/);
  fireTimer(G, 0); assert.ok(!rad.classList.contains('show'), 'never both at once');
  assert.ok(fireTimer(G, 3400)); assert.ok(rad.classList.contains('show')); assert.match(rad.textContent, /^📻 Wanted: /);
});
test('RR3 academy siren: zoom only after gate 3 asks, never with STOP IN THE BAY; ≤1 emoji', () => {
  const lineAt = gi => { const G = loadGame(); G.started = true; G.startAcademy({ only: 'gates' }); G.step(1 / 60);
    G.acad.gi = gi; G.toggleSiren(); return [G.dom('msg').textContent, G.hintFor()]; };
  assert.deepEqual(lineAt(0), ['📣 Siren on!', 'DRIVE THROUGH RINGS']);
  assert.equal(lineAt(3)[0], '📣 Nice! Now zoom!');
  const [m, h] = lineAt(6); assert.equal(h, 'STOP IN THE BAY'); assert.equal(m, '📣 Siren on!');
  for (const l of ['📣 Siren on!', '📣 Nice! Now zoom!', '📣 Siren off']) assert.ok(emojiCount(l) <= 1, l);
  assert.doesNotMatch(GAME, /Now zoom! 🚨|Siren on! 🚨/);
});
test('RR5 slalom pill: thumb tip until the first left-thumb touch, then WEAVE AROUND THE CONES', () => {
  const G = loadGame(); G.started = true; G.startAcademy(); G.step(1 / 60);
  G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  assert.equal(G.hintFor(), 'SLIDE LEFT THUMB TO STEER');
  G.thumbUsed = true; assert.equal(G.hintFor(), 'WEAVE AROUND THE CONES');
  G.step(2); assert.equal(G.hintFor(), 'WEAVE AROUND THE CONES');
  assert.ok(words('WEAVE AROUND THE CONES') <= 8);
});
test('RR1 a got-away line is kept through the respawn; the new dispatch waits for it and the toast', () => {
  const G = loadGame(); patrolDue(G);
  G.emit('escape'); const esc = G.dom('radio').textContent; assert.match(esc, /got away/);
  G.crook.state = 'escaped'; G.crook.cuffT = G.gnow() - 2100; G.step(1 / 60);
  assert.equal(G.dom('radio').textContent, esc); assert.equal(G.radioQ.length, 2);
  fireTimer(G, 0); assert.equal(G.dom('radio').textContent, esc);
  assert.ok(fireTimer(G, 3500)); assert.ok(!G.dom('radio').classList.contains('show'), 'toast still up: waits');
  assert.ok(fireTimer(G, 2400)); assert.equal(G.dom('radio').textContent, '📻 Wanted: ' + G.crook.name + '!');
});
test('RR2 short landscape: the grad card buttons are compact enough for one row (667x375, 568x320 in smoke)', () => {
  const HTML = fs.readFileSync(INDEX_HTML, 'utf8'), mq = HTML.slice(HTML.indexOf('@media (max-height:480px){'));
  const rule = mq.slice(0, mq.indexOf('\n  }\n')).match(/#card\.grad #cardAgain,#card\.grad #cardGo\{([^}]*)\}/);
  assert.ok(rule, 'the paired grad-button rule sits in the short-landscape block');
  assert.match(rule[1], /display:inline-block/); assert.match(rule[1], /font-size:13px/);
  assert.match(rule[1], /letter-spacing:0/); assert.match(rule[1], /padding:8px 12px/); assert.match(rule[1], /white-space:nowrap/);
  const block = mq.slice(0, mq.indexOf('\n  }\n'));
  assert.match(block, /#card\.grad\{width:max-content;max-width:min\(330px,calc\(100vw - 32px\)\);\}/, 'not capped at 50vw by left:50%');
  assert.match(block, /#card\.show ~ #credit\{visibility:hidden;\}/);
});
test('RR4 docs: README and SPEC describe the *.github.io / ?sw=1 gate and the ?sw=0 kill switch', () => {
  const dir = INDEX_HTML.replace(/index\.html$/, '');
  for (const f of ['README.md', 'SPEC.md']) {
    const t = fs.readFileSync(dir + f, 'utf8');
    assert.match(t, /github\.io/, f); assert.match(t, /\?sw=0/, f); assert.doesNotMatch(t, /localhost with `\?sw=1`/, f);
  }
});

/* ---------------------------------------------------------------- review round 2 after round 3 */
test('RS1 a second left touch lifting hands the wheel back to the thumb still down', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive'; G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  const cv = G.renderer.domElement, W = G.evalInGame('innerWidth');
  const at = x => Math.max(-1, Math.min(1, (x - W / 4) / (W * 0.18)));
  cv.dispatch('pointerdown', { pointerId: 11, clientX: 0.03 * W, pointerType: 'touch', buttons: 1 });
  assert.equal(G.steerPid, 11); assert.equal(G.touchSteer, -1);
  cv.dispatch('pointerdown', { pointerId: 12, clientX: 0.40 * W, pointerType: 'touch', buttons: 1 });   // palm / second tap takes over
  assert.equal(G.steerPid, 12); assert.equal(G.touchSteer, at(0.40 * W));
  cv.dispatch('pointerup', { pointerId: 12, clientX: 0.40 * W, pointerType: 'touch', buttons: 0 });
  assert.equal(G.steerPid, 11, 'the held thumb gets the wheel back'); assert.equal(G.touchSteer, -1, 'at its last x');
  cv.dispatch('pointermove', { pointerId: 11, clientX: 0.20 * W, pointerType: 'touch', buttons: 1 });
  assert.equal(G.touchSteer, at(0.20 * W), 'A moves means A steers');
  // a non-steering pointer lifting (GO) never touches the wheel; the late lift of the old id is harmless
  cv.dispatch('pointerleave', { pointerId: 12, clientX: 0.40 * W, pointerType: 'touch', buttons: 0 });
  assert.equal(G.steerPid, 11); assert.equal(G.touchSteer, at(0.20 * W));
  cv.dispatch('pointerup', { pointerId: 11, clientX: 0.20 * W, pointerType: 'touch', buttons: 0 });
  assert.equal(G.steerPid, null); assert.equal(G.touchSteer, 0); assert.equal(G.steerPtrs.size, 0);
  // an older thumb lifting while the newer one steers leaves the steer alone
  cv.dispatch('pointerdown', { pointerId: 21, clientX: 0.05 * W, pointerType: 'touch', buttons: 1 });
  cv.dispatch('pointerdown', { pointerId: 22, clientX: 0.35 * W, pointerType: 'touch', buttons: 1 });
  cv.dispatch('pointermove', { pointerId: 21, clientX: 0.01 * W, pointerType: 'touch', buttons: 1 });
  assert.equal(G.touchSteer, at(0.35 * W), 'only the active thumb steers');
  cv.dispatch('pointercancel', { pointerId: 21, clientX: 0.01 * W, pointerType: 'touch', buttons: 0 });
  assert.equal(G.steerPid, 22); assert.equal(G.touchSteer, at(0.35 * W));
});

test('RS2 siren on before gate 3: the gate-3 toast never says Tap SIREN; siren off keeps the Tap SIREN toast', () => {
  const pass3 = sirenOn => { const G = loadGame(); G.started = true; G.startAcademy({ only: 'gates' }); G.step(1 / 60);
    if (sirenOn) G.toggleSiren();
    const [gx, gz] = G.GATES[2]; G.acad.gi = 2; G.car.x = gx; G.car.z = gz; G.step(1 / 60);
    assert.equal(G.acad.gi, 3); return [G.dom('msg').textContent, G.hintFor(), G.siren.on]; };
  const [m, h, on] = pass3(true);
  assert.equal(on, true); assert.doesNotMatch(m, /Tap SIREN/); assert.equal(m, '📣 Siren on — go fast!'); assert.equal(h, 'DRIVE THROUGH RINGS');
  assert.ok(words(m) <= 8); assert.ok(emojiCount(m) <= 1, m);
  const [m2, h2] = pass3(false);
  assert.equal(m2, '📣 Tap SIREN — go fast! 🚨'); assert.equal(h2, 'TAP SIREN!');
});

test('RS3 taser pill: TURN only when turned away from a live slider; rail ends and a tased slider say WAIT', () => {
  const G = loadGame(); G.started = true; G.inputKind = 'touch';
  G.startAcademy({ only: 'taser' }); G.step(1 / 60);
  const pill = (sx, state, aimOff = 0) => {
    G.slider.x = sx; G.slider.state = state; G.slider.speed = 0; G.taze.phase = 'idle'; G.taze.okT = -1e9;
    G.cop.x = -28; G.cop.z = G.FIRE_Z; G.cop.a = Math.atan2(G.slider.x - G.cop.x, G.slider.z - G.cop.z) + aimOff;
    G.taze.okT = -1e9; return G.hintFor();
  };
  pill(-28, 'calm'); assert.ok(G.onFiringLine());
  assert.match(pill(-28, 'calm'), /^ZAP HIM! 0\/2$/);
  for (const x of [-33.5, -22.5]) assert.equal(pill(x, 'calm'), 'WAIT FOR HIM… 0/2', `rail end x=${x}`);
  assert.equal(pill(-28, 'tased'), 'WAIT FOR HIM… 0/2', 'he is down');
  assert.match(pill(-28, 'calm', 1.2), /^TURN TO FACE HIM 0\/2$/, 'really turned away');
  assert.match(pill(-33.5, 'calm', -1.2), /^TURN TO FACE HIM/);
  G.cop.z = G.FIRE_Z + 6; assert.match(G.hintFor(), /^AIM FROM THE LINE/);
  G.acad.hits = 1; assert.equal(pill(-28, 'tased'), 'WAIT FOR HIM… 1/2');
  assert.ok(words('WAIT FOR HIM… 1/2') <= 8); assert.equal(emojiCount('WAIT FOR HIM…'), 0);
});

/* ---------------------------------------------------------------- RS4 (final pass) */
test('RS4 a lost pointerup never leaves a ghost thumb: a primary touch, blur and resume drop every tracked pointer', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive'; G.inputKind = 'touch'; G.evalInGame('tilt.fallback=true');
  const cv = G.renderer.domElement, W = 390;
  cv.dispatch('pointerdown', { pointerId: 21, clientX: 0.03 * W, pointerType: 'touch', isPrimary: true, buttons: 1 });
  cv.dispatch('pointerdown', { pointerId: 22, clientX: 300, pointerType: 'touch', isPrimary: false, buttons: 1 });   // GO
  assert.equal(G.steerPid, 21); assert.equal(G.touchSteer, -1);
  // both pointerups are lost (backgrounded mid-steer); the next gesture starts with a primary touch
  cv.dispatch('pointerdown', { pointerId: 31, clientX: 0.20 * W, pointerType: 'touch', isPrimary: true, buttons: 1 });
  assert.equal(G.steerPtrs.size, 1, 'the ghost thumb is gone');
  cv.dispatch('pointerup', { pointerId: 31, clientX: 0.20 * W, pointerType: 'touch', buttons: 0 });
  assert.equal(G.steerPid, null, 'no ghost gets the wheel back');
  assert.equal(G.touchSteer, 0, 'the wheel straightens');
  G.step(0.5);
  assert.ok(!G.keys.gas && G.car.speed < 1, 'the lost GO pointer does not hold the gas');
  // pause / resume also forgets held pointers
  cv.dispatch('pointerdown', { pointerId: 41, clientX: 10, pointerType: 'touch', isPrimary: true, buttons: 1 });
  cv.dispatch('pointerdown', { pointerId: 42, clientX: 300, pointerType: 'touch', isPrimary: false, buttons: 1 });
  G.setPaused(true); G.advance(5000); G.setPaused(false);
  assert.equal(G.steerPtrs.size, 0); assert.equal(G.steerPid, null); assert.equal(G.touchSteer, 0);
  G.step(0.5); assert.ok(G.car.speed < 1, 'no gas after resume');
  // window blur too
  cv.dispatch('pointerdown', { pointerId: 51, clientX: 10, pointerType: 'touch', isPrimary: true, buttons: 1 });
  G.fire('blur');
  assert.equal(G.steerPtrs.size, 0); assert.equal(G.touchSteer, 0);
});

/* ---------------------------------------------------------------- R1 (review round 1 after round 3) */
test('R1a EXIT beside a wall: the cop hops out on the free flank and jogs away; a pinched cop stands still (mv ~0)', () => {
  const G = loadGame(); G.started = true; G.startPatrol(); G.inputKind = 'touch';
  // open street: the v0.3 right flank, facing along the car
  Object.assign(G.car, { x: 0, z: -84, a: 0.3, speed: 0 });
  let e = G.exitSpot();
  assert.ok(Math.abs(e.x - (0 + Math.cos(0.3) * 2.2)) < 1e-6 && Math.abs(e.z - (-84 - Math.sin(0.3) * 2.2)) < 1e-6, 'v0.3 flank');
  assert.equal(e.a, 0.3);
  // the south half of the station bay: the right flank is in the bay wall, so he gets out on the left
  Object.assign(G.car, { x: -62.4, z: -8.4, a: 1.80, speed: 0 });
  G.doAction(); assert.equal(G.mode, 'foot');
  assert.ok(G.cop.z > G.car.z, 'the free (north) flank');
  assert.ok(G.wallClear(G.cop.x, G.cop.z) >= 1, 'room to move');
  const x0 = G.cop.x, z0 = G.cop.z; G.step(2.4);
  assert.ok(Math.hypot(G.cop.x - x0, G.cop.z - z0) > 4, 'the always-jogging touch cop actually goes somewhere');
  assert.ok(G.cop.mv > 2.5 && G.cop.mv < 3.3, `mv ${G.cop.mv}`);
  // forced into the car-wall wedge (the old exit spot), jogging into it: he stays put and reads as pinned
  Object.assign(G.car, { x: -62.4, z: -8.4, a: 1.80, speed: 0 });
  Object.assign(G.cop, { x: -64.88, z: -9.33, a: 1.80, speed: 3, mv: 3 });
  const seen = [];
  for (let i = 0; i < 40; i++) { G.step(1 / 15); seen.push([G.cop.x, G.cop.z]); }
  const hops = seen.slice(10).map((p, i) => Math.hypot(p[0] - seen[i + 9][0], p[1] - seen[i + 9][1]));
  assert.ok(Math.max(...hops) < 0.02, `no frame-to-frame hopping (max ${Math.max(...hops)})`);
  assert.ok(G.cop.mv < 0.35 * G.cop.speed, `measured speed ~0 (mv ${G.cop.mv})`);
  assert.equal(G.car.x, -62.4); assert.equal(G.car.z, -8.4);
  // full-lock steer still frees him
  G.setKeys({ left: true }); G.step(1.5); G.setKeys({ left: false }); G.step(1.5);
  assert.ok(Math.hypot(G.cop.x - seen[39][0], G.cop.z - seen[39][1]) > 2, 'steering out works');
});

test('R1b Line-up / taser beacon: a cop west of the park hedge and off its gap is led to the gate lane first', () => {
  const G = loadGame(); G.started = true; G.startAcademy();
  const at = id => { G.acad.step = G.DRILLS.findIndex(d => d.id === id); };
  G.mode = 'foot';
  for (const id of ['lineup', 'taser']) {
    at(id);
    Object.assign(G.cop, { x: -58.8, z: -8.4 });
    let T = G.DRILLS[G.acad.step].target();
    assert.equal(T.lab, 'Gate'); assert.equal(T.x, G.PARK.x - 22); assert.equal(T.z, -1.2); assert.equal(T.beam, undefined);
    Object.assign(G.cop, { x: -55, z: 7 }); T = G.DRILLS[G.acad.step].target(); assert.equal(T.z, 1.2);
    Object.assign(G.cop, { x: -49.5, z: 1.1 }); assert.equal(G.DRILLS[G.acad.step].target().lab, 'Target', 'in the gap: the real target');
    Object.assign(G.cop, { x: -40, z: -8 }); assert.equal(G.DRILLS[G.acad.step].target().lab, 'Target', 'inside the hedge');
  }
  G.mode = 'drive'; Object.assign(G.cop, { x: -58.8, z: -8.4 }); assert.equal(G.parkGate(), null, 'only on foot');
  // a straight-line pursuer of the beacon (the touch cop jogs at 3 m/s) now gets through the hedge
  G.mode = 'foot'; at('lineup'); G.inputKind = 'touch'; G.acad.robbers = 0;
  Object.assign(G.cop, { x: -58.8, z: -9.3, a: Math.PI / 2, speed: 0, mv: 0, freezeUntil: 0 });
  let inside = false;
  for (let i = 0; i < 600 && !inside; i++) {
    const T = G.DRILLS[G.acad.step].target();
    G.cop.a = Math.atan2(T.x - G.cop.x, T.z - G.cop.z);
    G.step(1 / 30); inside = G.cop.x > -48.3;
  }
  assert.ok(inside, `through the gap (cop at ${G.cop.x.toFixed(1)},${G.cop.z.toFixed(1)})`);
});

/* ---------------------------------------------------------------- review round 4 */
test('R4a the queued "Last seen near …" line is dropped once the crook is spotted, cuffed or in custody', () => {
  for (const moot of [{ state: 'custody' }, { state: 'cuffed' }, { alerted: true, state: 'flee' }]) {
    const G = loadGame(); G.evalInGame("startMode='patrol'"); G.beginGame();
    assert.equal(G.radioQ.length, 2);
    fireTimer(G, 0); fireTimer(G, 3400);
    assert.match(G.dom('radio').textContent, /Wanted/);
    Object.assign(G.crook, moot);
    G.evalInGame("say('🚔 Get him to the car')");
    fireTimer(G, 3500); fireTimer(G, 2400);
    assert.ok(!/Last seen/.test(G.dom('radio').textContent) || !G.dom('radio').classList.contains('show'),
      `no stale line while ${JSON.stringify(moot)}`);
    assert.equal(G.radioQ.length, 0, 'the rest of the queue is dropped');
  }
  // a calm, unspotted crook still gets the second line
  const G = loadGame(); G.evalInGame("startMode='patrol'"); G.beginGame();
  fireTimer(G, 0); fireTimer(G, 3400); fireTimer(G, 3500); fireTimer(G, 2400);
  assert.ok(G.dom('radio').classList.contains('show')); assert.match(G.dom('radio').textContent, /Last seen near/);
});
test('R4b card buttons: a press that slides off the button before lifting does not fire', () => {
  let G = toGradCard(); const go = G.dom('cardGo'); G.step(0.8);
  go.dispatch('pointerdown', { pointerId: 5 }); go.dispatch('pointerup', { pointerId: 5, clientX: 0, clientY: 120 });
  assert.equal(G.phase, 'academy', 'GO: lifted off the button');
  go.dispatch('pointerdown', { pointerId: 6 }); go.dispatch('pointerup', { pointerId: 6, clientX: 4, clientY: 4 });
  assert.equal(G.phase, 'patrol', 'GO: lifted on it (within the slop)');
  G = toGradCard(); const again = G.dom('cardAgain'); G.step(0.8);
  again.dispatch('pointerdown', { pointerId: 5 }); again.dispatch('pointerup', { pointerId: 5, clientX: 200, clientY: 0 });
  assert.ok(G.dom('card').classList.contains('show'), 'TRY AGAIN: lifted off the button, the card stays');
  assert.equal(G.DRILLS[G.acad.step].id, 'graduate');
  again.dispatch('pointerdown', { pointerId: 6 }); again.dispatch('pointerup', { pointerId: 6 });
  assert.notEqual(G.DRILLS[G.acad.step].id, 'graduate', 'TRY AGAIN: lifted on it restarts');
});
test('R4c academy EXIT drill: too fast to jump out says slow down, not TAP EXIT!', () => {
  const G = loadGame(); G.started = true; G.startAcademy(); G.hintsOn = true;
  G.acad.step = G.DRILLS.findIndex(d => d.id === 'exit'); G.mode = 'drive';
  G.car.speed = 20;
  assert.equal(G.DRILLS[G.acad.step].aff(), 'slow');
  assert.notEqual(G.hintFor(), 'TAP EXIT!'); assert.equal(G.hintFor(), 'SLOW DOWN, JUMP OUT!');
  assert.ok(words(G.hintFor()) <= 8);
  G.car.speed = 3; assert.equal(G.hintFor(), 'TAP EXIT!');
  G.car.speed = -20; assert.equal(G.hintFor(), 'SLOW DOWN, JUMP OUT!');
});

/* ================================================================ review round 3 (r4) fixes
      R5a a left thumb already down when the no-tilt touch fallback turns on steers on its next slide
      R5b the queued dispatch lines wait under the pause veil and play after resume (a cut-off line replays)
      R5c settings buttons act on click (a scroll that starts on one never presses it); Reset career asks twice */
test('R5a a left thumb resting before the touch fallback turns on steers once it does', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive'; G.inputKind = 'touch';
  G.evalInGame('tilt.fallback=false; tilt.enabled=true');
  const cv = G.renderer.domElement;
  cv.dispatch('pointerdown', { pointerId: 11, clientX: 60, pointerType: 'touch', isPrimary: true, buttons: 1 });
  assert.equal(G.touchSteer, 0, 'tilt still owns steering'); assert.equal(G.thumbUsed, false);
  cv.dispatch('pointermove', { pointerId: 11, clientX: 20, pointerType: 'touch', buttons: 1 });
  assert.equal(G.touchSteer, 0, 'no thumb steering while tilt is on');
  G.evalInGame('tilt.fallback=true');   // 'No tilt data here — using touch'
  cv.dispatch('pointermove', { pointerId: 11, clientX: 20, pointerType: 'touch', buttons: 1 });
  assert.ok(G.touchSteer < -0.5, 'the resting thumb steers: ' + G.touchSteer);
  assert.equal(G.thumbUsed, true);
  assert.notEqual(G.hintFor(), 'SLIDE LEFT THUMB TO STEER');
  // a GO thumb sliding left still never steers
  cv.dispatch('pointerup', { pointerId: 11, pointerType: 'touch' }); assert.equal(G.touchSteer, 0);
  cv.dispatch('pointerdown', { pointerId: 12, clientX: 300, pointerType: 'touch', isPrimary: true, buttons: 1 });
  cv.dispatch('pointermove', { pointerId: 12, clientX: 20, pointerType: 'touch', buttons: 1 });
  assert.equal(G.touchSteer, 0);
});
test('R5b dispatch lines are held under the pause veil and play after resume', () => {
  const G = loadGame(); G.started = true; G.mode = 'drive';
  G.evalInGame("phase='patrol'; sayOnDuty(); nameCrook(); dispatchRadio();");
  G.setPaused(true);
  const fireAll = () => { for (const [id, t] of [...G.timers]) if (!t.repeat) { G.timers.delete(id); t.fn(); } };
  for (let i = 0; i < 6; i++) { fireAll(); assert.ok(!G.dom('radio').classList.contains('show'), 'nothing plays under the veil'); }
  assert.equal(G.radioQ.length, 2, 'both lines kept');
  G.setPaused(false);
  assert.ok(G.dom('radio').classList.contains('show')); assert.match(G.dom('radio').textContent, /Wanted: /);
  // the veil drops over 'Wanted': it goes back to the front of the queue and replays
  G.setPaused(true);
  assert.ok(!G.dom('radio').classList.contains('show')); assert.equal(G.radioQ.length, 2);
  assert.match(G.radioQ[0], /Wanted: /);
  G.setPaused(false); assert.match(G.dom('radio').textContent, /Wanted: /);
  fireTimer(G, 3500); assert.match(G.dom('radio').textContent, /Last seen near/);
  // a plain radio() line (not from the queue) is not replayed
  G.evalInGame("radio('📻 test line')"); G.setPaused(true); assert.equal(G.radioQ.length, 0);
});
test('R5c settings buttons act on click, never pointerdown; Reset career needs two taps', () => {
  const G = loadGame(); G.started = true;
  const ruleBtn = k => G.dom('rules').children.map(r => r.children[1]).findLast(b => b.id === 'rule_' + k);
  const els = ['tCurve', 'tInv', 'bCal', 'bRespawn', 'tDbg', 'bBadge', 'bReset', 'tHints', 'tRules'].map(id => [id, G.dom(id)])
    .concat(G.RULE_UI.map(r => ['rule_' + r[0], ruleBtn(r[0])]));
  assert.equal(els.length, 9 + G.RULE_UI.length);
  for (const [id, el] of els) {
    assert.ok(el, id);
    assert.equal((el.listeners.get('pointerdown') || []).length, 0, id + ' must not act on pointerdown');
    assert.ok((el.listeners.get('click') || []).length > 0, id + ' acts on click');
  }
  assert.ok(!/tSound[\s\S]{0,400}addEventListener\('pointerdown'/.test(AUDIO_SRC), 'the Sound toggle acts on click');
  const before = G.RULES.ramCost; ruleBtn('ramCost').dispatch('pointerdown');
  assert.equal(G.RULES.ramCost, before, 'a scroll that starts on a rule button changes nothing');
  ruleBtn('ramCost').dispatch('click'); assert.notEqual(G.RULES.ramCost, before);
  G.RULES.ramCost = G.RULES_DEF.ramCost; G.saveRules();
  // Reset career: first tap arms, second wipes; the arm times out after 3 s
  G.career.stars = 12; G.career.booked = 4;
  const b = G.dom('bReset'); b.dispatch('click');
  assert.equal(G.career.stars, 12); assert.equal(b.textContent, 'Sure? Tap again'); assert.ok(words(b.textContent) <= 8);
  fireTimer(G, 3000); assert.equal(b.textContent, 'Reset career');
  b.dispatch('click'); assert.equal(G.career.stars, 12, 'the timed-out arm does not count');
  b.dispatch('click'); assert.equal(G.career.stars, 0); assert.equal(G.career.booked, 0);
  assert.equal(b.textContent, 'Reset career'); assert.equal(G.dom('msg').textContent, 'Career reset');
});
