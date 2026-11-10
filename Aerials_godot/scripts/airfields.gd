class_name Airfields
extends Node3D
## The 4 airfields, ported from buildAirfields() / createRunwayTexture() / updateAirfieldVisuals() /
## updateAirfieldSystems() in game.js. Each airfield is a Node3D at (x, elevation, z) rotated by
## heading_rad, so every local position below is copied from the JS unchanged
## (local +X = apron / tower / hangar side, local Z = along the runway).
## Team colours (beacon, dome, windsock) follow World.airports[i].team; call update_visuals()
## after the home bases are re-rolled. build() also resets every base's health (new game = intact bases).
## damage_airfield() ports damageAirfield(): bombs topple the tower, flatten hangars and wear down an
## enemy base's integrity (1200, -400 per hit inside the compound); at 0 it is destroyed and its teams
## can no longer respawn (EnemyPlane checks World.airports[i].is_destroyed).

const FRIENDLY := Color("22c55e")
const ENEMY := Color("ef4444")
const BEACON_SPIN := 2.2  # rad/s
## Shared-kit weathering (art bible Section 6). Per-nation kits arrive with the faction port.
const GROUND_SHADER := preload("res://shaders/spatial_env_airfield_ground.gdshader")
const SURFACE_SHADER := preload("res://shaders/spatial_env_weathered_surface.gdshader")

var _runway_tex: ImageTexture
var _sites: Array[Dictionary] = []  # per airfield: node, beacon rotor, team-coloured materials


## Build (or rebuild) every airfield from World.airports
func build() -> void:
	for child in get_children():
		child.queue_free()
	_sites.clear()
	if _runway_tex == null:
		_runway_tex = _make_runway_texture()
	for i in World.airports.size():
		var af: Dictionary = World.airports[i]
		af.hp = 1200.0
		af.max_hp = 1200.0
		af.is_destroyed = false
		_sites.append(_build_airfield(af))
	update_visuals()


## Green for the player's side, red for the enemy (beacon dome, glow, beams, windsock)
func update_visuals() -> void:
	for i in _sites.size():
		var af: Dictionary = World.airports[i]
		var col := FRIENDLY if af.team == "friendly" else ENEMY
		var site := _sites[i]
		site.sock_mat.albedo_color = col
		if site.tower_destroyed:
			continue  # a collapsed tower stays dark
		site.dome_mat.albedo_color = col
		site.glow_mat.albedo_color = Color(col, 0.9)
		site.beam_mat.albedo_color = Color(col, 0.28)


func _process(delta: float) -> void:
	for site in _sites:
		site.rotor.rotation.y += BEACON_SPIN * minf(delta, 0.1)


func _build_airfield(af: Dictionary) -> Dictionary:
	var root := Node3D.new()
	root.name = "Airfield_%s" % af.code
	root.position = Vector3(af.x, af.elevation, af.z)
	root.rotation.y = af.heading_rad
	add_child(root)
	var is_desert: bool = af.id == "north"
	var factions_size: bool = af.width > World.AIRFIELD_SIZES.classic.width

	# 1. Runway (offsets lifted a few cm more than the JS so it never z-fights the flat pad)
	# Sun-faded asphalt, worn paint, centre oil line, rubber in the touchdown zones (texture = paint mask)
	var runway_mat := _shader_mat(GROUND_SHADER, {"markings": _runway_tex,
			"size_m": Vector2(af.width, af.length)})
	_add(root, _plane(af.width, af.length), runway_mat, Vector3(0, 0.12, 0), Vector3.ZERO, false)

	# Runway numbers ("09" / "27", the JS painted them into the texture)
	_runway_number(root, "09", af.length, -1.0)
	_runway_number(root, "27", af.length, 1.0)

	# 2. Apron + taxiway connector
	# Weathered concrete slabs with oil stains (was flat #3a3f44)
	var apron_mat := _shader_mat(GROUND_SHADER, {"apron": true})
	var apron := _add(root, _plane(120, 180), apron_mat, Vector3(90, 0.08, -30), Vector3.ZERO, false)
	if factions_size:
		apron.scale = Vector3(1.3, 1, 1.3)
	_add(root, _plane(55, 30), apron_mat, Vector3(40, 0.10, -30), Vector3.ZERO, false)

	# 3. Control tower with team-coloured dome and rotating beacon
	var tower := Node3D.new()
	tower.position = Vector3(130, 0, 45)
	root.add_child(tower)
	# Board-formed concrete: faint timber-plank bands, runoff streaks, per-site tone
	var concrete := _shader_mat(SURFACE_SHADER, {"albedo": Color("d1b98a") if is_desert else Color("d1d5db"),
			"roughness": 0.8, "rough_var": 0.08, "board_spacing": 0.6, "streak_strength": 0.14})
	_add(tower, _box(22, 10, 18), concrete, Vector3(0, 5, 0))
	_add(tower, _cyl(4.0, 4.8, 32, 12), concrete, Vector3(0, 24, 0))
	_add(tower, _cyl(7.5, 6.5, 8, 12), _mat(Color("1f2937"), 0.2, 0.8), Vector3(0, 42, 0))

	var dome_mat := _unshaded(FRIENDLY)
	var dome := SphereMesh.new()
	dome.radius = 3.0
	dome.height = 3.0
	dome.is_hemisphere = true
	_add(tower, dome, dome_mat, Vector3(0, 46, 0), Vector3.ZERO, false)

	var rotor := Node3D.new()
	rotor.position = Vector3(0, 48.2, 0)
	tower.add_child(rotor)
	var glow_mat := _unshaded(Color(FRIENDLY, 0.9))
	glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	var orb := SphereMesh.new()
	orb.radius = 1.35
	orb.height = 2.7
	_add(rotor, orb, glow_mat, Vector3.ZERO, Vector3.ZERO, false)
	var beam_mat := _unshaded(Color(FRIENDLY, 0.28))
	beam_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beam_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	beam_mat.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	var beam := CylinderMesh.new()  # open cone lying along +Z, like ConeGeometry rotated + shifted in the JS
	beam.top_radius = 0.0
	beam.bottom_radius = 3.2
	beam.height = 18.0
	beam.radial_segments = 10
	beam.cap_top = false
	beam.cap_bottom = false
	for yaw in [0.0, PI]:
		var arm := Node3D.new()
		arm.rotation.y = yaw
		rotor.add_child(arm)
		_add(arm, beam, beam_mat, Vector3(0, 0, 9), Vector3(PI / 2.0, 0, 0), false)

	# 4. Two hangars with barrel roofs
	# Corrugated metal: vertical ribs on the walls, ribs around the barrel roof (spaced along its axis),
	# sun-faded blotches, runoff streaks; desert hangars are painted, so less metallic and rougher
	var hangar_col := Color("b5925a") if is_desert else Color("475569")
	var metal := 0.1 if is_desert else 0.35
	var rough := 0.75 if is_desert else 0.55
	var hangar_mat := _shader_mat(SURFACE_SHADER, {"albedo": hangar_col, "roughness": rough,
			"metallic": metal * 0.7, "rib_axis": Vector3(1, 0, 1), "rib_spacing": 0.9, "rib_strength": 0.06,
			"streak_strength": 0.16})
	# Roof cylinder is rotated 90 deg about X: model Y = hangar length, model Z ~ height on the arc
	var roof_mat := _shader_mat(SURFACE_SHADER, {"albedo": hangar_col.darkened(0.06), "roughness": rough,
			"metallic": metal, "rough_var": 0.2, "rib_axis": Vector3(0, 1, 0), "rib_spacing": 0.8,
			"rib_strength": 0.08, "up_axis": Vector3(0, 0, 1), "across_axis": Vector3(0, 1, 0),
			"streak_strength": 0.14})
	var hangars: Array[Dictionary] = []
	for h in 2:
		var hangar := Node3D.new()
		hangar.position = Vector3(110, 0, -90 + h * 65)
		root.add_child(hangar)
		hangars.append({"node": hangar, "hp": 350.0, "destroyed": false})
		_add(hangar, _box(40, 14, 50), hangar_mat, Vector3(0, 7, 0))
		# shortcut: full cylinder (JS used a half-cylinder); the lower half is hidden inside the box / pad
		_add(hangar, _cyl(20, 20, 50, 16), roof_mat, Vector3(0, 14, 0), Vector3(PI / 2.0, 0, 0))

	if is_desert:
		# Sandbag revetments around the desert hangars
		var bag_mat := _mat(Color("c8a96e"), 0.95)
		_add(root, _box(4, 1.8, 120), bag_mat, Vector3(88, 0.9, -60))
		_add(root, _box(4, 1.8, 120), bag_mat, Vector3(132, 0.9, -60))

	# 5. Runway edge lights: green threshold, red far end, white between (bright enough to bloom)
	var light := _cyl(0.3, 0.3, 1, 6)
	var white := _unshaded(Color(2.5, 2.5, 2.5))
	var green := _unshaded(Color(0.4, 2.4, 0.9))
	var red := _unshaded(Color(2.6, 0.5, 0.5))
	var light_mats: Array[StandardMaterial3D] = [white, green, red]
	var half_l: float = af.length / 2.0
	var half_w: float = af.width / 2.0 + 1.5
	var z := -half_l
	while z <= half_l:
		var m := green if z == -half_l else (red if z == half_l else white)
		for side in [-half_w, half_w]:
			_add(root, light, m, Vector3(side, 0.5, z), Vector3.ZERO, false)
		z += 45.0

	# 6. Windsock, coloured by team
	_add(root, _cyl(0.3, 0.4, 14, 8), _mat(Color("9ca3af"), 0.6), Vector3(-af.width / 2.0 - 10.0, 7, 0))
	var sock_mat := _mat(FRIENDLY, 0.8)
	var sock := _cyl(0.0, 2.0, 6, 8)
	_add(root, sock, sock_mat, Vector3(-af.width / 2.0 - 7.0, 13, 0), Vector3(0, 0, PI / 2.0))

	return {"node": root, "rotor": rotor, "dome_mat": dome_mat, "glow_mat": glow_mat,
			"beam_mat": beam_mat, "sock_mat": sock_mat, "tower": tower, "tower_hp": 400.0,
			"tower_destroyed": false, "hangars": hangars, "light_mats": light_mats}


# =====================================================================================
# Bomb damage (damageAirfield)
# =====================================================================================

## Apply one bomb impact to airfield i. Returns banners as [[text, is_kill], ...].
## grounded_teams: enemy teams based here (for the "can no longer respawn" banner).
func damage_airfield(i: int, impact: Vector3, blast_radius: float, grounded_teams := 0) -> Array:
	var events := []
	var af: Dictionary = World.airports[i]
	var site := _sites[i]
	var root: Node3D = site.node
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	var damaged := false

	# Control tower (400 HP)
	if not site.tower_destroyed:
		var tw := root.to_global(Vector3(130, 24, 45))
		var dist := impact.distance_to(tw)
		if dist <= blast_radius + 25.0:
			site.tower_hp -= roundf(600.0 * (1.0 - dist / (blast_radius + 25.0)))
			damaged = true
			if site.tower_hp <= 0.0:
				site.tower_destroyed = true
				ballistics.explosion_at(tw, 3.2)
				var tower: Node3D = site.tower
				tower.rotation = Vector3(0.15, 0.0, 0.28)  # leaning wreck
				tower.position.y -= 3.5
				site.dome_mat.albedo_color = Color("18181b")
				site.glow_mat.albedo_color.a = 0.0
				site.beam_mat.albedo_color.a = 0.0
				events.append(["AIRFIELD TOWER COLLAPSED (%s)! +350 PTS" % af.code, true])
			else:
				events.append(["AIRFIELD TOWER HIT (%s)!" % af.code, false])

	# Hangars (350 HP each): flattened and scorched when destroyed
	for hangar in site.hangars:
		if hangar.destroyed:
			continue
		var node: Node3D = hangar.node
		var hp_pos := node.global_position
		var dist := impact.distance_to(hp_pos)
		if dist <= blast_radius + 20.0:
			hangar.hp -= roundf(550.0 * (1.0 - dist / (blast_radius + 20.0)))
			damaged = true
			if hangar.hp <= 0.0:
				hangar.destroyed = true
				ballistics.explosion_at(hp_pos, 3.0)
				node.scale = Vector3(1.0, 0.45, 1.0)
				node.position.y -= 2.0
				var scorched := _mat(Color("1c1917"), 0.95)
				for part in node.get_children():
					(part as MeshInstance3D).material_override = scorched
				events.append(["AIRFIELD HANGAR DESTROYED (%s)! +300 PTS" % af.code, true])

	# Any hit inside the compound counts against the base
	var loc := World.world_to_airfield_local(af, impact.x, impact.z)
	if loc.x > -af.width / 2.0 - 40.0 and loc.x < 190.0 and absf(loc.y) < af.length / 2.0 + 40.0:
		damaged = true

	# Only enemy bases lose integrity
	if damaged and not af.is_destroyed and af.team == "enemy":
		af.hp -= 400.0
		if af.hp <= 0.0:
			af.is_destroyed = true
			af.team = "destroyed"
			for m in site.light_mats:
				(m as StandardMaterial3D).albedo_color = Color("18181b")
			update_visuals()
			ballistics.explosion_at(Vector3(af.x, af.elevation + 2.0, af.z), 4.5)
			events.append(["ENEMY AIRFIELD DESTROYED: %s (%s)! %d ENEMY TEAM%s CAN NO LONGER RESPAWN +1000 PTS" % [
					String(af.name).to_upper(), af.code, grounded_teams, "" if grounded_teams == 1 else "S"], true])
		else:
			events.append(["%s HIT — BASE INTEGRITY %d%%" % [af.code, roundi(af.hp / af.max_hp * 100.0)], false])
	return events


func _runway_number(root: Node3D, text: String, length: float, end: float) -> void:
	# Texture rows 220 / 1850 of 2048 -> ~0.39 L from the centre; "27" faces the other way
	var label := Label3D.new()
	label.text = text
	label.font_size = 256
	label.pixel_size = 0.03
	label.modulate = Color(0.8, 0.79, 0.75)  # sun-faded, matches the runway shader's worn paint
	label.outline_size = 0
	label.shaded = true
	label.double_sided = false
	label.position = Vector3(0, 0.15, end * length * 0.39)
	# Flat on the runway, readable when approaching from that end
	label.rotation = Vector3(-PI / 2.0, 0.0 if end < 0.0 else PI, 0.0)
	root.add_child(label)


# 512 x 2048 asphalt strip: edge lines, centre dashes, piano keys, touchdown zones (createRunwayTexture).
# The runway shader only uses it as a paint mask (green channel); asphalt and wear are procedural.
func _make_runway_texture() -> ImageTexture:
	var img := Image.create(512, 2048, false, Image.FORMAT_RGBA8)
	img.fill(Color("26292b"))
	var rng := RandomNumberGenerator.new()
	rng.seed = 909
	var speck := Color("2b2e30")
	for i in 4000:  # pavement noise
		img.fill_rect(Rect2i(rng.randi_range(0, 510), rng.randi_range(0, 2044), 2, 4), speck)
	var paint := Color.WHITE
	img.fill_rect(Rect2i(20, 0, 8, 2048), paint)
	img.fill_rect(Rect2i(512 - 28, 0, 8, 2048), paint)
	var y := 100
	while y < 1950:
		img.fill_rect(Rect2i(256 - 7, y, 14, 80), Color("f8fafc"))
		y += 130
	for i in 16:
		img.fill_rect(Rect2i(60 + i * 24, 50, 14, 90), paint)
		img.fill_rect(Rect2i(60 + i * 24, 2048 - 140, 14, 90), paint)
	for i in 3:
		img.fill_rect(Rect2i(100, 320 + i * 160, 40, 70), paint)
		img.fill_rect(Rect2i(512 - 140, 320 + i * 160, 40, 70), paint)
		img.fill_rect(Rect2i(100, 2048 - (390 + i * 160), 40, 70), paint)
		img.fill_rect(Rect2i(512 - 140, 2048 - (390 + i * 160), 40, 70), paint)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


# --- small builders ---

func _add(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, shadows := true) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	return mi


func _mat(color: Color, roughness: float, metallic := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	m.metallic = metallic
	return m


func _shader_mat(shader: Shader, params: Dictionary) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = shader
	for k in params:
		m.set_shader_parameter(k, params[k])
	return m


func _unshaded(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = color
	return m


func _plane(w: float, l: float) -> PlaneMesh:
	var p := PlaneMesh.new()
	p.size = Vector2(w, l)
	return p


func _box(x: float, y: float, z: float) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(x, y, z)
	return b


func _cyl(top: float, bottom: float, height: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segments
	return c
