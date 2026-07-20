# ISOPOLIS POLITICS OVERHAUL — "THE MAP FIGHTS BACK"

Design doc for the politics track. All line numbers refer to /home/user/isopolis/isopolis.html as analyzed
(analyses: politics.md, simulation.md, architecture.md in ../analyses/).

---

## VISION

Today politics in Isopolis is a thermometer: a 0–100 approval score that never stops a single shovel. This
overhaul turns the map itself into the political arena. Land has owners with names and attachments; your own
early buildings age into constituencies that resist you; wild land has defenders whose price rises every time
you pave; a five-seat council — elected district by district *from the city you actually built* — must bless
your biggest moves. Politics stops being a score you read and becomes a terrain you navigate: every large
action has three exits (pay dearly, fight a months-long battle, or build around) and each exit leaves a
different permanent mark on the map. The signature artifact is the road that runs straight, then bends around
one stubborn parcel — a scar that tells a story, exactly like real city maps.

Political friction is also the game's missing pacing system. Money is abundant in Isopolis (the economy track
is addressing that); *permission* becomes the scarce resource. A new slow-regenerating currency — Political
Capital — prices every shortcut, so the player constantly chooses between spending months of calendar time
(courts, dockets, reviews), spending goodwill (faction favor, approval), or spending capital. A village mayor
barely notices any of this; a metropolis mayor governs a map crowded with holdouts, landmarks, protest camps
and a council that watched them build all of it. Crucially, nothing is a flat "no": every blocked tile is a
puzzle with visible options, and the drama arrives through the ticker, map chips and set-piece votes — never
through modal spam.

---

## DATA MODEL

Design rule: the per-cell grid stays almost untouched (save format is positional/append-only, architecture.md
§SAVE). All new political state lives in **one new `S.pol` object** plus **one sparse parcel map**, serialized
as new top-level save keys. Save version bumps to `v:3`; a v2 load simply initializes politics fresh from the
map (see Save implications below).

### 1. Per-cell additions (grid `makeCell`, line 600)
```js
c.age = 0;        // months at level>=1 (res/com/ind/mix/farm/office). ++ in monthly(). 0 for vacant.
                  // SAVE: append as positional slot 12 of the cells array (append-only is safe, arch §SAVE).
c.landmark = false; // historic landmark flag (protected like a preserve). SAVE: slot 13 (0/1).
```
Everything else per-cell is derived or lives in the sparse layer.

### 2. Sparse parcel layer (new module-level global, beside `grid` at 589)
```js
let parcels = {};   // idx -> Parcel. Sparse: only tiles where ownership MATTERS (expected < ~200 entries).
// Parcel = {
//   i: idx,                     // tile
//   kind: 'homestead'|'tenure'|'trust'|'landmark',
//     // homestead: seeded old family plots (genTerrain). tenure: emergent, from aged res.
//     // trust: conservation trust (wraps wild reserves; one virtual parcel per reserve blob).
//     // landmark: post-ED-loss or designated historic — permanently unsellable.
//   owner: 'Ada Merced',        // generated name (seeded, stable): first+last name tables.
//   faction: 'neighbors'|'greens'|'labor'|'growth',   // who takes it personally
//   attach: 0.0..1.0,           // attachment — the whole willingness model (see Mechanics M3)
//   refusals: 0,                // rejected offers -> price escalation
//   since: monthStamp,          // when activated
//   flags: {holdout:1, edLost:1, softening:1, ...}
// }
```
Parcels are created **lazily**: a tile only becomes a Parcel the first time the player's action touches it
(bulldoze/zone/road over an aged building), or at map-gen for homesteads/trusts. Unowned land never enters
this map — the economy track prices unowned land; politics only prices *owned* land (see INTEGRATION §API).

### 3. `S.pol` (new field on `S`, init in state block 565–588, reset in `newCity` 3871)
```js
S.pol = {
  pc: 3, pcCap: 12,                       // Political Capital (M1)
  fav: {growth:10, neighbors:0, greens:0, labor:0},   // -100..+100 per faction (M2)
  council: [                              // 5 seats, one per district (M4)
    {dist:'Core', faction:'growth', name:'Cllr. Okafor'}, ... // NW/NE/SW/SE/Core
  ],
  upzoned: {},                            // dist -> true: high-density ordinance passed (M8)
  docket: [],                             // pending items: {id, type, x, z, filedMonth, votesNeeded,
                                          //   whip:{seatIdx:pcSpent}, state:'queued'|'voted'|'court', ...}
  court: [],                              // active ED cases {i, monthsLeft, strength}
  petitions: [],                          // {id, cause, x, z, monthsLeft, size}
  protests: [],                           // {i, cause, size, months, cooling}  — physically on the map (M9)
  ballots: [],                            // {id, kind, forMonth, yesLean, campaign:{pcYes,pcNo,money}}
  edTaken: 0,                             // eminent-domain takings (mirror of wildTaken; escalator)
  graft: 0, scandal: 0,                   // favors owed / active-scandal months remaining (M10)
  greenbelt: false,                       // Greenbelt Initiative passed: wild land frozen forever (M7)
  era: 0,                                 // cached difficulty tier 0..4 (see DIFFICULTY ARC), from milestones
};
```
Existing dead state that comes ALIVE (no new fields needed): `S.devLean` (568 — finally read),
`S.recordLean` (2297 — un-stubbed to mirror devLean), `S.wildTaken` (2889 — read by WILD pricing),
`WILD_STEP` (524 — finally referenced), `growPress/restPress/popLean/leanGap` (2264–2300 — feed faction favor).

### 4. Save implications
- Bump `data.v` to **3** in `saveCity` (4451). Add top-level keys: `pol: S.pol`, and
  `parcels: [[i, kindCode, nameSeed, round(attach*100), refusals, flagBits], ...]` (positional, append-only,
  own codebook `PARCEL_KIND=['homestead','tenure','trust','landmark']`).
- Cells array: append slots 12 (`age`, int months, cap 255) and 13 (`landmark` 0/1). Loader (4461) already
  reads positionally with fallbacks; v1/v2 saves lack the slots → default 0, and lack `pol`/`parcels` →
  `initPolitics()` reconstructs: homestead/trust parcels re-seeded from `S.seed` (deterministic), ages
  estimated as `level*36` months. Accept v 1|2|3 at the gate (4462). No other migration machinery needed.
- `newCity()` (3871) and `loadCity` must reset `parcels = {}` and rebuild holdout/landmark marker meshes
  in the rebuild pass (4503–4524).

---

## MECHANICS

### M1 — Political Capital (PC): the currency of permission
**Design:**
- `S.pol.pc`, integer, cap `pcCap = 12 + 4*era`. Shown as a small laurel icon + number in the top bar
  (next to funds, updateTop 3603). Hidden until era ≥ 1 (Village).
- Regen in `monthly()`: `pc += 1 + max(0, floor((approval-50)/12))` (so 50% approval → +1/mo, 74% → +3/mo).
  Bonus: +3 on election win, +2 per milestone, +1 when a petition is resolved by concession.
- Spends (all optional accelerants — calendar time is always the free alternative):
  ED filing **5** · whip one council seat **3** · fast-track a docket item or review **4** ·
  quell a protest **3** · endorse a landmark **0** (gains favor) · ballot campaign push **2/point** ·
  "favor" backroom deal **0 PC but graft++** (M10).
- If an action needs PC you don't have, the button shows disabled with "need N⚖ — regenerates with approval."

**Why:** Realistic — mayors budget goodwill, not just money; every real city hall rations its fights.
Fun — it converts approval from a passive scoreboard into fuel the player actively wants, and it is the
pacing interlock: money can no longer buy simultaneity. You can always *wait* instead of spend, so friction
reads as strategy, not a wall. It also makes low approval doubly painful without any new punishment popup.

### M2 — Factions & Favor: four constituencies that watch everything
**Design:** Four factions, favor −100..+100, decaying 10% toward 0 yearly (grudges fade):
- **Growth** (developers, chamber of commerce) — likes: development on demand (`growPress` high and falling
  vacancy), upzoning, ED for private redevelopment, road expansion. Hates: greenbelts, landmark sprees,
  demand left unmet (`growPress>0.6` for 6+ months → −2/mo).
- **Neighbors** (homeowners, NIMBY, preservationists) — powered by the existing `restPress` engine
  (2264–2300) plus: tenured homes bulldozed (−3 each), ED takings (−8, −12 if home), upzoning near old
  neighborhoods, towers by parks (`_harsh`). Likes: landmarks endorsed (+6), petitions conceded (+5),
  parks near old cores.
- **Greens** (conservationists) — reads `wildTaken` (finally!), pollution trend, `green` composite (2239).
  Wild tile taken: −2 each (−6 once a whole reserve is gone). Preserve placed (+2, placePreserve 2789),
  coal→clean transition (+8 once), pollution falling year-over-year (+3/yr).
- **Labor** (working families, unions) — likes job growth, industry, big public works (each plant/school
  built +2), low unemployment (`jobsFactor` from sim 2586). Hates blackouts (`unpowered`>5 → −2/mo), tax
  >9%, clearing protests with police (−10).
Favor updates happen in `monthly()` via a small ledger (max ~3 lines/mo shown in ticker: "Greens seethe as
the north reserve falls"). `S.devLean` keeps accumulating exactly as today (2799, 2890) and now:
`S.recordLean = round(S.devLean)` (un-stub 2297) — your *record* on the tree↔crane lean meter (337–341),
with the revived 'Out of step' approval part (see M11).

**Why:** Real cities are coalitions, and these four cover the actual fault lines (growth machine vs.
homevoters vs. environmentalists vs. labor). Fun — favor is a legible reputation system the player reads at
a glance (4 bars in the City Hall panel), it converts existing invisible aggregates (restPress, wildTaken,
jobsFactor) into characters with opinions, and it drives everything downstream (prices, votes, protests,
elections) so every mechanic teaches the same vocabulary.

### M3 — Parcels, Owners & Holdouts: who sells, at what price, who fights
**Design:** The willingness model (this is the interface the economy track consumes — INTEGRATION §API):
- **Fair market value** of a tile: `landFMV(i) = round(60 + 340*lvMap[i])` (§60–§400). The economy track
  owns this function/base; politics only *multiplies* it for owned parcels.
- A tile is **owned** when: it's a seeded homestead/trust parcel, OR a built res tile with `age ≥ 24` months
  the moment an action first touches it (lazy Parcel creation; com/ind/office sell at 1.25× FMV, no drama —
  businesses take the check).
- **Attachment** rolled once at creation:
  `attach = clamp(0.15 + years*0.03 + (homestead?0.45:0) + 0.2*eduFrac + rng()*0.3 - (lv<0.35?0.1:0), 0, 1)`
  (educated, settled cities guard their character — same eduFrac dial as restPress 2295).
- **Offer rungs** the player can pick per parcel (or per action, applied to all): FMV **1×**, Generous **2×**,
  Whatever-it-takes **3.5×**. A parcel sells iff `mult ≥ 1 + 3.5*attach`. So attach ≤0.29 sells generous,
  ≤0.71 sells at top rung, **attach >0.71 = true holdout — money alone cannot buy it.**
- **Escalation:** each refused offer `refusals++` → future asks ×`(1+0.35*refusals)`; each neighbor bought
  out within radius 2 raises remaining owners' `attach += 0.05` (last-one-standing pride).
- **Softening:** yearly, `attach -= 0.03` if you improved their block (new park/school within 4 tiles, or
  lv rose ≥0.1); `attach += 0.02` if pollution rose nearby. Holdouts also have a small yearly life-event roll
  (0.06): "the owner passes / retires to the coast" → heirs sell at 2× — the map slowly heals, on its own clock.
- **UI:** owned parcels show nothing until touched. A touched holdout gets a small picket-sign marker mesh +
  a clickable map chip (reuse the `showCirclePopup` anchored-popup pattern, 4335):
  `"Ada Merced — family homestead, 34 years. Won't sell. [Offer 3.5× §1,380] [File eminent domain 5⚖] [Route around]"`.
  Bulk actions aggregate: ONE toast ("3 of 14 owners refused to sell — §2,140 spent"), markers on the map,
  no modals ever.

**Why:** This is the literal texture of real cities — assembly problems, holdout premiums, blockbusting
resentment, the spite house. Fun — it converts a paint-anywhere sandbox into a negotiation with characters
who have names, three clean exits per blocked tile, and long-term counterplay (improve the block, wait for
the heirs) that rewards patient, humane play as much as brute force.

### M4 — The Council & the Docket: big actions need votes
**Design:**
- **Districts:** fixed geometry — Core (radius <10 of map center) + NW/NE/SW/SE quadrants. Cheap
  `distOf(x,z)` helper. **5 seats**, one per district.
- **Seating:** recomputed every **2 years** (city election + midterm — hook beside the election trigger,
  2649). Each seat goes to the faction with the highest district census score (one grid pass, piggybacked
  on `recalcMood`): Neighbors ← tenured homes(age≥120mo) + landmarks×3; Growth ← com/office/high-dens tiles +
  unmet demand; Greens ← parks + preserves×2 + low pollution; Labor ← ind/farm tiles + blackout grievance.
  Incumbent faction gets ×1.15 stickiness; ±10% seeded noise so seats feel contested.
  **The city you build literally elects the council that then constrains what you build next.**
- **What needs council approval (a "docket item"):** eminent domain filings (M5) · taking a 2nd+ wild
  reserve (M7) · demolishing a landmark (M6) · district upzoning ordinances (M8) · nuclear plant siting
  (era≥2) · clearing a protest by police (M9).
- **Flow (NO modal):** action button files the item → chip confirms "On the docket — vote at end of next
  month." Docket lives in the City Hall panel with a live projected tally per item. Vote resolves inside
  `monthly()`: seat votes yes iff
  `stance[faction][type] + fav[faction]/40 + local + 1.2*whip − (scandal?0.8:0) > 0`,
  where `local` = −1.0 if the action is inside that seat's district and is ED/demolition/upzoning (NIMBY),
  +0.8 if it's a park/school/transit. Stance table (sample): ED-for-road: growth +1, labor +0.5,
  neighbors −1.5, greens −0.3; upzoning: growth +1.2, neighbors −1.2, greens −0.4, labor +0.3.
  Pass = 3/5. Result arrives as ticker headline + toast; failed items can be re-filed after 6 months,
  put to ballot (M8), or abandoned.
- **Whipping:** 3 PC per seat (+1.2 to that seat's score), spent from the docket panel before the vote.
  Projection updates live — the player sees exactly what their PC buys.

**Why:** Real: council approval is where city-building actually dies or lives, and district NIMBY votes are
the reason real projects detour. Fun: it creates a readable mini-chess layer (count to 3), makes map
composition strategic in a brand-new way (want a green seat? build parks in the SW), and its monthly-batch,
ticker-first resolution delivers politics as *anticipation* rather than interruption.

### M5 — Eminent Domain & the Courts: the heavy hammer
**Design:**
- Available era≥2 (Township). From a holdout's chip: **File eminent domain — 5 PC** → docket item (M4).
- If council passes → **court case**, 3 months on `S.pol.court`. Win probability:
  `P = base(purpose) − 0.15*min(edTaken,4)·(era≥3) − (neighborsFav<−30 ? 0.1 : 0) + (blighted? +0.15)`
  with `base`: road/park/school/plant = 0.8 (clear public use), private redevelopment (zoning) = 0.45.
  Optional "retain outside counsel" §2,000 → +0.1. Ticker drumbeat each month ("Merced case: day in court").
- **Win:** pay 1.5× FMV, tile transfers, `edTaken++`, Neighbors −12 (−8 if non-res), a protest may spawn at
  the site (40% if Neighbors < −20). The taking is remembered: `devLean += 1.0`.
- **Lose:** pay §1,500 costs, parcel becomes `kind:'landmark'` — **permanently unbuildable** ("the court
  finds for Merced; the homestead is granted protected status"). The scar is now legal and forever. This is
  the risk that makes "route around" genuinely attractive.
- Escalator mirrors WILD_STEP: each successive filing costs `5 + edTaken` PC. Cities that govern by
  condemnation grind to a halt — as in life.

**Why:** Eminent domain is the real, dramatic instrument (Kelo, urban renewal) and its true cost was never
money — it was legitimacy. Fun: a high-stakes 3-month slow-burn gamble with a visible probability, a
permanent map consequence on a loss, and an escalating price on repeat use. It gives the holdout system its
"or else," while punishing the player who makes it routine.

### M6 — Historic Landmarks: your own city fights back
**Design:**
- Eligible: any building `level ≥ 2`, `age ≥ 120` months, `lvMap ≥ 0.5`. Monthly, if Neighbors favor > 0 or
  `restPress > 0.4`, chance `0.04 + 0.02*era` that ONE eligible building is **nominated** (cap: 1 active
  nomination; total landmarks ≤ 3 + 2*era). Ticker: "Preservation society nominates the Old Ferris Mill."
- Player has 2 months to respond via its map chip: **Endorse** (0 PC): tile gets `c.landmark=true`, joins
  `protectedStruct` (2709) — permanent; +6 Neighbors, +4 approval one-time, and the landmark radiates
  +0.06 lvMap and counts as 0.5 park for `green` (2239) within radius 3. **Contest** (docket item; if
  council rejects the nomination: Neighbors −6, no landmark). **Ignore** = endorse by default.
- Demolishing a landmark later: council supermajority (4/5) + §5,000 + Neighbors −20. Or the backroom way
  (M10): a midnight demolition favor — instant, graft +3.
- Landmarks block roads/zoning exactly like preserves — `canRoad`/`canPlop` (2711–2713) — so late-game
  straight lines must thread between the buildings the player themself grew in year 3.

**Why:** The most honest city-politics loop there is: the thing blocking your highway is your own history.
Realistic (landmark commissions are the classic redevelopment veto) and fun because it's *earned* — the
player remembers building that mill — and because endorsing is genuinely good (value + approval aura), so
the choice between museum-city and bulldozer-city is a real identity choice that feeds `devLean`.

### M7 — Wild Land, Environmental Review & the Greenbelt Ballot (WILD_STEP finally wired)
**Design:**
- Wild reserves (seeded 750–767) become **trust parcels** with an owner name ("Cascadia Land Trust").
- Bulldozing a wild tile (2886–2896) now costs `WILD_BASE + WILD_STEP * S.wildTaken` — the comment at 524
  implemented verbatim: §300, §310, §320… tile n. Doubled while Greens favor < −30. `wildTaken++` and
  `devLean += 1.5` stay as-is.
- Taking your **2nd reserve onward** requires a docket vote first (one vote per reserve blob, not per tile).
- **Environmental review:** roads/zoning within 2 tiles of water or adjacent to a preserve queue as ghost
  tiles for `2 − (greensFav>20 ? 1 : 0)` months before construction (fast-track: 4 PC). Purely a delay, never
  a veto — teaches the review vocabulary gently.
- **The Greenbelt Initiative (set-piece):** when the 3rd reserve falls (or `wildTaken ≥ 60`), Greens force a
  ballot measure for next January: *freeze all remaining wild land permanently*. Vote share:
  `yes = 50 + greensFav*0.35 + neighborsFav*0.15 − growthFav*0.2 − (approval−50)*0.25 ± campaign`
  (each side; player campaigns with PC/money, 2 PC per point). **Passes → `S.pol.greenbelt=true`:** remaining
  wild tiles can never be developed, drawn with a hatched border on the map — a permanent, player-caused
  constraint scar. Fails → Greens −25, protests at city hall, but the land is yours.

**Why:** Escalating acquisition cost is exactly how real open-space politics works — the last marsh is
priceless. Fun: WILD_STEP turns an inert constant into a visible countdown ("every acre makes the next
dearer"), and the Greenbelt ballot is a dramatic, player-triggered referendum whose outcome permanently
redraws the map either way. It also finally gives `placePreserve` a strategic role: buying Greens favor.

### M8 — Petitions, Community Meetings & NIMBY Upzoning
**Design:**
- **Upzoning ordinance:** from era 3 (Boomtown), painting **high-density** zones in a district requires that
  district's ordinance (`S.pol.upzoned[dist]`) — one council vote per district, ever. Existing high-density
  is grandfathered. Before Boomtown, density is free (small towns don't fight towers that don't exist).
- **Petitions:** softer, earlier friction. Triggers: painting high-density within 3 tiles of ≥5 tenured
  homes; siting industry/coal within 4 of homes; a 3rd landmark demolition attempt. A petition = map chip +
  ticker, 2-month fuse, at most ONE live petition (others queue).
- **Community meeting** (the response, a card in the City Hall panel — not a modal): three buttons.
  **Concede** (cancel/shrink the action; +5 with the aggrieved faction, +1 PC "goodwill dividend").
  **Compromise** (action proceeds at reduced intensity: density capped one level lower for those tiles, or
  a mandated buffer park you must place within 6 months; +2 faction).
  **Press on** (action proceeds; faction −8; 50% the petition graduates to a protest, M9).
- Ignoring the fuse = Press on, plus −2 approval for arrogance.

**Why:** This is where "NIMBY blocks upzoning" becomes play: the neighborhood meeting is the true atom of
city politics. Fun: petitions are cheap early warnings that teach the protest system before it has teeth,
and Compromise produces the *visible scars of negotiation* — the odd mid-rise row, the appeasement park —
that make a city map look lived-in and argued-over rather than optimized.

### M9 — Protests: opposition you can see from the sky
**Design:**
- A protest is a physical crowd: 8–12 tiny animated figures + picket signs on a tile (sprite pulse pattern
  like zap/flame, 4611–4618), spawned at the contested site (or city hall tile for citywide grievances).
- Sources: pressed-on petitions (50%), ED wins (40% if Neighbors < −20), reserve #3+ taken, scandal (M10),
  blackouts ≥ 8 buildings for 3 months (Labor pickets the biggest plant).
- Effects while active: construction blocked within radius 1 (`canPlop`/`canRoad` check
  `protestBlocked(x,z)`), −1 approval/month each (city cap −4), local com occupancy target ×0.8 (shoppers
  avoid the noise). Duration: base 3 months, +2 per month the cause continues.
- Resolutions: **Address the cause** (protest decays in 1 month; faction +4) · **Wait it out** (it ends;
  faction −2) · **Negotiate: 3 PC** (ends now; small concession auto-logged; faction +2) ·
  **Police clearance** (docket item! council must approve; instant, but Labor −10, Neighbors −6,
  approval −4, and 25% it re-spawns doubled — the crackdown headline).
- Max 3 simultaneous protests; new triggers queue behind existing ones (anti-spam).

**Why:** Protests make grievance *diegetic* — the map itself tells you where you went wrong, no dialog
needed. Fun: they're a spatial puzzle (they block the exact tiles you wanted next), a genuine set-piece to
zoom in on, and the police option is a deliciously tempting bad idea with council fingerprints on it.

### M10 — Favors & Scandal: the tempting shortcut
**Design:**
- Wherever politics stalls you, a quiet grey button: **"Make a call."** Costs 0 PC and little money;
  `graft++` (weight varies: skip review +1, guarantee a council vote +2, midnight-demolish a landmark +3,
  "encourage" a holdout to sell at FMV +3).
- Every month: scandal detonation chance `= graft * (0.4 + 0.6*era)%` (a bigger city has a real press
  corps). On detonation: **approval −16, PC → 0, Growth −20** (donors scatter), council votes at −0.8 for
  12 months (`S.pol.scandal=12`), 6 months of brutal ticker headlines, `graft=0`. If it lands within 12
  months of an election, add −8 election swing. Second career scandal → automatic recall election (reuses
  the existing recall machinery, 4197/4241–4245).
- Graft decays 1/year if you stop. The City Hall panel shows a discreet "exposure" meter (low/rising/severe)
  — never exact numbers; corruption should feel like held breath.

**Why:** Corruption is the historically accurate lubricant of city building (from Tammany to today), and a
pure-friction system begs for a devil's bargain. Fun: it's the classic risk loan — instant relief, compound
interest, hidden due date — and it converts the anti-frustration valve itself into drama. The vague
exposure meter creates dread without math homework.

### M11 — Elections & Approval, rewired to the factions
**Design:**
- Extract the duplicated approval formula (2635 & 3612) into one `computeApproval()`. Add terms:
  `− protests.length*1.0 − (scandal>0?14:0)`; everything else unchanged. Fix the displayed win bar to use
  the real `winThreshold(term) = 43 + min(term,5)*2.2` everywhere (today the HUD lies: 48+term*1.6 at 3620).
- `runElection` (4188): replace blind `swing = rand*8−3` with
  `swing = clamp(Σ fav_f * w_f / 100 * 6, −6, +6) + rand*4−2`, weights `w` by era (Growth counts more in a
  boomtown, Neighbors more in a metropolis). The election modal's "What moved the vote" panel (4214) gains a
  faction line — the same favor bars the player watched all term.
- Council reseats at every election AND midterms (every 2 years). Ticker covers midterms like news
  ("Greens take the Northwest").
- Revive the mothballed 'Out of step' approval part (partDesc 4069, `_LBL` 4121): when
  `|recordLean − popLean| > 45`, add part `['Out of step', −(gap−45)*0.15]` — your *record* (devLean, finally
  read) clashing with what the public currently wants. `leanWords` (4157) works again for free.

**Why:** Elections stop being a dice roll on one number and become the sum of four relationships the player
managed for years — legible, earned, fair. Reviving recordLean closes the loop the original author left
half-built: the tree↔crane meter finally *means* something at the ballot box.

---

## THE SIGNATURE MOMENT — the road that bends

The player, mid-village era, drags a road 20 tiles east to reach a new quarter. End to end:

1. **Drag preview** (existing road-drag path, pointer handlers 3207): each tile of the preview line is
   color-coded live — white (clear), **gold** (owned, will auto-buy: chip shows `Road §400 + land §520`),
   **red** (holdout homestead / preserve / landmark: cannot buy at any rung). The player sees the
   Merced homestead — 1 red tile, 34 years old, seeded at map-gen — sitting on tile 12 of 20.
2. **Release.** `placeRoadPath` (2723) no longer silently filters and gaps (2725). It: builds white tiles;
   auto-purchases gold tiles (folded into one `tryCharge`); **stops clean at each red tile**, leaving two
   stubs and NO road on the blocked tile. A picket-sign marker rises on the homestead. ONE toast:
   *"Ada Merced won't sell — her family's homestead. The road stops at her fence."* A persistent map chip
   (anchored popup, `showCirclePopup` pattern 4335) pins the site. Ticker: *"Road crew idles at the Merced
   line."* No modal. The game does not pause.
3. **The chip offers the three exits:**
   - **[Offer whatever it takes — §1,380 (3.5×)]** — greyed with a tooltip if `attach > 0.71`: *"She isn't
     selling. It was her grandmother's."* (For lesser owners this button simply works — pay dearly, road
     completes, done. Refusal escalates her ask AND her neighbors' attachment.)
   - **[File eminent domain — 5⚖]** — era-locked before Township ("no legal department yet"). Council next
     month (Neighbors seat NW votes no; you may whip), then 3 months of court ticker drumbeat, ~80% win
     (public road). Win: road completes, Neighbors −12, maybe pickets. **Lose: the homestead becomes a
     landmark — that tile is closed forever,** and you route around anyway, four months poorer.
   - **[Route around — §160]** — hovering it draws a live dashed detour: A* from stub to stub over
     `canRoad`-passable tiles, avoiding holdouts/landmarks/preserves/protests, cost = tiles×20 + any willing
     land en route. One click builds the bend.
4. **The scar.** The road now jogs two tiles south around a farmhouse and its garden — permanently legible
   from the air. `devLean` unchanged (you chose peace); Neighbors +3 (*"the mayor went around"*), a one-time
   hint explains the mark. Years later, the life-event roll may fire: ticker — *"Ada Merced dies at 94;
   her heirs sell the homestead."* The tile opens. The bend, however, is already lined with buildings the
   player zoned along it. Straightening now means demolishing *those*. Most players leave it: the map has
   grown a story.
5. **Every later system deepens this same moment:** at metropolis scale the red tile might be a landmark the
   player endorsed in year 6, or a protest camp, or greenbelt land — same chip, same three exits, always.

Implementation nucleus: rework `placeRoadPath` (2723–2734) — split `fresh` into {clear, buyable, blocked};
new `routeAround(a,b,blockedSet)` A* (trivial at N=68); `polAcquire(tiles,'road',tier)` for the purchases;
marker mesh + anchored chip; `protectedStruct` (2709) extended with landmark; everything else is M3/M5 as
specced.

---

## SCENARIOS

### S1 — The Merced Homestead (Village, ~pop 700)
As narrated in THE SIGNATURE MOMENT. First contact with the parcel system; the player routes around, earns
Neighbors +3, and learns the grammar: red tiles are stories, not bugs. Twelve game-years later the heirs
sell; the player keeps the bend and builds a small park on the old plot — Neighbors +5, and the ticker
canonizes it: *"Merced Park opens on the old homestead."*

### S2 — The Old Ferris Mill (Township→Boomtown, ~pop 3,000)
The player's very first industrial building (age 130 months, level 3, in the now-valuable Core) is nominated
as a landmark. They ignore the chip (auto-endorse): +4 approval, a handsome value aura. Two years later they
want a straight avenue through that exact block for the new office quarter. The mill blocks it. Demolition
needs 4/5 council — the Core's Neighbors councillor and the SW Greens seat are hard no; whipping can only
reach 3. Options on the table: re-route the avenue (a dogleg that will annoy traffic forever), put
demolition to a ballot (8 PC, risky at 61% projected no), or the grey button — *"a demolition crew works
fast at night," graft +3.* The player takes the night crew. Fourteen months later, detonation:
**"WHO KILLED THE MILL?"** — approval −16, council frozen, protest at the rubble. The avenue is straight.
The player now knows what straight costs.

### S3 — The Greenbelt Initiative (Boomtown, ~pop 5,000)
Housing demand is howling (`growPress` 0.9); the cheapest land is the third wild reserve. Taking reserve #2
already cost a council fight; tile prices are at WILD_BASE + WILD_STEP·48. The player bulldozes into
reserve #3 — trigger: Greens force the Greenbelt ballot for January. Growth bankrolls the No side
(auto −6 to yes); Greens favor is −40 after years of paving, but Neighbors quietly back them (+15·0.15).
Projection: 54% yes. The player spends 6 PC campaigning No and rush-builds two parks (Greens +4, `green` up,
approval up → the approval term swings it). January: **48% yes — the initiative fails.** The remaining wild
land is open… and a permanent protest camp plants itself at the reserve's edge, Greens sit at −60 for a
decade, and the SW council seat goes Green at the midterm and votes no on *everything*. The player won the
land and inherited an opposition. (Had it passed: hatched greenbelt border forever — a constraint scar the
player caused, and honestly a beautiful one.)

### S4 — The Nuclear Vote (Boomtown/Metropolis, ~pop 8,000)
Coal smog is tanking approval; the player wants the §14,000 nuclear plant (unlock 3,500, 2564). New rule:
nuclear is a docket item with siting review — opposition scales with homes within radius 6 of the chosen
3×3 site. Site A (downtown edge): Neighbors −1 local NIMBY on two seats — projected 1/5. Site B (far shore,
8 road-tiles of extra approach and an environmental review delay for the waterline): only the Labor and
Growth seats care — projected 4/5, passes. Labor +8 (jobs), Greens split (clean air +3, waterfront −2).
The plant rises far from town with a long lonely access road — *the map now looks like real infrastructure
geography, pushed to the periphery by votes, not by the player's aesthetics.*

### S5 — The Crosstown Corridor (Metropolis, ~pop 15,000)
The endgame set-piece. The player needs a crosstown road through the oldest quarter: 22 tiles, of which
9 are tenured homes (avg age 25 years), 2 are landmarks, 1 hosts a protest. The preview lights up like a
warning. A pure-money pass buys 5 of the 9 homes (§9,400, last-one-standing pushes two owners into holdout).
ED works for two more (10 PC, 6 months, Neighbors −24 total, one case LOST → a third landmark spawns mid-
corridor). The final alignment threads a chicane between the landmarks; the player concedes the petition
("Save the Row") and accepts a mandated buffer park. Result on the map: a road that runs straight, jinks
twice around two old houses and a mill, passes a memorial park that exists because a community meeting
demanded it — and a Neighbors-dominated council for the next 4 years. Approval dipped 9 points across the
saga; the corridor carries traffic; the story is carved into the street grid. This is the whole design in
one screenshot.

---

## DIFFICULTY ARC

Political friction scales on `S.pol.era`, derived from milestones (2536–2544) — the same ladder that already
gates tools, so pacing stays on one spine:

- **Era 0 — Crossroads/Hamlet (<600):** politics asleep. No PC, no factions UI, no parcels activate (every
  owner sells at FMV instantly). Only inherited friction: preserves block as today; homesteads exist on the
  map but sell at 2× without fuss. The player builds nearly as freely as the current game.
- **Era 1 — Village (600):** factions appear (favor bars, City Hall panel unlocks), PC starts ticking,
  homestead parcels wake up (the first possible signature-moment bend), petitions begin. No council yet —
  disputes are personal, mayor vs. owner.
- **Era 2 — Township (1,500):** the council seats (5 districts) and the docket opens; eminent domain and
  environmental review unlock; landmark nominations begin (the city is now old enough to have history);
  WILD escalation active. Roughly one political "event" per 2–3 game-years.
- **Era 3 — Boomtown (3,500):** upzoning ordinances required for high-density; protests can spawn; ballot
  measures (both directions); scandal press risk rises; ED filings escalate in PC cost. The mid-game is now
  about coalition maintenance, not just cash flow.
- **Era 4 — Metropolis+ (7,500/15,000/30,000):** faction-initiated ballots, landmark caps rise (the map
  accretes protected fabric), tenured-home holdouts are everywhere in the old core, council midterms swing
  hard, one political event per year is normal. Building a straight anything through the historic center is
  a campaign — which is exactly the real-city endgame: growth happens at the edges and by negotiation in
  the middle.

Tuning guardrail: at every era, a player who *never* engages politics can still grow — outward, around,
slower. Friction shapes *where and when*, never *whether*.

---

## INTEGRATION

### Existing dead scaffolding, resurrected (the overhaul's spine)
| Dead thing | Where | New life |
|---|---|---|
| `devLean` | 568, 2799, 2890 | mayoral record: read by 'Out of step' part, faction reactions, election flavor (M2, M11) |
| `recordLean = 0` stub | 2297 | `= round(S.devLean)`; `leanWords` (4157) and 'Out of step' branch (4069, 4121) come alive |
| `WILD_STEP` | 524 (never used) | wild tile cost `WILD_BASE + WILD_STEP*wildTaken` (M7, in bulldoze 2888) |
| `wildTaken` | 2889 (write-only) | read by WILD pricing, Greens favor, Greenbelt trigger (M7) |
| `growPress/restPress` | 2264–2300 | direct inputs to Growth/Neighbors favor drift (M2) |
| preserve blobs | genTerrain 750–767 | become named trust parcels; comment "the politics layer will read this" honored |
| recall/strikes machinery | 4197, 4241–4245 | reused verbatim for scandal-triggered recalls (M10) |
| `'Out of step'` vestigial branch | 4069, 4121 | emitted again when \|recordLean−popLean\|>45 (M11) |

### Functions to modify (by line)
- **524**: add `const POL = {...}` config table (all tuning constants in one place, per arch §7).
- **600 `makeCell`**: add `age`, `landmark`.
- **750–767 `genTerrain`**: after reserves, seed 4–7 homestead parcels (1–3 tiles, small farmhouse via
  existing house part-builders, ≥10 from center, deterministic from `S.seed`); register trust parcels.
- **2264 `recalcMood`**: un-stub 2297; append district census tallies (same pass) for council seating.
- **2569 `monthly()`**: append `polTick()` — PC regen, ledgered favor drift, docket votes, court cases,
  petition fuses, protest upkeep, landmark nominations, scandal roll, attach softening, `c.age++` pass
  (fold into the existing occupancy loop at 2590 to avoid a second scan).
- **2635 & 3612**: replace both copies with one `computeApproval()`; add protest/scandal terms; fix the
  win-bar mismatch (3620, 4109, 4120 → `winThreshold()`).
- **2707–2713 gates**: `protectedStruct` += `c.landmark`; new `polBlocked(c)` (holdout marker, protest
  radius, greenbelt, pending-review ghost) checked by `canPlop`/`canRoad`.
- **2723 `placeRoadPath`**: the signature-moment rework (split clear/buyable/blocked; stubs not gaps;
  markers + chip; `routeAround` A*).
- **2755 `zoneRect`**: call `polAcquire(tiles,'zone',tier)` for tiles with `age≥24` res; high-density
  requires `S.pol.upzoned[dist]` at era≥3; petition trigger check.
- **2789 `placePreserve`**: +2 Greens.
- **2886–2896 `bulldoze`** preserve branch: WILD_STEP pricing, reserve-vote gate, Greens ledger; new aged-
  home branch routes through `polAcquire`.
- **2649** (election trigger): add midterm council reseat at `year%2` offset; ballot resolution each January.
- **4188 `runElection`**: faction swing, faction line in the modal, council reseat.
- **4437/4461 save/load**: v3, keys `pol` + `parcels`, cell slots 12–13, `initPolitics()` fallback for v1/v2.
- **3871 `newCity`**: reset `S.pol`, `parcels`.

### New UI surfaces (all reusing existing patterns — arch §UI)
- **City Hall panel** (key `P`, icon in top bar 323–356): faction favor bars (reuse `bar()` 3633), council
  seats with district labels, the docket with live tallies + whip buttons, active ballots, exposure meter.
  Built as a `.msModal` glass panel like `openApproval` (4107) — player-opened, so pausing is fine.
- **Anchored map chips** for parcels/petitions/protests: clone the `showCirclePopup` mechanism (4335) —
  it is exactly the click-to-act map popup this needs.
- **Politics overlay**: new `MAPS` entry + `viewMarks` branch (3104) + `VIEWS` (3102): parcels gold,
  holdouts red, landmarks purple, protests orange pulse, district borders, greenbelt hatch.
- **Ticker** (3768 `tickerMessages`): ~20 new line generators (faction moods, court days, council results,
  nomination news, scandal headlines). The ticker is the primary politics narrator — cheap, ambient, zero
  interruption.
- **Toast/hint** (3750/3761): one-time teach lines per mechanic; aggregate results only.
- **Lean meter** (337–341) tooltip: "Your record" (devLean) vs "Public mood" (popLean).

### Interface contract with the economy/growth track
Politics owns *who sells and who fights*; economy owns *what land is worth*:
- `landFMV(i)` — economy-owned price of unowned land (currently proposed `60+340*lvMap[i]`; theirs to tune).
  Politics never prices unowned land; `zoneCost()` (2721) is theirs to un-zero.
- `polOwnedAt(i) -> Parcel|null` — cheap lookup for their previews/costs.
- `polAcquire(tiles, purpose, tier) -> {placed:[], blocked:[], landCost}` — the ONLY entry point through
  which any build action touches owned land; roads/zones/plops/parks all call it. Economy may wrap it.
- Docket delays and env reviews run BEFORE any construction-time system they add (permits before shovels);
  the ghost-tile state should be shared if both tracks need one.
- Milestone rewards: if they cut the §424k cash firehose, politics compensates pacing-side with the PC
  grants at milestones already specced (M1) — agreed split: they starve money, we ration permission.

---

## RISKS

1. **Frustration vs. friction.** Blocking a sandbox player's road is heresy if it ever feels arbitrary. The
   mitigations are structural (three exits on every block, era gating, aggregation, no modals), but the
   knife-edge is tuning `attach` distribution and holdout frequency. Instrument it: if >2 holdouts hit an
   average village-era road, the roll is too hot. Playtest gate before shipping era 3+ features.
2. **UI spam risk moves to the ticker/chips.** We banned modal spam, but 5 chips + 3 protests + a docket can
   still overwhelm. Hard caps (1 petition, 3 protests, 1 nomination) are specced; keep them.
3. **Save-format fragility.** Appending cell slots 12–13 and new top-level keys is per the format's rules,
   but the positional array has no schema check — one off-by-one in the writer corrupts silently. Add a
   dev-mode round-trip assert (`save→load→deepEqual`) before touching the writer.
4. **The duplicated approval formula must be unified FIRST** (2635/3612) or every new term will drift into
   the same bug class the analysts already flagged. This is a prerequisite refactor, not a nice-to-have.
5. **Perf.** All new per-month work is O(parcels + docket) — trivial — but the district census must
   piggyback `recalcMood`'s existing scan, not add another 68×68 pass; and at Turbo (24 catch-up ticks,
   4588) `polTick` must stay in `monthly()`, never per-tick.
6. **Council opacity.** If players can't predict votes, the docket feels like a slot machine. The live
   projected tally with per-seat reasons ("NIMBY: it's in her district") is load-bearing UI, not polish.
7. **Interlock dependency.** The pacing claim assumes the economy track actually reduces free money; if
   milestone cash survives, players will brute-force the 3.5× rung everywhere and holdouts alone must carry
   friction (they can — attach>0.71 is money-proof — but the game gets stick-heavy). Coordinate tuning.
8. **Scope.** Eleven mechanics is a lot of surface. Shippable core if cut to the bone: M3 parcels +
   signature-moment road flow + M1 PC + M2 favor (display only) delivers the owner's vision; M4–M11 layer on
   in that order. The design is deliberately stratified by era so it can ship era-by-era.
