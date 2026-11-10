class_name Defenses
extends Node3D
## Ground defenses, ported from game.js:
##   - barrage balloons (BALLOON_CONFIGS, initBarrageBalloons / damageBarrageBalloon / updateBarrageBalloons and
##     barrage_balloon_builder.js): tethered Type Z balloons swaying over 8 sites, winch trucks, mooring cables.
##     Only the player's side can shoot them (75 HP); a kill ignites them and they fall burning.
##   - flak batteries (AA_SITE_CONFIGS, buildAATurretMesh / updateAADefenses / fireFlakShell / detonateFlakShell):
##     88 mm-style guns that fight for whoever owns their nearest airfield. One timed-fuse shell at a time,
##     laid on the target's predicted position; a 3D warning sphere (the exact 32 m damage radius) shows the
##     burst point 0.9 s before it explodes, red while the player is inside it. Bombs destroy batteries (300 HP).
## Sites are moved onto clear, dry, flat ground once (resolvePlacementSites). build() resets everything for a
## new game. Persistent like Airfields; a Sortie sets `player` and wires the signals to its HUD and audio.

signal banner(text: String, is_kill: bool)
signal hit_marker(is_kill: bool)
signal aa_fired                       # GameAudio: gun report near the player
signal flak_burst(volume: float)      # GameAudio
signal flak_danger(time_left: float)  # HUD: INF = not inside a marked blast zone

const S := World.MAP_SCALE
const BALLOON_CONFIGS := [
	{"id": "bb_north_base", "x": -3330.0 - 580.0, "z": -5400.0, "yaw": 0.0},
	{"id": "bb_north_dock", "x": -1080.0 - 320.0, "z": -1860.0 - 280.0, "yaw": PI / 4.0},
	{"id": "bb_ne_base", "x": 6810.0, "z": -4320.0 - 580.0, "yaw": PI},
	{"id": "bb_ne_channel", "x": 4620.0 + 350.0, "z": -2280.0 - 350.0, "yaw": -PI / 4.0},
	{"id": "bb_west_base", "x": -5970.0, "z": 1410.0 + 550.0, "yaw": -PI / 6.0},
	{"id": "bb_west_coast", "x": -4380.0 - 350.0, "z": 2820.0 + 350.0, "yaw": PI / 6.0},
	{"id": "bb_se_base", "x": 5070.0, "z": 4470.0 + 560.0, "yaw": 0.0},
	{"id": "bb_mountain_gap", "x": 1980.0 * S - 400.0, "z": 1380.0 * S - 300.0, "yaw": PI / 3.0},
]
const BALLOON_CABLE_ALT := 340.0
const BALLOON_HP := 75.0

const AA_SITE_CONFIGS := [
	{"id": "aa_af1_1", "name": "AF1 North Perimeter Flak", "x": -3330.0 - 240.0, "z": -5400.0 - 320.0},
	{"id": "aa_af1_2", "name": "AF1 South Perimeter Flak", "x": -3330.0 + 240.0, "z": -5400.0 + 320.0},
	{"id": "aa_af2_1", "name": "AF2 Runway Flak Battery A", "x": 6810.0 - 360.0, "z": -4320.0 - 180.0},
	{"id": "aa_af2_2", "name": "AF2 Coastal Flak Battery B", "x": 6810.0 + 360.0, "z": -4320.0 + 180.0},
	{"id": "aa_af3_1", "name": "AF3 Forest Flak Battery A", "x": -5970.0 - 180.0, "z": 1410.0 - 360.0},
	{"id": "aa_af3_2", "name": "AF3 Lagoon Flak Battery B", "x": -5970.0 + 240.0, "z": 1410.0 + 360.0},
	{"id": "aa_af4_1", "name": "AF4 Fortress Ridge Battery", "x": 5070.0 - 320.0, "z": 4470.0 - 240.0},
	{"id": "aa_af4_2", "name": "AF4 Fortress Seaward Battery", "x": 5070.0 + 380.0, "z": 4470.0 + 220.0},
	{"id": "aa_port_north", "name": "Desert Supply Port AA", "dock": "dock_north"},
	{"id": "aa_port_ne", "name": "NE Naval Slip Heavy AA", "dock": "dock_northeast"},
	{"id": "aa_port_west", "name": "Emerald Cove Port AA", "dock": "dock_west"},
	{"id": "aa_port_se", "name": "Fortress Deepwater Naval AA", "dock": "dock_southeast_1"},
]
const AA_HP := 300.0

# Flak tuning (same names as the JS constants)
const FLAK_MUZZLE_Z := 6.9
const FLAK_FIRE_INTERVAL := 3.6
const FLAK_FIRE_JITTER := 0.4
const FLAK_TARGET_GAP := 1.6
const FLAK_SHELL_SPEED := 820.0
const FLAK_MIN_FUSE := 0.9
const FLAK_MAX_FUSE := 3.2
const FLAK_WARNING_TIME := 0.9
const FLAK_RADIUS := 32.0
const FLAK_MAX_DAMAGE := 44.0
const FLAK_EDGE_DAMAGE := 6.0
const FLAK_RANGE_H := 1500.0
const FLAK_RANGE_3D := 2300.0
const FLAK_MIN_HEIGHT := 40.0
const FLAK_AIM_TOLERANCE := 0.12
const FLAK_MAX_CLOUDS := 40
const FLAK_ZONE_INSIDE := Color("ff2020")
const FLAK_ZONE_OUTSIDE := Color("ffa030")

const FRESNEL_SHADER := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
instance uniform vec4 tint : source_color = vec4(1.0, 0.63, 0.19, 0.6);
void fragment() {
	float rim = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.2);
	ALBEDO = tint.rgb;
	ALPHA = tint.a * (0.16 + 0.84 * rim);
}
"""
# Soft smoke: dense looking straight through a lobe, fading at its silhouette, simple sun shading
const SMOKE_SHADER := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_back, shadows_disabled;
instance uniform vec4 tint : source_color = vec4(0.2, 0.2, 0.2, 0.8);
void fragment() {
	float facing = abs(dot(NORMAL, VIEW));
	float edge = smoothstep(0.05, 0.75, facing);
	vec3 wn = normalize((INV_VIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float sun = max(dot(wn, normalize(vec3(0.4, 0.85, 0.35))), 0.0);
	ALBEDO = tint.rgb * (0.7 + 0.45 * sun);
	ALPHA = tint.a * edge;
}
"""
# Glowing fireball, additive; > 1 so the WorldEnvironment glow picks it up
const FIRE_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;
instance uniform vec4 tint : source_color = vec4(1.0, 0.77, 0.42, 0.9);
void fragment() {
	ALBEDO = tint.rgb * 1.8;
	ALPHA = tint.a;
}
"""


## Flak battery: carries a callsign so victims can name it ("TAKING FIRE FROM ...")
class Battery extends Node3D:
	var callsign := ""
	var side := ""        # "friendly", an enemy team id, or "" (unowned enemy base: shoots the player's side only)
	var hp := 300.0
	var is_alive := true
	var swivel: Node3D
	var barrel_group: Node3D
	var barrel: Node3D
	var recoil := 0.0
	var fire_timer := 0.0


## Barrage balloon: a bullet target for the player's side only
class Balloon extends Node3D:
	var defenses: Defenses
	var envelope_mat: StandardMaterial3D
	var cable: MeshInstance3D
	var anchor := Vector3.ZERO
	var base_pos := Vector3.ZERO
	var yaw := 0.0
	var hp := 75.0
	var is_alive := true
	var is_burning := false
	var fall_speed := 0.0
	var fall_rot := Vector3.ZERO
	var smoke_timer := 0.0
	var sway := 0.0

	func bullet_team() -> String:
		return "friendly_targets_only"  # Ballistics: only "friendly" bullets hit it

	func bullet_hit_test(p0: Vector3, p1: Vector3) -> Dictionary:
		if not is_alive:
			return {}
		var cp := Ballistics.closest_point_on_segment(p0, p1, position)
		if cp.distance_squared_to(position) >= 144.0:
			return {}
		# Ellipsoid envelope (radii X 4.4, Y 4.4, Z 9.5) in the balloon's yawed frame
		var local := (cp - position).rotated(Vector3.UP, -rotation.y)
		var e := Vector3(local.x / 4.4, local.y / 4.4, local.z / 9.5)
		if e.length_squared() > 1.08:
			return {}
		return {"module": "ENVELOPE", "point": cp}

	func take_bullet_hit(damage: float, _module: String, point: Vector3, _shooter: Node3D) -> void:
		defenses.damage_balloon(self, damage, point)


static var _sites_resolved := false
static var _placed: Array[Vector3] = []  # resolved footprints (x, z, r)
static var _balloon_sites: Array[Dictionary] = []
static var _aa_sites: Array[Dictionary] = []

var player: PlayerAircraft  # set by the Sortie; null in the main menu
var balloons: Array[Balloon] = []
var batteries: Array[Battery] = []

var _ballistics: Ballistics
var _shells: Array[Dictionary] = []     # {side, source, pos, timer, warning}
var _last_shot_at := {}                 # target node -> _clock time of the last shell aimed at it
var _clock := 0.0
var _warning_pool: Array[Dictionary] = []
var _clouds: Array[Dictionary] = []
var _cloud_pool := {"smoke": [], "fire": []}
var _shocks: Array[Dictionary] = []
var _shock_pool: Array[Dictionary] = []
var _lumps: Array[ArrayMesh] = []
var _sphere: SphereMesh
var _fresnel: Shader
var _smoke_mat: ShaderMaterial
var _fire_mat: ShaderMaterial
var _fresnel_mat: ShaderMaterial
var _ring_mesh: ArrayMesh


func _ready() -> void:
	_ballistics = get_tree().get_first_node_in_group("ballistics")
	_build_shared_resources()


# =====================================================================================
# Site placement (resolvePlacementSites): dry, flat ground clear of airfields, approaches, piers, other sites
# =====================================================================================

static func _resolve_sites() -> void:
	if _sites_resolved:
		return
	_sites_resolved = true
	for cfg in AA_SITE_CONFIGS:
		var x: float
		var z: float
		if cfg.has("dock"):
			# Nominal: just inland of the pier root, off to one side
			var d: Dictionary = World.find_by_id(World.docks, cfg.dock)
			x = d.x - sin(d.angle) * 90.0 + cos(d.angle) * 70.0
			z = d.z - cos(d.angle) * 90.0 - sin(d.angle) * 70.0
		else:
			x = cfg.x
			z = cfg.z
		var p := _resolve_site(x, z, 40.0)
		_placed.append(Vector3(p.x, p.y, 25.0))
		_aa_sites.append({"name": cfg.name, "x": p.x, "z": p.y})
	for cfg in BALLOON_CONFIGS:
		var p := _resolve_site(cfg.x, cfg.z, 60.0)
		_placed.append(Vector3(p.x, p.y, 25.0))
		_balloon_sites.append({"x": p.x, "z": p.y, "yaw": cfg.yaw})


static func _resolve_site(x: float, z: float, radius: float) -> Vector2:
	if _valid_site(x, z, radius):
		return Vector2(x, z)
	for r in range(20, 1201, 20):
		var n := maxi(8, roundi(TAU * r / 20.0))
		for k in n:
			var a := float(k) / n * TAU
			var cx := x + cos(a) * r
			var cz := z + sin(a) * r
			if _valid_site(cx, cz, radius):
				return Vector2(cx, cz)
	push_warning("[map] No clear site found near %d, %d" % [x, z])
	return Vector2(x, z)


# shortcut: roads are not ported yet, so isNearRoad() is skipped; add it when roads exist
static func _valid_site(x: float, z: float, radius: float) -> bool:
	var h := World.get_terrain_height(x, z)
	if h < 3.0:
		return false
	var slope := maxf(maxf(absf(World.get_terrain_height(x + 12, z) - h), absf(World.get_terrain_height(x - 12, z) - h)),
			maxf(absf(World.get_terrain_height(x, z + 12) - h), absf(World.get_terrain_height(x, z - 12) - h)))
	if slope > 4.5:
		return false
	if absf(x) > World.MAX_X - 200.0 or absf(z) > World.MAX_Z - 200.0:
		return false
	if World.is_inside_airfield_compound(x, z, 40.0) or World.is_on_runway_approach(x, z):
		return false
	for d in World.docks:  # isNearDock(x, z, 25)
		var ex: float = d.x + sin(d.angle) * (d.pier_length + 40.0)
		var ez: float = d.z + cos(d.angle) * (d.pier_length + 40.0)
		if World.dist_to_segment(x, z, d.x, d.z, ex, ez) < 35.0 + 25.0:
			return false
	for s in _placed:  # isNearPlacedSite
		if Vector2(x - s.x, z - s.y).length() < s.z + radius:
			return false
	return true


# =====================================================================================
# Build / reset for a new game
# =====================================================================================

func build() -> void:
	_resolve_sites()
	clear_flak()
	for b in balloons:
		b.cable.queue_free()
		(b.get_meta("truck") as Node).queue_free()
		b.queue_free()
	for aa in batteries:
		aa.queue_free()
	balloons.clear()
	batteries.clear()
	for site in _balloon_sites:
		_build_balloon(site)
	for site in _aa_sites:
		_build_battery(site)
	update_sides()


## Batteries fight for whoever owns their nearest airfield (call after team bases / squadrons are assigned)
func update_sides() -> void:
	for aa in batteries:
		var nearest := 0
		var best := INF
		for i in World.airports.size():
			var af: Dictionary = World.airports[i]
			var d := Vector2(af.x - aa.position.x, af.z - aa.position.z).length()
			if d < best:
				best = d
				nearest = i
		var owner_af: Dictionary = World.airports[nearest]
		aa.side = "friendly" if owner_af.team == "friendly" else String(owner_af.get("side_key", ""))


func alive_balloons() -> int:
	var n := 0
	for b in balloons:
		if b.is_alive:
			n += 1
	return n


# =====================================================================================
# Barrage balloons
# =====================================================================================

func _build_balloon(site: Dictionary) -> void:
	var ground := maxf(World.SEA_LEVEL, World.get_terrain_height(site.x, site.z))
	var b := Balloon.new()
	b.name = "Balloon"
	b.defenses = self
	b.rotation_order = EULER_ORDER_XYZ
	b.base_pos = Vector3(site.x, ground + BALLOON_CABLE_ALT, site.z)
	b.position = b.base_pos
	b.yaw = site.yaw
	b.rotation.y = site.yaw
	b.hp = BALLOON_HP
	b.sway = randf() * TAU
	b.anchor = Vector3(site.x, ground + 1.6, site.z)
	b.envelope_mat = _std(Color("94a3b8"), 0.65, 0.22)
	_build_balloon_mesh(b)
	add_child(b)
	b.add_to_group("bullet_targets")
	balloons.append(b)

	var truck := _build_winch_truck()
	truck.position = Vector3(site.x, ground, site.z)
	truck.rotation.y = site.yaw
	b.set_meta("truck", truck)
	add_child(truck)

	b.cable = MeshInstance3D.new()
	b.cable.mesh = ImmediateMesh.new()
	b.cable.material_override = _line_mat(Color("94a3b8"))
	b.cable.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(b.cable)
	_update_cable(b)


# Type Z teardrop envelope, reinforcement bands, 3 tail lobes with red patches, rigging and bridle ring
func _build_balloon_mesh(b: Balloon) -> void:
	# Lathe profile: t = 0 tail .. 1 nose, z = (t - 0.4) * 18
	# JS bug fix: Three's rotateX(-PI/2) put the nose at -Z (fins on the blunt end); here the nose is +Z as intended
	var profile: Array[Vector2] = []
	for i in 25:
		var t := i / 24.0
		var r := sin(t * PI) * (0.85 + 0.45 * t)
		if t > 0.90:
			r *= sqrt(maxf(0.0, 1.0 - pow((t - 0.90) / 0.10, 2)))
		profile.append(Vector2(maxf(0.08, r * 4.2), (t - 0.40) * 18.0))
	var env := MeshInstance3D.new()
	env.mesh = _lathe(profile, 22)
	env.material_override = b.envelope_mat
	b.add_child(env)

	var dark := _std(Color("64748b"), 0.75, 0.15)
	for ring_z in [-4.5, -1.0, 2.5, 6.0]:
		var t_norm: float = ring_z / 18.0 + 0.40
		var r_norm := sin(clampf(t_norm, 0.1, 0.95) * PI) * 1.1
		var holder := Node3D.new()
		holder.position.z = ring_z
		holder.scale = Vector3(r_norm, r_norm, 1.0)
		var torus := TorusMesh.new()
		torus.inner_radius = 3.56
		torus.outer_radius = 3.64
		torus.rings = 24
		torus.ring_segments = 6
		var ring := _mi(torus, dark)
		ring.rotation.x = PI / 2.0  # Three's torus lies in XY, Godot's in XZ
		holder.add_child(ring)
		b.add_child(holder)

	var red := _std(Color("b91c1c"), 0.6, 0.0)
	for angle in [0.0, TAU / 3.0, 2.0 * TAU / 3.0]:
		var fin := Node3D.new()
		fin.rotation.z = angle
		fin.add_child(_box_mi(Vector3(0.35, 3.4, 5.8), Vector3(0, 2.8, -4.5), dark))
		fin.add_child(_box_mi(Vector3(0.38, 1.4, 1.2), Vector3(0, 3.2, -6.6), red))
		b.add_child(fin)

	var bridle := Vector3(0, -4.6, 0.5)
	var rig := ImmediateMesh.new()
	rig.surface_begin(Mesh.PRIMITIVE_LINES)
	for p in [Vector3(-2.8, -1.8, 4.0), Vector3(2.8, -1.8, 4.0), Vector3(-3.2, -1.6, 0.0),
			Vector3(3.2, -1.6, 0.0), Vector3(-2.8, -1.8, -3.5), Vector3(2.8, -1.8, -3.5)]:
		rig.surface_add_vertex(p)
		rig.surface_add_vertex(bridle)
	rig.surface_end()
	var rig_mi := MeshInstance3D.new()
	rig_mi.mesh = rig
	rig_mi.material_override = _line_mat(Color("475569"))
	b.add_child(rig_mi)

	var ring_mesh := TorusMesh.new()
	ring_mesh.inner_radius = 0.27
	ring_mesh.outer_radius = 0.43
	var mooring := _mi(ring_mesh, _std(Color("334155"), 0.45, 0.85))
	mooring.position = bridle
	b.add_child(mooring)
	b.set_meta("bridle", bridle)


# Six-wheeled mooring winch truck (buildMooringWinchTruck)
func _build_winch_truck() -> Node3D:
	var g := Node3D.new()
	g.name = "WinchTruck"
	var body := _std(Color("3b4252"), 0.7, 0.0)
	var metal := _std(Color("1f242d"), 0.3, 0.8)
	var wheel_mat := _std(Color("181a1f"), 0.9, 0.0)
	g.add_child(_box_mi(Vector3(3.2, 0.7, 7.5), Vector3(0, 0.85, 0), body))
	var drum := _mi(_cyl(0.9, 0.9, 1.8, 16), metal)
	drum.position = Vector3(0, 1.6, -0.6)
	drum.rotation.z = PI / 2.0
	g.add_child(drum)
	g.add_child(_box_mi(Vector3(2.8, 1.8, 2.4), Vector3(0, 1.8, 2.2), body))
	for z in [-2.4, -0.8, 2.0]:
		for x in [-1.75, 1.75]:
			var w := _mi(_cyl(0.55, 0.55, 0.45, 12), wheel_mat)
			w.position = Vector3(x, 0.55, z)
			w.rotation.z = PI / 2.0
			g.add_child(w)
	return g


func _update_cable(b: Balloon) -> void:
	var im := b.cable.mesh as ImmediateMesh
	im.clear_surfaces()
	im.surface_begin(Mesh.PRIMITIVE_LINES)
	im.surface_add_vertex(b.transform * (b.get_meta("bridle") as Vector3))
	im.surface_add_vertex(b.anchor)
	im.surface_end()


## damageBarrageBalloon
func damage_balloon(b: Balloon, damage: float, hit_pos: Vector3) -> void:
	if not b.is_alive:
		return
	b.hp -= damage
	_ballistics.spawn_impact(hit_pos, false, damage)
	var is_kill := b.hp <= 0.0
	hit_marker.emit(is_kill)
	if not is_kill:
		banner.emit("TARGET HIT", false)
		return
	b.is_alive = false
	b.is_burning = true
	b.fall_speed = 5.0
	b.fall_rot = Vector3(randf_range(-0.35, 0.35), randf_range(-0.2, 0.2), randf_range(-0.35, 0.35))
	_ballistics.explosion_at(b.position, 2.5)  # hydrogen fireball
	b.envelope_mat.albedo_color = Color("1e293b")  # charred canvas
	b.cable.visible = false  # mooring cable snaps
	banner.emit("💥 BARRAGE BALLOON DESTROYED +150", true)


func _update_balloons(dt: float) -> void:
	for b in balloons:
		if b.is_alive:
			# Buoyant sway
			b.sway += dt * 0.65
			b.position = b.base_pos + Vector3(cos(b.sway * 0.55) * 2.4, sin(b.sway) * 1.6, sin(b.sway * 0.45) * 1.5)
			b.rotation.y = b.yaw + sin(b.sway * 0.6) * 0.08
			_update_cable(b)
		elif b.is_burning:
			b.fall_speed += 24.0 * dt
			b.position.y -= b.fall_speed * dt
			b.rotation += b.fall_rot * dt
			b.smoke_timer += dt
			if b.smoke_timer >= 0.035:
				b.smoke_timer = 0.0
				_ballistics.smoke_at(b.position)
			var rest := maxf(World.SEA_LEVEL, World.get_terrain_height(b.position.x, b.position.z)) + 4.2
			if b.position.y <= rest:
				b.is_burning = false
				b.position.y = rest
				_ballistics.explosion_at(b.position, 2.0)


# =====================================================================================
# Flak batteries
# =====================================================================================

# 88 mm-style gun: sandbag revetment, concrete floor, cruciform platform, traversing carriage, shield, barrel
func _build_battery(site: Dictionary) -> void:
	var ground := maxf(World.SEA_LEVEL, World.get_terrain_height(site.x, site.z))
	var aa := Battery.new()
	aa.name = "Flak"
	aa.callsign = String(site.name).to_upper()
	aa.position = Vector3(site.x, ground, site.z)
	aa.hp = AA_HP
	aa.fire_timer = -randf() * FLAK_FIRE_INTERVAL

	var bags := _cyl(6.0, 6.6, 1.5, 18)
	bags.cap_top = false
	bags.cap_bottom = false
	var sandbags := _mi(bags, _std(Color("c2a677"), 0.95, 0.0))
	sandbags.position.y = 0.75
	aa.add_child(sandbags)
	var floor_mi := _mi(_cyl(5.8, 5.8, 0.4, 18), _std(Color("52525b"), 0.8, 0.0))
	floor_mi.position.y = 0.2
	aa.add_child(floor_mi)

	# shortcut: every battery wears the enemy paint (JS tinted by the static site team, which bases now reroll)
	var paint := _std(Color("4a5246"), 0.7, 0.25)
	var gun := _std(Color("2b2d2f"), 0.45, 0.65)
	for rot in [0.0, PI / 2.0]:
		var arm := _box_mi(Vector3(9.2, 0.32, 0.75), Vector3(0, 0.55, 0), paint)
		arm.rotation.y = rot
		aa.add_child(arm)
	for pad_pos in [Vector3(4.4, 0.45, 0), Vector3(-4.4, 0.45, 0), Vector3(0, 0.45, 4.4), Vector3(0, 0.45, -4.4)]:
		var pad := _mi(_cyl(0.55, 0.55, 0.18, 10), gun)
		pad.position = pad_pos
		aa.add_child(pad)

	var swivel := Node3D.new()
	swivel.position.y = 0.7
	var pedestal := _mi(_cyl(0.75, 0.95, 1.0, 12), paint)
	pedestal.position.y = 0.5
	swivel.add_child(pedestal)
	swivel.add_child(_box_mi(Vector3(1.7, 0.9, 2.6), Vector3(0, 1.25, -0.2), paint))
	for sx in [-0.75, 0.75]:
		swivel.add_child(_box_mi(Vector3(0.14, 1.1, 1.3), Vector3(sx, 1.95, -0.2), paint))
	var shield := _box_mi(Vector3(2.9, 1.6, 0.12), Vector3(0, 2.15, 0.75), paint)
	shield.rotation.x = 0.18
	swivel.add_child(shield)

	var barrel_group := Node3D.new()
	barrel_group.rotation_order = EULER_ORDER_XYZ
	barrel_group.position = Vector3(0, 2.0, -0.3)
	barrel_group.add_child(_box_mi(Vector3(0.72, 0.72, 1.5), Vector3(0, 0, -0.35), gun))
	var recuperator := _mi(_cyl(0.13, 0.13, 3.0, 10), paint)
	recuperator.rotation.x = PI / 2.0
	recuperator.position = Vector3(0, 0.38, 1.3)
	barrel_group.add_child(recuperator)
	var barrel := Node3D.new()
	var tube := _mi(_cyl(0.13, 0.17, 6.4, 12), gun)
	tube.rotation.x = PI / 2.0
	tube.position.z = 3.3
	barrel.add_child(tube)
	var brake := _mi(_cyl(0.22, 0.22, 0.55, 12), gun)
	brake.rotation.x = PI / 2.0
	brake.position.z = 6.6
	barrel.add_child(brake)
	barrel_group.add_child(barrel)
	barrel_group.rotation.x = -0.6
	swivel.add_child(barrel_group)
	aa.add_child(swivel)

	aa.swivel = swivel
	aa.barrel_group = barrel_group
	aa.barrel = barrel
	add_child(aa)
	batteries.append(aa)


## damageAADefense (bombs only)
func damage_battery(aa: Battery, damage: float) -> void:
	if not aa.is_alive:
		return
	aa.hp -= damage
	if aa.hp > 0.0:
		return
	aa.is_alive = false
	_ballistics.explosion_at(aa.position + Vector3(0, 1.5, 0), 3.2)
	aa.barrel_group.rotation.x = 0.65
	aa.barrel_group.rotation.z = randf_range(-0.4, 0.4)
	aa.swivel.position.y = 0.1
	var burnt := _std(Color("18181b"), 0.95, 0.0)
	for mi in aa.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).material_override = burnt
	banner.emit("💥 ANTI-AIR BATTERY DESTROYED: %s OBLITERATED! +350 PTS" % aa.callsign, true)


## Bomb blast on balloons and batteries (applyBombBlastDamage A + D); true when anything was hit
func bomb_blast(p: Vector3, blast_radius: float) -> bool:
	var hit := false
	for aa in batteries:
		if not aa.is_alive:
			continue
		var d := Vector2(p.x - aa.position.x, p.z - aa.position.z).length()
		if d <= blast_radius + 12.0:
			damage_battery(aa, roundf(750.0 * maxf(0.25, 1.0 - d / (blast_radius + 12.0))))
			hit = true
	for b in balloons:
		if b.is_alive and p.distance_to(b.position) <= blast_radius + 25.0:
			damage_balloon(b, 500.0, p)
			hit = true
	return hit


# Same side check the JS made with team / sideKey
static func _is_hostile(aa_side: String, target_side: String) -> bool:
	if aa_side == "friendly":
		return target_side != "friendly"
	if aa_side.is_empty():
		return target_side == "friendly"
	return target_side != aa_side


# getFlakVictims: [{node, pos, vel}] hostile to `side`
func _victims(side: String) -> Array[Dictionary]:
	var list: Array[Dictionary] = []
	for t in get_tree().get_nodes_in_group("bullet_targets"):
		if not t.has_method("get_target_info"):
			continue
		var info: Dictionary = t.get_target_info()
		if info.is_empty() or not _is_hostile(side, info.side):
			continue
		list.append({"node": t, "pos": info.pos, "vel": info.velocity})
	return list


func _find_target(aa: Battery) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for v in _victims(aa.side):
		var pos: Vector3 = v.pos
		if pos.y < aa.position.y + FLAK_MIN_HEIGHT:
			continue
		var h := Vector2(pos.x - aa.position.x, pos.z - aa.position.z).length()
		if h > FLAK_RANGE_H:
			continue
		var d := Vector2(h, pos.y - aa.position.y).length()
		if d < FLAK_RANGE_3D and d < best_d:
			best_d = d
			best = v
	return best


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	_update_balloons(dt)
	_clock += dt
	_update_shells(dt)
	_update_batteries(dt)


func _update_batteries(dt: float) -> void:
	for aa in batteries:
		if not aa.is_alive:
			continue
		# Barrel runs back out after each shot
		if aa.recoil > 0.0:
			aa.recoil = maxf(0.0, aa.recoil - dt * 2.4)
			aa.barrel.position.z = -aa.recoil * 0.9

		var target := _find_target(aa)
		if target.is_empty():
			aa.fire_timer = minf(aa.fire_timer, 0.0)
			continue

		# Lay the gun on where the target will be when the fuse runs out
		var dist := aa.position.distance_to(target.pos)
		var fuse := clampf(dist / FLAK_SHELL_SPEED, FLAK_MIN_FUSE, FLAK_MAX_FUSE)
		var lead: Vector3 = target.pos + (target.vel as Vector3) * fuse
		var dx := lead.x - aa.position.x
		var dz := lead.z - aa.position.z
		var dy := lead.y - (aa.position.y + 2.7)
		var diff_yaw := wrapf(atan2(dx, dz) - aa.swivel.rotation.y, -PI, PI)
		aa.swivel.rotation.y += signf(diff_yaw) * minf(absf(diff_yaw), 1.4 * dt)
		aa.barrel_group.rotation.x = clampf(-atan2(dy, maxf(10.0, Vector2(dx, dz).length())), -1.35, -0.15)

		# One deliberate shell at a time, only once laid on, and never right after another battery
		# fired at the same aircraft (neighbouring guns take turns)
		aa.fire_timer += dt
		var key: Node = target.node
		var last: float = _last_shot_at.get(key, -INF)
		if aa.fire_timer >= FLAK_FIRE_INTERVAL and absf(diff_yaw) < FLAK_AIM_TOLERANCE and _clock - last >= FLAK_TARGET_GAP:
			aa.fire_timer = randf_range(-FLAK_FIRE_JITTER, FLAK_FIRE_JITTER)
			_last_shot_at[key] = _clock
			_fire_shell(aa, lead, dist, fuse)


func _fire_shell(aa: Battery, lead: Vector3, dist: float, fuse: float) -> void:
	# Fuse error: the further the target, the wider the burst scatter
	var spread := 14.0 + dist * 0.022
	var burst := lead + Vector3(randf_range(-1.0, 1.0) * spread, randf_range(-1.0, 1.0) * spread * 0.6, randf_range(-1.0, 1.0) * spread)
	var ground := maxf(World.SEA_LEVEL, World.get_terrain_height(burst.x, burst.z))
	burst.y = maxf(burst.y, maxf(ground + 25.0, aa.position.y + FLAK_MIN_HEIGHT * 0.6))
	_shells.append({"side": aa.side, "source": aa, "pos": burst, "timer": fuse, "warning": {}})

	aa.recoil = 1.0
	var muzzle := aa.barrel_group.global_transform * Vector3(0, 0, FLAK_MUZZLE_Z)
	_spawn_cloud("smoke", muzzle, {"lobes": 2, "spread": 1.2, "start": 1.4, "end": 5.0, "life": 1.8, "opacity": 0.6,
			"c0": Color("b8b8b0"), "c1": Color("d6d3d1"), "rise": 1.0})
	if _player_alive() and muzzle.distance_to(player.global_position) < 1800.0:
		aa_fired.emit()


func _player_alive() -> bool:
	return is_instance_valid(player) and not player.is_crashed


func _update_shells(dt: float) -> void:
	# Closest-to-bursting marked shell the player is inside (same distance test as the damage)
	var danger := INF
	var i := _shells.size() - 1
	while i >= 0:
		var s: Dictionary = _shells[i]
		s.timer -= dt
		# Only shells aimed at the player's side get a marker: they are the ones to dodge
		if s.warning.is_empty() and s.side != "friendly" and s.timer <= FLAK_WARNING_TIME:
			s.warning = _acquire_warning(s.pos)
		if not s.warning.is_empty():
			var inside: bool = _player_alive() and player.global_position.distance_to(s.pos) <= FLAK_RADIUS
			_update_warning(s.warning, s.timer, dt, inside)
			if inside:
				danger = minf(danger, s.timer)
		if s.timer <= 0.0:
			_detonate(s)
			_release_warning(s.warning)
			_shells.remove_at(i)
		i -= 1
	_update_clouds(dt)
	flak_danger.emit(danger)


func _detonate(s: Dictionary) -> void:
	var pos: Vector3 = s.pos
	_spawn_shock(pos)
	# Black flak smoke first; the fireball glows on top and burns out into it
	_spawn_cloud("smoke", pos, {"lobes": 3, "spread": 4.5, "start": 5.0, "end": 18.0, "life": 5.5, "opacity": 0.85,
			"c0": Color("24211f"), "c1": Color("555352"), "rise": 1.6})
	_spawn_cloud("fire", pos, {"lobes": 3, "spread": 3.0, "start": 3.0, "end": 14.0, "life": 0.42, "opacity": 0.9,
			"c0": Color("ffc46a"), "c1": Color("c03800"), "rise": 0.0})

	var source: Battery = s.source if is_instance_valid(s.source) else null
	for v in _victims(s.side):
		var d: float = (v.pos as Vector3).distance_to(pos)
		if d > FLAK_RADIUS:
			continue
		var dmg := roundf(FLAK_EDGE_DAMAGE + (FLAK_MAX_DAMAGE - FLAK_EDGE_DAMAGE) * (1.0 - d / FLAK_RADIUS))
		# Splinters strike the side of the airframe facing the burst
		var hit_pos: Vector3 = (v.pos as Vector3).lerp(pos, minf(1.0, 3.0 / maxf(d, 3.0)))
		v.node.take_bullet_hit(dmg, "FLAK", hit_pos, source)

	if _player_alive():
		var pd := player.global_position.distance_to(pos)
		if pd < FLAK_RADIUS * 2.5:  # near misses still rattle the camera
			player.guns.recoil_intensity = minf(1.0, player.guns.recoil_intensity + 0.5 * (1.0 - pd / (FLAK_RADIUS * 2.5)))
		if pd < 2600.0:
			flak_burst.emit(minf(1.0, 160.0 / maxf(pd, 160.0)))


## Removes pending shells, markers and smoke (clearFlakShells)
func clear_flak() -> void:
	for s in _shells:
		_release_warning(s.warning)
	_shells.clear()
	_last_shot_at.clear()
	for c in _clouds:
		_recycle_cloud(c)
	_clouds.clear()
	for s in _shocks:
		s.node.visible = false
		_shock_pool.append(s)
	_shocks.clear()
	flak_danger.emit(INF)


# =====================================================================================
# Flak visuals: warning marker, lumpy smoke / fire clouds, shockwave shell (all pooled)
# =====================================================================================

func _build_shared_resources() -> void:
	_sphere = SphereMesh.new()
	_sphere.radius = 1.0
	_sphere.height = 2.0
	_sphere.radial_segments = 32
	_sphere.rings = 20
	_fresnel = Shader.new()
	_fresnel.code = FRESNEL_SHADER
	_fresnel_mat = ShaderMaterial.new()
	_fresnel_mat.shader = _fresnel
	_smoke_mat = ShaderMaterial.new()
	_smoke_mat.shader = Shader.new()
	_smoke_mat.shader.code = SMOKE_SHADER
	_fire_mat = ShaderMaterial.new()
	_fire_mat.shader = Shader.new()
	_fire_mat.shader.code = FIRE_SHADER
	_fire_mat.render_priority = 1  # glow drawn after the smoke so the fireball shows through it
	for seed in [1.3, 4.1, 7.7, 11.2]:
		_lumps.append(_lumpy(seed))
	_ring_mesh = _ring(0.9, 1.0, 48)


# Sphere with smooth noise on the radius (makeLumpyGeometry)
func _lumpy(seed: float) -> ArrayMesh:
	var src := SphereMesh.new()
	src.radius = 1.0
	src.height = 2.0
	src.radial_segments = 28
	src.rings = 20
	var arrays := src.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		var v := verts[i]
		var n := 0.16 * sin(3.1 * v.x + 1.7 * v.y + seed) * cos(2.3 * v.z + seed * 0.7) \
				+ 0.10 * sin(5.3 * v.y + 2.1 * v.z + seed * 1.9) \
				+ 0.07 * sin(7.7 * v.x - 4.3 * v.z + seed * 3.1)
		verts[i] = v * (1.0 + n)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = null
	arrays[Mesh.ARRAY_TANGENT] = null
	var st := SurfaceTool.new()
	st.create_from_arrays(arrays)
	st.generate_normals()
	return st.commit()


func _ring(inner: float, outer: float, segments: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in segments:
		var a0 := float(k) / segments * TAU
		var a1 := float(k + 1) / segments * TAU
		var i0 := Vector3(cos(a0), sin(a0), 0) * inner
		var o0 := Vector3(cos(a0), sin(a0), 0) * outer
		var i1 := Vector3(cos(a1), sin(a1), 0) * inner
		var o1 := Vector3(cos(a1), sin(a1), 0) * outer
		for p in [i0, o0, o1, i0, o1, i1]:
			st.add_vertex(p)
	return st.commit()


# Warning: sphere the size of the damage radius (red inside / amber outside), bright core, shrinking countdown ring
func _acquire_warning(pos: Vector3) -> Dictionary:
	var w: Dictionary
	if _warning_pool.is_empty():
		var group := Node3D.new()
		var zone := _mi(_sphere, _fresnel_mat)
		zone.scale = Vector3.ONE * FLAK_RADIUS
		group.add_child(zone)
		var core_mat := StandardMaterial3D.new()
		core_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		core_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		core_mat.no_depth_test = true
		core_mat.render_priority = 2
		core_mat.albedo_color = Color("ffe0c0", 0.95)
		var core := _mi(_sphere, core_mat)
		core.scale = Vector3.ONE * 1.6
		group.add_child(core)
		var ring_mat := StandardMaterial3D.new()
		ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		ring_mat.no_depth_test = true
		ring_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		ring_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED  # faces the camera (orientFlakWarnings)
		ring_mat.billboard_keep_scale = true
		ring_mat.render_priority = 2
		ring_mat.albedo_color = Color("ffd166", 0.9)
		var countdown := _mi(_ring_mesh, ring_mat)
		group.add_child(countdown)
		add_child(group)
		w = {"node": group, "zone": zone, "core_mat": core_mat, "countdown": countdown, "age": 0.0}
	else:
		w = _warning_pool.pop_back()
	w.age = 0.0
	w.node.position = pos
	w.node.visible = true
	return w


func _release_warning(w: Dictionary) -> void:
	if w.is_empty():
		return
	w.node.visible = false
	_warning_pool.append(w)


func _update_warning(w: Dictionary, time_left: float, dt: float, inside: bool) -> void:
	w.age += dt
	var k := clampf(time_left / FLAK_WARNING_TIME, 0.0, 1.0)
	var pulse := 0.5 + 0.5 * sin(w.age * (18.0 + 30.0 * (1.0 - k)))  # faster as the burst nears
	var col := FLAK_ZONE_INSIDE if inside else FLAK_ZONE_OUTSIDE
	col.a = (0.75 if inside else 0.45) + 0.25 * pulse * (1.0 - k * 0.5)
	(w.zone as MeshInstance3D).set_instance_shader_parameter("tint", col)
	w.core_mat.albedo_color.a = 0.6 + 0.4 * pulse
	(w.countdown as Node3D).scale = Vector3.ONE * FLAK_RADIUS * maxf(0.05, k)


# One cohesive cloud of 2-3 overlapping lumpy lobes that grows, rises and fades (spawnFlakCloud)
func _spawn_cloud(kind: String, pos: Vector3, o: Dictionary) -> void:
	if _clouds.size() >= FLAK_MAX_CLOUDS:
		_recycle_cloud(_clouds.pop_front())
	var c: Dictionary
	var pool: Array = _cloud_pool[kind]
	if pool.is_empty():
		var group := Node3D.new()
		var lobes: Array[MeshInstance3D] = []
		for i in 3:
			var lobe := _mi(_lumps[i], _fire_mat if kind == "fire" else _smoke_mat)
			group.add_child(lobe)
			lobes.append(lobe)
		add_child(group)
		c = {"kind": kind, "node": group, "lobes": lobes}
	else:
		c = pool.pop_back()
	var lobe_count := mini(3, o.lobes)
	var sp: float = o.spread / maxf(o.start, 0.1)
	for i in 3:
		var lobe: MeshInstance3D = c.lobes[i]
		lobe.visible = i < lobe_count
		lobe.mesh = _lumps[(i + randi() % _lumps.size()) % _lumps.size()]
		lobe.position = Vector3(randf_range(-1.0, 1.0) * sp, randf_range(-0.7, 0.7) * sp, randf_range(-1.0, 1.0) * sp)
		lobe.rotation = Vector3(randf() * 6.3, randf() * 6.3, randf() * 6.3)
		lobe.scale = Vector3.ONE * (1.0 if i == 0 else 0.7 + randf() * 0.35)
	c.node.position = pos
	c.node.scale = Vector3.ONE * o.start
	c.node.rotation = Vector3.ZERO
	c.node.visible = true
	c.age = 0.0
	c.life = o.life
	c.start = o.start
	c.end = o.end
	c.opacity = o.opacity
	c.rise = o.rise
	c.c0 = o.c0
	c.c1 = o.c1
	c.spin = Vector3(randf_range(-0.15, 0.15), randf_range(-0.15, 0.15), randf_range(-0.15, 0.15))
	_cloud_look(c, o.c0, o.opacity)
	_clouds.append(c)


func _cloud_look(c: Dictionary, color: Color, opacity: float) -> void:
	color.a = opacity
	for lobe in c.lobes:
		(lobe as MeshInstance3D).set_instance_shader_parameter("tint", color)


func _recycle_cloud(c: Dictionary) -> void:
	c.node.visible = false
	_cloud_pool[c.kind].append(c)


func _update_clouds(dt: float) -> void:
	var i := _clouds.size() - 1
	while i >= 0:
		var c: Dictionary = _clouds[i]
		c.age += dt
		var t: float = c.age / c.life
		if t >= 1.0:
			_clouds.remove_at(i)
			_recycle_cloud(c)
			i -= 1
			continue
		var grow := 1.0 - pow(1.0 - t, 3)
		var node: Node3D = c.node
		node.scale = Vector3.ONE * lerpf(c.start, c.end, grow)
		node.position.y += c.rise * dt
		node.rotation += (c.spin as Vector3) * dt
		if c.kind == "fire":
			_cloud_look(c, (c.c0 as Color).lerp(c.c1, minf(1.0, t * 1.4)), c.opacity * (1.0 - t * t))
		else:  # smoke holds its density for a moment, then thins out
			_cloud_look(c, (c.c0 as Color).lerp(c.c1, t), c.opacity * minf(1.0, (1.0 - t) * 1.8))
		i -= 1

	i = _shocks.size() - 1
	while i >= 0:
		var s: Dictionary = _shocks[i]
		s.age += dt
		var t: float = s.age / 0.32
		if t >= 1.0:
			s.node.visible = false
			_shocks.remove_at(i)
			_shock_pool.append(s)
			i -= 1
			continue
		s.node.scale = Vector3.ONE * FLAK_RADIUS * (0.2 + 0.8 * (1.0 - pow(1.0 - t, 2)))
		(s.node as MeshInstance3D).set_instance_shader_parameter("tint", Color("ffd9a0", 0.85 * (1.0 - t)))
		i -= 1


# Shockwave shell that expands to exactly the damage radius
func _spawn_shock(pos: Vector3) -> void:
	var s: Dictionary
	if _shock_pool.is_empty():
		var mi := _mi(_sphere, _fresnel_mat)
		add_child(mi)
		s = {"node": mi}
	else:
		s = _shock_pool.pop_back()
	s.age = 0.0
	s.node.position = pos
	s.node.scale = Vector3.ONE * FLAK_RADIUS * 0.2
	s.node.visible = true
	_shocks.append(s)


# =====================================================================================
# Mesh helpers
# =====================================================================================

static func _std(color: Color, roughness: float, metallic: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	m.metallic = metallic
	return m


static func _line_mat(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = color
	return m


static func _mi(mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	if mat is ShaderMaterial or (mat is StandardMaterial3D and mat.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED):
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mi


static func _box_mi(size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var box := BoxMesh.new()
	box.size = size
	var mi := _mi(box, mat)
	mi.position = pos
	return mi


static func _cyl(top: float, bottom: float, height: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segments
	c.rings = 1
	return c


# Revolve (r, z) profile points around the Z axis
static func _lathe(profile: Array[Vector2], segments: int) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_smooth_group(0)
	for i in profile.size() - 1:
		var a := profile[i]
		var b := profile[i + 1]
		for k in segments:
			var t0 := float(k) / segments * TAU
			var t1 := float(k + 1) / segments * TAU
			var p00 := Vector3(cos(t0) * a.x, sin(t0) * a.x, a.y)
			var p01 := Vector3(cos(t1) * a.x, sin(t1) * a.x, a.y)
			var p10 := Vector3(cos(t0) * b.x, sin(t0) * b.x, b.y)
			var p11 := Vector3(cos(t1) * b.x, sin(t1) * b.x, b.y)
			for p in [p00, p10, p11, p00, p11, p01]:
				st.add_vertex(p)
	st.index()
	st.generate_normals()
	return st.commit()
