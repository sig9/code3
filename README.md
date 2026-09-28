# CODE 3 🚔

A police chase game. You're a cop. The crooks are **very smart.**

**Play it:** https://sig9.github.io/code3/

- 📱 Phone-first: tilt to steer (car *and* on foot), hold the right side to go
- 🔘 One button that morphs: EXIT · ENTER · CUFF · BOOK — plus TAZE on foot, SIREN in the car
- 👂 Crooks hear your engine and run — some places only feet can follow

Current build: **v0.4 "Academy"** — police academy (drive + foot drills, graduation, time trial),
art pass (faces, blue cop, beanie crook, road paint), crook names + dispatch radio, speech bubbles,
confetti, synthesized sound with a wailing siren, house rules, and install-to-home-screen (PWA).
No real phone has run v0.4 yet.

## How to play
1. **Start with the Academy.** A new badge has 🎓 ACADEMY picked on the start screen (tap 🚔 PATROL
   to skip it — patrol is never locked). Sgt. Whistle runs six drills on the real map: cone slalom,
   glowing-ring lap into the Precinct 3 bay, hop out, cuff the robber cutout (not Grandma!), taser
   range (stand on the white line; with thumbs he waits there until you hold GO), back to the
   cruiser. Graduate for a medal; **TRY AGAIN ↻** on the graduation card runs the lap again as a time
   trial, and afterwards the start button reads 🎓 TIME TRIAL. The line-up and taser hints count up
   (CUFF ROBBERS 1/3, ZAP HIM! 1/2).
2. **Patrol.** Dispatch radios the crook's name, then where he was last seen (his crime is on the
   booking card). Find him (tracker arrow), chase him on wheels
   and on foot, CUFF him, walk him to the car, drive to the station, stop in the bay, tap **BOOK**.
   Up to 3 stars per bust (cuff · par 45 s · no crashes); stars raise your rank.
3. The **DO THIS NOW** pill always says what to do next (Settings can turn it off).

**Desktop keys:** arrows/WASD drive & steer · SPACE = context action (exit/enter/cuff/book) ·
H = cuff/book · E = enter/exit · T = taser (on foot) · L = siren (in the car).
**Mobile:** tilt to steer (no tilt? slide your left thumb on the left half), hold the right side to
go (letting go coasts — there is no touch brake yet), the context button
(EXIT/ENTER/CUFF/BOOK), TAZE above it on foot, SIREN toggle above it in the car — never more than
three touchables in play.
**Badge #:** type your badge number on the start screen (or leave it blank for a new one). Each badge
keeps its own stars, rank and academy bests on that phone, so the kid, mom and dad can share one phone.
**Pause:** switching apps or opening ⚙ Settings pauses; tap to resume.
⚙ Settings → Reset career asks "Sure? Tap again" first, so one stray tap can't wipe the stars.
**URL shortcuts:** `?academy` preselects the Academy; `?drill=slalom|gates|lineup|taser` runs one drill
as a time trial.

## Sound
All sound is synthesized in the page (no files). It starts after your first tap (an iOS rule).
⚙ Settings → 🔊 Sound turns it off. On an iPhone the ring/silent switch wins — no sound? flip it.
The game is fully playable silent.

## House rules
⚙ Settings → House rules has one button per rule; tap to cycle. Saved on that phone. These are the
open design questions for the co-designer (see [SPEC.md](SPEC.md), v0.4 status). The buttons use
kid words:
- *Bumping him with the car costs:* nothing / paperwork / he runs faster (`ramCost`)
- *Escape clock waits after he gets in:* no wait / 2 sec / 4 sec (`enterGraceS`)
- *How slow to tap BOOK?:* slow / stopped / rolling (`bookMaxMv`)
- *Clock restarts if he wiggles free:* no / yes (`parFromSlip`)
- *No wiggling free near a subway:* yes / no (`slipSubwayBan`)
- *Stars for graduating:* 0 ★ / 1 ★ / 3 ★ (`gradStars`)

The first value is the default.

## Install to the home screen (PWA)
- **iPhone (Safari):** Share → Add to Home Screen. **Android (Chrome):** menu → Install app.
- It opens fullscreen and plays offline after the first visit. The service worker registers on
  `*.github.io` over https, or anywhere with `?sw=1` (plain localhost and https playtest tunnels
  don't get it). **Stuck on an old build?** Open the page with `?sw=0`: it removes the service worker
  and its `code3-*` caches and doesn't register again.
- **Updates:** the page is fetched network-first, so a new build shows on the next launch when
  online — if it doesn't, reload twice. Each release bumps `CACHE` in `sw.js` (now `code3-v0.4.0`)
  to match the version in the page credit.
- **iOS note:** the home-screen app keeps its own storage, separate from Safari — badges and stars
  don't carry over between them.

## Develop
Everything is one self-contained `index.html` (Three.js r128 from cdnjs). Serve the folder over
http(s) — e.g. `python3 -m http.server` — and open it; phones need https for tilt on iOS.

```bash
node --test test/*.test.mjs                               # the full Node harness (~20 s)
node test/e2e/smoke.mjs --width 390 [--academy]           # headless-Chrome smoke: errors, HUD overlaps,
                                                          # touchables, draw calls (360 | 390 | 412;
                                                          # --height for landscape); exit 3 = audit failed
```
Always pass the glob: the bare directory form finds no tests on Node 24.

`tilt-academy.html` is the tilt-steering test range with the cross-phone sensor
debug panel.

Design doc: [SPEC.md](SPEC.md)
