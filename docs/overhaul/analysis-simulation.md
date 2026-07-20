# SIMULATION & PACING ANALYSIS (isopolis.html)

## SUMMARY

The simulation is a fixed-cadence random-sampling loop with almost no economic friction on construction. The main loop (`frame`, lines 4552-4592) accumulates real time scaled by `S.speedMul` and drains it into three independent clocks: `growthTick` every `TICK = 0.36` game-seconds, `monthly` every `MONTH_S = 9` game-seconds, and `fireStep` every 0.8s. At the default 1x speed that is **2.78 growth ticks per real second** and one month every 9 real seconds; the speed buttons offer 0/1/3/5 (lines 343-346), so Turbo (5x) runs **13.9 ticks/sec** and a month every 1.8s. Each `growthTick` (line 2497) takes only **30 random samples** across the entire 68×68 = 4,624-tile grid, and for each sampled zoned tile rolls development against demand: level 0→1 succeeds with probability `(d/140)*boost` (line 2521), level-ups with `(d/165)*boost` (line 2531).

The gates on development are thin and cheaply satisfied: a tile must have road `access` (BFS ≤3 tiles from any road for urban, ≤8 for farms, lines 2098-2119), be `powered`/`netOn` (a flood-fill from plants that only fails if total `netCap` is exceeded, lines 2123-2165), and have demand `d > 0` (L0→1) or `d > 4` with occupancy ≥55% of cap to climb higher (lines 2520, 2528-2529). Crucially, **zoning is free** — `zoneCost()` hard-returns 0 (line 2721) — and zones are painted in bulk rectangles (`zoneRect`, line 2755) with no per-tile charge, no land price, and no construction timer: `develop()` (line 2483) instantiates the building instantly on a successful RNG roll and seeds occupancy at 15% of cap (line 2486). The only cosmetic "build time" is a 0.45s scale-up animation (line 4566) that does not touch the sim.

Money flows structurally toward surplus. The city starts with **§25,000** (line 567), the only build costs are roads (§20/tile), plants (§1,800-14,000), and a handful of service plops, while monthly income scales with occupancy (res occ×1.05 up to office occ×2.0, lines 2596-2601) and **seven milestones dump §1,000 → §250,000** of free cash as population climbs (lines 2536-2544, awarded at 2650-2661). The only failure state is bankruptcy after **10 consecutive months in the red** (line 2626); at tile level, buildings only abandon if starved of power/access or demand `< -32` for 6+ ticks (lines 2511-2515). There is no labor pool, no materials, no permits, no terrain cost — so nothing meaningfully throttles a player who threads roads and drops a plant.

## MECHANICS

- **Tick cadence** — lines 4582-4592 — `simAcc += dt*speedMul`; `while(simAcc>=TICK) growthTick()`. Ticks/sec = `speedMul/0.36` → 2.78 (1x), 8.33 (3x), 13.9 (5x). Months/sec = `speedMul/9`. A 24-tick-per-frame guard (line 4588) never binds at 60fps.
- **growthTick sampling** — lines 2497-2534 — 30 `Math.random()` picks over 4,624 tiles per tick; non-zoned picks are skipped (line 2501). A specific zoned tile is examined with prob ≈ `30/4624 = 0.0065` per tick; the whole map shares a ceiling of 30 development attempts per tick.
- **develop()** — lines 2483-2493 — instant: sets `level`, seeds `occ = max(occ, cap*0.15)`, spawns mesh, recalcs stats/demand. No cost, no timer.
- **Level 0→1 roll** — lines 2517-2521 — requires `access` AND (`netOn` for non-farm) AND `netLoad+consAt(c,1) ≤ netCap` AND `d>0`; then develops if `random() < (d/140)*boost`.
- **Level-up roll** — lines 2522-2531 — cap `mx` = 2 (low-dens) / 3-4 (high-dens/mix/office, land-value gated) / office gated by `eduMap`; requires `d>4`, `occ ≥ 0.55*cap` (line 2529), grid headroom; develops if `random() < (d/165)*boost`.
- **boost / env multiplier** — lines 2506-2508 — `env = (0.55+0.9*lv)*(1-cr*0.5)*healthFac` for res/com/office (ind/farm env=1); `boost = (parkNear?1.15:1)*env`. Early game `lv≈0.5, cr≈0` → env≈1.0.
- **Occupancy fill** — line 2590 — monthly: `occ += (target-occ)*0.35`, `target = cap*_pw*_ac*(0.55+0.45*clamp(d/100))`. This is the real climb-rate limiter for towers, tied to `MONTH_S`.
- **Jobs/labor as SOFT factor** — lines 2585-2587 — residential `target *= jobsFactor` where `jobsFactor = clamp(jobs/(pop*0.6+1), 0.45, 1)` — floored at 0.45, so homes fill to ~45% cap with zero jobs. Not a hard gate.
- **recalcDemand** — lines 2234-2257 — five demand tracks from RCI balance + `taxAdj=(7-tax)*2.2` + green/crime/pollution modifiers, all × `_demDamp`.
- **Fullness damping** — lines 2247-2250 — `_fullness = 1 - open/(open+dev*0.12)`; `_demDamp = 1 - _fullness*0.92`. Demand only collapses (to 8% floor) once accessible land is nearly gone.
- **Road access BFS** — lines 2091-2120 — every tile within 3 (urban) / 8 (farm) Manhattan tiles of a road is buildable; water blocks propagation.
- **Power flood-fill** — lines 2123-2165 — plants push capacity through any conductive tile; `powered=false` only when cumulative `cons > capLeft`. Coal = 400 MW; a level-1 low-density tile draws just `1+l = 2` MW (line 2036).
- **Abandonment/decay** — lines 2511-2515 — only path to losing buildings: `!access || !netOn || d<-32` AND `occ<25%cap` for `decay>6` ticks, then 15%/tick razing.
- **monthly() economy** — lines 2569-2670 — income by occ×rate×`lvF(0.7-1.3)`×`taxF`; expenses = roads×0.7 + parks×4 + plant upkeep + services etc.; bankruptcy at `redMonths>=10` (line 2626).
- **Milestones** — lines 2536-2544, 2650-2661 — 7 pop thresholds granting §1k-§250k plus tool unlocks.

## NUMBERS

- `N = 68` → 4,624 tiles (line 511); `TICK = 0.36` s/tick (514); `MONTH_S = 9` s/month at 1x (515).
- Speed multipliers: {0, 1, 3, 5} (lines 343-346). Ticks/sec = speedMul/0.36.
- `growthTick` samples = **30 per tick** (line 2498).
- L0→1 probability = `demand/140 * boost`; starting res demand = 18 → **p ≈ 0.129** per ready sample (lines 570, 2521).
- L1→n probability = `demand/165 * boost` (line 2531); level-up occupancy gate = **0.55×cap** (line 2529); develop seeds occ at **0.15×cap** (line 2486); monthly occ closes **35%** of gap (line 2590).
- Starting money = **§25,000** (line 567); `zoneCost() = 0` (line 2721); road = **§20/tile** (line 2727).
- Plants (cost/cap/upkeep): coal 3000/400/190, gas 2400/340/150, solar 2600/230/45, wind 1800/160/35, nuclear 14000/4500/950 (lines 517-522). Level-1 tile draws 2 MW (line 2036) → one §1,800 wind farm powers ~80 starter tiles.
- Income rates ×lvF×taxF: res 1.05, com 1.5, ind 1.25, farm 0.7, office 2.0 (lines 2596-2601); `taxF = tax/7`, default tax 7 → taxF=1, `taxAdj=0`.
- Milestone rewards: 1000, 3000, 7000, 18000, 45000, 100000, 250000 (lines 2537-2543) — total **§424,000** of injected cash across a playthrough.
- `_demDamp` floor = **0.08** (1 − 0.92) only at full map (line 2250); `jobsFactor` floor = **0.45** (line 2586).
- Bankruptcy trigger = **10 consecutive red months** (line 2626); debt interest = 2%/mo (line 2609).
- Abandonment threshold: demand `< -32`, occ `< 0.25×cap`, decay `> 6`, raze chance 0.15/tick (lines 2513-2515).

## WHY IT'S TOO FAST/EASY

1. **No cost to zone, in bulk, instantly.** `zoneCost()=0` and `zoneRect` (line 2755) paints an arbitrary rectangle for free. A player can zone the entire road-served map in seconds for §0. The only cash outlay to enable growth is roads (§20/tile) and one cheap plant (§1,800), both trivially inside the §25,000 start.

2. **Throughput ceiling is generous and the roll is cheap.** The only global limiter is 30 samples/tick, but at 5x that is 13.9×30 = **~417 development attempts/sec**. With starter demand 18 (p≈0.13) and env≈1.0, a densely-zoned, powered, road-served map produces on the order of **20-50 new buildings/sec** at Turbo. Filling the ~3,500-4,000 developable tiles to level 1 therefore takes roughly **2-4 minutes at 5x**, and **~10-15 minutes at 1x**. Climbing to towers adds only a few monthly ticks (9s each at 1x) to pump occupancy past the 0.55×cap gate — not a hard brake, just a short wait.

3. **Every gate is a one-time cheap purchase, not ongoing scarcity.** Road access (BFS radius 3) is satisfied by a sparse grid (~1 road tile per 7 zoned tiles); power is satisfied by flood-fill and only fails on raw MW capacity, which milestone cash trivially expands (a §3,000 coal plant powers ~200 level-1 tiles). Once roads + a plant exist, nothing consumes per new building — no materials, no labor deducted, no permit wait.

4. **Money can only go up.** Income scales with occupancy while the marginal cost of a new building is zero. On top of that, seven milestones inject **§424,000 total** as the city grows, so the treasury balloons exactly as the city expands. The sole failure state (10 straight red months, line 2626) is essentially unreachable unless the player deliberately over-buys upkeep-heavy services, because zoning generates revenue at no capital cost.

5. **The only self-brake acts too late.** `_demDamp` (line 2250) doesn't bite until `open/(open+dev·0.12)` collapses — i.e. until the map is *already nearly full*. So demand stays near nominal through the entire bulk build-out and only sinks for the final few percent of tiles. The map fills fast, then the last lots crawl — the opposite of a difficulty curve.

6. **Mood/politics don't gate growth.** `recalcMood` (line 2264) feeds `approval`, `popLean`, and `leanGap` into elections only; nothing in `growthTick` reads them. There is no policy, congestion, or unrest mechanic that actually stops or slows construction.

## WEAKNESSES

- **Zero construction friction:** no land cost (`zoneCost()=0`), no build time (`develop` is instant; the 0.45s animation at line 4566 is cosmetic), no materials, no permits, no labor draw. A building's entire cost to the player is the shared road/plant it sits near.
- **Labor is a soft floor, not a constraint:** `jobsFactor` clamps to ≥0.45 (line 2586), so residential thrives with no employment; `eduPop` only gates *unlocks* (industry/office, lines 2554-2559), never consumes.
- **Terrain is binary:** only `terrain==='water'` blocks building (lines 2114, 2757). No elevation, slope, flood risk, or soil — trees are bulldozed for free. Every non-water tile is identical to build on.
- **Milestone cash overwhelms the economy:** §424k of grants makes the budget a formality; the debt-spiral failure (line 2626) can't trigger under normal play.
- **Demand damping is mis-tuned for pacing:** the 0.12 weight on developed tiles (line 2249) keeps `_fullness≈0` until the map is nearly saturated, so there's no rising difficulty as the city grows — demand stays high right up to the end.
- **Growth ignores politics/quality entirely:** approval, `leanGap`, congestion, and pollution feed UI/elections but never throttle `growthTick`, so there's no feedback loop punishing sprawl.
- **The 30-samples-per-tick ceiling is a blunt, non-thematic limiter:** it's the only thing slowing fill, but it's invisible and uniform rather than tied to any in-world scarcity a player can reason about or manage.

## OPPORTUNITIES

- **Charge for zoning/land via the existing `zoneCost(kind)` hook (line 2721)** and `zoneRect` (line 2755) — it already accepts a kind and iterates tiles; return a per-tile price scaled by `lvMap` (land value already computed) to make prime land expensive. `chipCost`/`setChipHTML` (line 3088) already render a cost string, so UI plumbing exists.
- **Add construction time by reusing `c.decay`-style per-tile counters and the `constructionAnims` array (lines 4563-4569).** `develop()` (line 2483) could enqueue an "under construction" state with a build-cost drawdown and a timer before `occ` seeds, converting the cosmetic 0.45s animation into a real gate.
- **Turn labor into a hard input:** `recalcStats` already tallies `capC/capI/capO` and `pop`; the `jobsFactor` line (2586) is the natural place to remove the 0.45 floor and add an unemployed-labor pool that new commercial/industrial must draw from, mirrored for residential needing filled jobs.
- **Add terrain difficulty on top of the existing `terrain` field (line 600) and water check (line 2114):** introduce elevation/slope tiers that raise road cost (`placeRoadPath`, line 2723, already charges `fresh.length*20`) and zoning cost, and reduce `boost` in `growthTick` (line 2508) — the `env` multiplier is the ready insertion point.
- **Re-tune the pacing constants that already exist:** raise `TICK`, lower the 30-sample count (line 2498), or lower the `d/140`/`d/165` divisors' effective probability; and reshape `_demDamp` (line 2250) so difficulty rises earlier — e.g. increase the 0.12 dev-weight so `_fullness` climbs while there's still land.
- **Wire the already-computed mood/pollution/traffic maps into growth:** `growPress`, `restPress`, `polMap`, `trafMap` are all live (lines 2264-2299, `recalcMaps`); gating `develop` on them would add a real quality/scarcity feedback loop with no new data structures.
- **Make the failure state reachable:** milestone rewards (lines 2537-2543) and the 10-month red threshold (line 2626) are single constants — lowering grants and adding recurring per-tile infrastructure upkeep (roads already cost `S.roads*0.7`, line 2610) would restore budget tension.
- **Power/materials as ongoing scarcity:** the `netCap`/`netLoad` flood-fill (lines 2123-2165) and `consAt` (line 2033) already model a consumable grid — extending the same pattern to water/materials pipelines would add stackable hard gates using proven code.
