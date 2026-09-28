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
4. **Academy wrapper** — tutorial gates, badge, time trial. Then art pass. **Done in v0.4**
   (2026-09-27): drive + foot drills, graduation, time trial, art pass; see the v0.4 status.

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

## Playtest #3 — 2026-09-27, headless Chrome with keys (Claude)
v0.4 "Academy", played by Claude with keyboard keys in headless Chrome at 390×844 and
360×780, written up as a 9-year-old would see it. **Not a real phone and not a kid.** The
bot drove the streets in the chases (no teleports), but pressed keys faster than a kid
would. 0 errors, 0 exceptions, 0 missing files.
- **Academy, start to finish (~1 min):** ACADEMY was already picked; tapped "no tilt".
  The rings ("DRIVE THROUGH RINGS", the SIREN wiggle at ring 3, "STOP IN THE BAY",
  "TAP EXIT!") were very clear. The line-up was the best part: cuffing Grandma on purpose
  gave "📣 OOPS! That's Grandma! 👵" and +3 s, and it was funny. 3 robbers, then dizzy
  stars. Walking back to the car and tapping ENTER was easy. GRADUATED 🎓 with confetti
  was a great moment.
- **Patrol chase 1, BUST ★★★:** the radio said "📻 DISPATCH: Captain Crumbs took every
  left shoe in town!", he said "Can't catch me!" in a speech bubble, got clipped by the
  car, cuffed ("Aw, nuts."), driven to Precinct 3 and BOOKED with confetti and his name
  and crime on the card. A second run zapped him first ("⚡ Missed — he juked!", then
  "⚡ ZAP! He's down"); that worked too.
- **Patrol chase 2, let him escape:** parked and watched. He ran saying "Uh oh…" and
  looking back, the subway warning fired, then "💨 He got away — down the subway!", the
  radio said "💨 Pickpocket Pam got away!" and a new crook was spotted 2 s later. Clear,
  and it made you want to go again.
- **Fun:** Grandma OOPS, the cutouts popping up, confetti, crook names and crimes,
  speech bubbles, the SIREN wiggle, and the hint pill always saying what to do next.
- **Stuck:** nowhere. Every step moved on.
- **Confusing, and what happened to it** (checked in the code after the fix round):
  - The first hint said "TILT TO WEAVE" after picking no tilt. **Fixed:** keys and
    touch now see "STEER AROUND THE CONES".
  - Driving straight down the middle of the slalom hit no cones and was the fastest.
    **Fixed:** a weave rule. Passing a cone on the wrong side tips it and costs +1 s.
  - The medal was a bare 🎖️ with no word. **Fixed:** the card now says it in words
    ("GOLD 🥇 top time!", "SILVER · gold under 0:25.0", and so on).
  - The lap was only the driving part, and cuffing Grandma did not change it, but the
    timer chip showed +4 s. **Half-fixed:** the chip now shows only the penalty inside
    the lap. The lap is still slalom + gates by design. The foot drills are timed on
    their own on the card (Line-up, Taser), and Grandma's +3 s lands in the Line-up time.
  - "crook: unaware" all through the Academy. **Fixed:** it says "cadet training".
  - The next crook had the same name as the one just booked (about 1 in 20).
    **Fixed:** never the same name twice in a row.
  - The start screen said v0.3. **Fixed:** v0.4 and a "Try the Academy first" line.
  - Taser range: after a dodge the game said "Get closer!", but walking closer made the
    pill say "AIM FROM THE LINE" and the TAZE button went away. **Fixed (round 2):** it
    now says "📣 He heard you! Zap again from the line", and on touch the cop stands
    still on the line until you hold GO.
- **Not findings:** every crook's first spawn is at (112,84) (v0.3 behaviour); "par
  2s/45s" on a ram-then-grab bust is correct v0.3 text.
- **Also fixed in the same review round:** the slip ban now lasts until he is 30 m
  from that subway (it used to end after 3 s); the start button is above the fold on
  short phones and in landscape; the hint pill no longer hits the chips in landscape;
  safe-area insets on every edge button; v0.3 veterans default to PATROL and a hand
  pick is remembered per badge; the card's NEW BEST and medal agree with the times it
  shows; bonus graduation stars that cross a rank line show PROMOTED and fire `rank`;
  touch targets are at least 44 px.
- **Touch pass (round 2, 2026-09-28):** Claude played again with **pretend touch in
  headless Chrome** (two fake fingers: left thumb steers, right thumb holds GO), not a
  real phone and not a kid, at 390×844 and 360×780. 0 errors. Everything a phone player
  needs can be done with thumbs: the Academy start to GRADUATED 🥇, and a patrol bust to
  BOOKED ★★★. The rings, SIREN, the bay, EXIT and the line-up (3 of 3, no Grandma
  mistakes) all worked by touch. The taser range was stuck at first: the cop jogged right
  across the white line and never stopped. **Fixed:** now he stands on the line and you
  turn to aim. What still felt wrong with thumbs, and what happened to it in round 3
  (2026-09-28): the Academy never said "slide your left thumb to steer" (**fixed**), lifting
  GO also stopped the steering (**fixed**), the on-foot toast said "tilt" on touch
  (**fixed**), a steering thumb could skip the graduation card by accident (**fixed**),
  "Taser's empty" could replace CUFFED! (**fixed**). **Not fixed (v0.3 control feel, see
  Known gaps and open Q15):** the steering thumb's home spot sits on the EXIT button
  column, and there is no brake (let go of GO and coast to BOOK).
- **Kid lens, round 2 (keys):** the Academy words are short and clear, and Grandma and
  the crook names are still the funny bits. The weak spots and what happened to them in
  round 3: too many words at once on GO ON PATROL (**fixed**: the radio waits for the
  toast, two short lines), no Try Again on the graduation card (**fixed**: TRY AGAIN ↻),
  no "1 of 3" counters (**fixed**: n/3 and n/2 in the pill), the slalom's weave rule
  unexplained (**fixed**: one "go around the far side" tip per lap), grown-up House rules
  labels (**fixed**: kid words). Bronze out of reach for thumbs is **not fixed** (the
  medal times wait for a phone playtest; the card now says "You graduated! Next: bronze
  under 0:36" instead).

## Status (2026-09-27) — v0.4 "Academy"
Build-order step 4: the Academy wrapper, then the art pass, plus the PWA (the other unbuilt
v1-IN item) and a synthesized sound pack. Still one self-contained `index.html` (Three.js
r128) with one `<script id="game">`; the only new sibling files are `manifest.webmanifest`,
`sw.js` and `icons/*.png`. Verified by the Node harness (`node --test test/*.test.mjs`,
220 tests passing after the round-2 fixes, 250 after round 3, **259 after the final pass**) and by headless Chrome over CDP
(`test/e2e/smoke.mjs`, DPR 3) at 360×780, 390×844 and 412×915 portrait and 844×390 and
667×375 landscape, patrol and academy: 0 exceptions, 0 console errors, 0 missing files,
3 touchables, no HUD overlaps at all (the v0.3 pairs are gone), no sideways scroll.
**No real phone has run v0.4.** Tilt, haptics, iOS audio, the
home-screen app and thumb reach are all unverified on hardware.

**Shipped**
- **Stage 1, foundations (seams, no gameplay change).**
  - Event bus `emit(type,data)` / `onFx(fn)`. A listener that throws never breaks the
    game. The event names are a fixed contract: `alert`, `glance`, `lost`, `spawn`,
    `clip`, `crash`, `cuff`, `enter`, `exit`, `siren`, `tazeFire`, `tazeHit`, `tazeMiss`,
    `slip`, `escape`, `book` {stars,promoted}, `rank` {rank}, and for the Academy
    `whistle` {id}, `cone` {i}, `gate` {i}, `popup`, `cuffCutout`, `decoy` {kind},
    `drillDone` {id}, `graduate` {lap}, `newBest` {lap}.
  - Game clock `gnow()` = performance.now() minus the time spent paused. Every logic
    time reads it; only calibration uses wall time.
  - **Pause:** hiding the tab, losing focus or opening Settings freezes the clock and
    shows "PAUSED · tap to resume". Held inputs are dropped, and tilt recalibrates on
    resume.
  - **House rules switchboard** `RULES`. Each key is read at exactly one site. It is
    stored per phone in `code3.rules` and flipped in Settings → House rules (one button
    per rule cycles its values):

    | key | Settings label (round 3, kid words) | values → button text | default | what it changes |
    |---|---|---|---|---|
    | `ramCost` | Bumping him with the car costs | none → nothing · paperwork → paperwork · burst → he runs faster | `'none'` | what a car clip costs (open Q1) |
    | `enterGraceS` | Escape clock waits after he gets in | 0 → no wait · 2 → 2 sec · 4 → 4 sec | `0` | escape meter holds after ENTER (open Q2) |
    | `bookMaxMv` | How slow to tap BOOK? | 3 → slow · 1 → stopped · 6 → rolling (m/s) | `3` | BOOK speed gate in the bay (open Q2) |
    | `parFromSlip` | Clock restarts if he wiggles free | false → no · true → yes | `false` | par clock restarts at a slip (open Q3) |
    | `slipSubwayBan` | No wiggling free near a subway | true → yes · false → no | `true` | a slip within 12 m of a subway closes that subway to him until he is 30 m clear (solo ruling) |
    | `gradStars` | Stars for graduating | 0 → 0 ★ · 1 → 1 ★ · 3 → 3 ★ | `0` | one-time stars for graduating (open question) |

    Defaults equal v0.3 behaviour except `slipSubwayBan`. Round 3 changed only the labels;
    keys, stored values and defaults are unchanged.
  - `hash32(a,b)` deterministic hash for everything new that needs variety: crook
    names, academy picks, decor, confetti. v0.4 adds no `Math.random()` call.
  - Guard tests: a v0.3 layout snapshot (`test/fixtures/layout-v03.json`, seeds 1–3),
    allowlists for `Math.random()` and `performance.now()` sites, and a structure check
    (one game script, no local `<script src>`).
  - `test/e2e/smoke.mjs`: a headless-Chrome runner that reports exceptions, HUD overlaps,
    touchables and draw calls. `--height` checks short landscape. It exits 3 when there is
    an overlap (`badOverlaps`; only the #actRing pulse ring around #bAct and nested
    elements are allowed), more than 3 touchables, an exception or sideways scroll.
  - v0.3 known gaps fixed: the look-back glance is visible (faces, stage 4); the slip
    can no longer drop him inside the car capsule; a slip beside a subway is no longer an
    instant escape (`slipSubwayBan`).
  - The planned in-bay "BOOK-dimmed" mis-tap guard was **dropped**. It would break the
    v0.3 jail test "rolling through the bay at 5 m/s → EXIT". Open Q2's `bookMaxMv` is
    the knob instead.
- **Stage 2, Academy (drive half).** `phase` = `'patrol' | 'academy'`. The car/foot
  step moved verbatim into `stepPlayer()`, and the crook AI never runs in the Academy.
  The drills are data (`DRILLS`), all on the real district map, with no fail state. Sgt.
  Whistle (blue uniform, yellow cap, moustache) blows his whistle at each drill.
  1. **Cone slalom:** 7 cones at x −86…−14 (every 12 m), alternating z −86.5 / −81.5, on
     the z −84 perimeter street. The start line is x −92, the finish x −6, and the car
     starts at (−100,−88). Hitting a cone, or passing it on the wrong side (the weave
     rule), tips it and costs +1 s; the first wrong-side pass in a lap says "📣 Go around
     the cone's far side!" once. Hint: "STEER AROUND THE CONES" with keys, "TILT TO WEAVE"
     with tilt, and with thumbs (no tilt) "SLIDE LEFT THUMB TO STEER" until the first
     left-half touch, then "WEAVE AROUND THE CONES" (`steerKind()` picks the words only).
  2. **Gate lap:** 6 glowing rings at (28,−84) (56,−56) (56,0) (28,28) (−28,28)
     (−56,10), each passed within 5 m. At ring 3, "TAP SIREN!" and the SIREN button
     wiggles; the toast says "📣 Tap SIREN — go fast! 🚨", or "📣 Siren on — go fast!" if
     it is already on. In the Academy the siren toggle says "📣 Nice! Now zoom!" (siren on
     after ring 3, before the last ring), "📣 Siren on!" elsewhere and "📣 Siren off"; patrol
     keeps its v0.3 lines. It ends by stopping in the Precinct 3 bay (x −70…−60,
     z −10…10) below 3 m/s for 0.5 s.
  3. **Hop out:** "TAP EXIT!".
  - **Lap and medals:** the lap is slalom start line to the bay stop, with its penalties.
    Medals (PROVISIONAL, keyboard-tuned, `ACADEMY_PAR`): gold ≤ 25 s, silver ≤ 30 s,
    bronze ≤ 36 s. The card names the medal in words and what to beat next: "GOLD 🥇 top
    time!", "SILVER! Next: gold under 0:25", "BRONZE! Next: silver under 0:30", and with
    no medal "You graduated! Next: bronze under 0:36" (first graduation) or "Nice driving!
    Next: bronze under 0:36". Per-badge bests live in the career (`career.academy`).
  - **Graduation:** the GRADUATED 🎓 card with confetti. `RULES.gradStars` bonus stars
    are given once per badge (default 0). Crossing a rank line shows PROMOTED and fires
    `rank`. Two off-play card buttons: **TRY AGAIN ↻** (`#cardAgain`, round 3; the same
    lap again as a time trial, `startAcademy({trial:true, only:acad.only})`) and GO ON
    PATROL. Both arm 600 ms after the card appears (`CARD_ARM`, on `gnow()`) and fire only
    when a finger that pressed on that button lifts; a stray or already-down thumb does
    nothing. `#cardAgain` is built in script before `#cardGo`, so the pinned card HTML is
    unchanged.
  - **Start screen:** a 🚔 PATROL | 🎓 ACADEMY segment. A brand-new badge is preselected
    to ACADEMY; v0.3 veterans and graduates get PATROL. A hand pick is kept per badge.
    Patrol is never gated. Graduates see 🎓 TIME TRIAL. `?academy` preselects the
    Academy, and `?drill=slalom|gates|lineup|taser` runs one drill as a time trial.
  - HUD chip `#acad`: 🎓 step/6, progress dots, clock (trial or graduated), and +penalty.
- **Stage 3, Academy (foot half).**
  - `tazeTarget()` refactor first: the taser code reads its target only through it
    (the crook on patrol, the rail slider on the range), and the `Math.random` order is
    unchanged.
  4. **Line-up** (park north half; the park centre is (−28,0), 15 m from the bay):
     plywood cutouts pop up in pairs at 8 fixed spots, one robber and one decoy (Grandma,
     the mail carrier, the hot-dog guy in turn). Cuff 3 robbers (`LINEUP_NEED`); the pill
     counts: "CUFF ROBBERS 0/3". Cuffing a decoy costs +3 s ("📣 OOPS! That's Grandma! 👵").
  5. **Taser range:** a robber cutout slides on a rail (x −34…−22, z 6) at 3.5 / 4.2 /
     5.0 m/s by round. Stand on the firing line (z 12.5, 6.5 m back; `onFiringLine()`,
     the one shared check). 2 hits pass (`RANGE_NEED`); the charges refill (pips show ∞). The real taser
     code does the aiming, and rounds 2+ can juke: the first round-2 shot always jukes, so
     every cadet sees one, and later shots mix the slider's rail spot and the game clock
     into `hash32` (`rangeRoll`), so there is no safe shot pattern to learn. A missed shot
     says "📣 Missed! Tap when he is in front 🎯", or "📣 He heard you! Zap again from the
     line" after a juke. The pill says "AIM FROM THE LINE" off the line, "TURN TO FACE
     HIM" on it while facing away, "WAIT FOR HIM…" while aimed but not in the zap window
     (rail ends, mid-shot, while he lies tased) and "ZAP HIM!" when a shot can land, each
     with the count ("ZAP HIM! 1/2"). On touch the cop always jogs, so on the range only he **stands still on
     the line** while GO is not held (`rangeHold()` in `stepPlayer`): turn in place with
     the left thumb to aim, hold GO to sprint off. Patrol movement is unchanged.
  6. **Back to the cruiser:** "WALK TO THE CAR", then "TAP ENTER!", then graduation.
- **Stage 4, art pass + booking party.**
  - Chunky people (`makePerson`): legs, shoes, swinging arms, and a box head with a
    canvas face in 4 moods (normal, scared, dizzy, grumpy; `crookMood`). The look-back
    glance now shows.
  - The cop is strong blue (0x1f5fd6) with a peaked cap and a gold badge. The crook
    wears stripes, a beanie, a bandit mask and a loot sack.
  - Brighter building palette (about +40 % saturation). Road paint: yellow centre dashes
    and 6-stripe zebra crossings at every corner, blocky trees. Repeated props are batched
    (`QuadBatch`) or instanced (e.g. the 12 gate posts are 1 draw call).
  - Dizzy stars are sprites. The booking card pops stars in one at a time, stamps
    PROMOTED, and shows the villain.
  - **Crook names and crimes:** 20 names × 20 crimes, picked by `hash32`, never the same
    name twice in a row. The dispatch radio line `#radio` said "📻 DISPATCH: Sneaky Pete
    stole 400 donuts! Last seen near …" until round 3; now it is two short lines about
    3.5 s each, "📻 Wanted: Sneaky Pete!" then "📻 Last seen near …" (the crime is on the
    booking card). Lines wait in a queue (`radioQ`) until the toast and the current radio
    line are gone, the queue is cleared on leaving patrol, and "💨 … got away!" on an
    escape still goes first.
  - **Speech bubbles** over the crook: "Can't catch me!" (`alert`), "Uh oh…" (`glance`),
    "Where'd he go?" (`lost`), "I'm pooped" (tired), "Bzzzt" (`tazeHit`), "Aw, nuts."
    (`cuff`).
  - **Confetti** on `book` and `graduate`.
  - **Hint pill** `#hint` ("DO THIS NOW", ≤ 8 words): always on in patrol and the
    Academy. It can be turned off in Settings (`code3.hints`). Patrol says "FIND HIM!" /
    "CHASE HIM!" (round 3 dropped the → arrow; the tracker alone shows direction).
  - Draw calls at the start view: patrol 30 / 29 / 28 at 360 / 390 / 412 (budget B = 33,
    the v0.3 baseline). The Academy is 41 / 42 / 40 (budget B+25 = 58). Landscape sees
    more of the map: patrol 66 at 844×390 and 63 at 667×375 (v0.3 drew 100 and 89 there),
    the Academy 75 and 71. After round 3: patrol 30 / 30 / 29 and the Academy 42 / 41 / 41
    at 360 / 390 / 412; landscape unchanged (66 / 63 patrol, 75 / 71 Academy).
- **Round 2 fixes (2026-09-28, after the kid, touch and iOS-layout passes).**
  - **Taser-range hint conflict fixed** (Playtest #3): "Get closer" is gone from the game;
    see drill 5 above for the new miss line, the pill and the touch stand-still.
  - **HUD layout, portrait:** the steering meter `#meter`, its label `#mlab` and the GO
    label `#golab` stack in a column right of the EXIT button, none touching, all
    pointer-events:none, inside the safe-area edges. The v0.3 overlaps are gone.
  - **Short landscape (height ≤ 480 px):** the dispatch radio keeps 124 px clear of the
    button column on each side; the card is compact and sits below the HUD; the steering
    column and the hint pill step aside while a card is up.
  - **Under the card:** the radio line and the message toast hide while the booking or
    graduation card shows.
  - **Exit hint:** near the crook in the car, the pill says "SLOW DOWN, JUMP OUT!" while
    EXIT is dimmed, and "JUMP OUT!" (with the pulse ring) only once EXIT works.
  - **Checked, already fine, now tested:** TAZE and T do nothing while paused; the Hints
    setting survives a reload (`test/harness.mjs` gained `opts.storage` to preload saved
    settings); "💨 … got away!" stays up 2.2 s even when the next crook spawns at once.
  - **Debug Respawn name:** could still repeat the name (a test caught "The Noodle"
    twice); a repeat now moves on to a different name.
  - Tests: `test/leftovers.test.mjs` plus additions to the academy tests (220 total).
- **Round 3 fixes (2026-09-28, after the touch pass and kid lens; two review rounds).**
  Tests: `test/round3.test.mjs` (250 total).
  - **Touch steering taught:** `steerKind()` (keys → thumb → tilt; it only picks words)
    gives thumb players (no tilt) "SLIDE LEFT THUMB TO STEER" in the slalom and on patrol
    (it replaces only "FIND HIM!" / "CHASE HIM!") until the first left-half touch. On foot
    the toast says "On foot — thumb steers, hold right to run" (thumb) or "On foot — arrow
    keys to steer and run" (keys); the tilt line is the v0.3 one.
  - **Multi-touch steering:** `steerPid` tracks the steering pointer. Only its moves steer;
    lifting GO keeps the wheel turned; when a second left-half touch lifts, the wheel goes
    back to the thumb still down, and only the last steering thumb's lift straightens it.
  - **Graduation card:** TRY AGAIN ↻, and both card buttons arm after 600 ms and need a
    press-and-lift on the button (see Graduation above). In short landscape the two
    buttons sit side by side and the row no longer wraps into `#credit` or the HUD.
  - "Taser's empty — run him down" only while the target is still free, so it never
    replaces CUFFED!. The siren does nothing while the graduation card is up.
  - **Kid words:** the queued two-line dispatch radio, "FIND HIM!" without the arrow, the
    medal lines, the cone tip, the n/3 and n/2 counts, the gate-3 and Academy siren
    toasts and the House rules labels (all described above).
  - **Short landscape:** the countdown moved to grid row 5 (ALT's row, hidden during the
    countdown), so it no longer sits on the Add-to-Home-Screen pill.
  - **Final-pass fixes (2026-09-28, three review rounds; 259 tests).**
    - `dropTouches()`: blur, resume and a first (primary) touch forget every tracked
      pointer, so a lost pointerup never leaves a ghost thumb that steers or holds GO (RS4).
    - EXIT beside a wall: `exitSpot()` hops out on the free flank and faces an open way;
      a cop pinched between car and wall stands still instead of jittering as "running" (R1a).
    - Line-up / taser beacon: `parkGate()` leads a cop west of the park hedge and off its
      gap to the gate lane first, so the touch cop never jogs into the hedge (R1b).
    - The queued "Last seen near …" line is dropped once the crook is spotted, cuffed or
      in custody (`radioPump()`) (R4a).
    - Card buttons fire only when the lift lands on the button (`liftOnBtn`, 8 px slop);
      a thumb that slides off cancels the press (R4b).
    - Academy EXIT drill: too fast to hop out, the pill says "SLOW DOWN, JUMP OUT!"
      instead of "TAP EXIT!" (R4c).
    - Left thumbs are tracked before the touch fallback turns on, so a thumb resting
      through "No tilt data" steers at once (v0.3 regression fixed) (R5a).
    - Dispatch lines are held under the pause veil (`radioHold()`) and play after
      resume (R5b).
    - Settings buttons act on `click`, not `pointerdown`, so a thumb scrolling the panel
      never presses one; Reset career needs a second tap within 3 s (R5c).
- **Side lane, sound** (`<script id="audio">` after the game script; `__sfx`): all
  WebAudio-synthesized, no files. It unlocks on the first tap and again after returning
  from the background. It listens on the bus and plays: `cuff`/`cuffCutout` click-clack,
  `book` stamp and star chimes, `rank`/`graduate` fanfare, `tazeHit` buzz, `tazeMiss`
  wobble, `alert`/`glance` squeaks, `slip` rattle, `escape` whoosh, `crash`/`clip` thunk,
  `whistle`, `gate` rising notes, `cone` tock, `popup` boing, `decoy` buzzer, `newBest`
  ding. The siren wail (1.5 s yelp, then wail) and a low engine hum follow the game
  state. Settings → 🔊 Sound on/off (`code3.sound`) and a "🔈 No sound? Flip the ring
  switch." line. The game is fully playable silent. Round 3: hiding the page runs
  `hush()` first (siren and engine gains to 0 at once, the yelp re-armed) before the
  context suspends; on return the loop runs once before `resume()`, and the gains stay 0
  while PAUSED, so nothing blips under the pause screen.
- **Side lane, PWA:** `manifest.webmanifest` (CODE 3, fullscreen, any orientation, theme
  #1f5fd6, 192/512 + maskable icons, relative URLs). `sw.js` has `CACHE =
  'code3-v0.4.0'`:
  - It precaches the page, manifest and icons.
  - HTML is **network-first** with a 3 s timeout and a cache fallback, and every good
    answer refreshes the cache.
  - three.js r128 from cdnjs is **cache-first**.
  - Everything else passes through.
  - Activate deletes old `code3-*` caches.
  - It registers on `*.github.io` over https, or anywhere with `?sw=1` (round 3: plain
    localhost and https playtest tunnels such as cloudflared/ngrok no longer get a sticky
    worker). Open with `?sw=0` to unregister every worker and delete only the `code3-*`
    caches, with no re-register (the stuck-cache kill switch).
  - iOS Safari shows a one-line Add-to-Home-Screen hint on the start screen until it is
    dismissed.

**Default design rulings (decided solo, pending co-designer veto)**
- The Academy is **preselected, not forced**, for a new badge. Patrol is never gated.
- Graduation gives **0 ★** (`RULES.gradStars` = 0; the kid lens proposed +3).
- `slipSubwayBan` **on**: a slip beside a subway closes *that* subway until he is 30 m
  clear. He must run to a different one: a chase, not an instant escape.
- The in-bay BOOK-dimmed mis-tap guard was **dropped** (see stage 1). A mashed EXIT
  while rolling through the bay is still possible (open Q2).
- The iPhone **ring/silent switch is respected**. No `audioSession = playback`, because a
  parent's silent switch should win; a hint line is shown instead.
- The **foot race against a cadet is deferred** to v0.5, and so is the load-up/BOOK drill.
- Drill lengths: **3 robbers** and **2 taser hits**.
- Cuffing a decoy (Grandma) costs **+3 s**. A cone costs +1 s.
- Smaller calls made while building: the lap medal covers the driving drills only (the
  foot drills are timed separately on the card); taser charges refill on the range;
  dizzy stars are sprites.

**Open questions for the co-designer**
1. **Ramming policy** (v0.3 Q1). Ramming is the fastest route to a cuff and costs
   nothing. `RULES.ramCost`: nothing / paperwork / he speeds. Flip it in Settings →
   House rules.
2. **Escape-meter feel** (v0.3 Q2). A grace after ENTER (`RULES.enterGraceS`: 0 / 2 / 4
   s) and how slow BOOK needs you to be (`RULES.bookMaxMv`: slow / stopped / rolling).
   Flip them in Settings → House rules.
3. **Par clock after a slip** (v0.3 Q3). `RULES.parFromSlip`: off (never alerted = par
   met) or on (par restarts at the slip). Flip it in Settings → House rules.
4. Should a new cadet HAVE to graduate from the Academy before going on patrol, or is
   the Academy just recommended (it's preselected but skippable right now)?
5. Should graduating give you stars toward your next rank? Right now it gives 0; one
   idea was +3 stars (`RULES.gradStars`; flip it in Settings → House rules).
6. What should the instructor be called (placeholder: Sgt. Whistle)? What should he
   look like?
7. When you cuff Grandma by mistake, what happens: a +3 second penalty (now), or
   something funnier, like she chases you with her handbag?
8. Which Academy drill should come next: a foot race against another cadet, or loading
   a prisoner into the car and booking him?
9. Is this fair: after the crook slips the cuffs, he can't escape down the SAME subway
   until he has run 30 m away (`RULES.slipSubwayBan`, on right now; flip it in Settings
   → House rules)?
10. How many robber cutouts should you cuff (3 now) and how many taser hits (2 now) to
    pass those drills?
11. Should the siren be louder or quieter? Do you want engine sound at all?
12. Are the crook names and crimes funny (Sneaky Pete stole 400 donuts)? Which ones
    should we add?
13. Should the Academy lap medals be easier or harder? Gold/silver/bronze times are
    guesses until you play it.
14. Playing with thumbs (no tilt): where should your steering thumb rest, and should
    there be a brake button, or is "let go of GO to slow down" enough? (Only 3 buttons
    are allowed on screen, so a brake would have to share one.)
15. **Touch-steering feel (for Hal and the co-designer, after a thumb playtest):** should
    thumb steering stay *absolute* (where the thumb lands sets the wheel, neutral at a
    quarter of the screen width, v0.3) or become *relative* (a virtual stick: wherever the
    thumb lands is straight, sliding turns)? And should letting go of GO **brake**, as the
    mobile scheme above says ("release = brake/jog"), or just **coast** as the code does
    now (and the scheme is reworded)?

**Known gaps (honest list)**
- **No real phone has run v0.4.** Everything above is harness and headless Chrome
  (Playtest #3 was keys, not tilt or thumbs).
- An iOS home-screen app keeps its own storage, separate from Safari. Badges, stars and
  house rules made in a Safari tab do not carry over to the installed app, and the other
  way round.
- The medal times (25 / 30 / 36 s) and the taser rail speeds are keyboard-tuned. Tilt is
  slower, so re-tune them after a phone playtest.
- Audio is untested on an iPhone (unlock, ring switch, resume after the background).
- The lap medal ignores the foot drills. A decoy's +3 s shows only in the Line-up time.
- Every crook's first spawn is still (112,84) (v0.3 behaviour).
- **Touch control feel, left as v0.3 on purpose** (round 3 fixed the other touch-pass
  findings; these two are open Q15, not v0.4 fixes):
  - Thumb steering is absolute and its neutral point (x = ¼ screen width) lands on the
    EXIT/SIREN/TAZE column, so a thumb resting bottom-left presses a button or steers hard.
  - There is no brake on touch: letting go of GO only coasts (about 3 s from 34 m/s to
    EXIT speed), although the mobile scheme says "release = brake/jog". Parking in the
    bay by coasting works.
- **Kid lens, still open** (round 3 fixed the rest):
  - A phone kid will likely miss the keyboard-tuned 36 s bronze (the card now says "You
    graduated! Next: bronze under 0:36"). Graduating adds no stars (`gradStars` 0), so he
    stays CADET.
  - "Weave" is still in the slalom hints ("WEAVE AROUND THE CONES", "TILT TO WEAVE") and
    the drill line; the card's "Lap" covers only the slalom and gates, though it sits
    above all four drill times (a "Drive lap" label is for the co-designer).
- Landscape draw calls are above the portrait budget (patrol 66 at 844×390, 63 at
  667×375; the budget is measured in portrait), though below v0.3's 100 / 89 there.
- The service worker is untested on a real https host; the update path is described in
  the checklist.

**Next phone playtest — checklist**
- Tilt in a Safari tab **and** in the home-screen app (fullscreen, both orientations).
- The motion permission prompt (tap Allow) in both.
- Audio: the first tap unlocks sound. The ring switch mutes it (and the hint line makes
  sense). Sound comes back after locking the phone and returning.
- Thumb reach for TAZE, SIREN and BOOK, one-handed and two-handed.
- With motion denied (thumb steering): where the left thumb rests, whether it hits EXIT,
  and whether coasting to BOOK feels OK (open Q15).
- The Academy in under 4 min for a first-timer, with no grown-up help.
- The Grandma drill: does the OOPS land? Does he cuff her on purpose?
- SW update path: deploy a change, then reload twice. The second load shows the new
  build, and offline play still works.
- Badges in Safari vs the installed app (expect them separate).

**Next**: the phone playtest above over GitHub Pages (https). Then settle the open
questions: flip the house rules together and bake in the answers. Settle touch steering
and the touch brake (Q15), and re-tune the medals and rail speeds from real times. v0.5 candidates:
the foot race against a cadet, the load-up/BOOK drill, the minimap, building windows and
street decor, the Rogues' Gallery, and camera shake.

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
