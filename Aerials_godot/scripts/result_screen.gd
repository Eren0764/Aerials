class_name ResultScreen
extends CanvasLayer
## Modal panel for the crash / take-over / defeat screens (#crash-modal in game.js) and the
## victory screen (#victory-modal). Runs while the tree is paused (victory freezes the battle),
## and can slowly orbit a camera around the player's aircraft behind it (updateVictoryCamera).
## The button flagged as hotkey also fires on R (Enter / Space too, like the JS respawn keys).

var _title: Label
var _badge: Label
var _body: Label
var _debrief: GridContainer
var _buttons: HBoxContainer
var _hotkey: Callable

# Victory orbit
var _orbit_camera: Camera3D
var _orbit_focus: Node3D
var _orbit_angle := 0.0
const ORBIT_RADIUS := 34.0


func _ready() -> void:
	layer = 18
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_build()


## buttons: [{"label": String, "action": Callable, "primary": Color (optional), "hotkey": bool}]
## debrief: [[label, value, value_color], ...]
func show_result(title: String, title_color: Color, badge: String, badge_color: Color, body: String,
		debrief: Array, buttons: Array) -> void:
	_title.text = title
	_title.add_theme_color_override("font_color", title_color)
	_badge.text = badge
	_badge.add_theme_color_override("font_color", badge_color)
	_badge.add_theme_stylebox_override("normal", Hud._box(Color(badge_color, 0.12), 6, 6, Color(badge_color, 0.5)))
	_body.text = body

	for c in _debrief.get_children():
		c.queue_free()
	_debrief.visible = not debrief.is_empty()
	for item in debrief:
		var cell := VBoxContainer.new()
		cell.add_theme_constant_override("separation", 0)
		cell.add_child(_text(item[0], Hud.TEXT_LABEL, Color("94a3b8")))
		cell.add_child(_text(item[1], Hud.TEXT_VALUE, item[2] if item.size() > 2 else Color.WHITE))
		_debrief.add_child(cell)

	for c in _buttons.get_children():
		c.queue_free()
	_hotkey = Callable()
	for spec in buttons:
		var b := _button(spec.label, spec.get("primary", Color(1, 1, 1, 0.14)))
		b.pressed.connect(spec.action)
		_buttons.add_child(b)
		if spec.get("hotkey", false):
			_hotkey = spec.action
	visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func hide_result() -> void:
	visible = false
	_orbit_camera = null
	_orbit_focus = null


## Glide the camera out into a slow orbit around the focus (victory shot)
func orbit(cam: Camera3D, focus: Node3D) -> void:
	_orbit_camera = cam
	_orbit_focus = focus
	var d := cam.global_position - focus.global_position
	_orbit_angle = atan2(d.x, d.z)


func _process(delta: float) -> void:
	if _orbit_camera == null or not is_instance_valid(_orbit_focus):
		return
	var dt := minf(delta, 0.1)
	_orbit_angle += 0.22 * dt
	var focus := _orbit_focus.global_position
	var target := focus + Vector3(sin(_orbit_angle) * ORBIT_RADIUS, 9.0, cos(_orbit_angle) * ORBIT_RADIUS)
	_orbit_camera.global_position = _orbit_camera.global_position.lerp(target, minf(1.0, 1.8 * dt))
	if _orbit_camera.global_position.distance_squared_to(focus) > 0.01:
		_orbit_camera.look_at(focus, Vector3.UP)


func _unhandled_input(event: InputEvent) -> void:
	if not visible or not _hotkey.is_valid():
		return
	if event.is_action_pressed("respawn"):
		get_viewport().set_input_as_handled()
		_hotkey.call()


# =====================================================================================
# Layout
# =====================================================================================

func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(7 / 255.0, 14 / 255.0, 23 / 255.0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var box := PanelContainer.new()
	var sb := Hud._box(Color(11 / 255.0, 19 / 255.0, 33 / 255.0, 0.92), 14, 24, Color(1, 1, 1, 0.25))
	sb.set_border_width_all(2)
	box.add_theme_stylebox_override("panel", sb)
	box.custom_minimum_size = Vector2(560, 0)
	center.add_child(box)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	box.add_child(col)
	_title = _text("", 28, Color.WHITE)
	col.add_child(_centered(_title))
	_badge = _text("", Hud.TEXT_LABEL, Color.WHITE)
	col.add_child(_centered(_badge))
	_body = _text("", Hud.TEXT_LABEL, Color("e2e8f0"))
	_body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_body.custom_minimum_size = Vector2(500, 0)
	col.add_child(_body)
	_debrief = GridContainer.new()
	_debrief.columns = 4
	_debrief.add_theme_constant_override("h_separation", 26)
	_debrief.add_theme_constant_override("v_separation", 10)
	col.add_child(_centered(_debrief))
	_buttons = HBoxContainer.new()
	_buttons.add_theme_constant_override("separation", 14)
	col.add_child(_centered(_buttons))


func _text(t: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", Hud.font_px(size))
	l.add_theme_color_override("font_color", color)
	return l


func _centered(c: Control) -> CenterContainer:
	var cc := CenterContainer.new()
	cc.add_child(c)
	return cc


func _button(t: String, bg: Color) -> Button:
	var b := Button.new()
	b.text = t
	b.add_theme_font_size_override("font_size", Hud.TEXT_LABEL)
	var normal := Hud._box(bg, 8, 11, Color(1, 1, 1, 0.25))
	normal.content_margin_left = 26
	normal.content_margin_right = 26
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = bg.lightened(0.15)
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	return b
