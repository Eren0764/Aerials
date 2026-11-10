class_name DesertEnvironment
extends Node3D
## Island 1 desert scenery, ported from buildDesertEnvironment() / updateDesertDust() in game.js:
## oasis pool, date palms (oasis grove + lowland belts), sandstone rocks and mesa boulders,
## dry scrub, and windblown dust motes. Repeated props are MultiMeshInstance3D (one draw per
## mesh surface). Built once in _ready(); World adds it after the terrain and the roads.
## Deviation from the JS: props also stay clear of World.is_near_airfield_or_harbor(), roads and
## runway approaches, so no prop near a base is taller than its targets (art bible Section 6).

const OX := -450.0 * World.MAP_SCALE   # oasis centre (same as the terrain's oasis basin)
const OZ := -980.0 * World.MAP_SCALE
const AREA_CX := -280.0 * World.MAP_SCALE
const AREA_CZ := -1080.0 * World.MAP_SCALE
const PALM_COUNT := 320
const ROCK_COUNT := 320
const SCRUB_COUNT := 280
const DUST_COUNT := 200
const DUST_WIND := Vector2(20.0, 12.0)  # m/s drift (x, z), as the JS

var _dust: MultiMesh
var _dust_pos := PackedVector3Array()


func _ready() -> void:
	_build_oasis()
	_build_palms()
	_build_rocks()
	_build_scrub()
	_build_dust()


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	for i in _dust_pos.size():
		var p := _dust_pos[i]
		p.x += DUST_WIND.x * dt
		p.z += DUST_WIND.y * dt
		if p.x > 360.0 * World.MAP_SCALE: p.x = -920.0 * World.MAP_SCALE
		if p.z > -750.0 * World.MAP_SCALE: p.z = -1410.0 * World.MAP_SCALE
		var ground := World.get_terrain_height(p.x, p.z)
		if p.y < ground + 1.5 or p.y > ground + 45.0:
			p.y = ground + 3.0 + float(i * 3 % 30)
		_dust_pos[i] = p
		_dust.set_instance_transform(i, Transform3D(Basis(), p))


## True where a desert prop may stand: clear of compounds, runway corridors, bases, harbours and the pool.
static func _clear_spot(x: float, z: float, pool_clearance: float) -> bool:
	if World.is_inside_airfield_compound(x, z, 50.0) or World.is_on_runway_approach(x, z):
		return false
	if World.is_near_airfield_or_harbor(x, z):
		return false
	if Vector2(x - OX, z - OZ).length() < pool_clearance:
		return false
	# shortcut: balloon winches and placed defence sites are not checked (defences are built
	# per sortie, after this); add isNearBalloonWinch / isNearPlacedSite once those exist at boot
	# Roads are built before this node (World._ready), so Roads.paths is filled; 14 m margin clears a
	# palm crown or a lowland boulder off the 14 m road and its gravel shoulder
	return not Roads.is_near_road(x, z, 14.0)


func _build_oasis() -> void:
	var cyl := CylinderMesh.new()
	cyl.top_radius = 80.0
	cyl.bottom_radius = 72.0
	cyl.height = 3.0
	cyl.radial_segments = 32
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("14b8a6", 0.9)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 0.12
	mat.metallic = 0.85
	var pool := MeshInstance3D.new()
	pool.name = "OasisPool"
	pool.mesh = cyl
	pool.material_override = mat
	pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	pool.position = Vector3(OX, maxf(World.SEA_LEVEL + 0.8, World.get_terrain_height(OX, OZ) + 0.4), OZ)
	add_child(pool)


func _build_palms() -> void:
	var trunk := _cylinder(0.35, 0.65, 9.5, 7)
	var frond1 := _cylinder(0.0, 5.8, 2.5, 8)
	var frond2 := _cylinder(0.0, 4.5, 2.0, 7)
	var mesh := ArrayMesh.new()
	_add_part(mesh, trunk, 4.75, Color("6e4c2b"), 0.92)
	_add_part(mesh, frond1, 9.8, Color("3d6e27"), 0.78)
	_add_part(mesh, frond2, 10.7, Color("3d6e27"), 0.78)

	var xforms: Array[Transform3D] = []
	for i in 90:  # oasis grove ring
		var ang := randf() * TAU
		var r := 85.0 + randf() * 95.0
		var px := OX + cos(ang) * r
		var pz := OZ + sin(ang) * r
		var py := World.get_terrain_height(px, pz)
		if py < World.SEA_LEVEL + 1.2 or Roads.is_near_road(px, pz, 14.0):
			continue
		xforms.append(_palm_xform(px, py, pz, 0.9 + randf() * 0.55, 0.18))
	var attempts := 0
	while xforms.size() < PALM_COUNT and attempts < 850:
		attempts += 1
		var px := AREA_CX + (randf() - 0.5) * 1150.0 * World.MAP_SCALE
		var pz := AREA_CZ + (randf() - 0.5) * 580.0 * World.MAP_SCALE
		var f1: float = World.get_terrain_info(px, pz).f1
		if f1 < 0.08 or f1 > 0.88:
			continue
		var py := World.get_terrain_height(px, pz)
		if py < World.SEA_LEVEL + 1.5 or py > 42.0 or not _clear_spot(px, pz, 85.0):
			continue
		xforms.append(_palm_xform(px, py, pz, 0.85 + randf() * 0.55, 0.16))
	_add_multimesh("Palms", mesh, xforms, true)


func _palm_xform(x: float, y: float, z: float, s: float, tilt: float) -> Transform3D:
	var b := Basis.from_euler(Vector3((randf() - 0.5) * tilt, randf() * TAU, (randf() - 0.5) * tilt),
			EULER_ORDER_XYZ).scaled(Vector3.ONE * s)
	return Transform3D(b, Vector3(x, y - 0.2, z))


func _build_rocks() -> void:
	var sphere := SphereMesh.new()  # shortcut: low-segment sphere stands in for DodecahedronGeometry(1, 1)
	sphere.radius = 1.0
	sphere.height = 2.0
	sphere.radial_segments = 7
	sphere.rings = 4
	var mesh := ArrayMesh.new()
	_add_part(mesh, sphere, 0.0, Color("b56333"), 0.94)

	var xforms: Array[Transform3D] = []
	var attempts := 0
	while xforms.size() < ROCK_COUNT and attempts < 950:
		attempts += 1
		var rx := AREA_CX + (randf() - 0.5) * 1180.0 * World.MAP_SCALE
		var rz := AREA_CZ + (randf() - 0.5) * 600.0 * World.MAP_SCALE
		if World.get_terrain_info(rx, rz).f1 < 0.10:
			continue
		var ry := World.get_terrain_height(rx, rz)
		if ry < World.SEA_LEVEL + 2.5 or not _clear_spot(rx, rz, 95.0):
			continue
		var mesa := ry > 42.0
		var sx := (4.5 if mesa else 1.6) + randf() * (9.5 if mesa else 4.0)
		var sy := (5.0 if mesa else 1.4) + randf() * (10.5 if mesa else 3.5)
		var sz := (4.5 if mesa else 1.6) + randf() * (9.5 if mesa else 4.0)
		var b := Basis.from_euler(Vector3(randf() * PI, randf() * PI, randf() * PI), EULER_ORDER_XYZ)
		# Three applies scale after rotation in the matrix: M = T * R * S
		xforms.append(Transform3D(b * Basis.from_scale(Vector3(sx, sy, sz)), Vector3(rx, ry + sy * 0.45, rz)))
	_add_multimesh("Rocks", mesh, xforms, true)


func _build_scrub() -> void:
	var sphere := SphereMesh.new()  # shortcut: stands in for IcosahedronGeometry(1.2, 1)
	sphere.radius = 1.2
	sphere.height = 2.4
	sphere.radial_segments = 8
	sphere.rings = 4
	var mesh := ArrayMesh.new()
	_add_part(mesh, sphere, 0.0, Color("9c8849"), 0.95)

	var xforms: Array[Transform3D] = []
	var attempts := 0
	while xforms.size() < SCRUB_COUNT and attempts < 850:
		attempts += 1
		var sx := AREA_CX + (randf() - 0.5) * 1180.0 * World.MAP_SCALE
		var sz := AREA_CZ + (randf() - 0.5) * 600.0 * World.MAP_SCALE
		if World.get_terrain_info(sx, sz).f1 < 0.10:
			continue
		var sy := World.get_terrain_height(sx, sz)
		if sy < World.SEA_LEVEL + 1.8 or sy > 52.0 or not _clear_spot(sx, sz, 90.0):
			continue
		var s := 0.65 + randf() * 0.85
		var b := Basis.from_euler(Vector3(randf() * 0.4, randf() * TAU, randf() * 0.4), EULER_ORDER_XYZ)
		xforms.append(Transform3D(b * Basis.from_scale(Vector3(s, s * 0.75, s)), Vector3(sx, sy + s * 0.6, sz)))
	_add_multimesh("Scrub", mesh, xforms, false)


func _build_dust() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2(5.5, 5.5) * 0.25  # shortcut: PointsMaterial size 5.5 is in pixels; ~1.4 m billboard
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("f5ce82", 0.55)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	quad.material = mat
	_dust = MultiMesh.new()
	_dust.transform_format = MultiMesh.TRANSFORM_3D
	_dust.mesh = quad
	_dust.instance_count = DUST_COUNT
	_dust_pos.resize(DUST_COUNT)
	for k in DUST_COUNT:
		var dx := AREA_CX + (randf() - 0.5) * 1180.0 * World.MAP_SCALE
		var dz := AREA_CZ + (randf() - 0.5) * 600.0 * World.MAP_SCALE
		_dust_pos[k] = Vector3(dx, World.get_terrain_height(dx, dz) + 3.0 + randf() * 30.0, dz)
		_dust.set_instance_transform(k, Transform3D(Basis(), _dust_pos[k]))
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Dust"
	mmi.multimesh = _dust
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)


static func _cylinder(top: float, bottom: float, height: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segments
	c.rings = 1
	return c


## Copies a primitive into `mesh` as a new surface raised by `lift` metres, with its own material.
static func _add_part(mesh: ArrayMesh, prim: PrimitiveMesh, lift: float, color: Color, roughness: float) -> void:
	var arrays := prim.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in verts.size():
		verts[i].y += lift
	arrays[Mesh.ARRAY_VERTEX] = verts
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)


func _add_multimesh(node_name: String, mesh: Mesh, xforms: Array[Transform3D], shadows: bool) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = node_name
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
