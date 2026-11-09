class_name MenuCamera
extends Camera3D
## Main-menu background camera, ported from initMenuPanorama() / updateMenuPanoramaCamera() in game.js:
## drifts at 68 m/s between scenic waypoints, sways in a 160 m circle, bobs over the terrain,
## and slowly spins 360° with a gentle pitch / roll wobble (Minecraft-menu style).

const SCENIC_WAYPOINTS := [
	Vector2(-1100, -2600),  # North Island airbase & harbor
	Vector2(-2900, 320),    # West Island central peaks
	Vector2(3100, -2100),   # Northeast Island bay
	Vector2(400, -400),     # Central archipelago channel
	Vector2(2450, 2150),    # Desert island mesas & oasis
	Vector2(-1750, 2250),   # Southwest coastal ridge
]
const DRIFT_SPEED := 68.0  # m/s

var menu_fov := 65.0
var _pos := Vector3(0, 340, 0)
var _target_idx := 0
var _look_yaw := 0.0
var _orbit_angle := 0.0
var _time := 0.0


func _ready() -> void:
	near = 1.0
	far = 35000.0
	fov = menu_fov


## Fresh random start point (initMenuPanorama); call whenever the menu opens
func start() -> void:
	var start_idx := randi() % SCENIC_WAYPOINTS.size()
	var wp: Vector2 = SCENIC_WAYPOINTS[start_idx]
	_pos.x = wp.x + randf_range(-300.0, 300.0)
	_pos.z = wp.y + randf_range(-300.0, 300.0)
	_target_idx = _pick_next(start_idx)
	_look_yaw = randf() * TAU
	_orbit_angle = randf() * TAU
	_time = randf() * 100.0
	_pos.y = maxf(_ground(_pos.x, _pos.z) + 195.0, 320.0)
	current = true
	_update(0.016)


func _process(delta: float) -> void:
	if current:
		_update(minf(delta, 0.1))


func _update(dt: float) -> void:
	_time += dt
	_orbit_angle += 0.22 * dt

	# 1. Glide toward the next scenic waypoint, pick a new one on arrival
	var wp: Vector2 = SCENIC_WAYPOINTS[_target_idx]
	var to := Vector2(wp.x - _pos.x, wp.y - _pos.z)
	if to.length() < 240.0:
		_target_idx = _pick_next(_target_idx)
	else:
		var step := to.normalized() * DRIFT_SPEED * dt
		_pos.x += step.x
		_pos.z += step.y

	# Circular hover sway around the drifting path
	var hx := _pos.x + cos(_orbit_angle) * 160.0
	var hz := _pos.z + sin(_orbit_angle * 0.85) * 160.0

	# Hover above terrain / sea with a slow vertical bob
	var desired_y := maxf(_ground(hx, hz) + 190.0, 310.0 + sin(_time * 0.45) * 48.0)
	_pos.y = lerpf(_pos.y, desired_y, minf(1.0, 1.8 * dt))
	position = Vector3(hx, _pos.y, hz)

	# 2. Continuous 360° spin with gentle pitch bob and roll (Euler YXZ, as the JS)
	_look_yaw = fmod(_look_yaw + 0.16 * dt, TAU)
	var pitch := -0.17 + sin(_time * 0.35) * 0.05
	var roll := sin(_time * 0.28) * 0.022
	# THREE camera looks down -Z, like Godot's, so the same Euler angles give the same view
	basis = Basis.from_euler(Vector3(pitch, _look_yaw, roll))

	fov = lerpf(fov, menu_fov, minf(1.0, 6.0 * dt))


func _pick_next(exclude: int) -> int:
	var n := SCENIC_WAYPOINTS.size()
	var next := randi() % n
	if next == exclude:
		next = (next + 1 + randi() % (n - 1)) % n
	return next


func _ground(x: float, z: float) -> float:
	return maxf(World.SEA_LEVEL, World.get_terrain_height(x, z))
