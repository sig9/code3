# CODE 3 — Police Chase Game (Design Spec, draft)

Transferred from claude.ai chat session, 2026-08-23. Specs-first project:
capture design here, code later.

## Premise
You're a police officer apprehending bad people and taking them to jail — but the bad
people are **very smart**. That's the whole hook: most cop games have dumb crooks; this
game is an arms race against criminals who react, deceive, and learn.

3D, web-based (Three.js), phone-first, shareable by link with friends.

## Controls (letter-key scheme)
- **Space** — get out of the car (instant dismount from bike).
- **H** — handcuff.
- **S** — siren: clears traffic so you drive faster, but smart crooks hear it and
  scatter/hide before you arrive. Every chase is a speed-vs-stealth choice.
- **T** — taser (see below).
- One button sends the dog partner to hold a crook.

## Core loop
Chase → close distance → dismount (Space) → foot pursuit → cuff (H) → **jail run**:
after the cuff you still have to drive them in. Buddies can ambush the car; the crook
slips the cuffs if you take too long. Book this guy now, or keep hunting and risk it?

One chase = 1–3 minutes. Short sessions are the target pacing (mobile-first).

## Smart-crook AI
The whole system runs on **hearing**: sirens and engines trigger a flee radius.
- **Blend in**: a crook ditches his jacket and walks casually into a crowd. Cuff the
  wrong person and you lose points — reading behavior, not chasing an arrow.
- **Learn**: catch one guy by cutting through an alley and the next one blocks that
  alley or posts a lookout.
- Counter the bike by fleeing into parks/alleys where cars can't follow.
- Juke sideways when they hear the taser click.
- Stamina bar (mirrored by the cop's pedal stamina on bike).

## Vehicle rock-paper-scissors
| Mode | Speed | Noise | Access |
|------|-------|-------|--------|
| Car  | fastest | loudest (siren/engine trigger flee radius) | roads only |
| Bike | medium | **silent** — roll up close before the crook notices | alleys, parks, plazas, stairs |
| Foot | slowest | quiet | everywhere; **only way to cuff** |

Bike details: instant dismount (Space); bell instead of siren (scatters pedestrians,
tiny alert radius); pedal stamina bar; tilt steering = leaning.
**Map requirement:** the city needs bike-only gaps (bollards, alleys, park paths) or the
bike has no reason to exist. Smart crooks fleeing into them forces the bike into play.

## Taser (T)
- Window-maker, not a win button: hits from ~8m, crook freezes/wobbles 3 seconds,
  you still must run up and press H.
- Limited charges. A miss gives the crook a scared speed burst — aim-and-timing decision.

## Escort mode — armored truck
Protect a money truck to its destination. Design rule: **player is the bodyguard, not
the babysitter** (escort missions are famously hated; this avoids it).
- You drive an **escort car**, not the truck. Circle it, fall back, speed ahead to scout.
  Truck driver obeys simple radio commands — speed up, stop, detour — so it never feels dumb.
- **Route planning** on a map before the mission. Robbers study patterns: reuse a route
  and there's an ambush waiting. Bridges/tunnels are fast but risky choke points.
- **Smart robbery tactics**: fake construction zones, robbers dressed as road workers,
  staged crashes, decoy attacks that pull you away before the real crew hits. Decide
  what's bait.
- **Damage matters**: truck tires shot out → it limps; robbers latched on the back
  doors start a timer — knock them off before they crack it open.
- **Bonus mode**: decoy truck. Two trucks leave, one has the money — but the crooks
  might have an inside man who knows which.

### Randomization (every run different, fair not chaotic)
- **Deck of ambush cards** (fake roadblock, motorcycle swarm, staged crash, decoy
  attack, robbers disguised as cops). Each run the game shuffles and secretly draws
  1–2; players learn to recognize each card's opening tells.
- **Pre-placed ambush spots** along every route (tunnel, bridge, warehouse row); only
  a couple activate per run, chosen randomly. Map stays familiar, danger moves.
- **Director AI** (Left 4 Dead style): doing great → nastier card; struggling → eases
  up. Every run tense but winnable.
- **Route memory**: frequently-used routes accrue higher ambush chance — the robbers
  "studied" you. The weird backroad might cruise through untouched.

## Co-op — DEFERRED (decided 2026-08-23: single-player for now)
Two-player split: one drives, the other jumps out to cuff (or in escort mode: one
drives, the other leans out to shoot / watches the map for threats). Great hook for
two players at home. Online co-op is the only thing that would ever need a backend.

### Two-player on mobile — three tiers (build in this order)
Key insight: the roles are **asymmetric by design** (driver vs cuffer/gunner), and
asymmetric co-op is far cheaper to network than symmetric — the two players don't
need identical synced views. (Jackbox / Spaceteam / Artemis model.)

1. **Phones as controllers, shared screen (Jackbox model)** — laptop/TV browser runs
   the game; each phone opens a link and becomes a controller (one = tilt wheel,
   other = cuff/taser buttons + minimap). Phones send inputs only — tiny messages,
   latency-forgiving, one camera so no split-screen problem. Easiest real co-op;
   best fit for couch play. Needs a third device.
2. **Two phones, host-authoritative P2P (WebRTC)** — both run the full game; one
   phone owns the world state, the other syncs. State is tiny (crook, two cops,
   truck). Each phone gets its own camera — asymmetric roles make separate views a
   feature, not a cost. Signaling via PeerJS free tier or a Tailscale-served page;
   still no real backend. Work items: interpolation, rejoin, host-sleep handling.
3. **Online co-op with a server** — only for players on different networks. This is
   the one thing that breaks static-GitHub-Pages purity; keep it last.

Design the tier-1 input protocol so the same messages drive tier 2 later.

## Era progression
Same chase-and-cuff loop; tools evolve, and crook tech evolves too (arms race).
1. **Old West** — sheriff on horseback, lasso instead of cuffs, wanted posters.
2. **1920s** — getaway cars, hand-crank sirens.
3. **1970s** — muscle cars, CB radio.
4. **Today** — the current/base level.
5. **SWAT/future** — armored truck, net-launcher drone, EMP that stalls getaway cars,
   maybe robot K-9.

Dog partner in every era: bloodhound (Old West) → German shepherd (today) → robo-dog
(SWAT).

## Academy training level (= tutorial + time-trial mode)
- Cone slalom to learn driving; gate-to-gate lap timer.
- Pop-up cardboard crooks for H practice (cuff the robber cutout, not the grandma —
  teaches aim and target reading).
- Foot race vs another cadet; taser range; instructor with whistle; graduate with badge.
- Doubles as a time-trial mode later.

## Platform & tech
**Primary target: iOS Safari** — the family plays on iPhones (dev device: Pixel 10 Pro).
The iOS-only quirks (HTTPS-gated motion permission, tap-to-allow prompt, no
navigator.vibrate, audio-after-tap) are the main audience's path; test there first.
The permission flow is coded but untested on real iOS hardware as of playtest #1.

- Three.js low-poly (later possibly R3F + Vite). Phone GPUs handle it fine.
- Perf budget: few draw calls, no shadow maps, capped pixel ratio, 30–60fps cap
  (battery/thermal).
- PWA: manifest + service worker, "Add to Home Screen", share by link, no app store.
  Capacitor wrap later if App Store desired — no rewrite.
- iOS audio starts only after a tap.

### Mobile controls
- Thumb-first. D-pad works; candidates: tilt steering, hold-left/right-side-of-screen.

#### Mobile action scheme (replaces Space/H/T on touch)
Tilt frees both thumbs from steering → one thumb "go", one thumb "do".
- **Steer**: tilt — in car, on bike, AND on foot (always moving forward; tilt to
  weave). Control scheme never changes across car/bike/foot, so the dismount
  transition is a non-event. Only speed/turning radius change.
- **Go**: right thumb hold = gas/sprint; release = brake/jog.
- **Context button** (left thumb, fixed position, morphs): EXIT/ENTER near vehicle;
  CUFF within lunge range; dimmed otherwise. One tap, one spot, self-teaching.
- **TAZE button**: fades in above context button only when a crook is ~8m ahead.
  Generous auto-aim; the click telegraph + crook juke makes it a *timing* skill,
  not thumb-aiming (which touch is bad at).
- **Crowd cuffs**: tap directly on the suspect — your finger is the accusation.
  Makes the blend-in/read-behavior mechanic native to touch.
- **Siren**: small corner toggle (it's a mode, not an action).
- Budget: 2–3 touchables on screen at any moment, all in thumb reach.
- Haptics via navigator.vibrate where available (Android; iOS web has none).
- **Tilt prototype exists** ("Tilt academy", single-file HTML, built in the chat):
  calibrates to hold angle on start; settings for sensitivity (tilt degrees to full
  lock), expo/linear curve, invert, recalibrate; sensor debug panel (raw beta/gamma,
  screen orientation, event rate Hz, device) for cross-phone comparison; steering
  meter shows raw vs smoothed input.
- Known cross-phone variance: event rate (60Hz vs 15–30Hz), flipped signs in
  landscape, wobble when held flat — hold like a steering wheel.
- Motion sensors blocked in iframes → falls back to touch steering. Real multi-phone
  test needs self-served HTTPS (iOS permission prompt requires it) — e.g.
  `python3 -m http.server` + Tailscale serve.

### Deploy
- Static GitHub Pages — free HTTPS (required for iOS motion permission).
- Single-file prototypes deploy as-is; R3F version adds a Vite build in an Action.
- Zero backend until online co-op.

## V1 scope — the vertical slice (prove the 90 seconds)
Everything else in this spec is content that only pays off if this is fun:
one city block, one smart crook, drive → dismount → foot chase → cuff.

**In v1:** today-era city block · car + foot (bike in v1.5) · hearing/flee-radius
crook with 3–4 legible reactions (freeze at siren, look back, cut into alley, juke
at taser click) · taser · jail run (drive the cuffed crook in) · mobile scheme
(tilt everything, go-thumb, context button, TAZE) + desktop keys (Space/H/T/S) ·
Academy as tutorial (tilt prototype grows into it) · GitHub Pages PWA.

**Explicitly out of v1:** eras · dog · escort mode · crowds/blend-in ·
learning-across-runs AI · co-op. All preserved above as the roadmap.

### Build order (each step is testable on a phone)
1. **Control-feel prototype** — box car, box cop, box crook, one block. Tilt +
   go-thumb + context button. The only question: does the dismount transition feel
   good? Test on 2+ phones (the cross-phone debug panel pattern from Tilt academy).
2. **Crook hearing AI** — flee radius, the 3–4 legible reactions. Question: does
   the crook *feel* smart?
3. **Full loop** — cuff, jail run, score, fail states. Question: is 90 seconds fun,
   and do you immediately want to go again?
4. **Academy wrapper** — tutorial gates, badge, time trial. Then art pass.

### Design rulings (provisional — decided solo 2026-08-23, pending co-designer veto)
- **Fail states**: no arbitrary timer — the crook is *going somewhere*. Escape
  points on the map (subway entrance, getaway car); he reaches one un-cuffed,
  chase lost. Fair because you can see him heading there. Crook sprints in bursts
  and tires (stamina), so a well-played chase always closes. Jail run: escape
  meter fills while stopped/dawdling, drains while moving; full = slips cuffs.
  "Lost from sight 15s" mechanic → v1.5.
- **Scoring**: 3 stars per chase — cuff / beat par time / style (taser hit, no
  crashes). Crashes cost score as "paperwork" (police-flavored, no gore). Stars
  accumulate into rank: Cadet → Officer → Detective → Sergeant; rank ladder later
  doubles as era unlocks.
- **Art direction**: low-poly flat-color cartoon, Crossy Road energy — chunky
  proportions, bright city palette, cop in strong blue, crook in stripes-and-beanie
  (reads at distance). Tazed = dizzy-stars, not pain. Cheapest style to build and
  friendliest to the perf budget.

## Playtest #1 — 2026-08-23, Pixel 10 Pro over Starlink (in-flight), cloudflared tunnel
- Core loop works end-to-end on a real phone: track → chase → flee → dismount →
  foot pursuit → cuff. **2 busts.** Exit/dismount "worked good"; ran the alley.
- Bug found: crook spawned ~115m away, motionless, past fog falloff — invisible.
  Fixed same-session with the dispatch tracker (HUD arrow + distance). Opens a real
  design question: how does the player FIND crooks? (dispatch calls, crimes in
  progress, witnesses?) Tracker arrow is the placeholder.
- Cuff dizzy-stars effect landed well ("nice little effect").
- Map feels tiny (it is — one-block testbed by design). Next iteration: district
  map, ~4×6 blocks, park, varied alleys, escape points at edges.
- **Design rule learned:** map edges must read as edges (buildings/river/barrier),
  never an invisible clamp in front of visible open space — the knee-high fence
  with grass beyond it made the boundary feel like a bug.

## Status (2026-08-26) — v0.2 "District"
- District map shipped: 4×3 blocks on a street grid, tall perimeter walls (edges
  read as edges), two bollarded alleys, a hedged park (foot-only, 4 gated paths),
  a plaza with fountain, varied building skylines.
- **Chases are now losable**: 3 subway escape points (green beacons); alerted
  crooks BFS-pathfind through the street/alley/park graph to the safest subway,
  avoiding nodes near the player — cut them off or they're gone (💨 counter).
- Dispatch tracker upgraded: points to your car after a bust/escape when on foot.
- Verified via Node logic harness (graph connectivity, flee-to-escape sim,
  200-tick run) — Playwright/Chrome were wedged this session.
- Next: jail run (drive the cuffed crook to the station, escape meter).

## Status (2026-08-23)
- [x] Tilt academy artifact recovered → `tilt-academy.html` (tuning/debug testbed).
- [x] Initial sketch NOT recovered — rebuilt instead: `index.html` = **Chase One**,
      the build-order step-1 control-feel prototype (one block, bollarded alley,
      hearing/flee crook with waypoint graph + stamina, drive/foot modes, morphing
      context button, tilt + fallbacks, cuff + respawn loop). Verified headless.
- [x] Co-op deferred (single-player for now).
