# FEASIBILITY CRITIQUE — PACING & DIFFICULTY ("The Earned Metropolis")

Reviewed against `/home/user/isopolis/isopolis.html` (current file). Every cited line number was checked.

## OVERALL

This is an unusually well-grounded design. Nearly every integration point is real and correct: `zoneCost` 2721, `zoneRect` 2755, `placeRoadPath` 2723, `growthTick` 2497 (30 samples at 2498, `d/140` at 2521, `d/165` at 2531), `develop` 2483, `monthly` 2569 (occ fill 2590, jobsFactor 2586, expense table 2610–2616, redMonths 2623, bankruptcy 2626, milestone awards 2650–2661), `recalcDemand` 2234 (fullness 2248–2250), milestones 2536–2544, `tryCharge` 2673, `dezoneRect` 2777, pointerdown 3230–3236, `TOOLS` 3392 / `TB_LAYOUT` 3427 / `KEYTOOL` 3330, chip 3676/3681 with the reason-line pattern exactly at 3715–3721, ticker 3768, milestone modal 4030, `openBudget` 4364, `saveCity` 4437 / `loadCity` 4461, `constructionAnims` 4563–4569, `flushGround` 942. The parcel math is clean (68/4 = 17 exactly; 289 parcels; `parcelOf` correct for the flat `idx(x,z)=z*N+x` grid), and the v:3 save plan follows the file's actual tolerances (loader ignores unknown top-level keys; positional 11-slot cell array untouched).

Four real problems, in descending severity:

1. **The congestion gate as specified is a no-op.** `trafMap` holds *raw* load (tens on busy roads) and only on **road tiles** — buildings load their *nearest road* (2344–2356); zone tiles stay ≈0, and normalization (`/55`, `/60`) happens only at display (3115) and averaging (2379). `trafMap[i] < 0.72` at a building's own index passes essentially always. A coding agent would implement it verbatim and ship a gate that never fires.
2. **The design ignores elections entirely.** Campaign length goes from ~15 min to 8–15 hours at 1x, but elections stay every 4 game-years = every ~7.2 real minutes (4191), each a game-pausing modal. Worse: the new economy makes red months *normal* ("you were 3 months in the red... you learned"), but approval already takes −2.5/red-month up to −15 (2635), a recall loss confiscates 15% of treasury and shortens the term to 2 years (4243–4244), and two straight losses is a hard game-over (4247). The fiscal death spiral the design mitigates has an unmitigated political twin. This needs a companion patch (see V1 specs).
3. **The under-construction lifecycle is underspecified** — target level isn't stored (`c.buildL` missing from the state list), `growthTick` re-sampling of u/c tiles isn't excluded (the L0 branch would start a second project; the abandonment branch at 2511–2515 would decay level-up sites), zoneRect/dezoneRect/bulldoze/fire paths don't clear `stage/buildT`, and it's ambiguous whether a level-up start evicts the operating building ("emits no income" vs the incremental pool-need formula). A coding agent must invent all of these rules.
4. **Completion is a perf trap as written.** "Run the old develop body" per completed site means `recalcStats`+`recalcDemand`+`updateTop` (two full O(N²) scans + a DOM reconciler that recomputes approval and rebuilds toolbar state) per building — with `maxSites` up to ~126 and turbo months every 1.8s, that's potentially dozens of full-grid scans per real second. Completions must be batched: mutate all, recalc once.

Secondary gaps: the fullness/ownership filter is applied to `recalcDemand` (2248) but not to `recalcMood`'s independent open-land count (2268) — county fringe within 3 tiles of border roads would inflate `growPress`/`leanGap` and drag approval for land the player *cannot* build on; `toolCost()` (3417–3421) calls `zoneCost(t.id)` with no tile for the toolbar badge and breaks if the signature change has no fallback; the bond rating's `debt service ÷ income` divides by an income that is 0/null at founding (`S.fin=null`, 3881). All fixable in a line or two each — but only if the prompt says so.

Scope: as written this is 8 interacting mechanics plus UI in one pass — too much to land bug-free in one session. With the V1 trims below (drop pooled occupancy scaling, drop stalled-site collapse, single scaffold stage, respec congestion, add the election patch) it fits one long session with a second session for balance.

## VERDICTS

| Mechanic | Verdict | Reason |
|---|---|---|
| M1 Annexation (289 parcels, `S.owned`) | **keep** | Parcel math fits the grid exactly; single-writer `annexParcel` seam is sound; price formula is O(16). Must also ownership-filter `recalcMood`'s openLand (2268), not just `recalcDemand`'s (2248). Skip the optional "Land" overlay in v1. |
| M2 Zoning fees | **keep** | Smallest, safest mechanic; `zoneRect` already filters tiles and `tryCharge` exists; chip plumbing exists. One missed caller: `toolCost` 3418 needs a no-tile fallback. |
| M3 Migration/business pools | **keep-simplified** | Inflow/decay/start-gating: sound and O(1). The pooled *occupancy* scaling (two-pass over res tiles, negative-gain handling, mix `occ2` ambiguity) is the bug surface — defer to v2; meter population at start time instead (deduct 0.7×cap). |
| M4 Construction time + crews | **keep-simplified** | Right mechanic, underspecified lifecycle. V1: one scaffold stage (no halfway rescale), no stalled-site rubble collapse (pause countdown instead), explicit `c.buildL`, u/c exclusion in growthTick, cleanup in all clearing paths, batched completions. |
| M5 Materials + imports | **keep** | Already simple: one stock, production from `S.occI` (exists, 2229), auto-import charge at start. Only trap: `exp.imports` must be added to the *hand-summed* `expenses` line 2616 and to openBudget's rows. |
| M6 Bonds + credit freeze | **keep-simplified** | Grant cuts and bondCap table are trivial edits (2537–2543). Bonds fine. Fix the rating denominator (income can be 0/null). Freeze at 4 red months is fine *only with the election companion patch* — otherwise recall spirals arrive before the freeze teaches anything. |
| M7 Business cycle (`S.econ`) | **keep** | ~10 lines, O(1), hooks are all multiplications at points that exist. `monthsElapsed` must be derived (`(S.year-2000)*12+S.month`) — no such variable exists. |
| M8 Retuned constants | **keep-simplified** | Divisor changes (2521/2531), fullness dev-weight (2249), jobsFactor floor (2586): verbatim one-line edits, keep. **Congestion gate must be respecified** — as written it never fires (see Integration Errors #1). |
| Election companion patch (not in design) | **required addition** | 8–15 hr campaigns × 4-year terms = 60–120 pausing modals + recall/game-over risk compounding with the new deliberately-tight economy. Design's RISKS section misses it entirely. |

## INTEGRATION ERRORS

Verified-correct claims are listed in OVERALL; these are the errors and omissions:

1. **M8 congestion gate — wrong semantics, not just wrong number.** `trafMap` (2344–2380) accumulates raw `(occ+occ2)*0.6` onto each building's **nearest road tile** within a 7×7 scan; zone tiles hold ~0; values on roads are raw (avg computed as `min(trafMap[i]/60,1)` at 2379; map view normalizes `/55` at 3115). `trafMap[i] < 0.72` at the candidate tile's own index is always true → gate never binds. Correct form: find nearest road within 3 (reuse the 2348–2355 scan pattern) and gate on `trafMap[roadIdx]/60 >= 0.72`.
2. **`MAPS` is at line 4276, not 3102.** The design's "MAPS/VIEWS 3102/4288" mislabels: 3102 is `VIEWS`, 4288 is `buildMapPanel`. A "Land" overlay needs a `MAPS` entry (4276), a `viewMarks` branch (~3104), and a `VIEWS` entry (3102). Minor — the design marks this overlay optional.
3. **Missed `zoneCost` call site:** `toolCost(t)` at 3417–3421 calls `zoneCost(t.id)` (no tile) for the toolbar cost badge. Changing the signature to `zoneCost(kind, i)` without an `i===undefined` fallback (return BASE[kind]) breaks toolbar rendering.
4. **`monthsElapsed` (M7) does not exist** — must be derived from `S.year`/`S.month`. Trivial, but it's an invented identifier in an otherwise line-verified doc.
5. **`newCity` is at 3860**, not "~3871" — 3871 is where the reset block starts. Harmless (design hedged with "~"), noted for precision.
6. **The v:3 bump requires editing the version gate** at 4462 (`data.v!==1&&data.v!==2`) — the design says "bump to v:3" and "keep that style" but never lists this required edit; a coding agent following the letter of the integration list would produce saves the loader rejects.
7. **`exp.imports`/`exp.bonds` (M5/M6):** the expense total at 2616 is a **manual sum** of named fields, and `openBudget` (4364) renders a hand-written row list — both must be edited in addition to the `exp` object at 2610–2615. The design cites the line range but not that the sum is manual.
8. **Ownership filter incomplete (M1):** design patches `recalcDemand`'s `_open` (2248) but not `recalcMood`'s `openLand` (2268), which feeds `growPress`/`leanGap` (approval −0.16/pt, election pressure, "land sits empty" toast at 2636) and `S._buildOut` (prosperity bonus at 2634). County land within 3 tiles of a border road counts as buildable room the mayor is blamed for not filling.

## SIMPLIFIED V1 SPECS

**M3-v1 (pools gate starts only; no pooled occupancy pass).**
- State: `S.pool={res:12,biz:4}`. Monthly, after `recalcDemand()`: inflow exactly as designed, with a hard floor `S.pool.res += Math.max(1, (3+S.pop*0.022)*attract)`; then decay `S.pool.res*=0.94`, `S.pool.biz*=0.94`.
- Start gate in `growthTick`: res/mix start at level `l` needs `S.pool.res >= need`, `need = Math.ceil((capOf(c,l)-capOf(c,c.level))*0.7)`; deduct on start. com/ind/office/mix-jobs: `need = Math.ceil(newJobCap/6)` from `S.pool.biz`. Farms bypass.
- Do NOT touch the occupancy loop at 2575–2601 (the 0.7 start deduction meters population; the untouched 0.35 gap-close only fills the remaining 30%). Defer the design's G-scaling pass to v2, and if adopted then: sum positive gains only, shrinkage always applies, `occ2` never pool-limited.
- UI: the two counters in `#demandPanel` (358–367) and the chip reason line are mandatory (design is right that they're load-bearing).

**M4-v1 (single-stage construction, batched completion).**
- `startConstruction(x,z,l)`: sets `c.stage='uc'`, `c.buildL=l`, `c.buildT=BT[l]` (`BT=[0,2,3,5,8]`, farm 1); charges pools (M3) and materials (M5); increments a plain counter `S.sites` (recomputed in `recalcStats` by counting `stage==='uc'`).
- **growthTick exclusion:** immediately after the type check at 2501, `if(c.stage==='uc') continue;` — this must come *before* the abandonment block at 2511.
- **Level-up semantics (pick one, spec it):** the existing building keeps operating during a level-up (income, occ, power unchanged); only L0→1 sites are non-emitting. Scaffold mesh (grey `buildFor(type, l)` at scale-y 0.35 via `setTileBuilding` + `constructionAnims` push) for L0→1 only; level-ups keep the old mesh and just pop the new one at completion. No halfway rescale.
- **Cleanup:** `zoneRect` (2769), `dezoneRect` (2784), bulldoze, and the fire/rubble path must clear `stage/buildL/buildT` (pools/materials NOT refunded — that's the anti-cycling rule, matching M2's no-refund stance).
- **Completion in `monthly()`:** decrement all `buildT`; for each that hits 0 run only the mutation part of `develop` (level, occ seed, mesh, dirty flags); after the loop, call `recalcStats(); recalcDemand(); updateTop();` **once**. If the grid lacks headroom at completion (`S.netLoad+delta>S.netCap`), hold the site one month (chip: grid full) instead of completing into a brownout.
- **Cut from v1:** stalled-site collapse to rubble. A u/c site without access/power simply doesn't decrement (chip explains). Add collapse in v2 if hoarding u/c sites becomes an exploit.

**M6-v1 (bonds with a safe rating).**
- As designed, plus: `const inc = Math.max(200, S.fin ? S.fin.income : 200);` rating = A if `interest/inc < 0.15`, B `< 0.30`, else C (no new issues). Everything else (5k blocks, 2% origination, recession surcharge, freeze at `redMonths>=4` blocking starts+annexation) as designed.
- **Election companion patch (required):** `S.nextElectionYear = S.year+8` (4191) and probation `+4` (4244); soften the red-months approval term at 2635 from `Math.min(redMonths*2.5,15)` to `Math.min(redMonths*1.25,10)`. Also update the two "% needed" displays (2641, 3613/3620) or, better, take the architecture report's advice and extract `winThreshold(term)` first — the displayed bar (48+term·1.6) and real bar (43+min(term,5)·2.2, line 4193) already disagree.

**M8-v1 (congestion, respecified).**
- At a level≥3 start attempt: scan the 7×7 neighborhood for the nearest road (pattern at 2348–2355); if found and `trafMap[ri]/60 >= 0.72`, skip with chip reason "Gridlock". 49 cells × ≤30 samples/tick is negligible. All other M8 constant changes verbatim as designed.

**M1-v1 trims:** ship tint + hover chip + toast; defer the dashed parcel-border overlay and the "Land" map view. Founding tract, price formula, `annexParcel` single-writer, POLITICS stub: as designed. Add the `recalcMood` ownership filter (Integration Error #8).

## PERF & SAVE CONCERNS

**Perf.**
- The one real hazard is per-completion `recalcStats/recalcDemand/updateTop` (see OVERALL #4) — batching is mandatory, and it should be stated in the implementation prompt, not left to taste. Everything else the design adds to `monthly()` is O(1) or one O(N²) pass, on top of a `monthly()` that already runs full `recalcMaps` — acceptable, matching the design's own risk note.
- `annexParcel` → `recalcDemand()` is one O(N²) scan per click; fine. Ground tint redraw is 16 tiles per annex; fine via `dirtyGround`.
- Turbo: at 5x, months every 1.8s; pool/buildT flows are month-denominated so pacing integrity holds (design is right). The 24-tick catch-up guard (4588) is unaffected — new growthTick work is a few comparisons per sample.
- growthTick's pool/materials checks are O(1); the congestion respec adds a bounded 49-cell scan only for level≥3 candidates.

**Save.**
- v:3 plan is sound and matches the file's real tolerances: unknown top-level keys are ignored today, positional cells untouched, `N=68` coupling unchanged. Must-do details: widen the gate at 4462 to accept v 1–3; serialize `S.owned` as `Array.from(S.owned)` (a raw `Uint8Array` JSON-stringifies as `{"0":1,...}`); include `buildL` in the `constr` triples (it's the design's `[i, level, buildT]` "level" — name it unambiguously).
- **Loader must rebuild scaffolds:** the mesh-rebuild loop at 4504–4521 only handles `isDev(c)`/civic/power; u/c tiles (level 0 + constr entry) need a branch that restores `stage/buildL/buildT` and the grey scaffold mesh, or loaded cities show invisible construction that pops out of nothing.
- **Migration:** the "owned = any parcel containing road/zone/building + 3×3 around densest parcel" heuristic is reasonable and errs generous (old sprawling saves own most of the map — correct grandfathering). Define "densest" as most developed tiles. Edge case worth one test: a v2 save whose roads cross the whole map grants ownership of nearly everything — acceptable, but confirm demand damping (`_open` owned-only) doesn't crater such cities on load. Migrated defaults (`pool`, `mat=40`, `econ=1`) are fine.
- `newCity()` (3860) must reset every new field (`owned`, `pool`, `mat`, `bonds`, `econ`, `econDrift`, `sites`, and per-cell `stage/buildL/buildT` via the existing `makeCell` reset) — the architecture report's open-schema warning is real; the design acknowledges it.
