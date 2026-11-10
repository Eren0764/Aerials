class_name GameAudio
extends Node
## Flight and combat sound, ported from initAudio / updateAudio / play*Sound / playVictoryFanfare in game.js.
## The JS synthesised everything live with Web Audio. Here:
##   - one-shot sounds are rendered ONCE (offline) with the same oscillators, exponential frequency/gain
##     ramps and RBJ biquad filters into AudioStreamWAV buffers, then played on pooled players;
##   - continuous sounds are looping waveforms steered every frame like the JS setTargetAtTime calls:
##       engine  = sawtooth, pitch from aircraft engineFreq + throttle + airspeed (+WEP), 320 Hz low-pass bus
##       wind    = white noise on a band-pass bus whose centre follows airspeed and turn intensity
##       warning = 800 Hz square beeping ~2x per second on stall / pull-up warnings.
## Buses (SFX, Engine, Wind) are created in code. M toggles sound. Paused game = silent engine/wind.

const SR := 44100.0
const ENGINE_FREQ := {"mustang": 118.0, "zero": 102.0, "bf109": 112.0, "il2": 92.0, "spitfire": 115.0, "sm79": 88.0}
const ENEMY_GUN_RANGE := 850.0  # enemy guns are only heard this close

var player: PlayerAircraft
var sound_enabled := true

var _engine: AudioStreamPlayer
var _wind: AudioStreamPlayer
var _warning: AudioStreamPlayer
var _wind_filter: AudioEffectBandPassFilter
var _sfx := {}           # name -> AudioStreamPlayer (polyphonic)
var _fanfare: AudioStreamPlayer
var _engine_gain := 0.0
var _wind_gain := 0.0
var _warning_gain := 0.0
var _time := 0.0

static var _streams := {}  # rendered one-shots, shared by every sortie


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS  # notices pause to silence the loops
	_ensure_buses()
	if _streams.is_empty():
		_render_all()
	for key in _streams:
		var p := AudioStreamPlayer.new()
		p.stream = _streams[key]
		p.bus = "SFX"
		p.max_polyphony = 8
		p.process_mode = Node.PROCESS_MODE_PAUSABLE  # one-shots freeze with the game
		add_child(p)
		_sfx[key] = p
	_fanfare = _sfx["fanfare"]

	_engine = _loop_player(_sawtooth_loop(), "Engine")
	_wind = _loop_player(_noise_loop(), "Wind")
	_warning = _loop_player(_square_loop(800.0), "SFX")
	if not InputMap.has_action("toggle_sound"):
		InputMap.add_action("toggle_sound")
		var ev := InputEventKey.new()
		ev.physical_keycode = KEY_M
		InputMap.action_add_event("toggle_sound", ev)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_sound") and not get_tree().paused:
		sound_enabled = not sound_enabled
		AudioServer.set_bus_mute(AudioServer.get_bus_index("SFX"), not sound_enabled)
		AudioServer.set_bus_mute(AudioServer.get_bus_index("Engine"), not sound_enabled)
		AudioServer.set_bus_mute(AudioServer.get_bus_index("Wind"), not sound_enabled)


func _exit_tree() -> void:
	# Leaving the sortie must never leave the buses muted for the next one
	for bus in ["SFX", "Engine", "Wind"]:
		AudioServer.set_bus_mute(AudioServer.get_bus_index(bus), false)


# =====================================================================================
# Events
# =====================================================================================

func gunfire(is_heavy: bool, _is_outer := false) -> void:
	play("gun_heavy" if is_heavy else "gun_light")


## Enemy / wingman guns: only the inner guns and only within 850 m, like the JS
func ai_gunfire(is_heavy: bool, is_outer: bool, shooter: Node3D) -> void:
	if is_outer or player == null or shooter.global_position.distance_to(player.global_position) > ENEMY_GUN_RANGE:
		return
	gunfire(is_heavy)


func explosion(scale: float) -> void:
	play("bomb_boom" if scale >= 4.0 else "explosion")


func victory_fanfare() -> void:
	_fanfare.process_mode = Node.PROCESS_MODE_ALWAYS  # plays over the frozen battlefield
	_fanfare.play()


func play(sound: String) -> void:
	if sound_enabled and _sfx.has(sound):
		(_sfx[sound] as AudioStreamPlayer).play()


func flak_burst(volume: float) -> void:
	play_volume("flak_burst", volume)


## One-shot at its own volume (0..1): a fresh player, so overlapping bursts keep their own level
func play_volume(sound: String, volume: float) -> void:
	if not sound_enabled or not _streams.has(sound) or volume <= 0.01:
		return
	var p := AudioStreamPlayer.new()
	p.stream = _streams[sound]
	p.bus = "SFX"
	p.volume_db = linear_to_db(volume)
	p.finished.connect(p.queue_free)
	add_child(p)
	p.play()


# =====================================================================================
# Continuous sounds (updateAudio)
# =====================================================================================

func _process(delta: float) -> void:
	var paused := get_tree().paused
	for p in [_engine, _wind, _warning]:
		p.stream_paused = paused
	if paused or player == null:
		return
	var dt := minf(delta, 0.1)
	_time += dt
	var k := 1.0 - exp(-dt / 0.08)  # setTargetAtTime(…, 0.08)

	var engine_target := 0.0
	var wind_target := 0.0
	var warning_target := 0.0
	if not player.is_crashed:
		var max_speed: float = player.def.max_airspeed
		var freq: float = ENGINE_FREQ.get(player.def.id, 65.0) + player.throttle * 140.0 \
				+ player.airspeed / max_speed * 40.0 + (28.0 if player.is_wep else 0.0)
		_engine.pitch_scale = clampf(freq / 100.0, 0.05, 8.0)  # loop is a 100 Hz sawtooth
		engine_target = 0.04 + player.throttle * 0.08 + (0.03 if player.is_wep else 0.0)

		var speed_ratio := player.airspeed / max_speed
		var g_buffet := maxf(0.0, (player.g_load - 2.8) * 0.022)
		wind_target = minf(0.20, speed_ratio * 0.12 + g_buffet)
		_wind_filter.cutoff_hz = 420.0 + speed_ratio * 850.0 + player.turn_intensity * 320.0

		if player.pull_up_warning or player.stall_warning:
			warning_target = 0.06 if sin(_time * 12.0) > 0.0 else 0.0
	else:
		k = 1.0 - exp(-dt / 0.1)

	_engine_gain = lerpf(_engine_gain, engine_target, k)
	_wind_gain = lerpf(_wind_gain, wind_target, k)
	_warning_gain = lerpf(_warning_gain, warning_target, 1.0 - exp(-dt / 0.03))
	_engine.volume_db = linear_to_db(maxf(_engine_gain, 0.00001))
	_wind.volume_db = linear_to_db(maxf(_wind_gain, 0.00001))
	_warning.volume_db = linear_to_db(maxf(_warning_gain, 0.00001))


# =====================================================================================
# Buses and loops
# =====================================================================================

func _ensure_buses() -> void:
	if AudioServer.get_bus_index("SFX") < 0:
		_add_bus("SFX")
	if AudioServer.get_bus_index("Engine") < 0:
		var b := _add_bus("Engine")
		var lp := AudioEffectLowPassFilter.new()
		lp.cutoff_hz = 320.0
		AudioServer.add_bus_effect(b, lp)
	if AudioServer.get_bus_index("Wind") < 0:
		var b := _add_bus("Wind")
		var bp := AudioEffectBandPassFilter.new()
		bp.cutoff_hz = 500.0
		bp.resonance = 0.6
		AudioServer.add_bus_effect(b, bp)
	_wind_filter = AudioServer.get_bus_effect(AudioServer.get_bus_index("Wind"), 0)


func _add_bus(bus_name: String) -> int:
	AudioServer.add_bus()
	var idx := AudioServer.bus_count - 1
	AudioServer.set_bus_name(idx, bus_name)
	AudioServer.set_bus_send(idx, "Master")
	return idx


func _loop_player(stream: AudioStreamWAV, bus: String) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.bus = bus
	p.volume_db = -80.0
	add_child(p)
	p.play()
	return p


# One 100 Hz sawtooth cycle, looped; pitch_scale moves it to the engine frequency
func _sawtooth_loop() -> AudioStreamWAV:
	var n := int(SR / 100.0)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for i in n:
		buf[i] = 2.0 * float(i) / n - 1.0
	return _to_wav(buf, true)


func _square_loop(freq: float) -> AudioStreamWAV:
	var n := int(SR / freq) * 8  # 8 whole cycles
	var period := SR / freq
	var buf := PackedFloat32Array()
	buf.resize(n)
	for i in n:
		buf[i] = 1.0 if fmod(i, period) < period / 2.0 else -1.0
	return _to_wav(buf, true)


func _noise_loop() -> AudioStreamWAV:
	var n := int(SR * 2.0)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 77
	for i in n:
		buf[i] = rng.randf_range(-1.0, 1.0)
	return _to_wav(buf, true)


# =====================================================================================
# Offline rendering of the one-shots (same recipes as the JS play*Sound functions)
# =====================================================================================

func _render_all() -> void:
	var noise := _gun_noise()
	_streams.gun_heavy = _gun(true, noise)
	_streams.gun_light = _gun(false, noise)
	_streams.jam_click = _mix(0.03, [_osc("square", 360, 70, 0.024, 0.24, 0.026, 0.0)])
	_streams.target_hit = _mix(0.055, [_osc("triangle", 440, 75, 0.045, 0.40, 0.05, 0.0)])
	_streams.explosion = _mix(0.72, [
		_osc("sine", 120, 26, 0.65, 0.70, 0.70, 0.0),
		_noise_voice(noise, "lowpass", 500, 80, 0.55, 0.707, 0.65, 0.60, 0.65)])
	var chime := []
	for idx in 3:
		chime.append(_osc("triangle", [523.25, 659.25, 783.99][idx], -1, 0.0, 0.24, 0.32, idx * 0.12, idx * 0.12 + 0.35))
	_streams.repair = _mix(0.62, chime)
	_streams.bomb_release = _mix(0.38, [
		_osc("square", 420, 80, 0.08, 0.40, 0.09, 0.0),
		_noise_voice(noise, "bandpass", 400, 140, 0.35, 1.2, 0.35, 0.36, 0.38)])
	_streams.bomb_boom = _mix(1.5, [
		_osc("sine", 85, 18, 1.25, 0.95, 1.30, 0.0),
		_noise_voice(noise, "lowpass", 650, 55, 1.40, 0.707, 0.85, 1.45, 1.50)])
	# playAAFireSound: flak cannon bark
	_streams.aa_fire = _mix(0.25, [_osc("triangle", 165, 42, 0.22, 0.45, 0.24, 0.0, 0.25)])
	# playFlakBurstSound at full volume (scaled per burst by play_volume)
	_streams.flak_burst = _mix(0.5, [
		_noise_voice(noise, "bandpass", 1100, 160, 0.4, 1.0, 0.55, 0.45, 0.5),
		_osc("sine", 95, 32, 0.35, 0.5, 0.38, 0.0, 0.4)])
	# Rising bugle: C5 E5 G5 … C6 held, triangle + soft detuned square
	var notes := [[523.25, 0.0, 0.18], [659.25, 0.2, 0.18], [783.99, 0.4, 0.18], [1046.5, 0.62, 0.9]]
	var bugle := []
	for nt in notes:
		bugle.append(_bugle_note(nt[0], nt[1], nt[2], "triangle", 0.22, 0.0))
		bugle.append(_bugle_note(nt[0], nt[1], nt[2], "square", 0.05, 4.0))
	_streams.fanfare = _mix(1.6, bugle)


# getGunNoiseBuffer: 0.25 s of white noise decaying with a 50 ms time constant
func _gun_noise() -> PackedFloat32Array:
	var n := int(SR * 0.25)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1234
	for i in n:
		buf[i] = rng.randf_range(-1.0, 1.0) * exp(-i / (SR * 0.05))
	return buf


# playGunfireSound: sub-bass thump + triangle snap + band-passed noise crack
func _gun(heavy: bool, noise: PackedFloat32Array) -> AudioStreamWAV:
	return _mix(0.075, [
		_osc("sine", 80 if heavy else 105, 32, 0.06, 0.50 if heavy else 0.38, 0.07, 0.0, 0.075),
		_osc("triangle", 700 if heavy else 920, 55, 0.025, 0.32, 0.028, 0.0, 0.03),
		_noise_voice(noise, "bandpass", 1050 if heavy else 1500, -1, 0.0, 1.5 if heavy else 2.0,
				0.60 if heavy else 0.48, 0.065, 0.07)])


## Oscillator voice: frequency f0 -> f1 (exponential, over f_time; f1 < 0 = constant), gain g0 -> 0.001
## (exponential, over g_time), starting at `start`, cut at `stop` (seconds, absolute in the clip)
func _osc(type: String, f0: float, f1: float, f_time: float, g0: float, g_time: float, start: float, stop := -1.0) -> PackedFloat32Array:
	var end := stop if stop > 0.0 else start + g_time + 0.01
	var n := int(end * SR)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	for i in range(int(start * SR), n):
		var t := i / SR - start
		var f := f0 if f1 < 0.0 or f_time <= 0.0 else f0 * pow(f1 / f0, minf(1.0, t / f_time))
		phase = fmod(phase + f / SR, 1.0)
		var g := g0 * pow(0.001 / g0, minf(1.0, t / g_time))
		buf[i] = _wave(type, phase) * g
	return buf


func _bugle_note(freq: float, start: float, length: float, type: String, vol: float, detune_cents: float) -> PackedFloat32Array:
	var f := freq * pow(2.0, detune_cents / 1200.0)
	var n := int((start + length + 0.05) * SR)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phase := 0.0
	for i in range(int(start * SR), n):
		var t := i / SR - start
		phase = fmod(phase + f / SR, 1.0)
		# 0.0001 -> vol in 30 ms, then down to 0.0001 by the end of the note
		var g := 0.0001 * pow(vol / 0.0001, minf(1.0, t / 0.03)) if t < 0.03 \
				else vol * pow(0.0001 / vol, minf(1.0, (t - 0.03) / maxf(0.001, length - 0.03)))
		buf[i] = _wave(type, phase) * g
	return buf


## Filtered noise voice: RBJ biquad (lowpass / bandpass) whose centre sweeps exponentially f0 -> f1
func _noise_voice(noise: PackedFloat32Array, type: String, f0: float, f1: float, f_time: float, q: float,
		g0: float, g_time: float, stop: float) -> PackedFloat32Array:
	var n := mini(int(stop * SR), noise.size())
	var buf := PackedFloat32Array()
	buf.resize(n)
	var x1 := 0.0
	var x2 := 0.0
	var y1 := 0.0
	var y2 := 0.0
	for i in n:
		var t := i / SR
		var f := f0 if f1 < 0.0 or f_time <= 0.0 else f0 * pow(f1 / f0, minf(1.0, t / f_time))
		var w0 := TAU * f / SR
		var alpha := sin(w0) / (2.0 * q)
		var cw := cos(w0)
		var b0: float
		var b1: float
		var b2: float
		if type == "lowpass":
			b0 = (1.0 - cw) / 2.0
			b1 = 1.0 - cw
			b2 = (1.0 - cw) / 2.0
		else:  # bandpass, 0 dB peak gain (Web Audio's BiquadFilter 'bandpass')
			b0 = alpha
			b1 = 0.0
			b2 = -alpha
		var a0 := 1.0 + alpha
		var a1 := -2.0 * cw
		var a2 := 1.0 - alpha
		var x := noise[i]
		var y := (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
		x2 = x1
		x1 = x
		y2 = y1
		y1 = y
		buf[i] = y * g0 * pow(0.001 / g0, minf(1.0, t / g_time))
	return buf


func _wave(type: String, phase: float) -> float:
	match type:
		"sine":
			return sin(phase * TAU)
		"triangle":
			return 4.0 * absf(phase - 0.5) - 1.0
		"square":
			return 1.0 if phase < 0.5 else -1.0
	return 2.0 * phase - 1.0  # sawtooth


func _mix(length: float, voices: Array) -> AudioStreamWAV:
	var buf := PackedFloat32Array()
	buf.resize(int(length * SR))
	for v in voices:
		var voice: PackedFloat32Array = v
		for i in mini(voice.size(), buf.size()):
			buf[i] += voice[i]
	# Web Audio mixes in float; keep the loudest layered sounds (bomb boom) just under full scale
	var peak := 0.0
	for x in buf:
		peak = maxf(peak, absf(x))
	if peak > 0.95:
		for i in buf.size():
			buf[i] *= 0.95 / peak
	return _to_wav(buf, false)


func _to_wav(buf: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(buf.size() * 2)
	for i in buf.size():
		bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32767.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = int(SR)
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = buf.size()
	return wav
