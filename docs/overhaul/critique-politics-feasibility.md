# POLITICS OVERHAUL — FEASIBILITY CRITIQUE

Reviewed against /home/user/isopolis/isopolis.html (verified by direct read). Verdict shorthand:
**keep** = implementable as specified · **keep-simplified** = right idea, needs the v1 spec below ·
**kill (v1)** = defer out of the first implementation entirely.

## OVERALL

This is an unusually implementation-literate design. I verified essentially every claimed integration point
against the file and nearly all are exactly right: `WILD_BASE/WILD_STEP/PRESERVE_FEE` at 524 (and yes,
`WILD_STEP` is referenced nowhere else — genuinely dead), `devLean` at 568, `makeCell` at 600, reserve
seeding at 750–767 with the literal comment "(the politics layer will read this)", the `recordLean=0` stub
at 2297, the duplicated approval formula at 2635/3612, the HUD's wrong win bar (`48+term*1.6` at 3613/3620
vs. the real `43+min(term,5)*2.2` at 4193 — the "HUD lies" claim is true), `protectedStruct/canPlop/canRoad`
at 2709–2713, `zoneCost()` returning 0 at 2721, and `placeRoadPath` at 2723 whose filter at 2726 really does
skip blocked tiles and leave gaps, not bends. The dead-scaffolding resurrection table is accurate line for
line. The data model is disciplined: one sparse parcel map, one `S.pol` object, two appended cell slots,
global (not per-district) faction favor, hard caps on petitions/protests/nominations. No state explosion:
parcels are lazily created and realistically stay under ~200; council census is 20 counters piggybacked on a
scan `recalcMood` already does; per-month political work is O(parcels+docket). Perf plan is sound — I
confirmed `monthly()` already contains a full-grid loop (occupancy, ~2575) to fold `c.age++` into, and that
`monthly()` is where turbo-safe once-per-month work belongs.

The risks are therefore not architectural; they are (a) **scope** — eleven mechanics plus a genuinely new
map-chip UI system is 2–3 long agent sessions, not one, and the doc's own cut line (RISK 8: M3 + signature
road + M1 + M2-display) is the correct single-session core; (b) **a handful of real spec holes** the doc
papers over: the "clone showCirclePopup" claim badly undersells the chip work, reserve *blobs* have no
identity anywhere in the code, lazily-created parcels interact recursively with the A* router, three
clearForPlop call sites (parks/plants/stations) are missing from the modify list, and environmental-review
"ghost tiles" smuggle in an entirely new construction state machine disguised as "purely a delay"; and
(c) **tuning surface** — the stance table is explicitly a "sample" and a dozen favor triggers have no
numbers, so a coding agent will be inventing ~30 constants; that's acceptable only if they all land in the
proposed `POL` config table. The pacing interface with the economy track holds together and the
who-owns-what split (`landFMV` theirs, `polAcquire` ours) is clean, with one enforcement caveat noted below.

## VERDICTS

| # | Mechanic | Verdict | One-line reason |
|---|---|---|---|
| M1 | Political Capital | **keep** | Trivial state, complete numbers, clean top-bar add. |
| M2 | Factions & favor | **keep** (trim) | Core drift is specified; cut the ~6 unnumbered triggers ("parks near old cores") in v1 or the agent invents them. |
| M3 | Parcels/owners/holdouts | **keep** | The heart of the design; formulas are complete. Fix the latent-parcel/routing interaction (below). |
| M4 | Council & docket | **keep-simplified** | Vote math specified; stance table incomplete; midterms + ballot-fallback + per-seat-reason UI are v2. |
| M5 | Eminent domain & courts | **keep** | Simple {monthsLeft} countdown, explicit win formula, great lose-consequence. Drop "outside counsel" (button clutter). |
| M6 | Historic landmarks | **keep-simplified** | Protection + favor is easy; the lvMap/green aura touches recalcMaps internals — defer. |
| M7a | WILD_STEP pricing | **keep** | One-line change at 2888; the constant was built for this. |
| M7b | Reserve-blob votes | **keep-simplified** | No blob identity exists in code; use wildTaken thresholds, not blob detection. |
| M7c | Environmental review (ghost tiles) | **kill (v1)** | A new pending-construction state machine + save impact + a dozen edge cases, for a 2-month pause. |
| M7d | Greenbelt ballot | **keep-simplified** | Keep the set piece; trigger on wildTaken≥60 only; one hardcoded ballot, not a generic ballots engine. |
| M8a | Upzoning ordinances | **keep** | One flag per district + one gate in zoneRect. Cheap, flavorful. |
| M8b | Petitions & meetings | **keep-simplified** | Keep fuse + 3 buttons; kill the tracked "buffer park within 6 months" obligation. |
| M9 | Protest camps | **keep-simplified** | Keep tile-blocking + timer; kill police-docket path, com-occupancy modifier, and cause-tracking in v1. |
| M10 | Favors & scandal | **keep-simplified** | Counter + monthly roll is easy; v1 exposes only 2 "make a call" sites, and scandal-recall needs a small new off-cycle path. |
| M11 | Elections rewired | **keep** | computeApproval unification is a correct hard prerequisite; swing formula and Out-of-step revival are fully specified. |
| — | Signature road bend + A* | **keep** | The whole point. Needs the v1 routing spec below — as written the router is underspecified in 4 ways. |
| — | City Hall panel / chips / overlay | **keep-simplified** | See UI SCOPE — the chip manager is the largest single hidden work item in the doc. |

## INTEGRATION ERRORS

Almost everything checks out. The real discrepancies, in descending severity:

1. **`showCirclePopup` (4335) is not "exactly the click-to-act map popup this needs."** It is one fixed DOM
   element (`#circlePopup`, HTML at 397) with two hardcoded roundabout buttons, a single global
   `circleTile`, positioned **once** at show time (no reposition on camera pan/zoom), and dismissed by *any*
   canvas pointerdown (4359) — the exact opposite lifecycle of a "persistent map chip" that "pins the site."
   The pattern is a starting point, but a multi-instance, camera-tracking, dynamic-content chip manager with
   different dismiss rules is a genuinely new ~150-line UI subsystem, plus picket/marker meshes. Budget it.
2. **Save-slot off-by-one.** The cells row currently has **11 entries, indices 0–10** (saveCity 4438–4450).
   The doc says age/landmark go in "slot 12" and "slot 13"; they will actually land at **indices 11 and 12**.
   Harmless if the agent just pushes and reads in order, but the doc's own RISK 3 (silent positional
   corruption) is exactly the failure mode this ambiguity invites. Spell out: `r[11]=age, r[12]=landmark`.
3. **Three clearing call sites are missing from the modify list.** `placePark` (2803→clearForPlop 2807),
   `placePlant` (2815→2828), and `placeStation` (3002→3017) all pave over soft land, and `canPlop` (2711)
   permits plops on built zone tiles. The INTEGRATION contract says "roads/zones/plops/parks all call
   polAcquire," but the by-line function list only covers placeRoadPath/zoneRect/bulldoze. Unpatched, a
   clinic becomes a free holdout-clearance tool. Add all three (they share `clearForPlop`, so a check inside
   `clearForPlop`'s callers or a `polBlocked` gate at each `canPlop` site is the cheap route).
4. **Reserve blobs have no identity.** genTerrain (751–767) paints preserve tiles in overlapping noisy
   discs; nothing labels which blob a tile belongs to, and discs can merge or be skipped (`continue` when
   too central, so "3–5 reserves" is really 0–5). "One vote per reserve blob," "the 3rd reserve falls," and
   "−6 once a whole reserve is gone" all require flood-fill labeling at init, stable blob IDs across
   save/load, and per-blob taken counts — real invention the doc doesn't acknowledge. (v1 fix below.)
5. **`jobsFactor` is a local const** inside monthly's occupancy loop (2587), not stored on `S`. M2's Labor
   favor can't "read" it without hoisting it to `S._jobsFactor` — trivial, but it's an unlisted edit.
6. **Scandal recall is not "reused verbatim" (M10).** The recall machinery (4197, 4243–4246) lives *inside*
   `runElection` as the loss branch, triggered only by elections. An "automatic recall election" needs a
   small new path (set `nextElectionYear=S.year`, or call `runElection` off-cycle with a forced-recall
   flag). Small, but it is new code, not reuse.
7. **v2-save homestead reconstruction is unsound as written.** `initPolitics()` "re-seeds homesteads from
   S.seed" — but loadCity never re-runs genTerrain, and in an old save the deterministic homestead tiles may
   now hold roads or towers. v1: on v1/v2 loads, create **no** homestead parcels (the farmhouses aren't in
   the save anyway); build trust parcels only, from tiles already saved as `type='preserve', wild=true`.
   Fresh maps get homesteads from genTerrain.
8. Cosmetic: `newCity` is at 3860 (resets ~3862–3885), not 3871; the second-loss branch is 4243–4246, not
   4241–4245; "M4 hook beside election trigger 2649" is correct. `bar()` (3633) is a *local* closure inside
   `updateTop` wired to the demand-column DOM — favor bars can't literally call it; they'll be a 5-line new
   HTML snippet instead. None of these mislead materially.

**The A* "route around", judged.** Well-specified: the trigger (stubs, not gaps), the avoid-set concept, and
the cost basis (tiles×20). Underspecified in four ways a coding agent must not be left to guess:
(a) **Latent parcels** — holdouts are created lazily on touch, so the avoid-set only contains *known*
holdouts; a detour through an untouched age≥24 res tile can materialize a brand-new holdout mid-purchase,
recursing the exact problem the router exists to solve. (b) **No turn penalty** — plain A* over uniform cost
returns arbitrary staircases (note `lineTiles` at 2686 already draws edge-connected staircases for diagonal
drags); without a bend penalty the "scar" reads as noise, not a story. (c) **No failure case** — `canRoad`
excludes water, so a holdout in a land chokepoint can make stub→goal unreachable; the doc never says what
the button does then. (d) **Ambiguous traversal set** — "canRoad-passable" includes tiles with buildings
(roads bulldoze soft land), i.e. the router could happily demolish your own towers. The v1 spec below
resolves all four.

**The pacing interface, judged: holds.** The split is clean — economy owns `landFMV` and un-zeroing
`zoneCost` (2721 confirmed returning 0); politics owns the multiplier and `polAcquire` as the sole gateway
to owned land. Two caveats: the gateway is only real if error #3 above is fixed (every clearForPlop caller
routed through it), and RISK 7 is correct — if milestone cash survives untouched (§1k–§250k at 2536–2544,
verified), the 3.5× rung is trivially affordable and only attach>0.71 holdouts carry friction. The PC-grant
compensation plan is the right interlock; it just needs both tracks to actually land.

## SIMPLIFIED V1 SPECS

**Route-around A* (v1):**
- Grid: 4-connected, N=68. Start: last placed road stub before the first blocked tile. Goal: the drag's
  original endpoint. Heuristic: Manhattan.
- **Traversable:** tiles that are currently `empty`/`rubble`/tree, `terrain!=='water'`, and not in the avoid
  set. No buy-through, no demolition en route — the detour crosses only genuinely clear land in v1.
- **Avoid set:** every existing Parcel tile, preserves, landmarks, protest tiles ± radius 1. (Because
  traversal is clear-land-only, latent parcels cannot occur — an aged res tile is by definition not empty.)
- **Cost:** 20 per tile + **8 per direction change** (the turn penalty makes it hug the obstacle and
  produce a legible dogleg); tie-break toward the original line's row/column.
- **Success:** hovering the button draws the dashed path on the overlay canvas with total §; click charges
  once via `tryCharge` and lays the tiles through the same code `placeRoadPath` uses (poof, redraw,
  roadDirty/powerDirty/mapsDirty).
- **Failure (no path):** button renders disabled with tooltip "No clear route — the land beyond is closed."
  The chip's other two exits remain. Multiple blocked tiles in one drag: route once, from before the FIRST
  blocked tile to the endpoint, avoiding all of them.

**Council & census (v1):**
- Keep the 5 fixed districts (Core = Chebyshev/euclidean r<10 of (34,34), else quadrant) — `distOf` is 3
  lines and districts are what make seats spatial. Census: in `recalcMood`'s existing scan, accumulate 4
  scores per district exactly as listed in M4, but with hard formulas: Neighbors = tenuredHomes +
  3*landmarks; Growth = comOfficeHighDens + (growPress>0.5?5:0); Greens = parks + 2*preserveTiles/4 −
  (distPolAvg>0.4?3:0); Labor = indFarm + (unpowered>5?4:0). Seat = argmax with incumbent×1.15 and seeded
  ±10% noise, recomputed **only at 4-year elections** in v1 (no midterms — one reseat rhythm, one code
  path).
- Docket item: `{id, type, x, z, filedMonth, whip:{}, state:'queued'}`. All items file → resolve at the next
  `monthly()`. Votes needed: 3/5 everywhere except landmark demolition 4/5. Vote formula exactly as M4, but
  the **stance table must be written out in full in `POL`** for the 6 docket types × 4 factions before
  coding starts — 24 numbers, filled from the design's samples and symmetry, never invented inline.
- Projection UI (v1): the City Hall docket row shows "Projected: N/5" (recompute the formula with current
  whip) plus at most one line: the name of the most opposed seat and its faction. Per-seat reason strings
  are v2. Failed items: re-file after 6 months; no ballot fallback in v1.

**Docket flow (v1):** two states only, `queued → resolved` (ED adds `court`). No fast-track spend in v1
(that button needs a queue-jumping concept; PC has enough sinks). One vote batch per month, all results as
ticker + one toast.

**Petitions (v1):** exactly two triggers — high-density painted within 3 tiles of ≥5 tenured homes;
ind/coal placed within 4 of ≥5 homes. One live petition, 2-month fuse, others drop (don't even queue —
simpler and invisible). Meeting card in City Hall panel: **Concede** = revert the offending tiles to their
prior zone (store prev type/dens on filing; +5 faction, +1 PC); **Compromise** = those tiles' dens capped
one step lower, permanently, via a `c.densCap` check in develop() (+2 faction) — **no tracked future
obligations**; **Press on** = −8 faction, 50% protest. Fuse expiry = Press on, −2 approval.

**Protests (v1):** `{i, cause:'label-string', monthsLeft}`. Spawn only from pressed petitions (50%) and ED
wins (40% if Neighbors<−20). Fixed duration 3 months; no cause-continuation extension, no com-occupancy
effect. Effects: `polBlocked` radius 1, approval −1/protest (cap −3). Resolutions: Wait (expires, −2
faction) or Negotiate 3 PC (ends now, +2 faction). "Address the cause" and police clearance are v2 — cause
predicates and the docket coupling are the two expensive parts of M9. Visual: picket-sign marker + 3–4
pulsing sprites reusing the activeZaps pattern (4611–4614), not 8–12 animated figures.

**Court cases (v1):** as specced minus outside counsel — `{i, monthsLeft:3, p}` computed at filing, one
ticker line per month, resolve in monthly(). This mechanic was already right-sized.

**Reserve politics (v1):** drop blob identity entirely. `WILD_BASE + WILD_STEP*wildTaken` pricing (2888);
docket vote required when `wildTaken ≥ 25` (roughly "second reserve" on typical maps — one gate, then free
until greenbelt); Greens −2/tile; Greenbelt ballot fires once at `wildTaken ≥ 60`, hardcoded January
resolution with M7's yes-share formula, campaign spend from the City Hall panel. `greenbelt=true` freezes
remaining wild tiles via `polBlocked` + hatched overlay tint in the politics view.

**Landmarks (v1):** nomination roll, endorse/contest/auto-endorse, `c.landmark=true` joining
`protectedStruct` (2710), favor/approval effects — all as specced. Defer: the +0.06 lvMap aura and
0.5-park `green` contribution (both reach into recalcMaps/recalcStats internals and are pure tuning), and
midnight demolition (M10 v2).

**Graft (v1):** counter + monthly detonation roll exactly as M10, but only two call sites: the holdout chip
("encourage a sale" — sells at FMV, graft+3) and the docket panel ("guarantee this vote" — one seat flips,
graft+2). Exposure meter = three-word label from graft (0 low / 1–2 rising / ≥3 severe). Scandal recall via
`nextElectionYear = S.year` + a `S.pol.recallPending` flag checked by the existing trigger at 2649.

## STATE & SAVE CONCERNS

- **Volume is fine.** Parcels sparse and bounded (~10 seeded + touch-created; even S5's 22-tile corridor
  makes ~14). Favor is 4 globals, not per-district — good call. Council 5 small objects. Docket/court/
  petitions/protests capped. `c.age` is the only per-cell growth: 2 ints per cell in save (~9KB raw, less
  gzipped). No perf-relevant state anywhere.
- **Save plan is format-correct** (new top-level keys + append-only cell slots + v bump, matching the
  loader's positional-with-fallback reads at 4470+ and the `v===1||2` gate at 4462 → becomes `1|2|3`). Fix
  the slot numbering (indices 11–12, not 12–13) and specify the parcel flag-bit order explicitly. Ship the
  doc's own dev-mode round-trip assert (RISK 3) — it is the single cheapest insurance in the plan.
- **Serialize `pol: S.pol` wholesale is fine** (all JSON-safe), but two things must rebuild on load, and
  the doc's rebuild note (4503–4524) only mentions holdout/landmark markers: **protest markers/sprites**
  and any active chip state. Add both to the rebuild pass. `era` need not be saved at all — derivable from
  `milestonesHit` (fewer ways to go stale).
- **Owner names:** store `nameSeed`, regenerate from name tables — correct and cheap; keeps saves small and
  names stable. The name tables themselves are new content the agent must write (~40 strings; fine).
- **v1/v2 migration:** adopt the fix from INTEGRATION ERRORS #7 (trusts from saved preserve tiles; no
  retro-homesteads; ages default `level*36` as specced — that estimate is reasonable).
- **Ghost tiles were the one save-format landmine** — pending-construction cells are neither empty nor
  built and would need their own slot or sidecar list; killing env review in v1 removes it.
- **Reset hygiene:** `S.pol` and `parcels` must be reset in BOTH `newCity` (3860) and `loadCity` — the
  architecture doc's warning about `S` being an open schema (state leaking across cities) applies with full
  force to a module-level `parcels` global.

## UI SCOPE

Genuinely NEW surfaces: **two.** Everything else extends existing patterns at established extension points.

1. **City Hall panel** (new, medium-large). A player-opened `.msModal` per `openApproval` (4107) — pause-
   on-open is fine and the pattern is proven. Content: 4 favor bars (new 5-line HTML, `bar()` at 3633 is
   not reusable — it's a closure bound to the demand columns), council seat row, docket list with whip
   buttons + projected tally, petition/meeting card, greenbelt-ballot card, exposure label. Biggest panel
   in the game but zero novel UI *technology*.
2. **Chip & marker manager** (new, and the sneaky-big one — see INTEGRATION ERRORS #1). Multi-instance
   anchored chips that track camera (reposition via `tileToScreen` 4327 each frame or on camera change),
   dynamic title/buttons, persist until resolved, plus 3D picket/marker meshes and their load-time rebuild.
   `#circlePopup` proves the anchoring math works; the manager around it is new. ~150–200 lines + CSS.
   Recommendation: v1 allows ONE open chip at a time (click marker → chip swaps) — kills z-order,
   clutter, and mobile-layout problems at a stroke.

Pattern-reuse extensions (small, low-risk, the doc's claims here are all accurate): PC laurel in the top
bar (updateTop 3603); politics overlay via `MAPS` entry + `VIEWS` (3102) + `viewMarks` branch (3104) —
the zoning view at 3107 is a ready template for tile-tint overlays; ~20 ticker generators appended to
`tickerMessages` (3768) — trivially additive; toasts/hints (3750/3761) as-is; election modal gains one
faction line (4214 region); lean-meter tooltip text swap (337–341). Road-preview color-coding is a
moderate modification to the existing drag preview (previewRoad/hoverPreview ~3154–3207), not a new
surface, but it is load-bearing for the signature moment — the three-color legend (white/gold/red) is how
the player learns the entire parcel vocabulary, so it belongs in the v1 core, not polish.

Sequencing for a session-boxed agent: (1) prerequisite refactor — `computeApproval()` + `winThreshold()`
unification (2635/3612/3620/4109/4120/4193); (2) core: save v3 + parcels + M3 + placeRoadPath rework +
A* v1 + chip manager + M1 + M2-display; (3) council/docket + ED (M4/M5) + City Hall panel; (4) the rest
in the doc's own order. Steps 1–2 alone deliver the owner's signature moment and are one honest long
session; the full v1 above is two to three.
