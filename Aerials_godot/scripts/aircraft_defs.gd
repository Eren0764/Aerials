class_name AircraftDefs
extends RefCounted
## Aircraft performance table, ported from STAT_TIER_VALUES / AIRCRAFT_DEFS / applyStatTiers in game.js.
## Every plane rates 0..4 on agility, speed, damage, health; raw values come from the tier table.
## hardpoints = local gun muzzles (+Z nose); weapons = gun ballistics. Bomb racks / models come later.

const TIER := {
	#                     tier:  0      1      2      3      4
	"cruise_airspeed":   [300.0, 380.0, 460.0, 540.0, 620.0],  # km/h at 100% throttle
	"max_airspeed":      [380.0, 470.0, 560.0, 650.0, 740.0],  # km/h at 110% WEP
	"arcade_roll_rate":  [1.10, 1.70, 2.30, 3.00, 3.70],       # rad/s
	"arcade_pitch_rate": [0.50, 0.80, 1.10, 1.50, 1.90],       # rad/s
	"arcade_yaw_rate":   [0.30, 0.44, 0.58, 0.78, 0.98],       # rad/s
	"damage_per_shot":   [5.0, 9.0, 14.0, 22.0, 32.0],         # HP per hit
	"max_hp":            [50.0, 80.0, 120.0, 180.0, 270.0],
}

const ORDER := ["mustang", "zero", "bf109", "il2", "spitfire", "sm79"]

const BASE := {
	"takeoff_speed": 120.0,  # km/h
	"stall_speed": 95.0,     # km/h
	"cam_dist": 15.0,
	"cam_height": 3.7,
	"cockpit_offset": Vector3(0, 0.90, 0.15),
	"cooling_bonus": false,  # Italian cooling: 13 s WEP / 10 s cooldown, barrels shed heat 1.5x faster
	"hardpoints": [Vector3(0, 0, 3.5)],
	"weapons": {"muzzle_velocity": 780.0, "fire_rate_rpm": 750.0, "tracer_color": Color("ffb703"),
		"tracer_length": 18.0, "convergence_distance": 600.0, "heat_per_shot": 0.008},
	# Belly rack slots in reverse drop order (the last entry is released first)
	"bomb_rack": [Vector3(0.32, -0.54, 0.38), Vector3(-0.32, -0.54, 0.38)],
}

const DEFS := {
	"mustang": {"name": "P-51D Mustang", "short_name": "P-51 MUSTANG",
		"stats": {"agility": 2, "speed": 4, "damage": 2, "health": 2},
		"cam_dist": 15.0, "cam_height": 3.7, "cockpit_offset": Vector3(0, 0.90, 0.15),
		"hardpoints": [Vector3(-1.85, -0.22, 1.45), Vector3(1.85, -0.22, 1.45), Vector3(-2.15, -0.20, 1.40), Vector3(2.15, -0.20, 1.40)],
		"weapons": {"muzzle_velocity": 820.0, "fire_rate_rpm": 780.0, "tracer_color": Color("ffb703"),
			"tracer_length": 18.0, "convergence_distance": 600.0, "heat_per_shot": 0.008}},
	"zero": {"name": "Mitsubishi A6M2 Zero", "short_name": "A6M2 ZERO",
		"stats": {"agility": 4, "speed": 2, "damage": 2, "health": 2},
		"takeoff_speed": 105.0, "stall_speed": 82.0,
		"cam_dist": 14.8, "cam_height": 3.6, "cockpit_offset": Vector3(0, 0.88, 0.35),
		"hardpoints": [Vector3(-0.22, 0.48, 3.65), Vector3(0.22, 0.48, 3.65), Vector3(-2.25, -0.24, 1.65), Vector3(2.25, -0.24, 1.65)],
		"weapons": {"muzzle_velocity": 750.0, "fire_rate_rpm": 750.0, "tracer_color": Color("fde047"),
			"tracer_length": 17.0, "convergence_distance": 600.0, "heat_per_shot": 0.008}},
	"bf109": {"name": "Messerschmitt Bf 109", "short_name": "BF 109 \"YELLOW 14\"",
		"stats": {"agility": 2, "speed": 2, "damage": 4, "health": 2},
		"cam_dist": 14.6, "cam_height": 3.6, "cockpit_offset": Vector3(0, 0.86, 0.35),
		"hardpoints": [Vector3(-0.18, 0.48, 3.55), Vector3(0.18, 0.48, 3.55), Vector3(-2.10, -0.26, 1.50), Vector3(2.10, -0.26, 1.50)],
		"weapons": {"muzzle_velocity": 785.0, "fire_rate_rpm": 750.0, "tracer_color": Color("ff5500"),
			"tracer_length": 20.0, "convergence_distance": 600.0, "heat_per_shot": 0.009}},
	"il2": {"name": "Ilyushin Il-2 Sturmovik", "short_name": "IL-2 STURMOVIK",
		"stats": {"agility": 2, "speed": 2, "damage": 2, "health": 4},
		"cam_dist": 16.5, "cam_height": 4.1, "cockpit_offset": Vector3(0, 0.96, 0.45),
		"hardpoints": [Vector3(-2.45, -0.28, 1.85), Vector3(2.45, -0.28, 1.85), Vector3(-3.10, -0.26, 1.55), Vector3(3.10, -0.26, 1.55)],
		"weapons": {"muzzle_velocity": 770.0, "fire_rate_rpm": 750.0, "tracer_color": Color("ff9f1c"),
			"tracer_length": 18.0, "convergence_distance": 600.0, "heat_per_shot": 0.008}},
	"spitfire": {"name": "Supermarine Spitfire Mk I", "short_name": "SPITFIRE MK I",
		"stats": {"agility": 3, "speed": 3, "damage": 3, "health": 2},
		"cam_dist": 15.0, "cam_height": 3.7, "cockpit_offset": Vector3(0, 0.84, -0.05),
		"hardpoints": [Vector3(-1.95, -0.20, 1.30), Vector3(1.95, -0.20, 1.30), Vector3(-2.60, -0.17, 1.20), Vector3(2.60, -0.17, 1.20)],
		"weapons": {"muzzle_velocity": 810.0, "fire_rate_rpm": 780.0, "tracer_color": Color("fef08a"),
			"tracer_length": 17.0, "convergence_distance": 600.0, "heat_per_shot": 0.008}},
	"sm79": {"name": "Savoia-Marchetti SM.79 Sparviero", "short_name": "SM.79 SPARVIERO",
		"stats": {"agility": 1, "speed": 1, "damage": 1, "health": 4},
		"cam_dist": 22.0, "cam_height": 5.2, "cockpit_offset": Vector3(0, 1.32, 1.85),
		"hardpoints": [Vector3(-0.05, 1.55, 2.4), Vector3(0.05, 1.55, 2.4), Vector3(-0.05, 1.55, 2.4), Vector3(0.05, 1.55, 2.4)],
		"weapons": {"muzzle_velocity": 765.0, "fire_rate_rpm": 700.0, "tracer_color": Color("fde68a"),
			"tracer_length": 18.0, "convergence_distance": 600.0, "heat_per_shot": 0.008},
		# Swivelling 12.7mm Breda behind the hump; fires on hostiles behind / above / beside (never dead ahead or below)
		"dorsal_gunner": {"mount": Vector3(0, 1.36, -2.3), "range": 850.0, "rpm": 520.0, "spread": 0.016,
			"burst_on": 0.9, "burst_off": 0.6},
		# 6 bombs: two rows of three beside the ventral gondola
		"bomb_rack": [Vector3(0.55, -0.85, 2.4), Vector3(-0.55, -0.85, 2.4), Vector3(0.55, -0.85, 0.9),
			Vector3(-0.55, -0.85, 0.9), Vector3(0.55, -0.85, -0.6), Vector3(-0.55, -0.85, -0.6)]},
}


## Resolved definition: BASE defaults + plane overrides + tier values (applyStatTiers)
static func get_def(id: String) -> Dictionary:
	if not DEFS.has(id):
		id = "mustang"
	var def: Dictionary = BASE.duplicate()
	def.merge(DEFS[id], true)
	def.id = id
	var s: Dictionary = def.stats
	def.cruise_airspeed = TIER.cruise_airspeed[_tier(s.speed)]
	def.max_airspeed = TIER.max_airspeed[_tier(s.speed)]
	def.arcade_roll_rate = TIER.arcade_roll_rate[_tier(s.agility)]
	def.arcade_pitch_rate = TIER.arcade_pitch_rate[_tier(s.agility)]
	def.arcade_yaw_rate = TIER.arcade_yaw_rate[_tier(s.agility)]
	def.damage_per_shot = TIER.damage_per_shot[_tier(s.damage)]
	def.max_hp = TIER.max_hp[_tier(s.health)]
	return def


static func _tier(t) -> int:
	return clampi(roundi(t), 0, 4)
