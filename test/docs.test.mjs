/*  test/docs.test.mjs — v0.4 docs stage: the version strings and SPEC stay in step with the code.
    Static reads only (no vm). Passes whether or not the PWA side lane (sw.js) is present. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const SPEC = readFileSync(join(ROOT, 'SPEC.md'), 'utf8');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const credit = (HTML.match(/<div id="credit">([^<]*)<\/div>/) || [])[1] || '';
const rulesDef = (HTML.match(/const RULES_DEF=\{([^}]*)\}/) || [])[1] || '';
const RULE_KEYS = [...rulesDef.matchAll(/(\w+):/g)].map(m => m[1]);

test('D1 #credit names the v0.4 release', () => {
  assert.match(credit, /v0\.4/);
  assert.equal(credit, 'code 3 · academy · prototype v0.4');
});
test('D2 the start-screen subtitle carries the same version as #credit', () => {
  const sub = (HTML.match(/<p class="sub">([^<]*)<\/p>/) || [])[1] || '';
  assert.match(sub, /v0\.4/);
});
test('D3 sw.js (when present): CACHE names the same release as #credit', () => {
  const p = join(ROOT, 'sw.js');
  if (!existsSync(p)) return;                                   // side lane not merged yet: nothing to tie
  const cache = (readFileSync(p, 'utf8').match(/const CACHE\s*=\s*'([^']+)'/) || [])[1] || '';
  assert.match(cache, /v0\.4/, `CACHE '${cache}' must name v0.4`);
});
test('D4 SPEC.md has the v0.4 status section, above v0.3, and names every RULES key', () => {
  assert.ok(RULE_KEYS.length >= 6, 'RULES_DEF parsed');
  const v4 = SPEC.indexOf('## Status (2026-09-27) — v0.4'), v3 = SPEC.indexOf('## Status (2026-09-01) — v0.3');
  assert.ok(v4 > 0 && v3 > v4, 'v0.4 status sits above the v0.3 status');
  const sec = SPEC.slice(v4, v3);
  for (const k of RULE_KEYS) assert.ok(sec.includes(k), `SPEC v0.4 section names RULES.${k}`);
  assert.match(sec, /no real phone/i, 'states plainly that no real phone has run v0.4');
});
test('D5 SPEC keeps its history (v0.3, v0.2 statuses and playtests #1-#3)', () => {
  for (const h of ['## Status (2026-09-01) — v0.3', '## Status (2026-08-26) — v0.2', '## Playtest #1', '## Playtest #2', '## Playtest #3'])
    assert.ok(SPEC.includes(h), h);
  assert.ok(SPEC.indexOf('## Playtest #3') > SPEC.indexOf('## Playtest #2'));
});
test('D6 SPEC v0.4 names every event on the bus', () => {
  const sec = SPEC.slice(SPEC.indexOf('## Status (2026-09-27) — v0.4'), SPEC.indexOf('## Status (2026-09-01) — v0.3'));
  const events = [...new Set([...HTML.matchAll(/\bemit\('(\w+)'/g)].map(m => m[1]))];
  assert.ok(events.length > 10);
  for (const e of events) assert.ok(sec.includes('`' + e + '`'), `SPEC names event ${e}`);
});
test('D7 README: v0.4 build line and the right test command', () => {
  assert.match(README, /v0\.4/);
  assert.ok(README.includes('node --test test/*.test.mjs'));
  assert.ok(!/node --test test\/(\s|$|`)/.test(README), 'never the bare `node --test test/` form');
});
