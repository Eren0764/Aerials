class_name Sortie
extends Node3D
## One sortie, from LAUNCH SORTIE until the player leaves it. Owns the player, flight camera, friendly
## AI (wingman #2 + escorts for team size 3-4), enemy squadrons, HUD, pause menu and result screens.
## Ports launchSortieFromMainMenu, triggerCrash (respawn / take over wingman / defeat), respawnAircraft,
## takeOverFriendlyWingman, retryNewSortie, checkVictory and showVictoryScreen from game.js.
## World frees this node to leave; main_menu_requested / retry_requested ask it to.

signal main_menu_requested
signal retry_requested

const VICTORY_DELAY := 2.2  # s after the last enemy is out, so its fall can be seen

var pilot_name := "MAVERICK"
var plane_id := "mustang"
var team_size := 2

var player: PlayerAircraft
var camera: FlightCamera
var enemies: EnemyDirector
var allies: Array[FriendlyPlane] = []
var hud: Hud
var pause_menu: PauseMenu
var result: ResultScreen
var bombs: BombSystem
var audio: GameAudio
var airfields: Airfields  # set by World before add_child
var defenses: Defenses    # set by World before add_child

var sortie_time := 0.0
var is_victory := false
var is_defeated := false
var _victory_timer := 0.0


func _init(p_name := "MAVERICK", p_plane := "mustang", p_team_size := 2) -> void:
	name = "Sortie"
	pilot_name = p_name
	plane_id = p_plane
	team_size = p_team_size


func _ready() -> void:
	player = PlayerAircraft.new()
	player.name = "Player"
	add_child(player)
	player.set_aircraft(plane_id)
	player.pilot_name = pilot_name
	player.respawn(World.current_airfield)

	camera = FlightCamera.new()
	camera.name = "FlightCamera"
	camera.target = player
	add_child(camera)
	camera.current = true

	enemies = EnemyDirector.new()
	enemies.name = "Enemies"
	enemies.player = player
	enemies.team_size = team_size
	add_child(enemies)

	# Team size N: N-1 friendly AI planes of the player's type, parked behind the player
	for slot in range(clampi(team_size, 1, EnemyDirector.TEAM_SIZE_MAX) - 1):
		var ally := FriendlyPlane.new()
		ally.setup(plane_id, slot, player, enemies)
		add_child(ally)
		allies.append(ally)
	enemies.allies = allies
	enemies.spawn_squadrons(World.enemy_home_airfields)
	defenses.update_sides()  # each battery now fights for its nearest base's team
	defenses.player = player

	hud = Hud.new()
	hud.name = "HUD"
	hud.player = player
	hud.camera = camera
	hud.enemies = enemies
	hud.allies = allies
	hud.defenses = defenses
	add_child(hud)
	defenses.banner.connect(hud.show_banner)
	defenses.hit_marker.connect(hud.hit_marker)
	defenses.flak_danger.connect(hud.set_flak_danger)
	player.banner.connect(hud.show_banner)
	enemies.banner.connect(hud.show_banner)
	enemies.player_hit.connect(hud.hit_marker)
	for ally in allies:
		ally.banner.connect(hud.show_banner)

	pause_menu = PauseMenu.new()
	pause_menu.name = "PauseMenu"
	pause_menu.player = player
	add_child(pause_menu)
	pause_menu.main_menu_requested.connect(func() -> void: main_menu_requested.emit())

	bombs = BombSystem.new()
	bombs.name = "Bombs"
	bombs.player = player
	bombs.enemies = enemies
	bombs.airfields = airfields
	bombs.defenses = defenses
	bombs.hud = hud
	add_child(bombs)

	audio = GameAudio.new()
	audio.name = "Audio"
	audio.player = player
	add_child(audio)
	player.guns.shot_fired.connect(audio.gunfire)
	player.guns.jam_click.connect(audio.play.bind("jam_click"))
	player.serviced.connect(func(_af: int) -> void: audio.play("repair"))
	for ep in enemies.planes:
		ep.guns.shot_fired.connect(audio.ai_gunfire.bind(ep))
	for ally in allies:
		ally.guns.shot_fired.connect(audio.ai_gunfire.bind(ally))
	var ballistics: Ballistics = get_tree().get_first_node_in_group("ballistics")
	ballistics.target_hit.connect(func(_t, _m, _p, _s) -> void: audio.play("target_hit"))
	ballistics.exploded.connect(func(_p: Vector3, scale: float) -> void: audio.explosion(scale))
	bombs.released.connect(audio.play.bind("bomb_release"))
	defenses.aa_fired.connect(audio.play.bind("aa_fire"))
	defenses.flak_burst.connect(audio.flak_burst)

	result = ResultScreen.new()
	result.name = "ResultScreen"
	add_child(result)

	player.crashed.connect(_on_player_crashed)
	hud.show_banner("PILOT %s — %s CLEARED FOR TAKEOFF" % [pilot_name, player.def.name], false)


func _exit_tree() -> void:
	if defenses:
		defenses.player = null
		defenses.clear_flak()


func _process(delta: float) -> void:
	if is_victory or is_defeated:
		return
	sortie_time += delta
	_check_victory(delta)


# =====================================================================================
# Crash flow (triggerCrash)
# =====================================================================================

func _on_player_crashed(reason: String) -> void:
	pause_menu.enabled = false
	var hearts := _hearts(player.lives, player.max_lives)
	var candidate := _takeover_candidate()
	if player.lives > 0:
		# Normal crash: respawn at the home base with the remaining lives
		var role := "Wingman #2" if player.is_flying_wingman else String(player.def.name)
		result.show_result("AIRCRAFT DESTROYED", Color("ef4444"), "COMBAT CASUALTY", Color("f59e0b"),
				"%s\n%s Lives Remaining: %d/%d (%s)" % [reason, role, player.lives, player.max_lives, hearts], [],
				[{"label": "RESPAWN (R)", "action": _respawn, "primary": Color("ef4444"), "hotkey": true},
				 {"label": "MAIN MENU", "action": _to_main_menu}])
	elif candidate:
		# Flight lead down, wingman still flying: offer to take it over
		result.show_result("FLIGHT LEAD DESTROYED", Color("38bdf8"), "LEAD LOST — WINGMAN ACTIVE", Color("38bdf8"),
				"%s\nFLIGHT LEAD DESTROYED (0 LIVES LEFT)\n%s IS STILL IN COMBAT (%d/%d LIVES)! TAKE OVER FLIGHT CONTROLS?" % [
				reason, candidate.callsign, candidate.lives, candidate.max_lives], [],
				[{"label": "TAKE CONTROL OF %s (R)" % candidate.callsign, "action": _take_over, "primary": Color("0284c7"), "hotkey": true},
				 {"label": "MAIN MENU", "action": _to_main_menu}])
	else:
		_show_defeat(reason)


func _show_defeat(reason: String) -> void:
	is_defeated = true
	var who := "Wingman #2 and Flight Lead" if player.is_flying_wingman else "Flight Lead and Wingman"
	result.show_result("MISSION FAILED", Color("ef4444"), "DEFEAT — SQUADRON ELIMINATED", Color("ef4444"),
			"%s\nSQUADRON DESTROYED — 0 LIVES REMAINING\n%s have been eliminated. You have lost the sortie." % [reason, who],
			[["PILOT", pilot_name], ["AIRCRAFT", player.def.short_name], ["AIR SPLASHES", str(enemies.sortie_kills), Color("fde047")],
			 ["RESULT", "KIA / DEFEAT", Color("ef4444")]],
			[{"label": "MAIN MENU", "action": _to_main_menu, "primary": Color("0284c7")},
			 {"label": "DEPLOY NEW SORTIE (R)", "action": _retry, "hotkey": true}])


func _respawn() -> void:
	result.hide_result()
	pause_menu.enabled = true
	player.respawn(World.current_airfield)


func _take_over() -> void:
	var candidate := _takeover_candidate()
	if candidate == null:  # it went down while the screen was open
		_show_defeat("Your wingman was shot down before you could take over.")
		return
	result.hide_result()
	pause_menu.enabled = true
	player.take_over(candidate)


## Wingman #2 first, then escorts; only once per sortie (not while already flying the wingman)
func _takeover_candidate() -> FriendlyPlane:
	if player.is_flying_wingman:
		return null
	for ally in allies:
		if ally.can_be_taken_over():
			return ally
	return null


func _to_main_menu() -> void:
	main_menu_requested.emit()


func _retry() -> void:
	retry_requested.emit()


# =====================================================================================
# Victory (checkVictory / showVictoryScreen)
# =====================================================================================

func _check_victory(dt: float) -> void:
	if enemies.planes.is_empty():
		return
	for ep in enemies.planes:
		if not ep.permanently_dead or ep.is_dying:
			_victory_timer = 0.0
			return
	_victory_timer += dt
	if _victory_timer >= VICTORY_DELAY:
		_show_victory()


func _show_victory() -> void:
	is_victory = true
	pause_menu.enabled = false
	player.guns.trigger = false
	get_tree().paused = true  # the battlefield freezes behind the debrief
	hud.visible = false
	var enemy_bases := 0
	var bombed := 0
	for af in World.airports:
		if af.team == "enemy" or af.get("is_destroyed", false):
			enemy_bases += 1
			if af.get("is_destroyed", false):
				bombed += 1
	var n := enemies.planes.size()
	result.show_result("VICTORY", Color("22c55e"), "AIR SUPERIORITY ACHIEVED", Color("fde047"),
			"All %d enemy aircraft have been eliminated. The archipelago airspace belongs to %s's squadron." % [n, pilot_name],
			[["PILOT", pilot_name], ["AIRCRAFT", player.def.short_name + (" (WING #2)" if player.is_flying_wingman else "")],
			 ["YOUR KILLS", str(enemies.sortie_kills), Color("fde047")], ["ENEMY AIRCRAFT", "%d/%d DOWN" % [n, n]],
			 ["BASES BOMBED", "%d/%d" % [bombed, enemy_bases]], ["LIVES LEFT", _hearts(player.lives, player.max_lives), Color("fbbf24")],
			 ["FLIGHT TIME", "%d:%02d" % [int(sortie_time) / 60, int(sortie_time) % 60]], ["RESULT", "VICTORY", Color("22c55e")]],
			[{"label": "DEPLOY NEW SORTIE (R)", "action": _retry, "primary": Color("16a34a"), "hotkey": true},
			 {"label": "MAIN MENU", "action": _to_main_menu}])
	result.orbit(camera, player)
	audio.victory_fanfare()


static func _hearts(n: int, total: int) -> String:
	return "♥".repeat(maxi(0, n)) + "♡".repeat(maxi(0, total - n))
