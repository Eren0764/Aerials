class_name EnemyDirector
extends Node
## Enemy squadrons, ported from initEnemyPlanes() (classic mode) and the team-coordination half of
## updateEnemyPlanes() in game.js:
##   - one single-type team per enemy airfield, drawn at random from 6 squadron configs;
##   - every team is its own side: they attack the player AND each other;
##   - at most 2 attackers per target; a lone attacker pulls its partner in first;
##   - the closest ready team inside 2.6 km engages; attackers break off beyond 3.6 km.

signal banner(text: String, is_kill: bool)
signal player_hit(is_kill: bool)  # HUD hit marker

const MAX_CONCURRENT_ATTACKERS := 2
const DETECT_DIST := 2600.0
const DISENGAGE_DIST := 3600.0
const TEAM_SIZE_MIN := 1
const TEAM_SIZE_MAX := 4

# Patrol pattern, altitude, cruise speed and bank per team (squadronTeamConfigs)
const SQUADRONS := [
	{"team_id": "team_mustang", "plane_id": "mustang", "pattern": "orbit", "alt": 550.0, "radius": 2800.0,
	 "dir": 1.0, "phase": 0.0, "speed_kmh": 400.0, "bank_angle": 0.35},
	{"team_id": "team_zero", "plane_id": "zero", "pattern": "figure8", "alt": 420.0, "radius": 1800.0,
	 "dir": 1.0, "phase": 1.5, "speed_kmh": 280.0, "bank_angle": 0.55},
	{"team_id": "team_bf109", "plane_id": "bf109", "pattern": "orbit", "alt": 560.0, "radius": 1800.0,
	 "dir": -1.0, "phase": 3.1, "speed_kmh": 280.0, "bank_angle": -0.40},
	{"team_id": "team_il2", "plane_id": "il2", "pattern": "orbit", "alt": 380.0, "radius": 1700.0,
	 "dir": 1.0, "phase": 4.7, "speed_kmh": 270.0, "bank_angle": 0.30},
	{"team_id": "team_spitfire", "plane_id": "spitfire", "pattern": "figure8", "alt": 500.0, "radius": 1900.0,
	 "dir": -1.0, "phase": 2.4, "speed_kmh": 340.0, "bank_angle": -0.45},
	{"team_id": "team_sm79", "plane_id": "sm79", "pattern": "orbit", "alt": 650.0, "radius": 2200.0,
	 "dir": 1.0, "phase": 5.5, "speed_kmh": 230.0, "bank_angle": 0.25},
]

# shortcut: one flat paint per type so teams are told apart until real models / markings exist
const PAINT := {
	"mustang": Color(0.62, 0.64, 0.66), "zero": Color(0.78, 0.76, 0.66), "bf109": Color(0.36, 0.40, 0.42),
	"il2": Color(0.30, 0.36, 0.22), "spitfire": Color(0.42, 0.40, 0.30), "sm79": Color(0.64, 0.56, 0.38),
}

var team_size := 2
var player: PlayerAircraft
var allies: Array[FriendlyPlane] = []  # wingman #2 + escorts: targets too
var planes: Array[EnemyPlane] = []
var teams: Array[Dictionary] = []  # {team_id, plane_id, members: Array[EnemyPlane]}
var sortie_kills := 0


func _ready() -> void:
	process_priority = -1  # decide who attacks whom before the planes fly this frame


## One random team per enemy airfield, lined up on its runway (initEnemyPlanes)
func spawn_squadrons(enemy_bases: Array[int]) -> void:
	var configs := SQUADRONS.duplicate(true)
	configs.shuffle()
	configs.resize(mini(configs.size(), enemy_bases.size()))
	var size := clampi(team_size, TEAM_SIZE_MIN, TEAM_SIZE_MAX)

	for t_idx in configs.size():
		var cfg: Dictionary = configs[t_idx]
		var base := enemy_bases[t_idx]
		var home: Dictionary = World.airports[base]
		# Patrol around its own island: centre pulled toward mid-map, kept inside the theatre
		cfg.center_x = clampf(home.x * 0.7, World.MIN_X + cfg.radius + 300.0, World.MAX_X - cfg.radius - 300.0)
		cfg.center_z = clampf(home.z * 0.7, World.MIN_Z + cfg.radius + 300.0, World.MAX_Z - cfg.radius - 300.0)

		var members: Array[EnemyPlane] = []
		for m in size:
			var ep := EnemyPlane.new()
			ep.setup(cfg, m, size, base, PAINT.get(cfg.plane_id, Color.GRAY))
			ep.director = self
			add_child(ep)
			ep.banner.connect(func(text: String, kill: bool) -> void: banner.emit(text, kill))
			ep.hit_by_player.connect(_on_player_hit)
			members.append(ep)
			planes.append(ep)

		# Wingmen follow the lead; the lead's partner is the first wingman
		for k in range(1, members.size()):
			members[k].partner = members[0]
		members[0].partner = members[1] if members.size() > 1 else null
		home.side_key = cfg.team_id
		teams.append({"team_id": cfg.team_id, "plane_id": cfg.plane_id, "members": members})

		for ep in members:
			ep.assign_home_airbase()


func _process(_delta: float) -> void:
	# 1. Break off attacks on targets that are gone, landed-and-unengageable, or too far
	for ep in planes:
		if ep.is_alive and ep.ai_state == "attack":
			var info := _info(ep.attack_target)
			if info.is_empty() or not info.engageable or ep.position.distance_to(info.pos) > DISENGAGE_DIST:
				ep.enter_patrol_state()

	# 2. Targets: the player, plus every flying AI plane (teams hunt each other too)
	var targets: Array[Node3D] = []
	if player:
		targets.append(player)
	for ally in allies:
		targets.append(ally)
	for t in planes:
		if t.is_alive and not t.is_dying and t.ai_state != "takeoff":
			targets.append(t)

	for target in targets:
		var info := _info(target)
		if info.is_empty() or not info.engageable:
			continue
		var tgt_pos: Vector3 = info.pos

		var attackers: Array[EnemyPlane] = []
		for e in planes:
			if e.is_alive and e.ai_state == "attack" and e.attack_target == target:
				attackers.append(e)

		# Too many on one target: send the farthest back to patrol
		if attackers.size() > MAX_CONCURRENT_ATTACKERS:
			attackers.sort_custom(func(a, b): return a.position.distance_to(tgt_pos) < b.position.distance_to(tgt_pos))
			for k in range(MAX_CONCURRENT_ATTACKERS, attackers.size()):
				attackers[k].enter_patrol_state()
			attackers.resize(MAX_CONCURRENT_ATTACKERS)

		# A lone attacker brings its partner in so the pair fights together
		if attackers.size() == 1:
			var partner := attackers[0].partner
			if partner and partner.is_alive and _can_engage(partner) \
					and partner.position.distance_to(tgt_pos) <= DISENGAGE_DIST:
				_engage(partner, target)
				attackers.append(partner)

		if attackers.size() >= MAX_CONCURRENT_ATTACKERS:
			continue

		# Slot open: the closest ready team inside detection range engages
		var candidates: Array[Dictionary] = []
		for team in teams:
			if team.team_id == info.side:
				continue  # never attack its own side
			var best := INF
			var ready: Array[EnemyPlane] = []
			for m in team.members:
				if not m.is_alive or m.ai_state == "attack" or not _can_engage(m):
					continue
				best = minf(best, m.position.distance_to(tgt_pos))
				ready.append(m)
			if not ready.is_empty() and best <= DETECT_DIST:
				candidates.append({"team": team, "ready": ready, "dist": best})
		if candidates.is_empty():
			continue
		candidates.sort_custom(func(a, b): return a.dist < b.dist)

		var chosen: Dictionary = candidates[0]
		for m in chosen.ready:
			if attackers.size() >= MAX_CONCURRENT_ATTACKERS:
				break
			_engage(m, target)
			attackers.append(m)
		if target == player or target is FriendlyPlane:
			var def := AircraftDefs.get_def(chosen.team.plane_id)
			banner.emit(("2-PLANE %s ELEMENT DETECTED YOU & IS ATTACKING! (%d/2 ENGAGED)" if target == player
					else "2-PLANE %s ELEMENT IS ATTACKING YOUR WINGMAN! (%d/2 ENGAGED)") % [def.short_name, attackers.size()], false)


func _on_player_hit(is_kill: bool) -> void:
	if is_kill:
		sortie_kills += 1
	player_hit.emit(is_kill)


func _info(target: Node3D) -> Dictionary:
	if not is_instance_valid(target):
		return {}
	return target.get_target_info()


# Ready = patrolling, or climbing out and already above 110 m
func _can_engage(ep: EnemyPlane) -> bool:
	return ep.ai_state == "patrol" or (ep.ai_state == "climb" and ep.position.y > 110.0)


func _engage(ep: EnemyPlane, target: Node3D) -> void:
	ep.ai_state = "attack"
	ep.attack_target = target
	ep.break_off_timer = 0.0
