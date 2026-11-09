class_name AircraftPhotoStudio
extends Node
## Studio "photos" of each aircraft for the main menu cards, ported from generateAircraftPhotos() /
## createAircraftPhotoBackdrop() in game.js. Each plane is rendered once in an off-screen 480x260
## SubViewport: painted sky / sea / sun / cloud backdrop (canvas layer behind the 3D via BG_CANVAS),
## the real model with gear up in a banking pose, a key + cyan rim light, and reconnaissance corner ticks.
## The result is copied into an ImageTexture (cached for the session) and handed to the callback.

const W := 480
const H := 260

# Per-plane sky palette and sun position (createAircraftPhotoBackdrop)
const PALETTES := {
	"mustang": {"top": "0c2d57", "mid": "2563eb", "horizon": "93c5fd", "sea": "1e3a8a", "sun": Vector2(380, 64), "sun_color": Color(254 / 255.0, 240 / 255.0, 138 / 255.0, 0.85)},
	"zero": {"top": "0f394c", "mid": "0284c7", "horizon": "bae6fd", "sea": "0369a1", "sun": Vector2(110, 58), "sun_color": Color(254 / 255.0, 215 / 255.0, 170 / 255.0, 0.85)},
	"bf109": {"top": "1e293b", "mid": "475569", "horizon": "cbd5e1", "sea": "334155", "sun": Vector2(390, 70), "sun_color": Color(253 / 255.0, 224 / 255.0, 71 / 255.0, 0.78)},
	"il2": {"top": "311b2c", "mid": "9a3412", "horizon": "fdba74", "sea": "431407", "sun": Vector2(120, 76), "sun_color": Color(254 / 255.0, 240 / 255.0, 138 / 255.0, 0.88)},
	"spitfire": {"top": "1e3a5f", "mid": "4f7cac", "horizon": "dbeafe", "sea": "365314", "sun": Vector2(360, 60), "sun_color": Color(254 / 255.0, 249 / 255.0, 195 / 255.0, 0.85)},
	"sm79": {"top": "3b4a52", "mid": "9fb3b8", "horizon": "f4e3c3", "sea": "5b6e73", "sun": Vector2(90, 55), "sun_color": Color(253 / 255.0, 230 / 255.0, 190 / 255.0, 0.85)},
}
# Camera position and model rotation (Euler XYZ, as Three.js) per plane
const POSES := {
	"mustang": {"cam": Vector3(0, 1.55, 13.6), "rot": Vector3(0.11, -2.36, -0.22)},
	"zero": {"cam": Vector3(0, 1.45, 13.2), "rot": Vector3(0.10, -2.32, -0.25)},
	"bf109": {"cam": Vector3(0, 1.45, 13.0), "rot": Vector3(0.12, -2.38, -0.20)},
	"il2": {"cam": Vector3(0, 1.65, 14.4), "rot": Vector3(0.11, -2.35, -0.18)},
	"spitfire": {"cam": Vector3(0, 1.75, 13.6), "rot": Vector3(0.16, -2.34, -0.24)},
	"sm79": {"cam": Vector3(0, 2.6, 22.0), "rot": Vector3(0.14, -2.30, -0.20)},
}
const CLOUD_PUFFS := [Vector3(60, 165, 48), Vector3(95, 160, 38), Vector3(130, 170, 32), Vector3(250, 175, 52),
	Vector3(295, 168, 42), Vector3(340, 176, 35), Vector3(415, 162, 46), Vector3(450, 170, 36)]

static var photos := {}  # plane id -> ImageTexture


## Render every missing photo; on_ready(id, texture) is called for each as soon as it exists
func generate(ids: Array, on_ready: Callable) -> void:
	var pending := {}
	for id in ids:
		if photos.has(id):
			on_ready.call(id, photos[id])
		else:
			pending[id] = _build_viewport(id)
	if pending.is_empty():
		return
	await RenderingServer.frame_post_draw
	for id in pending:
		var vp: SubViewport = pending[id]
		var img := vp.get_texture().get_image()
		if img and not img.is_empty():  # headless / dummy renderer gives nothing: cards stay photo-less
			photos[id] = ImageTexture.create_from_image(img)
			on_ready.call(id, photos[id])
		vp.queue_free()


func _build_viewport(id: String) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = Vector2i(W, H)
	vp.own_world_3d = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	add_child(vp)

	# Background = the painted canvas layer (Three used the canvas as scene.background)
	var env := Environment.new()
	env.background_mode = Environment.BG_CANVAS
	env.background_canvas_max_layer = -1
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR  # HemisphereLight(0xffffff, 0x334155, 1.0)
	env.ambient_light_color = Color(0.75, 0.78, 0.82)
	env.ambient_light_energy = 0.9
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	vp.add_child(world_env)

	var back := CanvasLayer.new()
	back.layer = -1
	vp.add_child(back)
	_paint_backdrop(back, PALETTES.get(id, PALETTES.mustang))

	var front := CanvasLayer.new()
	front.layer = 1
	vp.add_child(front)
	var ticks := Control.new()
	ticks.size = Vector2(W, H)
	ticks.draw.connect(_draw_ticks.bind(ticks))
	front.add_child(ticks)

	var key := DirectionalLight3D.new()
	key.light_color = Color("fffbeb")
	key.light_energy = 1.5
	vp.add_child(key)
	key.look_at_from_position(Vector3(12, 18, 16), Vector3.ZERO, Vector3.UP)
	var rim := DirectionalLight3D.new()
	rim.light_color = Color("7dd3fc")
	rim.light_energy = 0.85
	vp.add_child(rim)
	rim.look_at_from_position(Vector3(-14, 6, -12), Vector3.ZERO, Vector3.UP)

	var pose: Dictionary = POSES.get(id, POSES.mustang)
	var model := AircraftModel.new(id)
	vp.add_child(model)
	model.set_gear(0.0)  # in-flight photo: gear up
	model.set_prop_blur(0.0)
	model.basis = Basis.from_euler(pose.rot, EULER_ORDER_XYZ)

	var cam := Camera3D.new()
	cam.fov = 34.0
	cam.near = 0.5
	cam.far = 200.0
	vp.add_child(cam)
	cam.look_at_from_position(pose.cam, Vector3(0, 0.1, 0), Vector3.UP)
	cam.current = true
	return vp


# Sky gradient, sea gradient below the horizon, sun glow, soft clouds
func _paint_backdrop(layer: CanvasLayer, pal: Dictionary) -> void:
	layer.add_child(_gradient_rect(Rect2(0, 0, W, 195), [0.0, 0.6, 1.0],
			[Color(pal.top), Color(pal.mid), Color(pal.horizon)]))
	layer.add_child(_gradient_rect(Rect2(0, 190, W, 70), [0.0, 0.25, 1.0],
			[Color(pal.horizon), Color(pal.sea), Color("09111e")]))

	var sun_grad := Gradient.new()
	sun_grad.offsets = PackedFloat32Array([0.0, 0.25, 1.0])
	sun_grad.colors = PackedColorArray([Color.WHITE, pal.sun_color, Color(1, 1, 1, 0)])
	var sun_tex := GradientTexture2D.new()
	sun_tex.gradient = sun_grad
	sun_tex.fill = GradientTexture2D.FILL_RADIAL
	sun_tex.fill_from = Vector2(0.5, 0.5)
	sun_tex.fill_to = Vector2(1.0, 0.5)
	sun_tex.width = 190
	sun_tex.height = 190
	var sun := TextureRect.new()
	sun.texture = sun_tex
	sun.position = (pal.sun as Vector2) - Vector2(95, 95)
	sun.size = Vector2(190, 190)
	layer.add_child(sun)

	var clouds := Control.new()
	clouds.size = Vector2(W, H)
	clouds.draw.connect(func() -> void:
		for c in CLOUD_PUFFS:
			clouds.draw_circle(Vector2(c.x, c.y), c.z, Color(1, 1, 1, 0.22)))
	layer.add_child(clouds)


func _gradient_rect(rect: Rect2, offsets: Array, colors: Array) -> TextureRect:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array(offsets)
	g.colors = PackedColorArray(colors)
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill_from = Vector2(0, 0)
	tex.fill_to = Vector2(0, 1)  # vertical
	tex.width = 4
	tex.height = 128
	var tr := TextureRect.new()
	tr.texture = tex
	tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tr.stretch_mode = TextureRect.STRETCH_SCALE
	tr.position = rect.position
	tr.size = rect.size
	return tr


# Reconnaissance-camera corner ticks
func _draw_ticks(c: Control) -> void:
	var col := Color(1, 1, 1, 0.35)
	var m := 8.0
	var l := 12.0
	for corner in [[Vector2(m, m), Vector2(1, 1)], [Vector2(W - m, m), Vector2(-1, 1)],
			[Vector2(m, H - m), Vector2(1, -1)], [Vector2(W - m, H - m), Vector2(-1, -1)]]:
		var p: Vector2 = corner[0]
		var d: Vector2 = corner[1]
		c.draw_polyline(PackedVector2Array([p + Vector2(0, d.y * l), p, p + Vector2(d.x * l, 0)]), col, 1.5)
