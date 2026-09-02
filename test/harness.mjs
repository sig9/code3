/*  test/harness.mjs — run the CODE 3 game logic in Node, no browser.

    Running the tests (Node 24, built-ins only, no install):
        cd <repo> && node --test test/*.test.mjs
    (the bare `node --test test/` form does not pick the files up; pass the glob.)

    Reads index.html, pulls out <script id="game">, and executes it in a `node:vm`
    context with stub THREE / DOM / timers. The game exposes its logic through the
    `globalThis.__game` shim at the end of that script (see the comment there:
    any new top-level symbol you want to test must be added to the shim).

    Usage:
        import { loadGame } from './harness.mjs';
        const G = loadGame({ seed: 1 });        // fresh, isolated world each call
        G.started = true; G.mode = 'drive';
        G.setKeys({ gas: true });
        G.step(2);                              // 2 s of simulation at 1/60 s steps
        console.log(G.car.speed, G.crook.state, G.dom('spd').textContent);

    Design notes
    - The harness never calls tick(). The script itself calls tick() once at load
      (started === false, so nothing simulates); the stubs let that first frame run
      through the transform/camera/render code without throwing.
    - performance.now() inside the game returns the harness clock, which only
      advances through G.step(...). doAction() timestamps (cuffT) and the crook
      timers therefore agree with the simulated time — runs are deterministic.
    - Math.random inside the game is a seeded PRNG (mulberry32) so building splits
      and respawn picks are reproducible for a given seed.
    - Timers (setTimeout/setInterval) never fire; requestAnimationFrame is a no-op.
      That keeps the process from hanging and keeps tick() from re-running.
    - Node built-ins only; no dependencies.
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INDEX_HTML = path.resolve(__dirname, '..', 'index.html');

/* ---------------------------------------------------------------- script extraction */
export function extractGameScript(html) {
  const m = html.match(/<script id="game">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('harness: <script id="game"> not found in index.html');
  return m[1];
}

/* ---------------------------------------------------------------- tiny real math */
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
  applyQuaternion(q) {
    const { x, y, z } = this, { x: qx, y: qy, z: qz, w: qw } = q;
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z,
          iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
  toArray() { return [this.x, this.y, this.z]; }
}
class Euler extends Vector3 { constructor() { super(); this.order = 'XYZ'; } }
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  identity() { return this.set(0, 0, 0, 1); }
  conjugate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  invert() { return this.conjugate(); }
  multiply(q) {
    const { x: ax, y: ay, z: az, w: aw } = this, { x: bx, y: by, z: bz, w: bw } = q;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  toArray() { return [this.x, this.y, this.z, this.w]; }
}
class Color {
  constructor(c = 0) { this.r = ((c >> 16) & 255) / 255; this.g = ((c >> 8) & 255) / 255; this.b = (c & 255) / 255; }
  set() { return this; } copy() { return this; }
}
class Clock {
  constructor() { this.running = true; this.elapsedTime = 0; }
  getDelta() { return 1 / 60; }
  getElapsedTime() { return this.elapsedTime; }
  start() {} stop() {}
}

/* ---------------------------------------------------------------- DOM stubs */
function makeClassList(el) {
  const s = new Set();
  return {
    _set: s,
    add(...c) { c.forEach(x => s.add(x)); el._className = [...s].join(' '); },
    remove(...c) { c.forEach(x => s.delete(x)); el._className = [...s].join(' '); },
    contains(c) { return s.has(c); },
    toggle(c, force) {
      const on = force === undefined ? !s.has(c) : !!force;
      if (on) s.add(c); else s.delete(c);
      el._className = [...s].join(' ');
      return on;
    },
  };
}
function makeCtx2d() {
  const t = { measureText: () => ({ width: 0 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) };
  return new Proxy(t, {
    get(o, p) { if (p in o) return o[p]; if (typeof p === 'symbol') return undefined; return () => {}; },
    set(o, p, v) { o[p] = v; return true; },
  });
}
export function makeElement(tag = 'div', id = '') {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(), id, textContent: '', innerHTML: '', value: '',
    style: {}, width: 0, height: 0, children: [],
    _className: '',
    get className() { return this._className; },
    set className(v) { this._className = v; this.classList._set.clear(); v.split(/\s+/).filter(Boolean).forEach(c => this.classList._set.add(c)); },
    listeners,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const l = listeners.get(type); if (l) listeners.set(type, l.filter(f => f !== fn)); },
    dispatch(type, ev = {}) {
      const e = Object.assign({ type, target: el, preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0, buttons: 0, pointerId: 1 }, ev);
      for (const fn of listeners.get(type) || []) fn(e);
      return e;
    },
    appendChild(c) { el.children.push(c); return c; },
    getContext() { return makeCtx2d(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    focus() {}, blur() {}, click() { el.dispatch('click'); },
    setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  el.classList = makeClassList(el);
  return el;
}

/* ---------------------------------------------------------------- THREE stub */
function makeThreeStub() {
  // Generic no-op scene object: every unknown THREE.X is this class. Instances carry
  // position/rotation/scale/quaternion with real math, common methods return `this`,
  // and any *unknown* method name resolves to a chainable no-op instead of throwing.
  const NOOP_METHODS = ['add', 'remove', 'lookAt', 'updateProjectionMatrix', 'updateMatrix', 'updateMatrixWorld',
    'setPixelRatio', 'setSize', 'render', 'rotateX', 'rotateY', 'rotateZ', 'translate', 'dispose', 'traverse',
    'setFromEuler', 'setFromAxisAngle', 'applyMatrix4', 'computeBoundingBox', 'computeBoundingSphere'];
  class Stub {
    constructor(...args) {
      this.args = args;
      this.position = new Vector3(); this.rotation = new Euler(); this.scale = new Vector3(1, 1, 1);
      this.quaternion = new Quaternion();
      this.visible = true; this.children = []; this.uuid = Math.random().toString(36).slice(2);
      return new Proxy(this, {
        get(o, p) {
          if (p in o) return o[p];
          if (typeof p === 'symbol' || p === 'then' || p === 'toJSON') return undefined;
          return () => o; // unknown method → chainable no-op
        },
      });
    }
    get domElement() { if (!this._dom) this._dom = makeElement('canvas'); return this._dom; }
    set domElement(v) { this._dom = v; }
    toArray() { return []; }
    invert() { return this; }
    applyQuaternion() { return this; }
    getDelta() { return 1 / 60; }
    set() { return this; } copy() { return this; } lerp() { return this; } clone() { return this; }
  }
  for (const m of NOOP_METHODS) Stub.prototype[m] = function () { return this; };
  Stub.prototype.add = function (...objs) { this.children.push(...objs); return this; };

  const REAL = { Vector3, Quaternion, Color, Clock, Euler };
  const CONSTS = { FrontSide: 0, BackSide: 1, DoubleSide: 2, NearestFilter: 1003, LinearFilter: 1006,
    PCFSoftShadowMap: 2, sRGBEncoding: 3001, REVISION: '128-stub' };
  return new Proxy({}, {
    get(_, p) {
      if (typeof p === 'symbol') return undefined;
      if (p in REAL) return REAL[p];
      if (p in CONSTS) return CONSTS[p];
      return Stub; // any other member: a constructible no-op class
    },
    has() { return true; },
  });
}

/* ---------------------------------------------------------------- PRNG */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- loadGame */
/**
 * Load a fresh, isolated instance of the game logic.
 * @param {object} [opts]
 * @param {number} [opts.seed=1]     seed for Math.random inside the game
 * @param {string} [opts.html]       index.html text (defaults to reading INDEX_HTML)
 * @param {number} [opts.innerWidth=390]  viewport stubs (phone-ish by default)
 * @param {number} [opts.innerHeight=844]
 * @returns the game's __game shim, extended with:
 *   step(seconds, dtPerStep=1/60)  advance the sim; returns number of steps run
 *   setKeys({left,right,gas,brake}) set desktop-key state (partial object OK)
 *   now()                          harness clock in ms (what performance.now() returns)
 *   dom(id)                        the stub element the game got from getElementById(id)
 *   fire(type, event)              dispatch a window-level event (keydown, keyup, blur …)
 *   evalInGame(code)               DEBUG AID: evaluate code inside the game's vm context
 *                                  (sees top-level let/const — for poking, not for tests;
 *                                  tests should use symbols exported through the shim)
 *   ctx                            the vm context object
 */
export function loadGame(opts = {}) {
  const { seed = 1, innerWidth = 390, innerHeight = 844 } = opts;
  const html = opts.html ?? fs.readFileSync(INDEX_HTML, 'utf8');
  const code = extractGameScript(html);

  const clock = { now: 0 };
  const elements = new Map();
  const getEl = (id) => { if (!elements.has(id)) elements.set(id, makeElement('div', id)); return elements.get(id); };
  const winListeners = new Map();
  let timerId = 0;
  const timers = new Map();

  const document = {
    body: makeElement('body'),
    documentElement: makeElement('html'),
    getElementById: getEl,
    createElement: (tag) => makeElement(tag),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    hidden: false, visibilityState: 'visible',
  };
  const sandbox = {
    console,
    THREE: makeThreeStub(),
    document,
    innerWidth, innerHeight, devicePixelRatio: 2,
    screen: { orientation: { angle: 0, type: 'portrait-primary', addEventListener() {} }, width: innerWidth, height: innerHeight },
    navigator: { userAgent: 'node-harness', maxTouchPoints: 0, vibrate() { return false; } },
    performance: { now: () => clock.now },
    localStorage: (() => { const m = new Map(); return {
      getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
      removeItem: k => m.delete(k), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; })(),
    addEventListener(type, fn) { if (!winListeners.has(type)) winListeners.set(type, []); winListeners.get(type).push(fn); },
    removeEventListener(type, fn) { const l = winListeners.get(type); if (l) winListeners.set(type, l.filter(f => f !== fn)); },
    requestAnimationFrame() { return ++timerId; },
    cancelAnimationFrame() {},
    setTimeout(fn, ms) { timers.set(++timerId, { fn, ms }); return timerId; },
    setInterval(fn, ms) { timers.set(++timerId, { fn, ms, repeat: true }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },
    location: { href: 'http://localhost/index.html', search: '', hash: '' },
    alert() {},
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  sandbox.__seededRandom = mulberry32(seed);
  vm.runInContext('Math.random = __seededRandom;', ctx);
  vm.runInContext(code, ctx, { filename: 'index.html#game' });

  const G = ctx.__game;
  if (!G || typeof G.simulate !== 'function') throw new Error('harness: globalThis.__game shim missing from index.html');

  const step = (seconds, dtPerStep = 1 / 60) => {
    const n = Math.max(1, Math.round(seconds / dtPerStep));
    for (let i = 0; i < n; i++) { clock.now += dtPerStep * 1000; G.simulate(dtPerStep, clock.now); }
    return n;
  };
  const setKeys = (k = {}) => { Object.assign(G.keys, k); return G.keys; };
  const fire = (type, ev = {}) => {
    const e = Object.assign({ type, preventDefault() {}, stopPropagation() {}, repeat: false, code: '' }, ev);
    for (const fn of winListeners.get(type) || []) fn(e);
    return e;
  };

  Object.assign(G, {
    step, setKeys, fire,
    now: () => clock.now,
    dom: getEl,
    evalInGame: (src) => vm.runInContext(src, ctx),
    ctx,
    timers,
  });
  return G;
}

/* ---------------------------------------------------------------- geometry helpers for tests */
/** distance from point (px,pz) to segment (ax,az)-(bx,bz) */
export function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
/** minimum distance from (px,pz) to the crook's remaining route: crook position → path[pi] → … → path[end] */
export function routeMinDist(G, px, pz) {
  const { crook, NODES } = G;
  if (!crook.path || crook.pi >= crook.path.length) return Infinity;
  let min = Infinity, ax = crook.x, az = crook.z;
  for (let i = crook.pi; i < crook.path.length; i++) {
    const n = NODES[crook.path[i]];
    min = Math.min(min, pointSegDist(px, pz, ax, az, n.x, n.z));
    ax = n.x; az = n.z;
  }
  return min;
}
