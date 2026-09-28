/*  test/audio.test.mjs — the v0.4 sound pack (<script id="audio">), run in node:vm with fakes.
    Own tiny loader (does not use harness.mjs): fake AudioContext that records every node it creates,
    fake document (capture listeners, #settings/#note/#debug), fake localStorage, fake __game with onFx,
    and fake timers whose interval callbacks the test fires by hand (the ~20 Hz poll). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { INDEX_HTML, loadGame } from './harness.mjs';

const HTML = fs.readFileSync(INDEX_HTML, 'utf8');
const AUDIO_SRC = (HTML.match(/^<script id="audio">([\s\S]*?)<\/script>/m) || [])[1];

// the fixed onFx event contract (v0.4 plan)
const EVENTS = ['cuff', 'book', 'rank', 'graduate', 'tazeHit', 'tazeMiss', 'alert', 'glance', 'slip', 'escape',
  'crash', 'clip', 'whistle', 'gate', 'cone', 'popup', 'decoy', 'cuffCutout', 'newBest'];

class Param {
  constructor(v = 0) { this.value = v; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['lin', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.calls.push(['exp', v, t]); return this; }
  setTargetAtTime(v, t, k) { this.calls.push(['target', v, t, k]); this.target = v; return this; }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
}
function makeAudio(log) {
  class Node {
    constructor(kind) { this.kind = kind; this.out = []; log.nodes.push(this); }
    connect(n) { this.out.push(n); return n; }
    disconnect() {}
  }
  class Osc extends Node {
    constructor() { super('osc'); this.type = 'sine'; this.frequency = new Param(440); this.detune = new Param(0); }
    start(t) { this.started = t ?? 0; } stop(t) { this.stopped = t; }
  }
  class Src extends Node {
    constructor() { super('src'); this.buffer = null; }
    start(t) { this.started = t ?? 0; } stop(t) { this.stopped = t; }
  }
  class Gain extends Node { constructor() { super('gain'); this.gain = new Param(1); } }
  class Filt extends Node { constructor() { super('filter'); this.type = 'lowpass'; this.frequency = new Param(350); this.Q = new Param(1); } }
  return class FakeAC {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = { kind: 'dest' };
      this.resumes = 0; log.contexts.push(this); }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createOscillator() { return new Osc(); }
    createGain() { return new Gain(); }
    createBiquadFilter() { return new Filt(); }
    createBufferSource() { return new Src(); }
    createBuffer(ch, n) { const d = new Float32Array(n); return { getChannelData: () => d, length: n }; }
  };
}
function makeEl(id) {
  const el = { id, children: [], listeners: {}, textContent: '', className: '', parentNode: null,
    classList: { set: new Set(), toggle(c, on) { on ?? !this.set.has(c) ? this.set.add(c) : this.set.delete(c); return this.set.has(c); },
      contains(c) { return this.set.has(c); } },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = el; const i = el.children.indexOf(ref); el.children.splice(i < 0 ? el.children.length : i, 0, c); return c; },
    addEventListener(ev, fn) { (el.listeners[ev] ||= []).push(fn); },
    fire(ev, e = {}) { for (const fn of el.listeners[ev] || []) fn({ stopPropagation() {}, preventDefault() {}, ...e }); },
  };
  return el;
}

function loadAudio({ withAC = true, stored = null, game = {} } = {}) {
  const log = { nodes: [], contexts: [], intervals: [] };
  const docL = {};
  const settings = makeEl('settings'), note = makeEl('note'), debug = makeEl('debug');
  settings.appendChild(debug);
  const ids = { settings, note, debug };
  const document = {
    hidden: false,
    addEventListener(ev, fn, cap) { (docL[ev] ||= []).push({ fn, cap }); },
    getElementById: id => ids[id] || null,
    createElement: tag => makeEl(tag),
  };
  const store = stored == null ? {} : { 'code3.sound': stored };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const handlers = [];
  const __game = { started: false, mode: 'drive', siren: { on: false }, car: { mv: 0 }, paused: false,
    onFx(h) { handlers.push(h); }, ...game };
  const sandbox = { document, localStorage, __game, console,
    setInterval: fn => { log.intervals.push(fn); return log.intervals.length; },
    clearInterval: id => { log.intervals[id - 1] = null; } };
  if (withAC) sandbox.AudioContext = makeAudio(log);
  vm.createContext(sandbox);
  vm.runInContext(AUDIO_SRC, sandbox, { filename: 'index.html#audio' });
  const fireDoc = (ev, e = {}) => { for (const l of docL[ev] || []) l.fn(e); };
  const pollOnce = () => { for (const fn of log.intervals) fn && fn(); };
  const emit = (name, data) => handlers.forEach(h => h(name, data));
  return { sfx: sandbox.__sfx, log, store, docL, fireDoc, pollOnce, emit, handlers, __game, settings, note, document };
}
const sources = (nodes) => nodes.filter(n => n.kind === 'osc' || n.kind === 'src');

test('audio script exists, sits after the game script, and index.html keeps exactly one <script id="game">', () => {
  assert.ok(AUDIO_SRC, '<script id="audio"> missing');
  assert.equal((HTML.match(/<script id="game">/g) || []).length, 1);
  assert.equal((HTML.match(/<script id="audio">/g) || []).length, 1);
  assert.ok(HTML.indexOf('<script id="audio">') > HTML.lastIndexOf('</script>', HTML.indexOf('<script id="audio">')));
  assert.ok(HTML.indexOf('<script id="audio">') > HTML.indexOf('<script id="game">'));
  assert.ok(!/Math\.random|performance\.now|audioSession/.test(AUDIO_SRC), 'no Math.random / performance.now / audioSession in the sound pack');
  const G = loadGame({ seed: 1 });                        // the game harness still loads index.html
  assert.ok(G.car && typeof G.simulate === 'function');
});

test('loads without throwing and is a no-op when AudioContext is undefined', () => {
  const a = loadAudio({ withAC: false });
  assert.ok(a.sfx);
  a.fireDoc('click'); a.fireDoc('touchend');
  assert.equal(a.sfx.unlock(), null);
  assert.equal(a.sfx.ctx, null);
  a.sfx.click(); a.emit('cuff'); a.sfx.play('book', { stars: 3 }); a.sfx.setMuted(true);
  assert.equal(a.store['code3.sound'], '0');
});

test('no AudioContext before a gesture; capture click creates + resumes it', () => {
  const a = loadAudio();
  assert.equal(a.log.contexts.length, 0);
  a.emit('cuff'); a.pollOnce();                           // events before unlock make no sound, no context
  assert.equal(a.log.contexts.length, 0);
  assert.equal(a.log.nodes.length, 0);
  for (const ev of ['click', 'touchend']) assert.ok(a.docL[ev].some(l => l.cap === true), ev + ' capture listener');
  a.fireDoc('click');
  assert.equal(a.log.contexts.length, 1);
  assert.equal(a.sfx.ctx.state, 'running');
  assert.ok(a.sfx.ctx.resumes >= 1);
  a.fireDoc('click');                                    // second gesture reuses the same context
  assert.equal(a.log.contexts.length, 1);
});

test('re-resumes on the next touchend after the context got suspended/interrupted', () => {
  const a = loadAudio();
  a.fireDoc('touchend');
  const ctx = a.sfx.ctx; ctx.state = 'interrupted'; const r = ctx.resumes;
  a.fireDoc('touchend');
  assert.equal(ctx.state, 'running'); assert.equal(ctx.resumes, r + 1);
});

test('every contract event makes at least one oscillator or buffer source; gains ≤0.25, ≤0.9 s', () => {
  const a = loadAudio();
  a.fireDoc('click');
  assert.equal(a.handlers.length, 1, 'registered one onFx handler');
  for (const name of EVENTS) {
    const before = a.log.nodes.length;
    a.emit(name, { stars: 2, i: 3, long: true });
    const made = a.log.nodes.slice(before);
    assert.ok(sources(made).length >= 1, name + ' made no sound source');
    for (const n of made) {
      if (n.kind === 'gain') for (const c of n.gain.calls) if (c[0] === 'lin') assert.ok(c[1] <= 0.25, name + ' gain ' + c[1]);
      if (n.kind === 'osc' || n.kind === 'src') if (n.stopped != null) assert.ok(n.stopped - n.started <= 0.95, name + ' too long');
      if (n.kind === 'gain') {                             // attack ≥ 5 ms: first ramp after the zero set
        const s = n.gain.calls.findIndex(c => c[0] === 'set' && c[1] === 0), l = n.gain.calls.find(c => c[0] === 'lin');
        if (s >= 0 && l) assert.ok(l[2] - n.gain.calls[s][2] >= 0.005 - 1e-9, name + ' attack too short');
      }
    }
  }
  // also the object form {name,data}
  const before = a.log.nodes.length; a.emit({ name: 'cone' }); assert.ok(sources(a.log.nodes.slice(before)).length >= 1);
});

test('book: star dings per data.stars and a bonk per missing star', () => {
  const a = loadAudio(); a.fireDoc('click');
  const count = stars => { const b = a.log.nodes.length; a.sfx.play('book', { stars }); return sources(a.log.nodes.slice(b)); };
  const s3 = count(3), s1 = count(1);
  const tri = l => l.filter(n => n.type === 'triangle').length;
  assert.equal(tri(s3), 3);
  assert.equal(tri(s1), 1);
  assert.equal(s3.length, s1.length, 'missing stars are replaced by bonks');
});

test('unknown events create nothing', () => {
  const a = loadAudio(); a.fireDoc('click');
  const n = a.log.nodes.length;
  a.emit('nope'); a.emit('toString'); a.emit(''); a.emit(undefined); a.sfx.play('__proto__');
  assert.equal(a.log.nodes.length, n);
});

test('setMuted(true) → master gain 0, persisted code3.sound=0; stored 0 starts muted', () => {
  const a = loadAudio(); a.fireDoc('click');
  const master = a.log.nodes.find(n => n.kind === 'gain');
  assert.equal(master.gain.value, 0.5);
  a.sfx.setMuted(true);
  assert.equal(master.gain.value, 0); assert.equal(a.sfx.muted, true); assert.equal(a.store['code3.sound'], '0');
  const n = a.log.nodes.length; a.emit('cuff'); assert.equal(a.log.nodes.length, n, 'muted events are skipped');
  a.sfx.setMuted(false);
  assert.equal(master.gain.value, 0.5); assert.equal(a.store['code3.sound'], '1');
  const b = loadAudio({ stored: '0' }); assert.equal(b.sfx.muted, true);
  b.fireDoc('click'); assert.equal(b.log.nodes.find(n => n.kind === 'gain').gain.value, 0);
});

test('settings mute row is injected before #debug and toggles; ring-switch hint appended to #note', () => {
  const a = loadAudio();
  const row = a.settings.children[0];
  assert.equal(row.className, 'row');
  assert.equal(a.settings.children[1].id, 'debug');
  const [lab, btn] = row.children;
  assert.equal(lab.textContent, '🔊 Sound'); assert.equal(btn.textContent, 'on');
  btn.fire('click');
  assert.equal(a.sfx.muted, true); assert.equal(btn.textContent, 'off'); assert.equal(a.store['code3.sound'], '0');
  btn.fire('click'); assert.equal(btn.textContent, 'on');
  assert.ok(a.note.children.some(c => c.textContent === '🔈 No sound? Flip the ring switch.'));
});

test('siren poll: starts a sawtooth when started+drive+siren.on, gain targets 0.1; silent when paused/foot', () => {
  const a = loadAudio({ game: { started: true, mode: 'drive', siren: { on: true }, car: { mv: 10 } } });
  a.pollOnce(); assert.equal(a.log.nodes.length, 0, 'no poll before unlock');
  a.fireDoc('click');
  assert.equal(a.log.intervals.filter(Boolean).length, 1, 'one ~20 Hz poll');
  a.pollOnce();
  const saw = a.log.nodes.find(n => n.kind === 'osc' && n.type === 'sawtooth');
  assert.ok(saw && saw.started != null, 'siren oscillator started');
  const lfo = a.log.nodes.find(n => n.kind === 'osc' && n.type === 'triangle');
  assert.ok(lfo.frequency.calls.some(c => c[0] === 'set' && c[1] === 6), 'opens with a yelp');
  const sirenGain = a.log.nodes.filter(n => n.kind === 'gain').find(g => g.gain.calls.some(c => c[0] === 'target' && c[1] === 0.1));
  assert.ok(sirenGain, 'siren gain → 0.1');
  const eng = a.log.nodes.find(n => n.kind === 'osc' && n.type === 'square');
  assert.ok(eng.frequency.calls.some(c => c[0] === 'target' && Math.abs(c[1] - 47) < 1e-9), 'engine 38+0.9·mv');
  a.__game.paused = true; a.pollOnce();
  assert.equal(sirenGain.gain.target, 0, 'paused silences the siren');
  a.__game.paused = false; a.__game.mode = 'foot'; a.pollOnce();
  assert.equal(sirenGain.gain.target, 0, 'foot silences the siren');
});

test('siren stays off (no nodes) when siren.on is false; click() blip is 1800 Hz square', () => {
  const a = loadAudio({ game: { started: true, mode: 'drive', siren: { on: false } } });
  a.fireDoc('click'); a.pollOnce();
  assert.ok(!a.log.nodes.some(n => n.type === 'sawtooth'));
  const n = a.log.nodes.length; a.sfx.click();
  const o = a.log.nodes.slice(n).find(x => x.kind === 'osc');
  assert.equal(o.type, 'square'); assert.equal(o.frequency.value, 1800);
  assert.ok(o.stopped - o.started <= 0.03);
});

test('hidden tab stops the poll; visible restarts it', () => {
  const a = loadAudio(); a.fireDoc('click');
  assert.equal(a.log.intervals.filter(Boolean).length, 1);
  a.document.hidden = true; a.fireDoc('visibilitychange');
  assert.equal(a.log.intervals.filter(Boolean).length, 0);
  a.document.hidden = false; a.fireDoc('visibilitychange');
  assert.equal(a.log.intervals.filter(Boolean).length, 1);
});

test('click() lands at 0.12 after the 0.5 master (v0.3 clickBlip level); unlock primes a silent 1-sample source in the gesture', () => {
  const a = loadAudio(); a.fireDoc('click');
  const prime = a.log.nodes.find(n => n.kind === 'src');
  assert.ok(prime && prime.started === 0 && prime.buffer && prime.buffer.length === 1, 'silent prime started inside the gesture');
  const master = a.log.nodes.find(n => n.kind === 'gain');
  const n = a.log.nodes.length; a.sfx.click();
  const g = a.log.nodes.slice(n).find(x => x.kind === 'gain');
  const peak = Math.max(...g.gain.calls.filter(c => c[0] === 'lin').map(c => c[1]));
  assert.ok(Math.abs(peak * master.gain.value - 0.12) < 1e-9, 'effective click level ' + peak * master.gain.value);
  assert.ok(peak <= 0.25);
});

test('merged v0.4: every sound-contract event is emitted by the game, and clickBlip hands off to __sfx.click', () => {
  const GAME_SRC = (HTML.match(/<script id="game">([\s\S]*?)<\/script>/) || [])[1];
  assert.ok(GAME_SRC, 'game script missing');
  for (const e of EVENTS) assert.ok(GAME_SRC.includes(`emit('${e}'`), `game never emits '${e}'`);
  assert.match(GAME_SRC, /function clickBlip\(\)\{[^}]*__sfx\.click\(\)/, 'clickBlip hands off to the sound pack');
  const G = loadGame({ seed: 1 });
  assert.equal(typeof G.onFx, 'function');
  for (const k of ['started', 'mode', 'siren', 'car', 'paused']) assert.ok(k in G, `__game.${k} missing`);
});
