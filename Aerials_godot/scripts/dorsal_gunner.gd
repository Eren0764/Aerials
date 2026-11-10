class_name DorsalGunner
extends Node
## Automatic rear gunner, ported from runDorsalGunner() / updateDorsalGunners() in game.js.
## Child of any aircraft (player, wingman, enemy); idle unless the aircraft's def has "dorsal_gunner"
## (only the SM.79). Picks the nearest airborne hostile inside range and the gun's field of fire
## (not dead ahead, not far below), leads it with drop compensation, swings the turret toward it and
## fires short bursts once the barrel is on target.
##
## The owner must provide: def, model (AircraftModel), guns (GunSystem) and get_target_info()
## (pos / basis / velocity / airborne / side); an empty info or airborne == false means the gunner rests.

const REST_AIM := Vector3(0, 0.3, -1)  # normalised in _init

var aim := Vector3.ZERO
var _timer := 0.0
var _burst_clock := 0.0
var _ballistics: Ballistics


func _init() -> void:
	name = "DorsalGunner"
	aim = REST_AIM.normalized()


func _ready() -> void:
	_ballistics = get_tree().get_first_node_in_group("ballistics")


func _process(delta: float) -> void:
	var plane := get_parent()
	var cfg: Dictionary = plane.def.get("dorsal_gunner", {})
	if cfg.is_empty():
		return
	var me: Dictionary = plane.get_target_info()
	if me.is_empty() or not me.airborne:
		return
	_step(plane, cfg, me, minf(delta, 0.1))


func _step(plane: Node3D, cfg: Dictionary, me: Dictionary, dt: float) -> void:
	var q: Basis = me.basis.orthonormalized()
	var inv_q := q.inverse()
	var own_vel: Vector3 = me.velocity
	var mv: float = plane.def.weapons.muzzle_velocity
	var mount: Vector3 = me.pos + q * (cfg.mount as Vector3)

	# Nearest hostile inside range and the gun's field of fire
	var best: Dictionary = {}
	var best_d: float = cfg.range
	for t in get_tree().get_nodes_in_group("bullet_targets"):
		if t == plane or not t.has_method("get_target_info"):
			continue
		var info: Dictionary = t.get_target_info()
		if info.is_empty() or not info.airborne or info.side == me.side:
			continue
		var to: Vector3 = info.pos - mount
		var d := to.length()
		if d < 8.0 or d >= best_d:
			continue
		var local := inv_q * to / d
		if local.z > 0.55 or local.y < -0.3:
			continue
		best = info
		best_d = d

	# Lead solution: bullet = dir * muzzle velocity + own velocity, with ballistic drop compensated
	var desired := REST_AIM.normalized()
	if not best.is_empty():
		var t := best_d / mv
		var world_dir: Vector3 = ((best.pos - mount) + ((best.velocity as Vector3) - own_vel) * t
				+ Vector3(0, 0.5 * Ballistics.BULLET_GRAVITY * t * t, 0)) / t
		desired = inv_q * world_dir.normalized()

	# Swing the gun toward the aim point (or back to its rest position)
	aim = aim.lerp(desired, minf(1.0, 9.0 * dt)).normalized()
	var turret: Node3D = plane.model.dorsal_turret if plane.model else null
	if turret:
		turret.quaternion = Quaternion(Vector3.BACK, aim)

	if best.is_empty() or aim.dot(desired) < 0.985:
		_burst_clock = 0.0
		_timer = 0.0
		return
	_burst_clock += dt
	if fmod(_burst_clock, cfg.burst_on + cfg.burst_off) > cfg.burst_on:
		_timer = 0.0
		return

	var interval: float = 60.0 / cfg.rpm
	var guns: GunSystem = plane.guns
	var color: Color = guns.tracer_override if guns.tracer_override.a > 0.0 else plane.def.weapons.tracer_color
	_timer += dt
	var shots := 0
	while _timer >= interval and shots < 3:
		_timer -= interval
		shots += 1
		var dir := q * aim
		dir = (dir + q.x * randf_range(-1.0, 1.0) * cfg.spread + q.y * randf_range(-1.0, 1.0) * cfg.spread).normalized()
		var muzzle := mount + dir * 0.9
		_ballistics.fire(muzzle, dir * mv + own_vel, plane.def.damage_per_shot, plane.def.weapons.tracer_length,
				color, guns.team, plane)
		_ballistics.muzzle_flash(muzzle, q)
		guns.shot_fired.emit(true, false)  # GameAudio: heavy gun report (player always, others within 850 m)
