class_name PuffSystem
extends MultiMeshInstance3D
## Pooled sphere "puffs" drawn in one MultiMesh draw call. Ports the JS particle lists that move
## little unshaded spheres (impactParticles, tracerSmokeParticles; explosions / damage smoke reuse it later):
## each puff has position, velocity, gravity, life, a fading alpha and a growing radius.

var max_puffs := 400

var _pos := PackedVector3Array()
var _vel := PackedVector3Array()
var _color := PackedColorArray()     # rgb + starting alpha
var _life := PackedFloat32Array()
var _max_life := PackedFloat32Array()
var _radius := PackedFloat32Array()
var _grow_mult := PackedFloat32Array()  # radius multiplier per 60 fps frame (JS scale.multiplyScalar)
var _grow_add := PackedFloat32Array()   # radius added per second (JS userData.scale += dt * k)
var _gravity := PackedFloat32Array()
var _count := 0


func _init(capacity := 400, additive := false) -> void:
	max_puffs = capacity
	# Packed arrays are copied by value, so each one is resized directly
	_pos.resize(capacity)
	_vel.resize(capacity)
	_color.resize(capacity)
	_life.resize(capacity)
	_max_life.resize(capacity)
	_radius.resize(capacity)
	_grow_mult.resize(capacity)
	_grow_add.resize(capacity)
	_gravity.resize(capacity)

	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 8
	sphere.rings = 4

	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.vertex_color_use_as_albedo = true
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	if additive:
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sphere.material = mat

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = sphere
	mm.instance_count = capacity
	mm.visible_instance_count = 0
	multimesh = mm
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	top_level = true


func spawn(pos: Vector3, vel: Vector3, color: Color, radius: float, life: float,
		gravity := 0.0, grow_mult := 1.0, grow_add := 0.0) -> void:
	if _count >= max_puffs:
		return  # same as the JS caps: drop new puffs when full
	var i := _count
	_pos[i] = pos
	_vel[i] = vel
	_color[i] = color
	_life[i] = life
	_max_life[i] = life
	_radius[i] = radius
	_gravity[i] = gravity
	_grow_mult[i] = grow_mult
	_grow_add[i] = grow_add
	_count += 1


func clear() -> void:
	_count = 0
	multimesh.visible_instance_count = 0


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	var frames := dt * 60.0
	var i := 0
	while i < _count:
		_life[i] -= dt
		if _life[i] <= 0.0:
			_remove(i)
			continue
		var v := _vel[i]
		v.y -= _gravity[i] * dt
		_vel[i] = v
		_pos[i] += v * dt
		_radius[i] = _radius[i] * pow(_grow_mult[i], frames) + _grow_add[i] * dt
		var c := _color[i]
		c.a *= _life[i] / _max_life[i]
		multimesh.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ONE * _radius[i]), _pos[i]))
		multimesh.set_instance_color(i, c)
		i += 1
	multimesh.visible_instance_count = _count


# Swap-remove: move the last live puff into slot i
func _remove(i: int) -> void:
	var last := _count - 1
	if i != last:
		_pos[i] = _pos[last]
		_vel[i] = _vel[last]
		_color[i] = _color[last]
		_life[i] = _life[last]
		_max_life[i] = _max_life[last]
		_radius[i] = _radius[last]
		_grow_mult[i] = _grow_mult[last]
		_grow_add[i] = _grow_add[last]
		_gravity[i] = _gravity[last]
	_count = last
