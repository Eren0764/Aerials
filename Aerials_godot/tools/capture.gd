extends SceneTree
## Render-check harness: boots World, hides the menu UI, renders fixed camera shots and saves PNGs.
## Run windowed (needs a GPU):
##   godot4 --path Aerials_godot --resolution 1280x720 -s res://tools/capture.gd -- <out_dir> [preset]
## preset: dawn | noon | afternoon | sunset | partly_cloudy (ignored until World.apply_lighting_preset exists)

var SHOTS: Array = []  # [name, camera position, look-at target], filled from map data in _setup()

var _world: Node3D
var _cam: Camera3D
var _out := "res://../production/qa/evidence"
var _preset := ""
var _frame := 0
var _shot := -1


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		_out = args[0]
	if args.size() > 1:
		_preset = args[1]
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_out))
	_world = load("res://scripts/world.gd").new()
	root.add_child.call_deferred(_world)


func _process(_delta: float) -> bool:
	_frame += 1
	if _frame == 5:
		_setup()
	elif _frame > 5 and (_frame - 5) % 40 == 0:
		if _shot >= 0:
			_save(SHOTS[_shot][0])
		_shot += 1
		if _shot >= SHOTS.size():
			return true
		_cam.global_position = SHOTS[_shot][1]
		_cam.look_at(SHOTS[_shot][2], Vector3.UP)
	return false


func _setup() -> void:
	var menu := _world.get_node_or_null("MainMenu")
	if menu:
		menu.queue_free()  # menu UI would cover the render
	if _preset != "" and _world.has_method("apply_lighting_preset"):
		_world.apply_lighting_preset(_preset)
	_build_shots()
	_cam = Camera3D.new()
	_cam.far = 35000.0
	_cam.fov = 65.0
	_world.add_child(_cam)
	_cam.current = true


func _save(shot_name: String) -> void:
	var img := root.get_texture().get_image()
	var tag := (_preset + "_") if _preset != "" else ""
	var path := "%s/%s%s.png" % [_out, tag, shot_name]
	img.save_png(ProjectSettings.globalize_path(path))
	print("saved ", ProjectSettings.globalize_path(path))


## Shots aimed at real map features, so they follow docks / airfields wherever placement put them
func _build_shots() -> void:
	var west: Dictionary = World.find_by_id(World.airports, "west")
	var north: Dictionary = World.find_by_id(World.airports, "north")
	var se: Dictionary = World.find_by_id(World.airports, "southeast")
	var dock: Dictionary = World.find_by_id(World.docks, "dock_west")
	var a := Vector3(west.x, 10, west.z)
	var d := Vector3(dock.x, 0, dock.z)
	SHOTS = [
		["airfield", a + Vector3(500, 220, 500), a],
		["harbor", d + Vector3(350, 140, 350), d],
		["desert", Vector3(north.x, 10, north.z) + Vector3(700, 320, 700), Vector3(north.x, 10, north.z)],
		["rocky", Vector3(se.x, 10, se.z) + Vector3(-900, 450, -900), Vector3(se.x, 60, se.z)],
		["horizon", a + Vector3(0, 900, 0), a + Vector3(6000, 300, 0)],
		["sea_low", d + Vector3(900, 30, -200), d + Vector3(-200, 0, 300)],
	]
