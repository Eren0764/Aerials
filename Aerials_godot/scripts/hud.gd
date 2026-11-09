class_name Hud
extends CanvasLayer
## In-flight HUD, ported from updateHUD() / drawMinimap() / showCombatBanner() / triggerHitMarker()
## in game.js and the #hud-overlay markup + style.css. Everything is built from Control nodes in code;
## reticles, markers and the minimap are drawn each frame with the CanvasItem draw API.
##   top-left  : War Thunder telemetry (THR / IAS / ALT / MG / GEAR + armor, flaps, enemies, bases, instructor)
##   top-centre: heading compass       top-right: tactical minimap
##   screen    : mouse-aim ring, gunsight with barrel-heat arc, dashed link, hit marker,
##               enemy boxes with name / state / lives / range / HP bar, ballistic lead reticles (L)
##   banners   : red warning banner, 1.6 s combat banner, persistent crash notice

const GREEN := Color("00ff88")
const OK_GREEN := Color("22c55e")
const AMBER := Color("f59e0b")
const RED := Color("ef4444")
const SKY := Color("38bdf8")
const TEXT := Color("eef3f8")
const ENEMY_TEXT := Color("fca5a5")
const LEAD_YELLOW := Color("facc15")
const ALLY := Color("38bdf8")
const BANNER_TIME := 1.6
const HIT_MARKER_TIME := 0.13
const MM_W := 148.0
const MM_H := 103.0
const MM_SCALE := 1.0 / (30.0 * World.MAP_SCALE)  # 1 minimap pixel = 120 m

var player: PlayerAircraft
var camera: FlightCamera
var enemies: EnemyDirector
var allies: Array[FriendlyPlane] = []
var show_lead_indicator := true

var _font: Font
var _val := {}           # telemetry value labels by key
var _instructor: Label
var _heading: Label
var _cardinal: Label
var _warning: PanelContainer
var _warning_label: Label
var _banner: Label
var _banner_timer := 0.0
var _overlay: Control
var _minimap: Control
var _hit_timer := 0.0
var _hit_kill := false


func _ready() -> void:
	layer = 10
	_font = ThemeDB.fallback_font
	_build_overlay()
	_build_telemetry()
	_build_compass()
	_build_minimap()
	_build_banners()
	if not InputMap.has_action("toggle_lead"):
		InputMap.add_action("toggle_lead")
		var ev := InputEventKey.new()
		ev.physical_keycode = KEY_L
		InputMap.action_add_event("toggle_lead", ev)


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_lead"):
		show_lead_indicator = not show_lead_indicator
		show_banner("BALLISTIC LEAD INDICATOR: %s" % ("ON" if show_lead_indicator else "OFF"), false)


## showCombatBanner: replaces the current text, fades after 1.6 s (gold for kills)
func show_banner(text: String, is_kill: bool) -> void:
	_banner.text = text
	_banner.add_theme_color_override("font_color", Color("fbbf24") if is_kill else Color.WHITE)
	_banner.visible = true
	_banner_timer = BANNER_TIME


## triggerHitMarker: white ✕ on hit, red on kill, 130 ms
func hit_marker(is_kill: bool) -> void:
	_hit_timer = HIT_MARKER_TIME
	_hit_kill = is_kill


func _process(delta: float) -> void:
	_banner_timer -= delta
	_banner.visible = _banner_timer > 0.0
	_hit_timer -= delta
	_update_telemetry()
	_update_warning()
	_overlay.queue_redraw()
	_minimap.queue_redraw()


# =====================================================================================
# Telemetry (top-left)
# =====================================================================================

func _build_telemetry() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(35, 30)
	panel.add_theme_stylebox_override("panel", _box(Color(48 / 255.0, 72 / 255.0, 98 / 255.0, 0.28), 3, 10))
	add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 1)
	panel.add_child(col)

	for row in [["thr", "THR"], ["ias", "IAS"], ["alt", "ALT"], ["mg", "MG"], ["gear", "GEAR"]]:
		_add_row(col, row[0], row[1], 17)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 6)
	col.add_child(gap)
	for row in [["hp", "ARMOR"], ["lives", "LIVES"], ["flaps", "FLAPS"], ["bombs", "BOMBS"], ["wing", "WING #2"], ["targets", "ENEMIES"], ["bases", "BASES"]]:
		_add_row(col, row[0], row[1], 13)

	_instructor = _label("INSTRUCTOR", 11, AMBER)
	_instructor.add_theme_stylebox_override("normal", _box(Color(0.96, 0.62, 0.04, 0.15), 4, 3, AMBER))
	_instructor.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	col.add_child(_instructor)


func _add_row(parent: Container, key: String, caption: String, size: int) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	parent.add_child(row)
	var v := _label("", size, TEXT)
	v.custom_minimum_size = Vector2(150, 0)
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(v)
	var c := _label(caption, size, TEXT if size >= 17 else Color(TEXT, 0.7))
	c.custom_minimum_size = Vector2(60, 0)
	row.add_child(c)
	_val[key] = v


func _set_val(key: String, text: String, color := TEXT) -> void:
	var l: Label = _val[key]
	l.text = text
	l.add_theme_color_override("font_color", color)


func _update_telemetry() -> void:
	var p := player
	if p.is_wep:
		_set_val("thr", "WEP %ds" % ceili(p.wep_duration_left), AMBER)
	elif p.wep_cooldown_timer > 0.0:
		_set_val("thr", "%d %%  [CD %ds]" % [roundi(p.throttle * 100.0), ceili(p.wep_cooldown_timer)])
	else:
		_set_val("thr", "%d %%" % roundi(p.throttle * 100.0))
	_set_val("ias", "%d km/h" % roundi(p.airspeed))
	_set_val("alt", "%d m" % roundi(p.altitude_msl))

	var heat := p.guns.heat
	var pct := roundi(heat * 100.0)
	if p.guns.is_jammed:
		_set_val("mg", "JAMMED (%d%%)" % pct, RED)
	elif heat > 0.8:
		_set_val("mg", "OVERHEAT %d%%" % pct, RED)
	elif heat > 0.5:
		_set_val("mg", "WARM %d%%" % pct, AMBER)
	elif heat > 0.05:
		_set_val("mg", "%d%%" % pct, SKY)
	else:
		_set_val("mg", "READY", OK_GREEN)

	# updateGearUI
	if p.gear_position <= 0.05 and p.gear_target == 0.0:
		_set_val("gear", "UP", Color.WHITE)
	elif p.gear_position >= 0.95 and p.gear_target == 1.0:
		_set_val("gear", "DOWN", OK_GREEN)
	else:
		_set_val("gear", "EXTENDING" if p.gear_target == 1.0 else "RETRACTING", AMBER)

	var hp_ratio := p.hp / p.max_hp
	_set_val("hp", "%d HP" % roundi(p.hp), OK_GREEN if hp_ratio > 0.6 else (AMBER if hp_ratio > 0.3 else RED))
	var hearts := "♥".repeat(maxi(0, p.lives)) + "♡".repeat(maxi(0, p.max_lives - p.lives))
	_set_val("lives", "%s (%d/%d)" % [hearts, p.lives, p.max_lives], Color("fbbf24"))
	_set_val("flaps", "COMBAT" if p.flaps_combat else "RAISED")
	_update_wing_row()
	if p.bomb_count >= 2:
		_set_val("bombs", "%d/%d [B]" % [p.bomb_count, p.bomb_max], SKY)
	elif p.bomb_count == 1:
		_set_val("bombs", "1/%d [B]" % p.bomb_max, AMBER)
	else:
		_set_val("bombs", "0/%d EMPTY" % p.bomb_max, RED)

	var alive := 0
	for e in enemies.planes:
		if not e.permanently_dead and (e.is_alive or e.lives > 0):
			alive += 1
	_set_val("targets", "%d/%d AIR" % [alive, enemies.planes.size()], ENEMY_TEXT)
	var enemy_bases := 0
	var standing := 0
	for af in World.airports:
		if af.team == "enemy" or af.get("is_destroyed", false):
			enemy_bases += 1
			if not af.get("is_destroyed", false):
				standing += 1
	_set_val("bases", "%d/%d ENEMY" % [standing, enemy_bases] if standing > 0 else "ALL DESTROYED",
			ENEMY_TEXT if standing > 0 else Color("fde047"))

	var active := p.instructor_active
	_instructor.add_theme_color_override("font_color", GREEN if active else AMBER)
	_instructor.add_theme_stylebox_override("normal", _box(Color(0, 1, 0.53, 0.2) if active else Color(0.96, 0.62, 0.04, 0.15),
			4, 3, GREEN if active else AMBER))

	# Compass: 0° = north = -Z, like the JS
	var fwd := p.basis.z
	var hdg := fposmod(rad_to_deg(atan2(fwd.x, -fwd.z)), 360.0)
	var rounded := roundi(hdg) % 360
	_heading.text = "%03d°" % rounded
	_cardinal.text = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][roundi(rounded / 45.0) % 8]


# WING #2 telemetry: AI state + lives, R/S while respawning, DOWN when out, YOU after taking over
func _update_wing_row() -> void:
	if player.is_flying_wingman:
		_set_val("wing", "YOU (SOLO)", ALLY)
		return
	if allies.is_empty():
		_set_val("wing", "NONE (SOLO)", Color("94a3b8"))
		return
	var fw := allies[0]
	var hearts := "♥".repeat(maxi(0, fw.lives)) + "♡".repeat(maxi(0, fw.max_lives - fw.lives))
	if fw.is_alive:
		_set_val("wing", "%s %s" % [fw.state_label(), hearts], ALLY)
	elif fw.lives > 0:
		_set_val("wing", "R/S %s" % hearts, AMBER)
	else:
		_set_val("wing", "DOWN ♡♡♡", RED)


# =====================================================================================
# Compass, banners, warnings
# =====================================================================================

func _build_compass() -> void:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _box(Color(10 / 255.0, 20 / 255.0, 28 / 255.0, 0.65), 6, 8))
	var holder := _centered_at(panel, 0.0)
	holder.offset_top = 20.0
	add_child(holder)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	panel.add_child(row)
	row.add_child(_label("HDG", 13, Color(TEXT, 0.7)))
	_heading = _label("000°", 18, Color.WHITE)
	row.add_child(_heading)
	_cardinal = _label("N", 14, GREEN)
	row.add_child(_cardinal)


func _build_banners() -> void:
	_warning = PanelContainer.new()
	_warning.add_theme_stylebox_override("panel", _box(Color(220 / 255.0, 38 / 255.0, 38 / 255.0, 0.85), 6, 10))
	_warning_label = _label("", 20, Color.WHITE)
	_warning.add_child(_warning_label)
	add_child(_centered_at(_warning, 0.15))

	_banner = _label("", 18, Color.WHITE)
	_banner.add_theme_constant_override("outline_size", 6)
	_banner.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
	_banner.visible = false
	add_child(_centered_at(_banner, 0.22))


# Wraps a control in a full-width row whose vertical position is a fraction of the screen height
func _centered_at(child: Control, y_frac: float) -> Control:
	var holder := CenterContainer.new()
	holder.anchor_left = 0.0
	holder.anchor_right = 1.0
	holder.anchor_top = y_frac
	holder.anchor_bottom = y_frac
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(child)
	return holder


func _update_warning() -> void:
	var p := player
	var text := ""
	if p.is_crashed:
		text = ""
	elif p.guns.is_jammed:
		text = "GUNS JAMMED! COOLING DOWN..."
	elif p.guns.heat > 0.85:
		text = "HIGH BARREL TEMPERATURE!"
	elif p.gear_warning:
		text = "GEAR NOT DOWN! PRESS (G)"
	elif p.landing_overspeed_warning:
		text = "OVERSPEED FOR LANDING (%d km/h)! SLOW DOWN (< %d km/h)" % [roundi(p.airspeed), roundi(p.max_landing_speed)]
	elif p.pull_up_warning:
		text = "PULL UP! TERRAIN"
	elif p.stall_warning:
		text = "STALL WARNING!"
	_warning.visible = not text.is_empty()
	_warning_label.text = "⚠  %s  ⚠" % text


# =====================================================================================
# Screen overlay: reticles, markers, lead indicators
# =====================================================================================

func _build_overlay() -> void:
	_overlay = Control.new()
	_overlay.name = "Overlay"
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.draw.connect(_draw_overlay)
	add_child(_overlay)


## World -> screen like toScreenCoords: hidden when behind (or almost beside) the camera
func _to_screen(world: Vector3) -> Variant:
	var cam_fwd := -camera.global_basis.z
	if cam_fwd.dot(world - camera.global_position) <= 0.1:
		return null
	return camera.unproject_position(world)


func _draw_overlay() -> void:
	if player.is_crashed:
		return
	var o := _overlay
	var fwd := player.basis.z
	var aim_s = _to_screen(player.position + player.aim_direction * 600.0)
	var nose_s = _to_screen(player.position + fwd * 600.0)

	# Dashed link between gunsight and aim point
	if aim_s != null and nose_s != null:
		o.draw_dashed_line(nose_s, aim_s, Color(1, 1, 1, 0.4), 1.5, 3.0)

	# Mouse-aim ring
	if aim_s != null:
		o.draw_arc(aim_s, 20.0, 0.0, TAU, 40, Color(1, 1, 1, 0.85), 1.8, true)
		o.draw_circle(aim_s, 2.0, Color.WHITE)

	# Gunsight: centre ring, wings, pips, barrel-heat arc
	if nose_s != null:
		var c: Vector2 = nose_s
		o.draw_arc(c, 4.0, 0.0, TAU, 16, GREEN, 1.5, true)
		o.draw_line(c + Vector2(-20, 0), c + Vector2(-8, 0), GREEN, 2.0)
		o.draw_line(c + Vector2(8, 0), c + Vector2(20, 0), GREEN, 2.0)
		o.draw_line(c + Vector2(0, -18), c + Vector2(0, -12), GREEN, 2.0)
		o.draw_line(c + Vector2(0, 12), c + Vector2(0, 18), GREEN, 2.0)
		var heat := clampf(player.guns.heat, 0.0, 1.0)
		o.draw_arc(c, 18.0, 0.0, TAU, 48, Color(1, 1, 1, 0.12), 2.5, true)
		if heat > 0.0:
			var heat_col := RED if player.guns.is_jammed or heat > 0.8 else (AMBER if heat > 0.5 else OK_GREEN)
			o.draw_arc(c, 18.0, -PI / 2.0, -PI / 2.0 + TAU * heat, 48, heat_col, 2.5, true)
		# Hit marker: 4 diagonal ticks around the gunsight
		if _hit_timer > 0.0:
			var col := RED if _hit_kill else Color.WHITE
			for d in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
				o.draw_line(c + d * 9.0, c + d * 15.0, col, 2.5, true)

	_draw_ally_markers()
	_draw_enemy_markers(fwd)


# Blue boxes on friendly AI: "WING #2 P-51 MUSTANG ♥♥♥ 1.20km" + HP bar, within 8 km
func _draw_ally_markers() -> void:
	var o := _overlay
	for fw in allies:
		if not fw.is_alive or fw.taken_over:
			continue
		var dist := player.position.distance_to(fw.position)
		var s = _to_screen(fw.position)
		if s == null or dist >= 8000.0:
			continue
		var p: Vector2 = s
		o.draw_rect(Rect2(p - Vector2(12, 12), Vector2(24, 24)), Color(ALLY, 0.85), false, 1.5)
		var range_txt := "%.2fkm" % (dist / 1000.0) if dist >= 1000.0 else "%dm" % roundi(dist)
		var hearts := "♥".repeat(maxi(0, fw.lives)) + "♡".repeat(maxi(0, fw.max_lives - fw.lives))
		var label := "%s %s %s %s" % [fw.callsign, fw.def.short_name, hearts, range_txt]
		var w := _font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
		o.draw_string_outline(_font, p + Vector2(-w / 2.0, -28), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, 2, Color(0, 0, 0, 0.6))
		o.draw_string(_font, p + Vector2(-w / 2.0, -28), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("bae6fd"))
		var bar := Rect2(p + Vector2(-24, -22), Vector2(48, 4))
		o.draw_rect(bar, Color(0, 0, 0, 0.65))
		o.draw_rect(Rect2(bar.position, Vector2(48.0 * clampf(fw.hp / fw.max_hp, 0.0, 1.0), 4)), ALLY)
		o.draw_rect(bar, Color(1, 1, 1, 0.25), false, 1.0)


func _draw_enemy_markers(fwd: Vector3) -> void:
	var o := _overlay
	var muzzle_vel: float = player.def.weapons.muzzle_velocity
	var own_vel := player.velocity if player.velocity.length_squared() > 1.0 else fwd * (player.airspeed / 3.6)
	for ep in enemies.planes:
		if not ep.is_alive:
			continue
		var dist := player.position.distance_to(ep.position)
		var s = _to_screen(ep.position)
		if s != null and dist < 9000.0:
			var p: Vector2 = s
			o.draw_rect(Rect2(p - Vector2(12, 12), Vector2(24, 24)), Color(RED, 0.85), false, 1.5)
			var range_txt := "%.2fkm" % (dist / 1000.0) if dist >= 1000.0 else "%dm" % roundi(dist)
			var hearts := "♥".repeat(maxi(0, ep.lives)) + "♡".repeat(maxi(0, ep.max_lives - ep.lives))
			var label := "%s [%s] %s %s" % [ep.callsign, _state_tag(ep), hearts, range_txt]
			var w := _font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
			o.draw_string_outline(_font, p + Vector2(-w / 2.0, -28), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, 2, Color(0, 0, 0, 0.6))
			o.draw_string(_font, p + Vector2(-w / 2.0, -28), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, ENEMY_TEXT)
			var bar := Rect2(p + Vector2(-24, -22), Vector2(48, 4))
			o.draw_rect(bar, Color(0, 0, 0, 0.65))
			o.draw_rect(Rect2(bar.position, Vector2(48.0 * clampf(ep.hp / ep.max_hp, 0.0, 1.0), 4)), RED)
			o.draw_rect(bar, Color(1, 1, 1, 0.25), false, 1.0)

		# Ballistic lead reticle: where to put the gunsight so the bullets meet the target
		if show_lead_indicator and dist < 1300.0:
			var t_flight := dist / muzzle_vel
			var lead := ep.position + (ep.velocity - own_vel) * t_flight
			var t_conv := 600.0 / muzzle_vel
			lead.y += 0.5 * Ballistics.BULLET_GRAVITY * t_flight * (t_flight - t_conv)  # residual drop vs 600 m harmonisation
			var ls = _to_screen(lead)
			if ls != null:
				for k in 8:  # dashed ring
					var a0 := k * TAU / 8.0
					o.draw_arc(ls, 9.0, a0, a0 + TAU / 16.0, 4, Color(LEAD_YELLOW, 0.9), 1.5, true)
				o.draw_circle(ls, 1.5, LEAD_YELLOW)


func _state_tag(ep: EnemyPlane) -> String:
	match ep.ai_state:
		"attack":
			match ep.tactical_state:
				"evasion": return "EVADE"
				"high_yoyo": return "YO-YO"
				"extend_and_cool": return "COOL"
			return "ATK" if ep.attack_target == player else "AI"
		"takeoff": return "T/O"
		"climb": return "CLB"
	return "PATROL"


# =====================================================================================
# Minimap (drawMinimap)
# =====================================================================================

func _build_minimap() -> void:
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _box(Color(10 / 255.0, 20 / 255.0, 28 / 255.0, 0.85), 10, 6, Color(GREEN, 0.4)))
	card.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	card.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	card.offset_right = -30.0
	card.offset_left = -30.0 - 168.0
	card.offset_top = 20.0
	add_child(card)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 3)
	card.add_child(col)
	_minimap = Control.new()
	_minimap.custom_minimum_size = Vector2(MM_W, MM_H)
	_minimap.clip_contents = true
	_minimap.draw.connect(_draw_minimap)
	col.add_child(_minimap)
	var title := _label("TACTICAL MAP", 10, GREEN)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)


func _mm(x: float, z: float) -> Vector2:
	return Vector2(MM_W / 2.0 + x * MM_SCALE, MM_H / 2.0 + z * MM_SCALE)


# Thick polyline with round caps/joins (canvas lineCap = 'round')
func _mm_stroke(points: Array, width: float, color: Color) -> void:
	var pts := PackedVector2Array()
	for p in points:
		pts.append(_mm(p.x * World.MAP_SCALE, p.y * World.MAP_SCALE))
	_minimap.draw_polyline(pts, color, width)
	for p in pts:
		_minimap.draw_circle(p, width / 2.0, color)


func _draw_minimap() -> void:
	var m := _minimap
	var S := World.MAP_SCALE
	m.draw_rect(Rect2(0, 0, MM_W, MM_H), Color("0d253f"))

	# Islands (same shapes as the height function's influence zones)
	var ellipse := PackedVector2Array()
	var e_c := _mm(-280.0 * S, -1080.0 * S)
	for k in 32:
		var a := k * TAU / 32.0
		ellipse.append(e_c + Vector2(cos(a) * 1200.0 * S * MM_SCALE, sin(a) * 600.0 * S * MM_SCALE))
	m.draw_colored_polygon(ellipse, Color("e5a842"))
	m.draw_circle(_mm(-450.0 * S, -980.0 * S), 18.0 * S * MM_SCALE, Color("14b8a6"))
	var green := Color("2f6e2b")
	_mm_stroke([Vector2(1755, -1545), Vector2(1755, -800), Vector2(1155, -570)], 720.0 * S * MM_SCALE, green)
	_mm_stroke([Vector2(-1395, -45), Vector2(-1620, 705), Vector2(-1920, 1455)], 840.0 * S * MM_SCALE, green)
	_mm_stroke([Vector2(630, 1155), Vector2(1455, 1230), Vector2(2130, 1455)], 840.0 * S * MM_SCALE, green)
	m.draw_circle(_mm(1980.0 * S, 1380.0 * S), 12.0, Color("555b68"))
	m.draw_circle(_mm(1980.0 * S, 1380.0 * S), 5.0, Color("e2e8f0"))

	# Range rings and frame
	var mid := Vector2(MM_W / 2.0, MM_H / 2.0)
	m.draw_arc(mid, 28.0, 0.0, TAU, 48, Color(0, 1, 0.53, 0.16), 1.0)
	m.draw_arc(mid, 54.0, 0.0, TAU, 64, Color(0, 1, 0.53, 0.16), 1.0)
	m.draw_rect(Rect2(0.5, 0.5, MM_W - 1.0, MM_H - 1.0), Color(0, 0.94, 1, 0.55), false, 1.5)

	# Harbor piers
	for d in World.docks:
		var a := _mm(d.x, d.z)
		var p_len := maxf(5.0, d.pier_length * MM_SCALE)
		var b := a + Vector2(sin(d.angle), cos(d.angle)) * p_len
		m.draw_line(a, b, SKY, 2.0)
		m.draw_circle(b, 1.8, Color("06b6d4"))

	# Runways, coloured by owner (home base gold, other friendly green, enemy red)
	for i in World.airports.size():
		var af: Dictionary = World.airports[i]
		var c := _mm(af.x, af.z)
		var rw_w := maxf(3.0, af.width * MM_SCALE * 3.5)
		var rw_l := maxf(7.0, af.length * MM_SCALE)
		var destroyed: bool = af.get("is_destroyed", false)
		var mark := Color("7f1d1d") if destroyed else (Color("fbbf24") if i == World.current_airfield else (OK_GREEN if af.team == "friendly" else RED))
		m.draw_set_transform(c, af.heading_rad)
		m.draw_rect(Rect2(-rw_w / 2.0, -rw_l / 2.0, rw_w, rw_l), Color("1c1917") if destroyed else Color("111827"))
		m.draw_rect(Rect2(-0.8, -rw_l / 2.0 + 1.0, 1.6, rw_l - 2.0), mark)
		if destroyed:
			m.draw_line(Vector2(-rw_w / 2.0, -rw_l / 2.0), Vector2(rw_w / 2.0, rw_l / 2.0), RED, 1.5)
		m.draw_set_transform(Vector2.ZERO)
		# shortcut: label always right of the runway (JS also dodged the player icon / other labels)
		var label_col := Color("fde047") if i == World.current_airfield else (Color("4ade80") if af.team == "friendly" else Color("f87171"))
		var code: String = af.code + (" [X]" if destroyed else "")
		if destroyed:
			label_col = Color("f87171")
		var tw := _font.get_string_size(code, HORIZONTAL_ALIGNMENT_LEFT, -1, 8).x
		var lx := clampf(c.x + rw_w / 2.0 + 3.0, 2.0, MM_W - tw - 2.0)
		var ly := clampf(c.y + 3.0, 8.0, MM_H - 3.0)
		m.draw_string_outline(_font, Vector2(lx, ly), code, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, 3, Color(0.01, 0.02, 0.09, 0.9))
		m.draw_string(_font, Vector2(lx, ly), code, HORIZONTAL_ALIGNMENT_LEFT, -1, 8, label_col)

	# Aircraft arrows: enemies red, player green on top
	for ep in enemies.planes:
		if ep.is_alive:
			_mm_arrow(_mm(ep.position.x, ep.position.z), ep.basis.z, 4.2, RED)
	for fw in allies:
		if fw.is_alive and not fw.taken_over:
			_mm_arrow(_mm(fw.position.x, fw.position.z), fw.basis.z, 4.2, ALLY)
	if not player.is_crashed:
		_mm_arrow(_mm(player.position.x, player.position.z), player.basis.z, 5.5, GREEN)


func _mm_arrow(pos: Vector2, fwd: Vector3, size: float, color: Color) -> void:
	var hdg := atan2(fwd.x, -fwd.z)  # 0 = north (up on the map)
	var pts := PackedVector2Array([Vector2(0, -size), Vector2(size * 0.7, size * 0.8), Vector2(0, size * 0.5), Vector2(-size * 0.7, size * 0.8)])
	_minimap.draw_set_transform(pos, hdg)
	_minimap.draw_colored_polygon(pts, color)
	var outline := pts.duplicate()
	outline.append(pts[0])
	_minimap.draw_polyline(outline, Color(0.01, 0.02, 0.09, 0.9), 1.2)
	_minimap.draw_set_transform(Vector2.ZERO)


# =====================================================================================
# Small builders
# =====================================================================================

func _label(text: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func _box(bg: Color, radius: int, pad: int, border := Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(pad)
	if border.a > 0.0:
		sb.border_color = border
		sb.set_border_width_all(1)
	return sb
