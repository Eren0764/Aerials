extends SceneTree
## HUD / menu evidence harness (art bible §4 / §7 fixes): boots World, saves
##   menu.png    main menu with default keyboard focus (LAUNCH SORTIE)
##   hud.png     in-flight HUD ~4 s after a scripted sortie start
##   warning.png tree paused with the flak warning and red warning panel forced on
##   pause.png   pause menu (keyboard focus on RESUME)
##   markers.png player teleported 350 m behind an enemy so its marker + insignia tag show
## Run windowed (needs a GPU):
##   godot4 --path Aerials_godot --resolution 1920x1080 -s res://tools/capture_hud.gd -- [out_dir]

var _out := "res://../production/qa/evidence/hud"
var _world: Node
var _t := 0.0
var _step := 0


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_out))
	_world = load("res://scripts/world.gd").new()
	root.add_child.call_deferred(_world)


func _process(delta: float) -> bool:
	_t += delta
	match _step:
		0:  # menu: photo studio needs a moment to fill the cards
			if _t > 3.0:
				print("focus owner: ", root.gui_get_focus_owner())
				_save("menu")
				_world.start_sortie("CAPTURE", "bf109", 2)
				_next()
		1:
			if _t > 4.0:
				_save("hud")
				var hud: Hud = _world._sortie.hud
				paused = true  # freeze the HUD so the forced state is not overwritten next frame
				hud.set_flak_danger(0.4)
				hud._warning_label.text = "⚠  STALL WARNING!  ⚠"
				hud._warning.visible = true
				_next()
		2:
			if _t > 0.3:
				_save("warning")
				paused = false
				_next()
		3:
			if _t > 0.3:
				_world._sortie.pause_menu.pause()
				_next()
		4:
			if _t > 0.5:
				print("focus owner: ", root.gui_get_focus_owner())
				_save("pause")
				_world._sortie.pause_menu.resume()
				var ep: EnemyPlane = _world._sortie.enemies.planes[0]
				var pl: PlayerAircraft = _world._sortie.player
				pl.global_basis = ep.global_basis
				pl.global_position = ep.global_position - ep.global_basis.z * 350.0 + Vector3(25, 15, 0)
				_next()
		5:
			if _t > 0.4:
				_save("markers")
				return true
	return false


func _next() -> void:
	_step += 1
	_t = 0.0


func _save(shot: String) -> void:
	var path := ProjectSettings.globalize_path("%s/%s.png" % [_out, shot])
	root.get_texture().get_image().save_png(path)
	print("saved ", path)
