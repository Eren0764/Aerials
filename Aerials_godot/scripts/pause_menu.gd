class_name PauseMenu
extends CanvasLayer
## ESC pause, ported from pauseGame() / resumeGame() / togglePause() in game.js.
## Uses SceneTree.paused, so every node with the default process mode (aircraft, AI, bullets,
## effects, camera, HUD) freezes on the spot and no time accumulates while paused: on resume
## nothing jumps. This layer runs with PROCESS_MODE_ALWAYS so it can unpause.
## Also pauses when the window loses focus (the JS paused when pointer lock was lost).

signal main_menu_requested

var player: PlayerAircraft
var enabled := true  # off while a crash / defeat / victory screen is up

var _sub: Label


func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_build()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel"):
		toggle()
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and not get_tree().paused:
		pause()


func toggle() -> void:
	if not enabled:
		return
	if get_tree().paused:
		resume()
	else:
		pause()


func pause() -> void:
	# Like the JS: no pausing once crashed or on the victory screen (those screens have their own buttons)
	if player == null or not enabled or player.is_crashed or get_tree().paused:
		return
	player.guns.trigger = false
	get_tree().paused = true
	_sub.text = "PILOT: %s • %s • ALL SIMULATION FROZEN" % [player.pilot_name, String(player.def.name).to_upper()]
	visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func resume() -> void:
	if not get_tree().paused:
		return
	get_tree().paused = false
	visible = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(7 / 255.0, 14 / 255.0, 23 / 255.0, 0.72)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var box := PanelContainer.new()
	var sb := Hud._box(Color(11 / 255.0, 19 / 255.0, 33 / 255.0, 0.92), 14, 24, Color(0, 1, 0.53, 0.55))
	sb.set_border_width_all(2)
	sb.shadow_color = Color(0, 1, 0.53, 0.18)
	sb.shadow_size = 24
	box.add_theme_stylebox_override("panel", sb)
	center.add_child(box)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	box.add_child(col)

	col.add_child(_centered(_text("||  SIMULATION FROZEN", 12, Color("94a3b8"))))
	var title := _text("FLIGHT PAUSED", 28, Color("00ff88"))
	col.add_child(_centered(title))
	_sub = _text("", 13, Color("cbd5e1"))
	col.add_child(_centered(_sub))

	# Controls reference (#pause-controls-section)
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 6)
	for row in [
			["Mouse", "Aim (Virtual Instructor steers)"], ["W S", "Pitch override"],
			["A D", "Roll override"], ["Q E", "Rudder override"],
			["Wheel Shift Ctrl", "Throttle & WEP"], ["Hold C", "Free Look (360°)"],
			["LMB Space", "Fire guns"], ["RMB Z", "Gunsight zoom"],
			["B", "Drop bomb"], ["L", "Lead reticle"],
			["G", "Landing gear"],
			["F", "Flaps"], ["V", "Camera mode"],
			["R", "Respawn"], ["M", "Sound on / off"],
			["ESC", "Pause / resume"]]:
		var key := _text(row[0], 12, Color("e2e8f0"))
		key.add_theme_stylebox_override("normal", Hud._box(Color(1, 1, 1, 0.08), 4, 4, Color(1, 1, 1, 0.25)))
		key.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		grid.add_child(key)
		grid.add_child(_text(row[1], 12, Color("94a3b8")))
	col.add_child(_centered(grid))

	var resume_btn := Button.new()
	resume_btn.text = "RESUME FLIGHT (ESC)"
	resume_btn.add_theme_font_size_override("font_size", 16)
	resume_btn.add_theme_color_override("font_color", Color("062419"))
	resume_btn.add_theme_color_override("font_hover_color", Color("062419"))
	resume_btn.add_theme_color_override("font_pressed_color", Color("062419"))
	var normal := Hud._box(Color("00ff88"), 8, 12)
	normal.content_margin_left = 42
	normal.content_margin_right = 42
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("34d399")
	resume_btn.add_theme_stylebox_override("normal", normal)
	resume_btn.add_theme_stylebox_override("hover", hover)
	resume_btn.add_theme_stylebox_override("pressed", hover)
	resume_btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	resume_btn.pressed.connect(resume)
	var menu_btn := Button.new()
	menu_btn.text = "MAIN MENU"
	menu_btn.add_theme_font_size_override("font_size", 15)
	var menu_normal := Hud._box(Color(1, 1, 1, 0.12), 8, 12, Color(1, 1, 1, 0.28))
	menu_normal.content_margin_left = 28
	menu_normal.content_margin_right = 28
	var menu_hover := menu_normal.duplicate() as StyleBoxFlat
	menu_hover.bg_color = Color(1, 1, 1, 0.2)
	menu_btn.add_theme_stylebox_override("normal", menu_normal)
	menu_btn.add_theme_stylebox_override("hover", menu_hover)
	menu_btn.add_theme_stylebox_override("pressed", menu_hover)
	menu_btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	menu_btn.pressed.connect(func() -> void: main_menu_requested.emit())

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 14)
	buttons.add_child(resume_btn)
	buttons.add_child(menu_btn)
	col.add_child(_centered(buttons))


func _text(t: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


func _centered(c: Control) -> CenterContainer:
	var cc := CenterContainer.new()
	cc.add_child(c)
	return cc
