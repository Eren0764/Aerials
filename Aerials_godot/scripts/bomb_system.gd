class_name BombSystem
extends Node3D
## Player bombs, ported from createSingleBombMesh / setupPlayerBellyBombs / dropPlayerBomb / updateBombs /
## detonateBomb / applyBombBlastDamage / initBombReticle / updateBombReticle in game.js:
##   B drops the next bomb from the belly rack (0.45 s between releases, not while parked);
##   bombs inherit the aircraft's velocity plus a 3.8 m/s push away from the belly, fall at World.GRAVITY
##   with light horizontal drag, and trail smoke. Impact: fireball, shockwave, crater or water geyser,
##   a rising smoke column, camera shake within 850 m, and blast damage within 75 m
##   (enemy aircraft 600, airfield tower / hangars / base integrity via Airfields.damage_airfield).
##   A yellow ring on the ground predicts where the next bomb will land.
## Rearmed by airfield service and on respawn (bomb_count / bomb_max live on the player).

signal released  # GameAudio: rack click + whoosh

const BLAST_RADIUS := 75.0
const RELEASE_COOLDOWN := 0.45
const SEPARATION_PUSH := 3.8
const DRAG := 0.035
const MAX_CRATERS := 80  # shortcut: the JS kept every crater forever; the oldest are recycled here

var player: PlayerAircraft
var enemies: EnemyDirector
var airfields: Airfields
var defenses: Defenses
var hud: Hud

var _ballistics: Ballistics
var _cooldown := 0.0
var _falling: Array[Dictionary] = []   # {node, vel, life, smoke}
var _effects: Array[Dictionary] = []   # {node, mat, t, life, scale, base_alpha}
var _craters: Array[Node3D] = []
var _belly: Array[Node3D] = []
var _belly_parent: Node3D
var _reticle: Node3D

static var _mats := {}


func _ready() -> void:
	_ballistics = get_tree().get_first_node_in_group("ballistics")
	if not InputMap.has_action("drop_bomb"):
		InputMap.add_action("drop_bomb")
		var ev := InputEventKey.new()
		ev.physical_keycode = KEY_B
		InputMap.action_add_event("drop_bomb", ev)
	_reticle = _build_reticle()
	add_child(_reticle)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("drop_bomb"):
		drop()


## Fill the rack (airfield service / respawn)
func reload() -> void:
	player.bomb_count = player.bomb_max
	_cooldown = 0.0


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	_cooldown = maxf(0.0, _cooldown - dt)
	_sync_belly_bombs()
	_update_falling(dt)
	_update_effects(dt)
	_update_reticle()


# =====================================================================================
# Release (dropPlayerBomb)
# =====================================================================================

func drop() -> void:
	if player.is_crashed:
		return
	if player.is_on_ground and player.airspeed < 45.0:
		hud.show_banner("CANNOT RELEASE BOMBS WHILE STATIONARY ON RUNWAY!", false)
		return
	if player.bomb_count <= 0:
		hud.show_banner("NO BOMBS REMAINING — LAND AT FRIENDLY AIRFIELD TO RELOAD!", false)
		return
	if _cooldown > 0.0:
		return
	_cooldown = RELEASE_COOLDOWN

	# The last loaded slot is released first
	var rack: Array = player.def.bomb_rack
	var slot: Vector3 = rack[mini(rack.size(), player.bomb_count) - 1]
	var xf := player.global_transform.orthonormalized()
	var start := xf * slot
	player.bomb_count -= 1

	var vel := player.velocity if player.velocity.length_squared() > 1.0 else xf.basis.z * (player.airspeed / 3.6)
	vel += xf.basis * Vector3(0, -SEPARATION_PUSH, 0)

	var bomb := _build_bomb()
	bomb.transform = Transform3D(xf.basis, start)
	add_child(bomb)
	_falling.append({"node": bomb, "vel": vel, "life": 25.0, "smoke": 0.0})
	released.emit()

	if player.bomb_count > 0:
		hud.show_banner("BOMB RELEASED! (%d REMAINING)" % player.bomb_count, false)
	else:
		hud.show_banner("FINAL BOMB RELEASED! [LAND AT AIRFIELD TO RELOAD]", false)


func _update_falling(dt: float) -> void:
	var i := _falling.size() - 1
	while i >= 0:
		var b := _falling[i]
		var node: Node3D = b.node
		b.life -= dt
		if b.life <= 0.0:
			node.queue_free()
			_falling.remove_at(i)
			i -= 1
			continue
		var vel: Vector3 = b.vel
		vel.y -= World.GRAVITY * dt
		var drag := maxf(0.0, 1.0 - DRAG * dt)
		vel.x *= drag
		vel.z *= drag
		b.vel = vel
		node.position += vel * dt
		if vel.length() > 1.0:
			var d := vel.normalized()
			node.basis = Basis.looking_at(d, Vector3.RIGHT if absf(d.y) > 0.999 else Vector3.UP, true)
		b.smoke += dt
		if b.smoke >= 0.035:
			b.smoke = 0.0
			_ballistics.smoke_at(node.position)
		var ground := maxf(World.SEA_LEVEL, World.get_terrain_height(node.position.x, node.position.z))
		if node.position.y <= ground:
			_detonate(Vector3(node.position.x, ground, node.position.z))
			node.queue_free()
			_falling.remove_at(i)
		i -= 1


# =====================================================================================
# Impact (detonateBomb / applyBombBlastDamage)
# =====================================================================================

func _detonate(p: Vector3) -> void:
	_shockwave(p)
	_ballistics.explosion_at(p, 4.2)
	if p.y <= World.SEA_LEVEL + 1.5:
		_geyser(p)
	else:
		_crater(p)
	_smoke_plume(p)

	# Camera shake for nearby impacts
	var d := p.distance_to(player.global_position)
	if d < 850.0:
		player.guns.recoil_intensity = maxf(player.guns.recoil_intensity, 1.6 * (1.0 - d / 850.0))

	var hit_anything := false
	if defenses and defenses.bomb_blast(p, BLAST_RADIUS):
		hit_anything = true
	for ep in enemies.planes:
		if ep.is_alive and p.distance_to(ep.global_position) <= BLAST_RADIUS:
			ep.take_bullet_hit(600.0, "FUSELAGE", p, player)
			hit_anything = true
	for i in World.airports.size():
		var af: Dictionary = World.airports[i]
		if Vector2(p.x - af.x, p.z - af.z).length() <= af.length / 2.0 + BLAST_RADIUS + 120.0:
			hit_anything = true
			var grounded := 0  # teams that respawn here, for the base-destroyed banner
			for t in enemies.teams:
				if t.members[0].home_airfield == i:
					grounded += 1
			for ev in airfields.damage_airfield(i, p, BLAST_RADIUS, grounded):
				hud.show_banner(ev[0], ev[1])
	if hit_anything:
		hud.hit_marker(true)


func _shockwave(p: Vector3) -> void:
	var mat := _unshaded_alpha(Color(1.0, 0.4, 0.0, 0.9))
	var sphere := SphereMesh.new()
	sphere.radius = 4.0
	sphere.height = 8.0
	_spawn_effect(_mesh(sphere, mat, p), mat, 0.40, 8.5, 0.9, true)


func _geyser(p: Vector3) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("e0f2fe", 0.8)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.2
	var cone := CylinderMesh.new()
	cone.top_radius = 0.0
	cone.bottom_radius = 5.0
	cone.height = 32.0
	_spawn_effect(_mesh(cone, mat, p + Vector3(0, 16, 0)), mat, 1.2, 1.5, 0.8, false)


func _crater(p: Vector3) -> void:
	var disc := CylinderMesh.new()
	disc.top_radius = 7.5
	disc.bottom_radius = 7.5
	disc.height = 0.05
	disc.radial_segments = 16
	var mat := _unshaded_alpha(Color("171717", 0.85))
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var crater := _mesh(disc, mat, p + Vector3(0, 0.15, 0))
	_craters.append(crater)
	if _craters.size() > MAX_CRATERS:
		_craters.pop_front().queue_free()


# 8 dark puffs stacked into a column that rises, drifts and fades over ~12-16 s
func _smoke_plume(p: Vector3) -> void:
	for k in 8:
		var shade := 0.11 if k % 2 == 0 else 0.15
		_ballistics.damage_smoke.spawn(
				p + Vector3(randf_range(-8.0, 8.0), 2.0 + k * 3.5, randf_range(-8.0, 8.0)),
				Vector3(randf_range(2.0, 4.0), randf_range(3.5, 6.0), 0.0),
				Color(shade, shade * 0.95, shade * 0.9, 0.75), 3.5, randf_range(12.0, 16.0), 0.0, 1.003)


func _spawn_effect(node: MeshInstance3D, mat: StandardMaterial3D, life: float, max_scale: float, alpha: float, squash: bool) -> void:
	_effects.append({"node": node, "mat": mat, "t": 0.0, "life": life, "scale": max_scale, "alpha": alpha, "squash": squash})


# Grow fast then ease (sin curve) and fade out (updateShockwaves)
func _update_effects(dt: float) -> void:
	var i := _effects.size() - 1
	while i >= 0:
		var e := _effects[i]
		e.t += dt
		var progress: float = e.t / e.life
		var node: MeshInstance3D = e.node
		if progress >= 1.0:
			node.queue_free()
			_effects.remove_at(i)
		else:
			var s: float = 1.0 + (e.scale - 1.0) * sin(progress * PI * 0.5)
			node.scale = Vector3(s, s * (0.75 if e.squash else 1.0), s)
			(e.mat as StandardMaterial3D).albedo_color.a = e.alpha * (1.0 - progress)
		i -= 1


# =====================================================================================
# Belly rack + impact reticle
# =====================================================================================

# Bomb meshes on the belly; rebuilt when the aircraft model changes, hidden as bombs are released
func _sync_belly_bombs() -> void:
	if player.model != _belly_parent or not is_instance_valid(_belly_parent):
		_belly.clear()
		_belly_parent = player.model
		for slot in player.def.bomb_rack:
			var b := _build_bomb()
			b.position = slot
			_belly_parent.add_child(b)
			_belly.append(b)
	for i in _belly.size():
		_belly[i].visible = i < player.bomb_count


# Simulate the next bomb's fall (same physics, 0.08 s steps, up to 12 s) and park the ring there
func _update_reticle() -> void:
	if player.is_crashed or player.bomb_count <= 0 or player.is_on_ground:
		_reticle.visible = false
		return
	var xf := player.global_transform.orthonormalized()
	var vel := player.velocity if player.velocity.length_squared() > 1.0 else xf.basis.z * (player.airspeed / 3.6)
	vel += xf.basis * Vector3(0, -SEPARATION_PUSH, 0)
	var pos := xf.origin
	var step := 0.08
	var t := 0.0
	while t < 12.0:
		vel.y -= World.GRAVITY * step
		vel.x *= 1.0 - DRAG * step
		vel.z *= 1.0 - DRAG * step
		pos += vel * step
		var ground := maxf(World.SEA_LEVEL, World.get_terrain_height(pos.x, pos.z))
		if pos.y <= ground:
			_reticle.position = Vector3(pos.x, ground + 0.35, pos.z)
			var pulse := 1.0 + 0.08 * sin(Time.get_ticks_msec() * 0.007)
			_reticle.scale = Vector3(pulse, 1.0, pulse)
			_reticle.visible = true
			return
		t += step
	_reticle.visible = false


func _build_reticle() -> Node3D:
	var root := Node3D.new()
	root.name = "BombReticle"
	root.visible = false
	var mat := _unshaded_alpha(Color("facc15", 0.85))
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	mat.no_depth_test = true  # stays visible on rough ground
	var ring := TorusMesh.new()
	ring.inner_radius = 8.5
	ring.outer_radius = 9.8
	ring.rings = 32
	var ring_mi := MeshInstance3D.new()
	ring_mi.mesh = ring
	ring_mi.material_override = mat
	ring_mi.scale = Vector3(1, 0.05, 1)  # flattened torus = flat ring
	root.add_child(ring_mi)
	var dot := CylinderMesh.new()
	dot.top_radius = 1.6
	dot.bottom_radius = 1.6
	dot.height = 0.02
	AircraftModel._add_part(root, dot, mat, Vector3.ZERO)
	for a in [0.0, PI / 2.0, PI, 1.5 * PI]:
		AircraftModel._add_part(root, AircraftModel._box(1.2, 0.02, 5.5), mat,
				Vector3(sin(a) * 12.8, 0.02, cos(a) * 12.8), Vector3(0, a, 0))
	for mi in root.get_children():
		(mi as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return root


# =====================================================================================
# Bomb mesh (createSingleBombMesh): olive body, yellow HE ring, brass fuze, steel fins + shroud
# =====================================================================================

func _build_bomb() -> Node3D:
	if _mats.is_empty():
		_mats = {
			"body": _lit(Color("3b4436"), 0.55, 0.30),
			"stripe": _lit(Color("facc15"), 0.40, 0.15),
			"fuze": _lit(Color("d4af37"), 0.25, 0.85),
			"fin": _lit(Color("27272a"), 0.65, 0.40),
		}
	var bomb := Node3D.new()
	bomb.name = "Bomb"
	var along_z := Vector3(PI / 2.0, 0, 0)
	AircraftModel._add_part(bomb, _cyl(0.19, 0.18, 0.88, 14), _mats.body, Vector3.ZERO, along_z)
	var nose := SphereMesh.new()
	nose.radius = 0.19
	nose.height = 0.19
	nose.is_hemisphere = true
	AircraftModel._add_part(bomb, nose, _mats.body, Vector3(0, 0, 0.44), along_z)
	AircraftModel._add_part(bomb, _cyl(0.193, 0.193, 0.10, 14), _mats.stripe, Vector3(0, 0, 0.38), along_z)
	AircraftModel._add_part(bomb, _cyl(0.035, 0.035, 0.12, 8), _mats.fuze, Vector3(0, 0, 0.68), along_z)
	AircraftModel._add_part(bomb, AircraftModel._box(0.12, 0.015, 0.025), _mats.fuze, Vector3(0, 0, 0.73))
	AircraftModel._add_part(bomb, _cyl(0.0, 0.18, 0.36, 14), _mats.body, Vector3(0, 0, -0.62), Vector3(-PI / 2.0, 0, 0))
	AircraftModel._add_part(bomb, AircraftModel._box(0.02, 0.44, 0.32), _mats.fin, Vector3(0, 0, -0.72))
	AircraftModel._add_part(bomb, AircraftModel._box(0.44, 0.02, 0.32), _mats.fin, Vector3(0, 0, -0.72))
	var shroud := _cyl(0.20, 0.20, 0.12, 14)
	shroud.cap_top = false
	shroud.cap_bottom = false
	AircraftModel._add_part(bomb, shroud, _mats.fin, Vector3(0, 0, -0.72), along_z)
	AircraftModel._add_part(bomb, AircraftModel._box(0.09, 0.08, 0.70), _mats.fin, Vector3(0, 0.18, 0))
	return bomb


func _mesh(mesh: Mesh, mat: Material, p: Vector3) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = p
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


static func _cyl(top: float, bottom: float, height: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segments
	return c


static func _lit(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	m.metallic = metallic
	return m


static func _unshaded_alpha(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = color
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return m
