# ISOPOLIS — GRAPHICS & SOUND OVERHAUL DESIGN ("Presentation Track")

Target file: /home/user/isopolis/isopolis.html (single file, Three.js r128 CDN, canvas ground, WebAudio synthesis, zero external assets). All line numbers below refer to the current file and were verified against the analyst reports and the source.

---

## VISION

Isopolis stays a **hand-crafted tabletop miniature** — saturated low-poly masses, springy animations, a diorama on a green baize rim — but the miniature graduates from "lit by a fluorescent office ceiling" to "photographed on a sunlit windowsill." The three levers that do 80% of the work: a **real sun that moves** (dawn gold, hard noon, long amber golden-hour shadows, a blue moonlit night where thousands of windows actually glow and bloom), **materials that react to light** (matte stucco vs. glinting glass towers reflecting a procedural sky, buildings seated into the ground by baked AO and contact shadows), and a **city that is audibly and visibly alive** (pedestrians on sidewalks, staged construction with cranes and hammer taps, water that ripples, a gentle pentatonic score that swells as the city grows and darkens when the people turn on you).

Presentation is also the **narrative organ for the politics and pacing overhauls**: protests are real crowds with picket signs you can hear before you see; holdout cottages sit defiantly in the shadow of towers behind hand-painted "NOT FOR SALE" signs; construction takes visible weeks of scaffolds and cranes so slow growth feels earned rather than laggy; and the city's story is told through **The Isopolis Ledger**, a procedurally-typeset newspaper front page whose "photos" are literally screenshots of your own 3D city, filtered to halftone. Charm is a constraint, not a casualty: no gritty realism, no texture noise on walls, colors stay candy-bright — we add light, life, and consequence, not grime.

---

## GRAPHICS MECHANICS

### G1. Chunked static batching + instancing (PERF PREREQUISITE)
**Design:** Today every building is its own shadow-casting `THREE.Mesh` (`setTileBuilding`, line 1637); a full 68×68 city is 2,000–4,000+ draw calls rendered twice (shadow pass). Nothing else in this track is safe to build on that. Plan:
- **Chunk grid:** divide the 68×68 map into **4×4 = 16 chunks of 17×17 tiles**. Each chunk owns ONE `THREE.Mesh` with a merged `BufferGeometry` containing every *completed* building in the chunk. Full city ⇒ ~16 building draw calls + 16 shadow draws (down from thousands).
- **Cache, don't regenerate:** in `setTileBuilding`, after `buildGeo(built.parts)` produces the non-indexed arrays, store them on the cell: `c.geoData = {pos, nor, col, rm, emit, ry, wx, wz}` (rm/emit are the new PBR/emissive attributes from G2/G4). Chunk rebuild = for each built cell in the chunk, apply the yaw rotation `ry` manually to position+normal pairs (`x' = x·cosθ + z·sinθ; z' = −x·sinθ + z·cosθ`) and translate by `(wx, 0, wz)`, then concatenate all arrays into one `BufferGeometry`. Pure Float32Array copying — no THREE geometry objects churned.
- **Dirty-chunk flushing:** mirror the `dirtyGround` pattern (line 942): a `dirtyChunks` Set; the frame loop (insert near line 4620) rebuilds **at most one chunk per frame** to amortize bursts. Worst-case chunk (289 buildings × ~2k verts) is a few ms — acceptable at one per frame.
- **Animating buildings stay individual:** a building under construction/level-up keeps its own mesh exactly as today (`constructionAnims`, line 4563; extended by G7). On completion, write `c.geoData`, remove the individual mesh, mark chunk dirty. Demolition: drop `c.geoData`, mark dirty. This means chunk rebuilds are naturally deferred behind the construction animation — no placement-burst spikes.
- **Instance the repeated scatter:** trees, cars, and (new) pedestrians move to `InstancedMesh` (supported in r128, including `setColorAt`/`instanceColor`): 5 canonical tree geometries (conifer/round/tall/shrub/autumn variant) with per-instance color + scale jitter replacing per-tile `treeMesh`; the ~320 cars become one `InstancedMesh` (merged body+cabin geometry, `instanceColor` for paint, `DynamicDrawUsage`, matrices written each frame from the existing graph-walker in `updateCars` line 1949). Fire/police keep individual meshes (few, special).
- **Picking:** raycasting currently only targets the ground plane (`groundPlane`, line 693) — chunking does not break tile picking. `clearMesh` (1631) gains a `geoData` branch.
**Impact/Effort: XL enabler / M effort.** Not a pixel changes on its own, but it lifts the draw-call ceiling ~100×, and G2's env-map PBR, G5's bloom pass, and G8's crowds are only affordable on top of it.

### G2. PBR materials + ACES tone mapping + procedural sky reflections
**Design:** The single biggest look-per-line upgrade.
- **Renderer (lines 604–611):** `renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;` (exposure becomes a live dial for time-of-day, G4). Keep sRGB output as-is.
- **Materials (lines 988–989):** replace both `MeshLambertMaterial`s with `new THREE.MeshStandardMaterial({vertexColors:true, flatShading:true, roughness:1, metalness:1})` — roughness/metalness act as *multipliers* for a new per-vertex attribute. Inject it via `onBeforeCompile` (r128 chunk names verified):
  ```js
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRM; attribute float aEmit; varying vec2 vRM; varying float vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM=aRM; vEmit=aEmit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRM; varying float vEmit; uniform float uNightGlow;')
      .replace('float roughnessFactor = roughness;', 'float roughnessFactor = roughness * vRM.x;')
      .replace('float metalnessFactor = metalness;', 'float metalnessFactor = metalness * vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vEmit * uNightGlow;');
    sh.uniforms.uNightGlow = uNightGlow;   // shared {value:0} object, driven by time-of-day
    mat.userData.shader = sh;
  };
  ```
- **Author aRM in `buildGeo` (vertex loop, lines 1024–1035):** the `_isGlass` heuristic (line 1020) already identifies windows/curtain walls — give glass `aRM = (0.18, 0.55)` (smooth, semi-metal ⇒ picks up env reflections), matte walls `(0.85, 0.0)`, roofs `(0.7, 0.0)`, industrial metal accents (grays with low saturation) `(0.4, 0.6)`. Also set `aEmit`: glass parts of res/com/office get 0.9–1.6 (randomize per-part with `vSeed` so some windows stay dark), streetlamp heads 2.0, everything else 0.
- **Procedural environment map:** draw a 256×128 equirect sky on a 2D canvas (vertical gradient: zenith→horizon colors from the current time-of-day ramp, a bright sun disc blob, a dark ground band), wrap in `THREE.CanvasTexture` with `mapping = THREE.EquirectangularReflectionMapping`, run through `new THREE.PMREMGenerator(renderer).fromEquirectangular(tex)`, assign to `scene.environment` (supported in r128). Pre-bake **4 PMREMs** at load (dawn/noon/dusk/night) and swap at time thresholds while lerping `envMapIntensity` — glass towers now visibly reflect a warm or cool sky.
- **Palette re-tune (mandatory):** ACES desaturates and darkens the current punchy palette. Compensate globally in `buildGeo`: after `C.set(p.c)`, apply `C.offsetHSL(0, +0.07, +0.02)`; raise `sun.intensity` ~1.15→1.9 and `hemi` ~0.85→1.05 and iterate by eye against screenshots of the current build. Ground plane: keep `MeshPhongMaterial` but raise `shininess` to ~8 with a faint specular so wet-look (G10 rain) is possible.
**Impact/Effort: XL / S–M.** This is the "flat toy → rendered miniature" moment; ~150 lines, no perf cost (StandardMaterial + one env map is cheap at this poly count).

### G3. Baked vertex AO + contact shadows
**Design:** Two cheap tricks that seat buildings into the world.
- **Ground-contact AO in `buildGeo`:** in the vertex loop, multiply the existing `_sh` gradient by `ao = 1.0 − 0.30·exp(−vy/0.55)` where `vy` is the vertex's y after translate — walls darken toward the ground line and the fake gradient becomes a believable occlusion falloff.
- **Inter-mass AO:** before the vertex loop, collect each part's XZ AABB + height. For every vertex, if it lies inside another *taller* part's AABB expanded by 0.18 and below that part's top, multiply color by 0.86 (stacked ziggurat setbacks, courtyard inner walls, and roof junctions self-shadow). O(verts × parts) at build time only — buildings have <20 parts.
- **Contact shadows on the ground canvas:** in `drawTile` (line 771), when a cell has a built structure, paint a soft radial gradient ellipse (`rgba(0,0,0,0.20) → transparent`, sized ~88% of the lot, offset 1–2px toward the sun's noon azimuth) *under* the driveway/lot pass. Zero geometry, auto-updates through `dirtyGround`, and survives data-view toggles. Trees get a smaller 0.12-alpha blob via the same branch.
**Impact/Effort: L / S.** ~60 lines; the "sits in the world, not on it" fix the graphics analyst called out (weakness #3).

### G4. Continuous time-of-day: sun arc, golden hour, living night
**Design:** Replace the binary night toggle (lines 4413–4431) with a normalized clock.
- **Clock:** `S.tod ∈ [0,24)`, advancing in `frame()` with `S.tod += dt·S.speedMul·(24/DAY_S)` where `DAY_S = 120` (one full cycle per 2 real minutes at 1×; pause freezes it). Persist in the save under a new top-level key `tod` (v stays load-compatible: default 12 when missing). The N key / night button becomes "fast-forward to the next of {golden hour 17.5, night 22.5, morning 8}" — a smooth `todTgt` chase at 8 game-hours/sec, keeping the beloved toggle feel.
- **Keyframe ramp:** replace `DAYC/NITC` with an array of keys, each `{t, sunElev, sunAzim, sunCol, sunInt, hemiSky, hemiGnd, hemiInt, bg, exposure, glow, lightsT}`:
  - 5.0 pre-dawn (deep blue `#16223e`, sunInt 0, glow 0.7), 6.5 sunrise (`#ffb37a` sun, elev 8°, exposure 1.1, long shadows), 9 morning, 13 noon (`#fff2d8`, elev 62°, exposure 1.3), 17.5 **golden hour** (`#ffab52` sun, elev 12°, azim swung west, hemi warm, exposure 1.15 — the money shot), 19.5 dusk (`#ff7d5e` horizon bg, sunInt 0.25, glow ramps), 21 night (moon mode), 24→5 deep night.
  Interpolate with smoothstep between neighbors each frame; colors via `Color.lerp` into scratch colors (no allocation).
- **Sun position:** spherical around origin: `sun.position.set(cos(elev)·sin(azim), sin(elev), cos(elev)·cos(azim)).multiplyScalar(140)` with azim sweeping ~100°→260° across daylight. The shadow ortho frustum (lines 651–654) already covers the whole map, so a moving light Just Works. To suppress shadow-edge crawl on static geometry, quantize: only update `sun.position` when the direction has moved > 0.4° since last write.
- **Moon mode (sunElev < 0):** repoint the same DirectionalLight as a moon (mirror arc, color `0x9db8ff`, intensity 0.28) so night still has crisp shadows; `uNightGlow` (G2) ramps 0→1.4 so windows emit per-vertex (killing the flat global `buildingMat.emissive` hack, line 4424); `cityLights` Points opacity keys off `lightsT` instead of `nightT`. Keep `nightT` as a derived value (`nightT = 1−clamp(sunElev/10°)`) so the ~10 existing consumers (clouds, car headlights, ambience) keep working unmodified.
- **Fog & background** follow the ramp (dusk fog pulls closer for a hazy horizon: lerp fog.near from N·T·3.4 to N·T·2.4 around 18:00–20:00).
**Impact/Effort: XL / S–M.** Golden-hour raking shadows across a low-poly city is the single most cinematic cheap win available; ~200 lines, near-zero runtime cost.

### G5. Night bloom (inline mini-composer)
**Design:** No EffectComposer in r128 core, and pulling `examples/js` files off the CDN adds fragile external script tags — so inline a **~180-line threshold-bloom pipeline** (only active when `nightT > 0.05`; otherwise the plain `renderer.render` path runs untouched):
1. Render scene to `rtScene` (full res, `HalfFloatType` if `renderer.capabilities` allows, else UnsignedByte with a lower threshold).
2. **Bright pass** to a half-res target: fullscreen quad (a hand-rolled `FullScreenQuad`: one `PlaneGeometry(2,2)` + `ShaderMaterial` + ortho cam) with `max(color − uThresh, 0) · smoothstep` knee, `uThresh ≈ 1.0` — only the >1.0 emissive windows (G2 pushes `aEmit·uNightGlow` above 1), city-light Points, headlights, and flame sprites survive.
3. **Dual-Kawase blur:** 3 downsample + 3 upsample ping-pong passes at 1/2→1/16 res (13-tap Kawase kernel in the shader; ~25 lines).
4. **Composite:** blit `rtScene` + additive blurred bloom (strength uniform ramps with `nightT·0.7`) through a final quad.
Resize handling hooks the existing resize listener (line 4624). Windows, streetlamps, smokestack embers, police beacons, and protest torch… no, brazier-free protests — picket signs don't bloom, and that's correct.
**Impact/Effort: L at night / M.** The night city becomes the screenshot people share. Requires G1 first only for headroom, not correctness.

### G6. Real water surface
**Design:** Keep the painted canvas water as the seabed; float a mesh over it.
- **Geometry:** at terrain-gen/load time, build one `BufferGeometry` of quads covering exactly the `terrain==='water'` tiles (from `genTerrain`, lines 723–737), 2×2 verts per tile, at `y = 0.06`. Bake a per-vertex `aShore` attribute = 0 on verts adjacent to land, 1 in open water (one grid neighbor scan).
- **Material:** a single `ShaderMaterial{transparent, depthWrite:false}`, uniforms `{uTime, uSunDir, uSunCol, uSkyCol, uNight}`, fed each frame from the G4 ramp. Fragment:
  - Normal = sum of 3 moving sine-wave gradients (two axes, different wavelengths/speeds — "Gerstner-lite", ~8 lines).
  - Color = `mix(deepBlue, uSkyCol, fresnel)` with `fresnel = pow(1 − dot(N,V), 3.0)` — water mirrors dawn pink / noon blue / night ink automatically.
  - Sun glint = `pow(max(dot(reflect(−uSunDir,N),V),0.),120.)·uSunCol` — a moving glitter path at golden hour.
  - Shore foam = `smoothstep(0.25,0.0,aShore) · (0.5+0.5·sin(uTime·1.5 + aShore·14.))` white bands lapping the sand strip.
  - Vertex bob: `pos.y += 0.03·sin(uTime + worldX·0.7 + worldZ·0.9)`.
- Hide with `S.view` like other meshes (pattern at line 4574).
**Impact/Effort: M–L / S–M.** One draw call, ~120 lines, and the map's dead corner becomes the second-best screenshot.

### G7. Multi-stage construction (pacing-track integration)
**Design:** The pacing track supplies per-cell progress `p ∈ [0,1]` over real construction time. Replace the single 0.45s pop (lines 1654–1655, 4563–4569) with four readable stages, all driven off `p`:
- **Stage A — groundbreaking (p < 0.2):** `drawTile` gains a `'construction'` ground state: brown dirt mottle + plank-border pixels (same hand-painted style as driveways). A flat concrete slab mesh (one box, h=0.12) appears with the old springy pop. Dust `roadPoof()` on start.
- **Stage B — scaffold & core (0.2 ≤ p < 0.75):** generate a scaffold from the *final* massing's bounding box: verticals at corners + horizontal rails every 0.9 units up to `bboxH·min(1, p·1.5)`, all thin boxes through `buildGeo` in a khaki/steel palette — plus a **tower crane** (mast boxes, counter-jib, slewing jib group that rotates slowly like the wind rotors, line 4607) for buildings taller than 3 units. The real building mesh rises inside with `scale.y = quantize(p_mapped, floors)` — floor-by-floor jumps, not a smooth stretch, so growth reads as work.
- **Stage C — topping out (0.75 ≤ p < 1):** scaffold rails remove top-down (drop parts from the scaffold geo per step), a tiny flag appears on the roof.
- **Stage D — completion:** crane+scaffold vanish with dust poof, building does a 1.06→1.0 squash-settle over 0.25s (the charm beat), `c.geoData` is written and the chunk (G1) absorbs it. Level-ups (`develop`, line 2483) reuse stages B–D with shorter `p` spans.
State: `c.conStage`/`c.conP` serialized by the pacing track's new save key. During construction the cell keeps an individual mesh group (G1 exempts it).
**Impact/Effort: L / M.** This is what makes the pacing overhaul's slow growth *feel* like a city being built instead of a laggy spawn. Pairs with S7 hammer audio.

### G8. Pedestrians & richer traffic
**Design:**
- **Pedestrians:** one `InstancedMesh` (merged 2-box body+head, ~24 tris, `MeshStandardMaterial{flatShading}`, per-instance `setColorAt` shirt colors from the WALL_RES palette), capacity 600, count = `min(600, S.pop/250)`, −60% at night. Walker records `{x0,z0,x1,z1,t,speed:0.5–0.8,side:±0.72}` reuse the car graph-walk destination logic (`pickDest`, ~line 1900) but walk the road-tile *edges* (sidewalk offset ±0.72 vs. cars' ±0.30). Compose matrices with a scratch `Object3D`: position + heading yaw + a `1+0.05·sin(t·10+phase)` vertical bob; `instanceMatrix.needsUpdate` each frame. Extra spawns weighted around parks/com — plazas feel busy. This system is **shared with protest crowds (P2)**.
- **Traffic feel:** (a) intersection courtesy — keep a per-junction `Uint8Array` claim count; a car entering a junction tile already claimed slows to 25% until clear: stop-and-go emerges without signal logic; (b) **headlights/brake lights** — one additive-blended `THREE.Points` cloud rebuilt each frame from car positions when `nightT > 0.3` (warm white pair projected 0.35 ahead, red pair behind when slowed); bloom (G5) catches them, turning night arterials into light rivers; (c) cars become instanced per G1.
**Impact/Effort: L / M.** Sidewalk life is the strongest "the city is alive" signal per triangle, and the crowd system is a hard prerequisite for visible protests.

### G9. Camera: free orbit + fitted shadows (keep zoom-to-cursor)
**Design:** The 4-snap azimuth (lines 3345–3346) becomes continuous:
- Right-drag (or two-finger twist) rotates `azimTgt` continuously at `dx·0.005` rad/px; the existing smoothing (line 4557) provides glide; on release apply decaying angular velocity (`azimVel *= exp(−dt·4)`) for inertia. Q/E remain as animated 90° nudges (they now snap to the *nearest* diagonal, preserving muscle memory).
- Optional gentle pitch: promote `ELEV` (line 624) to `elevCur`, right-drag-vertical adjusts within **[28°, 55°]** — enough to peek at facades, clamped so the iso charm can't be lost. All ground raycasts already use a math plane, so picking is unaffected.
- **Do not touch** wheel zoom-to-cursor (lines 3314–3328) — it's already excellent.
- **Fitted shadow frustum:** when `camera.zoom > 1.6`, shrink the sun shadow camera to a box around `camTarget` (`ext2 = VIEW·aspect/zoom + 8`), snapping the shadow camera position to texel-sized increments (`(2·ext2)/2048` world units) to prevent swimming; lerp back to full-map extents when zoomed out. Close-up shadows go from mushy to crisp for free.
**Impact/Effort: M / S.** ~70 lines; rotation + golden hour together produce the "turntable diorama" moment.

### G10. Weather & seasons
**Design:** A tiny state machine keyed to `S.month`: seasons {spring, summer, autumn, winter}; weather Markov step each month (`clear ↔ overcast ↔ rain/snow`, probabilities per season).
- **Season looks:** grass base colors in `drawTile` (line 804 mix) take a per-season palette (spring bright, summer deep, autumn olive, winter pale + white speckle); on season change mark all tiles dirty but let `flushGround` process max ~400 tiles/frame (add a budget counter) — a 12-frame wipe reads as a gentle transition. Tree canopies: inject a `uCanopyTint` uniform into the tree material via `onBeforeCompile` and multiply where `vColor.g` dominates — autumn oranges and winter bare-gray without touching per-tree attributes. Winter roofs: inject into the chunk material fragment `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93,0.95,0.98), uSnow·smoothstep(0.6,0.9,geometryNormal.y))` — snow dusts every upward face with one uniform.
- **Rain:** a 1,200-vertex `THREE.Points` (or GL_LINES pairs for streaks) in a 60×40×60 box tracking `camTarget`, falling at 28 u/s with slight wind shear, wrapping in y; visible only in rain, opacity by intensity. Overcast dims `sunInt ×0.7`, raises cloud count/opacity (clouds already exist, line 2069), pulls fog in. **Snow** reuses the system at 4 u/s with drift and flake sprites.
- Hooks: weather feeds S6 (rain/wind audio), the Ledger's weather box (P4), and the ticker.
**Impact/Effort: M / M.** Big variety-per-session win; safely additive; ship after the core lighting work.

### G11. Ground fidelity bump
**Design:** Raise `PX` 32→48 (line 513; canvases become 3264², still fine for canvas + one GPU upload at load, incremental after). Sharpen `drawTile` details that are currently pixel-starved: road center dashes, crosswalk stripes at junctions (`roadMask` already knows connectivity, line 911), shoreline wet-sand gradient. Keep anisotropy max (already set, line 664).
**Impact/Effort: S–M / S.** Quick close-up win; do it alongside G3's contact shadows since both live in `drawTile`.

---

## SOUND MECHANICS

### S1. Master bus, compressor, ducking, mixer UI
**Design:** Everything currently connects straight to `actx.destination` (drone 3929, wind 3962, sfx 3992). Build in `ensureAudio` (line 3905):
```
masterGain(0.9) → DynamicsCompressor(threshold −18, knee 12, ratio 4, attack 0.005, release 0.25) → destination
musicBus ─┐
ambBus  ──┼→ duckGain → masterGain          sfxBus → masterGain
uiBus  ───────────────→ masterGain          revSend (per-bus gains) → Convolver (S3) → masterGain
```
`duck(amount=0.45, hold=0.3)`: `duckGain.gain.cancelScheduledValues(t); setTargetAtTime(amount,t,0.03); setTargetAtTime(1,t+hold,0.4)`. Call it from every salient one-shot (milestone, election, disaster, newspaper, game-over) so speech-register events sit *on top of* the bed instead of inside it. Rewire `startAmbience`/`natureAmbience`/`sfxBus` to the buses; add Master/Music/SFX sliders to the settings modal (persist in `localStorage` — audio prefs only, saves untouched) and make the 🔊 button mute `masterGain` instead of gating every call site.
**Impact/Effort: L / S.** ~70 lines; prerequisite for everything below; instantly fixes "nearly inaudible bed" (weakness: caps 0.032 at 1.4M pop — recurve to `min(0.06, pop/90000)`).

### S2. `voice()` synth kit: real ADSR + filter envelopes
**Design:** One reusable primitive replacing `beep()` (line 3996):
```js
function voice({freq, type='triangle', detune=4, a=.01, d=.08, s=.5, r=.18, dur=.15,
                peak=.12, cutoff=2200, cutEnv=.6, pan=0, bus=sfxBus, rev=0}){ ... }
```
osc (+ a second osc `detune` cents up, mixed 0.4) → per-voice lowpass (frequency gets its own envelope: `cutoff → cutoff·(1−cutEnv)·` via `setTargetAtTime` decay — plucks open then close, pads breathe) → gain with full ADSR (`linearRamp` attack, `exponentialRamp` decay to `s·peak`, hold to `dur`, exp release) → `StereoPanner(pan)` → bus, plus `rev`-scaled tap to the reverb send. Reimplement all ten existing SFX (4009–4023) as `voice()` presets — they keep their character (same base frequencies) but gain space, stereo, and tails. ~90 lines total.
**Impact/Effort: L / S.** Every sound in the game improves at once.

### S3. ConvolverNode reverb from a generated impulse
**Design:** At audio init, synthesize a 2.0s stereo impulse: `d[i] = (rand·2−1)·pow(1−i/len, 2.4)`, with a progressive one-pole lowpass over the tail (darkening late reflections) and decorrelated L/R noise. `ConvolverNode → gain(0.16) → masterGain` as a shared send. Send levels: UI 0, SFX default 0.12, birds/nature 0.3, music pads 0.25, election/newspaper stings 0.4 (civic gravitas). One convolver total — cheap.
**Impact/Effort: M–L / S.** ~25 lines; the dry-closet problem solved globally.

### S4. Stereo panning by screen position
**Design:** `panForTile(x,z)`: project via the existing `tileToScreen` (line 4327) → `pan = clamp((sx/innerWidth)·2−1, −1, 1)·0.65`. Every world-anchored one-shot (place, dozer, fire, growth, construction hammers, protest crowd node, outage zap) passes it to `voice()`. Ambience width: run the wind and traffic-hum noise as two decorrelated sources panned ±0.5. Guard: `if(!actx.createStereoPanner)` fall back to center.
**Impact/Effort: M / S.** ~15 lines; the isometric world finally has a left and a right.

### S5. Generative pentatonic score (look-ahead sequencer)
**Design:** The identity upgrade. A 16-step, 8th-note sequencer with the standard look-ahead pattern: `setInterval(100ms)` scheduling every note where `noteTime < actx.currentTime + 0.25` (immune to rAF throttling/pauses; pause game ⇒ fade `musicBus`, keep scheduler idle).
- **Harmony:** 4-chord loop, 2 bars each — Am7 → F → C → G (roots 220/174.6/130.8/196 Hz), melody notes drawn from A-minor pentatonic `[0,3,5,7,10]` semitones + octave, always consonant by construction.
- **Layers (each a `voice()` preset on `musicBus`):**
  - *Pad:* two detuned triangles per chord tone, `a=1.2 r=2.5`, cutoff `700 + approval·14` Hz — the city's mood literally brightens and darkens the timbre.
  - *Bass:* sine root on steps 0/8, appears above 2k pop.
  - *Pluck melody:* per 8th step, probability `0.22 + min(0.3, growthRate)`; random pentatonic walk with max-2-note repeat guard, fast cutoff envelope, velocity jitter; appears above 10k pop.
  - *Night bells:* sine +2 octaves, probability 0.08, long reverb send; replaces the pluck when `nightT > 0.5`.
- **State mapping:** tempo `= 68 + min(24, popGrowthPerMonth·2)` BPM; `approval < 40` ⇒ drop to the darker voicing (lower chord inversions, cutoff floor, −8 BPM) — the score audibly sours as the politics track's unrest builds; protests active ⇒ pad only + low ostinato; election week ⇒ add a snare-brush tick (band-passed noise on off-beats). City-size tiers gate layers so a hamlet is a lone pad and a metropolis is a full arrangement — **the score is a progress bar you hear**.
**Impact/Effort: XL / M.** ~180 lines. Biggest perceived-quality jump per the sound analyst; agreed.

### S6. Layered, frame-driven city ambience
**Design:** Fix the event-driven freeze (weakness: `updateAmbience` only fires from `updateTop`, line 3632). Add `updateAudio(dt)` to `frame()` (insert near line 4608) with an internal 0.25s throttle. Layers on `ambBus`:
- *Low drone:* existing chord (3913–3932), re-routed, cap raised to 0.06 at `pop/90000`.
- *Traffic hum:* brown noise (`b += 0.02·(white − b)`) loop → lowpass `240 + trafAvg·700` Hz → gain `min(0.05, pop/60000·(0.4+trafAvg))` — the analyst's "city grows from birds into hum" arc, driven by real sim data (`S.trafAvg`).
- *Nature:* keep wind + `chirp()` birds, now wall-clock scheduled; birds gate on `tod ∈ [5,19]`; **crickets** at night: 4.2kHz sine AM-modulated at 24Hz, gain `nightT·green·0.02`.
- *Crossfade:* equal-power between nature and city stems on `greenAround()` (line 3940): `natureG = sin(g·π/2)`, `cityG = cos(g·π/2)` — panning the camera from downtown to the preserve audibly travels.
- *Weather (G10):* rain = white noise → highpass 1.8k → lowpass 6k, gain by intensity with a 0.5Hz jitter LFO; distant thunder = brown-noise burst → lowpass 120Hz, 3s release, heavy reverb send, probability per rain-minute.
**Impact/Effort: L / S–M.** Mostly rewiring + two new noise loops.

### S7. Full event coverage (the silent-events fix)
**Design:** Wire every silent row in the sound analyst's coverage table, each a `voice()` recipe:
- **UI clicks:** finally call `sClick` (dead code, line 4021) from `buildToolbar`/`openFlyout` handlers (3437/3458) via `uiBus`, vol 0.05 — quiet, dry, centered.
- **Construction (G7):** while any on-screen cell is in stage B, every 0.4–0.9s per site (max 3 concurrent, nearest first): *hammer* = 30ms noise burst → bandpass 900Hz Q4 + 90Hz sine thunk, panned to site; *completion settle* = 70Hz thud + short noise "shh" + rising major-3rd blip. Slow pacing-track growth now has a soundtrack of work.
- **Power outage:** falling saw sweep 320→60Hz over 0.8s with closing lowpass; while the outage banner (line 4318) shows, a faint irregular 50Hz AM buzz; restoration = rising mirror + relay "chunk".
- **Protest (P2):** crowd bed = brown noise → bandpass 400Hz Q0.7, amplitude chattered by a slow noise LFO; chant = rhythmic band-passed pulses in a `[x·x·xx··]` pattern every 1.2s; gain by crowd size, panned to the protest tile, ducks music. Rare megaphone squeal (1.2kHz sine, ring-modulated).
- **Election:** rebuild `sElect` on `voice()` with detuned saws + 0.4 reverb (civic brass); add crowd cheer (filtered-noise swell up) on win, low descending murmur on loss.
- **Newspaper (P4):** press-roller loop (15ms noise clacks at 8Hz, 0.6s) + page "fwip" (highpass noise sweep) + rubber-stamp thump when the Ledger slides in.
- **Game over:** 3-note minor descent (A3→F3→D3), saw+triangle, long releases, max reverb, everything else ducked to 0.2 for 4s. Distinct from mere election loss.
- **Money:** treasury-negative = soft two-note minor-second sigh monthly while red (line 2620); at `speedMul>1` replace per-tick `sCash` (gating quirk, line 2618) with a bar-synced coin shimmer whose brightness maps to log(net income).
- **Transitions:** dawn = one bird flourish + pad swell at tod≈6; dusk = low 130Hz gong + cricket fade at tod≈19.5; save/load = up/down chime pairs; day/night button = whoosh.
**Impact/Effort: L / M.** Pure coverage; each recipe is 5–15 lines on top of S1–S4.

---

## POLITICS & PACING LEGIBILITY

**P1. Holdout parcels — defiance you can photograph.** A holdout cell keeps its little level-1 cottage while neighbors tower: the contrast IS the message, so protect it — never auto-clear the mesh. Dress the lot: instanced white picket-fence segments along the tile border, a small signboard mesh whose face is a 64×48 canvas texture with procedurally lettered "NOT FOR SALE" / "OUR HOME" (canvas text = still zero assets, rotates with the board so it's 3D, not a sprite). Overlay canvas (line 954 kit) draws a slow amber pulse ring while negotiation is open. Hover chip (`tileInfo`, line 3676) shows the owner's procedural avatar (seeded canvas: skin-tone circle + geometric hair/glasses) + their demand. Resolution either way is a Ledger story (P4).

**P2. Protests — crowds, not banners.** A protest event claims a target tile + size `k`. Pull `k∈[8,40]` walkers from the pedestrian pool (G8), path them to a ring on the target, switch to "picket" behavior: bob in place (per-instance phase), slow orbit. A second small `InstancedMesh` of picket signs (stick + board; 4 pre-drawn canvas slogans shared via UV offset) is matrix-locked above ~40% of protesters. Overlay hatches the affected zone red; a toast offers "Go to protest" (recenters `camTarget`). Audio = S7 crowd bed, panned, growing with `k`. Escalation = second ring + chant tempo up; resolution disperses walkers back into pedestrian duty. Council votes that trigger or resolve protests get map pings (expanding overlay ring) at the parcels they affect — the politics sim always has a *where*.

**P3. Construction stages as pacing feedback.** G7's dirt → slab → scaffold+crane → floor-by-floor → topping-out flag → settle sequence, plus S7 hammers, makes the pacing track's long build times legible: a glance across the skyline shows what's coming and how far along. The hover chip shows a progress ring + stage name ("Scaffolding — 7 mo"). Era transitions announce themselves in the Ledger and re-tint the palette subtly (early era: `toneMappingExposure` −0.06 and warmer hemi for a faint sepia; modern era: neutral) — cheap, reversible, evocative.

**P4. The Isopolis Ledger — the politics feedback organ.** A full-screen modal (reuse the `.msModal` pause pattern, line 4030) styled as a broadsheet: CSS-only paper (off-white, faint repeating-gradient grain, hairline column rules), Georgia/serif masthead "THE ISOPOLIS LEDGER", date from `S.month/S.year`, era motto under the fold. Content is template-driven: an event-queue collects month events; on a *front-page-worthy* event (election result, council vote outcome, holdout resolution, protest escalation, disaster, era change, major milestone) the Ledger slides in with: one lead headline from mad-lib templates ("COUNCIL {PASSES|KILLS} {ordinance} {margin}", "HOLDOUT {name} {SELLS|WINS}: {quote}"), a deck line, 2 side briefs from minor events, and a weather box (G10). **The killer trick — real photos:** before opening, aim `camTarget` at the event tile, render one frame, and `renderer.domElement.toDataURL()` a cropped region into an `<img>` with `filter: grayscale(1) contrast(1.25)` and a CSS halftone-dot overlay — every front page carries an engraving-style photo *of your actual city*. Minor months stay in the existing ticker (line 3768). Entrance/exit uses S7's press-roll + stamp audio.

**P5. Council chamber panel.** A side panel (glass chrome frame, paper interior) showing a semicircle of seat dots (plain DOM/SVG), colored by faction lean, with the motion text above. On a vote: animated roll-call — seats flip color one by one with soft wooden ticks (`uiBus`), a tally bar fills, then a "PASSED"/"REJECTED" ink-stamp animation (CSS rotate+scale-in) with thump. Hovering a pending policy shows predicted seat colors at 50% opacity — the politics track's vote math becomes visible before you commit. Results echo to the Ledger.

**P6. HUD restyle — "civic paper & brass."** Keep the `.glass` chrome for live controls but move all *civic* surfaces (approval panel, budget, election, council, Ledger) to the paper style: serif headings, ink rules, stamp motifs. The top-bar approval stat gains a tiny inline trend sparkline (canvas, 60×16) so the politics pressure is ambient, not buried. One coherent metaphor: **you run the city through machinery; the city answers you in print.**

---

## PRIORITY ORDER (impact-per-effort, build in this order)

1. **G2 — ACES + PBR + env map + palette retune** (S–M effort, XL impact; transforms every frame)
2. **G4 — Continuous time-of-day + golden hour + moon** (S–M, XL; the cinematic win)
3. **G3 + G11 — Vertex AO, contact shadows, ground detail** (S, L; grounds everything G2/G4 lit)
4. **S1–S4 — Audio spine: buses/compressor/ducking, voice() ADSR, reverb, panning** (S–M total, L; every existing sound upgraded at once)
5. **G1 — Chunk batching + instanced trees/cars** (M, XL enabler; do before G5/G8 and before big-city testing)
6. **G7 + S7-construction — Construction stages with sound** (M, L; the pacing track depends on it)
7. **S5 — Generative pentatonic score** (M, XL; the identity of the game changes)
8. **P4 — The Ledger newspaper** (M, XL for politics legibility; screenshot-photo trick is cheap and unforgettable)
9. **G8 + P2 — Pedestrians, traffic feel, protest crowds + P1 holdout kit** (M, L; politics on the map)
10. **G5 — Night bloom mini-composer** (M, L-at-night; needs G1 headroom)
11. **S6 — Layered frame-driven ambience** (S–M, M)
12. **G6 — Water surface** (S–M, M–L)
13. **G9 — Free orbit + fitted shadows** (S, M)
14. **P5 + P6 — Council panel + HUD restyle** (S–M, M)
15. **G10 + S6-weather — Weather & seasons** (M, M; last because it's pure variety, zero dependency)

---

## INTEGRATION

**Modification map (existing code → change):**

| Site | Lines | Change |
|---|---|---|
| Renderer setup | 604–611 | ACES tone mapping + exposure var (G2); render target plumbing for bloom (G5) |
| Lights rig | 639–657 | Sun/hemi intensities retuned for ACES; sun position driven per-frame (G4); fitted shadow frustum (G9) |
| `buildGeo` | 993–1043 | aRM/aEmit attributes, HSL retune, ground-contact + inter-mass AO in the vertex loop (G2/G3) |
| `buildingMat`/`treeMat` | 988–989 | → `MeshStandardMaterial` + `onBeforeCompile` injections (G2, G10 snow/canopy uniforms) |
| `setTileBuilding` / `clearMesh` | 1637–1661 / 1631 | cache `c.geoData`, chunk membership, construction-stage branch (G1/G7) |
| `drawTile` | 771–935 | contact-shadow ellipse, construction dirt state, seasonal grass palette, crosswalks (G3/G7/G10/G11) |
| `flushGround` | 942–951 | per-frame tile budget (~400) for season wipes (G10) |
| Day/night block | 4412–4431 | replaced by tod clock + keyframe ramp; `nightT` becomes derived; night button = time fast-forward (G4) |
| `frame()` | 4552–4622 | insert: tod advance + ramp apply (after 4561); dirty-chunk flush (near 4620); pedestrians + headlight points (near 4605); `updateAudio(dt)` (near 4608); bloom composite replaces bare `renderer.render` at 4621 when `nightT>0.05` (G4/G1/G8/S6/G5) |
| `updateCars` | 1949 | junction claims, instanced matrices, light-point export (G8/G1) |
| Audio block | 3903–4027 | S1 buses wrap `ensureAudio`; `beep` reimplemented on `voice()`; ambience calls move out of `updateTop` (remove call at 3632) into `frame()` (S1–S6) |
| `tileToScreen` | 4327 | consumed by `panForTile` (S4) |
| Toolbar/flyouts | 3437, 3458 | wire `sClick` via uiBus (S7) |
| Modals kit | 4030 pattern | Ledger + council panel reuse pause-modal pattern (P4/P5) |
| Save/load | 4437–4452, 4461+ | new **top-level** keys only: `tod`, `weather`, `season`; construction progress rides the pacing track's key; per architecture analysis, never touch the positional `cells` array or `TYPE_CODE` order; bump `v:3` with defaults-on-missing so v2 saves load clean |

**Instancing/batching prerequisite plan (G1, staged):**
1. *Step 1 — cache:* `setTileBuilding` stores `c.geoData`; behavior otherwise unchanged (still individual meshes). Verify saves/loads/bulldoze.
2. *Step 2 — chunks:* add 16 chunk meshes sharing `buildingMat`; completed buildings merge in; individual meshes retained only while animating (`constructionAnims` / G7 stages). `dirtyChunks` Set + one-rebuild-per-frame flush. Data views: chunks hide via the same `S.view` visibility rule (pattern at 4574).
3. *Step 3 — scatter:* trees → 5-geometry `InstancedMesh` set with `setColorAt`; cars → instanced; delete per-tile `treeMesh` and per-car materials.
4. *Step 4 — measure:* `renderer.info.render.calls` before/after on a full save (target: <100 calls day, <120 night with bloom). Only then enable G5/G8 at scale.

**New-code size budget (approximate, keeps the single file sane):** G1 ~250 lines, G2 ~160, G3 ~60, G4 ~200, G5 ~190, G6 ~130, G7 ~220, G8 ~200, G9 ~70, G10 ~200, S1–S4 ~200, S5 ~180, S6 ~120, S7 ~180, P1/P2 ~200, P4 ~260, P5 ~120. Total ≈ +2,900 lines → file lands ~7,500 lines. Acceptable; demand section banners (`/* ===== */`) per system, matching the file's existing style.

---

## RISKS

1. **ACES will fight the charm if the palette isn't retuned.** Filmic rolloff desaturates the candy palette the owner likes. Mitigation is built into G2 (HSL offset + light-intensity retune + side-by-side screenshots), but budget a real tuning pass; if it still reads muddy, fall back to `ReinhardToneMapping` at exposure 1.4, which is gentler on saturated mids.
2. **r128 API surface.** Verified available in r128: `MeshStandardMaterial`, `ACESFilmicToneMapping`, `scene.environment` + `PMREMGenerator.fromEquirectangular`, `InstancedMesh` + `setColorAt`, `onBeforeCompile`. NOT available in core: EffectComposer/UnrealBloomPass (examples/js only — hence the inline mini-composer in G5; if the team prefers, r128's `examples/js` non-module builds do exist on unpkg and could be added as extra CDN script tags, but that widens the external-dependency surface from one file to five). `onBeforeCompile` string-replace targets are r128's exact chunk text — pin the replace strings with a startup assert (`if(!sh.fragmentShader.includes('float roughnessFactor'))` console.warn) so a future three upgrade fails loudly, not silently.
3. **Moving sun = shadow crawl.** A continuously moving directional light makes shadow texels swim on static geometry. Mitigations: quantized sun updates (0.4° steps), texel-snapped shadow camera (G9), and the soft PCF radius already in place. Accept some shimmer at dawn/dusk; it reads as atmosphere at this stylization level.
4. **Chunk rebuild spikes.** A 289-building chunk rebuild is a few ms of Float32 copying; at speed 5× with heavy growth, multiple chunks can dirty at once. The one-chunk-per-frame budget bounds the cost but delays visual merge by a few frames (invisible: the individual mesh persists until merged). Watch GC pressure from throwaway arrays — reuse one scratch Float32Array pool per rebuild.
5. **Bloom on high-DPI.** Full-res scene RT + half-res chain at `pixelRatio 2` on a 4K display is fillrate-heavy. Mitigations: cap bloom chain at 1024 wide, render bloom only when `nightT>0.05`, and offer a "Glow" toggle in settings. If `HalfFloatType` RTs are unsupported (old mobile GPUs), drop threshold to 0.85 and accept slight banding — or disable bloom (feature-detect via `WEBGL_color_buffer_float`).
6. **Audio scheduling under throttling.** Backgrounded tabs throttle `setInterval` to ≥1s — the music scheduler must tolerate gaps (on wake, jump `nextNoteTime` to `currentTime + 0.1` rather than machine-gunning missed notes). Also keep total simultaneous voices bounded (~24) with a simple voice-count guard, or the compressor will pump audibly during placement sprees.
7. **Single-file growth.** ~+2,900 lines takes the file to ~7,500. Still tractable, but merge conflicts across three parallel tracks (politics/pacing/presentation) in ONE file are the real project risk. Recommend strict section ownership: presentation owns the THREE SETUP, GEOMETRY KIT, sound, and new POST/AUDIO/WEATHER sections; politics/pacing own sim sections; shared touchpoints (`frame()`, `setTileBuilding`, save format) get integrated by one person in a defined order (pacing's construction progress lands before G7 consumes it).
8. **Save compatibility.** All new state uses new top-level keys with defaults-on-missing (v2 saves must load perfectly). The architecture analysis's hard edges (N=68 baked in, positional cells, ordinal type codes) are respected — presentation adds zero per-cell save fields; construction progress is the pacing track's key, and `c.geoData` is always reconstructable from `parts` on load (loadCity's existing rebuild path at 4503–4524 just feeds the chunk system).
9. **Season ground-wipe hitches.** Re-tinting 4,624 tiles through `drawTile` is ~50–100ms if done in one frame; the 400-tiles/frame budget spreads it, but any *other* full-map dirty (load, data-view exit) shares that budget — verify load still paints fully before the curtain lifts.
10. **Pedestrian/protest CPU.** 600 walkers × matrix compose is fine (<0.5ms), but pathing must stay the cheap edge-walk — resist per-pedestrian A*. Protest rings are stationary bobbing (near-free). If profiling shows pain, halve counts at `speedMul≥3` (nobody watches pedestrians at 5×).
