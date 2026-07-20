# SOUND & MUSIC ANALYSIS (isopolis.html)

## SUMMARY

Isopolis's audio is a compact, hand-rolled WebAudio synth layer occupying roughly lines **3903–4027**. It consists of three parts: (1) a **continuous drone-based ambience** — a low three-oscillator chord plus a filtered-noise wind layer and sporadic bird chirps — whose loudness tracks city population and on-screen greenery; (2) a set of **ten one-shot SFX** (`sPlace`, `sDoze`, `sErr`, `sGrow`, `sMilestone`, `sFire`, `sRoad`, `sClick`, `sElect`, `sCash`) built on a single `beep()` primitive; and (3) a **mute-only** toggle. It is competent and tasteful for its size — deliberately quiet, warm oscillator choices, gentle filtering — but it is architecturally thin: no true ADSR, no reverb, no compressor/limiter, no stereo, no music, no ducking, mono throughout, and it is driven off `updateTop()` rather than the frame loop so the ambience only re-evaluates on discrete game events. There is **no generative music at all**, and a large set of important game events (UI clicks, protests/civic-mood shifts, power outages, disaster alerts, day/night, game-over, save/load, construction) are **silent**. `sClick()` is defined (line 4021) but **never called** — dead code; every UI interaction is silent.

## MECHANICS

**ensureAudio — 3905–3911** — Lazily constructs `actx = new AudioContext()` (with `webkitAudioContext` fallback), resumes it if suspended, then calls `startAmbience()`. Called once per `pointerdown` on the canvas (line 3210), satisfying the browser gesture requirement.

**startAmbience — 3913–3932** — Builds the persistent bed. A `lowpass` biquad (`frequency 280`, `Q 0.2`) fed by a master `GainNode` starting at `0.0`. Three oscillators form a root+fifth+octave chord at **48 Hz (sine), 72.5 Hz (triangle), 96 Hz (sine)** with per-osc gains **0.6 / 0.28 / 0.28**. A `0.03 Hz` sine LFO with gain **40** modulates the filter cutoff (slow "breathing"). Chain: oscs → per-osc gain → filter → master → `actx.destination`. Guarded by `_amb` so it builds once. Note: **bypasses the SFX bus** and connects straight to destination.

**updateAmbience — 3933–3938** — Sets the master gain target to `S.muted ? 0 : Math.min(0.032, S.pop/1400000)` via `setTargetAtTime(..., 1.5)` (1.5 s time constant). So ambience is inaudible until the city is large (needs ~45k pop to reach the 0.032 ceiling) and caps very low. Then calls `natureAmbience()`. **Critically, this is invoked only from `updateTop()` (line 3632), not the per-frame loop** — so ambience/wind/birds re-evaluate only when the player builds or a month ticks, not continuously.

**greenAround — 3940–3949** — Samples a 13×13 tile block around `camTarget`, returns the fraction that is `empty/park/preserve/farm/water`. Drives wind/bird intensity from what the camera looks at.

**natureAmbience — 3951–3973** — Lazily builds `_windNode`: a **2-second white-noise buffer** (`Math.random()*2-1`), looped, through a `bandpass` biquad (`520 Hz`, `Q 0.5`) into a gain → `destination`. Wind gain targets `green*0.028` (`setTargetAtTime(...,1.2)`). Also schedules birdsong: when `green>0.45` and `now>_birdNext`, sets `_birdNext = now + 1.6 + random*3.5` and calls `chirp()`. Because it is gated behind `updateTop()`, bird cadence is coupled to game events, not wall-clock.

**chirp — 3974–3985** — 2–4 sine notes, base `1800 + random*1400 Hz`, each note 90 ms apart, pitch rises 15% over 60 ms, gain envelope 0.0001→0.020 (10 ms attack) → exp decay to 0.0001 over 90 ms. Routed through `sfxBus()`.

**sfxBus — 3986–3995** — Shared SFX chain: `lowpass` biquad (`2600 Hz`, `Q 0.4`) → gain `0.9` → destination. Used by `beep()` and `chirp()` only. Returns the *filter* node as the connection point.

**beep — 3996–4008** — The core one-shot. Main oscillator of caller-chosen `type` at frequency `f`, plus a fixed secondary **sine at `f*2.01`** (octave up, slightly detuned) at `vol*0.28`. Envelope is a crude **AD (attack-decay)**: `setValueAtTime(0.0001)` → `linearRampToValueAtTime(vol, +0.012)` → `exponentialRampToValueAtTime(0.0001, +d)`. No sustain, no release stage. Both oscillators through the SFX bus. Respects `S.muted`.

**One-shot SFX — 4009–4023** — All are 1–4 stacked `beep()` calls:
- `sPlace` 520+720 Hz square, 70 ms — build/zone placed.
- `sDoze` 120+75 Hz sine, 160–200 ms — bulldoze/de-zone.
- `sErr` 150+110 Hz square, 160 ms — invalid action.
- `sGrow` 620+930 Hz triangle, throttled to 1/200 ms via `lastGrowS` — building leveled up.
- `sMilestone` 660/830/990 Hz triangle arpeggio, 110 ms stagger — population milestone.
- `sFire` 160+95 Hz **sawtooth**, 260–340 ms — fire ignites.
- `sRoad` 300 Hz square, 45 ms — per-tile road-drag tick.
- `sClick` 440+660 Hz triangle — **defined but never invoked**.
- `sElect(win)` win = 523/659/784/1046 Hz triangle rising arpeggio; loss = 392/330/262 Hz sawtooth falling — election result.
- `sCash` 880+1170 Hz sine, 50–70 ms — positive monthly income tick.

**Mute control — 4024–4027** — `sndBtn` click flips `S.muted` and swaps the 🔊/🔇 glyph. This is the **only** mixing UI; there is no volume slider and no master gain the user can attenuate.

## EVENT COVERAGE

| Game event | Sound | Call site |
|---|---|---|
| Zone / building placed | `sPlace` | 2736, 2774, 2801, 2813, 2839, 3026, 4351 |
| Bulldoze / de-zone | `sDoze` | 2787, 2854, 2866, 2873, 2883, 2895, 2904, 2911 |
| Invalid action | `sErr` | 2676, 2760, 2780, 2791, 2805, 2824, 2825, 3013, 3014 |
| Building level-up (growth) | `sGrow` (throttled) | 2492 |
| Population milestone | `sMilestone` | 2658 |
| Re-election won (fanfare) | `sMilestone` | 4239 |
| Fire ignites | `sFire` | 2929 |
| Road drag (per tile) | `sRoad` | 3286 |
| Election result win/lose | `sElect` | 4198 |
| Positive income (monthly, speed ≤1) | `sCash` | 2618 |
| City ambience (drone) | `startAmbience`/`updateAmbience` | 3910, 3632 |
| Wind over open land | `natureAmbience` | 3937 |
| Birdsong over greenery | `chirp` | 3971 |
| **UI tool select / button click** | **SILENT** (`sClick` unused) | — |
| **Power outage / grid at capacity** | **SILENT** (visual banner only) | 4318–4322 |
| **Disaster alert banner** | **SILENT** (visual only) | 4315–4324 |
| **Fire extinguished / burns out** | **SILENT** | — |
| **Protest / civic-mood "wants restraint"** | **SILENT** | 3652, 4100 |
| **Treasury goes negative / broke** | **SILENT** (toast only) | 2620 |
| **Recall / voted out / game over** | only `sElect(false)`; no distinct sting | 4198 |
| **Day / night toggle** | **SILENT** | 4426 |
| **Save / load city** | **SILENT** | 4536–4537 |
| **Construction rising animation** | **SILENT** | 4563–4569 |
| **Traffic / cars, wind-turbine rotors** | **SILENT** | 4605, 4607 |
| **Weather** | **no weather system exists** | (ticker joke, 3782) |
| **Toast good/bad notification** | **SILENT** | throughout |

## WEAKNESSES

- **No true envelopes.** `beep()` (4004–4005) is attack→exponential-decay only: no sustain or release stage, so every sound is a short pluck. No filter envelopes, so timbres never open/close.
- **No music whatsoever.** No sequencer, no melody, no harmonic motion beyond the static 48/72.5/96 Hz drone. Long sessions are tonally monotonous.
- **Ambience is event-driven, not time-driven.** `updateAmbience()` runs from `updateTop()` (3632), not the `frame()` loop (4552). Wind gain and bird scheduling only advance when the player acts or a month ticks — during idle play the ambience effectively freezes.
- **No master bus / no limiter.** Ambience (3929), wind (3962) and SFX bus (3992) all connect independently to `actx.destination`. No summing master `GainNode`, no `DynamicsCompressor`, no single point for global volume or ducking.
- **No reverb / no space.** No `ConvolverNode`; every sound is dry.
- **Mono only.** No `StereoPanner`/`PannerNode`, despite an isometric world with clear spatial layout.
- **Very narrow dynamic/mix ceiling.** Ambience caps at gain `0.032` and needs enormous population (`pop/1400000`) to approach it (3935); wind caps at `green*0.028` (3966). The bed is nearly inaudible in a mid-size city.
- **Coarse audio-visual coupling.** Ambience does not respond to district type, day/night (`nightTgt` exists, 4413), traffic, pollution, crime, or civic mood — only raw pop and camera-local greenery.
- **Dead + missing feedback.** `sClick` never wired; high-drama moments (power outage, disaster banner, protests, going broke, game over) have no audio.
- **`sCash` gating quirk.** Only plays at `S.speedMul<=1` (2618), so at higher speeds the economy is silent.

## OPPORTUNITIES (priority order, WebAudio-only)

1. **Master mix bus with limiter and ducking.** One `masterGain → DynamicsCompressor → destination`. Route ambience, wind, birds, SFX and (new) music sub-buses into it. Add `musicBus`/`sfxBus` gains and a `duckGain` on ambience+music that dips ~4–6 dB for ~200 ms when salient SFX (milestone, election, fire, disaster) fire. Also enables a real volume slider.
2. **Generative music: compact pentatonic/modal sequencer.** Scale table (e.g. A minor pentatonic `[220, 261.6, 293.7, 329.6, 392]` across octaves), look-ahead scheduler (~100 ms interval scheduling notes ≤200 ms ahead), 8–16 step loop, slow chord progression. Key to city state: **tempo/energy from population growth rate, mode brightness from approval, register density from district under camera.** Biggest perceived-quality jump.
3. **Layered generative ambience responding to city size, district, time-of-day.** Cross-faded stems: low pad (current drone), mid "city hum" (filtered noise + detuned saws, cutoff opens with density/traffic), nature layer. Cross-fade nature↔city on `greenAround()` and district composition. Bind to `nightT` (4413). **Move the ambience update into `frame()` (4552) using `dt`.**
4. **Proper ADSR + filter envelopes.** Reusable `env(param, t, a, d, s, r, peak, sustainLevel)` helper; per-note `lowpass` with its own envelope (pluck = fast decaying cutoff; pad = slow).
5. **Filtered-noise texture instruments.** Rain = white noise → highpass ~1–2 kHz with amplitude jitter; crowd/traffic murmur = brown noise → lowpass tracking pop+traffic; storm gusts = LFO-modulated bandpass Q. Needs a lightweight weather state (none exists).
6. **ConvolverNode reverb from generated impulse.** ~2 s stereo buffer of exponentially-decaying noise, aux send. Parks = longer softer tail; downtown = tighter.
7. **Stereo positioning via StereoPannerNode.** Pan one-shots by the tile's projected screen-x (`tileToScreen`, 4327). Slight stem panning for width.
8. **Fill silent events:** wire `sClick`; power-up/brown-out sweeps for grid events (4318); pulsing alarm bed while disaster banner shows (4322); low "unrest" crowd swell for protest mood (3652); descending motif for treasury negative (2620); proper **game-over sting**; save/load confirmations; construction "whoosh + settle" tied to `constructionAnims` (4563); day/night transition swell (4426). At fast speeds replace per-tick `sCash` with a periodic "coin shimmer" summarizing net income.
