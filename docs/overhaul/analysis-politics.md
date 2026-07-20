# POLITICS & APPROVAL ANALYSIS (isopolis.html)

## SUMMARY

Isopolis's "politics" is a **single scalar approval score (0–100) recomputed every game-month, gated only by a 4-year election that can end your run.** There are two intertwined subsystems: (1) an **approval formula** (identical copy at lines 2635 and 3612) that sums pollution, crime, taxes, power cuts, unpaid bills, green space, demand, stability, prosperity, and a "lean gap" grievance term; and (2) a **civic-mood model** (`recalcMood`, 2264–2300) that reads the live map to derive two opposing public pressures — `growPress` (voters want you to build) vs `restPress` (voters want restraint / anti-tower) — collapsed into `popLean` and `leanGap`.

Crucially, **politics is purely a scoreboard and a game-over check. It never constrains, gates, prices, or blocks any individual act of construction.** The only mechanic resembling "land someone won't let you build on" is the **preserve system** (protected wild reserves seeded on the map that you must deliberately bulldoze for a flat fee). Notably, a whole "mayoral record" political-identity axis (`devLean`, `recordLean`, `wildTaken`, `WILD_STEP`, `leanWords`) is **scaffolded in the code but completely inert** — written, saved, and displayed, but never read into any consequence. These dead hooks plus the preserve system are the richest starting points for the overhaul.

## MECHANICS

**Approval formula — lines 2635 (`monthly`) and 3612 (`updateTop`, exact duplicate)** — recomputed every month AND every HUD refresh:
```
approval = round(clamp( 55
  + demAvg*0.18                       // demAvg = (dem.res+dem.com+dem.ind)/3
  + (7 - tax)*2.4                     // tax relative to baseline 7%
  - polAvg*30*_grace                  // pollution
  - crimeAvg*27*_grace                // crime
  - min(unpowered,12)*1.3             // blackouts, capped at 12 buildings
  + (green - 0.45)*16                 // green space bonus/penalty
  + _stable                           // clean-governance reward
  + _prosper                          // full-clean-metropolis reward
  - leanGap*0.16                      // total civic grievance
  - min(redMonths*2.5, 15)            // budget in the red
, 0, 100))
```
where `_grace = clamp(pop/1200, 0.45, 1)` (young cities forgiven pollution/crime), `_estab = clamp(pop/2500,0,1)`, `_stable = _estab * clamp(1-polAvg*1.4,0,1) * clamp(1-crimeAvg*1.4,0,1) * 11`, and `_prosper = buildOut>0.85 ? ((buildOut-0.85)/0.15)*clamp(1-polAvg,0,1)*8 : 0`.

**`recalcMood` — 2264–2300** — the two-sided public-opinion engine. Scans all 68×68 tiles counting: `openLand` (empty, road-accessible, non-water), `lowUp` (developed res/com/office that is not high-density, level<3, on land value ≥0.55 — "good land stuck low"), `harsh` (a res tower — high density or level≥3 — that has a park/preserve within a 3-tile radius but NO office/com/mix in that radius — "towers in a quiet park-side pocket"), and `devCount`. Then:
- `_dh = clamp((max(dem.res,0)+max(dem.com,0)+max(dem.ind,0))/170, 0, 1)` — demand pressure
- `_room = clamp(((openLand + lowUp*2)/max(devCount+openLand,1))/0.06, 0, 1)` — >~6% land open = real room
- `growPress = clamp(_dh*_room*1.4, 0, 1)`
- `restPress = clamp((harsh/(devCount*0.25+5)) * (0.45+1.2*eduFrac), 0, 1)` — educated cities guard their character
- `popLean = round(clamp((growPress-restPress)*100, -100, 100))` — + wants growth, − wants restraint
- `leanGap = round(clamp((growPress+restPress)*100, 0, 100))` — total grievance, drags approval
- `S._buildOut = clamp(devCount/(devCount+openLand),0,1)` — how full the city is
- **`recordLean = 0` — hardcoded to zero (2297)**, killing the mayoral-record axis.

**`green` composite — recalcStats 2239–2241** — `greenSpace = clamp((parks + preserves*1.3 + wildTrees*0.3)/(zoned*0.5+8),0,1)`; `green = clamp(0.55*greenSpace + 0.45*(1-polAvg),0,1)`. Feeds approval and demand (`greenPull=(green-0.5)*30` at 2244).

**Election trigger / cadence — monthly() 2649** — `if(S.month===0 && S.year>=nextElectionYear) runElection()`. Fires every January once the year reaches the election year. Initial `nextElectionYear=2004`, `term=1` (line 572/3875); start year is 2000, so first vote is after 4 years; normal cycle is **4 years** (`nextElectionYear=year+4`, line 4191).

**`runElection` — 4188–4250** — the whole electoral outcome:
- `bar = round(43 + min(term,5)*2.2)` → term1≈45, term2≈47, term3≈50, term4≈52, term5+≈54 (expectations climb then plateau)
- `swing = random()*8 - 3` → range [−3,+5], slightly incumbent-friendly
- `score = round(clamp(approval + swing + 4, 0, 100))` → **flat +4 incumbency bump**
- `won = score >= bar`; `recall = !won && !(strikes>0)` (first loss → recall)
- **WIN:** `term++`, `electionsWon++`, `strikes=0`; 5 terms → "legend" message.
- **RECALL (first loss):** `strikes=1`, `term++`, `money -= round(max(0,money)*0.15)` (15% treasury hit), `nextElectionYear=year+2` (2-year probation). "Lose the next election and you're finished."
- **SECOND loss (strikes>0):** `votedOut=true` → forces `newCity()` — the run ends, you start a brand-new city. This is the **only politics-driven game-over.**

**Election-projection warnings** — toast twice yearly (`monthly` 2640–2648, months 0/6) if within 2 years of the vote, projected approval < HUD bar, pop>150. Persistent **`campaignBar` HUD** (3618–3629) shows "on track to WIN/LOSE by N" when within 2 years and pop>150; clicking it opens the approval modal (3849).

**Approval display panels** — `approvalParts` (4050) builds the *shown* breakdown; `partDesc` (4063) labels; `partsHTML` (4078) renders sorted bars; `leanHTML` (4086) writes the narrative ("public wants growth/restraint"); `openApproval` (4107, opened by clicking the approval stat, 3848) shows the live panel with a hurting/helping bar chart; `politicsAdvice` (4164) generates up-to-two advice lines. These same functions are reused in the election modal (`partsHTML`+`leanHTML`+`politicsAdvice` at 4214–4221).

**`cityFailed` — 4252–4264** — bankruptcy game-over, triggered from `monthly` 2626 at `redMonths>=10`. This is **fiscal, not political** — approval has no direct game-over path except losing two elections.

**Preserve / protected-land system (the land-use-conflict seed):**
- **Seeding — genTerrain 750–767** — 3–5 wild reserves per map, each a noisy blob of radius 5–8 placed ≥7 tiles from center (a clear starting core), tiles set `type='preserve'; wild=true`. Comment: *"the politics layer will read this."*
- **`protectedStruct` — 2709** — preserves + all civic/power/school buildings are protected; **`canPlop` (2711) and `canRoad` (2713) refuse to build/road over them.**
- **`placePreserve` — 2789** — player sets aside empty land for §120 (`PRESERVE_FEE` in tooltip, actually hard-coded 120 here); does `devLean -= 1.0`.
- **Developing a preserve — bulldoze 2886–2896** — charges flat `WILD_BASE` (300) for wild, `PRESERVE_FEE` (100) for player-set; `wildTaken++`; `devLean += (wild?1.5:0.8)`; one-time toast "conservationists are watching."

## NUMBERS

- **Constants (524):** `WILD_BASE=300`, `WILD_STEP=10` (**defined, never used anywhere**), `PRESERVE_FEE=100`.
- **Approval base:** 55. Tax term `(7-tax)*2.4`. Green `(green-0.45)*16`. Pollution `-30*_grace`. Crime `-27*_grace`. Blackouts `-1.3/bldg` (cap 12). Red-budget `-2.5/mo` (cap 15). Lean-gap `-0.16*leanGap`. Demand `+0.18*demAvg`. Stability reward up to ~11, prosperity up to ~8.
- **`_grace`:** `clamp(pop/1200, 0.45, 1)`. **`_estab`:** `clamp(pop/2500,0,1)`.
- **Election bar:** `43 + min(term,5)*2.2`. **Swing:** `[−3,+5]`. **Incumbency:** `+4`.
- **HUD "needed to win" bar (2641, 3620, 4109, 4120):** `48 + term*1.6` — **a different, higher number than the real election bar.**
- **Recall:** 15% treasury seizure, 2-year probation term.
- **Bankruptcy:** 10 months in the red.
- **Pop gates:** approval hidden until pop≥50; election projection needs pop>150; lean-gap toast needs pop>400; `_gapWarn` fires at leanGap>65.
- **`growPress`:** `_dh*_room*1.4`. **`_room` breakpoint:** open-land fraction /0.06 (≈6%). **`restPress` education multiplier:** `0.45 + 1.2*eduFrac`.
- **Preserve seeding:** 3–5 per map, radius 5–8, ≥7 from center.

## DOES POLITICS CONSTRAIN BUILDING?

**No. Not in a single place.** This is the honest, important finding for the overhaul.

Every build/placement gate in the game is **physical or rule-based, never political:**
- `buildable`/`canPlop`/`canRoad` block only **water, roads, and protected structures** (2707–2713).
- `zoneRect` (2755) blocks only water/roads/parks/plops and requires road proximity (3 tiles urban, 8 farm).
- `placePlant` (2815) needs a clear 3×3 with road access. Money is the only other gate (`tryCharge`).

**Approval/mood/leanGap feed exactly two things:** the approval number (→ election win/loss) and flavor text (ticker, panels, advisor, toasts). A mayor at 5% approval can still bulldoze, zone, and tower anywhere a mayor at 95% can. There is **no referendum, no council vote, no permit, no NIMBY block on a specific parcel, no zoning-board veto, no holdout owner.** `leanGap` only subtracts from a score.

The **preserve system is the sole exception that even gestures at land-use conflict** — protected tiles you can't build over until you deliberately pay to remove them. But it is toothless: a flat fee, a one-time toast, and a `devLean` bump that **goes nowhere.** Tellingly, when you draw a road across a preserve, `placeRoadPath` (2723–2725) simply **filters those tiles out of `fresh` and skips them** — leaving a *gap* in the road, not a *bend around* the parcel. The owner's motivating image (roads that bend around a parcel someone wouldn't sell) is *almost* physically present in the code, but today it produces a broken road, not a detour.

## WEAKNESSES

1. **Dead "mayoral record" axis.** `devLean` (init 568; written 2799, 2890; saved/loaded 4452/4481) is **never read.** `recordLean` is hardcoded to 0 (2297). `leanWords` (4157) computes a "you: pro-growth/pro-conservation" label from `recordLean` so it is **always "balanced"**, and its result `L` (4199) is assigned but never used in the election modal. `wildTaken` is counted but never read. `WILD_STEP=10` is defined but never referenced — the comment "wild reserves escalate the more you pave" is **unimplemented** (bulldoze charges flat `WILD_BASE`). An entire political-identity feature is scaffolded and inert.
2. **Displayed breakdown ≠ actual formula.** `approvalParts` (4050) uses different coefficients than approval: Pollution −38 (vs −30·grace), Crime −34 (vs −27·grace), lean −0.20 (vs −0.16), power −1.5 (vs −1.3), and it **omits `_stable` and `_prosper` entirely** and ignores `_grace`. The panel that claims to explain your rating is a rough, mismatched approximation.
3. **Two contradictory election thresholds.** The HUD/approval panel show "need `48+term*1.6`%" (~50%), but `runElection` actually uses `43+min(term,5)*2.2` (~45%) **and** hands you +4 incumbency + up to +5 swing that the "needed to win" display never mentions. The game systematically tells the player the bar is scarier than it is.
4. **Duplicated approval formula** (2635 and 3612) must be hand-kept in sync — a maintenance hazard for any overhaul touching weights.
5. **Vestigial 'Out of step' branch.** `partDesc` (4069) and `openApproval` `_LBL` (4121) still handle an 'Out of step' part that `approvalParts` never emits (it emits 'Unmet demand'/'Over-building') — leftover from the killed record-lean design.
6. **Politics can't lose you the game on its own merits within a term.** Between elections, approval is consequence-free; the only real teeth are the 4-year vote and the unrelated bankruptcy timer.
7. **`restPress` is narrow.** The only "restraint" trigger is a res tower within 3 tiles of a park/preserve with no office/com nearby. Industry-next-to-homes, pollution-on-neighbors, displacement, and highways-through-neighborhoods generate no localized opposition at all.

## OPPORTUNITIES

**Existing seeds of land-use conflict the overhaul can grow from:**

1. **Wild reserves (genTerrain 750–767)** — 3–5 pre-placed protected blobs per map, explicitly commented *"the politics layer will read this."* This is the literal "parcel someone won't sell" already on the board. Grow it into: holdout owners with asking prices, refusals, and roads that *route around* them.
2. **`protectedStruct` / `canRoad` / `placeRoadPath` (2709–2734)** — the exact code path where a road *should* bend. Today `canRoad` returns false for preserves and `placeRoadPath` silently drops those tiles. A pathfinding detour here (auto-route around a non-purchasable parcel) would directly realize the owner's motivating image with minimal new surface area.
3. **`WILD_BASE`/`WILD_STEP`/`PRESERVE_FEE` (524) + `wildTaken` counter** — an escalating-acquisition-cost system already *named and reserved* in constants and a live counter; just never wired. `WILD_STEP` is a ready-made "each parcel you pave makes the next fight harder" knob.
4. **`devLean` / `recordLean` / `leanWords` (568, 2264, 4157)** — a fully scaffolded −100…+100 "conservation↔growth" mayoral-identity axis with save/load, UI vocabulary, and write-sites on every preserve action. Un-stubbing `recordLean` and reading `devLean` would instantly give the game a political persona that factions could react to.
5. **`growPress` vs `restPress` two-sided public opinion (recalcMood 2264–2300)** — already a real pro-growth/pro-restraint model with map-derived triggers and education-weighting (`0.45+1.2*eduFrac` — "schooled cities guard their character"). This is the emotional core to split into **factions/neighborhoods** with their own local approval and veto power.
6. **Green/preserve approval + land-value payoff (2239–2244, approval `+(green-0.45)*16`)** — protecting land already pays off in approval, demand pull, and land value, so a conflict system has a real tension to exploit (grow for demand vs. preserve for approval/value).
7. **Localized coverage maps (`recalcMaps` 2303+): `polMap`, `crimeMap`, `polCov`, `eduMap`, `trafMap`, `lvMap`** — per-tile fields already exist. A NIMBY/opposition system could read these locally (e.g., "residents within R tiles of new industry/pollution oppose it"), which today only aggregate into city-wide averages.
8. **Electoral scaffolding (runElection, recall/probation, term expectations, strikes, `campaignBar`)** — terms, a recall/probation middle state, escalating expectations, and a persistent campaign HUD are all in place to hang ballot measures, referendums, or council-vote-on-a-project mechanics onto.
9. **Explicit intent markers** — comments at 524, 750 ("the politics layer will read this"), and 4049 ("politics, made legible") show the author already earmarked these exact structures for a future politics layer.

Key lines for designers: approval formula **2635 & 3612**; mood engine **2264–2300**; election **4188–4250**; election trigger **2649**; HUD bar **3618–3629**; display panels **4050–4186**; preserve seeding **750–767**; protection/build gates **2707–2734**; preserve develop **2886–2896**; dead constants/counters **524, 568, 2297, 2799, 2890, 4157**.
