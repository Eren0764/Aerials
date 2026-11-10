// Weathered building surface for the shared airfield kit (art bible Section 6: sun-faded paint,
// oxidation runoff, no dirt). Used by Airfields for hangar walls, hangar roofs and the tower.
// All coordinates are model space, so the pattern sticks to the building; NODE_POSITION_WORLD gives
// each instance its own tone. Fine terms fade with screen footprint (fwidth) to avoid shimmer.
//   ribs   = corrugation stripes along rib_axis (0 spacing = off)
//   boards = board-formed concrete bands along up_axis (0 spacing = off)
//   streaks = vertical runoff stretched along up_axis
// shortcut: albedo/roughness/metal variation only, no normal perturbation; upgrade to a corrugation
// normal map if close-up hangar shots ever need real ridges.
// Target: Forward+ desktop, no texture samples, ~5 value-noise taps per pixel; the rib/board
// branches test uniforms (coherent per draw).
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform vec4 albedo : source_color = vec4(0.28, 0.33, 0.41, 1.0);
uniform float roughness : hint_range(0.0, 1.0) = 0.6;
uniform float metallic : hint_range(0.0, 1.0) = 0.0;
uniform float rough_var : hint_range(0.0, 0.5) = 0.15;   // +- roughness from weathering
uniform float tint_var : hint_range(0.0, 0.3) = 0.08;    // per-instance tone spread
uniform vec3 rib_axis = vec3(0.0, 1.0, 0.0);
uniform float rib_spacing = 0.0;
uniform float rib_strength : hint_range(0.0, 0.3) = 0.08;
uniform vec3 up_axis = vec3(0.0, 1.0, 0.0);
uniform vec3 across_axis = vec3(1.0, 0.0, 1.0);
uniform float streak_strength : hint_range(0.0, 0.5) = 0.12;
uniform float board_spacing = 0.0;

varying vec3 lpos;

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

void vertex() {
	lpos = VERTEX;
}

void fragment() {
	float h = dot(lpos, up_axis);
	float u = dot(lpos, across_axis);
	float inst = hash(NODE_POSITION_WORLD.xz * 0.013) - 0.5;
	// sun-faded blotches (~5 m)
	float blotch = vnoise(vec2(u, h) / 5.0 + inst * 17.0);
	vec3 col = albedo.rgb * (1.0 + inst * 2.0 * tint_var) * (0.9 + 0.2 * blotch);

	if (rib_spacing > 0.0) {
		float c = dot(lpos, rib_axis) / rib_spacing;
		float aa = 1.0 - smoothstep(0.25, 0.6, fwidth(c));
		col *= 1.0 + sin(c * TAU) * rib_strength * aa;
	}
	if (board_spacing > 0.0) {
		float c = h / board_spacing;
		float aa = 1.0 - smoothstep(0.2, 0.5, fwidth(c));
		float seam = 1.0 - smoothstep(0.0, 0.08, min(fract(c), 1.0 - fract(c)));
		float grain = vnoise(vec2(u * 1.5, c * 3.0 + 5.0));
		col *= 1.0 - (seam * 0.10 + (grain - 0.5) * 0.08) * aa;
	}
	// runoff streaks: narrow across, long down the face
	float sfw = fwidth(u * 0.8);
	float streak = mix(0.5, vnoise(vec2(u * 0.8, h * 0.06) + inst * 9.0), 1.0 - smoothstep(0.25, 0.6, sfw));
	col *= 1.0 - streak_strength * smoothstep(0.45, 0.9, streak);

	ALBEDO = col;
	ROUGHNESS = clamp(roughness + (blotch - 0.5) * 2.0 * rough_var + streak * 0.05, 0.05, 1.0);
	METALLIC = metallic * (0.8 + 0.4 * blotch);
}
