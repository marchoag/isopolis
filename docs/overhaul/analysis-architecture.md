# CODE ARCHITECTURE & UI ANALYSIS (isopolis.html)

## SUMMARY (architecture map: the loops and who calls whom)

**One file, one global scope, no modules.** `isopolis.html` is HTML/CSS (lines 1–506) + one inline `<script>` (508–4664) after a CDN `three.min.js` (r128, line 507). Everything lives in module-level `let`/`const` globals; `init()` (4630) runs last.

**Three time bases, all driven from a single `requestAnimationFrame` loop `frame(t)` (4552):**

- **Per frame (every rAF):** camera smoothing/`applyCamera` (4557–4561), construction grow-in animations (4563–4569), cloud drift + city-lights fade (4571–4581), `updateCars` (4605), `updateSmoke` (4606), wind-rotor spin (4607), `updateAlerts` (4608, internally throttled to 0.2 s), zap/flame sprite pulsing (4611–4618), `flushGround()` (4620, redraws only dirty ground tiles), `renderer.render` (4621). Also **deferred-work flushes**: if `roadDirty` → `refreshRoads()`; if `powerDirty` → `recomputePower()`; if `mapsDirty` → `recalcMaps()` (4594–4596). These flags are the central decoupling mechanism — placement handlers just set a flag and the frame loop reconciles once.
- **Per sim tick (`TICK=0.36` game-seconds, accumulator `simAcc`, `growthTick()`):** up to 24 catch-up ticks/frame (4587–4588). `growthTick` (2497) samples **30 random cells** and develops/abandons them stochastically.
- **Per month (`MONTH_S=9` real-seconds at 1×, `monthly()`):** 2569. Recomputes maps, occupancy relaxation, tax income vs a 12-line expense model, milestones, elections, hints/toasts, and re-derives approval.
- **Fire sub-tick (0.8 s, `fireStep()`):** 4591.

`S.speedMul` (0/1/3/5) multiplies the accumulators (4584–4586); pause (0) freezes ticks but the rAF loop keeps rendering.

**Call graph for a player action** (e.g. zoning): pointer handler (3207) → `zoneRect`/`placeRoadPath`/`placePlant`/`placeStation`/`bulldoze` → mutate `grid` cells + set `powerDirty`/`roadDirty`/`mapsDirty` + call `recalcStats()`/`recalcDemand()` + `updateTop()`. Heavy spatial recomputes happen later in the frame loop. `develop()` (2483) is the one hot mutator that runs `recalcStats+recalcDemand+updateTop` synchronously on every level-up.

**The recompute pipeline** (all full-grid `O(N²)` scans): `refreshRoads` (2091, BFS access), `recomputePower` (2123, BFS flood from plants), `recalcMaps` (2303, the big one — coverage/traffic/pollution/land-value/crime/education/fire-risk, several with `R=16` neighborhood loops and 2 blur passes), `recalcStats` (2200), `recalcDemand` (2234), `recalcMood` (2264). `updateTop` (3603) is the UI reconciler and **recomputes approval every call** and calls `refreshToolbar`, `updateAmbience`, gauges, demand bars.

## STATE MODEL

**Global `S` object (declared 565–588, but grows ~30 more fields at runtime via assignment — not a closed schema).**

Declared fields: `seed`; `money` (start 25000); `devLean` (−100..+100 "mayoral record"); tallies `pop, capR, capC, capI, capF, capO, occC, occI, eduPop`; `dem{res,com,ind,farm,office}`; calendar `month, year`; election cycle `term, nextElectionYear, electionsWon, votedOut, peakPop`; failure counters `strikes, redMonths, failed, tutDone`; `speedMul, lastSpeed`; `cityName`; counts `roads, parks, plants`; grid load `netLoad, netCap`; `muted`; `milestonesHit{}`, `hinted{}`; `dens{res,com,ind}`; `view`; `tax` (default 7); service counts; averages `eduAvg, polAvg, crimeAvg, trafAvg, approval`; `fin`.

**Runtime-added `S` fields:** `plantUpkeep, zoned, preserves, wildTrees, clinics` (recalcStats 2230–2231); `greenSpace, green, _fullness` (recalcDemand); `growPress, restPress, popLean, recordLean, leanGap, _buildOut, _openLand, _lowUp, _harsh` (recalcMood); `unpowered` (2186); `covPolice, covFire, covEdu, covHealth` (2472); `wildTaken`, `_gapWarn`.

**Per-cell `makeCell()` (600):** `terrain` ('grass'|'water'), `tree` + `treeMesh`, `type` (18 values, see TYPE_CODE), `level` (0=vacant zone, 1..4 built), `occ`/`occ2`, `dens`, `powered`/`netOn`, `access` (+ runtime `farmAccess`), `mesh`, `anchor` (multi-tile builds: power=3×3, schools=2×2), `emitLocal`, `vSeed`, `burn`/`flame`, `circle`/`circleMesh`, `preType`/`preDens`. Runtime-added: `ptype`, `wild`, `decay`, `zap`, `windRotors`.

Grid is flat `Array(N*N)` (`idx(x,z)=z*N+x`, 543). Data maps are parallel `Float32Array(N*N)`: `polMap, lvMap, crimeMap, polCov, fireCov, trafMap, eduMap, eduCov, riskMap, healthCov` (595).

**Dead/vestigial politics state:** `S.recordLean` reset to 0 every `recalcMood` (2297) yet still read by `leanWords()` (4158). `S.devLean` written on preserve/develop actions (2799, 2890), saved/loaded, but **never read** — inert.

## SAVE FORMAT

**Manual file-based only.** `saveCity()` (4437) → JSON Blob download; `loadCity()` (4461) reads a picked file. **No localStorage, no autosave** — refresh discards the city.

**Format (`data.v:2`, 4451):** top-level keys `v, name, seed, money, month, year, milestonesHit, hinted, dens, tax, wildTaken, devLean, term, nextElectionYear, electionsWon, votedOut, peakPop, strikes, redMonths, tutDone, cells`. `cells` is a **positional array per cell** (4438–4450), 11 slots: `[waterFlag, treeFlag, TYPE_CODE, level, highDensFlag, occ(×10), occ2, anchor([x,z] or 0), circleFlag, ptype(or 0), wildFlag]`. Type via ordinal `TYPE_CODE`/`CODE_TYPE` (4435–4436).

**Load robustness:** gates on `v===1||2`, `Array.isArray(cells)`, `cells.length===N*N` (4462). Fields read with fallbacks; missing fields degrade gracefully; unknown extras ignored. Rebuilds meshes/roads/power/maps from grid (4503–4524).

**Extensibility verdict — moderately fragile, three hard edges:**
1. **`N` baked into compatibility** — `cells.length===N*N` means changing the 68 grid invalidates every save.
2. **Positional cell array + ordinal type codes** — append-only; reordering `CODE_TYPE` or inserting mid-list corrupts saves.
3. **No migration machinery** — `v:1`/`v:2` accepted identically; no `migrate(data)` exists. New systems should serialize into **new top-level keys**; bump `v` deliberately.

## UI SURFACES

All hand-written DOM with inline styles; `.glass` chrome class; handles cached at 3370–3382 (`$`).

- **Top bar `#top`** (HTML 323–356; `updateTop` 3603): funds, pop, date, **Approval stat** (click → `openApproval`), **lean meter** `#leanWrap` (tree↔crane, 337–341), speed buttons, icon buttons. `updateTop` is a monolith.
- **Demand panel `#demandPanel`** (358–367): RCI+F+O bars via `bar()` (3633–3644).
- **Side panels:** `#services` gauges via `setGauge(name,v,off)` (3568, keyed by `data-g`); `#mapPanel` from `MAPS` array via `buildMapPanel` (4288) — new overlay = `MAPS` entry + `viewMarks` branch (3104) + `VIEWS` entry (3102); `#tut` retired (`updTut` early-returns 3590).
- **Tool rail `#tools`** (371; `buildToolbar` 3437 from `TOOLS` 3392 + `TB_LAYOUT` 3427 + `GROUPS` 3422; flyouts `openFlyout` 3458; `refreshToolbar` 3514). New buildable = `TOOLS` entry + `TB_LAYOUT` slot + `KEYTOOL` key (3330) + pointerdown branch (3230–3236) + config + `*Parts` designer.
- **Modals:** shared `#overlay/#modal` (402) hosts paged welcome/help (`wpShow` 3814), budget (`openBudget` 4364), new-city confirm. Ad-hoc `.msModal` divs: `showMilestoneModal` (4030), `runElection` (4188), `cityFailed` (4252), `openApproval` (4107). These pause the game (`setSpeed(0)`) and rebuild innerHTML — the pattern a policy/council screen would follow.
- **Transient feedback:** `toast(msg,kind)` (3750, max 4); `hint(key,msg)` (3761, once-only); news ticker `#ticker` (`tickerMessages`/`pickTicker` 3768–3810); `#alertBar` via `updateAlerts` (4315, fires/power only); `#campaignBar` (3618–3629); hover chip `#chip` via `setChipHTML`/`tileInfo` (3676–3681); `#circlePopup` (4335).
- **Approval explainability kit:** `approvalParts()` (4050), `partDesc` (4063), `partsHTML`/`leanHTML` (4078/4086), `politicsAdvice()` (4164).

## PERFORMANCE

**Rendering budget is the ceiling.** Every building is its **own `THREE.Mesh` with its own merged `BufferGeometry`** (`setTileBuilding` 1637; `buildGeo` 993); shared `buildingMat` (988) so material state is cheap, but **no `InstancedMesh`, no cross-tile merging** — draw calls scale linearly with built tiles. Trees are individual meshes; ~7 cloud groups; 60-sprite smoke pool; up to ~320 cars; per-tile zap/flame sprites; one `Points` cloud for city lights. **A filled 68×68 city ⇒ a few thousand draw calls (2,000–4,000+)**, all shadow-casting into one 2048² map (scene rendered twice per frame). Batching/instancing by (type,level,dens) is the obvious lever and a prerequisite for a big graphics pass.

**Cheap:** ground = single canvas-textured plane redrawn incrementally (`flushGround` 942 + `dirtyGround`); overlay = second canvas plane; ortho camera; data views hide meshes (`setView` 3148).

**Hot paths (full-grid O(N²)=4,624 scans):** `recalcMaps` (2303, heaviest: R=16 coverage discs, 7×7 traffic scans, 2 pollution blur passes, 7×7 land-value/crime/education windows; runs every month AND on every `mapsDirty`); `recalcMood` (2264, 7×7 probe per high-dens res tile); `recomputePower` (2123) and `refreshRoads` (2091) BFS floods; `updateCars` (1949, full roadList scan every 0.5s); `updateTop` (3603, full approval recompute + `refreshToolbar` DOM writes, invoked from many mutators).

**Turbo caveat:** at speedMul=5, up to 24 growthTicks + multiple monthly() per frame (4588–4589), each monthly calling recalcMaps — frame spikes on large cities.

## TECH DEBT & CONSTRAINTS

1. **Duplicated, drifting approval math.** Full formula copy-pasted in `monthly()` (2635) and `updateTop()` (3612). Displayed "% needed to win" is `48+term*1.6` (2641, 3613, 3620, 4109) while the actual election threshold is `43+min(term,5)*2.2` (4193). **Extract a single `computeApproval()` and `winThreshold(term)` first.**
2. **Inert politics state.** `devLean` tracked/saved, read by nothing; `recordLean` force-zeroed (2297) yet consumed by `leanWords`. Revive deliberately or delete.
3. **`S` is an open, implicit schema.** ~30 fields created by assignment across recalc functions; `newCity`/`loadCity` must reset each by hand (3871–3882) — easy to leak state across cities.
4. **Globals + dirty flags are the nervous system.** `powerDirty/roadDirty/mapsDirty/lightsDirty`; new systems must set them correctly or show stale data. No event bus.
5. **No render batching.** Per-building meshes + full shadow pass cap city size and visual richness.
6. **Save format hard-couples to `N=68` and ordinal type codes.** Decide early: keep grid size or bump `v` with a migrator.
7. **Magic numbers scattered.** Income multipliers (2596–2601), expense model (2610–2616), growth probabilities (`d/140`, `d/165`), demand weights (2252–2256), mood (2286–2298), CAPS (525), PLANTS (517). A config table would de-risk rebalance.
8. **Retired-but-live tutorial.** `updTut`/`TUT_STEPS` (3579–3601) no-op; onboarding = paged welcome modal + one-shot toasts only. No in-world guidance hook for new systems.
9. **Monolithic event handlers.** Pointerdown dispatch (3230–3236) and keydown map (3330–3351) are flat ladders; `updateTop` is a do-everything reconciler. Plan a tool registry before adding tools.
10. **Single hard dependency:** three.js r128 from CDN (507). Decide whether to vendor it.
