class_name Ballistics
extends Node3D
## Shared bullet simulation, ported from the bullet half of updateWeapons() in game.js:
## gravity drop, segment-sweep hit tests (no tunnelling), ground / sea impacts, tracer smoke,
## pooled tracers and muzzle flashes. Every gun (player, wingman, AI, AA) fires through fire().
##
## Bullet targets join the "bullet_targets" group and implement:
##   bullet_team() -> String                         ("friendly" / "enemy"; same team never hits)
##   bullet_hit_test(p0: Vector3, p1: Vector3) -> Dictionary   ({} on miss, else {"module": String, "point": Vector3})
##   take_bullet_hit(damage: float, module: String, point: Vector3, shooter: Node3D) -> void
## Aircraft can answer bullet_hit_test with Ballistics.aircraft_hit_test(self, p0, p1).

signal target_hit(target: Node3D, module: String, point: Vector3, shooter: Node3D)
signal exploded(position: Vector3, scale: float)  # GameAudio

const MAX_ACTIVE_BULLETS := 180
const BULLET_GRAVITY := 6.0   # m/s², flat arcade trajectory
const BULLET_LIFE := 2.8      # s (~2200 m)
const SMOKE_INTERVAL := 0.022
const IMPACT_GRAVITY := World.GRAVITY * 1.5
const TARGET_GROUP := "bullet_targets"
const DUST_COLORS: Array[Color] = [Color("92400e"), Color("b45309"), Color("78350f"), Color("a16207")]


class Bullet:
	var pos: Vector3
	var vel: Vector3
	var life: float
	var damage: float
	var length: float
	var color: Color
	var team: String
	var shooter: Node3D
	var smoke_timer: float


var impacts: PuffSystem
var tracer_smoke: PuffSystem
var debris: PuffSystem
var damage_smoke: PuffSystem
var _bullets: Array[Bullet] = []
var _streaks: MultiMeshInstance3D
var _heads: MultiMeshInstance3D
var _flashes: Array[Node3D] = []
var _flash_life := PackedFloat32Array()


func _ready() -> void:
	add_to_group("ballistics")
	process_priority = 5  # after aircraft have fired this frame, before the camera
	impacts = PuffSystem.new(180)
	impacts.name = "Impacts"
	add_child(impacts)
	tracer_smoke = PuffSystem.new(120)
	tracer_smoke.name = "TracerSmoke"
	add_child(tracer_smoke)
	debris = PuffSystem.new(600)
	debris.name = "ExplosionDebris"
	add_child(debris)
	damage_smoke = PuffSystem.new(700)
	damage_smoke.name = "DamageSmoke"
	add_child(damage_smoke)
	_build_tracer_meshes()
	_build_muzzle_flashes()


# =====================================================================================
# Firing
# =====================================================================================

func fire(muzzle: Vector3, velocity: Vector3, damage: float, tracer_length: float,
		tracer_color: Color, team: String, shooter: Node3D) -> void:
	var b: Bullet
	if _bullets.size() >= MAX_ACTIVE_BULLETS:
		b = _bullets.pop_front()  # recycle the oldest, like activeBullets.shift()
	else:
		b = Bullet.new()
	b.pos = muzzle
	b.vel = velocity
	b.life = BULLET_LIFE
	b.damage = damage
	b.length = tracer_length
	b.color = tracer_color
	b.team = team
	b.shooter = shooter
	b.smoke_timer = 0.0
	_bullets.append(b)


## Starburst at the muzzle, aligned with the aircraft, ~3 frames long
func muzzle_flash(pos: Vector3, aircraft_basis: Basis) -> void:
	var idx := _flash_life.find(0.0)
	if idx < 0:
		idx = 0
	var f := _flashes[idx]
	var s := randf_range(0.85, 1.30)
	# Local spin about the nose axis + random size (right-multiplying = local space)
	var b := aircraft_basis * Basis(Vector3.BACK, randf() * TAU) * Basis.from_scale(Vector3(s, s, s * randf_range(1.0, 1.3)))
	f.transform = Transform3D(b, pos)
	f.visible = true
	_flash_life[idx] = 0.045


func clear() -> void:
	_bullets.clear()
	impacts.clear()
	tracer_smoke.clear()
	debris.clear()
	damage_smoke.clear()
	for i in _flashes.size():
		_flashes[i].visible = false
		_flash_life[i] = 0.0
	_streaks.multimesh.visible_instance_count = 0
	_heads.multimesh.visible_instance_count = 0


# =====================================================================================
# Simulation
# =====================================================================================

func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)

	for i in _flashes.size():
		if _flash_life[i] > 0.0:
			_flash_life[i] = maxf(0.0, _flash_life[i] - dt)
			if _flash_life[i] == 0.0:
				_flashes[i].visible = false

	var targets := get_tree().get_nodes_in_group(TARGET_GROUP)
	var limit := World.WORLD_WIDTH * 0.95
	var i := _bullets.size() - 1
	while i >= 0:
		var b := _bullets[i]
		var prev := b.pos
		b.vel.y -= BULLET_GRAVITY * dt
		b.pos += b.vel * dt
		b.life -= dt

		b.smoke_timer += dt
		if b.smoke_timer >= SMOKE_INTERVAL:
			b.smoke_timer = 0.0
			tracer_smoke.spawn(b.pos, Vector3.ZERO, Color("e2e8f0", 0.35), 0.22, 0.65, 0.0, 1.0, 1.5)

		if _hit_targets(b, prev, targets) or _hit_surface(b, prev) \
				or b.life <= 0.0 or absf(b.pos.x) > limit or absf(b.pos.z) > limit:
			_bullets.remove_at(i)
		i -= 1

	_draw_tracers()


func _hit_targets(b: Bullet, prev: Vector3, targets: Array[Node]) -> bool:
	for t in targets:
		if t == b.shooter or t.bullet_team() == b.team:
			continue
		var hit: Dictionary = t.bullet_hit_test(prev, b.pos)
		if not hit.is_empty():
			t.take_bullet_hit(b.damage, hit.module, hit.point, b.shooter)
			target_hit.emit(t, hit.module, hit.point, b.shooter)
			return true
	return false


# Ground / sea strike, with the exact crossing point interpolated along the last step
func _hit_surface(b: Bullet, prev: Vector3) -> bool:
	var surface_y := maxf(World.SEA_LEVEL, World.get_terrain_height(b.pos.x, b.pos.z))
	if b.pos.y > surface_y:
		return false
	var dy := prev.y - b.pos.y
	var frac := clampf((prev.y - surface_y) / dy, 0.0, 1.0) if dy > 0.001 else 1.0
	var hx := lerpf(prev.x, b.pos.x, frac)
	var hz := lerpf(prev.z, b.pos.z, frac)
	spawn_impact(Vector3(hx, surface_y, hz), World.get_terrain_height(hx, hz) <= World.SEA_LEVEL, b.damage)
	return true


## Water geyser or dust plume + ricochet sparks (spawnBulletImpact)
func spawn_impact(p: Vector3, is_water: bool, caliber_damage: float) -> void:
	var heavy := caliber_damage > 10.0
	var count := 4 if heavy else 3
	if is_water:
		for k in count:
			impacts.spawn(p + Vector3(randf_range(-0.3, 0.3), 0.1, randf_range(-0.3, 0.3)),
					Vector3(randf_range(-1.75, 1.75), 14.0 + randf() * (14.0 if heavy else 8.0), randf_range(-1.75, 1.75)),
					Color("ffffff", 0.85) if k == 0 else Color("bae6fd", 0.85),
					0.65 if heavy else 0.45, randf_range(0.70, 0.95), IMPACT_GRAVITY, 1.02)
	else:
		var spread := 8.0 if heavy else 5.0
		for k in count:
			var c: Color = DUST_COLORS.pick_random()
			c.a = 0.85
			impacts.spawn(p + Vector3(randf_range(-0.4, 0.4), 0.2, randf_range(-0.4, 0.4)),
					Vector3(randf_range(-0.5, 0.5) * spread, 4.0 + randf() * spread, randf_range(-0.5, 0.5) * spread),
					c, 0.75 if heavy else 0.50, randf_range(0.85, 1.2), IMPACT_GRAVITY, 1.02)
		for s in 2:
			impacts.spawn(p + Vector3(0, 0.15, 0),
					Vector3(randf_range(-11.0, 11.0), 6.0 + randf() * 12.0, randf_range(-11.0, 11.0)),
					Color(3.0, 2.8, 1.6, 0.95), 0.12, 0.28, IMPACT_GRAVITY, 1.02)


## Fireball debris burst (spawnExplosionAt): red / amber / soot chunks thrown out and falling
func explosion_at(p: Vector3, scale := 1.0) -> void:
	exploded.emit(p, scale)
	var colors := [Color(3.0, 0.55, 0.55), Color(3.0, 1.6, 0.2), Color("1f2937")]
	for i in roundi(22.0 * scale):
		debris.spawn(p,
				Vector3(randf_range(-27.5, 27.5) * scale, (randf() * 35.0 + 10.0) * scale, randf_range(-27.5, 27.5) * scale),
				colors[i % 3], 0.4 * scale, randf_range(2.2, 3.0), World.GRAVITY, 0.97)


## Grey-black trail pouring from the engine below 30% HP (emitDamageSmoke).
## Returns the emitter's updated timer; each aircraft keeps its own.
func emit_damage_smoke(plane: Node3D, hp_ratio: float, dt: float, timer: float) -> float:
	if hp_ratio >= 0.30 or hp_ratio <= 0.0:
		return timer
	var critical := hp_ratio < 0.15
	var interval := 0.025 if critical else 0.045
	timer += dt
	var xf := plane.global_transform
	while timer >= interval:
		timer -= interval
		var shade := randf_range(0.10, 0.16) if critical else randf_range(0.22, 0.30)
		var offset := xf.basis * Vector3(randf_range(-0.4, 0.4), randf_range(-0.3, 0.3), 1.5)
		damage_smoke.spawn(xf.origin + offset, Vector3.ZERO, Color(shade, shade, shade, 0.75 if critical else 0.6),
				2.1 if critical else 1.6, 3.6 if critical else 2.8, 0.0, 1.0, 2.5 if critical else 2.0)
	return timer


## Hot-barrel smoke wisp / generic small smoke puff
func smoke_at(p: Vector3) -> void:
	tracer_smoke.spawn(p, Vector3.ZERO, Color("e2e8f0", 0.35), 0.22, 0.65, 0.0, 1.0, 1.5)


# =====================================================================================
# Hit boxes
# =====================================================================================

static func closest_point_on_segment(p0: Vector3, p1: Vector3, target: Vector3) -> Vector3:
	var v := p1 - p0
	var len_sq := v.length_squared()
	if len_sq < 0.0001:
		return p0
	return p0 + v * clampf((target - p0).dot(v) / len_sq, 0.0, 1.0)


## Modular aircraft hitbox (engine / wing / fuselage) in the plane's local frame (+Z nose)
static func aircraft_hit_test(plane: Node3D, p0: Vector3, p1: Vector3) -> Dictionary:
	var center := plane.global_position
	var cp := closest_point_on_segment(p0, p1, center)
	if cp.distance_squared_to(center) >= 125.0:
		return {}
	var l := plane.global_basis.orthonormalized().transposed() * (cp - center)
	var module := ""
	if l.z > 1.3 and l.z < 4.5 and absf(l.x) < 1.1 and absf(l.y) < 1.1:
		module = "ENGINE"
	elif absf(l.x) >= 1.1 and absf(l.x) <= 6.2 and absf(l.y) < 1.0 and absf(l.z) < 2.2:
		module = "WING"
	elif absf(l.x) < 1.2 and absf(l.y) < 1.2 and absf(l.z) <= 5.0:
		module = "FUSELAGE"
	if module.is_empty():
		return {}
	return {"module": module, "point": cp}


# =====================================================================================
# Visuals: tracers (2 MultiMeshes) + muzzle flashes
# =====================================================================================

func _draw_tracers() -> void:
	var n := _bullets.size()
	var streak_mm := _streaks.multimesh
	var head_mm := _heads.multimesh
	for k in n:
		var b := _bullets[k]
		var dir := b.vel.normalized()
		var up := Vector3.RIGHT if absf(dir.y) > 0.999 else Vector3.UP
		var basis := Basis.looking_at(dir, up, true)  # +Z along the flight path, streak trails behind
		streak_mm.set_instance_transform(k, Transform3D(basis * Basis.from_scale(Vector3(1, 1, b.length)), b.pos))
		streak_mm.set_instance_color(k, b.color)
		head_mm.set_instance_transform(k, Transform3D(basis, b.pos))
		head_mm.set_instance_color(k, b.color)
	streak_mm.visible_instance_count = n
	head_mm.visible_instance_count = n


func _build_tracer_meshes() -> void:
	# Additive coloured glow (HDR so it blooms) + white-hot core, like the JS glow/core pair
	var glow := StandardMaterial3D.new()
	glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	glow.vertex_color_use_as_albedo = true
	glow.albedo_color = Color(1.5, 1.5, 1.5, 0.95)  # >1 = HDR, blooms; higher washes the tint to white
	glow.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glow.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	glow.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var core := StandardMaterial3D.new()
	core.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	core.albedo_color = Color(2.5, 2.5, 2.5)

	# Streak cylinders run from the head (z = 0) back to the tail (z = -1); scaled by tracer length
	var streak_mesh := ArrayMesh.new()
	var to_tail := Transform3D(Basis(Vector3.RIGHT, PI / 2.0), Vector3(0, 0, -0.5))
	_append_surface(streak_mesh, _cylinder(0.26, 0.20, 8), to_tail, glow)
	_append_surface(streak_mesh, _cylinder(0.08, 0.08, 6), to_tail, core)
	_streaks = _make_multimesh(streak_mesh, "TracerStreaks")

	var head_mesh := ArrayMesh.new()
	_append_surface(head_mesh, _sphere(0.38), Transform3D.IDENTITY, glow)
	_append_surface(head_mesh, _sphere(0.14), Transform3D.IDENTITY, core)
	_heads = _make_multimesh(head_mesh, "TracerHeads")


func _make_multimesh(mesh: Mesh, node_name: String) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = MAX_ACTIVE_BULLETS
	mm.visible_instance_count = 0
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mmi.top_level = true
	add_child(mmi)
	return mmi


func _build_muzzle_flashes() -> void:
	var outer := StandardMaterial3D.new()
	outer.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	outer.albedo_color = Color(4.0, 2.1, 0.0, 0.85)
	outer.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	outer.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	outer.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	outer.cull_mode = BaseMaterial3D.CULL_DISABLED
	var inner := outer.duplicate() as StandardMaterial3D
	inner.albedo_color = Color(4.0, 4.0, 4.0, 0.95)

	var quad := QuadMesh.new()
	quad.size = Vector2(0.55, 1.25)
	quad.center_offset = Vector3(0, 0, 0.625)  # base at the muzzle, protruding forward

	for n in 8:
		var group := Node3D.new()
		group.top_level = true
		group.visible = false
		add_child(group)
		for angle in [0.0, PI / 3.0, TAU / 3.0]:
			_flash_part(group, quad, outer, angle, Vector3.ONE)
			_flash_part(group, quad, inner, angle, Vector3(0.55, 0.75, 1.0))
		var core_sphere := MeshInstance3D.new()
		core_sphere.mesh = _sphere(0.18)
		core_sphere.material_override = inner
		core_sphere.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		group.add_child(core_sphere)
		_flashes.append(group)
	_flash_life.resize(8)


func _flash_part(group: Node3D, mesh: Mesh, mat: Material, angle: float, scl: Vector3) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.rotation.z = angle
	mi.scale = scl
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	group.add_child(mi)


func _append_surface(target: ArrayMesh, src: Mesh, xform: Transform3D, mat: Material) -> void:
	var st := SurfaceTool.new()
	st.append_from(src, 0, xform)
	st.commit(target)
	target.surface_set_material(target.get_surface_count() - 1, mat)


func _cylinder(top: float, bottom: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = 1.0
	c.radial_segments = segments
	c.rings = 1
	return c


func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = 8
	s.rings = 4
	return s
