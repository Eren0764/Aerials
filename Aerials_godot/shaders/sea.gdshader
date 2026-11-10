// Sea surface: procedural wave normals, depth-based shallow colour + shore foam,
// sky-radiance reflection (fresnel via SPECULAR) and a clamped custom sun glint.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back, shadows_disabled;

uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;

group_uniforms colors;
uniform vec4 deep_color : source_color = vec4(0.086, 0.357, 0.494, 1.0);     // #165b7e
uniform vec4 shallow_color : source_color = vec4(0.502, 0.780, 0.722, 1.0);  // ~#80c7b8
uniform vec4 foam_color : source_color = vec4(0.92, 0.96, 0.96, 1.0);
group_uniforms;

group_uniforms glint;
uniform float glint_strength : hint_range(0.0, 1.0) = 0.5;   // hard cap on sun glint brightness
uniform vec4 glint_tint : source_color = vec4(1.0, 0.9, 0.75, 1.0);
group_uniforms;

group_uniforms waves;
uniform float wave_scale : hint_range(0.2, 4.0) = 1.0;       // >1 = smaller, busier waves
uniform float wave_speed : hint_range(0.0, 3.0) = 1.0;
uniform float patchiness : hint_range(0.0, 1.0) = 0.0;       // cloud-shadow-like darkening
group_uniforms;

group_uniforms shore;
uniform float shallow_depth = 10.0;   // metres of water for full deep colour
uniform float foam_width = 2.5;       // metres of water depth covered by foam
group_uniforms;

varying vec3 wpos;
varying float vdist;

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

// Height gradient of 4 summed directional waves (gerstner-like slopes), world xz
vec2 wave_grad(vec2 p, float t) {
	vec2 g = vec2(0.0);
	// dir.xy, frequency, amplitude, speed
	const vec4 W0 = vec4(0.97, 0.26, 0.050, 1.00);
	const vec4 W1 = vec4(-0.60, 0.80, 0.083, 0.60);
	const vec4 W2 = vec4(0.35, -0.94, 0.141, 0.35);
	const vec4 W3 = vec4(-0.89, -0.46, 0.239, 0.20);
	g += W0.xy * W0.z * W0.w * cos(dot(p, W0.xy) * W0.z + t * 1.1);
	g += W1.xy * W1.z * W1.w * cos(dot(p, W1.xy) * W1.z + t * 1.5);
	g += W2.xy * W2.z * W2.w * cos(dot(p, W2.xy) * W2.z + t * 1.9);
	g += W3.xy * W3.z * W3.w * cos(dot(p, W3.xy) * W3.z + t * 2.4);
	return g;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vdist = length((MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
}

void fragment() {
	float t = TIME * wave_speed;
	vec2 p = wpos.xz * wave_scale;

	// Calm waves with distance: no shimmer toward the horizon
	float calm = 1.0 - smoothstep(150.0, 1500.0, vdist);
	vec2 g = wave_grad(p, t) * 0.9;
	// fine ripples, only close up
	float near = 1.0 - smoothstep(10.0, 150.0, vdist);
	g += (vec2(vnoise(p * 0.5 + t * vec2(0.6, 0.3)), vnoise(p * 0.5 - t * vec2(0.4, 0.5) + 17.0)) - 0.5) * 0.8 * near;
	g *= mix(0.12, 1.0, calm);
	vec3 n_world = normalize(vec3(-g.x, 1.0, -g.y));
	NORMAL = normalize((VIEW_MATRIX * vec4(n_world, 0.0)).xyz);

	// Water thickness along the view ray from the depth texture
	float d = texture(depth_tex, SCREEN_UV).x;
	vec4 v = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	float scene_z = -v.z / max(v.w, 1e-6);
	if (d <= 0.0) scene_z = 1e5; // sky behind the plane
	float thick = max(scene_z - (-VERTEX.z), 0.0);
	// ray length -> approx vertical depth, so shore bands keep their width at grazing angles
	thick *= clamp(abs((INV_VIEW_MATRIX * vec4(VIEW, 0.0)).y), 0.05, 1.0);

	float depth_k = 1.0 - exp(-thick / shallow_depth);
	vec3 col = mix(shallow_color.rgb, deep_color.rgb, depth_k);

	// Wide-area depth hint when the depth buffer is far away: keep colour deep
	// Foam: shoreline band + sparse whitecaps on steep slopes
	float fw = foam_width * (1.0 + min(vdist * 0.0006, 1.5));
	float fn = vnoise(wpos.xz * 0.9 * wave_scale + t * 0.3) * 0.6 + vnoise(wpos.xz * 3.1 + t * 0.5) * 0.4;
	float shore_foam = (1.0 - smoothstep(0.0, fw, thick + (fn - 0.5) * fw * 0.8)) ;
	float crest = smoothstep(0.5, 0.8, length(g) * 3.0 + fn * 0.2) * 0.2 * calm;
	float foam = clamp(shore_foam + crest, 0.0, 1.0);

	// Cloud-shadow-like patches (large noise, drifting slowly)
	float patch = vnoise(wpos.xz * 0.0012 + TIME * 0.004);
	col *= 1.0 - patchiness * 0.55 * smoothstep(0.35, 0.65, patch);

	ALBEDO = mix(col * 1.0, foam_color.rgb, foam);
	METALLIC = 0.0;
	ROUGHNESS = mix(0.06, 0.8, foam);
	SPECULAR = mix(0.32, 0.1, foam);
	// Shallow water is see-through so the seabed shows; foam is opaque
	ALPHA = clamp(max(mix(0.6, 0.97, smoothstep(0.0, 3.0, thick)), foam), 0.0, 1.0);
}

// Custom light: soft diffuse + sun glint with a hard brightness cap (never blows out to white)
void light() {
	DIFFUSE_LIGHT += ATTENUATION * LIGHT_COLOR * max(dot(NORMAL, LIGHT), 0.0) * 0.35 / PI;
	vec3 h = normalize(LIGHT + VIEW);
	float nh = max(dot(NORMAL, h), 0.0);
	float spec = pow(nh, 220.0) * 6.0 + pow(nh, 60.0) * 0.03; // tight core + broad sheen
	spec = 1.0 - exp(-spec);                                   // soft clamp to <1
	SPECULAR_LIGHT += spec * glint_strength * glint_tint.rgb * LIGHT_COLOR * ATTENUATION;
}
