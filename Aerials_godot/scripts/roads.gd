class_name Roads
extends Node3D
## Supply roads from each linked airfield's apron to its harbour pier root, ported from game.js
## findLandRoute / computeRoadSpline / buildRoads / isNearRoad (ROAD_LINKS in World).
## Route: A* on a 40 m grid over dry land (prefers gentle slopes, avoids runways and building areas),
## thinned to every 3rd node, then a Catmull-Rom spline (THREE.SplineCurve) sampled at 140 divisions.
## Those samples are `paths`, which is_near_road() tests, exactly like ROAD_PATHS in the JS.
## Visual upgrade over the JS: the ribbon is resampled every ~6 m, each vertex sits on the rendered
## terrain mesh (not the analytic height), and the edges fade into the terrain through a gravel shoulder.
## World adds this node before Defenses: placement sites and trees keep clear of the roads.

const ROAD_WIDTH := 14.0
const SHOULDER := 4.0        # fade-out band on each side, metres (visual only; not part of is_near_road)
const LIFT := 0.3            # metres above the terrain mesh, against z-fighting
const DIVISIONS := 140       # SplineCurve.getPoints(140), as the JS
const MESH_STEP := 6.0       # ribbon resample spacing, metres
const ROUTE_STEP := 40.0
const ROUTE_PAD := 1600.0

## Sampled road centrelines in world (x, z); filled once, read by is_near_road().
static var paths: Array[PackedVector2Array] = []

const ROAD_SHADER := """
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_back;

uniform vec3 asphalt : source_color = vec3(0.216, 0.255, 0.318); // #374151, createRoadTexture()
uniform vec3 gravel : source_color = vec3(0.45, 0.40, 0.33);
uniform float rut_strength : hint_range(0.0, 1.0) = 0.12; // darker worn wheel tracks
uniform float half_width = 7.0;
uniform float shoulder = 4.0;

varying vec3 wpos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float m = abs(UV.x);   // metres from the centreline
	float along = UV.y;    // metres along the road
	float grain = vnoise(wpos.xz * 0.9) * 0.6 + vnoise(wpos.xz * 0.11) * 0.4;
	vec3 col = asphalt * (0.85 + 0.3 * grain);
	// Deviation from the JS texture: no painted edge / centre lines (read as modern, art bible Section 6).
	// Period road wear instead: two darker wheel tracks per lane, and a loose-gravel verge on the edges.
	float lane = abs(m - half_width * 0.5);               // metres from the lane centre
	float rut = 1.0 - smoothstep(0.3, 1.1, abs(lane - 0.9)); // tracks 0.9 m either side of the lane centre
	col *= 1.0 - rut * rut_strength * (0.6 + 0.4 * vnoise(vec2(m * 2.0, along * 0.05)));
	float ragged = (vnoise(wpos.xz * 0.5) - 0.5) * 1.2;
	float verge = smoothstep(half_width - 1.6, half_width - 0.4, m + ragged * 0.8);
	col = mix(col, gravel * (0.75 + 0.45 * grain), verge * 0.7);
	// Gravel shoulder: broken asphalt edge, then fade into the terrain
	col = mix(col, gravel * (0.8 + 0.4 * grain), smoothstep(half_width - 0.3, half_width + 0.6, m + ragged));
	ALBEDO = col;
	ROUGHNESS = 0.85;
	ALPHA = 1.0 - smoothstep(half_width + 0.5, half_width + shoulder, m + ragged);
}
"""


func _ready() -> void:
	if paths.is_empty():
		compute_paths()
	var mat := ShaderMaterial.new()
	mat.shader = Shader.new()
	mat.shader.code = ROAD_SHADER
	mat.set_shader_parameter("half_width", ROAD_WIDTH / 2.0)
	mat.set_shader_parameter("shoulder", SHOULDER)
	for i in World.ROAD_LINKS.size():
		var mesh := _ribbon(_road_points(World.ROAD_LINKS[i]))
		if mesh == null:
			continue
		var mi := MeshInstance3D.new()
		mi.name = "Road_%s" % World.ROAD_LINKS[i].dock
		mi.mesh = mesh
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)


## Fills `paths` (ROAD_PATHS): one 141-sample centreline per ROAD_LINKS entry.
static func compute_paths() -> void:
	paths.clear()
	for link in World.ROAD_LINKS:
		var pts := _road_points(link)
		var sampled := PackedVector2Array()
		for i in DIVISIONS + 1:
			sampled.append(_spline_point(pts, float(i) / DIVISIONS))
		paths.append(sampled)


## isNearRoad(): true within 7 m (half the road) + margin of any road centreline segment.
static func is_near_road(x: float, z: float, margin := 20.0) -> bool:
	for path in paths:
		for i in path.size() - 1:
			var a := path[i]
			var b := path[i + 1]
			if x < minf(a.x, b.x) - margin or x > maxf(a.x, b.x) + margin:
				continue
			if z < minf(a.y, b.y) - margin or z > maxf(a.y, b.y) + margin:
				continue
			if World.dist_to_segment(x, z, a.x, a.y, b.x, b.y) < 7.0 + margin:
				return true
	return false


## Height of the rendered terrain mesh (40 m grid, same triangulation as World._build_terrain),
## so props sit on what is drawn rather than on the analytic surface between grid points.
static func terrain_mesh_height(x: float, z: float) -> float:
	var sx := World.WORLD_WIDTH / World.TERRAIN_SEGMENTS_X
	var sz := World.WORLD_LENGTH / World.TERRAIN_SEGMENTS_Z
	var gx := clampf((x + World.WORLD_WIDTH * 0.5) / sx, 0.0, World.TERRAIN_SEGMENTS_X - 0.001)
	var gz := clampf((z + World.WORLD_LENGTH * 0.5) / sz, 0.0, World.TERRAIN_SEGMENTS_Z - 0.001)
	var c := floori(gx)
	var r := floori(gz)
	var fx := gx - c
	var fz := gz - r
	var x0 := -World.WORLD_WIDTH * 0.5 + c * sx
	var z0 := -World.WORLD_LENGTH * 0.5 + r * sz
	var ha := World.get_terrain_height(x0, z0)
	var hb := World.get_terrain_height(x0 + sx, z0)
	var hd := World.get_terrain_height(x0, z0 + sz)
	if fx + fz <= 1.0:
		return ha + (hb - ha) * fx + (hd - ha) * fz
	var he := World.get_terrain_height(x0 + sx, z0 + sz)
	return he + (hd - he) * (1.0 - fx) + (hb - he) * (1.0 - fz)


# computeRoadSpline(): control points from the apron edge (airfield-local 165, -30) to 14 m inland of the pier root
static func _road_points(link: Dictionary) -> PackedVector2Array:
	var af := World.find_by_id(World.airports, link.airfield)
	var d := World.find_by_id(World.docks, link.dock)
	var start := World.airfield_local_to_world(af, 165.0, -30.0)
	var end := Vector2(d.x - sin(d.angle) * 14.0, d.z - cos(d.angle) * 14.0)
	var route := _find_land_route(start, end)
	if route.is_empty():
		route = PackedVector2Array([start, end])
	var pts := PackedVector2Array()
	for i in route.size():  # thin the 40 m grid route to every 3rd node
		if i == 0 or i == route.size() - 1 or i % 3 == 0:
			pts.append(route[i])
	return pts


# THREE.SplineCurve.getPoint(t): uniform Catmull-Rom with clamped end indices
static func _spline_point(pts: PackedVector2Array, t: float) -> Vector2:
	var n := pts.size()
	if n == 1:
		return pts[0]
	var p := (n - 1) * t
	var i := mini(floori(p), n - 1)
	var w := p - i
	var p0 := pts[i if i == 0 else i - 1]
	var p1 := pts[i]
	var p2 := pts[n - 1 if i > n - 2 else i + 1]
	var p3 := pts[n - 1 if i > n - 3 else i + 2]
	return p1.cubic_interpolate(p2, p0, p3, w)


# findLandRoute(): A* on a 40 m grid; dry ground only, climb-weighted cost, airfield building areas blocked
static func _find_land_route(s: Vector2, e: Vector2) -> PackedVector2Array:
	var min_x := minf(s.x, e.x) - ROUTE_PAD
	var min_z := minf(s.y, e.y) - ROUTE_PAD
	var nx := ceili((maxf(s.x, e.x) + ROUTE_PAD - min_x) / ROUTE_STEP) + 1
	var nz := ceili((maxf(s.y, e.y) + ROUTE_PAD - min_z) / ROUTE_STEP) + 1
	var count := nx * nz
	var heights := PackedFloat32Array()
	heights.resize(count)
	heights.fill(NAN)
	var walk := PackedByteArray()  # 0 unknown, 1 walkable, 2 blocked
	walk.resize(count)
	var g := PackedFloat32Array()
	g.resize(count)
	g.fill(INF)
	var came := PackedInt32Array()
	came.resize(count)
	came.fill(-1)
	var closed := PackedByteArray()
	closed.resize(count)

	var si := roundi((s.x - min_x) / ROUTE_STEP)
	var sj := roundi((s.y - min_z) / ROUTE_STEP)
	var ei := roundi((e.x - min_x) / ROUTE_STEP)
	var ej := roundi((e.y - min_z) / ROUTE_STEP)
	var start_k := sj * nx + si
	var end_k := ej * nx + ei

	var height_at := func(k: int) -> float:
		if is_nan(heights[k]):
			heights[k] = World.get_terrain_height(min_x + (k % nx) * ROUTE_STEP, min_z + (k / nx) * ROUTE_STEP)
		return heights[k]

	var heap_k := PackedInt32Array()
	var heap_f := PackedFloat32Array()
	g[start_k] = 0.0
	_heap_push(heap_k, heap_f, start_k, Vector2(si - ei, sj - ej).length() * ROUTE_STEP)
	while not heap_k.is_empty():
		var k := _heap_pop(heap_k, heap_f)
		if closed[k]:
			continue
		closed[k] = 1
		if k == end_k:
			break
		var i := k % nx
		var j := k / nx
		for di in range(-1, 2):
			for dj in range(-1, 2):
				if di == 0 and dj == 0:
					continue
				var ni := i + di
				var nj := j + dj
				if ni < 0 or nj < 0 or ni >= nx or nj >= nz:
					continue
				var nk := nj * nx + ni
				if closed[nk]:
					continue
				if walk[nk] == 0:
					var ok: bool = nk == start_k or nk == end_k or (height_at.call(nk) >= 1.0 \
							and not _route_blocked(min_x + ni * ROUTE_STEP, min_z + nj * ROUTE_STEP))
					walk[nk] = 1 if ok else 2
				if walk[nk] == 2:
					continue
				var run := Vector2(di, dj).length() * ROUTE_STEP
				var climb := absf(height_at.call(nk) - height_at.call(k))
				var cost := g[k] + run * (1.0 + (climb / run) * 12.0)
				if cost < g[nk]:
					g[nk] = cost
					came[nk] = k
					_heap_push(heap_k, heap_f, nk, cost + Vector2(ni - ei, nj - ej).length() * ROUTE_STEP)
	if came[end_k] < 0:
		return PackedVector2Array()

	var route := PackedVector2Array()
	var k := end_k
	while k >= 0:
		route.append(Vector2(min_x + (k % nx) * ROUTE_STEP, min_z + (k / nx) * ROUTE_STEP))
		if k == start_k:
			break
		k = came[k]
	route.reverse()
	route[0] = s
	route[route.size() - 1] = e
	return route


static func _route_blocked(x: float, z: float) -> bool:
	for af in World.airports:
		var l := World.world_to_airfield_local(af, x, z)
		if l.x > -af.width / 2.0 - 30.0 and l.x < 150.0 and absf(l.y) < af.length / 2.0 + 30.0:
			return true
	return false


static func _heap_push(hk: PackedInt32Array, hf: PackedFloat32Array, k: int, f: float) -> void:
	hk.append(k)
	hf.append(f)
	var c := hk.size() - 1
	while c > 0:
		var p := (c - 1) >> 1
		if hf[p] <= hf[c]:
			break
		var tk := hk[p]; hk[p] = hk[c]; hk[c] = tk
		var tf := hf[p]; hf[p] = hf[c]; hf[c] = tf
		c = p


static func _heap_pop(hk: PackedInt32Array, hf: PackedFloat32Array) -> int:
	var top := hk[0]
	var last := hk.size() - 1
	hk[0] = hk[last]
	hf[0] = hf[last]
	hk.resize(last)
	hf.resize(last)
	var c := 0
	while true:
		var l := 2 * c + 1
		var r := l + 1
		var m := c
		if l < last and hf[l] < hf[m]: m = l
		if r < last and hf[r] < hf[m]: m = r
		if m == c:
			break
		var tk := hk[m]; hk[m] = hk[c]; hk[c] = tk
		var tf := hf[m]; hf[m] = hf[c]; hf[c] = tf
		c = m
	return top


# Ribbon of 4 vertex columns (outer fade, edge, edge, outer fade) resampled every ~MESH_STEP metres.
# UV.x = signed metres from the centreline, UV.y = metres along the road (read by ROAD_SHADER).
func _ribbon(pts: PackedVector2Array) -> ArrayMesh:
	var dense := PackedVector2Array()
	var fine := DIVISIONS * 8
	for i in fine + 1:
		dense.append(_spline_point(pts, float(i) / fine))
	var centre := PackedVector2Array([dense[0]])
	var acc := 0.0
	for i in range(1, dense.size()):
		acc += dense[i].distance_to(dense[i - 1])
		if acc >= MESH_STEP or i == dense.size() - 1:
			centre.append(dense[i])
			acc = 0.0
	var offsets := [-(ROAD_WIDTH / 2.0 + SHOULDER), -ROAD_WIDTH / 2.0, ROAD_WIDTH / 2.0, ROAD_WIDTH / 2.0 + SHOULDER]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var along := 0.0
	var prev_row: Array[Vector3] = []
	var prev_uv: Array[Vector2] = []
	for i in centre.size():
		var a := centre[maxi(i - 1, 0)]
		var b := centre[mini(i + 1, centre.size() - 1)]
		var dir := (b - a).normalized()
		var nrm := Vector2(-dir.y, dir.x)
		if i > 0:
			along += centre[i].distance_to(centre[i - 1])
		var row: Array[Vector3] = []
		var uv: Array[Vector2] = []
		var dry := true
		for o in offsets:
			var p: Vector2 = centre[i] + nrm * o
			var h := terrain_mesh_height(p.x, p.y)
			if h < World.SEA_LEVEL - 1.0:  # as the JS: no road over open water
				dry = false
			row.append(Vector3(p.x, h + (LIFT if absf(o) <= ROAD_WIDTH / 2.0 else LIFT * 0.5), p.y))
			uv.append(Vector2(o, along))
		if not dry:
			prev_row = []
			continue
		if not prev_row.is_empty():
			for c in 3:
				# Clockwise seen from above (Godot front face), normal up
				for v in [[prev_row[c], prev_uv[c]], [row[c], uv[c]], [prev_row[c + 1], prev_uv[c + 1]],
						[prev_row[c + 1], prev_uv[c + 1]], [row[c], uv[c]], [row[c + 1], uv[c + 1]]]:
					st.set_uv(v[1])
					st.add_vertex(v[0])
		prev_row = row
		prev_uv = uv
	st.generate_normals()
	var arrays := st.commit_to_arrays()
	if (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).is_empty():
		return null
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
