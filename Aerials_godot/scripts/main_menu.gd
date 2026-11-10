class_name MainMenu
extends CanvasLayer
## Main menu (Hangar), ported from the #pointer-lock-prompt main-menu markup, setupInputs()
## callsign handling, renderAircraftCardSpecs(), launchSortieFromMainMenu() and the menu music
## player (initMenuMusic / playMenuTrack / startMenuMusicDelay / applyMenuMusicVolume) in game.js:
##   - pilot callsign: text field (A-Z 0-9 space _ -, max 16), RANDOM, 5 presets
##   - team size 1-4 (planes per enemy team)
##   - 6 aircraft cards with specialty badge and tier-derived specs (★ = top tier)
##   - LAUNCH SORTIE
##   - menu music: 2 tracks, 50 s silent gap between songs, prev / play-pause / next, mute,
##     volume slider saved to user://settings.cfg (the JS used localStorage)

signal launch_requested(pilot_name: String, plane_id: String, team_size: int)

const RANDOM_CALLSIGNS := ["MAVERICK", "RED TAIL", "VIPER", "NIGHTHAWK", "VALKYRIE",
	"ICEMAN", "THUNDERBOLT", "GHOST RIDER", "MUSTANG ACE", "PHOENIX",
	"CORSAIR", "HELLCAT", "SKYHAWK", "SPITFIRE", "BLACKBIRD", "SABRE"]
const PRESETS := ["MAVERICK", "RED TAIL", "VIPER", "NIGHTHAWK", "VALKYRIE"]

# Card text from index.html; specs are computed from the stat tiers like renderAircraftCardSpecs()
const CARDS := {
	"mustang": {"title": "P-51D Mustang", "sub": "USAAF \"Red Tail\" Tuskegee Airmen", "badge": "HIGHER SPEED", "color": Color("38bdf8")},
	"zero": {"title": "A6M2 Zero", "sub": "Imperial Japanese Navy • Model 21", "badge": "HIGHER AGILITY", "color": Color("22c55e")},
	"bf109": {"title": "Bf 109 \"Yellow 14\"", "sub": "Luftwaffe Jagdgeschwader • RLM Camo", "badge": "HIGHER DAMAGE", "color": Color("ef4444")},
	"il2": {"title": "Il-2 Sturmovik", "sub": "Soviet VVS \"Flying Tank\"", "badge": "HIGHER HEALTH", "color": Color("f59e0b")},
	"spitfire": {"title": "Spitfire Mk I", "sub": "RAF Fighter Command • \"QV\" Duxford", "badge": "ALL-ROUNDER", "color": Color("a78bfa")},
	"sm79": {"title": "SM.79 Sparviero", "sub": "Regia Aeronautica • \"258-6\"", "badge": "HEAVY BOMBER", "color": Color("fb923c")},
}

const MUSIC := [
	{"title": "Theme 1 (Advance Australia - 8 Bit)", "path": "res://audio/theme1.ogg"},
	{"title": "Theme 2 (Wings of Steel Soundtrack)", "path": "res://audio/theme2.ogg"},
]
const MUSIC_GAP := 50.0
const SETTINGS_PATH := "user://settings.cfg"

const GREEN := Color("00ff88")
const DIM := Color("94a3b8")

var pilot_name := "MAVERICK"
var selected_plane := "mustang"
var team_size := 2

var _name_edit: LineEdit
var _preset_buttons := {}
var _size_buttons := {}
var _cards := {}
var _photos := {}  # plane id -> TextureRect on the card
var _panel: PanelContainer
var _player: AudioStreamPlayer
var _track := 0
var _music_on := true      # user wants music (play/pause button)
var _gap_left := 0.0       # >0 while waiting out the 50 s gap
var _volume := 60
var _muted := false
var _prev_volume := 60
var _track_label: Label
var _play_button: Button
var _mute_button: Button
var _volume_slider: HSlider
var _volume_label: Label


func _ready() -> void:
	layer = 15
	_load_settings()
	_build()
	_player = AudioStreamPlayer.new()
	_player.finished.connect(_on_track_finished)
	add_child(_player)
	_apply_volume(_volume, false)
	_select_plane(selected_plane)
	_select_size(team_size)
	_set_name(pilot_name)
	# Studio photos of each aircraft for the cards (rendered off-screen once per session)
	var studio := AircraftPhotoStudio.new()
	studio.name = "PhotoStudio"
	add_child(studio)
	studio.generate(AircraftDefs.ORDER, func(id: String, tex: Texture2D) -> void:
		(_photos[id] as TextureRect).texture = tex)


## Show the menu and resume its music (resumeMenuMusicOnMenuReturn)
func open() -> void:
	visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	if _music_on and _gap_left <= 0.0:
		if _player.stream == null:
			_play_track(_track)
		else:
			_player.stream_paused = false
			if not _player.playing:
				_player.play()


## Hide the menu and pause its music for the sortie (pauseMenuMusicForFlight)
func close() -> void:
	visible = false
	_player.stream_paused = true


func _process(delta: float) -> void:
	if not visible:
		return
	_fit_to_window()
	if _gap_left > 0.0:
		_gap_left -= delta
		if _gap_left <= 0.0:
			_gap_left = 0.0
			_play_track(_track)
	_update_music_ui()


# Shrink the whole panel uniformly when the window is too small for it (keeps it centred and clickable)
func _fit_to_window() -> void:
	var avail := get_viewport().get_visible_rect().size - Vector2(24, 24)
	var need := _panel.size
	if need.x <= 0.0 or need.y <= 0.0:
		return
	var k := minf(1.0, minf(avail.x / need.x, avail.y / need.y))
	_panel.pivot_offset = Vector2.ZERO
	_panel.scale = Vector2(k, k)
	_panel.position = ((avail + Vector2(24, 24)) - need * k) / 2.0


# =====================================================================================
# Actions
# =====================================================================================

func _launch() -> void:
	# Callsign: upper-case, A-Z 0-9 space _ - only, max 16, default MAVERICK
	var re := RegEx.create_from_string("[^A-Z0-9 _\\-]")
	var cleaned := re.sub(_name_edit.text.strip_edges().to_upper(), "", true).substr(0, 16)
	_set_name(cleaned if not cleaned.is_empty() else "MAVERICK")
	_save_settings()
	launch_requested.emit(pilot_name, selected_plane, team_size)


func _set_name(name_text: String) -> void:
	pilot_name = name_text
	if _name_edit.text != name_text:
		_name_edit.text = name_text
	for p in _preset_buttons:
		_style_toggle(_preset_buttons[p], p == name_text.strip_edges().to_upper())


func _random_name() -> void:
	var current := _name_edit.text.strip_edges().to_upper()
	var pool := RANDOM_CALLSIGNS.filter(func(c): return c != current)
	_set_name(pool.pick_random())


func _select_plane(id: String) -> void:
	selected_plane = id
	for k in _cards:
		var sb := _card_style(k == id)
		(_cards[k] as PanelContainer).add_theme_stylebox_override("panel", sb)


func _select_size(n: int) -> void:
	team_size = n
	for k in _size_buttons:
		_style_toggle(_size_buttons[k], k == n)


# =====================================================================================
# Music
# =====================================================================================

func _play_track(index: int) -> void:
	_gap_left = 0.0
	_track = posmod(index, MUSIC.size())
	_player.stream = load(MUSIC[_track].path)
	_player.stream_paused = false
	_player.play()
	_music_on = true


# Track finished: advance and wait out the silent 50 s gap
func _on_track_finished() -> void:
	_track = (_track + 1) % MUSIC.size()
	_gap_left = MUSIC_GAP


func _toggle_play() -> void:
	if _gap_left > 0.0:
		_play_track(_track)  # skip the gap
	elif _player.playing and not _player.stream_paused:
		_player.stream_paused = true
		_music_on = false
	elif _player.stream != null and _player.stream_paused:
		_player.stream_paused = false
		_music_on = true
	else:
		_play_track(_track)


func _apply_volume(vol: int, save := true) -> void:
	_volume = clampi(vol, 0, 100)
	if _volume > 0:
		_prev_volume = _volume
		_muted = false
	else:
		_muted = true
	_player.volume_db = linear_to_db(_volume / 100.0) if _volume > 0 else -80.0
	if _volume_slider and int(_volume_slider.value) != _volume:
		_volume_slider.set_value_no_signal(_volume)
	if save:
		_save_settings()


func _toggle_mute() -> void:
	_apply_volume(_prev_volume if _muted else 0)


func _update_music_ui() -> void:
	var title: String = MUSIC[_track].title
	if _gap_left > 0.0:
		_track_label.text = "DELAY (%ds) → %s" % [ceili(_gap_left), title]
		_play_button.text = "▶"
	else:
		var playing := _player.playing and not _player.stream_paused
		_track_label.text = "%s %s" % ["▶" if playing else "❚❚", title]
		_play_button.text = "❚❚" if playing else "▶"
	_volume_label.text = "%d%%" % _volume
	_mute_button.text = "MUTED" if _muted else "MUSIC"


func _load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		_volume = clampi(int(cfg.get_value("menu", "music_volume", 60)), 0, 100)
		pilot_name = String(cfg.get_value("menu", "pilot_name", "MAVERICK"))


func _save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)  # keep other sections if present
	cfg.set_value("menu", "music_volume", _volume)
	cfg.set_value("menu", "pilot_name", pilot_name)
	cfg.save(SETTINGS_PATH)


# =====================================================================================
# Layout
# =====================================================================================

func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(7 / 255.0, 14 / 255.0, 23 / 255.0, 0.35)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)

	var box := PanelContainer.new()
	var sb := Hud._box(Color(11 / 255.0, 19 / 255.0, 33 / 255.0, 0.82), 14, 18, Color(0, 1, 0.53, 0.55))
	sb.set_border_width_all(2)
	sb.shadow_color = Color(0, 1, 0.53, 0.18)
	sb.shadow_size = 24
	box.add_theme_stylebox_override("panel", sb)
	box.custom_minimum_size = Vector2(900, 0)
	add_child(box)  # placed and scaled by _fit_to_window (a CenterContainer pins oversized children to the top)
	_panel = box

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 9)
	box.add_child(col)

	col.add_child(_centered(_text("★ PACIFIC & DESERT ARCHIPELAGO THEATER ★", 11, DIM)))
	col.add_child(_centered(_text("AERIALS", 30, GREEN)))
	col.add_child(_centered(_text("SELECT CALLSIGN & AIRCRAFT TO DEPLOY INTO THE THEATER", 12, Color("cbd5e1"))))
	col.add_child(_build_music_row())
	col.add_child(_build_pilot_row())
	col.add_child(_section("SELECT AIRCRAFT (SHARED BASE STATS WITH UNIQUE SPECIALIZATION)"))
	col.add_child(_build_cards())

	var launch := _button("LAUNCH SORTIE", 17, Color("062419"), Color("00ff88"), Color("34d399"))
	launch.custom_minimum_size = Vector2(260, 46)
	launch.pressed.connect(_launch)
	col.add_child(_centered(launch))


func _build_music_row() -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Hud._box(Color(1, 1, 1, 0.05), 8, 8, Color(1, 1, 1, 0.12)))
	panel.add_child(row)

	_mute_button = _small_button("MUSIC")
	_mute_button.custom_minimum_size = Vector2(70, 0)
	_mute_button.pressed.connect(_toggle_mute)
	row.add_child(_mute_button)
	var titles := VBoxContainer.new()
	titles.add_theme_constant_override("separation", 0)
	titles.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	titles.add_child(_text("MENU THEME", 10, DIM))
	_track_label = _text("", 12, Color("e2e8f0"))
	titles.add_child(_track_label)
	row.add_child(titles)

	row.add_child(_text("VOL", 11, DIM))
	_volume_slider = HSlider.new()
	_volume_slider.min_value = 0
	_volume_slider.max_value = 100
	_volume_slider.step = 1
	_volume_slider.value = _volume
	_volume_slider.custom_minimum_size = Vector2(140, 0)
	_volume_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_volume_slider.value_changed.connect(func(v: float) -> void: _apply_volume(int(v)))
	row.add_child(_volume_slider)
	_volume_label = _text("60%", 12, Color("e2e8f0"))
	_volume_label.custom_minimum_size = Vector2(40, 0)
	row.add_child(_volume_label)

	var prev := _small_button("◀◀")
	prev.pressed.connect(func() -> void: _play_track(_track - 1))
	row.add_child(prev)
	_play_button = _small_button("❚❚")
	_play_button.pressed.connect(_toggle_play)
	row.add_child(_play_button)
	var next := _small_button("▶▶")
	next.pressed.connect(func() -> void: _play_track(_track + 1))
	row.add_child(next)
	return panel


func _build_pilot_row() -> Control:
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 14)
	grid.add_theme_constant_override("v_separation", 8)

	grid.add_child(_text("PILOT CALLSIGN", 12, GREEN))
	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 6)
	_name_edit = LineEdit.new()
	_name_edit.max_length = 16
	_name_edit.placeholder_text = "ENTER CALLSIGN..."
	_name_edit.custom_minimum_size = Vector2(200, 0)
	_name_edit.add_theme_font_size_override("font_size", 14)
	_name_edit.text_changed.connect(func(t: String) -> void:
		var caret := _name_edit.caret_column
		var upper := t.to_upper()
		if upper != t:
			_name_edit.text = upper
			_name_edit.caret_column = caret
		pilot_name = upper.strip_edges() if not upper.strip_edges().is_empty() else "MAVERICK"
		for p in _preset_buttons:
			_style_toggle(_preset_buttons[p], p == upper.strip_edges()))
	_name_edit.text_submitted.connect(func(_t: String) -> void: _name_edit.release_focus())
	name_row.add_child(_name_edit)
	var rnd := _small_button("RANDOM")
	rnd.pressed.connect(_random_name)
	name_row.add_child(rnd)
	for p in PRESETS:
		var b := _small_button(p)
		b.pressed.connect(_set_name.bind(p))
		_preset_buttons[p] = b
		name_row.add_child(b)
	grid.add_child(name_row)

	var size_label := HBoxContainer.new()
	size_label.add_child(_text("TEAM SIZE ", 12, GREEN))
	size_label.add_child(_text("planes per enemy team", 10, DIM))
	grid.add_child(size_label)
	var sizes := HBoxContainer.new()
	sizes.add_theme_constant_override("separation", 6)
	for n in [1, 2, 3, 4]:
		var b := _small_button(str(n))
		b.custom_minimum_size = Vector2(38, 0)
		b.pressed.connect(_select_size.bind(n))
		_size_buttons[n] = b
		sizes.add_child(b)
	grid.add_child(sizes)
	return grid


func _build_cards() -> Control:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	var base_pitch: float = AircraftDefs.TIER.arcade_pitch_rate[2]
	for id in AircraftDefs.ORDER:
		var def := AircraftDefs.get_def(id)
		var info: Dictionary = CARDS[id]
		var card := PanelContainer.new()
		card.custom_minimum_size = Vector2(285, 0)
		card.mouse_filter = Control.MOUSE_FILTER_STOP
		card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		card.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				_select_plane(id))
		var v := VBoxContainer.new()
		v.add_theme_constant_override("separation", 3)
		v.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(v)

		# Photo strip with the specialty badge in its top-left corner (.aircraft-photo-wrap)
		var photo_wrap := Panel.new()
		photo_wrap.custom_minimum_size = Vector2(0, 104)
		photo_wrap.clip_contents = true
		photo_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		photo_wrap.add_theme_stylebox_override("panel", Hud._box(Color("1e3a5f"), 6, 0))
		v.add_child(photo_wrap)
		var photo := TextureRect.new()
		photo.set_anchors_preset(Control.PRESET_FULL_RECT)
		photo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		photo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED  # object-fit: cover
		photo.mouse_filter = Control.MOUSE_FILTER_IGNORE
		photo_wrap.add_child(photo)
		_photos[id] = photo
		var badge := _text(info.badge, 10, Color.WHITE)
		badge.add_theme_stylebox_override("normal", Hud._box(Color(info.color, 0.55), 4, 3, info.color))
		badge.position = Vector2(7, 7)
		photo_wrap.add_child(badge)
		v.add_child(_text(info.title, 15, Color.WHITE))
		v.add_child(_text(info.sub, 10, DIM))

		# Specs: highlighted when off the base tier, ★ on the top tier (renderAircraftCardSpecs)
		var turn_pct := roundi((def.arcade_pitch_rate / base_pitch - 1.0) * 100.0)
		var turn := "Base" if turn_pct == 0 else ("%s%d%%" % ["+" if turn_pct > 0 else "−", absi(turn_pct)])
		var specs := HFlowContainer.new()
		specs.add_theme_constant_override("h_separation", 8)
		specs.mouse_filter = Control.MOUSE_FILTER_IGNORE
		for spec in [["SPD", "%d km/h" % def.max_airspeed, def.stats.speed], ["TURN", turn, def.stats.agility],
				["DMG", "%d" % def.damage_per_shot, def.stats.damage], ["HP", "%d" % def.max_hp, def.stats.health]]:
			var tier: int = spec[2]
			var star := " ★" if tier == 4 else ""
			specs.add_child(_text("%s: %s%s" % [spec[0], spec[1], star], 11,
					Color("e2e8f0") if tier == 2 else (GREEN if tier > 2 else Color("fca5a5"))))
		if def.bomb_rack.size() > 2:
			specs.add_child(_text("BOMBS: %d ★" % def.bomb_rack.size(), 11, GREEN))
		if def.has("dorsal_gunner"):
			specs.add_child(_text("DORSAL GUNNER", 11, GREEN))
		v.add_child(specs)
		_cards[id] = card
		grid.add_child(card)
	return grid


func _card_style(active: bool) -> StyleBoxFlat:
	var sb := Hud._box(Color(0, 1, 0.53, 0.10) if active else Color(1, 1, 1, 0.04), 10, 10,
			GREEN if active else Color(1, 1, 1, 0.15))
	sb.set_border_width_all(2 if active else 1)
	return sb


# --- small builders ---

func _text(t: String, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _section(t: String) -> Label:
	return _text(t, 11, GREEN)


func _centered(c: Control) -> CenterContainer:
	var cc := CenterContainer.new()
	cc.add_child(c)
	return cc


func _button(t: String, size: int, fg: Color, bg: Color, hover_bg: Color) -> Button:
	var b := Button.new()
	b.text = t
	b.add_theme_font_size_override("font_size", size)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(state, fg)
	var normal := Hud._box(bg, 8, 8)
	var hover := Hud._box(hover_bg, 8, 8)
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	return b


func _small_button(t: String) -> Button:
	var b := _button(t, 12, Color("e2e8f0"), Color(1, 1, 1, 0.08), Color(1, 1, 1, 0.18))
	_style_toggle(b, false)
	return b


func _style_toggle(b: Button, active: bool) -> void:
	var normal := Hud._box(Color(0, 1, 0.53, 0.22) if active else Color(1, 1, 1, 0.08), 6, 6,
			GREEN if active else Color(1, 1, 1, 0.22))
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(hover.bg_color, minf(1.0, hover.bg_color.a + 0.1))
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(state, GREEN if active else Color("e2e8f0"))
