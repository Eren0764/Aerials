class_name Clouds
extends MultiMeshInstance3D
## Cumulus layer: ports JS buildClouds (120 clusters of 5-10 puffs, drifting along +X, wrapping at the map edge)
## but as camera-facing soft puffs (cloud.gdshader) so they read as volumetric from 30-2800 m.
## Readability (art bible §1-2): clusters sit at 700-1800 m, density is capped and puffs fade out
## near the camera, so a plane 1.5 km away or one passing through a cloud is never hidden for long.

const MAX_CLUSTERS := 200
const PUFFS_PER_CLUSTER := 12
const ALT_MIN := 700.0
const ALT_MAX := 1800.0
const DRIFT_SPEED := 6.0  # JS 4-10 m/s per cloud
# shortcut: one shared drift speed and unsorted translucent puffs (order inside the MultiMesh is fixed), upgrade to per-cluster speed / depth-sorted chunks if popping or wrong overlap is visible

var _mat := ShaderMaterial.new()
var _drift := 0.0


func _init() -> void:
	name = "Clouds"
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF  # shortcut: no cloud shadows on sea/terrain, would need a projected shadow texture
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	_mat.shader = load("res://shaders/cloud.gdshader")
	_mat.set_shader_parameter("puff_tex", _make_puff_atlas())
	_mat.set_shader_parameter("map_min_x", World.MIN_X)
	_mat.set_shader_parameter("map_width", World.WORLD_WIDTH)
	quad.material = _mat
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = MAX_CLUSTERS * PUFFS_PER_CLUSTER
	multimesh = mm
	custom_aabb = AABB(Vector3(-30000, 0, -30000), Vector3(60000, 3000, 60000))
	_layout()


## Scatter clusters (fixed seed so every sortie shares the layout); coverage later only changes how many are drawn.
func _layout() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 0xC10D
	for c in MAX_CLUSTERS:
		var cx := rng.randf_range(World.MIN_X, World.MAX_X)
		var cz := rng.randf_range(World.MIN_Z, World.MAX_Z)
		var cy := ALT_MIN + pow(rng.randf(), 1.4) * (ALT_MAX - ALT_MIN)
		var span := rng.randf_range(0.7, 1.4)
		for p in PUFFS_PER_CLUSTER:
			var r := rng.randf_range(110.0, 230.0) * span
			# flat-ish base, heap in the middle: puffs further from centre sit lower
			var ox := rng.randf_range(-1.0, 1.0)
			var oz := rng.randf_range(-0.7, 0.7)
			var oy := (1.0 - absf(ox)) * rng.randf_range(0.0, 150.0) * span
			var pos := Vector3(cx + ox * 380.0 * span, cy + oy, cz + oz * 260.0 * span)
			var b := Basis.from_scale(Vector3(r * 2.0 * rng.randf_range(1.0, 1.3), r * 2.0, 1.0))
			var i := c * PUFFS_PER_CLUSTER + p
			multimesh.set_instance_transform(i, Transform3D(b, pos))
			multimesh.set_instance_custom_data(i, Color(float(rng.randi() % 4), 1.0 if rng.randf() < 0.5 else -1.0, rng.randf_range(0.92, 1.05), cx))


## Set cloud amount (0..1 of MAX_CLUSTERS) and sun-derived lighting. Called by World.apply_lighting_preset().
## sun_dir points towards the sun; shade is the unlit-side colour (sky/ambient tint).
func apply_preset(coverage: float, sun_color: Color, sun_dir: Vector3, shade: Color) -> void:
	multimesh.visible_instance_count = int(clampf(coverage, 0.0, 1.0) * MAX_CLUSTERS) * PUFFS_PER_CLUSTER
	_mat.set_shader_parameter("sun_color", sun_color)
	_mat.set_shader_parameter("sun_dir", sun_dir.normalized())
	_mat.set_shader_parameter("shade_color", shade)


func _process(delta: float) -> void:
	_drift = fmod(_drift + DRIFT_SPEED * delta, World.WORLD_WIDTH)
	_mat.set_shader_parameter("drift_x", _drift)


## 2x2 atlas of 128px puffs. RG = normal xy (0.5 = flat), B = thickness, A = coverage.
func _make_puff_atlas() -> ImageTexture:
	const S := 128
	var img := Image.create(S * 2, S * 2, true, Image.FORMAT_RGBA8)
	for tile in 4:
		var noise := FastNoiseLite.new()
		noise.seed = 11 + tile * 7
		noise.frequency = 0.018
		noise.fractal_octaves = 3
		var h := PackedFloat32Array()
		h.resize(S * S)
		for y in S:
			for x in S:
				var dx := (x + 0.5) / S * 2.0 - 1.0
				var dy := (y + 0.5) / S * 2.0 - 1.0
				var base := 1.0 - (dx * dx + dy * dy)
				h[y * S + x] = clampf(base + noise.get_noise_2d(x + tile * 40, y) * 0.9, 0.0, 1.0) * smoothstep(1.0, 0.75, sqrt(dx * dx + dy * dy))
		var ox := (tile % 2) * S
		var oy := (tile / 2) * S
		for y in S:
			for x in S:
				var hx := h[y * S + mini(x + 1, S - 1)] - h[y * S + maxi(x - 1, 0)]
				var hy := h[mini(y + 1, S - 1) * S + x] - h[maxi(y - 1, 0) * S + x]
				var nv := Vector3(-hx * 3.0, hy * 3.0, 1.0).normalized()  # image y points down
				var v := h[y * S + x]
				var a := smoothstep(0.02, 0.4, v)
				img.set_pixel(ox + x, oy + y, Color(nv.x * 0.5 + 0.5, nv.y * 0.5 + 0.5, smoothstep(0.0, 0.8, v), a))
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)
