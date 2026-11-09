class_name FlightCamera
extends Camera3D
## Flight camera, ported from updateCamera() / toggleCamera() in game.js:
## chase (biased toward mouse aim, free look orbit, look-ahead, banking, buffeting),
## cockpit, and flyby (stays put and tracks the plane). V cycles modes; RMB/Z zooms.
## The JS lerped by a fixed fraction per frame; here that is converted to frame-rate independent form.

enum Mode { CHASE, COCKPIT, FLYBY }

var target: PlayerAircraft
var mode := Mode.CHASE
var flight_fov := 65.0  # settings 'flightFov'
var _cam_up := Vector3.UP


func _ready() -> void:
	fov = flight_fov
	near = 0.5
	far = 35000.0
	process_priority = 10  # after the aircraft has moved this frame
	current = true


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_camera"):
		mode = (mode + 1) % 3 as Mode


func _process(delta: float) -> void:
	if target == null:
		return
	var dt := minf(delta, 0.1)
	var pos := target.position
	var b := target.basis
	var plane_fwd := b.z
	var plane_up := b.y
	var zoomed := target.zoom

	match mode:
		Mode.CHASE:
			var cam_dist: float = target.def.cam_dist * (0.68 if zoomed else 1.0)
			var cam_height: float = target.def.cam_height * (0.80 if zoomed else 1.0)

			# Free look angles spring back when C is released
			if not target.free_look:
				var k := minf(1.0, 10.0 * dt)
				target.free_look_yaw = lerpf(target.free_look_yaw, 0.0, k)
				target.free_look_pitch = lerpf(target.free_look_pitch, 0.0, k)

			# Behind the plane, biased toward where the pilot is aiming, then orbited by free look
			var base_dir := plane_fwd.lerp(target.aim_direction, 0.20 if zoomed else 0.35).normalized()
			var view_dir := Basis.from_euler(Vector3(target.free_look_pitch, target.free_look_yaw, 0.0)) * base_dir
			var desired := pos - view_dir * cam_dist + Vector3(0.0, cam_height, 0.0)

			# Snap after respawn / first frame instead of sweeping across the map
			if position.distance_to(desired) > 400.0:
				position = desired
			else:
				position = position.lerp(desired, _per_frame(0.18, dt))

			# High-speed dive / high-G buffeting
			if target.airspeed > 470.0 or target.g_load > 5.2:
				var shake := maxf(0.0, (target.airspeed - 470.0) / 100.0) * 0.09 + maxf(0.0, (target.g_load - 5.2) * 0.05)
				position += Vector3(randf_range(-0.5, 0.5) * shake, randf_range(-0.5, 0.5) * shake, 0.0)

			# Gun recoil vibration
			var guns := target.guns
			if guns.recoil_intensity > 0.005:
				guns.recoil_intensity = maxf(0.0, guns.recoil_intensity - 12.0 * dt)
				guns.recoil_time += dt * 55.0
				var r := guns.recoil_intensity
				position += Vector3(
						(sin(guns.recoil_time * 2.3) + randf_range(-0.45, 0.45)) * 0.055 * r,
						(cos(guns.recoil_time * 2.7) + randf_range(-0.45, 0.45)) * 0.055 * r,
						randf_range(-0.03, 0.03) * r)

			# Look ahead along the gunsight line; keep the plane centred while free-looking
			var fl_blend := clampf((absf(target.free_look_yaw) + absf(target.free_look_pitch)) / 0.25, 0.0, 1.0)
			var look_ahead := (120.0 if zoomed else 40.0) * (1.0 - fl_blend)

			# Gentle camera banking with the aircraft
			_cam_up = _cam_up.lerp(Vector3.UP.lerp(plane_up, 0.22), _per_frame(0.15, dt)).normalized()
			_safe_look_at(pos + view_dir * look_ahead, _cam_up)

		Mode.COCKPIT:
			var offset: Vector3 = target.def.cockpit_offset
			position = pos + b * offset
			var look := pos + b * Vector3(0.0, offset.y - 0.1, 40.0)
			# Canopy rattle while firing
			var guns := target.guns
			if guns.recoil_intensity > 0.005:
				guns.recoil_intensity = maxf(0.0, guns.recoil_intensity - 12.0 * dt)
				var r := guns.recoil_intensity
				position += Vector3(randf_range(-0.02, 0.02) * r, randf_range(-0.02, 0.02) * r, 0.0)
				look += Vector3(randf_range(-0.10, 0.10) * r, randf_range(-0.08, 0.08) * r, 0.0)
			_cam_up = plane_up
			_safe_look_at(look, plane_up)

		Mode.FLYBY:
			_safe_look_at(pos, Vector3.UP)

	# Gunsight zoom (~2x) and +3° under WEP
	var target_fov := flight_fov * (32.0 / 65.0) if zoomed else (flight_fov + 3.0 if target.is_wep else flight_fov)
	fov = lerpf(fov, target_fov, minf(1.0, 11.0 * dt))


# Fraction-per-60fps-frame lerp -> same feel at any frame rate
func _per_frame(fraction: float, dt: float) -> float:
	return 1.0 - pow(1.0 - fraction, dt * 60.0)


func _safe_look_at(point: Vector3, up: Vector3) -> void:
	var dir := point - position
	if dir.length_squared() < 0.0001 or absf(dir.normalized().dot(up.normalized())) > 0.999:
		return
	look_at(point, up)
