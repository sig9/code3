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
- **L** — siren: clears traffic so you drive faster, but smart crooks hear it and
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

## Badges (profiles) — decided 2026-09-02 with the co-designer
A **badge** is a player profile on a phone: a name, a chosen officer look, and the career
(stars, rank, bookings, escapes, slips). Several badges per phone, so kids sharing a phone
stop overwriting each other. Rulings:
- **Skill stays with the badge.** Stars and rank belong to the badge, not to an era or a map.
- **Era hopping per badge is fine.** A badge can play any unlocked era and keeps its rank;
  the era is where the badge is playing today, not part of who it is. Era unlocks hang off
  the badge's rank (the rank ladder doubles as era unlocks, as planned).
- **Scope now (decided 2026-09-02): one officer look.** A badge is a name plus a career;
  the character builder below is roadmap, not next.
- Later — the look is cheap on purpose and built from parts, not a gender toggle: hair (short,
  ponytail, bun, buzz), face (moustache, glasses, none), uniform/hat/skin colours. Male and
  female officers both come out of the same box parts; a kid assembles whoever they want.
  The crook stays stripes-and-beanie so he reads at distance.
- Later — badge art grows with rank on the start screen (Cadet → Sergeant), giving the ladder
  something visible to do.
- One extra screen before the countdown; no new touchables in play (budget stays 2–3).
- **Shipped 2026-09-02 (v0.3.1): badge number entry.** Start screen has a Badge # field (numeric
  keypad on phones) with the recent badges as tappable chips; blank = a new 4-digit badge is
  minted. Career is stored per badge (`code3.career.<n>`, list in `code3.badges`); the first
  badge on a phone adopts the old single v0.3 career. Settings gains "Change badge"; "Reset
  career" resets only the current badge. Still per phone and per web address; a typed "badge
  code" to carry a badge between phones stays backend-free and is not built.

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

## Playtest #2 — 2026-09-01, desktop keys via Playwright (Claude)
Three chases on v0.2 "District", keyboard only: 2 busts, 1 escape. Findings verified
in the running game, not inferred from the code.
- **Subway overshoot** (escape unreachable): `repath()` re-ran every 2.5 s from the
  nearest node; once the goal subway *was* the nearest node the path collapsed to
  `[goal]`, steering stopped, and the crook ran through the entrance and pinned on
  the perimeter wall still "fleeing". Deterministic repro: crook at (98,28) heading
  +x with path=[18], pi=1 is at x=117.5 two seconds later.
- **Crook runs at the cop**: the router picked the subway with the fewest nodes and
  only skipped nodes within 14 m of the threat. On 56 m blocks a cop mid-block is
  never within 14 m of a node, so both busts were the crook sprinting straight into
  the cruiser (path -112,84 > -56,84 > 0,84 through a cruiser at (-84,84)); a 1.5 s
  "chase".
- **Cop cannot stop on foot**: foot mode jogged at 3.0 m/s with no input (the
  touch-scheme "always moving" rule leaked into keys). After a cuff the cop walked
  40 m off, camera staring at a wall, through the 2.5 s celebration.
- **Cruiser not solid**: neither cop nor crook collided with the parked car, so
  roadblocks did nothing.
- **Speedometer while wedged**: car wedged between the subway kiosk collider and a
  building corner read 75 mph while stationary — the HUD showed `car.speed`, not
  motion.
- Nit: favicon.ico 404 in the console.
- **What worked (keep):** tracker chip with rotating arrow + distance; subway
  beacons; the "He's almost at the subway" warning (~4 s before arrival on a
  one-block dash); bollarded alleys and the hedged park read at a glance; perimeter
  walls read as edges; stamina (6 s sprint at 7.0 m/s, then 3.4 m/s while
  recovering at 1.1/s) made the foot chase winnable.

## Status (2026-09-01) — v0.3
All five playtest-#2 bugs fixed at the root, plus build-order steps 2 and 3 (crook
reactions, taser, siren, jail run, scoring). Still one self-contained `index.html`
(Three.js r128). Verified by the Node harness (`node --test test/*.test.mjs`, 81
tests passing) and headless Chrome over CDP at phone widths; **no real-phone run yet**.

**Shipped**
- Router rewrite: Dijkstra over the street/alley/park graph with a threat-cost
  field. Legs the cop/cruiser can reach first are poisoned, the crook's own first
  leg is judged from 2 m ahead of him, and a cornered crook takes the least-bad
  route away from the threat rather than through it. Subway arrival is checked on
  position alone (no more overshoot). Goal hysteresis so he commits to a subway.
- Legible crook reactions, all with HUD state text: `heard you!` (0.4 s startle;
  with a moving car he dives out of its line, eyes on the car; on foot it is a
  0.15 s flinch), `doubling back` (dead stop, then turn; never twice within 5 s under
  a rammer), look-back glance every ~3 s with a `!` pop, `sneaking` + `?` when he
  loses you, `tired`, `spooked!` (faster after a taser miss), `staggered!` + stars
  when clipped by the car at speed. Fleeing crooks run the sidewalk 4 m off the
  centre line when a car is the threat.
- Cruiser is solid for people (capsule collider; a car at speed sheds a person
  sideways instead of carrying him on the nose).
- Cop on foot stops with no input on keys (touch keeps the always-jogging rule).
  Speedometer shows measured motion, not commanded speed.
- **Taser (T / TAZE button)**: 3 charges (⚡ pips), ~8 m, ±30° resolve cone, click
  telegraph, crook juke; hit = `tased ⚡` 3 s and cuffable. The TAZE button fades in
  only in range with hysteresis so it does not flicker.
- **Siren (L / SIREN pill)**: 42 vs 34 m/s top speed, hearing radius a full block,
  🚨 leads the score chip; turning it off bleeds speed instead of dumping it.
- **Jail run + scoring**: Precinct 3 station with a booking bay (blue beacon).
  Cuff → 2.5 s cuff beat → `in custody` (he trails you on foot, ENTER seats him) →
  drive to the bay, stop, BOOK. Escape meter fills while he is left on foot, in a
  stopped car, or with the cop out of the car; full = `slipped the cuffs!` (3 s
  immune, then he runs). 3 stars per bust (cuff / par 45 s from first alert / no
  paperwork = no crashes), ranks CADET → OFFICER → DETECTIVE → SERGEANT, career in
  localStorage with a Reset in settings.
- HUD: score chip re-laid out for 360 px phones (nothing clipped at 360/375/390/412),
  tracker points to Station while he is aboard; favicon is an inline SVG (no 404).
- Mobile budget kept: GO + one context button (EXIT/ENTER/CUFF/BOOK) + one tool
  slot (TAZE on foot, SIREN in the car) = 3 in-play touchables, thumb reach.

**Default design rulings (decided solo, pending co-designer veto)**
- A crook who sees the cop in his path doubles back or cuts through an alley/park;
  he never runs at the cop when any alternative exists (a cornered crook takes the
  least-bad route *away*).
- The cruiser is solid for people — parked, it is a roadblock.
- The officer freezes for the cuff beat (2.5 s, `CUFFING`), then the jail run begins.
- Smaller calls made while building, all reversible: the alert is a startle-dive
  out of a moving car's line rather than a dead-still freeze; a clip at speed
  staggers the crook 0.6 s and costs the player nothing; escape-meter rates
  (0.04/s escorted on foot, 0.25/s left in a stopped car or on foot, holds in the
  bay, drains above 8 m/s).

**Open questions for the co-designer**
1. **Ramming policy.** Ramming is now the fastest route to a cuff (~13 s vs ~20 s
   clean) and costs nothing — should a clip cost paperwork / a star, spook the crook
   into a burst instead of a stagger, or is ramming intended play?
2. **Escape-meter feel.** The meter is not reset on ENTER, so a long foot escort can
   slip him under a second after he is seated; and rolling into the bay above 3 m/s
   offers EXIT, not BOOK, so a mashed button loses the bust. Grace period on ENTER
   and/or BOOK preferred in the bay — or keep it strict?
3. **Par clock after a slip.** A never-alerted (sneaked-up) crook keeps the par star
   however long the post-slip chase runs. Start the par clock at the slip, or leave
   "never alerted = par met"?

**Known gaps (honest list)**: no real-phone run of v0.3 (tilt, haptics, iOS audio,
thumb reach all unverified on hardware); the look-back glance is invisible on the
model (featureless head — only the `!` pop shows); wedge recovery is ~0.4 s slower
than v0.2 by design (spec'd hover); a slip beside a wall can drop him inside the car
capsule for a frame; parking next to a subway makes a slip an instant escape;
`test/` is untracked until the baseline is committed.

**Next**: phone test over a tunnel — tilt plus the new buttons (TAZE, SIREN, BOOK)
at real thumb reach; then the academy wrapper (build-order step 4).

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
