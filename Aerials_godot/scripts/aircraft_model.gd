class_name AircraftModel
extends Node3D
## Aircraft visual: the real model exported from ww2_aircraft_builders.js
## (res://models/aircraft/<id>.glb, made by tools/export_aircraft_glb.py) with the same animation hooks the JS
## model data exposed: spinning propellers + blur disc, retractable gear (setGearDeployment), ailerons,
## elevators and rudders. Hook node names come from <id>.json. +Z = nose, wheels ~1.5 m below centre.
## Falls back to a simple placeholder plane if the GLB is missing.

const MODEL_DIR := "res://models/aircraft/"

var propeller: Node3D            # placeholder only
var gear_node: Node3D            # placeholder only

var _props: Array[Node3D] = []
var _blur_mats: Array[StandardMaterial3D] = []
var _gear: Array[Dictionary] = []  # {node, down, up}
var _aileron_l: Node3D
var _aileron_r: Node3D
var _elevators: Array[Node3D] = []
var _rudders: Array[Node3D] = []

static var _hooks_cache := {}


func _init(plane_id := "", paint_color := Color(0.40, 0.44, 0.30)) -> void:
	name = "Model"
	var path := MODEL_DIR + plane_id + ".glb"
	if not plane_id.is_empty() and ResourceLoader.exists(path):
		_load_model(plane_id, path)
	else:
		_build_placeholder(paint_color)


func _load_model(plane_id: String, path: String) -> void:
	var inst: Node3D = (load(path) as PackedScene).instantiate()
	add_child(inst)
	if not _hooks_cache.has(plane_id):
		_hooks_cache[plane_id] = JSON.parse_string(FileAccess.get_file_as_string(MODEL_DIR + plane_id + ".json"))
	var hooks: Dictionary = _hooks_cache[plane_id]

	for n in hooks.propellers:
		_props.append(_hook(inst, n))
	for n in hooks.blur_discs:
		var disc := _hook(inst, n) as MeshInstance3D
		if disc:
			# Per-aircraft copy: blur opacity follows this plane's own throttle
			var mat := (disc.get_active_material(0) as StandardMaterial3D).duplicate() as StandardMaterial3D
			disc.set_surface_override_material(0, mat)
			_blur_mats.append(mat)
	_aileron_l = _hook(inst, hooks.aileron_l)
	_aileron_r = _hook(inst, hooks.aileron_r)
	for n in hooks.elevators:
		_elevators.append(_hook(inst, n))
	for n in hooks.rudders:
		_rudders.append(_hook(inst, n))
	for g in hooks.gear:
		_gear.append({"node": _hook(inst, g.node), "down": _vec(g.down), "up": _vec(g.up)})


# Hook nodes keep Three.js Euler order (XYZ) so rotation.x / .y can be set exactly like the JS did
func _hook(inst: Node, node_name) -> Node3D:
	if node_name == null:
		return null
	var n := inst.find_child(String(node_name), true, false) as Node3D
	if n:
		n.rotation_order = EULER_ORDER_XYZ
	return n


static func _vec(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


## Elevator / aileron / rudder deflection from the commanded rates (updatePhysics section 4)
func set_controls(pitch_rate: float, roll_rate: float, yaw_rate: float, flaps_combat: bool) -> void:
	for e in _elevators:
		e.rotation.x = -pitch_rate * 0.24
	var droop := 0.22 if flaps_combat else 0.0
	if _aileron_l:
		_aileron_l.rotation.x = -roll_rate * 0.22 + droop
	if _aileron_r:
		_aileron_r.rotation.x = roll_rate * 0.22 + droop
	for r in _rudders:
		r.rotation.y = yaw_rate * 0.35


## Propeller blur disc: faint at idle, denser with throttle
func set_prop_blur(throttle: float) -> void:
	var a := 0.20 + throttle * 0.32 if throttle > 0.3 else throttle * 0.5
	for m in _blur_mats:
		m.albedo_color.a = a


func _build_placeholder(paint_color: Color) -> void:
	var paint := StandardMaterial3D.new()
	paint.albedo_color = paint_color
	paint.metallic = 0.3
	paint.roughness = 0.55
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.12, 0.12, 0.12)
	dark.roughness = 0.6
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(0.55, 0.75, 0.9, 0.45)
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.metallic = 0.6
	glass.roughness = 0.05

	var fuselage := CapsuleMesh.new()
	fuselage.radius = 0.6
	fuselage.height = 8.4
	_add_part(self, fuselage, paint, Vector3(0, 0, 0.2), Vector3(PI / 2.0, 0, 0))
	_add_part(self, _box(11.2, 0.22, 1.9), paint, Vector3(0, -0.3, 0.6))     # main wing
	_add_part(self, _box(3.8, 0.14, 1.0), paint, Vector3(0, 0.15, -3.5))     # tailplane
	_add_part(self, _box(0.14, 1.5, 1.2), paint, Vector3(0, 0.85, -3.6))     # fin
	var canopy := SphereMesh.new()
	canopy.radius = 0.5
	canopy.height = 1.0
	_add_part(self, canopy, glass, Vector3(0, 0.62, 0.2), Vector3.ZERO, Vector3(0.9, 0.8, 1.8))

	propeller = Node3D.new()
	propeller.position = Vector3(0, 0, 4.45)
	add_child(propeller)
	_add_part(propeller, _box(0.2, 3.2, 0.06), dark, Vector3.ZERO)
	_add_part(propeller, _box(3.2, 0.2, 0.06), dark, Vector3.ZERO)

	gear_node = Node3D.new()
	gear_node.position = Vector3(0, -0.35, 0.9)
	add_child(gear_node)
	for side in [-1.4, 1.4]:
		var leg := CylinderMesh.new()
		leg.top_radius = 0.07
		leg.bottom_radius = 0.07
		leg.height = 0.9
		_add_part(gear_node, leg, dark, Vector3(side, -0.45, 0))
		var wheel := CylinderMesh.new()
		wheel.top_radius = 0.3
		wheel.bottom_radius = 0.3
		wheel.height = 0.16
		_add_part(gear_node, wheel, dark, Vector3(side, -0.85, 0), Vector3(0, 0, PI / 2.0))




func spin_propeller(rate: float, dt: float) -> void:
	for p in _props:
		p.rotation.z += rate * dt
	if propeller:
		propeller.rotation.z += rate * dt


## 1 = fully down, 0 = retracted (setGearDeployment)
func set_gear(position_01: float) -> void:
	var r := clampf(position_01, 0.0, 1.0)
	for g in _gear:
		var node: Node3D = g.node
		node.rotation = (g.up as Vector3).lerp(g.down, r)  # the JS rotations are linear in the ratio
		node.visible = r > 0.02
	if gear_node:
		gear_node.visible = r > 0.02
		gear_node.scale.y = maxf(0.02, r)


static func _box(x: float, y: float, z: float) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(x, y, z)
	return b


static func _add_part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	mi.scale = scl
	parent.add_child(mi)
	return mi
