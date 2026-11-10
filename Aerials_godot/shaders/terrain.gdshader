// Terrain surfacing: vertex colour = biome base colour (sRGB, from World._terrain_color),
// CUSTOM0 = biome weights (r sand, g mesa, b granite/ridge rock, a forest; meadow = remainder).
// Adds procedural per-biome detail (world XZ / triplanar for rock), 200-800 m macro variation,
// slope rock, per-pixel beach/shallow-water band, and distance fade of fine detail (no shimmer).
// Detail only modulates value around 1.0, so biome hues (and mesa saturation) stay as authored.
// shortcut: all detail is procedural value noise (no photo textures exist), upgrade to authored PBR
// texture arrays per biome if the art pipeline ever provides them.
// Target: Forward+ desktop, ~25 value-noise taps per pixel, no texture samples.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

group_uniforms shore;
uniform vec4 beach_desert : source_color = vec4(0.953, 0.867, 0.604, 1.0); // #f3dd9a
uniform vec4 beach_green : source_color = vec4(0.894, 0.847, 0.647, 1.0);  // #e4d8a5
uniform vec4 shallow_color : source_color = vec4(0.50, 0.78, 0.72, 1.0);
uniform vec4 deep_color : source_color = vec4(0.09, 0.36, 0.49, 1.0);
group_uniforms;

group_uniforms rock;
uniform vec4 rock_grey : source_color = vec4(0.357, 0.384, 0.361, 1.0);   // #5b625c ridge
uniform vec4 rock_sandstone : source_color = vec4(0.62, 0.36, 0.22, 1.0); // between mesa tones, lower sat
uniform float slope_rock_start : hint_range(0.0, 1.0) = 0.30; // 1 - normal.y where rock begins
uniform float slope_rock_full : hint_range(0.0, 1.0) = 0.55;
group_uniforms;

group_uniforms detail;
uniform float detail_strength : hint_range(0.0, 2.0) = 1.0;
uniform float macro_strength : hint_range(0.0, 1.0) = 0.12;
uniform float fine_fade_start = 120.0;   // metres: fine (1-5 m) detail fades out here...
uniform float fine_fade_end = 700.0;     // ...and is gone here
uniform float mid_fade_end = 4500.0;     // mid (10-40 m) detail gone here
group_uniforms;

varying vec3 wpos;
varying vec3 wnorm;
varying float vdist;
varying vec4 biome; // CUSTOM0 is vertex-stage only

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

float fbm3(vec2 p) {
	return vnoise(p) * 0.55 + vnoise(p * 2.03 + 11.7) * 0.3 + vnoise(p * 4.1 - 5.3) * 0.15;
}

// Ridged noise: thin dark lines where noise crosses 0.5 (crack network)
float cracks(vec2 p) {
	float n = abs(vnoise(p) - 0.5) * 2.0;
	float n2 = abs(vnoise(p * 2.7 + 3.1) - 0.5) * 2.0;
	return 1.0 - (1.0 - smoothstep(0.0, 0.10, n)) * 0.55 - (1.0 - smoothstep(0.0, 0.08, n2)) * 0.3;
}

vec3 srgb_to_linear(vec3 c) {
	return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnorm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	biome = CUSTOM0;
	vdist = length((MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
}

void fragment() {
	vec3 base = srgb_to_linear(COLOR.rgb);
	vec4 w = biome;
	float w_sand = w.r;
	float w_mesa = w.g;
	float w_rock = w.b;
	float w_forest = w.a;
	float w_meadow = clamp(1.0 - w_sand - w_mesa - w_rock - w_forest, 0.0, 1.0);

	float fine = (1.0 - smoothstep(fine_fade_start, fine_fade_end, vdist)) * detail_strength;
	float mid = (1.0 - smoothstep(fine_fade_end, mid_fade_end, vdist)) * detail_strength;
	vec2 p = wpos.xz;
	float slope = 1.0 - clamp(wnorm.y, 0.0, 1.0);

	// --- Macro variation (200-800 m): never fades, kills the flat look from altitude
	float macro = fbm3(p / 520.0) - 0.5;
	float macro2 = vnoise(p / 230.0 + 7.0) - 0.5;
	float macro_k = 1.0 + (macro * 1.4 + macro2 * 0.6) * macro_strength;

	// --- Meadow: clumps (~12 m) + speckle (~1.5 m)
	float clump = vnoise(p / 12.0) - 0.5;
	float speck = hash(floor(p / 1.5)) - 0.5;
	float meadow_k = 1.0 + clump * 0.22 * mid + speck * 0.16 * fine;

	// --- Forest: canopy blobs (~7 m crowns) with dark gaps, fades to a soft mottling far away
	float crowns = smoothstep(0.35, 0.7, vnoise(p / 7.0));
	float canopy_far = vnoise(p / 40.0) - 0.5;
	float forest_k = mix(1.0, 0.72 + crowns * 0.38, mid) + canopy_far * 0.18;

	// --- Sand: wind ripples (~2.5 m, along the dune wind axis) + streaks (~30 m)
	vec2 wind = vec2(0.85, 0.52);
	float u = dot(p, wind);
	float v = dot(p, vec2(-wind.y, wind.x));
	float warp = vnoise(p / 9.0) * 3.0;
	float ripple = sin(u * 2.5 + warp + sin(v * 0.35) * 0.8);
	float streak = vnoise(vec2(u / 60.0, v / 14.0)) - 0.5;
	float sand_k = 1.0 + ripple * 0.05 * fine + streak * 0.12 * mid;

	// --- Mesa: horizontal strata bands on height, slightly wobbling, + weathered speckle
	float band_y = wpos.y + (vnoise(p / 35.0) - 0.5) * 6.0;
	float strata = sin(band_y * 0.9) * 0.5 + sin(band_y * 2.3 + 1.0) * 0.25;
	float mesa_k = 1.0 + strata * 0.10 * mid + speck * 0.08 * fine;

	// --- Rock: triplanar crack network, so steep faces do not stretch
	vec3 bw = pow(abs(wnorm), vec3(4.0));
	bw /= (bw.x + bw.y + bw.z);
	float cr = cracks(wpos.zy / 6.0) * bw.x + cracks(wpos.xz / 6.0) * bw.y + cracks(wpos.xy / 6.0) * bw.z;
	float rock_mott = fbm3(p / 18.0) - 0.5;
	float rock_k = 1.0 + rock_mott * 0.2 * mid;
	rock_k *= mix(1.0, cr, mid);

	float k = meadow_k * w_meadow + forest_k * w_forest + sand_k * w_sand + mesa_k * w_mesa + rock_k * w_rock;
	vec3 col = base * k;

	// --- Slope rock: steep faces show bare rock in every biome (sandstone on the desert)
	float steep = smoothstep(slope_rock_start, slope_rock_full, slope + (rock_mott * 0.15));
	vec3 slope_tint = mix(srgb_to_linear(rock_grey.rgb) * 1.25, srgb_to_linear(rock_sandstone.rgb),
			clamp(w_sand + w_mesa, 0.0, 1.0));
	col = mix(col, slope_tint * rock_k, steep * (1.0 - w_rock));

	col *= macro_k;

	// --- Shoreline per pixel (was per vertex: ~40 m cells made a staircase): beach band, wet sand, shallows
	float edge_n = (vnoise(p / 25.0) - 0.5) * 1.6;
	float h = wpos.y + edge_n;
	vec3 beach = mix(srgb_to_linear(beach_green.rgb), srgb_to_linear(beach_desert.rgb), step(0.005, w_sand + w_mesa));
	beach *= sand_k;
	beach *= mix(0.78, 1.0, smoothstep(0.8, 1.6, h)); // damp sand at the waterline
	col = mix(beach, col, smoothstep(1.2, 5.5, h));
	vec3 water = mix(srgb_to_linear(shallow_color.rgb), srgb_to_linear(deep_color.rgb), smoothstep(0.0, 12.0, -wpos.y));
	col = mix(water, col, smoothstep(-1.2, 0.35, wpos.y));

	ALBEDO = col;
	ROUGHNESS = mix(0.9, 0.82, steep) + w_sand * 0.05;
	SPECULAR = 0.3;
	METALLIC = 0.0;
}
