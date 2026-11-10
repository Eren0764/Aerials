shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
// Camera-facing cloud puffs (one MultiMesh). Each puff samples a 2x2 atlas: RG = fake sphere-ish normal,
// B = thickness, A = coverage. Lit by the sun in view space, with a forward-scatter rim when the sun is ahead.
// INSTANCE_CUSTOM: x = atlas tile 0..3, y = x flip (+-1), z = brightness, w = cluster centre x (for drift wrap).

uniform sampler2D puff_tex : filter_linear_mipmap, repeat_disable;
uniform sampler2D depth_tex : hint_depth_texture, repeat_disable, filter_nearest;
uniform vec3 sun_dir = vec3(0.0, 1.0, 0.0);      // world space, pointing towards the sun
uniform vec3 sun_color : source_color = vec3(1.0);
uniform vec3 shade_color : source_color = vec3(0.55, 0.65, 0.8);
uniform float opacity = 0.85;                    // density cap: planes behind a puff stay visible
uniform float drift_x = 0.0;                     // metres travelled along +X, wrapped per cluster
uniform float map_min_x = -8880.0;
uniform float map_width = 17760.0;
uniform vec2 near_fade = vec2(150.0, 650.0);     // fully clear inside x, fully dense beyond y
uniform float soft_depth = 120.0;                // fade where a puff meets terrain

varying float v_depth;
varying vec3 v_custom;

void vertex() {
	vec3 c = MODEL_MATRIX[3].xyz;
	float cx = INSTANCE_CUSTOM.w;
	// Wrap the whole cluster around the map so puffs of one cloud never split.
	c.x += mod(cx - map_min_x + drift_x, map_width) - (cx - map_min_x);
	vec2 s = vec2(length(MODEL_MATRIX[0].xyz), length(MODEL_MATRIX[1].xyz));
	vec3 wp = c + INV_VIEW_MATRIX[0].xyz * VERTEX.x * s.x + INV_VIEW_MATRIX[1].xyz * VERTEX.y * s.y;
	vec4 vp = VIEW_MATRIX * vec4(wp, 1.0);
	v_depth = -vp.z;
	v_custom = INSTANCE_CUSTOM.xyz;
	POSITION = PROJECTION_MATRIX * vp;
}

void fragment() {
	vec2 uv = UV;
	uv.x = mix(uv.x, 1.0 - uv.x, step(v_custom.y, 0.0));
	float tile = floor(v_custom.x + 0.5);
	vec2 auv = (vec2(mod(tile, 2.0), floor(tile / 2.0)) + uv) * 0.5;
	vec4 t = texture(puff_tex, auv);
	vec2 nxy = (t.rg * 2.0 - 1.0) * vec2(sign(v_custom.y), 1.0);
	vec3 n = vec3(nxy, sqrt(max(1.0 - dot(nxy, nxy), 0.0)));
	vec3 l = normalize((VIEW_MATRIX * vec4(sun_dir, 0.0)).xyz);
	float lit = smoothstep(-0.5, 0.85, dot(n, l));
	lit *= mix(0.65, 1.0, t.b);                        // thick cores are self-shadowed a little
	vec3 col = mix(shade_color, sun_color, lit);
	// Silver lining: thin edges glow when looking towards the sun.
	col += sun_color * pow(clamp(-l.z, 0.0, 1.0), 3.0) * (1.0 - t.b) * 0.9;
	col *= v_custom.z;

	float d = textureLod(depth_tex, SCREEN_UV, 0.0).r;
	vec4 sv = INV_PROJECTION_MATRIX * vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	float scene_depth = -sv.z / sv.w;
	float soft = clamp((scene_depth - v_depth) / soft_depth, 0.0, 1.0);

	ALBEDO = col;
	ALPHA = t.a * opacity * soft * smoothstep(near_fade.x, near_fade.y, v_depth);
}
