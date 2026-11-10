// Airfield ground (art bible Section 6: weathering, not dirt).
// apron = false: runway. The markings texture (Airfields._make_runway_texture) only supplies the paint
//   mask; asphalt is sun-faded procedurally, paint is worn, a darker oil line runs down the centre and
//   rubber deposits darken both touchdown zones along the main-gear lanes.
// apron = true: concrete slabs (world-aligned joints, airfields are rotated in 90 degree steps) with
//   per-slab tone, oil stains and faint large-scale weathering.
// High-frequency terms fade by their screen footprint (fwidth), so nothing shimmers from altitude.
// shortcut: all wear is procedural value noise, upgrade to authored decals if the art pipeline ever
// provides them (per-nation kits arrive with the faction port).
// Target: Forward+ desktop, 1 texture sample (runway) + ~10 value-noise taps per pixel.
// `apron` is a uniform branch (coherent per draw), so it does not diverge within a wave.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform bool apron = false;
uniform sampler2D markings : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec2 size_m = vec2(48.0, 650.0);                              // runway plane size (UV -> metres)
uniform vec4 asphalt : source_color = vec4(0.19, 0.20, 0.205, 1.0);    // sun-faded asphalt
uniform vec4 paint : source_color = vec4(0.84, 0.83, 0.79, 1.0);       // faded off-white paint
uniform vec4 concrete : source_color = vec4(0.54, 0.553, 0.561, 1.0);  // #8a8d8f runway concrete (Section 4)
uniform float tyre_strength : hint_range(0.0, 1.0) = 0.55;
uniform float stain_strength : hint_range(0.0, 1.0) = 0.45;
uniform float slab_size = 6.0;

varying vec3 wpos;

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

float fbm(vec2 p) {
	return vnoise(p) * 0.55 + vnoise(p * 2.03 + 11.7) * 0.3 + vnoise(p * 4.1 - 5.3) * 0.15;
}

// Noise of feature size `cell` metres, faded to its mean 0.5 once a pixel covers ~half a feature
float aa_noise(vec2 p, float cell, float fp) {
	return mix(0.5, vnoise(p / cell), 1.0 - smoothstep(0.25, 0.6, fp / cell));
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 w = wpos.xz;
	float fp = max(length(dFdx(w)), length(dFdy(w))); // metres per pixel
	vec3 col;
	float rough;
	if (apron) {
		vec2 cell = w / slab_size;
		vec2 id = floor(cell);
		// slab joints: thin dark lines, contrast gone once a pixel spans ~a quarter slab
		vec2 dj = min(fract(cell), 1.0 - fract(cell)) * slab_size;
		float jw = max(0.06, fp * 0.75);
		float joint = (1.0 - smoothstep(0.0, jw, min(dj.x, dj.y))) * (1.0 - smoothstep(0.5, 1.6, fp));
		float slab = hash(id) - 0.5;
		float weather = fbm(w / 30.0) - 0.5;
		col = concrete.rgb * (1.0 + slab * 0.10 * (1.0 - smoothstep(1.0, 4.0, fp)) + weather * 0.18);
		// oil stains: small drips (parking spots) and broad faint ones
		float drip = smoothstep(0.66, 0.86, aa_noise(w + 13.0, 3.0, fp));
		float broad = smoothstep(0.55, 0.8, vnoise(w / 11.0 + 7.0));
		float stain = clamp(drip * 0.8 + broad * 0.35, 0.0, 1.0) * stain_strength;
		col *= (1.0 - stain) * (1.0 - joint * 0.35);
		rough = mix(0.85, 0.6, drip * stain_strength);
	} else {
		vec2 m = UV * size_m;                       // metres: x across, y along
		float pm = max(length(dFdx(m)), length(dFdy(m)));
		float paint_mask = smoothstep(0.2, 0.6, texture(markings, UV).g);
		float macro = fbm(m / 25.0);                // sun-faded patches
		float grit = aa_noise(m * 1.0 + 3.0, 0.7, pm);
		col = asphalt.rgb * (0.8 + 0.4 * macro) * (0.92 + 0.16 * grit);
		// centreline oil drip
		float cx = abs(m.x - size_m.x * 0.5);
		col *= 1.0 - exp(-cx * cx / 2.9) * 0.18 * (0.5 + aa_noise(m * vec2(1.0, 0.1), 1.0, pm));
		// worn, sun-faded paint
		float wear = 0.5 + 0.4 * smoothstep(0.2, 0.8, vnoise(m / 2.5)) + 0.1 * aa_noise(m, 0.4, pm);
		col = mix(col, paint.rgb * (0.9 + 0.2 * macro), paint_mask * wear);
		// rubber deposits in both touchdown zones, densest just past the aiming point
		float e = min(UV.y, 1.0 - UV.y);
		float zone = smoothstep(0.07, 0.11, e) * (1.0 - smoothstep(0.2, 0.36, e)) * (1.0 - 0.5 * smoothstep(0.12, 0.34, e));
		float lanes = clamp(exp(-pow((cx - 3.5) / 2.4, 2.0)) + 0.55 * exp(-cx * cx / 2.0), 0.0, 1.0);
		float streak = aa_noise(vec2(m.x * 1.8, m.y * 0.03) * 1.0, 1.0, max(pm * 1.8, 0.0));
		float tyre = zone * lanes * (0.35 + 0.65 * streak) * tyre_strength;
		col *= 1.0 - tyre;
		rough = mix(mix(0.88, 0.62, paint_mask * wear), 0.7, tyre);
	}
	ALBEDO = col;
	ROUGHNESS = rough;
	SPECULAR = 0.35;
}
