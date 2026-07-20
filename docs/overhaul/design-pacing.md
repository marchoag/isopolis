# PACING & DIFFICULTY OVERHAUL — "The Earned Metropolis"

Design track: growth / economy / scarcity. Target file: `/home/user/isopolis/isopolis.html` (~4,666 lines, single file, no build step).
All line numbers below refer to the current file and were verified against it.

## VISION

Today, Isopolis hands the player the whole 68×68 map for free (`zoneCost()` returns 0, line 2721), pays them §424,000 in milestone grants, and lets an invisible RNG (30 samples/tick, `d/140` odds) pour buildings into every zoned tile within 10–15 minutes at 1x. The overhaul replaces that single invisible throttle with four *visible, ownable* scarcities: **land you don't own yet**, **people who haven't moved here yet**, **materials and crews that haven't built it yet**, and **money you had to borrow**. The map fills slowly not because the clock is slow, but because every hectare of the metropolis is the answer to a question the player actually decided: which parcel to annex, whether to court migrants with parks or jobs, whether to feed construction with dirty local industry or expensive imports, and how much bond debt to carry into the next recession.

The emotional arc: the first half hour is a *small town where §200 matters* — you count road tiles, you wait on eleven families to arrive, your first annexed parcel feels like conquest. The mid-game is a leveraged growth machine you actively drive — pools, bonds, and the business cycle reward timing and punish complacency. The late game is a metropolis whose growth is expensive by nature (land inflation, congestion, debt service), where filling the last quarter of the map is a capstone, not a foregone conclusion. Critically, **no mechanic below is "wait longer"**: every brake is a dial the player can turn by spending, building, or choosing — and every stalled tile tells you exactly which dial in its hover chip.

## MECHANICS

### M1 — City Land & Annexation (you don't own the map)

**Design.** Overlay the 68×68 grid with **4×4-tile parcels** (68/4 = 17 → 289 parcels; `parcelOf(i) = (z>>2)*17 + (x>>2)`). New state: `S.owned` — a `Uint8Array(289)` (1 = city land).

- **Founding tract:** at `newCity()`, find the 3×3 parcel block nearest map center with the fewest water tiles; mark those 9 parcels owned (≈144 tiles). Everything else is **county land**: rendered desaturated/sepia via a tint pass in the ground-canvas draw (`flushGround`, line 942 region), with faint dashed parcel borders when the Annex tool is active.
- **What county land blocks:** `zoneRect` (2755), `placeRoadPath` (2723), all plops, park/preserve placement — filter tiles to `S.owned[parcelOf(i)]`. Blocked actions toast "That's county land — annex the parcel first (§X)". The road-access BFS (2091) still crosses county land (roads *lead* to the frontier) but nothing can be built there. **Demand's fullness scan (line 2248) counts only owned open tiles** — so buying land is literally buying demand headroom (see M8).
- **Price formula** (economy side): `basePrice(p) = Σ_over_16_tiles( §22 + lvMap[i]·§120 ) × cityScale × S.econ`, where `cityScale = 1 + S.pop/12000` and `S.econ` is the business cycle (M7). Water tiles in a parcel count §6 flat. Typical values: **§1,000–1,400 early** (lv≈0.4, pop<1k), **§2,500–4,000 mid-game**, **§6,000–9,000 for prime infill at 30k pop**. Full map ≈ 280 purchases ≈ §400–800k over a campaign — this is the sink that replaces free zoning.
- **Annex tool:** new entry in `TOOLS` (3392) + `TB_LAYOUT` (3427) + pointerdown branch (3230) + `KEYTOOL` key. Hovering a county parcel shows a chip (`setChipHTML`, 3676 pattern): parcel price, avg land value, water tiles. Click → `tryCharge(offer)` (2673) → `S.owned[p]=1`, redraw tint, `mapsDirty=true`, `recalcDemand()`.
- **Interface to the POLITICS layer (do not duplicate their system):** final offer = `basePrice(p) × POLITICS.sellerMul(p)`, and annexation proceeds only if `POLITICS.canAnnex(p).ok`. The economy layer ships a neutral stub (`sellerMul()=1`, `canAnnex()={ok:true}`) so the game works standalone; holdouts, negotiations, council votes, and the ownership-drama UI belong to the politics track. `S.owned` is written **only** through this one `annexParcel(p)` function so politics can wrap it.

**Why.** Realistic: cities genuinely grow by annexation and land assembly; fringe land is cheap, infill is dear, and land inflates with the city. Fun: it converts "paint the map" into a strategy-game territory decision — direction of expansion, buying cheap during recessions (M7), saving a lakefront parcel for parks — and it makes the map *feel* huge again because most of it is visibly not yours yet.

### M2 — Zoning costs money (surveying & permits)

**Design.** Replace `zoneCost(kind){ return 0; }` (line 2721) with a per-tile fee: `zoneCost(kind, i) = BASE[kind] + lvMap[i]·§45`, `BASE = {res:10, com:14, ind:12, farm:3, mix:24, office:20}`, ×2.2 when the current density paint (`S.dens[kind]`) is `'high'` (mix/office count as high). `zoneRect` (2755) sums the fee over its filtered tiles, shows the running total in the drag chip, and calls `tryCharge(total)` before painting — reject the whole rect (with an error toast showing the shortfall) if unaffordable. De-zoning refunds nothing (prevents zone/dezone cycling). Re-painting an identical zone is still skipped (existing line 2766) so no double-charging.

**Why.** Realistic: surveying, platting, and utility hookups cost real money before a single tenant arrives. Fun: bulk-zoning 500 tiles now reads "§9,400" in the chip and becomes an actual early-game decision — zone the two blocks you can serve, not the whole quadrant. A low-density starter block (~20 tiles res) costs ~§550: noticeable against §25k, never crippling.

### M3 — Scarce demand: migration & business pools (the core brake)

**Design.** Demand stops being an inexhaustible score and becomes **stock and flow**. New state: `S.pool = { res: 12, biz: 4 }` — families waiting to move in, firms scouting the region.

- **Monthly inflow** (in `monthly()`, after `recalcDemand()`):
  `attract = clamp(0.3 + 0.5·jobsSignal + 0.06·(7−S.tax) + 0.6·(S.green−0.45) − S.polAvg·1.0 − S.crimeAvg·0.8, 0.05, 1.5) × S.econ`
  where `jobsSignal = clamp((S.capC+S.capI+S.capF+S.capO − S.pop·0.6) / Math.max(S.pop·0.5, 25), −0.6, 0.6)` (open jobs pull migrants; joblessness repels).
  `S.pool.res += (3 + S.pop·0.022) × attract`  — ≈4–8/month for a founding town, ≈200–350/month at 10k pop with good attractiveness.
  `S.pool.biz += (1 + S.pop·0.006) × clamp(0.4 + S.dem.com/60 + S.dem.office/80, 0.1, 1.3) × S.econ`
- **Impatience decay:** `S.pool.res ×= 0.94` each month (waiting families give up and settle elsewhere). This punishes hoarding demand while having nowhere zoned/built — the pools reward *matched* capacity, not stockpiling.
- **Consumption — construction starts** (hard gate in `growthTick`, 2497): a residential/mix start at level `l` requires `S.pool.res ≥ need`, `need = ceil((capOf(c,l) − capOf(c,c.level))·0.5)`; deduct `need` at start (the committed households). A com/ind/office/mix start requires and deducts `S.pool.biz ≥ ceil(newJobCap/6)` (one "firm" per ~6 jobs). Farms bypass pools.
- **Consumption — occupancy fill** (in `monthly()`, line 2590): residential/mix `occ` growth is capped by the pool. Compute each res tile's desired gain `g = (target−occ)·0.35` as today, sum to `G`; scale every tile's gain by `min(1, S.pool.res/G)` and deduct the actual total from `S.pool.res`. Business occupancy (`occ2`, com/ind/office occ) is *not* pool-limited (firms staff from resident workforce — the existing `jobsFactor` covers that).
- **Existing demand tracks stay** as the *quality* signal (they still gate rolls and drive the RCI bars), but see M8 for retuned constants. The demand panel (358–367) gains two small counters: "👪 waiting: 23 · 🏢 firms: 4".
- **Chip feedback:** `tileInfo` (3676) gains the reason line "🕰 Waiting for new arrivals — grow the city's appeal" when a ready tile is pool-blocked.

**Why.** Realistic: cities grow exactly as fast as people and employers actually arrive, and regional migration responds to jobs, taxes, amenity, and the macro cycle. Fun: this is the mechanic that kills instant map-fill *without any waiting-for-waiting's-sake* — the growth rate is a **score the player engineers** (cut taxes, add parks, balance jobs) rather than an RNG faucet. Early on, ~5 families/month means each new cottage is an event; the player's eye is on the inflow number, and every lever that moves it is a real decision.

### M4 — Construction takes time, crews, and visible stages

**Design.** Split `develop(x,z,l)` (2483) into `startConstruction(x,z,l)` and `completeConstruction(x,z)`.

- **Start** (called from `growthTick` where `develop` is called today, lines 2521/2531): checks pools (M3), materials (M5), site cap (below), and the credit freeze (M6). On success: `c.stage='uc'`, `c.buildT = BT[l]` months, `BT = [—, 2, 3, 5, 8]` (farm: 1). Show a **scaffold mesh**: the target building's geometry via `buildFor(...)` with a shared flat-grey material, scaled to 0.35 height; at the halfway month re-scale to 0.7 (hook the existing `constructionAnims` array, 4563–4569, for the pop-in of each stage). Under-construction tiles emit no income, no population, no power draw beyond 1 MW.
- **Complete** (in `monthly()`): decrement `buildT`; at 0, run the old `develop` body — set `c.level=l`, seed `occ = cap·0.15` (2486), real mesh, `recalcStats/recalcDemand/updateTop`, `sGrow()`.
- **Concurrent-site cap:** `maxSites = 6 + floor(S.pop/250)` (6 sites at founding, ~46 at 10k, ~126 at 30k). `growthTick` skips starts when `S.sites ≥ maxSites`. This is the city's construction industry capacity; the chip reason is "👷 All construction crews are busy".
- **Stalled sites:** if a u/c tile loses access/power for 3 consecutive months, it collapses to `rubble` and its materials are lost (uses the existing `c.decay` counter pattern, 2511–2515).
- Level-up timing at 1x: a cottage takes 2 months = 18s of visible scaffolding; a level-4 tower takes 8 months = 72s — long enough to feel like a project, short enough to never be the binding constraint when the player has done everything else right.

**Why.** Realistic: buildings are multi-month projects with cranes and framing, and construction capacity is a real industry. Fun: the skyline becomes *legible over time* — you see this quarter's projects rise together, turbo speed becomes "watch the boom", and the site cap converts a rich player's instinct to zone everything into a queue they can see and expand (grow population → more crews). The stages also give the game its "story of a town being built" texture for free.

### M5 — Materials: feed the boom or pay for it

**Design.** New state `S.mat` (construction-material stock, starts 40).

- **Production** (in `monthly()`): `S.mat += S.occI·0.7` — local industry supplies the construction economy. (This finally makes industrial zones matter beyond their tax trickle.)
- **Consumption:** each `startConstruction` needs `matNeed = ceil(newCap·0.8)` units (newCap = capacity gained by this level). A level-1 low-res house: ~7 units. A level-4 high-res tower (+90 cap): ~72 units.
- **Imports:** if `S.mat < matNeed`, the shortfall is auto-imported at **§7/unit**, charged to the treasury *at start time* and logged into a new `exp.imports` line in `S.fin` (2610–2616). If the treasury can't cover the import, the start is blocked (chip: "🧱 Materials shortage — build industry or top up the treasury").
- Budget modal (`openBudget`, 4364) shows: materials stock, monthly production, last month's import bill.

**Why.** Realistic: construction consumes lumber, steel, and concrete; cities without local supply import at a premium. Fun: it creates the game's best standing dilemma — **dirty local industry (pollution, crime, land) versus clean imported growth (a cash bleed proportional to how fast you're growing)** — and it self-balances pacing: boom harder, pay more. It also gives industrial demand a *purpose* the player can feel, instead of being just another bar.

### M6 — Real money: grants become bonds, and failure bites

**Design.**
- **Milestone rewards cut ~85%** (lines 2537–2543): `[1000, 3000, 7000, 18000, 45000, 100000, 250000]` → **`[500, 1000, 2000, 4000, 8000, 15000, 30000]`** (total §424k → **§60.5k**). Each milestone instead raises the **bond ceiling**: add `bondCap` to each entry — `[10k, 20k, 35k, 60k, 100k, 160k, 250k]` (base §6k before Hamlet). The milestone modal (4030) now reads "…and Wall Street will now underwrite §35,000 of Isopolis bonds."
- **Bonds:** new state `S.bonds = { principal: 0 }`. Issue/repay in **§5,000 blocks** from a new section in `openBudget` (4364). Issuing pays out §4,900 (2% origination). Monthly interest by **rating**: debt service ÷ income < 15% → A at 0.5%/mo; < 30% → B at 0.7%/mo; else C at 1.0%/mo and **no new issues**. Recession surcharge: `+0.15%/mo when S.econ < 0.85` (M7). Interest is a new `exp.bonds` budget line; the existing 2%/mo overdraft charge on negative cash (2609) stays separate and unchanged.
- **Credit freeze (failure that bites before death):** at `S.redMonths ≥ 4` (counter at 2623), **all new construction starts halt** ("🏦 Credit freeze — lenders won't touch a city 4 months in the red") and annexation is blocked. Existing sites finish. This makes the 10-red-month bankruptcy (2626) a real cliff you visibly slide toward, instead of an unreachable footnote.
- **Effect on the curve:** with zoning fees (M2), land purchases (M1), import bills (M5), and only §60k of grants, treasuries now dip and recover in waves; bonds are how ambition outruns cash-flow, and the rating is the leash.

**Why.** Realistic: municipalities live on bond markets, and credit ratings discipline them. Fun: debt is the classic "interesting risk" — leverage a boom (M7) into three annexed parcels and a nuclear plant, or stay A-rated and slow. And a failure state the player can *see approaching* (freeze at 4 months, seizure at 10) creates genuine tension that the current game never produces.

### M7 — The business cycle (booms, recessions, timing)

**Design.** New state `S.econ` (0.65–1.35), updated monthly: `S.econ = clamp(1 + 0.28·sin(2π·(monthsElapsed + phase)/300) + drift, 0.65, 1.35)` where `phase` is seed-derived and `drift` is a random walk (±0.02/month, clamped ±0.10) so cycles (~25 game-years ≈ 45 min at 1x) aren't clockwork. Hooks:
- Migration and firm inflow ×`S.econ` (M3) — recessions choke growth to a crawl even in a great city.
- Land prices ×`S.econ` (M1) — **recessions are annexation sales** (up to −35%).
- Bond surcharge when `S.econ < 0.85` (M6).
- Ticker (`tickerMessages`, 3768) and a toast at cycle turns: "📉 Regional recession — migration slows, land is cheap" / "📈 Boom years — the region is moving in".

**Why.** Realistic: no city grows in a straight line; the 1873 or 2008 crash shaped real skylines. Fun: it gives the long game *seasons* — a rhythm of expand-cheap / consolidate / ride-the-boom that rewards the player who reads the ticker and times bonds and annexations, and it breaks the monotone "number goes up" feel of the current economy.

### M8 — Retuned growth constants (the supporting cast)

**Design.** With the hard gates above, the RNG becomes the *texture*, not the throttle — but it still needs slowing so the gates, not the dice, dominate:
- L0→1 probability `(d/140)·boost` → **`(d/240)·boost`** (line 2521); level-up `(d/165)·boost` → **`(d/300)·boost`** (2531). Starter roll drops from p≈0.13 to p≈0.075 per sampled ready tile.
- Keep 30 samples/tick (2498) — with pools/sites gating, the sample count no longer determines fill rate.
- **Fullness bites early:** `_fullness = 1 − open/(open + dev·0.12)` (2249) → dev weight **0.5**, with `open` counting only *owned* accessible tiles (M1). At half-built-out, demand now damps to ~0.68 instead of ~1.0 — growth decelerates smoothly as your purchased land fills, and annexing visibly re-opens the tap.
- `jobsFactor` floor 0.45 → **0.30** (2586): a jobless bedroom city stalls harder (but doesn't death-spiral; see RISKS).
- **Congestion gates towers:** level ≥3 starts additionally require `trafMap[i] < 0.72` (insert beside the checks at 2523–2530; chip: "🚗 Gridlock — heavy traffic blocks the tower crane"). Uses the already-computed `trafMap` (2303 region); the player's fix is road layout, parks, and mixed-use — a spatial puzzle, not a wait.
- Occupancy monthly gap-close stays 0.35 (2590) — the res side is already pool-limited by M3.

**Why.** Realistic: developers respond to congestion and diminishing land; fun: every constant here converts an invisible dice-rate into a *diagnosable* condition the hover chip can explain, keeping the "why isn't this growing?" loop informative all game long.

## DIFFICULTY ARC

**First 10 minutes (≈ 5.5 game-years at 1x).** You own 9 sepia-bordered parcels in a county-toned wilderness. §25,000 buys a road spine (§20/tile), a wind farm (§1,800), and your first zone fees (~§550 for a 20-tile hamlet block) — and you feel each charge. Migration runs 4–8 families/month; houses go up two or three at a time behind 18-second scaffolds, and the demand panel's "👪 waiting: 7" is your heartbeat. Hamlet (150 pop) lands around minute 4–5 with a §500 grant and your first §10k bond ceiling. Around minute 8 you annex your first parcel (~§1,100) — a real, considered purchase: toward the river or toward flat farm land? Nothing is dangerous yet, but nothing is free, and the map is 97% not-yours.

**First hour (≈ 33 game-years).** Pop 2,000–4,000; you own maybe 35–50 parcels. The machine has gears now: you've chosen industry (smog, materials surplus) or imports (clean, §300–600/month bleed); you've issued §15–25k of bonds to grab cheap land in your first recession, and you've felt a B-rating's 0.7% interest sting. One bad stretch — a tax hike during the downturn — put you 3 months in the red and one month from a credit freeze; you sold nothing, but you learned. Towers exist where you engineered land value and schools; the site cap (~20 crews) makes each district's build-out a visible season. The map is perhaps 15–20% developed and feels like a *town with a frontier*.

**Tenth hour (deep endgame).** Pop 25–40k across 60–80% of the map. Growth is expensive by design: infill parcels cost §6–9k (`cityScale`≈3), a tower consumes 72 materials and 8 months of crane time, congestion gates the densest cores until you re-plan arterials, and `_demDamp` means each annexation is what re-opens demand. Debt is a managed portfolio — §100k+ principal, rating watched like a health bar, issues timed to booms. Recessions are events you brace for (migration halves; you buy land). The last empty quarter of the map is a *project* — and the Gigapolis milestone (30k) reads as the achievement the §250k handout never was. Total campaign at 1x: roughly 8–15 hours instead of the current ~15 minutes.

## INTEGRATION

**Modified functions/lines (current file):**
- `zoneCost()` **2721** — per-tile fee formula (M2). `zoneRect` **2755** — ownership filter, fee sum, chip preview, `tryCharge`. `dezoneRect` **2777** — no refund (no change needed, just don't add one).
- `placeRoadPath` **2723**, all plop placers (`placePlant`/`placeStation`/park/preserve, ~2850–2950), pointerdown dispatch **3230–3236** — ownership checks + Annex tool branch.
- `growthTick` **2497–2534** — divisors 140→240 / 165→300; pool checks + deductions; site-cap check; congestion check; calls `startConstruction` instead of `develop`.
- `develop` **2483** — split into `startConstruction`/`completeConstruction`; scaffold meshes via `buildFor` + grey material + `constructionAnims` **4563–4569**.
- `monthly` **2569–2670** — buildT countdown & completions; pool inflow/decay; pooled occupancy scaling at **2590**; `S.mat` production; `exp.imports` + `exp.bonds` lines at **2610–2616**; `S.econ` update; credit freeze at **2623**; milestone table **2536–2544** (new rewards + `bondCap`).
- `recalcDemand` **2234–2257** — fullness dev-weight 0.12→0.5 at **2249**; `open` counts owned tiles only at **2248**.
- `jobsFactor` **2586** — floor 0.45→0.30.
- UI: demand panel **358–367** (+pool counters); `openBudget` **4364** (+bonds section, materials, imports); `tileInfo`/`setChipHTML` **3676–3745** (+blocked-reason lines — extend the existing pattern at 3719); `TOOLS` **3392** / `TB_LAYOUT` **3427** / `KEYTOOL` **3330** (Annex tool); `MAPS`/`VIEWS` **3102/4288** (optional "Land" overlay showing ownership+prices); ticker **3768** (cycle news); `flushGround` **942** (county-land tint); milestone modal **4030** (bondCap copy).
- `newCity` **~3871** — founding-tract selection; reset all new `S` fields (note architecture warning: `S` is an open schema — reset explicitly).

**New state:** `S.owned` (Uint8Array 289), `S.pool{res,biz}`, `S.mat`, `S.sites` (derived count, recompute in `recalcStats` 2200), `S.bonds{principal}` + `S.rating` (derived), `S.econ` + `S.econDrift`, per-cell `c.stage`/`c.buildT` (runtime fields on `makeCell` objects, like `c.decay` today).

**Save format (currently v:2, positional 11-slot cells, `saveCity` 4437 / `loadCity` 4461):** bump to **v:3**. Do **not** touch the positional cell array (architecture report: append-only hazard). Serialize new systems as **new top-level keys**: `owned` (array of 289 0/1), `pool`, `mat`, `bonds`, `econ`, `econDrift`, and `constr: [[i, level, buildT], ...]` (sparse list of under-construction tiles). On loading v1/v2 saves, migrate: `owned[p]=1` for every parcel containing any road/zone/building plus the 3×3 founding block around the densest built parcel; `pool={res: max(8, pop·0.02), biz:4}`; `mat=40`; `bonds={principal:0}`; `econ=1`. Loader already tolerates missing keys (fallback pattern at 4462–4501) — keep that style.

**Politics-track interface (one seam, stubbed):** `annexParcel(p)` is the single writer of `S.owned`; offer price = `basePrice(p) × POLITICS.sellerMul(p)`, gated by `POLITICS.canAnnex(p)`. Economy exports `basePrice(p)` and `S.econ` for their use (e.g., holdout greed can scale with the boom). Parcel geometry (`parcelOf`, 17×17) is shared and must be agreed once.

## RISKS

1. **Death-spiral potential.** Pools + lower jobs floor + credit freeze can compound: recession → migration stalls → income falls → red months → freeze → can't grow out of it. Mitigations built in: pool decay floors (inflow never below `3·0.05·0.65 ≈ 0.1`… in practice keep a hard `max(1, …)` on res inflow), freeze blocks *starts* not existing income, and the overdraft interest stays mild. Needs playtesting with a deliberately mismanaged city; tune the freeze threshold (4 red months) upward if it snowballs.
2. **Overdetermined throttles.** Four gates (pool, materials, sites, money) risk "everything is blocked and I don't know why." The chip-reason lines and the demand-panel counters are load-bearing, not cosmetic — if implementation cuts them, the game will feel arbitrary. Rule of tuning: at any city size, *one* gate should usually bind (early: pool; mid: money/land; late: congestion/land inflation).
3. **Balance numbers are estimates.** Inflow coefficients (`3 + pop·0.022`), land pricing (§22 + lv·§120, cityScale /12000), and bond rates were tuned on paper against verified current formulas, not simulation. Recommend a headless balance harness (run `monthly()`/`growthTick()` in a loop with scripted play) before shipping; the constants should live in one CONFIG table (architecture report already flags scattered magic numbers).
4. **Save migration is real work.** v1/v2 cities suddenly gain ownership and pools; the "infer owned parcels from built tiles" migration can leave old cities land-locked oddly. Acceptable cost, but test with a large v2 save.
5. **Turbo (5x) compresses months to 1.8s** — buildT and pool flows all scale with months, so pacing integrity holds at every speed, but `monthly()` now does more work and already spikes frames on big cities (architecture: recalcMaps per month at turbo). Keep new monthly work O(N²) single-pass and reuse existing scans where possible.
6. **Politics-track coupling.** If their parcel/holdout design diverges from the 4×4/289 geometry or wants per-tile ownership, the seam must be renegotiated early — it's one function and one array today, cheap to change now, expensive after saves ship.
7. **Exploit surfaces:** zone/dezone (no refund — closed), bulldoze-and-rebuild to dodge congestion gates (rebuild still needs pools/materials — acceptable), issuing bonds then intentionally failing (bankruptcy already ends the game — acceptable), farming the materials stock then mass-dezoning industry (stock persists but production stops — acceptable, that's just inventory).
