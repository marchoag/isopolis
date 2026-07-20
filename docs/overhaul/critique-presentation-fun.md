# PRESENTATION TRACK — PLAYER-EXPERIENCE & AESTHETIC CRITIQUE

Reviewed against: `designs/presentation.md`, `analyses/graphics.md`, `analyses/sound.md`.
Lens: does this make the toy city more lovable, or does it make it a render?

## OVERALL

This is a strong design written by someone who understands the game they're upgrading. The vision sentence — "photographed on a sunlit windowsill" instead of "lit by a fluorescent office ceiling" — is exactly the right brief, and most of the doc honors it: baked AO, contact shadows, squash-settle construction beats, floor-by-floor jumps instead of smooth stretches, picket signs that deliberately don't bloom. The Ledger is the best idea in the document and one of the best feedback mechanisms I've seen proposed for a small city builder. The audio spine (S1–S4) is invisible craft that will make everything else land.

The problems are almost never the concepts. They are **defaults and dosage**: ACES treated as a foregone conclusion rather than an audition; a 2-minute day/night cycle *multiplied by game speed* (a 24-second disco day at 5x); a newspaper allowed to interrupt for too many event classes; hammer taps and treasury sighs with no repetition governors; a music loop with no silence in it; and a priority list ordered by renderer logic rather than by what a player notices in their first ten minutes. The design also schedules its own best moment apart from itself — it says "rotation + golden hour together produce the turntable diorama moment," then places free orbit eleven slots after golden hour.

Nothing here needs killing at the feature level. Several defaults do. Fix the dosage and this ships charm; ship it as written and you get 80% of the charm with three or four self-inflicted annoyances players will name in reviews.

## VERDICTS

| Item | Verdict | One-line reason |
|---|---|---|
| G1 Chunk batching / instancing | **keep** | Invisible to players but mandatory plumbing; correctly exempts animating buildings. |
| G2 PBR + env map | **keep-simplified** | Env-lit glass = yes; ACES only if it wins a side-by-side audition; glass metalness 0.55 → near 0 (see Charm Risk). |
| G3 Vertex AO + contact shadows | **keep** | Zero-risk, pure "the miniature sits on its base." Best charm-per-line item in the doc. |
| G4 Continuous time-of-day | **keep** | With three mandatory changes: decouple from speedMul, add a time-lock, force day lighting in data views. |
| G5 Night bloom | **keep-simplified** | Night-only and threshold-gated is right; add a strength cap and the Glow toggle from day one. Tight halo, never haze. |
| G6 Water surface | **keep** | Keep the glint subtle and the colors flat-graphic; foam bands are the charm, fresnel is the garnish. |
| G7 Multi-stage construction | **keep** | The squash-settle and floor-quantized rise are exactly right. Gate on the pacing track actually shipping long build times. |
| G8 Pedestrians + traffic feel | **keep** | Strongest "alive" signal per triangle; move it way up the list. |
| G9 Free orbit + pitch clamp | **keep** | S effort, top-3 tactile wow, multiplies every other visual feature. Criminally underprioritized at #13. |
| G10 Weather & seasons | **keep-simplified** | Seasons and snow: yes. Overcast/rain: rare and short — dimming the sun is the anti-vision state. |
| G11 Ground fidelity | **keep** | Cheap, rides with G3. |
| S1–S4 Audio spine | **keep** | Buses, ADSR, reverb, panning — every existing sound improves at once. Also fold in S6's frame-driven fix immediately (it's a bug fix, not a feature). |
| S5 Generative score | **keep** (with additions) | Craft is right; add rest periods and a second progression or it wallpapers by hour two. |
| S6 Layered ambience | **keep** | The updateAudio-in-frame() fix belongs in the spine; weather layers can trail. |
| S7 Event sound coverage | **keep-simplified** | Coverage list is correct (these were genuinely silent dramas); add repetition governors on hammers, outage buzz, treasury sigh. |
| P1 Holdout parcels | **keep** | Cottage-vs-towers contrast plus "NOT FOR SALE" canvas signs is pure storytelling. Delightful. |
| P2 Protest crowds | **keep** | Crowds you hear before you see is the right politics feedback; reuses G8 correctly. |
| P3 Construction-as-pacing + era tint | **keep-simplified** | Keep stages/progress ring; kill the era *exposure* shift (fights G4's exposure ramp — two systems on one dial). Hemi tint only. |
| P4 The Isopolis Ledger | **keep** | The best idea here — with a hard frequency governor and most events demoted to an "EXTRA!" toast (see below). |
| P5 Council chamber panel | **keep** | Roll-call ticks + ink stamp is charming and makes vote math legible before commitment. |
| P6 HUD "paper & brass" restyle | **keep-simplified** | Ship the approval sparkline now; the full restyle can trail everything. |

## CHARM RISK

**G2 is the one item that can kill the game's look, and the mitigation is only half-credible.**

- **ACES on a candy palette.** ACES desaturates and darkens saturated mids and skews hues non-linearly (saturated blues drift purple, oranges dull unevenly). The proposed fix — a *global* `offsetHSL(0, +0.07, +0.02)` plus brighter lights — is a linear bandage on a non-linear wound. It will roughly restore average punch while individual swatches (the office-glass teals, the `#ef7d92` pink, the `#f5c245` yellow) land in different places. The doc's own Risk #1 quietly concedes this by offering Reinhard 1.4 as a fallback. Make that concession structural: **ACES is an audition, not a decision.** Set up one fixed camera bookmark of a dense mid-game city and A/B ACES vs. Reinhard vs. the current NoToneMapping-with-exposure at every tuning pass. Whichever the owner points at and says "that's my game, but better" wins. Plenty of beloved stylized games ship without filmic tone mapping precisely to protect saturation; there is no shame in Reinhard.
- **Semi-metal glass is the sneakier charm-killer.** `aRM = (0.18, 0.55)` on windows means colored glass goes specular-dominant: metalness kills diffuse, so the candy-blue window color survives only through reflections, and the towers trend toward gray-with-sky-glints — i.e., an archviz render. The current `_isGlass` brighten hack is *part of the identity* (windows as bright painted color). Recommendation: metalness ≤ 0.15, roughness ~0.2, keep the vertex-color brightening, and let the env map add sheen *on top of* the candy rather than replacing it. If a screenshot of an office tower could pass for a generic Three.js demo, you've lost.
- **What's charm-safe and should be pushed hard:** G3's contact shadows and ground AO (miniatures always look glued down — this is the single most "toy photograph" move available), G4's long golden-hour shadows (light raking across low-poly masses reads as a diorama by a window, exactly the brief), G7's squash-settle, G8's bobbing 24-tri people, P1's picket fences. None of these can go wrong; all of them compound.
- **Weather is the anti-vision state.** The whole pitch is sunlight; overcast dims the sun 30% and pulls fog in. A player who bought "sunlit windowsill" should see gray skies rarely and briefly — weather as an event, not a climate. Snow-dusted roofs, by contrast, are free charm.
- **Bloom dosage.** Threshold ~1.0 and night-only is correct. The failure mode is strength: wide soft bloom reads as a mobile-game smear. Windows should *glint*, not glow like fog lamps. Cap the chain, ship the toggle.

**The Ledger: delight, not gimmick — at the right dose.** It earns its screen space because it solves a real problem: politics events currently live in an ignorable ticker, and toasts evaporate. A broadsheet is diegetic, rereadable, and the halftone screenshot-of-your-own-city trick is the moment players will share — it makes the politics sim feel like it *happened somewhere*, in your city, with a photo to prove it. But the trigger list (elections, council votes, holdout resolutions, protest escalations, disasters, era changes, milestones) is a full-screen interruption engine. Council votes alone could fire monthly. Rules: **hard interrupts only for election results, era changes, disasters, and game over; everything else lands as a folded "EXTRA!" toast** the player opens at will; at most one auto-open per in-game year (~5 real minutes), coalescing queued stories into one issue; never auto-open mid-drag or mid-tool. Add a browsable archive of past front pages — nearly free, and it turns the newspaper from a popup into a chronicle of your reign, which is what re-election politics wants emotionally.

**The score: pleasant for hours only if it learns to stop playing.** Pentatonic-over-four-chords with probability-gated plucks is consonant by construction and the approval-driven souring is a genuinely novel feedback channel — keep all of it. But one 8-bar loop (~25 seconds at these tempos) with no exit is wallpaper that curdles by hour two, no matter how much velocity jitter you add. The missing feature is **silence**: play 2–3 minutes, rest 1–2 minutes while the ambience bed carries, re-enter on a game event (milestone, dawn). Add one alternate progression or a modal shift (per era or season) so long sessions get harmonic weather. With rests and a second progression, this design holds up for hours; without them it's the first thing players mute — and a muted score can't sour when approval drops, which forfeits its cleverest trick.

**Over-foley check: coverage right, governors missing.** The silent-event list was genuinely embarrassing (outages, protests, game over — silent), so S7's breadth is correct, not excessive. Three specific fatigue traps: hammer taps at 0.4–0.9s per site during a 20-site build-out is a woodpecker infestation — attenuate by zoom (a mayor at map height shouldn't hear individual hammers), cap global taps/sec, and duck them under the score; the 50Hz outage buzz should live for the first few seconds of the banner, not its lifetime; the monthly treasury sigh should fire on *entering* the red and then quarterly at most — punishing a struggling player with a recurring sad noise is nagging, not feedback.

## PRIORITY REORDER

The design's order optimizes renderer-dependency logic. A player's first session optimizes differently: what do I *notice*, what do I *touch*, what do I *hear*. Corrected order:

1. **G4 — Continuous time-of-day** (with speed-decouple + time-lock, see Gaps). Biggest every-frame change, zero charm risk, no PBR dependency — long shadows work fine on Lambert.
2. **G3 + G11 — AO, contact shadows, ground detail.** Zero-risk grounding; makes even the current materials look intentional.
3. **S1–S4 (+ S6's frame-loop fix) — audio spine.** Every existing sound gains tails, space, and a left and right in one pass; players feel it in minutes.
4. **G9 — Free orbit + pitch.** S effort, top-tier tactile wow, and it multiplies items 1–2 (players stage their own golden-hour shots). Its placement at #13 in the design is the list's clearest error.
5. **G2 — PBR + env map, ACES behind the A/B gate.** Now the tuning pass happens against real lighting and real shadows, once, instead of retuning twice.
6. **G1 — Chunking/instancing.** Pure enabler; players see nothing, but G8/G5 need it. Here, not earlier — don't spend the first sprint on invisible work.
7. **G8 — Pedestrians + headlights + traffic feel.** "The city is alive" is a first-minute signal; at #9 in the design it's far too late, and protests (P2) are blocked behind it.
8. **S5 — Generative score** (with rest logic + second progression).
9. **P4 — The Ledger** (with the frequency governor + archive).
10. **G7 + S7-construction — Construction stages + hammers.** Sequenced to land when the pacing track's long build times exist; as pure presentation against today's instant builds it's premature.
11. **G5 — Night bloom.**
12. **G6 — Water.**
13. **P1 + P2 — Holdouts + protest crowds.** (Slot with the politics track's readiness; P2 costs little once G8 exists.)
14. **P5 + P6 — Council panel + HUD restyle** (sparkline can ship any time earlier; it's an afternoon).
15. **G10 + S6-weather — Seasons first, weather sparingly.**

The only defensible argument for the design's G2-first ordering is "tune the palette once, under final tone mapping." Fair — but it assumes ACES wins. Run the audition during slot 5 against golden-hour scenes (the hardest case for filmic rolloff), and if Reinhard or None wins, you saved nothing by going first.

## GAPS

1. **No time-lock on the day/night cycle — the design's biggest UX omission.** `S.tod += dt·speedMul·(24/120)` gives a 24-second full day at 5x speed: strobing shadows, flickering windows, a map you can't read. Players managing a city want to *choose* perpetual noon or perpetual golden hour and get on with zoning; precedent: Cities: Skylines shipped a "disable day/night cycle" option with the very expansion that introduced it, and it's one of the most-used toggles in the game. Required: (a) visual clock runs at fixed real-time rate regardless of speedMul, (b) a lock-time control (noon / golden hour / night presets — the N-key fast-forward is a nice gesture but is not a lock), (c) data views force neutral daylight — nobody reads a pollution heatmap by moonlight, (d) lengthen the cycle to 6–10 real minutes with night compressed to ~20–25% of it. Two minutes is a trailer cycle, not a play cycle.
2. **No photo mode.** The entire document is secretly about screenshots — golden hour, bloom, the turntable orbit, and a newspaper that literally photographs your city — yet the player never gets a camera button. P4 already builds the `toDataURL` + halftone machinery; one key, a frame, "Greetings from Isopolis — pop. 12,400," save to disk. Hours of work, and it's the game's marketing department. This is the clearest immediate "wow" missing from the doc.
3. **No touch-the-miniature feedback.** The springy placement pop is the game's charm signature, but nothing else is tactile. A tiny jelly-bounce when you click/hover a building — you poked the toy — plus a one-tile sympathetic jiggle on neighbors when something plops next to them. Townscaper built a phenomenon on this feeling; it's a dozen lines on top of the existing easeOutBack.
4. **No zoom-aware mix.** S4 pans and S6 crossfades nature/city, but the classic isometric trick is missing: zoomed out = wind and a muffled distant hum (lowpass closes), zoomed in = street-level detail opens up. One biquad driven by `camera.zoom`. It's the difference between "audio plays" and "I am hovering over a real place."
5. **No sky life.** Clouds exist; nothing else moves up there. A bird flock (one instanced V, occasional), and a milestone blimp trailing a banner. Ten-line systems, and empty sky over a golden-hour city is a missed screenshot every time.
6. **The diorama base is under-committed.** The green baize rim exists as color only. Lean in: a visible table-edge base — wood grain, rounded corners, maybe a museum-style brass nameplate with the city name at the map's south edge. Cheapest possible way to make every single screenshot say "tabletop miniature" before a building is even placed.
7. **Ledger archive** (covered above, restated as a gap): without it the paper is a popup; with it, it's a chronicle. Store the last N front pages (they're just HTML + a data URL).
8. **Score rest/variation logic** (covered above): the design specifies layers and mappings but no silence and no second progression — the two things that decide whether it survives a three-hour session.
