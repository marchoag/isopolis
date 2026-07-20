# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Isopolis is a single-file isometric city-builder game. The entire application — markup, CSS, and ~6,200 lines of JavaScript — lives in `isopolis.html`. There is no build system and no package manager; the only dependency is three.js r128 from a CDN.

The v2.0 overhaul (`OVERHAUL_PROMPT.md` + `docs/overhaul/`) is implemented: land ownership and a migration economy, a politics layer where the map pushes back, and a presentation pass with a moving sun and a real audio spine.

## Running and verifying

```
python3 -m http.server 8000     # then http://localhost:8000/isopolis.html
```

`?dev` on the URL runs a save round-trip assert at boot and exposes `window.__isoRoundTrip()`.

**Verify changes with the headless harness — do not rely on reading the diff:**

```
node tools/boot-harness.js      # boots the real script, runs the sim, checks every phase
node tools/phase0-test.js       # regression: Classic must reproduce the original approval math
```

`tools/boot-harness.js` stubs THREE and the DOM hard enough to evaluate the actual inline
script, call `init()`, pump the frame loop, build a city and simulate 60 months. It catches
crashes, typos, TDZ errors and null refs without a browser. It **cannot** judge how anything
looks — visual and feel checks still need a human at a monitor.

The harness also doubles as the balance instrument: its 60-month run prints pop, funds, pool,
materials and **which gate bound each year**. The tuning rule is that at any city size *one*
gate should usually bind (early: migration; mid: money/land; late: congestion/land). If the
binding gate rotates every month, retune `CFG`.

## Navigating the file

Because everything is one file, the `/* ====== SECTION ====== */` banners are the primary navigation aid. Grep for them rather than scrolling:

```
grep -n '^/\* =\{5,\}' isopolis.html
```

Rough layout:

| Lines | Contents |
|---|---|
| 7–317 | All CSS (`:root` custom properties drive the whole palette) |
| 318–506 | Body markup — every panel exists in the DOM up front and is toggled, not created |
| 510–600 | `CONFIG` (tunable constants) and `STATE` (the global `S` object) |
| 602–985 | three.js setup, terrain generation, canvas-based ground drawing |
| 987–1660 | Geometry kit + per-building-type "designer" functions |
| 1663–2030 | Sprites (zap/flame/smoke), vehicles, roundabouts |
| 2031–2300 | Power/access propagation, stats, demand, civic mood |
| 2302–2670 | City maps (pollution, land value, crime, coverage), growth, milestones, `monthly()` |
| 2672–3030 | Money, placement, bulldoze, fire |
| 3031–3368 | Pointer/keyboard input |
| 3369–4548 | All UI panels, sound, politics/elections, save/load |
| 4550–4663 | Main loop and `init()` |

## The v2.0 systems

**`CFG` is the tuning surface.** Every constant the overhaul introduced lives in `CFG_PRESETS`,
resolved through `CFG.<section>.<key>`. Two presets, not two code paths: `classic` reproduces
the original sandbox exactly (all gates disabled, 4-year terms, full milestone cash);
`campaign` is the overhaul. `setMode()` swaps every section generically — adding a section
needs no change to it. **Never inline a new magic number**; put it in `CFG`.

**Tracts vs. lots — keep these distinct.** A *tract* (Phase 1) is a 4×4 annexation block in
`S.owned`; a *lot* (Phase 2) is one tile of private ownership in the sparse `lots{}` map.
Annexing a tract does **not** buy the private lots inside it. `annexTracts()` is the only
writer of `S.owned`, and `polAcquire()` is the only gateway through which a build action
touches an owned lot — including the plop paths, or a clinic becomes a free holdout clearer.

**The economy owns price, politics owns permission.** `landFMV()` and `tractPrice()` are
economy-side; `POLITICS.sellerMul` / `canAnnex` / `polBlocked` are politics-side. Neither
reaches into the other.

**Construction is a state machine on the cell.** `c.stage='uc'`, `c.buildL`, `c.buildT`.
`growthTick` calls `startConstruction`; `constructionMonthly` decrements every site and
completes them in one batch, then recalcs **once** — per-completion recalcs would fire dozens
of O(N²) scans per second at turbo. Any path that clears a tile must clear these three fields
and decrement `S.sites`.

**Time of day runs on real seconds.** `todT` advances by wall-clock, never `speedMul` — a
speed-scaled cycle turns 5× into a 24-second strobe day. `nightT` is derived from the ramp so
its original consumers still work. Data views force neutral daylight.

## Core architecture

**The grid is the model.** `grid` is a flat `N*N` array (`N = 68`) of plain cell objects created by `makeCell()` (`isopolis.html:600`). Index with `idx(x,z)`; bounds-check with `inB(x,z)`. Everything the sim knows about a tile — terrain, zone type, level, occupancy, power, road access, its three.js mesh — hangs off that one object. Tile→world conversion is `tileCX`/`tileCZ`.

**`S` is the only global game state** (`isopolis.html:565`). It is the save file, the UI data source, and the sim's accumulator all at once. Adding a persistent gameplay value means adding it to `S`, to `saveCity()`, and to `loadCity()`.

**Dirty flags, not immediate recomputation.** Placement code mutates the grid and sets a flag; the frame loop does the expensive work at most once per frame (`isopolis.html:4594`):

- `dirtyGround` (a `Set` of tile indices) → `flushGround()` redraws only those tiles into the ground canvas
- `roadDirty` → `refreshRoads()`
- `powerDirty` → `recomputePower()` (flood-fill from plants through `conducts()` tiles)
- `mapsDirty` → `recalcMaps()` (rebuilds the pollution/land-value/crime/coverage `Float32Array`s)
- `lightsDirty` → `rebuildCityLights()`

Never call `recalcMaps()` or `recomputePower()` directly from a placement handler — set the flag.

**Two canvases textured onto planes, not meshes, for ground.** `gCanvas` is the painted terrain/roads/zone-tint texture at `PX = 32` pixels per tile; `oCanvas` is the transparent overlay used for drag previews and data-view marks. Buildings are real three.js meshes; ground is 2D drawing.

**Buildings are procedurally generated, deterministically.** A "designer" function (`resParts`, `comParts`, `officeParts`, …) returns a list of primitive part descriptors, which `buildGeo()` merges into a single `BufferGeometry` with baked vertex colors. Randomness comes from `rngFor(x, z, salt)` — a hash-seeded PRNG — so the same tile always produces the same building. Never use bare `Math.random()` in a designer; it would make buildings flicker on reload. (`Math.random()` *is* correct in the sim tick, where non-determinism is intended.)

**Two clocks.** `growthTick()` runs every `TICK` (0.36s game-time) and samples 30 random tiles for develop/abandon decisions. `monthly()` runs every `MONTH_S` (9s) and does taxes, occupancy convergence, budget, elections, and disasters. Both are scaled by `S.speedMul` and driven from accumulators in `frame()`.

## Working conventions

**Adding a tool** touches several places, all in the UI/input sections: the `TOOLS` array (`isopolis.html:3391`), `TB_LAYOUT` (rail ordering, with `grp:` entries for flyout groups), `KEYTOOL` (`isopolis.html:3329`), the `pointerdown` dispatch chain (`isopolis.html:3228`), and — if it introduces a new cell `type` — `TYPE_CODE`/`CODE_TYPE` (`isopolis.html:4435`), plus `drawTile()` so it renders on the ground.

**The save format is versioned.** `saveCity()` writes `v: 2`; `loadCity()` accepts `v` 1 or 2 and rejects anything whose `cells` length doesn't match `N*N`. Changing `N` invalidates every existing save. Cells are serialized as compact positional arrays, so appending a field means appending to the end of that array and reading it defensively in `loadCity()`.

**Tooltips are custom, not native.** Use `data-tip="..."` on an element; a delegated `mousemove` handler at `isopolis.html:4652` renders it. Native `title` is deliberately avoided.

**Balance constants are centralized** in the `CONFIG` block: `PLANTS` (power tiers), `CAPS` (per-type, per-density occupancy caps by level), `MILESTONES`, `WILD_BASE`/`WILD_STEP`/`PRESERVE_FEE`. Tune there rather than inlining numbers at call sites.

**Money is displayed via `fm()`**, which prefixes the in-game `§` currency symbol and applies thousands separators.

## Style

The existing code is dense and deliberately terse — single-line functions, compressed conditionals, minimal vertical whitespace. Comments are sparse but explanatory, usually stating the *design intent* behind a number or rule ("towers need schooled neighbourhoods") rather than restating the code. Match that register.
