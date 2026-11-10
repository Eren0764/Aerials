class_name PlayerAircraft
extends Node3D
## Player aircraft, ported from game.js: updatePhysics (throttle/WEP, Virtual Instructor mouse aim,
## manual WASD/QE override, energy model, stall, lift/sink, take-off, landing/crash rules, airfield
## servicing, sector boundary, warnings), setupInputs (keyboard/mouse), respawnAircraft, toggleGear/Flaps.
##
## Same axes as the Three.js model: local +Z = nose, +Y = up. rotate_object_local() is the exact
## equivalent of Object3D.rotateX/Y/Z and both engines are right-handed, so every sign is copied unchanged.
## Runs in _process (like requestAnimationFrame) so the chase camera never jitters against it.

signal banner(text: String, is_kill: bool)
signal crashed(reason: String)
signal serviced(airfield_index: int)  # weapons / bombs hook in here to rearm

const MOUSE_SENSITIVITY := 0.0022
const LANDING_GEAR_HEIGHT := 1.5
const GEAR_TRANSITION_SPEED := 0.5  # ~2 s full cycle
const SERVICE_TIME := 10.0
const AXIS_X := Vector3(1, 0, 0)
const AXIS_Y := Vector3(0, 1, 0)
const AXIS_Z := Vector3(0, 0, 1)

# Keyboard bindings (created in code, see _setup_input_actions)
const KEY_ACTIONS := {
	"pitch_down": [KEY_W, KEY_UP],      # push nose down
	"pitch_up": [KEY_S, KEY_DOWN],      # pull nose up
	"roll_left": [KEY_A, KEY_LEFT],
	"roll_right": [KEY_D, KEY_RIGHT],
	"yaw_left": [KEY_Q],
	"yaw_right": [KEY_E],
	"throttle_up": [KEY_SHIFT],
	"throttle_down": [KEY_CTRL],
	"free_look": [KEY_C],
	"zoom": [KEY_Z],
	"toggle_flaps": [KEY_F],
	"toggle_gear": [KEY_G],
	"toggle_camera": [KEY_V],
	"respawn": [KEY_R, KEY_ENTER, KEY_SPACE],
	"fire": [KEY_SPACE],
}
const MOUSE_ACTIONS := {
	"zoom": [MOUSE_BUTTON_RIGHT],
	"fire": [MOUSE_BUTTON_LEFT],
}

# --- Aircraft definition (AircraftDefs.get_def) ---
var def: Dictionary
var hp := 120.0
var max_hp := 120.0

# --- Flight state (state.flight) ---
var throttle := 0.35          # 0.0 .. 1.10 (1.10 = WEP)
var is_wep := false
var wep_max_duration := 10.0
var wep_duration_left := 10.0
var wep_cooldown_max := 15.0
var wep_cooldown_timer := 0.0
var wep_is_cooling := false
var airspeed := 0.0           # km/h
var velocity := Vector3.ZERO  # m/s, along the nose
var vertical_speed := 0.0     # m/s
var altitude_msl := 0.0
var altitude_agl := 0.0
var is_on_ground := true
var instructor_active := true
var g_load := 1.0
var turn_intensity := 0.0
var stall_warning := false
var pull_up_warning := false
var gear_warning := false
var landing_overspeed_warning := false
var max_landing_speed := 185.0

var flaps_combat := false     # state.flaps === 'combat'
var gear_position := 1.0      # 1 = down, 0 = up
var gear_target := 1.0

var is_crashed := false
var airfield_wait_timer := 0.0
var needs_airfield_service := false
var serviced_at_airfield := -1

# --- War Thunder mouse aim + free look ---
var aim_yaw := 0.0
var aim_pitch := 0.0
var aim_direction := Vector3(0, 0, 1)
var free_look_yaw := 0.0
var free_look_pitch := 0.0
var free_look := false
var zoom := false

# Settings (percent sliders in the JS settings panel, as multipliers here)
var aim_sens_scale := 1.0
var throttle_rate_scale := 1.0
var invert_pitch := false

var _last_control_rates := Vector3.ZERO  # pitch, yaw, roll rates for control-surface animation later
var model: AircraftModel
var guns: GunSystem
var pilot_name := "MAVERICK"
var lives := 3                  # per sortie; a crash costs one, airfield service never restores them
var max_lives := 3
var is_flying_wingman := false  # took over wingman #2 after running out of lives (once per sortie)
var shoot_downs := 0            # kills shown on the debrief screens
var bomb_count := 2             # bombs left on the belly rack (BombSystem drops them)
var bomb_max := 2
var _damage_smoke_timer := 0.0


func _ready() -> void:
	_setup_input_actions()
	add_to_group("bullet_targets")
	guns = GunSystem.new()
	guns.name = "Guns"
	add_child(guns)
	add_child(DorsalGunner.new())  # idle unless the aircraft has one (SM.79)
	set_aircraft("mustang")
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _setup_input_actions() -> void:
	for action in KEY_ACTIONS:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in KEY_ACTIONS[action]:
			var ev := InputEventKey.new()
			ev.physical_keycode = key
			if not InputMap.action_has_event(action, ev):  # a new sortie re-runs this
				InputMap.action_add_event(action, ev)
	for action in MOUSE_ACTIONS:
		for button in MOUSE_ACTIONS[action]:
			var ev := InputEventMouseButton.new()
			ev.button_index = button
			if not InputMap.action_has_event(action, ev):
				InputMap.action_add_event(action, ev)


## Load a plane's stats and (placeholder) model; mirrors switchAircraft()
func set_aircraft(id: String) -> void:
	def = AircraftDefs.get_def(id)
	max_hp = def.max_hp
	hp = max_hp
	bomb_max = def.bomb_rack.size()
	bomb_count = bomb_max
	if model:
		model.queue_free()
	model = AircraftModel.new(id)
	add_child(model)
	reset_wep()


# =====================================================================================
# Input (mousemove / wheel / mousedown / keydown listeners)
# =====================================================================================

func _unhandled_input(event: InputEvent) -> void:
	var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED

	if event is InputEventMouseMotion and captured:
		apply_aim_delta(event.screen_relative.x, event.screen_relative.y, aim_sens_scale)
	elif event is InputEventMouseButton and event.pressed:
		if not captured:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED  # click to re-lock (requestLock)
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_step_throttle(1.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_step_throttle(-1.0)
	elif event.is_action_pressed("toggle_flaps") and not is_crashed:
		flaps_combat = not flaps_combat
	elif event.is_action_pressed("toggle_gear") and not is_crashed:
		toggle_gear()


func _step_throttle(sign: float) -> void:
	var max_thr := 1.0 if _wep_on_cooldown() else 1.10
	throttle = clampf(throttle + sign * 0.05 * throttle_rate_scale, 0.0, max_thr)
	is_wep = throttle > 1.001


func apply_aim_delta(dx: float, dy: float, sens_scale: float) -> void:
	if free_look:
		# Free look orbits the camera only; flight path is untouched
		free_look_yaw = wrapf(free_look_yaw - dx * MOUSE_SENSITIVITY * 1.3 * sens_scale, -PI, PI)
		free_look_pitch = clampf(free_look_pitch - dy * MOUSE_SENSITIVITY * 1.3 * sens_scale, -1.35, 1.35)
	else:
		# Finer aim while zoomed
		var sens := MOUSE_SENSITIVITY * sens_scale * (0.55 if zoom else 1.0)
		var pitch_delta := (-1.0 if invert_pitch else 1.0) * dy * sens
		set_mouse_aim_angles(aim_yaw - dx * sens, aim_pitch - pitch_delta)


## Clamp / wrap the aim angles and recompute the unit aim vector
func set_mouse_aim_angles(yaw: float, pitch: float) -> void:
	aim_pitch = clampf(pitch, -1.45, 1.45)
	aim_yaw = wrapf(yaw, -PI, PI)
	var cp := cos(aim_pitch)
	aim_direction = Vector3(cp * sin(aim_yaw), sin(aim_pitch), cp * cos(aim_yaw)).normalized()


func toggle_gear() -> void:
	# Squat switch: gear cannot be raised while resting on the ground
	if is_on_ground and gear_target == 1.0:
		return
	gear_target = 0.0 if gear_target == 1.0 else 1.0


# =====================================================================================
# Frame update
# =====================================================================================

func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)  # same clamp as animate()
	free_look = Input.is_action_pressed("free_look")
	zoom = Input.is_action_pressed("zoom")
	guns.trigger = Input.is_action_pressed("fire") and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if is_crashed:
		return
	_update_physics(dt)
	_animate_model(dt)


func _update_physics(dt: float) -> void:
	gear_position = move_toward(gear_position, gear_target, GEAR_TRANSITION_SPEED * dt)

	# 1. Throttle & WEP with cooldown
	var max_throttle := 1.0 if _wep_on_cooldown() else 1.10
	if Input.is_action_pressed("throttle_up"):
		throttle = minf(max_throttle, throttle + 0.50 * throttle_rate_scale * dt)
	if Input.is_action_pressed("throttle_down"):
		throttle = maxf(0.0, throttle - 0.55 * throttle_rate_scale * dt)
	_update_wep(dt)

	# 2. Level-flight equilibrium airspeed for the current throttle
	var target_airspeed: float
	if throttle <= 1.0:
		target_airspeed = throttle * def.cruise_airspeed
	else:
		var wep_frac := (throttle - 1.0) / 0.10
		target_airspeed = def.cruise_airspeed + wep_frac * (def.max_airspeed - def.cruise_airspeed)
	# Flaps and gear add parasitic drag (never pushes the plane forward at idle)
	if throttle > 0.0:
		if flaps_combat:
			target_airspeed = maxf(0.0, target_airspeed - 30.0 * throttle)
		if gear_position > 0.0:
			target_airspeed = maxf(0.0, target_airspeed - 75.0 * gear_position * throttle)

	var speed_ms := airspeed / 3.6
	var control_authority := clampf(airspeed / 160.0, 0.16, 1.0)
	var flap_turn_bonus := 1.25 if flaps_combat else 1.0

	basis = basis.orthonormalized()  # stop float drift from thousands of incremental rotations
	var forward := basis.z
	var up := basis.y
	var inv := basis.transposed()
	var world_up_local := inv * Vector3.UP
	var current_bank := atan2(world_up_local.x, world_up_local.y)

	# 3. Manual keyboard override vs Virtual Instructor
	var pitch_up := Input.is_action_pressed("pitch_up")
	var pitch_down := Input.is_action_pressed("pitch_down")
	var roll_left := Input.is_action_pressed("roll_left")
	var roll_right := Input.is_action_pressed("roll_right")
	var yaw_left := Input.is_action_pressed("yaw_left")
	var yaw_right := Input.is_action_pressed("yaw_right")
	var pitch_rate_max: float = def.arcade_pitch_rate
	var roll_rate_max: float = def.arcade_roll_rate
	var yaw_rate_max: float = def.arcade_yaw_rate

	var target_pitch_rate := 0.0
	var target_roll_rate := 0.0
	var target_yaw_rate := 0.0

	if pitch_up or pitch_down or roll_left or roll_right or yaw_left or yaw_right:
		# --- Manual override: 100% direct authority ---
		instructor_active = false
		if pitch_up: target_pitch_rate -= pitch_rate_max * flap_turn_bonus  # pulling up = negative X rate
		if pitch_down: target_pitch_rate += pitch_rate_max
		if roll_left: target_roll_rate += roll_rate_max
		if roll_right: target_roll_rate -= roll_rate_max
		if yaw_left: target_yaw_rate -= yaw_rate_max
		if yaw_right: target_yaw_rate += yaw_rate_max
		# Keep the aim point on the nose so releasing the keys is seamless
		aim_direction = forward
		aim_pitch = asin(clampf(forward.y, -0.99, 0.99))
		aim_yaw = atan2(forward.x, forward.z)
	else:
		# --- Virtual Instructor (mouse-aim autopilot) ---
		instructor_active = true
		var local_aim := inv * aim_direction  # aim vector in the plane's own frame
		var angle_error := acos(clampf(local_aim.z, -1.0, 1.0))
		var horiz_error := atan2(local_aim.x, maxf(0.001, local_aim.z))
		var vert_error := atan2(local_aim.y, maxf(0.001, local_aim.z))

		# Bank up to ~75° into the turn; level the wings once on target
		var desired_bank := 0.0
		if angle_error > 0.05:
			desired_bank = -clampf(horiz_error * 1.5, -1.30, 1.30)
		var bank_diff := wrapf(current_bank - desired_bank, -PI, PI)
		target_roll_rate = -clampf(bank_diff * 3.5, -1.0, 1.0) * roll_rate_max

		# Pitch toward the vertical error; pull hard if the target is behind
		var pitch_factor := 1.0 if local_aim.z < 0.0 else clampf(vert_error * 2.5, -1.0, 1.0)
		target_pitch_rate = -pitch_factor * pitch_rate_max * flap_turn_bonus

		# Rudder coordination
		target_yaw_rate = clampf(local_aim.x * 2.0, -1.0, 1.0) * yaw_rate_max

		# Settle onto the reticle without oscillating
		if angle_error < 0.04:
			var f := angle_error / 0.04
			target_pitch_rate *= f
			target_yaw_rate *= f

	# On the ground: no roll, no pitching into the tarmac
	if is_on_ground:
		target_roll_rate = 0.0
		if target_pitch_rate > 0.0:
			target_pitch_rate = 0.0

	_last_control_rates = Vector3(target_pitch_rate, target_yaw_rate, target_roll_rate)

	# 5. Apply rotations
	rotate_object_local(AXIS_X, target_pitch_rate * control_authority * dt)
	rotate_object_local(AXIS_Z, target_roll_rate * control_authority * dt)
	rotate_object_local(AXIS_Y, target_yaw_rate * control_authority * dt)

	# 6. Energy model
	# (A) Turn intensity & G-load
	var eff_pitch := absf(target_pitch_rate) * control_authority
	var eff_yaw := absf(target_yaw_rate) * control_authority
	var eff_turn := sqrt(eff_pitch * eff_pitch + 0.5 * eff_yaw * eff_yaw)
	turn_intensity = clampf(eff_turn / pitch_rate_max, 0.0, 1.4)
	var centripetal_g := (speed_ms * eff_turn) / 9.81 * 0.72
	g_load = lerpf(g_load, maxf(1.0, maxf(0.0, up.y) + centripetal_g), minf(1.0, 10.0 * dt))

	# (B) Thrust vs parasitic drag
	var delta_v := 0.0
	var base_accel := 64.0 if is_wep else 48.0  # km/h per second
	if airspeed < target_airspeed:
		var accel_factor := maxf(0.18, 1.0 - airspeed / (target_airspeed + 25.0))
		delta_v += base_accel * accel_factor * dt
	elif throttle == 0.0:
		delta_v -= (58.0 if is_on_ground else 20.0) * dt  # wheel brakes vs idle prop drag
	else:
		var excess := airspeed - target_airspeed
		delta_v -= minf(65.0, 24.0 * (excess / 100.0) * (airspeed / 340.0)) * dt

	if not is_on_ground:
		# (C) Gravity trades speed for height (1 G along the path ≈ 36 km/h/s)
		delta_v += -forward.y * 36.0 * dt
		# (D) Induced drag bleed in hard turns; combat flaps add +45%
		if turn_intensity > 0.28:
			var flap_drag := 1.45 if flaps_combat else 1.0
			delta_v -= 75.0 * pow(turn_intensity, 1.85) * flap_drag * maxf(0.60, airspeed / 270.0) * dt
		# (E) Stall: nose drops to regain airflow
		if airspeed < def.stall_speed + 18.0:
			var deficit := clampf((def.stall_speed + 18.0 - airspeed) / 28.0, 0.0, 1.0)
			rotate_object_local(AXIS_X, 2.2 * deficit * dt)
		# (F) Gear form drag
		if gear_position > 0.05:
			delta_v -= 35.0 * gear_position * pow(airspeed / 260.0, 1.35) * dt

	airspeed = clampf(airspeed + delta_v, 0.0, def.max_airspeed * 1.35)

	# 7. Fly along the nose; sink when lift can't hold the weight
	position += forward * speed_ms * dt
	velocity = forward * speed_ms
	if not is_on_ground:
		var speed_ratio := clampf(airspeed / def.takeoff_speed, 0.0, 1.0)
		var flap_lift := 0.20 if flaps_combat else 0.0
		var lift_support := clampf(up.y * (speed_ratio + flap_lift), -1.0, 1.0)
		var sink_rate := World.GRAVITY * maxf(0.0, 1.0 - lift_support)
		position.y -= sink_rate * dt

	# 8. Ground contact, take-off, landing & crash
	var ground_level := maxf(World.SEA_LEVEL, World.get_terrain_height(position.x, position.z)) + LANDING_GEAR_HEIGHT
	var prev_y := altitude_msl
	altitude_msl = maxf(0.0, position.y - LANDING_GEAR_HEIGHT)
	altitude_agl = maxf(0.0, position.y - ground_level)
	vertical_speed = (altitude_msl - prev_y) / dt if dt > 0.0001 else 0.0
	max_landing_speed = roundf(clampf(def.takeoff_speed * 1.55, 160.0, 195.0))

	if is_on_ground:
		position.y = ground_level
		var e := basis.get_euler()  # YXZ, same as THREE.Euler 'YXZ'
		e.z = 0.0
		var pitching_up := pitch_up or aim_pitch > 0.03
		if airspeed >= def.takeoff_speed and pitching_up:
			is_on_ground = false
		else:
			e.x = 0.0
			basis = Basis.from_euler(e)
	elif position.y <= ground_level:
		if not _touch_down(ground_level, current_bank):
			return

	_update_airfield_service(dt)
	_enforce_boundary(dt)

	# Warnings
	stall_warning = not is_on_ground and airspeed < def.stall_speed and throttle < 0.6
	pull_up_warning = not is_on_ground and altitude_agl < 45.0 and vertical_speed < -5.0
	gear_warning = not is_on_ground and altitude_agl < 75.0 and vertical_speed < -2.5 and gear_position < 0.85
	landing_overspeed_warning = not is_on_ground and altitude_agl < 75.0 and vertical_speed < -1.0 \
			and gear_position >= 0.85 and airspeed > max_landing_speed


## Returns false if the touchdown destroyed the aircraft
func _touch_down(ground_level: float, current_bank: float) -> bool:
	var af_idx := World.get_airfield_under(position.x, position.z)
	var impact := absf(vertical_speed)

	if airspeed > max_landing_speed:
		_trigger_crash("EXPLODED ON TOUCHDOWN! Landed too fast (%d km/h)! Max safe landing speed is %d km/h. Reduce throttle and deploy combat flaps (F)!" % [roundi(airspeed), roundi(max_landing_speed)])
		return false
	if gear_position < 0.85:
		_trigger_crash("CRASH! Belly landing without landing gear! Extend landing gear (G) before touchdown!")
		return false
	if impact >= 7.0:
		_trigger_crash("EXPLODED! Hard landing impact (%.1f m/s sink rate)! Flare nose up to soften touchdown!" % impact)
		return false
	if absf(current_bank) >= 0.42:
		_trigger_crash("EXPLODED! Wing struck the ground during touchdown! Keep wings level when landing!")
		return false
	if af_idx < 0 and position.y <= World.SEA_LEVEL + 1.2:
		_trigger_crash("Crashed into the sea!")
		return false

	# Clean touchdown: settle on the wheels, wings and nose level
	position.y = ground_level
	is_on_ground = true
	var e := basis.get_euler()
	e.x = 0.0
	e.z = 0.0
	basis = Basis.from_euler(e)

	if af_idx >= 0:
		var af: Dictionary = World.airports[af_idx]
		if af.team == "friendly":
			banner.emit("TOUCHDOWN AT FRIENDLY BASE: %s (%s) — BRAKE TO A STOP FOR REARM & REPAIR!" % [af.name.to_upper(), af.code], false)
		elif af.get("is_destroyed", false):
			banner.emit("TOUCHDOWN ON DESTROYED AIRFIELD (%s) — NO GROUND CREW HERE" % af.code, false)
		else:
			banner.emit("TOUCHDOWN ON ENEMY RUNWAY (%s) — NO SERVICE HERE. BOMB IT TO STOP ENEMY RESPAWNS!" % af.code, false)
	return true


# Ground crew rearm & repair on a friendly runway after a 10 s stop (never restores lives)
func _update_airfield_service(dt: float) -> void:
	if not is_on_ground:
		airfield_wait_timer = 0.0
		needs_airfield_service = true
		serviced_at_airfield = -1
		return

	var af_idx := World.get_airfield_under(position.x, position.z)
	if af_idx < 0:
		if airfield_wait_timer > 0.4:
			airfield_wait_timer = 0.0
		return
	var af: Dictionary = World.airports[af_idx]
	if af.team != "friendly":
		return

	var needs_wep := wep_is_cooling or wep_cooldown_timer > 0.0 or wep_duration_left < wep_max_duration
	var needs_guns := guns.heat > 0.05 or guns.is_jammed
	var needs_bombs := bomb_count < bomb_max
	var needs_service := hp < max_hp or needs_wep or needs_guns or needs_bombs or needs_airfield_service
	if needs_service and airspeed < 20.0:
		airfield_wait_timer += dt
		var stage := "PATCHING AIRFRAME & REPAIRING DAMAGE"
		if airfield_wait_timer >= 6.5:
			stage = "HOISTING & REARMING BELLY BOMBS"
		elif airfield_wait_timer >= 3.0:
			stage = "RE-BELTING MACHINE GUNS & COOLING WEP SYSTEM"
		banner.emit("REARMING & REPAIRING (%s): %d%% [%.1fs] — %s..." % [af.code,
				mini(99, roundi(airfield_wait_timer / SERVICE_TIME * 100.0)),
				maxf(0.0, SERVICE_TIME - airfield_wait_timer), stage], false)
		if airfield_wait_timer >= SERVICE_TIME:
			hp = max_hp
			reset_wep()
			guns.reset()
			bomb_count = bomb_max
			airfield_wait_timer = 0.0
			needs_airfield_service = false
			serviced_at_airfield = af_idx
			serviced.emit(af_idx)
			banner.emit("%s GROUND CREW: FULLY REARMED & REPAIRED! ARMOR: 100%% · BOMBS LOADED (%d/%d) · GUNS & WEP PRIMED" % [af.code, bomb_count, bomb_max], true)
	elif airfield_wait_timer > 0.4 and airspeed >= 25.0:
		airfield_wait_timer = 0.0
		banner.emit("REARM & REPAIR INTERRUPTED: Aircraft moved before servicing finished!", false)


# Combat sector boundary: warn at 180 m, steer back toward the centre inside 20 m
func _enforce_boundary(dt: float) -> void:
	var min_dist := minf(minf(position.z - World.MIN_Z, World.MAX_Z - position.z),
			minf(position.x - World.MIN_X, World.MAX_X - position.x))
	if min_dist < 180.0 and min_dist > 20.0:
		banner.emit("WARNING: APPROACHING COMBAT SECTOR BOUNDARY — TURN BACK!", false)
	elif min_dist <= 20.0:
		var center_heading := atan2(-position.x, -position.z)
		# JS only changed the yaw angle, not the aim vector, so the instructor never turned; recompute it here
		set_mouse_aim_angles(lerp_angle(aim_yaw, center_heading, dt * 2.5), aim_pitch)
		position.x = clampf(position.x, World.MIN_X + 10.0, World.MAX_X - 10.0)
		position.z = clampf(position.z, World.MIN_Z + 10.0, World.MAX_Z - 10.0)
		banner.emit("COMBAT BOUNDARY EXCEEDED — RETURNING TO BATTLEFIELD!", false)


# =====================================================================================
# WEP: 10 s max burst, then up to 15 s cooldown capped at 100% throttle
# =====================================================================================

func _wep_on_cooldown() -> bool:
	return wep_is_cooling or wep_cooldown_timer > 0.0


func _update_wep(dt: float) -> void:
	var cooling := _wep_on_cooldown()
	if cooling and throttle > 1.0:
		throttle = 1.0
		is_wep = false

	if throttle > 1.001 and not cooling:
		is_wep = true
		wep_duration_left = maxf(0.0, wep_duration_left - dt)
		if wep_duration_left <= 0.0:
			is_wep = false
			throttle = 1.0
			wep_is_cooling = true
			wep_cooldown_timer = wep_cooldown_max
			banner.emit("WEP EXHAUSTED — ENGINE COOLING DOWN (%ds)" % roundi(wep_cooldown_max), false)
	elif is_wep:
		# Throttled back out of WEP: proportional cooldown (3.5 s .. max)
		is_wep = false
		var used := wep_max_duration - wep_duration_left
		if used > 0.6:
			wep_is_cooling = true
			wep_cooldown_timer = minf(wep_cooldown_max, maxf(3.5, used / wep_max_duration * wep_cooldown_max))

	if wep_cooldown_timer > 0.0:
		wep_cooldown_timer = maxf(0.0, wep_cooldown_timer - dt)
		if wep_cooldown_timer <= 0.0:
			wep_is_cooling = false
			wep_duration_left = wep_max_duration


func reset_wep() -> void:
	var cooled: bool = def.get("cooling_bonus", false)
	wep_max_duration = 13.0 if cooled else 10.0
	wep_cooldown_max = 10.0 if cooled else 15.0
	wep_duration_left = wep_max_duration
	wep_cooldown_timer = 0.0
	wep_is_cooling = false
	is_wep = false
	throttle = minf(throttle, 1.0)


# =====================================================================================
# Crash / respawn
# =====================================================================================

func _trigger_crash(reason: String) -> void:
	if is_crashed:
		return
	is_crashed = true
	guns.trigger = false
	model.visible = false
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	if ballistics:
		ballistics.explosion_at(global_position, 2.5)
	lives = maxi(0, lives - 1)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	crashed.emit(reason)  # the sortie decides: respawn, take over the wingman, or defeat


## takeOverFriendlyWingman: continue in the wingman's aircraft, exactly where it is
func take_over(fw: FriendlyPlane) -> void:
	is_flying_wingman = true
	is_crashed = false
	model.visible = true
	position = fw.position
	basis = fw.basis.orthonormalized()

	var fw_on_ground := fw.on_ground
	airspeed = fw.current_speed_kmh if fw_on_ground else maxf(80.0, fw.current_speed_kmh)
	throttle = 0.35 if fw_on_ground else clampf(airspeed / def.cruise_airspeed, 0.40, 1.0)
	reset_wep()
	velocity = fw.velocity
	is_on_ground = fw_on_ground
	g_load = 1.0
	turn_intensity = 0.0
	stall_warning = false
	pull_up_warning = false
	gear_warning = false
	instructor_active = true
	gear_position = fw.gear_pos
	gear_target = fw.gear_pos

	# Aim level along the current heading (the instructor then levels out the wings)
	set_mouse_aim_angles(basis.get_euler().y, 0.0)
	free_look_yaw = 0.0
	free_look_pitch = 0.0

	# Inherit health, lives and gun state
	max_hp = fw.max_hp
	hp = fw.hp
	lives = maxi(1, fw.lives)
	guns.reset()
	guns.heat = fw.guns.heat
	guns.is_jammed = fw.guns.is_jammed
	airfield_wait_timer = 0.0
	serviced_at_airfield = -1
	fw.mark_taken_over()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	banner.emit("TOOK OVER WINGMAN #2! (%d/%d LIVES) — YOU ARE NOW FLIGHT LEAD!" % [lives, max_lives], true)


## Spawn on an airfield's runway start, engine at 35%, gear down (respawnAircraft)
func respawn(airfield_index: int) -> void:
	var af: Dictionary = World.airports[airfield_index]
	var heading := deg_to_rad(af.spawn_heading)
	position = Vector3(af.spawn_x, af.elevation + LANDING_GEAR_HEIGHT, af.spawn_z)
	basis = Basis.from_euler(Vector3(0.0, heading, 0.0))

	is_crashed = false
	model.visible = true
	hp = max_hp
	airfield_wait_timer = 0.0
	serviced_at_airfield = -1
	needs_airfield_service = false

	airspeed = 0.0
	throttle = 0.35
	reset_wep()
	velocity = Vector3.ZERO
	vertical_speed = 0.0
	altitude_msl = af.elevation
	is_on_ground = true
	stall_warning = false
	pull_up_warning = false
	gear_warning = false
	landing_overspeed_warning = false
	instructor_active = true
	g_load = 1.0
	turn_intensity = 0.0

	# Aim straight down the runway
	set_mouse_aim_angles(heading, 0.0)
	free_look_yaw = 0.0
	free_look_pitch = 0.0

	flaps_combat = false
	gear_position = 1.0
	gear_target = 1.0

	# Cold guns, full bomb rack, no stray bullets from the previous life
	guns.reset()
	bomb_count = bomb_max
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	if ballistics:
		ballistics.clear()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# =====================================================================================
# Combat interfaces: targeted by AI (EnemyDirector) and hit by their bullets (Ballistics)
# =====================================================================================

## getEnemyTarget('player'): always engageable, even on the runway, like the JS
func get_target_info() -> Dictionary:
	if is_crashed:
		return {}
	return {"pos": global_position, "basis": basis, "velocity": velocity, "airborne": not is_on_ground,
			"firing": guns.trigger, "engageable": true, "side": "friendly"}


func bullet_team() -> String:
	return "friendly"


func bullet_hit_test(p0: Vector3, p1: Vector3) -> Dictionary:
	if is_crashed:
		return {}
	return Ballistics.aircraft_hit_test(self, p0, p1)


## damagePlayerAircraft: engine hits do 25% more; camera jolts; shot down at 0 HP
func take_bullet_hit(damage: float, module: String, point: Vector3, shooter: Node3D) -> void:
	if is_crashed:
		return
	var final_dmg := roundf(damage * (1.25 if module == "ENGINE" else 1.0))
	hp = maxf(0.0, hp - final_dmg)
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	ballistics.spawn_impact(point, false, final_dmg)
	guns.recoil_intensity = minf(1.0, guns.recoil_intensity + 0.42)
	var attacker: String = shooter.callsign if shooter and "callsign" in shooter else "ENEMY FIGHTER"
	if hp <= 0.0:
		_trigger_crash("Shot down by %s! [%s HIT]" % [attacker, module])
	else:
		banner.emit("TAKING FIRE FROM %s [%s] — %d/%d HP" % [attacker, module, hp, max_hp], false)


# =====================================================================================
# Model animation
# =====================================================================================

func _animate_model(dt: float) -> void:
	model.spin_propeller(22.0 + throttle * (120.0 if is_wep else 90.0), dt)
	model.set_prop_blur(throttle)
	model.set_gear(gear_position)
	# _last_control_rates = (pitch, yaw, roll)
	model.set_controls(_last_control_rates.x, _last_control_rates.z, _last_control_rates.y, flaps_combat)
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	if ballistics:
		_damage_smoke_timer = ballistics.emit_damage_smoke(self, hp / max_hp, dt, _damage_smoke_timer)
