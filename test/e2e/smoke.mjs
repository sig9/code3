#!/usr/bin/env node
/*  test/e2e/smoke.mjs — headless-Chrome smoke run for CODE 3 (Node 24, built-ins only, no deps).

    DRAW-CALL BASELINE  B = 33  (v0.3 patrol start view, renderer.info.render.calls ~2 s after clicking
    #alt: 33 at 360x780 and 390x844, 32 at 412x915 — frustum culling, so it depends on the view; measured
    on unmodified v0.3 50988d6 with only `renderer` added to the shim). Budgets: patrol <= B at the end
    of art-juice, academy <= B+25. No overlap is allowed any more (the v0.3 #meter/#bAct and #mlab/#golab pairs
    were re-laid out in v0.4). By design only: #actRing is the pulse ring drawn around #bAct (pointer-events:none),
    and DOM containment (#hudL holds #score and #acad) is not a collision — see BY_DESIGN / badOverlaps.

    Usage (from anywhere):
      perl -e 'alarm 90; exec @ARGV' -- node test/e2e/smoke.mjs [--width 360|390|412] [--academy]
            [--steps '<js expression or async body evaluated in the page>'] [--out <dir>] [--dir <tree>]
            [--wait 2000]

      --width    360 → 360x780, 390 → 390x844 (default), 412 → 412x915; always mobile:true, DPR 3
      --height   override the height: short landscape checks, e.g. --width 844 --height 340, --width 667 --height 375
      --academy  after the start, calls __game.startAcademy() if it exists (stage 2 onward); without it the run
                 clicks #segPatrol before #alt (a fresh profile preselects the academy)
      --steps    JS run in the page after the start + wait. Wrapped as `(async()=>{ <steps> })()`
                 when it contains `return` or `await`, else evaluated as an expression. Its
                 JSON-able result lands in report.steps. Throwing is reported in report.errors.
      --out      directory for smoke-<width>.png and smoke-<width>.json (default: none → no files,
                 JSON to stdout only)
      --dir      tree to serve (default: the repo this file lives in) — side-lane worktrees pass theirs
      --wait     ms to wait after clicking #alt (default 2000)

    What it does: serves the tree over node:http on a free 127.0.0.1 port, launches headless Chrome
    (--remote-debugging-port=0, port read from DevToolsActivePort in a throwaway profile: parallel-safe),
    opens index.html at the phone viewport, clicks #alt (touch/keys start), waits, runs --steps,
    and prints a JSON report:
      exceptions[], errors[] (console.error + log errors), notFound[] (404s),
      fixed[]      {sel, x, y, w, h} for every VISIBLE position:fixed element (canvas excluded)
      overlaps[]   [selA, selB, area] for every intersecting pair of those rects
      badOverlaps[] overlaps minus BY_DESIGN pairs and DOM containment — must be [] (exit 3 otherwise)
      touchables[] selectors of visible in-play touch targets: 'GO(right half)' (started, not paused) + every
                   visible button/[data-touch] with pointer-events, not covered at its centre (elementFromPoint),
                   outside #overlay/#settings/#pause and not #gear / #cardGo / #cardAgain (off-play).
                   touchCount = touchables.length (budget <= 3)
      hscroll      true if the page scrolls horizontally; wideFixed[] fixed elements whose content overflows x
      drawCalls    __game.renderer.info.render.calls (null if the shim lacks renderer)
      paused       __game.paused at the end (null if absent)
      steps        --steps result;  shot  screenshot path (with --out)
    Hard 60 s timeout (exit 2). Chrome and the server are always killed. Exit 0 = ran clean; exit 3 = ran but the
    audit failed (badOverlaps non-empty, touchCount > 3, an exception, or horizontal scroll) — the JSON says which.
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v !== undefined && !v.startsWith('--')) { args[k] = v; i++; } else args[k] = '1';
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(args.dir || path.join(HERE, '..', '..'));
const W = +(args.width || 390), H = +args.height || { 360: 780, 390: 844, 412: 915 }[W] || 844, DPR = 3;
const WAIT = +(args.wait || 2000);
const OUT = args.out ? path.resolve(args.out) : null;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TIMEOUT = 60000;

const report = { url: '', viewport: `${W}x${H}@${DPR}`, academy: !!args.academy, exceptions: [], errors: [], notFound: [],
  fixed: [], overlaps: [], badOverlaps: [], touchables: [], touchCount: 0, hscroll: false, wideFixed: [], drawCalls: null, paused: null, steps: undefined, shot: null };
let chrome = null, server = null, profile = null, done = false;
function finish(code) {
  if (done) return; done = true;
  try { chrome && chrome.kill('SIGKILL'); } catch {}
  try { server && server.close(); server && server.closeAllConnections && server.closeAllConnections(); } catch {}
  try { profile && fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  const txt = JSON.stringify(report, null, 2);
  if (OUT) { try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `smoke-${W}.json`), txt); } catch {} }
  process.stdout.write(txt + '\n');
  process.exit(code);
}
setTimeout(() => { report.errors.push(`TIMEOUT after ${TIMEOUT / 1000}s`); finish(2); }, TIMEOUT).unref();
process.on('uncaughtException', e => { report.errors.push('harness crash: ' + (e.stack || e)); finish(1); });
process.on('unhandledRejection', e => { report.errors.push('harness crash: ' + (e && e.stack || e)); finish(1); });
for (const s of ['SIGTERM', 'SIGINT', 'SIGALRM', 'SIGHUP']) process.on(s, () => { report.errors.push('killed by ' + s); finish(2); });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };
server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(DIR, u === '/' ? 'index.html' : u);
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { report.notFound.push(u); res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
report.url = `http://127.0.0.1:${server.address().port}/index.html`;

profile = fs.mkdtempSync(path.join(os.tmpdir(), 'c3smoke-'));
chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });

let target = null, dbgPort = 0;
for (let i = 0; i < 150 && !target; i++) {
  await new Promise(r => setTimeout(r, 100));
  if (!dbgPort) { try { dbgPort = +fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch {} if (!dbgPort) continue; }
  try { const list = await (await fetch(`http://127.0.0.1:${dbgPort}/json/list`)).json(); target = list.find(t => t.type === 'page'); } catch {}
}
if (!target) { report.errors.push('could not reach Chrome DevTools'); finish(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0; const pending = new Map(); const waiters = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { r, j } = pending.get(m.id); pending.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); return; }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    report.errors.push('console.error: ' + m.params.args.map(a => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ').slice(0, 400));
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails; report.exceptions.push(((d.exception && d.exception.description) || d.text).slice(0, 600));
  } else if (m.method === 'Log.entryAdded') {
    const e = m.params.entry; if (e.level === 'error') report.errors.push(`log.${e.source}: ${e.text}`.slice(0, 400));
  }
  for (const w of waiters.splice(0)) w(m);
};
const send = (method, params = {}) => new Promise((r, j) => { const id = ++msgId; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params })); });
const wait = ms => new Promise(r => setTimeout(r, ms));
async function evalPage(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text));
  return r.result.value;
}
async function clickSel(css) {
  const r = await evalPage(`(()=>{const e=document.querySelector(${JSON.stringify(css)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,w:b.width};})()`);
  if (!r || !r.w) return false;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
}

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true });
try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}   // a headless page never "blurs"
const loaded = new Promise(r => { const f = m => (m.method === 'Page.loadEventFired' ? r() : waiters.push(f)); waiters.push(f); });
await send('Page.navigate', { url: report.url });
await Promise.race([loaded, wait(15000)]);
await wait(300);

/* v0.4 stage 2: a fresh profile preselects ACADEMY on the start screen — a patrol run picks the PATROL segment first */
if (!args.academy && !(await clickSel('#segPatrol'))) report.errors.push('#segPatrol not found/visible (pre-stage-2 tree?)');
if (!(await clickSel('#alt'))) report.errors.push('#alt not found/visible');
await wait(150);
if (args.academy) {
  try { report.academyStarted = await evalPage('!!(globalThis.__game&&__game.startAcademy&&(__game.startAcademy(),true))'); }
  catch (e) { report.errors.push('academy start: ' + e.message); }
}
await wait(WAIT);

if (args.steps) {
  const s = args.steps, body = /\breturn\b|\bawait\b/.test(s) ? `(async()=>{${s}\n})()` : `(${s})`;
  try { report.steps = await evalPage(body); } catch (e) { report.errors.push('steps: ' + e.message); }
  await wait(200);
}

const measure = await evalPage(`(()=>{
  const sel=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+(e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\\s+/).join('.'):'');
  const vis=e=>{ if(!e.isConnected)return false; for(let p=e;p&&p.nodeType===1;p=p.parentElement){const cs=getComputedStyle(p);
      if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity<0.05)return false;} const b=e.getBoundingClientRect(); return b.width>0&&b.height>0; };
  const fixed=[], wideFixed=[];
  for(const e of document.querySelectorAll('body *')){
    if(e.tagName==='CANVAS'||e.tagName==='SCRIPT')continue;
    if(getComputedStyle(e).position!=='fixed'||!vis(e))continue;
    const b=e.getBoundingClientRect(); fixed.push({sel:sel(e),x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)});
    if(e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflowX!=='hidden')wideFixed.push(sel(e));
    if(b.left<-1||b.right>innerWidth+1)wideFixed.push(sel(e)+' (off-screen x)');
  }
  const overlaps=[], badOverlaps=[], BY_DESIGN=[['#actRing','#bAct']];
  const el=s=>{try{return document.querySelector(s);}catch(e){return null;}};
  for(let i=0;i<fixed.length;i++)for(let j=i+1;j<fixed.length;j++){const a=fixed[i],c=fixed[j];
    const w=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x), h=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y);
    if(!(w>0&&h>0))continue;
    overlaps.push([a.sel,c.sel,w*h]);
    const ea=el(a.sel), ec=el(c.sel), contain=ea&&ec&&(ea.contains(ec)||ec.contains(ea));
    if(!contain&&!BY_DESIGN.some(([p,q])=>(p===a.sel&&q===c.sel)||(p===c.sel&&q===a.sel)))badOverlaps.push([a.sel,c.sel,w*h]);}
  const offPlay=e=>e.closest('#overlay,#settings,#pause')||e.id==='gear'||e.id==='cardGo'||e.id==='cardAgain';   // #cardGo / #cardAgain: off-play (the grad/trial card)
  const touchables=[];
  const G=globalThis.__game, playing=!!(G&&G.started)&&!(G&&G.paused);
  if(playing)touchables.push('GO(right half)');
  for(const e of document.querySelectorAll('button,[data-touch]')){
    if(offPlay(e)||!vis(e))continue; if(getComputedStyle(e).pointerEvents==='none')continue;
    const b=e.getBoundingClientRect(), hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
    if(!hit||!(hit===e||e.contains(hit)))continue;            // covered (the pause veil, a card): not tappable
    touchables.push(sel(e));
  }
  const se=document.scrollingElement||document.documentElement;
  let dc=null; try{dc=G&&G.renderer?G.renderer.info.render.calls:null;}catch(e){}
  return {fixed,overlaps,badOverlaps,touchables,touchCount:touchables.length,hscroll:se.scrollWidth>innerWidth+1,wideFixed,drawCalls:dc,
    paused:G&&'paused' in G?G.paused:null};
})()`);
Object.assign(report, measure);

if (OUT) {
  try { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(OUT, { recursive: true });
    report.shot = path.join(OUT, `smoke-${W}.png`); fs.writeFileSync(report.shot, Buffer.from(r.data, 'base64')); }
  catch (e) { report.errors.push('screenshot: ' + e.message); }
}
finish(report.badOverlaps.length || report.touchCount > 3 || report.exceptions.length || report.hscroll ? 3 : 0);
