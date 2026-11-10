class_name Harbors
extends Node3D
## Harbour docks and moored ships, ported from buildDocks() and the create*Mesh() ship helpers in game.js.
## Per dock (World.docks): timber pier on pilings, bollards, pier warehouse shed, cargo crane, crates,
## channel buoys, and the moored ships of its ship_type (freighter + fuel barge, 2 gunboats, steamer,
## destroyer). Positions and sizes follow the JS; the dock frame is local +Z = seaward along the pier.
## Visual upgrades over the JS (art bible Sections 3 and 6, shared harbour kit):
##   - ships get real hull shapes (pointed bow, sheer, transom, boot-top line) instead of boxes;
##   - a stone rubble breakwater on the more open side, two shore warehouses by the road end
##     (only where the ground is dry and flat), gabled roofs, crane machinery house.
## Draw calls: static pier parts of a dock are merged into one vertex-coloured mesh; the shed and the
## crane stay separate nodes because the JS damage code moves them; ships share one material.

## Moored ships per dock_type: [create function suffix, name, hp, local x sign or offset, z factor]
const SHIP_LAYOUT := {
	"freighter": [["freighter", "Cargo Freighter", 450.0, -1, 10.0, 0.5], ["barge", "Fuel Barge", 300.0, 1, 8.0, 0.4]],
	"gunboat": [["gunboat", "Patrol Gunboat 1", 350.0, -1, 7.0, 0.35], ["gunboat", "Patrol Gunboat 2", 350.0, 1, 7.0, 0.65]],
	"steamer": [["steamer", "Coastal Steamer", 400.0, -1, 9.0, 0.5]],
	"destroyer": [["destroyer", "Fleet Destroyer Warship", 550.0, 1, 11.0, 0.5]],
}

var _kit_mat: StandardMaterial3D    # vertex-coloured pier kit (deck, pilings, bollards, crates, buoys, stone)
var _ship_mat: StandardMaterial3D   # vertex-coloured ships
var _shed_mesh: ArrayMesh
var _crane_mesh: ArrayMesh
var _ship_meshes := {}


func _ready() -> void:
	_kit_mat = _vc_material(0.85, 0.0)
	_ship_mat = _vc_material(0.6, 0.2)
	_shed_mesh = _build_shed_mesh()
	_crane_mesh = _build_crane_mesh()
	for dock in World.docks:
		_build_dock(dock)


# =====================================================================================
# Dock (buildDocks)
# =====================================================================================

func _build_dock(dock: Dictionary) -> void:
	var group := Node3D.new()
	group.name = "Dock_%s" % dock.id
	group.position = Vector3(dock.x, World.SEA_LEVEL, dock.z)
	group.rotation.y = dock.angle
	add_child(group)
	# shortcut: harbour / ship bomb damage (game.js ~8815) is not ported; these fields are set for it
	dock.hp = 900.0
	dock.max_hp = 900.0
	dock.is_destroyed = false
	dock.ships = []

	var p_len: float = dock.pier_length
	var p_wid: float = dock.pier_width
	var st := _begin()
	# 1. Pier main deck
	_append(st, _box(p_wid, 2.0, p_len), Vector3(0, 2.0, p_len / 2.0), Color("786048"))
	# 2. Timber pilings into the dredged seabed
	var piling := _cyl(0.65, 0.65, 14.0, 8)
	var pz := 10.0
	while pz < p_len:
		for px in [-p_wid / 2.0 + 1.2, 0.0, p_wid / 2.0 - 1.2]:
			_append(st, piling, Vector3(px, -3.5, pz), Color("3d3228"))
		pz += 16.0
	# 3. Bollards
	var bollard := _cyl(0.35, 0.4, 0.9, 8)
	var bz := 8.0
	while bz < p_len - 5.0:
		_append(st, bollard, Vector3(-p_wid / 2.0 + 0.6, 3.45, bz), Color("1f2937"))
		_append(st, bollard, Vector3(p_wid / 2.0 - 0.6, 3.45, bz), Color("1f2937"))
		bz += 20.0
	# 6. Cargo crates
	for c in 5:
		var size := 1.6 + (c % 3) * 0.4
		_append(st, _box(size, size, size),
				Vector3(p_wid * 0.22 - (c % 2) * 1.5, 3.0 + size / 2.0, p_len * 0.35 + c * 3.5), Color("92663b"))
	# 7. Channel buoys
	var buoy := _cyl(0.7, 0.9, 2.5, 8)
	_append(st, buoy, Vector3(-p_wid - 14.0, 0.4, p_len + 40.0), Color("ef4444"))
	_append(st, buoy, Vector3(p_wid + 14.0, 0.4, p_len + 40.0), Color("22c55e"))
	_add_breakwater(st, dock, group)
	_add_mesh(group, "Pier", _commit(st), _kit_mat, true)

	# 4. Warehouse shed on the pier
	var shed := MeshInstance3D.new()
	shed.name = "Shed"
	shed.mesh = _shed_mesh
	shed.position = Vector3(0, 3.0, 18.0)
	group.add_child(shed)
	dock.shed = shed
	_add_shore_warehouses(dock, group)

	# 5. Dockside cargo crane
	var crane := MeshInstance3D.new()
	crane.name = "Crane"
	crane.mesh = _crane_mesh
	crane.position = Vector3(-p_wid / 2.0 + 3.0, 3.0, p_len * 0.55)
	group.add_child(crane)
	dock.crane = crane

	# 8. Moored ships for this dock's specialisation
	for s in SHIP_LAYOUT.get(dock.ship_type, []):
		var ship := MeshInstance3D.new()
		ship.name = s[1].replace(" ", "")
		ship.mesh = _ship_mesh(s[0])
		ship.material_override = _ship_mat
		ship.position = Vector3(s[3] * (p_wid / 2.0 + s[4]), 0.0, p_len * s[5])
		group.add_child(ship)
		dock.ships.append({"name": s[1], "node": ship, "hp": s[2], "max_hp": s[2],
				"is_sunk": false, "is_burning": false, "sink_offset": 0.0, "list_angle": 0.0})


## Rubble-mound breakwater: runs out parallel to the pier on its more open side, then hooks in
## across the pier head, leaving the buoyed channel open. Skipped when neither side is mostly water.
func _add_breakwater(st: SurfaceTool, dock: Dictionary, group: Node3D) -> void:
	var p_len: float = dock.pier_length
	var best_side := 0.0
	var best_wet := 0
	for side in [-1.0, 1.0]:
		var wet := 0
		for z in range(10, int(p_len) + 20, 15):
			var w: Vector3 = group.transform * Vector3(side * 58.0, 0.0, z)
			if World.get_terrain_height(w.x, w.z) < 0.0:
				wet += 1
		if wet > best_wet:
			best_wet = wet
			best_side = side
	if best_wet < 8:
		return
	var ctrl := [Vector2(56, -10), Vector2(58, 60), Vector2(56, p_len - 20.0), Vector2(46, p_len + 12.0), Vector2(38, p_len + 18.0)]
	var line: Array[Vector3] = []
	for i in ctrl.size() - 1:
		var a: Vector2 = ctrl[i]
		var b: Vector2 = ctrl[i + 1]
		var n := maxi(1, ceili(a.distance_to(b) / 6.0))
		for k in n:
			var p := a.lerp(b, float(k) / n)
			line.append(Vector3(best_side * p.x, 0.0, p.y))
	line.append(Vector3(best_side * ctrl[-1].x, 0.0, ctrl[-1].y))
	# Trapezoid section: base +-9 m at -6 m, crest +-3 m at +2.6 m; vertices jittered into rubble
	var section := [Vector2(-9, -6), Vector2(-3, 2.6), Vector2(3, 2.6), Vector2(9, -6)]
	# Weathered dark granite. _kit_mat reads vertex colours as linear, so convert the sRGB hex
	# (World.C_RIDGE used raw rendered ~#a1a6a2, far too light next to the sea).
	var stone := Color("6e716a").srgb_to_linear()
	var wet := Color("3e4840").srgb_to_linear()  # tide band: wet, algae-darkened stone
	var rings: Array = []
	for i in line.size():
		var dir := (line[mini(i + 1, line.size() - 1)] - line[maxi(i - 1, 0)]).normalized()
		var side := Vector3(dir.z, 0, -dir.x)
		var ring: Array[Vector3] = []
		for s in section:
			var p: Vector3 = line[i] + side * s.x + Vector3(0, s.y, 0)
			var j := _hash(p) - 0.5
			ring.append(p + Vector3(j * 1.4, (_hash(p * 1.7) - 0.5) * 0.9, (_hash(p * 2.3) - 0.5) * 1.4))
		rings.append(ring)
	for i in rings.size() - 1:
		for c in 3:
			var q := [rings[i][c], rings[i][c + 1], rings[i + 1][c + 1], rings[i + 1][c]]
			var mid: Vector3 = (q[0] + q[2]) * 0.5
			var out := (mid - line[i]).normalized() + Vector3.UP * 0.2
			var col := stone * (0.75 + 0.4 * _hash(mid))
			col = col.lerp(wet * (0.85 + 0.3 * _hash(mid * 1.3)), clampf(1.0 - mid.y / 1.2, 0.0, 1.0))
			_tri(st, q[0], q[1], q[2], col, out)
			_tri(st, q[0], q[2], q[3], col, out)
	for e in [[0, -1.0], [rings.size() - 1, 1.0]]:  # end caps
		var r: Array = rings[e[0]]
		var out: Vector3 = (line[mini(1, line.size() - 1)] - line[0]).normalized() * e[1] if e[0] == 0 \
				else (line[-1] - line[-2]).normalized()
		_tri(st, r[0], r[1], r[2], stone * 0.85, out)
		_tri(st, r[0], r[2], r[3], stone * 0.85, out)


## Two shore warehouses flanking the road end, long side along the shore; only on dry, flat ground.
func _add_shore_warehouses(dock: Dictionary, group: Node3D) -> void:
	for sx in [-30.0, 30.0]:
		var local := Vector3(sx, 0, -42.0)
		var lo := INF
		var hi := -INF
		for corner in [Vector3(-13, 0, -7), Vector3(13, 0, -7), Vector3(-13, 0, 7), Vector3(13, 0, 7)]:
			var w: Vector3 = group.transform * (local + corner)
			var h := Roads.terrain_mesh_height(w.x, w.z)
			lo = minf(lo, h)
			hi = maxf(hi, h)
		if lo < 1.0 or hi - lo > 3.5:
			continue
		var wh := MeshInstance3D.new()
		wh.name = "Warehouse"
		wh.mesh = _shed_mesh
		wh.position = local + Vector3(0, lo - 0.3, 0)
		wh.rotation.y = PI / 2.0
		group.add_child(wh)


func _build_shed_mesh() -> ArrayMesh:
	# JS shed: Box(pWid * 0.7, 7.5, 24) standing on the deck (origin at its floor); plus a gabled roof
	var st := _begin()
	var w := 18.0 * 0.7
	_append(st, _box(w, 7.5, 24.0), Vector3(0, 3.75, 0), Color("4a5568"))
	var roof := PrismMesh.new()
	roof.size = Vector3(w + 0.8, 2.4, 24.6)
	_append(st, roof, Vector3(0, 7.5 + 1.2, 0), Color("3b3f46"))
	_append(st, _box(3.6, 4.2, 0.2), Vector3(0, 2.1, 12.02), Color("2a2f36"))  # cargo door
	_append(st, _box(3.6, 4.2, 0.2), Vector3(0, 2.1, -12.02), Color("2a2f36"))
	return _commit(st, _vc_material(0.6, 0.0))


func _build_crane_mesh() -> ArrayMesh:
	# JS crane group: tower Cylinder(1.2, 1.6, 12) at y 6, boom Box(1, 1, 22) at (-4, 13, 0) rot XYZ(0.35, -PI/3, 0)
	var st := _begin()
	var steel := Color("d97706")
	_append(st, _cyl(1.2, 1.6, 12.0, 8), Vector3(0, 6.0, 0), steel)
	_append(st, _box(3.2, 2.6, 4.2), Vector3(0, 12.6, 0.4), Color("b45f06"))  # machinery house
	var boom := Basis.from_euler(Vector3(0.35, -PI / 3.0, 0.0), EULER_ORDER_XYZ)
	_append_xf(st, _box(1.0, 1.0, 22.0), Transform3D(boom, Vector3(-4.0, 13.0, 0.0)), steel)
	_append(st, _box(1.8, 1.8, 1.4), Vector3(0, 12.6, -2.8), Color("3f3f46"))  # counterweight
	return _commit(st, _vc_material(0.4, 0.6))


# =====================================================================================
# Ships (createCargoFreighterMesh … createFleetDestroyerMesh), bow = local +Z
# =====================================================================================

func _ship_mesh(kind: String) -> ArrayMesh:
	if _ship_meshes.has(kind):
		return _ship_meshes[kind]
	var st := _begin()
	match kind:
		"freighter":
			_hull(st, 78.0, 13.0, 4.75, 3.25, Color("27272a"), Color("881337"), 0.2, 1.6)
			_append(st, _box(11.0, 7.5, 20.0), Vector3(0, 7.5, -12.0), Color("f1f5f9"))      # deckhouse
			_append(st, _box(9.0, 3.2, 9.0), Vector3(0, 12.5, -14.0), Color("1e293b"))       # wheelhouse
			_append(st, _cyl(1.8, 2.0, 9.0, 10), Vector3(0, 13.5, -6.0), Color("111827"))    # funnel
			_append(st, _cyl(0.35, 0.45, 20.0, 6), Vector3(0, 12.0, 14.0), Color("d4d4d8"))  # derrick masts
			_append(st, _cyl(0.35, 0.45, 20.0, 6), Vector3(0, 12.0, -28.0), Color("d4d4d8"))
			for hz in [7.0, 22.0, -30.0]:  # cargo hatches
				_append(st, _box(7.0, 0.9, 8.0), Vector3(0, 5.1, hz), Color("3f3f46"))
		"barge":
			_hull(st, 34.0, 9.0, 2.5, 0.8, Color("3f3f46"), Color("27272a"), 0.08, 0.0)
			var tank := _cyl(2.5, 2.5, 12.0, 12)
			var lie := Basis(Vector3.RIGHT, PI / 2.0)
			_append_xf(st, tank, Transform3D(lie, Vector3(0, 3.2, -6.0)), Color("9ca3af"))
			_append_xf(st, tank, Transform3D(lie, Vector3(0, 3.2, 7.0)), Color("9ca3af"))
		"gunboat":
			var grey := Color("526071")
			_hull(st, 36.0, 6.5, 3.5, 1.1, grey, grey.darkened(0.45), 0.3, 1.0)
			_append(st, _box(5.0, 3.5, 12.0), Vector3(0, 4.5, -3.0), grey.lightened(0.08))  # cabin
			_append(st, _cyl(0.12, 0.18, 7.0, 5), Vector3(0, 9.5, -1.0), Color("1f2937"))   # mast
			_append(st, _cyl(1.6, 1.8, 1.6, 8), Vector3(0, 4.0, 10.0), Color("334155"))     # forward twin turret
			var barrel := _cyl(0.18, 0.18, 5.0, 6)
			var fwd := Basis(Vector3.RIGHT, PI / 2.0)
			_append_xf(st, barrel, Transform3D(fwd, Vector3(-0.35, 4.2, 13.5)), Color("334155"))
			_append_xf(st, barrel, Transform3D(fwd, Vector3(0.35, 4.2, 13.5)), Color("334155"))
		"steamer":
			var green := Color("1d3b24")
			_hull(st, 62.0, 10.0, 4.3, 2.5, green, Color("881337"), 0.18, 1.4)
			_append(st, _box(8.5, 5.5, 26.0), Vector3(0, 6.0, -4.0), Color("f8fafc"))      # promenade deck
			_append(st, _cyl(1.5, 1.7, 10.0, 10), Vector3(0, 11.5, -4.0), Color("d97706"))  # funnel
			_append(st, _cyl(1.55, 1.55, 1.6, 10), Vector3(0, 15.8, -4.0), Color("111827"))  # funnel top band
			_append(st, _cyl(0.25, 0.35, 15.0, 6), Vector3(0, 10.0, 21.0), Color("d4d4d8"))
			_append(st, _cyl(0.25, 0.35, 15.0, 6), Vector3(0, 10.0, -24.0), Color("d4d4d8"))
		"destroyer":
			var navy := Color("475569")
			var gun := Color("334155")
			_hull(st, 96.0, 11.0, 5.0, 3.0, navy, navy.darkened(0.5), 0.3, 2.0)
			_append(st, _box(8.0, 8.0, 18.0), Vector3(0, 7.5, 10.0), navy.lightened(0.06))  # bridge tower
			_append(st, _cyl(0.2, 0.3, 12.0, 6), Vector3(0, 15.0, 4.0), Color("1f2937"))     # mast
			var turret := _box(4.5, 2.5, 5.5)
			var barrel := _cyl(0.25, 0.25, 8.0, 6)
			var fwd := Basis(Vector3.RIGHT, PI / 2.0)
			_append(st, turret, Vector3(0, 5.8, 28.0), gun)
			_append_xf(st, barrel, Transform3D(fwd, Vector3(0, 5.8, 33.0)), gun)
			_append(st, turret, Vector3(0, 5.8, -30.0), gun)
			_append_xf(st, barrel, Transform3D(fwd, Vector3(0, 5.8, -35.0)), gun)
			var rake := Basis(Vector3.RIGHT, -0.15)  # twin raked funnels
			_append_xf(st, _cyl(1.6, 1.8, 8.0, 10), Transform3D(rake, Vector3(0, 9.0, -2.0)), navy)
			_append_xf(st, _cyl(1.6, 1.8, 8.0, 10), Transform3D(rake, Vector3(0, 9.0, -16.0)), navy)
	var mesh := _commit(st)
	_ship_meshes[kind] = mesh
	return mesh


## Ship hull along local Z (stern -L/2, bow +L/2): pointed bow with cut-away forefoot, sheer rising
## to the bow, transom stern. Above the waterline `top`, below it `boot`; per-face weathering noise and
## grime darkening just above the waterline. Deck is the top colour lightened.
static func _hull(st: SurfaceTool, length: float, beam: float, deck: float, draft: float,
		top: Color, boot: Color, bow_frac: float, sheer: float) -> void:
	const N := 20
	var sections: Array = []
	for i in N + 1:
		var t := float(i) / N
		var z := -length / 2.0 + t * length
		var w := beam / 2.0
		var keel := -draft
		if t > 1.0 - bow_frac:
			var s := (t - (1.0 - bow_frac)) / bow_frac
			w *= 1.0 - pow(s, 1.7)
			keel *= 1.0 - 0.85 * s * s
		elif t < 0.12:
			var s := 1.0 - t / 0.12
			w *= 1.0 - 0.25 * s * s
			keel *= 1.0 - 0.3 * s
		var y_deck := deck + sheer * pow(maxf(0.0, (t - 0.6) / 0.4), 2.0) + 0.3 * pow(maxf(0.0, (0.15 - t) / 0.15), 2.0)
		w = maxf(w, 0.02)
		sections.append([Vector3(-w, y_deck, z), Vector3(-w * 0.98, 0.0, z), Vector3(-w * 0.72, keel * 0.75, z),
				Vector3(0, keel, z), Vector3(w * 0.72, keel * 0.75, z), Vector3(w * 0.98, 0.0, z), Vector3(w, y_deck, z)])
	var deck_col := top.lightened(0.18)
	for i in N:
		var a: Array = sections[i]
		var b: Array = sections[i + 1]
		for c in 6:
			var mid: Vector3 = (a[c] + b[c + 1]) * 0.5
			var col: Color = top if (c == 0 or c == 5) else boot
			if c == 0 or c == 5:
				col = col.darkened(0.15 * clampf(1.0 - mid.y / 1.5, 0.0, 1.0))  # waterline grime
			col = col.darkened((_hash(mid) - 0.5) * 0.12)
			var out := Vector3(mid.x, mid.y - deck * 0.3, 0.0).normalized()
			_tri(st, a[c], a[c + 1], b[c + 1], col, out)
			_tri(st, a[c], b[c + 1], b[c], col, out)
		_tri(st, a[0], a[6], b[6], deck_col.darkened((_hash(a[0]) - 0.5) * 0.1), Vector3.UP)
		_tri(st, a[0], b[6], b[0], deck_col.darkened((_hash(a[0]) - 0.5) * 0.1), Vector3.UP)
	var stern: Array = sections[0]
	var centre := Vector3(0, deck * 0.4, stern[0].z)
	for c in 7:
		_tri(st, centre, stern[c], stern[(c + 1) % 7], top.darkened(0.1), Vector3.FORWARD)


# =====================================================================================
# Mesh helpers: everything is merged into vertex-coloured surfaces
# =====================================================================================

static func _vc_material(roughness: float, metallic: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = roughness
	m.metallic = metallic
	return m


static func _begin() -> SurfaceTool:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	return st


static func _commit(st: SurfaceTool, mat: Material = null) -> ArrayMesh:
	var mesh := st.commit()
	if mat:
		mesh.surface_set_material(0, mat)
	return mesh


func _add_mesh(parent: Node3D, node_name: String, mesh: ArrayMesh, mat: Material, shadows: bool) -> void:
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)


static func _append(st: SurfaceTool, prim: PrimitiveMesh, pos: Vector3, col: Color) -> void:
	_append_xf(st, prim, Transform3D(Basis(), pos), col)


## Copies a primitive's triangles into `st`, transformed, with a flat colour plus slight per-vertex noise.
static func _append_xf(st: SurfaceTool, prim: PrimitiveMesh, xf: Transform3D, col: Color) -> void:
	var arr := prim.get_mesh_arrays()
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var n: PackedVector3Array = arr[Mesh.ARRAY_NORMAL]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	var nb := xf.basis.inverse().transposed()
	for i in idx:
		var p := xf * v[i]
		st.set_color(col.darkened((_hash(p) - 0.5) * 0.08))
		st.set_normal((nb * n[i]).normalized())
		st.add_vertex(p)


## One flat-shaded triangle; winding is fixed so its normal faces `out` (Godot front face = clockwise).
static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, col: Color, out: Vector3) -> void:
	var n := (c - a).cross(b - a)
	if n.length_squared() < 1e-8:
		return
	if n.dot(out) < 0.0:
		var t := b
		b = c
		c = t
		n = -n
	n = n.normalized()
	for p in [a, b, c]:
		st.set_color(col)
		st.set_normal(n)
		st.add_vertex(p)


static func _hash(p: Vector3) -> float:
	return fposmod(sin(p.dot(Vector3(12.9898, 78.233, 37.719))) * 43758.5453, 1.0)


static func _box(x: float, y: float, z: float) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(x, y, z)
	return b


static func _cyl(top: float, bottom: float, height: float, segments: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = height
	c.radial_segments = segments
	c.rings = 1
	return c
