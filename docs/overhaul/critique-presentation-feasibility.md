# PRESENTATION TRACK — FEASIBILITY CRITIQUE (graphics/audio engineering review)

Reviewed against `/home/user/isopolis/isopolis.html` (current source, line refs verified) and against the actual three.js r128 build (`three@0.128.0` from npm — same build family as the cdnjs `r128/three.min.js` the game loads at line 507). Everything below marked "verified" was checked in source, not assumed.

## OVERALL

This is an unusually well-grounded design: nearly every line number cited is correct (renderer 604–611, materials 988–989, buildGeo 993–1043, setTileBuilding 1637, clearMesh 1631, day/night 4412–4431, frame 4552–4622, audio 3903–4027, tileToScreen 4327, sClick dead at 4021, updateAmbience-from-updateTop at 3632 — all confirmed). The r128 API claims are real: I verified ACES, PMREM, `scene.environment`, InstancedMesh/`setColorAt`, and the exact `onBeforeCompile` chunk strings against the shipped build. The audio plan is entirely standard WebAudio with correct integration points.

Three genuine flaws, in descending severity:

1. **G5's bloom premise is broken on r128.** The design claims emissives pushed above 1.0 survive a threshold-1.0 bright pass. False: r128 compiles tone mapping into every material regardless of render target (`WebGLPrograms.getParameters`: `toneMapping: material.toneMapped ? renderer.toneMapping : NoToneMapping` — verified at build line 13204), and ACES output asymptotes below 1.0. The scene RT will contain nothing over the threshold; the bloom pass renders black. Fixable (LDR threshold ~0.75) but the "only real emitters bloom" selectivity story dies with it. V1 should use additive sprite glow instead.
2. **The moving-sun mitigation math doesn't work at the specified day length.** DAY_S=120s means ~2.3°/s of azimuth sweep; 0.4° quantization = 6–8 discrete shadow jumps per second — judder, not mitigation. And `S.tod += dt·S.speedMul` gives a 24-second full day at 5× speed. The fix is pacing, not snapping.
3. **The batching plan is ~85% correctly specified but misses concrete plumbing**: `clearMesh(c)` receives no coordinates so the promised "geoData branch" can't mark a chunk dirty; `constructionAnims` records have no cell reference for the completion-bake hook; the flame-height call at 2927 tests `c.mesh` and breaks for merged buildings; `setView` (3148) — not the frame-loop pattern at 4574 — is where building visibility actually toggles. All fixable; spec below.

Scope: the +2,900-line estimate is honest, which is exactly why it doesn't all fit. ~60% fits in two to three long sessions; the cut line is drawn below.

## VERDICTS

| Item | Verdict | When | Notes |
|---|---|---|---|
| G1 chunk batching + geoData cache | KEEP-SIMPLIFIED | v1 (steps 1–2 + instanced trees); car instancing + junction claims v2 | Spec gaps closed below; highest regression risk in the design |
| G2 PBR + ACES + env map | KEEP | v1 | Fully verified on r128; budget a human-eye palette pass; Reinhard fallback is the right escape hatch |
| G3 vertex AO + contact shadows | KEEP | v1 | Cheap, safe, all in code already touched by G2/G11 |
| G4 continuous time-of-day | KEEP (with fixes) | v1 | Lengthen day to ≥8 min, decouple from speedMul, drop the 0.4° quantization, clamp shadow-sun elevation ≥~15°, enlarge shadow ext (see errors #5–6) |
| G5 inline dual-Kawase bloom | KILL v1 → additive sprite glow; rebuild v2 with LDR threshold | v2 | Premise broken (error #1); ~25-line glow-texture upgrade to `cityLights` Points + headlight points gets 80% of the night shot |
| G6 water surface | KEEP | v2 / v1 stretch | Self-contained, one draw call, no cross-track risk; correct as specified |
| G7 construction stages | KEEP-SIMPLIFIED | v1: slab + scaffold + floor-quantized rise + settle; crane + topping-flag v2 | Depends on pacing track's `p` landing first (design already sequences this) |
| G8 pedestrians + traffic feel | KEEP-SIMPLIFIED | v2 (v1 only if politics ships protests in v1 — then minimal walker pool) | Instanced walkers sound; junction claims + headlights v2 |
| G9 free orbit + fitted shadows | KEEP-SIMPLIFIED | fitted-shadow half in v1 (fold into G4); orbit v2 | Right-drag is taken (pan, 3227; stroke-cancel, 3224) — binding must be redesigned; 'E' rotate is already dead code (error #4) |
| G10 weather & seasons | KILL v1 | v2 | Design's own priority list puts it last; snow shader has a normal-space bug (error #10) |
| G11 ground PX 32→48 | KEEP-SIMPLIFIED | v1, ground canvas only | Decouple overlay canvas from PX or you double two 42MB textures (error #9) |
| S1 buses/compressor/ducking | KEEP | v1 | Verified: current graph really is three independent connects to destination (3929/3962/3992) |
| S2 voice() ADSR kit | KEEP | v1 | Standard; ten existing SFX re-based is mechanical |
| S3 convolver reverb | KEEP | v1 | ~25 lines, correct |
| S4 stereo panning | KEEP | v1 | `tileToScreen` (4327) returns CSS px — the pan formula is correct as written |
| S5 pentatonic sequencer | KEEP | v1 | Standard look-ahead pattern; the throttling guard in Risks #6 is right |
| S6 frame-driven ambience | KEEP-SIMPLIFIED | v1 core (updateAudio(dt), traffic hum, crickets); weather stems v2 | Fixes a real bug (ambience frozen off `updateTop`, verified 3632) |
| S7 event coverage | KEEP-SIMPLIFIED | v1: UI, construction, outage, game-over, money, transitions; protest/newspaper recipes ship with their features | Each recipe genuinely 5–15 lines |
| P1 holdout dressing | KEEP-SIMPLIFIED | v1 (sign + fence kit) | Small, canvas-texture signboard is zero-asset-compatible |
| P2 protest crowds | KEEP | v2 (gated on G8) | If politics needs v1 protests: stationary instanced ring, no pathing |
| P4 Ledger + photo trick | KEEP (with spec fixes) | v1 | Feasible; see error #7 for the toDataURL/crop/camera-restore details |
| P5 council panel, P6 HUD restyle | KEEP | v2 | Pure DOM, low risk, but it's polish — below the cut |

## R128 REALITY CHECK (what the CDN build actually supports — verified in the shipped file)

Present in `three.min.js` r128 (all grep-confirmed):
- `ACESFilmicToneMapping`, `toneMappingExposure`
- `PMREMGenerator` + `.fromEquirectangular`, `EquirectangularReflectionMapping`
- `scene.environment` plumbing (`material.envMap || environment` in WebGLMaterials — works with vertex-colored `MeshStandardMaterial`)
- `InstancedMesh`, `setColorAt`, `instanceColor`, `DynamicDrawUsage`
- `HalfFloatType`, `WebGLRenderTarget`
- `onBeforeCompile`; default `customProgramCacheKey()` returns `onBeforeCompile.toString()`, so buildingMat and treeMat with different injections get distinct programs automatically — no cache collision.

Absent (design correctly assumes so): `EffectComposer`, `UnrealBloomPass`, any `Pass`/`FullScreenQuad` — examples/js only.

`onBeforeCompile` on `MeshStandardMaterial` is **real, not hand-wavy**. Every replace target in the G2 snippet exists verbatim in r128's chunk source: `float roughnessFactor = roughness;` (exactly once), `float metalnessFactor = metalness;` (exactly once), `#include <emissivemap_fragment>`, `#include <begin_vertex>`, `#include <common>`, and `varying vec3 vColor` under `USE_COLOR` (so `vColor.rgb` swizzle is valid). The proposed startup assert is the right insurance. Simpler alternative if it ever gets shaky: two shared StandardMaterials (matte rough=0.85 / glass rough=0.2+metal=0.5) with buildGeo emitting geometry groups — but that fights the chunk merge (multi-material chunks), so the per-vertex attribute is actually the *simpler* path here. Keep it. One safety rule: emit `aRM`/`aEmit` **unconditionally in buildGeo**, because every buildingMat consumer (buildings 1642, wind rotors 1342, fire/police vehicles 1868–1869) routes through buildGeo — a geometry missing a declared attribute silently gets (0,0) = roughness 0/metalness 0 = glossy plastic.

Two sharp edges the design missed:
- **Tone mapping is applied when rendering into a render target** (verified: parameters take `renderer.toneMapping` independent of RT; RT output encoding comes from `rt.texture.encoding`, default Linear). Consequence for G5 above; also means a bloom composite must handle its own sRGB step or set `rtScene.texture.encoding = sRGBEncoding` deliberately.
- **`geometryNormal` is view-space** in r128 (`normal_fragment_begin` derives it from `vNormal`/derivatives). G10's snow mask `smoothstep(0.6,0.9,geometryNormal.y)` measures camera pitch, not "upward-facing"; needs `inverseTransformDirection(normal, viewMatrix)` first. (G10 is v2 anyway.)

r128 also creates a WebGL2 context by default, so `HalfFloatType` render targets are broadly renderable via `EXT_color_buffer_float`; the design's UnsignedByte fallback is still the right guard.

## BATCHING V1 SPEC

The design's four-step staging (cache → chunks → scatter → measure) is the right shape. The corrected, flow-complete v1 spec:

**Data.** On bake, store `c.geoData = {i, pos, nor, col, rm, emit, ry, wx, wz}` where `i` is the grid index (setTileBuilding knows x,z; clearMesh does not — see below), and `wx/wz` are the **actual mesh position** (which is `opts.wx`, not `tileCX(x)`, for multi-tile civic/plant anchors — 4514/4518). Dispose the individual mesh + geometry at bake time so geoData *replaces* the per-building BufferGeometry rather than doubling it (~40–100KB/building either way; same order as today's per-mesh CPU arrays, but don't hold both).

**Chunks.** 16 chunk `THREE.Mesh`es sharing buildingMat, `castShadow=true`, empty geometry allowed. `dirtyChunks` Set; flush ≤1 chunk/frame just before `flushGround()` (~line 4620). Rebuild = concatenate every built cell's geoData with manual yaw rotation of pos+nor and translation — then `computeBoundingSphere()` (chunk-level frustum culling when zoomed; forget this and zoomed-in culling breaks). Reuse pooled scratch arrays per the design's Risk #4.

**Flow-by-flow (this is what the design under-specifies):**
1. **setTileBuilding (1637):** unchanged for the animating path — individual mesh, `constructionAnims.push({mesh, s:0, x, z})` (**add x,z**; today's records are `{mesh,s}` only). For `opts.noAnim`, bake straight to geoData + dirtyChunk, no individual mesh.
2. **Anim completion (4567):** on `a.s>=1`, bake `grid[idx(a.x,a.z)]`, remove the mesh, dirtyChunk. The existing `!a.mesh.parent` self-clean (4565) keeps working because clearMesh still removes meshes.
3. **clearMesh (1631):** add `if(c.geoData){ dirtyChunks.add(chunkOf(c.geoData.i)); c.geoData=null; }`. clearMesh takes only `c` from 13 call sites (bulldoze 2716/2783, re-zone 2767, decay-abandonment 2515, burn-down 2892/2970, load 4465, etc.) — storing `i` inside geoData is the cheapest way to close this without touching call sites.
4. **Level-up (develop 2483):** works for free — setTileBuilding→clearMesh evicts the chunk copy, the new mesh animates individually, completion re-bakes. No double-render window.
5. **Data views (setView 3145–3148):** the per-cell `c.mesh.visible=showB` loop no longer covers merged buildings. Add: chunk meshes + instanced tree meshes toggle with `showB`. (The design cites the frame-loop pattern at 4574 — that's cityLights/clouds; buildings toggle in setView. Patch both if you like, but setView is the load-bearing one.)
6. **City lights (rebuildCityLights 2046):** reads grid data only, never meshes — unaffected. Verified.
7. **Fire/zap sprites:** scene-level sprites positioned by tile, not parented to meshes — unaffected, EXCEPT the flame-height call `setFlame(c,x,z, c.mesh?1.2+c.level*0.55:0.8)` at 2927: merged buildings have `c.mesh===null`, so fires on completed buildings render at ground level. Change the test to `(c.mesh||c.geoData)`.
8. **Picking:** raycasts only the math plane (693) — unaffected. Verified claim.
9. **Load (4461):** loadCity currently calls setTileBuilding *with* the pop animation for every building — thousands of anims, then 16 chunk bakes trickling in at 1/frame. Pass `noAnim` on the load path and bake directly; the curtain (Risk #9) hides it.
10. **Trees (step 3):** 5-geometry InstancedMesh with `setColorAt` — fine; remember setView (item 5) and that `clearTree` paths must free instance slots. Cars: keep individual in v1 (~320 draws is not the problem; the 3,000 building draws are); instancing + junction claims are v2.
11. **Wind rotors:** individual meshes spinning per-frame (4607) — leave them out of chunks; already handled since they're not `c.mesh`.

**Measure gate (design step 4):** correct as written; `renderer.info.render.calls` before/after on a full save.

## THE CUT LINE (what fits / what waits)

Budget reality: the design totals ~+2,900 lines. A strong coding agent lands ~700–1,000 correct, *integrated* lines per long session in a live single file being edited by two other tracks — and G2's palette retune plus G5-class debugging are session-eaters that produce few lines. Call it **~60% of the design in 2–3 sessions**.

- **Session A — the look and the sound change (ship first, lowest regression risk):** G2 + G4 (with the fixes in errors #5–6) + G3 + G11-ground + fitted-shadow half of G9, and the audio spine S1–S4. ~900 lines. After this session every frame and every existing sound is transformed.
- **Session B — perf + life:** G1 steps 1–2 + instanced trees, G7-simplified, S5 sequencer, S7 core events, sprite-glow stopgap for night (25 lines). ~850 lines.
- **Session C — narrative:** P4 Ledger (with error-#7 fixes), P1 holdout kit, S6 core (frame-driven updateAudio + traffic hum + crickets), remaining S7 wiring, tuning pass. ~600 lines.

**— CUT LINE —**

- **v2:** G5 real bloom (LDR-threshold rebuild), G6 water, G8 full pedestrians/headlights + P2 protest crowds (coordinate with politics track's protest schedule — if politics ships protests in v1, pull a minimal stationary instanced ring forward), G9 free orbit (after the input-binding redesign), G10 + S6-weather, P5, P6, car instancing + junction claims.

This ordering matches the design's own priority list except: G5 demoted (broken premise), G8 demoted (only its P2 dependency ever justified v1), and G9's shadow-fitting promoted into G4 where it belongs.

## INTEGRATION ERRORS

1. **G5 bright-pass threshold (design line: "uThresh ≈ 1.0 — only the >1.0 emissive windows survive"):** wrong on r128. Tone mapping is compiled into materials for RT renders too (verified in build source), and ACES output < 1.0 always, so the scene RT never exceeds 1.0 and the bright pass selects nothing. Rebuild as LDR bloom (threshold ~0.75, night-only so bright daytime whites don't halo) or use additive sprites in v1.
2. **`clearMesh(c)` has no coordinates** (1631; 13 call sites) — the promised geoData branch can't mark a chunk dirty as specified. Store the grid index inside `c.geoData` at bake time.
3. **Flame height check breaks under chunking:** 2927 tests `c.mesh` for height; merged buildings get ground-level flames. Test `c.mesh||c.geoData`.
4. **G9 input bindings collide with shipped controls:** right-drag already pans (3227: `e.button===1||e.button===2||TOOL==='pointer' → startPan`) and right-click cancels pending road/zone strokes (3224). Also "Q/E remain as nudges" is half-wrong today: `KEYTOOL.e='elementary'` (3330) returns before the `k==='e'` rotate (3346) — E-rotation is already dead code. Orbit needs a new gesture (middle-drag or modifier+drag), which is a design decision, not a code detail.
5. **G4 sun quantization is counterproductive at DAY_S=120:** ~2.3°/s sweep ÷ 0.4° steps ≈ 6–8 shadow jumps/sec — judder, worse than smooth crawl. And `S.tod += dt·S.speedMul·(24/DAY_S)` gives a 24s full day at 5×. Fix: DAY_S ≥ 480–720s, don't scale tod by speedMul (or cap the multiplier), drop quantization and let PCF radius 3.2 mask smooth crawl; clamp the shadow-casting elevation to ≥~15° (paint dawn/dusk with color/exposure, not with an 8°-elevation shadow pass that the 2048 map can't resolve — acne and stretched texels are guaranteed there at bias −0.0004/normalBias 0.03).
6. **"The shadow ortho frustum already covers the whole map, so a moving light Just Works" — false for rotation.** `ext = N*T/2+12 = 80` (651) covers the map for the *current fixed* sun direction; the map's half-diagonal is ~96, so at swept azimuths corner shadows clip. Bump ext to ~100 (further diluting the 2048 texels — one more reason G9's fitted frustum belongs in v1 alongside G4).
7. **P4 photo capture is under-specified:** `toDataURL()` has no crop arguments, and the renderer runs `preserveDrawingBuffer:false`, so capture must happen synchronously after an explicit `renderer.render()` in the same task. Correct recipe: save camera state → `clearOverlay()` (or the photo includes hover/data-view tint) → aim, `applyCamera()`, `renderer.render()` → `drawImage` the crop region into a small (~640×400) 2D canvas → `toDataURL` *that* (full-canvas encode at DPR 2 is ~14MP ≈ 200–500ms; the crop path is ~10–20ms) → restore camera before the next visible frame.
8. **Save version guard:** loadCity rejects anything but v1/v2 (4462: `data.v!==1&&data.v!==2`). "Bump v:3" requires updating this check or every new save refuses to load. One token, but the design's save-compat paragraph doesn't mention it.
9. **G11 PX is a shared constant:** `oCanvas` (673) is also `N*PX`. Raising PX to 48 silently doubles the *overlay* texture too — 2 × 42MB GPU uploads, and every `gTex.needsUpdate` re-upload gets 2.25× heavier (it's a full-texture upload per edit). Split the constants; keep the overlay at 32.
10. **G10 snow mask uses view-space `geometryNormal`** — measures camera pitch, not world-up; needs `inverseTransformDirection(normal, viewMatrix)`. (v2 item.)
11. **setView, not the frame loop, owns building visibility** (3148): the design routes chunk hiding through "the pattern at 4574" (cityLights). Harmless if the agent patches the frame loop, but the per-cell loop in setView is the code that actually toggles buildings/trees and must learn about chunks and instanced trees.
12. **Minor:** the audio design's `duckGain` sits on music+ambience only with sfx direct to master — correct as drawn in the diagram, and the reverb send correctly re-enters before the compressor. No errors found in S1–S7 integration points: 3929/3962/3992 direct-to-destination connects, ensureAudio-on-pointerdown (3210), updateAmbience-from-updateTop (3632), tileToScreen (4327), sClick dead (4021), toolbar hooks (3437/3458), sCash speed gate (2618) all verified as described.
