# Art Bible: Aerials

> **Status**: Draft
> **Owned By**: art-director
> **Last Updated**: 2026-11-10
> **Art Director Sign-Off (AD-ART-BIBLE)**: SKIPPED 2026-11-10 — solo mode

`/art-bible` writes these nine sections in this order and replaces each
section's `[To be designed]` line as that section is approved. A section still
holding its placeholder is incomplete; a later run fills only those.

## 1. Visual Identity Statement

**Visual rule:** Combat readability first, inside a richly detailed, realistic world (high-end PC graphics, Forward+).

- **Realistic light and atmosphere** — volumetric clouds, daylight, fog, realistic sea (waves, foam, reflections).
  - Test: when a lighting or atmosphere choice is ambiguous, choose the physically plausible one; fog and cloud never hide team markings or threat cues inside combat range.
  - Serves: mouse-aim arcade dogfight (the sky is the arena).
- **Rich world** — detailed islands, vegetation, trees, ships, harbours, roads, desert areas.
  - Test: when a scene feels empty, add authentic WWII-era detail; when detail competes with a target (runway, hangar, flak battery), the target wins on contrast.
  - Serves: bombing raids on flak-defended bases.
- **Teams and dangers always read** — team-colour markings and bright danger markers (flak, warnings).
  - Test: when realism would mute a team marking or a threat cue, keep the marking or cue at full clarity.
  - Serves: dogfight and flak raids.
- **Red rule:** red means danger only. HUD enemy text moves from `#fca5a5` to an orange/salmon tone (exact value in Section 4).

Source: the author's own direction (2026-11-10), shaped into rule + tests. Ships, roads, trees, clouds and desert are target look; they are not yet ported to Godot (brief: later).

## 2. Mood & Atmosphere

**Mission presets** — one picked at random at mission start, fixed for the whole sortie. Sun angle, sky colour, fog and sea reflection follow the preset (author's direction, 2026-11-10).

| Preset | Sun (elev., colour) | Sky top / horizon | Fog | Sea reflection | Shadows | Mood |
|---|---|---|---|---|---|---|
| Dawn | 8°, `#ffc89a` | `#2a4f8a` / `#f2c6a0` | `#c9d3e0`, medium; low mist in bays | medium, pink-gold | long, soft, cool blue | hushed, expectant |
| Noon | 70°, `#fffaed` | `#19559c` / `#99c4eb` | `#a0d8ef`, light | strong, white | short, hard | clear, exposed |
| Afternoon | 35°, `#fff0d6` | `#1d5fa6` / `#a8cbe8` | `#b4d6e8`, light | medium, warm | medium, crisp | confident, golden-neutral |
| Sunset | 4°, `#ff9a4d` | `#2b3f73` / `#ffb27a` | `#e0a988`, medium | strong orange glint path | very long; dark ground | dramatic, last light |
| Partly cloudy | 50°, `#fff6e5` | `#2a63a0` / `#b9cfdf` | `#bcccd8`, medium | patchy, moving cloud shadows | alternating hard/soft | restless, shifting |

**Readability per preset** (Section 1: teams and dangers always read):
- Dawn — mist hides insignia → fog capped to light within combat range (1.5 km).
- Noon — glare/bloom washes out lead sight and tracers → clamp bloom near the sun disc; dark outline on the lead sight.
- Afternoon — readability baseline; no fix needed.
- Sunset — orange sky swallows enemy text and red flak → grade clamp on red-orange sky saturation; `#fffaed` outline on danger cues; dark panel behind enemy labels.
- Partly cloudy — cumulus hides aircraft → cloud density capped inside combat range; edge marker for occluded targets.

**Gameplay states** — do not move the sun; they differ by the enemy base's local smoke/cloud volume and a per-state grade blend inside plausible ranges (3 s in, 6 s out).
- Takeoff / patrol — freedom, scanning. Open, airy, quiet. Low-medium. Carrier: clear horizon band, minimal HUD.
- Dogfight — focused aggression. Tight, kinetic, sharp. High. Grade +10% contrast. Carrier: tracer streams crossing the sky.
- Bomb run — dread, then commitment. Oppressive, smoky, deliberate. Very high. Grade darker and contrastier under the base smoke. Carrier: smoke columns + red flak sphere and black flak puffs.

**Fixed states**
- Main menu — fixed warm afternoon (Afternoon preset + warmer grade), never random. Anticipation, "pick your machine". Golden, calm, heroic. Low. Carrier: long-lens island panorama, sun glint on sea.
- Crash / respawn — short sting, fast reset. Desaturated; white flash fading to grey. Abrupt, muted, brief. Energy to zero. Carrier: the world loses its colour.
- Victory debrief — triumph. Mission preset + warm grade so gold reads under every preset. Proud, glowing, expansive. Medium-high. Carrier: orbit camera, gold kill-tally accents (`#fbbf24`).
- Defeat — sober resolve, not punishment. Cool, low contrast, overcast grade. Grey, still, heavy. Low. Carrier: slate sky, drifting smoke.
- Pause — neutral hold. Frozen frame, blurred, dimmed 40%. Suspended, quiet. None. Carrier: dark translucent panel over the blurred world.

INTENT UNKNOWN (art-director assumptions, not confirmed by the author): Partly cloudy uses a 50° sun under broken cumulus; combat-range cap of 1.5 km; preset hexes other than Noon are proposed values; presets picked with equal probability. Not checked in-engine — Sunset is the riskiest for readability and needs a screenshot test first.

## 3. Shape Language

- **Silhouette rule** — every aircraft identifiable as a 64 px top or side silhouette (Section 1: readability; mouse-aim dogfight). One distinguishing trait per type, exaggerated ~10%:
  - P-51D Mustang — belly radiator scoop + bubble canopy.
  - A6M2 Zero — long, slender, round-tipped wing + fat round cowl.
  - Bf 109 — square-clipped wingtips, narrow nose, yellow "14".
  - Il-2 Sturmovik — armoured hump + swept outer wing panels.
  - Spitfire Mk I — elliptical wing.
  - SM.79 Sparviero — three engines + dorsal hump; the largest silhouette.
- **Environment geometry** — nature is organic (noisy coastlines, rounded hills, clustered trees); targets are rectilinear (runway, apron, hangar boxes, tower). Straight edge = man-made = target (Section 1: rich world; bombing hook). Long low-sun shadows (Dawn, Sunset) strengthen these edges.
  - Flak batteries sit in circular sandbag rings: a circle on the ground means a gun.
  - Barrage balloons are rounded with vertical cables: a vertical line in the sky means a collision hazard.
- **UI shape grammar** — the HUD is its own language and does not echo the world. Thin-line geometry only: circle = aim / lead sight; chevron = ally; national insignia glyph = enemy team; triangle = danger; rectangle = information panel.
- **Hero vs supporting** — hero: enemy aircraft, target structures, flak sphere (high contrast, clean edges). Supporting: vegetation, ships, roads, harbours (mid contrast, fine detail); supporting detail never breaks a hero silhouette.

INTENT UNKNOWN: the ~10% trait exaggeration is an art-director proposal, accepted with the section but not yet tested on the GLB models.

## 4. Color System

**World palette** (Afternoon preset baseline)
| Colour | Hex | Role |
|---|---|---|
| Deep sea | `#165b7e` | cool base plane; lowest value |
| Meadow | `#3e7b36` | island mass |
| Runway concrete | `#8a8d8f` | highest-value neutral on the islands — targets pop against green |
| Horizon haze | `#99c4eb` | atmosphere, depth |
| Sunlight | `#fffaed` | key light; also the danger-cue outline |
| Danger red | `#ef4444` | danger only (HUD + FX) |
| Ally sky blue | `#38bdf8` | friend |

**HUD semantics**
- Red `#ef4444` — danger: flak zone, warnings. Reserved so it stays loud.
- Amber `#f59e0b` — caution: instructor idle, soft warnings.
- Gold `#fbbf24` — reward: kills; appears briefly only.
- Green `#22c55e` / `#00ff88` — OK / active (instructor engaged).
- Blue `#38bdf8` — ally; cool reads as safe.
- Yellow `#facc15` — lead sight.
- Text `#eef3f8`; panels `rgba(10,20,28,0.65)`.
- **Enemy text `#ff9e80` (light salmon)** — replaces `#fca5a5`. Hue ~14° vs amber 38° and gold 43°; lighter and less saturated than danger red, so value also separates it. Enemy labels always carry an insignia glyph; amber and gold never do.

**Red rule scope** — red = danger applies to HUD and FX only. Red national insignia on aircraft (Soviet star, hinomaru, roundel centre) stay authentic (author's decision, 2026-11-10).

**Tracers** — per-plane tracer colours stay, except Bf 109 moves from `#ff5500` to `#ff7a1a` so no tracer sits next to danger red (author's decision).

**Area temperature** (written for Afternoon; other presets shift it)
- Green islands — neutral-cool, mid value.
- Desert — warm, high value (`#f3dd9a`, `#fadb94`); targets there are darker asphalt with hard shadows.
- Sea — coolest, lowest value.
- Mesa `#994622` / `#b56333` stays below danger-red saturation; never a danger cue over mesa without its outline.

**Preset rules** (Section 2) — `#fffaed` 1 px outline on the flak sphere and the danger triangle is mandatory under Dawn and Sunset; under Sunset the grade clamps desert and mesa saturation below danger red.

**UI divergence** — the HUD is saturated, flat and emissive; the world is naturalistic. No HUD colour appears at HUD saturation in the world.

**Team identification** — colour gives two classes only: ally blue, enemy salmon. Team identity = insignia glyph (cross, star, hinomaru, roundel, Soviet star, Italian fasces) + type letter + silhouette (Section 3).

**Colourblind safety — pairs and backup cues**
- Danger red vs OK green — danger adds a triangle icon, a smooth opacity pulse (no hard flash, ≤ 2 cycles/s; Section 7), "BREAK!" text and an audio tone; OK is a steady checkmark.
- Red flak sphere vs green terrain — hatched shell with a 0.9 s countdown ring + audio.
- Enemy salmon vs danger red — enemy labels static + glyph; danger pulses + triangle.
- Salmon vs amber vs gold — glyph / triangle panel / centred banner.
- Neon green vs lead-sight yellow — the sight is a ring, instructor output is text; positions differ.
- Ally blue vs enemy salmon — chevron vs insignia glyph.
- Blue vs purple — no purple is used.

INTENT UNKNOWN: runway concrete `#8a8d8f` is an art-director value (no grey defined in code). Not run through a colourblind simulator; desert and Sunset contrast need an in-engine screenshot.

Code follow-ups (not done here): `hud.gd` `ENEMY_TEXT` `#fca5a5` → `#ff9e80`; `aircraft_defs.gd` Bf 109 `tracer_color` `#ff5500` → `#ff7a1a`.

## 5. Character Design Direction

"Characters" in Aerials are the aircraft and the ground units.

- **Player archetype** — no avatar: the player is the aircraft they picked. Pilots are seen only in the cockpit view; outside it a seated silhouette behind the canopy is enough.
- **Telling sides apart** (on top of Section 4):
  - Ally — blue chevron in the HUD + the player squadron's own national insignia.
  - Enemy — salmon label + insignia glyph + type letter.
  - Insignia sit at fixed positions on every aircraft (upper and lower wing, fuselage side) so they read from any angle.
  - Enemy team paint is a placeholder today (one flat colour per type, `enemy_director.gd` `PAINT`). Target: authentic period camouflage (temperate green/brown, desert sand, Japanese grey-green).
- **Ground units** (flak guns, balloon winch trucks, hangars) — olive / field grey, never brighter than terrain. Shape (Section 3: circle = gun) marks them as targets, not colour.
- **Pose and motion** — realistic, no exaggeration. Moving parts always live: propeller and prop blur, ailerons, elevator, rudder, flaps, landing gear. Control surfaces visibly show the player's input.
- **Damage states** — smoke from the hit module (engine: black; fuel: white-grey) → fire → wreckage. Damage never covers the insignia; side stays readable to the end.
- **LOD philosophy**
  - 15 m chase camera — full detail (panel lines, weathering, antennas).
  - 300 m – 1 km — silhouette and insignia hold; small parts drop.
  - Beyond 1 km (detection reaches 2.6 km) — silhouette + HUD marker carry it; the Section 3 trait must still read.

## 6. Environment Design Language

- **Architecture and culture** — every team's base is built in the period style of its aircraft's nation (author's decision, 2026-11-10); six national kits:
  - USA (Mustang) — Quonset steel-arch hangars, PSP steel-plate apron, wooden tower.
  - Japan (Zero) — timber hangars, tiled roofs, earth revetments.
  - Germany (Bf 109) — concrete hangars, camouflage netting, hard-angled brick tower.
  - USSR (Il-2) — log-and-earth revetments, grass strip, timber huts.
  - UK (Spitfire) — Bellman hangars, brick blast pens, grass field.
  - Italy (SM.79) — plastered masonry, arched hangars, light Mediterranean walls.
  - Shared kit — sandbags, windsock, edge lights; harbours (stone breakwater, cranes, warehouses).
  - Today every base uses the shared kit; the national kits arrive with the faction port (brief, Build order step 4).
- **Texture philosophy** — PBR (Forward+; Section 1 realism). Authenticity from weathering, not dirt: sun-faded paint, oil stains, tyre marks on the runway.
  - Terrain — vertex colour + detail noise today; target: PBR texture layers per biome (meadow, forest, beach, desert, mesa, granite).
  - Sea — waves, foam and reflection are shader work, not textures (Section 1).
- **Prop density**
  - Around bases — dense (hangars, trucks, fuel drums, sandbags, flak rings); combat happens here.
  - Open countryside — medium: clustered trees, roads, small villages.
  - Desert — sparse, so targets read easily.
  - Sea — very sparse: ships, buoys.
  - Rule: within ~150 m of a target, props are never taller than the target and never use its rectilinear language (Section 3).
- **Environmental storytelling (no text)**
  - Destroyed base — burnt hangars, craters, black smoke columns; reads as destroyed from the air.
  - A team that can no longer respawn — its runway is cratered.
  - Earlier kills — smoking wrecks on the ground stay for the whole sortie.
  - Barrage balloons — reveal a base's position from far away.
- **Legibility against characters** — aircraft render one value step away from the terrain they fly over (sky and sea backgrounds already separate them). Camouflage never hides the silhouette; Section 1's "teams always read" wins.

## 7. UI/HUD Visual Direction

**Art view**
- **Screen-space HUD** in every camera mode. In cockpit view the real instrument panel is a diegetic bonus only; no information lives only there.
- **Typography** — condensed military sans (DIN / stencil character) for numbers and labels; all caps; tabular digits. Hierarchy: warning > values > labels.
- **Iconography** — flat, thin-line, following Section 3's grammar (circle, chevron, insignia glyph, triangle, rectangle). National insignia as simplified flat glyphs.
- **Animation feel** — fast and mechanical: panels slide in over 120 ms, values roll like a counter, banners drop from the top and fade after 2.5 s. Only danger pulses (Section 4).

**UX view**
- **Fit** — in a dogfight the eye stays on screen centre (aim ring, lead sight). Critical information (flak warning, HP, gun jam) sits within ~15° of centre; a corner panel is read too late.
- **Feedback** — hit, kill and taking damage each have their own cue (hit marker, gold banner, red screen edge); keep all three.
- **Input** — menus are mouse-only today; keyboard-only navigation is required, gamepad partial (`.claude/docs/technical-preferences.md`).

**Resolved conflicts** (author's decisions, 2026-11-10)
- **Text size** — UX wins: 16 px minimum at 1080p, scaled with resolution (warning 20 px, values 18 px, labels 16 px at 1080p). Today's 13 px labels are below the floor.
- **Line weight** — UX wins: 2 px minimum + dark outline, so lines hold under Noon glare and the Sunset sky (Section 2). Still thin-line in style.
- **Danger pulse** — a smooth opacity wave, never a hard flash, ≤ 2 cycles/s (accessibility limit: no more than 3 flashes per second). Section 4 updated to match.

Code follow-ups (not done here): `hud.gd` label sizes 13 px → 16 px floor with resolution scaling; HUD line weight 2 px + outline; keyboard navigation in `main_menu.gd` / `pause_menu.gd`.

## 8. Asset Standards

**Art view**
- **Formats** — aircraft and props: glTF 2.0 binary (`.glb`) + `.json` sidecar for moving-part names (existing pipeline: JS builders → `tools/export_aircraft_glb.py`). Texture sources: PNG. Music: `.ogg`. Sound effects are procedural (no files).
- **Naming** — aircraft keep the pipeline's generated names (`<id>.glb`, `<id>_<n>.png`). New assets: `[category]_[name]_[variant]_[size].[ext]`, e.g. `prop_hangar_quonset_01.glb`, `tex_runway_concrete_2k.png`.
- **Texture tiers** — aircraft 2K PBR (albedo, normal, ORM) for every aircraft (author's decision, 2026-11-10); ground targets 1K–2K; props 512–1K; terrain biome layers 2K tiling; insignia decals 512, crisp.
- **LOD** — 3 levels per aircraft at the Section 5 distances: LOD0 < 300 m, LOD1 300 m – 1 km, LOD2 > 1 km (silhouette).
- **Export** — Y-up, metres, nose on +Z (matches `aircraft_defs.gd` hardpoints), PBR metal/rough.

**Technical view**
- **Budgets** — 60 fps / 16.6 ms frame (`technical-preferences.md`). No draw-call, memory-ceiling or poly budget is set; the limits below are proposals, not checked against a budget.
- **Measured today** (2026-11-10) — six GLBs: 2.2k–7k indexed triangles, 16–30 material slots, 284–686 KB each; textures 256–512 px.
- **Draw calls** — every material slot costs ≥ 1 draw call, multiplied by 4 shadow cascades. A sortie can hold ~28 aircraft (6 enemy teams × 4 + player + 3 wingmen): ~450–840 material draws before shadows. Proposal: ≤ 8 material slots at LOD0 (atlas), ≤ 2 at LOD1/LOD2. Trade-off: moving parts stay separate meshes but share a material.
- **Texture memory** — one 2K map with mips ≈ 22 MB uncompressed, ≈ 5.6 MB VRAM-compressed (1 byte/px class). A 3-map PBR set ≈ 17 MB per aircraft; six aircraft ≈ 100 MB. Accepted as the ideal standard without a memory budget — revisit when `Memory Ceiling` is set.
- **Unverified** — whether Godot 4.7 generates mesh LODs on import, and its VRAM compression settings: not covered by `docs/engine-reference/godot/`.

## 9. Reference Direction

- **War Thunder (Arcade Battles) — HUD and combat readability** (author's reference)
  - Take: the aim circle plus a separate lead marker ahead of the target; enemy markers as glyph + short label, keeping the eye near screen centre (Section 7 Fit).
  - Avoid: its marker shapes, colour coding and screen clutter. Our HUD follows Section 3 grammar and Section 4 colours; red never marks enemies. The minimap stays; only critical information sits near centre.
- **Author's sketch (`Game_dew2_ıdea.png`) — composition** (author's reference)
  - Take: the value stack — dark sea, green island, light grey runway as the brightest neutral, so the target reads first (Section 4 runway `#8a8d8f`); two insignia facing each other as the duel framing for the main menu and key art.
  - Avoid: its flat sea and flat grey sky — confirmed a sketch, not a style choice (2026-11-10). The sea gets depth, foam and reflection; the sky follows the Section 2 presets.
- **Dunkirk (2017, Christopher Nolan) — sky and sea atmosphere**
  - Take: low horizon and wide sky in air-to-air shots; a thin hazy horizon band; sea darkening under cloud shadow (Partly cloudy preset, main-menu panorama).
  - Avoid: its grey, desaturated grade and claustrophobic cockpit framing; the chase camera stays default.
- **IL-2 Sturmovik: Great Battles (1C Game Studios) — aircraft surfaces**
  - Take: wear that follows real use — exhaust staining behind the stacks, chipping at wing roots and panel edges, fading on upper surfaces (Section 6 weathering).
  - Avoid: muted sim camouflage that sinks into terrain (Section 6 keeps aircraft one value step off the ground); cockpit-first presentation.
- **Period reflector gunsights (Revi C/12, RAF Mk II gyro sight) — HUD line style**
  - Take: thin projected rings, centre pip, sparse layout (Section 7 thin-line military look).
  - Avoid: the single-colour amber glow and glass-reflection effect; our HUD is multi-colour by meaning, 2 px + outline, screen-space.

INTENT UNKNOWN: Dunkirk, IL-2 Great Battles and the gunsights are art-director proposals accepted with the section; "War Thunder Arcade" read as the Arcade Battles mode.
