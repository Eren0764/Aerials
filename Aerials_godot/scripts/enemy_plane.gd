class_name EnemyPlane
extends Node3D
## One AI aircraft, ported from the per-plane half of updateEnemyPlanes() in game.js plus
## assignEnemyToHomeAirbase, enterEnemyPatrolState and damageEnemyPlane:
##   takeoff -> climb -> patrol (orbit / figure-8) <-> attack (lead pursuit, high yo-yo, evasion,
##   extend & cool, terrain probe) -> dying (spiral) -> respawn at home base after 8 s (3 lives).
## Wingmen hold echelon formation on their lead until the pair is sent to attack.
## Who attacks whom is decided by EnemyDirector; this node only flies and shoots.

signal banner(text: String, is_kill: bool)
signal hit_by_player(is_kill: bool)  # HUD hit marker hooks in here

const AXIS_X := Vector3(1, 0, 0)
const AXIS_Z := Vector3(0, 0, 1)
const RESPAWN_DELAY := 8.0

# --- Identity / team ---
var def: Dictionary
var plane_id := "mustang"
var team_id := "team_mustang"  # side key: every AI team is hostile to everyone else
var role := "lead"
var member_number := 1
var slot := 0
var team_size := 2
var callsign := ""
var partner: EnemyPlane
var home_airfield := 1
var airfield_index := 1
var director: Node  # EnemyDirector (for the list of planes sharing a runway)

# --- Patrol pattern ---
var pattern := "orbit"
var center_x := 0.0
var center_z := 0.0
var base_alt := 500.0
var radius := 2000.0
var dir := 1.0
var phase := 0.0
var cruise_speed_kmh := 300.0
var bank_angle := 0.35

# --- Flight / combat state ---
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
var ai_state := "takeoff"       # takeoff, climb, patrol, attack, dying
var attack_target: Node3D        # PlayerAircraft or another EnemyPlane
var tactical_state := "pursuit"  # pursuit, high_yoyo, evasion, extend_and_cool
var tactical_timer := 0.0
var evasion_type := "barrel_roll"
var evasion_dir := 1.0
var burst_timer := 0.0
var burst_cooldown := 0.0
var takeoff_delay := 0.0
var gear_pos := 1.0
var break_off_timer := 0.0
var respawn_timer := 0.0
var fall_speed := 0.0
var smoke_timer := 0.0
var damage_smoke_timer := 0.0
var engine_damaged := false
var wing_damaged := false
var is_firing := false

var guns: GunSystem
var model: AircraftModel
var _ballistics: Ballistics

# GunSystem reads these
var airspeed: float:
	get:
		return current_speed_kmh
var is_crashed: bool:
	get:
		return not is_alive


## Called before add_child. cfg = one EnemyDirector.SQUADRONS entry (with centre already placed)
func setup(cfg: Dictionary, member_index: int, size: int, home: int, paint: Color) -> void:
	plane_id = cfg.plane_id
	def = AircraftDefs.get_def(plane_id)
	team_id = cfg.team_id
	slot = member_index
	member_number = member_index + 1
	role = "lead" if member_index == 0 else "wingman"
	team_size = size
	callsign = "%s #%d" % [def.short_name, member_number]
	name = "%s_%d" % [plane_id, member_number]
	pattern = cfg.pattern
	center_x = cfg.center_x
	center_z = cfg.center_z
	base_alt = cfg.alt
	radius = cfg.radius
	dir = cfg.dir
	phase = cfg.phase
	cruise_speed_kmh = cfg.speed_kmh
	bank_angle = cfg.bank_angle
	max_hp = def.max_hp
	hp = max_hp
	home_airfield = home
	model = AircraftModel.new(plane_id, paint)


func _ready() -> void:
	add_to_group("bullet_targets")
	_ballistics = get_tree().get_first_node_in_group("ballistics")
	add_child(model)
	guns = GunSystem.new()
	guns.name = "Guns"
	guns.use_light = false
	guns.is_player = false
	guns.team = team_id
	add_child(guns)
	add_child(DorsalGunner.new())


# =====================================================================================
# Target / bullet interfaces
# =====================================================================================

## What an attacker needs to know about this plane (getEnemyTarget); {} when not a valid target
func get_target_info() -> Dictionary:
	if not is_alive or is_dying:
		return {}
	var flying := ai_state != "takeoff"
	return {"pos": global_position, "basis": basis, "velocity": velocity, "airborne": flying,
			"firing": is_firing, "engageable": flying, "side": team_id}


func bullet_team() -> String:
	return team_id


func bullet_hit_test(p0: Vector3, p1: Vector3) -> Dictionary:
	if not is_alive:
		return {}
	return Ballistics.aircraft_hit_test(self, p0, p1)


## damageEnemyPlane
func take_bullet_hit(damage: float, module: String, point: Vector3, shooter: Node3D) -> void:
	if not is_alive:
		return
	var final_dmg := roundf(damage * (1.25 if module == "ENGINE" else 1.0))
	hp = maxf(0.0, hp - final_dmg)
	if module == "ENGINE":
		engine_damaged = true
	elif module == "WING":
		wing_damaged = true
	_ballistics.spawn_impact(point, false, final_dmg)

	var by_player := shooter is PlayerAircraft
	var is_kill := hp <= 0.0
	if by_player:
		hit_by_player.emit(is_kill)

	if not is_kill:
		if by_player:
			banner.emit("HIT %s [%s] — %d/%d HP (%d/%d ♥)" % [callsign, module, hp, max_hp, lives, max_lives], false)
		return

	is_alive = false
	is_dying = true
	ai_state = "dying"
	fall_speed = 6.0
	lives = maxi(0, lives - 1)
	guns.trigger = false
	is_firing = false
	_ballistics.explosion_at(global_position, 2.3)

	# Lead down while #2 was in formation: #2 carries on as a solo lead
	if role == "lead" and partner and partner.is_alive and partner.ai_state == "patrol":
		partner.enter_patrol_state()

	# AI-vs-AI kills (incl. another team's flak) carry no points; the friendly wingman's / friendly flak's do
	var by_ai: bool = shooter is EnemyPlane or (shooter is Defenses.Battery and shooter.side != "friendly")
	var killer := "%s SHOT DOWN:" % (shooter.pilot_name if by_player else (shooter.callsign if "callsign" in shooter else "AI"))
	if lives > 0 and _home_base_destroyed():
		lives = 0
		permanently_dead = true
		banner.emit("%s %s — HOME BASE DESTROYED, NO RESPAWN!%s" % [killer, callsign, "" if by_ai else " +500"], true)
	elif lives > 0:
		respawn_timer = RESPAWN_DELAY
		banner.emit("%s %s (%d/%d LIVES LEFT)%s" % [killer, callsign, lives, max_lives, "" if by_ai else " +250"], not by_ai)
	else:
		permanently_dead = true
		if by_ai:
			banner.emit("%s %s — OUT OF LIVES (0/%d)" % [killer, callsign, max_lives], true)
		else:
			banner.emit("%s ELIMINATED %s! (0/%d LIVES) +500" % [shooter.pilot_name if by_player else "WINGMAN", callsign, max_lives], true)


# =====================================================================================
# Spawn / state helpers
# =====================================================================================

## Line up on the home runway in staggered formation, gear down, ready to roll (assignEnemyToHomeAirbase)
func assign_home_airbase() -> void:
	airfield_index = home_airfield
	var af: Dictionary = World.airports[airfield_index]

	# Other teams already queued on this runway push this team further back and delay it
	var other_teams := 0
	for other in director.planes:
		if other != self and other != partner and other.is_alive and other.ai_state == "takeoff" \
				and other.airfield_index == airfield_index and other.role == "lead":
			other_teams += 1

	var heading := deg_to_rad(af.spawn_heading)
	var fwd := Vector3(sin(heading), 0.0, cos(heading))
	var right := Vector3(cos(heading), 0.0, -sin(heading))
	var lateral := 6.5 if slot % 2 == 1 else -6.5
	var back := other_teams * (34.0 + team_size * 18.0) + slot * 18.0
	position = Vector3(af.spawn_x, af.elevation + 1.5, af.spawn_z) + right * lateral - fwd * back
	basis = Basis.from_euler(Vector3(0.0, heading, 0.0))

	ai_state = "takeoff"
	takeoff_delay = other_teams * 3.5 + (0.45 * slot if role == "wingman" else 0.0)
	current_speed_kmh = 0.0
	speed_ms = 0.0
	velocity = Vector3.ZERO
	gear_pos = 1.0
	model.set_gear(1.0)
	break_off_timer = 0.0
	guns.reset()
	tactical_state = "pursuit"
	tactical_timer = 0.0
	evasion_type = "barrel_roll"
	evasion_dir = 1.0
	burst_timer = 0.0
	burst_cooldown = 0.0


## Rejoin the patrol orbit from wherever the plane is, without teleporting (enterEnemyPatrolState)
func enter_patrol_state() -> void:
	ai_state = "patrol"
	attack_target = null
	phase = atan2(position.z - center_z, position.x - center_x)
	if pattern != "figure8":
		center_x = clampf(position.x - cos(phase) * radius, World.MIN_X + radius + 100.0, World.MAX_X - radius - 100.0)
		center_z = clampf(position.z - sin(phase) * radius, World.MIN_Z + radius + 100.0, World.MAX_Z - radius - 100.0)
		phase = atan2(position.z - center_z, position.x - center_x)


func _home_base_destroyed() -> bool:
	return World.airports[home_airfield].get("is_destroyed", false)


# =====================================================================================
# Frame update
# =====================================================================================

func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	if is_alive:
		_fly(dt)
	elif is_dying:
		_death_spiral(dt)
	elif not permanently_dead and lives > 0:
		if _home_base_destroyed():
			lives = 0
			permanently_dead = true
		else:
			respawn_timer -= dt
			if respawn_timer <= 0.0:
				hp = max_hp
				is_alive = true
				is_dying = false
				engine_damaged = false
				wing_damaged = false
				visible = true
				assign_home_airbase()
				banner.emit("%s TAKING OFF FROM %s (%d/%d LIVES)" % [callsign, World.airports[airfield_index].code, lives, max_lives], false)


func _fly(dt: float) -> void:
	var wants_to_fire := false
	model.spin_propeller(35.0 if ai_state == "takeoff" and takeoff_delay > 0.0 else 82.0, dt)

	var lead_in_formation := role == "wingman" and partner != null and partner.is_alive and not partner.is_dying \
			and (partner.ai_state == "climb" or partner.ai_state == "patrol") and ai_state != "attack"
	var target_info: Dictionary = attack_target.get_target_info() if ai_state == "attack" and is_instance_valid(attack_target) else {}

	if ai_state == "takeoff":
		_takeoff(dt)
	elif lead_in_formation:
		_hold_formation(dt)
	elif ai_state == "climb":
		_retract_gear(dt)
		_climb(dt)
	elif ai_state == "attack" and not target_info.is_empty():
		_retract_gear(dt)
		wants_to_fire = _dogfight(target_info, dt)
	else:
		_retract_gear(dt)
		_patrol(dt)

	guns.trigger = wants_to_fire
	is_firing = wants_to_fire

	# Damage visuals: heavy trail below 30% HP, light puffs when damaged
	var hp_ratio := hp / max_hp
	if hp_ratio < 0.30:
		damage_smoke_timer = _ballistics.emit_damage_smoke(self, hp_ratio, dt, damage_smoke_timer)
	elif hp_ratio < 0.85 or engine_damaged or wing_damaged:
		smoke_timer += dt
		if smoke_timer >= (0.03 if hp_ratio < 0.45 else 0.06):
			smoke_timer = 0.0
			_ballistics.smoke_at(global_position)


func _retract_gear(dt: float) -> void:
	if gear_pos > 0.0:
		gear_pos = maxf(0.0, gear_pos - 0.50 * dt)
		model.set_gear(gear_pos)


# --- Phase A: staggered take-off roll ---
func _takeoff(dt: float) -> void:
	if takeoff_delay > 0.0:
		takeoff_delay -= dt
		return
	var af: Dictionary = World.airports[airfield_index]
	var heading := deg_to_rad(af.spawn_heading)
	current_speed_kmh = minf(cruise_speed_kmh, current_speed_kmh + 65.0 * dt)
	speed_ms = current_speed_kmh / 3.6
	velocity = Vector3(sin(heading), 0.0, cos(heading)) * speed_ms
	position += velocity * dt
	position.y = af.elevation + 1.5
	var takeoff_spd: float = def.takeoff_speed
	var pitch_up := -0.16 if current_speed_kmh >= takeoff_spd * 0.85 else 0.0  # negative X = nose up
	basis = Basis.from_euler(Vector3(pitch_up, heading, 0.0))
	if current_speed_kmh >= takeoff_spd:
		ai_state = "climb"


# --- Wingman echelon: alternate right/left of the lead, stepping out and back ---
func _hold_formation(dt: float) -> void:
	var lead := partner
	ai_state = lead.ai_state
	_retract_gear(dt)
	var rank := ceili(maxi(slot, 1) / 2.0)
	var side := 1.0 if maxi(slot, 1) % 2 == 1 else -1.0
	var desired := lead.position + lead.basis * Vector3(26.0 * rank * side, 3.0 * rank, -32.0 * rank)
	desired.y = maxf(_ground_y(desired.x, desired.z) + 18.0, desired.y)
	var prev := position
	position = position.lerp(desired, minf(1.0, 4.8 * dt))
	velocity = (position - prev) / dt if dt > 0.0001 else velocity
	speed_ms = velocity.length()
	current_speed_kmh = lead.current_speed_kmh
	quaternion = quaternion.slerp(lead.quaternion, minf(1.0, 5.5 * dt))
	phase = lead.phase


# --- Phase B: climb out toward the patrol centre ---
func _climb(dt: float) -> void:
	current_speed_kmh = minf(cruise_speed_kmh, current_speed_kmh + 48.0 * dt)
	speed_ms = current_speed_kmh / 3.6
	var to_target := Vector3(center_x, base_alt, center_z) - position
	if to_target.length_squared() < 10000.0:
		to_target = Vector3(0, 60, 200)
	to_target.y = maxf(to_target.y, 45.0)
	quaternion = quaternion.slerp(_look_quat(to_target), minf(1.0, 1.4 * dt))
	_advance(dt)
	if position.y >= base_alt - 25.0:
		enter_patrol_state()


# --- Phase D: orbit / figure-8 patrol ---
func _patrol(dt: float) -> void:
	current_speed_kmh = lerpf(current_speed_kmh, cruise_speed_kmh, minf(1.0, 2.0 * dt))
	speed_ms = current_speed_kmh / 3.6
	phase += speed_ms / radius * dir * dt

	var next: Vector3
	var bank: float
	if pattern == "figure8":
		next = Vector3(center_x + sin(phase) * radius, base_alt + cos(phase) * 18.0, center_z + sin(phase * 2.0) * radius * 0.55)
		bank = cos(phase * 2.0) * bank_angle
	else:
		next = Vector3(center_x + cos(phase) * radius, base_alt + sin(phase * 2.0) * 12.0, center_z + sin(phase) * radius)
		bank = -dir * absf(bank_angle)

	if dt > 0.0001:
		velocity = (next - position) / dt
	position = next
	if velocity.length_squared() > 0.1:
		quaternion = _look_quat(velocity, bank)


# --- Phase C: dogfight. Returns whether the guns should fire this frame ---
func _dogfight(tgt: Dictionary, dt: float) -> bool:
	var wants_to_fire := false
	var tgt_pos: Vector3 = tgt.pos
	var tgt_basis: Basis = tgt.basis
	var to_target := tgt_pos - position
	var dist := to_target.length()
	var dir_to_target := to_target / maxf(dist, 0.001)
	var forward := basis.z.normalized()
	var target_fwd := tgt_basis.z.normalized()

	var bot_aim_dot := forward.dot(dir_to_target)
	var target_aim_dot := target_fwd.dot(-dir_to_target)
	var aspect_dot := forward.dot(target_fwd)

	# Threat: target on our six, tracking us, maybe firing
	var threatening: bool = tgt.airborne and dist < 760.0 and target_aim_dot > 0.83 and aspect_dot > -0.25
	var firing_at_us: bool = threatening and tgt.firing

	if tactical_timer > 0.0:
		tactical_timer -= dt

	# Anti-ramming break-off inside 85 m
	if dist < 85.0 and break_off_timer <= 0.0:
		break_off_timer = 2.2
		tactical_state = "extend_and_cool"
		tactical_timer = 2.4
	if break_off_timer > 0.0:
		break_off_timer -= dt

	# Defensive evasion when the target gets on our tail; each type has its favourite
	if (firing_at_us or (threatening and randf() < 0.5 * dt)) and tactical_state != "evasion" and break_off_timer <= 0.0:
		tactical_state = "evasion"
		tactical_timer = 2.2 + randf() * 1.5
		evasion_dir = 1.0 if randf() < 0.5 else -1.0
		if plane_id == "zero" or plane_id == "il2":
			evasion_type = "scissors"
		elif plane_id == "bf109":
			evasion_type = "spiral_climb" if randf() < 0.5 else "barrel_roll"
		else:
			evasion_type = "dive_extend" if position.y > 200.0 and randf() < 0.45 else "barrel_roll"

	# High yo-yo to avoid overshooting when closing fast at a high angle
	if tactical_state == "pursuit" and dist < 240.0 and bot_aim_dot < 0.85 and current_speed_kmh > 310.0:
		tactical_state = "high_yoyo"
		tactical_timer = 2.2

	# Extend & cool when the guns are jammed or nearly
	if (guns.is_jammed or guns.heat > 0.90) and tactical_state != "evasion" and tactical_state != "extend_and_cool":
		tactical_state = "extend_and_cool"
		tactical_timer = 2.8

	if tactical_timer <= 0.0 and (tactical_state == "evasion" or tactical_state == "high_yoyo"):
		tactical_state = "pursuit"
	if tactical_state == "extend_and_cool" and not guns.is_jammed and guns.heat < 0.28 and dist > 420.0 and break_off_timer <= 0.0:
		tactical_state = "pursuit"

	# Combat throttle / WEP energy management
	var target_kmh := cruise_speed_kmh * 1.08
	if tactical_state == "extend_and_cool" or (tactical_state == "evasion" and evasion_type == "dive_extend"):
		target_kmh = cruise_speed_kmh * 1.22
	elif tactical_state == "evasion" and evasion_type == "scissors":
		target_kmh = cruise_speed_kmh * 0.86
	elif tactical_state == "high_yoyo":
		target_kmh = cruise_speed_kmh * 0.92
	current_speed_kmh = lerpf(current_speed_kmh, target_kmh, minf(1.0, 2.2 * dt))
	speed_ms = current_speed_kmh / 3.6

	# Terrain probe ahead (emergency priority)
	var look_ahead := maxf(90.0, speed_ms * 1.8)
	var max_ground := 0.0
	for f in [0.4, 0.8, 1.0]:
		var p: Vector3 = position + forward * look_ahead * f
		max_ground = maxf(max_ground, _ground_y(p.x, p.z))
	var terrain_hazard := position.y < max_ground + 65.0 or (velocity.y < -12.0 and position.y < max_ground + 95.0)

	var aim_pos: Vector3
	var desired_bank := 0.0
	var inv := basis.orthonormalized().transposed()

	if terrain_hazard:
		aim_pos = position + forward * 160.0
		aim_pos.y = maxf(aim_pos.y, max_ground + 120.0)
	elif tactical_state == "evasion":
		match evasion_type:
			"scissors":
				var cycle := (3.5 - tactical_timer) * 4.2
				desired_bank = sin(cycle) * 1.25 * evasion_dir
				var lat := Vector3(forward.z, 0.0, -forward.x).normalized()
				aim_pos = position + forward * 110.0 + lat * sin(cycle) * 85.0 + Vector3(0, 15, 0)
			"barrel_roll":
				var roll := (3.5 - tactical_timer) * 3.8
				desired_bank = roll * evasion_dir
				aim_pos = position + forward * 130.0 + Vector3(cos(roll) * 35.0, sin(roll) * 35.0 + 20.0, 0.0)
			"spiral_climb":
				desired_bank = 0.72 * evasion_dir
				aim_pos = position + forward * 110.0 + Vector3(0, 105, 0)
			_:  # dive_extend
				desired_bank = -0.35 * evasion_dir
				aim_pos = position + forward * 220.0 + Vector3(0, -35, 0)
	elif tactical_state == "high_yoyo":
		aim_pos = position + forward * 80.0 + Vector3(0, 95, 0)
		desired_bank = -clampf((inv * dir_to_target).x * 1.5, -0.9, 0.9)
	elif tactical_state == "extend_and_cool" or break_off_timer > 0.0:
		aim_pos = position + (position - tgt_pos).normalized() * 360.0 + Vector3(0, 45, 0)
		desired_bank = 0.35 if role == "wingman" else -0.35
	else:
		# Lead pursuit with bullet time-of-flight and drop compensation
		var t_lead := minf(1.35, dist / def.weapons.muzzle_velocity)
		aim_pos = tgt_pos + (tgt.velocity as Vector3) * t_lead
		aim_pos.y += 0.5 * Ballistics.BULLET_GRAVITY * t_lead * t_lead
		# Wingman brackets the target from the side (pincer)
		if role == "wingman" and partner and partner.is_alive and partner.ai_state == "attack" and dist > 220.0:
			aim_pos += tgt_basis.x * (85.0 if member_number % 2 == 0 else -85.0) + Vector3(0, 20, 0)

		var dir_to_aim := (aim_pos - position).normalized()
		desired_bank = -clampf((inv * dir_to_aim).x * 1.45, -0.92, 0.92)

		# Disciplined bursts: 0.9 s (0.4 s when hot), then a 0.35-0.7 s pause
		if dist < 780.0 and forward.dot(dir_to_aim) > 0.948 and not guns.is_jammed:
			if burst_cooldown > 0.0:
				burst_cooldown -= dt
			else:
				wants_to_fire = true
				burst_timer += dt
				if burst_timer >= (0.40 if guns.heat > 0.70 else 0.90):
					burst_timer = 0.0
					burst_cooldown = randf_range(0.35, 0.70)
		else:
			burst_timer = 0.0
			if burst_cooldown > 0.0:
				burst_cooldown -= dt

	# Never aim into the ground
	aim_pos.y = maxf(aim_pos.y, _ground_y(aim_pos.x, aim_pos.z) + 55.0)

	# Turn rate comes from the agility tier only
	var turn_agility: float = def.arcade_pitch_rate * 0.74
	quaternion = quaternion.slerp(_look_quat(aim_pos - position, desired_bank), minf(1.0, turn_agility * dt))
	_advance(dt)
	return wants_to_fire


# --- Shot down: uncontrolled spiral, smoke, explode on impact ---
func _death_spiral(dt: float) -> void:
	fall_speed += 26.0 * dt
	position += velocity * dt * 0.65
	position.y -= fall_speed * dt
	rotate_object_local(AXIS_X, 0.65 * dt)
	rotate_object_local(AXIS_Z, 2.6 * dt)
	smoke_timer += dt
	if smoke_timer >= 0.025:
		smoke_timer = 0.0
		_ballistics.smoke_at(global_position)
	if position.y <= _ground_y(position.x, position.z) + 1.5:
		is_dying = false
		visible = false
		_ballistics.explosion_at(global_position, 2.5)


# =====================================================================================
# Helpers
# =====================================================================================

func _advance(dt: float) -> void:
	velocity = basis.z.normalized() * speed_ms
	position += velocity * dt


## Orientation with +Z along dir, then banked about the nose (Object3D.lookAt + rotateZ)
func _look_quat(look_dir: Vector3, bank := 0.0) -> Quaternion:
	if look_dir.length_squared() < 0.000001:
		return quaternion
	var d := look_dir.normalized()
	var up := Vector3.RIGHT if absf(d.y) > 0.999 else Vector3.UP
	return (Basis.looking_at(d, up, true) * Basis(AXIS_Z, bank)).get_rotation_quaternion()


func _ground_y(x: float, z: float) -> float:
	return maxf(World.SEA_LEVEL, World.get_terrain_height(x, z))
