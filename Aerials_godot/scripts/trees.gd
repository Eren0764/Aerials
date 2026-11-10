class_name Trees
extends Node3D
## Temperate trees on the green islands, ported from buildTrees() in game.js: same count (2200), height
## band, desert exclusion (getTerrainInfo f1 > 0.04, so they never meet DesertEnvironment's palms) and
## clearances (airfield compounds, piers, balloon winches, roads, placed AA / balloon sites).
## Deviations (art bible Sections 3 and 6):
##   - clustered forests and copses instead of uniform scatter; two species (layered conifer,
##     lumpy broadleaf) instead of cone-on-cylinder; per-cluster and per-tree hue / scale variation;
##   - clearances widened to ~150 m around targets (compounds, piers, AA sites, balloon winches) so no
##     tree near a target is taller than it, and runway approach corridors are kept clear;
##   - trees sit on the rendered terrain mesh, not the analytic height;
##   - fixed RNG seed, so the forest is the same every run (the JS re-rolls it).
## Draw calls: one MultiMeshInstance3D per species per 3 km chunk (2 surfaces each), so chunks are
## frustum- and shadow-culled and dropped beyond VISIBLE_RANGE.

const TREE_COUNT := 2200
const CHUNK := 3000.0
const VISIBLE_RANGE := 8000.0   # chunk centre distance; a 15 m tree is ~1.5 px there at 720p
const TARGET_CLEARANCE := 150.0
const SEED := 1940
const CONIFER_GREEN := Color("245422")  # buildTrees foliage colour
const TRUNK_BROWN := Color("4d321d")    # buildTrees trunk colour

var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.seed = SEED
	Defenses._resolve_sites()  # resolvePlacementSites() runs before buildTrees() in the JS (needs Roads)
	var meshes := [_conifer_mesh(), _broadleaf_mesh()]
	var chunks := {}  # Vector3i(cx, cz, species) -> [Array[Transform3D], Array[Color]]
	var placed := 0
	var clusters := 0
	while placed < TREE_COUNT and clusters < 3000:
		clusters += 1
		var cx := (_rng.randf() - 0.5) * World.WORLD_WIDTH * 0.95
		var cz := (_rng.randf() - 0.5) * World.WORLD_LENGTH * 0.95
		if not _valid(cx, cz):
			continue
		var h0 := World.get_terrain_height(cx, cz)
		var conifer_share := clampf((h0 - 20.0) / 70.0, 0.15, 0.9)  # pines take the higher ground
		var radius := _rng.randf_range(35.0, 150.0)
		var want := _rng.randi_range(6, 40)
		var tint := Color(_rng.randf_range(0.85, 1.0), _rng.randf_range(0.9, 1.0), _rng.randf_range(0.8, 1.0))
		for k in want * 2:
			if want <= 0 or placed >= TREE_COUNT:
				break
			var r := radius * sqrt(_rng.randf())
			var a := _rng.randf() * TAU
			var x := cx + cos(a) * r
			var z := cz + sin(a) * r
			if not _valid(x, z):
				continue
			var species := 0 if _rng.randf() < conifer_share else 1
			var s := _rng.randf_range(0.8, 1.5)
			var b := Basis.from_euler(Vector3(_rng.randf_range(-0.04, 0.04), _rng.randf() * TAU,
					_rng.randf_range(-0.04, 0.04)), EULER_ORDER_XYZ)
			b = b * Basis.from_scale(Vector3(s, s * _rng.randf_range(0.9, 1.15), s))
			var y := Roads.terrain_mesh_height(x, z) - 0.3
			var key := Vector3i(floori(x / CHUNK), floori(z / CHUNK), species)
			if not chunks.has(key):
				chunks[key] = [[], []]
			chunks[key][0].append(Transform3D(b, Vector3(x, y, z)))
			chunks[key][1].append(tint * _rng.randf_range(0.9, 1.0))
			placed += 1
			want -= 1
	for key in chunks:
		_add_chunk(key, meshes[key.z], chunks[key][0], chunks[key][1])


## buildTrees() placement rules, with target clearances widened to TARGET_CLEARANCE.
static func _valid(x: float, z: float) -> bool:
	var y := World.get_terrain_height(x, z)
	if y < World.SEA_LEVEL + 2.0 or y > 120.0:
		return false
	if World.get_terrain_info(x, z).f1 > 0.04:  # desert island: palms only
		return false
	if World.is_inside_airfield_compound(x, z, TARGET_CLEARANCE) or World.is_on_runway_approach(x, z):
		return false
	for d in World.docks:  # isNearDock(x, z, margin)
		var ex: float = d.x + sin(d.angle) * (d.pier_length + 40.0)
		var ez: float = d.z + cos(d.angle) * (d.pier_length + 40.0)
		if World.dist_to_segment(x, z, d.x, d.z, ex, ez) < TARGET_CLEARANCE:
			return false
	if Roads.is_near_road(x, z, 8.0):
		return false
	for s in Defenses._placed:  # AA sites and balloon winches (isNearPlacedSite / isNearBalloonWinch)
		if Vector2(x - s.x, z - s.y).length() < s.z + TARGET_CLEARANCE:
			return false
	return true


func _add_chunk(key: Vector3i, mesh: Mesh, xforms: Array, colors: Array) -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
		mm.set_instance_color(i, colors[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Trees_%d_%d_%s" % [key.x, key.y, "conifer" if key.z == 0 else "broadleaf"]
	mmi.multimesh = mm
	mmi.visibility_range_end = VISIBLE_RANGE
	mmi.visibility_range_end_margin = 400.0
	add_child(mmi)


# Layered conifer, ~14.5 m like the JS tree: trunk + three staggered, jittered cone tiers
func _conifer_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	_add_trunk(mesh, 0.35, 0.7, 5.0)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var tiers := [[4.2, 6.0, 6.0], [3.3, 5.2, 8.6], [2.2, 4.6, 11.4]]  # radius, height, centre y
	for i in tiers.size():
		var t: Array = tiers[i]
		var cone := DesertEnvironment._cylinder(0.0, t[0], t[1], 8)
		_add_canopy(st, cone, Transform3D(Basis(Vector3.UP, i * 0.7), Vector3(0, t[2], 0)), 0.35, 3.5, 14.0)
	_finish_canopy(mesh, st, CONIFER_GREEN)
	return mesh


# Broadleaf, ~12 m: trunk + four lumpy, overlapping crown clumps
func _broadleaf_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	_add_trunk(mesh, 0.3, 0.55, 6.0)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for c in [[0.0, 7.6, 0.0, 3.6], [1.9, 6.7, 0.8, 2.7], [-1.7, 6.9, -1.0, 2.9], [0.3, 9.6, -0.4, 2.5]]:
		var sphere := SphereMesh.new()
		sphere.radius = c[3]
		sphere.height = c[3] * 1.7
		sphere.radial_segments = 8
		sphere.rings = 5
		_add_canopy(st, sphere, Transform3D(Basis(), Vector3(c[0], c[1], c[2])), 0.5, 4.0, 12.0)
	_finish_canopy(mesh, st, World.C_FOREST)
	return mesh


func _add_trunk(mesh: ArrayMesh, top: float, bottom: float, height: float) -> void:
	DesertEnvironment._add_part(mesh, DesertEnvironment._cylinder(top, bottom, height, 6), height / 2.0, TRUNK_BROWN, 0.9)


## Appends a canopy primitive, displacing vertices by a position hash (seam duplicates move together, so
## no cracks) and baking a dark-underside-to-light-top gradient into the vertex colour.
func _add_canopy(st: SurfaceTool, prim: PrimitiveMesh, xf: Transform3D, jitter: float, y_lo: float, y_hi: float) -> void:
	var arr := prim.get_mesh_arrays()
	var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	for i in idx:
		var p := xf * v[i]
		var q := p.snappedf(0.01)
		var h := fposmod(sin(q.dot(Vector3(12.9898, 78.233, 37.719))) * 43758.5453, 1.0) - 0.5
		var radial := Vector3(p.x - xf.origin.x, 0.0, p.z - xf.origin.z)
		p += radial.normalized() * h * jitter * 2.0 + Vector3(0, h * jitter, 0) if radial.length() > 0.05 else Vector3(0, h * jitter, 0)
		var g := lerpf(0.62, 1.08, clampf((p.y - y_lo) / (y_hi - y_lo), 0.0, 1.0))
		st.set_color(Color(g, g, g))
		st.add_vertex(p)


func _finish_canopy(mesh: ArrayMesh, st: SurfaceTool, green: Color) -> void:
	st.generate_normals()
	var arrays := st.commit_to_arrays()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = green
	mat.vertex_color_use_as_albedo = true  # also carries the per-instance tint
	mat.roughness = 0.85
	mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
