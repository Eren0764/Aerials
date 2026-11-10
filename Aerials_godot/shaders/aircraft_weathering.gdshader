// Aircraft weathering layer (art bible s3/s5/s8). Keeps the source albedo texture/colour, metallic, roughness
// and adds object-space wear. Total albedo change is capped (~15-20%) so insignia in the albedo stay readable.
// Object space = mesh-local space of each GLB node; +Z = nose.
shader_type spatial;

uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D albedo_texture : source_color, filter_linear_mipmap, repeat_enable, hint_default_white;
uniform float metallic_base : hint_range(0.0, 1.0) = 0.1;
uniform float roughness_base : hint_range(0.0, 1.0) = 0.6;

group_uniforms weathering;
uniform float strength : hint_range(0.0, 1.0) = 1.0;
uniform float sun_fade : hint_range(0.0, 0.3) = 0.12;       // lighten + dull upper surfaces
uniform float panel_dark : hint_range(0.0, 0.3) = 0.20;     // panel-line darkening
uniform float chip_amount : hint_range(0.0, 0.3) = 0.18;    // bare-metal chips
uniform float exhaust_amount : hint_range(0.0, 0.4) = 0.38; // soot streaks aft of the stacks
uniform float exhaust_z_front = 2.9;                        // stack position along the nose axis
uniform float exhaust_length = 3.2;                         // streak length aft of the stacks
uniform float panel_scale = 0.9;                            // panel grid cells per metre
group_uniforms;

varying vec3 opos;
varying vec3 onrm;

float hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
				   mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
			   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
				   mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void vertex() {
	opos = VERTEX;
	onrm = NORMAL;
}

void fragment() {
	vec4 tex = texture(albedo_texture, UV) * albedo_color;
	vec3 n = normalize(onrm);
	vec3 albedo = tex.rgb;
	float rough = roughness_base;
	float metal = metallic_base;

	float broad = vnoise(opos * 1.3);          // large blotches
	float fine = vnoise(opos * 9.0);           // fine grain

	// Sun fade: upper surfaces bleach slightly, patchy
	float up = smoothstep(0.2, 0.9, n.y);
	albedo = mix(albedo, albedo * 0.6 + vec3(0.40), up * sun_fade * (0.6 + 0.8 * broad) * strength);
	rough += up * 0.08 * broad * strength;

	// Panel lines: thin grid on the surface plane facing most away from the normal
	vec3 g = abs(fract(opos * panel_scale) - 0.5);
	vec3 aw = abs(n);
	float d = aw.y > 0.6 ? min(g.x, g.z) : (aw.x > 0.6 ? min(g.y, g.z) : min(g.x, g.y));
	float line = 1.0 - smoothstep(0.0, 0.045, d);
	albedo *= 1.0 - line * panel_dark * (0.5 + fine) * strength;

	// Chipping: bare metal flecks, denser on the wing-root / walkway zone (|x| small, upper surface)
	float root = smoothstep(2.8, 0.8, abs(opos.x)) * up;
	float chip = smoothstep(0.80 - 0.10 * root, 0.90 - 0.10 * root, vnoise(opos * 22.0) * 0.6 + fine * 0.4);
	albedo = mix(albedo, vec3(0.55, 0.55, 0.56), chip * chip_amount * strength * 3.0);
	metal = mix(metal, 0.9, chip * strength);
	rough = mix(rough, 0.35, chip * strength);

	// Exhaust staining: streaks running aft from the stacks on the upper fuselage sides
	float aft = clamp((exhaust_z_front - opos.z) / exhaust_length, 0.0, 1.0);
	float region = step(0.0, exhaust_z_front - opos.z + 0.4) * smoothstep(1.2, 0.5, abs(opos.x)) * smoothstep(-0.3, 0.3, opos.y);
	float side = smoothstep(0.15, 0.6, abs(n.x));
	float streak = vnoise(vec3(opos.x * 14.0, opos.y * 6.0, opos.z * 1.2));
	float soot = region * side * (1.0 - aft) * smoothstep(0.35, 0.62, streak) * exhaust_amount * strength;
	albedo = mix(albedo, vec3(0.05, 0.045, 0.04), soot * 2.0);
	rough = mix(rough, 0.85, soot * 2.0);

	ALBEDO = albedo;
	METALLIC = clamp(metal, 0.0, 1.0);
	ROUGHNESS = clamp(rough + (fine - 0.5) * 0.10 * strength, 0.04, 1.0);
}
