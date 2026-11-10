extends SceneTree
## Aircraft look check: loads each aircraft through AircraftModel (same path as the game), one at a time,
## 3/4 front-top camera at ~15 m, saves <out>/<id>_after.png (or _before.png with `before`, weathering off).
## Run windowed (needs a GPU):
##   godot4 --path Aerials_godot --resolution 1280x720 -s res://tools/capture_aircraft.gd -- [before] [out_dir]

const IDS := ["mustang", "zero", "bf109", "il2", "spitfire", "sm79"]

var _out := "res://../production/qa/evidence/aircraft"
var _tag := "after"
var _model: AircraftModel
var _frame := 0
var _idx := -1


func _initialize() -> void:
	for a in OS.get_cmdline_user_args():
		if a == "before":
			_tag = "before"
			AircraftModel.weathering_enabled = false
		else:
			_out = a
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_out))

	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	(sky.sky_material as ProceduralSkyMaterial).ground_bottom_color = Color(0.35, 0.38, 0.32)
	(sky.sky_material as ProceduralSkyMaterial).ground_horizon_color = Color(0.55, 0.6, 0.62)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)

	var sun := DirectionalLight3D.new()
	sun.shadow_enabled = true
	root.add_child(sun)
	sun.look_at_from_position(Vector3(10, 14, 14), Vector3.ZERO, Vector3.UP)  # ~35 deg elevation

	var cam := Camera3D.new()
	cam.fov = 30.0
	root.add_child(cam)
	cam.look_at_from_position(Vector3(8.0, 6.0, 11.0), Vector3(0, 0, 0.5), Vector3.UP)  # ~15 m, front-right, above
	cam.current = true


func _process(_delta: float) -> bool:
	_frame += 1
	if _frame % 12 != 0:
		return false
	if _model:
		var path := "%s/%s_%s.png" % [_out, IDS[_idx], _tag]
		root.get_texture().get_image().save_png(ProjectSettings.globalize_path(path))
		print("saved ", ProjectSettings.globalize_path(path))
		_model.queue_free()
	_idx += 1
	if _idx >= IDS.size():
		return true
	_model = AircraftModel.new(IDS[_idx])
	_model.set_gear(0.0)
	_model.set_prop_blur(0.5)
	root.add_child(_model)
	return false
