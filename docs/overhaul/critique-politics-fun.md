# POLITICS OVERHAUL — FUN CRITIQUE ("The Map Fights Back")

Critic's brief: judge the design purely on drama, decisions, and player experience. Reference:
`../designs/politics.md`, current-state `../analyses/politics.md`.

## OVERALL

This is a genuinely good design with one great idea at its core and a process-taxonomy problem growing on
its edges.

The great idea: **politics is spatial and diegetic.** Owners have names, protests are crowds you can see
from the sky, refusals become bends in the road, compromises become parks, court losses become landmarks.
Almost nothing important happens in a menu — it happens on the map, and it stays on the map forever. That
is exactly the owner's fantasy ("compromises that leave visible scars") and it is the thing no mainstream
city builder has shipped. The second-best idea is structural honesty: three exits on every block, no modals,
no pauses, live previews that tell the truth before you commit. The third-best idea is the era ladder — the
village genuinely sleeps, which protects the sandbox joy that makes people play city builders at all.

Where it goes wrong is quantity of *process*, not quantity of *drama*. The player must learn five distinct
pending-decision pipelines — petitions (2-month fuse), docket (vote end of next month), court (3 months),
ballots (next January), environmental review (2-month ghost tiles) — each with its own cadence, its own
resolution rule, and its own UI surface. No single one is bad; together they are a civics curriculum. The
drama systems (holdouts, landmarks, protests, scandal) are lean and earn their keep. The procedure systems
need consolidation: one visible "City Hall inbox / timeline" for everything pending, and at least one whole
pipeline (environmental review) deleted, because it is the only mechanic in the doc that imposes friction
without offering a decision — a toll booth, not a puzzle.

Currency check: money, time, PC, four favor bars, approval, graft. Sounds like six; plays like four,
because approval is a derived scoreboard, graft is deliberately vague (the "exposure: rising" meter is the
right call — dread instead of arithmetic), and favor is a relationship readout, not a spendable. The
minimum set that delivers the fantasy is **money + calendar time + faction favor + one meta-currency
(PC)** — and the design already lands there, *provided* the PC spend list stays short and nothing else is
ever added. PC's real risk is not confusion but hoarding: slow-regen currencies get sat on. The low cap
(12) and the "calendar time is always the free alternative" rule mostly defuse this, but the spend list
should shrink to the fights (ED, whip, campaign, negotiate-with-protest) and stop pricing conveniences
(fast-track, quell) that muddy what PC *is*.

The biggest unpriced risk is the late game. "Tenured-home holdouts are everywhere in the old core" plus
landmark accretion plus a hostile council can turn the metropolis center into amber. The design's guardrail
("grow outward, around, slower") answers the wrong question — metropolis players *want* to renovate the
core; that is the endgame. Softening (improve the block), heirs' sales, and upzoning votes are counterplay,
but the doc needs a stated tuning target for core-renewal throughput, not just for village-road holdout
frequency. Otherwise the reward for winning the mid-game is a city that says no.

Also right: resurrecting the dead scaffolding (devLean, WILD_STEP, restPress) instead of inventing parallel
state; unifying the duplicated approval formula and fixing the lying HUD bar as prerequisites; the whip
projection with per-seat reasons ("NIMBY: it's in her district") — that line of UI is the difference between
politics and a slot machine, and the doc correctly calls it load-bearing.

## VERDICTS

| Mechanic | Verdict | Reason |
|---|---|---|
| M1 Political Capital | KEEP-SIMPLIFIED | The pacing interlock works and money can't do its job. But trim spends to fights only (ED, whip, campaign, negotiate); kill fast-track/quell spends. Keep cap low to break hoarding. It must remain the ONLY abstract meta-currency, forever. |
| M2 Factions & favor | KEEP | Four is the right number; they turn invisible aggregates into characters and every downstream system speaks their vocabulary. Simplify the ledger: fewer, chunkier deltas (players must be able to attribute every move of a bar to something they did). Cut the ±2/mo micro-drifts. |
| M3 Parcels, owners, holdouts | KEEP | The heart of the design and the owner's fantasy verbatim. Named owners, three rungs, refusal escalation, last-one-standing pride, block-improvement softening, heirs selling — all of it is drama per byte. Best mechanic in the doc after landmarks. |
| M4 Council & docket | KEEP-SIMPLIFIED | The monthly-batch, ticker-first vote is anticipation, not homework — but only if docket item types stay few (ED, reserve #2+, landmark demolition, upzoning, nuclear). Remove police-clearance from the docket (see CUTS). Merge docket + petitions + ballots into ONE City Hall inbox UI. Deterministic votes with visible reasons are correct; do not add vote RNG. |
| M5 Eminent domain & courts | KEEP | The best gamble in the doc: visible probability, 3-month drumbeat, escalating PC price, and a *permanent map scar on a loss* that makes route-around genuinely attractive. Cut the §2,000 outside-counsel micro-buy — a fiddly +0.1 nobody will feel. |
| M6 Historic landmarks | KEEP | The crown jewel. "The thing blocking your highway is the mill you built in year 3" is the single most owner-aligned mechanic here. Endorse-by-default (ignore = endorse) is exactly the right anti-homework call, and the delayed ambush it sets up is earned drama, not gotcha. |
| M7 WILD_STEP + Greenbelt ballot | KEEP | Escalating wild pricing is a countdown players can feel; the Greenbelt ballot is a real set-piece whose *both* outcomes permanently redraw the map. S3 (win the land, inherit an opposition) is the best scenario in the doc. |
| M7 Environmental review | KILL | The only pure-friction mechanic in the design: a 2-month delay with no decision attached, on a common action (building near water). It teaches vocabulary nobody asked to learn, adds a fifth pending-pipeline, and its ghost-tile state is a whole feature. Deleting it costs zero drama. |
| M8 Upzoning ordinances | KEEP | One chunky vote per district, ever — a real strategic gate that makes district composition matter, with grandfathering so it never punishes the past. Right-sized. |
| M8 Petitions & community meetings | KEEP-SIMPLIFIED | The three-button meeting (concede/compromise/press) is the atom of city politics and the +1 PC goodwill dividend makes conceding a real option. But fold petitions into the same inbox as the docket, and make Compromise's scar automatic (density capped, buffer strip auto-reserved) — do NOT hand the player a "place a park within 6 months" homework timer with a tracked obligation. |
| M9 Protests | KEEP | Grievance made visible and spatial — they block the exact tiles you wanted, which is a puzzle, not a lecture. Caps (max 3, queue behind) are essential; keep them. One change: police clearance must be INSTANT and costly, not a docket item — a month-long approval process annihilates the "tempting bad idea" fantasy. The temptation IS the mechanic. |
| M10 Graft & scandal | KEEP | The devil's bargain the friction economy needs, and the vague exposure meter is the right instrument — dread without math. But de-stack the detonation: approval −16 AND PC→0 AND Growth −20 AND council frozen 12 months, simultaneously, in the era where everything already needs votes, is a death spiral. Detonate in two waves or scale by graft size. |
| M11 Elections rewired | KEEP | Mandatory. Elections become the sum of four relationships the player watched for years instead of a dice roll; the HUD stops lying about the bar; devLean finally means something. This is the loop-closer for the whole design. |
| Heirs / life-event softening | KEEP | "Ada Merced dies at 94; her heirs sell" is the map healing on its own clock, and the already-built-up bend that no longer makes sense to straighten is the best environmental storytelling in the doc. Cheap, poignant, load-bearing. |

## CUTS

1. **Environmental review (M7), entirely.** Delay-without-decision is friction with no strategy. If review
   flavor is wanted later, make it a *docket item type* for one or two marquee cases (the nuclear waterline
   in S4 already does this job), not an ambient tax on shoreline building.
2. **Police clearance as a docket item (M9).** Make it instant, expensive, and regrettable (Labor −10,
   Neighbors −6, 25% re-spawn doubled — keep all of that). A council-approved crackdown a month later is
   neither tempting nor dramatic; it is paperwork about a riot.
3. **PC spends for fast-track and quell (M1).** PC should buy fights, not skip lines. Two fewer buttons,
   and PC's identity ("the currency of picking fights") gets sharper.
4. **Outside counsel §2,000 for +0.1 win probability (M5).** Invisible-sized modifier, one more micro-buy.
5. **Favor micro-drift ledger entries (M2).** Anything worth −2/mo forever should be one chunky −8 with a
   headline. If a bar moves and the player can't say why, the reputation system is losing legibility — its
   entire reason to exist.
6. **The buffer-park obligation timer (M8).** Auto-place or auto-reserve the concession. Tracked homework
   with a 6-month deadline is a quest log sneaking into a city builder.
7. **Separate UI surfaces for docket / petitions / ballots / court.** One City Hall timeline, every pending
   political item, sorted by resolution date, one visual grammar. This is the single cheapest fix for the
   design's process-overload risk.

## GAPS

1. **The council never wants anything.** Seats vote, but they never *ask*. Real drama (and the owner's
   "stakeholders who fight back") arrives when the SW Greens seat offers: "I'll vote yes on your ED filing
   if the old reserve edge becomes a park." Horse-trading turns whipping from arithmetic-with-PC into
   politics; without it, the docket is eventually a solved system — count to 3, pay 3 PC per missing vote,
   click. One "seat asks" event per year would be the highest-drama-per-line addition available.
2. **Scars are not celebrated by the art.** The whole thesis is "the bend tells a story," but the doc
   budgets a marker mesh and a hint. The Merced plot needs its fence and garden; the appeasement park needs
   a memorial plaque; the greenbelt hatch is specced but the bend itself gets nothing distinct. If scars
   read as glitches instead of trophies, the fantasy fails at the last inch. Also: let the player NAME
   things (Merced Park is scripted flavor in S1 — make naming a real one-click prompt). Massive texture per
   byte.
3. **No memory.** The ticker narrates the present but never the past. Anniversary lines ("Ten years since
   the road bent at the Merced line"; "The mill scandal, five years on") cost a timestamp and a string
   table and are precisely the "real city texture" the owner wants — cities remember.
4. **Roads only fight at acquisition, never at operation.** Nobody petitions about the traffic the new
   corridor pours through their neighborhood — yet `trafMap` already exists per-tile. One petition trigger
   ("traffic through the old quarter tripled") would extend politics from land-taking into consequences,
   which is where real neighborhood politics mostly lives.
5. **No election promises.** Elections are report cards, never commitments. A Tropico-style promise
   ("no towers in the NW this term") chosen at campaign time, tracked, and punished if broken would make
   elections proactive instead of retrospective. Era 3+, optional, but it is the known-good mechanic this
   design conspicuously lacks.
6. **No cancel/undo on a blocked road.** The signature flow assumes the player picks one of three exits,
   but the fourth honest option is "never mind" — refund the stubs, rethink. Without it, the drama moment
   has a trapped-feeling edge case.
7. **Buyouts have no human echo.** Fourteen families take the check and vanish. Even a single ticker line
   ("The Alders leave the valley after 40 years") would make paying 3.5× feel like a choice with weight
   rather than the boring-but-correct button. Displacement-as-simulation is scope creep; displacement-as-
   sentence is free.
8. **Late-game core-renewal target is unstated.** Risk #1 instruments village roads (">2 holdouts = too
   hot") but nothing instruments the metropolis core, where the density of tenure + landmarks + district
   NIMBY votes compounds. State a target ("a determined mayor can clear-and-rebuild one old block per
   2 game-years without graft") and tune to it, or the endgame quietly becomes read-only.

## THE SIGNATURE MOMENT

Does the road-bend flow deliver? **Yes — this is the strongest specced flow in the document, and most of
the reasons are small honesty decisions.** The preview tells the truth before commitment (white/gold/red,
with real prices); release builds everything buildable instead of punishing the drag; the block arrives as
a stub, a picket sign, one toast, and a pinned chip — no modal, no pause, no lost work. The three exits are
on the chip with costs attached, the impossible one is greyed *with a story* ("It was her grandmother's")
instead of silently failing, and Route Around draws its live dashed detour before you pay. The ED path has
a real risk (lose = the tile closes forever) so bending is a choice, not a consolation. And the heirs'
life-event years later — arriving after the player has already zoned along the bend — is the rare mechanic
that rewards the player for having compromised. First contact with this flow will sell the entire overhaul.

Third time: still good, on one condition — the blocker must be a *different kind of thing* (a landmark you
endorsed, a protest camp, a trust parcel), which the design explicitly promises ("same chip, same three
exits, always"). The grammar staying constant while the story changes is exactly how you make a repeated
moment feel like a genre instead of a rerun.

Tenth time: this is where the tuning knife-edge lives, and the design knows it (Risk #1). Three specific
hazards:

1. **Frequency.** If holdouts hit average roads often, the moment decays into a routine tax: see red,
   click chip, click Route Around, accept bend. The ">2 holdouts per village road = too hot" gate is the
   right idea; extend it per-era, and err cold — scarcity is what keeps a signature moment signature.
2. **Route Around must not be dominant.** At §160 and one click, it is currently the obviously-correct
   button almost every time, which flattens the three-exit choice into one exit with two decoys. The
   detour needs real variable cost: length, willing-land purchases en route, terrain, and occasionally
   *no viable path* (A* fails against water/landmark walls — the spec needs a fallback message for this
   case, currently missing). The exits are only a choice if each one wins sometimes.
3. **The preview may starve the drama.** Because red tiles show during the drag, experienced players will
   self-detour mid-drag and never release into the stub-toast-chip sequence — the holdout degrades into
   "static obstacle, like water." That is informed consent working as intended, but the fix should be
   specced: clicking a red preview tile (or the parcel marker at any time) opens the same chip with the
   same three exits. The story must be reachable without performing the failure.

One more miss: there is no way to say "never mind" — cancel the stubs, refund, rethink (GAPS #6). And one
plea: spend art on the bend itself. The jog around the farmhouse is the screenshot the whole overhaul is
sold on (S5 says so — "the whole design in one screenshot"); it should look like a place, not an error.

Verdict on the moment: ship it as specced, with the four amendments above (era-scaled frequency gate,
variable detour cost + no-path fallback, chip reachable from preview, cancel/refund). It is the rare
signature mechanic that is also the tutorial, the difficulty curve, and the art direction in one gesture.
