class_name GunSystem
extends Node
## Forward guns of one aircraft, ported from spawnBullet() and the gun half of updateWeapons() in game.js:
## rate of fire per hardpoint, 600 m harmonisation with gravity-drop compensation, heat spread,
## plane-velocity inheritance, barrel heat / jam / ram-air cooling, thermal slowdown, muzzle flash
## and light, hot-barrel smoke, recoil (camera shake + tiny speed loss).
## Child of an aircraft node that exposes: def (AircraftDefs), airspeed (km/h), velocity (m/s), is_crashed.
## Set `trigger` every frame (player: mouse/Space; AI: its own fire decision).

signal shot_fired(is_heavy: bool, is_outer: bool)  # GameAudio
signal jam_click

var trigger := false
var team := "friendly"
var use_light := true          # only the player's guns light the cowling
var tracer_override := Color(0, 0, 0, 0)  # alpha > 0: every tracer this colour (friendly AI: sky blue)
var is_player := true          # player: 0.0012 rad base spread, pale outer-gun tracers, recoil slows the plane

var heat := 0.0                # 0 = ambient .. 1 = jammed
var is_jammed := false
var recoil_intensity := 0.0    # read and decayed by FlightCamera
var recoil_time := 0.0

var _aircraft: Node3D
var _ballistics: Ballistics
var _light: OmniLight3D
var _fire_timer := 0.0
var _jam_click_timer := 0.0
var _hardpoint_index := 0


func _ready() -> void:
	_aircraft = get_parent()
	_ballistics = get_tree().get_first_node_in_group("ballistics")
	if use_light:
		_light = OmniLight3D.new()
		_light.light_color = Color("ffaa22")
		_light.light_energy = 0.0
		_light.omni_range = 45.0
		_light.omni_attenuation = 1.6
		_light.shadow_enabled = false
		_light.top_level = true
		add_child(_light)


## Cool, unjam and reload (respawn / airfield service)
func reset() -> void:
	heat = 0.0
	is_jammed = false
	_jam_click_timer = 0.0
	_fire_timer = 0.0
	recoil_intensity = 0.0
	if _light:
		_light.light_energy = 0.0


func _process(delta: float) -> void:
	var dt := minf(delta, 0.1)
	var def: Dictionary = _aircraft.def
	var weapons: Dictionary = def.weapons
	var hardpoints: Array = def.hardpoints
	var firing: bool = trigger and not _aircraft.is_crashed
	var base_interval: float = 60.0 / (weapons.fire_rate_rpm * hardpoints.size())

	# Ram-air cooling grows with airspeed; firing retards it to 30%
	var speed_ratio := clampf(_aircraft.airspeed / def.max_airspeed, 0.0, 1.3)
	var cooling_mult := 1.5 if def.cooling_bonus else 1.0
	var cooling_rate := (0.16 + 0.10 * speed_ratio) * (0.30 if firing and not is_jammed else 1.0) * cooling_mult
	heat = maxf(0.0, heat - cooling_rate * dt)
	if is_jammed and heat <= 0.30:
		is_jammed = false

	# Above 65% heat the cyclic rate slows by up to 28%
	var interval: float = base_interval * (1.0 + maxf(0.0, (heat - 0.65) / 0.35) * 0.28)

	if firing:
		if is_jammed:
			_jam_click_timer += dt
			if _jam_click_timer >= 0.18:
				_jam_click_timer = 0.0
				jam_click.emit()
		else:
			_fire_timer += dt
			var shots := 0
			while _fire_timer >= interval and shots < 6:
				_fire_one(def, weapons, hardpoints)
				_fire_timer -= interval
				shots += 1
				if is_jammed:
					break
	else:
		_fire_timer = minf(_fire_timer, interval)  # stay primed for an instant first shot
		_jam_click_timer = 0.18

	_update_light(dt)

	# Hot-barrel smoke wisps after a burst
	if not trigger and heat > 0.45 and randf() < 0.35:
		for hp in hardpoints:
			_ballistics.smoke_at(_aircraft.global_transform * hp)


func _fire_one(def: Dictionary, weapons: Dictionary, hardpoints: Array) -> void:
	if is_jammed:
		return
	var index := _hardpoint_index % hardpoints.size()
	_hardpoint_index += 1
	var is_outer := index == 2 or index == 3
	var is_heavy: bool = def.id == "bf109" or not is_outer
	var muzzle_velocity: float = weapons.muzzle_velocity
	var tracer_color: Color = Color("fef08a") if is_outer and is_player else weapons.tracer_color
	if tracer_override.a > 0.0:
		tracer_color = tracer_override

	var xf := _aircraft.global_transform.orthonormalized()
	var muzzle := xf * (hardpoints[index] as Vector3)
	var forward := xf.basis.z
	var up := xf.basis.y
	var right := xf.basis.x

	# Harmonised at the convergence distance: aim each barrel at a point that cancels gravity drop there
	var conv: float = weapons.convergence_distance
	var t := conv / muzzle_velocity
	var convergence := xf.origin + forward * conv + Vector3(0.0, 0.5 * Ballistics.BULLET_GRAVITY * t * t, 0.0)
	var bore := (convergence - muzzle).normalized()

	# Hot barrels spread wider (AI: slightly wider base spread, steeper heat term)
	var spread := 0.0012 + pow(heat, 2.2) * 0.024 if is_player else 0.0022 + pow(heat, 2.2) * 0.025
	bore = (bore + right * randf_range(-0.5, 0.5) * spread + up * randf_range(-0.5, 0.5) * spread).normalized()

	# Bullet inherits the aircraft's velocity
	var velocity: Vector3 = bore * muzzle_velocity + _aircraft.velocity
	_ballistics.fire(muzzle, velocity, def.damage_per_shot, weapons.tracer_length, tracer_color, team, _aircraft)
	_ballistics.muzzle_flash(muzzle, xf.basis)

	heat = minf(1.0, heat + weapons.heat_per_shot)
	if heat >= 1.0:
		is_jammed = true
		jam_click.emit()

	if _light:
		_light.light_color = Color("ffcc44") if is_outer else Color("ffaa22")
		_light.global_position = muzzle
		_light.light_energy = 2.8 if is_outer else 4.2

	recoil_intensity = minf(1.0, recoil_intensity + (0.32 if is_heavy else 0.16))
	if is_player:
		_aircraft.airspeed = maxf(0.0, _aircraft.airspeed - 0.04)  # recoil
	shot_fired.emit(is_heavy, is_outer)


# Muzzle light fades fast; above 60% heat the barrels glow red
func _update_light(dt: float) -> void:
	if _light == null:
		return
	if heat > 0.60 and _light.light_energy < 0.6:
		_light.light_color = Color("ff3300")
		_light.light_energy = (heat - 0.60) / 0.40 * 0.85
	elif _light.light_energy > 0.0:
		_light.light_energy = lerpf(_light.light_energy, 0.0, minf(1.0, 26.0 * dt))
		if _light.light_energy < 0.05:
			_light.light_energy = 0.0
