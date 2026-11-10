class_name World
extends Node3D
## World foundation, ported from game.js:
##   CONFIG + map data (AIRPORTS, DOCKS, ROAD_LINKS), getTerrainInfo / getIslandHeight / getTerrainHeight,
##   placeDocksOnShore, orientAirfieldsTowardHarbors, and the environment half of buildScene()
##   (lights, sky, fog, sea, terrain mesh).
## Coordinates are identical to the Three.js version: both are right-handed, Y-up, metres.
## Other systems query the ground with World.get_terrain_height(x, z), exactly like the JS code.

# --- Configuration (CONFIG in game.js) ---
const MAP_SCALE := 4.0
const WORLD_WIDTH := 4440.0 * MAP_SCALE   # 17,760 m along X
const WORLD_LENGTH := 3090.0 * MAP_SCALE  # 12,360 m along Z
const MIN_X := -2220.0 * MAP_SCALE
const MAX_X := 2220.0 * MAP_SCALE
const MIN_Z := -1545.0 * MAP_SCALE
const MAX_Z := 1545.0 * MAP_SCALE
const SEA_LEVEL := 0.0
const AIRFIELD_ELEVATION := 10.0
const MAX_ALTITUDE := 2800.0
const GRAVITY := 9.81 * 2.0

# ~40 m terrain grid, same as the JS PlaneGeometry(…, 440, 320)
const TERRAIN_SEGMENTS_X := 440
const TERRAIN_SEGMENTS_Z := 320

# Runway sizes per game mode; the terrain pad is always flattened for the larger (factions) size
const AIRFIELD_SIZES := {
	"classic": {"length": 650.0, "width": 48.0},
	"factions": {"length": 900.0, "width": 64.0},
}

# --- 4 operational airfields (AIRPORTS in game.js) ---
static var airports: Array[Dictionary] = [
	{"id": "north", "name": "North Desert Airfield", "code": "AF1", "island": "North Sand Island",
	 "x": -832.5 * MAP_SCALE, "z": -1350.0 * MAP_SCALE, "elevation": AIRFIELD_ELEVATION,
	 "heading_deg": 0.0, "heading_rad": 0.0, "length": 650.0, "width": 48.0,
	 "spawn_x": -832.5 * MAP_SCALE, "spawn_z": -1350.0 * MAP_SCALE - 220.0, "spawn_heading": 0.0, "team": "friendly"},
	{"id": "northeast", "name": "NE Coastal Wing", "code": "AF2", "island": "Northeast Hook Island",
	 "x": 1702.5 * MAP_SCALE, "z": -1080.0 * MAP_SCALE, "elevation": AIRFIELD_ELEVATION,
	 "heading_deg": 90.0, "heading_rad": PI / 2.0, "length": 650.0, "width": 48.0,
	 "spawn_x": 1702.5 * MAP_SCALE - 220.0, "spawn_z": -1080.0 * MAP_SCALE, "spawn_heading": 90.0, "team": "enemy"},
	{"id": "west", "name": "West Emerald Outpost", "code": "AF3", "island": "West Crescent Island",
	 "x": -1492.5 * MAP_SCALE, "z": 352.5 * MAP_SCALE, "elevation": AIRFIELD_ELEVATION,
	 "heading_deg": 90.0, "heading_rad": PI / 2.0, "length": 650.0, "width": 48.0,
	 "spawn_x": -1492.5 * MAP_SCALE - 220.0, "spawn_z": 352.5 * MAP_SCALE, "spawn_heading": 90.0, "team": "enemy"},
	{"id": "southeast", "name": "SE Fortress Base", "code": "AF4", "island": "Southeast Rocky Island",
	 "x": 1267.5 * MAP_SCALE, "z": 1117.5 * MAP_SCALE, "elevation": AIRFIELD_ELEVATION,
	 "heading_deg": 90.0, "heading_rad": PI / 2.0, "length": 650.0, "width": 48.0,
	 "spawn_x": 1267.5 * MAP_SCALE - 220.0, "spawn_z": 1117.5 * MAP_SCALE, "spawn_heading": 90.0, "team": "enemy"},
]

# --- Harbor docks (DOCKS in game.js); x/z/angle are moved onto real shorelines by place_docks_on_shore() ---
static var docks: Array[Dictionary] = [
	{"id": "dock_north", "name": "North Desert Supply Port", "x": -270.0 * MAP_SCALE, "z": -465.0 * MAP_SCALE,
	 "pier_length": 160.0, "pier_width": 18.0, "angle": 0.0, "ship_type": "freighter"},
	{"id": "dock_northeast", "name": "NE Naval Slip", "x": 1155.0 * MAP_SCALE, "z": -570.0 * MAP_SCALE,
	 "pier_length": 160.0, "pier_width": 18.0, "angle": -0.75 * PI, "ship_type": "gunboat"},
	{"id": "dock_west", "name": "Emerald Cove Docks", "x": -1095.0 * MAP_SCALE, "z": 705.0 * MAP_SCALE,
	 "pier_length": 160.0, "pier_width": 18.0, "angle": 0.5 * PI, "ship_type": "steamer"},
	{"id": "dock_southeast_1", "name": "Fortress Deepwater Pier A", "x": 1380.0 * MAP_SCALE, "z": 920.0 * MAP_SCALE,
	 "pier_length": 160.0, "pier_width": 18.0, "angle": PI, "ship_type": "destroyer"},
	{"id": "dock_southeast_2", "name": "Fortress Deepwater Pier B", "x": 1680.0 * MAP_SCALE, "z": 920.0 * MAP_SCALE,
	 "pier_length": 160.0, "pier_width": 18.0, "angle": PI, "ship_type": "gunboat"},
]

# Supply roads: each airfield's apron to the landward end of its harbor pier
const ROAD_LINKS := [
	{"airfield": "north", "dock": "dock_north"},
	{"airfield": "northeast", "dock": "dock_northeast"},
	{"airfield": "west", "dock": "dock_west"},
	{"airfield": "southeast", "dock": "dock_southeast_1"},
]

# Docks/airfields are mutated once at startup; a second World instance must not move them again
static var _map_resolved := false

# Team home bases, rolled at the start of every game (assignRandomTeamBases)
static var current_airfield := 0
static var enemy_home_airfields: Array[int] = []

var terrain_mesh: MeshInstance3D
var sea_mesh: MeshInstance3D
var sea_mat: ShaderMaterial
var sun: DirectionalLight3D
var env: Environment
var sky_mat: ProceduralSkyMaterial
var clouds: Clouds

## Mission lighting presets (art bible §2). One is rolled per sortie; the menu always uses "afternoon".
const LIGHTING_PRESETS := ["dawn", "noon", "afternoon", "sunset", "partly_cloudy"]
## elev = sun elevation in degrees; fog density kept low so aircraft at 1.5 km stay readable.
const LIGHTING_PRESET_DATA := {
	"dawn": {"elev": 12.0, "sun": "ffc89a", "energy": 0.8, "top": "2a4f8a", "horizon": "f2c6a0",
		"fog": "c9d3e0", "fog_density": 0.000035, "ambient": 1.1, "glow": 0.3, "sat": 1.0, "amb_col": "e8c8b0", "amb_sky": 0.6, "sea_glint": 0.5, "sea_tint": "ffb59a", "sea_patch": 0.0, "sea_wave_speed": 0.8, "cloud": 0.25},
	"noon": {"elev": 70.0, "sun": "fffaed", "energy": 1.3, "top": "19559c", "horizon": "99c4eb",
		"fog": "a0d8ef", "fog_density": 0.00002, "ambient": 0.75, "glow": 0.2, "sat": 1.0, "sea_glint": 0.6, "sea_tint": "ffffff", "sea_patch": 0.0, "sea_wave_speed": 1.0, "cloud": 0.2},
	"afternoon": {"elev": 25.0, "sun": "ffe4bf", "energy": 1.15, "top": "1d5fa6", "horizon": "a8cbe8",
		"fog": "b4d6e8", "fog_density": 0.00002, "ambient": 0.7, "glow": 0.3, "sat": 1.0, "sea_glint": 0.5, "sea_tint": "ffd9a0", "sea_patch": 0.0, "sea_wave_speed": 1.0, "cloud": 0.3},
	"sunset": {"elev": 8.0, "sun": "ff9a4d", "energy": 0.8, "top": "2b3f73", "horizon": "ffb27a",
		"fog": "e0a988", "fog_density": 0.000035, "ambient": 1.1, "glow": 0.25, "sat": 0.85, "amb_col": "d9a888", "amb_sky": 0.6, "sea_glint": 0.65, "sea_tint": "ff8a3a", "sea_patch": 0.0, "sea_wave_speed": 0.9, "cloud": 0.35},
	"partly_cloudy": {"elev": 50.0, "sun": "fff6e5", "energy": 1.0, "top": "2a63a0", "horizon": "b9cfdf",
		"fog": "bcccd8", "fog_density": 0.00003, "ambient": 0.8, "glow": 0.25, "sat": 0.95, "sea_glint": 0.35, "sea_tint": "fff0d8", "sea_patch": 0.9, "sea_wave_speed": 1.1, "cloud": 0.75},
}
const SUN_AZIMUTH_DEG := 40.0  # 0 = +Z; keeps low suns off the axis of the menu camera
const SEA_COLOR := Color("165b7e")
## Preset currently applied (read by other systems, e.g. a future sea shader).
static var lighting_preset := "afternoon"
var ballistics: Ballistics
var airfields: Airfields
var defenses: Defenses
var menu_camera: MenuCamera
var main_menu: MainMenu
var _sortie: Sortie  # everything that exists only during a sortie (player, AI, cameras, HUD, pause)


func _ready() -> void:
	# Order matters (same as buildScene): harbors snap to shores before the terrain carves their basins
	if not _map_resolved:
		place_docks_on_shore()
		orient_airfields_toward_harbors()
		_map_resolved = true
	_build_environment()
	_build_sun()
	_build_sea()
	_build_terrain()
	_build_seabed_skirt()
	var desert := DesertEnvironment.new()
	desert.name = "DesertEnvironment"
	add_child(desert)
	clouds = Clouds.new()
	add_child(clouds)
	var harbors := Harbors.new()
	harbors.name = "Harbors"
	add_child(harbors)
	var roads := Roads.new()
	roads.name = "Roads"
	add_child(roads)
	var trees := Trees.new()
	trees.name = "Trees"
	add_child(trees)
	_build_persistent_systems()
	open_main_menu()


# =====================================================================================
# Environment (Forward+): sky, fog, tonemapping, glow, SSAO, shadowed sun
# =====================================================================================

func _build_environment() -> void:
	# Replaces the JS canvas-gradient sky dome; sun disc follows the DirectionalLight3D automatically
	sky_mat = ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("19559c")
	sky_mat.sky_horizon_color = Color("99c4eb")
	sky_mat.sky_curve = 0.12
	# Ground half blends sea into haze (old #d1e6fa read as a white band under the horizon)
	sky_mat.ground_bottom_color = SEA_COLOR
	sky_mat.ground_curve = 0.04

	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256

	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	# HemisphereLight(0xffffff, 0x3d5a45, 0.7) -> sky-driven ambient
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.7
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY

	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.0

	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_bloom = 0.04
	env.glow_hdr_threshold = 1.0

	env.ssao_enabled = true
	env.ssao_radius = 2.0
	env.ssao_intensity = 1.5

	# FogExp2(0xa0d8ef, 0.000045): roughly the same haze at 10 km with Godot's exponential fog
	env.fog_enabled = true
	env.fog_light_color = Color("a0d8ef")
	env.fog_density = 0.00002
	env.fog_aerial_perspective = 0.4
	env.fog_sky_affect = 0.0  # JS sky dome had fog: false

	var world_env := WorldEnvironment.new()
	world_env.name = "WorldEnvironment"
	world_env.environment = env
	add_child(world_env)


func _build_sun() -> void:
	# DirectionalLight(0xfffaed, 1.2) at (1200, 2400, 1400) aimed at the origin
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = Color("fffaed")
	sun.light_energy = 1.2
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 4000.0
	sun.directional_shadow_blend_splits = true
	add_child(sun)
	sun.look_at_from_position(Vector3(1200.0, 2400.0, 1400.0), Vector3.ZERO, Vector3.UP)


func _build_sea() -> void:
	var plane := PlaneMesh.new()
	# Extends far past the map so the sea edge never shows against the sky at altitude
	plane.size = Vector2(WORLD_WIDTH, WORLD_LENGTH) * 6.0

	sea_mat = ShaderMaterial.new()
	sea_mat.shader = load("res://shaders/sea.gdshader")
	var mat := sea_mat

	sea_mesh = MeshInstance3D.new()
	sea_mesh.name = "Sea"
	sea_mesh.mesh = plane
	sea_mesh.material_override = mat
	sea_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	sea_mesh.position.y = SEA_LEVEL
	add_child(sea_mesh)


# =====================================================================================
# Game flow: main menu <-> sortie (launchSortieFromMainMenu / returnToMainMenu)
# =====================================================================================

# Things that live for the whole session: bullets/effects, airfields, menu camera, main menu
func _build_persistent_systems() -> void:
	ballistics = Ballistics.new()
	ballistics.name = "Ballistics"
	add_child(ballistics)

	assign_random_team_bases()
	airfields = Airfields.new()
	airfields.name = "Airfields"
	add_child(airfields)
	airfields.build()

	defenses = Defenses.new()
	defenses.name = "Defenses"
	add_child(defenses)
	defenses.build()

	menu_camera = MenuCamera.new()
	menu_camera.name = "MenuCamera"
	add_child(menu_camera)

	main_menu = MainMenu.new()
	main_menu.name = "MainMenu"
	add_child(main_menu)
	main_menu.launch_requested.connect(start_sortie)


## Apply one of LIGHTING_PRESETS: sun direction/colour/energy, sky, fog, ambient and glow.
## warm_grade = true adds the fixed main-menu warmth on top.
func apply_lighting_preset(preset: String, warm_grade := false) -> void:
	if not LIGHTING_PRESET_DATA.has(preset):
		push_warning("Unknown lighting preset '%s', using afternoon" % preset)
		preset = "afternoon"
	var d: Dictionary = LIGHTING_PRESET_DATA[preset]
	lighting_preset = preset
	var fog_col := Color(d.fog)
	var sun_col := Color(d.sun)
	if warm_grade:
		sun_col = sun_col.lerp(Color("ffd9a8"), 0.35)
	sun.light_color = sun_col
	sun.light_energy = d.energy
	sun.rotation = Vector3(-deg_to_rad(d.elev), deg_to_rad(SUN_AZIMUTH_DEG), 0.0)
	sky_mat.sky_top_color = Color(d.top)
	sky_mat.sky_horizon_color = Color(d.horizon)
	sky_mat.ground_horizon_color = fog_col.lerp(SEA_COLOR, 0.35)
	env.fog_light_color = fog_col
	env.fog_density = d.fog_density
	env.ambient_light_energy = d.ambient
	# Low suns give ~0 diffuse on flat terrain; a warm flat ambient keeps targets readable
	env.ambient_light_color = Color(d.get("amb_col", "ffffff"))
	env.ambient_light_sky_contribution = d.get("amb_sky", 1.0)
	env.glow_intensity = d.glow
	if sea_mat:
		sea_mat.set_shader_parameter("glint_strength", d.sea_glint)
		sea_mat.set_shader_parameter("glint_tint", Color(d.sea_tint))
		sea_mat.set_shader_parameter("patchiness", d.sea_patch)
		sea_mat.set_shader_parameter("wave_speed", d.sea_wave_speed)
	if clouds:
		# unlit side = sky-tinted ambient; lit side = sun colour scaled by energy
		clouds.apply_preset(d.cloud, sun_col * minf(d.energy, 1.1), sun.global_transform.basis.z,
			Color(d.horizon).lerp(Color(d.top), 0.2) * 1.0)
	env.adjustment_enabled = warm_grade or d.sat != 1.0
	env.adjustment_saturation = d.sat * (1.08 if warm_grade else 1.0)


## Main menu: no aircraft exist, the panorama camera drifts over the islands, menu music plays
func open_main_menu() -> void:
	apply_lighting_preset("afternoon", true)
	main_menu.open()
	menu_camera.start()


## Roll home bases and start a sortie (launchSortieFromMainMenu)
func start_sortie(pilot_name: String, plane_id: String, team_size: int) -> void:
	if _sortie:
		return
	main_menu.close()
	apply_lighting_preset(LIGHTING_PRESETS.pick_random())
	get_tree().paused = false
	ballistics.clear()
	assign_random_team_bases()
	airfields.build()  # fresh, undamaged bases for the new game (assignRandomTeamBases)
	defenses.build()  # JS left balloons / batteries destroyed across games; reset them with the bases
	_sortie = Sortie.new(pilot_name, plane_id, team_size)
	_sortie.airfields = airfields
	_sortie.defenses = defenses
	add_child(_sortie)
	_sortie.main_menu_requested.connect(return_to_main_menu)
	_sortie.retry_requested.connect(retry_sortie.bind(pilot_name, plane_id, team_size))


func _end_sortie() -> void:
	get_tree().paused = false
	if _sortie:
		remove_child(_sortie)  # out of the tree now, so the next sortie never sees it
		_sortie.queue_free()
		_sortie = null
	ballistics.clear()


## Despawn everything and go back to the menu (returnToMainMenu)
func return_to_main_menu() -> void:
	_end_sortie()
	assign_random_team_bases()
	airfields.build()  # fresh, undamaged bases for the new game (assignRandomTeamBases)
	defenses.build()  # JS left balloons / batteries destroyed across games; reset them with the bases
	open_main_menu()


## Fresh sortie with the same pilot, aircraft and team size, full lives (retryNewSortie)
func retry_sortie(pilot_name: String, plane_id: String, team_size: int) -> void:
	_end_sortie()
	start_sortie(pilot_name, plane_id, team_size)


# =====================================================================================
# Terrain mesh (buildTerrain): height grid + vertex colours + detail texture
# =====================================================================================

const C_OASIS := Color("3d7b2e")
const C_MESA_HIGH := Color("994622")
const C_MESA_LOW := Color("b56333")
const C_DUNE_CREST := Color(0.98, 0.86, 0.58)
const C_DUNE_FACE := Color(0.92, 0.74, 0.40)
const C_DUNE_SLIP := Color(0.82, 0.59, 0.30)
const C_GRANITE_LIGHT := Color("d6dce5")
const C_GRANITE_DARK := Color("565c66")
const C_MEADOW := Color("3e7b36")
const C_FOREST := Color("2f6029")
const C_RIDGE := Color("5b625c")
const C_BEACH_DESERT := Color("f3dd9a")
const C_BEACH_GREEN := Color("e4d8a5")
const C_SHALLOW := Color(0.50, 0.78, 0.72)
const C_DEEP := Color(0.09, 0.36, 0.49)


func _build_terrain() -> void:
	var cols := TERRAIN_SEGMENTS_X + 1
	var rows := TERRAIN_SEGMENTS_Z + 1
	var step_x := WORLD_WIDTH / TERRAIN_SEGMENTS_X
	var step_z := WORLD_LENGTH / TERRAIN_SEGMENTS_Z
	var count := cols * rows

	var heights := PackedFloat32Array()
	heights.resize(count)
	for r in rows:
		var z := -WORLD_LENGTH * 0.5 + r * step_z
		for c in cols:
			heights[r * cols + c] = get_terrain_height(-WORLD_WIDTH * 0.5 + c * step_x, z)

	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var uvs := PackedVector2Array()
	var biome := PackedByteArray()  # CUSTOM0 RGBA8: sand, mesa, rock, forest weights
	biome.resize(count * 4)
	verts.resize(count)
	normals.resize(count)
	colors.resize(count)
	uvs.resize(count)

	for r in rows:
		var z := -WORLD_LENGTH * 0.5 + r * step_z
		var r0 := maxi(r - 1, 0)
		var r1 := mini(r + 1, rows - 1)
		for c in cols:
			var i := r * cols + c
			var x := -WORLD_WIDTH * 0.5 + c * step_x
			var y := heights[i]
			verts[i] = Vector3(x, y, z)
			uvs[i] = Vector2(float(c) / TERRAIN_SEGMENTS_X, float(r) / TERRAIN_SEGMENTS_Z)

			# Central-difference normal straight from the height grid (replaces computeVertexNormals)
			var c0 := maxi(c - 1, 0)
			var c1 := mini(c + 1, cols - 1)
			var dhdx := (heights[r * cols + c1] - heights[r * cols + c0]) / ((c1 - c0) * step_x)
			var dhdz := (heights[r1 * cols + c] - heights[r0 * cols + c]) / ((r1 - r0) * step_z)
			normals[i] = Vector3(-dhdx, 1.0, -dhdz).normalized()

			colors[i] = _terrain_color(x, z, y)
			biome[i * 4] = int(_biome_out.r * 255.0)
			biome[i * 4 + 1] = int(_biome_out.g * 255.0)
			biome[i * 4 + 2] = int(_biome_out.b * 255.0)
			biome[i * 4 + 3] = int(_biome_out.a * 255.0)

	# Two clockwise (Godot front-face) triangles per grid cell
	var indices := PackedInt32Array()
	indices.resize(TERRAIN_SEGMENTS_X * TERRAIN_SEGMENTS_Z * 6)
	var k := 0
	for r in TERRAIN_SEGMENTS_Z:
		for c in TERRAIN_SEGMENTS_X:
			var a := r * cols + c
			var b := a + 1
			var d := a + cols
			var e := d + 1
			indices[k] = a; indices[k + 1] = b; indices[k + 2] = d
			indices[k + 3] = b; indices[k + 4] = e; indices[k + 5] = d
			k += 6

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_CUSTOM0] = biome
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], {},
			Mesh.ARRAY_CUSTOM_RGBA8_UNORM << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT)

	# Visual upgrade over the JS: per-biome procedural detail replaces the flat detail texture
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/terrain.gdshader")

	terrain_mesh = MeshInstance3D.new()
	terrain_mesh.name = "Terrain"
	terrain_mesh.mesh = mesh
	terrain_mesh.material_override = mat
	add_child(terrain_mesh)


var _biome_out := Color(0, 0, 0, 0)  # biome weights of the last _terrain_color call (r sand, g mesa, b rock, a forest)


## Per-vertex land colour, same rules as the colour loop in buildTerrain(); also sets _biome_out.
## Beach and shallow-water blending moved to terrain.gdshader (per pixel, no staircase).
func _terrain_color(vx: float, vz: float, vy: float) -> Color:
	var info := get_terrain_info(vx, vz)
	var color: Color
	if info.f1 > 0.04:
		# Island 1 (North): desert dunes, sandstone mesas, oasis
		var nx := vx / MAP_SCALE
		var nz := vz / MAP_SCALE
		var u := nx * 0.85 + nz * 0.52
		var dune_phase := sin(u * 0.0065)
		var crest_factor := cos(u * 0.0065)
		var mesa_noise := sin(nx * 0.0042 + 1.4) * cos(nz * 0.0052 + 0.8)
		var d_oasis := Vector2(nx + 450.0, nz + 980.0).length()
		if d_oasis < 95.0 and vy < SEA_LEVEL + 4.8:
			color = C_OASIS
			_biome_out = Color(0, 0, 0, 0)  # meadow detail
		elif mesa_noise > 0.32 and vy > 40.0:
			color = C_MESA_HIGH if vy > 58.0 else C_MESA_LOW
			_biome_out = Color(0, 1, 0, 0)
		else:
			if crest_factor > 0.55:
				color = C_DUNE_CREST
			elif dune_phase > 0.0:
				color = C_DUNE_FACE
			else:
				color = C_DUNE_SLIP
			_biome_out = Color(1, 0, 0, 0)
	elif info.f4 > 0.08 and vy > 70.0:
		# Island 4: granite peak
		color = C_GRANITE_LIGHT if vy > 145.0 else C_GRANITE_DARK
		_biome_out = Color(0, 0, 1, 0)
	elif vy < 45.0:
		color = C_MEADOW
		_biome_out = Color(0, 0, 0, 0)
	elif vy < 100.0:
		color = C_FOREST
		_biome_out = Color(0, 0, 0, 1)
	else:
		color = C_RIDGE
		_biome_out = Color(0, 0, 1, 0)
	if info.f1 > 0.04 and _biome_out.r + _biome_out.g == 0.0:
		_biome_out.r = 0.01  # oasis: still a desert island for the shader's beach colour pick
	return color


## Deep seabed beyond the terrain mesh: a ring sloping from the map-edge seabed (-15 m) to -80 m
## over 4 km, then flat out to the sea plane's extent, so the sea's depth tint has no seam at the map edge.
func _build_seabed_skirt() -> void:
	const RAMP := 4000.0
	const DEEP_Y := -80.0
	var hx := WORLD_WIDTH * 0.5
	var hz := WORLD_LENGTH * 0.5
	var rings := [
		[Vector2(hx, hz), SEA_LEVEL - 15.0],
		[Vector2(hx + RAMP, hz + RAMP), DEEP_Y],
		[Vector2(WORLD_WIDTH, WORLD_LENGTH) * 3.0, DEEP_Y],
	]
	var corners := [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_color(C_DEEP)
	st.set_normal(Vector3.UP)
	for ri in 2:
		for ci in 4:
			var q: Array[Vector3] = []
			for pair in [[ri, ci], [ri, (ci + 1) % 4], [ri + 1, (ci + 1) % 4], [ri + 1, ci]]:
				var ring: Array = rings[pair[0]]
				var cc: Vector2 = corners[pair[1]] * (ring[0] as Vector2)
				q.append(Vector3(cc.x, ring[1], cc.y))
			# inner edge (ri) to outer edge (ri + 1); winding chosen so the faces point up
			st.add_vertex(q[0]); st.add_vertex(q[2]); st.add_vertex(q[1])
			st.add_vertex(q[0]); st.add_vertex(q[3]); st.add_vertex(q[2])
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true
	mat.roughness = 1.0
	var skirt := MeshInstance3D.new()
	skirt.name = "SeabedSkirt"
	skirt.mesh = st.commit()
	skirt.material_override = mat
	skirt.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(skirt)


# =====================================================================================
# Terrain queries (static: call World.get_terrain_height(x, z) from any script)
# =====================================================================================

static func dist_to_segment(px: float, pz: float, ax: float, az: float, bx: float, bz: float) -> float:
	var dx := bx - ax
	var dz := bz - az
	var l2 := dx * dx + dz * dz
	if l2 == 0.0:
		return Vector2(px - ax, pz - az).length()
	var t := clampf(((px - ax) * dx + (pz - az) * dz) / l2, 0.0, 1.0)
	return Vector2(px - (ax + t * dx), pz - (az + t * dz)).length()


# World (x, z) -> airfield-local (lx, lz); local +X = apron/tower side, local Z = along the runway
static func world_to_airfield_local(af: Dictionary, x: float, z: float) -> Vector2:
	var c := cos(af.heading_rad)
	var s := sin(af.heading_rad)
	var dx: float = x - af.x
	var dz: float = z - af.z
	return Vector2(dx * c - dz * s, dx * s + dz * c)


static func airfield_local_to_world(af: Dictionary, lx: float, lz: float) -> Vector2:
	var c := cos(af.heading_rad)
	var s := sin(af.heading_rad)
	return Vector2(af.x + lx * c + lz * s, af.z - lx * s + lz * c)


static func is_inside_airfield_compound(x: float, z: float, margin := 45.0) -> bool:
	for af in airports:
		var loc := world_to_airfield_local(af, x, z)
		if loc.x >= -af.width / 2.0 - margin and loc.x <= 185.0 + margin \
				and loc.y >= -af.length / 2.0 - margin and loc.y <= af.length / 2.0 + margin:
			return true
	return false


# Runway plus its take-off / landing corridors
static func is_on_runway_approach(x: float, z: float, half_width := 120.0, overrun := 600.0) -> bool:
	for af in airports:
		var loc := world_to_airfield_local(af, x, z)
		if absf(loc.x) < half_width and absf(loc.y) < af.length / 2.0 + overrun:
			return true
	return false


## Player's team gets one random airfield; the enemy teams share the rest (assignRandomTeamBases)
static func assign_random_team_bases() -> void:
	var order: Array[int] = []
	for i in airports.size():
		order.append(i)
	order.shuffle()
	current_airfield = order[0]
	enemy_home_airfields = order.slice(1)
	for i in airports.size():
		airports[i].team = "friendly" if i == current_airfield else "enemy"
		airports[i].side_key = "friendly" if i == current_airfield else ""


# Index of the runway (plus a small apron/overrun margin) under (x, z), or -1
static func get_airfield_under(x: float, z: float) -> int:
	for i in airports.size():
		var af: Dictionary = airports[i]
		var loc := world_to_airfield_local(af, x, z)
		if absf(loc.x) <= af.width / 2.0 + 10.0 and absf(loc.y) <= af.length / 2.0 + 45.0:
			return i
	return -1


static func is_near_airfield_or_harbor(x: float, z: float) -> bool:
	for af in airports:
		if Vector2(x - af.x, z - af.z).length() < af.length / 2.0 + 400.0:
			return true
	for d in docks:
		if Vector2(x - d.x, z - d.z).length() < d.pier_length + 250.0:
			return true
	return false


# Influence of each of the 4 islands: f1..f4 in [0, 1]; reach > 0 on land, < 0 offshore
static func get_terrain_info(x: float, z: float) -> Dictionary:
	var nx := x / MAP_SCALE
	var nz := z / MAP_SCALE

	# Island 1: North Sand Desert
	var dx1 := (nx + 280.0) / 1200.0
	var dz1 := (nz + 1080.0) / 600.0
	var d_north_lobe := Vector2((nx + 832.5) / 220.0, (nz + 1400.0) / 240.0).length()
	var r1 := 1.0 - minf(sqrt(dx1 * dx1 + dz1 * dz1), d_north_lobe)

	# Island 2: NE Hook
	var r2 := 1.0 - minf(dist_to_segment(nx, nz, 1755, -1545, 1755, -800),
			dist_to_segment(nx, nz, 1755, -800, 1155, -570)) / 360.0

	# Island 3: West Crescent
	var r3 := 1.0 - minf(dist_to_segment(nx, nz, -1395, -45, -1620, 705),
			dist_to_segment(nx, nz, -1620, 705, -1920, 1455)) / 420.0

	# Island 4: SE Rocky Island
	var r4 := 1.0 - minf(dist_to_segment(nx, nz, 630, 1155, 1455, 1230),
			dist_to_segment(nx, nz, 1455, 1230, 2130, 1455)) / 420.0

	return {
		"f1": maxf(0.0, r1), "f2": maxf(0.0, r2), "f3": maxf(0.0, r3), "f4": maxf(0.0, r4),
		"reach": maxf(maxf(r1, r2), maxf(r3, r4)),
	}


# Natural island height only (no airfield pads or harbor dredging)
static func get_island_height(x: float, z: float) -> float:
	var info := get_terrain_info(x, z)
	var max_factor := maxf(maxf(info.f1, info.f2), maxf(info.f3, info.f4))

	# Seabed shelves from just below sea level at the coast to -18 m offshore (~120 m wide)
	if max_factor <= 0.0:
		var offshore := minf(1.0, -info.reach / 0.08)
		return SEA_LEVEL - 0.6 - 17.4 * offshore

	var nx := x / MAP_SCALE
	var nz := z / MAP_SCALE
	var raw_h := 0.0

	if info.f1 > 0.0:
		# Island 1 (North): barchan dunes, wind ripples, sandstone mesas, oasis basin
		var u := nx * 0.85 + nz * 0.52
		var v := -nx * 0.52 + nz * 0.85
		var dune_wave := sin(u * 0.0065 + sin(v * 0.0028) * 1.6)
		var barchan := signf(dune_wave) * pow(absf(dune_wave), 0.78) * 35.0
		var cross_ridge := sin(u * 0.014 - v * 0.008) * 14.0 + cos(u * 0.022 + v * 0.016) * 7.0
		var mesa_noise := sin(nx * 0.0042 + 1.4) * cos(nz * 0.0052 + 0.8)
		var mesa := maxf(0.0, tanh((mesa_noise - 0.22) * 4.0)) * 65.0
		var d_oasis := Vector2(nx + 450.0, nz + 980.0).length()
		var oasis := maxf(0.0, 1.0 - d_oasis / 160.0) * 18.0
		raw_h = maxf(raw_h, (barchan + cross_ridge + mesa + 38.0 - oasis) * pow(info.f1, 1.22))
	if info.f2 > 0.0:
		# Island 2 (NE): coastal hills
		var hills := sin(nx * 0.006) * cos(nz * 0.006) * 55.0 + sin(nx * 0.014 + 0.5) * 18.0
		raw_h = maxf(raw_h, (hills + 48.0) * pow(info.f2, 1.4))
	if info.f3 > 0.0:
		# Island 3 (West): undulating green ridges
		var ridges := sin(nx * 0.005 + 2.0) * cos(nz * 0.006 - 1.0) * 65.0 + sin(nx * 0.012) * 22.0
		raw_h = maxf(raw_h, (ridges + 50.0) * pow(info.f3, 1.4))
	if info.f4 > 0.0:
		# Island 4 (SE): hills and ~220 m rocky peak
		var d_peak := Vector2(nx - 1980.0, nz - 1380.0).length()
		var peak_bonus := maxf(0.0, 1.0 - d_peak / 600.0) * 200.0
		var hills := sin(nx * 0.006 - 0.5) * cos(nz * 0.005 + 1.2) * 48.0
		raw_h = maxf(raw_h, (hills + 45.0 + peak_bonus) * pow(info.f4, 1.3))

	# Dry land always sits clearly above the sea plane (no land/sea z-fighting on flat beaches)
	return maxf(SEA_LEVEL + 0.8, raw_h)


# Final ground height: natural islands + flattened airfield pads + dredged harbor basins
static func get_terrain_height(x: float, z: float) -> float:
	var raw_h := get_island_height(x, z)
	if raw_h <= SEA_LEVEL - 18.0 and not is_near_airfield_or_harbor(x, z):
		return raw_h

	# Airfield compound plateau: flat core (runway, taxiway, apron, tower, hangars) + 80 m blend
	var pad_w: float = AIRFIELD_SIZES.factions.width
	var pad_l: float = AIRFIELD_SIZES.factions.length
	for af in airports:
		var loc := world_to_airfield_local(af, x, z)
		var pad_half_w := maxf(af.width, pad_w) / 2.0
		var pad_half_l := maxf(af.length, pad_l) / 2.0
		var core_min_x := -pad_half_w - 40.0
		var core_max_x := 185.0
		var core_min_z := -pad_half_l - 40.0
		var core_max_z := pad_half_l + 40.0
		var margin := 80.0

		var out_x := 0.0
		if loc.x < core_min_x: out_x = core_min_x - loc.x
		elif loc.x > core_max_x: out_x = loc.x - core_max_x
		var out_z := 0.0
		if loc.y < core_min_z: out_z = core_min_z - loc.y
		elif loc.y > core_max_z: out_z = loc.y - core_max_z

		if out_x < margin and out_z < margin:
			var blend := clampf(1.0 - out_x / margin, 0.0, 1.0) * clampf(1.0 - out_z / margin, 0.0, 1.0)
			raw_h = lerpf(raw_h, AIRFIELD_ELEVATION, blend)

	# Dredged harbor basins (seabed -8 m for ships) over the seaward part of each pier;
	# only ever deepens, and fades out near the pier root so the shoreline stays intact
	for d in docks:
		var bx: float = d.x + sin(d.angle) * d.pier_length * 0.7
		var bz: float = d.z + cos(d.angle) * d.pier_length * 0.7
		var dist := Vector2(x - bx, z - bz).length()
		var radius := 170.0
		if dist < radius:
			var d_root := Vector2(x - d.x, z - d.z).length()
			var keep_shore := clampf((d_root - 30.0) / 50.0, 0.0, 1.0)
			var cut := (1.0 - dist / radius) * keep_shore
			var s := cut * cut * (3.0 - 2.0 * cut)
			raw_h = minf(raw_h, raw_h * (1.0 - s) + (-8.0) * s)

	return maxf(SEA_LEVEL - 15.0, raw_h)


# =====================================================================================
# Map placement (placeDocksOnShore, orientAirfieldsTowardHarbors)
# =====================================================================================

# Move each harbor onto a real shoreline: pier root on low dry land, pier and moored ships over water
static func place_docks_on_shore() -> void:
	var placed: Array[Vector2] = []
	for d in docks:
		var best := _find_shore_spot(d, placed)
		if best.is_empty():
			push_warning("[map] No valid shoreline found for %s; keeping nominal position" % d.id)
		else:
			d.x = best.x
			d.z = best.z
			d.angle = best.angle
		placed.append(Vector2(d.x, d.z))


# Rings of increasing radius around the nominal spot: the first valid spot is the closest one
static func _find_shore_spot(d: Dictionary, placed: Array[Vector2]) -> Dictionary:
	const SEARCH := 1600.0
	const STEP := 20.0
	var pier: float = d.pier_length
	var r := 0.0
	while r <= SEARCH:
		var n := 1 if r == 0.0 else maxi(8, roundi(TAU * r / STEP))
		for q in n:
			var a0 := float(q) / n * TAU
			var x: float = d.x + cos(a0) * r
			var z: float = d.z + sin(a0) * r
			var h := get_island_height(x, z)
			if h < 1.2 or h > 6.0:
				continue
			if is_inside_airfield_compound(x, z, 150.0) or is_on_runway_approach(x, z, 150.0, 450.0):
				continue
			if placed.any(func(p: Vector2) -> bool: return p.distance_to(Vector2(x, z)) < 320.0):
				continue
			for k in 48:
				var a := float(k) / 48.0 * TAU
				if _pier_fits(x, z, sin(a), cos(a), pier):
					return {"x": x, "z": z, "angle": a}
		r += STEP
	return {}


static func _pier_fits(x: float, z: float, sx: float, cz: float, pier: float) -> bool:
	# Cheap probes first: open water at 90 m and past the pier tip, land behind the pier root
	if get_island_height(x + sx * 90.0, z + cz * 90.0) >= 0.0: return false
	if get_island_height(x + sx * (pier + 60.0), z + cz * (pier + 60.0)) >= 0.0: return false
	if get_island_height(x - sx * 40.0, z - cz * 40.0) < 1.0: return false
	# The pier may cross a short beach, but must reach open water within 90 m and stay over it
	var water_at := -1.0
	var t := 5.0
	while t <= 90.0:
		if get_island_height(x + sx * t, z + cz * t) < 0.0:
			water_at = t
			break
		t += 5.0
	if water_at < 0.0:
		return false
	t = water_at
	while t <= pier + 60.0:
		if get_island_height(x + sx * t, z + cz * t) >= 0.0: return false
		t += 15.0
	# Room for the moored ships on both sides of the pier
	t = maxf(50.0, water_at + 20.0)
	while t <= 140.0:
		for side in [-28.0, 28.0]:
			if get_island_height(x + sx * t + cz * side, z + cz * t - sx * side) >= 0.0: return false
		t += 15.0
	return true


# Turn each linked airfield 180° if needed so its apron / tower / hangars face its harbor road
static func orient_airfields_toward_harbors() -> void:
	for link in ROAD_LINKS:
		var af := find_by_id(airports, link.airfield)
		var d := find_by_id(docks, link.dock)
		if world_to_airfield_local(af, d.x, d.z).x < 0.0:
			af.heading_rad = fmod(af.heading_rad + PI, TAU)
			af.heading_deg = fmod(af.heading_deg + 180.0, 360.0)


static func find_by_id(list: Array[Dictionary], id: String) -> Dictionary:
	for item in list:
		if item.id == id:
			return item
	return {}
