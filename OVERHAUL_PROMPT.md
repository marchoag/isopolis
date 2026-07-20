# ISOPOLIS 10× OVERHAUL — MASTER PROMPT

You are a coding agent working on `isopolis.html` — a single-file (~4,666-line) HTML5 isometric
city-building game: Three.js r128 (CDN, line 507) + Canvas ground textures + WebAudio synthesis.
No build step, no server, zero external assets. 68×68 tile grid. SimCity-2000-inspired.

This prompt is the product of a full multi-agent design cycle: five analysts deep-read the current
code (every line number below was verified against it), three designers produced overhaul tracks,
six adversarial critics tore the designs apart for fun and feasibility, and the surviving spec was
synthesized here. **Where this prompt conflicts with the reference docs in `docs/overhaul/`, this
prompt wins** — it already incorporates the critics' corrections. Read the reference docs when you
implement the corresponding phase; they carry extra detail and rationale.

Line numbers refer to the file as of the commit this prompt landed in. After your own edits they
will drift — treat them as anchors and re-locate by searching for the cited identifiers.

---

## 1. THE MISSION

The owner's verdict on the current game: *"real legs, needs a 10× improvement."* Three complaints,
in ascending priority:

1. **Pacing** — the map fills far too quickly and the game is too easy. This is a gameplay-logic
   problem, not a clock problem. Building a metropolis should feel earned.
2. **Graphics & sound** — "cute and in the right direction," but both should improve markedly.
   Keep the charm; add light, life, and a real audio identity.
3. **Politics (the #1 priority)** — simulate the real challenges of building a real city. The
   owner's motivating image: on real city maps a road runs perfectly straight, then suddenly
   curves around something — because someone or something was in the way, politically or legally.
   Land you cannot touch. Stakeholders who fight back. Compromises that leave permanent, visible
   scars on the map. It must be accurate, realistic, and — crucially — **fun**.

### Design principles (binding)

- **Fun beats realism** whenever they conflict. The best mechanics deliver both.
- **Friction must be a decision, not a wait.** Every blocked action shows why it's blocked and
  what the player's options are. Every "no" comes with at least one "yes, if…".
- **No modal spam.** Drama arrives through the ticker, map chips, and occasional earned
  set-pieces. Full-screen interruptions are reserved for elections, era changes, disasters, and
  game over.
- **Politics constrains building** — it gates actions on the map; it is not a score.
- **Political friction IS pacing.** Money gets scarce (economy track); *permission* becomes the
  other scarce resource (politics track). The two are designed to interlock.
- **The village is protected.** Early game ≈ current game's freedom. Friction scales with city
  size along the existing milestone ladder.
- **The game stays playable after every phase.** Never leave the file broken at the end of a
  session; verify by opening it in a browser and playing for ten minutes.
- **Keep the charm.** Candy-bright low-poly tabletop-miniature look. If a screenshot could pass
  for a generic Three.js archviz demo, you've lost.

---

## 2. CURRENT-STATE FACTS YOU MUST KNOW

(Full detail: `docs/overhaul/analysis-*.md`. These are the load-bearing facts.)

**Why it's too easy today:** `zoneCost()` returns 0 (line 2721); zones paint in free bulk
rectangles (`zoneRect` 2755). `growthTick` (2497) runs every 0.36 game-seconds, samples 30 random
tiles, develops instantly (`develop` 2483 — the 0.45s build animation is cosmetic) with
probability `d/140` (L0→1, line 2521) / `d/165` (level-up, 2531). Demand damping (`_demDamp`,
2247–2250) only bites when the map is nearly full. Milestones inject **§424,000** of free cash
(2536–2544). The only failure state (10 red months → bankruptcy, 2626) is unreachable in normal
play. Net: the 68×68 map fills in ~10–15 minutes at 1× speed, ~2–4 at turbo.

**Why politics is toothless today:** approval is a 0–100 scalar (formula duplicated at 2635 and
3612 — they must be unified) feeding a 4-year election (`runElection` 4188). **Nothing political
ever blocks a build action.** The displayed win bar (`48+term*1.6`, at 2641/3613/3620/4109) does
not match the real one (`43+min(term,5)*2.2`, 4193) — the HUD lies. A whole political-identity
axis is scaffolded and dead: `S.devLean` (568) is written (2799, 2890) and saved but never read;
`recordLean` is hardcoded to 0 (2297); `WILD_STEP` (524) is never referenced; `wildTaken` (2889)
is write-only; the 'Out of step' approval branch (4069, 4121) is unreachable. Wild preserves are
seeded at genTerrain 750–767 with the literal comment *"the politics layer will read this."*
When a road drag crosses a preserve, `placeRoadPath` (2723, filter at 2726) silently **skips**
the blocked tiles, leaving a **gap** — not a bend. The signature moment is almost in the code.

**Rendering:** one `MeshLambertMaterial{flatShading, vertexColors}` for every building (988);
`NoToneMapping` (611); static sun (642); binary day/night color lerp (4412–4431); fake AO via a
height gradient in `buildGeo` (993–1043, `_sh` at 1028); water is painted canvas pixels. **Every
building is its own shadow-casting mesh — a full city is 2,000–4,000+ draw calls rendered twice**
(shadow + color). No instancing anywhere. Camera: orthographic, 4-snap rotation, excellent wheel
zoom-to-cursor (3314–3328) — keep it.

**Audio:** a ~120-line WebAudio layer (3903–4027): 3-oscillator drone + noise wind + bird chirps
+ ten `beep()` one-shots. No music, no ADSR, no reverb, no stereo, no master bus/limiter.
Ambience only updates from `updateTop()` (3632), not the frame loop, so it freezes during idle
play. `sClick` (4021) is defined but never called. Major events (outages, protests, game over,
construction) are silent.

**Architecture:** everything is module-scope globals. Dirty flags (`powerDirty/roadDirty/
mapsDirty`) are the nervous system — the frame loop (4552) reconciles them once per frame. Heavy
recomputes (`recalcMaps` 2303, `recalcMood` 2264, `recomputePower` 2123, `refreshRoads` 2091) are
full-grid O(N²) scans. `monthly()` (2569) is the once-per-month hub. `S` is an open schema (~30
fields added by assignment at runtime) — `newCity` (3860, resets ~3862–3885) and `loadCity` must
reset every new field you add, explicitly. Save format (`saveCity` 4437 / `loadCity` 4461): v:2
JSON, an 11-slot positional array per cell (indices 0–10) — **append-only**, never reorder;
unknown top-level keys are ignored by the loader (safe extension point); the version gate at 4462
(`data.v!==1&&data.v!==2`) must be widened when you bump to v:3; `N=68` is baked into save
compatibility (`cells.length===N*N`) — do not change the grid size.

---

## 3. PHASE 0 — PREREQUISITES (do these first, in one pass)

1. **Unify the approval math.** Extract a single `computeApproval()` used by both `monthly()`
   (2635) and `updateTop()` (3612), and a single `winThreshold(term)` = `43+min(term,5)*2.2` used
   by every display (2641, 3613, 3620, 4109, 4120) and by `runElection` (4193). The HUD must stop
   lying. This is a hard prerequisite for every politics change.
2. **Config table.** Add one `const CFG = {...}` near line 524 collecting every tuning constant
   this overhaul introduces or modifies (growth odds, pool coefficients, land pricing, PC costs,
   faction deltas, the 24-number council stance table, era gates…). No new magic numbers inline.
3. **Save v:3 machinery.** Widen the gate at 4462 to accept v 1–3. New systems serialize as **new
   top-level keys** (loader ignores unknowns — verified safe). Per-cell additions append at
   **indices 11 (`age`) and 12 (`landmark`)** — the current array is 11 slots, 0–10; do not
   miscount. Serialize any TypedArray via `Array.from(...)` (a raw `Uint8Array` JSON-stringifies
   as an object). Add a dev-mode round-trip assert: `save → load → deepEqual` on a populated city,
   run once at startup behind a `?dev` query flag. v1/v2 saves must load cleanly with all new
   state defaulted (specifics per phase below).
4. **Election companion patch.** The campaign is about to get 10–30× longer; elections every 4
   game-years would mean dozens of pausing modals, and the new deliberately-tight economy would
   compound the −2.5/red-month approval penalty and the recall spiral (15% treasury seizure at
   4243–4244; second loss = forced `newCity()` at 4247). Change: terms to **8 game-years**
   (`nextElectionYear = year+8` at 4191; probation +4 at 4244), soften the red-months approval
   term to `min(redMonths*1.25, 10)`.
5. **Mode split: Classic / Campaign.** A flag chosen at `newCity`: **Classic** ≈ current rules
   (free zoning, full grants, no pools/politics gates — the sandbox toy that exists today);
   **Campaign** = everything in this prompt. Implement as CFG presets, not code forks. This is
   the hedge against v1 tuning being too harsh, and it is nearly free once CFG exists.
6. **Chip & marker manager** (needed by politics, useful everywhere). The existing
   `showCirclePopup` (4335) is a single fixed element positioned once and dismissed by any canvas
   click — it proves the anchoring math (`tileToScreen` 4327) and nothing else. Build a small
   manager (~150–200 lines): anchored chips that track the camera (reposition each frame or on
   camera change), dynamic title/body/buttons, persist until resolved. **v1 rule: at most ONE
   open chip at a time** (clicking another marker swaps the chip) — this kills z-order, clutter,
   and layout problems at a stroke. Plus small 3D marker meshes (picket sign) with a load-time
   rebuild pass.

---

## 4. PHASE 1 — PACING & ECONOMY ("The Earned Metropolis")

Reference: `docs/overhaul/design-pacing.md`, corrected by `critique-pacing-fun.md` and
`critique-pacing-feasibility.md`. The corrected spec follows. The economy rests on four legible
scarcities — **land, people, money, traffic** — and deliberately NOT more than that.

### 4.1 Land & annexation (tracts)

The map is divided into **289 4×4-tile tracts** (`tractOf(i) = (z>>2)*17 + (x>>2)`;
`S.owned = Uint8Array(289)`). At `newCity`, the city owns the 3×3 tract block (≈144 tiles)
nearest map center with the fewest water tiles. Everything else is **county land**: rendered
desaturated/sepia via a tint in the ground-canvas draw path (`flushGround` 942 region), faint
dashed borders while the Annex tool is active.

- County land blocks zoning, plops, parks, preserves, roads (filter in `zoneRect` 2755,
  `placeRoadPath` 2723, all plop placers, with a toast naming the price). The road-access BFS
  (2091) still *crosses* county land — roads lead to the frontier — but nothing builds there.
- Price: `basePrice(t) = Σ over 16 tiles (§22 + lvMap[i]·§120) × cityScale × S.econ`, water
  tiles §6 flat, `cityScale = min(2.5, 1 + S.pop/12000)` (the cap keeps late-game infill a
  project, not a mortgage). Typical: §1,000–1,400 early, §2,500–4,000 mid, §6,000–9,000 prime
  infill.
- **Annex tool** (new `TOOLS` 3392 / `TB_LAYOUT` 3427 / `KEYTOOL` 3330 entry + pointerdown
  branch 3230): hover shows a chip with price/avg land value/water count. **Drag to annex a
  rectangle of tracts in one purchase** (one aggregated price, one `tryCharge` 2673) — this is
  the fix for "289 near-identical purchases": fewer, weightier, player-sized buys.
- **The single seam to politics:** `annexParcel(tractRect)` is the ONLY writer of `S.owned`.
  Final offer = `basePrice × POLITICS.sellerMul(t)`, allowed iff `POLITICS.canAnnex(t).ok`.
  Ship neutral stubs (`sellerMul()=1`, `canAnnex()={ok:true}`) so Phase 1 works standalone;
  Phase 2 replaces them. **Annexation buys the county's unowned tiles; privately-owned lots
  inside a tract (Phase 2 homesteads/holdouts) remain private after annexation** — buying the
  frontier does not buy the family farm on it.
- Demand headroom: the fullness computation (2248) and **also `recalcMood`'s openLand count
  (2268)** count only owned, accessible tiles — the critics caught that patching only one lets
  county fringe inflate `growPress` and drag approval for land the player cannot build on.

### 4.2 Zoning fees

`zoneCost(kind)` (2721): flat per-tile fee `BASE = {res:10, com:14, ind:12, farm:3, mix:24,
office:20}`, ×2.2 when the active density paint is high. **No land-value term** — land value is
already priced at annexation; charging it twice reads as nickel-and-diming. `zoneRect` shows the
running total in the drag chip and charges once via `tryCharge`; reject the whole rect with a
shortfall toast if unaffordable. De-zoning refunds nothing. **Trap:** `toolCost(t)` (3417–3421)
calls `zoneCost(t.id)` with no tile — keep a no-argument-safe signature or the toolbar breaks.

### 4.3 The migration pool (the core brake) — residential only

`S.pool = {res: 12}`. **There is no business pool** — commercial/industrial/office keep their
existing demand-based gating (a second pool duplicated demand and was killed in review).

- Monthly inflow, after `recalcDemand()`:
  `attract = clamp(0.3 + 0.5·jobsSignal + 0.06·(7−tax) + 0.6·(green−0.45) − polAvg·1.0 −
  crimeAvg·0.8, 0.05, 1.5) × S.econ`, with
  `jobsSignal = clamp((capC+capI+capF+capO − pop·0.6)/max(pop·0.5, 25), −0.6, 0.6)`.
  `S.pool.res += max(1, (3 + pop·0.022) × attract)` — the `max(1,…)` floor is enforced in code,
  not a footnote (anti-death-spiral).
- Gentle, **visible** impatience: decay ×0.97/month; when cumulative lost families since the
  last notice reach ≥3, emit a ticker line *"N families gave up waiting — no homes ready."*
  Never a silent leak.
- **Start gate** in `growthTick`: a res/mix start at level `l` needs
  `pool.res ≥ need = ceil((capOf(c,l) − capOf(c,c.level)) · 0.7)`; deduct at start. Farms bypass.
  **Do NOT add a second pool deduction in the monthly occupancy loop** (2575–2601 stays
  untouched) — the 0.7 start deduction meters population; the existing 0.35 gap-close fills the
  rest. (The original design double-charged the pool; this is the fix.)
- UI (load-bearing, not optional): a "👪 waiting: N" counter in the demand panel (358–367), an
  **inspectable attract breakdown** (hover/click: jobs +0.2, taxes −0.1, pollution −0.3, …) —
  the growth rate is a score the player engineers, so they must be able to read it — and a chip
  reason line ("🕰 Waiting for new arrivals") on pool-blocked tiles (`tileInfo` 3676, reason-line
  pattern at 3715–3721).
- One **active lever**: "Regional marketing campaign" (budget panel): §-cost, +40% inflow for 6
  months. This is also the recession counter-play.

### 4.4 Construction takes time (visible, batched, single-stage v1)

Split `develop` (2483) into `startConstruction` / `completeConstruction`.

- Start (from growthTick where develop is called today, 2521/2531): checks pool (4.3), materials
  (4.5), credit freeze (4.6). Sets `c.stage='uc'`, **`c.buildL=l` (the target level — store it
  explicitly)**, `c.buildT = BT[l]`, `BT=[0,2,3,5,8]` months (farm 1). Show a grey scaffold:
  `buildFor(type, l)` geometry, shared flat-grey material, scale-y 0.35, via `setTileBuilding` +
  `constructionAnims` (4563). One stage in v1 — no halfway re-scale (Phase 3 upgrades visuals).
- **growthTick exclusion:** immediately after the type check at 2501:
  `if(c.stage==='uc') continue;` — placed BEFORE the abandonment block at 2511, or level-up
  sites decay and L0 tiles start twice.
- **Level-up semantics:** the operating building keeps running during a level-up (income, occ,
  power unchanged); only L0→1 sites are non-emitting (1 MW draw). Level-ups keep the old mesh
  and pop the new one at completion.
- **Cleanup:** `zoneRect` (2769), `dezoneRect` (2784), bulldoze, and the fire/rubble path must
  clear `stage/buildL/buildT`. No refunds of pool/materials (anti-cycling).
- **Completion (batched — this is a hard perf requirement):** in `monthly()`, decrement all
  `buildT`; for each hitting 0 run only the mutation body of old `develop` (level, occ seed
  `cap·0.15`, mesh, dirty flags, `sGrow`); after the loop call
  `recalcStats(); recalcDemand(); updateTop();` **once**. Per-completion full recalcs would run
  dozens of O(N²) scans per second at turbo. If the power grid lacks headroom at completion,
  hold the site one month (chip: grid full).
- **No concurrent-site cap** (killed in review: undialable, redundant with money/materials) and
  **no stalled-site collapse** in v1 — a site without access/power simply pauses its countdown,
  chip explains.
- **Save:** new top-level key `constr: [[i, buildL, buildT], ...]`; the loader's mesh-rebuild
  pass (4504–4521) needs a branch restoring `stage/buildL/buildT` + the grey scaffold, or loaded
  cities show construction popping from nothing.
- **Ceremony (do not skip):** completion sparkle + settle sound; first-tower fanfare; a small
  flourish on each annexation. The overhaul deletes §363k of milestone dopamine; celebration
  must replace it or slow growth reads as "being told no."

### 4.5 Materials — the industry dilemma, framed as money

`S.mat` stock (start 40); production `+= occI·0.7`/month; a start consumes
`ceil(newCap·0.8)` units; shortfall **auto-imports at §7/unit × clamp(S.econ,0.9,1.3)**, charged
at start time into a new `exp.imports` budget line. Hard-block a start only when the treasury
cannot cover the import (chip: "🧱 Materials shortage — build industry or top up the treasury").
Present it as money: the budget modal (4364) shows "materials produced locally (saved §X) /
imported (cost §Y)" — local industry is a *discount* on growth; dirty-vs-clean is the standing
dilemma. **Trap:** the expense total at 2616 is a **manual sum** and `openBudget` renders a
hand-written row list — `exp.imports` (and `exp.bonds`, 4.6) must be added in all three places.

### 4.6 Money: grants → bonds, and failure that bites

- Milestone cash (2537–2543) cut to `[500, 1000, 2000, 4000, 8000, 15000, 30000]` (total §60.5k,
  down from §424k). Each milestone instead raises a **bond ceiling**:
  `bondCap = [10k, 20k, 35k, 60k, 100k, 160k, 250k]` (base §6k pre-Hamlet). Milestone modal
  (4030) copy: "…and the bond market will now underwrite §35,000 of Isopolis debt."
- Bonds: `S.bonds={principal:0}`; issue/repay in §5,000 blocks from a new section in
  `openBudget`. **No origination fee** (cut in review). Monthly interest by rating:
  `const inc = max(200, S.fin ? S.fin.income : 200)` (the safe denominator — income is null at
  founding); A (`interest/inc < 0.15`) 0.5%/mo, B (`< 0.30`) 0.7%/mo, C otherwise 1.0%/mo and
  no new issues. **No recession surcharge in v1** (it was one coupling too many in the
  death-spiral analysis). Interest is `exp.bonds`. The existing 2%/mo overdraft charge (2609)
  stays.
- **Credit freeze:** at `redMonths ≥ 4` (counter at 2623), all new starts and annexations halt;
  existing sites finish. Escalating warnings are mandatory: ticker at 2 red months, alert-bar
  alarm at 3 — the freeze must never be the first the player hears of trouble. This makes the
  10-month bankruptcy (2626) a cliff you visibly slide toward.

### 4.7 The business cycle

`S.econ ∈ [0.65, 1.35]`: `1 + 0.28·sin(2π·(monthsElapsed+phase)/300) + drift`, where
`monthsElapsed = (S.year−2000)*12 + S.month` (derive it — no such variable exists), `phase`
seed-derived, `drift` a ±0.02/mo random walk clamped ±0.10. Hooks: migration ×econ, tract prices
×econ (recessions are annexation sales, up to −35%), ticker/toast at cycle turns. **Grace
period: no recession (clamp econ ≥ 0.95) below 1,000 pop.** The marketing campaign (4.3) is the
active recession answer.

### 4.8 Growth-roll retuning — generosity, not stinginess

- **Keep `d/140` and `d/165` as they are.** (The original design halved them; review killed
  that: with pools/money/land as the real gates, the dice must be *generous* so satisfied gates
  convert to visible action. The dice are texture now, not throttle.)
- **Sample from an eligible list, not the whole grid:** maintain an array of develop-eligible
  zoned tiles (update on zone/dezone/develop/abandon) and let `growthTick` draw its 30 samples
  from it. Early game (~20 zoned tiles) this makes every ready tile get examined most ticks —
  the pool binds, not the RNG lottery. (Without this, review math showed one start per ~35–40s
  while migrants pile up.)
- **Pioneer guarantee:** the first 6 residential starts of a new city bypass the dice roll —
  minutes 1–3 always show construction.
- Fullness: dev-weight 0.12 → **0.5** at 2249, `open` counting owned accessible tiles only —
  demand decelerates smoothly as owned land fills; annexation visibly re-opens the tap.
- `jobsFactor` floor 0.45 → **0.30** (2586).
- **Congestion gates towers — respecified** (the design's version was a no-op: `trafMap` holds
  raw values and only on road tiles, per 2344–2380; normalization exists only at display).
  Correct form: at a level ≥3 start attempt, scan the 7×7 neighborhood for the nearest road
  (pattern at 2348–2355); if `trafMap[roadIdx]/60 ≥ 0.72`, skip with chip reason "🚗 Gridlock —
  heavy traffic blocks the tower crane." Playtest against real trafMap distributions at 20k+ pop
  so dense cores can't hard-lock.

### 4.9 The growth advisor (mandatory UI)

One aggregate line, updated monthly (demand panel or top-bar advisor): *"Last month: 9 starts ·
blocked: 6 by migration, 3 by funds, 0 by traffic."* Per-tile chips are forensics; this is the
diagnosis. It is also your tuning instrument: **at any city size, one gate should usually
bind** — early: pool; mid: money/land; late: congestion/land. If the binding gate rotates every
month, retune.

### 4.10 Pacing targets & progressive disclosure

- Targets at 1×: a complete-feeling small town at **~30 minutes**; all systems singing by
  **hour 3–5**; filling the whole map is an explicit optional capstone beyond that (8–15 h),
  not the campaign spine.
- Disclosure rides the milestone ladder: pool always on; materials narrated at Hamlet; bonds at
  Village; first recession only after ~30 minutes of play. Five systems introduced one at a time
  is a tutorial; five at once is a tax form.
- Recommended: a tiny headless balance harness (a `?sim` flag that loops
  `monthly()`/`growthTick()` with scripted inputs and logs pop/treasury curves) before deep
  tuning — the constants above are paper-tuned estimates.

---

## 5. PHASE 2 — POLITICS ("The Map Fights Back") — the owner's #1 priority

Reference: `docs/overhaul/design-politics.md`, corrected by `critique-politics-fun.md` and
`critique-politics-feasibility.md`. The corrected spec follows.

Vision in one line: land has owners with names; your own early buildings age into constituencies
that resist you; a five-seat council elected from the city you actually built must bless your
biggest moves; every large action has three exits — pay dearly, fight for months, or build
around — and each exit leaves a different permanent mark on the map.

### 5.1 Data model

- **Per-cell (append-only save slots — indices 11 and 12, the current array is 0–10):**
  `c.age` (months at level ≥1; increment inside `monthly()`'s existing occupancy loop ~2575 —
  no new scan; cap 255 in the save) and `c.landmark` (0/1).
- **Sparse lot map** `let lots = {}` (module-level, beside `grid`): idx → Lot. Only tiles where
  ownership matters (expect < ~200). Lot = `{i, kind:'homestead'|'tenure'|'trust'|'landmark',
  nameSeed, faction, attach:0..1, refusals:0, since, flags}`. Owner display names generate from
  `nameSeed` + two ~20-string name tables (stable across save/load; saves stay small).
  Created **lazily**: a tile becomes a Lot the first time a player action touches it (aged res)
  — or at map-gen (homesteads, trusts). *(Terminology: economy "tracts" are the 4×4 annexation
  blocks; politics "lots" are per-tile private ownership. Keep the names distinct in code.)*
- **`S.pol`** (init in the state block, reset in BOTH `newCity` and `loadCity` — `lots` too;
  the open-schema leak warning applies with full force):
  `{pc, pcCap, fav:{growth,neighbors,greens,labor}, council:[5 seats], upzoned:{},
  docket:[], court:[], petitions:[], protests:[], edTaken, graft, scandal, greenbelt}`.
  Era is **derived** from `milestonesHit` (don't save it; fewer ways to go stale).
- **Resurrect the dead scaffolding** (this is the overhaul's spine, verified line by line):
  `devLean` (568) finally read; `recordLean = round(S.devLean)` (un-stub 2297) — `leanWords`
  (4157) and the 'Out of step' approval part (4069, 4121) come alive: when
  `|recordLean − popLean| > 45`, emit part `['Out of step', −(gap−45)·0.15]`. `WILD_STEP` (524)
  finally referenced (5.7). `wildTaken` (2889) finally read. `growPress/restPress` (2264–2300)
  feed faction favor. Reserve blobs honored as trust lots.
- **Homestead seeding** (genTerrain, after 750–767): 4–7 homestead lots (1–3 tiles each, a small
  farmhouse via the existing house part-builders, ≥10 tiles from center, deterministic from
  `S.seed`). **v1/v2 save migration: create NO homestead lots** (loadCity never re-runs
  genTerrain and the deterministic tiles may now hold towers); build trust lots only, from tiles
  already saved as `type='preserve', wild=true`; ages default `level*36` months.

### 5.2 Political Capital (PC) — the currency of permission

`S.pol.pc`, cap `12 + 4·era`, laurel icon in the top bar (hidden until era ≥ 1). Regen in
`monthly()`: `+1 + max(0, floor((approval−50)/12))`; +3 on election win, **+2 per milestone**
(this is the interlock: the economy starves money, politics rations permission). Spends —
**fights only**: file eminent domain (5, escalating), whip a council seat (3), ballot campaign
push (2/point), negotiate with a protest (3). *(Fast-track and quell spends were cut in review:
PC buys fights, not queue-jumps. Calendar time is always the free alternative.)* An unaffordable
button renders disabled with "need N⚖ — regenerates with approval."

### 5.3 Factions & favor

Four factions, favor −100..+100, decaying 10% toward 0 yearly. **Chunky, attributable deltas
only** — no ±2/month micro-drifts; anything worth −2/mo forever becomes one −8 with a headline.
Growth (developers): likes development on demand, upzoning, ED-for-roads; hates greenbelts,
landmark sprees, demand left unmet. Neighbors (homeowners/NIMBY — powered by the existing
`restPress` engine): hates tenured homes bulldozed (−3 each), ED takings (−8; −12 for homes),
towers by parks; likes landmarks endorsed (+6), petitions conceded (+5). Greens: reads
`wildTaken` (−2/wild tile), pollution trend, `green` (2239); +2 per preserve placed (2789).
Labor: likes job growth, public works (+2 each); hates blackouts (`unpowered>5`), tax >9%.
**Trap:** `jobsFactor` is a local const inside monthly's loop (2587) — hoist to `S._jobsFactor`
so Labor can read it. Favor bars live in the City Hall panel (`bar()` at 3633 is a closure over
the demand DOM — write a fresh 5-line snippet, don't reuse it).

### 5.4 Lots, owners & holdouts — who sells, at what price, who fights

- `landFMV(i) = round(60 + 340·lvMap[i])` — **economy-owned**; politics only multiplies for
  owned lots.
- A tile is owned when: seeded homestead/trust, or a built res tile with `age ≥ 24` months at
  the moment an action first touches it. Com/ind/office sell at 1.25× FMV, no drama.
- `attach = clamp(0.15 + years·0.03 + (homestead?0.45:0) + 0.2·eduFrac + rng()·0.3 −
  (lv<0.35?0.1:0), 0, 1)` — rolled once at creation.
- Offer rungs: FMV 1× / Generous 2× / Whatever-it-takes 3.5×. Sells iff `mult ≥ 1 + 3.5·attach`.
  **attach > 0.71 = true holdout — money cannot buy it.** Each refusal: `refusals++`, future
  asks ×`(1+0.35·refusals)`; each neighbor bought out within radius 2: remaining owners
  `attach += 0.05` (last-one-standing pride).
- Softening: yearly `attach −= 0.03` if you improved their block (park/school within 4, or lv
  rose ≥0.1); `+= 0.02` if pollution rose. Holdouts get a 0.06/yr life-event roll: *"the owner
  passes / retires"* → heirs sell at 2×. The map heals on its own clock.
- **The human echo:** every buyout ≥2× emits one ticker sentence (*"The Alders leave the valley
  after 40 years"*). Displacement-as-simulation is scope creep; displacement-as-sentence is
  free and makes paying 3.5× feel like a choice with weight.
- `polAcquire(tiles, purpose, tier) → {placed, blocked, landCost}` is the ONLY gateway through
  which build actions touch owned lots. **Route ALL of these through it or gate them with
  `polBlocked`:** `placeRoadPath`, `zoneRect`, bulldoze, **and the three plop paths the design
  missed — `placePark` (2803), `placePlant` (2815), `placeStation` (3002), which all reach
  `clearForPlop`** — otherwise a clinic is a free holdout-clearance tool.

### 5.5 THE SIGNATURE MOMENT — the road that bends

The flow, end to end (rework `placeRoadPath` 2723–2734; the filter at 2726 currently makes
gaps):

1. **Drag preview** (previewRoad/hoverPreview ~3051–3207): every tile of the line is color-coded
   live — **white** (clear), **gold** (owned, will auto-buy; chip shows road § + land §),
   **red** (holdout/preserve/landmark/protest — cannot buy). The three-color legend is how the
   player learns the entire lot vocabulary; it is v1 core, not polish. **Clicking a red preview
   tile (or any lot marker, any time) opens the same chip with the same exits** — experienced
   players who self-detour mid-drag must still be able to reach the story.
2. **Release:** build white tiles; auto-purchase gold tiles (one folded `tryCharge`); **stop
   clean at each red tile — two stubs, NO gap-fill, no road on the blocked tile.** Picket-sign
   marker rises; ONE toast (*"Ada Merced won't sell — her family's homestead. The road stops at
   her fence."*); persistent anchored chip pins the site; ticker line. No modal. No pause.
3. **The chip offers the exits:**
   - **[Offer whatever it takes — §N (3.5×)]** — greyed with a story if attach > 0.71 (*"She
     isn't selling. It was her grandmother's."*). For lesser owners it simply works.
   - **[File eminent domain — 5⚖]** — era-locked before Township. Council next month, then a
     3-month court case (5.6). Win: road completes, Neighbors −12, maybe pickets. **Lose: the
     lot becomes a landmark — closed forever.**
   - **[Route around — §N]** — hover draws the live dashed detour on the overlay canvas; the
     price varies with the path (so Route Around is not always the dominant button); click
     builds the bend.
   - **[Never mind]** — refund and remove the stubs. The fourth honest exit; without it the
     moment has a trapped edge.
4. **The scar:** the road jogs around the farmhouse, permanently legible. Neighbors +3 (*"the
   mayor went around"*). Years later the heirs may sell — but by then the player has zoned along
   the bend, and straightening means demolishing their own buildings. The map has grown a story.
5. Every later blocker — a landmark you endorsed in year 6, a protest camp, greenbelt land —
   arrives through the **same chip, same exits**. The grammar stays constant while the story
   changes; that is what keeps the tenth occurrence a genre, not a rerun.

**Route-around A\* (v1 spec — the design under-specified it four ways):** 4-connected grid,
start = last placed stub before the first blocked tile, goal = the drag endpoint, Manhattan
heuristic. **Traversable: only currently-clear land** (`empty`/`rubble`/tree, not water, not in
the avoid set) — no buy-through, no demolition en route; because traversal is clear-land-only,
*latent lots cannot materialize mid-route* (an aged res tile is by definition not empty). Avoid
set: every existing Lot tile, preserves, landmarks, protest tiles ±1. **Cost: 20/tile + 8 per
direction change** (the turn penalty produces a legible dogleg, not an A\* staircase);
tie-break toward the original line. Multiple blocked tiles in one drag: route once, from before
the first, avoiding all. **No path:** the button renders disabled — *"No clear route — the land
beyond is closed"*; the other exits remain.

**Frequency guardrail (era-scaled, instrumented):** an average village-era road should hit
**≤1 holdout**; if >2, the attach roll is too hot. Scarcity is what keeps a signature moment
signature. Err cold.

### 5.6 Council, docket, eminent domain

- **5 districts:** Core (r<10 of map center) + NW/NE/SW/SE. `distOf(x,z)` is 3 lines.
- **Census** piggybacks `recalcMood`'s existing scan (no new O(N²) pass): per district —
  Neighbors = tenuredHomes + 3·landmarks; Growth = com/office/high-dens + (growPress>0.5?5:0);
  Greens = parks + preserveTiles/2 − (localPolAvg>0.4?3:0); Labor = ind+farm +
  (unpowered>5?4:0). Seat = argmax, incumbent ×1.15, seeded ±10% noise. **Reseat at elections
  only in v1** (no midterms — one rhythm, one code path). The city you build literally elects
  the council that constrains what you build next.
- **Docket** (needs a vote: ED filings; wild expansion past the threshold (5.7); landmark
  demolition (4/5); district upzoning; nuclear siting): items file → resolve at next
  `monthly()`. NO modal — a chip confirms filing; results arrive as ticker + one toast. Vote:
  seat yes iff `stance[faction][type] + fav[faction]/40 + local + 1.2·whip − (scandal?0.8:0) >
  0`, `local` = −1.0 for ED/demolition/upzoning in the seat's own district (NIMBY), +0.8 for
  parks/schools. **Write the full 24-number stance table into CFG before coding** — never
  invent stances inline. Pass = 3/5 (landmark demolition 4/5). Whip: 3 PC per seat, from the
  docket panel, projection updates live. v1 projection: "Projected: N/5" + one line naming the
  most-opposed seat and why; per-seat reason strings are v2. Failed items re-file after 6
  months.
- **One City Hall inbox:** docket + petitions + court cases + the ballot — ONE timeline list in
  the City Hall panel, sorted by resolution date, one visual grammar. (Five separate pipelines
  was the design's process-overload problem; this is the fix.) City Hall panel = a
  player-opened `.msModal` in the `openApproval` (4107) pattern: favor bars, council seats,
  inbox, exposure meter.
- **Horse-trading (the drama the design missed):** about once per game-year, a councillor ASKS
  for something concrete (*"I'll vote yes on the crossing if the old reserve edge becomes a
  park"*) — a chip with accept/decline, a stored one-line promise, favor consequences either
  way. One event per year, highest drama-per-line addition available; without it the docket is
  eventually solved arithmetic.
- **Eminent domain:** file from a holdout's chip (5 + edTaken PC — each taking escalates,
  mirroring WILD_STEP). Council passes → 3-month court case: `P = base(purpose) −
  0.15·min(edTaken,4)·(era≥3) − (neighborsFav<−30?0.1:0) + (blighted?0.15)`; base 0.8 for
  road/park/school/plant, 0.45 for private redevelopment. **No "outside counsel" micro-buy**
  (cut). Monthly ticker drumbeat. Win: pay 1.5× FMV, transfer, `edTaken++`, Neighbors −12,
  40% protest if Neighbors < −20, `devLean += 1.0`. **Lose: §1,500 costs and the lot becomes a
  permanent landmark** — the risk that makes route-around genuinely attractive.

### 5.7 Landmarks, wild land, the Greenbelt ballot

- **Landmarks — your own city fights back.** Eligible: `level ≥ 2`, `age ≥ 120` months,
  `lvMap ≥ 0.5`. Monthly, if Neighbors favor > 0 or `restPress > 0.4`: chance `0.04 + 0.02·era`
  that ONE eligible building is nominated (cap 1 active, total ≤ 3 + 2·era). Chip, 2-month
  fuse: **Endorse** (default on ignore — the anti-homework call): `c.landmark=true`, joins
  `protectedStruct` (2709), +6 Neighbors, +4 approval. **Contest**: docket item. Demolishing a
  landmark later: 4/5 council + §5,000 + Neighbors −20. v1 defers: the landmark lvMap/green
  aura (touches recalcMaps internals) and midnight demolition (graft v2). Landmarks block
  roads/zoning exactly like preserves — late-game straight lines must thread between buildings
  the player themselves grew in year 3. This is the crown-jewel mechanic; protect it.
- **Wild pricing — WILD_STEP finally wired** (bulldoze preserve branch 2886–2896):
  `WILD_BASE + WILD_STEP·wildTaken` (§300, §310, §320…), doubled while Greens < −30.
  **Blob identity does not exist in the code** (genTerrain paints overlapping noisy discs that
  can merge or skip) — so v1 uses `wildTaken` thresholds instead: a docket vote is required
  once `wildTaken ≥ 25`; the **Greenbelt ballot** fires once at `wildTaken ≥ 60`: a hardcoded
  January ballot — `yes = 50 + greensFav·0.35 + neighborsFav·0.15 − growthFav·0.2 −
  (approval−50)·0.25 ± campaign` (2 PC/point either way, from the City Hall panel). Passes:
  `greenbelt=true`, remaining wild tiles frozen forever via `polBlocked` + hatched overlay —
  a permanent player-caused scar. Fails: Greens −25, protests, the land is yours. Both
  outcomes redraw the map; that's the point.
- **Environmental review: CUT ENTIRELY.** (Both critics, independently: a delay with no
  decision attached is a toll booth, not a puzzle — and its ghost-tile state was the one real
  save-format landmine. If review flavor is wanted, it's a docket item type for marquee cases
  like nuclear siting.)

### 5.8 Petitions, upzoning, protests, graft

- **Upzoning ordinances (era ≥ 3):** painting high-density in a district requires that
  district's one-time ordinance (`S.pol.upzoned[dist]`) — one chunky council vote per district,
  ever; existing high-density grandfathered.
- **Petitions (v1: exactly two triggers):** high-density painted within 3 tiles of ≥5 tenured
  homes; ind/coal placed within 4 of ≥5 homes. ONE live petition, 2-month fuse, others drop
  silently. Meeting card in the City Hall inbox — three buttons: **Concede** (revert the
  offending tiles to prior zone — store prev type/dens at filing; +5 faction, +1 PC goodwill);
  **Compromise** (those tiles permanently density-capped one step lower via a `c.densCap`
  check in the growth path; +2 faction) — **the scar is automatic; NO tracked
  place-a-park-in-6-months obligations** (quest-log homework, cut); **Press on** (−8 faction,
  50% protest). Fuse expiry = Press on, −2 approval.
- **Protests (v1):** `{i, cause, monthsLeft:3}` — spawn from pressed petitions (50%) and ED
  wins (40% if Neighbors < −20). Physical marker: picket sign + 3–4 pulsing sprites (reuse the
  activeZaps pattern 4611–4614; instanced crowds arrive with Phase 3's pedestrian system).
  Effects: `polBlocked` radius 1 (blocks the exact tiles you wanted next — a spatial puzzle),
  approval −1 each (cap −3). Resolutions: wait it out (−2 faction) or Negotiate 3 PC (+2
  faction, ends now). Max 3; **police clearance is v2 and must then be INSTANT and costly**
  (Labor −10, Neighbors −6, approval −4, 25% respawn doubled) — a month-long council approval
  for a crackdown annihilates the temptation, and the temptation is the mechanic.
- **Graft & scandal (v1: two call sites only):** the holdout chip ("encourage a sale" — sells
  at FMV, graft +3) and the docket panel ("guarantee this vote" — one seat flips, graft +2).
  Monthly detonation chance `graft·(0.4+0.6·era)%`. **Detonate in two waves** (wave 1:
  headlines + approval −10; wave 2 a month later: PC→0, Growth −20, council −0.8 for 12
  months) — the single simultaneous detonation was a death spiral. Exposure meter: three-word
  label (low / rising / severe), never numbers — dread, not arithmetic. Second career scandal →
  recall election: **new code, not reuse** — the recall machinery lives inside `runElection`'s
  loss branch (4243–4246), so set `nextElectionYear = S.year` + a `recallPending` flag checked
  by the trigger at 2649.

### 5.9 Elections rewired; memory & celebration

- `runElection` (4188): replace the blind swing with
  `swing = clamp(Σ fav_f·w_f/100·6, −6, +6) + rand·4−2`, era-weighted (Growth counts more in a
  boomtown, Neighbors in a metropolis). The election modal's "what moved the vote" panel (4214)
  gains a faction line — the same bars the player watched all term. Elections become the sum
  of four relationships, not a dice roll.
- Approval: add `− protests.length·1.0 − (scandal?14:0)` to `computeApproval()`.
- **Scars are trophies:** when a bend/park/landmark resolution completes, offer a one-click
  naming prompt ("Merced Park"); named places get their name in the hover chip forever.
  **Anniversaries:** the ticker remembers (*"Ten years since the road bent at the Merced
  line"*) — a timestamp and a string table; cities remember, so this game should.
- **Late-game tuning target (stated, instrumented):** a determined mayor can clear-and-rebuild
  one old-core block per ~2 game-years without graft. Metropolis players want to renovate the
  core; if tenure + landmarks + district NIMBY make the center read-only amber, the endgame
  died. Tune softening/heirs/upzoning to this number.

### 5.10 Era ladder (friction scales on the existing milestone spine, 2536–2544)

Era 0 (<600 pop): politics asleep — no PC, no factions UI, every owner sells at FMV; preserves
block as today. Era 1 (600): factions + PC appear, homestead lots wake (first possible bend),
petitions begin. Era 2 (1,500): council + docket, ED, landmarks begin, WILD escalation. Era 3
(3,500): upzoning ordinances, protests, ballots, scandal press. Era 4 (7,500+): holdouts
throughout the old core, landmark caps rise, one political event per year is normal. At every
era: a player who never engages politics can still grow — outward, around, slower. Friction
shapes *where and when*, never *whether*.

---

## 6. PHASE 3 — PRESENTATION (graphics & sound)

Reference: `docs/overhaul/design-presentation.md`, corrected by `critique-presentation-fun.md`
and `critique-presentation-feasibility.md` (the feasibility critic verified every Three.js r128
API claim against the actual shipped build — trust its R128 REALITY CHECK section). Target: the
tabletop miniature graduates from "lit by a fluorescent office ceiling" to "photographed on a
sunlit windowsill."

### Session A — the look and the sound change (lowest regression risk, ship first)

1. **Continuous time-of-day** (replaces the binary toggle at 4412–4431). `S.tod ∈ [0,24)`;
   **DAY_S = 600s of real time, NOT scaled by speedMul** (the design's 120s×speed gave a
   24-second strobe day at 5×; review killed it). Keyframed ramp (pre-dawn 5.0 → sunrise 6.5 →
   noon 13 → **golden hour 17.5** → dusk 19.5 → night 21+) driving sun position/color/intensity,
   hemi, bg, fog, exposure; night compressed to ~20–25% of the cycle. Sun sweeps a real arc —
   **no quantization** (0.4° steps at that sweep rate = 6–8 shadow jumps/sec; let PCF radius 3.2
   mask the smooth crawl); **clamp shadow-casting elevation ≥ ~15°** (paint dawn/dusk with color
   and exposure, not an 8°-elevation shadow pass the 2048 map can't resolve); **shadow ortho
   ext 80 → ~100** (map half-diagonal is ~96 — swept azimuths clip corners otherwise), and fold
   in the fitted-frustum-when-zoomed + texel-snapping from G9. Keep `nightT` as a derived value
   so its ~10 consumers keep working. **Time-lock controls (mandatory):** presets — noon /
   golden hour / night / running clock — on the N key and night button; **data views force
   neutral daylight** (nobody reads a pollution heatmap by moonlight). Moon mode: repoint the
   same DirectionalLight, windows emit per-vertex (kills the flat global emissive hack at 4424).
2. **Grounding pass:** baked vertex AO in `buildGeo` (ground-contact `ao = 1 − 0.30·e^(−y/0.55)`
   + inter-mass AABB darkening ×0.86) and soft contact-shadow ellipses under buildings/trees in
   `drawTile` — the single most "toy photograph" move available. Ground fidelity: `PX` 32→48
   **for the ground canvas only — split the constant; the overlay canvas (673) shares `PX` and
   must stay 32** or you double two huge GPU uploads. Crosswalks at junctions (roadMask 911
   knows connectivity), road dashes, wet-sand shoreline.
3. **PBR + environment.** `MeshStandardMaterial{vertexColors, flatShading}` for buildings/trees
   (988–989) with per-vertex roughness/metalness/emissive via `onBeforeCompile` — the exact
   chunk-replace strings in the design doc are verified present in r128; add the startup assert
   (`fragmentShader.includes('float roughnessFactor')`) so a future three upgrade fails loudly.
   **Emit `aRM`/`aEmit` unconditionally in `buildGeo`** — wind rotors (1342) and fire/police
   vehicles (1868–1869) share `buildingMat`; a geometry missing a declared attribute silently
   becomes glossy plastic. **Glass: metalness ≤ 0.15, roughness ~0.2, KEEP the vertex-color
   brighten hack** — candy windows with sheen on top, not archviz gray-with-glints (the
   charm-killer review flagged). Procedural equirect sky canvas → `PMREMGenerator` →
   `scene.environment`; 4 pre-baked PMREMs (dawn/noon/dusk/night) swapped on the tod ramp.
   **Tone mapping is an audition, not a decision:** implement a settings toggle
   None / Reinhard(1.4) / ACES(1.25) with the palette compensation pass
   (`offsetHSL(0,+0.07,+0.02)` + light retune), A/B a fixed camera bookmark of a dense city at
   golden hour, and default to whichever keeps the candy. There is no shame in Reinhard.
4. **Audio spine (S1–S4 + the frame-loop fix).** Master bus: `masterGain →
   DynamicsCompressor(−18, 12, 4, 0.005, 0.25) → destination`; music/amb/ui/sfx sub-buses;
   `duck()` on salient one-shots; volume sliders (localStorage; saves untouched); the 🔊 button
   mutes `masterGain` instead of gating every call site. `voice()` ADSR + filter-envelope
   primitive replaces `beep()` (3996); rebase all ten SFX presets on it. ConvolverNode reverb
   from a generated 2s decaying-noise stereo impulse (send: sfx 0.12, nature 0.3, civic stings
   0.4). `StereoPanner` by `tileToScreen(x)` screen position. **Move ambience updates out of
   `updateTop` (3632) into a throttled `updateAudio(dt)` in `frame()`** — this is a bug fix,
   not a feature. Raise the ambience cap (`min(0.06, pop/90000)` — today's bed is inaudible).
   **Zoom-aware mix:** one master lowpass driven by `camera.zoom` — zoomed out is wind and
   muffled hum, zoomed in opens street detail.

### Session B — performance + life

5. **Chunked batching (the perf prerequisite — full corrected spec in
   `critique-presentation-feasibility.md` §BATCHING V1):** 16 chunks of 17×17 tiles, one merged
   `BufferGeometry` mesh each; completed buildings bake in, **animating buildings stay
   individual** and bake on completion. The traps the review closed — implement all of them:
   `c.geoData` must store the grid index `i` (**`clearMesh(c)` receives no coordinates** from
   its 13 call sites — the index inside geoData is how a chunk gets dirtied); `wx/wz` are the
   actual mesh position (multi-tile anchors at 4514/4518, not `tileCX`); `constructionAnims`
   records need `{x,z}` added for the completion bake; the flame-height test at 2927
   (`c.mesh?…`) must become `(c.mesh||c.geoData)` or fires on merged buildings render at ground
   level; **`setView` (3145–3148) — not the frame loop — owns building visibility** and must
   toggle chunks + instanced trees; `loadCity` must pass `noAnim` and bake directly (else
   thousands of pop-in anims on load); `computeBoundingSphere()` per chunk rebuild; ≤1 chunk
   rebuild/frame via a `dirtyChunks` Set; pooled scratch arrays. Trees → 5-geometry
   `InstancedMesh` with `setColorAt` (free instance slots in `clearTree` paths). **Cars stay
   individual in v1** (~320 draws was never the problem; 3,000 building draws were). Measure
   gate: `renderer.info.render.calls` on a full save — target <100 by day.
6. **Construction stages (visualizes Phase 1's build times):** dirt groundbreaking →
   scaffold + floor-quantized rise (`scale.y` jumps per floor — work, not stretching) →
   squash-settle 1.06→1.0 completion beat. Crane + topping-flag are v2. Progress ring + stage
   name in the hover chip.
7. **Generative score** — 16-step look-ahead sequencer (setInterval 100ms scheduling ≤250ms
   ahead — immune to rAF throttling; on tab-wake, jump `nextNoteTime` forward, never
   machine-gun missed notes). A-minor-pentatonic over Am7–F–C–G; layers gate on population
   tiers (hamlet = lone pad, metropolis = full arrangement — a progress bar you hear); pad
   cutoff tracks approval (`700 + approval·14` Hz — the score audibly sours when the city turns
   on you); night bells; election snare-brush. **Plus the two review additions that decide
   whether it survives hour three: rest periods** (play 2–3 min, rest 1–2 min while ambience
   carries, re-enter on a game event) **and a second progression or modal shift per era/season**
   — harmonic weather for long sessions. Voice-count cap ~24.
8. **Event sound coverage (S7) with repetition governors:** wire `sClick` (dead at 4021) to
   toolbar/flyout handlers via uiBus; construction hammers (bandpassed noise taps, panned to
   site) — **attenuate by zoom, cap global taps/sec, duck under the score** (twenty sites must
   not be a woodpecker infestation); power outage sweep + a buzz for the first seconds of the
   banner only; game-over sting (3-note minor descent, everything ducked — distinct from
   election loss); treasury sigh on *entering* the red, then quarterly at most; bar-synced coin
   shimmer replaces per-tick `sCash` above 1× (gating quirk at 2618); dawn/dusk transitions;
   save/load chimes.
9. **Night glow stopgap:** additive sprite glow on `cityLights` + headlight points (~25 lines).
   **Real bloom is v2 with an LDR threshold ~0.75** — the design's threshold-1.0 premise is
   broken on r128: tone mapping is compiled into materials even for render-target passes
   (verified in the build source), so nothing ever exceeds 1.0 and the bright pass selects
   black. Do not implement the design's G5 as written.

### Session C — narrative & delight

10. **The Isopolis Ledger** — the politics feedback organ. A broadsheet modal (`.msModal`
    pattern, 4030): CSS paper, serif masthead, mad-lib headlines from the month's event queue,
    weather box. **The killer trick:** the "photo" is a real halftone-filtered screenshot of
    the event site. Correct capture recipe (the naive version breaks): save camera state →
    `clearOverlay()` → aim + `applyCamera()` + `renderer.render()` **synchronously in the same
    task** (`preserveDrawingBuffer` is false) → `drawImage` a **crop** into a small ~640×400
    2D canvas → `toDataURL` *that* (full-canvas encode at DPR 2 is 200–500ms; the crop is
    ~10–20ms) → restore camera before the next visible frame. **Frequency governor (mandatory):
    hard interrupts ONLY for election results, era changes, disasters, game over — everything
    else lands as a folded "EXTRA!" toast** the player opens at will; at most one auto-open per
    game-year, coalescing queued stories into one issue; never mid-drag. **Archive** the last
    ~12 front pages (HTML + data URLs) — a popup becomes a chronicle of your reign.
11. **Holdout dressing:** the defiant cottage keeps its mesh among towers (the contrast IS the
    message); instanced picket-fence segments; a signboard mesh with a canvas-lettered "NOT FOR
    SALE" texture; amber pulse ring while negotiation is open; seeded canvas owner avatar in
    the chip.
12. **Photo mode:** one key — frame, "Greetings from Isopolis — pop. 12,400" caption, download.
    The Ledger already built the capture machinery; this is hours of work and it is the game's
    marketing department.
13. **Tactile charm:** jelly-bounce on building click/hover (a dozen lines on the existing
    easeOutBack); sympathetic neighbor-jiggle on placement; a visible wooden diorama base edge
    with a brass city nameplate at the map's south rim — every screenshot says "tabletop
    miniature" before a building is placed.

### v2 backlog (do not attempt in the first pass)

Real LDR bloom · water shader (self-contained, good first v2 item) · pedestrians + headlights +
instanced protest crowds (upgrade Phase 2's sprite protests when this lands) · free camera orbit
(**right-drag is taken** — pan at 3227, stroke-cancel at 3224, and `KEYTOOL.e` shadows the E
rotate at 3330/3346 which is already dead code; orbit needs a new gesture, a design decision) ·
weather & seasons (the snow-mask snippet uses view-space `geometryNormal` — needs
`inverseTransformDirection`; overcast must be rare and short: sunlight is the vision, weather is
an event, not a climate) · council chamber roll-call panel · full paper-and-brass HUD restyle
(the approval trend sparkline can ship any time — it's an afternoon) · car instancing +
junction-claim traffic.

---

## 7. CROSS-TRACK CONTRACTS (respect these exactly)

- **Land pricing vs. land politics:** economy owns `landFMV(i)` and tract `basePrice`; politics
  owns who sells and who fights (`sellerMul`, `canAnnex`, `polAcquire`, `polBlocked`). Neither
  reaches into the other's side.
- **Terminology:** economy **tracts** (4×4 annexation blocks, `S.owned`) vs. politics **lots**
  (per-tile private ownership, `lots{}`). Annexing a tract does NOT buy the private lots inside
  it.
- **Milestone split:** economy cut the cash (§424k → §60.5k) and pays in bond ceilings; politics
  pays in PC (+2/milestone). Both must land or holdouts become brute-forceable / money stays
  meaningless.
- **Construction progress** (`c.stage/buildL/buildT` and its save key) is owned by Phase 1;
  Phase 3's stage visuals consume it read-only.
- **Protests** are owned by Phase 2 (state, rules, sprite markers v1); Phase 3 upgrades their
  rendering to instanced crowds when the pedestrian system exists.
- **Shared touchpoints** — `frame()`, `setTileBuilding`, `monthly()`, the save format — change
  in this order: Phase 0 → 1 → 2 → 3. Each phase's save keys are independent top-level keys.

## 8. DEFINITION OF DONE, PER PHASE

After every phase: open the file in a browser; new city; play ≥10 minutes at 1× and 5×; save,
reload the page, load the save; load a pre-overhaul v2 save if one exists. No console errors,
no NaNs in the top bar, the round-trip assert passes. Phase 1 adds: the growth advisor shows a
sane binding gate; a deliberately mismanaged city hits the credit freeze *with* its warnings.
Phase 2 adds: draw a road through a seeded homestead — the full signature flow works end to end
(preview colors → stubs → chip → all four exits, including Never Mind and a working
route-around with the turn penalty visible in the path). Phase 3 adds:
`renderer.info.render.calls` < 100 on a full city; the tone-mapping A/B bookmark exists; audio
survives a backgrounded tab.

## 9. THE KILL LIST (decided — do not re-add)

Business/firm pool · concurrent-site cap ("crews") · growth-dice nerf (d/240, d/300) · silent
impatience decay · land-value term in zoning fees · bond origination fee · recession bond
surcharge (v1) · environmental-review ghost tiles · police clearance as a docket item ·
fast-track and quell PC spends · outside counsel · favor micro-drifts · buffer-park obligation
timers · per-completion full recalcs · Ledger interrupts for routine events · ACES as a
foregone conclusion · the 24-second day · semi-metal candy glass · design-doc G5 bloom as
written · midterm council reseats (v1) · reserve blob identity (v1) · env-review, again,
because someone will be tempted.

---

*Reference library: `docs/overhaul/` — five code analyses (`analysis-*.md`), three design docs
(`design-*.md`), six critiques (`critique-*.md`). This prompt is authoritative where they
disagree; they are richer where they don't.*
