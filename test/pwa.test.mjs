/*  test/pwa.test.mjs — v0.4 PWA side lane: manifest, icons, service worker, <head> wiring.

    Static checks run everywhere (Node built-ins only). The headless-Chrome checks (SW activation, manifest
    parse, offline play, network-first HTML, iOS Add-to-Home-Screen hint) need Google Chrome and network
    access to cdnjs (the SW precaches three.js); they skip themselves when either is missing, or when
    CODE3_SKIP_CHROME=1. Chrome runs against a throwaway copy of the tree, is always killed, and every
    step has a hard timeout.
*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is a PNG`);
  assert.equal(b.toString('latin1', 12, 16), 'IHDR', `${file} starts with IHDR`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/* ------------------------------------------------------------------ static checks */
test('PWA: manifest parses with the required fields (relative URLs, fullscreen, icons)', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'CODE 3');
  assert.equal(m.short_name, 'CODE 3');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'fullscreen');
  assert.equal(m.orientation, 'any');
  assert.equal(m.background_color, '#0b1017');
  assert.equal(m.theme_color, '#1f5fd6');
  const bySize = s => m.icons.filter(i => i.sizes === s);
  assert.ok(bySize('192x192').some(i => (i.purpose || 'any').includes('any')), '192 any icon');
  assert.ok(bySize('512x512').some(i => (i.purpose || 'any').includes('any')), '512 any icon');
  assert.ok(bySize('512x512').some(i => i.purpose === 'maskable'), '512 maskable icon');
  for (const i of m.icons) {
    assert.ok(!/^\/|^[a-z]+:/i.test(i.src), `icon src is relative (site lives at /code3/): ${i.src}`);
    assert.equal(i.type, 'image/png');
  }
});

test('PWA: every icon exists with its declared pixel size (PNG IHDR)', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  const icons = [...m.icons.map(i => [i.src, +i.sizes.split('x')[0]]), ['icons/icon-180.png', 180]];
  for (const [src, n] of icons) {
    const f = path.join(ROOT, src);
    assert.ok(fs.existsSync(f), `${src} exists`);
    assert.deepEqual(pngSize(f), [n, n], `${src} is ${n}x${n}`);
  }
});

test('PWA: sw.js — versioned cache, every local precache entry exists, three.js via CORS', () => {
  const sw = read('sw.js');
  const cache = sw.match(/const CACHE\s*=\s*'([^']+)'/);
  assert.ok(cache, 'const CACHE = ...');
  assert.match(cache[1], /^code3-v0\.4/, 'CACHE names the v0.4 release (docs stage ties it to #credit)');
  const list = sw.match(/const PRECACHE\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(list, 'PRECACHE list');
  const entries = [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const need of ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png',
    './icons/icon-512.png', './icons/icon-maskable-512.png']) assert.ok(entries.includes(need), `precache ${need}`);
  for (const e of entries) {
    const f = path.join(ROOT, e === './' ? 'index.html' : e);
    assert.ok(fs.existsSync(f), `precache entry on disk: ${e}`);
  }
  assert.ok(sw.includes(THREE_URL), 'three.js r128 URL in sw.js');
  assert.match(sw, /new Request\(THREE_URL,\s*\{\s*mode:\s*'cors'\s*\}\)/, 'three.js precached as a CORS request');
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(sw, /startsWith\('code3-'\)/, 'activate deletes old code3-* caches');
});

test('PWA: index.html links the manifest + apple-touch-icon, three.js is crossorigin, still one game script', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(head, /<link rel="apple-touch-icon" href="icons\/icon-180\.png">/);
  assert.match(head, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(head, /<meta name="theme-color" content="#0b1017">/);
  assert.equal((html.match(/<script id="pwa">/g) || []).length, 1);
  assert.match(html, /<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js" crossorigin="anonymous"><\/script>/);
  assert.equal((html.match(/<script id="game">/g) || []).length, 1, 'exactly one <script id="game">');
  const srcs = html.match(/<script[^>]*\ssrc=[^>]*>/g) || [];
  assert.deepEqual(srcs.filter(t => !/src="https:\/\//.test(t)), [], 'no local <script src>');
  // the SW registers only on the real site (https + *.github.io) or with an explicit ?sw=1 on any origin,
  // so dev servers and https playtest tunnels never get a sticky SW; ?sw=0 is the kill switch
  // (behaviour per origin is exercised in test/round3.test.mjs, P3)
  const pwa = html.match(/<script id="pwa">([\s\S]*?)<\/script>/)[1];
  assert.match(pwa, /location\.protocol==='https:'/);
  assert.match(pwa, /github\\\.io\$/);
  assert.match(pwa, /sw=1/);
  assert.match(pwa, /sw=0/);
  assert.match(pwa, /unregister\(\)/);
});

/* ------------------------------------------------------------------ headless Chrome */
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(t) {
  // throwaway copy of the served files, with a marker comment we can change later
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c3pwa-site-'));
  for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'tilt-academy.html']) {
    if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.cpSync(path.join(ROOT, 'icons'), path.join(dir, 'icons'), { recursive: true });
  const idx = path.join(dir, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<head>', '<head>\n<!--pwa-marker:A-->'));

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const S = { offline: false, dir };
  const server = http.createServer((req, res) => {
    if (S.offline) { req.socket.destroy(); return; }
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, u === '/' ? 'index.html' : u);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, r));
  S.port = server.address().port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'c3pwa-chrome-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--mute-audio', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  S.close = () => {
    try { chrome.kill('SIGKILL'); } catch {}
    try { server.closeAllConnections(); server.close(); } catch {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  t.after(S.close);

  let target = null, dbg = 0;
  for (let i = 0; i < 150 && !target; i++) {
    await sleep(100);
    if (!dbg) { try { dbg = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} if (!dbg) continue; }
    try { target = (await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json()).find(x => x.type === 'page'); } catch {}
  }
  assert.ok(target, 'Chrome DevTools reachable');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  S.exceptions = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails; S.exceptions.push(((d.exception && d.exception.description) || d.text).slice(0, 300));
    }
    for (const f of listeners.slice()) f(m);
  };
  S.send = (method, params = {}) => new Promise((r, j) => {
    const i = ++id; pending.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); j(new Error('CDP timeout: ' + method)); } }, 20000).unref();
  });
  S.eval = async expr => {
    const r = await S.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
    return r.result.value;
  };
  const loaded = () => new Promise(r => {
    const f = m => { if (m.method === 'Page.loadEventFired') { listeners.splice(listeners.indexOf(f), 1); r(true); } };
    listeners.push(f); setTimeout(() => { const k = listeners.indexOf(f); if (k >= 0) listeners.splice(k, 1); r(false); }, 15000).unref();
  });
  S.goto = async url => { const l = loaded(); await S.send('Page.navigate', { url }); return l; };
  S.reload = async () => { const l = loaded(); await S.send('Page.reload', { ignoreCache: false }); return l; };
  S.clickSel = async css => {
    const b = await S.eval(`(()=>{const e=document.querySelector(${JSON.stringify(css)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width}})()`);
    if (!b || !b.w) return false;
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
      await S.send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    return true;
  };
  await S.send('Runtime.enable'); await S.send('Page.enable'); await S.send('Network.enable');
  return S;
}

async function chromeSkipReason() {
  if (process.env.CODE3_SKIP_CHROME === '1') return 'CODE3_SKIP_CHROME=1';
  if (!fs.existsSync(CHROME)) return 'Google Chrome not found (set CHROME=...)';
  return null;
}

test('PWA (Chrome): SW activates, manifest has no errors, plays offline, HTML is network-first', { timeout: 110000 }, async t => {
  const why = await chromeSkipReason(); if (why) return t.skip(why);
  const S = await launch(t);
  await S.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const url = `http://localhost:${S.port}/?sw=1`;
  assert.ok(await S.goto(url), 'first load');
  if (!(await S.eval('!!window.THREE'))) return t.skip('three.js CDN unreachable from Chrome (the SW precaches it)');

  // 1. the SW installs (precache incl. three.js over CORS) and reaches 'activated'
  let state = '';
  for (let i = 0; i < 60 && state !== 'activated'; i++) {
    state = await S.eval(`navigator.serviceWorker.getRegistration().then(r => r && r.active ? r.active.state : (r && (r.installing||r.waiting) ? 'pending' : 'none'))`);
    if (state !== 'activated') await sleep(250);
  }
  assert.equal(state, 'activated', 'service worker activated');
  const cached = await S.eval(`caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.keys()).then(r => [n, r.map(q => q.url)]))))`);
  assert.equal(cached.length, 1);
  assert.match(cached[0][0], /^code3-v0\.4/);
  assert.ok(cached[0][1].includes(THREE_URL), 'three.js precached');

  // 2. manifest parses with no errors
  const man = await S.send('Page.getAppManifest');
  assert.deepEqual(man.errors, [], 'Page.getAppManifest reports no errors');
  assert.match(man.url, /manifest\.webmanifest$/);

  // controlled after a reload (clients.claim covers the first page too, but reload makes it certain)
  assert.ok(await S.reload());
  assert.equal(await S.eval('!!navigator.serviceWorker.controller'), true, 'page is controlled by the SW');

  // 3. offline: kill the server and emulate offline, reload, three.js comes from cache, the game starts
  S.offline = true;
  await S.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  S.exceptions.length = 0;
  assert.ok(await S.reload(), 'offline reload fires load');
  assert.equal(await S.eval(`window.THREE && THREE.REVISION`), '128', 'THREE r128 loaded offline');
  assert.equal(await S.eval(`document.head.innerHTML.includes('pwa-marker:A')`), true);
  assert.ok(await S.clickSel('#alt'), '#alt clickable offline');
  await sleep(1500);
  assert.equal(await S.eval(`getComputedStyle(document.getElementById('overlay')).display`), 'none', 'game started offline');
  assert.deepEqual(S.exceptions, [], '0 exceptions offline');

  // 4. back online: a new build is served on reload (network-first HTML, never stuck on a stale build)
  S.offline = false;
  await S.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const idx = path.join(S.dir, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('pwa-marker:A', 'pwa-marker:B'));
  assert.ok(await S.reload()); assert.ok(await S.reload());
  assert.equal(await S.eval(`document.head.innerHTML.includes('pwa-marker:B')`), true, 'new marker served after reload');
  const fresh = await S.eval(`caches.open(${JSON.stringify(cached[0][0])}).then(c => c.match('./')).then(r => r && r.text()).then(t => !!t && t.includes('pwa-marker:B'))`);
  assert.equal(fresh, true, 'cache refreshed with the new build');
  // offline again: the newest build (not the install-time copy) is what the cache serves
  S.offline = true;
  await S.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  assert.ok(await S.reload());
  assert.equal(await S.eval(`document.head.innerHTML.includes('pwa-marker:B')`), true, 'offline serves the newest cached build');
  assert.deepEqual(S.exceptions, [], '0 exceptions');
});

test('PWA (Chrome): Add-to-Home-Screen hint only on iOS Safari, clear of #bigStart at 360 px', { timeout: 60000 }, async t => {
  if (process.env.CODE3_SKIP_CHROME === '1') return t.skip('CODE3_SKIP_CHROME=1');
  if (!fs.existsSync(CHROME)) return t.skip('Google Chrome not found');
  const S = await launch(t);
  await S.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 3, mobile: true });
  const url = `http://localhost:${S.port}/`;
  S.offline = false;
  await S.goto(url);
  assert.equal(await S.eval(`!!document.getElementById('a2hs')`), false, 'no hint on a non-iOS UA');
  const sh0 = await S.eval(`document.getElementById('overlay').scrollHeight`); // start-screen height without the hint
  await S.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });
  await S.goto(url);
  const r = await S.eval(`(()=>{const a=document.getElementById('a2hs'),b=document.getElementById('bigStart');if(!a)return null;
    const A=a.getBoundingClientRect(),B=b.getBoundingClientRect();
    const X=a.querySelector('button').getBoundingClientRect(),O=document.getElementById('overlay');
    const L=document.getElementById('alt').getBoundingClientRect();
    return {text:a.textContent,inOverlay:a.parentNode.id,ov:!(A.right<=B.left||A.left>=B.right||A.bottom<=B.top||A.top>=B.bottom),w:A.width,right:A.right,vw:innerWidth,
      startBottom:Math.max(B.bottom,L.bottom),
      h:A.height,bw:X.width,bh:X.height,sh:O.scrollHeight,vh:innerHeight}})()`);
  assert.ok(r, 'hint present on iPhone Safari');
  assert.match(r.text, /Share → Add to Home Screen/);
  assert.ok(r.h < 45, `hint stays one line at 360 (h=${r.h})`);
  assert.ok(r.bw >= 40 && r.bh >= 40, `close button is finger-sized (${r.bw}x${r.bh})`);
  // v0.4 main lane (Academy/mode row) already makes the 360x780 start screen scroll a little without the hint;
  // the hint may add only its own one line (+ margin), and START / the alt start stay above the fold.
  assert.ok(r.sh <= sh0 + r.h + 12, `hint adds only its own line (scrollHeight ${sh0} -> ${r.sh}, hint h ${r.h})`);
  assert.ok(r.startBottom <= r.vh, `#bigStart and #alt stay above the fold with the hint (bottom ${r.startBottom}, vh ${r.vh})`);
  assert.equal(r.inOverlay, 'overlay');
  assert.equal(r.ov, false, 'hint does not overlap #bigStart');
  assert.ok(r.w > 0 && r.right <= r.vw, 'hint fits the 360 px screen');
  // Chrome/Firefox/Edge on iOS: their Share menus differ (and pre-16.4 can't add), so no hint
  await S.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA.replace('Version/', 'CriOS/126.0 Version/'), platform: 'iPhone' });
  await S.goto(url);
  assert.equal(await S.eval(`!!document.getElementById('a2hs')`), false, 'no hint in CriOS');
  await S.send('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA, platform: 'iPhone' });
  await S.goto(url);
  // dismissible, and stays dismissed
  assert.ok(await S.clickSel('#a2hs button'));
  await sleep(100);
  assert.equal(await S.eval(`!!document.getElementById('a2hs')`), false, 'hint dismissed');
  assert.equal(await S.eval(`getComputedStyle(document.getElementById('overlay')).display`), 'flex', 'dismiss did not start the game');
  await S.goto(url);
  assert.equal(await S.eval(`!!document.getElementById('a2hs')`), false, 'dismissal remembered');
  assert.deepEqual(S.exceptions, [], '0 exceptions');
});
