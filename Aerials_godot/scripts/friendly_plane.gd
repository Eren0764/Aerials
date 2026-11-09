class_name FriendlyPlane
extends Node3D
## Friendly AI wingman (#2) or escort (#3, #4), ported from initFriendlyWingman / createAllyPlane /
## positionFriendlyWingmanOnPlayerRunway / runWingmanAI / updateFriendlyAlly / damageFriendlyWingman in game.js:
##   parked behind the player -> takeoff -> climbout -> patrol a zone around the player
##   -> attack enemies near the player (lead + bursts) -> evade when hit or tailed
##   -> below 35% HP: approach, final (≈6° glide path, gear down), touchdown, rollout, 6 s repair, take off again.
## 3 lives, respawns parked on the home runway 8 s after being shot down.

signal banner(text: String, is_kill: bool)

const AXIS_X := Vector3(1, 0, 0)
const AXIS_Z := Vector3(0, 0, 1)
# WINGMAN_ZONE
const PATROL_MIN := 500.0
const PATROL_MAX := 1400.0
const LEASH := 2200.0
const ENGAGE := 1800.0
const FIGHT_LEASH := 2800.0
const THREAT := 650.0
const RTB_HP_FRAC := 0.35
const STATE_LABELS := {"parked": "PARKED", "takeoff": "T/O", "climbout": "CLB", "patrol": "PATROL", "attack": "ENG",
	"evade": "BRK", "approach": "RTB", "final": "FINAL", "rollout": "ROLL", "servicing": "REPAIR"}
const PARK_SLOTS := [Vector2(11, 16), Vector2(-11, 16), Vector2(11, 34), Vector2(-11, 34)]

var def: Dictionary
var plane_id := "mustang"
var slot := 0                  # 0 = wingman #2, 1 = #3, 2 = #4
var callsign := "WING #2"
var player: PlayerAircraft
var director: EnemyDirector

var current_speed_kmh := 0.0
var speed_ms := 0.0
var velocity := Vector3.ZERO
var hp := 120.0
var max_hp := 120.0
var lives := 3
var max_lives := 3
var permanently_dead := false
var is_alive := true
var is_dying := false
var taken_over := false
var on_ground := true
var ai_state := "parked"
var gear_pos := 1.0
var is_firing := false

var _park_timer := 0.0
var _respawn_timer := 0.0
var _fall_speed := 0.0
var _evade_cooldown := 0.0
var _evade_timer := 0.0
var _evade_dir := 1.0
var _recently_hit := false
var _target_enemy: EnemyPlane
var _retarget_timer := 0.0
var _patrol_offset := Vector3.ZERO
var _patrol_timer := 0.0
var _service_timer := 0.0
var _burst_timer := 0.0
var _burst_cooldown := 0.0
var _smoke_timer := 0.0
var _damage_smoke_timer := 0.0

var guns: GunSystem
var model: AircraftModel
var _ballistics: Ballistics

var airspeed: float:
	get:
		return current_speed_kmh
var is_crashed: bool:
	get:
		return not is_alive


func setup(id: String, ally_slot: int, the_player: PlayerAircraft, the_director: EnemyDirector) -> void:
	plane_id = id
	def = AircraftDefs.get_def(id)
	slot = ally_slot
	callsign = "WING #%d" % (slot + 2)
	name = "Wing%d" % (slot + 2)
	player = the_player
	director = the_director
	max_hp = def.max_hp
	hp = max_hp
	model = AircraftModel.new(id)  # same livery as the player, like the JS


func _ready() -> void:
	add_to_group("bullet_targets")
	_ballistics = get_tree().get_first_node_in_group("ballistics")
	add_child(model)
	guns = GunSystem.new()
	guns.name = "Guns"
	guns.use_light = false
	guns.is_player = false
	guns.team = "friendly"
	guns.tracer_override = Color("38bdf8")  # friendly AI tracers are sky blue
	add_child(guns)
	park(25.0)


# =====================================================================================
# Interfaces (targeted by enemies, hit by bullets)
# =====================================================================================

func get_target_info() -> Dictionary:
	if not is_alive or is_dying or taken_over:
		return {}
	return {"pos": global_position, "basis": basis, "velocity": velocity, "airborne": not on_ground,
			"firing": is_firing, "engageable": not on_ground, "side": "friendly"}


func bullet_team() -> String:
	return "friendly"


func bullet_hit_test(p0: Vector3, p1: Vector3) -> Dictionary:
	if not is_alive or taken_over:
		return {}
	return Ballistics.aircraft_hit_test(self, p0, p1)


## damageFriendlyWingman
func take_bullet_hit(damage: float, module: String, point: Vector3, _shooter: Node3D) -> void:
	if not is_alive:
		return
	var final_dmg := roundf(damage * (1.25 if module == "ENGINE" else 1.0))
	hp = maxf(0.0, hp - final_dmg)
	_recently_hit = true
	_ballistics.spawn_impact(point, false, final_dmg)
	if hp > 0.0:
		return
	is_alive = false
	is_dying = true
	_fall_speed = 6.0
	lives = maxi(0, lives - 1)
	guns.trigger = false
	is_firing = false
	_ballistics.explosion_at(global_position, 2.2)
	if lives > 0:
		_respawn_timer = 8.0
		banner.emit("WINGMAN #%d (%s) SHOT DOWN! (%d/%d LIVES LEFT)" % [slot + 2, def.short_name, lives, max_lives], false)
	else:
		permanently_dead = true
		banner.emit("WINGMAN #%d (%s) OUT OF LIVES (0/%d)" % [slot + 2, def.short_name, max_lives], false)


## Usable for the player to take over (alive, not falling, has lives)
func can_be_taken_over() -> bool:
	return is_alive and not is_dying and lives > 0 and not taken_over


## The player now flies this aircraft: remove the AI copy
func mark_taken_over() -> void:
	taken_over = true
	is_alive = false
	visible = false
	guns.trigger = false


func state_label() -> String:
	return STATE_LABELS.get(ai_state, "PATROL")


# =====================================================================================
# Parking (positionFriendlyWingmanOnPlayerRunway)
# =====================================================================================

## Line up behind the player's spawn: #2 right, #3 left, #4 further back right
func park(depart_delay: float) -> void:
	_park_timer = depart_delay
	var af: Dictionary = World.airports[World.current_airfield]
	var heading := deg_to_rad(af.spawn_heading)
	var fwd := Vector3(sin(heading), 0.0, cos(heading))
	var right := Vector3(cos(heading), 0.0, -sin(heading))
	var s: Vector2 = PARK_SLOTS[mini(slot, PARK_SLOTS.size() - 1)]
	position = Vector3(af.spawn_x, af.elevation + 1.5, af.spawn_z) + right * s.x - fwd * s.y
	basis = Basis.from_euler(Vector3(0.0, heading, 0.0))
	ai_state = "parked"
	on_ground = true
	_target_enemy = null
	_evade_cooldown = 0.0
	_recently_hit = false
	current_speed_kmh = 0.0
	speed_ms = 0.0
	velocity = Vector3.ZERO
	gear_pos = 1.0
	model.set_gear(1.0)
	guns.reset()


# =====================================================================================
# Frame update (updateFriendlyAlly)
# =====================================================================================

func _process(delta: float) -> void:
	if taken_over:
		return
	var dt := minf(delta, 0.1)
	if is_alive:
		model.spin_propeller(35.0 if current_speed_kmh < 30.0 else 85.0, dt)
		var fire := _run_ai(dt)
		guns.trigger = fire
		is_firing = fire
		var hp_ratio := hp / max_hp
		if hp_ratio < 0.30:
			_damage_smoke_timer = _ballistics.emit_damage_smoke(self, hp_ratio, dt, _damage_smoke_timer)
	elif is_dying:
		model.spin_propeller(20.0, dt)
		_fall_speed += 25.0 * dt
		position += velocity * dt * 0.65
		position.y -= _fall_speed * dt
		rotate_object_local(AXIS_X, 0.6 * dt)
		rotate_object_local(AXIS_Z, 2.4 * dt)
		_smoke_timer += dt
		if _smoke_timer >= 0.025:
			_smoke_timer = 0.0
			_ballistics.smoke_at(global_position)
		if position.y <= _ground(position.x, position.z) + 1.5:
			is_dying = false
			visible = false
			_ballistics.explosion_at(global_position, 2.2)
	elif not permanently_dead and lives > 0:
		_respawn_timer -= dt
		if _respawn_timer <= 0.0:
			hp = max_hp
			is_alive = true
			is_dying = false
			visible = true
			park(3.0)
			banner.emit("WINGMAN #%d (%s) TAKING OFF FROM HOME BASE (%d/%d LIVES)" % [slot + 2, def.short_name, lives, max_lives], false)


# One AI step; returns whether the guns want to fire (runWingmanAI)
func _run_ai(dt: float) -> bool:
	var cruise: float = def.cruise_airspeed
	var combat: float = def.max_airspeed * 0.95
	var takeoff_speed: float = def.takeoff_speed
	var player_pos := player.position
	if _evade_cooldown > 0.0:
		_evade_cooldown -= dt
	var was_hit := _recently_hit
	_recently_hit = false

	if ai_state in ["patrol", "attack", "approach"]:
		# Damaged: go home for repairs
		if hp < max_hp * RTB_HP_FRAC and ai_state != "approach":
			ai_state = "approach"
			banner.emit("WINGMAN #%d DAMAGED (%d%%) — RETURNING TO BASE FOR REPAIRS" % [slot + 2, roundi(hp / max_hp * 100.0)], false)
		# Under fire or tailed: defensive break
		var threat := _find_threat()
		if (was_hit or threat) and _evade_cooldown <= 0.0:
			_start_evade(threat)

	match ai_state:
		"parked":
			on_ground = true
			current_speed_kmh = 0.0
			if _park_timer > 0.0:
				_park_timer -= dt
			# Leaves when its timer runs out or as soon as the player rolls
			var player_rolling := not player.is_on_ground or player.airspeed > 55.0
			if _park_timer <= 0.0 or player_rolling:
				ai_state = "takeoff"
			return false

		"takeoff", "rollout":
			var rw := _runway_frame()
			on_ground = true
			if ai_state == "takeoff":
				current_speed_kmh = minf(cruise, current_speed_kmh + 50.0 * dt)
			else:
				current_speed_kmh = maxf(0.0, current_speed_kmh - 45.0 * dt)
			speed_ms = current_speed_kmh / 3.6
			velocity = rw.fwd * speed_ms
			position += velocity * dt
			position.y = rw.af.elevation + 1.5
			var rotate := -0.16 if ai_state == "takeoff" and current_speed_kmh >= takeoff_speed * 0.85 else 0.0
			basis = Basis.from_euler(Vector3(rotate, rw.h, 0.0))
			_set_gear(1.0, dt)
			if ai_state == "takeoff" and current_speed_kmh >= takeoff_speed:
				ai_state = "climbout"
				on_ground = false
			elif ai_state == "rollout" and current_speed_kmh <= 2.0:
				ai_state = "servicing"
				_service_timer = 6.0
				banner.emit("WINGMAN #%d ON THE GROUND — REARMING & REPAIRING" % (slot + 2), false)
			return false

		"servicing":
			on_ground = true
			_service_timer -= dt
			hp = minf(max_hp, hp + max_hp / 6.0 * dt)
			guns.reset()
			if _service_timer <= 0.0:
				hp = max_hp
				ai_state = "takeoff"
				banner.emit("WINGMAN #%d REPAIRED — TAKING OFF AGAIN" % (slot + 2), false)
			return false

		"climbout":
			on_ground = false
			_set_gear(0.0, dt)
			var fwd_flat := Vector3(basis.z.x, 0.0, basis.z.z).normalized()
			var target := position + fwd_flat * 800.0 + Vector3(0, 140, 0)
			_fly_toward(target, cruise, dt, 0.8, 1.5)
			if position.y > _ground(position.x, position.z) + 150.0:
				ai_state = "patrol"
				_pick_patrol_offset()
			return false

		"patrol":
			on_ground = false
			_set_gear(0.0, dt)
			var tgt := _pick_target()
			if tgt:
				_target_enemy = tgt
				_retarget_timer = 2.0
				ai_state = "attack"
				return false
			_patrol_timer -= dt
			var waypoint: Vector3
			var speed := cruise
			if position.distance_to(player_pos) > LEASH:
				waypoint = player_pos + _patrol_offset * 0.4  # strayed too far: head straight back
				speed = combat
			else:
				waypoint = player_pos + _patrol_offset
			waypoint = _safe_target(waypoint, 160.0)
			if Vector2(waypoint.x - position.x, waypoint.z - position.z).length() < 220.0 or _patrol_timer <= 0.0:
				_pick_patrol_offset()
			_fly_toward(waypoint, speed, dt)
			return false

		"attack":
			on_ground = false
			_set_gear(0.0, dt)
			_retarget_timer -= dt
			var tgt := _target_enemy
			var too_far := tgt == null or not tgt.is_alive \
					or tgt.position.distance_to(player_pos) > FIGHT_LEASH or position.distance_to(player_pos) > FIGHT_LEASH
			if too_far or _retarget_timer <= 0.0:
				tgt = _pick_target()
				_target_enemy = tgt
				_retarget_timer = 2.0
			if tgt == null:
				ai_state = "patrol"
				_pick_patrol_offset()
				return false
			var dist := position.distance_to(tgt.position)
			var t_lead := minf(1.2, dist / def.weapons.muzzle_velocity)
			var aim := tgt.position + tgt.velocity * t_lead
			aim.y = maxf(aim.y, _ground(aim.x, aim.z) + 60.0)
			var fwd := _fly_toward(aim, combat, dt, 1.0, 40.0)
			return _gun_decision(fwd, aim, dist, dt)

		"evade":
			# Hard break away from the attacker: dive if high, climb if low
			on_ground = false
			_set_gear(0.0, dt)
			_evade_timer -= dt
			var break_dir := basis.z.rotated(Vector3.UP, _evade_dir * 1.4)
			break_dir.y = -0.25 if position.y - _ground(position.x, position.z) > 350.0 else 0.3
			_fly_toward(position + break_dir.normalized() * 400.0, combat, dt, 1.25, 60.0)
			if _evade_timer <= 0.0:
				if hp < max_hp * RTB_HP_FRAC:
					ai_state = "approach"
				elif _target_enemy and _target_enemy.is_alive:
					ai_state = "attack"
					_retarget_timer = 3.0
				else:
					ai_state = "patrol"
					_pick_patrol_offset()
			return false

		"approach":
			# Swing out 2.6 km behind the threshold if too close, else intercept the centreline and hold 170 m
			on_ground = false
			var rw := _runway_frame()
			var rel: Vector3 = position - rw.threshold
			var along := rel.dot(rw.fwd)
			var lateral := rel.dot(rw.right)
			var target: Vector3
			if along > -1300.0:
				target = rw.threshold + rw.fwd * -2600.0 + rw.right * ((1.0 if lateral >= 0.0 else -1.0) * 500.0)
				target.y = rw.af.elevation + 280.0
			else:
				target = rw.threshold + rw.fwd * minf(-1450.0, along + 900.0)
				target.y = rw.af.elevation + 170.0
			target = _safe_target(target, 120.0)
			var fwd := _fly_toward(target, cruise * 0.7, dt, 1.0, 60.0)
			_set_gear(1.0 if along > -2200.0 and along < -1000.0 else 0.0, dt)
			if fwd.dot(rw.fwd) > 0.92 and absf(lateral) < 70.0 and along > -1800.0 and along < -1200.0:
				ai_state = "final"
			return false

		"final":
			# ≈6° glide path to the threshold, aiming slightly low so it flares onto the runway
			on_ground = false
			_set_gear(1.0, dt)
			var rw := _runway_frame()
			var rel: Vector3 = position - rw.threshold
			var along := rel.dot(rw.fwd)
			var lateral := absf(rel.dot(rw.right))
			var aim_along := along + 250.0
			var target: Vector3 = rw.threshold + rw.fwd * aim_along
			target.y = rw.af.elevation + 1.5 + maxf(0.0, -aim_along) * 0.10 - 4.0
			_fly_toward(target, takeoff_speed * 1.35, dt, 1.6, 0.0)
			if position.y <= rw.af.elevation + 6.0 and along > -60.0 and along < rw.af.length - 250.0:
				ai_state = "rollout"
				position.y = rw.af.elevation + 1.5
				current_speed_kmh = minf(current_speed_kmh, takeoff_speed * 1.3)
			elif along > rw.af.length - 250.0 or lateral > 200.0:
				ai_state = "approach"  # go around
			return false

	ai_state = "patrol"
	return false


# =====================================================================================
# Helpers
# =====================================================================================

## Kinematic banked flight toward a point (flyWingmanToward); returns the new forward vector
func _fly_toward(target: Vector3, target_kmh: float, dt: float, turn_scale := 1.0, min_agl := 25.0) -> Vector3:
	var accel := 70.0 * dt
	current_speed_kmh += clampf(target_kmh - current_speed_kmh, -accel, accel)
	speed_ms = current_speed_kmh / 3.6
	var to := target - position
	if to.length_squared() > 0.0001:
		var local_aim := basis.orthonormalized().transposed() * to.normalized()
		var bank := -clampf(local_aim.x * 1.4, -0.9, 0.9)
		var up := Vector3.RIGHT if absf(to.normalized().y) > 0.999 else Vector3.UP
		var goal := (Basis.looking_at(to.normalized(), up, true) * Basis(AXIS_Z, bank)).get_rotation_quaternion()
		quaternion = quaternion.slerp(goal, minf(1.0, def.arcade_pitch_rate * 0.78 * turn_scale * dt))
	var fwd := basis.z.normalized()
	velocity = fwd * speed_ms
	position += velocity * dt
	var floor_y := _ground(position.x, position.z) + maxf(1.5, min_agl)
	if position.y < floor_y:
		position.y = floor_y
	return fwd


func _set_gear(target: float, dt: float) -> void:
	gear_pos = clampf(gear_pos + signf(target - gear_pos) * 0.6 * dt, 0.0, 1.0)
	if absf(target - gear_pos) < 0.02:
		gear_pos = target
	model.set_gear(gear_pos)


# Keep a waypoint safely above the terrain under it and under the wingman
func _safe_target(p: Vector3, agl: float) -> Vector3:
	var g := maxf(_ground(p.x, p.z), _ground(position.x, position.z))
	p.y = clampf(p.y, g + agl, World.MAX_ALTITUDE - 300.0)
	return p


func _pick_patrol_offset() -> void:
	var a := randf() * TAU
	var r := randf_range(PATROL_MIN, PATROL_MAX)
	_patrol_offset = Vector3(cos(a) * r, -120.0 + randf() * 320.0, sin(a) * r)
	_patrol_timer = 10.0 + randf() * 8.0


# Closest enemy inside the fight leash around the player; ones attacking the player count as 600 m closer
func _pick_target() -> EnemyPlane:
	var best: EnemyPlane = null
	var best_score := INF
	for ep in director.planes:
		if not ep.is_alive or ep.ai_state == "takeoff":
			continue
		var d := position.distance_to(ep.position)
		if d > ENGAGE or ep.position.distance_to(player.position) > FIGHT_LEASH:
			continue
		var score := d - (600.0 if ep.ai_state == "attack" else 0.0)
		if score < best_score:
			best_score = score
			best = ep
	return best


# An enemy close behind with its nose on us
func _find_threat() -> EnemyPlane:
	for ep in director.planes:
		if not ep.is_alive or ep.ai_state == "takeoff":
			continue
		var to_us := position - ep.position
		var d := to_us.length()
		if d > THREAT or d < 1.0:
			continue
		if ep.basis.z.normalized().dot(to_us / d) > 0.9:
			return ep
	return null


func _start_evade(threat: EnemyPlane) -> void:
	ai_state = "evade"
	_evade_timer = 2.0 + randf() * 1.5
	_evade_dir = -1.0 if randf() < 0.5 else 1.0
	_evade_cooldown = 5.0
	if threat:
		_target_enemy = threat


# Bursts while the aim point sits in a tight cone ahead
func _gun_decision(fwd: Vector3, aim: Vector3, dist: float, dt: float) -> bool:
	var dir_to_aim := (aim - position).normalized()
	if dist < 700.0 and fwd.dot(dir_to_aim) > 0.96 and not guns.is_jammed:
		if _burst_cooldown > 0.0:
			_burst_cooldown -= dt
			return false
		_burst_timer += dt
		if _burst_timer >= (0.40 if guns.heat > 0.70 else 0.90):
			_burst_timer = 0.0
			_burst_cooldown = randf_range(0.40, 0.70)
		return true
	_burst_timer = 0.0
	if _burst_cooldown > 0.0:
		_burst_cooldown -= dt
	return false


# Home runway: heading, forward / right axes, landing threshold in the right lane
func _runway_frame() -> Dictionary:
	var af: Dictionary = World.airports[World.current_airfield]
	var h := deg_to_rad(af.spawn_heading)
	var fwd := Vector3(sin(h), 0.0, cos(h))
	var right := Vector3(cos(h), 0.0, -sin(h))
	var threshold: Vector3 = Vector3(af.x, af.elevation + 1.5, af.z) - fwd * (af.length / 2.0 - 40.0) + right * 8.0
	return {"af": af, "h": h, "fwd": fwd, "right": right, "threshold": threshold}


func _ground(x: float, z: float) -> float:
	return maxf(World.SEA_LEVEL, World.get_terrain_height(x, z))
