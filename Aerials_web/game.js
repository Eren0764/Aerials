/**
 * Air Combat - Three.js Flight Simulator
 * Pure Vanilla JavaScript & Three.js (No external build tools or dev server required)
 */

(function () {
  'use strict';

  // --- Configuration & Constants ---
  const MAP_SCALE = 4.0; // 4x Linear Scale Expansion (17.76 km x 12.36 km theater, identical geography)

  const CONFIG = {
    worldWidth: 4440 * MAP_SCALE,   // 17,760 m (17.76 km)
    worldLength: 3090 * MAP_SCALE,  // 12,360 m (12.36 km)
    worldSize: 4440 * MAP_SCALE,    // 17,760 m
    minX: -2220 * MAP_SCALE,        // -8,880 m
    maxX: 2220 * MAP_SCALE,         // +8,880 m
    minZ: -1545 * MAP_SCALE,        // -6,180 m
    maxZ: 1545 * MAP_SCALE,         // +6,180 m
    seaLevel: 0,
    airfieldElevation: 10,
    runwayLength: 650,
    runwayWidth: 48,
    cruiseAirspeed: 420,    // km/h (100% throttle)
    maxAirspeed: 530,       // km/h (WEP 110%)
    minAirspeed: 0,
    takeoffSpeed: 110,      // km/h
    stallSpeed: 80,         // km/h
    gravity: 9.81 * 2.0,
    maxAltitude: 2800,
    // WWII Realistic Flight Agility Dynamics
    arcadeRollRate: 2.30,   // rad/s (~132 deg/s realistic aileron roll)
    arcadePitchRate: 1.10,  // rad/s (~63 deg/s realistic elevator pitch turn)
    arcadeYawRate: 0.58,    // rad/s (~33 deg/s realistic rudder yaw)
    mouseSensitivity: 0.0022,
  };

  // --- Game State ---
  const state = {
    selectedAircraft: 'mustang', // 'mustang', 'zero', 'bf109', 'il2', 'spitfire', 'sm79'
    pilotName: 'MAVERICK',       // Pilot Callsign chosen on Main Menu
    teamSize: 2,                 // Planes per enemy team (1-4), chosen on Main Menu only
    gameMode: 'classic',         // 'classic' or 'factions' (chosen on the first Main Menu screen)
    menuScreen: 'modes',         // Main Menu screen: 'modes' | 'classic' | 'factions'
    classicAircraft: 'mustang',  // Remembered Classic selection while browsing the other mode
    factionNation: 'usa',        // Factions: the player's nation
    factionRole: 'fighter',      // Factions: 'fighter' | 'heavy' | 'bomber'
    inMainMenu: true,            // True while on Main Menu (no aircraft spawned yet)
    gameStarted: false,          // Plane selection permitted ONLY at start before takeoff
    isPaused: false,             // True when ESC is pressed during flight (freezes entire game)
    lastPauseTime: 0,            // Timestamp to debounce double-toggle between pointerlockchange and keydown
    currentAirfield: 0,          // Player team's home base (0: North, 1: NE, 2: West, 3: SE), rolled per game
    enemyHomeAirfields: [],      // Remaining bases, dealt to enemy teams as fixed home bases
    playerHp: 120,
    playerMaxHp: 120,
    aircraftLives: { mustang: 3, zero: 3, bf109: 3, il2: 3, spitfire: 3, sm79: 3 },
    maxLivesPerPlane: 3,
    isFlyingWingman: false,      // True when player has taken over Wingman #2
    isDefeated: false,           // True when all lives are lost and squadron is eliminated (Defeat)
    sortieKills: 0,              // Track hostiles shot down in current sortie
    showLeadIndicator: true,     // Toggle with 'L' key
    isCrashed: false,
    cameraMode: 'chase', // 'chase', 'cockpit', 'flyby'
    invertPitch: false,
    soundEnabled: true,
    audioInitialized: false,
    isPointerLocked: false,

    // War Thunder Mouse Aim
    mouseAim: {
      yaw: 0,               // radians in world space
      pitch: 0,             // radians in world space
      direction: new THREE.Vector3(0, 0, 1),
    },

    // Free Look System (Hold C or RMB)
    freeLook: {
      active: false,
      yaw: 0,
      pitch: 0,
    },

    // Flaps mode ('raised' or 'combat')
    flaps: 'raised',

    // Retractable Landing Gear system
    gear: {
      position: 1.0,        // 1.0 = fully down/extended, 0.0 = fully up/retracted
      target: 1.0,          // 1.0 (down) or 0.0 (up)
      transitionSpeed: 0.50 // Transit speed (~2.0 seconds full cycle)
    },

    // Flight control inputs & manual overrides
    inputs: {
      fire: false,          // LMB / Space (machine guns)
      pitchUp: false,       // S / Down (pull up)
      pitchDown: false,     // W / Up (push down)
      rollLeft: false,      // A / Left
      rollRight: false,     // D / Right
      yawLeft: false,       // Q
      yawRight: false,      // E
      throttleUp: false,    // Shift
      throttleDown: false,  // Ctrl
      freeLook: false,      // Hold C
      zoom: false,          // RMB / Hold Z (Target Gunsight Zoom)
    },

    // Flight dynamics variables
    flight: {
      throttle: 0.35,        // 0.0 to 1.10 (1.10 = WEP)
      isWEP: false,
      wep: {
        maxDuration: 10.0,    // Maximum continuous WEP duration in seconds
        durationLeft: 10.0,   // Remaining active WEP duration
        cooldownMax: 15.0,    // Medium cooldown duration in seconds
        cooldownTimer: 0.0,   // Active cooldown timer countdown
        isCooling: false      // True while WEP is on cooldown and locked out
      },
      airspeed: 0,           // km/h
      pitch: 0,              // radians
      roll: 0,               // radians
      yaw: 0,                // radians
      velocity: new THREE.Vector3(0, 0, 0),
      verticalSpeed: 0,      // m/s
      altitudeMSL: 0,        // m
      altitudeAGL: 0,        // m
      isOnGround: true,
      stallWarning: false,
      pullUpWarning: false,
      gearWarning: false,
      landingOverspeedWarning: false,
      maxLandingSpeed: 185,
      instructorActive: true,
      gLoad: 1.0,            // G-force load factor
      turnIntensity: 0.0,    // Normalized turn rate
    },

    // Airfield Rearm & Repair servicing state
    airfieldWaitTimer: 0.0,
    servicedAtAirfield: -1,
    needsAirfieldService: false,

    // Weapon recoil & camera shake feedback (Milestone 2)
    cameraRecoil: {
      intensity: 0.0,
      time: 0.0
    },

    // Weapon thermal state, convergence, & burst control (Milestone 3)
    weapons: {
      heat: 0.0,              // 0.0 (ambient) to 1.0 (overheated/jammed)
      isJammed: false,        // true when heat reaches 1.0; cleared when cooled below 0.30
      jamClickTimer: 0.0,     // cadence timer for dry clicks while jammed
      convergenceDist: 600,   // standard 600m gun harmonization distance (matches reticle projection)
    },

    // Bomb ordnance payload (Only rearmed at airfields)
    bombs: {
      count: 2,               // Current loaded bombs
      maxCount: 2,            // Max bomb capacity
      dropCooldown: 0.0,      // Prevents accidental multi-drop
      cooldownTime: 0.45,     // Seconds between releases
    }
  };

  // Runway sizes per game mode: Factions flies bigger aircraft (twin-engine heavies, bombers), so its runways are
  // longer and wider. The terrain plateau under every airfield is always flattened for the larger size.
  const AIRFIELD_SIZES = {
    classic:  { length: 650, width: 48 },
    factions: { length: 900, width: 64 }
  };

  // --- 4 Operational Airfields (Exact Spots of Black Lines in Photo, Scaled 4x) ---
  const AIRPORTS = [
    {
      id: 'north',
      name: 'North Desert Airfield',
      code: 'AF1',
      island: 'North Sand Island',
      x: -832.5 * MAP_SCALE,
      z: -1350 * MAP_SCALE,
      elevation: CONFIG.airfieldElevation,
      headingDeg: 0,
      headingRad: 0, // Vertical runway (N-S along Z)
      length: 650,
      width: 48,
      spawnX: -832.5 * MAP_SCALE,
      spawnZ: -1350 * MAP_SCALE - 220,
      spawnHeading: 0,
      team: 'friendly',
    },
    {
      id: 'northeast',
      name: 'NE Coastal Wing',
      code: 'AF2',
      island: 'Northeast Hook Island',
      x: 1702.5 * MAP_SCALE,
      z: -1080 * MAP_SCALE,
      elevation: CONFIG.airfieldElevation,
      headingDeg: 90,
      headingRad: Math.PI / 2, // Horizontal runway (E-W along X)
      length: 650,
      width: 48,
      spawnX: 1702.5 * MAP_SCALE - 220,
      spawnZ: -1080 * MAP_SCALE,
      spawnHeading: 90,
      team: 'enemy',
    },
    {
      id: 'west',
      name: 'West Emerald Outpost',
      code: 'AF3',
      island: 'West Crescent Island',
      x: -1492.5 * MAP_SCALE,
      z: 352.5 * MAP_SCALE,
      elevation: CONFIG.airfieldElevation,
      headingDeg: 90,
      headingRad: Math.PI / 2, // Horizontal runway (E-W along X)
      length: 650,
      width: 48,
      spawnX: -1492.5 * MAP_SCALE - 220,
      spawnZ: 352.5 * MAP_SCALE,
      spawnHeading: 90,
      team: 'enemy',
    },
    {
      id: 'southeast',
      name: 'SE Fortress Base',
      code: 'AF4',
      island: 'Southeast Rocky Island',
      x: 1267.5 * MAP_SCALE,
      z: 1117.5 * MAP_SCALE,
      elevation: CONFIG.airfieldElevation,
      headingDeg: 90,
      headingRad: Math.PI / 2, // Horizontal runway (E-W along X)
      length: 650,
      width: 48,
      spawnX: 1267.5 * MAP_SCALE - 220,
      spawnZ: 1117.5 * MAP_SCALE,
      spawnHeading: 90,
      team: 'enemy',
    }
  ];

  // --- Harbor Docks across the Archipelago (including the 2 piers above AF4, Scaled 4x) ---
  const DOCKS = [
    {
      id: 'dock_north',
      name: 'North Desert Supply Port',
      x: -270 * MAP_SCALE,
      z: -465 * MAP_SCALE,
      pierLength: 160,
      pierWidth: 18,
      angle: 0, // Extends South (+Z) into bay
      shipType: 'freighter',
    },
    {
      id: 'dock_northeast',
      name: 'NE Naval Slip',
      x: 1155 * MAP_SCALE,
      z: -570 * MAP_SCALE,
      pierLength: 160,
      pierWidth: 18,
      angle: -0.75 * Math.PI, // Extends SW into channel
      shipType: 'gunboat',
    },
    {
      id: 'dock_west',
      name: 'Emerald Cove Docks',
      x: -1095 * MAP_SCALE,
      z: 705 * MAP_SCALE,
      pierLength: 160,
      pierWidth: 18,
      angle: 0.5 * Math.PI, // Extends East (+X) into lagoon
      shipType: 'steamer',
    },
    {
      id: 'dock_southeast_1',
      name: 'Fortress Deepwater Pier A',
      x: 1380 * MAP_SCALE,
      z: 920 * MAP_SCALE,
      pierLength: 160,
      pierWidth: 18,
      angle: Math.PI, // Extends North (-Z) into bay (Pier 1 in photo)
      shipType: 'destroyer',
    },
    {
      id: 'dock_southeast_2',
      name: 'Fortress Deepwater Pier B',
      x: 1680 * MAP_SCALE,
      z: 920 * MAP_SCALE,
      pierLength: 160,
      pierWidth: 18,
      angle: Math.PI, // Extends North (-Z) into bay (Pier 2 in photo)
      shipType: 'gunboat',
    }
  ];

  // --- Tactical Barrage Balloon Defensive Stations (Scaled 4x) ---
  // Safely positioned on defensive bluffs and perimeter ridges clear of airfield flight corridors
  const BALLOON_CONFIGS = [
    // 1. North Airfield Defense: on western sand bluffs, 580m west of runway (completely clear of N-S flight path)
    { id: 'bb_north_base', x: -3330 - 580, z: -5400, cableAlt: 340, yaw: 0 },
    // 2. North Harbor Slip: guarding the freighter port bay
    { id: 'bb_north_dock', x: -1080 - 320, z: -1860 - 280, cableAlt: 340, yaw: Math.PI / 4 },
    // 3. NE Coastal Wing Defense: on northern coastal bluffs, 580m north of runway (completely clear of E-W flight path)
    { id: 'bb_ne_base', x: 6810, z: -4320 - 580, cableAlt: 340, yaw: Math.PI },
    // 4. NE Naval Channel: guarding the shipping narrows
    { id: 'bb_ne_channel', x: 4620 + 350, z: -2280 - 350, cableAlt: 340, yaw: -Math.PI / 4 },
    // 5. West Emerald Defense: on southern forest ridge, 550m south of runway (completely clear of E-W flight path)
    { id: 'bb_west_base', x: -5970, z: 1410 + 550, cableAlt: 340, yaw: -Math.PI / 6 },
    // 6. West Lagoon Coast: overlooking Emerald Cove
    { id: 'bb_west_coast', x: -4380 - 350, z: 2820 + 350, cableAlt: 340, yaw: Math.PI / 6 },
    // 7. SE Fortress Defense: on southern rocky cliff, 560m south of runway (completely clear of E-W flight path)
    { id: 'bb_se_base', x: 5070, z: 4470 + 560, cableAlt: 340, yaw: 0 },
    // 8. Mountain Saddle: soaring above the mountain gap between peaks
    { id: 'bb_mountain_gap', x: 1980 * MAP_SCALE - 400, z: 1380 * MAP_SCALE - 300, cableAlt: 340, yaw: Math.PI / 3 }
  ];

  // --- Tactical Anti-Air Battery Sites (nominal spots; resolvePlacementSites() moves each onto clear dry land) ---
  // dockId sites are positioned relative to their (shore-snapped) harbor instead of fixed coordinates
  const AA_SITE_CONFIGS = [
    // AF1 Friendly North Desert Airfield perimeter
    { id: 'aa_af1_1', name: 'AF1 North Perimeter Flak', x: -3330 - 240, z: -5400 - 320, team: 'friendly' },
    { id: 'aa_af1_2', name: 'AF1 South Perimeter Flak', x: -3330 + 240, z: -5400 + 320, team: 'friendly' },

    // AF2 Enemy NE Coastal Wing defenses
    { id: 'aa_af2_1', name: 'AF2 Runway Flak Battery A', x: 6810 - 360, z: -4320 - 180, team: 'enemy' },
    { id: 'aa_af2_2', name: 'AF2 Coastal Flak Battery B', x: 6810 + 360, z: -4320 + 180, team: 'enemy' },

    // AF3 Enemy West Emerald Outpost defenses
    { id: 'aa_af3_1', name: 'AF3 Forest Flak Battery A', x: -5970 - 180, z: 1410 - 360, team: 'enemy' },
    { id: 'aa_af3_2', name: 'AF3 Lagoon Flak Battery B', x: -5970 + 240, z: 1410 + 360, team: 'enemy' },

    // AF4 Enemy SE Fortress Base defenses
    { id: 'aa_af4_1', name: 'AF4 Fortress Ridge Battery', x: 5070 - 320, z: 4470 - 240, team: 'enemy' },
    { id: 'aa_af4_2', name: 'AF4 Fortress Seaward Battery', x: 5070 + 380, z: 4470 + 220, team: 'enemy' },

    // Harbor Port defenses
    { id: 'aa_port_north', name: 'Desert Supply Port AA', dockId: 'dock_north', team: 'friendly' },
    { id: 'aa_port_ne', name: 'NE Naval Slip Heavy AA', dockId: 'dock_northeast', team: 'enemy' },
    { id: 'aa_port_west', name: 'Emerald Cove Port AA', dockId: 'dock_west', team: 'enemy' },
    { id: 'aa_port_se', name: 'Fortress Deepwater Naval AA', dockId: 'dock_southeast_1', team: 'enemy' }
  ];

  // Supply roads: each airfield's apron to the landward end of its harbor pier
  const ROAD_LINKS = [
    { airfield: 'north', dock: 'dock_north' },
    { airfield: 'northeast', dock: 'dock_northeast' },
    { airfield: 'west', dock: 'dock_west' },
    { airfield: 'southeast', dock: 'dock_southeast_1' }
  ];
  const ROAD_PATHS = []; // sampled {x, z} polylines, filled by buildRoads()
  const PLACED_SITES = []; // resolved AA / balloon winch footprints {x, z, r}

  // World (x, z) <-> airfield-local frame, matching afGroup.rotation.y = headingRad
  // (local +X = apron / tower / hangar side, local Z = along the runway)
  function worldToAirfieldLocal(af, x, z) {
    const c = Math.cos(af.headingRad);
    const s = Math.sin(af.headingRad);
    const dx = x - af.x;
    const dz = z - af.z;
    return { lx: dx * c - dz * s, lz: dx * s + dz * c };
  }

  function airfieldLocalToWorld(af, lx, lz) {
    const c = Math.cos(af.headingRad);
    const s = Math.sin(af.headingRad);
    return { x: af.x + lx * c + lz * s, z: af.z - lx * s + lz * c };
  }

  // Spatial Clearance Helpers: Ensure no objects, buildings, trees, or terrain collide
  function isInsideAirfieldCompound(x, z, margin = 45) {
    for (let i = 0; i < AIRPORTS.length; i++) {
      const af = AIRPORTS[i];
      const loc = worldToAirfieldLocal(af, x, z);
      const locX = loc.lx;
      const locZ = loc.lz;

      const minX = -af.width / 2 - margin;
      const maxX = 185 + margin;
      const minZ = -af.length / 2 - margin;
      const maxZ = af.length / 2 + margin;

      if (locX >= minX && locX <= maxX && locZ >= minZ && locZ <= maxZ) {
        return true;
      }
    }
    return false;
  }

  // Near a pier, its moored ships, shed or approach channel (distance to the pier centreline)
  function isNearDock(x, z, margin = 60) {
    for (let i = 0; i < DOCKS.length; i++) {
      const d = DOCKS[i];
      const ex = d.x + Math.sin(d.angle) * (d.pierLength + 40);
      const ez = d.z + Math.cos(d.angle) * (d.pierLength + 40);
      if (distToSegment(x, z, d.x, d.z, ex, ez) < 35 + margin) return true;
    }
    return false;
  }

  function isNearBalloonWinch(x, z, margin = 45) {
    for (let i = 0; i < BALLOON_CONFIGS.length; i++) {
      const b = BALLOON_CONFIGS[i];
      if (Math.hypot(x - b.x, z - b.z) < margin) return true;
    }
    return false;
  }

  function isNearRoad(x, z, margin = 20) {
    for (const path of ROAD_PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        if (x < Math.min(a.x, b.x) - margin || x > Math.max(a.x, b.x) + margin) continue;
        if (z < Math.min(a.z, b.z) - margin || z > Math.max(a.z, b.z) + margin) continue;
        if (distToSegment(x, z, a.x, a.z, b.x, b.z) < 7 + margin) return true;
      }
    }
    return false;
  }

  function isNearPlacedSite(x, z, margin = 30) {
    return PLACED_SITES.some(s => Math.hypot(x - s.x, z - s.z) < s.r + margin);
  }

  // Runway plus its take-off / landing corridors
  function isOnRunwayApproach(x, z, halfWidth = 120, overrun = 600) {
    return AIRPORTS.some(af => {
      const loc = worldToAirfieldLocal(af, x, z);
      return Math.abs(loc.lx) < halfWidth && Math.abs(loc.lz) < af.length / 2 + overrun;
    });
  }

  // Move each harbor onto a real shoreline: pier root on low dry land, pier and moored ships over water.
  // Searches outward from the nominal spot and keeps the closest valid shore point and direction.
  function placeDocksOnShore() {
    const placedDocks = [];
    for (const d of DOCKS) {
      const nomX = d.x;
      const nomZ = d.z;
      let best = null;
      const SEARCH = 1600;
      const STEP = 20;
      // Rings of increasing radius: the first valid spot is the closest one
      for (let r = 0; r <= SEARCH && !best; r += STEP) {
        const n = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / STEP));
        for (let q = 0; q < n && !best; q++) {
          const x = nomX + Math.cos((q / n) * Math.PI * 2) * r;
          const z = nomZ + Math.sin((q / n) * Math.PI * 2) * r;
          const h = getIslandHeight(x, z);
          if (h < 1.2 || h > 6) continue;
          if (isInsideAirfieldCompound(x, z, 150) || isOnRunwayApproach(x, z, 150, 450)) continue;
          if (placedDocks.some(p => Math.hypot(p.x - x, p.z - z) < 320)) continue;

          for (let k = 0; k < 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            const sx = Math.sin(a);
            const cz = Math.cos(a);
            // Cheap probes first: open water at 90 m and past the pier tip
            if (getIslandHeight(x + sx * 90, z + cz * 90) >= 0) continue;
            if (getIslandHeight(x + sx * (d.pierLength + 60), z + cz * (d.pierLength + 60)) >= 0) continue;
            if (getIslandHeight(x - sx * 40, z - cz * 40) < 1) continue; // land behind the pier root
            // The pier may cross a short beach, but must reach open water within 90 m and stay over it
            let waterAt = -1;
            for (let t = 5; t <= 90; t += 5) {
              if (getIslandHeight(x + sx * t, z + cz * t) < 0) { waterAt = t; break; }
            }
            if (waterAt < 0) continue;
            let ok = true;
            for (let t = waterAt; t <= d.pierLength + 60 && ok; t += 15) {
              if (getIslandHeight(x + sx * t, z + cz * t) >= 0) ok = false;
            }
            // Room for the moored ships on both sides of the pier
            for (let t = Math.max(50, waterAt + 20); t <= 140 && ok; t += 15) {
              for (const side of [-28, 28]) {
                if (getIslandHeight(x + sx * t + cz * side, z + cz * t - sx * side) >= 0) ok = false;
              }
            }
            if (ok) {
              best = { x, z, angle: a };
              break;
            }
          }
        }
      }
      if (best) {
        d.x = best.x;
        d.z = best.z;
        d.angle = best.angle;
      } else {
        console.warn(`[map] No valid shoreline found for ${d.id}; keeping nominal position`);
      }
      placedDocks.push({ x: d.x, z: d.z });
    }
  }

  // Turn each linked airfield 180° if needed so its apron / tower / hangars face its harbor road
  // (runway position is unchanged; only which side the buildings sit on)
  function orientAirfieldsTowardHarbors() {
    for (const link of ROAD_LINKS) {
      const af = AIRPORTS.find(a => a.id === link.airfield);
      const d = DOCKS.find(dk => dk.id === link.dock);
      if (worldToAirfieldLocal(af, d.x, d.z).lx < 0) {
        af.headingRad = (af.headingRad + Math.PI) % (Math.PI * 2);
        af.headingDeg = (af.headingDeg + 180) % 360;
      }
    }
  }

  // A site (AA battery / balloon winch) needs dry, fairly flat ground clear of everything else
  function isValidStructureSite(x, z, radius) {
    const h = getTerrainHeight(x, z);
    if (h < 3) return false;
    const slope = Math.max(
      Math.abs(getTerrainHeight(x + 12, z) - h),
      Math.abs(getTerrainHeight(x - 12, z) - h),
      Math.abs(getTerrainHeight(x, z + 12) - h),
      Math.abs(getTerrainHeight(x, z - 12) - h)
    );
    if (slope > 4.5) return false;
    if (Math.abs(x) > CONFIG.maxX - 200 || Math.abs(z) > CONFIG.maxZ - 200) return false;
    if (isInsideAirfieldCompound(x, z, 40)) return false;
    if (isOnRunwayApproach(x, z)) return false;
    if (isNearDock(x, z, 25)) return false;
    if (isNearRoad(x, z, 18)) return false;
    if (isNearPlacedSite(x, z, radius)) return false;
    return true;
  }

  function resolveSitePosition(x, z, radius) {
    if (isValidStructureSite(x, z, radius)) return { x, z };
    for (let r = 20; r <= 1200; r += 20) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 20));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (isValidStructureSite(cx, cz, radius)) return { x: cx, z: cz };
      }
    }
    console.warn('[map] No clear site found near', Math.round(x), Math.round(z));
    return { x, z };
  }

  // Resolve AA batteries and balloon winches once (after docks & roads exist, before vegetation)
  function resolvePlacementSites() {
    PLACED_SITES.length = 0;
    for (const cfg of AA_SITE_CONFIGS) {
      if (cfg.dockId) {
        const d = DOCKS.find(dk => dk.id === cfg.dockId);
        // Nominal: just inland of the pier root, off to one side
        cfg.x = d.x - Math.sin(d.angle) * 90 + Math.cos(d.angle) * 70;
        cfg.z = d.z - Math.cos(d.angle) * 90 - Math.sin(d.angle) * 70;
      }
      const p = resolveSitePosition(cfg.x, cfg.z, 40);
      cfg.x = p.x;
      cfg.z = p.z;
      PLACED_SITES.push({ x: p.x, z: p.z, r: 25 });
    }
    for (const b of BALLOON_CONFIGS) {
      const p = resolveSitePosition(b.x, b.z, 60);
      b.x = p.x;
      b.z = p.z;
      PLACED_SITES.push({ x: p.x, z: p.z, r: 25 });
    }
  }

  // Helper: Detect which airfield runway the aircraft is currently over
  function getAirfieldUnderPlane(x, z) {
    for (let i = 0; i < AIRPORTS.length; i++) {
      const af = AIRPORTS[i];
      const loc = worldToAirfieldLocal(af, x, z);
      const locX = Math.abs(loc.lx);
      const locZ = Math.abs(loc.lz);
      if (locX <= (af.width / 2 + 10) && locZ <= (af.length / 2 + 45)) {
        return i;
      }
    }
    return -1;
  }

  // --- Fixed Team Home Bases ---
  // Rolled once at the start of every game (sortie launch / retry). The player's team gets one random
  // airfield; the enemy teams share the remaining ones. Every respawn for the rest of the game uses the
  // team's own home base and nothing can change it. Destroying an enemy base ends its teams' respawns.
  // Runway length / width for the current game mode; the spawn point stays 105 m inside the runway's start
  function applyAirfieldSizes() {
    const size = isFactionsMatch() ? AIRFIELD_SIZES.factions : AIRFIELD_SIZES.classic;
    for (const af of AIRPORTS) {
      af.length = size.length;
      af.width = size.width;
      const h = THREE.MathUtils.degToRad(af.spawnHeading);
      const back = af.length / 2 - 105;
      af.spawnX = af.x - Math.sin(h) * back;
      af.spawnZ = af.z - Math.cos(h) * back;
    }
  }

  function assignRandomTeamBases() {
    // Fresh, intact airfields for the new game (undoes any base destroyed in a previous game)
    applyAirfieldSizes();
    buildAirfields();
    clearDamageSmoke();

    const order = AIRPORTS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.currentAirfield = order[0];
    state.enemyHomeAirfields = order.slice(1);
    for (let i = 0; i < AIRPORTS.length; i++) {
      AIRPORTS[i].team = (i === state.currentAirfield) ? 'friendly' : 'enemy';
      AIRPORTS[i].nationId = null; AIRPORTS[i].sideKey = (i === state.currentAirfield) ? 'player' : null;
      AIRPORTS[i].netTeam = -1; AIRPORTS[i].netColor = undefined; AIRPORTS[i].netColorCss = null;
    }
    // Factions: every base belongs to one nation (the player's own, plus one per AI nation)
    if (isFactionsMatch()) {
      AIRPORTS[state.currentAirfield].nationId = state.factionMatch.playerNation;
      state.enemyHomeAirfields.forEach((afIdx, k) => {
        AIRPORTS[afIdx].nationId = state.factionMatch.aiNations[k] || null; AIRPORTS[afIdx].sideKey = AIRPORTS[afIdx].nationId;
      });
    }

    // Flak batteries fight for whoever owns their nearest airfield
    for (const aa of aaDefenseSystems) {
      let nearest = 0;
      let best = Infinity;
      AIRPORTS.forEach((af, i) => {
        const d = Math.hypot(af.x - aa.x, af.z - aa.z);
        if (d < best) { best = d; nearest = i; }
      });
      aa.team = AIRPORTS[nearest].team === 'friendly' ? 'friendly' : 'enemy';
      aa.nationId = AIRPORTS[nearest].nationId || null; aa.sideKey = AIRPORTS[nearest].sideKey || null;
    }

    if (typeof updateAirfieldVisuals === 'function') updateAirfieldVisuals();
    updateHomeBaseButton();
  }

  function updateHomeBaseButton() {
    const af = AIRPORTS[state.currentAirfield];
    const btn = document.getElementById('btn-airfield');
    if (btn && af) btn.textContent = `Home: ${af.code} ${af.name.split(' ')[0]}`;
  }

  // --- Three.js Globals ---
  let scene, camera, renderer, dirLight = null;
  let airplaneGroup, activeModelData, activeAircraftDef, propellerMesh, leftAileron, rightAileron, elevatorMesh, rudderMesh;
  let terrainMesh, waterMesh;
  let clock = new THREE.Clock();
  let contrailParticles = [];
  let explosionParticles = [];
  let impactParticles = [];
  let tracerSmokeParticles = [];
  let muzzleLight = null;
  let muzzleFlashes = [];
  let gunNoiseBuffer = null;

  // --- Audio System (Web Audio API) ---
  let audioCtx = null;
  let engineOsc = null;
  let engineFilter = null;
  let engineGain = null;
  let windNoiseNode = null;
  let windFilter = null;
  let windGain = null;
  let warningOsc = null;
  let warningGain = null;

  function initAudio() {
    if (state.audioInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audioCtx = new AudioContext();

      // Engine Synthesizer (harmonic sawtooth + low-pass)
      engineOsc = audioCtx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.setValueAtTime(65, audioCtx.currentTime);

      engineFilter = audioCtx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.setValueAtTime(320, audioCtx.currentTime);

      engineGain = audioCtx.createGain();
      engineGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(audioCtx.destination);
      engineOsc.start();

      // Wind Rush Synthesizer (White Noise Buffer)
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      windFilter = audioCtx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.setValueAtTime(500, audioCtx.currentTime);
      windFilter.Q.setValueAtTime(1.5, audioCtx.currentTime);

      windGain = audioCtx.createGain();
      windGain.gain.setValueAtTime(0.01, audioCtx.currentTime);

      whiteNoise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(audioCtx.destination);
      whiteNoise.start();

      // Pull Up / Stall Warning Tone
      warningOsc = audioCtx.createOscillator();
      warningOsc.type = 'square';
      warningOsc.frequency.setValueAtTime(800, audioCtx.currentTime);

      warningGain = audioCtx.createGain();
      warningGain.gain.setValueAtTime(0.0, audioCtx.currentTime);

      warningOsc.connect(warningGain);
      warningGain.connect(audioCtx.destination);
      warningOsc.start();

      state.audioInitialized = true;
    } catch (e) {
      console.warn("AudioContext not supported or allowed yet", e);
    }
  }

  // --- Multi-Layered Gunfire Audio Synthesizer (Milestone 2) ---
  function getGunNoiseBuffer() {
    if (!audioCtx) return null;
    if (!gunNoiseBuffer) {
      const size = Math.floor(audioCtx.sampleRate * 0.25);
      gunNoiseBuffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
      const data = gunNoiseBuffer.getChannelData(0);
      for (let i = 0; i < size; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.05));
      }
    }
    return gunNoiseBuffer;
  }

  function playGunfireSound(isHeavy) {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;

      // Layer 1: Sub-Bass Thump (Body, Weight, and Low-end Concussion)
      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(isHeavy ? 80 : 105, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + 0.06);

      const subVol = isHeavy ? 0.50 : 0.38;
      subGain.gain.setValueAtTime(subVol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      subOsc.connect(subGain);
      subGain.connect(audioCtx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.075);

      // Layer 2: Mechanical Bolt Transient Snap (High-impact metal click)
      const snapOsc = audioCtx.createOscillator();
      const snapGain = audioCtx.createGain();
      snapOsc.type = 'triangle';
      snapOsc.frequency.setValueAtTime(isHeavy ? 700 : 920, now);
      snapOsc.frequency.exponentialRampToValueAtTime(55, now + 0.025);

      snapGain.gain.setValueAtTime(0.32, now);
      snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      snapOsc.connect(snapGain);
      snapGain.connect(audioCtx.destination);
      snapOsc.start(now);
      snapOsc.stop(now + 0.03);

      // Layer 3: Gunpowder Detonation Blast (Shaped Bandpass Noise Crack)
      const nBuf = getGunNoiseBuffer();
      if (nBuf) {
        const noise = audioCtx.createBufferSource();
        noise.buffer = nBuf;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        // 12.7mm Breda has deeper concussive bark (~1050 Hz), 7.92mm MG 15 has snappier crack (~1500 Hz)
        noiseFilter.frequency.setValueAtTime(isHeavy ? 1050 : 1500, now);
        noiseFilter.Q.setValueAtTime(isHeavy ? 1.5 : 2.0, now);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(isHeavy ? 0.60 : 0.48, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(now);
        noise.stop(now + 0.07);
      }
    } catch (e) {
      // AudioContext policy or state error safeguard
    }
  }

  // Milestone 3: Dry mechanical bolt click when gun jams or trigger held on jammed gun
  function playGunJamClickSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      const clickOsc = audioCtx.createOscillator();
      const clickGain = audioCtx.createGain();
      clickOsc.type = 'square';
      clickOsc.frequency.setValueAtTime(360, now);
      clickOsc.frequency.exponentialRampToValueAtTime(70, now + 0.024);

      clickGain.gain.setValueAtTime(0.24, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);

      clickOsc.connect(clickGain);
      clickGain.connect(audioCtx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.028);
    } catch (e) {}
  }

  // Combat Target Hit Sound (Puncture thwack on canvas gas cell)
  function playTargetHitSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      const hitOsc = audioCtx.createOscillator();
      const hitGain = audioCtx.createGain();
      hitOsc.type = 'triangle';
      hitOsc.frequency.setValueAtTime(440, now);
      hitOsc.frequency.exponentialRampToValueAtTime(75, now + 0.045);

      hitGain.gain.setValueAtTime(0.40, now);
      hitGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      hitOsc.connect(hitGain);
      hitGain.connect(audioCtx.destination);
      hitOsc.start(now);
      hitOsc.stop(now + 0.052);
    } catch (e) {}
  }

  // Deep Sub-Bass Explosion Rumble Sound
  function playExplosionSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      // Sub-bass detonation thump
      const boomOsc = audioCtx.createOscillator();
      const boomGain = audioCtx.createGain();
      boomOsc.type = 'sine';
      boomOsc.frequency.setValueAtTime(120, now);
      boomOsc.frequency.exponentialRampToValueAtTime(26, now + 0.65);

      boomGain.gain.setValueAtTime(0.70, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

      boomOsc.connect(boomGain);
      boomGain.connect(audioCtx.destination);
      boomOsc.start(now);
      boomOsc.stop(now + 0.72);

      // Lowpass noise blast
      const nBuf = getGunNoiseBuffer();
      if (nBuf) {
        const noise = audioCtx.createBufferSource();
        noise.buffer = nBuf;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(500, now);
        noiseFilter.frequency.exponentialRampToValueAtTime(80, now + 0.55);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.65, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.60);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noise.start(now);
        noise.stop(now + 0.65);
      }
    } catch (e) {}
  }

  // Ground Crew Repair & Rearm Chime
  function playRepairRearmSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      // 3-note ascending major triad chime (C5=523.25, E5=659.25, G5=783.99)
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.24, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.32);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.35);
      });
    } catch (e) {}
  }

  // Mechanical Bomb Release Shackle Clack & Aerodynamic Drop Whoosh
  function playBombReleaseSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      // Mechanical latch release pop
      const clickOsc = audioCtx.createOscillator();
      const clickGain = audioCtx.createGain();
      clickOsc.type = 'square';
      clickOsc.frequency.setValueAtTime(420, now);
      clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

      clickGain.gain.setValueAtTime(0.40, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      clickOsc.connect(clickGain);
      clickGain.connect(audioCtx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.10);

      // Low rushing air separation whoosh
      const nBuf = getGunNoiseBuffer();
      if (nBuf) {
        const whooshSource = audioCtx.createBufferSource();
        whooshSource.buffer = nBuf;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 0.35);
        filter.Q.value = 1.2;

        const whooshGain = audioCtx.createGain();
        whooshGain.gain.setValueAtTime(0.35, now);
        whooshGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

        whooshSource.connect(filter);
        filter.connect(whooshGain);
        whooshGain.connect(audioCtx.destination);
        whooshSource.start(now);
        whooshSource.stop(now + 0.38);
      }
    } catch (e) {}
  }

  // Massive 500-lb Heavy High-Explosive Ground/Water Detonation
  function playBombExplosionSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      // Earth-shattering sub-bass pressure wave (85Hz ramp down to 18Hz)
      const subOsc = audioCtx.createOscillator();
      const subGain = audioCtx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(85, now);
      subOsc.frequency.exponentialRampToValueAtTime(18, now + 1.25);

      subGain.gain.setValueAtTime(0.95, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.30);

      subOsc.connect(subGain);
      subGain.connect(audioCtx.destination);
      subOsc.start(now);
      subOsc.stop(now + 1.35);

      // Long rumbling blast noise with heavy resonance
      const nBuf = getGunNoiseBuffer();
      if (nBuf) {
        const noiseSource = audioCtx.createBufferSource();
        noiseSource.buffer = nBuf;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, now);
        filter.frequency.exponentialRampToValueAtTime(55, now + 1.40);

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noiseSource.start(now);
        noiseSource.stop(now + 1.50);
      }
    } catch (e) {}
  }

  // Anti-Air Flak Cannon Bark (Flak 88 / 37mm battery report)
  function playAAFireSound() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.22);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  }

  function updateAudio(dt) {
    try {
      if (!state.audioInitialized || !audioCtx || !state.soundEnabled) {
        if (engineGain && audioCtx) engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
        if (windGain && audioCtx) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
        if (warningGain && audioCtx) warningGain.gain.setValueAtTime(0, audioCtx.currentTime);
        return;
      }

      if (state.isCrashed) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        if (windGain) windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        if (warningGain) warningGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
      }

      // Engine Pitch & Volume based on Throttle & Airspeed + WEP
      const wepBoost = state.flight.isWEP ? 28 : 0;
      const baseFreq = (activeAircraftDef && activeAircraftDef.engineFreq) ? activeAircraftDef.engineFreq : 65;
      const targetFreq = baseFreq + state.flight.throttle * 140 + (state.flight.airspeed / CONFIG.maxAirspeed) * 40 + wepBoost;
      if (engineOsc) engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
      if (engineGain) engineGain.gain.setTargetAtTime(0.04 + state.flight.throttle * 0.08 + (state.flight.isWEP ? 0.03 : 0), audioCtx.currentTime, 0.08);

      // Wind volume & frequency: intense rush during steep dives and high-G turns
      const speedRatio = state.flight.airspeed / CONFIG.maxAirspeed;
      const gBuffet = Math.max(0, ((state.flight.gLoad || 1.0) - 2.8) * 0.022);
      const windTargetGain = Math.min(0.20, speedRatio * 0.12 + gBuffet);
      if (windGain) windGain.gain.setTargetAtTime(windTargetGain, audioCtx.currentTime, 0.08);

      if (windFilter) {
        const windFreq = 420 + speedRatio * 850 + (state.flight.turnIntensity || 0) * 320;
        windFilter.frequency.setTargetAtTime(windFreq, audioCtx.currentTime, 0.08);
      }

      // Warning tone
      if (warningGain) {
        if (state.flight.pullUpWarning || state.flight.stallWarning) {
          const beep = (Math.sin(clock.getElapsedTime() * 12) > 0) ? 0.06 : 0.0;
          warningGain.gain.setTargetAtTime(beep, audioCtx.currentTime, 0.03);
        } else {
          warningGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.05);
        }
      }
    } catch (err) {
      console.warn("Audio update suppressed error:", err);
    }
  }

  // --- Segment Distance Helper ---
  function distToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 === 0) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
  }

  // --- Terrain Influence Info for the 4 Islands in User Map (Scaled 4x) ---
  function getTerrainInfo(x, z) {
    const nx = x / MAP_SCALE;
    const nz = z / MAP_SCALE;

    // Island 1: North Sand Desert (Matching px [43..214], py [0..75])
    const dx1 = (nx - (-280)) / 1200;
    const dz1 = (nz - (-1080)) / 600;
    const dNorthLobe = Math.hypot((nx - (-832.5)) / 220, (nz - (-1400)) / 240);
    const factor1 = Math.max(0, 1 - Math.min(Math.sqrt(dx1 * dx1 + dz1 * dz1), dNorthLobe));

    // Island 2: NE Hook (Matching px [215..295], py [0..70])
    const d2a = distToSegment(nx, nz, 1755, -1545, 1755, -800);
    const d2b = distToSegment(nx, nz, 1755, -800, 1155, -570);
    const factor2 = Math.max(0, 1 - Math.min(d2a, d2b) / 360);

    // Island 3: West Crescent (Matching px [0..89], py [92..205])
    const d3a = distToSegment(nx, nz, -1395, -45, -1620, 705);
    const d3b = distToSegment(nx, nz, -1620, 705, -1920, 1455);
    const factor3 = Math.max(0, 1 - Math.min(d3a, d3b) / 420);

    // Island 4: SE Rocky Island (Matching px [190..295], py [132..205])
    const d4a = distToSegment(nx, nz, 630, 1155, 1455, 1230);
    const d4b = distToSegment(nx, nz, 1455, 1230, 2130, 1455);
    const factor4 = Math.max(0, 1 - Math.min(d4a, d4b) / 420);

    // Unclamped reach of the nearest island: > 0 on land, < 0 offshore (used to slope the seabed)
    const reach = Math.max(
      1 - Math.min(Math.sqrt(dx1 * dx1 + dz1 * dz1), dNorthLobe),
      1 - Math.min(d2a, d2b) / 360,
      1 - Math.min(d3a, d3b) / 420,
      1 - Math.min(d4a, d4b) / 420
    );

    return { factor1, factor2, factor3, factor4, reach };
  }

  // --- Multi-Island Procedural Terrain Height Function (Scaled 4x) ---
  // Final ground height: natural islands + flattened airfield pads + dredged harbor basins
  function getTerrainHeight(x, z) {
    let rawH = getIslandHeight(x, z);
    if (rawH <= CONFIG.seaLevel - 18 && !isNearAirfieldOrHarbor(x, z)) return rawH;

    // Robust Airfield Compound Plateau blending:
    // Core flat zone covers runway, taxiway, apron, control tower, hangars, and perimeter (diff = 0m)
    for (let af of AIRPORTS) {
      const loc = worldToAirfieldLocal(af, x, z);
      const locX = loc.lx;
      const locZ = loc.lz;

      // Sized for the larger Factions runway so the pad fits either game mode
      const padHalfW = Math.max(af.width, AIRFIELD_SIZES.factions.width) / 2;
      const padHalfL = Math.max(af.length, AIRFIELD_SIZES.factions.length) / 2;
      const coreMinX = -padHalfW - 40;
      const coreMaxX = 185;                 // +185m (covers apron 150m, tower 130m, hangars 135m)
      const coreMinZ = -padHalfL - 40;
      const coreMaxZ = padHalfL + 40;

      const margin = 80;

      let distOutsideX = 0;
      if (locX < coreMinX) distOutsideX = coreMinX - locX;
      else if (locX > coreMaxX) distOutsideX = locX - coreMaxX;

      let distOutsideZ = 0;
      if (locZ < coreMinZ) distOutsideZ = coreMinZ - locZ;
      else if (locZ > coreMaxZ) distOutsideZ = locZ - coreMaxZ;

      if (distOutsideX < margin && distOutsideZ < margin) {
        const blendX = Math.max(0, Math.min(1, 1 - distOutsideX / margin));
        const blendZ = Math.max(0, Math.min(1, 1 - distOutsideZ / margin));
        const blend = blendX * blendZ;
        rawH = rawH * (1 - blend) + CONFIG.airfieldElevation * blend;
      }
    }

    // Dredged harbor basins (seabed -8m for ship flotation), centred over the seaward part of each pier.
    // They only ever deepen the seabed and fade out near the pier root so the shoreline stays intact.
    for (let d of DOCKS) {
      const bx = d.x + Math.sin(d.angle) * d.pierLength * 0.7;
      const bz = d.z + Math.cos(d.angle) * d.pierLength * 0.7;
      const dist = Math.hypot(x - bx, z - bz);
      const r = 170;
      if (dist < r) {
        const dRoot = Math.hypot(x - d.x, z - d.z);
        const keepShore = Math.min(1, Math.max(0, (dRoot - 30) / 50));
        const cut = (1 - dist / r) * keepShore;
        const s = cut * cut * (3 - 2 * cut);
        rawH = Math.min(rawH, rawH * (1 - s) + (-8) * s);
      }
    }

    return Math.max(CONFIG.seaLevel - 15, rawH);
  }

  function isNearAirfieldOrHarbor(x, z) {
    for (const af of AIRPORTS) {
      if (Math.hypot(x - af.x, z - af.z) < af.length / 2 + 400) return true;
    }
    for (const d of DOCKS) {
      if (Math.hypot(x - d.x, z - d.z) < d.pierLength + 250) return true;
    }
    return false;
  }

  // Natural island height only (no airfield pads or harbor dredging)
  function getIslandHeight(x, z) {
    const info = getTerrainInfo(x, z);
    const maxFactor = Math.max(info.factor1, info.factor2, info.factor3, info.factor4);

    // Seabed shelves down from just below sea level at the coast to -18m offshore (~120m wide),
    // instead of a vertical step, so the shoreline reads cleanly at any mesh resolution
    if (maxFactor <= 0) {
      const offshore = Math.min(1, -info.reach / 0.08);
      return CONFIG.seaLevel - 0.6 - 17.4 * offshore;
    }

    const nx = x / MAP_SCALE;
    const nz = z / MAP_SCALE;

    let rawH = 0;
    if (info.factor1 > 0) {
      // Island 1 (North): Sweeping Barchan Dunes, Wind Ripples & Sandstone Mesas
      // Prevailing desert wind angle (~32 degrees across dunes)
      const u = nx * 0.85 + nz * 0.52;
      const v = -nx * 0.52 + nz * 0.85;

      // 1. Primary sweeping transverse barchan dunes
      const duneWave = Math.sin(u * 0.0065 + Math.sin(v * 0.0028) * 1.6);
      const barchanDune = Math.sign(duneWave) * Math.pow(Math.abs(duneWave), 0.78) * 35;

      // 2. Secondary cross-dune ridges and undulating sand swells
      const crossRidge = Math.sin(u * 0.014 - v * 0.008) * 14 + Math.cos(u * 0.022 + v * 0.016) * 7;

      // 3. Ancient Sandstone Mesas & Table Buttes rising in the desert interior
      const mesaNoise = Math.sin(nx * 0.0042 + 1.4) * Math.cos(nz * 0.0052 + 0.8);
      const mesa = Math.max(0, Math.tanh((mesaNoise - 0.22) * 4.0)) * 65;

      // 4. Sheltered Oasis Basin
      const dOasis = Math.hypot(nx - (-450), nz - (-980));
      const oasisDepression = Math.max(0, 1 - dOasis / 160) * 18;

      const totalDesertH = (barchanDune + crossRidge + mesa + 38 - oasisDepression) * Math.pow(info.factor1, 1.22);
      rawH = Math.max(rawH, totalDesertH);
    }
    if (info.factor2 > 0) {
      // Island 2 (NE): Coastal Hills
      const hills = Math.sin(nx * 0.006) * Math.cos(nz * 0.006) * 55 + Math.sin(nx * 0.014 + 0.5) * 18;
      rawH = Math.max(rawH, (hills + 48) * Math.pow(info.factor2, 1.4));
    }
    if (info.factor3 > 0) {
      // Island 3 (West): Undulating Green Ridges
      const ridges = Math.sin(nx * 0.005 + 2.0) * Math.cos(nz * 0.006 - 1.0) * 65 + Math.sin(nx * 0.012) * 22;
      rawH = Math.max(rawH, (ridges + 50) * Math.pow(info.factor3, 1.4));
    }
    if (info.factor4 > 0) {
      // Island 4 (SE): Hills and Soaring Rocky Mountain Peak (~220m)
      const dPeak = Math.hypot(nx - 1980, nz - 1380);
      const peakBonus = Math.max(0, 1 - dPeak / 600) * 200;
      const hills = Math.sin(nx * 0.006 - 0.5) * Math.cos(nz * 0.005 + 1.2) * 48;
      rawH = Math.max(rawH, (hills + 45 + peakBonus) * Math.pow(info.factor4, 1.3));
    }

    // Dry land always sits clearly above the sea plane (avoids land/sea z-fighting on flat beaches)
    return Math.max(CONFIG.seaLevel + 0.8, rawH);
  }

  // --- Procedural Canvas Textures ---
  // Neutral micro-grain ground detail texture: provides tactile surface noise without contaminating vertex colors with green paint
  function createTerrainDetailTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Neutral light-gray base luminance (0.90)
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, 512, 512);

    // Fine surface micro-speckles (sand grain & soil noise)
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const radius = Math.random() * 1.8 + 0.6;
      const shade = Math.floor(205 + (Math.random() - 0.5) * 55);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle windblown micro-striations / sand ripples
    for (let j = 0; j < 400; j++) {
      const lx = Math.random() * 512;
      const ly = Math.random() * 512;
      const lLen = 6 + Math.random() * 16;
      const lShade = Math.floor(215 + (Math.random() - 0.5) * 40);
      ctx.strokeStyle = `rgb(${lShade},${lShade},${lShade})`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(lx + lLen, ly + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(160, 160);
    return tex;
  }

  function createRunwayTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');

    // Dark Asphalt base
    ctx.fillStyle = '#26292b';
    ctx.fillRect(0, 0, 512, 2048);

    // Subtle runway pavement texture noise
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 2048, 2, 4);
    }

    // Runway Edges
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(20, 0, 8, 2048);
    ctx.fillRect(512 - 28, 0, 8, 2048);

    // Centerline Dashes
    const dashLength = 80;
    const dashGap = 50;
    ctx.fillStyle = '#f8fafc';
    for (let y = 100; y < 1950; y += dashLength + dashGap) {
      ctx.fillRect(256 - 7, y, 14, dashLength);
    }

    // Threshold stripes (piano keys)
    const stripeWidth = 14;
    const stripeGap = 10;
    const startX = 60;
    for (let i = 0; i < 16; i++) {
      ctx.fillRect(startX + i * (stripeWidth + stripeGap), 50, stripeWidth, 90);
      ctx.fillRect(startX + i * (stripeWidth + stripeGap), 2048 - 140, stripeWidth, 90);
    }

    // Runway Numbers: "09" and "27"
    ctx.font = 'bold 72px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('09', 256, 220);
    ctx.save();
    ctx.translate(256, 1850);
    ctx.rotate(Math.PI);
    ctx.fillText('27', 0, 0);
    ctx.restore();

    // Touchdown zone markings
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(100, 320 + i * 160, 40, 70);
      ctx.fillRect(512 - 140, 320 + i * 160, 40, 70);
      ctx.fillRect(100, 2048 - (390 + i * 160), 40, 70);
      ctx.fillRect(512 - 140, 2048 - (390 + i * 160), 40, 70);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  function createRoadTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark grey asphalt
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, 0, 128, 512);

    // Road white edge lines
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 0, 4, 512);
    ctx.fillRect(128 - 10, 0, 4, 512);

    // Center dashed line
    ctx.fillStyle = '#eab308'; // Amber road line
    for (let y = 0; y < 512; y += 40) {
      ctx.fillRect(62, y, 4, 22);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 30);
    return tex;
  }

  // --- World Setup ---
  function buildScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0xa0d8ef, 0.000045);

    // Camera with 35km far plane for expansive 17.8 km theater
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1.0, 35000);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x3d5a45, 0.7);
    hemiLight.position.set(0, 1200, 0);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(1200, 2400, 1400);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 100;
    dirLight.shadow.camera.far = 6000;
    const d = 800;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    // Dynamic Muzzle Flash Point Light (Milestone 2)
    muzzleLight = new THREE.PointLight(0xffaa22, 0, 45, 1.6);
    scene.add(muzzleLight);

    // Pre-allocated Muzzle Flash Geometries (Milestone 2)
    initMuzzleFlashes();

    // Sky Dome with Sun
    buildSkyDome();

    // Ocean / Sea
    buildSea();

    // Snap harbors onto real shorelines before the terrain (and its dredged basins) is generated
    placeDocksOnShore();
    orientAirfieldsTowardHarbors();

    // Terrain & 4 Islands (Capped strictly at photo boundaries, scaled 4x)
    buildTerrain();

    // Semi-Transparent Boundaries defining the exact photo limits
    buildBoundaryWalls();

    // 4 Operational Airfields (Exact Spots of Black Lines in Photo)
    buildAirfields();

    // Harbor Docks with Moored Ships & Cranes
    buildDocks();

    // Roads
    buildRoads();

    // AA batteries & balloon winches onto clear dry ground (vegetation below keeps away from them)
    resolvePlacementSites();

    // Trees
    buildTrees();

    // Desert Island Environment (Date Palms, Oasis, Sandstone Mesas, Boulders, Dry Scrub)
    buildDesertEnvironment();

    // Clouds
    buildClouds();

    // Step 2: Historical Barrage Balloons
    initBarrageBalloons();

    // Step 3: Tactical Anti-Air Defense Systems (Flak batteries protecting bases and ports)
    initAADefenses();

    // War Thunder Arcade Bomb Target Reticle
    initBombReticle();

    // Initialize Minecraft-style hovering & spinning Main Menu background camera
    // (NOTE: No player aircraft, wingman, or enemy planes are spawned while on the Main Menu)
    initMenuPanorama();

    // Render studio 3D aerial photographs of all 4 selectable aircraft for the Main Menu cards
    generateAircraftPhotos();
  }

  // --- Minecraft-Style Hovering & Spinning Main Menu Background Camera ---
  const MENU_SCENIC_WAYPOINTS = [
    { x: -1100, z: -2600, name: 'North Island Airbase & Harbor' },
    { x: -2900, z: 320,   name: 'West Island Central Peaks' },
    { x: 3100,  z: -2100, name: 'Northeast Island Bay' },
    { x: 400,   z: -400,  name: 'Central Archipelago Channel' },
    { x: 2450,  z: 2150,  name: 'Desert Island Mesas & Oasis' },
    { x: -1750, z: 2250,  name: 'Southwest Coastal Ridge' }
  ];

  const menuPanorama = {
    x: 0,
    y: 340,
    z: 0,
    targetIdx: 0,
    lookYaw: 0,
    orbitAngle: 0,
    time: 0
  };

  function pickNextMenuWaypoint(excludeIdx) {
    if (MENU_SCENIC_WAYPOINTS.length <= 1) return 0;
    let next = Math.floor(Math.random() * MENU_SCENIC_WAYPOINTS.length);
    if (next === excludeIdx) {
      next = (next + 1 + Math.floor(Math.random() * (MENU_SCENIC_WAYPOINTS.length - 1))) % MENU_SCENIC_WAYPOINTS.length;
    }
    return next;
  }

  function initMenuPanorama() {
    const startIdx = Math.floor(Math.random() * MENU_SCENIC_WAYPOINTS.length);
    const startWp = MENU_SCENIC_WAYPOINTS[startIdx];
    menuPanorama.x = startWp.x + (Math.random() - 0.5) * 600;
    menuPanorama.z = startWp.z + (Math.random() - 0.5) * 600;
    menuPanorama.targetIdx = pickNextMenuWaypoint(startIdx);
    menuPanorama.lookYaw = Math.random() * Math.PI * 2;
    menuPanorama.orbitAngle = Math.random() * Math.PI * 2;
    menuPanorama.time = Math.random() * 100;

    const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(menuPanorama.x, menuPanorama.z));
    menuPanorama.y = Math.max(groundY + 195, 320);

    updateMenuPanoramaCamera(0.016);
  }

  function updateMenuPanoramaCamera(dt) {
    if (!camera) return;
    menuPanorama.time += dt;
    menuPanorama.orbitAngle += 0.22 * dt;

    // 1. Randomly hover & glide between scenic vantage points across the archipelago
    const targetWp = MENU_SCENIC_WAYPOINTS[menuPanorama.targetIdx] || MENU_SCENIC_WAYPOINTS[0];
    const dx = targetWp.x - menuPanorama.x;
    const dz = targetWp.z - menuPanorama.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 240) {
      menuPanorama.targetIdx = pickNextMenuWaypoint(menuPanorama.targetIdx);
    } else {
      const hoverSpeed = 68; // Smooth scenic drift speed (m/s)
      menuPanorama.x += (dx / dist) * hoverSpeed * dt;
      menuPanorama.z += (dz / dist) * hoverSpeed * dt;
    }

    // Add gentle circular hover sway around the drifting path
    const hoverX = menuPanorama.x + Math.cos(menuPanorama.orbitAngle) * 160;
    const hoverZ = menuPanorama.z + Math.sin(menuPanorama.orbitAngle * 0.85) * 160;

    // Smoothly hover above terrain/ocean with gentle vertical bobbing
    const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(hoverX, hoverZ));
    const desiredY = Math.max(groundY + 190, 310 + Math.sin(menuPanorama.time * 0.45) * 48);
    menuPanorama.y = THREE.MathUtils.lerp(menuPanorama.y, desiredY, Math.min(1.0, 1.8 * dt));

    camera.position.set(hoverX, menuPanorama.y, hoverZ);

    // 2. Continuous 360° panoramic horizontal spin (Minecraft main menu style) with gentle pitch bob
    menuPanorama.lookYaw = (menuPanorama.lookYaw + 0.16 * dt) % (Math.PI * 2);
    const lookPitch = -0.17 + Math.sin(menuPanorama.time * 0.35) * 0.05;
    const lookRoll = Math.sin(menuPanorama.time * 0.28) * 0.022;

    const euler = new THREE.Euler(lookPitch, menuPanorama.lookYaw, lookRoll, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Menu FOV setting (eases in after returning from a sortie)
    const menuFov = getFovSetting('menuFov');
    if (Math.abs(camera.fov - menuFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, menuFov, Math.min(1.0, 6 * dt));
      camera.updateProjectionMatrix();
    }
  }

  // --- Generate Studio 3D Aerial Photographs for Main Menu Aircraft Cards ---
  function createAircraftPhotoBackdrop(planeId) {
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 480;
    bgCanvas.height = 260;
    const ctx = bgCanvas.getContext('2d');

    const palettes = {
      mustang: { top: '#0c2d57', mid: '#2563eb', horizon: '#93c5fd', sea: '#1e3a8a', sunX: 380, sunY: 64, sunColor: 'rgba(254, 240, 138, 0.85)' },
      zero:    { top: '#0f394c', mid: '#0284c7', horizon: '#bae6fd', sea: '#0369a1', sunX: 110, sunY: 58, sunColor: 'rgba(254, 215, 170, 0.85)' },
      bf109:   { top: '#1e293b', mid: '#475569', horizon: '#cbd5e1', sea: '#334155', sunX: 390, sunY: 70, sunColor: 'rgba(253, 224, 71, 0.78)' },
      il2:     { top: '#311b2c', mid: '#9a3412', horizon: '#fdba74', sea: '#431407', sunX: 120, sunY: 76, sunColor: 'rgba(254, 240, 138, 0.88)' },
      spitfire: { top: '#1e3a5f', mid: '#4f7cac', horizon: '#dbeafe', sea: '#365314', sunX: 360, sunY: 60, sunColor: 'rgba(254, 249, 195, 0.85)' },
      sm79:     { top: '#3b4a52', mid: '#9fb3b8', horizon: '#f4e3c3', sea: '#5b6e73', sunX: 90, sunY: 55, sunColor: 'rgba(253, 230, 190, 0.85)' }
    };
    const pal = palettes[planeId] || palettes.mustang;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 195);
    skyGrad.addColorStop(0, pal.top);
    skyGrad.addColorStop(0.6, pal.mid);
    skyGrad.addColorStop(1, pal.horizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 480, 195);

    // Distant ocean/terrain below horizon
    const seaGrad = ctx.createLinearGradient(0, 190, 0, 260);
    seaGrad.addColorStop(0, pal.horizon);
    seaGrad.addColorStop(0.25, pal.sea);
    seaGrad.addColorStop(1, '#09111e');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, 190, 480, 70);

    // Sun glow
    const sunGrad = ctx.createRadialGradient(pal.sunX, pal.sunY, 4, pal.sunX, pal.sunY, 95);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.25, pal.sunColor);
    sunGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, 480, 260);

    // Soft sunlit clouds near horizon
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    const cloudPuffs = [
      [60, 165, 48], [95, 160, 38], [130, 170, 32],
      [250, 175, 52], [295, 168, 42], [340, 176, 35],
      [415, 162, 46], [450, 170, 36]
    ];
    for (const [cx, cy, r] of cloudPuffs) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(bgCanvas);
  }

  function generateAircraftPhotos() {
    if (typeof WW2AircraftBuilders === 'undefined' || !renderer) return;

    const width = 480;
    const height = 260;
    const photoCam = new THREE.PerspectiveCamera(34, width / height, 0.5, 200);

    const poses = {
      mustang: { cam: [0, 1.55, 13.6], rot: [0.11, -2.36, -0.22] },
      zero:    { cam: [0, 1.45, 13.2], rot: [0.10, -2.32, -0.25] },
      bf109:   { cam: [0, 1.45, 13.0], rot: [0.12, -2.38, -0.20] },
      il2:     { cam: [0, 1.65, 14.4], rot: [0.11, -2.35, -0.18] },
      spitfire: { cam: [0, 1.75, 13.6], rot: [0.16, -2.34, -0.24] },
      sm79:     { cam: [0, 2.6, 22.0], rot: [0.14, -2.30, -0.20] }
    };

    const prevPixelRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);

    for (const planeId of ['mustang', 'zero', 'bf109', 'il2', 'spitfire', 'sm79']) {
      const imgEl = document.getElementById(`photo-${planeId}`);
      if (!imgEl) continue;

      const photoScene = new THREE.Scene();
      photoScene.background = createAircraftPhotoBackdrop(planeId);

      const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.0);
      photoScene.add(hemi);

      const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.5);
      keyLight.position.set(12, 18, 16);
      photoScene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
      rimLight.position.set(-14, 6, -12);
      photoScene.add(rimLight);

      const modelData = createAircraftModel(planeId);
      if (modelData) {
        if (modelData.setGearDeployment) {
          modelData.setGearDeployment(0.0); // Retracted gear for in-flight photo
        }
        const pose = poses[planeId] || poses.mustang;
        modelData.group.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
        photoScene.add(modelData.group);

        photoCam.position.set(pose.cam[0], pose.cam[1], pose.cam[2]);
        photoCam.lookAt(0, 0.1, 0);

        renderer.render(photoScene, photoCam);

        // Composite onto 2D canvas with subtle vignette & reconnaissance photo frame
        const outCanvas = document.createElement('canvas');
        outCanvas.width = width;
        outCanvas.height = height;
        const outCtx = outCanvas.getContext('2d');
        outCtx.drawImage(renderer.domElement, 0, 0, width, height);

        // Subtle reconnaissance camera corner ticks
        outCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        outCtx.lineWidth = 1.5;
        const m = 8, len = 12;
        outCtx.beginPath();
        outCtx.moveTo(m, m + len); outCtx.lineTo(m, m); outCtx.lineTo(m + len, m);
        outCtx.moveTo(width - m - len, m); outCtx.lineTo(width - m, m); outCtx.lineTo(width - m, m + len);
        outCtx.moveTo(m, height - m - len); outCtx.lineTo(m, height - m); outCtx.lineTo(m + len, height - m);
        outCtx.moveTo(width - m - len, height - m); outCtx.lineTo(width - m, height - m); outCtx.lineTo(width - m, height - m - len);
        outCtx.stroke();

        imgEl.src = outCanvas.toDataURL('image/png');
      }
    }

    // Restore main viewport renderer size
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Sky Dome ---
  function buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(28000, 32, 24);
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#19559c');    // Zenith deep blue
    grad.addColorStop(0.5, '#5692d4');  // Mid sky
    grad.addColorStop(0.85, '#99c4eb'); // Near horizon
    grad.addColorStop(1.0, '#d1e6fa');  // Horizon glow
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 512);

    const skyTex = new THREE.CanvasTexture(canvas);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    scene.add(skyMesh);
  }

  // --- Ocean / Sea ---
  function buildSea() {
    const seaGeo = new THREE.PlaneGeometry(CONFIG.worldWidth, CONFIG.worldLength, 96, 64);
    seaGeo.rotateX(-Math.PI / 2);

    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x165b7e,
      roughness: 0.15,
      metalness: 0.45,
      transparent: true,
      opacity: 0.94,
      // Push the sea back in the depth buffer so flat beaches a few cm above it never z-fight
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 6,
    });

    waterMesh = new THREE.Mesh(seaGeo, seaMat);
    waterMesh.position.y = CONFIG.seaLevel;
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }

  // --- Terrain Mesh for the 4 Islands (Scaled 4x) ---
  function buildTerrain() {
    // ~54 m grid (was ~80 m) for cleaner coastlines and airfield pad edges
    const terrainGeo = new THREE.PlaneGeometry(CONFIG.worldWidth, CONFIG.worldLength, 440, 320);
    terrainGeo.rotateX(-Math.PI / 2);

    const pos = terrainGeo.attributes.position;
    const colors = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = getTerrainHeight(vx, vz);
      pos.setY(i, vy);

      const info = getTerrainInfo(vx, vz);

      if (info.factor1 > 0.04) {
        // Island 1 (North): Vibrant Sun-Drenched Sahara / Mojave Desert
        const nx = vx / MAP_SCALE;
        const nz = vz / MAP_SCALE;
        const u = nx * 0.85 + nz * 0.52;
        const dunePhase = Math.sin(u * 0.0065);
        const crestFactor = Math.cos(u * 0.0065);
        const mesaNoise = Math.sin(nx * 0.0042 + 1.4) * Math.cos(nz * 0.0052 + 0.8);
        const dOasis = Math.hypot(nx - (-450), nz - (-980));

        if (dOasis < 95 && vy < CONFIG.seaLevel + 4.8) {
          // Lush oasis green vegetation ring around the pool
          color.setHex(0x3d7b2e);
        } else if (mesaNoise > 0.32 && vy > 40) {
          // Ancient Sandstone Mesa Escarpment & Plateaus
          if (vy > 58) {
            color.setHex(0x994622); // Sunbaked burnt sienna rock
          } else {
            color.setHex(0xb56333); // Red sandstone canyon rock
          }
        } else {
          // Rolling Sand Dunes with realistic windward / leeward lighting
          if (crestFactor > 0.55) {
            // Sunlit bright golden crest
            color.setRGB(0.98, 0.86, 0.58);
          } else if (dunePhase > 0) {
            // Warm golden dune face
            color.setRGB(0.92, 0.74, 0.40);
          } else {
            // Warm terra-cotta amber slip-face
            color.setRGB(0.82, 0.59, 0.30);
          }
        }
      } else if (info.factor4 > 0.08 && vy > 70) {
        // Island 4: Rugged Granite Mountain Peak
        if (vy > 145) {
          color.setHex(0xd6dce5); // Light granite / snow crag
        } else {
          color.setHex(0x565c66); // Dark granite rock face
        }
      } else {
        // Islands 2, 3, and lowland Island 4: Lush Emerald Green
        if (vy < 45) {
          color.setHex(0x3e7b36); // Vibrant meadow
        } else if (vy < 100) {
          color.setHex(0x2f6029); // Forest green
        } else {
          color.setHex(0x5b625c); // Rocky ridge
        }
      }
      // Soft shoreline: land colour fades into beach sand as the ground drops to the waterline,
      // then into a shallow-water tint below it, so no per-vertex colour steps show along coasts
      const beachHex = info.factor1 > 0.04 ? 0xf3dd9a : 0xe4d8a5;
      const beachT = THREE.MathUtils.smoothstep(vy, 0.8, 5.5);
      const landR = color.r, landG = color.g, landB = color.b;
      color.setHex(beachHex);
      color.r += (landR - color.r) * beachT;
      color.g += (landG - color.g) * beachT;
      color.b += (landB - color.b) * beachT;
      if (vy < 0.35) {
        const depthT = THREE.MathUtils.smoothstep(-vy, 0.0, 12.0);
        const shallowR = 0.50, shallowG = 0.78, shallowB = 0.72;
        const deepR = 0.09, deepG = 0.36, deepB = 0.49;
        const sandMix = THREE.MathUtils.smoothstep(vy, -1.2, 0.35);
        const wr = shallowR + (deepR - shallowR) * depthT;
        const wg = shallowG + (deepG - shallowG) * depthT;
        const wb = shallowB + (deepB - shallowB) * depthT;
        color.r = wr + (color.r - wr) * sandMix;
        color.g = wg + (color.g - wg) * sandMix;
        color.b = wb + (color.b - wb) * sandMix;
      }
      colors.push(color.r, color.g, color.b);
    }

    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: createTerrainDetailTexture(),
      roughness: 0.88,
      metalness: 0.05,
      flatShading: false,
    });

    terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }

  // --- Semi-Transparent Boundaries (Perimeter matching the Photo Frame) ---
  function buildBoundaryWalls() {
    const boundaryGroup = new THREE.Group();

    // Semi-transparent glowing cybernetic grid canvas texture
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Vertical gradient: glowing at sea level, fading upwards into the sky
    const grad = ctx.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0.0, 'rgba(0, 229, 255, 0.45)');
    grad.addColorStop(0.3, 'rgba(0, 180, 255, 0.25)');
    grad.addColorStop(0.7, 'rgba(0, 140, 255, 0.10)');
    grad.addColorStop(1.0, 'rgba(0, 100, 255, 0.02)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);

    // Glowing vertical grid lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= 128; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 256);
      ctx.stroke();
    }
    // Horizontal scanlines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y);
      ctx.stroke();
    }

    const boundaryTex = new THREE.CanvasTexture(canvas);
    boundaryTex.wrapS = THREE.RepeatWrapping;
    boundaryTex.wrapT = THREE.ClampToEdgeWrapping;

    const wallHeight = 1600;

    // 1. North Wall (Z = CONFIG.minZ)
    const northTex = boundaryTex.clone();
    northTex.repeat.set(CONFIG.worldWidth / 240, 1);
    northTex.needsUpdate = true;
    const northMat = new THREE.MeshBasicMaterial({
      map: northTex,
      transparent: true,
      opacity: 0.40,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const northGeo = new THREE.PlaneGeometry(CONFIG.worldWidth, wallHeight);
    const northMesh = new THREE.Mesh(northGeo, northMat);
    northMesh.position.set(0, wallHeight / 2, CONFIG.minZ);
    boundaryGroup.add(northMesh);

    // 2. South Wall (Z = CONFIG.maxZ)
    const southMesh = new THREE.Mesh(northGeo, northMat);
    southMesh.position.set(0, wallHeight / 2, CONFIG.maxZ);
    boundaryGroup.add(southMesh);

    // 3. West Wall (X = CONFIG.minX)
    const westTex = boundaryTex.clone();
    westTex.repeat.set(CONFIG.worldLength / 240, 1);
    westTex.needsUpdate = true;
    const westMat = new THREE.MeshBasicMaterial({
      map: westTex,
      transparent: true,
      opacity: 0.40,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const sideGeo = new THREE.PlaneGeometry(CONFIG.worldLength, wallHeight);
    const westMesh = new THREE.Mesh(sideGeo, westMat);
    westMesh.rotation.y = Math.PI / 2;
    westMesh.position.set(CONFIG.minX, wallHeight / 2, 0);
    boundaryGroup.add(westMesh);

    // 4. East Wall (X = CONFIG.maxX)
    const eastMesh = new THREE.Mesh(sideGeo, westMat);
    eastMesh.rotation.y = Math.PI / 2;
    eastMesh.position.set(CONFIG.maxX, wallHeight / 2, 0);
    boundaryGroup.add(eastMesh);

    // 5. Waterline Luminous Beams (Perimeter wire)
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    const points = [
      new THREE.Vector3(CONFIG.minX, 1.2, CONFIG.minZ),
      new THREE.Vector3(CONFIG.maxX, 1.2, CONFIG.minZ),
      new THREE.Vector3(CONFIG.maxX, 1.2, CONFIG.maxZ),
      new THREE.Vector3(CONFIG.minX, 1.2, CONFIG.maxZ),
      new THREE.Vector3(CONFIG.minX, 1.2, CONFIG.minZ)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const borderLine = new THREE.Line(lineGeo, lineMat);
    boundaryGroup.add(borderLine);

    // 6. Hazard Buoys along border
    const buoyGeo = new THREE.CylinderGeometry(2.0, 2.8, 5.5, 8);
    const buoyMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 });

    for (let x = CONFIG.minX + 500; x < CONFIG.maxX; x += 700) {
      [CONFIG.minZ, CONFIG.maxZ].forEach(z => {
        const buoy = new THREE.Mesh(buoyGeo, buoyMat);
        buoy.position.set(x, 2.0, z);
        boundaryGroup.add(buoy);
      });
    }
    for (let z = CONFIG.minZ + 500; z < CONFIG.maxZ; z += 700) {
      [CONFIG.minX, CONFIG.maxX].forEach(x => {
        const buoy = new THREE.Mesh(buoyGeo, buoyMat);
        buoy.position.set(x, 2.0, z);
        boundaryGroup.add(buoy);
      });
    }

    scene.add(boundaryGroup);
  }

  // --- 4 Operational Airfields (Exact Spots of Black Lines in Photo) ---
  // Called again at the start of every game so bombed-out bases are restored intact.
  let airfieldRoot = null;
  function buildAirfields() {
    if (airfieldRoot) {
      scene.remove(airfieldRoot);
      airfieldRoot.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
    }
    airfieldRoot = new THREE.Group();

    AIRPORTS.forEach((af) => {
      const afGroup = new THREE.Group();
      afGroup.position.set(af.x, af.elevation, af.z);
      afGroup.rotation.y = af.headingRad;

      af.afGroup = afGroup;
      af.hangarGroups = [];
      af.edgeLights = [];
      af.hp = 1200;
      af.maxHp = 1200;
      af.isDestroyed = false;
      af.towerHp = 400;
      af.towerDestroyed = false;

      // 1. Runway Mesh
      const runwayGeo = new THREE.PlaneGeometry(af.width, af.length);
      runwayGeo.rotateX(-Math.PI / 2);
      const runwayMat = new THREE.MeshStandardMaterial({
        map: createRunwayTexture(),
        roughness: 0.65,
        metalness: 0.1,
      });
      const runwayMesh = new THREE.Mesh(runwayGeo, runwayMat);
      runwayMesh.position.set(0, 0.08, 0);
      runwayMesh.receiveShadow = true;
      afGroup.add(runwayMesh);
      af.runwayMesh = runwayMesh;

      // 2. Apron and Taxiway
      const apronGeo = new THREE.PlaneGeometry(120, 180);
      apronGeo.rotateX(-Math.PI / 2);
      const apronMat = new THREE.MeshStandardMaterial({
        color: 0x3a3f44,
        roughness: 0.72,
      });
      const apronMesh = new THREE.Mesh(apronGeo, apronMat);
      if (af.width > AIRFIELD_SIZES.classic.width) apronMesh.scale.set(1.3, 1, 1.3); // bigger apron for the bigger aircraft
      apronMesh.position.set(90, 0.05, -30);
      apronMesh.receiveShadow = true;
      afGroup.add(apronMesh);

      // Taxiway connector
      const taxiwayGeo = new THREE.PlaneGeometry(55, 30);
      taxiwayGeo.rotateX(-Math.PI / 2);
      const taxiway = new THREE.Mesh(taxiwayGeo, apronMat);
      taxiway.position.set(40, 0.06, -30);
      taxiway.receiveShadow = true;
      afGroup.add(taxiway);

      // 3. Airfield Control Tower
      const isDesert = (af.id === 'north');
      const towerGroup = new THREE.Group();
      towerGroup.position.set(130, 0, 45);

      const baseGeo = new THREE.BoxGeometry(22, 10, 18);
      const concreteMat = new THREE.MeshStandardMaterial({ color: isDesert ? 0xd1b98a : 0xd1d5db, roughness: 0.75 });
      const baseMesh = new THREE.Mesh(baseGeo, concreteMat);
      baseMesh.position.y = 5;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      towerGroup.add(baseMesh);

      const columnGeo = new THREE.CylinderGeometry(4.0, 4.8, 32, 12);
      const columnMesh = new THREE.Mesh(columnGeo, concreteMat);
      columnMesh.position.y = 24;
      columnMesh.castShadow = true;
      towerGroup.add(columnMesh);

      const cabinGeo = new THREE.CylinderGeometry(7.5, 6.5, 8, 12);
      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        roughness: 0.2,
        metalness: 0.8,
      });
      const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
      cabinMesh.position.y = 42;
      cabinMesh.castShadow = true;
      towerGroup.add(cabinMesh);

      const isFriendlyBase = (af.team === 'friendly');
      const teamColorHex = isFriendlyBase ? 0x22c55e : 0xef4444;

      const domeGeo = new THREE.SphereGeometry(3.0, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshBasicMaterial({ color: teamColorHex });
      const domeMesh = new THREE.Mesh(domeGeo, domeMat);
      domeMesh.position.y = 46;
      towerGroup.add(domeMesh);

      // Rotating Control Tower Beacon Spotlight / Halo (Milestone 2.3)
      const beaconRotor = new THREE.Group();
      beaconRotor.position.y = 48.2;
      const beaconOrbGeo = new THREE.SphereGeometry(1.35, 10, 10);
      const beaconGlowMat = new THREE.MeshBasicMaterial({
        color: teamColorHex,
        transparent: true,
        opacity: 0.90
      });
      const beaconOrb = new THREE.Mesh(beaconOrbGeo, beaconGlowMat);
      beaconRotor.add(beaconOrb);

      const beamGeo = new THREE.ConeGeometry(3.2, 18, 10, 1, true);
      beamGeo.rotateX(Math.PI / 2);
      beamGeo.translate(0, 0, 9);
      const beamMat = new THREE.MeshBasicMaterial({
        color: teamColorHex,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const beam1 = new THREE.Mesh(beamGeo, beamMat);
      const beam2 = new THREE.Mesh(beamGeo, beamMat);
      beam2.rotation.y = Math.PI;
      beaconRotor.add(beam1);
      beaconRotor.add(beam2);
      towerGroup.add(beaconRotor);

      af.towerGroup = towerGroup;
      af.beaconDomeMat = domeMat;
      af.beaconGlowMat = beaconGlowMat;
      af.beaconBeamMat = beamMat;
      af.beaconRotor = beaconRotor;

      afGroup.add(towerGroup);

      // 4. Hangars
      const hangarMat = new THREE.MeshStandardMaterial({
        color: isDesert ? 0xb5925a : 0x475569,
        roughness: isDesert ? 0.75 : 0.5
      });
      for (let h = 0; h < 2; h++) {
        const hangar = new THREE.Group();
        const hBox = new THREE.BoxGeometry(40, 14, 50);
        const hMesh = new THREE.Mesh(hBox, hangarMat);
        hMesh.position.y = 7;
        hMesh.castShadow = true;
        hMesh.receiveShadow = true;
        hangar.add(hMesh);

        const roofGeo = new THREE.CylinderGeometry(20, 20, 50, 16, 1, false, 0, Math.PI);
        roofGeo.rotateZ(Math.PI / 2);
        roofGeo.rotateY(Math.PI / 2);
        const roofMesh = new THREE.Mesh(roofGeo, hangarMat);
        roofMesh.position.y = 14;
        roofMesh.castShadow = true;
        hangar.add(roofMesh);

        hangar.position.set(110, 0, -90 + h * 65);
        afGroup.add(hangar);
        af.hangarGroups.push(hangar);
      }

      if (isDesert) {
        // Sandbag defensive revetments around desert airfield hangars
        const bagGeo = new THREE.BoxGeometry(4, 1.8, 120);
        const bagMat = new THREE.MeshStandardMaterial({ color: 0xc8a96e, roughness: 0.95 });
        const bagMesh1 = new THREE.Mesh(bagGeo, bagMat);
        bagMesh1.position.set(88, 0.9, -60);
        afGroup.add(bagMesh1);
        const bagMesh2 = new THREE.Mesh(bagGeo, bagMat);
        bagMesh2.position.set(132, 0.9, -60);
        afGroup.add(bagMesh2);
      }

      // 5. Runway Edge Lights
      const lightGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 6);
      const whiteLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const greenLightMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const redLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

      const rwHalfL = af.length / 2;
      const rwHalfW = af.width / 2 + 1.5;

      for (let z = -rwHalfL; z <= rwHalfL; z += 45) {
        let mat = whiteLightMat;
        if (z === -rwHalfL) mat = greenLightMat;
        if (z === rwHalfL) mat = redLightMat;

        const l1 = new THREE.Mesh(lightGeo, mat);
        l1.position.set(-rwHalfW, 0.5, z);
        afGroup.add(l1);

        const l2 = new THREE.Mesh(lightGeo, mat);
        l2.position.set(rwHalfW, 0.5, z);
        afGroup.add(l2);

        af.edgeLights.push(l1, l2);
      }

      // 6. Windsock (Colored by Airfield Team Ownership)
      const poleGeo = new THREE.CylinderGeometry(0.3, 0.4, 14, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(-af.width / 2 - 10, 7, 0);
      pole.castShadow = true;
      afGroup.add(pole);

      const sockGeo = new THREE.ConeGeometry(2, 6, 8);
      sockGeo.rotateZ(Math.PI / 2);
      const sockMat = new THREE.MeshStandardMaterial({ color: isFriendlyBase ? 0x22c55e : 0xef4444 });
      const sock = new THREE.Mesh(sockGeo, sockMat);
      sock.position.set(-af.width / 2 - 7, 13, 0);
      afGroup.add(sock);
      af.sockMat = sockMat;

      // 7. National flag pole (Factions only: shown & re-skinned each game by updateAirfieldVisuals)
      const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 26, 8), poleMat);
      flagPole.position.set(-af.width / 2 - 24, 13, 8);
      flagPole.visible = false;
      afGroup.add(flagPole);
      const flagMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), flagMat);
      flagMesh.position.set(-af.width / 2 - 24, 21.5, 8 + 6.2);
      flagMesh.rotation.y = Math.PI / 2;
      flagMesh.visible = false;
      afGroup.add(flagMesh);
      af.flagPole = flagPole;
      af.flagMesh = flagMesh;

      airfieldRoot.add(afGroup);
    });

    scene.add(airfieldRoot);
  }

  const flagTextureCache = {};
  function getFlagTexture(nationId) {
    if (!flagTextureCache[nationId]) {
      const tex = new THREE.CanvasTexture(drawFlag(nationId, 240, 160));
      tex.anisotropy = 4;
      flagTextureCache[nationId] = tex;
    }
    return flagTextureCache[nationId];
  }

  function updateAirfieldVisuals() {
    for (let af of AIRPORTS) {
      // Factions: every base glows in its nation's team colour and flies its national flag
      let col = (af.team === 'friendly') ? 0x22c55e : 0xef4444;
      if (af.nationId && FACTIONS[af.nationId] && !af.isDestroyed) col = FACTIONS[af.nationId].colorHex;
      else if (af.netColor !== undefined && !af.isDestroyed) col = af.netColor; // online classic team colour
      if (af.flagMesh) {
        const showFlag = Boolean(af.nationId && FACTIONS[af.nationId]);
        af.flagMesh.visible = showFlag;
        if (af.flagPole) af.flagPole.visible = showFlag;
        if (showFlag) {
          af.flagMesh.material.map = getFlagTexture(af.nationId);
          af.flagMesh.material.needsUpdate = true;
        }
      }
      if (af.beaconDomeMat) af.beaconDomeMat.color.setHex(col);
      if (af.beaconGlowMat) af.beaconGlowMat.color.setHex(col);
      if (af.beaconBeamMat) af.beaconBeamMat.color.setHex(col);
      if (af.sockMat) af.sockMat.color.setHex(col);
    }
  }

  // --- 4 Harbor Docks with Pier Decks, Pilings, Warehouses, Cranes & Moored Ships ---
  function buildDocks() {
    const docksRoot = new THREE.Group();

    // Reusable Materials
    const woodDeckMat = new THREE.MeshStandardMaterial({ color: 0x786048, roughness: 0.85 });
    const pilingMat = new THREE.MeshStandardMaterial({ color: 0x3d3228, roughness: 0.95 });
    const warehouseMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6 });
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4, metalness: 0.6 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x92663b, roughness: 0.8 });

    DOCKS.forEach((dock) => {
      const dockGroup = new THREE.Group();
      dockGroup.position.set(dock.x, CONFIG.seaLevel, dock.z);
      dockGroup.rotation.y = dock.angle;

      dock.hp = 900;
      dock.maxHp = 900;
      dock.isDestroyed = false;
      dock.ships = [];
      dock.dockGroup = dockGroup;

      const pLen = dock.pierLength;
      const pWid = dock.pierWidth;

      // 1. Pier Main Deck
      const pierGeo = new THREE.BoxGeometry(pWid, 2.0, pLen);
      const pierMesh = new THREE.Mesh(pierGeo, woodDeckMat);
      pierMesh.position.set(0, 2.0, pLen / 2);
      pierMesh.castShadow = true;
      pierMesh.receiveShadow = true;
      dockGroup.add(pierMesh);

      // 2. Timber Pilings extending into dredged seabed
      const pilingGeo = new THREE.CylinderGeometry(0.65, 0.65, 14, 8);
      for (let pz = 10; pz < pLen; pz += 16) {
        [-pWid / 2 + 1.2, 0, pWid / 2 - 1.2].forEach((px) => {
          const piling = new THREE.Mesh(pilingGeo, pilingMat);
          piling.position.set(px, -3.5, pz);
          dockGroup.add(piling);
        });
      }

      // 3. Pier Railing & Bollards
      const bollardGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.9, 8);
      const bollardMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8 });
      for (let bz = 8; bz < pLen - 5; bz += 20) {
        const b1 = new THREE.Mesh(bollardGeo, bollardMat);
        b1.position.set(-pWid / 2 + 0.6, 3.45, bz);
        dockGroup.add(b1);

        const b2 = new THREE.Mesh(bollardGeo, bollardMat);
        b2.position.set(pWid / 2 - 0.6, 3.45, bz);
        dockGroup.add(b2);
      }

      // 4. Harbor Warehouse Shed
      const shedGeo = new THREE.BoxGeometry(pWid * 0.7, 7.5, 24);
      const shed = new THREE.Mesh(shedGeo, warehouseMat);
      shed.position.set(0, 6.75, 18);
      shed.castShadow = true;
      shed.receiveShadow = true;
      dockGroup.add(shed);
      dock.shed = shed;

      // 5. Dockside Heavy Cargo Crane
      const craneGroup = new THREE.Group();
      craneGroup.position.set(-pWid / 2 + 3.0, 3.0, pLen * 0.55);

      const towerGeo = new THREE.CylinderGeometry(1.2, 1.6, 12, 8);
      const tower = new THREE.Mesh(towerGeo, craneMat);
      tower.position.y = 6;
      tower.castShadow = true;
      craneGroup.add(tower);

      const boomGeo = new THREE.BoxGeometry(1.0, 1.0, 22);
      const boom = new THREE.Mesh(boomGeo, craneMat);
      boom.position.set(-4, 13, 0);
      boom.rotation.x = 0.35;
      boom.rotation.y = -Math.PI / 3;
      boom.castShadow = true;
      craneGroup.add(boom);

      dockGroup.add(craneGroup);
      dock.craneGroup = craneGroup;

      // 6. Cargo Crates on Pier
      for (let c = 0; c < 5; c++) {
        const crateSize = 1.6 + (c % 3) * 0.4;
        const crateGeo = new THREE.BoxGeometry(crateSize, crateSize, crateSize);
        const crate = new THREE.Mesh(crateGeo, crateMat);
        crate.position.set(pWid * 0.22 - (c % 2) * 1.5, 3.0 + crateSize / 2, pLen * 0.35 + c * 3.5);
        crate.castShadow = true;
        dockGroup.add(crate);
      }

      // 7. Navigation Approach Channel Buoys
      const buoyGeo = new THREE.CylinderGeometry(0.7, 0.9, 2.5, 8);
      const redBuoyMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
      const greenBuoyMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.3 });

      const bPort = new THREE.Mesh(buoyGeo, redBuoyMat);
      bPort.position.set(-pWid - 14, 0.4, pLen + 40);
      dockGroup.add(bPort);

      const bStbd = new THREE.Mesh(buoyGeo, greenBuoyMat);
      bStbd.position.set(pWid + 14, 0.4, pLen + 40);
      dockGroup.add(bStbd);

      // 8. 3D Moored Ship based on dock specialization
      if (dock.shipType === 'freighter') {
        // Cargo Freighter (Dock 0 - North)
        const freighter = createCargoFreighterMesh();
        freighter.position.set(-pWid / 2 - 10, 0, pLen * 0.5);
        dockGroup.add(freighter);
        dock.ships.push({ name: 'Cargo Freighter', mesh: freighter, hp: 450, maxHp: 450, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });

        // Fuel Barge alongside
        const barge = createFuelBargeMesh();
        barge.position.set(pWid / 2 + 8, 0, pLen * 0.4);
        dockGroup.add(barge);
        dock.ships.push({ name: 'Fuel Barge', mesh: barge, hp: 300, maxHp: 300, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });
      } else if (dock.shipType === 'gunboat') {
        // Two Patrol Gunboats (Dock 1 - NE)
        const gunboat1 = createPatrolGunboatMesh();
        gunboat1.position.set(-pWid / 2 - 7, 0, pLen * 0.35);
        dockGroup.add(gunboat1);
        dock.ships.push({ name: 'Patrol Gunboat 1', mesh: gunboat1, hp: 350, maxHp: 350, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });

        const gunboat2 = createPatrolGunboatMesh();
        gunboat2.position.set(pWid / 2 + 7, 0, pLen * 0.65);
        dockGroup.add(gunboat2);
        dock.ships.push({ name: 'Patrol Gunboat 2', mesh: gunboat2, hp: 350, maxHp: 350, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });
      } else if (dock.shipType === 'steamer') {
        // Coastal Steamer (Dock 2 - West)
        const steamer = createCoastalSteamerMesh();
        steamer.position.set(-pWid / 2 - 9, 0, pLen * 0.5);
        dockGroup.add(steamer);
        dock.ships.push({ name: 'Coastal Steamer', mesh: steamer, hp: 400, maxHp: 400, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });
      } else if (dock.shipType === 'destroyer') {
        // Fleet Destroyer Warship (Dock 3 - SE)
        const destroyer = createFleetDestroyerMesh();
        destroyer.position.set(pWid / 2 + 11, 0, pLen * 0.5);
        dockGroup.add(destroyer);
        dock.ships.push({ name: 'Fleet Destroyer Warship', mesh: destroyer, hp: 550, maxHp: 550, isSunk: false, isBurning: false, sinkOffset: 0, listAngle: 0 });
      }

      docksRoot.add(dockGroup);
    });

    scene.add(docksRoot);
  }

  // --- 3D Ship Model Helpers for Harbor Docks ---
  function createCargoFreighterMesh() {
    const ship = new THREE.Group();

    // Hull (Upper grey + Lower red keel)
    const upperHullGeo = new THREE.BoxGeometry(13, 5.5, 78);
    const upperHullMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 });
    const upperHull = new THREE.Mesh(upperHullGeo, upperHullMat);
    upperHull.position.y = 2.0;
    upperHull.castShadow = true;
    ship.add(upperHull);

    const lowerHullGeo = new THREE.BoxGeometry(12, 3.5, 76);
    const lowerHullMat = new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.7 });
    const lowerHull = new THREE.Mesh(lowerHullGeo, lowerHullMat);
    lowerHull.position.y = -1.5;
    ship.add(lowerHull);

    // Superstructure Deckhouse
    const houseGeo = new THREE.BoxGeometry(11, 7.5, 20);
    const houseMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
    const house = new THREE.Mesh(houseGeo, houseMat);
    house.position.set(0, 7.5, -12);
    house.castShadow = true;
    ship.add(house);

    // Wheelhouse
    const bridgeGeo = new THREE.BoxGeometry(9, 3.2, 9);
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
    bridge.position.set(0, 12.5, -14);
    bridge.castShadow = true;
    ship.add(bridge);

    // Smokestack Funnel
    const funnelGeo = new THREE.CylinderGeometry(1.8, 2.0, 9, 8);
    const funnelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.4 });
    const funnel = new THREE.Mesh(funnelGeo, funnelMat);
    funnel.position.set(0, 13.5, -6);
    ship.add(funnel);

    // Cargo Derricks
    const mastGeo = new THREE.CylinderGeometry(0.35, 0.45, 20, 6);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8 });
    const m1 = new THREE.Mesh(mastGeo, mastMat);
    m1.position.set(0, 12, 14);
    ship.add(m1);

    const m2 = new THREE.Mesh(mastGeo, mastMat);
    m2.position.set(0, 12, -28);
    ship.add(m2);

    return ship;
  }

  function createFuelBargeMesh() {
    const barge = new THREE.Group();
    const hullGeo = new THREE.BoxGeometry(9, 3.0, 34);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.8 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 1.0;
    barge.add(hull);

    // Cylindrical Tanks
    const tankGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 12);
    tankGeo.rotateX(Math.PI / 2);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5 });

    const t1 = new THREE.Mesh(tankGeo, tankMat);
    t1.position.set(0, 3.2, -6);
    barge.add(t1);

    const t2 = new THREE.Mesh(tankGeo, tankMat);
    t2.position.set(0, 3.2, 7);
    barge.add(t2);

    return barge;
  }

  function createPatrolGunboatMesh() {
    const boat = new THREE.Group();

    // Fast pointed hull
    const hullGeo = new THREE.BoxGeometry(6.5, 4.0, 36);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x526071, roughness: 0.5 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 1.5;
    boat.add(hull);

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(5.0, 3.5, 12);
    const cabin = new THREE.Mesh(cabinGeo, hullMat);
    cabin.position.set(0, 4.5, -3);
    boat.add(cabin);

    // Forward Dual Gun Turret
    const turretGeo = new THREE.CylinderGeometry(1.6, 1.8, 1.6, 8);
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 });
    const turret = new THREE.Mesh(turretGeo, turretMat);
    turret.position.set(0, 4.0, 10);
    boat.add(turret);

    const barrelGeo = new THREE.CylinderGeometry(0.18, 0.18, 5, 6);
    barrelGeo.rotateX(Math.PI / 2);
    const b1 = new THREE.Mesh(barrelGeo, turretMat);
    b1.position.set(-0.35, 4.2, 13.5);
    boat.add(b1);
    const b2 = new THREE.Mesh(barrelGeo, turretMat);
    b2.position.set(0.35, 4.2, 13.5);
    boat.add(b2);

    return boat;
  }

  function createCoastalSteamerMesh() {
    const steamer = new THREE.Group();

    // Dark green merchant hull
    const hullGeo = new THREE.BoxGeometry(10, 5.0, 62);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x1d3b24, roughness: 0.6 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 1.8;
    steamer.add(hull);

    // White Promenade Superstructure
    const deckGeo = new THREE.BoxGeometry(8.5, 5.5, 26);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, 6.0, -4);
    steamer.add(deck);

    // Tall vintage steamship funnel
    const funnelGeo = new THREE.CylinderGeometry(1.5, 1.7, 10, 8);
    const funnelMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
    const funnel = new THREE.Mesh(funnelGeo, funnelMat);
    funnel.position.set(0, 11.5, -4);
    steamer.add(funnel);

    return steamer;
  }

  function createFleetDestroyerMesh() {
    const warship = new THREE.Group();

    // Sleek Naval Camouflage Grey Hull
    const hullGeo = new THREE.BoxGeometry(11, 6.0, 96);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 2.0;
    warship.add(hull);

    // Main Bridge Tower
    const bridgeGeo = new THREE.BoxGeometry(8, 8, 18);
    const bridge = new THREE.Mesh(bridgeGeo, hullMat);
    bridge.position.set(0, 7.5, 10);
    warship.add(bridge);

    // Forward 5-inch Naval Gun Turret
    const turretGeo = new THREE.BoxGeometry(4.5, 2.5, 5.5);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });
    const fwdTurret = new THREE.Mesh(turretGeo, gunMat);
    fwdTurret.position.set(0, 5.8, 28);
    warship.add(fwdTurret);

    const barrelGeo = new THREE.CylinderGeometry(0.25, 0.25, 8, 6);
    barrelGeo.rotateX(Math.PI / 2);
    const fwdGun = new THREE.Mesh(barrelGeo, gunMat);
    fwdGun.position.set(0, 5.8, 33);
    warship.add(fwdGun);

    // Aft 5-inch Naval Gun Turret
    const aftTurret = new THREE.Mesh(turretGeo, gunMat);
    aftTurret.position.set(0, 5.8, -30);
    warship.add(aftTurret);

    const aftGun = new THREE.Mesh(barrelGeo, gunMat);
    aftGun.position.set(0, 5.8, -35);
    warship.add(aftGun);

    // Twin Raked Smoke Funnels
    const fGeo = new THREE.CylinderGeometry(1.6, 1.8, 8, 8);
    fGeo.rotateX(-0.15);
    const f1 = new THREE.Mesh(fGeo, hullMat);
    f1.position.set(0, 9.0, -2);
    warship.add(f1);

    const f2 = new THREE.Mesh(fGeo, hullMat);
    f2.position.set(0, 9.0, -16);
    warship.add(f2);

    return warship;
  }

  // --- Roads Network Connecting Airfields to Docks (Scaled 4x) ---
  // Land-only route between two points (A* on a 40 m grid): stays on dry ground, prefers gentle
  // slopes and never crosses a runway or an airfield's building area. Returns [{x, z}, ...].
  function findLandRoute(sx, sz, ex, ez) {
    const STEP = 40;
    const PAD = 1600;
    const minX = Math.min(sx, ex) - PAD;
    const minZ = Math.min(sz, ez) - PAD;
    const nx = Math.ceil((Math.max(sx, ex) + PAD - minX) / STEP) + 1;
    const nz = Math.ceil((Math.max(sz, ez) + PAD - minZ) / STEP) + 1;
    const cellX = i => minX + i * STEP;
    const cellZ = j => minZ + j * STEP;
    const heights = new Float32Array(nx * nz).fill(NaN);
    const heightAt = (i, j) => {
      const k = j * nx + i;
      if (Number.isNaN(heights[k])) heights[k] = getTerrainHeight(cellX(i), cellZ(j));
      return heights[k];
    };
    const blocked = (x, z) => AIRPORTS.some(af => {
      const l = worldToAirfieldLocal(af, x, z);
      return l.lx > -af.width / 2 - 30 && l.lx < 150 && Math.abs(l.lz) < af.length / 2 + 30;
    });
    const si = Math.round((sx - minX) / STEP), sj = Math.round((sz - minZ) / STEP);
    const ei = Math.round((ex - minX) / STEP), ej = Math.round((ez - minZ) / STEP);
    const walkable = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      if ((i === si && j === sj) || (i === ei && j === ej)) return true;
      return heightAt(i, j) >= 1.0 && !blocked(cellX(i), cellZ(j));
    };

    const g = new Float32Array(nx * nz).fill(Infinity);
    const came = new Int32Array(nx * nz).fill(-1);
    const closed = new Uint8Array(nx * nz);
    const open = [];
    const hEst = (i, j) => Math.hypot(i - ei, j - ej) * STEP;
    const push = (k, f) => {
      open.push({ k, f });
      let c = open.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (open[p].f <= open[c].f) break;
        [open[p], open[c]] = [open[c], open[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop();
      if (open.length) {
        open[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1;
          let m = c;
          if (l < open.length && open[l].f < open[m].f) m = l;
          if (r < open.length && open[r].f < open[m].f) m = r;
          if (m === c) break;
          [open[m], open[c]] = [open[c], open[m]];
          c = m;
        }
      }
      return top;
    };

    const startK = sj * nx + si;
    const endK = ej * nx + ei;
    g[startK] = 0;
    push(startK, hEst(si, sj));
    while (open.length) {
      const { k } = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === endK) break;
      const i = k % nx, j = (k - i) / nx;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = i + di, nj = j + dj;
          if (!walkable(ni, nj)) continue;
          const nk = nj * nx + ni;
          if (closed[nk]) continue;
          const run = Math.hypot(di, dj) * STEP;
          const climb = Math.abs(heightAt(ni, nj) - heightAt(i, j));
          const cost = g[k] + run * (1 + (climb / run) * 12);
          if (cost < g[nk]) {
            g[nk] = cost;
            came[nk] = k;
            push(nk, cost + hEst(ni, nj));
          }
        }
      }
    }
    if (came[endK] < 0) return null;

    const route = [];
    for (let k = endK; k >= 0; k = came[k]) {
      const i = k % nx, j = (k - i) / nx;
      route.push({ x: cellX(i), z: cellZ(j) });
      if (k === startK) break;
    }
    route.reverse();
    route[0] = { x: sx, z: sz };
    route[route.length - 1] = { x: ex, z: ez };
    return route;
  }

  // Road spline from an airfield's apron edge (away from the runway) to just inland of its pier root
  function computeRoadSpline(link) {
    const af = AIRPORTS.find(a => a.id === link.airfield);
    const d = DOCKS.find(dk => dk.id === link.dock);
    const start = airfieldLocalToWorld(af, 165, -30);
    const end = { x: d.x - Math.sin(d.angle) * 14, z: d.z - Math.cos(d.angle) * 14 };
    const route = findLandRoute(start.x, start.z, end.x, end.z) || [start, end];
    // Thin the 40 m grid route to every 3rd node so the spline reads as a smooth road
    const pts = route.filter((p, i) => i === 0 || i === route.length - 1 || i % 3 === 0);
    return pts.map(p => new THREE.Vector2(p.x, p.z));
  }

  function buildRoads() {
    const roadSplines = ROAD_LINKS.map(computeRoadSpline);
    ROAD_PATHS.length = 0;

    const roadWidth = 14;
    const roadMat = new THREE.MeshStandardMaterial({
      map: createRoadTexture(),
      roughness: 0.8,
      metalness: 0.1,
    });

    for (let rPoints of roadSplines) {
      const curve = new THREE.SplineCurve(rPoints);
      const divisions = 140;
      const sampled = curve.getPoints(divisions);
      ROAD_PATHS.push(sampled.map(p => ({ x: p.x, z: p.y })));

      const geom = new THREE.BufferGeometry();
      const vertices = [];
      const uvs = [];

      for (let i = 0; i < sampled.length - 1; i++) {
        const p1 = sampled[i];
        const p2 = sampled[i + 1];

        const dir = new THREE.Vector2().subVectors(p2, p1).normalize();
        const norm = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(roadWidth / 2);

        const y1 = getTerrainHeight(p1.x, p1.y) + 0.15;
        const y2 = getTerrainHeight(p2.x, p2.y) + 0.15;

        if (y1 < CONFIG.seaLevel - 1 || y2 < CONFIG.seaLevel - 1) continue;

        vertices.push(p1.x + norm.x, y1, p1.y + norm.y);
        vertices.push(p1.x - norm.x, y1, p1.y - norm.y);
        vertices.push(p2.x + norm.x, y2, p2.y + norm.y);

        vertices.push(p1.x - norm.x, y1, p1.y - norm.y);
        vertices.push(p2.x - norm.x, y2, p2.y - norm.y);
        vertices.push(p2.x + norm.x, y2, p2.y + norm.y);

        uvs.push(0, 0, 1, 0, 0, 1);
        uvs.push(1, 0, 1, 1, 0, 1);
      }

      if (vertices.length > 0) {
        geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.computeVertexNormals();

        const roadMesh = new THREE.Mesh(geom, roadMat);
        roadMesh.receiveShadow = true;
        scene.add(roadMesh);
      }
    }
  }

  // --- Trees (High-performance InstancedMesh scattered across Islands) ---
  function buildTrees() {
    const treeCount = 2200;

    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.9, 5, 6);
    trunkGeo.translate(0, 2.5, 0);
    const foliageGeo = new THREE.ConeGeometry(4.0, 11, 7);
    foliageGeo.translate(0, 9.0, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d321d, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x245422, roughness: 0.8 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    trunkInst.castShadow = true;
    foliageInst.castShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;

    while (placed < treeCount && attempts < treeCount * 6) {
      attempts++;
      const x = (Math.random() - 0.5) * CONFIG.worldSize * 0.95;
      const z = (Math.random() - 0.5) * CONFIG.worldSize * 0.95;
      const y = getTerrainHeight(x, z);

      if (y < CONFIG.seaLevel + 2.0 || y > 120) continue;

      // Do NOT spawn temperate pine trees on the desert island (Island 1)
      const tInfo = getTerrainInfo(x, z);
      if (tInfo.factor1 > 0.04) continue;

      // Clear of all Airfield facilities (runways, apron, tower, hangars), Docks, and Balloon stations
      if (isInsideAirfieldCompound(x, z, 50)) continue;
      if (isNearDock(x, z, 60)) continue;
      if (isNearBalloonWinch(x, z, 50)) continue;
      if (isNearRoad(x, z, 8) || isNearPlacedSite(x, z, 20)) continue;

      const scale = 0.8 + Math.random() * 0.7;
      dummy.position.set(x, y, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.rotation.x = (Math.random() - 0.5) * 0.08;
      dummy.rotation.z = (Math.random() - 0.5) * 0.08;
      dummy.updateMatrix();

      trunkInst.setMatrixAt(placed, dummy.matrix);
      foliageInst.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    trunkInst.count = placed;
    foliageInst.count = placed;
    trunkInst.instanceMatrix.needsUpdate = true;
    foliageInst.instanceMatrix.needsUpdate = true;

    scene.add(trunkInst);
    scene.add(foliageInst);
  }

  // --- Desert Island Environment (Date Palms, Sandstone Mesas, Weathered Boulders, Dry Scrub, Oasis, & Sand Dust) ---
  const desertDustParticles = [];

  function buildDesertEnvironment() {
    const desertGroup = new THREE.Group();

    // 1. Desert Oasis Pool (Scaled 4x)
    const ox = -450 * MAP_SCALE;
    const oz = -980 * MAP_SCALE;
    const oasisGeo = new THREE.CylinderGeometry(80, 72, 3, 32);
    const oasisMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      roughness: 0.12,
      metalness: 0.85,
      transparent: true,
      opacity: 0.90
    });
    const oasisMesh = new THREE.Mesh(oasisGeo, oasisMat);
    const oasisY = getTerrainHeight(ox, oz);
    oasisMesh.position.set(ox, Math.max(CONFIG.seaLevel + 0.8, oasisY + 0.4), oz);
    desertGroup.add(oasisMesh);

    // 2. Date Palm Trees (InstancedMesh: Oasis Grove, Coastal Palm Belts & Wadis)
    const palmCount = 320;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.65, 9.5, 7);
    trunkGeo.translate(0, 4.75, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4c2b, roughness: 0.92 });

    const frondGeo1 = new THREE.ConeGeometry(5.8, 2.5, 8);
    frondGeo1.translate(0, 9.8, 0);
    const frondGeo2 = new THREE.ConeGeometry(4.5, 2.0, 7);
    frondGeo2.translate(0, 10.7, 0);
    const frondMat = new THREE.MeshStandardMaterial({ color: 0x3d6e27, roughness: 0.78 });

    const palmTrunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, palmCount);
    const palmFrondInst1 = new THREE.InstancedMesh(frondGeo1, frondMat, palmCount);
    const palmFrondInst2 = new THREE.InstancedMesh(frondGeo2, frondMat, palmCount);
    palmTrunkInst.castShadow = true;
    palmFrondInst1.castShadow = true;

    const dummy = new THREE.Object3D();
    let placedPalms = 0;

    // Oasis Grove coordinates (dense ring of palms surrounding oasis pool)
    for (let i = 0; i < 90 && placedPalms < palmCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 85 + Math.random() * 95;
      const px = ox + Math.cos(ang) * r;
      const pz = oz + Math.sin(ang) * r;
      const py = getTerrainHeight(px, pz);
      if (py < CONFIG.seaLevel + 1.2) continue;

      const scl = 0.9 + Math.random() * 0.55;
      dummy.position.set(px, py - 0.2, pz);
      dummy.scale.set(scl, scl, scl);
      dummy.rotation.set((Math.random() - 0.5) * 0.18, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.18);
      dummy.updateMatrix();

      palmTrunkInst.setMatrixAt(placedPalms, dummy.matrix);
      palmFrondInst1.setMatrixAt(placedPalms, dummy.matrix);
      palmFrondInst2.setMatrixAt(placedPalms, dummy.matrix);
      placedPalms++;
    }

    // Coastal & Lowland Desert Palms on Island 1
    let palmAttempts = 0;
    while (placedPalms < palmCount && palmAttempts < 850) {
      palmAttempts++;
      const px = -280 * MAP_SCALE + (Math.random() - 0.5) * 1150 * MAP_SCALE;
      const pz = -1080 * MAP_SCALE + (Math.random() - 0.5) * 580 * MAP_SCALE;
      const info = getTerrainInfo(px, pz);
      if (info.factor1 < 0.08 || info.factor1 > 0.88) continue;
      const py = getTerrainHeight(px, pz);
      if (py < CONFIG.seaLevel + 1.5 || py > 42) continue;

      // Clear of Airfields, Docks, and Balloon stations
      if (isInsideAirfieldCompound(px, pz, 50)) continue;
      if (isNearDock(px, pz, 60)) continue;
      if (isNearBalloonWinch(px, pz, 50)) continue;
      if (isNearRoad(px, pz, 8) || isNearPlacedSite(px, pz, 20)) continue;
      if (Math.hypot(px - ox, pz - oz) < 85) continue; // not inside the oasis pool

      const scl = 0.85 + Math.random() * 0.55;
      dummy.position.set(px, py - 0.2, pz);
      dummy.scale.set(scl, scl, scl);
      dummy.rotation.set((Math.random() - 0.5) * 0.16, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.16);
      dummy.updateMatrix();

      palmTrunkInst.setMatrixAt(placedPalms, dummy.matrix);
      palmFrondInst1.setMatrixAt(placedPalms, dummy.matrix);
      palmFrondInst2.setMatrixAt(placedPalms, dummy.matrix);
      placedPalms++;
    }

    palmTrunkInst.count = placedPalms;
    palmFrondInst1.count = placedPalms;
    palmFrondInst2.count = placedPalms;
    palmTrunkInst.instanceMatrix.needsUpdate = true;
    palmFrondInst1.instanceMatrix.needsUpdate = true;
    palmFrondInst2.instanceMatrix.needsUpdate = true;
    desertGroup.add(palmTrunkInst);
    desertGroup.add(palmFrondInst1);
    desertGroup.add(palmFrondInst2);

    // 3. Sandstone Rocks & Weathered Boulders (InstancedMesh)
    const rockCount = 320;
    const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb56333, roughness: 0.94 });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;

    let placedRocks = 0;
    let rockAttempts = 0;
    while (placedRocks < rockCount && rockAttempts < 950) {
      rockAttempts++;
      const rx = -280 * MAP_SCALE + (Math.random() - 0.5) * 1180 * MAP_SCALE;
      const rz = -1080 * MAP_SCALE + (Math.random() - 0.5) * 600 * MAP_SCALE;
      const info = getTerrainInfo(rx, rz);
      if (info.factor1 < 0.10) continue;
      const ry = getTerrainHeight(rx, rz);
      if (ry < CONFIG.seaLevel + 2.5) continue;

      // Clear of Airfields, Docks, and Balloon stations
      if (isInsideAirfieldCompound(rx, rz, 50)) continue;
      if (isNearDock(rx, rz, 60)) continue;
      if (isNearBalloonWinch(rx, rz, 50)) continue;
      if (isNearRoad(rx, rz, 10) || isNearPlacedSite(rx, rz, 20)) continue;
      if (Math.hypot(rx - ox, rz - oz) < 95) continue; // not inside the oasis pool

      const isMesa = (ry > 42);
      const sx = (isMesa ? 4.5 : 1.6) + Math.random() * (isMesa ? 9.5 : 4.0);
      const sy = (isMesa ? 5.0 : 1.4) + Math.random() * (isMesa ? 10.5 : 3.5);
      const sz = (isMesa ? 4.5 : 1.6) + Math.random() * (isMesa ? 9.5 : 4.0);

      dummy.position.set(rx, ry + sy * 0.45, rz);
      dummy.scale.set(sx, sy, sz);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();

      rockInst.setMatrixAt(placedRocks, dummy.matrix);
      placedRocks++;
    }

    rockInst.count = placedRocks;
    rockInst.instanceMatrix.needsUpdate = true;
    desertGroup.add(rockInst);

    // 4. Arid Desert Scrub / Tumbleweed (InstancedMesh)
    const scrubCount = 280;
    const scrubGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const scrubMat = new THREE.MeshStandardMaterial({ color: 0x9c8849, roughness: 0.95 });
    const scrubInst = new THREE.InstancedMesh(scrubGeo, scrubMat, scrubCount);
    scrubInst.castShadow = true;

    let placedScrubs = 0;
    let scrubAttempts = 0;
    while (placedScrubs < scrubCount && scrubAttempts < 850) {
      scrubAttempts++;
      const sx = -280 * MAP_SCALE + (Math.random() - 0.5) * 1180 * MAP_SCALE;
      const sz = -1080 * MAP_SCALE + (Math.random() - 0.5) * 600 * MAP_SCALE;
      const info = getTerrainInfo(sx, sz);
      if (info.factor1 < 0.10) continue;
      const sy = getTerrainHeight(sx, sz);
      if (sy < CONFIG.seaLevel + 1.8 || sy > 52) continue;

      // Clear of Airfields, Docks, and Balloon stations
      if (isInsideAirfieldCompound(sx, sz, 50)) continue;
      if (isNearDock(sx, sz, 60)) continue;
      if (isNearBalloonWinch(sx, sz, 50)) continue;
      if (isNearRoad(sx, sz, 6) || isNearPlacedSite(sx, sz, 15)) continue;
      if (Math.hypot(sx - ox, sz - oz) < 90) continue; // not inside the oasis pool

      const scl = 0.65 + Math.random() * 0.85;
      dummy.position.set(sx, sy + scl * 0.6, sz);
      dummy.scale.set(scl, scl * 0.75, scl);
      dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI * 2, Math.random() * 0.4);
      dummy.updateMatrix();

      scrubInst.setMatrixAt(placedScrubs, dummy.matrix);
      placedScrubs++;
    }

    scrubInst.count = placedScrubs;
    scrubInst.instanceMatrix.needsUpdate = true;
    desertGroup.add(scrubInst);

    // 5. Ambient Windblown Sand Dust Particles
    const dustCount = 200;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);

    for (let k = 0; k < dustCount; k++) {
      const dx = -280 * MAP_SCALE + (Math.random() - 0.5) * 1180 * MAP_SCALE;
      const dz = -1080 * MAP_SCALE + (Math.random() - 0.5) * 600 * MAP_SCALE;
      const dy = getTerrainHeight(dx, dz) + 3 + Math.random() * 30;
      dustPositions[k * 3 + 0] = dx;
      dustPositions[k * 3 + 1] = dy;
      dustPositions[k * 3 + 2] = dz;
    }

    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xf5ce82,
      size: 5.5,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });

    const dustPoints = new THREE.Points(dustGeo, dustMat);
    desertGroup.add(dustPoints);
    desertDustParticles.push({ points: dustPoints, positions: dustPositions });

    scene.add(desertGroup);
  }

  function updateDesertDust(dt) {
    for (let item of desertDustParticles) {
      const pos = item.points.geometry.attributes.position;
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        // Drift with trade winds across desert
        arr[i + 0] += 20.0 * dt;
        arr[i + 2] += 12.0 * dt;

        // Wrap around Island 1 boundaries (Scaled 4x)
        if (arr[i + 0] > 360 * MAP_SCALE) arr[i + 0] = -920 * MAP_SCALE;
        if (arr[i + 2] > -750 * MAP_SCALE) arr[i + 2] = -1410 * MAP_SCALE;

        const groundY = getTerrainHeight(arr[i + 0], arr[i + 2]);
        if (arr[i + 1] < groundY + 1.5 || arr[i + 1] > groundY + 45) {
          arr[i + 1] = groundY + 3 + (i % 30);
        }
      }
      pos.needsUpdate = true;
    }
  }

  // --- Volumetric Low-poly Clouds ---
  const cloudMeshes = [];
  function buildClouds() {
    const cloudCount = 120;
    const cloudGeo = new THREE.DodecahedronGeometry(1, 1);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
    });

    for (let c = 0; c < cloudCount; c++) {
      const cloudGroup = new THREE.Group();
      const puffCount = 5 + Math.floor(Math.random() * 6);

      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        const radius = 25 + Math.random() * 25;
        puff.scale.set(radius * 1.5, radius * 0.8, radius);
        puff.position.set(
          (Math.random() - 0.5) * 70,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 60
        );
        cloudGroup.add(puff);
      }

      cloudGroup.position.set(
        CONFIG.minX + Math.random() * CONFIG.worldWidth,
        450 + Math.random() * 650,
        CONFIG.minZ + Math.random() * CONFIG.worldLength
      );
      cloudGroup.userData = { speed: 4 + Math.random() * 6 };

      scene.add(cloudGroup);
      cloudMeshes.push(cloudGroup);
    }
  }

  // --- Aircraft Definitions & Construction (4 Stat Tiers: Agility / Speed / Damage / Health) ---
  // Every plane rates 0..4 on each stat, base tier is 2. Raw values are looked up per tier.
  // Tier 2 is the shared base; the other tiers sit well apart so each step is clearly felt in play.
  // Speed steps ~16% of top speed; agility ~±30-40% per step; damage & health scale ~x1.5 per tier.
  const STAT_TIER_MIN = 0;
  const STAT_TIER_MAX = 4;
  const STAT_TIER_BASE = 2;
  const STAT_TIER_VALUES = {
    //                tier:  0     1     2     3     4
    cruiseAirspeed:  [300,  380,  460,  540,  620],  // km/h      (speed)
    maxAirspeed:     [380,  470,  560,  650,  740],  // km/h WEP  (speed)
    arcadeRollRate:  [1.10, 1.70, 2.30, 3.00, 3.70], // rad/s     (agility)
    arcadePitchRate: [0.50, 0.80, 1.10, 1.50, 1.90], // rad/s     (agility)
    arcadeYawRate:   [0.30, 0.44, 0.58, 0.78, 0.98], // rad/s     (agility)
    damagePerShot:   [5,    9,    14,   22,   32],   // HP/hit    (damage)
    maxHp:           [50,   80,   120,  180,  270]   // HP        (health)
  };

  const BASE_AIRCRAFT_STATS = {
    takeoffSpeed: 120,     // km/h
    stallSpeed: 95         // km/h
  };

  function clampStatTier(tier) {
    const t = Math.round(typeof tier === 'number' ? tier : STAT_TIER_BASE);
    return Math.max(STAT_TIER_MIN, Math.min(STAT_TIER_MAX, t));
  }

  // Fills a def's raw performance values from its stats { agility, speed, damage, health }
  function applyStatTiers(def) {
    const s = def.stats || {};
    def.stats = {
      agility: clampStatTier(s.agility),
      speed: clampStatTier(s.speed),
      damage: clampStatTier(s.damage),
      health: clampStatTier(s.health)
    };
    const V = STAT_TIER_VALUES;
    def.cruiseAirspeed = V.cruiseAirspeed[def.stats.speed];
    def.maxAirspeed = V.maxAirspeed[def.stats.speed];
    def.arcadeRollRate = V.arcadeRollRate[def.stats.agility];
    def.arcadePitchRate = V.arcadePitchRate[def.stats.agility];
    def.arcadeYawRate = V.arcadeYawRate[def.stats.agility];
    def.maxHp = V.maxHp[def.stats.health];
    if (def.weapons) def.weapons.damagePerShot = V.damagePerShot[def.stats.damage];
    return def;
  }

  const AIRCRAFT_ORDER = ['mustang', 'zero', 'bf109', 'il2', 'spitfire', 'sm79'];

  // Standard belly rack: 2 bombs. Listed in reverse drop order (the last entry is released first).
  const DEFAULT_BOMB_RACK = [
    new THREE.Vector3(0.32, -0.54, 0.38),
    new THREE.Vector3(-0.32, -0.54, 0.38)
  ];

  const AIRCRAFT_DEFS = {
    // 1. P-51D Mustang — SPECIALTY: HIGHER SPEED
    mustang: {
      id: 'mustang',
      name: 'P-51D Mustang',
      shortName: 'P-51 MUSTANG',
      nation: 'USAAF "Red Tail"',
      specialty: '⚡ HIGHER SPEED',
      specialtyColor: '#38bdf8',
      badge: 'SPEED+',
      stats: { agility: 2, speed: 4, damage: 2, health: 2 }, // ★ SPEED 4
      takeoffSpeed: BASE_AIRCRAFT_STATS.takeoffSpeed,
      stallSpeed: BASE_AIRCRAFT_STATS.stallSpeed,
      camDist: 15.0,
      camHeight: 3.7,
      cockpitOffset: new THREE.Vector3(0, 0.90, 0.15),
      wingtipSpan: 5.3,
      engineFreq: 118,
      hardpoints: [
        new THREE.Vector3(-1.85, -0.22, 1.45),
        new THREE.Vector3(1.85, -0.22, 1.45),
        new THREE.Vector3(-2.15, -0.20, 1.40),
        new THREE.Vector3(2.15, -0.20, 1.40)
      ],
      weapons: {
        name: '6x 12.7mm M2 Browning',
        caliber: 12.7,
        muzzleVelocity: 820,
        fireRateRpm: 780,
        tracerColor: 0xffb703,
        tracerLength: 18.0,
        convergenceDistance: 600,
        heatPerShot: 0.008
      }
    },

    // 2. Mitsubishi A6M2 Zero — SPECIALTY: HIGHER MANEUVERABILITY
    zero: {
      id: 'zero',
      name: 'Mitsubishi A6M2 Zero',
      shortName: 'A6M2 ZERO',
      nation: 'Imperial Japanese Navy',
      specialty: '🔄 HIGHER MANEUVERABILITY',
      specialtyColor: '#22c55e',
      badge: 'TURN+',
      stats: { agility: 4, speed: 2, damage: 2, health: 2 }, // ★ AGILITY 4
      takeoffSpeed: 105,
      stallSpeed: 82,
      camDist: 14.8,
      camHeight: 3.6,
      cockpitOffset: new THREE.Vector3(0, 0.88, 0.35),
      wingtipSpan: 5.8,
      engineFreq: 102,
      hardpoints: [
        new THREE.Vector3(-0.22, 0.48, 3.65),
        new THREE.Vector3(0.22, 0.48, 3.65),
        new THREE.Vector3(-2.25, -0.24, 1.65),
        new THREE.Vector3(2.25, -0.24, 1.65)
      ],
      weapons: {
        name: '2x 20mm Type 99 & 2x 7.7mm',
        caliber: 20.0,
        muzzleVelocity: 750,
        fireRateRpm: 750,
        tracerColor: 0xfde047,
        tracerLength: 17.0,
        convergenceDistance: 600,
        heatPerShot: 0.008
      }
    },

    // 3. Messerschmitt Bf 109 — SPECIALTY: HIGHER DAMAGE
    bf109: {
      id: 'bf109',
      name: 'Messerschmitt Bf 109',
      shortName: 'BF 109 "YELLOW 14"',
      nation: 'Luftwaffe',
      specialty: '💥 HIGHER DAMAGE',
      specialtyColor: '#ef4444',
      badge: 'DAMAGE+',
      stats: { agility: 2, speed: 2, damage: 4, health: 2 }, // ★ DAMAGE 4
      takeoffSpeed: BASE_AIRCRAFT_STATS.takeoffSpeed,
      stallSpeed: BASE_AIRCRAFT_STATS.stallSpeed,
      camDist: 14.6,
      camHeight: 3.6,
      cockpitOffset: new THREE.Vector3(0, 0.86, 0.35),
      wingtipSpan: 4.9,
      engineFreq: 112,
      hardpoints: [
        new THREE.Vector3(-0.18, 0.48, 3.55),
        new THREE.Vector3(0.18, 0.48, 3.55),
        new THREE.Vector3(-2.10, -0.26, 1.50),
        new THREE.Vector3(2.10, -0.26, 1.50)
      ],
      weapons: {
        name: '20mm MG 151/20 Minengeschoß',
        caliber: 20.0,
        muzzleVelocity: 785,
        fireRateRpm: 750,
        tracerColor: 0xff5500,
        tracerLength: 20.0,
        convergenceDistance: 600,
        heatPerShot: 0.009
      }
    },

    // 4. Ilyushin Il-2 Sturmovik — SPECIALTY: HIGHER HEALTH
    il2: {
      id: 'il2',
      name: 'Ilyushin Il-2 Sturmovik',
      shortName: 'IL-2 STURMOVIK',
      nation: 'Soviet VVS "Flying Tank"',
      specialty: '🛡️ HIGHER HEALTH',
      specialtyColor: '#f59e0b',
      badge: 'HEALTH+',
      stats: { agility: 2, speed: 2, damage: 2, health: 4 }, // ★ HEALTH 4
      takeoffSpeed: BASE_AIRCRAFT_STATS.takeoffSpeed,
      stallSpeed: BASE_AIRCRAFT_STATS.stallSpeed,
      camDist: 16.5,
      camHeight: 4.1,
      cockpitOffset: new THREE.Vector3(0, 0.96, 0.45),
      wingtipSpan: 6.1,
      engineFreq: 92,
      hardpoints: [
        new THREE.Vector3(-2.45, -0.28, 1.85),
        new THREE.Vector3(2.45, -0.28, 1.85),
        new THREE.Vector3(-3.10, -0.26, 1.55),
        new THREE.Vector3(3.10, -0.26, 1.55)
      ],
      weapons: {
        name: '2x 23mm VYa-23 & 2x ShKAS',
        caliber: 23.0,
        muzzleVelocity: 770,
        fireRateRpm: 750,
        tracerColor: 0xff9f1c,
        tracerLength: 18.0,
        convergenceDistance: 600,
        heatPerShot: 0.008
      }
    },

    // 5. Supermarine Spitfire Mk I — SPECIALTY: ALL-ROUNDER (no single 4, three 3s)
    spitfire: {
      id: 'spitfire',
      name: 'Supermarine Spitfire Mk I',
      shortName: 'SPITFIRE MK I',
      nation: 'RAF Fighter Command',
      specialty: '✈️ ALL-ROUNDER',
      specialtyColor: '#a78bfa',
      badge: 'BALANCED+',
      stats: { agility: 3, speed: 3, damage: 3, health: 2 },
      takeoffSpeed: BASE_AIRCRAFT_STATS.takeoffSpeed,
      stallSpeed: BASE_AIRCRAFT_STATS.stallSpeed,
      camDist: 15.0,
      camHeight: 3.7,
      cockpitOffset: new THREE.Vector3(0, 0.84, -0.05),
      wingtipSpan: 5.2,
      engineFreq: 115,
      hardpoints: [
        new THREE.Vector3(-1.95, -0.20, 1.30),
        new THREE.Vector3(1.95, -0.20, 1.30),
        new THREE.Vector3(-2.60, -0.17, 1.20),
        new THREE.Vector3(2.60, -0.17, 1.20)
      ],
      weapons: {
        name: '8x .303 Browning Mk II',
        caliber: 7.7,
        muzzleVelocity: 810,
        fireRateRpm: 780,
        tracerColor: 0xfef08a,
        tracerLength: 17.0,
        convergenceDistance: 600,
        heatPerShot: 0.008
      }
    },

    // 6. Savoia-Marchetti SM.79 Sparviero — SPECIALTY: HEAVY BOMBER (health 4, 3x bomb load)
    sm79: {
      id: 'sm79',
      name: 'Savoia-Marchetti SM.79 Sparviero',
      shortName: 'SM.79 SPARVIERO',
      nation: 'Regia Aeronautica "258-6"',
      specialty: '💣 HEAVY BOMBER',
      specialtyColor: '#f97316',
      badge: 'BOMBER+',
      stats: { agility: 1, speed: 1, damage: 1, health: 4 },
      takeoffSpeed: BASE_AIRCRAFT_STATS.takeoffSpeed,
      stallSpeed: BASE_AIRCRAFT_STATS.stallSpeed,
      camDist: 22.0,
      camHeight: 5.2,
      cockpitOffset: new THREE.Vector3(0, 1.32, 1.85),
      wingtipSpan: 7.8,
      engineFreq: 88,
      // Dorsal gunner: a swivelling 12.7mm Breda behind the hump that automatically fires on enemies
      // behind / above / beside the aircraft (never straight ahead or below). `mount` matches the model's pivot.
      dorsalGunner: {
        mount: new THREE.Vector3(0, 1.36, -2.3),
        range: 850,        // m
        rpm: 520,
        spread: 0.016,     // rad of gunner inaccuracy
        burstOn: 0.9,      // s firing
        burstOff: 0.6      // s pause
      },
      // Fixed 12.7mm Breda-SAFAT firing forward from the top of the "Gobbo" hump
      hardpoints: [
        new THREE.Vector3(-0.05, 1.55, 2.4),
        new THREE.Vector3(0.05, 1.55, 2.4),
        new THREE.Vector3(-0.05, 1.55, 2.4),
        new THREE.Vector3(0.05, 1.55, 2.4)
      ],
      // 6 bombs (3x the standard 2): two rows of three beside the ventral gondola
      bombRack: [
        new THREE.Vector3(0.55, -0.85, 2.4),
        new THREE.Vector3(-0.55, -0.85, 2.4),
        new THREE.Vector3(0.55, -0.85, 0.9),
        new THREE.Vector3(-0.55, -0.85, 0.9),
        new THREE.Vector3(0.55, -0.85, -0.6),
        new THREE.Vector3(-0.55, -0.85, -0.6)
      ],
      weapons: {
        name: '3x 12.7mm Breda-SAFAT',
        caliber: 12.7,
        muzzleVelocity: 765,
        fireRateRpm: 700,
        tracerColor: 0xfde68a,
        tracerLength: 18.0,
        convergenceDistance: 600,
        heatPerShot: 0.008
      }
    }
  };
  AIRCRAFT_ORDER.forEach(id => {
    applyStatTiers(AIRCRAFT_DEFS[id]);
    if (!AIRCRAFT_DEFS[id].bombRack) AIRCRAFT_DEFS[id].bombRack = DEFAULT_BOMB_RACK;
  });

  // =========================================================================
  // --- FACTIONS MODE: 6 nations x 3 aircraft types (fighter / heavy fighter / bomber) ---
  // Every aircraft of a nation shares the nation's bonus. Role decides the base stats, bomb load and rear gunner:
  //   fighter 0 bombs, heavy fighter 1 bomb, bomber 3 bombs + rear gunner (only bombers have one).
  // `standIn` is the existing 3D model used until a nation's own historical model is built (spec.modelId).
  // =========================================================================
  const FACTION_ORDER = ['usa', 'germany', 'britain', 'ussr', 'japan', 'italy'];
  const FACTION_ROLES = ['fighter', 'heavy', 'bomber'];
  const FACTION_ROLE_LABEL = { fighter: 'FIGHTER', heavy: 'HEAVY FIGHTER', bomber: 'BOMBER' };
  const FACTION_ROLE_STATS = {
    fighter: { agility: 3, speed: 3, damage: 2, health: 2 },
    heavy:   { agility: 2, speed: 2, damage: 3, health: 3 },
    bomber:  { agility: 1, speed: 1, damage: 1, health: 4 }
  };
  const FACTION_ROLE_BOMBS = { fighter: 0, heavy: 1, bomber: 3 };
  const FACTION_LIVES_PER_TYPE = 2;
  const FACTION_TEAM_COUNT = 4;       // the player's nation + 3 random AI nations
  // Italian "Cooling": slower gun overheating, quicker cooldown and a better WEP
  const COOLING_HEAT_FACTOR = 0.6;
  const COOLING_WEP = { maxDuration: 13.0, cooldownMax: 10.0 };

  const FACTIONS = {
    usa: {
      id: 'usa', name: 'United States', short: 'USA', color: '#3b82f6',
      bonusId: 'speed', bonusStat: 'speed', bonusName: 'SPEED', bonusIcon: '⚡', bonusText: 'Higher speed on every aircraft',
      planes: { fighter: 'usa_fighter', heavy: 'usa_heavy', bomber: 'usa_bomber' }
    },
    germany: {
      id: 'germany', name: 'Germany', short: 'GER', color: '#facc15',
      bonusId: 'damage', bonusStat: 'damage', bonusName: 'DAMAGE', bonusIcon: '💥', bonusText: 'Harder-hitting guns on every aircraft',
      planes: { fighter: 'germany_fighter', heavy: 'germany_heavy', bomber: 'germany_bomber' }
    },
    britain: {
      id: 'britain', name: 'Britain', short: 'GBR', color: '#14b8a6',
      bonusId: 'payload', bonusStat: null, bonusName: 'PAYLOAD', bonusIcon: '💣', bonusText: '+1 bomb on every aircraft',
      planes: { fighter: 'britain_fighter', heavy: 'britain_heavy', bomber: 'britain_bomber' }
    },
    ussr: {
      id: 'ussr', name: 'Soviet Union', short: 'URS', color: '#ef4444',
      bonusId: 'hp', bonusStat: 'health', bonusName: 'HP', bonusIcon: '🛡️', bonusText: 'More armor on every aircraft',
      planes: { fighter: 'ussr_fighter', heavy: 'ussr_heavy', bomber: 'ussr_bomber' }
    },
    japan: {
      id: 'japan', name: 'Japan', short: 'JPN', color: '#f1f5f9',
      bonusId: 'agility', bonusStat: 'agility', bonusName: 'AGILITY', bonusIcon: '🔄', bonusText: 'Tighter turns on every aircraft',
      planes: { fighter: 'japan_fighter', heavy: 'japan_heavy', bomber: 'japan_bomber' }
    },
    italy: {
      id: 'italy', name: 'Italy', short: 'ITA', color: '#22c55e',
      bonusId: 'cooling', bonusStat: null, bonusName: 'COOLING', bonusIcon: '❄️', bonusText: 'Guns overheat slower, longer WEP, shorter WEP cooldown',
      planes: { fighter: 'italy_fighter', heavy: 'italy_heavy', bomber: 'italy_bomber' }
    }
  };
  FACTION_ORDER.forEach(n => { FACTIONS[n].colorHex = parseInt(FACTIONS[n].color.slice(1), 16); });

  // Historical aircraft per nation / role. standIn = existing model used until the real one exists.
  const FACTION_AIRCRAFT_SPECS = [
    { nation: 'usa',     role: 'fighter', name: 'North American P-51D Mustang',   short: 'P-51D MUSTANG',   sub: 'USAAF 8th Air Force',         standIn: 'mustang',  modelId: 'p51d', gun: ['6x 12.7mm M2 Browning', 12.7] },
    { nation: 'usa',     role: 'heavy',   name: 'Lockheed P-38L Lightning',       short: 'P-38L LIGHTNING', sub: 'USAAF 9th Air Force',         standIn: 'sm79',     modelId: 'p38',
      gun: ['1x 20mm Hispano & 4x 12.7mm M2', 20.0],
      view: { camDist: 17.5, camHeight: 4.4, cockpit: [0, 0.85, 0.55], span: 6.7 },
      hardpoints: [[-0.13, 0.07, 4.1], [0.13, 0.07, 4.1], [-0.07, -0.1, 3.95], [0.07, -0.1, 3.95]],
      rack: [[0, -0.8, 0.5]] },
    { nation: 'usa',     role: 'bomber',  name: 'North American B-25J Mitchell',  short: 'B-25J MITCHELL',  sub: 'USAAF 12th Air Force',        standIn: 'sm79',     modelId: 'b25',
      gun: ['Turret 12.7mm M2 Browning', 12.7],
      view: { camDist: 23, camHeight: 5.6, cockpit: [0, 0.95, 3.1], span: 8.7 },
      hardpoints: [[-0.12, 0.1, 6.5], [0.12, 0.1, 6.5], [-0.12, -0.1, 6.5], [0.12, -0.1, 6.5]],
      rack: [[0, -1.0, 1.4], [0, -1.0, 0.3], [0, -1.0, -0.8]],
      gunner: { mount: [0, 1.28, 0.4], range: 850, rpm: 560, spread: 0.016, burstOn: 0.9, burstOff: 0.6 } },
    { nation: 'germany', role: 'fighter', name: 'Messerschmitt Bf 109G',          short: 'BF 109G',         sub: 'Luftwaffe Jagdgeschwader',    standIn: 'bf109',    gun: ['20mm MG 151/20 & 2x 13mm MG 131', 20.0] },
    { nation: 'germany', role: 'heavy',   name: 'Messerschmitt Bf 110G',          short: 'BF 110G',         sub: 'Luftwaffe Zerstörergeschwader', standIn: 'sm79',   modelId: 'bf110',
      gun: ['2x 30mm MK 108 & 2x 20mm MG FF', 30.0],
      view: { camDist: 17, camHeight: 4.3, cockpit: [0, 0.85, 1.1], span: 6.9 },
      hardpoints: [[-0.15, 0.1, 5.1], [0.15, 0.1, 5.1], [-0.1, -0.1, 4.95], [0.1, -0.1, 4.95]],
      rack: [[0, -0.8, 0.4]] },
    { nation: 'germany', role: 'bomber',  name: 'Heinkel He 111H',                short: 'HE 111H',         sub: 'Luftwaffe Kampfgeschwader',   standIn: 'sm79',     modelId: 'he111',
      gun: ['Dorsal 7.92mm MG 15', 7.92],
      view: { camDist: 22, camHeight: 5.4, cockpit: [0, 0.55, 4.5], span: 9.6 },
      hardpoints: [[0.1, 0.2, 6.5], [0.1, 0.2, 6.5], [0.1, 0.2, 6.5], [0.1, 0.2, 6.5]],
      rack: [[0, -0.95, 1.6], [0, -0.95, 0.4], [0, -0.95, -0.8]],
      gunner: { mount: [0, 1.0, -1.25], range: 800, rpm: 520, spread: 0.018, burstOn: 0.9, burstOff: 0.6 } },
    { nation: 'britain', role: 'fighter', name: 'Supermarine Spitfire Mk IX',     short: 'SPITFIRE MK IX',  sub: 'RAF Fighter Command',         standIn: 'spitfire', modelId: 'spitfire9', gun: ['2x 20mm Hispano & 4x .303 Browning', 20.0] },
    { nation: 'britain', role: 'heavy',   name: 'Bristol Beaufighter Mk VI',      short: 'BEAUFIGHTER',     sub: 'RAF Coastal Command',         standIn: 'sm79',     modelId: 'beaufighter',
      gun: ['4x 20mm Hispano & 6x .303 Browning', 20.0],
      view: { camDist: 17.5, camHeight: 4.4, cockpit: [0, 0.9, 2.2], span: 7.5 },
      hardpoints: [[-0.16, -0.3, 5.0], [0.16, -0.3, 5.0], [-0.16, -0.43, 5.0], [0.16, -0.43, 5.0]],
      rack: [[0, -0.8, 0.5], [0, -0.8, -0.7]] },
    { nation: 'britain', role: 'bomber',  name: 'Avro Lancaster B Mk I',          short: 'LANCASTER',       sub: 'RAF Bomber Command',          standIn: 'sm79',     modelId: 'lancaster',
      gun: ['Turrets 8x .303 Browning', 7.7],
      view: { camDist: 28, camHeight: 6.6, cockpit: [0, 0.95, 4.4], span: 13.2 },
      hardpoints: [[-0.08, 0.62, 7.2], [0.08, 0.62, 7.2], [-0.08, 0.62, 7.2], [0.08, 0.62, 7.2]],
      rack: [[0, -1.0, 2.2], [0, -1.0, 0.8], [0, -1.0, -0.6], [0, -1.0, -2.0]],
      gunner: { mount: [0, 1.25, 0.6], range: 850, rpm: 600, spread: 0.02, burstOn: 1.0, burstOff: 0.6 } },
    { nation: 'ussr',    role: 'fighter', name: 'Yakovlev Yak-1',                 short: 'YAK-1',           sub: 'Soviet VVS Guards',           standIn: 'bf109',    modelId: 'yak1',
      gun: ['20mm ShVAK & 12.7mm UBS', 20.0],
      view: { camDist: 14.5, camHeight: 3.6, cockpit: [0, 0.7, 0.1], span: 4.3 },
      hardpoints: [[-0.1, 0.4, 3.95], [0.1, 0.4, 3.95], [-0.1, 0.4, 3.95], [0.1, 0.4, 3.95]] },
    { nation: 'ussr',    role: 'heavy',   name: 'Yakovlev Yak-2',                 short: 'YAK-2',           sub: 'Soviet VVS Frontal Aviation', standIn: 'sm79',     modelId: 'yak2',
      gun: ['4x 7.62mm ShKAS', 7.62],
      view: { camDist: 16, camHeight: 4.0, cockpit: [0, 0.85, 1.4], span: 6.1 },
      hardpoints: [[-0.12, 0.1, 4.85], [0.12, 0.1, 4.85], [-0.12, -0.08, 4.85], [0.12, -0.08, 4.85]],
      rack: [[0, -0.75, 0.3]] },
    { nation: 'ussr',    role: 'bomber',  name: 'Ilyushin Il-4',                  short: 'IL-4',            sub: 'Soviet Long-Range Aviation',  standIn: 'sm79',     modelId: 'il4',
      gun: ['Turret 7.62mm ShKAS', 7.62],
      view: { camDist: 23, camHeight: 5.4, cockpit: [0, 0.8, 2.6], span: 9.1 },
      hardpoints: [[0, 0.0, 5.8], [0, 0.0, 5.8], [0, 0.0, 5.8], [0, 0.0, 5.8]],
      rack: [[0, -0.95, 1.4], [0, -0.95, 0.2], [0, -0.95, -1.0]],
      gunner: { mount: [0, 0.95, -1.5], range: 800, rpm: 560, spread: 0.018, burstOn: 0.9, burstOff: 0.6 } },
    { nation: 'japan',   role: 'fighter', name: 'Mitsubishi A6M Zero',            short: 'A6M ZERO',        sub: 'Imperial Japanese Navy',      standIn: 'zero',     gun: ['2x 20mm Type 99 & 2x 7.7mm', 20.0] },
    { nation: 'japan',   role: 'heavy',   name: 'Kawasaki Ki-45 Toryu',           short: 'KI-45 TORYU',     sub: 'Imperial Japanese Army',      standIn: 'sm79',     modelId: 'ki45',
      gun: ['37mm Ho-203 & 2x 12.7mm Ho-103', 37.0],
      view: { camDist: 16.5, camHeight: 4.2, cockpit: [0, 0.8, 1.0], span: 6.4 },
      hardpoints: [[-0.1, 0.08, 4.85], [0.1, 0.08, 4.85], [0, -0.28, 5.05], [0, -0.28, 5.05]],
      rack: [[0, -0.75, 0.4]] },
    { nation: 'japan',   role: 'bomber',  name: 'Mitsubishi G4M "Betty"',         short: 'G4M BETTY',       sub: 'Imperial Japanese Navy',      standIn: 'sm79',     modelId: 'g4m',
      gun: ['Turrets 20mm Type 99 & 7.7mm', 20.0],
      view: { camDist: 26, camHeight: 6.0, cockpit: [0, 1.0, 4.8], span: 10.6 },
      hardpoints: [[0, 0.05, 8.0], [0, 0.05, 8.0], [0, 0.05, 8.0], [0, 0.05, 8.0]],
      rack: [[0, -1.15, 1.4], [0, -1.15, 0.2], [0, -1.15, -1.0]],
      gunner: { mount: [0, 1.42, -1.0], range: 850, rpm: 520, spread: 0.016, burstOn: 0.9, burstOff: 0.6 } },
    { nation: 'italy',   role: 'fighter', name: 'Macchi C.205 Veltro',            short: 'C.205 VELTRO',    sub: 'Regia Aeronautica',           standIn: 'bf109',    modelId: 'c205',
      gun: ['2x 20mm MG 151 & 2x 12.7mm Breda', 20.0],
      view: { camDist: 14.5, camHeight: 3.6, cockpit: [0, 0.7, 0.15], span: 4.5 },
      hardpoints: [[-0.12, 0.4, 3.95], [0.12, 0.4, 3.95], [-1.7, -0.3, 1.6], [1.7, -0.3, 1.6]] },
    { nation: 'italy',   role: 'heavy',   name: 'Breda Ro.57',                    short: 'RO.57',           sub: 'Regia Aeronautica',           standIn: 'sm79',     modelId: 'ro57',
      gun: ['2x 12.7mm Breda-SAFAT', 12.7],
      view: { camDist: 15.5, camHeight: 3.9, cockpit: [0, 0.75, 0.5], span: 5.4 },
      hardpoints: [[-0.1, 0.04, 4.45], [0.1, 0.04, 4.45], [-0.1, 0.04, 4.45], [0.1, 0.04, 4.45]],
      rack: [[0, -0.75, 0.3]] },
    { nation: 'italy',   role: 'bomber',  name: 'Savoia-Marchetti SM.79 Sparviero', short: 'SM.79 SPARVIERO', sub: 'Regia Aeronautica "258-6"', standIn: 'sm79',     gun: ['3x 12.7mm Breda-SAFAT', 12.7] }
  ];

  // Bomb rack with `count` slots: reuse the stand-in's slots, add more (listed in reverse drop order) if needed
  function makeFactionBombRack(count, baseRack) {
    const rack = [];
    for (let i = 0; i < count; i++) {
      if (baseRack && baseRack[i]) { rack.push(baseRack[i].clone()); continue; }
      const side = (i % 2 === 0) ? 0.55 : -0.55;
      rack.push(new THREE.Vector3(side, -0.85, 2.4 - 1.5 * Math.floor(i / 2)));
    }
    return rack;
  }

  function buildFactionDefs() {
    FACTION_AIRCRAFT_SPECS.forEach(spec => {
      const nat = FACTIONS[spec.nation];
      const base = AIRCRAFT_DEFS[spec.standIn];
      const id = nat.planes[spec.role];
      const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);
      const view = spec.view || null;
      const stats = Object.assign({}, FACTION_ROLE_STATS[spec.role]);
      if (nat.bonusStat) stats[nat.bonusStat] = Math.min(STAT_TIER_MAX, stats[nat.bonusStat] + 1);
      const bombCount = FACTION_ROLE_BOMBS[spec.role] + (nat.bonusId === 'payload' ? 1 : 0);
      const weapons = Object.assign({}, base.weapons, { name: spec.gun[0], caliber: spec.gun[1] });
      if (nat.bonusId === 'cooling') weapons.heatPerShot = base.weapons.heatPerShot * COOLING_HEAT_FACTOR;
      const def = {
        id,
        faction: true,
        nationId: spec.nation,
        role: spec.role,
        modelId: spec.modelId || spec.standIn,   // which 3D builder to call
        name: spec.name,
        shortName: spec.short,
        nation: spec.sub,
        specialty: `${nat.bonusIcon} ${nat.short} BONUS: ${nat.bonusName}`,
        specialtyColor: nat.color,
        badge: `${nat.bonusName}+`,
        teamColor: nat.colorHex,
        stats,
        takeoffSpeed: base.takeoffSpeed,
        stallSpeed: base.stallSpeed,
        camDist: view ? view.camDist : base.camDist,
        camHeight: view ? view.camHeight : base.camHeight,
        cockpitOffset: view ? v3(view.cockpit) : base.cockpitOffset.clone(),
        wingtipSpan: view ? view.span : base.wingtipSpan,
        engineFreq: base.engineFreq,
        hardpoints: spec.hardpoints ? spec.hardpoints.map(v3) : base.hardpoints.map(v => v.clone()),
        bombRack: makeFactionBombRack(bombCount, spec.rack ? spec.rack.map(v3) : base.bombRack),
        weapons,
        coolingBonus: nat.bonusId === 'cooling'
      };
      // Only bombers carry a rear gunner
      if (spec.role === 'bomber') {
        const dg = spec.gunner || base.dorsalGunner || AIRCRAFT_DEFS.sm79.dorsalGunner;
        const mount = Array.isArray(dg.mount) ? v3(dg.mount) : dg.mount.clone();
        def.dorsalGunner = Object.assign({}, dg, { mount });
      }
      Object.assign(def, spec.overrides || {});
      applyStatTiers(def);
      AIRCRAFT_DEFS[id] = def;
    });
  }
  buildFactionDefs();

  // Builds the 3D model for any aircraft id (classic or faction) and paints the nation's team colour on it
  function createAircraftModel(planeId) {
    const def = AIRCRAFT_DEFS[planeId];
    const modelData = WW2AircraftBuilders.createAircraftById(def && def.modelId ? def.modelId : planeId);
    if (def && def.faction && modelData && modelData.group) applyTeamColorMarkings(modelData, def);
    return modelData;
  }

  // Team colour marks on top of the historical paint: spinner/nose band, tail band and wingtip caps
  function applyTeamColorMarkings(modelData, def) {
    const mat = new THREE.MeshStandardMaterial({ color: def.teamColor, roughness: 0.45, metalness: 0.1, emissive: def.teamColor, emissiveIntensity: 0.25 });
    const span = def.wingtipSpan || 5.5;
    const group = modelData.group;
    // Models built for Factions describe where their team marks go (wingtip caps + each fin top)
    const marks = modelData.teamMarks;
    const wt = marks ? marks.wingtip : { x: span - 0.05, y: 0.0, z: 0.5 };
    for (const side of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.62), mat);
      cap.position.set(side * wt.x, wt.y, wt.z);
      group.add(cap);
    }
    const tails = marks ? marks.tails : [{ x: 0, y: 1.05, z: -(def.role === 'bomber' ? 6.4 : 4.0) }];
    for (const t of tails) {
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.7), mat);
      tail.position.set(t.x, t.y, t.z);
      group.add(tail);
    }
  }

  // ---- Factions match state & helpers ----
  function isFactionsMatch() { return state.gameMode === 'factions' && Boolean(state.factionMatch); }

  function makeTypeLives() {
    const o = {};
    FACTION_ROLES.forEach(r => { o[r] = FACTION_LIVES_PER_TYPE; });
    return o;
  }
  function sumTypeLives(tl) { return FACTION_ROLES.reduce((s, r) => s + (tl[r] || 0), 0); }
  function pickRandomRoleWithLives(tl) {
    const avail = FACTION_ROLES.filter(r => (tl[r] || 0) > 0);
    return avail.length ? avail[Math.floor(Math.random() * avail.length)] : null;
  }
  function factionBotCruiseKmh(def) { return Math.round((def.cruiseAirspeed || 460) * 0.62); }
  // Patrol orbit size / altitude per aircraft type (bigger, higher loops for the heavy types)
  const FACTION_PATROL = {
    fighter: { radius: 1800, alt: 520 },
    heavy:   { radius: 2000, alt: 470 },
    bomber:  { radius: 2300, alt: 640 }
  };

  // Draws the 3 AI nations at random from the 5 the player did not pick and resets the player's lives (2 per type)
  function setupFactionMatch() {
    const others = FACTION_ORDER.filter(n => n !== state.factionNation);
    for (let i = others.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    state.factionMatch = { playerNation: state.factionNation, aiNations: others.slice(0, FACTION_TEAM_COUNT - 1) };
    state.maxLivesPerPlane = FACTION_LIVES_PER_TYPE;
    state.aircraftLives = {};
    FACTION_ROLES.forEach(r => { state.aircraftLives[FACTIONS[state.factionNation].planes[r]] = FACTION_LIVES_PER_TYPE; });
    state.pendingRespawnPlane = null;
  }

  // Random aircraft type of the player's nation (for the player's AI wingmen)
  function getAllySpawnPlaneId() {
    if (!isFactionsMatch()) return state.selectedAircraft || 'mustang';
    const role = FACTION_ROLES[Math.floor(Math.random() * FACTION_ROLES.length)];
    return FACTIONS[state.factionMatch.playerNation].planes[role];
  }

  // Gives a freshly built AI plane its nation, 2-lives-per-type pool and team-coloured HUD marker
  function initFactionPlaneState(p, nationId, planeId) {
    const def = AIRCRAFT_DEFS[planeId];
    p.nationId = nationId; p.sideKey = p.isFriendly ? 'player' : nationId;
    p.planeRole = def.role;
    p.typeLives = makeTypeLives();
    p.lives = sumTypeLives(p.typeLives);
    p.maxLives = p.lives;
    if (p.markerEl) {
      p.markerEl.classList.add('faction');
      p.markerEl.style.setProperty('--team', FACTIONS[nationId].color);
    }
  }

  // Swap an AI plane (enemy or ally) to another aircraft type of its nation, keeping its position
  function setFactionPlaneType(p, role) {
    const planeId = FACTIONS[p.nationId].planes[role];
    const def = AIRCRAFT_DEFS[planeId];
    const modelData = createAircraftModel(planeId);
    const prevPos = p.currentPos.clone();
    const prevQuat = p.group.quaternion.clone();
    if (p.group) scene.remove(p.group);
    p.planeRole = role;
    p.planeId = planeId;
    p.def = def;
    p.modelData = modelData;
    p.group = modelData.group;
    p.maxHp = def.maxHp || 120;
    p.hp = p.maxHp;
    p.cruiseSpeedKmh = p.isFriendly ? (def.cruiseAirspeed || 320) : factionBotCruiseKmh(def);
    p.hardpointIndex = 0;
    p.gunner = null;
    p.group.position.copy(prevPos);
    p.group.quaternion.copy(prevQuat);
    scene.add(p.group);
    if (modelData.setGearDeployment) modelData.setGearDeployment(p.gearPos !== undefined ? p.gearPos : 1.0);
    if (!p.isFriendly) {
      p.callsign = `${FACTIONS[p.nationId].short} ${def.shortName} #${p.memberNumber || 1}`;
      const pat = FACTION_PATROL[role];
      p.radius = pat.radius;
      p.baseAlt = pat.alt;
    }
    if (p.labelEl && p.isFriendly) p.labelEl.textContent = `WING ${def.shortName}`;
  }

  // One team of the Factions match: `teamSize` planes of one AI nation, each rolling its own aircraft type
  function createFactionEnemyTeam(tIdx, nationId, baseIdx) {
    const hudContainer = document.getElementById('enemy-hud-container');
    const nat = FACTIONS[nationId];
    const homeAf = AIRPORTS[baseIdx];
    const teamSize = THREE.MathUtils.clamp(Math.round(state.teamSize) || 2, TEAM_SIZE_MIN, TEAM_SIZE_MAX);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const pattern = Math.random() < 0.5 ? 'orbit' : 'figure8';
    const phase = Math.random() * Math.PI * 2;
    const teamId = `team_${nationId}`;
    const members = [];

    for (let mIdx = 0; mIdx < teamSize; mIdx++) {
      const role0 = FACTION_ROLES[Math.floor(Math.random() * FACTION_ROLES.length)];
      const planeId = nat.planes[role0];
      const def = AIRCRAFT_DEFS[planeId];
      const pat = FACTION_PATROL[role0];
      const memberNum = mIdx + 1;
      const modelData = createAircraftModel(planeId);
      scene.add(modelData.group);

      let markerEl = null, leadEl = null, labelEl = null, hpFillEl = null;
      if (hudContainer) {
        markerEl = document.createElement('div');
        markerEl.className = 'enemy-hud-marker';
        markerEl.innerHTML = `
          <div class="enemy-label"><div class="enemy-title"></div><div class="enemy-hp-bar"><div class="enemy-hp-fill"></div></div></div>
          <div class="enemy-target-box"></div>`;
        hudContainer.appendChild(markerEl);
        labelEl = markerEl.querySelector('.enemy-title');
        hpFillEl = markerEl.querySelector('.enemy-hp-fill');
        leadEl = document.createElement('div');
        leadEl.className = 'enemy-lead-reticle';
        hudContainer.appendChild(leadEl);
      }

      const maxHp = def.maxHp || 120;
      const ep = {
        id: `enemy_${nationId}_${memberNum}`,
        teamId,
        role: mIdx === 0 ? 'lead' : 'wingman',
        memberNumber: memberNum,
        slot: mIdx,
        teamSize,
        callsign: `${nat.short} ${def.shortName} #${memberNum}`,
        partner: null,
        planeId,
        def,
        modelData,
        group: modelData.group,
        pattern,
        centerX: THREE.MathUtils.clamp(homeAf.x * 0.7, CONFIG.minX + pat.radius + 300, CONFIG.maxX - pat.radius - 300),
        centerZ: THREE.MathUtils.clamp(homeAf.z * 0.7, CONFIG.minZ + pat.radius + 300, CONFIG.maxZ - pat.radius - 300),
        baseAlt: pat.alt,
        radius: pat.radius,
        dir,
        phase,
        cruiseSpeedKmh: factionBotCruiseKmh(def),
        currentSpeedKmh: 0,
        speedMs: 0,
        bankAngle: (dir > 0 ? 1 : -1) * (0.3 + Math.random() * 0.2),
        currentPos: new THREE.Vector3(),
        velocity: new THREE.Vector3(0, 0, 0),
        headingDeg: 0,
        hp: maxHp,
        maxHp,
        lives: 0, maxLives: 0,
        permanentlyDead: false,
        isAlive: true,
        isDying: false,
        aiState: 'takeoff',
        attackTarget: 'player',
        tacticalState: 'pursuit',
        tacticalTimer: 0.0,
        evasionType: 'barrel_roll',
        evasionDir: 1,
        burstTimer: 0.0,
        burstCooldown: 0.0,
        airfieldIndex: baseIdx,
        takeoffDelay: 0,
        gearPos: 1.0,
        breakOffTimer: 0,
        weaponHeat: 0.0,
        weaponJammed: false,
        weaponTimer: 0.0,
        hardpointIndex: 0,
        respawnTimer: 0,
        fallSpeed: 0,
        smokeTimer: 0,
        engineDamaged: false,
        wingDamaged: false,
        markerEl, leadEl, labelEl, hpFillEl
      };
      initFactionPlaneState(ep, nationId, planeId);
      members.push(ep);
      enemyPlanes.push(ep);
    }

    for (let k = 1; k < members.length; k++) members[k].partner = members[0];
    members[0].partner = members[1] || null;
    enemyTeams.push({
      teamId, nationId, sideKey: nationId,
      planeId: members[0].planeId,
      lead: members[0],
      wingman: members[1] || null,
      members
    });
    for (const m of members) {
      m.homeAirfield = baseIdx;
      assignEnemyToHomeAirbase(m);
    }
  }

  // Factions: every team is on its own, so patrols slowly wander across the theatre towards rival bases,
  // rival planes and the player (the orbit centre drifts, the plane keeps circling it) instead of staying home
  const FACTION_ROAM_SPEED = 32; // m/s drift of the orbit centre
  function updateFactionRoam(ep, dt) {
    if (ep.roamTimer === undefined) ep.roamTimer = 6 + Math.random() * 20;
    ep.roamTimer -= dt;
    if (ep.roamTimer <= 0 || !ep.roamTarget) {
      ep.roamTimer = 45 + Math.random() * 45;
      const cands = [];
      for (const af of AIRPORTS) {
        if (af.sideKey && af.sideKey !== ep.sideKey && !af.isDestroyed) cands.push({ x: af.x, z: af.z });
      }
      if (airplaneGroup && !state.isCrashed) cands.push({ x: airplaneGroup.position.x, z: airplaneGroup.position.z });
      for (const o of enemyPlanes) {
        if (o.isAlive && o.sideKey !== ep.sideKey && o.aiState !== 'takeoff') cands.push({ x: o.currentPos.x, z: o.currentPos.z });
      }
      if (cands.length) {
        const c = cands[Math.floor(Math.random() * cands.length)];
        ep.roamTarget = {
          x: THREE.MathUtils.clamp(c.x, CONFIG.minX + ep.radius + 300, CONFIG.maxX - ep.radius - 300),
          z: THREE.MathUtils.clamp(c.z, CONFIG.minZ + ep.radius + 300, CONFIG.maxZ - ep.radius - 300)
        };
      }
    }
    if (!ep.roamTarget) return;
    const dx = ep.roamTarget.x - ep.centerX;
    const dz = ep.roamTarget.z - ep.centerZ;
    const dist = Math.hypot(dx, dz);
    if (dist > 60) {
      const step = Math.min(dist, FACTION_ROAM_SPEED * dt);
      ep.centerX += (dx / dist) * step;
      ep.centerZ += (dz / dist) * step;
    }
  }

  function initFactionEnemies() {
    const fm = state.factionMatch;
    const bases = state.enemyHomeAirfields;
    fm.aiNations.forEach((nid, i) => {
      if (bases[i] !== undefined) createFactionEnemyTeam(i, nid, bases[i]);
    });
  }

  // Menu card spec line built from the live definitions (stays correct whenever tiers change).
  // Stats above / below the base tier are bold; a tier-4 specialty gets a star.
  function renderAircraftCardSpecs() {
    const basePitch = STAT_TIER_VALUES.arcadePitchRate[STAT_TIER_BASE];
    const fmt = (label, value, tier) => {
      const text = `${label}: ${value}${tier === STAT_TIER_MAX ? ' (★)' : ''}`;
      return tier === STAT_TIER_BASE ? text : `<b>${text}</b>`;
    };
    for (const id of AIRCRAFT_ORDER) {
      const def = AIRCRAFT_DEFS[id];
      const el = document.querySelector(`#card-${id} .card-specs`);
      if (!el) continue;
      const turnPct = Math.round((def.arcadePitchRate / basePitch - 1) * 100);
      const turn = turnPct === 0 ? 'Base' : `${turnPct > 0 ? '+' : '−'}${Math.abs(turnPct)}%`;
      const parts = [
        fmt('SPD', `${def.maxAirspeed} km/h`, def.stats.speed),
        fmt('TURN', turn, def.stats.agility),
        fmt('DMG', def.weapons.damagePerShot, def.stats.damage),
        fmt('HP', def.maxHp, def.stats.health)
      ];
      if (def.bombRack.length > DEFAULT_BOMB_RACK.length) parts.push(`<b>BOMBS: ${def.bombRack.length} (★)</b>`);
      if (def.dorsalGunner) parts.push('<b>DORSAL GUNNER</b>');
      el.innerHTML = parts.join(' &bull; ');
    }
  }

  function formatLivesText(lives, maxLives = 3) {
    const rem = Math.max(0, Math.min(maxLives, lives));
    return '♥'.repeat(rem) + '♡'.repeat(maxLives - rem) + ` (${rem}/${maxLives})`;
  }

  function cycleNextAircraft(maintainPos) {
    if (state.gameStarted) return; // Plane selection only allowed at start
    const idx = AIRCRAFT_ORDER.indexOf(state.selectedAircraft);
    // Find next aircraft that still has lives (or cycle if all have 0)
    for (let step = 1; step <= AIRCRAFT_ORDER.length; step++) {
      const candidate = AIRCRAFT_ORDER[(idx + step) % AIRCRAFT_ORDER.length];
      if ((state.aircraftLives[candidate] || 0) > 0 || step === AIRCRAFT_ORDER.length) {
        switchAircraft(candidate, maintainPos);
        break;
      }
    }
  }

  function switchAircraft(planeId, maintainPosition) {
    // Classic locks the aircraft once the sortie starts; Factions only changes it on respawn / wingman takeover
    if (state.gameStarted && planeId !== state.selectedAircraft && !state.factionSwitching) return;
    if (!AIRCRAFT_DEFS[planeId]) planeId = 'mustang';
    state.selectedAircraft = planeId;
    activeAircraftDef = AIRCRAFT_DEFS[planeId];
    state.playerMaxHp = activeAircraftDef.maxHp || 120;
    state.bombs.maxCount = activeAircraftDef.bombRack.length;
    state.bombs.count = state.bombs.maxCount;
    state.playerHp = state.playerMaxHp;

    // Save previous transform if maintaining position
    let prevPos = null, prevQuat = null;
    if (airplaneGroup) {
      if (maintainPosition) {
        prevPos = airplaneGroup.position.clone();
        prevQuat = airplaneGroup.quaternion.clone();
      }
      scene.remove(airplaneGroup);
    }

    if (typeof WW2AircraftBuilders !== 'undefined') {
      activeModelData = createAircraftModel(planeId);
      airplaneGroup = activeModelData.group;
      leftAileron = activeModelData.leftAileron;
      rightAileron = activeModelData.rightAileron;
      elevatorMesh = activeModelData.elevators ? activeModelData.elevators[0] : null;
      rudderMesh = activeModelData.rudders ? activeModelData.rudders[0] : null;
      propellerMesh = activeModelData.propellers ? activeModelData.propellers[0] : null;
    } else {
      activeModelData = null;
      airplaneGroup = new THREE.Group();
    }

    // Apply performance dynamics to CONFIG
    CONFIG.cruiseAirspeed = activeAircraftDef.cruiseAirspeed;
    CONFIG.maxAirspeed = activeAircraftDef.maxAirspeed;
    CONFIG.takeoffSpeed = activeAircraftDef.takeoffSpeed;
    CONFIG.stallSpeed = activeAircraftDef.stallSpeed;
    CONFIG.arcadeRollRate = activeAircraftDef.arcadeRollRate;
    CONFIG.arcadePitchRate = activeAircraftDef.arcadePitchRate;
    CONFIG.arcadeYawRate = activeAircraftDef.arcadeYawRate;
    CONFIG.camDist = activeAircraftDef.camDist;
    CONFIG.camHeight = activeAircraftDef.camHeight;
    CONFIG.cockpitOffset = activeAircraftDef.cockpitOffset;
    CONFIG.wingtipSpan = activeAircraftDef.wingtipSpan;

    if (activeAircraftDef.weapons) {
      state.weapons.convergenceDist = activeAircraftDef.weapons.convergenceDistance || 600;
    }

    scene.add(airplaneGroup);

    // Attach belly bomb meshes (visually slightly sticking out of the fuselage belly)
    if (typeof setupPlayerBellyBombs === 'function') {
      setupPlayerBellyBombs(airplaneGroup);
      updatePlayerBellyBombs();
    }

    // Apply current landing gear position to newly active aircraft model
    if (activeModelData && activeModelData.setGearDeployment) {
      activeModelData.setGearDeployment(state.gear.position);
    }

    if (prevPos && prevQuat) {
      airplaneGroup.position.copy(prevPos);
      airplaneGroup.quaternion.copy(prevQuat);
    } else {
      respawnAircraft();
    }

    if (typeof syncFriendlyWingmanAircraft === 'function') {
      syncFriendlyWingmanAircraft(planeId);
    }

    updateAircraftUI();
  }

  function updateAircraftUI() {
    const def = activeAircraftDef || AIRCRAFT_DEFS[state.selectedAircraft] || AIRCRAFT_DEFS.mustang;
    const pilotNameEl = document.getElementById('wt-pilot-name');
    if (pilotNameEl) {
      pilotNameEl.textContent = state.isFlyingWingman
        ? `${state.pilotName || 'MAVERICK'} [WING #2]`
        : (state.pilotName || 'MAVERICK');
    }
    const planeNameEl = document.getElementById('wt-plane-name');
    if (planeNameEl) {
      planeNameEl.textContent = state.isFlyingWingman
        ? `${def.shortName} (WING #2)`
        : def.shortName;
    }
    const planeTraitEl = document.getElementById('wt-plane-trait');
    if (planeTraitEl) {
      planeTraitEl.textContent = def.specialty;
      planeTraitEl.style.color = def.specialtyColor || '#38bdf8';
    }
    const planeHpEl = document.getElementById('wt-plane-hp');
    if (planeHpEl) {
      planeHpEl.textContent = `${state.playerHp} / ${state.playerMaxHp}`;
      planeHpEl.style.color = def.id === 'il2' ? '#f59e0b' : '#22c55e';
    }
    const planeLivesEl = document.getElementById('wt-plane-lives');
    if (planeLivesEl) {
      const remLives = state.aircraftLives[def.id] !== undefined ? state.aircraftLives[def.id] : 3;
      planeLivesEl.textContent = formatLivesText(remLives, state.maxLivesPerPlane);
      planeLivesEl.style.color = remLives >= 2 ? '#fbbf24' : (remLives === 1 ? '#f97316' : '#ef4444');
    }
    const convDistEl = document.getElementById('wt-conv-dist');
    if (convDistEl) {
      convDistEl.textContent = `${state.weapons.convergenceDist || 600}m`;
    }

    // Update menu cards in start prompt
    document.querySelectorAll('.aircraft-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-plane') === state.selectedAircraft);
    });
  }

  // Select aircraft on Main Menu WITHOUT spawning any 3D aircraft yet
  function selectMenuAircraft(planeId) {
    if (state.gameStarted) return;
    if (!AIRCRAFT_DEFS[planeId]) planeId = 'mustang';
    state.selectedAircraft = planeId;
    if (!AIRCRAFT_DEFS[planeId].faction) state.classicAircraft = planeId;
    activeAircraftDef = AIRCRAFT_DEFS[planeId];
    state.playerMaxHp = activeAircraftDef.maxHp || 120;
    state.bombs.maxCount = activeAircraftDef.bombRack.length;
    state.bombs.count = state.bombs.maxCount;
    state.playerHp = state.playerMaxHp;
    updateAircraftUI();
  }

  function buildAirplane() {
    switchAircraft(state.selectedAircraft || 'mustang', false);
  }

  // =========================================================================
  // --- Main Menu: game mode select (Classic / Factions) + Factions setup screen ---
  // =========================================================================
  const flagCache = {};

  // Historical flags drawn on a canvas (Germany: the historical red field & white disc with a Balkenkreuz)
  function drawFlag(nationId, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const star = (cx, cy, r, color) => {
      g.fillStyle = color;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const rr = (i % 2) ? r * 0.382 : r;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    };
    if (nationId === 'usa') {
      // 48-star flag (1912-1959)
      const sh = h / 13;
      for (let i = 0; i < 13; i++) {
        g.fillStyle = (i % 2) ? '#ffffff' : '#b22234';
        g.fillRect(0, i * sh, w, sh + 0.6);
      }
      const cw = w * 0.5, chh = sh * 7;
      g.fillStyle = '#3c3b6e';
      g.fillRect(0, 0, cw, chh);
      for (let r = 0; r < 6; r++) for (let k = 0; k < 8; k++) {
        star(cw * (k + 0.5) / 8, chh * (r + 0.5) / 6, sh * 0.30, '#ffffff');
      }
    } else if (nationId === 'germany') {
      g.fillStyle = '#cc0000';
      g.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = h * 0.33;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      // Balkenkreuz: straight-armed cross whose arms widen towards the ends
      const L = R * 0.80, a = L * 0.22, b = L * 0.40;
      const pts = [[a, -a], [L, -b], [L, b], [a, a], [b, L], [-b, L], [-a, a], [-L, b], [-L, -b], [-a, -a], [-b, -L], [b, -L]];
      g.fillStyle = '#0a0a0a';
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x, cy + y) : g.moveTo(cx + x, cy + y)));
      g.closePath(); g.fill();
    } else if (nationId === 'britain') {
      // Union Jack on a 60x30 grid
      g.save();
      g.scale(w / 60, h / 30);
      g.fillStyle = '#012169'; g.fillRect(0, 0, 60, 30);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 30); g.moveTo(60, 0); g.lineTo(0, 30); g.stroke();
      g.save();
      g.clip(new Path2D('M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z'));
      g.strokeStyle = '#c8102e'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(60, 30); g.moveTo(60, 0); g.lineTo(0, 30); g.stroke();
      g.restore();
      g.strokeStyle = '#ffffff'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(30, 0); g.lineTo(30, 30); g.moveTo(0, 15); g.lineTo(60, 15); g.stroke();
      g.strokeStyle = '#c8102e'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(30, 0); g.lineTo(30, 30); g.moveTo(0, 15); g.lineTo(60, 15); g.stroke();
      g.restore();
    } else if (nationId === 'ussr') {
      g.fillStyle = '#cc0000';
      g.fillRect(0, 0, w, h);
      const gold = '#ffd700';
      const s = h * 0.17, cx = w * 0.2, cy = h * 0.40;
      star(cx, cy - s * 1.65, s * 0.55, gold);
      g.strokeStyle = gold; g.lineCap = 'round';
      // sickle
      g.lineWidth = s * 0.28;
      g.beginPath(); g.arc(cx, cy + s * 0.1, s * 0.95, Math.PI * 0.95, Math.PI * 2.2); g.stroke();
      g.lineWidth = s * 0.2;
      g.beginPath(); g.moveTo(cx - s * 0.9, cy + s * 0.2); g.lineTo(cx - s * 0.35, cy + s * 1.05); g.stroke();
      // hammer
      g.lineWidth = s * 0.2;
      g.beginPath(); g.moveTo(cx - s * 0.75, cy + s * 1.05); g.lineTo(cx + s * 0.6, cy - s * 0.55); g.stroke();
      g.save();
      g.translate(cx + s * 0.62, cy - s * 0.58); g.rotate(-Math.PI / 4 - 0.1);
      g.fillStyle = gold; g.fillRect(-s * 0.55, -s * 0.26, s * 1.1, s * 0.52);
      g.restore();
    } else if (nationId === 'japan') {
      g.fillStyle = '#f8fafc';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#bc002d';
      g.beginPath(); g.arc(w / 2, h / 2, h * 0.30, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(100,116,139,0.55)'; g.lineWidth = 1;
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
    } else if (nationId === 'italy') {
      // Kingdom of Italy: tricolour with the Savoy shield and crown
      g.fillStyle = '#008c45'; g.fillRect(0, 0, w / 3 + 1, h);
      g.fillStyle = '#f4f5f0'; g.fillRect(w / 3, 0, w / 3 + 1, h);
      g.fillStyle = '#cd212a'; g.fillRect(w * 2 / 3, 0, w / 3, h);
      const cx = w / 2, sw = w * 0.15, top = h * 0.30, bot = h * 0.78;
      const shield = () => {
        g.beginPath();
        g.moveTo(cx - sw, top);
        g.lineTo(cx + sw, top);
        g.lineTo(cx + sw, top + (bot - top) * 0.55);
        g.quadraticCurveTo(cx + sw, bot, cx, bot);
        g.quadraticCurveTo(cx - sw, bot, cx - sw, top + (bot - top) * 0.55);
        g.closePath();
      };
      shield(); g.fillStyle = '#1d4ed8'; g.fill();
      g.save();
      g.translate(cx, (top + bot) / 2); g.scale(0.82, 0.82); g.translate(-cx, -(top + bot) / 2);
      shield(); g.fillStyle = '#cd212a'; g.fill();
      g.restore();
      g.fillStyle = '#f4f5f0';
      const mid = top + (bot - top) * 0.42;
      g.fillRect(cx - sw * 0.14, top + h * 0.04, sw * 0.28, (bot - top) * 0.78);
      g.fillRect(cx - sw * 0.68, mid - sw * 0.14, sw * 1.36, sw * 0.28);
      // crown
      g.fillStyle = '#e8b923';
      g.fillRect(cx - sw * 0.7, top - h * 0.09, sw * 1.4, h * 0.06);
      for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(cx + i * sw * 0.55, top - h * 0.10, h * 0.022, 0, Math.PI * 2); g.fill(); }
    }
    return c;
  }

  function getFlagDataUrl(nationId) {
    if (!flagCache[nationId]) flagCache[nationId] = drawFlag(nationId, 240, 160).toDataURL('image/png');
    return flagCache[nationId];
  }

  // Studio photo of a faction aircraft for its menu card (rendered lazily, cached)
  const factionPhotoCache = {};
  const FACTION_PHOTO_POSES = {
    mustang: { cam: [0, 1.55, 13.6], rot: [0.11, -2.36, -0.22] },
    zero:    { cam: [0, 1.45, 13.2], rot: [0.10, -2.32, -0.25] },
    bf109:   { cam: [0, 1.45, 13.0], rot: [0.12, -2.38, -0.20] },
    il2:     { cam: [0, 1.65, 14.4], rot: [0.11, -2.35, -0.18] },
    spitfire: { cam: [0, 1.75, 13.6], rot: [0.16, -2.34, -0.24] },
    sm79:    { cam: [0, 2.6, 22.0], rot: [0.14, -2.30, -0.20] },
    // Factions models (camera pulled back to the size of each aircraft)
    p38:     { cam: [0, 2.4, 18.5], rot: [0.14, -2.30, -0.20] },
    b25:     { cam: [0, 3.4, 27.0], rot: [0.14, -2.30, -0.20] },
    bf110:   { cam: [0, 2.4, 19.0], rot: [0.14, -2.30, -0.20] },
    he111:   { cam: [0, 3.4, 26.0], rot: [0.14, -2.30, -0.20] },
    beaufighter: { cam: [0, 2.4, 19.5], rot: [0.14, -2.30, -0.20] },
    lancaster: { cam: [0, 4.4, 38.0], rot: [0.14, -2.30, -0.20] },
    yak1:    { cam: [0, 1.5, 12.2], rot: [0.12, -2.34, -0.22] },
    yak2:    { cam: [0, 2.2, 17.5], rot: [0.14, -2.30, -0.20] },
    il4:     { cam: [0, 3.2, 25.0], rot: [0.14, -2.30, -0.20] },
    ki45:    { cam: [0, 2.3, 18.5], rot: [0.14, -2.30, -0.20] },
    g4m:     { cam: [0, 3.8, 32.0], rot: [0.14, -2.30, -0.20] },
    c205:    { cam: [0, 1.5, 12.8], rot: [0.12, -2.34, -0.22] },
    ro57:    { cam: [0, 2.2, 17.0], rot: [0.14, -2.30, -0.20] },
    spitfire9: { cam: [0, 1.75, 13.6], rot: [0.16, -2.34, -0.24] },
    p51d:    { cam: [0, 1.55, 13.6], rot: [0.11, -2.36, -0.22] }
  };
  const FACTION_PHOTO_PALETTE = { usa: 'mustang', germany: 'bf109', britain: 'spitfire', ussr: 'il2', japan: 'zero', italy: 'sm79' };

  function getFactionPhoto(planeId) {
    if (factionPhotoCache[planeId]) return factionPhotoCache[planeId];
    const def = AIRCRAFT_DEFS[planeId];
    if (!def || typeof WW2AircraftBuilders === 'undefined' || !renderer) return '';
    const width = 480, height = 260;
    const photoCam = new THREE.PerspectiveCamera(34, width / height, 0.5, 200);
    const prevPixelRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);

    const photoScene = new THREE.Scene();
    photoScene.background = createAircraftPhotoBackdrop(FACTION_PHOTO_PALETTE[def.nationId] || 'mustang');
    photoScene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.0));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.5);
    keyLight.position.set(12, 18, 16);
    photoScene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
    rimLight.position.set(-14, 6, -12);
    photoScene.add(rimLight);

    const modelData = createAircraftModel(planeId);
    let url = '';
    if (modelData) {
      if (modelData.setGearDeployment) modelData.setGearDeployment(0.0);
      const pose = def.photoPose || FACTION_PHOTO_POSES[def.modelId] || FACTION_PHOTO_POSES.mustang;
      modelData.group.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
      photoScene.add(modelData.group);
      photoCam.position.set(pose.cam[0], pose.cam[1], pose.cam[2]);
      photoCam.lookAt(0, 0.1, 0);
      renderer.render(photoScene, photoCam);
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      out.getContext('2d').drawImage(renderer.domElement, 0, 0, width, height);
      url = out.toDataURL('image/png');
    }
    renderer.setPixelRatio(prevPixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    factionPhotoCache[planeId] = url;
    return url;
  }

  function factionSpecsHtml(def) {
    const basePitch = STAT_TIER_VALUES.arcadePitchRate[STAT_TIER_BASE];
    const fmt = (label, value, tier) => {
      const text = `${label}: ${value}${tier === STAT_TIER_MAX ? ' (★)' : ''}`;
      return tier === STAT_TIER_BASE ? text : `<b>${text}</b>`;
    };
    const turnPct = Math.round((def.arcadePitchRate / basePitch - 1) * 100);
    const turn = turnPct === 0 ? 'Base' : `${turnPct > 0 ? '+' : '−'}${Math.abs(turnPct)}%`;
    const parts = [
      fmt('SPD', `${def.maxAirspeed} km/h`, def.stats.speed),
      fmt('TURN', turn, def.stats.agility),
      fmt('DMG', def.weapons.damagePerShot, def.stats.damage),
      fmt('HP', def.maxHp, def.stats.health),
      `BOMBS: ${def.bombRack.length}`
    ];
    if (def.dorsalGunner) parts.push('<b>REAR GUNNER</b>');
    if (def.coolingBonus) parts.push('<b>COOLING</b>');
    return parts.join(' &bull; ');
  }

  function renderNationCards() {
    const box = document.getElementById('nation-cards');
    if (!box) return;
    box.innerHTML = '';
    FACTION_ORDER.forEach(nid => {
      const nat = FACTIONS[nid];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'nation-card' + (nid === state.factionNation ? ' active' : '');
      card.setAttribute('data-nation', nid);
      card.style.setProperty('--team', nat.color);
      card.innerHTML = `
        <img class="nation-flag" alt="${nat.name} flag" src="${getFlagDataUrl(nid)}" />
        <span class="nation-name">${nat.name}</span>
        <span class="nation-bonus">${nat.bonusIcon} ${nat.bonusName}</span>`;
      card.addEventListener('click', () => selectFactionNation(nid));
      box.appendChild(card);
    });
  }

  function renderRoleCards() {
    const box = document.getElementById('role-cards');
    if (!box) return;
    const nat = FACTIONS[state.factionNation];
    box.innerHTML = '';
    box.style.setProperty('--team', nat.color);
    FACTION_ROLES.forEach(role => {
      const def = AIRCRAFT_DEFS[nat.planes[role]];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'role-card' + (role === state.factionRole ? ' active' : '');
      card.setAttribute('data-role', role);
      card.style.setProperty('--team', nat.color);
      card.innerHTML = `
        <div class="aircraft-photo-wrap">
          <img class="aircraft-photo" alt="${def.name}" />
          <span class="card-badge">${nat.bonusIcon} ${nat.bonusName}+</span>
          <span class="role-tag">${FACTION_ROLE_LABEL[role]}</span>
        </div>
        <div class="card-body">
          <div class="card-title">${def.name}</div>
          <div class="card-sub">${def.nation} &bull; ${FACTION_LIVES_PER_TYPE} lives</div>
          <div class="card-specs">${factionSpecsHtml(def)}</div>
        </div>`;
      card.addEventListener('click', () => selectFactionRole(role));
      box.appendChild(card);
      // Photo rendered after the card is in place so the menu opens instantly
      setTimeout(() => {
        const img = card.querySelector('.aircraft-photo');
        if (img) img.src = getFactionPhoto(def.id);
      }, 0);
    });
  }

  function selectFactionNation(nid) {
    if (!state.inMainMenu || !FACTIONS[nid]) return;
    state.factionNation = nid;
    document.querySelectorAll('.nation-card').forEach(c => c.classList.toggle('active', c.getAttribute('data-nation') === nid));
    renderRoleCards();
    selectMenuAircraft(FACTIONS[nid].planes[state.factionRole]);
    refreshMenuTexts();
  }

  function selectFactionRole(role) {
    if (!state.inMainMenu || !FACTION_ROLES.includes(role)) return;
    state.factionRole = role;
    document.querySelectorAll('.role-card').forEach(c => c.classList.toggle('active', c.getAttribute('data-role') === role));
    selectMenuAircraft(FACTIONS[state.factionNation].planes[role]);
  }

  function refreshMenuTexts() {
    const screen = state.menuScreen || 'modes';
    const badge = document.getElementById('menu-mode-badge');
    const title = document.getElementById('menu-main-title');
    const sub = document.getElementById('menu-sub-title');
    const tag = document.getElementById('menu-mode-tag');
    const hint = document.getElementById('team-size-hint');
    const lockBtn = document.getElementById('lock-start-btn');
    if (!state.inMainMenu) return;
    if (screen === 'online' || screen === 'room') {
      if (badge) badge.textContent = '★ ONLINE • PLAY WITH FRIENDS ★';
      if (title) title.textContent = 'MULTIPLAYER';
      if (sub) sub.textContent = screen === 'room' ? 'ROOM LOBBY — PICK A TEAM AND AN AIRCRAFT' : 'CREATE A ROOM OR JOIN ONE WITH A 4-DIGIT CODE';
      if (tag) { tag.textContent = 'MULTIPLAYER'; tag.classList.remove('factions'); tag.classList.add('online'); }
    } else if (screen === 'factions') {
      if (tag) tag.classList.remove('online');
      const nat = FACTIONS[state.factionNation];
      if (badge) badge.textContent = '★ FOUR NATIONS • EVERY TEAM ON ITS OWN ★';
      if (title) title.textContent = 'FACTIONS';
      if (sub) sub.textContent = `${nat.name.toUpperCase()} — ${nat.bonusName} BONUS: ${nat.bonusText.toUpperCase()}`;
      if (tag) { tag.textContent = 'FACTIONS'; tag.classList.add('factions'); }
      if (hint) hint.textContent = 'planes per team';
      if (lockBtn) lockBtn.textContent = 'LAUNCH FACTIONS WAR';
    } else if (screen === 'classic') {
      if (badge) badge.textContent = '★ PACIFIC & DESERT ARCHIPELAGO THEATER ★';
      if (title) title.textContent = 'AERIALS';
      if (sub) sub.textContent = 'SELECT CALLSIGN & AIRCRAFT TO DEPLOY INTO THE THEATER';
      if (tag) { tag.textContent = 'CLASSIC'; tag.classList.remove('factions', 'online'); }
      if (hint) hint.textContent = 'planes per enemy team';
      if (lockBtn) lockBtn.textContent = 'LAUNCH SORTIE';
    } else {
      if (badge) badge.textContent = '★ PACIFIC & DESERT ARCHIPELAGO THEATER ★';
      if (title) title.textContent = 'AERIALS';
      if (sub) sub.textContent = 'CHOOSE A GAME MODE';
      if (lockBtn) lockBtn.textContent = 'LAUNCH SORTIE';
    }
  }

  // screen: 'modes' (first screen), 'classic' or 'factions'
  function setMenuScreen(screen) {
    if (!state.inMainMenu) return;
    state.menuScreen = screen;
    const prompt = document.getElementById('pointer-lock-prompt');
    if (prompt) {
      prompt.classList.remove('menu-screen-modes', 'menu-screen-classic', 'menu-screen-factions', 'menu-screen-online', 'menu-screen-room');
      prompt.classList.add('menu-screen-' + screen);
    }
    if (screen === 'classic') {
      state.gameMode = 'classic';
      state.maxLivesPerPlane = 3;
      selectMenuAircraft(AIRCRAFT_DEFS[state.classicAircraft] ? state.classicAircraft : 'mustang');
    } else if (screen === 'factions') {
      state.gameMode = 'factions';
      state.maxLivesPerPlane = FACTION_LIVES_PER_TYPE;
      renderNationCards();
      renderRoleCards();
      selectMenuAircraft(FACTIONS[state.factionNation].planes[state.factionRole]);
    }
    refreshMenuTexts();
  }

  function setupModeMenu() {
    const flagsEl = document.getElementById('mode-card-flags');
    if (flagsEl && !flagsEl.childElementCount) {
      FACTION_ORDER.forEach(nid => {
        const img = document.createElement('img');
        img.alt = FACTIONS[nid].name;
        img.src = getFlagDataUrl(nid);
        flagsEl.appendChild(img);
      });
    }
    const classicBtn = document.getElementById('mode-card-classic');
    const factionsBtn = document.getElementById('mode-card-factions');
    const backBtn = document.getElementById('menu-back-btn');
    if (classicBtn) classicBtn.addEventListener('click', () => setMenuScreen('classic'));
    if (factionsBtn) factionsBtn.addEventListener('click', () => setMenuScreen('factions'));
    if (backBtn) backBtn.addEventListener('click', () => {
      if (!state.inMainMenu) return;
      if (state.menuScreen === 'classic') state.classicAircraft = state.selectedAircraft;
      setMenuScreen('modes');
    });
    state.menuScreen = 'modes';
    refreshMenuTexts();
  }

  // Launch Sortie from Main Menu: spawns Player Aircraft, Friendly Wingman & Enemy Squadrons
  function launchSortieFromMainMenu() {
    if (!state.inMainMenu) return;
    if (state.menuScreen === 'modes') return; // a game mode must be chosen first

    // 1. Read & store Pilot Callsign (online matches use the name from the lobby)
    const nameInput = document.getElementById('pilot-name-input');
    if (nameInput && !state.netRole) {
      const cleaned = nameInput.value.trim().toUpperCase().replace(/[^A-Z0-9 _\-]/g, '').slice(0, 16);
      state.pilotName = cleaned || 'MAVERICK';
      nameInput.value = state.pilotName;
    }

    // 1b. Factions: draw the AI nations and the 2-lives-per-type pools (Classic keeps its 3 lives)
    if (state.netRole) {
      netSetupLocalRules();
    } else if (state.gameMode === 'factions') {
      setupFactionMatch();
    } else {
      state.factionMatch = null;
      state.maxLivesPerPlane = 3;
    }

    // 2. Exit Main Menu state and mark game started
    state.inMainMenu = false;
    state.gameStarted = true;
    state.isPaused = false;
    state.isFlyingWingman = false;
    state.isDefeated = false;
    state.sortieKills = 0;
    resetVictoryState();
    resetWEPState();

    // 3. Reveal Flight HUD
    const hudOverlay = document.getElementById('hud-overlay');
    if (hudOverlay) {
      hudOverlay.classList.remove('hidden');
    }

    // 4. Transition overlay from Main Menu to Pause screen for future ESC presses
    const promptOverlay = document.getElementById('pointer-lock-prompt');
    if (promptOverlay) {
      promptOverlay.classList.remove('main-menu-mode');
      // Touch mode never gets a pointer-lock event to hide the overlay, so hide it now
      if (touchControlsActive()) promptOverlay.classList.add('hidden');
    }
    closeSettings();
    resetTouchInput();
    tryEnterMobileFullscreen();
    const pilotSection = document.getElementById('pilot-menu-section');
    if (pilotSection) pilotSection.style.display = 'none';
    const menuSection = document.getElementById('aircraft-menu-section');
    if (menuSection) menuSection.style.display = 'none';
    const mainTitle = document.getElementById('menu-main-title');
    if (mainTitle) mainTitle.textContent = 'FLIGHT PAUSED';
    const subTitle = document.getElementById('menu-sub-title');
    if (subTitle) subTitle.textContent = `PILOT: ${state.pilotName} • ${AIRCRAFT_DEFS[state.selectedAircraft].name.toUpperCase()}`;
    const lockBtn = document.getElementById('lock-start-btn');
    if (lockBtn) lockBtn.textContent = 'RESUME FLIGHT';

    // 5. Pause Main Menu Music and clear delay timers during combat flight
    pauseMenuMusicForFlight();
    const musicSection = document.getElementById('menu-music-section');
    if (musicSection) musicSection.style.display = 'none';

    // 6. Roll each team's fixed home base, then spawn Player, Friendly Wingman (#2) & Enemy Squadrons
    //    (online: the host's roster fixes the bases; the host spawns bots + remote players, guests wait for the host's entities)
    if (state.netRole) {
      netAssignBases();
      buildAirplane();
      if (state.netRole === 'host') initNetHostEntities();
      else removeFriendlyEscorts();
    } else {
      assignRandomTeamBases();
      buildAirplane();
      initEnemyPlanes();
    }
    if (state.bombs) {
      state.bombs.count = state.bombs.maxCount;
      state.bombs.dropCooldown = 0.0;
    }
    if (typeof updatePlayerBellyBombs === 'function') {
      updatePlayerBellyBombs();
    }
    if (typeof clearActiveBombs === 'function') {
      clearActiveBombs();
    }
    updateAircraftUI();

    const def = activeAircraftDef || AIRCRAFT_DEFS[state.selectedAircraft];
    showCombatBanner(`✈️ PILOT ${state.pilotName} — ${def.name} CLEARED FOR TAKEOFF`, false);
  }

  // --- Take Control of Friendly Wingman (#2) when Player runs out of lives ---
  function takeOverFriendlyWingman() {
    if (!friendlyWingman || !friendlyWingman.isAlive || friendlyWingman.isDying) return;

    // Factions: the wingman may fly another type — the player takes over that aircraft model
    if (isFactionsMatch() && friendlyWingman.planeId !== state.selectedAircraft) {
      state.factionSwitching = true;
      switchAircraft(friendlyWingman.planeId, true);
      state.factionSwitching = false;
    }
    const curPlane = state.selectedAircraft;
    state.isFlyingWingman = true;
    state.isDefeated = false;

    // 1. Move Player Airplane to Wingman's exact world position and orientation
    airplaneGroup.position.copy(friendlyWingman.currentPos);
    airplaneGroup.quaternion.copy(friendlyWingman.group.quaternion);
    airplaneGroup.visible = true;

    // 2. Synchronize flight state and velocities (the wingman may be parked, rolling or repairing on the runway)
    const fwOnGround = Boolean(friendlyWingman.onGround);
    const fwSpeedKmh = friendlyWingman.currentSpeedKmh || (friendlyWingman.speedMs * 3.6) || (fwOnGround ? 0 : 280);
    state.flight.airspeed = fwOnGround ? fwSpeedKmh : Math.max(80, fwSpeedKmh);
    state.flight.throttle = fwOnGround ? 0.35 : Math.min(1.0, Math.max(0.40, state.flight.airspeed / (CONFIG.cruiseAirspeed || 340)));
    state.flight.isWEP = false;
    state.flight.velocity.copy(friendlyWingman.velocity);
    state.flight.isOnGround = fwOnGround;
    state.flight.gLoad = 1.0;
    state.flight.turnIntensity = 0.0;
    state.flight.stallWarning = false;
    state.flight.pullUpWarning = false;
    state.flight.gearWarning = false;
    state.flight.instructorActive = true;

    state.gear.position = friendlyWingman.gearPos !== undefined ? friendlyWingman.gearPos : 0.0;
    state.gear.target = state.gear.position;
    if (activeModelData && activeModelData.setGearDeployment) {
      activeModelData.setGearDeployment(state.gear.position);
    }

    // 3. Align Mouse Aim & Heading with current flight orientation
    const euler = new THREE.Euler().setFromQuaternion(airplaneGroup.quaternion, 'YXZ');
    state.flight.pitch = euler.x;
    state.flight.yaw = euler.y;
    state.flight.roll = -euler.z;
    state.mouseAim.yaw = euler.y;
    state.mouseAim.pitch = euler.x;
    state.mouseAim.direction.set(
      Math.sin(state.mouseAim.yaw),
      0,
      Math.cos(state.mouseAim.yaw)
    ).normalize();

    // Reset Free Look
    state.freeLook.active = false;
    state.freeLook.yaw = 0;
    state.freeLook.pitch = 0;

    // 4. Inherit Wingman's Health, Remaining Lives, and Weapon state
    state.playerHp = friendlyWingman.hp;
    state.playerMaxHp = friendlyWingman.maxHp;
    if (isFactionsMatch() && friendlyWingman.typeLives) {
      // inherit the wingman's remaining lives of every type
      FACTION_ROLES.forEach(r => {
        state.aircraftLives[FACTIONS[state.factionMatch.playerNation].planes[r]] = friendlyWingman.typeLives[r] || 0;
      });
      state.aircraftLives[curPlane] = Math.max(1, state.aircraftLives[curPlane] || 0);
    } else {
      state.aircraftLives[curPlane] = Math.max(1, friendlyWingman.lives);
    }
    state.weapons.heat = friendlyWingman.weaponHeat || 0.0;
    state.weapons.isJammed = friendlyWingman.weaponJammed || false;
    state.weapons.jamClickTimer = 0.0;
    state.inputs.fire = false;
    state.inputs.zoom = false;

    // 5. Position chase camera smoothly behind newly acquired aircraft
    if (camera) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
      camera.position.copy(airplaneGroup.position)
        .sub(fwd.multiplyScalar(CONFIG.camDist || 16.0))
        .add(new THREE.Vector3(0, CONFIG.camHeight || 4.0, 0));
      camera.lookAt(airplaneGroup.position);
    }

    // 6. Despawn the AI wingman entity so player is now flying this aircraft
    if (friendlyWingman.group) {
      scene.remove(friendlyWingman.group);
    }
    if (friendlyWingman.markerEl) {
      friendlyWingman.markerEl.style.display = 'none';
    }
    friendlyWingman.isAlive = false;
    friendlyWingman.takenOver = true;

    // 7. Clear crash state and modal
    state.isCrashed = false;
    state.airfieldWaitTimer = 0.0;
    state.servicedAtAirfield = -1;
    const crashModal = document.getElementById('crash-modal');
    if (crashModal) crashModal.style.display = 'none';

    // 8. Update HUD, Reset WEP & Announce takeover
    resetWEPState();
    if (typeof setupPlayerBellyBombs === 'function') {
      setupPlayerBellyBombs(airplaneGroup);
      updatePlayerBellyBombs();
    }
    updateAircraftUI();
    showCombatBanner(`🔀 TOOK OVER WINGMAN #2! (${state.aircraftLives[curPlane]}/${state.maxLivesPerPlane} LIVES) — YOU ARE NOW FLIGHT LEAD!`, true);

    // 9. Re-lock pointer for immediate flight control
    requestLock();
  }

  // --- Reset WEP (War Emergency Power) State on Respawn ---
  function resetWEPState() {
    const f = state.flight;
    // Italian Cooling bonus: longer WEP burst and a shorter cooldown (normal: 10 s / 15 s)
    const cooled = Boolean(activeAircraftDef && activeAircraftDef.coolingBonus);
    const maxDur = cooled ? COOLING_WEP.maxDuration : 10.0;
    const cdMax = cooled ? COOLING_WEP.cooldownMax : 15.0;
    if (!f.wep) {
      f.wep = {
        maxDuration: maxDur,
        durationLeft: maxDur,
        cooldownMax: cdMax,
        cooldownTimer: 0.0,
        isCooling: false
      };
    } else {
      f.wep.maxDuration = maxDur;
      f.wep.cooldownMax = cdMax;
      f.wep.durationLeft = maxDur;
      f.wep.cooldownTimer = 0.0;
      f.wep.isCooling = false;
    }
    f.isWEP = false;
    if (f.throttle > 1.0) f.throttle = 1.0;
  }

  // --- Reset / Respawn Function ---
  function respawnAircraft(forceRestart = false) {
    if (state.isDefeated) {
      retryNewSortie();
      return;
    }

    // Factions: respawn in the aircraft type picked on the crash screen (any type of the nation with lives left)
    const pick = state.pendingRespawnPlane;
    state.pendingRespawnPlane = null;
    if (isFactionsMatch() && pick && pick !== state.selectedAircraft && (state.aircraftLives[pick] || 0) > 0) {
      state.factionSwitching = true;
      switchAircraft(pick, false); // builds the new model and calls respawnAircraft() again for the actual respawn
      state.factionSwitching = false;
      return;
    }

    const curPlane = state.selectedAircraft;
    const wingmanAvailable = Boolean(
      !state.isFlyingWingman &&
      friendlyWingman &&
      friendlyWingman.isAlive &&
      !friendlyWingman.isDying &&
      friendlyWingman.lives > 0 &&
      !friendlyWingman.takenOver
    );

    // If player ran out of lives on lead plane and wingman is still alive, player takes over wingman!
    if (!forceRestart && (state.aircraftLives[curPlane] || 0) <= 0 && wingmanAvailable) {
      takeOverFriendlyWingman();
      return;
    }

    // If player is out of lives and NO wingman is available, they have LOST the sortie!
    if ((state.aircraftLives[curPlane] || 0) <= 0) {
      triggerCrash('Squadron wiped out. All lives expended.');
      return;
    }

    state.isCrashed = false;
    state.airfieldWaitTimer = 0.0;
    state.servicedAtAirfield = -1;
    state.needsAirfieldService = false;
    state.playerHp = state.playerMaxHp;
    updateAircraftUI();
    const crashModal = document.getElementById('crash-modal');
    if (crashModal) crashModal.style.display = 'none';

    // Spawn at the selected operational airfield
    const af = AIRPORTS[state.currentAirfield] || AIRPORTS[0];
    airplaneGroup.position.set(af.spawnX, af.elevation + 1.5, af.spawnZ);

    const spawnEuler = new THREE.Euler(0, THREE.MathUtils.degToRad(af.spawnHeading), 0, 'YXZ');
    airplaneGroup.quaternion.setFromEuler(spawnEuler);
    airplaneGroup.rotation.copy(spawnEuler);

    state.flight.airspeed = 0;
    state.flight.throttle = 0.35;
    state.flight.isWEP = false;
    resetWEPState();
    state.flight.pitch = 0;
    state.flight.roll = 0;
    state.flight.yaw = THREE.MathUtils.degToRad(af.spawnHeading);
    state.flight.velocity.set(0, 0, 0);
    state.flight.isOnGround = true;
    state.flight.stallWarning = false;
    state.flight.pullUpWarning = false;
    state.flight.gearWarning = false;
    state.flight.instructorActive = true;
    state.flight.gLoad = 1.0;
    state.flight.turnIntensity = 0.0;

    // Reset Mouse Aim to face directly forward down the active runway
    state.mouseAim.yaw = THREE.MathUtils.degToRad(af.spawnHeading);
    state.mouseAim.pitch = 0;
    state.mouseAim.direction.set(
      Math.sin(state.mouseAim.yaw),
      0,
      Math.cos(state.mouseAim.yaw)
    ).normalize();

    // Reset Free Look
    state.freeLook.active = false;
    state.freeLook.yaw = 0;
    state.freeLook.pitch = 0;

    // Reset Weapon Fire, Zoom & Barrel Heat (Milestone 3)
    state.inputs.fire = false;
    state.inputs.zoom = false;
    state.weapons.heat = 0.0;
    state.weapons.isJammed = false;
    state.weapons.jamClickTimer = 0.0;
    clearActiveBullets();

    // Reload bombs upon respawn
    if (state.bombs) {
      state.bombs.count = state.bombs.maxCount;
      state.bombs.dropCooldown = 0.0;
    }
    if (typeof updatePlayerBellyBombs === 'function') {
      updatePlayerBellyBombs();
    }
    if (typeof clearActiveBombs === 'function') {
      clearActiveBombs();
    }

    // Reset Flaps
    state.flaps = 'raised';
    updateFlapsUI();

    // Reset Landing Gear (Fully Extended on Runway)
    state.gear.position = 1.0;
    state.gear.target = 1.0;
    if (activeModelData && activeModelData.setGearDeployment) {
      activeModelData.setGearDeployment(1.0);
    }
    updateGearUI();

    // The wingman flies independently: a player respawn does not pull it back to the runway

    // Re-lock pointer on respawn
    requestLock();
    netOnLocalRespawn();
  }

  // --- Retry Sortie (Explicit Fresh Game Restart from Runway with Full Lives) ---
  function retryNewSortie() {
    if (state.netRole) { if (net.role === 'host' && state.isVictory) netHostStopToLobby(''); return; }
    const curPlane = state.selectedAircraft;
    state.isDefeated = false;
    state.isCrashed = false;
    state.isFlyingWingman = false;
    if (state.gameMode === 'factions') {
      setupFactionMatch(); // fresh nations draw, 2 lives for every type again
    } else {
      state.aircraftLives[curPlane] = state.maxLivesPerPlane;
    }
    state.sortieKills = 0;
    resetVictoryState();
    resetWEPState();

    const crashModal = document.getElementById('crash-modal');
    if (crashModal) crashModal.style.display = 'none';
    const crashPicker = document.getElementById('crash-picker');
    if (crashPicker) crashPicker.style.display = 'none';

    // Despawn old airplane group, wingman & enemy squadrons
    if (airplaneGroup) scene.remove(airplaneGroup);
    if (friendlyWingman) {
      if (friendlyWingman.group) scene.remove(friendlyWingman.group);
      if (friendlyWingman.markerEl) friendlyWingman.markerEl.remove();
      friendlyWingman = null;
    }
    removeFriendlyEscorts();
    for (let ep of enemyPlanes) {
      if (ep.group) scene.remove(ep.group);
      if (ep.markerEl) ep.markerEl.remove();
      if (ep.leadMarkerEl) ep.leadMarkerEl.remove();
    }
    enemyPlanes.length = 0;
    enemyTeams.length = 0;
    clearFlakShells();

    // A retry is a fresh game: roll new fixed home bases
    assignRandomTeamBases();
    buildAirplane();
    initEnemyPlanes();
    if (state.bombs) {
      state.bombs.count = state.bombs.maxCount;
      state.bombs.dropCooldown = 0.0;
    }
    if (typeof updatePlayerBellyBombs === 'function') {
      updatePlayerBellyBombs();
    }
    if (typeof clearActiveBombs === 'function') {
      clearActiveBombs();
    }
    updateAircraftUI();

    showCombatBanner(`✈️ NEW SORTIE DEPLOYED — ALL ${state.maxLivesPerPlane} LIVES RESTORED`, false);

    requestLock();
  }

  // --- Pointer Lock Request Helper ---
  function requestLock() {
    initAudio();
    // Touch devices fly with on-screen controls: there is no mouse to lock
    if (touchControlsActive()) return;
    const target = document.getElementById('canvas-container') || document.body;
    target.requestPointerLock = target.requestPointerLock ||
                                target.mozRequestPointerLock ||
                                target.webkitRequestPointerLock;
    if (target.requestPointerLock) {
      try {
        // Newer browsers return a promise that rejects when there was no click (e.g. a network-triggered resume)
        const p = target.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (err) {}
    }
  }

  // --- Clear Flight Control Inputs on Pause / State Transitions ---
  function clearAllFlightInputs() {
    state.inputs.fire = false;
    state.inputs.pitchUp = false;
    state.inputs.pitchDown = false;
    state.inputs.rollLeft = false;
    state.inputs.rollRight = false;
    state.inputs.yawLeft = false;
    state.inputs.yawRight = false;
    state.inputs.throttleUp = false;
    state.inputs.throttleDown = false;
    state.inputs.freeLook = false;
    state.inputs.zoom = false;
    state.freeLook.active = false;
  }

  // --- Game Freeze / Pause System (ESC Key) ---
  function pauseGame() {
    if (state.inMainMenu || !state.gameStarted || state.isCrashed || state.isDefeated || state.isVictory) return;
    if (state.isPaused) return;

    state.isPaused = true;
    state.lastPauseTime = performance.now();
    clearAllFlightInputs();
    if (state.netRole === 'host' && net.host) net.host.broadcast({ t: 'pz', on: 1 });

    // Silence active audio context immediately so flight noises freeze
    try {
      if (engineGain && audioCtx) engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
      if (windGain && audioCtx) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
      if (warningGain && audioCtx) warningGain.gain.setValueAtTime(0, audioCtx.currentTime);
      if (audioCtx && audioCtx.state === 'running') {
        audioCtx.suspend().catch(() => {});
      }
    } catch (e) {}

    // Release pointer lock if currently held
    if (document.pointerLockElement) {
      if (document.exitPointerLock) document.exitPointerLock();
    }

    // Configure Pause Overlay
    const promptOverlay = document.getElementById('pointer-lock-prompt');
    if (promptOverlay) {
      promptOverlay.classList.remove('hidden');
      promptOverlay.classList.remove('main-menu-mode');
    }
    const pilotSection = document.getElementById('pilot-menu-section');
    if (pilotSection) pilotSection.style.display = 'none';
    const menuSection = document.getElementById('aircraft-menu-section');
    if (menuSection) menuSection.style.display = 'none';
    const musicSection = document.getElementById('menu-music-section');
    if (musicSection) musicSection.style.display = 'none';

    const modeBadge = document.getElementById('menu-mode-badge');
    if (modeBadge) modeBadge.textContent = '⏸ SIMULATION FROZEN';
    const mainTitle = document.getElementById('menu-main-title');
    if (mainTitle) mainTitle.textContent = 'FLIGHT PAUSED';
    const subTitle = document.getElementById('menu-sub-title');
    const def = activeAircraftDef || AIRCRAFT_DEFS[state.selectedAircraft];
    const planeName = def ? def.name.toUpperCase() : 'AIRCRAFT';
    if (subTitle) subTitle.textContent = `PILOT: ${state.pilotName} • ${planeName} • ALL SIMULATION FROZEN`;

    const lockBtn = document.getElementById('lock-start-btn');
    if (lockBtn) lockBtn.textContent = touchControlsActive() ? 'RESUME FLIGHT' : 'RESUME FLIGHT (ESC)';
    const pauseMenuBtn = document.getElementById('pause-menu-btn');
    if (pauseMenuBtn) { pauseMenuBtn.style.display = 'inline-block'; pauseMenuBtn.textContent = state.netRole ? 'LEAVE ROOM' : 'MAIN MENU'; }
    if (state.netRole === 'guest' && !state.netHostPaused) {
      if (subTitle) subTitle.textContent = 'ONLINE MATCH — the battle keeps going while this menu is open';
      if (modeBadge) modeBadge.textContent = '☰ MENU — THE MATCH CONTINUES';
      if (mainTitle) mainTitle.textContent = 'MENU';
    }
    if (state.netRole === 'host' && subTitle) subTitle.textContent = 'MATCH PAUSED FOR EVERY PLAYER — resume to continue';
    resetTouchInput();
    refreshPromptHint();
  }

  function resumeGame() {
    if (!state.isPaused) return;
    if (state.netRole === 'guest' && state.netHostPaused) return; // only the host can resume a paused match
    if (state.netRole === 'host' && net.host) net.host.broadcast({ t: 'pz', on: 0 });

    state.isPaused = false;
    state.lastPauseTime = performance.now();
    clearAllFlightInputs();

    // Reset clock delta so time spent paused is discarded and physics does not jump
    if (clock) clock.getDelta();

    // Hide Pause Overlay
    const promptOverlay = document.getElementById('pointer-lock-prompt');
    if (promptOverlay) {
      promptOverlay.classList.add('hidden');
    }
    const pauseMenuBtn = document.getElementById('pause-menu-btn');
    if (pauseMenuBtn) pauseMenuBtn.style.display = 'none';
    closeSettings();
    refreshPromptHint();

    // Resume audio context
    try {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (e) {}

    // Request pointer lock for immediate flight control
    requestLock();
  }

  function togglePause() {
    if (state.inMainMenu || !state.gameStarted || state.isCrashed || state.isDefeated || state.isVictory) return;
    if (state.isPaused) {
      // Debounce if paused within the last 250ms (prevents double-toggle from pointerlockchange + keydown on same ESC press)
      if (performance.now() - state.lastPauseTime < 250) return;
      resumeGame();
    } else {
      pauseGame();
    }
  }

  // --- Return to Main Menu (Despawn Aircraft, Minecraft Panorama Background) ---
  function returnToMainMenu() {
    // Online: leaving the match leaves the room too (unless the match ended back into the lobby)
    if (netActive() && !net.keepRoom) { netLeave(''); return; }
    state.netRole = null;
    state.netHostPaused = false;
    if (document.exitPointerLock) document.exitPointerLock();

    state.inMainMenu = true;
    state.gameStarted = false;
    state.isPaused = false;
    state.isCrashed = false;
    state.isDefeated = false;
    state.isFlyingWingman = false;
    state.aircraftLives = { mustang: 3, zero: 3, bf109: 3, il2: 3, spitfire: 3, sm79: 3 };
    state.sortieKills = 0;
    resetVictoryState();
    resetWEPState();

    const hudOverlay = document.getElementById('hud-overlay');
    if (hudOverlay) hudOverlay.classList.add('hidden');
    const crashModal = document.getElementById('crash-modal');
    if (crashModal) crashModal.style.display = 'none';
    const pauseMenuBtn = document.getElementById('pause-menu-btn');
    if (pauseMenuBtn) pauseMenuBtn.style.display = 'none';

    // Despawn player airplane, wingman & enemies so no aircraft exist in 3D scene on Main Menu
    if (airplaneGroup) {
      scene.remove(airplaneGroup);
      airplaneGroup = null;
    }
    if (friendlyWingman) {
      if (friendlyWingman.group) scene.remove(friendlyWingman.group);
      if (friendlyWingman.markerEl) friendlyWingman.markerEl.remove();
      friendlyWingman = null;
    }
    removeFriendlyEscorts();
    for (let ep of enemyPlanes) {
      if (ep.group) scene.remove(ep.group);
      if (ep.markerEl) ep.markerEl.remove();
      if (ep.leadMarkerEl) ep.leadMarkerEl.remove();
    }
    enemyPlanes.length = 0;
    enemyTeams.length = 0;

    clearActiveBullets();
    clearDamageSmoke();
    clearFlakShells();

    // Back to the default (Classic) bases: standard runway size, no national flags
    state.factionMatch = null;
    assignRandomTeamBases();

    // Restore Main Menu overlay
    const promptOverlay = document.getElementById('pointer-lock-prompt');
    if (promptOverlay) {
      promptOverlay.classList.add('main-menu-mode');
      promptOverlay.classList.remove('hidden');
    }
    const pilotSection = document.getElementById('pilot-menu-section');
    if (pilotSection) pilotSection.style.display = '';
    const menuSection = document.getElementById('aircraft-menu-section');
    if (menuSection) menuSection.style.display = '';
    const musicSection = document.getElementById('menu-music-section');
    if (musicSection) musicSection.style.display = '';
    const mainTitle = document.getElementById('menu-main-title');
    if (mainTitle) mainTitle.textContent = 'AERIALS';
    const subTitle = document.getElementById('menu-sub-title');
    if (subTitle) subTitle.textContent = 'SELECT CALLSIGN & AIRCRAFT TO DEPLOY INTO THE THEATER';
    const lockBtn = document.getElementById('lock-start-btn');
    if (lockBtn) lockBtn.textContent = 'LAUNCH SORTIE';
    state.maxLivesPerPlane = 3;
    setMenuScreen('modes'); // the Main Menu always opens on the game mode select
    closeSettings();
    resetTouchInput();
    refreshPromptHint();

    initMenuPanorama();
    updateAircraftUI();
    resumeMenuMusicOnMenuReturn();
  }

  function updateFlapsUI() {
    const elFlaps = document.getElementById('wt-flaps');
    if (elFlaps) elFlaps.textContent = state.flaps.toUpperCase();
    const btnFlaps = document.getElementById('btn-flaps');
    if (btnFlaps) btnFlaps.textContent = 'Flaps: ' + (state.flaps === 'combat' ? 'Combat' : 'Raised');
  }

  function toggleFlaps() {
    state.flaps = (state.flaps === 'raised') ? 'combat' : 'raised';
    updateFlapsUI();
  }

  function updateGearUI() {
    const elGear = document.getElementById('wt-gear');
    const btnGear = document.getElementById('btn-gear');
    let gearText = 'DOWN';
    let gearColor = '#22c55e'; // green

    if (state.gear.position <= 0.05 && state.gear.target === 0.0) {
      gearText = 'UP';
      gearColor = '#ffffff';
    } else if (state.gear.position >= 0.95 && state.gear.target === 1.0) {
      gearText = 'DOWN';
      gearColor = '#22c55e';
    } else {
      gearText = state.gear.target === 1.0 ? 'EXTENDING' : 'RETRACTING';
      gearColor = '#f59e0b'; // amber transit
    }

    if (elGear) {
      elGear.textContent = gearText;
      elGear.style.color = gearColor;
    }
    if (btnGear) {
      btnGear.textContent = 'Gear: ' + (gearText === 'DOWN' ? 'Down' : (gearText === 'UP' ? 'Up' : 'In Transit')) + ' (G)';
      btnGear.style.borderColor = (gearColor === '#22c55e') ? '#22c55e88' : (gearColor === '#f59e0b' ? '#f59e0b88' : '#ffffff44');
    }
  }

  function toggleGear() {
    if (state.flight.isOnGround && state.gear.target === 1.0) {
      // Squat switch safety interlock: landing gear cannot be raised while resting on the ground
      return;
    }
    state.gear.target = (state.gear.target === 1.0) ? 0.0 : 1.0;
    updateGearUI();
  }

  // =========================================================================
  // --- Main Menu Background Music & Volume System (HTML5 Audio Player) ---
  // =========================================================================
  const MENU_MUSIC_CONFIG = {
    playlist: [
      {
        id: 'theme1',
        title: 'Theme 1 (Advance Australia - 8 Bit)',
        src: 'audio/theme1.m4a'
      },
      {
        id: 'theme2',
        title: 'Theme 2 (Wings of Steel Soundtrack)',
        src: 'audio/theme2.m4a'
      }
    ],
    delaySeconds: 50,
    storageKey: 'ww2_menu_music_volume',
    defaultVolume: 60
  };

  const menuMusic = {
    audioEl: null,
    trackIndex: 0,
    isPlaying: false,
    volume: 60,
    prevVolume: 60,
    isMuted: false,
    delayTimer: null,
    delayInterval: null,
    delayRemaining: 0,
    userInteracted: false
  };

  function playMenuTrack(index, userGestureOnly = false) {
    clearMenuMusicDelay();
    menuMusic.trackIndex = (index + MENU_MUSIC_CONFIG.playlist.length) % MENU_MUSIC_CONFIG.playlist.length;
    const track = MENU_MUSIC_CONFIG.playlist[menuMusic.trackIndex];

    if (!menuMusic.audioEl) {
      menuMusic.audioEl = document.getElementById('menu-audio-element');
    }
    if (!menuMusic.audioEl) return;

    const currentSrc = menuMusic.audioEl.getAttribute('src');
    if (currentSrc !== track.src) {
      menuMusic.audioEl.src = track.src;
    }
    applyMenuMusicVolume(menuMusic.volume, false);

    if (state.inMainMenu) {
      const playPromise = menuMusic.audioEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          menuMusic.isPlaying = true;
          updateMenuMusicUI();
        }).catch(() => {
          menuMusic.isPlaying = false;
          updateMenuMusicUI();
        });
      }
    }
    updateMenuMusicUI();
  }

  function pauseMenuMusic() {
    clearMenuMusicDelay();
    if (menuMusic.audioEl) {
      try {
        menuMusic.audioEl.pause();
      } catch (e) {}
    }
    menuMusic.isPlaying = false;
    updateMenuMusicUI();
  }

  function pauseMenuMusicForFlight() {
    clearMenuMusicDelay();
    if (menuMusic.audioEl) {
      try {
        menuMusic.audioEl.pause();
      } catch (e) {}
    }
    menuMusic.isPlaying = false;
    updateMenuMusicUI();
  }

  function resumeMenuMusicOnMenuReturn() {
    if (!state.inMainMenu) return;
    if (menuMusic.delayRemaining > 0) {
      updateMenuMusicUI();
      return;
    }
    if (menuMusic.audioEl) {
      const playPromise = menuMusic.audioEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          menuMusic.isPlaying = true;
          updateMenuMusicUI();
        }).catch(() => {
          playMenuTrack(menuMusic.trackIndex);
        });
      }
    } else {
      playMenuTrack(menuMusic.trackIndex);
    }
    updateMenuMusicUI();
  }

  function toggleMenuMusicPlayback() {
    if (menuMusic.delayRemaining > 0) {
      // User clicked Play during the 50s delay: skip delay immediately and start track
      playMenuTrack(menuMusic.trackIndex);
      return;
    }
    if (menuMusic.isPlaying) {
      pauseMenuMusic();
    } else {
      playMenuTrack(menuMusic.trackIndex);
    }
  }

  function playNextMenuTrack() {
    clearMenuMusicDelay();
    const nextIdx = (menuMusic.trackIndex + 1) % MENU_MUSIC_CONFIG.playlist.length;
    playMenuTrack(nextIdx);
  }

  function playPreviousMenuTrack() {
    clearMenuMusicDelay();
    const prevIdx = (menuMusic.trackIndex - 1 + MENU_MUSIC_CONFIG.playlist.length) % MENU_MUSIC_CONFIG.playlist.length;
    playMenuTrack(prevIdx);
  }

  function startMenuMusicDelay(seconds) {
    clearMenuMusicDelay();
    if (!state.inMainMenu) return;

    menuMusic.delayRemaining = seconds;
    menuMusic.isPlaying = false;
    updateMenuMusicUI();

    menuMusic.delayInterval = setInterval(() => {
      menuMusic.delayRemaining--;
      if (menuMusic.delayRemaining <= 0) {
        clearInterval(menuMusic.delayInterval);
        menuMusic.delayInterval = null;
      }
      updateMenuMusicUI();
    }, 1000);

    menuMusic.delayTimer = setTimeout(() => {
      clearMenuMusicDelay();
      if (state.inMainMenu) {
        playMenuTrack(menuMusic.trackIndex);
      }
    }, seconds * 1000);
  }

  function clearMenuMusicDelay() {
    if (menuMusic.delayTimer) {
      clearTimeout(menuMusic.delayTimer);
      menuMusic.delayTimer = null;
    }
    if (menuMusic.delayInterval) {
      clearInterval(menuMusic.delayInterval);
      menuMusic.delayInterval = null;
    }
    menuMusic.delayRemaining = 0;
  }

  function applyMenuMusicVolume(vol, saveToStorage = true) {
    const clamped = Math.max(0, Math.min(100, Math.round(vol)));
    menuMusic.volume = clamped;

    if (clamped > 0) {
      menuMusic.prevVolume = clamped;
      menuMusic.isMuted = false;
    } else {
      menuMusic.isMuted = true;
    }

    if (saveToStorage) {
      try {
        localStorage.setItem(MENU_MUSIC_CONFIG.storageKey, clamped.toString());
      } catch (e) {}
    }

    if (menuMusic.audioEl) {
      try {
        menuMusic.audioEl.volume = clamped / 100;
        menuMusic.audioEl.muted = (clamped === 0);
      } catch (e) {}
    }

    const slider = document.getElementById('music-volume-slider');
    if (slider && parseInt(slider.value, 10) !== clamped) {
      slider.value = clamped;
    }
    if (slider) {
      slider.setAttribute('aria-valuenow', clamped);
    }
    const valLabel = document.getElementById('music-volume-val');
    if (valLabel) {
      valLabel.textContent = clamped + '%';
    }
    updateMuteButtonIcon();
  }

  function toggleMenuMusicMute() {
    if (menuMusic.volume > 0) {
      menuMusic.prevVolume = menuMusic.volume;
      applyMenuMusicVolume(0, true);
    } else {
      const restore = (menuMusic.prevVolume && menuMusic.prevVolume > 0) ? menuMusic.prevVolume : 60;
      applyMenuMusicVolume(restore, true);
    }
  }

  function updateMuteButtonIcon() {
    const muteBtn = document.getElementById('music-mute-btn');
    if (!muteBtn) return;
    if (menuMusic.volume === 0 || menuMusic.isMuted) {
      muteBtn.textContent = '🔇';
      muteBtn.title = 'Unmute Music';
      muteBtn.classList.add('muted');
    } else if (menuMusic.volume < 35) {
      muteBtn.textContent = '🔈';
      muteBtn.title = 'Mute Music';
      muteBtn.classList.remove('muted');
    } else if (menuMusic.volume < 75) {
      muteBtn.textContent = '🔉';
      muteBtn.title = 'Mute Music';
      muteBtn.classList.remove('muted');
    } else {
      muteBtn.textContent = '🔊';
      muteBtn.title = 'Mute Music';
      muteBtn.classList.remove('muted');
    }
  }

  function updateMenuMusicUI() {
    const playPauseBtn = document.getElementById('btn-music-playpause');
    if (playPauseBtn) {
      if (menuMusic.delayRemaining > 0) {
        playPauseBtn.textContent = '▶';
        playPauseBtn.title = 'Skip 50s Delay & Play Track';
      } else if (menuMusic.isPlaying) {
        playPauseBtn.textContent = '⏸';
        playPauseBtn.title = 'Pause Music';
      } else {
        playPauseBtn.textContent = '▶';
        playPauseBtn.title = 'Play Music';
      }
    }

    const trackNameEl = document.getElementById('music-track-name');
    if (trackNameEl) {
      const cur = MENU_MUSIC_CONFIG.playlist[menuMusic.trackIndex];
      const title = cur ? cur.title : 'Main Menu Theme';
      if (menuMusic.delayRemaining > 0) {
        trackNameEl.textContent = `⏳ DELAY (${menuMusic.delayRemaining}s) → ${title}`;
        trackNameEl.style.color = '#f59e0b';
      } else {
        trackNameEl.textContent = `${menuMusic.isPlaying ? '▶' : '⏸'} ${title}`;
        trackNameEl.style.color = menuMusic.isPlaying ? '#38bdf8' : '#94a3b8';
      }
    }
  }

  function initMenuMusic() {
    let storedVol = 60;
    try {
      const raw = localStorage.getItem(MENU_MUSIC_CONFIG.storageKey);
      if (raw !== null) {
        const parsed = parseInt(raw, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          storedVol = parsed;
        }
      }
    } catch (e) {}

    menuMusic.volume = storedVol;
    menuMusic.prevVolume = storedVol > 0 ? storedVol : 60;

    menuMusic.audioEl = document.getElementById('menu-audio-element');
    if (menuMusic.audioEl) {
      menuMusic.audioEl.addEventListener('ended', () => {
        // Current track finished: advance playlist and begin 50s invisible delay before next song
        menuMusic.isPlaying = false;
        menuMusic.trackIndex = (menuMusic.trackIndex + 1) % MENU_MUSIC_CONFIG.playlist.length;
        startMenuMusicDelay(MENU_MUSIC_CONFIG.delaySeconds);
      });

      menuMusic.audioEl.addEventListener('play', () => {
        menuMusic.isPlaying = true;
        updateMenuMusicUI();
      });

      menuMusic.audioEl.addEventListener('pause', () => {
        if (menuMusic.delayRemaining <= 0) {
          menuMusic.isPlaying = false;
          updateMenuMusicUI();
        }
      });

      menuMusic.audioEl.addEventListener('error', (e) => {
        console.warn('[MenuMusic] Audio playback error:', menuMusic.audioEl.error);
        menuMusic.isPlaying = false;
        updateMenuMusicUI();
      });
    }

    const slider = document.getElementById('music-volume-slider');
    const valLabel = document.getElementById('music-volume-val');
    const muteBtn = document.getElementById('music-mute-btn');
    const playPauseBtn = document.getElementById('btn-music-playpause');
    const prevBtn = document.getElementById('btn-music-prev');
    const nextBtn = document.getElementById('btn-music-next');
    const musicSection = document.getElementById('menu-music-section');

    if (slider) {
      slider.value = storedVol;
      slider.setAttribute('aria-valuenow', storedVol);
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        applyMenuMusicVolume(isNaN(val) ? 60 : val, true);
      });
    }

    if (valLabel) {
      valLabel.textContent = storedVol + '%';
    }

    if (muteBtn) {
      muteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenuMusicMute();
      });
    }

    if (playPauseBtn) {
      playPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenuMusicPlayback();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playPreviousMenuTrack();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        playNextMenuTrack();
      });
    }

    if (musicSection) {
      musicSection.addEventListener('click', (e) => e.stopPropagation());
      musicSection.addEventListener('mousedown', (e) => e.stopPropagation());
      musicSection.addEventListener('mouseup', (e) => e.stopPropagation());
      musicSection.addEventListener('keydown', (e) => e.stopPropagation());
      musicSection.addEventListener('keyup', (e) => e.stopPropagation());
    }

    applyMenuMusicVolume(storedVol, false);
    updateMuteButtonIcon();
    updateMenuMusicUI();

    // Prepare initial track source
    if (menuMusic.audioEl) {
      menuMusic.audioEl.src = MENU_MUSIC_CONFIG.playlist[menuMusic.trackIndex].src;
    }

    // Attempt playback immediately if allowed
    if (state.inMainMenu) {
      playMenuTrack(menuMusic.trackIndex);
    }

    // Auto-resume playback on first user interaction if blocked by browser autoplay policy
    function handleFirstUserGesture() {
      if (menuMusic.userInteracted) return;
      menuMusic.userInteracted = true;
      if (state.inMainMenu && !menuMusic.isPlaying && menuMusic.delayRemaining <= 0) {
        if (menuMusic.audioEl) {
          menuMusic.audioEl.play().then(() => {
            menuMusic.isPlaying = true;
            updateMenuMusicUI();
          }).catch(() => {});
        }
      }
    }
    window.addEventListener('pointerdown', handleFirstUserGesture, { capture: true, passive: true });
    window.addEventListener('keydown', handleFirstUserGesture, { capture: true, passive: true });
  }

  // --- Player Settings: sensitivity, speed, touch controls & render quality (saved in this browser) ---
  const SETTINGS_STORAGE_KEY = 'ww2_settings';
  const SETTINGS_DEFAULTS = {
    aimSens: 100, touchSens: 100, invertPitch: 'off',
    gameSpeed: 100, throttleRate: 100,
    flightFov: 65, menuFov: 65,
    touchMode: 'auto', touchSize: 100, touchOpacity: 75, renderQuality: 100
  };
  // Slider settings are whole numbers within these ranges (percentages, or degrees for the FOVs);
  // choice settings take one of the listed values
  const SETTINGS_RANGES = {
    aimSens: [20, 300], touchSens: [20, 300], gameSpeed: [50, 150], throttleRate: [25, 300],
    flightFov: [50, 110], menuFov: [45, 100],
    touchSize: [70, 150], touchOpacity: [20, 100], renderQuality: [40, 100]
  };
  const SETTINGS_CHOICES = { invertPitch: ['off', 'on'], touchMode: ['auto', 'on', 'off'] };

  function sanitizeSetting(key, value) {
    if (SETTINGS_RANGES[key]) {
      const v = Math.round(Number(value));
      if (!isFinite(v)) return SETTINGS_DEFAULTS[key];
      return THREE.MathUtils.clamp(v, SETTINGS_RANGES[key][0], SETTINGS_RANGES[key][1]);
    }
    if (SETTINGS_CHOICES[key]) {
      return SETTINGS_CHOICES[key].includes(value) ? value : SETTINGS_DEFAULTS[key];
    }
    return SETTINGS_DEFAULTS[key];
  }

  function loadSettings() {
    const settings = Object.assign({}, SETTINGS_DEFAULTS);
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        for (const key in SETTINGS_DEFAULTS) {
          if (key in saved) settings[key] = sanitizeSetting(key, saved[key]);
        }
      }
    } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
    return settings;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings)); } catch (e) { /* ignore */ }
  }

  // Percentage setting as a multiplier (100% -> 1.0)
  function settingScale(key) {
    const s = state.settings;
    return ((s && s[key]) || SETTINGS_DEFAULTS[key]) / 100;
  }

  // Field of view in degrees ('flightFov' or 'menuFov')
  function getFovSetting(key) {
    const s = state.settings;
    return (s && s[key]) || SETTINGS_DEFAULTS[key];
  }

  // Flight camera FOV: the setting, +3° under WEP; gunsight zoom keeps the same ~2x magnification at any FOV
  function getFlightTargetFov(isZoomed) {
    const base = getFovSetting('flightFov');
    if (isZoomed) return base * (32 / 65);
    return state.flight.isWEP ? base + 3 : base;
  }

  // Show a FOV change at once, even while paused (the frozen frame is still rendered)
  function applyCameraFovNow() {
    if (!camera) return;
    camera.fov = state.inMainMenu ? getFovSetting('menuFov') : getFlightTargetFov(Boolean(state.inputs.zoom));
    camera.updateProjectionMatrix();
  }

  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
      return ('ontouchstart' in window) && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
    } catch (e) {
      return false;
    }
  }

  function touchControlsActive() {
    const mode = state.settings ? state.settings.touchMode : 'auto';
    return mode === 'on' || (mode === 'auto' && isTouchDevice());
  }

  function applySettings() {
    state.invertPitch = state.settings.invertPitch === 'on';

    const root = document.documentElement;
    root.style.setProperty('--touch-scale', String(settingScale('touchSize')));
    root.style.setProperty('--touch-opacity', String(settingScale('touchOpacity')));

    const touchOn = touchControlsActive();
    document.body.classList.toggle('touch-mode', touchOn);
    if (!touchOn) resetTouchInput();

    if (renderer) {
      const maxRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(Math.max(0.5, maxRatio * settingScale('renderQuality')));
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    applyCameraFovNow();
    refreshPromptHint();
  }

  // Menu hint line under the buttons: keyboard wording on desktop, touch wording on phones
  function refreshPromptHint() {
    const promptHint = document.querySelector('.prompt-hint');
    if (!promptHint) return;
    const touchOn = touchControlsActive();
    if (state.isPaused) {
      promptHint.innerHTML = touchOn
        ? 'Simulation is completely frozen. Tap <b>RESUME FLIGHT</b> to continue.'
        : 'Simulation is completely frozen. Press <b>ESC</b> or click <b>RESUME FLIGHT</b> to continue.';
    } else {
      promptHint.innerHTML = touchOn
        ? 'Tap <b>❚❚</b> during flight to pause / open Settings'
        : 'Press <b>ESC</b> during flight to pause / view Controls';
    }
  }

  function isSettingsOpen() {
    const modal = document.getElementById('settings-modal');
    return Boolean(modal && !modal.classList.contains('hidden'));
  }

  function syncSettingsUI() {
    document.querySelectorAll('.settings-slider[data-setting]').forEach(slider => {
      slider.value = state.settings[slider.getAttribute('data-setting')];
    });
    document.querySelectorAll('[data-setting-val]').forEach(el => {
      el.textContent = state.settings[el.getAttribute('data-setting-val')] + (el.getAttribute('data-unit') || '%');
    });
    document.querySelectorAll('.settings-presets[data-setting]').forEach(group => {
      const current = String(state.settings[group.getAttribute('data-setting')]);
      group.querySelectorAll('button').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-val') === current);
      });
    });
  }

  function setSetting(key, value) {
    state.settings[key] = sanitizeSetting(key, value);
    saveSettings();
    applySettings();
    syncSettingsUI();
  }

  function openSettings() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    syncSettingsUI();
    modal.classList.remove('hidden');
  }

  function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
  }

  function setupSettingsPanel() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('settings-open-btn');
    if (openBtn) openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSettings();
    });
    ['settings-close-btn', 'settings-done-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', closeSettings);
    });
    const resetBtn = document.getElementById('settings-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      state.settings = Object.assign({}, SETTINGS_DEFAULTS);
      saveSettings();
      applySettings();
      syncSettingsUI();
    });
    if (modal) {
      // Tap on the dimmed backdrop closes the panel
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettings();
      });
      ['mousedown', 'mouseup', 'keyup'].forEach(type => modal.addEventListener(type, (e) => e.stopPropagation()));
    }
    document.querySelectorAll('.settings-slider[data-setting]').forEach(slider => {
      slider.addEventListener('input', () => setSetting(slider.getAttribute('data-setting'), slider.value));
    });
    document.querySelectorAll('.settings-presets[data-setting]').forEach(group => {
      const key = group.getAttribute('data-setting');
      group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => setSetting(key, SETTINGS_RANGES[key] ? Number(btn.getAttribute('data-val')) : btn.getAttribute('data-val')));
      });
    });
    syncSettingsUI();
  }

  // --- Aim Steering shared by Mouse & Touch: pixel deltas move the aim point (or orbit the camera in Free Look) ---
  function applyAimDelta(dx, dy, sensScale) {
    if (state.inputs.freeLook) {
      // Free Look Orbit: camera looks around 360 degrees
      state.freeLook.yaw -= dx * CONFIG.mouseSensitivity * 1.3 * sensScale;
      state.freeLook.pitch -= dy * CONFIG.mouseSensitivity * 1.3 * sensScale;
      // Clamp vertical look angle
      state.freeLook.pitch = THREE.MathUtils.clamp(state.freeLook.pitch, -1.35, 1.35);
      // Wrap yaw within [-PI, PI]
      if (state.freeLook.yaw > Math.PI) state.freeLook.yaw -= Math.PI * 2;
      if (state.freeLook.yaw < -Math.PI) state.freeLook.yaw += Math.PI * 2;
    } else {
      // Normal Mouse Aim: steers the target aim vector (scaled down when zoomed in for fine precision)
      const sens = CONFIG.mouseSensitivity * sensScale * (state.inputs.zoom ? 0.55 : 1.0);
      state.mouseAim.yaw -= dx * sens;
      const pitchDelta = (state.invertPitch ? -1 : 1) * dy * sens;
      state.mouseAim.pitch -= pitchDelta;
      setMouseAimAngles(state.mouseAim.yaw, state.mouseAim.pitch);
    }
  }

  // Clamp / wrap the aim angles and recompute the 3D unit aim direction vector
  function setMouseAimAngles(yaw, pitch) {
    // Clamp elevation to prevent gimbal flipping beyond vertical
    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
    // Keep yaw in standard range
    if (yaw > Math.PI) yaw -= Math.PI * 2;
    if (yaw < -Math.PI) yaw += Math.PI * 2;
    state.mouseAim.yaw = yaw;
    state.mouseAim.pitch = pitch;
    const cp = Math.cos(pitch);
    state.mouseAim.direction.set(cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)).normalize();
  }

  // --- Touch Flight Controls (stick, swipe aim, throttle lever, weapon & toggle buttons) ---
  const TOUCH_STICK_REACH = 0.75;   // rad: full stick deflection puts the aim point this far off the nose
  const TOUCH_STICK_DEADZONE = 0.08;
  const TOUCH_SWIPE_GAIN = 1.6;     // swipe pixels feel smaller than mouse counts, so boost them
  const TOUCH_LOOK_RATE = 2.4;      // rad/s camera orbit at full stick while LOOK is held
  const touchInput = {
    stickId: null, stickX: 0, stickY: 0,
    swipeId: null, swipeX: 0, swipeY: 0,
    throttleId: null, fireId: null, lookId: null
  };
  const touchForward = new THREE.Vector3();

  function touchFlightAllowed() {
    return touchControlsActive() && !state.inMainMenu && !state.isPaused && !state.isVictory && state.gameStarted;
  }

  function resetTouchInput() {
    if (touchInput.fireId !== null) state.inputs.fire = false;
    if (touchInput.lookId !== null) state.inputs.freeLook = false;
    touchInput.stickId = null;
    touchInput.stickX = 0;
    touchInput.stickY = 0;
    touchInput.swipeId = null;
    touchInput.throttleId = null;
    touchInput.fireId = null;
    touchInput.lookId = null;
    const knob = document.getElementById('touch-stick-knob');
    if (knob) knob.style.transform = '';
    document.querySelectorAll('#touch-controls .pressed, #touch-stick.active').forEach(el => el.classList.remove('pressed', 'active'));
  }

  // Set throttle from the lever position (0..1 of its height; the top 1/11 is WEP, unavailable while cooling)
  function setThrottleFromLever(frac) {
    const f = state.flight;
    const wep = f.wep;
    const isCooldown = Boolean(wep && (wep.isCooling || wep.cooldownTimer > 0));
    f.throttle = Math.min(isCooldown ? 1.0 : 1.10, THREE.MathUtils.clamp(frac, 0, 1) * 1.10);
    f.isWEP = (f.throttle > 1.001);
  }

  // Per-frame: turn stick deflection into an aim point relative to the nose, and keep the widgets in sync
  function updateTouchControls(dt) {
    if (!touchControlsActive()) return;

    if (touchInput.stickId !== null && airplaneGroup && !state.isCrashed) {
      const sx = touchInput.stickX;
      const sy = touchInput.stickY;
      const sens = settingScale('touchSens');
      if (state.inputs.freeLook) {
        state.freeLook.yaw -= sx * TOUCH_LOOK_RATE * sens * dt;
        state.freeLook.pitch = THREE.MathUtils.clamp(state.freeLook.pitch - sy * TOUCH_LOOK_RATE * sens * dt, -1.35, 1.35);
        if (state.freeLook.yaw > Math.PI) state.freeLook.yaw -= Math.PI * 2;
        if (state.freeLook.yaw < -Math.PI) state.freeLook.yaw += Math.PI * 2;
      } else {
        touchForward.set(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
        const noseYaw = Math.atan2(touchForward.x, touchForward.z);
        const nosePitch = Math.asin(THREE.MathUtils.clamp(touchForward.y, -0.99, 0.99));
        const reach = TOUCH_STICK_REACH * Math.min(1.6, sens) * (state.inputs.zoom ? 0.55 : 1.0);
        setMouseAimAngles(noseYaw - sx * reach, nosePitch - (state.invertPitch ? -1 : 1) * sy * reach);
      }
    }

    // Throttle lever follows the real throttle (keyboard, WEP exhaustion, respawn)
    const thr = state.flight.throttle || 0;
    const pct = (THREE.MathUtils.clamp(thr / 1.10, 0, 1) * 100).toFixed(1) + '%';
    const fill = document.getElementById('touch-throttle-fill');
    const knob = document.getElementById('touch-throttle-knob');
    const label = document.getElementById('touch-throttle-label');
    const lever = document.getElementById('touch-throttle');
    if (fill) fill.style.height = pct;
    if (knob) knob.style.bottom = pct;
    if (label) label.textContent = state.flight.isWEP ? 'WEP' : Math.round(Math.min(thr, 1.0) * 100) + '%';
    if (lever) lever.classList.toggle('wep', Boolean(state.flight.isWEP));

    const zoomBtn = document.getElementById('touch-zoom');
    if (zoomBtn) zoomBtn.classList.toggle('active', Boolean(state.inputs.zoom));
    const gearBtn = document.getElementById('touch-gear');
    if (gearBtn) gearBtn.classList.toggle('active', state.gear.target >= 1);
    const flapsBtn = document.getElementById('touch-flaps');
    if (flapsBtn) flapsBtn.classList.toggle('active', state.flaps === 'combat');
  }

  function tryEnterMobileFullscreen() {
    if (!touchControlsActive()) return;
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && !document.fullscreenElement && !document.webkitFullscreenElement) {
        const result = req.call(el, { navigationUI: 'hide' });
        if (result && result.then) {
          result.then(() => {
            if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
          }).catch(() => {});
        }
      }
    } catch (e) { /* fullscreen not supported (e.g. iPhone Safari) */ }
  }

  function setupTouchControls() {
    const lookZone = document.getElementById('touch-look-zone');
    const stick = document.getElementById('touch-stick');
    const stickKnob = document.getElementById('touch-stick-knob');
    const lever = document.getElementById('touch-throttle');
    if (!lookZone || !stick || !lever) return;

    function capture(el, e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    // Swipe aim on free screen space
    lookZone.addEventListener('pointerdown', (e) => {
      if (!touchFlightAllowed() || touchInput.swipeId !== null) return;
      capture(lookZone, e);
      initAudio();
      touchInput.swipeId = e.pointerId;
      touchInput.swipeX = e.clientX;
      touchInput.swipeY = e.clientY;
    });
    lookZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== touchInput.swipeId) return;
      const dx = e.clientX - touchInput.swipeX;
      const dy = e.clientY - touchInput.swipeY;
      touchInput.swipeX = e.clientX;
      touchInput.swipeY = e.clientY;
      if (touchFlightAllowed() && !state.isCrashed) applyAimDelta(dx, dy, settingScale('touchSens') * TOUCH_SWIPE_GAIN);
    });
    const endSwipe = (e) => { if (e.pointerId === touchInput.swipeId) touchInput.swipeId = null; };
    lookZone.addEventListener('pointerup', endSwipe);
    lookZone.addEventListener('pointercancel', endSwipe);

    // Flight stick
    function updateStick(e) {
      const rect = stick.getBoundingClientRect();
      const radius = rect.width * 0.5;
      let dx = (e.clientX - (rect.left + radius)) / radius;
      let dy = (e.clientY - (rect.top + radius)) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      if (stickKnob) stickKnob.style.transform = `translate(${dx * radius * 0.62}px, ${dy * radius * 0.62}px)`;
      const mag = Math.min(1, len);
      const scale = mag < TOUCH_STICK_DEADZONE ? 0 : (mag - TOUCH_STICK_DEADZONE) / (1 - TOUCH_STICK_DEADZONE) / Math.max(mag, 1e-6);
      touchInput.stickX = dx * scale;
      touchInput.stickY = dy * scale;
    }
    function releaseStick() {
      touchInput.stickId = null;
      touchInput.stickX = 0;
      touchInput.stickY = 0;
      stick.classList.remove('active');
      if (stickKnob) stickKnob.style.transform = '';
      // Hold the current attitude: park the aim point on the nose so the plane stops turning
      if (airplaneGroup && !state.inputs.freeLook) {
        touchForward.set(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
        setMouseAimAngles(Math.atan2(touchForward.x, touchForward.z), Math.asin(THREE.MathUtils.clamp(touchForward.y, -0.99, 0.99)));
      }
    }
    stick.addEventListener('pointerdown', (e) => {
      if (!touchFlightAllowed() || touchInput.stickId !== null) return;
      capture(stick, e);
      initAudio();
      touchInput.stickId = e.pointerId;
      stick.classList.add('active');
      updateStick(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === touchInput.stickId) updateStick(e);
    });
    const endStick = (e) => { if (e.pointerId === touchInput.stickId) releaseStick(); };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    // Throttle lever
    function updateLever(e) {
      const track = lever.querySelector('.touch-throttle-track') || lever;
      const rect = track.getBoundingClientRect();
      setThrottleFromLever(1 - (e.clientY - rect.top) / Math.max(1, rect.height));
    }
    lever.addEventListener('pointerdown', (e) => {
      if (!touchFlightAllowed() || touchInput.throttleId !== null) return;
      capture(lever, e);
      initAudio();
      touchInput.throttleId = e.pointerId;
      updateLever(e);
    });
    lever.addEventListener('pointermove', (e) => {
      if (e.pointerId === touchInput.throttleId && touchFlightAllowed()) updateLever(e);
    });
    const endLever = (e) => { if (e.pointerId === touchInput.throttleId) touchInput.throttleId = null; };
    lever.addEventListener('pointerup', endLever);
    lever.addEventListener('pointercancel', endLever);

    // Hold buttons: FIRE & LOOK
    function bindHold(id, idKey, onPress, onRelease) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        if (!touchFlightAllowed() || touchInput[idKey] !== null) return;
        capture(btn, e);
        initAudio();
        touchInput[idKey] = e.pointerId;
        btn.classList.add('pressed');
        onPress();
      });
      const end = (e) => {
        if (e.pointerId !== touchInput[idKey]) return;
        touchInput[idKey] = null;
        btn.classList.remove('pressed');
        onRelease();
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
    }
    bindHold('touch-fire', 'fireId', () => { state.inputs.fire = true; }, () => { state.inputs.fire = false; });
    bindHold('touch-look', 'lookId', () => { state.inputs.freeLook = true; }, () => { state.inputs.freeLook = false; });

    // Tap buttons
    function bindTap(id, action) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!touchFlightAllowed()) return;
        initAudio();
        action();
      });
    }
    bindTap('touch-zoom', () => { state.inputs.zoom = !state.inputs.zoom; });
    bindTap('touch-bomb', () => dropPlayerBomb());
    bindTap('touch-gear', () => toggleGear());
    bindTap('touch-flaps', () => toggleFlaps());
    bindTap('touch-cam', () => toggleCamera());
    bindTap('touch-pause-btn', () => {
      resetTouchInput();
      pauseGame();
    });

    // Losing focus (call, app switch) must not leave the guns firing or the stick held
    window.addEventListener('blur', resetTouchInput);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && touchControlsActive()) {
        resetTouchInput();
        pauseGame();
      }
    });
    window.addEventListener('resize', () => {
      if (state.settings && state.settings.touchMode === 'auto') applySettings();
    });
  }

  // --- Input Handlers (Mouse Aim, Free Look, Keyboard Overrides) ---
  function setupInputs() {
    // Player settings first: sensitivity, speed & touch mode affect every handler below
    state.settings = loadSettings();
    applySettings();
    setupSettingsPanel();
    setupTouchControls();

    const promptOverlay = document.getElementById('pointer-lock-prompt');
    const lockBtn = document.getElementById('lock-start-btn');
    const pauseMenuBtn = document.getElementById('pause-menu-btn');
    const canvasContainer = document.getElementById('canvas-container');

    if (lockBtn) {
      lockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.inMainMenu) {
          launchSortieFromMainMenu();
        } else if (state.isPaused) {
          resumeGame();
        }
        requestLock();
      });
    }

    if (pauseMenuBtn) {
      pauseMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        returnToMainMenu();
      });
    }

    if (canvasContainer) {
      canvasContainer.addEventListener('click', () => {
        if (state.inMainMenu) return;
        if (state.isPaused) {
          resumeGame();
        }
        requestLock();
      });
    }

    // Team Size selector (Main Menu only: the section is hidden during a sortie, and clicks are ignored then)
    const TEAM_SIZE_STORAGE_KEY = 'ww2_team_size';
    const teamSizeBtns = document.querySelectorAll('.team-size-btn');
    function syncTeamSizeButtons() {
      teamSizeBtns.forEach(btn => {
        btn.classList.toggle('active', Number(btn.getAttribute('data-size')) === state.teamSize);
      });
    }
    try {
      const saved = Number(localStorage.getItem(TEAM_SIZE_STORAGE_KEY));
      if (saved >= 1 && saved <= 4) state.teamSize = Math.round(saved);
    } catch (e) { /* storage unavailable: keep default */ }
    teamSizeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!state.inMainMenu) return;
        state.teamSize = Number(btn.getAttribute('data-size'));
        try { localStorage.setItem(TEAM_SIZE_STORAGE_KEY, String(state.teamSize)); } catch (e) { /* ignore */ }
        syncTeamSizeButtons();
      });
    });
    syncTeamSizeButtons();

    // Pilot Callsign Input, Presets & Randomizer on Main Menu
    const RANDOM_CALLSIGNS = [
      'MAVERICK', 'RED TAIL', 'VIPER', 'NIGHTHAWK', 'VALKYRIE',
      'ICEMAN', 'THUNDERBOLT', 'GHOST RIDER', 'MUSTANG ACE', 'PHOENIX',
      'CORSAIR', 'HELLCAT', 'SKYHAWK', 'SPITFIRE', 'BLACKBIRD', 'SABRE'
    ];
    const nameInput = document.getElementById('pilot-name-input');
    const randomNameBtn = document.getElementById('btn-random-name');
    const presetBtns = document.querySelectorAll('.preset-callsign-btn');

    function syncPresetHighlight(val) {
      const upper = (val || '').trim().toUpperCase();
      presetBtns.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-callsign') === upper);
      });
    }

    if (nameInput) {
      nameInput.addEventListener('input', () => {
        state.pilotName = nameInput.value.trim().toUpperCase() || 'MAVERICK';
        syncPresetHighlight(nameInput.value);
      });
      nameInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          nameInput.blur();
        }
      });
      nameInput.addEventListener('keyup', (e) => {
        e.stopPropagation();
      });
    }

    if (randomNameBtn && nameInput) {
      randomNameBtn.addEventListener('click', () => {
        const current = nameInput.value.trim().toUpperCase();
        const pool = RANDOM_CALLSIGNS.filter(c => c !== current);
        const pick = pool[Math.floor(Math.random() * pool.length)] || 'MAVERICK';
        nameInput.value = pick;
        state.pilotName = pick;
        syncPresetHighlight(pick);
      });
    }

    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const callsign = btn.getAttribute('data-callsign') || 'MAVERICK';
        if (nameInput) nameInput.value = callsign;
        state.pilotName = callsign;
        syncPresetHighlight(callsign);
      });
    });

    // Pointer Lock state changes
    let wasPointerLocked = false;
    function onPointerLockChange() {
      const lockedElement = document.pointerLockElement ||
                            document.mozPointerLockElement ||
                            document.webkitPointerLockElement;
      state.isPointerLocked = (lockedElement === document.body || lockedElement === canvasContainer);
      if (promptOverlay) {
        if (state.isPointerLocked) {
          wasPointerLocked = true;
          if (state.inMainMenu) {
            launchSortieFromMainMenu();
          } else if (state.isPaused) {
            resumeGame();
          }
          promptOverlay.classList.add('hidden');
          state.gameStarted = true;
        } else {
          // Pointer lock exited (user pressed ESC or switched window)
          if (state.isVictory) {
            // The victory screen owns the overlay now
          } else if (wasPointerLocked && !state.inMainMenu && state.gameStarted && !state.isCrashed && !state.isDefeated) {
            pauseGame();
          } else if (state.gameStarted) {
            promptOverlay.classList.remove('hidden');
            promptOverlay.classList.remove('main-menu-mode');
            const pilotSection = document.getElementById('pilot-menu-section');
            if (pilotSection) pilotSection.style.display = 'none';
            const menuSection = document.getElementById('aircraft-menu-section');
            if (menuSection) menuSection.style.display = 'none';
            const musicSection = document.getElementById('menu-music-section');
            if (musicSection) musicSection.style.display = 'none';
            if (lockBtn) lockBtn.textContent = 'RESUME FLIGHT (ESC)';
          }
          wasPointerLocked = false;
        }
      }
    }

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mozpointerlockchange', onPointerLockChange);
    document.addEventListener('webkitpointerlockchange', onPointerLockChange);

    // Mouse Movement: Mouse Aim & Free Look
    window.addEventListener('mousemove', (e) => {
      if (!state.isPointerLocked || state.isPaused || state.inMainMenu) return;

      // Movement delta in pixels
      const dx = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
      const dy = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

      if (dx === 0 && dy === 0) return;

      applyAimDelta(dx, dy, settingScale('aimSens'));
    });

    // Mouse Wheel: Throttle & WEP
    window.addEventListener('wheel', (e) => {
      if (!state.isPointerLocked || state.isPaused || state.inMainMenu) return;

      initAudio();
      const f = state.flight;
      const wep = f.wep;
      const isCooldown = Boolean(wep && (wep.isCooling || wep.cooldownTimer > 0));
      const maxThr = isCooldown ? 1.0 : 1.10;

      const step = 0.05 * settingScale('throttleRate');
      if (e.deltaY < 0) {
        // Scroll Up: Increase Throttle (up to 1.10 WEP if ready, capped at 1.0 if on cooldown)
        f.throttle = Math.min(maxThr, f.throttle + step);
      } else if (e.deltaY > 0) {
        // Scroll Down: Decrease Throttle
        f.throttle = Math.max(0.0, f.throttle - step);
      }
      f.isWEP = (f.throttle > 1.001);
    }, { passive: true });

    // Mouse Buttons: Left Click = Fire, Right Click = Target Gunsight Zoom
    window.addEventListener('mousedown', (e) => {
      if (!state.isPointerLocked || state.isPaused || state.inMainMenu) return;

      initAudio();
      if (e.target.closest('#hud-buttons') || e.target.closest('#crash-modal') || e.target.closest('#pointer-lock-prompt')) return;

      if (e.button === 0) {
        state.inputs.fire = true;
      } else if (e.button === 2) {
        state.inputs.zoom = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!state.isPointerLocked || state.isPaused || state.inMainMenu) return;

      if (e.button === 0) {
        state.inputs.fire = false;
      } else if (e.button === 2) {
        state.inputs.zoom = false;
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Keyboard Keydown Handlers
    window.addEventListener('keydown', (e) => {
      if (document.activeElement && (document.activeElement.id === 'pilot-name-input' || document.activeElement.id === 'music-volume-slider')) return;

      // ESC closes the Settings panel first (the game stays paused underneath)
      if (isSettingsOpen()) {
        if (e.code === 'Escape') {
          e.preventDefault();
          closeSettings();
        }
        return;
      }
      if (state.inMainMenu) return;

      // Victory screen: R deploys a new sortie, everything else waits for the buttons
      if (state.isVictory) {
        if (e.code === 'KeyR') retryNewSortie();
        return;
      }

      // ESC button freezes / unfreezes the entire game
      if (e.code === 'Escape') {
        if (!state.isCrashed && !state.isDefeated && state.gameStarted) {
          e.preventDefault();
          togglePause();
        }
        return;
      }

      // If game is paused/frozen, ignore all other flight commands
      if (state.isPaused) return;

      initAudio();

      switch (e.code) {
        // Primary Gun Fire (Space) or Respawn / Take Over Wingman if crashed
        case 'Space':
        case 'Enter':
          if (state.isCrashed) {
            if (state.isDefeated) {
              // Space / Enter does not bypass Defeat screen
              break;
            }
            respawnAircraft();
            break;
          }
          if (e.code === 'Space') state.inputs.fire = true;
          break;

        // Pitch Overrides
        case 'KeyW':
        case 'ArrowUp':
          state.inputs.pitchDown = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.inputs.pitchUp = true;
          break;

        // Roll Overrides
        case 'KeyA':
        case 'ArrowLeft':
          state.inputs.rollLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.inputs.rollRight = true;
          break;

        // Yaw / Rudder Overrides
        case 'KeyQ':
          state.inputs.yawLeft = true;
          break;
        case 'KeyE':
          state.inputs.yawRight = true;
          break;

        // Throttle
        case 'ShiftLeft':
        case 'ShiftRight':
          state.inputs.throttleUp = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          state.inputs.throttleDown = true;
          break;

        // Free Look (Hold C)
        case 'KeyC':
          state.inputs.freeLook = true;
          break;

        // Gunsight Zoom (Hold Z or RMB)
        case 'KeyZ':
          state.inputs.zoom = true;
          break;

        // Combat Flaps Toggle (F)
        case 'KeyF':
          toggleFlaps();
          break;

        // Landing Gear Toggle (G)
        case 'KeyG':
          toggleGear();
          break;

        // Camera Mode Toggle (V)
        case 'KeyV':
          toggleCamera();
          break;

        // Factions crash screen: 1 / 2 / 3 choose fighter / heavy fighter / bomber
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          pickCrashAircraftByIndex(Number(e.code.slice(5)) - 1);
          break;

        // Respawn / Retry (R)
        case 'KeyR':
          if (state.isDefeated) {
            retryNewSortie();
            break;
          }
          if (state.isCrashed) {
            respawnAircraft();
            break;
          }
          break;

        // Sound Mute Toggle (M)
        case 'KeyM':
          toggleSound();
          break;

        // Aircraft Quick Switch (P) - Disabled (plane selection permitted only at start)
        case 'KeyP':
          break;

        // Ballistic Lead Reticle Toggle (L)
        case 'KeyL':
          state.showLeadIndicator = !state.showLeadIndicator;
          showCombatBanner(`BALLISTIC LEAD INDICATOR: ${state.showLeadIndicator ? 'ON' : 'OFF'}`, false);
          break;

        // Bomb Drop (B)
        case 'KeyB':
          dropPlayerBomb();
          break;

      }
    });

    // Keyboard Keyup Handlers
    window.addEventListener('keyup', (e) => {
      if (document.activeElement && (document.activeElement.id === 'pilot-name-input' || document.activeElement.id === 'music-volume-slider')) return;
      if (state.inMainMenu) return;
      if (state.isPaused) return;
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          state.inputs.pitchDown = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          state.inputs.pitchUp = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          state.inputs.rollLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          state.inputs.rollRight = false;
          break;
        case 'KeyQ':
          state.inputs.yawLeft = false;
          break;
        case 'KeyE':
          state.inputs.yawRight = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          state.inputs.throttleUp = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          state.inputs.throttleDown = false;
          break;
        case 'Space':
          state.inputs.fire = false;
          break;
        case 'KeyC':
          state.inputs.freeLook = false;
          break;
        case 'KeyZ':
          state.inputs.zoom = false;
          break;
      }
    });

    // Window Resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Crash / Defeat Modal Button Listeners
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.addEventListener('click', () => {
      initAudio();
      if (state.isDefeated) {
        if (state.netRole) { const cm = document.getElementById('crash-modal'); if (cm) cm.style.display = 'none'; }
        else returnToMainMenu();
      } else {
        respawnAircraft();
      }
    });

    const crashMenuBtn = document.getElementById('crash-menu-btn');
    if (crashMenuBtn) crashMenuBtn.addEventListener('click', () => {
      initAudio();
      if (state.isDefeated && !state.netRole) {
        retryNewSortie();
      } else {
        returnToMainMenu();
      }
    });

    // Victory Screen Buttons
    const victoryNewBtn = document.getElementById('victory-new-btn');
    if (victoryNewBtn) victoryNewBtn.addEventListener('click', () => {
      initAudio();
      retryNewSortie();
    });
    const victoryMenuBtn = document.getElementById('victory-menu-btn');
    if (victoryMenuBtn) victoryMenuBtn.addEventListener('click', () => {
      initAudio();
      returnToMainMenu();
    });

    const btnBomb = document.getElementById('btn-bomb');
    if (btnBomb) btnBomb.addEventListener('click', () => {
      initAudio();
      dropPlayerBomb();
    });

    const btnCamera = document.getElementById('btn-camera');
    if (btnCamera) btnCamera.addEventListener('click', () => {
      initAudio();
      toggleCamera();
    });

    const btnFlaps = document.getElementById('btn-flaps');
    if (btnFlaps) btnFlaps.addEventListener('click', () => {
      initAudio();
      toggleFlaps();
    });

    const btnGear = document.getElementById('btn-gear');
    if (btnGear) btnGear.addEventListener('click', () => {
      initAudio();
      toggleGear();
    });

    const btnSound = document.getElementById('btn-sound');
    if (btnSound) btnSound.addEventListener('click', () => {
      toggleSound();
    });

    // Game mode select + Factions setup screen + Multiplayer (online rooms)
    setupModeMenu();
    setupNetMenu();

    // Aircraft Selection Cards in Start Menu (only permitted before game start)
    renderAircraftCardSpecs();
    document.querySelectorAll('.aircraft-card').forEach(card => {
      card.addEventListener('click', () => {
        if (state.gameStarted) return;
        const planeId = card.getAttribute('data-plane');
        if (planeId && planeId !== state.selectedAircraft) {
          if (state.inMainMenu) {
            selectMenuAircraft(planeId);
          } else {
            switchAircraft(planeId, false);
          }
        }
      });
    });

    // Initialize Main Menu YouTube Background Music & Volume Setting
    initMenuMusic();
  }

  function toggleCamera() {
    if (state.cameraMode === 'chase') {
      state.cameraMode = 'cockpit';
    } else if (state.cameraMode === 'cockpit') {
      state.cameraMode = 'flyby';
    } else {
      state.cameraMode = 'chase';
    }
    const btn = document.getElementById('btn-camera');
    if (btn) btn.textContent = 'Camera: ' + (state.cameraMode.charAt(0).toUpperCase() + state.cameraMode.slice(1));
  }

  function toggleSound() {
    initAudio();
    state.soundEnabled = !state.soundEnabled;
    const btn = document.getElementById('btn-sound');
    if (btn) btn.textContent = state.soundEnabled ? 'Sound: On' : 'Sound: Muted';
  }

  // --- Flight Dynamics & War Thunder Arcade Simulation ---
  function updatePhysics(dt) {
    if (state.isCrashed) return;

    const f = state.flight;

    // Update Retractable Landing Gear Transit Animation
    if (state.gear.position !== state.gear.target) {
      const gearStep = state.gear.transitionSpeed * dt;
      if (state.gear.position < state.gear.target) {
        state.gear.position = Math.min(state.gear.target, state.gear.position + gearStep);
      } else {
        state.gear.position = Math.max(state.gear.target, state.gear.position - gearStep);
      }
      updateGearUI();
    }

    // Apply continuous deployment ratio to active 3D aircraft model
    if (activeModelData && activeModelData.setGearDeployment) {
      activeModelData.setGearDeployment(state.gear.position);
    }

    // 1. Throttle Management & WEP with Medium Cooldown
    const wep = f.wep;
    const isWepCooldown = Boolean(wep && (wep.isCooling || wep.cooldownTimer > 0));
    const maxThrottle = isWepCooldown ? 1.0 : 1.10;

    const throttleRate = settingScale('throttleRate');
    if (state.inputs.throttleUp) {
      f.throttle = Math.min(maxThrottle, f.throttle + 0.50 * throttleRate * dt);
    }
    if (state.inputs.throttleDown) {
      f.throttle = Math.max(0.0, f.throttle - 0.55 * throttleRate * dt);
    }

    if (wep) {
      // Clamp throttle to 100% if on cooldown
      if (isWepCooldown && f.throttle > 1.0) {
        f.throttle = 1.0;
        f.isWEP = false;
      }

      // Check WEP activation
      if (f.throttle > 1.001 && !isWepCooldown) {
        f.isWEP = true;
        wep.durationLeft = Math.max(0, wep.durationLeft - dt);

        // Exhausted full burst limit (10 seconds continuous WEP)
        if (wep.durationLeft <= 0) {
          f.isWEP = false;
          f.throttle = 1.0;
          wep.isCooling = true;
          wep.cooldownTimer = wep.cooldownMax; // 15.0s medium cooldown
          showCombatBanner('⚠️ WEP EXHAUSTED — ENGINE COOLING DOWN (15s)', false);
        }
      } else {
        // Not actively in WEP: if player was in WEP and throttled down below 100%
        if (f.isWEP) {
          f.isWEP = false;
          const usedSecs = wep.maxDuration - wep.durationLeft;
          if (usedSecs > 0.6) {
            // Enter proportional medium cooldown (minimum 3.5s, maximum 15s)
            wep.isCooling = true;
            wep.cooldownTimer = Math.min(wep.cooldownMax, Math.max(3.5, (usedSecs / wep.maxDuration) * wep.cooldownMax));
          }
        }
      }

      // Tick down active cooldown timer
      if (wep.cooldownTimer > 0) {
        wep.cooldownTimer = Math.max(0, wep.cooldownTimer - dt);
        if (wep.cooldownTimer <= 0) {
          wep.isCooling = false;
          wep.durationLeft = wep.maxDuration;
        }
      }
    } else {
      f.isWEP = (f.throttle > 1.001);
    }

    // 2. Level-Flight Equilibrium Airspeed for Current Throttle
    let targetAirspeed = 0;
    if (f.throttle <= 1.0) {
      targetAirspeed = f.throttle * CONFIG.cruiseAirspeed;
    } else {
      // 100% to 110% WEP Boost
      const wepFrac = (f.throttle - 1.0) / 0.10;
      targetAirspeed = CONFIG.cruiseAirspeed + wepFrac * (CONFIG.maxAirspeed - CONFIG.cruiseAirspeed);
    }

    // Combat Flaps & Retractable Landing Gear add parasitic aerodynamic drag
    // Drag penalty scales with engine thrust/throttle; at 0% throttle, targetAirspeed remains 0 km/h (drag never pushes plane forward)
    if (f.throttle > 0) {
      if (state.flaps === 'combat') {
        targetAirspeed = Math.max(0, targetAirspeed - 30 * f.throttle);
      }
      if (state.gear.position > 0) {
        targetAirspeed = Math.max(0, targetAirspeed - 75 * state.gear.position * f.throttle);
      }
    }

    // Speed in m/s
    const speedMs = (f.airspeed * 1000) / 3600;

    // Control authority scales with airspeed (peaks at ~160 km/h, diminishes during severe stall)
    const controlAuthority = Math.min(1.0, Math.max(0.16, f.airspeed / 160));

    // Combat Flaps increase turn authority by +25%
    const flapTurnBonus = (state.flaps === 'combat') ? 1.25 : 1.0;

    // Aircraft World Vectors
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(airplaneGroup.quaternion);
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(airplaneGroup.quaternion);

    // Coordinate inversion & bank angle relative to true world horizon
    const invQuat = airplaneGroup.quaternion.clone().invert();
    const worldUpLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(invQuat);
    const currentBank = Math.atan2(worldUpLocal.x, worldUpLocal.y);

    // 3. Control Decision: Keyboard Manual Overrides vs Virtual Instructor
    const hasPitchOverride = state.inputs.pitchUp || state.inputs.pitchDown;
    const hasRollOverride = state.inputs.rollLeft || state.inputs.rollRight;
    const hasYawOverride = state.inputs.yawLeft || state.inputs.yawRight;
    const isManualOverride = hasPitchOverride || hasRollOverride || hasYawOverride;

    let targetPitchRate = 0;
    let targetRollRate = 0;
    let targetYawRate = 0;

    if (isManualOverride) {
      // --- MANUAL KEYBOARD OVERRIDE (100% Direct Authority) ---
      f.instructorActive = false;

      // Pitch (In Three.js model coordinates, pulling up is negative X rate)
      if (state.inputs.pitchUp) targetPitchRate -= CONFIG.arcadePitchRate * flapTurnBonus;
      if (state.inputs.pitchDown) targetPitchRate += CONFIG.arcadePitchRate;

      // Roll
      if (state.inputs.rollLeft) targetRollRate += CONFIG.arcadeRollRate;
      if (state.inputs.rollRight) targetRollRate -= CONFIG.arcadeRollRate;

      // Yaw
      if (state.inputs.yawLeft) targetYawRate -= CONFIG.arcadeYawRate;
      if (state.inputs.yawRight) targetYawRate += CONFIG.arcadeYawRate;

      // Synchronize Mouse Aim direction with current aircraft heading so releasing keys is seamless
      state.mouseAim.direction.copy(forwardVec);
      state.mouseAim.pitch = Math.asin(THREE.MathUtils.clamp(forwardVec.y, -0.99, 0.99));
      state.mouseAim.yaw = Math.atan2(forwardVec.x, forwardVec.z);
    } else {
      // --- THE VIRTUAL INSTRUCTOR (Mouse Aim Autopilot) ---
      f.instructorActive = true;

      // Transform target aim vector into airplane's local coordinate frame
      const localAim = state.mouseAim.direction.clone().applyQuaternion(invQuat);

      // localAim: +Z is nose forward, +X is right, +Y is up
      const angleError = Math.acos(THREE.MathUtils.clamp(localAim.z, -1, 1));

      // Calculate horizontal (azimuth) and vertical (elevation) error in local space
      const horizError = Math.atan2(localAim.x, Math.max(0.001, localAim.z));
      const vertError = Math.atan2(localAim.y, Math.max(0.001, localAim.z));

      // Desired Bank Angle:
      // When turning towards a horizontal target error (horizError):
      // Target to the right (horizError > 0) -> bank right (desiredBank < 0).
      // Target to the left (horizError < 0) -> bank left (desiredBank > 0).
      let desiredBank = 0;
      if (angleError > 0.05) {
        // Bank up to ~75 degrees (1.30 rad) into the turn
        desiredBank = -THREE.MathUtils.clamp(horizError * 1.5, -1.30, 1.30);
      } else {
        // Aligned with target: auto-level wings with world horizon!
        desiredBank = 0;
      }

      // Compute shortest angular error from currentBank to desiredBank
      let bankDiff = currentBank - desiredBank;
      while (bankDiff > Math.PI) bankDiff -= Math.PI * 2;
      while (bankDiff < -Math.PI) bankDiff += Math.PI * 2;

      // In Three.js, positive rotateZ rolls LEFT; negative rotateZ rolls RIGHT.
      // If plane is banked too far right (currentBank < desiredBank -> bankDiff < 0),
      // we must roll LEFT (positive rotateZ).
      // If plane is banked too far left (currentBank > desiredBank -> bankDiff > 0),
      // we must roll RIGHT (negative rotateZ).
      // If inverted (upside down), bankDiff is ~PI, rolls forcefully back to upright 0.
      // Therefore, targetRollRate MUST BE NEGATED (-bankDiff):
      targetRollRate = -THREE.MathUtils.clamp(bankDiff * 3.5, -1, 1) * CONFIG.arcadeRollRate;

      // Pitch solver: pull elevator towards local vertical error
      let pitchFactor = 0;
      if (localAim.z < 0) {
        // Target is behind: pull hard pitch into the turn!
        pitchFactor = 1.0;
      } else {
        pitchFactor = THREE.MathUtils.clamp(vertError * 2.5, -1, 1);
      }
      targetPitchRate = -pitchFactor * CONFIG.arcadePitchRate * flapTurnBonus;

      // Rudder (Yaw solver): fine coordination to eliminate slip
      targetYawRate = THREE.MathUtils.clamp(localAim.x * 2.0, -1, 1) * CONFIG.arcadeYawRate;

      // Smooth arrival damping: settle cleanly onto reticle without oscillation
      if (angleError < 0.04) {
        const factor = angleError / 0.04;
        targetPitchRate *= factor;
        targetYawRate *= factor;
      }
    }

    // While on ground: prevent roll and prevent pitching into tarmac
    if (f.isOnGround) {
      targetRollRate = 0;
      if (targetPitchRate > 0) targetPitchRate = 0;
    }

    // 4. Visual Control Surface Deflection & Propeller Animations
    if (activeModelData) {
      if (activeModelData.elevators) {
        for (let el of activeModelData.elevators) {
          el.rotation.x = -targetPitchRate * 0.24;
        }
      }
      const flapDroop = (state.flaps === 'combat') ? 0.22 : 0;
      if (leftAileron) leftAileron.rotation.x = -targetRollRate * 0.22 + flapDroop;
      if (rightAileron) rightAileron.rotation.x = targetRollRate * 0.22 + flapDroop;

      if (activeModelData.rudders) {
        for (let rud of activeModelData.rudders) {
          rud.rotation.y = targetYawRate * 0.35;
        }
      }

      const propSpeed = 22 + f.throttle * (f.isWEP ? 120 : 90);
      if (activeModelData.propellers) {
        for (let prop of activeModelData.propellers) {
          prop.rotation.z += propSpeed * dt;
        }
      }
      if (activeModelData.blurDisc) {
        activeModelData.blurDisc.material.opacity = f.throttle > 0.3 ? (0.20 + f.throttle * 0.32) : (f.throttle * 0.5);
      }
    }

    // 5. Apply Rotations to Aircraft
    airplaneGroup.rotateX(targetPitchRate * controlAuthority * dt);
    airplaneGroup.rotateZ(targetRollRate * controlAuthority * dt);
    airplaneGroup.rotateY(targetYawRate * controlAuthority * dt);

    // 6. Energy Aerodynamics: Engine Thrust, Drag, Gravity Exchange & Sharp Turn Bleed
    // (A) Turn Intensity & G-Load Calculation
    const effectivePitchRate = Math.abs(targetPitchRate) * controlAuthority;
    const effectiveYawRate = Math.abs(targetYawRate) * controlAuthority;
    const effectiveTurnRate = Math.sqrt(effectivePitchRate * effectivePitchRate + 0.5 * effectiveYawRate * effectiveYawRate);

    // Normalized turn intensity: 0.0 (straight) to 1.0+ (maximum break turn)
    const turnIntensity = THREE.MathUtils.clamp(effectiveTurnRate / CONFIG.arcadePitchRate, 0, 1.4);
    f.turnIntensity = turnIntensity;

    // Aerodynamic G-load factor: centrifugal G + vertical gravity component
    const centripetalG = (speedMs * effectiveTurnRate) / 9.81 * 0.72;
    const verticalG = Math.max(0, upVec.y);
    f.gLoad = THREE.MathUtils.lerp(f.gLoad || 1.0, Math.max(1.0, verticalG + centripetalG), 10 * dt);

    // (B) Engine Thrust vs Parasitic Drag Equilibrium
    let deltaV = 0;
    const baseAccelRate = f.isWEP ? 64 : 48; // km/h per second

    if (f.airspeed < targetAirspeed) {
      // Accelerating up towards level equilibrium target speed
      // Strong punch at low speed, smoothly tapering off near target speed
      const accelFactor = Math.max(0.18, 1.0 - (f.airspeed / (targetAirspeed + 25)));
      deltaV += baseAccelRate * accelFactor * dt;
    } else {
      // Speed exceeds level equilibrium target (e.g. zooming out of a dive)
      if (f.throttle === 0) {
        // Idle propeller resistance in flight vs active wheel braking on ground
        const idleDecel = f.isOnGround ? 58 : 20;
        deltaV -= idleDecel * dt;
      } else {
        // Quadratic high-speed parasitic drag: retains dive energy for several seconds
        const excessSpeed = f.airspeed - targetAirspeed;
        const dragFactor = 24 * (excessSpeed / 100) * (f.airspeed / 340);
        deltaV -= Math.min(65, dragFactor) * dt;
      }
    }

    if (!f.isOnGround) {
      // (C) Gravity Pitch-Energy Exchange (Kinetic <-> Potential Energy)
      // forwardVec.y > 0 in a climb (gravity bleeds speed)
      // forwardVec.y < 0 in a dive (gravity adds speed)
      // 1G gravity along flight vector = 9.81 m/s^2 ≈ 35.3 km/h/s
      const gravityAccAlongPath = -forwardVec.y * 36.0;
      deltaV += gravityAccAlongPath * dt;

      // (D) Sharp Turn Speed Bleed (Induced Drag)
      // Induced drag is proportional to angle-of-attack / turn rate squared
      if (turnIntensity > 0.28) {
        // Combat flaps give tighter instantaneous turn (+25%) but create +45% extra induced drag
        const flapDragMult = (state.flaps === 'combat') ? 1.45 : 1.0;
        // Non-linear induced drag curve: sharp turns bleed massive speed (up to 75-95 km/h/s)!
        const turnBleedRate = 75.0 * Math.pow(turnIntensity, 1.85) * flapDragMult * Math.max(0.60, f.airspeed / 270);
        deltaV -= turnBleedRate * dt;
      }

      // (E) Stall Dynamics & Gravity Nose-Heavy Fall
      // At low speed, elevators lose authority and gravity pulls the heavy engine down
      if (f.airspeed < CONFIG.stallSpeed + 18) {
        const stallDeficit = THREE.MathUtils.clamp((CONFIG.stallSpeed + 18 - f.airspeed) / 28, 0, 1);
        // Positive rotateX pitches the nose down towards the earth to regain airflow
        airplaneGroup.rotateX(2.2 * stallDeficit * dt);
      }

      // (F) Landing Gear Parasitic Form Drag
      // Extended wheels and oleo struts cause massive aerodynamic drag at cruising and diving speeds
      if (state.gear.position > 0.05) {
        const gearDragBleed = 35.0 * state.gear.position * Math.pow(f.airspeed / 260, 1.35);
        deltaV -= gearDragBleed * dt;
      }
    }

    // Apply net speed change
    f.airspeed = THREE.MathUtils.clamp(f.airspeed + deltaV, CONFIG.minAirspeed, CONFIG.maxAirspeed * 1.35);

    // 7. Aerodynamic Flight & Gravity Sink
    // An airplane flies in the direction its nose is pointing (+Z in model space)
    const forwardMotion = forwardVec.clone().multiplyScalar(speedMs * dt);
    airplaneGroup.position.add(forwardMotion);
    if (f.velocity) {
      f.velocity.copy(forwardVec).multiplyScalar(speedMs);
    }

    // Gravity & Lift:
    // At or above takeoff speed, wing lift supports the flight path along forwardVec.
    // At low speeds (below takeoff speed) or in knife-edge / inverted bank, gravity pulls the aircraft down:
    if (!f.isOnGround) {
      const speedRatio = THREE.MathUtils.clamp(f.airspeed / CONFIG.takeoffSpeed, 0, 1);
      const flapLiftBonus = (state.flaps === 'combat') ? 0.20 : 0.0;
      // Inverted flight: upVec.y is negative, wings actively push towards ground!
      const liftSupport = THREE.MathUtils.clamp(upVec.y * (speedRatio + flapLiftBonus), -1.0, 1.0);
      const sinkRate = CONFIG.gravity * Math.max(0, 1.0 - liftSupport);
      if (sinkRate > 0) {
        airplaneGroup.position.y -= sinkRate * dt;
      }
    }

    // 8. Ground Collision & Runway Interaction
    const terrainUnderPlane = getTerrainHeight(airplaneGroup.position.x, airplaneGroup.position.z);
    const landingGearHeight = 1.5;
    const groundLevel = Math.max(CONFIG.seaLevel, terrainUnderPlane) + landingGearHeight;

    const prevY = f.altitudeMSL;
    f.altitudeMSL = Math.max(0, airplaneGroup.position.y - landingGearHeight);
    f.altitudeAGL = Math.max(0, airplaneGroup.position.y - groundLevel);
    f.verticalSpeed = (dt > 0.0001) ? (f.altitudeMSL - prevY) / dt : 0;

    if (f.isOnGround) {
      // Firmly keep aircraft wheels rolling on the runway surface
      airplaneGroup.position.y = groundLevel;

      // Keep wings level on tricycle gear
      const currentEuler = new THREE.Euler().setFromQuaternion(airplaneGroup.quaternion, 'YXZ');
      currentEuler.z = 0; // level wings

      // Takeoff condition: must have sufficient airspeed AND active nose-up input
      const isPitchingUp = state.inputs.pitchUp || (state.mouseAim.pitch > 0.03);
      if (f.airspeed >= CONFIG.takeoffSpeed && isPitchingUp) {
        f.isOnGround = false;
      } else {
        // Prevent nose from pitching up or down into ground while taxiing
        currentEuler.x = 0;
        airplaneGroup.quaternion.setFromEuler(currentEuler);
      }
    } else {
      // Airborne: check for ground contact, landing, or crash
      if (airplaneGroup.position.y <= groundLevel) {
        const afIdx = getAirfieldUnderPlane(airplaneGroup.position.x, airplaneGroup.position.z);
        const isOverRunway = (afIdx >= 0);

        const impactVelocity = Math.abs(f.verticalSpeed);
        const isGearDown = state.gear.position >= 0.85;
        const isWingsLevel = Math.abs(currentBank) < 0.42;

        const maxLandingSpeed = Math.round(Math.min(195, Math.max(160, ((activeAircraftDef && activeAircraftDef.takeoffSpeed) || CONFIG.takeoffSpeed || 120) * 1.55)));

        // 1. Overspeed Touchdown -> CATASTROPHIC EXPLOSION!
        if (f.airspeed > maxLandingSpeed) {
          spawnExplosionAt(airplaneGroup.position, 2.8);
          playExplosionSound();
          triggerCrash(`💥 EXPLODED ON TOUCHDOWN! Landed too fast (${Math.round(f.airspeed)} km/h)! Landing gear sheared off — max safe landing speed is ${maxLandingSpeed} km/h. Reduce throttle and deploy combat flaps (F)!`);
          return;
        }

        // 2. Belly landing without landing gear -> Crash / Explode
        if (!isGearDown) {
          spawnExplosionAt(airplaneGroup.position, 2.3);
          playExplosionSound();
          triggerCrash('💥 CRASH! Belly landing without landing gear! Extend landing gear (G) before touchdown!');
          return;
        }

        // 3. Excessive sink rate (hard vertical impact) -> Explode
        if (impactVelocity >= 7.0) {
          spawnExplosionAt(airplaneGroup.position, 2.5);
          playExplosionSound();
          triggerCrash(`💥 EXPLODED! Hard landing impact (${impactVelocity.toFixed(1)} m/s sink rate)! Flare nose up to soften touchdown!`);
          return;
        }

        // 4. Wing strike on ground (severe bank angle) -> Explode
        if (!isWingsLevel) {
          spawnExplosionAt(airplaneGroup.position, 2.4);
          playExplosionSound();
          triggerCrash('💥 EXPLODED! Wing struck the ground during touchdown! Keep wings level when landing!');
          return;
        }

        // 5. Water contact outside runway
        if (!isOverRunway && airplaneGroup.position.y <= CONFIG.seaLevel + 1.2) {
          spawnExplosionAt(airplaneGroup.position, 2.0);
          playExplosionSound();
          triggerCrash('Crashed into the sea!');
          return;
        }

        // Smooth touchdown & landing rollout with gear extended
        airplaneGroup.position.y = groundLevel;
        f.isOnGround = true;
        const currentEuler = new THREE.Euler().setFromQuaternion(airplaneGroup.quaternion, 'YXZ');
        currentEuler.z = 0;
        currentEuler.x = 0;
        airplaneGroup.quaternion.setFromEuler(currentEuler);

        // Announce landing at specific airfield
        if (isOverRunway) {
          const landedAf = AIRPORTS[afIdx];
          let landingMsg;
          if (landedAf.team === 'friendly') {
            landingMsg = `🛬 TOUCHDOWN AT FRIENDLY BASE: ${landedAf.name.toUpperCase()} (${landedAf.code}) — BRAKE TO A STOP FOR REARM & REPAIR!`;
          } else if (landedAf.isDestroyed) {
            landingMsg = `🛬 TOUCHDOWN ON DESTROYED AIRFIELD (${landedAf.code}) — NO GROUND CREW HERE`;
          } else {
            landingMsg = `⚠️ TOUCHDOWN ON ENEMY RUNWAY (${landedAf.code}) — NO SERVICE HERE. BOMB IT TO STOP ENEMY RESPAWNS!`;
          }
          showCombatBanner(landingMsg, false);
        }
      }
    }

    // Milestone 2.1: Ground Crew Servicing on the friendly home base (Rearm & Repair after waiting)
    if (f.isOnGround) {
      const afIdx = getAirfieldUnderPlane(airplaneGroup.position.x, airplaneGroup.position.z);
      if (afIdx >= 0) {
        const af = AIRPORTS[afIdx];

        // Milestone 2.1: Ground Crew Rearm & Repair on Friendly Airfield (Wait to get rearmed & repaired)
        if (af.team === 'friendly') {
          const wep = f.wep;
          const needsRepair = state.playerHp < state.playerMaxHp;
          const needsGuns = state.weapons.heat > 0.05 || state.weapons.isJammed;
          const needsWEP = Boolean(wep && (wep.isCooling || wep.cooldownTimer > 0 || wep.durationLeft < wep.maxDuration));
          const needsBombs = Boolean(state.bombs && state.bombs.count < state.bombs.maxCount);
          const needsService = needsRepair || needsGuns || needsWEP || needsBombs || Boolean(state.needsAirfieldService);

          const isStoppedOnAirfield = (f.airspeed < 20);

          if (needsService && isStoppedOnAirfield) {
            const REQUIRED_WAIT_TIME = 10.0; // Increased repair and rearm time for airframe repair & heavy bomb loading
            state.airfieldWaitTimer = (state.airfieldWaitTimer || 0) + dt;

            const remainingSec = Math.max(0, REQUIRED_WAIT_TIME - state.airfieldWaitTimer).toFixed(1);
            const progressPct = Math.min(99, Math.round((state.airfieldWaitTimer / REQUIRED_WAIT_TIME) * 100));

            let stageMsg = 'PATCHING AIRFRAME & REPAIRING DAMAGE';
            if (state.airfieldWaitTimer >= 3.0 && state.airfieldWaitTimer < 6.5) {
              stageMsg = 'RE-BELTING MACHINE GUNS & COOLING WEP SYSTEM';
            } else if (state.airfieldWaitTimer >= 6.5) {
              stageMsg = 'HOISTING & REARMING 500-LB BELLY BOMBS';
            }

            showCombatBanner(`🛠️ REARMING & REPAIRING (${af.code}): ${progressPct}% [${remainingSec}s] — ${stageMsg}...`, false);

            if (state.airfieldWaitTimer >= REQUIRED_WAIT_TIME) {
              // Servicing Completed! (Repairs HP & Rearms/Cools Guns & Resets WEP & Reloads Bombs; does NOT restore lives)
              state.playerHp = state.playerMaxHp;
              state.weapons.heat = 0.0;
              state.weapons.isJammed = false;
              state.weapons.jamClickTimer = 0.0;
              if (muzzleLight) muzzleLight.intensity = 0;
              resetWEPState();

              if (state.bombs) {
                state.bombs.count = state.bombs.maxCount;
                state.bombs.dropCooldown = 0.0;
              }
              if (typeof updatePlayerBellyBombs === 'function') {
                updatePlayerBellyBombs();
              }

              state.airfieldWaitTimer = 0.0;
              state.needsAirfieldService = false;
              state.servicedAtAirfield = afIdx;

              playRepairRearmSound();
              updateAircraftUI();
              showCombatBanner(`✅ ${af.code} GROUND CREW: FULLY REARMED & REPAIRED! ARMOR: 100% · BOMBS LOADED (${state.bombs ? state.bombs.count : 2}/${state.bombs ? state.bombs.maxCount : 2}) · GUNS & WEP PRIMED`, true);
            }
          } else {
            // If aircraft moved before service completed
            if (state.airfieldWaitTimer && state.airfieldWaitTimer > 0.4 && f.airspeed >= 25) {
              state.airfieldWaitTimer = 0.0;
              showCombatBanner('⚠️ REARM & REPAIR INTERRUPTED: Aircraft moved before servicing finished!', false);
            }
          }
        }
      } else {
        if (state.airfieldWaitTimer && state.airfieldWaitTimer > 0.4) {
          state.airfieldWaitTimer = 0.0;
        }
      }
    } else {
      if (state.airfieldWaitTimer > 0) {
        state.airfieldWaitTimer = 0.0;
      }
      state.needsAirfieldService = true;
      state.servicedAtAirfield = -1;
    }

    // Combat Sector Boundary Checks (Map extends no further than the photo)
    {
      const distNorth = airplaneGroup.position.z - CONFIG.minZ;
      const distSouth = CONFIG.maxZ - airplaneGroup.position.z;
      const distWest = airplaneGroup.position.x - CONFIG.minX;
      const distEast = CONFIG.maxX - airplaneGroup.position.x;
      const minDistBorder = Math.min(distNorth, distSouth, distWest, distEast);

      if (minDistBorder < 180 && minDistBorder > 20) {
        showCombatBanner('⚠️ WARNING: APPROACHING COMBAT SECTOR BOUNDARY — TURN BACK!', false);
      } else if (minDistBorder <= 20) {
        // Soft autopilot deflection towards center of map (0, 0)
        const toCenterX = -airplaneGroup.position.x;
        const toCenterZ = -airplaneGroup.position.z;
        const centerHeading = Math.atan2(toCenterX, toCenterZ);
        state.flight.yaw = THREE.MathUtils.lerp(state.flight.yaw, centerHeading, dt * 2.5);
        state.mouseAim.yaw = THREE.MathUtils.lerp(state.mouseAim.yaw, centerHeading, dt * 2.5);

        // Clamp coordinates firmly within the boundary walls
        airplaneGroup.position.x = THREE.MathUtils.clamp(airplaneGroup.position.x, CONFIG.minX + 10, CONFIG.maxX - 10);
        airplaneGroup.position.z = THREE.MathUtils.clamp(airplaneGroup.position.z, CONFIG.minZ + 10, CONFIG.maxZ - 10);
        showCombatBanner('⚠️ COMBAT BOUNDARY EXCEEDED — RETURNING TO BATTLEFIELD!', false);
      }
    }

    // Stall warning (arcade instructor keeps plane from flat spinning)
    f.stallWarning = (!f.isOnGround && f.airspeed < CONFIG.stallSpeed && f.throttle < 0.6);

    // Pull Up Warning
    f.pullUpWarning = (!f.isOnGround && f.altitudeAGL < 45 && f.verticalSpeed < -5);

    // Gear Warning: low altitude, descending, gear not down
    f.gearWarning = (!f.isOnGround && f.altitudeAGL < 75 && f.verticalSpeed < -2.5 && state.gear.position < 0.85);

    // Landing Overspeed Warning: descending with gear down near ground but airspeed exceeds structural limit
    const maxSafeLndSpd = Math.round(Math.min(195, Math.max(160, ((activeAircraftDef && activeAircraftDef.takeoffSpeed) || CONFIG.takeoffSpeed || 120) * 1.55)));
    f.maxLandingSpeed = maxSafeLndSpd;
    f.landingOverspeedWarning = (!f.isOnGround && f.altitudeAGL < 75 && f.verticalSpeed < -1.0 && state.gear.position >= 0.85 && f.airspeed > maxSafeLndSpd);

    // Update Contrails / Smoke
    updateParticles(dt, speedMs);
  }

  // --- Wingtip Contrails & Particles ---
  function updateParticles(dt, speedMs) {
    const isHighGTurn = (state.flight.gLoad > 3.0) || (state.flight.turnIntensity > 0.60);
    const isHighSpeed = speedMs > 115;

    if ((isHighGTurn || isHighSpeed) && Math.random() < 0.85) {
      const pGeo = new THREE.SphereGeometry(isHighGTurn ? 0.48 : 0.32, 4, 4);
      const pMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: isHighGTurn ? 0.70 : 0.40,
      });

      const span = (CONFIG.wingtipSpan || 6.0);
      for (let side of [-span, span]) {
        const p = new THREE.Mesh(pGeo, pMat);
        const wingtipOffset = new THREE.Vector3(side, 0, 0).applyQuaternion(airplaneGroup.quaternion);
        p.position.copy(airplaneGroup.position).add(wingtipOffset);
        p.userData = { life: isHighGTurn ? 1.4 : 1.0, maxLife: isHighGTurn ? 1.4 : 1.0, scale: isHighGTurn ? 0.48 : 0.32 };
        scene.add(p);
        contrailParticles.push(p);
      }
    }

    for (let i = contrailParticles.length - 1; i >= 0; i--) {
      const p = contrailParticles[i];
      p.userData.life -= dt * 1.4;
      p.userData.scale += dt * 1.5;
      p.scale.setScalar(p.userData.scale);
      p.material.opacity = Math.max(0, p.userData.life * 0.4);

      if (p.userData.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        contrailParticles.splice(i, 1);
      }
    }

    for (let i = explosionParticles.length - 1; i >= 0; i--) {
      const ep = explosionParticles[i];
      ep.position.addScaledVector(ep.userData.velocity, dt);
      ep.userData.velocity.y -= CONFIG.gravity * dt;
      ep.userData.life -= dt;
      ep.scale.multiplyScalar(0.97);

      if (ep.userData.life <= 0) {
        scene.remove(ep);
        ep.geometry.dispose();
        ep.material.dispose();
        explosionParticles.splice(i, 1);
      }
    }

    for (let i = impactParticles.length - 1; i >= 0; i--) {
      const ip = impactParticles[i];
      ip.position.addScaledVector(ip.userData.velocity, dt);
      ip.userData.velocity.y -= CONFIG.gravity * 1.5 * dt;
      ip.userData.life -= dt;
      ip.material.opacity = Math.max(0, (ip.userData.life / ip.userData.maxLife) * 0.85);
      ip.scale.multiplyScalar(1.02);

      if (ip.userData.life <= 0) {
        scene.remove(ip);
        ip.geometry.dispose();
        ip.material.dispose();
        impactParticles.splice(i, 1);
      }
    }

    // Update Tracer Phosphorus Smoke Trail Particles
    for (let i = tracerSmokeParticles.length - 1; i >= 0; i--) {
      const sp = tracerSmokeParticles[i];
      sp.userData.life -= dt;
      sp.userData.scale += dt * 1.5;
      sp.scale.setScalar(sp.userData.scale / 0.22);
      sp.material.opacity = Math.max(0, (sp.userData.life / sp.userData.maxLife) * 0.35);

      if (sp.userData.life <= 0) {
        scene.remove(sp);
        sp.geometry.dispose();
        sp.material.dispose();
        tracerSmokeParticles.splice(i, 1);
      }
    }

    // Update Ambient Desert Sand Drift Particles across Island 1
    updateDesertDust(dt);
  }

  // =========================================================================
  // --- Milestone 1: Physical Ballistics & Weapon Hardpoints System ---
  // =========================================================================
  const activeBullets = [];
  const bulletPool = [];
  const MAX_ACTIVE_BULLETS = 180;
  const BULLET_GRAVITY = 6.0; // Ballistic gravity drop (m/s^2) for crisp, flat tracer trajectory
  let weaponTimer = 0;
  let hardpointCycleIndex = 0;

  // Segment sweep helper for high-speed continuous anti-tunneling collision
  function getClosestPointOnSegment(p0, p1, target) {
    const vx = p1.x - p0.x;
    const vy = p1.y - p0.y;
    const vz = p1.z - p0.z;
    const lenSq = vx * vx + vy * vy + vz * vz;
    if (lenSq < 0.0001) return { x: p0.x, y: p0.y, z: p0.z };
    const wx = target.x - p0.x;
    const wy = target.y - p0.y;
    const wz = target.z - p0.z;
    const dot = wx * vx + wy * vy + wz * vz;
    const t = Math.max(0, Math.min(1, dot / lenSq));
    return {
      x: p0.x + vx * t,
      y: p0.y + vy * t,
      z: p0.z + vz * t
    };
  }

  // Shared Tracer Streak Geometries (Oriented along +Z, streaming backwards from head Z = 0 to tail Z = -1)
  const tracerCoreGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6);
  tracerCoreGeo.rotateX(Math.PI / 2);
  tracerCoreGeo.translate(0, 0, -0.5); // Extends from Z = 0 (head) to Z = -1 (tail)

  const tracerGlowGeo = new THREE.CylinderGeometry(0.26, 0.20, 1.0, 8);
  tracerGlowGeo.rotateX(Math.PI / 2);
  tracerGlowGeo.translate(0, 0, -0.5); // Extends from Z = 0 (head) to Z = -1 (tail)

  // Spherical Head Flare (Glaringly visible directly from behind camera / chase / cockpit)
  const tracerHeadCoreGeo = new THREE.SphereGeometry(0.14, 8, 8);
  const tracerHeadGlowGeo = new THREE.SphereGeometry(0.38, 8, 8);

  const tracerCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: false
  });

  const smokeGeo = new THREE.SphereGeometry(0.22, 5, 5);

  function spawnTracerSmoke(pos) {
    if (tracerSmokeParticles.length > 120) return;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const p = new THREE.Mesh(smokeGeo, mat);
    p.position.copy(pos);
    p.userData = { life: 0.65, maxLife: 0.65, scale: 0.22 };
    scene.add(p);
    tracerSmokeParticles.push(p);
  }

  // --- Heavy Damage Smoke Trail (any aircraft: player, wingman, enemies) ---
  const DAMAGE_SMOKE_HP = 0.30;       // below 30% health an aircraft trails grey-black smoke
  const DAMAGE_SMOKE_CRITICAL = 0.15; // below 15% the trail gets thicker and darker
  const MAX_DAMAGE_SMOKE = 700;
  const damageSmokeParticles = [];
  const playerSmokeEmitter = { damageSmokeTimer: 0 };

  // Soft round puff (feathered alpha) shared by every smoke sprite; tinted per particle
  const damageSmokeTexture = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // emitter: any object used to keep its own emission timer (the aircraft record itself)
  function emitDamageSmoke(emitter, pos, quat, hpRatio, dt) {
    if (hpRatio >= DAMAGE_SMOKE_HP || hpRatio <= 0) return;
    const critical = hpRatio < DAMAGE_SMOKE_CRITICAL;
    const interval = critical ? 0.025 : 0.045;
    emitter.damageSmokeTimer = (emitter.damageSmokeTimer || 0) + dt;
    while (emitter.damageSmokeTimer >= interval) {
      emitter.damageSmokeTimer -= interval;
      if (damageSmokeParticles.length >= MAX_DAMAGE_SMOKE) continue;
      const shade = critical ? 0.10 + Math.random() * 0.06 : 0.22 + Math.random() * 0.08;
      const opacity = critical ? 0.75 : 0.6;
      const mat = new THREE.SpriteMaterial({
        map: damageSmokeTexture,
        color: new THREE.Color(shade, shade, shade),
        transparent: true,
        opacity,
        depthWrite: false,
        rotation: Math.random() * Math.PI * 2
      });
      const p = new THREE.Sprite(mat);
      // Pours out of the engine just behind the nose, with a little jitter
      const offset = new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.6, 1.5).applyQuaternion(quat);
      p.position.copy(pos).add(offset);
      const size = critical ? 4.2 : 3.2; // sprite diameter (m); large enough to overlap the next puff at combat speed
      const life = critical ? 3.6 : 2.8;
      p.scale.setScalar(size);
      p.userData = { life, maxLife: life, size, growth: critical ? 5.0 : 4.0, baseOpacity: opacity };
      scene.add(p);
      damageSmokeParticles.push(p);
    }
  }

  function updateDamageSmoke(dt) {
    for (let i = damageSmokeParticles.length - 1; i >= 0; i--) {
      const p = damageSmokeParticles[i];
      p.userData.life -= dt;
      p.userData.size += p.userData.growth * dt;
      p.scale.setScalar(p.userData.size);
      p.position.y += 1.6 * dt; // smoke billows upward as it spreads
      p.material.opacity = Math.max(0, (p.userData.life / p.userData.maxLife) * p.userData.baseOpacity);
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.material.dispose();
        damageSmokeParticles.splice(i, 1);
      }
    }
  }

  function clearDamageSmoke() {
    for (const p of damageSmokeParticles) {
      scene.remove(p);
      p.material.dispose();
    }
    damageSmokeParticles.length = 0;
  }

  // --- Muzzle Flash Starburst Visuals (Milestone 2) ---
  const flashCrossGeo = new THREE.PlaneGeometry(0.55, 1.25);
  flashCrossGeo.translate(0, 0, 0.625); // base at muzzle (Z=0), protruding forward (+Z)

  const flashMatCore = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const flashMatOuter = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const flashCoreSphereGeo = new THREE.SphereGeometry(0.18, 6, 6);

  function createMuzzleFlashMesh() {
    const group = new THREE.Group();

    // 3 intersecting starburst planes (0, 60, 120 deg)
    for (let angle of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const pOuter = new THREE.Mesh(flashCrossGeo, flashMatOuter);
      pOuter.rotation.z = angle;
      group.add(pOuter);

      const pInner = new THREE.Mesh(flashCrossGeo, flashMatCore);
      pInner.rotation.z = angle;
      pInner.scale.set(0.55, 0.75, 1);
      group.add(pInner);
    }

    // Glowing core sphere right at the muzzle aperture
    const coreSphere = new THREE.Mesh(flashCoreSphereGeo, flashMatCore);
    group.add(coreSphere);

    group.visible = false;
    group.userData = { life: 0 };
    if (scene) scene.add(group);
    return group;
  }

  function initMuzzleFlashes() {
    if (muzzleFlashes.length > 0) return;
    for (let i = 0; i < 8; i++) {
      muzzleFlashes.push(createMuzzleFlashMesh());
    }
  }

  function triggerMuzzleFlash(muzzlePos, muzzleQuat) {
    if (muzzleFlashes.length === 0) initMuzzleFlashes();
    let flash = muzzleFlashes.find(f => !f.visible);
    if (!flash) flash = muzzleFlashes[0];

    flash.position.copy(muzzlePos);
    flash.quaternion.copy(muzzleQuat);
    flash.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.85 + Math.random() * 0.45;
    flash.scale.set(s, s, s * (1.0 + Math.random() * 0.3));

    flash.visible = true;
    flash.userData.life = 0.045; // flash visible for ~2-3 frames
  }

  function createTracerMesh(glowColorHex) {
    const group = new THREE.Group();
    const glowMat = new THREE.MeshBasicMaterial({
      color: glowColorHex || 0xffb703,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const glowMesh = new THREE.Mesh(tracerGlowGeo, glowMat);
    const coreMesh = new THREE.Mesh(tracerCoreGeo, tracerCoreMat);
    const headGlowMesh = new THREE.Mesh(tracerHeadGlowGeo, glowMat);
    const headCoreMesh = new THREE.Mesh(tracerHeadCoreGeo, tracerCoreMat);

    group.add(glowMesh);
    group.add(coreMesh);
    group.add(headGlowMesh);
    group.add(headCoreMesh);

    group.visible = false;
    scene.add(group);
    return { group, glowMat, glowMesh, coreMesh, headGlowMesh, headCoreMesh };
  }

  // --- Environmental Bullet Impact Effects (Step 1 Strafing & Surface Hits) ---
  function spawnBulletImpact(x, y, z, isWater, caliberDmg = 12) {
    if (impactParticles.length > 180) return;
    const isHeavy = (caliberDmg > 10);
    const pCount = isWater ? (isHeavy ? 4 : 3) : (isHeavy ? 4 : 3);

    if (isWater) {
      // 1. Vertical Ocean Spray Geyser
      for (let k = 0; k < pCount; k++) {
        const pGeo = new THREE.SphereGeometry(isHeavy ? 0.65 : 0.45, 6, 6);
        const pMat = new THREE.MeshBasicMaterial({
          color: (k === 0) ? 0xffffff : 0xbae6fd,
          transparent: true,
          opacity: 0.90,
          depthWrite: false
        });
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.1, z + (Math.random() - 0.5) * 0.6);
        p.userData = {
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 3.5,
            14.0 + Math.random() * (isHeavy ? 14.0 : 8.0), // high vertical geyser jet
            (Math.random() - 0.5) * 3.5
          ),
          life: 0.70 + Math.random() * 0.25,
          maxLife: 0.95,
          growth: 1.045
        };
        scene.add(p);
        impactParticles.push(p);
      }

      // 2. Expanding Foam Ripple on Waterline
      const rippleGeo = new THREE.RingGeometry(0.3, isHeavy ? 1.6 : 1.1, 16);
      rippleGeo.rotateX(-Math.PI / 2);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.position.set(x, y + 0.08, z);
      ripple.userData = {
        velocity: new THREE.Vector3(0, 0, 0),
        life: 0.60,
        maxLife: 0.60,
        growth: 1.06
      };
      scene.add(ripple);
      impactParticles.push(ripple);
    } else {
      // 1. Billowing Ground Dust & Soil Plume
      for (let k = 0; k < pCount; k++) {
        const pGeo = new THREE.SphereGeometry(isHeavy ? 0.75 : 0.50, 6, 6);
        const dustColors = [0x92400e, 0xb45309, 0x78350f, 0xa16207];
        const pMat = new THREE.MeshBasicMaterial({
          color: dustColors[Math.floor(Math.random() * dustColors.length)],
          transparent: true,
          opacity: 0.70,
          depthWrite: false
        });
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.set(x + (Math.random() - 0.5) * 0.8, y + 0.2, z + (Math.random() - 0.5) * 0.8);
        p.userData = {
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * (isHeavy ? 8.0 : 5.0),
            4.0 + Math.random() * (isHeavy ? 8.0 : 5.0),
            (Math.random() - 0.5) * (isHeavy ? 8.0 : 5.0)
          ),
          life: 0.85 + Math.random() * 0.35,
          maxLife: 1.2,
          growth: 1.035
        };
        scene.add(p);
        impactParticles.push(p);
      }

      // 2. High-speed Rock Ricochet Spark Flecks
      for (let s = 0; s < 2; s++) {
        const sparkGeo = new THREE.SphereGeometry(0.12, 4, 4);
        const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.95 });
        const spk = new THREE.Mesh(sparkGeo, sparkMat);
        spk.position.set(x, y + 0.15, z);
        spk.userData = {
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 22,
            6 + Math.random() * 12,
            (Math.random() - 0.5) * 22
          ),
          life: 0.28,
          maxLife: 0.28,
          growth: 0.98
        };
        scene.add(spk);
        impactParticles.push(spk);
      }
    }
  }

  // Combat Explosion with debris & fireball chunks
  function spawnExplosionAt(pos, scale = 1.0) {
    if (!scene) return;
    const debrisGeo = new THREE.BoxGeometry(0.8 * scale, 0.8 * scale, 0.8 * scale);
    const count = Math.round(22 * scale);
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: (i % 3 === 0) ? 0xef4444 : ((i % 3 === 1) ? 0xf59e0b : 0x1f2937),
      });
      const debris = new THREE.Mesh(debrisGeo, mat);
      debris.position.copy(pos);
      debris.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 55 * scale,
          (Math.random() * 35 + 10) * scale,
          (Math.random() - 0.5) * 55 * scale
        ),
        life: 2.2 + Math.random() * 0.8
      };
      scene.add(debris);
      explosionParticles.push(debris);
    }
  }

  function spawnBullet() {
    if (state.isCrashed || !airplaneGroup) return;

    // Inhibit firing if guns are jammed due to overheat
    if (state.weapons && state.weapons.isJammed) return;

    const def = activeAircraftDef || AIRCRAFT_DEFS.mustang;
    const hardpoints = (def.hardpoints && def.hardpoints.length > 0)
      ? def.hardpoints
      : [new THREE.Vector3(0, 0, 3.5)];

    const weapon = def.weapons || {
      damagePerShot: 14,
      muzzleVelocity: 780,
      tracerColor: 0xffb703,
      tracerLength: 18.0,
      convergenceDistance: 600,
      heatPerShot: 0.008
    };

    // Cycle through real gun muzzle positions (4 hardpoints per aircraft)
    const hardpointIndex = hardpointCycleIndex % hardpoints.length;
    const localMuzzle = hardpoints[hardpointIndex];
    hardpointCycleIndex++;

    // Apply aircraft's specialized weapon damage & ballistic stats
    const isOuterGun = (hardpointIndex === 2 || hardpointIndex === 3);
    const muzzleVelocity = weapon.muzzleVelocity || 780;
    const tracerColor = isOuterGun ? 0xfef08a : (weapon.tracerColor || 0xffb703);
    const tracerLength = weapon.tracerLength || 18.0;
    const bulletDamage = weapon.damagePerShot || 14;
    const isHeavy = (def.id === 'bf109' || !isOuterGun);

    // 1. Calculate Real Muzzle World Position
    const muzzlePos = localMuzzle.clone().applyQuaternion(airplaneGroup.quaternion).add(airplaneGroup.position);

    // 2. Aircraft Orientation Vectors
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion).normalize();
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(airplaneGroup.quaternion).normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(airplaneGroup.quaternion).normalize();

    // 3. Gun Harmonization at 600m (Matches Crosshair & Mouse Aim Reticle Projection)
    const convergenceDist = weapon.convergenceDistance || 600;
    const timeToConvergence = convergenceDist / muzzleVelocity;
    const gravityDropComp = 0.5 * BULLET_GRAVITY * timeToConvergence * timeToConvergence;

    // Convergence point 600m ahead along gunsight line-of-sight.
    // Adding vertical compensation in World Y perfectly cancels downward gravity drop over 600m
    const convergencePoint = airplaneGroup.position.clone()
      .add(forwardVec.clone().multiplyScalar(convergenceDist));
    convergencePoint.y += gravityDropComp;

    // Base bore direction aiming directly from this hardpoint towards convergence point
    let boreDirection = convergencePoint.clone().sub(muzzlePos).normalize();

    // 4. Barrel Heat Dispersion / Angular Spread
    const heatSpreadAngle = 0.0012 + Math.pow(state.weapons.heat, 2.2) * 0.024;
    const spreadX = (Math.random() - 0.5) * heatSpreadAngle;
    const spreadY = (Math.random() - 0.5) * heatSpreadAngle;

    boreDirection.addScaledVector(rightVec, spreadX);
    boreDirection.addScaledVector(upVec, spreadY);
    boreDirection.normalize();

    // 5. Aircraft Speed Inheritance (Galilean Velocity Addition)
    const planeForwardSpeedMs = (state.flight.airspeed * 1000) / 3600;
    const planeVelocity = forwardVec.clone().multiplyScalar(planeForwardSpeedMs);

    // Bullet initial velocity in world coordinates
    const bulletVelocity = boreDirection.clone().multiplyScalar(muzzleVelocity).add(planeVelocity);

    // 6. Retrieve or instantiate physical tracer bullet
    let bullet = null;
    if (bulletPool.length > 0) {
      bullet = bulletPool.pop();
    } else if (activeBullets.length < MAX_ACTIVE_BULLETS) {
      const tracerObj = createTracerMesh(tracerColor);
      bullet = {
        meshGroup: tracerObj.group,
        glowMat: tracerObj.glowMat,
        glowMesh: tracerObj.glowMesh,
        coreMesh: tracerObj.coreMesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 2.8,
        smokeTimer: 0,
        tracerLength: tracerLength,
        damage: bulletDamage
      };
    } else {
      bullet = activeBullets.shift();
    }

    bullet.position.copy(muzzlePos);
    bullet.velocity.copy(bulletVelocity);
    bullet.life = 2.8; // ~2200m effective ballistic range
    bullet.tracerLength = tracerLength;
    bullet.damage = bulletDamage;
    bullet.owner = 'player';
    bullet.visualOnly = state.netRole === 'guest'; // online guest: the host decides every hit
    bullet.ownerPlane = null;
    bullet.glowMat.color.setHex(tracerColor);
    bullet.smokeTimer = 0;

    // Scale only streak cylinders backwards while keeping head flare spherical
    bullet.glowMesh.scale.set(1, 1, bullet.tracerLength);
    bullet.coreMesh.scale.set(1, 1, bullet.tracerLength);

    bullet.meshGroup.position.copy(bullet.position);
    bullet.meshGroup.lookAt(bullet.position.clone().add(bullet.velocity));
    bullet.meshGroup.visible = true;

    activeBullets.push(bullet);

    // 7. Barrel Heat Accumulation
    const heatGain = weapon.heatPerShot || 0.008;
    state.weapons.heat = Math.min(1.0, state.weapons.heat + heatGain);
    if (state.weapons.heat >= 1.0) {
      state.weapons.isJammed = true;
      playGunJamClickSound();
    }

    // 8. Visual 3D Muzzle Flash Starburst
    triggerMuzzleFlash(muzzlePos, airplaneGroup.quaternion);

    // Dynamic Point Light on Cowling, Propeller & Cockpit
    if (muzzleLight) {
      muzzleLight.color.setHex(isOuterGun ? 0xffcc44 : 0xffaa22);
      muzzleLight.position.copy(muzzlePos);
      muzzleLight.intensity = isOuterGun ? 2.8 : 4.2;
    }

    // 9. Multi-Layered Gunfire Audio Synthesizer
    playGunfireSound(isHeavy);

    // 10. Airframe Recoil Impulse & Camera Vibration
    if (state.cameraRecoil) {
      state.cameraRecoil.intensity = Math.min(1.0, state.cameraRecoil.intensity + (isHeavy ? 0.32 : 0.16));
    }
    // Kinetic gun recoil deceleration (Newton's 3rd law)
    state.flight.airspeed = Math.max(0, state.flight.airspeed - 0.04);
  }

  function updateWeapons(dt) {
    if (!airplaneGroup) return;

    const def = activeAircraftDef || AIRCRAFT_DEFS.mustang;
    const numGuns = (def.hardpoints && def.hardpoints.length) || 1;
    const rpmPerGun = (def.weapons && def.weapons.fireRateRpm) || 750;
    const totalRpm = rpmPerGun * numGuns;
    const baseFireInterval = 60 / totalRpm;

    // Milestone 3: Thermal Dissipation & Ram-Air Convective Cooling
    // Cooling rate scales with forward airspeed: cold ram air rushing through cowlings cools barrels faster
    const maxSpd = CONFIG.maxAirspeed || 600;
    const speedRatio = THREE.MathUtils.clamp(state.flight.airspeed / maxSpd, 0, 1.3);
    const airflowCoolingBonus = 0.10 * speedRatio; // up to +0.10/s in fast flight
    const isActivelyFiring = state.inputs.fire && !state.weapons.isJammed;
    // When actively firing, hot combustion gases and friction retard dissipation to ~30%
    // Italian Cooling bonus: the barrels shed heat 50% faster (and gain 40% less per shot, see the aircraft def)
    const coolingMult = (activeAircraftDef && activeAircraftDef.coolingBonus) ? 1.5 : 1.0;
    const coolingRate = (0.16 + airflowCoolingBonus) * (isActivelyFiring ? 0.30 : 1.0) * coolingMult;

    if (state.weapons.heat > 0) {
      state.weapons.heat = Math.max(0, state.weapons.heat - coolingRate * dt);
    }

    // Milestone 3: Clearing gun jam once cooled down below 30%
    if (state.weapons.isJammed) {
      if (state.weapons.heat <= 0.30) {
        state.weapons.isJammed = false;
      }
    }

    // Milestone 3: Rate-of-Fire Cadence Thermal Slowdown
    // As barrels exceed 65% heat, thermal friction slightly lowers cyclic rate of fire (up to 28% slower)
    const thermalSlowdown = 1.0 + Math.max(0, (state.weapons.heat - 0.65) / 0.35) * 0.28;
    const currentFireInterval = baseFireInterval * thermalSlowdown;

    // Gunfire trigger handling (LMB or Space)
    if (state.inputs.fire && !state.isCrashed) {
      if (state.weapons.isJammed) {
        // Dry click cadence while holding trigger on jammed gun
        state.weapons.jamClickTimer = (state.weapons.jamClickTimer || 0) + dt;
        if (state.weapons.jamClickTimer >= 0.18) {
          state.weapons.jamClickTimer = 0;
          playGunJamClickSound();
        }
      } else {
        weaponTimer += dt;
        let shotCount = 0;
        while (weaponTimer >= currentFireInterval && shotCount < 6) {
          spawnBullet();
          weaponTimer -= currentFireInterval;
          shotCount++;
          if (state.weapons.isJammed) break; // halted by gun jam
        }
      }
    } else {
      // Keep weapon primed for immediate response when trigger is pulled
      weaponTimer = Math.min(weaponTimer, currentFireInterval);
      state.weapons.jamClickTimer = 0.18; // ready for click if jammed
    }

    // Milestone 3: Barrel Residual Incandescent Heat Glow on Cowling
    if (muzzleLight) {
      if (state.weapons.heat > 0.60 && muzzleLight.intensity < 0.6) {
        // Red-hot barrel thermal glow
        const glowHeat = (state.weapons.heat - 0.60) / 0.40;
        muzzleLight.color.setHex(0xff3300);
        muzzleLight.intensity = glowHeat * 0.85;
      } else if (muzzleLight.intensity > 0) {
        muzzleLight.color.setHex(0xffaa22);
        muzzleLight.intensity = THREE.MathUtils.lerp(muzzleLight.intensity, 0, 26 * dt);
        if (muzzleLight.intensity < 0.05) muzzleLight.intensity = 0;
      }
    }

    // Milestone 3: Hot Barrel Smoke Wisps after firing bursts
    if (!state.inputs.fire && state.weapons.heat > 0.45 && Math.random() < 0.35) {
      const hardpoints = def.hardpoints || [];
      for (let hp of hardpoints) {
        const muzzlePos = hp.clone().applyQuaternion(airplaneGroup.quaternion).add(airplaneGroup.position);
        spawnTracerSmoke(muzzlePos);
      }
    }

    // Milestone 2 Juice: Update Muzzle Flash Meshes
    for (let f of muzzleFlashes) {
      if (f.visible) {
        f.userData.life -= dt;
        if (f.userData.life <= 0) {
          f.visible = false;
        }
      }
    }

    // Physical Ballistics Integration & Gravity Drop for all active bullets
    for (let i = activeBullets.length - 1; i >= 0; i--) {
      const b = activeBullets[i];

      // Gravity Drop: dv_y = -BULLET_GRAVITY * dt
      b.velocity.y -= BULLET_GRAVITY * dt;

      // Trajectory Position Integration (Ray-Sweep coordinate history)
      const prevX = b.position.x;
      const prevY = b.position.y;
      const prevZ = b.position.z;
      b.position.addScaledVector(b.velocity, dt);

      // Align physical tracer trail with velocity vector
      b.meshGroup.position.copy(b.position);
      b.meshGroup.lookAt(b.position.clone().add(b.velocity));

      // Leave faint tracer smoke trail in the air
      b.smokeTimer = (b.smokeTimer || 0) + dt;
      if (b.smokeTimer >= 0.022) {
        b.smokeTimer = 0;
        spawnTracerSmoke(b.position);
      }

      b.life -= dt;

      let hitTarget = false;
      const isFriendlyBullet = (!b.owner || b.owner === 'player' || b.owner === 'friendly_wingman' || (b.ownerPlane && b.ownerPlane.isFriendly) || b.owner === 'friendly_aa');
      const isPlayerDirectBullet = (!b.owner || b.owner === 'player');
      const prevPosObj = { x: prevX, y: prevY, z: prevZ };

      if (b.visualOnly) {
        // online guest: tracers only, the host decides every hit
      } else if (isFriendlyBullet) {
        // Check collision against Barrage Balloons (Step 2 Stationary Targets)
        for (let j = 0; j < barrageBalloons.length; j++) {
          const balloon = barrageBalloons[j];
          if (!balloon.isAlive) continue;

          // Continuous segment sweep check (prevents bullet tunneling through target between frames)
          const cp = getClosestPointOnSegment(prevPosObj, b.position, balloon.currentPos);
          const dx = cp.x - balloon.currentPos.x;
          const dy = cp.y - balloon.currentPos.y;
          const dz = cp.z - balloon.currentPos.z;
          const dSq = dx * dx + dy * dy + dz * dz;

          if (dSq < 144) {
            // Precise local ellipsoid calculation
            const localPt = new THREE.Vector3(cp.x, cp.y, cp.z).sub(balloon.currentPos);
            localPt.applyAxisAngle(new THREE.Vector3(0, 1, 0), -balloon.group.rotation.y);

            // Ellipsoidal envelope check (radii: X=4.4m, Y=4.4m, Z=9.5m)
            const ex = localPt.x / 4.4;
            const ey = localPt.y / 4.4;
            const ez = localPt.z / 9.5;
            if ((ex * ex + ey * ey + ez * ez) <= 1.08) {
              hitTarget = true;
              damageBarrageBalloon(balloon, b.damage || 14, new THREE.Vector3(cp.x, cp.y, cp.z));
              break;
            }
          }
        }

        // Check collision against Enemy Non-AI Aircraft (Steps 2.5 & 3)
        if (!hitTarget) {
          for (let k = 0; k < enemyPlanes.length; k++) {
            const ep = enemyPlanes[k];
            if (!ep.isAlive) continue;

            // Continuous segment sweep check (prevents high-speed tunneling)
            const cp = getClosestPointOnSegment(prevPosObj, b.position, ep.currentPos);
            const dx = cp.x - ep.currentPos.x;
            const dy = cp.y - ep.currentPos.y;
            const dz = cp.z - ep.currentPos.z;
            const dSq = dx * dx + dy * dy + dz * dz;

            if (dSq < 125) {
              const invQuat = ep.group.quaternion.clone().invert();
              const localPt = new THREE.Vector3(cp.x, cp.y, cp.z).sub(ep.currentPos).applyQuaternion(invQuat);

              // Modular Hitboxes: Engine/Nose, Wings, Fuselage
              let hitModule = null;
              if (localPt.z > 1.3 && localPt.z < 4.5 && Math.abs(localPt.x) < 1.1 && Math.abs(localPt.y) < 1.1) {
                hitModule = 'ENGINE';
              } else if (Math.abs(localPt.x) >= 1.1 && Math.abs(localPt.x) <= 6.2 && Math.abs(localPt.y) < 1.0 && Math.abs(localPt.z) < 2.2) {
                hitModule = 'WING';
              } else if (Math.abs(localPt.x) < 1.2 && Math.abs(localPt.y) < 1.2 && Math.abs(localPt.z) <= 5.0) {
                hitModule = 'FUSELAGE';
              }

              if (hitModule) {
                hitTarget = true;
                damageEnemyPlane(ep, b.damage || 14, hitModule, new THREE.Vector3(cp.x, cp.y, cp.z), isPlayerDirectBullet, (b.ownerPlane && b.ownerPlane.remote) ? b.ownerPlane : null);
                break;
              }
            }
          }
        }
      } else {
        // Enemy / Hostile AA Bullet: Check collision against Player Aircraft
        if (!state.isCrashed && airplaneGroup) {
          const cp = getClosestPointOnSegment(prevPosObj, b.position, airplaneGroup.position);
          const dx = cp.x - airplaneGroup.position.x;
          const dy = cp.y - airplaneGroup.position.y;
          const dz = cp.z - airplaneGroup.position.z;
          const dSq = dx * dx + dy * dy + dz * dz;

          if (dSq < 125) {
            const invQuat = airplaneGroup.quaternion.clone().invert();
            const localPt = new THREE.Vector3(cp.x, cp.y, cp.z).sub(airplaneGroup.position).applyQuaternion(invQuat);

            let hitModule = null;
            if (localPt.z > 1.3 && localPt.z < 4.5 && Math.abs(localPt.x) < 1.1 && Math.abs(localPt.y) < 1.1) {
              hitModule = 'ENGINE';
            } else if (Math.abs(localPt.x) >= 1.1 && Math.abs(localPt.x) <= 6.2 && Math.abs(localPt.y) < 1.0 && Math.abs(localPt.z) < 2.2) {
              hitModule = 'WING';
            } else if (Math.abs(localPt.x) < 1.2 && Math.abs(localPt.y) < 1.2 && Math.abs(localPt.z) <= 5.0) {
              hitModule = 'FUSELAGE';
            }

            if (hitModule) {
              hitTarget = true;
              damagePlayerAircraft(b.damage || 14, hitModule, new THREE.Vector3(cp.x, cp.y, cp.z), b.ownerPlane);
            }
          }
        }

        // Also check collision against Friendly Wingman (#2)
        for (const fwAlly of getFriendlyAllies()) {
          if (hitTarget || !fwAlly.isAlive || fwAlly.takenOver) continue;
          const cp = getClosestPointOnSegment(prevPosObj, b.position, fwAlly.currentPos);
          const dx = cp.x - fwAlly.currentPos.x;
          const dy = cp.y - fwAlly.currentPos.y;
          const dz = cp.z - fwAlly.currentPos.z;
          const dSq = dx * dx + dy * dy + dz * dz;

          if (dSq < 125) {
            const invQuat = fwAlly.group.quaternion.clone().invert();
            const localPt = new THREE.Vector3(cp.x, cp.y, cp.z).sub(fwAlly.currentPos).applyQuaternion(invQuat);

            let hitModule = null;
            if (localPt.z > 1.3 && localPt.z < 4.5 && Math.abs(localPt.x) < 1.1 && Math.abs(localPt.y) < 1.1) {
              hitModule = 'ENGINE';
            } else if (Math.abs(localPt.x) >= 1.1 && Math.abs(localPt.x) <= 6.2 && Math.abs(localPt.y) < 1.0 && Math.abs(localPt.z) < 2.2) {
              hitModule = 'WING';
            } else if (Math.abs(localPt.x) < 1.2 && Math.abs(localPt.y) < 1.2 && Math.abs(localPt.z) <= 5.0) {
              hitModule = 'FUSELAGE';
            }

            if (hitModule) {
              hitTarget = true;
              damageFriendlyWingman(b.damage || 14, hitModule, new THREE.Vector3(cp.x, cp.y, cp.z), fwAlly, b.ownerPlane || null);
            }
          }
        }

        // Factions: every AI nation's bullets also hit the planes of the other AI nations (never its own)
        const shooter = b.ownerPlane;
        if (!hitTarget && shooter && shooter.sideKey) {
          for (let k = 0; k < enemyPlanes.length; k++) {
            const ep = enemyPlanes[k];
            if (ep === shooter || !ep.isAlive || ep.sideKey === shooter.sideKey) continue;
            const cp = getClosestPointOnSegment(prevPosObj, b.position, ep.currentPos);
            const dx = cp.x - ep.currentPos.x;
            const dy = cp.y - ep.currentPos.y;
            const dz = cp.z - ep.currentPos.z;
            if (dx * dx + dy * dy + dz * dz >= 125) continue;
            const localPt = new THREE.Vector3(cp.x, cp.y, cp.z).sub(ep.currentPos).applyQuaternion(ep.group.quaternion.clone().invert());
            let hitModule = null;
            if (localPt.z > 1.3 && localPt.z < 4.5 && Math.abs(localPt.x) < 1.1 && Math.abs(localPt.y) < 1.1) {
              hitModule = 'ENGINE';
            } else if (Math.abs(localPt.x) >= 1.1 && Math.abs(localPt.x) <= 6.2 && Math.abs(localPt.y) < 1.0 && Math.abs(localPt.z) < 2.2) {
              hitModule = 'WING';
            } else if (Math.abs(localPt.x) < 1.2 && Math.abs(localPt.y) < 1.2 && Math.abs(localPt.z) <= 5.0) {
              hitModule = 'FUSELAGE';
            }
            if (hitModule) {
              hitTarget = true;
              damageEnemyPlane(ep, b.damage || 14, hitModule, new THREE.Vector3(cp.x, cp.y, cp.z), false, shooter);
              break;
            }
          }
        }
      }

      if (hitTarget) {
        b.meshGroup.visible = false;
        activeBullets.splice(i, 1);
        bulletPool.push(b);
        continue;
      }

      // Ground and Sea Impact Detection (Continuous collision interpolation)
      const terrainY = getTerrainHeight(b.position.x, b.position.z);
      const surfaceY = Math.max(CONFIG.seaLevel, terrainY);

      if (b.position.y <= surfaceY) {
        // Continuous sweep interpolation: find exact surface point where ray crossed surfaceY
        const dy = prevY - b.position.y;
        const frac = dy > 0.001 ? THREE.MathUtils.clamp((prevY - surfaceY) / dy, 0, 1) : 1;
        const hitX = THREE.MathUtils.lerp(prevX, b.position.x, frac);
        const hitZ = THREE.MathUtils.lerp(prevZ, b.position.z, frac);
        const hitTerrainY = getTerrainHeight(hitX, hitZ);
        const isWater = (hitTerrainY <= CONFIG.seaLevel);

        spawnBulletImpact(hitX, surfaceY, hitZ, isWater, b.damage || 14);

        b.meshGroup.visible = false;
        activeBullets.splice(i, 1);
        bulletPool.push(b);
        continue;
      }

      // Life expiration or out of map bounds
      if (b.life <= 0 || Math.abs(b.position.x) > CONFIG.worldSize * 0.95 || Math.abs(b.position.z) > CONFIG.worldSize * 0.95) {
        b.meshGroup.visible = false;
        activeBullets.splice(i, 1);
        bulletPool.push(b);
      }
    }
  }

  function clearActiveBullets() {
    for (let b of activeBullets) {
      b.meshGroup.visible = false;
      bulletPool.push(b);
    }
    activeBullets.length = 0;

    for (let f of muzzleFlashes) {
      f.visible = false;
      f.userData.life = 0;
    }
    if (muzzleLight) muzzleLight.intensity = 0;
    if (state.cameraRecoil) state.cameraRecoil.intensity = 0;

    for (let sp of tracerSmokeParticles) {
      scene.remove(sp);
      sp.geometry.dispose();
      sp.material.dispose();
    }
    tracerSmokeParticles.length = 0;
  }

  // --- Historical Barrage Balloons (Step 2 Stationary Aerial Targets) ---
  const barrageBalloons = [];
  let hitMarkerTimer = null;
  let combatBannerTimer = null;

  function triggerHitMarker(isKill) {
    const elMarker = document.getElementById('hit-marker');
    if (!elMarker) return;
    if (isKill) {
      elMarker.classList.add('kill');
    } else {
      elMarker.classList.remove('kill');
    }
    elMarker.classList.add('active');

    if (hitMarkerTimer) clearTimeout(hitMarkerTimer);
    hitMarkerTimer = setTimeout(() => {
      elMarker.classList.remove('active');
    }, 130);
  }

  function showCombatBanner(text, isKill = false) {
    const elBanner = document.getElementById('combat-banner');
    if (!elBanner) return;
    elBanner.textContent = text;
    elBanner.style.color = isKill ? '#fbbf24' : '#ffffff';
    elBanner.classList.add('show');

    if (combatBannerTimer) clearTimeout(combatBannerTimer);
    combatBannerTimer = setTimeout(() => {
      elBanner.classList.remove('show');
    }, 1600);
  }

  function initBarrageBalloons() {
    if (typeof BarrageBalloonBuilder === 'undefined' || !scene) return;

    for (let cfg of BALLOON_CONFIGS) {
      const terrainY = getTerrainHeight(cfg.x, cfg.z);
      const groundY = Math.max(CONFIG.seaLevel, terrainY);
      const balloonAlt = groundY + (cfg.cableAlt || 340);

      // 1. Build Balloon Mesh
      const balloonData = BarrageBalloonBuilder.buildBarrageBalloon({
        id: cfg.id,
        scale: 1.0
      });
      const bGroup = balloonData.group;
      const basePos = new THREE.Vector3(cfg.x, balloonAlt, cfg.z);
      bGroup.position.copy(basePos);
      bGroup.rotation.y = cfg.yaw;
      scene.add(bGroup);

      // 2. Build Ground Winch Station
      const winchTruck = BarrageBalloonBuilder.buildMooringWinchTruck();
      winchTruck.position.set(cfg.x, groundY, cfg.z);
      winchTruck.rotation.y = cfg.yaw;
      scene.add(winchTruck);

      // 3. Build Mooring Steel Cable (Line from Ground to Bridle Ring)
      const bridleWorld = balloonData.bridlePos.clone().applyMatrix4(bGroup.matrixWorld);
      const cableGeo = new THREE.BufferGeometry();
      const cablePositions = new Float32Array([
        bridleWorld.x, bridleWorld.y, bridleWorld.z,
        cfg.x, groundY + 1.6, cfg.z
      ]);
      cableGeo.setAttribute('position', new THREE.BufferAttribute(cablePositions, 3));
      const cableMat = new THREE.LineBasicMaterial({ color: 0x94a3b8, linewidth: 1.5 });
      const cableLine = new THREE.Line(cableGeo, cableMat);
      scene.add(cableLine);

      // 4. Register Target Entity
      barrageBalloons.push({
        id: cfg.id,
        group: bGroup,
        envelopeMesh: balloonData.envelopeMesh,
        bridlePos: balloonData.bridlePos,
        cableLine: cableLine,
        cableGeo: cableGeo,
        anchorPos: new THREE.Vector3(cfg.x, groundY + 1.6, cfg.z),
        basePos: basePos,
        currentPos: basePos.clone(),
        yaw: cfg.yaw,
        radius: balloonData.dimensions.radius || 4.2,
        halfLength: (balloonData.dimensions.length || 18.0) * 0.5,
        hp: 75,
        maxHp: 75,
        isAlive: true,
        isBurning: false,
        fallSpeed: 0,
        fallRot: new THREE.Vector3(),
        smokeTimer: 0,
        swayPhase: Math.random() * Math.PI * 2
      });
    }
  }

  function damageBarrageBalloon(b, damage, hitPos) {
    if (!b || !b.isAlive) return;
    b.hp -= damage;

    // Audio hit thump & visual sparks
    playTargetHitSound();
    spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false);

    const isKill = (b.hp <= 0);
    if (!net.quietHits) triggerHitMarker(isKill);

    if (isKill) {
      b.isAlive = false;
      b.isBurning = true;
      b.fallSpeed = 5;
      b.fallRot.set(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.7
      );

      // Hydrogen explosion fireball
      spawnExplosionAt(b.currentPos, 2.5);
      playExplosionSound();

      // Blacken/char the balloon canvas
      if (b.envelopeMesh && b.envelopeMesh.material) {
        b.envelopeMesh.material.color.setHex(0x1e293b);
      }

      // Snap mooring cable
      if (b.cableLine && scene) {
        scene.remove(b.cableLine);
      }

      if (!net.quietHits) showCombatBanner('💥 BARRAGE BALLOON DESTROYED +150', true);
      netOnHostBalloonDown(b);
    } else {
      showCombatBanner('TARGET HIT', false);
    }
  }

  function updateBarrageBalloons(dt) {
    for (let i = 0; i < barrageBalloons.length; i++) {
      const b = barrageBalloons[i];
      if (b.isAlive) {
        // Atmospheric buoyant sway
        b.swayPhase += dt * 0.65;
        const bobY = Math.sin(b.swayPhase) * 1.6;
        const driftX = Math.cos(b.swayPhase * 0.55) * 2.4;
        const driftZ = Math.sin(b.swayPhase * 0.45) * 1.5;

        b.currentPos.set(
          b.basePos.x + driftX,
          b.basePos.y + bobY,
          b.basePos.z + driftZ
        );
        b.group.position.copy(b.currentPos);
        b.group.rotation.y = b.yaw + Math.sin(b.swayPhase * 0.6) * 0.08;

        // Update mooring cable attachment
        if (b.cableGeo) {
          const bridleWorld = b.bridlePos.clone().applyMatrix4(b.group.matrixWorld);
          const posAttr = b.cableGeo.attributes.position;
          posAttr.setXYZ(0, bridleWorld.x, bridleWorld.y, bridleWorld.z);
          posAttr.setXYZ(1, b.anchorPos.x, b.anchorPos.y, b.anchorPos.z);
          posAttr.needsUpdate = true;
        }
      } else if (b.isBurning) {
        // Accelerate falling due to gravity & loss of buoyant gas
        b.fallSpeed += 24 * dt;
        b.currentPos.y -= b.fallSpeed * dt;
        b.group.position.copy(b.currentPos);
        b.group.rotation.x += b.fallRot.x * dt;
        b.group.rotation.y += b.fallRot.y * dt;
        b.group.rotation.z += b.fallRot.z * dt;

        // Billowing trail of smoke and burning embers
        b.smokeTimer = (b.smokeTimer || 0) + dt;
        if (b.smokeTimer >= 0.035) {
          b.smokeTimer = 0;
          spawnTracerSmoke(b.currentPos);
        }

        // Test impact with ground or ocean surface
        const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(b.currentPos.x, b.currentPos.z));
        const restY = groundY + (b.radius || 4.2);
        if (b.currentPos.y <= restY) {
          b.isBurning = false;
          b.currentPos.y = restY;
          b.group.position.y = restY;
          // Crash impact explosion
          spawnExplosionAt(b.currentPos, 2.0);
          playExplosionSound();
        }
      }
    }
  }

  // =========================================================================
  // --- BOMB ORDNANCE, TACTICAL ANTI-AIR DEFENSES & PORT STRIKE SYSTEM ---
  // =========================================================================

  // 1. Single 500-lb (AN-M64 / SC 250) High-Explosive Aerial Bomb 3D Model
  function createSingleBombMesh() {
    const bomb = new THREE.Group();
    bomb.name = 'BellyBomb';

    const matBombBody = new THREE.MeshStandardMaterial({
      color: 0x3b4436, // WW2 Olive Drab Ordnance
      roughness: 0.55,
      metalness: 0.30
    });

    const matYellowStripe = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Yellow High-Explosive Hazard Ring
      roughness: 0.40,
      metalness: 0.15
    });

    const matFuze = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brass Nose Impact Fuze
      metalness: 0.85,
      roughness: 0.25
    });

    const matFin = new THREE.MeshStandardMaterial({
      color: 0x27272a, // Pressed Steel Stabilizing Fins & Shroud
      roughness: 0.65,
      metalness: 0.40
    });

    // Aerodynamic Cylindrical Bomb Casing
    const bodyGeo = new THREE.CylinderGeometry(0.19, 0.18, 0.88, 14);
    bodyGeo.rotateX(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeo, matBombBody);
    bodyMesh.castShadow = true;
    bomb.add(bodyMesh);

    // Parabolic / Hemispherical Nose Cap
    const noseGeo = new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    noseGeo.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, matBombBody);
    noseMesh.position.set(0, 0, 0.44);
    noseMesh.castShadow = true;
    bomb.add(noseMesh);

    // High-Explosive Yellow Hazard Ring
    const stripeGeo = new THREE.CylinderGeometry(0.193, 0.193, 0.10, 14);
    stripeGeo.rotateX(Math.PI / 2);
    const stripeMesh = new THREE.Mesh(stripeGeo, matYellowStripe);
    stripeMesh.position.set(0, 0, 0.38);
    bomb.add(stripeMesh);

    // Nose Impact Fuze & Spinner Vane
    const fuzeGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8);
    fuzeGeo.rotateX(Math.PI / 2);
    const fuzeMesh = new THREE.Mesh(fuzeGeo, matFuze);
    fuzeMesh.position.set(0, 0, 0.68);
    bomb.add(fuzeMesh);

    const vaneGeo = new THREE.BoxGeometry(0.12, 0.015, 0.025);
    const vaneMesh = new THREE.Mesh(vaneGeo, matFuze);
    vaneMesh.position.set(0, 0, 0.73);
    bomb.add(vaneMesh);

    // Tapered Aft Tail Cone
    const tailConeGeo = new THREE.ConeGeometry(0.18, 0.36, 14);
    tailConeGeo.rotateX(-Math.PI / 2);
    const tailConeMesh = new THREE.Mesh(tailConeGeo, matBombBody);
    tailConeMesh.position.set(0, 0, -0.62);
    tailConeMesh.castShadow = true;
    bomb.add(tailConeMesh);

    // 4 Cruciform Tail Stabilizing Fins
    const finVertGeo = new THREE.BoxGeometry(0.02, 0.44, 0.32);
    const finVert = new THREE.Mesh(finVertGeo, matFin);
    finVert.position.set(0, 0, -0.72);
    finVert.castShadow = true;
    bomb.add(finVert);

    const finHorizGeo = new THREE.BoxGeometry(0.44, 0.02, 0.32);
    const finHoriz = new THREE.Mesh(finHorizGeo, matFin);
    finHoriz.position.set(0, 0, -0.72);
    finHoriz.castShadow = true;
    bomb.add(finHoriz);

    // Cylindrical Fin Shroud Ring
    const shroudGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.12, 14, 1, true);
    shroudGeo.rotateX(Math.PI / 2);
    const shroudMesh = new THREE.Mesh(shroudGeo, matFin);
    shroudMesh.position.set(0, 0, -0.72);
    shroudMesh.castShadow = true;
    bomb.add(shroudMesh);

    // Ventral Bomb Rack Mounting Bracket / Sway Braces
    const rackGeo = new THREE.BoxGeometry(0.09, 0.08, 0.70);
    const rackMesh = new THREE.Mesh(rackGeo, matFin);
    rackMesh.position.set(0, 0.18, 0.0);
    bomb.add(rackMesh);

    return bomb;
  }

  // 2. Belly Bombs Attachment to Aircraft Fuselage
  // Visually slightly stick out of the fuselage, especially the ventral belly part of the plane
  let playerBellyBombGroup = null;
  let playerBellyBombs = []; // one mesh per rack slot of the active aircraft (activeAircraftDef.bombRack)

  function getActiveBombRack() {
    return (activeAircraftDef && activeAircraftDef.bombRack) || DEFAULT_BOMB_RACK;
  }

  function setupPlayerBellyBombs(planeGroup) {
    if (!planeGroup) return;

    const existing = planeGroup.getObjectByName('PlayerBellyBombs');
    if (existing) planeGroup.remove(existing);

    playerBellyBombGroup = new THREE.Group();
    playerBellyBombGroup.name = 'PlayerBellyBombs';

    // Positioned semi-recessed in the lower belly contour:
    // Top third rests snugly in the ventral bomb bay / rack,
    // while the lower body, yellow hazard band, nose fuze, and tail fins
    // visually slightly stick out beneath the fuselage belly!
    playerBellyBombs = getActiveBombRack().map(pos => {
      const bomb = createSingleBombMesh();
      bomb.position.copy(pos);
      playerBellyBombGroup.add(bomb);
      return bomb;
    });

    planeGroup.add(playerBellyBombGroup);
    updatePlayerBellyBombs();
  }

  function updatePlayerBellyBombs() {
    if (!playerBellyBombGroup || playerBellyBombGroup.parent !== airplaneGroup) {
      if (airplaneGroup) setupPlayerBellyBombs(airplaneGroup);
      else return;
    }
    const count = (state.bombs && state.bombs.count !== undefined) ? state.bombs.count : 0;
    // Slot i stays loaded while i < count; the highest loaded slot is released next
    playerBellyBombs.forEach((bomb, i) => { bomb.visible = i < count; });
  }

  // 3. Dropping Bombs System
  const activeBombs = [];
  const activeShockwaves = [];
  const bombSmokePlumes = [];

  function dropPlayerBomb() {
    if (state.inMainMenu || state.isCrashed || !airplaneGroup) return;

    if (state.flight && state.flight.isOnGround && state.flight.airspeed < 45) {
      showCombatBanner('⚠️ CANNOT RELEASE BOMBS WHILE STATIONARY ON RUNWAY!', false);
      return;
    }

    if (!state.bombs || state.bombs.count <= 0) {
      showCombatBanner('⚠️ NO BOMBS REMAINING — LAND AT FRIENDLY AIRFIELD TO RELOAD!', false);
      playGunJamClickSound();
      return;
    }

    if (state.bombs.dropCooldown > 0) return;
    state.bombs.dropCooldown = state.bombs.cooldownTime || 0.45;

    // Release the highest loaded rack slot (standard rack: left first, then right)
    const rack = getActiveBombRack();
    const localRackPos = rack[Math.min(rack.length, state.bombs.count) - 1].clone();

    const worldStartPos = localRackPos.clone().applyQuaternion(airplaneGroup.quaternion).add(airplaneGroup.position);

    state.bombs.count--;
    updatePlayerBellyBombs();
    updateHUD();

    const f = state.flight;
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
    const speedMs = (f.airspeed || 0) / 3.6;
    const initialVel = (f.velocity && f.velocity.lengthSq() > 1) 
      ? f.velocity.clone() 
      : forwardVec.clone().multiplyScalar(speedMs);

    // Downward separation release impulse relative to aircraft
    const sepImpulse = new THREE.Vector3(0, -3.8, 0).applyQuaternion(airplaneGroup.quaternion);
    initialVel.add(sepImpulse);

    spawnFallingBomb(worldStartPos, initialVel, airplaneGroup.quaternion.clone());
    // Online: a guest's bomb is only drawn locally (the host drops the real one); the host's own bombs carry its team
    const releasedBomb = activeBombs[activeBombs.length - 1];
    if (netOnLocalBomb(worldStartPos, initialVel)) releasedBomb.visualOnly = true;
    else if (state.netRole === 'host') { releasedBomb.netOwner = 'host'; releasedBomb.netTeam = net.myTeam; }

    playBombReleaseSound();
    if (state.bombs.count > 0) {
      showCombatBanner(`💣 BOMB RELEASED! (${state.bombs.count} REMAINING)`, false);
    } else {
      showCombatBanner('💣 FINAL BOMB RELEASED! [LAND AT AIRFIELD TO RELOAD]', false);
    }
  }

  function spawnFallingBomb(startPos, velocity, quat) {
    const bombMesh = createSingleBombMesh();
    bombMesh.position.copy(startPos);
    bombMesh.quaternion.copy(quat);
    scene.add(bombMesh);

    activeBombs.push({
      mesh: bombMesh,
      velocity: velocity,
      life: 25.0,
      smokeTimer: 0.0,
      prevPos: startPos.clone()
    });
  }

  function updateBombs(dt) {
    if (state.bombs && state.bombs.dropCooldown > 0) {
      state.bombs.dropCooldown = Math.max(0, state.bombs.dropCooldown - dt);
    }

    for (let i = activeBombs.length - 1; i >= 0; i--) {
      const b = activeBombs[i];
      b.life -= dt;
      if (b.life <= 0) {
        scene.remove(b.mesh);
        activeBombs.splice(i, 1);
        continue;
      }

      b.prevPos.copy(b.mesh.position);

      b.velocity.y -= CONFIG.gravity * dt;
      b.velocity.x *= Math.max(0, 1.0 - 0.035 * dt);
      b.velocity.z *= Math.max(0, 1.0 - 0.035 * dt);

      b.mesh.position.addScaledVector(b.velocity, dt);

      const speed = b.velocity.length();
      if (speed > 1.0) {
        const targetLook = b.mesh.position.clone().add(b.velocity);
        b.mesh.lookAt(targetLook);
      }

      b.smokeTimer += dt;
      if (b.smokeTimer >= 0.035) {
        b.smokeTimer = 0;
        spawnTracerSmoke(b.mesh.position.clone());
      }

      const currentY = b.mesh.position.y;
      const terrainY = Math.max(CONFIG.seaLevel, getTerrainHeight(b.mesh.position.x, b.mesh.position.z));

      if (currentY <= terrainY) {
        const impactPos = new THREE.Vector3(b.mesh.position.x, terrainY, b.mesh.position.z);
        detonateBomb(b, impactPos);
        scene.remove(b.mesh);
        activeBombs.splice(i, 1);
      }
    }
  }

  function clearActiveBombs() {
    for (let b of activeBombs) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
    }
    activeBombs.length = 0;
  }

  function detonateBomb(bomb, impactPos) {
    playBombExplosionSound();
    spawnShockwave(impactPos);
    spawnExplosionAt(impactPos, 4.2);

    if (impactPos.y <= CONFIG.seaLevel + 1.5) {
      spawnWaterGeyser(impactPos);
    } else {
      spawnBombCrater(impactPos);
    }

    spawnBombSmokePlume(impactPos);

    if (airplaneGroup) {
      const distToPlayer = impactPos.distanceTo(airplaneGroup.position);
      if (distToPlayer < 850) {
        const shakeFactor = Math.max(0, 1.0 - distToPlayer / 850);
        if (state.cameraRecoil) {
          state.cameraRecoil.intensity = Math.max(state.cameraRecoil.intensity || 0, 1.6 * shakeFactor);
          state.cameraRecoil.time = 0.8 * shakeFactor;
        }
      }
    }

    if (bomb.visualOnly) return; // online guest: the host's replay of this impact does the damage
    netOnHostBombImpact(bomb, impactPos);
    net.bombTeam = bomb.netTeam;
    applyBombBlastDamage(impactPos, 75);
    net.bombTeam = undefined;
  }

  function spawnShockwave(pos) {
    const geo = new THREE.SphereGeometry(4.0, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.90,
      wireframe: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    activeShockwaves.push({ mesh, timer: 0.0, maxLife: 0.40, maxScale: 8.5 });
  }

  function spawnWaterGeyser(pos) {
    const geyserGeo = new THREE.ConeGeometry(5.0, 32, 12);
    const geyserMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.80,
      roughness: 0.2
    });
    const geyser = new THREE.Mesh(geyserGeo, geyserMat);
    geyser.position.set(pos.x, pos.y + 16, pos.z);
    scene.add(geyser);
    activeShockwaves.push({ mesh: geyser, timer: 0.0, maxLife: 1.2, maxScale: 1.5 });
  }

  function spawnBombCrater(pos) {
    const craterGeo = new THREE.CircleGeometry(7.5, 16);
    craterGeo.rotateX(-Math.PI / 2);
    const craterMat = new THREE.MeshBasicMaterial({
      color: 0x171717,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const crater = new THREE.Mesh(craterGeo, craterMat);
    crater.position.set(pos.x, pos.y + 0.15, pos.z);
    scene.add(crater);
  }

  function spawnBombSmokePlume(pos) {
    const geo = new THREE.DodecahedronGeometry(3.5, 1);
    for (let p = 0; p < 8; p++) {
      const mat = new THREE.MeshStandardMaterial({
        color: (p % 2 === 0 ? 0x1c1917 : 0x292524),
        transparent: true,
        opacity: 0.75,
        roughness: 0.9
      });
      const puff = new THREE.Mesh(geo, mat);
      puff.position.set(
        pos.x + (Math.random() - 0.5) * 16,
        pos.y + 2.0 + p * 3.5,
        pos.z + (Math.random() - 0.5) * 16
      );
      scene.add(puff);
      bombSmokePlumes.push({
        mesh: puff,
        life: 12.0 + Math.random() * 4.0,
        totalLife: 16.0,
        maxOpacity: 0.75,
        riseSpeed: 3.5 + Math.random() * 2.5,
        driftX: 2.0 + Math.random() * 2.0
      });
    }
  }

  function updateShockwaves(dt) {
    for (let i = activeShockwaves.length - 1; i >= 0; i--) {
      const sw = activeShockwaves[i];
      sw.timer += dt;
      const progress = sw.timer / sw.maxLife;
      if (progress >= 1.0) {
        scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        activeShockwaves.splice(i, 1);
      } else {
        const scale = 1.0 + (sw.maxScale - 1.0) * Math.sin(progress * Math.PI * 0.5);
        sw.mesh.scale.set(scale, scale * 0.75, scale);
        sw.mesh.material.opacity = 0.90 * (1.0 - progress);
      }
    }

    for (let i = bombSmokePlumes.length - 1; i >= 0; i--) {
      const sp = bombSmokePlumes[i];
      sp.life -= dt;
      if (sp.life <= 0) {
        scene.remove(sp.mesh);
        sp.mesh.geometry.dispose();
        sp.mesh.material.dispose();
        bombSmokePlumes.splice(i, 1);
      } else {
        sp.mesh.position.y += sp.riseSpeed * dt;
        sp.mesh.position.x += sp.driftX * dt;
        sp.mesh.scale.multiplyScalar(1.0 + 0.18 * dt);
        if (sp.mesh.material) {
          sp.mesh.material.opacity = Math.max(0, sp.maxOpacity * (sp.life / sp.totalLife));
        }
      }
    }
  }

  function applyBombBlastDamage(impactPos, blastRadius) {
    let hitAnything = false;

    // A. Damage Anti-Air Defense Systems
    if (typeof aaDefenseSystems !== 'undefined') {
      for (let aa of aaDefenseSystems) {
        if (!aa.isAlive) continue;
        const dist = Math.hypot(impactPos.x - aa.x, impactPos.z - aa.z);
        if (dist <= blastRadius + 12) {
          const dmg = Math.round(750 * Math.max(0.25, 1.0 - dist / (blastRadius + 12)));
          damageAADefense(aa, dmg, impactPos);
          hitAnything = true;
        }
      }
    }

    // B. Damage Ports (Docks & Moored Ships)
    for (let dock of DOCKS) {
      const dockDist = Math.hypot(impactPos.x - dock.x, impactPos.z - dock.z);
      if (dockDist <= dock.pierLength + blastRadius + 15) {
        damagePort(dock, impactPos, blastRadius);
        hitAnything = true;
      }
    }

    // C. Damage Airfields (Control Tower, Hangars, Base Facilities)
    for (let i = 0; i < AIRPORTS.length; i++) {
      const af = AIRPORTS[i];
      const afDist = Math.hypot(impactPos.x - af.x, impactPos.z - af.z);
      if (afDist <= af.length / 2 + blastRadius + 120) {
        damageAirfield(af, i, impactPos, blastRadius);
        hitAnything = true;
      }
    }

    // D. Damage Barrage Balloons
    for (let b of barrageBalloons) {
      if (!b.isAlive) continue;
      const bDist = impactPos.distanceTo(b.currentPos);
      if (bDist <= blastRadius + 25) {
        damageBarrageBalloon(b, 500, impactPos);
        hitAnything = true;
      }
    }

    // E. Damage Grounded Enemy Aircraft
    for (let ep of enemyPlanes) {
      if (!ep.isAlive) continue;
      const epDist = impactPos.distanceTo(ep.currentPos);
      if (epDist <= blastRadius) {
        damageEnemyPlane(ep, 600, 'FUSELAGE', impactPos, true);
        hitAnything = true;
      }
    }

    if (hitAnything && !net.quietHits) {
      triggerHitMarker(true);
    }
  }

  function damageAirfield(af, afIdx, impactPos, blastRadius) {
    let afDamaged = false;

    // 1. Control Tower
    if (af.towerGroup && !af.towerDestroyed) {
      const twPos = new THREE.Vector3(130, 24, 45)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), af.headingRad)
        .add(new THREE.Vector3(af.x, af.elevation, af.z));
      const dist = impactPos.distanceTo(twPos);
      if (dist <= blastRadius + 25) {
        const dmg = Math.round(600 * (1.0 - dist / (blastRadius + 25)));
        af.towerHp = (af.towerHp !== undefined ? af.towerHp : 400) - dmg;
        afDamaged = true;

        if (af.towerHp <= 0) {
          af.towerDestroyed = true;
          spawnExplosionAt(twPos, 3.2);
          af.towerGroup.rotation.z = 0.28;
          af.towerGroup.rotation.x = 0.15;
          af.towerGroup.position.y -= 3.5;
          if (af.beaconDomeMat) af.beaconDomeMat.color.setHex(0x18181b);
          if (af.beaconGlowMat) af.beaconGlowMat.opacity = 0;
          if (af.beaconBeamMat) af.beaconBeamMat.opacity = 0;
          showCombatBanner(`💥 AIRFIELD TOWER COLLAPSED (${af.code})! +350 PTS`, true);
        } else {
          showCombatBanner(`💥 AIRFIELD TOWER HIT (${af.code})!`, false);
        }
      }
    }

    // 2. Hangars
    if (af.hangarGroups) {
      af.hangarGroups.forEach((hangar) => {
        if (hangar.userData && hangar.userData.isDestroyed) return;
        const hWorldPos = hangar.position.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), af.headingRad)
          .add(new THREE.Vector3(af.x, af.elevation, af.z));
        const dist = impactPos.distanceTo(hWorldPos);
        if (dist <= blastRadius + 20) {
          const dmg = Math.round(550 * (1.0 - dist / (blastRadius + 20)));
          hangar.userData = hangar.userData || {};
          hangar.userData.hp = (hangar.userData.hp !== undefined ? hangar.userData.hp : 350) - dmg;
          afDamaged = true;

          if (hangar.userData.hp <= 0) {
            hangar.userData.isDestroyed = true;
            spawnExplosionAt(hWorldPos, 3.0);
            hangar.scale.set(1.0, 0.45, 1.0);
            hangar.position.y -= 2.0;
            hangar.traverse(child => {
              if (child.isMesh && child.material) {
                child.material = new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.95 });
              }
            });
            showCombatBanner(`💥 AIRFIELD HANGAR DESTROYED (${af.code})! +300 PTS`, true);
          }
        }
      });
    }

    // 3. Any bomb landing inside the base (runway, apron, buildings) wrecks its facilities,
    //    even once the hangars and tower are already down
    const loc = worldToAirfieldLocal(af, impactPos.x, impactPos.z);
    if (loc.lx > -af.width / 2 - 40 && loc.lx < 190 && Math.abs(loc.lz) < af.length / 2 + 40) {
      afDamaged = true;
    }

    // 4. Airfield Total HP: 3 bomb hits destroy an enemy base for good
    // Online: any base can be bombed by another team (the bomb carries its team); offline: enemy bases only
    const hostileBase = (state.netRole && net.bombTeam !== undefined) ? (af.netTeam >= 0 && af.netTeam !== net.bombTeam) : af.team === 'enemy';
    if (afDamaged && !af.isDestroyed && hostileBase) {
      af.hp = (af.hp !== undefined ? af.hp : 1200) - 400;
      if (af.hp <= 0) {
        af.isDestroyed = true;
        af.team = 'destroyed';
        if (af.edgeLights) {
          af.edgeLights.forEach(l => {
            if (l.material) l.material.color.setHex(0x18181b);
          });
        }
        updateAirfieldVisuals();
        spawnExplosionAt(new THREE.Vector3(af.x, af.elevation + 2, af.z), 4.5);
        const groundedTeams = enemyTeams.filter(t => t.lead.homeAirfield === afIdx).length;
        showCombatBanner(`🏆 ENEMY AIRFIELD DESTROYED: ${af.name.toUpperCase()} (${af.code})! ${groundedTeams} ENEMY TEAM${groundedTeams === 1 ? '' : 'S'} CAN NO LONGER RESPAWN +1000 PTS`, true);
      } else {
        showCombatBanner(`💣 ${af.code} HIT — BASE INTEGRITY ${Math.round((af.hp / af.maxHp) * 100)}%`, false);
      }
    }
  }

  // An enemy aircraft whose home airfield has been destroyed has nowhere to respawn
  function isHomeBaseDestroyed(ep) {
    const home = AIRPORTS[ep.homeAirfield];
    return Boolean(home && home.isDestroyed);
  }

  function damagePort(dock, impactPos, blastRadius) {
    let dockDamaged = false;

    // 1. Ships at dock
    if (dock.ships) {
      for (let ship of dock.ships) {
        if (ship.isSunk) continue;
        const shipWorldPos = ship.mesh.position.clone()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), dock.angle)
          .add(new THREE.Vector3(dock.x, CONFIG.seaLevel, dock.z));
        const dist = impactPos.distanceTo(shipWorldPos);

        if (dist <= blastRadius + 30) {
          const dmg = Math.round(700 * (1.0 - dist / (blastRadius + 30)));
          ship.hp -= dmg;
          dockDamaged = true;

          if (ship.hp <= 0) {
            ship.isSunk = true;
            ship.isBurning = true;
            spawnExplosionAt(shipWorldPos, 3.8);
            showCombatBanner(`💥 PORT STRIKE: ${ship.name.toUpperCase()} SUNK! +600 PTS`, true);
          } else {
            showCombatBanner(`💥 SHIP DAMAGED: ${ship.name.toUpperCase()} HIT!`, false);
          }
        }
      }
    }

    // 2. Heavy Cargo Crane
    if (dock.craneGroup && !dock.craneDestroyed) {
      const craneWorldPos = dock.craneGroup.position.clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), dock.angle)
        .add(new THREE.Vector3(dock.x, CONFIG.seaLevel, dock.z));
      const dist = impactPos.distanceTo(craneWorldPos);
      if (dist <= blastRadius + 15) {
        dock.craneDestroyed = true;
        dockDamaged = true;
        spawnExplosionAt(craneWorldPos, 2.5);
        dock.craneGroup.rotation.z = 0.85;
        dock.craneGroup.position.y -= 4.0;
        showCombatBanner(`💥 HARBOR CRANE TOPPLED! +200 PTS`, true);
      }
    }

    // 3. Warehouse Shed
    if (dock.shed && !dock.shedDestroyed) {
      const shedWorldPos = dock.shed.position.clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), dock.angle)
        .add(new THREE.Vector3(dock.x, CONFIG.seaLevel, dock.z));
      const dist = impactPos.distanceTo(shedWorldPos);
      if (dist <= blastRadius + 15) {
        dock.shedDestroyed = true;
        dockDamaged = true;
        spawnExplosionAt(shedWorldPos, 2.8);
        dock.shed.scale.set(1.0, 0.35, 1.0);
        dock.shed.material = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 });
        showCombatBanner(`💥 HARBOR WAREHOUSE DESTROYED! +250 PTS`, true);
      }
    }

    // 4. Overall Dock Port HP
    if (dockDamaged) {
      dock.hp = (dock.hp !== undefined ? dock.hp : 900) - 350;
      if (dock.hp <= 0 && !dock.isDestroyed) {
        dock.isDestroyed = true;
        spawnExplosionAt(new THREE.Vector3(dock.x, CONFIG.seaLevel + 3, dock.z), 4.0);
        showCombatBanner(`🏆 PORT NEUTRALIZED: ${dock.name.toUpperCase()} ELIMINATED! +800 PTS`, true);
      }
    }
  }

  function updatePorts(dt) {
    for (let dock of DOCKS) {
      if (!dock.ships) continue;
      for (let ship of dock.ships) {
        if (ship.isSunk) {
          if (ship.sinkOffset < 5.0) {
            const deltaY = 0.75 * dt;
            ship.sinkOffset += deltaY;
            ship.mesh.position.y -= deltaY;
            ship.listAngle = Math.min(0.48, (ship.listAngle || 0) + 0.09 * dt);
            ship.mesh.rotation.z = ship.listAngle;
          }
        }
      }
    }
  }

  // 4. Tactical Anti-Air Defense Systems (Flak Batteries)
  const aaDefenseSystems = [];

  // Heavy flak gun (88 mm style): cruciform platform, pedestal carriage, shield and one long recoiling barrel
  const FLAK_MUZZLE_Z = 6.9; // muzzle distance along the barrel group's +Z

  function buildAATurretMesh(team) {
    const root = new THREE.Group();

    // Sandbag Circular Revetment
    const sandbagMat = new THREE.MeshStandardMaterial({ color: 0xc2a677, roughness: 0.95 });
    const bagRingGeo = new THREE.CylinderGeometry(6.0, 6.6, 1.5, 18, 1, true);
    const sandbags = new THREE.Mesh(bagRingGeo, sandbagMat);
    sandbags.position.y = 0.75;
    sandbags.castShadow = true;
    root.add(sandbags);

    // Concrete floor
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.8 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.4, 18), floorMat);
    floor.position.y = 0.2;
    floor.receiveShadow = true;
    root.add(floor);

    const paintColor = (team === 'friendly' ? 0x4b5320 : 0x4a5246);
    const paintMat = new THREE.MeshStandardMaterial({ color: paintColor, roughness: 0.7, metalness: 0.25 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.45, metalness: 0.65 });

    // Cruciform platform with outrigger pads
    const armGeo = new THREE.BoxGeometry(9.2, 0.32, 0.75);
    [0, Math.PI / 2].forEach(rot => {
      const arm = new THREE.Mesh(armGeo, paintMat);
      arm.position.y = 0.55;
      arm.rotation.y = rot;
      arm.castShadow = true;
      root.add(arm);
    });
    const padGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.18, 10);
    [[4.4, 0], [-4.4, 0], [0, 4.4], [0, -4.4]].forEach(([px, pz]) => {
      const pad = new THREE.Mesh(padGeo, gunMat);
      pad.position.set(px, 0.45, pz);
      root.add(pad);
    });

    // Traversing carriage
    const swivel = new THREE.Group();
    swivel.position.y = 0.7;

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 1.0, 12), paintMat);
    pedestal.position.y = 0.5;
    pedestal.castShadow = true;
    swivel.add(pedestal);

    const carriage = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 2.6), paintMat);
    carriage.position.set(0, 1.25, -0.2);
    carriage.castShadow = true;
    swivel.add(carriage);

    // Trunnion side plates
    [-0.75, 0.75].forEach(sx => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 1.3), paintMat);
      plate.position.set(sx, 1.95, -0.2);
      swivel.add(plate);
    });

    // Gun shield
    const shieldGeo = new THREE.BoxGeometry(2.9, 1.6, 0.12);
    shieldGeo.rotateX(0.18);
    const shield = new THREE.Mesh(shieldGeo, paintMat);
    shield.position.set(0, 2.15, 0.75);
    shield.castShadow = true;
    swivel.add(shield);

    // Elevating mass: breech + recuperator stay put, the barrel tube slides back on recoil
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, 2.0, -0.3);

    const breech = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 1.5), gunMat);
    breech.position.z = -0.35;
    breech.castShadow = true;
    barrelGroup.add(breech);

    const recuperator = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 3.0, 10), paintMat);
    recuperator.rotation.x = Math.PI / 2;
    recuperator.position.set(0, 0.38, 1.3);
    barrelGroup.add(recuperator);

    const barrel = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 6.4, 12), gunMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.z = 3.3;
    tube.castShadow = true;
    barrel.add(tube);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12), gunMat);
    brake.rotation.x = Math.PI / 2;
    brake.position.z = 6.6;
    barrel.add(brake);
    barrelGroup.add(barrel);

    barrelGroup.rotation.x = -0.6;
    swivel.add(barrelGroup);
    root.add(swivel);

    return { root, swivel, barrelGroup, barrel };
  }

  function initAADefenses() {
    // Positions were resolved onto clear ground by resolvePlacementSites()
    for (let cfg of AA_SITE_CONFIGS) {
      const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(cfg.x, cfg.z));
      const meshData = buildAATurretMesh(cfg.team);
      meshData.root.position.set(cfg.x, groundY, cfg.z);
      scene.add(meshData.root);

      aaDefenseSystems.push({
        id: cfg.id,
        name: cfg.name,
        x: cfg.x,
        y: groundY,
        z: cfg.z,
        team: cfg.team,
        hp: 300,
        maxHp: 300,
        isAlive: true,
        root: meshData.root,
        swivel: meshData.swivel,
        barrelGroup: meshData.barrelGroup,
        barrel: meshData.barrel,
        recoil: 0,
        fireTimer: -Math.random() * FLAK_FIRE_INTERVAL
      });
    }
  }

  function damageAADefense(aa, damage, impactPos) {
    if (!aa || !aa.isAlive) return;
    aa.hp -= damage;

    if (aa.hp <= 0) {
      aa.isAlive = false;
      spawnExplosionAt(aa.root.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 3.2);
      playExplosionSound();

      if (aa.barrelGroup) {
        aa.barrelGroup.rotation.x = 0.65;
        aa.barrelGroup.rotation.z = (Math.random() - 0.5) * 0.8;
      }
      if (aa.swivel) {
        aa.swivel.position.y = 0.1;
      }
      aa.root.traverse(child => {
        if (child.isMesh && child.material) {
          child.material = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 });
        }
      });

      showCombatBanner(`💥 ANTI-AIR BATTERY DESTROYED: ${aa.name.toUpperCase()} OBLITERATED! +350 PTS`, true);
    }
  }

  // --- Flak: single timed-fuse shells. A red marker shows the burst point (and its damage radius)
  // a split second before the shell explodes; everything hostile inside the radius takes area damage.
  const FLAK_FIRE_INTERVAL = 3.6;    // s between shells from one gun
  const FLAK_FIRE_JITTER = 0.4;      // ± s so batteries don't fire in lockstep
  const FLAK_TARGET_GAP = 1.6;       // s: minimum spacing between shells (from any gun) aimed at the same aircraft
  const FLAK_SHELL_SPEED = 820;      // m/s, sets the fuse time
  const FLAK_MIN_FUSE = 0.9;
  const FLAK_MAX_FUSE = 3.2;
  const FLAK_WARNING_TIME = 0.9;     // s: the marker appears this long before the burst (a hard break just clears it)
  const FLAK_RADIUS = 32;            // m: damage radius, drawn as the marker's outer ring
  const FLAK_MAX_DAMAGE = 44;        // at the centre of the burst
  const FLAK_EDGE_DAMAGE = 6;        // at the edge of the radius
  const FLAK_RANGE_H = 1500;         // m horizontal reach
  const FLAK_RANGE_3D = 2300;        // m slant reach
  const FLAK_MIN_HEIGHT = 40;        // m above the battery: no bursts over its own base
  const FLAK_AIM_TOLERANCE = 0.12;   // rad of traverse error allowed when firing
  const FLAK_MAX_CLOUDS = 40;        // fireballs + smoke clouds alive at once
  const FLAK_ZONE_INSIDE = 0xff2020; // blast sphere colour while the player is inside it
  const FLAK_ZONE_OUTSIDE = 0xffa030; // ...and while outside

  const flakShells = [];
  const flakLastShotAt = new Map(); // aircraft (ref, or 'player') -> flakClock time of the last shell aimed at it
  let flakClock = 0;
  const flakWarningPool = [];
  const flakClouds = [];
  const flakCloudPool = { smoke: [], fire: [] };
  const flakShocks = [];
  const flakShockPool = [];
  const flakTmpColor = new THREE.Color();
  let flakGeo = null;

  // Lumpy sphere for smoke / fireball lobes: the same smooth noise everywhere keeps seam vertices together
  function makeLumpyGeometry(seed) {
    const geo = new THREE.SphereGeometry(1, 28, 20);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 0.16 * Math.sin(3.1 * v.x + 1.7 * v.y + seed) * Math.cos(2.3 * v.z + seed * 0.7)
              + 0.10 * Math.sin(5.3 * v.y + 2.1 * v.z + seed * 1.9)
              + 0.07 * Math.sin(7.7 * v.x - 4.3 * v.z + seed * 3.1);
      v.multiplyScalar(1 + n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function getFlakGeometries() {
    if (!flakGeo) {
      flakGeo = {
        sphere: new THREE.SphereGeometry(1.0, 32, 20),
        countdown: new THREE.RingGeometry(0.9, 1.0, 48),
        core: new THREE.SphereGeometry(1.0, 12, 8),
        lumps: [1.3, 4.1, 7.7, 11.2].map(makeLumpyGeometry)
      };
    }
    return flakGeo;
  }

  // Soft smoke: dense where you look straight through the lobe, fading to nothing at its silhouette,
  // with simple sun shading so the cloud keeps its volume
  function makeSmokeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x333333) },
        opacity: { value: 0.8 }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'varying vec3 vWorldNormal;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vWorldNormal = normalize(mat3(modelMatrix) * normal);',
        '  vView = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 color;',
        'uniform float opacity;',
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'varying vec3 vWorldNormal;',
        'void main() {',
        '  float facing = abs(dot(normalize(vNormal), normalize(vView)));',
        '  float edge = smoothstep(0.05, 0.75, facing);',
        '  float sun = max(dot(normalize(vWorldNormal), normalize(vec3(0.4, 0.85, 0.35))), 0.0);',
        '  gl_FragColor = vec4(color * (0.7 + 0.45 * sun), opacity * edge);',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false
    });
  }

  // Cloud material colour / opacity, for both the basic (fire) and shader (smoke) materials
  function setCloudLook(c, color, opacity) {
    if (c.mat.uniforms) {
      c.mat.uniforms.color.value.copy(color);
      c.mat.uniforms.opacity.value = opacity;
    } else {
      c.mat.color.copy(color);
      c.mat.opacity = opacity;
    }
  }

  // Transparent sphere that is brightest at its rim, so it reads as a 3D volume from inside and outside
  function makeFresnelMaterial(colorHex, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colorHex) },
        opacity: { value: opacity }
      },
      vertexShader: [
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main() {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vView = normalize(-mv.xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 color;',
        'uniform float opacity;',
        'varying vec3 vNormal;',
        'varying vec3 vView;',
        'void main() {',
        '  float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);',
        '  gl_FragColor = vec4(color, opacity * (0.16 + 0.84 * rim));',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  // Hostile aircraft a battery may engage: { pos, vel, kind: 'player' | 'ally' | 'enemy', ref }
  function getFlakVictims(team, sideKey = null) {
    const list = [];
    if (team === 'enemy') {
      if (!state.isCrashed && airplaneGroup && !state.inMainMenu) {
        list.push({ pos: airplaneGroup.position, vel: state.flight.velocity, kind: 'player', ref: null });
      }
      for (const fwAlly of getFriendlyAllies()) {
        if (!fwAlly.isAlive || fwAlly.takenOver) continue;
        list.push({ pos: fwAlly.currentPos, vel: fwAlly.velocity, kind: 'ally', ref: fwAlly });
      }
      // Factions: an AI nation's flak also shoots at every other AI nation's planes
      if (sideKey) {
        for (const ep of enemyPlanes) {
          if (!ep.isAlive || ep.sideKey === sideKey) continue;
          list.push({ pos: ep.currentPos, vel: ep.velocity, kind: 'enemy', ref: ep });
        }
      }
    } else {
      for (const ep of enemyPlanes) {
        if (!ep.isAlive) continue;
        list.push({ pos: ep.currentPos, vel: ep.velocity, kind: 'enemy', ref: ep });
      }
    }
    return list;
  }

  function findFlakTarget(aa) {
    let best = null;
    let bestDist = Infinity;
    for (const v of getFlakVictims(aa.team, aa.sideKey)) {
      if (v.pos.y < aa.y + FLAK_MIN_HEIGHT) continue;
      const h = Math.hypot(v.pos.x - aa.x, v.pos.z - aa.z);
      if (h > FLAK_RANGE_H) continue;
      const d = Math.hypot(h, v.pos.y - aa.y);
      if (d < FLAK_RANGE_3D && d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  function getFlakMuzzlePos(aa) {
    return new THREE.Vector3(0, 0, FLAK_MUZZLE_Z)
      .applyEuler(aa.barrelGroup.rotation)
      .add(aa.barrelGroup.position)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), aa.swivel.rotation.y)
      .add(new THREE.Vector3(aa.x, aa.y + aa.swivel.position.y, aa.z));
  }

  function updateAADefenses(dt) {
    if (!scene || aaDefenseSystems.length === 0) return;

    flakClock += dt;
    updateFlakShells(dt);
    if (state.netRole === 'guest') return; // online guest: the host's batteries fire, we only draw their shells

    for (let aa of aaDefenseSystems) {
      if (!aa.isAlive) continue;

      // Barrel runs back out after each shot
      if (aa.barrel && aa.recoil > 0) {
        aa.recoil = Math.max(0, aa.recoil - dt * 2.4);
        aa.barrel.position.z = -aa.recoil * 0.9;
      }

      const target = findFlakTarget(aa);
      if (!target) {
        aa.fireTimer = Math.min(aa.fireTimer, 0);
        continue;
      }

      // Lay the gun on where the target will be when the fuse runs out
      const dist = Math.hypot(target.pos.x - aa.x, target.pos.y - aa.y, target.pos.z - aa.z);
      const fuse = THREE.MathUtils.clamp(dist / FLAK_SHELL_SPEED, FLAK_MIN_FUSE, FLAK_MAX_FUSE);
      const lead = target.pos.clone().addScaledVector(target.vel, fuse);

      const dx = lead.x - aa.x;
      const dz = lead.z - aa.z;
      const dy = lead.y - (aa.y + 2.7);
      const targetYaw = Math.atan2(dx, dz);

      let diffYaw = targetYaw - aa.swivel.rotation.y;
      while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
      while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
      aa.swivel.rotation.y += Math.sign(diffYaw) * Math.min(Math.abs(diffYaw), 1.4 * dt);

      const targetPitch = -Math.atan2(dy, Math.max(10, Math.hypot(dx, dz)));
      aa.barrelGroup.rotation.x = THREE.MathUtils.clamp(targetPitch, -1.35, -0.15);

      // One deliberate shell at a time, only once the gun is laid on the target, and never right
      // after another battery has fired at the same aircraft (neighbouring guns take turns)
      aa.fireTimer += dt;
      const targetKey = target.ref || 'player';
      const lastShot = flakLastShotAt.has(targetKey) ? flakLastShotAt.get(targetKey) : -Infinity;
      if (aa.fireTimer >= FLAK_FIRE_INTERVAL && Math.abs(diffYaw) < FLAK_AIM_TOLERANCE && flakClock - lastShot >= FLAK_TARGET_GAP) {
        aa.fireTimer = (Math.random() * 2 - 1) * FLAK_FIRE_JITTER;
        flakLastShotAt.set(targetKey, flakClock);
        fireFlakShell(aa, lead, dist, fuse);
      }
    }
  }

  function fireFlakShell(aa, leadPos, dist, fuse) {
    // Fuse error: the further the target, the wider the burst scatter
    const spread = 14 + dist * 0.022;
    const burst = leadPos.clone().add(new THREE.Vector3(
      (Math.random() * 2 - 1) * spread,
      (Math.random() * 2 - 1) * spread * 0.6,
      (Math.random() * 2 - 1) * spread
    ));
    const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(burst.x, burst.z));
    burst.y = Math.max(burst.y, groundY + 25, aa.y + FLAK_MIN_HEIGHT * 0.6);

    flakShells.push({
      team: aa.team,
      sideKey: aa.sideKey || null,
      sourceName: aa.name,
      pos: burst,
      timer: fuse,
      warning: null
    });
    netOnHostFlakShell(aa, flakShells[flakShells.length - 1]);

    aa.recoil = 1.0;
    const muzzle = getFlakMuzzlePos(aa);
    spawnFlakCloud('smoke', muzzle, {
      lobes: 2, spread: 1.2, startScale: 1.4, endScale: 5, life: 1.8, opacity: 0.6,
      colorStart: 0xb8b8b0, colorEnd: 0xd6d3d1, rise: 1.0
    });

    if (airplaneGroup && muzzle.distanceTo(airplaneGroup.position) < 1800) {
      playAAFireSound();
    }
  }

  // Warning marker: a 3D sphere exactly the size of the damage radius (red while the player is inside,
  // amber while outside), a bright core at the burst point, and a ring that shrinks to the core as the fuse runs out
  function acquireFlakWarning(pos) {
    let w = flakWarningPool.pop();
    if (!w) {
      const g = getFlakGeometries();
      const group = new THREE.Group();

      const zoneMat = makeFresnelMaterial(FLAK_ZONE_OUTSIDE, 0.6);
      const zone = new THREE.Mesh(g.sphere, zoneMat);
      zone.scale.setScalar(FLAK_RADIUS);
      zone.renderOrder = 998;
      group.add(zone);

      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
      const core = new THREE.Mesh(g.core, coreMat);
      core.scale.setScalar(1.6);
      core.renderOrder = 999;
      group.add(core);

      const countdownMat = new THREE.MeshBasicMaterial({
        color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false, depthWrite: false
      });
      const countdown = new THREE.Mesh(g.countdown, countdownMat);
      countdown.renderOrder = 999;
      group.add(countdown);

      scene.add(group);
      w = { group, zone, core, countdown, age: 0, inside: false };
    }
    w.age = 0;
    w.inside = false;
    w.group.position.copy(pos);
    w.group.visible = true;
    return w;
  }

  function releaseFlakWarning(w) {
    if (!w) return;
    w.group.visible = false;
    flakWarningPool.push(w);
  }

  function updateFlakWarning(w, timeLeft, dt, playerInside) {
    w.age += dt;
    w.inside = playerInside;
    const k = THREE.MathUtils.clamp(timeLeft / FLAK_WARNING_TIME, 0, 1);
    // Pulses faster as the burst gets closer
    const pulse = 0.5 + 0.5 * Math.sin(w.age * (18 + 30 * (1 - k)));
    const u = w.zone.material.uniforms;
    u.color.value.setHex(playerInside ? FLAK_ZONE_INSIDE : FLAK_ZONE_OUTSIDE);
    u.opacity.value = (playerInside ? 0.75 : 0.45) + 0.25 * pulse * (1 - k * 0.5);
    w.core.material.opacity = 0.6 + 0.4 * pulse;
    w.countdown.scale.setScalar(FLAK_RADIUS * Math.max(0.05, k));
  }

  // One cohesive cloud made of 2-3 overlapping lumpy lobes that grows, rises and fades (no particles).
  // kind 'smoke' is lit (shaded like a real cloud), kind 'fire' glows (additive).
  function spawnFlakCloud(kind, pos, opts) {
    if (!scene) return;
    if (flakClouds.length >= FLAK_MAX_CLOUDS) recycleFlakCloud(flakClouds.shift());

    let c = flakCloudPool[kind].pop();
    if (!c) {
      const mat = kind === 'fire'
        ? new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        : makeSmokeMaterial();
      const group = new THREE.Group();
      const lobes = [];
      for (let i = 0; i < 3; i++) {
        const lobe = new THREE.Mesh(getFlakGeometries().lumps[i], mat);
        // The glow is drawn after the smoke so the fireball shows through it
        if (kind === 'fire') lobe.renderOrder = 5;
        group.add(lobe);
        lobes.push(lobe);
      }
      scene.add(group);
      c = { kind, group, lobes, mat, colorA: new THREE.Color(), colorB: new THREE.Color(), spin: new THREE.Vector3() };
    }

    const lumps = getFlakGeometries().lumps;
    const lobeCount = Math.min(3, opts.lobes || 3);
    c.lobes.forEach((lobe, i) => {
      lobe.visible = i < lobeCount;
      lobe.geometry = lumps[(i + Math.floor(Math.random() * lumps.length)) % lumps.length];
      const sp = (opts.spread || 0) / Math.max(opts.startScale, 0.1);
      lobe.position.set((Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 1.4 * sp, (Math.random() - 0.5) * 2 * sp);
      lobe.rotation.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
      lobe.scale.setScalar(i === 0 ? 1 : 0.7 + Math.random() * 0.35);
    });
    c.group.position.copy(pos);
    c.group.scale.setScalar(opts.startScale);
    c.group.visible = true;
    c.age = 0;
    c.life = opts.life;
    c.startScale = opts.startScale;
    c.endScale = opts.endScale;
    c.opacity = opts.opacity;
    c.rise = opts.rise || 0;
    c.colorA.setHex(opts.colorStart);
    c.colorB.setHex(opts.colorEnd);
    setCloudLook(c, c.colorA, opts.opacity);
    c.spin.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
    flakClouds.push(c);
  }

  function recycleFlakCloud(c) {
    if (!c) return;
    c.group.visible = false;
    flakCloudPool[c.kind].push(c);
  }

  function updateFlakClouds(dt) {
    for (let i = flakClouds.length - 1; i >= 0; i--) {
      const c = flakClouds[i];
      c.age += dt;
      const t = c.age / c.life;
      if (t >= 1) {
        flakClouds.splice(i, 1);
        recycleFlakCloud(c);
        continue;
      }
      const grow = 1 - Math.pow(1 - t, 3);
      c.group.scale.setScalar(c.startScale + (c.endScale - c.startScale) * grow);
      c.group.position.y += c.rise * dt;
      c.group.rotation.x += c.spin.x * dt;
      c.group.rotation.y += c.spin.y * dt;
      c.group.rotation.z += c.spin.z * dt;
      if (c.kind === 'fire') {
        flakTmpColor.copy(c.colorA).lerp(c.colorB, Math.min(1, t * 1.4));
        setCloudLook(c, flakTmpColor, c.opacity * (1 - t * t));
      } else {
        // Smoke holds its density for a moment, then thins out
        flakTmpColor.copy(c.colorA).lerp(c.colorB, t);
        setCloudLook(c, flakTmpColor, c.opacity * Math.min(1, (1 - t) * 1.8));
      }
    }

    for (let i = flakShocks.length - 1; i >= 0; i--) {
      const s = flakShocks[i];
      s.age += dt;
      const t = s.age / 0.32;
      if (t >= 1) {
        s.mesh.visible = false;
        flakShocks.splice(i, 1);
        flakShockPool.push(s);
        continue;
      }
      s.mesh.scale.setScalar(FLAK_RADIUS * (0.2 + 0.8 * (1 - Math.pow(1 - t, 2))));
      s.mesh.material.uniforms.opacity.value = 0.85 * (1 - t);
    }
  }

  // Shockwave shell that expands to exactly the damage radius
  function spawnFlakShock(pos) {
    let s = flakShockPool.pop();
    if (!s) {
      const mesh = new THREE.Mesh(getFlakGeometries().sphere, makeFresnelMaterial(0xffd9a0, 0.85));
      scene.add(mesh);
      s = { mesh, age: 0 };
    }
    s.age = 0;
    s.mesh.position.copy(pos);
    s.mesh.scale.setScalar(FLAK_RADIUS * 0.2);
    s.mesh.visible = true;
    flakShocks.push(s);
  }

  function spawnFlakBurstFx(pos) {
    spawnFlakShock(pos);
    // Black flak smoke first, the fireball glows on top of it and burns out into it
    spawnFlakCloud('smoke', pos, {
      lobes: 3, spread: 4.5, startScale: 5, endScale: 18, life: 5.5, opacity: 0.85,
      colorStart: 0x24211f, colorEnd: 0x555352, rise: 1.6
    });
    spawnFlakCloud('fire', pos, {
      lobes: 3, spread: 3, startScale: 3, endScale: 14, life: 0.42, opacity: 0.9,
      colorStart: 0xffc46a, colorEnd: 0xc03800
    });
  }

  function playFlakBurstSound(volume) {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized || volume <= 0.01) return;
    try {
      const now = audioCtx.currentTime;
      const nBuf = getGunNoiseBuffer();
      if (nBuf) {
        const noise = audioCtx.createBufferSource();
        noise.buffer = nBuf;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.exponentialRampToValueAtTime(160, now + 0.4);
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.55 * volume, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        noise.connect(filter);
        filter.connect(g);
        g.connect(audioCtx.destination);
        noise.start(now);
        noise.stop(now + 0.5);
      }
      const osc = audioCtx.createOscillator();
      const og = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.35);
      og.gain.setValueAtTime(0.5 * volume, now);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(og);
      og.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    } catch (e) {}
  }

  function flakDamageAt(d) {
    return Math.round(FLAK_EDGE_DAMAGE + (FLAK_MAX_DAMAGE - FLAK_EDGE_DAMAGE) * (1 - d / FLAK_RADIUS));
  }

  function detonateFlakShell(s) {
    spawnFlakBurstFx(s.pos);

    for (const v of (s.visualOnly ? [] : getFlakVictims(s.team, s.sideKey))) {
      const d = v.pos.distanceTo(s.pos);
      if (d > FLAK_RADIUS) continue;
      const dmg = flakDamageAt(d);
      // Splinters strike the side of the airframe facing the burst
      const hitPos = v.pos.clone().lerp(s.pos, Math.min(1, 3 / Math.max(d, 3)));
      if (v.kind === 'player') {
        damagePlayerAircraft(dmg, 'FLAK', hitPos, { callsign: s.sourceName.toUpperCase() });
      } else if (v.kind === 'ally') {
        damageFriendlyWingman(dmg, 'FLAK', hitPos, v.ref);
      } else if (s.team === 'enemy') {
        // an AI nation's battery downing another nation's plane
        damageEnemyPlane(v.ref, dmg, 'FLAK', hitPos, false, { callsign: s.sourceName.toUpperCase() });
      } else {
        damageEnemyPlane(v.ref, dmg, 'FLAK', hitPos, false);
      }
    }

    if (airplaneGroup && !state.isCrashed) {
      const pd = airplaneGroup.position.distanceTo(s.pos);
      // Near misses still rattle the camera
      if (pd < FLAK_RADIUS * 2.5 && state.cameraRecoil) {
        state.cameraRecoil.intensity = Math.min(1.0, state.cameraRecoil.intensity + 0.5 * (1 - pd / (FLAK_RADIUS * 2.5)));
      }
      if (pd < 2600) playFlakBurstSound(Math.min(1, 160 / Math.max(pd, 160)));
    }
  }

  function updateFlakShells(dt) {
    // Closest-to-bursting marked shell the player is inside (same distance test as the damage)
    let dangerTimeLeft = Infinity;
    const playerPos = (airplaneGroup && !state.isCrashed && !state.inMainMenu) ? airplaneGroup.position : null;

    for (let i = flakShells.length - 1; i >= 0; i--) {
      const s = flakShells[i];
      s.timer -= dt;

      // Only shells aimed at the player's side get a marker: they are the ones to dodge
      if (!s.warning && s.team === 'enemy' && s.timer <= FLAK_WARNING_TIME) {
        s.warning = acquireFlakWarning(s.pos);
      }
      if (s.warning) {
        const inside = Boolean(playerPos && playerPos.distanceTo(s.pos) <= FLAK_RADIUS);
        updateFlakWarning(s.warning, s.timer, dt, inside);
        if (inside) dangerTimeLeft = Math.min(dangerTimeLeft, s.timer);
      }

      if (s.timer <= 0) {
        detonateFlakShell(s);
        releaseFlakWarning(s.warning);
        flakShells.splice(i, 1);
      }
    }

    updateFlakClouds(dt);
    setFlakDangerHud(dangerTimeLeft);
  }

  // HUD: banner + red screen-edge glow while inside a marked blast zone, stronger as the burst nears
  function setFlakDangerHud(timeLeft) {
    const inside = timeLeft !== Infinity;
    const warnEl = document.getElementById('flak-warning');
    if (warnEl) warnEl.classList.toggle('show', inside);
    const vignette = document.getElementById('flak-vignette');
    if (vignette) {
      const urgency = inside ? 1 - THREE.MathUtils.clamp(timeLeft / FLAK_WARNING_TIME, 0, 1) : 0;
      vignette.style.opacity = inside ? (0.35 + 0.65 * urgency).toFixed(2) : '0';
    }
  }

  // Turn the countdown rings to face the camera (called after the camera has moved this frame)
  function orientFlakWarnings() {
    if (!camera) return;
    for (const s of flakShells) {
      if (s.warning) s.warning.countdown.quaternion.copy(camera.quaternion);
    }
  }

  // Removes pending shells, markers and smoke (sortie restart / back to menu)
  function clearFlakShells() {
    for (const s of flakShells) releaseFlakWarning(s.warning);
    flakShells.length = 0;
    flakLastShotAt.clear();
    for (const c of flakClouds) recycleFlakCloud(c);
    flakClouds.length = 0;
    for (const s of flakShocks) {
      s.mesh.visible = false;
      flakShockPool.push(s);
    }
    flakShocks.length = 0;
    setFlakDangerHud(Infinity);
  }

  // 5. War Thunder Arcade Bomb Target Reticle
  let bombReticleMesh = null;

  function initBombReticle() {
    const reticleGroup = new THREE.Group();
    reticleGroup.name = 'BombImpactReticle';

    const ringGeo = new THREE.RingGeometry(8.5, 9.8, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    reticleGroup.add(ring);

    const dotGeo = new THREE.CircleGeometry(1.6, 16);
    dotGeo.rotateX(-Math.PI / 2);
    const dot = new THREE.Mesh(dotGeo, ringMat);
    reticleGroup.add(dot);

    const tickGeo = new THREE.PlaneGeometry(1.2, 5.5);
    tickGeo.rotateX(-Math.PI / 2);
    [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(angle => {
      const tick = new THREE.Mesh(tickGeo, ringMat);
      tick.position.set(Math.sin(angle) * 12.8, 0.02, Math.cos(angle) * 12.8);
      tick.rotation.y = angle;
      reticleGroup.add(tick);
    });

    reticleGroup.visible = false;
    scene.add(reticleGroup);
    bombReticleMesh = reticleGroup;
  }

  function updateBombReticle() {
    if (!bombReticleMesh) return;

    if (state.isCrashed || state.inMainMenu || !airplaneGroup || !state.bombs || state.bombs.count <= 0 || (state.flight && state.flight.isOnGround)) {
      bombReticleMesh.visible = false;
      return;
    }

    const planePos = airplaneGroup.position.clone();
    const f = state.flight;
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
    const speedMs = (f.airspeed || 0) / 3.6;
    const curVel = (f.velocity && f.velocity.lengthSq() > 1) 
      ? f.velocity.clone() 
      : forwardVec.clone().multiplyScalar(speedMs);

    curVel.add(new THREE.Vector3(0, -3.8, 0).applyQuaternion(airplaneGroup.quaternion));

    let simPos = planePos.clone();
    const simDt = 0.08;
    let impactPos = null;

    for (let t = 0; t < 12.0; t += simDt) {
      curVel.y -= CONFIG.gravity * simDt;
      curVel.x *= (1.0 - 0.035 * simDt);
      curVel.z *= (1.0 - 0.035 * simDt);
      simPos.addScaledVector(curVel, simDt);

      const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(simPos.x, simPos.z));
      if (simPos.y <= groundY) {
        impactPos = new THREE.Vector3(simPos.x, groundY + 0.35, simPos.z);
        break;
      }
    }

    if (impactPos) {
      bombReticleMesh.position.copy(impactPos);
      bombReticleMesh.visible = true;

      const pulse = 1.0 + 0.08 * Math.sin(Date.now() * 0.007);
      bombReticleMesh.scale.set(pulse, 1.0, pulse);
    } else {
      bombReticleMesh.visible = false;
    }
  }

  // =========================================================================
  // --- Step 1: 2-Plane Teams (Single Aircraft Type) & Step 2: Airfield Systems ---
  // =========================================================================
  const enemyPlanes = [];
  const enemyTeams = [];
  const TEAM_SIZE_MIN = 1;
  const TEAM_SIZE_MAX = 4;
  let friendlyWingman = null;      // Wingman #2: the AI wingman the player can take over
  let friendlyEscorts = [];        // Extra friendly AI planes (Wingman #3, #4) when Team Size > 2
  const getFriendlyAllies = () => (friendlyWingman ? [friendlyWingman, ...friendlyEscorts] : friendlyEscorts.slice());
  // Key enemies use to pick a friendly AI plane as their attack target ('wingman', 'wingman1', ...)
  const allyTargetKey = (fw) => (fw.slot ? 'wingman' + fw.slot : 'wingman');
  const MAX_CONCURRENT_ATTACKERS = 2; // Never more than 2 enemies (1 two-plane element) attack the player at once
  const ENEMY_DETECT_DIST = 2600;     // Proximity detection radius (m) (Scaled for 17.8 km theater)
  const ENEMY_DISENGAGE_DIST = 3600;  // Break-off radius back to patrol (m)

  // Line an enemy aircraft (Lead #1 or Wingman #2) up on its team's fixed home airfield
  // in staggered 2-plane runway formation (the home base never changes during a game)
  function assignEnemyToHomeAirbase(ep) {
    const afIdx = ep.homeAirfield;
    const af = AIRPORTS[afIdx] || AIRPORTS[1];
    ep.airfieldIndex = afIdx;

    // Count how many other teams/planes are lined up on this same runway
    let otherTeamsAtBase = 0;
    for (let other of enemyPlanes) {
      if (other !== ep && other !== ep.partner && other.isAlive && other.aiState === 'takeoff' && other.airfieldIndex === afIdx) {
        if (other.role === 'lead') otherTeamsAtBase++;
      }
    }

    const headingRad = THREE.MathUtils.degToRad(af.spawnHeading);
    const fwdX = Math.sin(headingRad);
    const fwdZ = Math.cos(headingRad);
    const rightX = Math.cos(headingRad);
    const rightZ = -Math.sin(headingRad);

    // Staggered runway formation: slot 0 (Lead) on the left (-6.5m), slot 1 on the right (+6.5m) 18m behind,
    // slot 2 left 36m behind, slot 3 right 54m behind... (2-plane teams keep the original Rotte layout)
    const slot = ep.slot || 0;
    const isWingman = (ep.role === 'wingman');
    // Factions: heavier, wider aircraft need more room on the (longer, wider) runway
    const spread = isFactionsMatch() ? 1.9 : 1.0;
    const lateralOffset = ((slot % 2 === 1) ? 6.5 : -6.5) * spread;
    const backOffset = (otherTeamsAtBase * (34 + (ep.teamSize || 2) * 18) + slot * 18) * spread;

    const startX = af.spawnX + rightX * lateralOffset - fwdX * backOffset;
    const startZ = af.spawnZ + rightZ * lateralOffset - fwdZ * backOffset;
    const startY = af.elevation + 1.5;

    ep.aiState = 'takeoff';
    ep.netEpoch = (ep.netEpoch || 0) + 1; // online: guests snap instead of interpolating across the teleport
    // Lead #1 and Wingman #2 roll and take off together (Wingman has a 0.45s wingman reaction delay)
    ep.takeoffDelay = otherTeamsAtBase * 3.5 + (isWingman ? 0.45 * slot : 0.0);
    ep.currentSpeedKmh = 0;
    ep.speedMs = 0;
    ep.gearPos = 1.0;
    if (ep.modelData && ep.modelData.setGearDeployment) {
      ep.modelData.setGearDeployment(1.0); // Landing gear extended on runway
    }

    ep.currentPos.set(startX, startY, startZ);
    ep.group.position.copy(ep.currentPos);

    const spawnEuler = new THREE.Euler(0, headingRad, 0, 'YXZ');
    ep.group.quaternion.setFromEuler(spawnEuler);
    ep.group.rotation.copy(spawnEuler);

    ep.velocity.set(0, 0, 0);
    ep.headingDeg = af.spawnHeading;
    ep.breakOffTimer = 0;

    // Reset hidden barrel heating state & AI tactical state
    ep.weaponHeat = 0.0;
    ep.weaponJammed = false;
    ep.weaponTimer = 0.0;
    ep.tacticalState = 'pursuit';
    ep.tacticalTimer = 0.0;
    ep.evasionType = 'barrel_roll';
    ep.evasionDir = 1;
    ep.burstTimer = 0.0;
    ep.burstCooldown = 0.0;
  }

  // --- Friendly AI Wingman (#2) of the Player's Single-Type 2-Plane Team ---
  // Park the wingman on the home runway (right lane, behind the player's spawn slot).
  // departDelay: seconds until it takes off on its own (it also leaves as soon as the player rolls).
  function positionFriendlyWingmanOnPlayerRunway(departDelay = 25, fw = friendlyWingman) {
    if (!fw || !fw.isAlive || fw.takenOver) return;
    fw.parkTimer = departDelay;
    const af = AIRPORTS[state.currentAirfield] || AIRPORTS[0];
    const headingRad = THREE.MathUtils.degToRad(af.spawnHeading);
    const fwdX = Math.sin(headingRad);
    const fwdZ = Math.cos(headingRad);
    const rightX = Math.cos(headingRad);
    const rightZ = -Math.sin(headingRad);

    // Line up behind the player: Wingman #2 on the right (+11m, 16m back), #3 on the left, #4 further back on the right
    const parkSlots = [[11, 16], [-11, 16], [11, 34], [-11, 34]];
    const [parkSide0, parkBack0] = parkSlots[Math.min(fw.slot || 0, parkSlots.length - 1)];
    const parkSpread = isFactionsMatch() ? 1.9 : 1.0;
    const parkSide = parkSide0 * parkSpread, parkBack = parkBack0 * parkSpread;
    const startX = af.spawnX + rightX * parkSide - fwdX * parkBack;
    const startZ = af.spawnZ + rightZ * parkSide - fwdZ * parkBack;
    const startY = af.elevation + 1.5;

    fw.aiState = 'parked';
    fw.netEpoch = (fw.netEpoch || 0) + 1;
    fw.onGround = true;
    fw.targetEnemy = null;
    fw.evadeCooldown = 0;
    fw.recentlyHit = false;
    fw.currentSpeedKmh = 0;
    fw.speedMs = 0;
    fw.gearPos = 1.0;
    if (fw.modelData && fw.modelData.setGearDeployment) {
      fw.modelData.setGearDeployment(1.0);
    }
    fw.currentPos.set(startX, startY, startZ);
    fw.group.position.copy(fw.currentPos);

    const spawnEuler = new THREE.Euler(0, headingRad, 0, 'YXZ');
    fw.group.quaternion.setFromEuler(spawnEuler);
    fw.group.rotation.copy(spawnEuler);
    fw.velocity.set(0, 0, 0);
    fw.headingDeg = af.spawnHeading;
    fw.weaponHeat = 0.0;
    fw.weaponJammed = false;
  }

  // Re-skin every friendly AI plane (wingman + escorts) to the aircraft the player picked
  function syncFriendlyWingmanAircraft(planeId) {
    if (isFactionsMatch() || state.netRole) return; // Factions / online: wingmen keep their own aircraft types
    for (const ally of getFriendlyAllies()) syncFriendlyAllyAircraft(planeId, ally);
  }

  function syncFriendlyAllyAircraft(planeId, fw) {
    if (!fw || typeof WW2AircraftBuilders === 'undefined' || !scene) return;
    if (!AIRCRAFT_DEFS[planeId]) planeId = 'mustang';
    const def = AIRCRAFT_DEFS[planeId];

    const prevPos = fw.currentPos.clone();
    const prevQuat = fw.group.quaternion.clone();
    if (fw.group) {
      scene.remove(fw.group);
    }

    const modelData = createAircraftModel(planeId);
    fw.planeId = planeId;
    fw.def = def;
    fw.modelData = modelData;
    fw.group = modelData.group;
    fw.maxHp = def.maxHp || 120;
    fw.hp = fw.maxHp;
    fw.cruiseSpeedKmh = def.cruiseAirspeed || 320;
    scene.add(fw.group);

    if (fw.modelData && fw.modelData.setGearDeployment) {
      fw.modelData.setGearDeployment(fw.gearPos);
    }
    fw.group.position.copy(prevPos);
    fw.group.quaternion.copy(prevQuat);

    if (state.flight.isOnGround && state.flight.airspeed < 25) {
      positionFriendlyWingmanOnPlayerRunway(25, fw);
    }
  }

  function initFriendlyWingman() {
    if (typeof WW2AircraftBuilders === 'undefined' || !scene) return;
    const planeId = getAllySpawnPlaneId();
    const def = AIRCRAFT_DEFS[planeId] || AIRCRAFT_DEFS.mustang;

    if (friendlyWingman && friendlyWingman.group) {
      scene.remove(friendlyWingman.group);
    }

    const modelData = createAircraftModel(planeId);
    scene.add(modelData.group);

    const hudContainer = document.getElementById('enemy-hud-container');
    let markerEl = (friendlyWingman && friendlyWingman.markerEl) ? friendlyWingman.markerEl : null;
    let labelEl = (friendlyWingman && friendlyWingman.labelEl) ? friendlyWingman.labelEl : null;
    let hpFillEl = (friendlyWingman && friendlyWingman.hpFillEl) ? friendlyWingman.hpFillEl : null;

    if (!markerEl && hudContainer) {
      markerEl = document.createElement('div');
      markerEl.className = 'ally-hud-marker';
      markerEl.innerHTML = `
        <div class="ally-label">
          <div class="ally-title">WING #2 ${def.shortName}</div>
          <div class="ally-hp-bar"><div class="ally-hp-fill"></div></div>
        </div>
        <div class="ally-target-box"></div>
      `;
      hudContainer.appendChild(markerEl);
      labelEl = markerEl.querySelector('.ally-title');
      hpFillEl = markerEl.querySelector('.ally-hp-fill');
    }

    const maxHp = def.maxHp || 120;
    friendlyWingman = {
      id: 'friendly_wingman',
      slot: 0,
      isFriendly: true,
      planeId: planeId,
      def: def,
      modelData: modelData,
      group: modelData.group,
      role: 'wingman',
      cruiseSpeedKmh: def.cruiseAirspeed || 320,
      currentSpeedKmh: 0,
      speedMs: 0,
      currentPos: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      headingDeg: 0,
      hp: maxHp,
      maxHp: maxHp,
      lives: 3,
      maxLives: 3,
      permanentlyDead: false,
      isAlive: true,
      isDying: false,
      takenOver: false,
      aiState: 'takeoff',
      gearPos: 1.0,
      weaponHeat: 0.0,
      weaponJammed: false,
      weaponTimer: 0.0,
      hardpointIndex: 0,
      respawnTimer: 0,
      fallSpeed: 0,
      smokeTimer: 0,
      markerEl: markerEl,
      labelEl: labelEl,
      hpFillEl: hpFillEl
    };
    if (isFactionsMatch()) initFactionPlaneState(friendlyWingman, state.factionMatch.playerNation, planeId);

    positionFriendlyWingmanOnPlayerRunway();
  }

  // Extra friendly AI planes for Team Size 3-4 (Wingman #3, #4): same AI, HUD marker and lives as Wingman #2
  function removeFriendlyEscorts() {
    for (const e of friendlyEscorts) {
      if (e.group) scene.remove(e.group);
      if (e.markerEl) e.markerEl.remove();
    }
    friendlyEscorts = [];
  }

  function initFriendlyEscorts() {
    if (typeof WW2AircraftBuilders === 'undefined' || !scene) return;
    removeFriendlyEscorts();
    const extra = Math.max(0, Math.min(state.teamSize, TEAM_SIZE_MAX) - 2);
    for (let slot = 1; slot <= extra; slot++) {
      createAllyPlane(slot, getAllySpawnPlaneId()); // Factions: every wingman rolls its own type
    }
  }

  // One friendly AI plane (Wingman #3, #4 ... or an online teammate) parked on the home runway
  function createAllyPlane(slot, planeId) {
    const hudContainer = document.getElementById('enemy-hud-container');
    {
      const def = AIRCRAFT_DEFS[planeId] || AIRCRAFT_DEFS.mustang;
      const modelData = createAircraftModel(planeId);
      scene.add(modelData.group);

      let markerEl = null, labelEl = null, hpFillEl = null;
      if (hudContainer) {
        markerEl = document.createElement('div');
        markerEl.className = 'ally-hud-marker';
        markerEl.innerHTML = `
          <div class="ally-label">
            <div class="ally-title">WING #${slot + 2} ${def.shortName}</div>
            <div class="ally-hp-bar"><div class="ally-hp-fill"></div></div>
          </div>
          <div class="ally-target-box"></div>
        `;
        hudContainer.appendChild(markerEl);
        labelEl = markerEl.querySelector('.ally-title');
        hpFillEl = markerEl.querySelector('.ally-hp-fill');
      }

      const maxHp = def.maxHp || 120;
      const escort = {
        id: `friendly_wingman_${slot}`,
        slot: slot,
        isFriendly: true,
        planeId: planeId,
        def: def,
        modelData: modelData,
        group: modelData.group,
        role: 'wingman',
        cruiseSpeedKmh: def.cruiseAirspeed || 320,
        currentSpeedKmh: 0,
        speedMs: 0,
        currentPos: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        headingDeg: 0,
        hp: maxHp,
        maxHp: maxHp,
        lives: 3,
        maxLives: 3,
        permanentlyDead: false,
        isAlive: true,
        isDying: false,
        takenOver: false,
        aiState: 'takeoff',
        gearPos: 1.0,
        weaponHeat: 0.0,
        weaponJammed: false,
        weaponTimer: 0.0,
        hardpointIndex: 0,
        respawnTimer: 0,
        fallSpeed: 0,
        smokeTimer: 0,
        markerEl: markerEl,
        labelEl: labelEl,
        hpFillEl: hpFillEl
      };
      if (isFactionsMatch()) initFactionPlaneState(escort, state.factionMatch.playerNation, planeId);
      friendlyEscorts.push(escort);
      positionFriendlyWingmanOnPlayerRunway(25, escort);
      return escort;
    }
  }

  // If Wingman #2 is gone for good or down, hand the "take over" slot to a living escort
  function ensureTakeoverCandidate() {
    if (state.netRole) return; // online: no taking over teammates
    if (state.isFlyingWingman || !friendlyEscorts.length) return;
    const usable = (f) => f && f.isAlive && !f.isDying && f.lives > 0 && !f.takenOver;
    if (usable(friendlyWingman)) return;
    const idx = friendlyEscorts.findIndex(usable);
    if (idx < 0) return;
    const next = friendlyEscorts[idx];
    if (friendlyWingman && !friendlyWingman.takenOver) friendlyEscorts[idx] = friendlyWingman;
    else friendlyEscorts.splice(idx, 1);
    friendlyWingman = next;
  }

  function damageFriendlyWingman(baseDamage, hitModule, hitPos, fw = friendlyWingman, attacker = null) {
    if (!fw || !fw.isAlive) return;
    const mult = hitModule === 'ENGINE' ? 1.25 : 1.0;
    const finalDmg = Math.round(baseDamage * mult);
    if (fw.netProxy) return; // online guest: the host decides every hit
    if (fw.remote) {         // online host: a remote teammate takes the damage on their own device
      spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false, finalDmg);
      netForwardHit(fw, finalDmg, hitModule, attacker);
      return;
    }
    fw.hp = Math.max(0, fw.hp - finalDmg);
    fw.recentlyHit = true; // triggers a defensive break in updateFriendlyWingman
    spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false, finalDmg);

    if (fw.hp <= 0) {
      fw.isAlive = false;
      fw.isDying = true;
      fw.fallSpeed = 6;
      fw.lives = Math.max(0, fw.lives - 1);
      if (fw.typeLives) fw.typeLives[fw.planeRole] = Math.max(0, (fw.typeLives[fw.planeRole] || 0) - 1);
      spawnExplosionAt(fw.currentPos, 2.2);
      playExplosionSound();
      if (state.netRole === 'host') netReportKill(attacker, fw.callsign || `WINGMAN ${fw.def.shortName}`);

      if (fw.lives > 0) {
        fw.respawnTimer = 8.0;
        showCombatBanner(`⚠️ WINGMAN #${(fw.slot || 0) + 2} (${fw.def.shortName}) SHOT DOWN! (${fw.lives}/${fw.maxLives} LIVES LEFT)`, false);
      } else {
        fw.permanentlyDead = true;
        showCombatBanner(`⚠️ WINGMAN #${(fw.slot || 0) + 2} (${fw.def.shortName}) OUT OF LIVES (0/${fw.maxLives})`, false);
      }
    }
  }

  // =========================================================================
  // --- Friendly Wingman (#2) Independent AI ---
  // Roams a zone around the player, picks its own fights, breaks when threatened,
  // and flies a real approach & landing at the home base to repair when damaged.
  // =========================================================================
  const WINGMAN_ZONE = {
    patrolMin: 500,    // nearest patrol waypoint to the player (m)
    patrolMax: 1400,   // farthest patrol waypoint from the player (m)
    leash: 2200,       // when not fighting and further than this, head straight back
    engage: 1800,      // looks for enemies within this distance of itself...
    fightLeash: 2800,  // ...but never chases one further than this from the player
    threat: 650,       // an enemy this close with its nose on the wingman forces a break
    rtbHpFrac: 0.35    // below this health fraction it returns to base for repairs
  };
  const WINGMAN_STATE_LABELS = {
    parked: 'PARKED', takeoff: '🛫T/O', climbout: '↗️CLB', patrol: 'PATROL', attack: '⚔️ENG',
    evade: '↪️BRK', approach: '🛬RTB', final: '🛬FINAL', rollout: '🛬ROLL', servicing: '🔧REPAIR'
  };
  const wingmanSteerDummy = new THREE.Object3D();

  function setWingmanHeading(fw, fwd) {
    let hdg = THREE.MathUtils.radToDeg(Math.atan2(fwd.x, -fwd.z));
    if (hdg < 0) hdg += 360;
    fw.headingDeg = hdg;
  }

  function setWingmanGear(fw, target, dt) {
    fw.gearPos = THREE.MathUtils.clamp(fw.gearPos + Math.sign(target - fw.gearPos) * 0.6 * dt, 0, 1);
    if (Math.abs(target - fw.gearPos) < 0.02) fw.gearPos = target;
    if (fw.modelData && fw.modelData.setGearDeployment) fw.modelData.setGearDeployment(fw.gearPos);
  }

  // Kinematic flight toward a point (same banked-turn model as the enemy AI)
  function flyWingmanToward(fw, target, targetSpeedKmh, dt, turnScale = 1, minAgl = 25) {
    const accel = 70 * dt;
    fw.currentSpeedKmh += THREE.MathUtils.clamp(targetSpeedKmh - fw.currentSpeedKmh, -accel, accel);
    fw.speedMs = fw.currentSpeedKmh / 3.6;

    wingmanSteerDummy.position.copy(fw.currentPos);
    wingmanSteerDummy.quaternion.identity();
    wingmanSteerDummy.lookAt(target);
    const localAim = target.clone().sub(fw.currentPos).normalize()
      .applyQuaternion(fw.group.quaternion.clone().invert());
    wingmanSteerDummy.rotateZ(-THREE.MathUtils.clamp(localAim.x * 1.4, -0.9, 0.9));
    const turnRate = (fw.def.arcadePitchRate || 1.1) * 0.78 * turnScale;
    fw.group.quaternion.slerp(wingmanSteerDummy.quaternion, Math.min(1, turnRate * dt));

    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fw.group.quaternion);
    fw.velocity.copy(fwd).multiplyScalar(fw.speedMs);
    fw.currentPos.addScaledVector(fw.velocity, dt);
    const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(fw.currentPos.x, fw.currentPos.z));
    if (fw.currentPos.y < groundY + Math.max(1.5, minAgl)) fw.currentPos.y = groundY + Math.max(1.5, minAgl);
    fw.group.position.copy(fw.currentPos);
    setWingmanHeading(fw, fwd);
    return fwd;
  }

  // Keep a waypoint at a safe height over the terrain beneath it and beneath the wingman
  function safeWingmanTarget(fw, p, agl = 160) {
    const g1 = Math.max(CONFIG.seaLevel, getTerrainHeight(p.x, p.z));
    const g2 = Math.max(CONFIG.seaLevel, getTerrainHeight(fw.currentPos.x, fw.currentPos.z));
    p.y = THREE.MathUtils.clamp(p.y, Math.max(g1, g2) + agl, CONFIG.maxAltitude - 300);
    return p;
  }

  function pickWingmanPatrolOffset(fw) {
    const a = Math.random() * Math.PI * 2;
    const r = WINGMAN_ZONE.patrolMin + Math.random() * (WINGMAN_ZONE.patrolMax - WINGMAN_ZONE.patrolMin);
    fw.patrolOffset = new THREE.Vector3(Math.cos(a) * r, -120 + Math.random() * 320, Math.sin(a) * r);
    fw.patrolTimer = 10 + Math.random() * 8;
  }

  // Best enemy to engage: close to the wingman, inside the fight leash around the player,
  // preferring enemies that are currently attacking the player
  function pickWingmanTarget(fw) {
    let best = null;
    let bestScore = Infinity;
    for (const ep of enemyPlanes) {
      if (!ep.isAlive || ep.aiState === 'takeoff') continue;
      const d = fw.currentPos.distanceTo(ep.currentPos);
      if (d > WINGMAN_ZONE.engage) continue;
      if (ep.currentPos.distanceTo(airplaneGroup.position) > WINGMAN_ZONE.fightLeash) continue;
      const score = d - (ep.aiState === 'attack' ? 600 : 0);
      if (score < bestScore) { bestScore = score; best = ep; }
    }
    return best;
  }

  // An enemy close behind with its nose on the wingman
  function findWingmanThreat(fw) {
    for (const ep of enemyPlanes) {
      if (!ep.isAlive || ep.aiState === 'takeoff') continue;
      const toFw = fw.currentPos.clone().sub(ep.currentPos);
      const d = toFw.length();
      if (d > WINGMAN_ZONE.threat || d < 1) continue;
      const epFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ep.group.quaternion);
      if (epFwd.dot(toFw.divideScalar(d)) > 0.9) return ep;
    }
    return null;
  }

  // Home runway frame: heading, forward / right axes and the landing threshold (right lane)
  function wingmanRunwayFrame() {
    const af = AIRPORTS[state.currentAirfield] || AIRPORTS[0];
    const h = THREE.MathUtils.degToRad(af.spawnHeading);
    const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const right = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
    const threshold = new THREE.Vector3(af.x, af.elevation + 1.5, af.z)
      .addScaledVector(fwd, -(af.length / 2 - 40))
      .addScaledVector(right, 8);
    return { af, h, fwd, right, threshold };
  }

  function startWingmanEvade(fw, threat) {
    fw.aiState = 'evade';
    fw.evadeTimer = 2.0 + Math.random() * 1.5;
    fw.evadeDir = Math.random() < 0.5 ? -1 : 1;
    fw.evadeCooldown = 5.0;
    fw.targetEnemy = threat || fw.targetEnemy;
  }

  // Guns: burst fire when the target sits in a tight cone ahead (same burst rhythm as the enemy AI)
  function wingmanGunDecision(fw, fwd, aimPos, dist, dt) {
    const dirToAim = aimPos.clone().sub(fw.currentPos).normalize();
    if (dist < 700 && fwd.dot(dirToAim) > 0.96 && !fw.weaponJammed) {
      if (fw.burstCooldown > 0) {
        fw.burstCooldown -= dt;
        return false;
      }
      fw.burstTimer = (fw.burstTimer || 0) + dt;
      const maxBurst = (fw.weaponHeat > 0.70) ? 0.40 : 0.90;
      if (fw.burstTimer >= maxBurst) {
        fw.burstTimer = 0;
        fw.burstCooldown = 0.40 + Math.random() * 0.30;
      }
      return true;
    }
    fw.burstTimer = 0;
    if (fw.burstCooldown > 0) fw.burstCooldown -= dt;
    return false;
  }

  // One AI step; returns whether the guns want to fire this frame
  function runWingmanAI(fw, dt) {
    const def = fw.def;
    const cruise = def.cruiseAirspeed || 420;
    const combat = (def.maxAirspeed || 560) * 0.95;
    const takeoffSpeed = def.takeoffSpeed || 120;
    const playerPos = airplaneGroup.position;
    if (fw.evadeCooldown > 0) fw.evadeCooldown -= dt;
    const wasHit = fw.recentlyHit;
    fw.recentlyHit = false;

    const airborneCombatState = fw.aiState === 'patrol' || fw.aiState === 'attack' || fw.aiState === 'approach';
    if (airborneCombatState) {
      // Damaged: break off and go home for repairs
      if (fw.hp < fw.maxHp * WINGMAN_ZONE.rtbHpFrac && fw.aiState !== 'approach') {
        fw.aiState = 'approach';
        showCombatBanner(`🛬 WINGMAN #2 DAMAGED (${Math.round((fw.hp / fw.maxHp) * 100)}%) — RETURNING TO BASE FOR REPAIRS`, false);
      }
      // Under fire or an enemy on its tail: defensive break
      const threat = findWingmanThreat(fw);
      if ((wasHit || threat) && fw.evadeCooldown <= 0) startWingmanEvade(fw, threat);
    }

    switch (fw.aiState) {
      case 'parked': {
        fw.onGround = true;
        fw.currentSpeedKmh = 0;
        if (fw.parkTimer > 0) fw.parkTimer -= dt;
        const playerRolling = !state.flight.isOnGround || state.flight.airspeed > 55;
        if (fw.parkTimer <= 0 || playerRolling) fw.aiState = 'takeoff';
        return false;
      }

      case 'takeoff':
      case 'rollout': {
        // Ground roll along the runway heading: accelerate for take-off, brake after touchdown
        const rw = wingmanRunwayFrame();
        fw.onGround = true;
        if (fw.aiState === 'takeoff') {
          fw.currentSpeedKmh = Math.min(cruise, fw.currentSpeedKmh + 50 * dt);
        } else {
          fw.currentSpeedKmh = Math.max(0, fw.currentSpeedKmh - 45 * dt);
        }
        fw.speedMs = fw.currentSpeedKmh / 3.6;
        fw.velocity.copy(rw.fwd).multiplyScalar(fw.speedMs);
        fw.currentPos.addScaledVector(fw.velocity, dt);
        fw.currentPos.y = rw.af.elevation + 1.5;
        fw.group.position.copy(fw.currentPos);
        const rotate = fw.aiState === 'takeoff' && fw.currentSpeedKmh >= takeoffSpeed * 0.85 ? -0.16 : 0;
        fw.group.quaternion.setFromEuler(new THREE.Euler(rotate, rw.h, 0, 'YXZ'));
        setWingmanHeading(fw, rw.fwd);
        setWingmanGear(fw, 1, dt);

        if (fw.aiState === 'takeoff' && fw.currentSpeedKmh >= takeoffSpeed) {
          fw.aiState = 'climbout';
          fw.onGround = false;
        } else if (fw.aiState === 'rollout' && fw.currentSpeedKmh <= 2) {
          fw.aiState = 'servicing';
          fw.serviceTimer = 6.0;
          showCombatBanner('🔧 WINGMAN #2 ON THE GROUND — REARMING & REPAIRING', false);
        }
        return false;
      }

      case 'servicing': {
        fw.onGround = true;
        fw.serviceTimer -= dt;
        fw.hp = Math.min(fw.maxHp, fw.hp + (fw.maxHp / 6.0) * dt);
        fw.weaponHeat = 0;
        fw.weaponJammed = false;
        if (fw.serviceTimer <= 0) {
          fw.hp = fw.maxHp;
          fw.aiState = 'takeoff';
          showCombatBanner('🛫 WINGMAN #2 REPAIRED — TAKING OFF AGAIN', false);
        }
        return false;
      }

      case 'climbout': {
        // Straight-ahead climb with gear coming up, then off to patrol
        fw.onGround = false;
        setWingmanGear(fw, 0, dt);
        const fwdFlat = new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(fw.headingDeg)), 0, -Math.cos(THREE.MathUtils.degToRad(fw.headingDeg)));
        const target = fw.currentPos.clone().addScaledVector(fwdFlat, 800);
        target.y += 140;
        flyWingmanToward(fw, target, cruise, dt, 0.8, 1.5);
        const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(fw.currentPos.x, fw.currentPos.z));
        if (fw.currentPos.y > groundY + 150) {
          fw.aiState = 'patrol';
          pickWingmanPatrolOffset(fw);
        }
        return false;
      }

      case 'patrol': {
        fw.onGround = false;
        setWingmanGear(fw, 0, dt);
        const target = pickWingmanTarget(fw);
        if (target) {
          fw.targetEnemy = target;
          fw.retargetTimer = 2.0;
          fw.aiState = 'attack';
          return false;
        }
        if (!fw.patrolOffset) pickWingmanPatrolOffset(fw);
        fw.patrolTimer -= dt;

        const toPlayer = fw.currentPos.distanceTo(playerPos);
        let waypoint;
        let speed = cruise;
        if (toPlayer > WINGMAN_ZONE.leash) {
          // Strayed too far: head straight back into the zone
          waypoint = playerPos.clone().addScaledVector(fw.patrolOffset, 0.4);
          speed = combat;
        } else {
          waypoint = playerPos.clone().add(fw.patrolOffset);
        }
        safeWingmanTarget(fw, waypoint);
        const flatDist = Math.hypot(waypoint.x - fw.currentPos.x, waypoint.z - fw.currentPos.z);
        if (flatDist < 220 || fw.patrolTimer <= 0) pickWingmanPatrolOffset(fw);
        flyWingmanToward(fw, waypoint, speed, dt);
        return false;
      }

      case 'attack': {
        fw.onGround = false;
        setWingmanGear(fw, 0, dt);
        fw.retargetTimer = (fw.retargetTimer || 0) - dt;
        let tgt = fw.targetEnemy;
        const tooFar = !tgt || !tgt.isAlive ||
          tgt.currentPos.distanceTo(playerPos) > WINGMAN_ZONE.fightLeash ||
          fw.currentPos.distanceTo(playerPos) > WINGMAN_ZONE.fightLeash;
        if (tooFar || fw.retargetTimer <= 0) {
          tgt = pickWingmanTarget(fw);
          fw.targetEnemy = tgt;
          fw.retargetTimer = 2.0;
        }
        if (!tgt) {
          fw.aiState = 'patrol';
          pickWingmanPatrolOffset(fw);
          return false;
        }
        const dist = fw.currentPos.distanceTo(tgt.currentPos);
        const muzzleVel = (def.weapons && def.weapons.muzzleVelocity) || 780;
        const tLead = Math.min(1.2, dist / muzzleVel);
        const aimPos = tgt.currentPos.clone().addScaledVector(tgt.velocity, tLead);
        const g = Math.max(CONFIG.seaLevel, getTerrainHeight(aimPos.x, aimPos.z));
        if (aimPos.y < g + 60) aimPos.y = g + 60;
        const fwd = flyWingmanToward(fw, aimPos, combat, dt, 1.0, 40);
        return wingmanGunDecision(fw, fwd, aimPos, dist, dt);
      }

      case 'evade': {
        // Hard break turn away from the attacker, diving if high or climbing if low
        fw.onGround = false;
        setWingmanGear(fw, 0, dt);
        fw.evadeTimer -= dt;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fw.group.quaternion);
        const breakDir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), fw.evadeDir * 1.4);
        const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(fw.currentPos.x, fw.currentPos.z));
        breakDir.y = fw.currentPos.y - groundY > 350 ? -0.25 : 0.3;
        const target = fw.currentPos.clone().addScaledVector(breakDir.normalize(), 400);
        flyWingmanToward(fw, target, combat, dt, 1.25, 60);
        if (fw.evadeTimer <= 0) {
          // Turn on the attacker if it is still worth fighting, otherwise resume
          if (fw.hp < fw.maxHp * WINGMAN_ZONE.rtbHpFrac) {
            fw.aiState = 'approach';
          } else if (fw.targetEnemy && fw.targetEnemy.isAlive) {
            fw.aiState = 'attack';
            fw.retargetTimer = 3.0;
          } else {
            fw.aiState = 'patrol';
            pickWingmanPatrolOffset(fw);
          }
        }
        return false;
      }

      case 'approach': {
        // Line up with the home runway's extended centreline before starting down the glide path.
        // Too close or past it: swing out to a point 2.6 km behind the threshold, off to one side.
        // Far enough back: intercept the centreline 900 m ahead and hold 170 m.
        fw.onGround = false;
        const rw = wingmanRunwayFrame();
        const rel = fw.currentPos.clone().sub(rw.threshold);
        const along = rel.dot(rw.fwd);
        const lateral = rel.dot(rw.right);
        let target;
        if (along > -1300) {
          target = rw.threshold.clone()
            .addScaledVector(rw.fwd, -2600)
            .addScaledVector(rw.right, (lateral >= 0 ? 1 : -1) * 500);
          target.y = rw.af.elevation + 280;
        } else {
          target = rw.threshold.clone().addScaledVector(rw.fwd, Math.min(-1450, along + 900));
          target.y = rw.af.elevation + 170;
        }
        safeWingmanTarget(fw, target, 120);
        const fwd = flyWingmanToward(fw, target, cruise * 0.7, dt, 1.0, 60);
        setWingmanGear(fw, along > -2200 && along < -1000 ? 1 : 0, dt);

        const aligned = fwd.dot(rw.fwd) > 0.92 && Math.abs(lateral) < 70;
        if (aligned && along > -1800 && along < -1200) fw.aiState = 'final';
        return false;
      }

      case 'final': {
        // Lined up on the runway, ~6° glide path down to the threshold, gear down, slowing to landing speed
        fw.onGround = false;
        setWingmanGear(fw, 1, dt);
        const rw = wingmanRunwayFrame();
        const rel = fw.currentPos.clone().sub(rw.threshold);
        const along = rel.dot(rw.fwd);
        const lateral = Math.abs(rel.dot(rw.right));
        const glideY = s => rw.af.elevation + 1.5 + Math.max(0, -s) * 0.10;
        const aimAlong = along + 250;
        const target = rw.threshold.clone().addScaledVector(rw.fwd, aimAlong);
        target.y = glideY(aimAlong) - 4; // aim slightly below the path so it flares onto the runway
        flyWingmanToward(fw, target, takeoffSpeed * 1.35, dt, 1.6, 0);

        if (fw.currentPos.y <= rw.af.elevation + 6.0 && along > -60 && along < rw.af.length - 250) {
          // Touchdown: wheels on the runway, start braking
          fw.aiState = 'rollout';
          fw.currentPos.y = rw.af.elevation + 1.5;
          fw.currentSpeedKmh = Math.min(fw.currentSpeedKmh, takeoffSpeed * 1.3);
        } else if (along > rw.af.length - 250 || lateral > 200) {
          // Missed it: go around and set up again
          fw.aiState = 'approach';
        }
        return false;
      }

      default:
        fw.aiState = 'patrol';
        return false;
    }
  }

  function updateFriendlyWingman(dt) {
    if (!airplaneGroup) return;
    ensureTakeoverCandidate();
    for (const ally of getFriendlyAllies()) updateFriendlyAlly(ally, dt);
  }

  function updateFriendlyAlly(fw, dt) {
    if (fw.takenOver) return;
    if (fw.remote) { updateRemoteProxy(fw, dt); return; } // online teammate
    if (fw.aiState === 'remote') return;                  // idle slot

    if (fw.modelData && fw.modelData.propellers) {
      const propSpd = fw.isAlive ? (fw.currentSpeedKmh < 30 ? 35 : 85) : 20;
      for (let p of fw.modelData.propellers) {
        p.rotation.z += propSpd * dt;
      }
    }

    if (fw.isAlive) {
      const wantsToFire = runWingmanAI(fw, dt);
      fw.isFiring = wantsToFire; // lets enemies being shot at by the wingman react defensively
      // Friendly Wingman also uses the hidden barrel heating system!
      updateEnemyWeapon(fw, dt, wantsToFire);
    } else if (fw.isDying) {
      fw.fallSpeed += 25 * dt;
      fw.currentPos.addScaledVector(fw.velocity, dt * 0.65);
      fw.currentPos.y -= fw.fallSpeed * dt;
      fw.group.position.copy(fw.currentPos);
      fw.group.rotateX(0.6 * dt);
      fw.group.rotateZ(2.4 * dt);

      const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(fw.currentPos.x, fw.currentPos.z));
      if (fw.currentPos.y <= groundY + 1.5) {
        fw.isDying = false;
        fw.group.visible = false;
        spawnExplosionAt(fw.currentPos, 2.2);
      }
    } else if (!fw.permanentlyDead && fw.lives > 0) {
      fw.respawnTimer -= dt;
      if (fw.respawnTimer <= 0) {
        if (fw.typeLives) {
          // Factions: pick a new aircraft type that still has lives
          const nextRole = pickRandomRoleWithLives(fw.typeLives);
          if (nextRole) setFactionPlaneType(fw, nextRole);
        }
        fw.hp = fw.maxHp;
        fw.isAlive = true;
        fw.isDying = false;
        fw.group.visible = true;
        positionFriendlyWingmanOnPlayerRunway(3, fw);
        showCombatBanner(`🛫 WINGMAN #${(fw.slot || 0) + 2} (${fw.def.shortName}) TAKING OFF FROM HOME BASE (${fw.lives}/${fw.maxLives} LIVES)`, false);
      }
    }
  }

  function initEnemyPlanes() {
    if (typeof WW2AircraftBuilders === 'undefined' || !scene) return;
    const hudContainer = document.getElementById('enemy-hud-container');

    // Player's side: Team Size N gives the player N-1 AI wingmen of the same aircraft type
    // (#2 is the one the player can take over; #3 and #4 are escorts). Team Size 1 flies solo.
    if (state.teamSize >= 2) {
      initFriendlyWingman();
    } else if (friendlyWingman) {
      if (friendlyWingman.group) scene.remove(friendlyWingman.group);
      if (friendlyWingman.markerEl) friendlyWingman.markerEl.remove();
      friendlyWingman = null;
    }
    removeFriendlyEscorts();
    initFriendlyEscorts();

    // Factions: 3 AI nations (random types per plane), every team on its own
    if (isFactionsMatch()) {
      initFactionEnemies();
      return;
    }

    // Pool of single-type 2-plane enemy teams (Mustang Rotte, Zero Shotai, Bf 109 Rotte, Il-2 Pair, Spitfire Section, SM.79 Pair);
    // each game only 3 of them, picked at random, take part (one per enemy island)
    // Both planes in each 2-plane team fly the EXACT SAME aircraft type and share its specialty stat!
    const squadronTeamConfigs = [
      {
        teamId: 'team_mustang',
        planeId: 'mustang',
        pattern: 'orbit',
        centerX: 0,
        centerZ: 0,
        alt: 550,
        radius: 2800,
        dir: 1,
        phase: 0.0,
        speedKmh: 400, // ★ Higher Speed Specialty
        bankAngle: 0.35
      },
      {
        teamId: 'team_zero',
        planeId: 'zero',
        pattern: 'figure8',
        centerX: 400 * MAP_SCALE,
        centerZ: -700 * MAP_SCALE,
        alt: 420,
        radius: 1800,
        dir: 1,
        phase: 1.5,
        speedKmh: 280, // ★ Higher Maneuverability Specialty
        bankAngle: 0.55
      },
      {
        teamId: 'team_bf109',
        planeId: 'bf109',
        pattern: 'orbit',
        centerX: 1100 * MAP_SCALE,
        centerZ: 700 * MAP_SCALE,
        alt: 560,
        radius: 1800,
        dir: -1,
        phase: 3.1,
        speedKmh: 280, // ★ Higher Damage Specialty
        bankAngle: -0.40
      },
      {
        teamId: 'team_il2',
        planeId: 'il2',
        pattern: 'orbit',
        centerX: -1100 * MAP_SCALE,
        centerZ: 400 * MAP_SCALE,
        alt: 380,
        radius: 1700,
        dir: 1,
        phase: 4.7,
        speedKmh: 270, // ★ Higher Health Specialty (240 HP)
        bankAngle: 0.30
      },
      {
        teamId: 'team_spitfire',
        planeId: 'spitfire',
        pattern: 'figure8',
        centerX: -600 * MAP_SCALE,
        centerZ: -900 * MAP_SCALE,
        alt: 500,
        radius: 1900,
        dir: -1,
        phase: 2.4,
        speedKmh: 340, // ★ All-Rounder (speed tier 3)
        bankAngle: -0.45
      },
      {
        teamId: 'team_sm79',
        planeId: 'sm79',
        pattern: 'orbit',
        centerX: 200 * MAP_SCALE,
        centerZ: 600 * MAP_SCALE,
        alt: 650,
        radius: 2200,
        dir: 1,
        phase: 5.5,
        speedKmh: 230, // ★ Heavy Bomber (speed tier 1, health tier 4)
        bankAngle: 0.25
      }
    ];

    // One enemy team per enemy island: draw that many different aircraft types at random
    // (the others sit this game out) and give each its own home airfield.
    const enemyBases = (state.enemyHomeAirfields && state.enemyHomeAirfields.length)
      ? state.enemyHomeAirfields
      : AIRPORTS.map((_, i) => i).filter(i => i !== state.currentAirfield);
    const activeConfigs = squadronTeamConfigs.slice();
    for (let i = activeConfigs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [activeConfigs[i], activeConfigs[j]] = [activeConfigs[j], activeConfigs[i]];
    }
    activeConfigs.length = Math.min(activeConfigs.length, enemyBases.length);

    for (let tIdx = 0; tIdx < activeConfigs.length; tIdx++) {
      const cfg = activeConfigs[tIdx];
      const def = AIRCRAFT_DEFS[cfg.planeId] || AIRCRAFT_DEFS.mustang;
      const chosenBase = enemyBases[tIdx];
      // Patrol around its own island: orbit centred between the home airfield and mid-map, kept inside the theatre
      const homeAf = AIRPORTS[chosenBase];
      cfg.centerX = THREE.MathUtils.clamp(homeAf.x * 0.7, CONFIG.minX + cfg.radius + 300, CONFIG.maxX - cfg.radius - 300);
      cfg.centerZ = THREE.MathUtils.clamp(homeAf.z * 0.7, CONFIG.minZ + cfg.radius + 300, CONFIG.maxZ - cfg.radius - 300);

      const teamMembers = [];

      // Spawn the Lead (#1) plus (teamSize - 1) wingmen, all of the exact same aircraft type!
      const teamSize = THREE.MathUtils.clamp(Math.round(state.teamSize) || 2, TEAM_SIZE_MIN, TEAM_SIZE_MAX);
      for (let mIdx = 0; mIdx < teamSize; mIdx++) {
        const role = (mIdx === 0) ? 'lead' : 'wingman';
        const memberNum = mIdx + 1;
        const modelData = createAircraftModel(cfg.planeId);
        const eGroup = modelData.group;
        scene.add(eGroup);

        let markerEl = null, leadEl = null, labelEl = null, hpFillEl = null;
        if (hudContainer) {
          markerEl = document.createElement('div');
          markerEl.className = 'enemy-hud-marker';
          markerEl.innerHTML = `
            <div class="enemy-label">
              <div class="enemy-title">${def.shortName} #${memberNum} [${def.badge}]</div>
              <div class="enemy-hp-bar"><div class="enemy-hp-fill"></div></div>
            </div>
            <div class="enemy-target-box"></div>
          `;
          hudContainer.appendChild(markerEl);
          labelEl = markerEl.querySelector('.enemy-title');
          hpFillEl = markerEl.querySelector('.enemy-hp-fill');

          leadEl = document.createElement('div');
          leadEl.className = 'enemy-lead-reticle';
          hudContainer.appendChild(leadEl);
        }

        const maxHp = def.maxHp || 120;
        const ep = {
          id: `enemy_${cfg.planeId}_${memberNum}`,
          teamId: cfg.teamId,
          sideKey: cfg.teamId, // every team is on its own (hostile to the player's side and to the other teams)
          role: role,
          memberNumber: memberNum,
          slot: mIdx,
          teamSize: teamSize,
          callsign: `${def.shortName} #${memberNum}`,
          partner: null,
          planeId: cfg.planeId,
          def: def,
          modelData: modelData,
          group: eGroup,
          pattern: cfg.pattern,
          centerX: cfg.centerX,
          centerZ: cfg.centerZ,
          baseAlt: cfg.alt,
          radius: cfg.radius,
          dir: cfg.dir,
          phase: cfg.phase,
          cruiseSpeedKmh: cfg.speedKmh,
          currentSpeedKmh: 0,
          speedMs: 0,
          bankAngle: cfg.bankAngle,
          currentPos: new THREE.Vector3(),
          velocity: new THREE.Vector3(0, 0, 0),
          headingDeg: 0,
          hp: maxHp,
          maxHp: maxHp,
          lives: 3,               // ★ 3 Lives per enemy aircraft
          maxLives: 3,
          permanentlyDead: false,
          isAlive: true,
          isDying: false,
          aiState: 'takeoff',     // 'takeoff' -> 'climb' -> 'patrol' <-> 'attack'
          attackTarget: 'player', // who it attacks while in 'attack': 'player' or 'wingman'
          tacticalState: 'pursuit', // 'pursuit', 'high_yoyo', 'evasion', 'extend_and_cool'
          tacticalTimer: 0.0,
          evasionType: 'barrel_roll',
          evasionDir: 1,
          burstTimer: 0.0,
          burstCooldown: 0.0,
          airfieldIndex: chosenBase,
          takeoffDelay: 0,
          gearPos: 1.0,
          breakOffTimer: 0,
          // Hidden Barrel Heating System (identical physics to player, invisible on HUD)
          weaponHeat: 0.0,
          weaponJammed: false,
          weaponTimer: 0.0,
          hardpointIndex: 0,
          respawnTimer: 0,
          fallSpeed: 0,
          smokeTimer: 0,
          engineDamaged: false,
          wingDamaged: false,
          markerEl: markerEl,
          leadEl: leadEl,
          labelEl: labelEl,
          hpFillEl: hpFillEl
        };

        teamMembers.push(ep);
        enemyPlanes.push(ep);
      }

      // Link every wingman to the Lead; the Lead's partner is the first wingman (none for a 1-plane team)
      for (let k = 1; k < teamMembers.length; k++) teamMembers[k].partner = teamMembers[0];
      teamMembers[0].partner = teamMembers[1] || null;
      // This team's base and its flak fight for this team only
      AIRPORTS[chosenBase].sideKey = cfg.teamId;
      for (const aa of aaDefenseSystems) {
        let nearest = 0, best = Infinity;
        AIRPORTS.forEach((af, i) => { const dd = Math.hypot(af.x - aa.x, af.z - aa.z); if (dd < best) { best = dd; nearest = i; } });
        if (nearest === chosenBase) aa.sideKey = cfg.teamId;
      }
      enemyTeams.push({
        teamId: cfg.teamId,
        sideKey: cfg.teamId,
        planeId: cfg.planeId,
        lead: teamMembers[0],
        wingman: teamMembers[1] || null,
        members: teamMembers
      });

      // Fixed home base for the whole game; every plane lines up on it in staggered formation
      for (const m of teamMembers) {
        m.homeAirfield = chosenBase;
        assignEnemyToHomeAirbase(m);
      }
    }
  }

  // Spawn a bullet fired by a Non-AI Aircraft (Enemy or Friendly Wingman, with hidden barrel heat dispersion)
  function spawnEnemyBullet(ep) {
    if (!ep || !ep.isAlive || ep.weaponJammed) return;

    const def = ep.def || AIRCRAFT_DEFS.mustang;
    const hardpoints = (def.hardpoints && def.hardpoints.length > 0)
      ? def.hardpoints
      : [new THREE.Vector3(0, 0, 3.5)];
    const weapon = def.weapons || {
      damagePerShot: 14,
      muzzleVelocity: 780,
      tracerColor: 0xff5500,
      tracerLength: 18.0,
      convergenceDistance: 600,
      heatPerShot: 0.008
    };

    const hpIdx = ep.hardpointIndex % hardpoints.length;
    const localMuzzle = hardpoints[hpIdx];
    ep.hardpointIndex++;

    const isOuterGun = (hpIdx === 2 || hpIdx === 3);
    const muzzleVelocity = weapon.muzzleVelocity || 780;
    const tracerColor = ep.isFriendly ? 0x38bdf8 : (weapon.tracerColor || 0xff5500);
    const tracerLength = weapon.tracerLength || 18.0;
    const bulletDamage = Math.round((weapon.damagePerShot || 14) * (ep.netSkill ? ep.netSkill.dmg : 1));

    const muzzlePos = localMuzzle.clone().applyQuaternion(ep.group.quaternion).add(ep.currentPos);
    const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(ep.group.quaternion).normalize();
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(ep.group.quaternion).normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(ep.group.quaternion).normalize();

    const convergenceDist = weapon.convergenceDistance || 600;
    const timeToConv = convergenceDist / muzzleVelocity;
    const gravityDropComp = 0.5 * BULLET_GRAVITY * timeToConv * timeToConv;

    const convergencePoint = ep.currentPos.clone()
      .add(forwardVec.clone().multiplyScalar(convergenceDist));
    convergencePoint.y += gravityDropComp;

    let boreDirection = convergencePoint.clone().sub(muzzlePos).normalize();

    // Hidden Barrel Heat Angular Dispersion (exact same formula as player)
    const heatSpreadAngle = 0.0022 + Math.pow(ep.weaponHeat, 2.2) * 0.025;
    boreDirection.addScaledVector(rightVec, (Math.random() - 0.5) * heatSpreadAngle);
    boreDirection.addScaledVector(upVec, (Math.random() - 0.5) * heatSpreadAngle);
    boreDirection.normalize();

    const bulletVelocity = boreDirection.clone().multiplyScalar(muzzleVelocity).add(ep.velocity);

    let bullet = null;
    if (bulletPool.length > 0) {
      bullet = bulletPool.pop();
    } else if (activeBullets.length < MAX_ACTIVE_BULLETS) {
      const tracerObj = createTracerMesh(tracerColor);
      bullet = {
        meshGroup: tracerObj.group,
        glowMat: tracerObj.glowMat,
        glowMesh: tracerObj.glowMesh,
        coreMesh: tracerObj.coreMesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 2.6,
        smokeTimer: 0,
        tracerLength: tracerLength,
        damage: bulletDamage,
        owner: ep.id,
        ownerPlane: ep
      };
    } else {
      bullet = activeBullets.shift();
    }

    bullet.position.copy(muzzlePos);
    bullet.velocity.copy(bulletVelocity);
    bullet.life = 2.8;
    bullet.tracerLength = tracerLength;
    bullet.damage = bulletDamage;
    bullet.owner = ep.id;
    bullet.ownerPlane = ep;
    bullet.visualOnly = state.netRole === 'guest';
    bullet.glowMat.color.setHex(tracerColor);
    bullet.smokeTimer = 0;

    bullet.glowMesh.scale.set(1, 1, bullet.tracerLength);
    bullet.coreMesh.scale.set(1, 1, bullet.tracerLength);
    bullet.meshGroup.position.copy(bullet.position);
    bullet.meshGroup.lookAt(bullet.position.clone().add(bullet.velocity));
    bullet.meshGroup.visible = true;

    activeBullets.push(bullet);

    // Hidden Barrel Heat Accumulation & Overheat Jam (exact same formula as player)
    const heatGain = weapon.heatPerShot || 0.008;
    ep.weaponHeat = Math.min(1.0, ep.weaponHeat + heatGain);
    if (ep.weaponHeat >= 1.0) {
      ep.weaponJammed = true;
    }

    // Muzzle flash on aircraft
    triggerMuzzleFlash(muzzlePos, ep.group.quaternion);
    if (!isOuterGun && airplaneGroup && ep.currentPos.distanceTo(airplaneGroup.position) < 850) {
      playGunfireSound(def.id === 'bf109');
    }
  }

  // Update Non-Player Hidden Barrel Heating, Convective Ram-Air Cooling, Jam Clearing & Firing Cadence (100% Identical to Player)
  function updateEnemyWeapon(ep, dt, wantsToFire) {
    const def = ep.def || AIRCRAFT_DEFS.mustang;
    const numGuns = (def.hardpoints && def.hardpoints.length) || 1;
    const rpmPerGun = (def.weapons && def.weapons.fireRateRpm) || 750;
    const totalRpm = rpmPerGun * numGuns;
    const baseFireInterval = 60 / totalRpm;

    // Thermal Dissipation & Ram-Air Convective Cooling (identical to player's cooling mechanics)
    const maxSpd = CONFIG.maxAirspeed || 600;
    const currentSpeed = ep.currentSpeedKmh || (ep.speedMs ? ep.speedMs * 3.6 : 300);
    const speedRatio = THREE.MathUtils.clamp(currentSpeed / maxSpd, 0, 1.3);
    const airflowCoolingBonus = 0.10 * speedRatio;
    const isActivelyFiring = wantsToFire && !ep.weaponJammed;
    const coolingRate = (0.16 + airflowCoolingBonus) * (isActivelyFiring ? 0.30 : 1.0) * (def.coolingBonus ? 1.5 : 1.0);

    if (ep.weaponHeat > 0) {
      ep.weaponHeat = Math.max(0, ep.weaponHeat - coolingRate * dt);
    }

    // Clear gun jam once cooled below 30% (exact same threshold as player)
    if (ep.weaponJammed && ep.weaponHeat <= 0.30) {
      ep.weaponJammed = false;
    }

    // Thermal cadence slowdown above 65% heat (exact same curve as player)
    const thermalSlowdown = 1.0 + Math.max(0, (ep.weaponHeat - 0.65) / 0.35) * 0.28;
    const currentFireInterval = baseFireInterval * thermalSlowdown;

    if (wantsToFire && !ep.weaponJammed) {
      ep.weaponTimer += dt;
      let shots = 0;
      while (ep.weaponTimer >= currentFireInterval && shots < 6) {
        spawnEnemyBullet(ep);
        ep.weaponTimer -= currentFireInterval;
        shots++;
        if (ep.weaponJammed) break;
      }
    } else {
      ep.weaponTimer = Math.min(ep.weaponTimer, currentFireInterval);
    }
  }

  function damagePlayerAircraft(baseDamage, hitModule, hitPos, attackerPlane) {
    if (state.isCrashed) return;
    if (state.netRole === 'host' && attackerPlane && attackerPlane.remote) net.lastAttacker = { remote: attackerPlane.remote, netName: attackerPlane.netName, at: performance.now() };

    const mult = hitModule === 'ENGINE' ? 1.25 : 1.0;
    const finalDmg = Math.round(baseDamage * mult);
    state.playerHp = Math.max(0, state.playerHp - finalDmg);
    updateAircraftUI();

    playTargetHitSound();
    spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false, finalDmg);

    if (state.cameraRecoil) {
      state.cameraRecoil.intensity = Math.min(1.0, state.cameraRecoil.intensity + 0.42);
    }

    const attackerName = (attackerPlane && attackerPlane.callsign)
      ? attackerPlane.callsign
      : ((attackerPlane && attackerPlane.def) ? attackerPlane.def.shortName : 'ENEMY FIGHTER');
    if (state.playerHp <= 0) {
      spawnExplosionAt(airplaneGroup.position, 2.4);
      playExplosionSound();
      triggerCrash(`Shot down by ${attackerName}! [${hitModule} HIT]`);
    } else {
      showCombatBanner(`⚠️ TAKING FIRE FROM ${attackerName} [${hitModule}] — ${state.playerHp}/${state.playerMaxHp} HP`, false);
    }
  }

  function damageEnemyPlane(ep, baseDamage, hitModule, hitPos, isPlayerDirectHit = true, attacker = null) {
    if (!ep || !ep.isAlive) return;

    const mult = hitModule === 'ENGINE' ? 1.25 : 1.0;
    const finalDmg = Math.round(baseDamage * mult);
    if (ep.netProxy) return; // online guest: the host decides every hit
    if (ep.remote) {         // online host: a remote player takes the damage on their own device
      spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false, finalDmg);
      netForwardHit(ep, finalDmg, hitModule, isPlayerDirectHit ? 'host' : attacker);
      return;
    }
    ep.hp = Math.max(0, ep.hp - finalDmg);

    if (hitModule === 'ENGINE') ep.engineDamaged = true;
    if (hitModule === 'WING') ep.wingDamaged = true;

    playTargetHitSound();
    spawnBulletImpact(hitPos.x, hitPos.y, hitPos.z, false, finalDmg);

    const isKill = (ep.hp <= 0);
    if (isPlayerDirectHit) {
      triggerHitMarker(isKill);
      if (isKill) {
        state.sortieKills = (state.sortieKills || 0) + 1;
      }
    }

    if (isKill) {
      ep.isAlive = false;
      ep.isDying = true;
      ep.aiState = 'dying';
      ep.fallSpeed = 6;
      ep.lives = Math.max(0, ep.lives - 1);
      if (ep.typeLives) ep.typeLives[ep.planeRole] = Math.max(0, (ep.typeLives[ep.planeRole] || 0) - 1);

      spawnExplosionAt(ep.currentPos, 2.3);
      playExplosionSound();
      if (state.netRole === 'host') netReportKill(isPlayerDirectHit ? 'host' : attacker, ep.callsign);

      // Milestone 1.2: If Flight Lead (#1) is shot down while Wingman (#2) was in formation, Wingman smoothly promotes to Lead!
      if (ep.role === 'lead' && ep.partner && ep.partner.isAlive && ep.partner.aiState === 'patrol') {
        enterEnemyPatrolState(ep.partner);
      }

      // Factions: AI nations also shoot each other down; those kills carry no points for the player
      const byAI = Boolean(attacker && !isPlayerDirectHit && !attacker.isFriendly);
      const killerPrefix = isPlayerDirectHit ? `${state.pilotName || 'PILOT'} SHOT DOWN:`
        : (attacker ? `${attacker.callsign || 'AI'} SHOT DOWN:` : 'WING #2 SHOT DOWN:');
      if (ep.lives > 0 && isHomeBaseDestroyed(ep)) {
        ep.lives = 0;
        ep.permanentlyDead = true;
        showCombatBanner(`🏆 ${killerPrefix} ${ep.callsign} — HOME BASE DESTROYED, NO RESPAWN!${byAI ? '' : ' +500'}`, true);
      } else if (ep.lives > 0) {
        ep.respawnTimer = 8.0; // Respawn at the team's home base in 8 seconds
        showCombatBanner(`💥 ${killerPrefix} ${ep.callsign} (${ep.lives}/${ep.maxLives} LIVES LEFT)${byAI ? '' : ' +250'}`, !byAI);
      } else {
        ep.permanentlyDead = true;
        showCombatBanner(byAI
          ? `☠️ ${killerPrefix} ${ep.callsign} — OUT OF LIVES (0/${ep.maxLives})`
          : `🏆 ${state.pilotName || 'PILOT'} ELIMINATED ${ep.callsign}! (0/${ep.maxLives} LIVES) +500`, true);
      }
    } else if (isPlayerDirectHit) {
      showCombatBanner(`HIT ${ep.callsign} [${hitModule}] — ${ep.hp}/${ep.maxHp} HP (${ep.lives}/${ep.maxLives} ♥)`, false);
    }
  }

  // Smoothly transition an enemy plane from climb/attack back into its patrol orbit without teleporting
  function enterEnemyPatrolState(ep) {
    ep.aiState = 'patrol';
    ep.phase = Math.atan2(ep.currentPos.z - ep.centerZ, ep.currentPos.x - ep.centerX);
    if (ep.pattern !== 'figure8') {
      ep.centerX = ep.currentPos.x - Math.cos(ep.phase) * ep.radius;
      ep.centerZ = ep.currentPos.z - Math.sin(ep.phase) * ep.radius;
      ep.centerX = THREE.MathUtils.clamp(ep.centerX, CONFIG.minX + ep.radius + 100, CONFIG.maxX - ep.radius - 100);
      ep.centerZ = THREE.MathUtils.clamp(ep.centerZ, CONFIG.minZ + ep.radius + 100, CONFIG.maxZ - ep.radius - 100);
      ep.phase = Math.atan2(ep.currentPos.z - ep.centerZ, ep.currentPos.x - ep.centerX);
    }
  }

  // What an attacking enemy needs to know about its target. targetKey: 'player' | 'wingman'.
  // engageable = airborne & alive (new attacks only start against flying targets; an attack
  // already under way breaks off once the target lands, crashes or is shot down).
  function getEnemyTarget(targetKey) {
    // Factions: another nation's AI plane as a target
    if (targetKey.startsWith('plane:')) {
      const t = enemyPlanes.find(e => e.id === targetKey.slice(6));
      if (!t || !t.isAlive || t.isDying || !t.group) return null;
      const flying = t.aiState !== 'takeoff' && !(t.remote && t.onGround);
      return {
        pos: t.currentPos,
        quat: t.group.quaternion,
        velocity: t.velocity,
        airborne: flying,
        firing: Boolean(t.isFiring),
        engageable: flying,
        sideKey: t.sideKey
      };
    }
    if (targetKey !== 'player') {
      const fw = getFriendlyAllies().find(a => allyTargetKey(a) === targetKey);
      if (!fw || !fw.isAlive || fw.takenOver || !fw.group) return null;
      return {
        pos: fw.currentPos,
        quat: fw.group.quaternion,
        velocity: fw.velocity,
        airborne: !fw.onGround,
        firing: Boolean(fw.isFiring),
        engageable: !fw.onGround,
        sideKey: 'player'
      };
    }
    if (!airplaneGroup || state.isCrashed) return null;
    return {
      pos: airplaneGroup.position,
      quat: airplaneGroup.quaternion,
      velocity: state.flight.velocity,
      airborne: !state.flight.isOnGround,
      firing: Boolean(state.inputs && state.inputs.fire),
      engageable: true,
      sideKey: 'player'
    };
  }

  // =========================================================================
  // --- SM.79 dorsal gunner: automatic rear/upper defensive gun for every SM.79 (player, wingmen, enemies) ---
  // =========================================================================
  const DORSAL_REST_AIM = new THREE.Vector3(0, 0.3, -1).normalize();
  const playerGunner = { aim: DORSAL_REST_AIM.clone(), timer: 0, burstClock: 0 };
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  function spawnGunnerBullet(o, muzzlePos, dir) {
    const weapon = o.def.weapons;
    const muzzleVelocity = weapon.muzzleVelocity || 765;
    const tracerColor = o.tracerColor || weapon.tracerColor || 0xfde68a;
    const tracerLength = weapon.tracerLength || 18.0;
    const bulletVelocity = dir.clone().multiplyScalar(muzzleVelocity).add(o.vel);

    let bullet = null;
    if (bulletPool.length > 0) {
      bullet = bulletPool.pop();
    } else if (activeBullets.length < MAX_ACTIVE_BULLETS) {
      const tracerObj = createTracerMesh(tracerColor);
      bullet = {
        meshGroup: tracerObj.group,
        glowMat: tracerObj.glowMat,
        glowMesh: tracerObj.glowMesh,
        coreMesh: tracerObj.coreMesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 2.6,
        smokeTimer: 0,
        tracerLength: tracerLength,
        damage: weapon.damagePerShot || 9
      };
    } else {
      bullet = activeBullets.shift();
    }
    bullet.position.copy(muzzlePos);
    bullet.velocity.copy(bulletVelocity);
    bullet.life = 2.4;
    bullet.tracerLength = tracerLength;
    bullet.damage = weapon.damagePerShot || 9;
    bullet.owner = o.ownerId;
    bullet.ownerPlane = o.ownerPlane;
    bullet.visualOnly = state.netRole === 'guest';
    bullet.glowMat.color.setHex(tracerColor);
    bullet.smokeTimer = 0;
    bullet.glowMesh.scale.set(1, 1, bullet.tracerLength);
    bullet.coreMesh.scale.set(1, 1, bullet.tracerLength);
    bullet.meshGroup.position.copy(bullet.position);
    bullet.meshGroup.lookAt(bullet.position.clone().add(bullet.velocity));
    bullet.meshGroup.visible = true;
    activeBullets.push(bullet);

    triggerMuzzleFlash(muzzlePos, o.quat);
    if (o.isPlayer || (airplaneGroup && o.pos.distanceTo(airplaneGroup.position) < 850)) {
      playGunfireSound(true);
    }
  }

  // One gunner step. o = { def, modelData, pos, quat, vel, gunner, ownerId, ownerPlane, isPlayer, tracerColor, hostiles:[{pos, vel}] }
  function runDorsalGunner(o, dt) {
    const cfg = o.def.dorsalGunner;
    const g = o.gunner;
    const mv = o.def.weapons.muzzleVelocity || 765;
    const invQ = o.quat.clone().invert();
    const mount = cfg.mount.clone().applyQuaternion(o.quat).add(o.pos);

    // Nearest hostile inside range and the gun's field of fire (not dead ahead, not far below)
    let best = null;
    let bestD = cfg.range;
    for (const h of o.hostiles) {
      const to = h.pos.clone().sub(mount);
      const d = to.length();
      if (d < 8 || d >= bestD) continue;
      const local = to.clone().applyQuaternion(invQ).divideScalar(d);
      if (local.z > 0.55 || local.y < -0.3) continue;
      best = h;
      bestD = d;
    }

    // Lead solution: bullet = dir * muzzleVelocity + own velocity, with ballistic drop compensated
    let desiredLocal = DORSAL_REST_AIM;
    let worldDir = null;
    if (best) {
      const t = bestD / mv;
      worldDir = best.pos.clone().sub(mount)
        .addScaledVector(best.vel.clone().sub(o.vel), t)
        .add(new THREE.Vector3(0, 0.5 * BULLET_GRAVITY * t * t, 0))
        .divideScalar(t).normalize();
      desiredLocal = worldDir.clone().applyQuaternion(invQ);
    }

    // Swing the gun toward the aim point (or back to its rest position)
    g.aim.lerp(desiredLocal, Math.min(1, 9 * dt)).normalize();
    const turret = o.modelData && o.modelData.dorsalTurret;
    if (turret) turret.quaternion.setFromUnitVectors(AXIS_Z, g.aim);

    // Fire short bursts once the barrel is on target
    if (!best || g.aim.dot(desiredLocal) < 0.985) {
      g.burstClock = 0;
      g.timer = 0;
      return;
    }
    g.burstClock += dt;
    const cycle = cfg.burstOn + cfg.burstOff;
    if ((g.burstClock % cycle) > cfg.burstOn) { g.timer = 0; return; }

    const interval = 60 / cfg.rpm;
    g.timer += dt;
    let shots = 0;
    while (g.timer >= interval && shots < 3) {
      g.timer -= interval;
      shots++;
      const aimWorld = g.aim.clone().applyQuaternion(o.quat);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quat);
      aimWorld.addScaledVector(right, (Math.random() - 0.5) * cfg.spread * 2)
        .addScaledVector(up, (Math.random() - 0.5) * cfg.spread * 2)
        .normalize();
      spawnGunnerBullet(o, mount.clone().addScaledVector(aimWorld, 0.9), aimWorld);
    }
  }

  function updateDorsalGunners(dt) {
    if (!airplaneGroup) return;
    const liveEnemies = enemyPlanes.filter(e => e.isAlive && !e.isDying && e.aiState !== 'takeoff');
    const enemyHostiles = liveEnemies.map(e => ({ pos: e.currentPos, vel: e.velocity }));

    // Player's own gunner
    if (activeAircraftDef && activeAircraftDef.dorsalGunner && !state.isCrashed && !state.flight.isOnGround) {
      runDorsalGunner({
        def: activeAircraftDef, modelData: activeModelData, pos: airplaneGroup.position, quat: airplaneGroup.quaternion,
        vel: state.flight.velocity, gunner: playerGunner, ownerId: 'player', ownerPlane: null, isPlayer: true,
        hostiles: enemyHostiles
      }, dt);
    }

    // Friendly SM.79 wingmen
    for (const fw of getFriendlyAllies()) {
      if (!fw.def || !fw.def.dorsalGunner || !fw.isAlive || fw.takenOver || fw.onGround) continue;
      if (!fw.gunner) fw.gunner = { aim: DORSAL_REST_AIM.clone(), timer: 0, burstClock: 0 };
      runDorsalGunner({
        def: fw.def, modelData: fw.modelData, pos: fw.currentPos, quat: fw.group.quaternion, vel: fw.velocity,
        gunner: fw.gunner, ownerId: fw.id, ownerPlane: fw, tracerColor: 0x38bdf8, hostiles: enemyHostiles
      }, dt);
    }

    // Enemy SM.79s shoot at the player and at the player's wingmen
    const sm79Enemies = liveEnemies.filter(e => e.def && e.def.dorsalGunner);
    if (sm79Enemies.length) {
      const hostiles = [];
      for (const key of ['player', ...getFriendlyAllies().map(allyTargetKey)]) {
        const tgt = getEnemyTarget(key);
        if (tgt && tgt.airborne) hostiles.push({ pos: tgt.pos, vel: tgt.velocity });
      }
      for (const ep of sm79Enemies) {
        if (!ep.gunner) ep.gunner = { aim: DORSAL_REST_AIM.clone(), timer: 0, burstClock: 0 };
        let epHostiles = hostiles;
        if (ep.sideKey) {
          // Factions: the rear gunner also covers planes of every other AI nation
          epHostiles = hostiles.concat(liveEnemies.filter(o => o.sideKey !== ep.sideKey).map(o => ({ pos: o.currentPos, vel: o.velocity })));
        }
        runDorsalGunner({
          def: ep.def, modelData: ep.modelData, pos: ep.currentPos, quat: ep.group.quaternion, vel: ep.velocity,
          gunner: ep.gunner, ownerId: ep.id, ownerPlane: ep, hostiles: epHostiles
        }, dt);
      }
    }
  }

  function updateEnemyPlanes(dt) {
    // Online guest: no AI here, every other aircraft is drawn from the host's snapshots
    if (state.netRole === 'guest') {
      updateDorsalGunners(dt);
      if (airplaneGroup && airplaneGroup.visible && !state.isCrashed && state.playerMaxHp > 0) {
        emitDamageSmoke(playerSmokeEmitter, airplaneGroup.position, airplaneGroup.quaternion, state.playerHp / state.playerMaxHp, dt);
      }
      netGuestUpdateProxies(dt);
      updateDamageSmoke(dt);
      return;
    }

    // Update Friendly Wingman (#2) of the player's 2-plane team
    updateFriendlyWingman(dt);
    updateDorsalGunners(dt);

    // Heavy-damage smoke trails for the player and the wingman (enemies emit in their own update below)
    if (airplaneGroup && airplaneGroup.visible && !state.isCrashed && state.playerMaxHp > 0) {
      emitDamageSmoke(playerSmokeEmitter, airplaneGroup.position, airplaneGroup.quaternion, state.playerHp / state.playerMaxHp, dt);
    }
    for (const fwSmoke of getFriendlyAllies()) {
      if (fwSmoke.isAlive && !fwSmoke.takenOver) {
        emitDamageSmoke(fwSmoke, fwSmoke.currentPos, fwSmoke.group.quaternion, fwSmoke.hp / fwSmoke.maxHp, dt);
      }
    }
    updateDamageSmoke(dt);

    // 1. Milestone 1.3: Coordinated 2-Plane Team Detection & Max 2 Attackers Rule — per target.
    //    Enemies can go after the player OR the friendly wingman; each target draws at most
    //    MAX_CONCURRENT_ATTACKERS (2) attackers, and teams engage whichever target is closest.
    if (airplaneGroup) {
      // Disengage attackers whose target is gone (crashed / shot down / landed) or out of range
      for (let ep of enemyPlanes) {
        if (ep.isAlive && ep.aiState === 'attack') {
          const tgt = getEnemyTarget(ep.attackTarget);
          if (!tgt || !tgt.engageable || ep.currentPos.distanceTo(tgt.pos) > ENEMY_DISENGAGE_DIST) {
            enterEnemyPatrolState(ep);
          }
        }
      }

      // Targets: the player's side, plus (Factions) every other nation's planes — each nation fights everyone
      const targetKeys = ['player', ...getFriendlyAllies().map(allyTargetKey)];
      if (true) { // every team is on its own: AI teams also hunt each other
        for (const t of enemyPlanes) {
          if (t.isAlive && !t.isDying && t.aiState !== 'takeoff') targetKeys.push('plane:' + t.id);
        }
      }
      for (const targetKey of targetKeys) {
        const tgt = getEnemyTarget(targetKey);
        if (!tgt || !tgt.engageable) continue;

        let activeAttackers = enemyPlanes.filter(e => e.isAlive && e.aiState === 'attack' && e.attackTarget === targetKey);

        // If more than MAX_CONCURRENT_ATTACKERS (2) somehow exist, demote farthest back to patrol
        if (activeAttackers.length > MAX_CONCURRENT_ATTACKERS) {
          activeAttackers.sort((a, b) => a.currentPos.distanceTo(tgt.pos) - b.currentPos.distanceTo(tgt.pos));
          for (let k = MAX_CONCURRENT_ATTACKERS; k < activeAttackers.length; k++) {
            enterEnemyPatrolState(activeAttackers[k]);
          }
          activeAttackers.length = MAX_CONCURRENT_ATTACKERS;
        }

        // If only 1 plane is attacking this target and its 2-plane team partner is ready & in range, bring its partner in FIRST so the 2-plane team fights as a pair!
        if (activeAttackers.length === 1) {
          const partner = activeAttackers[0].partner;
          if (partner && partner.isAlive && (partner.aiState === 'patrol' || (partner.aiState === 'climb' && partner.currentPos.y > 110))) {
            if (partner.currentPos.distanceTo(tgt.pos) <= ENEMY_DISENGAGE_DIST) {
              partner.aiState = 'attack';
              partner.attackTarget = targetKey;
              partner.breakOffTimer = 0;
              activeAttackers.push(partner);
            }
          }
        }

        // Slot still open: engage the closest ready 2-Plane Team (Lead #1 + Wingman #2) within ENEMY_DETECT_DIST of this target
        if (activeAttackers.length < MAX_CONCURRENT_ATTACKERS) {
          const teamCandidates = [];
          for (let team of enemyTeams) {
            if (tgt.sideKey && team.sideKey === tgt.sideKey) continue; // never attack its own side
            let bestDist = Infinity;
            const readyMembers = [];
            for (let m of team.members) {
              if (!m.isAlive || m.aiState === 'attack') continue;
              const canEngage = (m.aiState === 'patrol') || (m.aiState === 'climb' && m.currentPos.y > 110);
              if (!canEngage) continue;
              const d = m.currentPos.distanceTo(tgt.pos);
              if (d < bestDist) bestDist = d;
              readyMembers.push(m);
            }
            if (readyMembers.length > 0 && bestDist <= ENEMY_DETECT_DIST) {
              teamCandidates.push({ team, readyMembers, bestDist });
            }
          }

          teamCandidates.sort((a, b) => a.bestDist - b.bestDist);
          for (let tc of teamCandidates) {
            if (activeAttackers.length >= MAX_CONCURRENT_ATTACKERS) break;
            // Engage Lead #1 and Wingman #2 together as a 2-plane element (capped strictly at MAX_CONCURRENT_ATTACKERS = 2)
            for (let m of tc.readyMembers) {
              if (activeAttackers.length >= MAX_CONCURRENT_ATTACKERS) break;
              m.aiState = 'attack';
              m.attackTarget = targetKey;
              m.breakOffTimer = 0;
              activeAttackers.push(m);
            }
            const def = AIRCRAFT_DEFS[tc.team.planeId] || AIRCRAFT_DEFS.mustang;
            if (targetKey.startsWith('plane:')) break; // AI vs AI fights need no warning banner
            showCombatBanner(targetKey === 'player'
              ? `⚠️ 2-PLANE ${def.shortName} ELEMENT DETECTED YOU & IS ATTACKING! (${activeAttackers.length}/2 ENGAGED)`
              : `⚠️ 2-PLANE ${def.shortName} ELEMENT IS ATTACKING YOUR WINGMAN! (${activeAttackers.length}/2 ENGAGED)`, false);
            break;
          }
        }
      }
    }

    // 2. Step Each Enemy Plane's Flight, Echelon Formation, Takeoff, Attack & Hidden Barrel Heating
    for (let i = 0; i < enemyPlanes.length; i++) {
      const ep = enemyPlanes[i];
      // Online: a remote player's aircraft follows that player's own device
      if (ep.remote) { updateRemoteProxy(ep, dt); continue; }
      if (ep.aiState === 'remote') continue; // idle slot (player left, bots off)

      // Spin propeller continuously
      if (ep.modelData && ep.modelData.propellers) {
        const propSpd = ep.isAlive ? (ep.aiState === 'takeoff' && ep.takeoffDelay > 0 ? 35 : 82) : 22;
        for (let p of ep.modelData.propellers) {
          p.rotation.z += propSpd * dt;
        }
      }

      if (ep.isAlive) {
        let wantsToFire = false;
        const hasActiveLead = (
          ep.role === 'wingman' &&
          ep.partner &&
          ep.partner.isAlive &&
          !ep.partner.isDying &&
          ep.partner.airfieldIndex === ep.airfieldIndex
        );

        if (ep.aiState === 'takeoff') {
          // --- PHASE A: STAGGERED 2-PLANE ELEMENT RUNWAY ROLL & TAKEOFF ---
          const af = AIRPORTS[ep.airfieldIndex] || AIRPORTS[1];
          const headingRad = THREE.MathUtils.degToRad(af.spawnHeading);

          if (ep.takeoffDelay > 0) {
            ep.takeoffDelay -= dt;
          } else {
            // Accelerate down the runway alongside partner
            ep.currentSpeedKmh = Math.min(ep.cruiseSpeedKmh, ep.currentSpeedKmh + 65 * dt);
            ep.speedMs = (ep.currentSpeedKmh * 1000) / 3600;

            const fwd = new THREE.Vector3(Math.sin(headingRad), 0, Math.cos(headingRad));
            ep.velocity.copy(fwd).multiplyScalar(ep.speedMs);
            ep.currentPos.addScaledVector(ep.velocity, dt);
            ep.currentPos.y = af.elevation + 1.5;
            ep.group.position.copy(ep.currentPos);

            const takeoffSpd = ep.def.takeoffSpeed || 115;
            const pitchUp = ep.currentSpeedKmh >= takeoffSpd * 0.85 ? -0.16 : 0;
            const euler = new THREE.Euler(pitchUp, headingRad, 0, 'YXZ');
            ep.group.quaternion.setFromEuler(euler);
            ep.headingDeg = af.spawnHeading;

            if (ep.currentSpeedKmh >= takeoffSpd) {
              ep.aiState = 'climb';
            }
          }
        } else if (
          ep.role === 'wingman' &&
          ep.partner &&
          ep.partner.isAlive &&
          !ep.partner.isDying &&
          (ep.partner.aiState === 'climb' || ep.partner.aiState === 'patrol') &&
          ep.aiState !== 'attack'
        ) {
          // --- MILESTONE 1.2: WINGMAN (#2) ECHELON FORMATION FLYING ---
          // Hold realistic combat echelon formation (+26m right, +3.0m above, -32m behind Lead #1)
          const lead = ep.partner;
          ep.aiState = lead.aiState;

          if (ep.gearPos > 0) {
            ep.gearPos = Math.max(0, ep.gearPos - 0.50 * dt);
            if (ep.modelData && ep.modelData.setGearDeployment) {
              ep.modelData.setGearDeployment(ep.gearPos);
            }
          }

          // Slots alternate right/left of the Lead, stepping further out and back (slot 1: +26/-32, slot 2: -26/-32, slot 3: +52/-64 ...)
          const echelonRank = Math.ceil((ep.slot || 1) / 2);
          const echelonSide = ((ep.slot || 1) % 2 === 1) ? 1 : -1;
          const echelonOffset = new THREE.Vector3(26 * echelonRank * echelonSide, 3.0 * echelonRank, -32 * echelonRank).applyQuaternion(lead.group.quaternion);
          const desiredPos = lead.currentPos.clone().add(echelonOffset);
          const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(desiredPos.x, desiredPos.z));
          desiredPos.y = Math.max(groundY + 18, desiredPos.y);

          const prevPos = ep.currentPos.clone();
          ep.currentPos.lerp(desiredPos, Math.min(1.0, 4.8 * dt));
          if (dt > 0.0001) {
            ep.velocity.copy(ep.currentPos).sub(prevPos).divideScalar(dt);
          }
          ep.speedMs = ep.velocity.length();
          ep.currentSpeedKmh = lead.currentSpeedKmh;
          ep.group.position.copy(ep.currentPos);
          ep.group.quaternion.slerp(lead.group.quaternion, Math.min(1.0, 5.5 * dt));
          ep.headingDeg = lead.headingDeg;
          ep.phase = lead.phase;
        } else if (ep.aiState === 'climb') {
          // --- PHASE B: GEAR RETRACTION & CLIMB-OUT TO PATROL ALTITUDE (Lead #1 or Promoted Wingman) ---
          if (ep.gearPos > 0) {
            ep.gearPos = Math.max(0, ep.gearPos - 0.50 * dt);
            if (ep.modelData && ep.modelData.setGearDeployment) {
              ep.modelData.setGearDeployment(ep.gearPos);
            }
          }

          ep.currentSpeedKmh = Math.min(ep.cruiseSpeedKmh, ep.currentSpeedKmh + 48 * dt);
          ep.speedMs = (ep.currentSpeedKmh * 1000) / 3600;

          const climbTarget = new THREE.Vector3(ep.centerX, ep.baseAlt, ep.centerZ);
          const toTarget = climbTarget.clone().sub(ep.currentPos);
          if (toTarget.lengthSq() < 10000) {
            toTarget.set(0, 60, 200);
          }
          toTarget.y = Math.max(toTarget.y, 45);

          const dummy = new THREE.Object3D();
          dummy.position.copy(ep.currentPos);
          dummy.lookAt(ep.currentPos.clone().add(toTarget));
          ep.group.quaternion.slerp(dummy.quaternion, 1.4 * dt);

          const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(ep.group.quaternion).normalize();
          ep.velocity.copy(forwardVec).multiplyScalar(ep.speedMs);
          ep.currentPos.addScaledVector(ep.velocity, dt);
          ep.group.position.copy(ep.currentPos);

          let hdg = THREE.MathUtils.radToDeg(Math.atan2(ep.velocity.x, -ep.velocity.z));
          if (hdg < 0) hdg += 360;
          ep.headingDeg = hdg;

          if (ep.currentPos.y >= ep.baseAlt - 25) {
            enterEnemyPatrolState(ep);
          }
        } else if (ep.aiState === 'attack' && getEnemyTarget(ep.attackTarget)) {
          // --- PHASE C: INTELLIGENT WWII COMBAT AI & TACTICAL DOGFIGHT (LEAD PURSUIT, YO-YO, DEFENSIVE EVASION) ---
          // Works against whichever aircraft this enemy is attacking: the player or the friendly wingman
          const tgt = getEnemyTarget(ep.attackTarget);
          if (ep.gearPos > 0) {
            ep.gearPos = Math.max(0, ep.gearPos - 0.50 * dt);
            if (ep.modelData && ep.modelData.setGearDeployment) {
              ep.modelData.setGearDeployment(ep.gearPos);
            }
          }

          // Initialize AI tactical state variables if needed
          if (!ep.tacticalState) ep.tacticalState = 'pursuit';
          if (ep.tacticalTimer === undefined) ep.tacticalTimer = 0.0;
          if (ep.burstTimer === undefined) ep.burstTimer = 0.0;
          if (ep.burstCooldown === undefined) ep.burstCooldown = 0.0;

          // 1. Vector & Spatial Analysis relative to the target (player or wingman)
          const distToPlayer = ep.currentPos.distanceTo(tgt.pos);
          const toPlayer = tgt.pos.clone().sub(ep.currentPos);
          const dirToPlayer = toPlayer.clone().normalize();

          const forwardVec = new THREE.Vector3(0, 0, 1).applyQuaternion(ep.group.quaternion).normalize();
          const playerFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(tgt.quat).normalize();

          const botAimDot = forwardVec.dot(dirToPlayer);
          const playerToBot = ep.currentPos.clone().sub(tgt.pos);
          const dirPlayerToBot = playerToBot.clone().normalize();
          const playerAimDot = playerFwd.dot(dirPlayerToBot);
          const aspectDot = forwardVec.dot(playerFwd);

          // 2. Threat Assessment (target is on bot's six / tracking / firing)
          const isPlayerAirborne = tgt.airborne;
          const isPlayerThreatening = (isPlayerAirborne && distToPlayer < 760 && playerAimDot > 0.83 && aspectDot > -0.25);
          const isPlayerFiringAtBot = (isPlayerThreatening && tgt.firing);

          // Update tactical timer
          if (ep.tacticalTimer > 0) {
            ep.tacticalTimer -= dt;
          }

          // Anti-ramming break-off pass if closer than 85m
          if (distToPlayer < 85 && ep.breakOffTimer <= 0) {
            ep.breakOffTimer = 2.2;
            ep.tacticalState = 'extend_and_cool';
            ep.tacticalTimer = 2.4;
          }
          if (ep.breakOffTimer > 0) {
            ep.breakOffTimer -= dt;
          }

          // 3. AI Tactical Decision Tree & State Machine
          // Trigger Defensive Evasion if player gets on bot's tail
          if ((isPlayerFiringAtBot || (isPlayerThreatening && Math.random() < 0.5 * dt)) &&
              ep.tacticalState !== 'evasion' && ep.breakOffTimer <= 0) {
            ep.tacticalState = 'evasion';
            ep.tacticalTimer = 2.2 + Math.random() * 1.5;
            ep.evasionDir = Math.random() < 0.5 ? 1 : -1;
            if (ep.planeId === 'zero' || ep.planeId === 'il2') {
              ep.evasionType = 'scissors';
            } else if (ep.planeId === 'bf109') {
              ep.evasionType = (Math.random() < 0.5) ? 'spiral_climb' : 'barrel_roll';
            } else {
              ep.evasionType = (ep.currentPos.y > 200 && Math.random() < 0.45) ? 'dive_extend' : 'barrel_roll';
            }
          }

          // Trigger High Yo-Yo if closing fast at high angle (prevent overshooting the player!)
          if (ep.tacticalState === 'pursuit' && distToPlayer < 240 && botAimDot < 0.85 && ep.currentSpeedKmh > 310) {
            ep.tacticalState = 'high_yoyo';
            ep.tacticalTimer = 2.2;
          }

          // Trigger Extend & Cool if guns are jammed or overheated > 0.90
          if ((ep.weaponJammed || ep.weaponHeat > 0.90) && ep.tacticalState !== 'evasion') {
            if (ep.tacticalState !== 'extend_and_cool') {
              ep.tacticalState = 'extend_and_cool';
              ep.tacticalTimer = 2.8;
            }
          }

          // Re-evaluate State Exits
          if (ep.tacticalTimer <= 0 && (ep.tacticalState === 'evasion' || ep.tacticalState === 'high_yoyo')) {
            ep.tacticalState = 'pursuit';
          }
          if (ep.tacticalState === 'extend_and_cool' && !ep.weaponJammed && ep.weaponHeat < 0.28 && distToPlayer > 420 && ep.breakOffTimer <= 0) {
            ep.tacticalState = 'pursuit';
          }

          // 4. Dynamic Speed Target (Combat Throttle & WEP Energy Management)
          let combatTargetKmh = ep.cruiseSpeedKmh * 1.08;
          if (ep.tacticalState === 'extend_and_cool' || (ep.tacticalState === 'evasion' && ep.evasionType === 'dive_extend')) {
            combatTargetKmh = ep.cruiseSpeedKmh * 1.22; // WEP dive/extension boost
          } else if (ep.tacticalState === 'evasion' && ep.evasionType === 'scissors') {
            combatTargetKmh = ep.cruiseSpeedKmh * 0.86; // Throttle back into scissors to force overshoot
          } else if (ep.tacticalState === 'high_yoyo') {
            combatTargetKmh = ep.cruiseSpeedKmh * 0.92; // Converting kinetic speed to vertical altitude
          }

          ep.currentSpeedKmh = THREE.MathUtils.lerp(ep.currentSpeedKmh, combatTargetKmh, 2.2 * dt);
          ep.speedMs = (ep.currentSpeedKmh * 1000) / 3600;

          // 5. Lookahead Terrain Clearance Probe (Emergency Safety Priority)
          const lookaheadDist = Math.max(90, ep.speedMs * 1.8);
          const probe1 = ep.currentPos.clone().addScaledVector(forwardVec, lookaheadDist * 0.4);
          const probe2 = ep.currentPos.clone().addScaledVector(forwardVec, lookaheadDist * 0.8);
          const probe3 = ep.currentPos.clone().addScaledVector(forwardVec, lookaheadDist);
          const gh1 = Math.max(CONFIG.seaLevel, getTerrainHeight(probe1.x, probe1.z));
          const gh2 = Math.max(CONFIG.seaLevel, getTerrainHeight(probe2.x, probe2.z));
          const gh3 = Math.max(CONFIG.seaLevel, getTerrainHeight(probe3.x, probe3.z));
          const maxAheadGround = Math.max(gh1, gh2, gh3);
          const isTerrainHazard = (ep.currentPos.y < maxAheadGround + 65) || (ep.velocity.y < -12 && ep.currentPos.y < maxAheadGround + 95);

          // 6. Tactical Maneuver Steering & Aim Point Selection
          let aimPos = null;
          let desiredBank = 0;

          if (isTerrainHazard) {
            // Priority 1: Emergency Ground Pull-Up & Level Wings
            aimPos = ep.currentPos.clone().addScaledVector(forwardVec, 160);
            aimPos.y = Math.max(aimPos.y, maxAheadGround + 120);
            desiredBank = 0;
            wantsToFire = false;
          } else if (ep.tacticalState === 'evasion') {
            wantsToFire = false;
            if (ep.evasionType === 'scissors') {
              // Alternating high-G breaking bank angles
              const cycle = (3.5 - ep.tacticalTimer) * 4.2;
              desiredBank = Math.sin(cycle) * 1.25 * ep.evasionDir;
              const latDir = new THREE.Vector3(forwardVec.z, 0, -forwardVec.x).normalize();
              aimPos = ep.currentPos.clone()
                .addScaledVector(forwardVec, 110)
                .addScaledVector(latDir, Math.sin(cycle) * 85)
                .add(new THREE.Vector3(0, 15, 0));
            } else if (ep.evasionType === 'barrel_roll') {
              // Helical rolling defense around flight trajectory
              const rollProg = (3.5 - ep.tacticalTimer) * 3.8;
              desiredBank = rollProg * ep.evasionDir;
              aimPos = ep.currentPos.clone()
                .addScaledVector(forwardVec, 130)
                .add(new THREE.Vector3(Math.cos(rollProg) * 35, Math.sin(rollProg) * 35 + 20, 0));
            } else if (ep.evasionType === 'spiral_climb') {
              // High-energy climbing spiral to force pursuer stall
              desiredBank = 0.72 * ep.evasionDir;
              aimPos = ep.currentPos.clone().addScaledVector(forwardVec, 110).add(new THREE.Vector3(0, 105, 0));
            } else {
              // Dive & Extend away
              desiredBank = -0.35 * ep.evasionDir;
              aimPos = ep.currentPos.clone().addScaledVector(forwardVec, 220).add(new THREE.Vector3(0, -35, 0));
            }
          } else if (ep.tacticalState === 'high_yoyo') {
            wantsToFire = false;
            // Pitch up 35-45 deg to trade speed for tight turn radius at the top
            aimPos = ep.currentPos.clone().addScaledVector(forwardVec, 80).add(new THREE.Vector3(0, 95, 0));
            const invQuat = ep.group.quaternion.clone().invert();
            const localToPlayer = dirToPlayer.clone().applyQuaternion(invQuat);
            desiredBank = -THREE.MathUtils.clamp(localToPlayer.x * 1.5, -0.9, 0.9);
          } else if (ep.tacticalState === 'extend_and_cool' || ep.breakOffTimer > 0) {
            wantsToFire = false;
            // High-speed separation from target while guns cool down
            const runAwayDir = ep.currentPos.clone().sub(tgt.pos).normalize();
            aimPos = ep.currentPos.clone().addScaledVector(runAwayDir, 360).add(new THREE.Vector3(0, 45, 0));
            desiredBank = (ep.role === 'wingman' ? 0.35 : -0.35);
          } else {
            // Offensive Lead Pursuit
            const muzzleVel = (ep.def.weapons && ep.def.weapons.muzzleVelocity) || 780;
            const tLead = Math.min(1.35, distToPlayer / muzzleVel);
            aimPos = tgt.pos.clone();
            if (tgt.velocity) {
              aimPos.addScaledVector(tgt.velocity, tLead);
            }
            // Ballistic drop compensation so bot doesn't shoot low
            aimPos.y += 0.5 * BULLET_GRAVITY * tLead * tLead;

            // Wingman (#2) tactical pincer bracketing offset
            if (ep.role === 'wingman' && ep.partner && ep.partner.isAlive && ep.partner.aiState === 'attack' && distToPlayer > 220) {
              const playerRight = new THREE.Vector3(1, 0, 0).applyQuaternion(tgt.quat);
              aimPos.addScaledVector(playerRight, (ep.memberNumber % 2 === 0 ? 85 : -85)).add(new THREE.Vector3(0, 20, 0));
            }

            const toAim = aimPos.clone().sub(ep.currentPos);
            const dirToAim = toAim.clone().normalize();
            const invQuat = ep.group.quaternion.clone().invert();
            const localAim = dirToAim.clone().applyQuaternion(invQuat);
            desiredBank = -THREE.MathUtils.clamp(localAim.x * 1.45, -0.92, 0.92);

            // Disciplined WWII Burst Fire & Cooldown Control (Same thermal limits as player)
            const aimDot = forwardVec.dot(dirToAim);
            if (distToPlayer < 780 && aimDot > 0.948 && !ep.weaponJammed) {
              if (ep.burstCooldown > 0) {
                ep.burstCooldown -= dt;
                wantsToFire = false;
              } else {
                wantsToFire = true;
                ep.burstTimer += dt;
                const maxBurst = (ep.weaponHeat > 0.70) ? 0.40 : 0.90;
                if (ep.burstTimer >= maxBurst) {
                  ep.burstTimer = 0;
                  ep.burstCooldown = 0.35 + Math.random() * 0.35; // 0.35s - 0.7s cooling pause
                }
              }
            } else {
              ep.burstTimer = 0;
              if (ep.burstCooldown > 0) ep.burstCooldown -= dt;
              wantsToFire = false;
            }
          }

          // Safety baseline terrain clamp for target aim position
          const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(aimPos.x, aimPos.z));
          if (aimPos.y < groundY + 55) {
            aimPos.y = groundY + 55;
          }

          // 7. Dynamic Steering & Aircraft Agility Profile
          const dummy = new THREE.Object3D();
          dummy.position.copy(ep.currentPos);
          dummy.lookAt(aimPos);
          dummy.rotateZ(desiredBank);

          // Turn rate follows the plane's agility tier (via arcadePitchRate) only
          const turnAgility = (ep.def.arcadePitchRate || 2.0) * 0.74 * (ep.netSkill ? ep.netSkill.turn : 1);

          ep.group.quaternion.slerp(dummy.quaternion, Math.min(1.0, turnAgility * dt));

          // 8. Flight Trajectory Integration
          const updatedFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(ep.group.quaternion).normalize();
          ep.velocity.copy(updatedFwd).multiplyScalar(ep.speedMs);
          ep.currentPos.addScaledVector(ep.velocity, dt);
          ep.group.position.copy(ep.currentPos);

          let hdg = THREE.MathUtils.radToDeg(Math.atan2(ep.velocity.x, -ep.velocity.z));
          if (hdg < 0) hdg += 360;
          ep.headingDeg = hdg;
        } else {
          // --- PHASE D: STANDARD PATROL ORBIT / FIGURE-8 (Flight Lead #1 or Promoted Solo Wingman #2) ---
          if (ep.sideKey) updateFactionRoam(ep, dt);
          if (ep.gearPos > 0) {
            ep.gearPos = Math.max(0, ep.gearPos - 0.50 * dt);
            if (ep.modelData && ep.modelData.setGearDeployment) {
              ep.modelData.setGearDeployment(ep.gearPos);
            }
          }

          ep.currentSpeedKmh = THREE.MathUtils.lerp(ep.currentSpeedKmh, ep.cruiseSpeedKmh, 2.0 * dt);
          ep.speedMs = (ep.currentSpeedKmh * 1000) / 3600;

          const angularSpeed = ep.speedMs / ep.radius;
          ep.phase += angularSpeed * ep.dir * dt;

          let nextX, nextY, nextZ, bank;
          if (ep.pattern === 'figure8') {
            nextX = ep.centerX + Math.sin(ep.phase) * ep.radius;
            nextZ = ep.centerZ + Math.sin(ep.phase * 2.0) * (ep.radius * 0.55);
            nextY = ep.baseAlt + Math.cos(ep.phase) * 18;
            bank = Math.cos(ep.phase * 2.0) * ep.bankAngle;
          } else {
            nextX = ep.centerX + Math.cos(ep.phase) * ep.radius;
            nextZ = ep.centerZ + Math.sin(ep.phase) * ep.radius;
            nextY = ep.baseAlt + Math.sin(ep.phase * 2.0) * 12;
            bank = -ep.dir * Math.abs(ep.bankAngle);
          }

          const newPos = new THREE.Vector3(nextX, nextY, nextZ);
          if (dt > 0.0001) {
            ep.velocity.copy(newPos).sub(ep.currentPos).divideScalar(dt);
          }
          ep.currentPos.copy(newPos);
          ep.group.position.copy(ep.currentPos);

          if (ep.velocity.lengthSq() > 0.1) {
            const lookTarget = ep.currentPos.clone().add(ep.velocity);
            ep.group.lookAt(lookTarget);
            ep.group.rotateZ(bank);

            let hdg = THREE.MathUtils.radToDeg(Math.atan2(ep.velocity.x, -ep.velocity.z));
            if (hdg < 0) hdg += 360;
            ep.headingDeg = hdg;
          }
        }

        // Update Hidden Barrel Heating & Firing System (invisible to player)
        updateEnemyWeapon(ep, dt, wantsToFire);
        ep.isFiring = wantsToFire; // lets other AI nations being shot at react defensively

        // Visual Damage States: heavy grey-black trail when nearly destroyed, light puffs when damaged
        const hpRatio = ep.hp / ep.maxHp;
        if (hpRatio < DAMAGE_SMOKE_HP) {
          emitDamageSmoke(ep, ep.currentPos, ep.group.quaternion, hpRatio, dt);
        } else if (hpRatio < 0.85 || ep.engineDamaged || ep.wingDamaged) {
          ep.smokeTimer += dt;
          const smokeInterval = hpRatio < 0.45 ? 0.03 : 0.06;
          if (ep.smokeTimer >= smokeInterval) {
            ep.smokeTimer = 0;
            spawnTracerSmoke(ep.currentPos);
          }
        }
      } else if (ep.isDying) {
        // Uncontrolled Spiraling Death Dive
        ep.fallSpeed += 26 * dt;
        ep.currentPos.addScaledVector(ep.velocity, dt * 0.65);
        ep.currentPos.y -= ep.fallSpeed * dt;
        ep.group.position.copy(ep.currentPos);

        ep.group.rotateX(0.65 * dt);
        ep.group.rotateZ(2.6 * dt);

        ep.smokeTimer += dt;
        if (ep.smokeTimer >= 0.025) {
          ep.smokeTimer = 0;
          spawnTracerSmoke(ep.currentPos);
        }

        const groundY = Math.max(CONFIG.seaLevel, getTerrainHeight(ep.currentPos.x, ep.currentPos.z));
        if (ep.currentPos.y <= groundY + 1.5) {
          ep.isDying = false;
          ep.group.visible = false;
          spawnExplosionAt(ep.currentPos, 2.5);
          playExplosionSound();
        }
      } else if (!ep.permanentlyDead && ep.lives > 0) {
        // Waiting to respawn at its home base; if that base was destroyed meanwhile, it is out for good
        if (isHomeBaseDestroyed(ep)) {
          ep.lives = 0;
          ep.permanentlyDead = true;
        } else {
          ep.respawnTimer -= dt;
        }
        if (!ep.permanentlyDead && ep.respawnTimer <= 0) {
          if (ep.typeLives) {
            // Factions: every respawn rolls a new aircraft type that still has lives
            const nextRole = pickRandomRoleWithLives(ep.typeLives);
            if (nextRole) setFactionPlaneType(ep, nextRole);
          }
          ep.hp = ep.maxHp;
          ep.isAlive = true;
          ep.isDying = false;
          ep.engineDamaged = false;
          ep.wingDamaged = false;
          ep.group.visible = true;
          assignEnemyToHomeAirbase(ep);
          const af = AIRPORTS[ep.airfieldIndex];
          showCombatBanner(`🛫 ${ep.callsign} TAKING OFF FROM ${af ? af.code : 'ENEMY BASE'} (${ep.lives}/${ep.maxLives} LIVES)`, false);
        }
      }
    }
  }

  // =========================================================================
  // --- Airfield Systems (Tower Beacon Spotlights) ---
  // =========================================================================
  function updateAirfieldSystems(dt) {
    for (let af of AIRPORTS) {
      // Rotate Control Tower Beacon Spotlight (Green = Friendly, Red = Enemy)
      if (af.beaconRotor) {
        af.beaconRotor.rotation.y += 2.2 * dt;
      }
    }
  }

  // =========================================================================
  // --- Victory: every enemy aircraft is out of lives ---
  // =========================================================================
  const VICTORY_DELAY = 2.2; // s after the last enemy goes down, so its fall can be seen
  const victoryCam = { angle: 0, radius: 34 };
  const victoryCamTarget = new THREE.Vector3();

  function resetVictoryState() {
    const wasVictory = Boolean(state.isVictory);
    state.isVictory = false;
    state.victoryTimer = 0;
    state.sortieTime = 0;
    const modal = document.getElementById('victory-modal');
    if (modal) modal.classList.remove('show');
    // The HUD was hidden for the victory shot; bring it back for the next sortie
    if (wasVictory && !state.inMainMenu) {
      const hudOverlay = document.getElementById('hud-overlay');
      if (hudOverlay) hudOverlay.classList.remove('hidden');
    }
  }

  // Called every flight frame
  function checkVictory(dt) {
    if (state.netRole) return;
    if (state.isVictory || state.inMainMenu || !state.gameStarted || state.isDefeated) return;
    state.sortieTime = (state.sortieTime || 0) + dt;
    if (enemyPlanes.length === 0) return;
    const allOut = enemyPlanes.every(ep => ep.permanentlyDead && !ep.isDying);
    if (!allOut) {
      state.victoryTimer = 0;
      return;
    }
    state.victoryTimer = (state.victoryTimer || 0) + dt;
    if (state.victoryTimer >= VICTORY_DELAY) showVictoryScreen();
  }

  function formatSortieTime(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function showVictoryScreen() {
    state.isVictory = true;
    clearAllFlightInputs();
    resetTouchInput();
    setFlakDangerHud(Infinity);
    if (document.exitPointerLock) document.exitPointerLock();

    // Silence the engine; the fanfare plays over the frozen battlefield
    try {
      if (engineGain && audioCtx) engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
      if (windGain && audioCtx) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
      if (warningGain && audioCtx) warningGain.gain.setValueAtTime(0, audioCtx.currentTime);
    } catch (e) {}
    playVictoryFanfare();

    const crashModal = document.getElementById('crash-modal');
    if (crashModal) crashModal.style.display = 'none';
    const hudOverlay = document.getElementById('hud-overlay');
    if (hudOverlay) hudOverlay.classList.add('hidden');
    const promptOverlay = document.getElementById('pointer-lock-prompt');
    if (promptOverlay) promptOverlay.classList.add('hidden');
    closeSettings();

    // Start the orbit from where the camera already is
    if (airplaneGroup && camera) {
      victoryCam.angle = Math.atan2(camera.position.x - airplaneGroup.position.x, camera.position.z - airplaneGroup.position.z);
    }

    const enemyBases = AIRPORTS.filter(a => a.team === 'enemy' || a.isDestroyed);
    const basesDestroyed = enemyBases.filter(a => a.isDestroyed).length;
    const livesLeft = state.aircraftLives[state.selectedAircraft] || 0;
    const def = activeAircraftDef || AIRCRAFT_DEFS[state.selectedAircraft];

    const sub = document.getElementById('victory-sub');
    if (sub) {
      if (isFactionsMatch()) {
        const rivals = state.factionMatch.aiNations.map(n => FACTIONS[n].name).join(', ');
        sub.textContent = `${rivals} — all three rival nations are out of the fight. The archipelago airspace belongs to ${FACTIONS[state.factionMatch.playerNation].name}, led by ${state.pilotName || 'MAVERICK'}.`;
      } else {
        sub.textContent = `All ${enemyPlanes.length} enemy aircraft have been eliminated. The archipelago airspace belongs to ${state.pilotName || 'MAVERICK'}'s squadron.`;
      }
    }
    const debrief = document.getElementById('victory-debrief');
    if (debrief) {
      debrief.innerHTML = `
        <div class="debrief-grid">
          <div class="debrief-item"><span class="debrief-label">PILOT</span><span class="debrief-val">${state.pilotName || 'MAVERICK'}</span></div>
          <div class="debrief-item"><span class="debrief-label">AIRCRAFT</span><span class="debrief-val">${def ? def.shortName : 'FIGHTER'}${state.isFlyingWingman ? ' (WING #2)' : ''}</span></div>
          <div class="debrief-item"><span class="debrief-label">YOUR KILLS</span><span class="debrief-val" style="color:#fde047;">${state.sortieKills || 0}</span></div>
          <div class="debrief-item"><span class="debrief-label">ENEMY AIRCRAFT</span><span class="debrief-val">${enemyPlanes.length}/${enemyPlanes.length} DOWN</span></div>
          <div class="debrief-item"><span class="debrief-label">BASES BOMBED</span><span class="debrief-val">${basesDestroyed}/${enemyBases.length}</span></div>
          <div class="debrief-item"><span class="debrief-label">LIVES LEFT</span><span class="debrief-val" style="color:#fbbf24;">${'♥'.repeat(livesLeft)}${'♡'.repeat(Math.max(0, state.maxLivesPerPlane - livesLeft))}</span></div>
          <div class="debrief-item"><span class="debrief-label">FLIGHT TIME</span><span class="debrief-val">${formatSortieTime(state.sortieTime)}</span></div>
          <div class="debrief-item"><span class="debrief-label">RESULT</span><span class="debrief-val" style="color:#22c55e;">VICTORY</span></div>
        </div>
      `;
    }
    const newBtn = document.getElementById('victory-new-btn');
    if (newBtn) newBtn.textContent = touchControlsActive() ? 'DEPLOY NEW SORTIE' : 'DEPLOY NEW SORTIE (R)';

    const modal = document.getElementById('victory-modal');
    if (modal) modal.classList.add('show');
  }

  // Slow cinematic orbit around the player's aircraft behind the victory screen
  function updateVictoryCamera(dt) {
    if (!camera) return;
    const focus = airplaneGroup ? airplaneGroup.position : null;
    if (!focus) return;
    victoryCam.angle += 0.22 * dt;
    victoryCamTarget.set(
      focus.x + Math.sin(victoryCam.angle) * victoryCam.radius,
      focus.y + 9,
      focus.z + Math.cos(victoryCam.angle) * victoryCam.radius
    );
    // Glide out from the chase camera into the orbit instead of snapping
    camera.position.lerp(victoryCamTarget, Math.min(1, 1.8 * dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(focus);
    if (Math.abs(camera.fov - getFovSetting('flightFov')) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, getFovSetting('flightFov'), Math.min(1, 4 * dt));
      camera.updateProjectionMatrix();
    }
  }

  function playVictoryFanfare() {
    if (!state.soundEnabled || !audioCtx || !state.audioInitialized) return;
    try {
      const now = audioCtx.currentTime;
      // Rising bugle call: C5 E5 G5 ... C6 held
      const notes = [[523.25, 0, 0.18], [659.25, 0.2, 0.18], [783.99, 0.4, 0.18], [1046.5, 0.62, 0.9]];
      for (const [freq, start, len] of notes) {
        for (const [type, vol, detune] of [['triangle', 0.22, 0], ['square', 0.05, 4]]) {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, now + start);
          osc.detune.setValueAtTime(detune, now + start);
          g.gain.setValueAtTime(0.0001, now + start);
          g.gain.exponentialRampToValueAtTime(vol, now + start + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + start + len);
          osc.connect(g);
          g.connect(audioCtx.destination);
          osc.start(now + start);
          osc.stop(now + start + len + 0.05);
        }
      }
    } catch (e) {}
  }

  // Factions crash screen: one button per aircraft type of the player's nation (locked when out of lives)
  function renderCrashPicker() {
    const box = document.getElementById('crash-picker');
    if (!box || !isFactionsMatch()) return;
    const nat = FACTIONS[state.factionMatch.playerNation];
    box.innerHTML = '';
    box.style.display = 'flex';
    box.style.setProperty('--team', nat.color);
    FACTION_ROLES.forEach((role, i) => {
      const planeId = nat.planes[role];
      const def = AIRCRAFT_DEFS[planeId];
      const lives = state.aircraftLives[planeId] || 0;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crash-pick' + (planeId === state.pendingRespawnPlane ? ' selected' : '') + (lives <= 0 ? ' locked' : '');
      btn.disabled = lives <= 0;
      btn.innerHTML = `
        <span class="pick-key">${i + 1}</span>
        <span class="pick-role">${FACTION_ROLE_LABEL[role]}</span>
        <span class="pick-name">${def.shortName}</span>
        <span class="pick-lives">${formatLivesText(lives, state.maxLivesPerPlane)}</span>
        <span class="pick-meta">BOMBS ${def.bombRack.length}${def.dorsalGunner ? ' &bull; REAR GUNNER' : ''}</span>`;
      btn.addEventListener('click', () => {
        if (lives <= 0) return;
        state.pendingRespawnPlane = planeId;
        renderCrashPicker();
      });
      box.appendChild(btn);
    });
  }

  function pickCrashAircraftByIndex(i) {
    if (!state.isCrashed || !isFactionsMatch()) return;
    const role = FACTION_ROLES[i];
    const planeId = role && FACTIONS[state.factionMatch.playerNation].planes[role];
    if (planeId && (state.aircraftLives[planeId] || 0) > 0 && state.pendingRespawnPlane !== undefined) {
      state.pendingRespawnPlane = planeId;
      renderCrashPicker();
    }
  }

  // --- Crash Event ---
  function triggerCrash(reason) {
    if (state.isCrashed) return;
    state.isCrashed = true;

    // Release pointer lock so user can interact with modal buttons
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }

    // Decrement 1 life from the current player aircraft (each plane has 3 lives)
    const curPlane = state.selectedAircraft;
    if (state.aircraftLives[curPlane] !== undefined && state.aircraftLives[curPlane] > 0) {
      state.aircraftLives[curPlane]--;
    }
    // Online: a destroyed home base means no more respawns for this player
    if (state.netRole && AIRPORTS[state.currentAirfield] && AIRPORTS[state.currentAirfield].isDestroyed) {
      for (const k of Object.keys(state.aircraftLives)) state.aircraftLives[k] = 0;
    }
    const remLives = state.aircraftLives[curPlane] || 0;
    updateAircraftUI();

    const wingmanAvailable = Boolean(
      !state.isFlyingWingman &&
      friendlyWingman &&
      friendlyWingman.isAlive &&
      !friendlyWingman.isDying &&
      friendlyWingman.lives > 0 &&
      !friendlyWingman.takenOver
    );

    const crashModal = document.getElementById('crash-modal');
    const crashTitle = document.getElementById('crash-title');
    const crashBadge = document.getElementById('crash-badge');
    const crashReason = document.getElementById('crash-reason');
    const crashDebrief = document.getElementById('crash-debrief');
    const restartBtn = document.getElementById('restart-btn');
    const crashMenuBtn = document.getElementById('crash-menu-btn');

    const crashPicker = document.getElementById('crash-picker');
    if (crashPicker) crashPicker.style.display = 'none';
    // Factions: any aircraft type of the nation that still has lives can be flown next
    const factionTypesLeft = isFactionsMatch()
      ? FACTION_ROLES.filter(r => (state.aircraftLives[FACTIONS[state.factionMatch.playerNation].planes[r]] || 0) > 0)
      : [];

    if (factionTypesLeft.length > 0) {
      // 0. FACTIONS: DESTROYED, BUT OTHER TYPES (OR THIS ONE) STILL HAVE LIVES — CHOOSE THE NEXT AIRCRAFT
      state.isDefeated = false;
      const nat = FACTIONS[state.factionMatch.playerNation];
      state.pendingRespawnPlane = (remLives > 0) ? curPlane : nat.planes[factionTypesLeft[0]];
      if (crashTitle) {
        crashTitle.textContent = 'AIRCRAFT DESTROYED';
        crashTitle.style.color = '#ef4444';
      }
      if (crashBadge) {
        crashBadge.textContent = '💥 COMBAT CASUALTY — CHOOSE YOUR NEXT AIRCRAFT';
        crashBadge.style.color = nat.color;
        crashBadge.style.display = 'inline-block';
      }
      if (crashReason) {
        const lost = activeAircraftDef ? activeAircraftDef.name : 'Aircraft';
        crashReason.innerHTML = `<strong>${reason}</strong><br><span style="color:#fbbf24; font-weight:bold;">${lost}: ${remLives}/${state.maxLivesPerPlane} lives left</span>`;
      }
      if (crashDebrief) crashDebrief.style.display = 'none';
      renderCrashPicker();
      if (restartBtn) {
        restartBtn.textContent = 'RESPAWN (R)';
        restartBtn.style.background = '#ef4444';
        restartBtn.style.display = 'inline-block';
      }
      if (crashMenuBtn) {
        crashMenuBtn.textContent = 'MAIN MENU';
        crashMenuBtn.style.background = 'rgba(255,255,255,0.14)';
        crashMenuBtn.style.display = 'inline-block';
      }

    } else if (remLives <= 0 && wingmanAvailable) {
      // 1. FLIGHT LEAD DOWN, WINGMAN ACTIVE
      state.isDefeated = false;
      if (crashTitle) {
        crashTitle.textContent = 'FLIGHT LEAD DESTROYED';
        crashTitle.style.color = '#38bdf8';
      }
      if (crashBadge) {
        crashBadge.textContent = '⚠️ LEAD LOST — WINGMAN ACTIVE';
        crashBadge.style.color = '#38bdf8';
        crashBadge.style.display = 'inline-block';
      }
      if (crashReason) {
        crashReason.innerHTML = `<strong>${reason}</strong><br><span style="color:#ef4444; font-weight:bold;">FLIGHT LEAD DESTROYED (0 LIVES LEFT)</span><br><span style="color:#38bdf8; font-weight:bold;">WINGMAN #2 IS STILL IN COMBAT (${friendlyWingman.lives}/${friendlyWingman.maxLives} LIVES)! TAKE OVER FLIGHT CONTROLS?</span>`;
      }
      if (crashDebrief) crashDebrief.style.display = 'none';
      if (restartBtn) {
        restartBtn.textContent = 'TAKE CONTROL OF WINGMAN #2 (R)';
        restartBtn.style.background = '#0284c7';
        restartBtn.style.display = 'inline-block';
      }
      if (crashMenuBtn) {
        crashMenuBtn.textContent = 'MAIN MENU';
        crashMenuBtn.style.display = 'inline-block';
      }

    } else if (remLives <= 0) {
      // 2. DEFEAT — BOTH LEAD AND WINGMAN DESTROYED! ALL LIVES EXPENDED!
      state.isDefeated = true;
      if (crashTitle) {
        crashTitle.textContent = 'MISSION FAILED';
        crashTitle.style.color = '#ef4444';
      }
      if (crashBadge) {
        crashBadge.textContent = '☠️ DEFEAT — SQUADRON ELIMINATED';
        crashBadge.style.color = '#ef4444';
        crashBadge.style.display = 'inline-block';
      }
      if (crashReason) {
        const whoLost = state.isFlyingWingman ? 'Wingman #2 and Flight Lead' : 'Flight Lead and Wingman';
        crashReason.innerHTML = `<strong>${reason}</strong><br><span style="color:#ef4444; font-size:15px; font-weight:bold; display:block; margin:6px 0;">SQUADRON DESTROYED — 0 LIVES REMAINING</span><span style="color:#94a3b8; font-size:12.5px;">${whoLost} have been eliminated. You have lost the sortie.</span>`;
      }
      if (crashDebrief) {
        crashDebrief.style.display = 'block';
        crashDebrief.innerHTML = `
          <div class="debrief-grid">
            <div class="debrief-item"><span class="debrief-label">PILOT</span><span class="debrief-val">${state.pilotName || 'MAVERICK'}</span></div>
            <div class="debrief-item"><span class="debrief-label">AIRCRAFT</span><span class="debrief-val">${activeAircraftDef ? activeAircraftDef.shortName : 'FIGHTER'}</span></div>
            <div class="debrief-item"><span class="debrief-label">AIR SPLASHES</span><span class="debrief-val" style="color:#fde047;">${state.sortieKills || 0}</span></div>
            <div class="debrief-item"><span class="debrief-label">RESULT</span><span class="debrief-val" style="color:#ef4444;">KIA / DEFEAT</span></div>
          </div>
        `;
      }
      if (restartBtn) {
        restartBtn.textContent = 'MAIN MENU';
        restartBtn.style.background = '#0284c7';
        restartBtn.style.display = 'inline-block';
      }
      if (crashMenuBtn) {
        crashMenuBtn.textContent = 'DEPLOY NEW SORTIE (R)';
        crashMenuBtn.style.background = 'rgba(255,255,255,0.14)';
        crashMenuBtn.style.display = 'inline-block';
      }

    } else {
      // 3. NORMAL CRASH — RESPAWN WITH REMAINING LIVES
      state.isDefeated = false;
      if (crashTitle) {
        crashTitle.textContent = 'AIRCRAFT DESTROYED';
        crashTitle.style.color = '#ef4444';
      }
      if (crashBadge) {
        crashBadge.textContent = '💥 COMBAT CASUALTY';
        crashBadge.style.color = '#f59e0b';
        crashBadge.style.display = 'inline-block';
      }
      if (crashReason) {
        const roleName = state.isFlyingWingman ? 'Wingman #2' : (activeAircraftDef ? activeAircraftDef.name : 'Aircraft');
        const hearts = '♥'.repeat(remLives) + '♡'.repeat(state.maxLivesPerPlane - remLives);
        crashReason.innerHTML = `<strong>${reason}</strong><br><span style="color:#fbbf24; font-weight:bold;">${roleName} Lives Remaining: ${remLives}/${state.maxLivesPerPlane} (${hearts})</span>`;
      }
      if (crashDebrief) crashDebrief.style.display = 'none';
      if (restartBtn) {
        restartBtn.textContent = 'RESPAWN (R)';
        restartBtn.style.background = '#ef4444';
        restartBtn.style.display = 'inline-block';
      }
      if (crashMenuBtn) {
        crashMenuBtn.textContent = 'MAIN MENU';
        crashMenuBtn.style.background = 'rgba(255,255,255,0.14)';
        crashMenuBtn.style.display = 'inline-block';
      }
    }

    // Online: out of lives = watch the rest of the match; leaving goes back to the online screen
    if (state.netRole) {
      if (state.isDefeated) {
        if (crashTitle) crashTitle.textContent = 'OUT OF THE FIGHT';
        if (crashBadge) crashBadge.textContent = '☠️ ALL YOUR LIVES ARE GONE';
        if (crashReason) crashReason.innerHTML = `<strong>${reason}</strong><br><span style="color:#94a3b8;">Your teammates may still win. You can watch until the match ends.</span>`;
        if (crashDebrief) crashDebrief.style.display = 'none';
        if (restartBtn) restartBtn.textContent = 'WATCH';
      }
      if (crashMenuBtn) crashMenuBtn.textContent = 'LEAVE ROOM';
      netOnLocalCrash(reason);
    }
    if (crashModal) crashModal.style.display = 'block';

    const debrisGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    for (let i = 0; i < 25; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: (i % 2 === 0) ? 0xef4444 : ((i % 3 === 0) ? 0xf59e0b : 0x1f2937),
      });
      const debris = new THREE.Mesh(debrisGeo, mat);
      debris.position.copy(airplaneGroup.position);
      debris.userData = {
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 50,
          Math.random() * 40 + 10,
          (Math.random() - 0.5) * 50
        ),
        life: 2.5
      };
      scene.add(debris);
      explosionParticles.push(debris);
    }
  }

  // --- Camera Systems (Smooth War Thunder Chase Cam & Free Look) ---
  function updateCamera(dt) {
    if (!airplaneGroup) return;

    const planeForward = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
    const planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(airplaneGroup.quaternion);

    const isZoomed = Boolean(state.inputs.zoom);

    if (state.cameraMode === 'chase') {
      const baseCamDist = CONFIG.camDist || 16.0;
      const baseCamHeight = CONFIG.camHeight || 4.0;
      // When zoomed with RMB, pull chase camera slightly closer over the canopy for precision gunsight framing
      const camDist = isZoomed ? baseCamDist * 0.68 : baseCamDist;
      const camHeight = isZoomed ? baseCamHeight * 0.80 : baseCamHeight;

      // When Free Look is not active, smoothly reset free look angles
      if (!state.inputs.freeLook) {
        state.freeLook.yaw = THREE.MathUtils.lerp(state.freeLook.yaw, 0, 10 * dt);
        state.freeLook.pitch = THREE.MathUtils.lerp(state.freeLook.pitch, 0, 10 * dt);
      }

      // Base direction is aircraft forward vector, gently biased towards aim direction
      const baseDir = planeForward.clone().lerp(state.mouseAim.direction, isZoomed ? 0.20 : 0.35).normalize();

      // Apply Free Look Euler rotation around the aircraft
      const euler = new THREE.Euler(state.freeLook.pitch, state.freeLook.yaw, 0, 'YXZ');
      const viewDir = baseDir.clone().applyEuler(euler);

      // Camera position sits behind viewDir
      const targetCamPos = airplaneGroup.position.clone()
        .sub(viewDir.clone().multiplyScalar(camDist))
        .add(new THREE.Vector3(0, camHeight, 0));

      camera.position.lerp(targetCamPos, 0.18);

      // High-speed dive and high-G subtle airframe buffeting
      if (state.flight.airspeed > 470 || state.flight.gLoad > 5.2) {
        const shakeMag = Math.max(0, (state.flight.airspeed - 470) / 100) * 0.09 + Math.max(0, (state.flight.gLoad - 5.2) * 0.05);
        camera.position.x += (Math.random() - 0.5) * shakeMag;
        camera.position.y += (Math.random() - 0.5) * shakeMag;
      }

      // Gun Recoil & Airframe Vibration Shake (Milestone 2)
      if (state.cameraRecoil && state.cameraRecoil.intensity > 0.005) {
        state.cameraRecoil.intensity = Math.max(0, state.cameraRecoil.intensity - 12.0 * dt);
        state.cameraRecoil.time += dt * 55;
        const rMag = state.cameraRecoil.intensity;
        const jx = (Math.sin(state.cameraRecoil.time * 2.3) + (Math.random() - 0.5) * 0.9) * 0.055 * rMag;
        const jy = (Math.cos(state.cameraRecoil.time * 2.7) + (Math.random() - 0.5) * 0.9) * 0.055 * rMag;
        const jz = ((Math.random() - 0.5) * 0.06) * rMag;
        camera.position.x += jx;
        camera.position.y += jy;
        camera.position.z += jz;
      }

      // Look ahead of aircraft along gunsight line
      // While free-looking, keep the aircraft centred on screen so it can be inspected;
      // the look-ahead fades back in as the free look angles return to zero.
      const freeLookBlend = THREE.MathUtils.clamp((Math.abs(state.freeLook.yaw) + Math.abs(state.freeLook.pitch)) / 0.25, 0, 1);
      const lookAheadDist = (isZoomed ? 120 : 40) * (1 - freeLookBlend);
      const targetLook = airplaneGroup.position.clone().add(viewDir.clone().multiplyScalar(lookAheadDist));
      camera.lookAt(targetLook);

      // Subtle dynamic camera banking
      const targetUp = new THREE.Vector3(0, 1, 0).lerp(planeUp, 0.22);
      camera.up.lerp(targetUp, 0.15);
    } else if (state.cameraMode === 'cockpit') {
      const baseOffset = (CONFIG.cockpitOffset || new THREE.Vector3(0, 1.0, 0.5));
      const cockpitOffset = baseOffset.clone().applyQuaternion(airplaneGroup.quaternion);
      camera.position.copy(airplaneGroup.position).add(cockpitOffset);

      // Gun Recoil Vibration in Cockpit (Pilot canopy rattling)
      if (state.cameraRecoil && state.cameraRecoil.intensity > 0.005) {
        state.cameraRecoil.intensity = Math.max(0, state.cameraRecoil.intensity - 12.0 * dt);
        state.cameraRecoil.time += dt * 60;
        const rMag = state.cameraRecoil.intensity;
        camera.position.x += ((Math.random() - 0.5) * 0.04) * rMag;
        camera.position.y += ((Math.random() - 0.5) * 0.04) * rMag;
      }

      const forwardTarget = airplaneGroup.position.clone().add(
        new THREE.Vector3(0, baseOffset.y - 0.1, 40).applyQuaternion(airplaneGroup.quaternion)
      );
      if (state.cameraRecoil && state.cameraRecoil.intensity > 0.005) {
        const rMag = state.cameraRecoil.intensity;
        forwardTarget.x += ((Math.random() - 0.5) * 0.20) * rMag;
        forwardTarget.y += ((Math.random() - 0.5) * 0.16) * rMag;
      }
      camera.lookAt(forwardTarget);
      camera.up.copy(planeUp);
    } else if (state.cameraMode === 'flyby') {
      camera.lookAt(airplaneGroup.position);
    }

    // Target Gunsight Zoom (RMB / Z) & WEP FOV Transition across all camera modes
    const targetFov = getFlightTargetFov(isZoomed);
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 11 * dt);
      camera.updateProjectionMatrix();
    }
  }

  // --- 2D Screen Space Projection Helper for Dual Reticles ---
  function toScreenCoords(pos3D, cam) {
    const camForward = new THREE.Vector3();
    cam.getWorldDirection(camForward);
    const toPoint = pos3D.clone().sub(cam.position);
    if (camForward.dot(toPoint) <= 0.1) {
      return { x: 0, y: 0, visible: false };
    }

    const v = pos3D.clone().project(cam);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      visible: true
    };
  }

  // --- HUD & Instruments Update ---
  const elWtSpeed = document.getElementById('wt-speed');
  const elWtAlt = document.getElementById('wt-alt');
  const elWtThrottle = document.getElementById('wt-throttle');
  const elWtGLoad = document.getElementById('wt-gload');
  const elWtVsi = document.getElementById('wt-vsi');
  const elWtFlaps = document.getElementById('wt-flaps');
  const elWtGunHeat = document.getElementById('wt-gun-heat');
  const elWtWingman = document.getElementById('wt-wingman');
  const elWtBases = document.getElementById('wt-bases');
  const elWtTargets = document.getElementById('wt-targets');
  const elWtInstructor = document.getElementById('wt-instructor');

  const elHdg = document.getElementById('hud-heading');
  const elCardinal = document.getElementById('hud-compass-cardinal');
  const elWarning = document.getElementById('warning-banner');

  const elAimReticle = document.getElementById('mouse-aim-reticle');
  const elCrosshair = document.getElementById('aircraft-crosshair');
  const elCrosshairHeatFill = document.getElementById('crosshair-heat-fill');
  const elLeadLine = document.getElementById('reticle-lead-line');

  function updateHUD() {
    const f = state.flight;

    // 1. War Thunder Top-Left Telemetry
    if (elWtSpeed) elWtSpeed.textContent = Math.round(f.airspeed);
    if (elWtAlt) elWtAlt.textContent = Math.round(f.altitudeMSL);

    if (elWtThrottle) {
      const wep = f.wep;
      if (f.isWEP) {
        const secsLeft = Math.ceil(wep ? wep.durationLeft : 0);
        elWtThrottle.textContent = `WEP ${secsLeft}s`;
        elWtThrottle.classList.add('wt-wep');
      } else if (wep && wep.cooldownTimer > 0) {
        const cdSecs = Math.ceil(wep.cooldownTimer);
        const thrVal = Math.round(f.throttle * 100);
        elWtThrottle.innerHTML = `${thrVal} % <span class="wt-wep-cd">[CD ${cdSecs}s]</span>`;
        elWtThrottle.classList.remove('wt-wep');
      } else {
        elWtThrottle.textContent = Math.round(f.throttle * 100) + ' %';
        elWtThrottle.classList.remove('wt-wep');
      }
    }

    // Dynamic G-Load Telemetry
    if (elWtGLoad) {
      const gVal = (f.gLoad || 1.0).toFixed(1);
      elWtGLoad.textContent = gVal;
      elWtGLoad.classList.remove('wt-g-high', 'wt-g-extreme');
      if (f.gLoad >= 5.0) {
        elWtGLoad.classList.add('wt-g-extreme');
      } else if (f.gLoad >= 3.2) {
        elWtGLoad.classList.add('wt-g-high');
      }
    }

    // Vertical Speed Indicator (Climb / Dive rate)
    if (elWtVsi) {
      const vsi = Math.round(f.verticalSpeed);
      elWtVsi.textContent = (vsi >= 0 ? '+' : '') + vsi;
      if (vsi >= 0) {
        elWtVsi.style.color = '#38bdf8';
      } else if (vsi < -16) {
        elWtVsi.style.color = '#ef4444';
      } else {
        elWtVsi.style.color = '#f59e0b';
      }
    }

    if (elWtFlaps) elWtFlaps.textContent = state.flaps.toUpperCase();

    if (elWtInstructor) {
      if (f.instructorActive) {
        elWtInstructor.classList.add('active');
      } else {
        elWtInstructor.classList.remove('active');
      }
    }

    // Gun Heat & Convergence Telemetry
    if (elWtGunHeat) {
      const heatPercent = Math.round(state.weapons.heat * 100);
      if (state.weapons.isJammed) {
        elWtGunHeat.textContent = `JAMMED (${heatPercent}%)`;
        elWtGunHeat.style.color = '#ef4444';
        elWtGunHeat.style.fontWeight = 'bold';
      } else if (state.weapons.heat > 0.8) {
        elWtGunHeat.textContent = `OVERHEAT ${heatPercent}%`;
        elWtGunHeat.style.color = '#ef4444';
        elWtGunHeat.style.fontWeight = 'bold';
      } else if (state.weapons.heat > 0.5) {
        elWtGunHeat.textContent = `WARM ${heatPercent}%`;
        elWtGunHeat.style.color = '#f59e0b';
        elWtGunHeat.style.fontWeight = 'normal';
      } else if (state.weapons.heat > 0.05) {
        elWtGunHeat.textContent = `${heatPercent}%`;
        elWtGunHeat.style.color = '#38bdf8';
        elWtGunHeat.style.fontWeight = 'normal';
      } else {
        elWtGunHeat.textContent = 'READY';
        elWtGunHeat.style.color = '#22c55e';
        elWtGunHeat.style.fontWeight = 'normal';
      }
    }

    // Bomb Ordnance Telemetry & HUD Button
    const elWtBombs = document.getElementById('wt-bombs');
    if (elWtBombs && state.bombs) {
      if (state.bombs.count >= 2) {
        elWtBombs.textContent = `${state.bombs.count}/${state.bombs.maxCount} [B]`;
        elWtBombs.style.color = '#38bdf8';
      } else if (state.bombs.count === 1) {
        elWtBombs.textContent = `${state.bombs.count}/${state.bombs.maxCount} [B]`;
        elWtBombs.style.color = '#f59e0b';
      } else {
        elWtBombs.textContent = `0/${state.bombs.maxCount} EMPTY`;
        elWtBombs.style.color = '#ef4444';
      }
    }

    const btnBomb = document.getElementById('btn-bomb');
    if (btnBomb && state.bombs) {
      if (state.bombs.count > 0) {
        btnBomb.textContent = `Drop Bomb: ${state.bombs.count}/${state.bombs.maxCount} (B)`;
        btnBomb.style.borderColor = 'rgba(56, 189, 248, 0.6)';
        btnBomb.style.color = '#38bdf8';
      } else {
        btnBomb.textContent = `Bombs: 0/${state.bombs.maxCount} [Land AF]`;
        btnBomb.style.borderColor = 'rgba(239, 68, 68, 0.6)';
        btnBomb.style.color = '#ef4444';
      }
    }

    // Gunsight Barrel Heat Dynamic Arc
    if (elCrosshairHeatFill) {
      const heat = Math.min(1.0, Math.max(0.0, state.weapons.heat));
      const circumference = 113.1;
      elCrosshairHeatFill.style.strokeDashoffset = (circumference * (1.0 - heat)).toFixed(1);
      if (state.weapons.isJammed) {
        elCrosshairHeatFill.style.stroke = '#ef4444';
      } else if (heat > 0.8) {
        elCrosshairHeatFill.style.stroke = '#ef4444';
      } else if (heat > 0.5) {
        elCrosshairHeatFill.style.stroke = '#f59e0b';
      } else {
        elCrosshairHeatFill.style.stroke = '#22c55e';
      }
    }

    // 2. Heading Compass Tape
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(airplaneGroup.quaternion);
    let headingDeg = THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z));
    if (headingDeg < 0) headingDeg += 360;
    const roundedHdg = Math.round(headingDeg) % 360;
    if (elHdg) elHdg.textContent = String(roundedHdg).padStart(3, '0') + '°';

    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardIdx = Math.round(roundedHdg / 45) % 8;
    if (elCardinal) elCardinal.textContent = cardinals[cardIdx];

    // 3. War Thunder Dual Reticle System
    // Mouse Aim Target World Position (600m ahead)
    const aimWorldPos = airplaneGroup.position.clone().add(state.mouseAim.direction.clone().multiplyScalar(600));
    // Aircraft Boresight / Gunsight World Position (600m ahead)
    const noseWorldPos = airplaneGroup.position.clone().add(forward.clone().multiplyScalar(600));

    const aimScreen = toScreenCoords(aimWorldPos, camera);
    const noseScreen = toScreenCoords(noseWorldPos, camera);

    if (elAimReticle) {
      if (aimScreen.visible) {
        elAimReticle.style.display = 'block';
        elAimReticle.style.left = aimScreen.x + 'px';
        elAimReticle.style.top = aimScreen.y + 'px';
      } else {
        elAimReticle.style.display = 'none';
      }
    }

    if (elCrosshair) {
      if (noseScreen.visible) {
        elCrosshair.style.display = 'block';
        elCrosshair.style.left = noseScreen.x + 'px';
        elCrosshair.style.top = noseScreen.y + 'px';
      } else {
        elCrosshair.style.display = 'none';
      }
    }

    const elHitMarker = document.getElementById('hit-marker');
    if (elHitMarker) {
      if (noseScreen.visible) {
        elHitMarker.style.left = noseScreen.x + 'px';
        elHitMarker.style.top = noseScreen.y + 'px';
      }
    }

    // Reticle Lead Connecting Line
    if (elLeadLine) {
      if (aimScreen.visible && noseScreen.visible) {
        elLeadLine.style.display = 'block';
        elLeadLine.setAttribute('x1', noseScreen.x);
        elLeadLine.setAttribute('y1', noseScreen.y);
        elLeadLine.setAttribute('x2', aimScreen.x);
        elLeadLine.setAttribute('y2', aimScreen.y);
      } else {
        elLeadLine.style.display = 'none';
      }
    }

    // 3.5 2-Plane Team Telemetry, Friendly Wingman & Enemy Squadron 2D HUD Markers
    const alivePlanes = enemyPlanes.filter(e => !e.permanentlyDead && (e.isAlive || e.lives > 0)).length;
    const aliveBalloons = barrageBalloons.filter(b => b.isAlive).length;
    if (elWtTargets) {
      elWtTargets.textContent = `${alivePlanes}/${enemyPlanes.length} AIR · ${aliveBalloons}/${barrageBalloons.length} BLN`;
    }

    // Enemy Airfields still standing (each one keeps its teams respawning)
    if (elWtBases) {
      const enemyBaseCount = AIRPORTS.filter(a => a.team === 'enemy' || a.isDestroyed).length;
      const standing = AIRPORTS.filter(a => a.team === 'enemy' && !a.isDestroyed).length;
      elWtBases.textContent = standing > 0 ? `${standing}/${enemyBaseCount} ENEMY` : 'ALL DESTROYED';
      elWtBases.style.color = standing > 0 ? '#fca5a5' : '#fde047';
    }

    // Friendly Wingman (#2) Telemetry & 2D HUD Marker (Milestone 1.1 & 1.2)
    if (!friendlyWingman && elWtWingman) {
      elWtWingman.textContent = 'NONE (SOLO)';
      elWtWingman.style.color = '#94a3b8';
    }
    if (friendlyWingman) {
      if (elWtWingman) {
        if (friendlyWingman.takenOver) {
          elWtWingman.textContent = `YOU (SOLO)`;
          elWtWingman.style.color = '#38bdf8';
        } else {
          const fwHearts = '♥'.repeat(Math.max(0, friendlyWingman.lives)) + '♡'.repeat(Math.max(0, friendlyWingman.maxLives - friendlyWingman.lives));
          if (friendlyWingman.isAlive) {
            const fwMode = WINGMAN_STATE_LABELS[friendlyWingman.aiState] || 'PATROL';
            elWtWingman.textContent = `${fwMode} ${fwHearts}`;
            elWtWingman.style.color = '#38bdf8';
          } else if (friendlyWingman.lives > 0) {
            elWtWingman.textContent = `R/S ${fwHearts}`;
            elWtWingman.style.color = '#f59e0b';
          } else {
            elWtWingman.textContent = `DOWN ♡♡♡`;
            elWtWingman.style.color = '#ef4444';
          }
        }
      }

      if (friendlyWingman.markerEl) {
        if (friendlyWingman.isAlive && !friendlyWingman.takenOver) {
          const fwDist = airplaneGroup.position.distanceTo(friendlyWingman.currentPos);
          const fwScreen = toScreenCoords(friendlyWingman.currentPos, camera);
          if (fwScreen.visible && fwDist < 8000) {
            friendlyWingman.markerEl.style.display = 'block';
            friendlyWingman.markerEl.style.left = fwScreen.x + 'px';
            friendlyWingman.markerEl.style.top = fwScreen.y + 'px';
            if (friendlyWingman.labelEl) {
              const distStr = fwDist >= 1000 ? (fwDist / 1000).toFixed(2) + 'km' : Math.round(fwDist) + 'm';
              const fwHearts = '♥'.repeat(Math.max(0, friendlyWingman.lives)) + '♡'.repeat(Math.max(0, friendlyWingman.maxLives - friendlyWingman.lives));
              friendlyWingman.labelEl.textContent = `WING #2 ${friendlyWingman.def.shortName} ${fwHearts} ${distStr}`;
            }
            if (friendlyWingman.hpFillEl) {
              const hpPct = Math.max(0, Math.min(100, (friendlyWingman.hp / friendlyWingman.maxHp) * 100));
              friendlyWingman.hpFillEl.style.width = hpPct + '%';
            }
          } else {
            friendlyWingman.markerEl.style.display = 'none';
          }
        } else {
          friendlyWingman.markerEl.style.display = 'none';
        }
      }
    }

    // Escorts (Wingman #3 / #4) 2D markers
    for (const ally of friendlyEscorts) {
      if (!ally.markerEl) continue;
      if (!ally.isAlive || ally.takenOver) { ally.markerEl.style.display = 'none'; continue; }
      const aDist = airplaneGroup.position.distanceTo(ally.currentPos);
      const aScreen = toScreenCoords(ally.currentPos, camera);
      if (!aScreen.visible || aDist >= 8000) { ally.markerEl.style.display = 'none'; continue; }
      ally.markerEl.style.display = 'block';
      ally.markerEl.style.left = aScreen.x + 'px';
      ally.markerEl.style.top = aScreen.y + 'px';
      if (ally.labelEl) {
        const aHearts = '♥'.repeat(Math.max(0, ally.lives)) + '♡'.repeat(Math.max(0, ally.maxLives - ally.lives));
        const aDistStr = aDist >= 1000 ? (aDist / 1000).toFixed(2) + 'km' : Math.round(aDist) + 'm';
        ally.labelEl.textContent = ally.netName ? `${ally.netName} ${ally.def.shortName} ${aHearts} ${aDistStr}` : `WING #${ally.slot + 2} ${ally.def.shortName} ${aHearts} ${aDistStr}`;
      }
      if (ally.hpFillEl) ally.hpFillEl.style.width = Math.max(0, Math.min(100, (ally.hp / ally.maxHp) * 100)) + '%';
    }

    for (let ep of enemyPlanes) {
      if (ep.isAlive) {
        const dist = airplaneGroup.position.distanceTo(ep.currentPos);
        const epScreen = toScreenCoords(ep.currentPos, camera);

        if (ep.markerEl) {
          if (epScreen.visible && dist < 9000) {
            ep.markerEl.style.display = 'block';
            ep.markerEl.style.left = epScreen.x + 'px';
            ep.markerEl.style.top = epScreen.y + 'px';

            if (ep.labelEl) {
              const distStr = dist >= 1000 ? (dist / 1000).toFixed(2) + 'km' : Math.round(dist) + 'm';
              const livesHearts = '♥'.repeat(Math.max(0, ep.lives)) + '♡'.repeat(Math.max(0, ep.maxLives - ep.lives));
              const stateTag = ep.aiState === 'attack'
                ? (ep.tacticalState === 'evasion' ? '⚠️EVADE' : (ep.tacticalState === 'high_yoyo' ? '⚡YO-YO' : (ep.tacticalState === 'extend_and_cool' ? '❄️COOL' : (ep.attackTarget === 'player' ? '⚔️ATK' : (String(ep.attackTarget).startsWith('plane:') ? '⚔️AI' : '⚔️→WING')))))
                : (ep.aiState === 'takeoff' ? '🛫T/O' : (ep.aiState === 'climb' ? '↗️CLB' : ep.def.badge));
              ep.labelEl.textContent = `${ep.callsign || ep.def.shortName} [${stateTag}] ${livesHearts} ${distStr}`;
            }
            if (ep.hpFillEl) {
              const hpPct = Math.max(0, Math.min(100, (ep.hp / ep.maxHp) * 100));
              ep.hpFillEl.style.width = hpPct + '%';
            }
          } else {
            ep.markerEl.style.display = 'none';
          }
        }

        // Ballistic Deflection Lead Indicator (within 1300m when enabled via [L])
        if (ep.leadEl) {
          if (state.showLeadIndicator && dist < 1300) {
            const muzzleVel = (activeAircraftDef && activeAircraftDef.weapons && activeAircraftDef.weapons.muzzleVelocity) || 800;
            const tFlight = dist / muzzleVel;
            // Lead point accounts for target velocity and own inherited aircraft velocity
            const mySpeedMs = (state.flight.airspeed * 1000) / 3600;
            const ownVel = (f.velocity && f.velocity.lengthSq() > 1) ? f.velocity : forward.clone().multiplyScalar(mySpeedMs);
            const relVel = ep.velocity.clone().sub(ownVel);
            const leadWorldPos = ep.currentPos.clone().addScaledVector(relVel, tFlight);

            // Residual gravity compensation:
            // Guns are harmonized to cancel gravity drop at 600m.
            // Beyond 600m, lead circle lifts slightly; within 600m it dips slightly, so putting crosshair in circle hits dead center!
            const tConv = 600 / muzzleVel;
            const residualDrop = 0.5 * BULLET_GRAVITY * tFlight * (tFlight - tConv);
            leadWorldPos.y += residualDrop;

            const leadScreen = toScreenCoords(leadWorldPos, camera);
            if (leadScreen.visible) {
              ep.leadEl.style.display = 'block';
              ep.leadEl.style.left = leadScreen.x + 'px';
              ep.leadEl.style.top = leadScreen.y + 'px';
            } else {
              ep.leadEl.style.display = 'none';
            }
          } else {
            ep.leadEl.style.display = 'none';
          }
        }
      } else {
        if (ep.markerEl) ep.markerEl.style.display = 'none';
        if (ep.leadEl) ep.leadEl.style.display = 'none';
      }
    }

    // 4. Warnings
    if (elWarning) {
      if (state.weapons.isJammed) {
        elWarning.style.opacity = '1';
        elWarning.textContent = '⚠️ GUNS JAMMED! COOLING DOWN... ⚠️';
      } else if (state.weapons.heat > 0.85) {
        elWarning.style.opacity = '1';
        elWarning.textContent = '⚠️ HIGH BARREL TEMPERATURE! ⚠️';
      } else if (f.gearWarning) {
        elWarning.style.opacity = '1';
        elWarning.textContent = '⚠️ GEAR NOT DOWN! PRESS (G) ⚠️';
      } else if (f.landingOverspeedWarning) {
        elWarning.style.opacity = '1';
        elWarning.textContent = `⚠️ OVERSPEED FOR LANDING (${Math.round(f.airspeed)} km/h)! SLOW DOWN (< ${f.maxLandingSpeed || 185} km/h) ⚠️`;
      } else if (f.pullUpWarning) {
        elWarning.style.opacity = '1';
        elWarning.textContent = '⚠️ PULL UP! TERRAIN ⚠️';
      } else if (f.stallWarning) {
        elWarning.style.opacity = '1';
        elWarning.textContent = '⚠️ STALL WARNING! ⚠️';
      } else {
        elWarning.style.opacity = '0';
      }
    }

    // 5. Tactical Minimap Radar
    drawMinimap(headingDeg);
  }

  // --- Tactical Minimap Radar (Scaled 4x) ---
  const minimapCanvas = document.getElementById('minimap-canvas');
  const mmCtx = minimapCanvas.getContext('2d');
  // Logical size stays 148 x 103 (CSS size); the backing store is 2x so small icons stay crisp
  const MM_W = 148;
  const MM_H = 103;
  const MM_RES = 2;
  minimapCanvas.width = MM_W * MM_RES;
  minimapCanvas.height = MM_H * MM_RES;

  // Directional aircraft arrow with a dark outline so stacked icons stay distinguishable
  function drawMinimapArrow(x, y, hdgDeg, size, color) {
    mmCtx.save();
    mmCtx.translate(x, y);
    mmCtx.rotate(THREE.MathUtils.degToRad(hdgDeg || 0));
    mmCtx.beginPath();
    mmCtx.moveTo(0, -size);
    mmCtx.lineTo(size * 0.7, size * 0.8);
    mmCtx.lineTo(0, size * 0.5);
    mmCtx.lineTo(-size * 0.7, size * 0.8);
    mmCtx.closePath();
    mmCtx.lineWidth = 1.2;
    mmCtx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
    mmCtx.stroke();
    mmCtx.fillStyle = color;
    mmCtx.fill();
    mmCtx.restore();
  }

  function drawMinimap(planeHdg) {
    const w = MM_W;
    const h = MM_H;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 1 / (30 * MAP_SCALE); // 1 pixel on minimap = 120 meters = 148 x 103 canvas framing

    mmCtx.setTransform(MM_RES, 0, 0, MM_RES, 0, 0);

    // 1. Ocean deep blue background
    mmCtx.fillStyle = '#0d253f';
    mmCtx.fillRect(0, 0, w, h);

    // 2. Semi-Transparent Boundary Border (Exact Photo Framing)
    mmCtx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    mmCtx.lineWidth = 1.5;
    mmCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // 3. Island 1: North Desert Island (Vibrant Golden Sand & Oasis)
    mmCtx.fillStyle = '#e5a842';
    mmCtx.beginPath();
    mmCtx.ellipse(cx + (-280 * MAP_SCALE) * scale, cy + (-1080 * MAP_SCALE) * scale, 1200 * MAP_SCALE * scale, 600 * MAP_SCALE * scale, 0, 0, Math.PI * 2);
    mmCtx.fill();

    // Desert Oasis Pool Marker
    mmCtx.fillStyle = '#14b8a6';
    mmCtx.beginPath();
    mmCtx.arc(cx + (-450 * MAP_SCALE) * scale, cy + (-980 * MAP_SCALE) * scale, 18 * MAP_SCALE * scale, 0, Math.PI * 2);
    mmCtx.fill();

    // 4. Island 2: Northeast Hook Island (Lush Green)
    mmCtx.lineCap = 'round';
    mmCtx.lineJoin = 'round';
    mmCtx.beginPath();
    mmCtx.lineWidth = 360 * 2 * MAP_SCALE * scale;
    mmCtx.strokeStyle = '#2f6e2b';
    mmCtx.moveTo(cx + (1755 * MAP_SCALE) * scale, cy + (-1545 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (1755 * MAP_SCALE) * scale, cy + (-800 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (1155 * MAP_SCALE) * scale, cy + (-570 * MAP_SCALE) * scale);
    mmCtx.stroke();

    // 5. Island 3: West Crescent Island (Lush Green)
    mmCtx.beginPath();
    mmCtx.lineWidth = 420 * 2 * MAP_SCALE * scale;
    mmCtx.strokeStyle = '#2f6e2b';
    mmCtx.moveTo(cx + (-1395 * MAP_SCALE) * scale, cy + (-45 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (-1620 * MAP_SCALE) * scale, cy + (705 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (-1920 * MAP_SCALE) * scale, cy + (1455 * MAP_SCALE) * scale);
    mmCtx.stroke();

    // 6. Island 4: Southeast Rocky Island (Lush Green with Mountain)
    mmCtx.beginPath();
    mmCtx.lineWidth = 420 * 2 * MAP_SCALE * scale;
    mmCtx.strokeStyle = '#2f6e2b';
    mmCtx.moveTo(cx + (630 * MAP_SCALE) * scale, cy + (1155 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (1455 * MAP_SCALE) * scale, cy + (1230 * MAP_SCALE) * scale);
    mmCtx.lineTo(cx + (2130 * MAP_SCALE) * scale, cy + (1455 * MAP_SCALE) * scale);
    mmCtx.stroke();

    // Shaded SE Mountain Range & White Peak
    mmCtx.fillStyle = '#555b68';
    mmCtx.beginPath();
    mmCtx.arc(cx + (1980 * MAP_SCALE) * scale, cy + (1380 * MAP_SCALE) * scale, 12, 0, Math.PI * 2);
    mmCtx.fill();
    mmCtx.fillStyle = '#e2e8f0';
    mmCtx.beginPath();
    mmCtx.arc(cx + (1980 * MAP_SCALE) * scale, cy + (1380 * MAP_SCALE) * scale, 5, 0, Math.PI * 2);
    mmCtx.fill();

    // Radar scan range rings (under every marker)
    mmCtx.strokeStyle = 'rgba(0, 255, 136, 0.16)';
    mmCtx.lineWidth = 1;
    mmCtx.beginPath();
    mmCtx.arc(cx, cy, 28, 0, Math.PI * 2);
    mmCtx.moveTo(cx + 54, cy);
    mmCtx.arc(cx, cy, 54, 0, Math.PI * 2);
    mmCtx.stroke();

    // 7. Draw Harbor Docks (Cyan lines matching piers in photo)
    for (let d of DOCKS) {
      const dx = cx + d.x * scale;
      const dy = cy + d.z * scale;
      const pLen = Math.max(5.0, d.pierLength * scale);
      const ex = dx + Math.sin(d.angle) * pLen;
      const ey = dy + Math.cos(d.angle) * pLen;

      if (d.isDestroyed) {
        mmCtx.strokeStyle = '#ef4444';
        mmCtx.lineWidth = 1.5;
      } else {
        mmCtx.strokeStyle = '#38bdf8';
        mmCtx.lineWidth = 2.0;
      }
      mmCtx.beginPath();
      mmCtx.moveTo(dx, dy);
      mmCtx.lineTo(ex, ey);
      mmCtx.stroke();

      if (d.isDestroyed) {
        // Red X over destroyed port
        mmCtx.strokeStyle = '#ef4444';
        mmCtx.lineWidth = 1.5;
        mmCtx.beginPath();
        mmCtx.moveTo(ex - 2.5, ey - 2.5);
        mmCtx.lineTo(ex + 2.5, ey + 2.5);
        mmCtx.moveTo(ex + 2.5, ey - 2.5);
        mmCtx.lineTo(ex - 2.5, ey + 2.5);
        mmCtx.stroke();
      } else {
        mmCtx.fillStyle = '#06b6d4';
        mmCtx.beginPath();
        mmCtx.arc(ex, ey, 1.8, 0, Math.PI * 2);
        mmCtx.fill();
      }
    }

    // 8. Draw 4 Runways (Color-coded by Team Ownership: Friendly = Green/Gold, Enemy = Red)
    const runwayLabels = [];
    for (let i = 0; i < AIRPORTS.length; i++) {
      const af = AIRPORTS[i];
      const ax = cx + af.x * scale;
      const ay = cy + af.z * scale;
      const rwW = Math.max(3.0, af.width * scale * 3.5);
      const rwL = Math.max(7.0, af.length * scale);
      const isFriendly = (af.team === 'friendly');

      mmCtx.save();
      mmCtx.translate(ax, ay);
      mmCtx.rotate(af.headingRad);

      // Black Runway line with team border glow
      mmCtx.fillStyle = af.isDestroyed ? '#1c1917' : '#111827';
      mmCtx.fillRect(-rwW / 2, -rwL / 2, rwW, rwL);

      // Runway threshold / centerline markings colored by team ownership
      if (af.isDestroyed) {
        mmCtx.fillStyle = '#7f1d1d';
      } else {
        mmCtx.fillStyle = af.nationId ? FACTIONS[af.nationId].color : af.netColorCss ? af.netColorCss : ((i === state.currentAirfield) ? '#fbbf24' : (isFriendly ? '#22c55e' : '#ef4444'));
      }
      mmCtx.fillRect(-0.8, -rwL / 2 + 1, 1.6, rwL - 2);

      if (af.isDestroyed) {
        mmCtx.strokeStyle = '#ef4444';
        mmCtx.lineWidth = 1.5;
        mmCtx.beginPath();
        mmCtx.moveTo(-rwW / 2, -rwL / 2);
        mmCtx.lineTo(rwW / 2, rwL / 2);
        mmCtx.stroke();
      }

      mmCtx.restore();

      // Label drawn last (on top of aircraft), kept inside the frame
      runwayLabels.push({
        text: af.isDestroyed ? `${af.code} [X]` : af.code,
        color: af.isDestroyed ? '#f87171' : (af.nationId ? FACTIONS[af.nationId].color : af.netColorCss ? af.netColorCss : ((i === state.currentAirfield) ? '#fde047' : (isFriendly ? '#4ade80' : '#f87171'))),
        x: ax,
        y: ay,
        gap: rwW / 2 + 3
      });
    }

    // Draw Barrage Balloons on Radar
    for (let b of barrageBalloons) {
      if (!b.isAlive) continue;
      const bx = cx + b.currentPos.x * scale;
      const by = cy + b.currentPos.z * scale;
      mmCtx.fillStyle = '#f59e0b';
      mmCtx.beginPath();
      mmCtx.arc(bx, by, 1.5, 0, Math.PI * 2);
      mmCtx.fill();
    }

    // Draw Tactical Anti-Air Defense Systems on Radar (Orange = Enemy, Green = Friendly)
    if (typeof aaDefenseSystems !== 'undefined') {
      for (let aa of aaDefenseSystems) {
        if (!aa.isAlive) continue;
        const aax = cx + aa.x * scale;
        const aay = cy + aa.z * scale;
        const isFriendly = (aa.team === 'friendly');

        mmCtx.fillStyle = aa.nationId ? FACTIONS[aa.nationId].color : (isFriendly ? '#4ade80' : '#fb923c');
        mmCtx.beginPath();
        mmCtx.moveTo(aax, aay - 1.8);
        mmCtx.lineTo(aax + 1.5, aay);
        mmCtx.lineTo(aax, aay + 1.8);
        mmCtx.lineTo(aax - 1.5, aay);
        mmCtx.closePath();
        mmCtx.fill();
      }
    }

    // Draw Enemy Non-AI Squadron Aircraft on Radar (Directional Red Triangles)
    for (let ep of enemyPlanes) {
      if (!ep.isAlive) continue;
      drawMinimapArrow(cx + ep.currentPos.x * scale, cy + ep.currentPos.z * scale, ep.headingDeg, 4.2, ep.nationId ? FACTIONS[ep.nationId].color : (net.match && ep.netTeam !== undefined) ? netTeamStyle(net.match, ep.netTeam).color : '#ef4444');
    }

    // Friendly Wingman (#2) Icon on Map (Cyan Directional Triangle; Factions: the player's nation colour)
    const allyMapColor = isFactionsMatch() ? FACTIONS[state.factionMatch.playerNation].color : '#38bdf8';
    for (const ally of friendlyEscorts) {
      if (ally.isAlive && !ally.takenOver) {
        drawMinimapArrow(cx + ally.currentPos.x * scale, cy + ally.currentPos.z * scale, ally.headingDeg, 4.2, allyMapColor);
      }
    }
    if (friendlyWingman && friendlyWingman.isAlive && !friendlyWingman.takenOver) {
      drawMinimapArrow(cx + friendlyWingman.currentPos.x * scale, cy + friendlyWingman.currentPos.z * scale, friendlyWingman.headingDeg, 4.2, allyMapColor);
    }

    // Player Aircraft Icon on Map (always on top of other aircraft)
    const playerMX = cx + airplaneGroup.position.x * scale;
    const playerMY = cy + airplaneGroup.position.z * scale;
    drawMinimapArrow(playerMX, playerMY, planeHdg, 5.5, '#00ff88');

    // Airfield code labels last: outlined text beside the runway, kept inside the frame,
    // flipped to the other side when they would cover the player icon or another label
    mmCtx.font = 'bold 7.5px monospace';
    mmCtx.textAlign = 'center';
    mmCtx.textBaseline = 'middle';
    mmCtx.lineJoin = 'round';
    const placed = [];
    const overlapsSomething = (x, y, tw) => {
      if (Math.abs(playerMX - x) < tw / 2 + 6 && Math.abs(playerMY - y) < 9) return true;
      return placed.some(p => Math.abs(p.x - x) < (p.w + tw) / 2 + 1 && Math.abs(p.y - y) < 8);
    };
    for (const lbl of runwayLabels) {
      const tw = mmCtx.measureText(lbl.text).width;
      const ly = Math.min(h - 5, Math.max(5, lbl.y));
      const candidates = [lbl.x + lbl.gap + tw / 2, lbl.x - lbl.gap - tw / 2]
        .map(x => Math.min(w - tw / 2 - 2, Math.max(tw / 2 + 2, x)));
      let lx = candidates.find(x => !overlapsSomething(x, ly, tw));
      if (lx === undefined) lx = candidates[0];
      mmCtx.lineWidth = 2.5;
      mmCtx.strokeStyle = 'rgba(2, 6, 23, 0.9)';
      mmCtx.strokeText(lbl.text, lx, ly);
      mmCtx.fillStyle = lbl.color;
      mmCtx.fillText(lbl.text, lx, ly);
      placed.push({ x: lx, y: ly, w: tw });
    }
  }

  // --- Main Animation Loop ---
  function animate() {
    requestAnimationFrame(animate);

    // Game Speed setting scales simulation time during a sortie (the menu panorama keeps real time)
    const rawDt = Math.min(clock.getDelta(), 0.1);
    const dt = state.inMainMenu ? rawDt : rawDt * settingScale('gameSpeed');

    // If the game is paused (ESC button pressed during flight), freeze the entire game immediately
    // (an online guest's menu does not freeze the shared battle; only the host can pause everyone)
    if (state.isPaused && !(state.netRole === 'guest' && !state.netHostPaused)) {
      renderer.render(scene, camera);
      return;
    }

    // Victory: the battlefield freezes while the camera circles the player's aircraft
    if (state.isVictory) {
      updateVictoryCamera(rawDt);
      renderer.render(scene, camera);
      return;
    }

    // Drift clouds within photo bounds
    for (let c of cloudMeshes) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > CONFIG.maxX) {
        c.position.x = CONFIG.minX;
      }
    }

    // While on the Main Menu, no aircraft exist: hover & spin panoramic camera around the map
    if (state.inMainMenu) {
      updateBarrageBalloons(dt);
      if (typeof updateAADefenses === 'function') updateAADefenses(dt);
      if (typeof updatePorts === 'function') updatePorts(dt);
      if (typeof updateShockwaves === 'function') updateShockwaves(dt);
      updateAirfieldSystems(dt);
      updateMenuPanoramaCamera(dt);

      if (dirLight && camera) {
        dirLight.position.set(camera.position.x + 1200, camera.position.y + 2400, camera.position.z + 1400);
        dirLight.target.position.copy(camera.position);
        dirLight.target.updateMatrixWorld();
      }

      renderer.render(scene, camera);
      return;
    }

    // Touch stick & throttle lever (phones / tablets)
    updateTouchControls(dt);

    // Physics & flight update
    updatePhysics(dt);

    // Weapons & ballistics update (Milestone 1)
    updateWeapons(dt);

    // Bombs & ordnance ballistics update
    if (typeof updateBombs === 'function') updateBombs(dt);

    // War Thunder Arcade Bomb Target Reticle update
    if (typeof updateBombReticle === 'function') updateBombReticle();

    // Anti-Air Defense Systems update
    if (typeof updateAADefenses === 'function') updateAADefenses(dt);

    // Ports & naval ships update (sinking, fire)
    if (typeof updatePorts === 'function') updatePorts(dt);

    // Bomb shockwaves and lingering smoke plumes update
    if (typeof updateShockwaves === 'function') updateShockwaves(dt);

    // Barrage Balloons update (Step 2)
    updateBarrageBalloons(dt);

    // 2-Plane Teams & Squadron update (Step 1)
    updateEnemyPlanes(dt);

    // All enemy aircraft out of lives -> victory screen (online: the host decides the winner)
    checkVictory(dt);
    netTick(dt);

    // Airfield Tower Beacon Spotlights update
    updateAirfieldSystems(dt);

    // Audio update
    updateAudio(dt);

    // Camera follow
    updateCamera(dt);
    orientFlakWarnings();

    // Dynamic directional sun tracking to maintain high-resolution shadow detail anywhere in the 17.8 km theater
    if (dirLight && airplaneGroup) {
      dirLight.position.set(airplaneGroup.position.x + 1200, airplaneGroup.position.y + 2400, airplaneGroup.position.z + 1400);
      dirLight.target.position.copy(airplaneGroup.position);
      dirLight.target.updateMatrixWorld();
    }

    // HUD instrumentation
    updateHUD();

    // Render WebGL frame
    renderer.render(scene, camera);
  }

  // =========================================================================
  // === MULTIPLAYER: online rooms (PeerJS), lobby, host-authoritative matches ===
  // The host's device runs the real battle (bots, flak, bullets, damage, bases, winner). Each guest flies its
  // own aircraft locally and streams its position to the host; everything else on a guest is drawn from the
  // host's snapshots. Damage to a guest is decided by the host and sent to that guest as a 'hit'.
  // =========================================================================
  const NET_TEAM_STYLES = [
    { name: 'BLUE', color: '#3b82f6' }, { name: 'RED', color: '#ef4444' },
    { name: 'GREEN', color: '#22c55e' }, { name: 'GOLD', color: '#facc15' }
  ];
  const NET_BOT_SKILL = { easy: { dmg: 0.6, turn: 0.8 }, normal: { dmg: 1.0, turn: 1.0 }, hard: { dmg: 1.25, turn: 1.15 } };
  const NET_SNAPSHOT_INTERVAL = 1 / 30;
  const NET_STATE_INTERVAL = 1 / 25;
  const NET_NAME_KEY = 'aerials_net_name';
  const net = {
    role: null,        // 'host' | 'guest' | null
    host: null,        // NetHost
    session: null,     // NetSession
    myId: null,        // 'host' or a guest id
    room: null,        // lobby state (owned by the host, mirrored by guests)
    match: null,       // roster of the running match
    myTeam: 0,
    selected: null,    // host: player picked for moving
    snapTimer: 0, stateTimer: 0, seq: 0,
    entIdx: new Map(), entSig: '', nextEnt: 1,
    clockOffset: null, interpDelay: 0.1, lastSnapAt: 0, jitter: 0,
    hcTimers: {},
    keepRoom: false,
    busy: false,
    lastAttacker: null
  };

  function netActive() { return Boolean(net.role); }
  function netInMatch() { return Boolean(state.netRole && net.match); }

  function netSetStatus(id, text, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'net-status' + (kind ? ' ' + kind : '');
  }

  function netTeamStyle(room, t) {
    if (room && room.mode === 'factions') {
      const nat = FACTIONS[room.nations[t]] || FACTIONS.usa;
      return { name: nat.name.toUpperCase(), color: nat.color, nation: nat.id };
    }
    return NET_TEAM_STYLES[t];
  }
  function netTeamColorHex(room, t) { return parseInt(netTeamStyle(room, t).color.slice(1), 16); }

  // A player's pick is a classic aircraft id, or a factions role ('fighter' / 'heavy' / 'bomber')
  function netPlaneFor(room, p) {
    if (room.mode === 'factions') {
      const nat = FACTIONS[room.nations[Math.max(0, p.team)]] || FACTIONS.usa;
      return nat.planes[FACTION_ROLES.includes(p.pick) ? p.pick : 'fighter'];
    }
    return AIRCRAFT_ORDER.includes(p.pick) ? p.pick : 'mustang';
  }

  function netSavedName() {
    try { return localStorage.getItem(NET_NAME_KEY) || ''; } catch (e) { return ''; }
  }
  function netReadName() {
    const input = document.getElementById('net-name');
    const name = window.AerialsNet.cleanName(input ? input.value.toUpperCase() : 'PILOT');
    if (input) input.value = name;
    try { localStorage.setItem(NET_NAME_KEY, name); } catch (e) {}
    return name;
  }

  // ---------------- Online screen: create / join ----------------
  function netSetBusy(b) {
    net.busy = b;
    ['net-create-btn', 'net-join-btn'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = b; });
  }

  async function netCreateRoom() {
    if (net.busy || net.role || !window.AerialsNet) return;
    const name = netReadName();
    netSetBusy(true);
    netSetStatus('net-status', 'Creating room…', 'busy');
    const host = new window.AerialsNet.NetHost();
    try {
      const code = await host.createRoom();
      net.role = 'host';
      net.host = host;
      net.myId = 'host';
      net.room = {
        code, phase: 'lobby', mode: 'classic', teamSize: 2, bots: 'normal', timeLimit: 0,
        nations: FACTION_ORDER.slice().sort(() => Math.random() - 0.5).slice(0, 4),
        players: [{ id: 'host', name, team: 0, pick: 'mustang', host: true, watching: false }]
      };
      host.on('join', e => netHostOnJoin(e));
      host.on('leave', e => netHostOnLeave(e));
      host.on('message', (id, msg) => netHostOnMessage(id, msg));
      host.on('error', e => { if (e.fatal) netLeave(e.text); else netSetStatus('room-status', e.text, 'error'); });
      netSetStatus('net-status', '');
      setMenuScreen('room');
      netRenderRoom();
    } catch (err) {
      try { host.close(); } catch (e) {}
      netSetStatus('net-status', (err && err.text) || 'Could not create a room.', 'error');
    }
    netSetBusy(false);
  }

  async function netJoinRoom(rawCode) {
    if (net.busy || net.role || !window.AerialsNet) return;
    const code = window.AerialsNet.cleanCode(rawCode);
    const codeInput = document.getElementById('net-code');
    if (codeInput) codeInput.value = code;
    if (code.length !== 4) { netSetStatus('net-status', 'Enter the 4-digit room code.', 'error'); return; }
    const name = netReadName();
    netSetBusy(true);
    netSetStatus('net-status', `Joining room ${code}…`, 'busy');
    const session = new window.AerialsNet.NetSession();
    try {
      const res = await session.joinRoom(code, { name });
      net.role = 'guest';
      net.session = session;
      net.myId = res.id;
      net.room = null;
      session.on('message', msg => netGuestOnMessage(msg));
      session.on('closed', e => netLeave(e.text));
      session.on('error', e => netSetStatus('room-status', e.text, 'error'));
      session.on('ping', ms => { const el = document.getElementById('net-ping'); if (el) el.textContent = `PING ${ms} ms`; });
      netSetStatus('net-status', '');
      setMenuScreen('room');
      netRenderRoom();
    } catch (err) {
      netSetStatus('net-status', (err && err.text) || 'Could not join the room.', 'error');
    }
    netSetBusy(false);
  }

  // Leave online play completely (room closed, kicked, connection lost, or Leave pressed)
  function netLeave(message) {
    if (net.leaving) return;
    net.leaving = true;
    if (net.host) net.host.close();
    if (net.session) net.session.close();
    net.role = null; net.host = null; net.session = null; net.myId = null; net.room = null; net.match = null;
    net.selected = null;
    state.netRole = null;
    if (window.AerialsNet) window.AerialsNet.releaseWake();
    const ping = document.getElementById('net-ping');
    if (ping) ping.classList.remove('show');
    const note = document.getElementById('net-hud-note');
    if (note) note.classList.remove('show');
    if (!state.inMainMenu) {
      net.keepRoom = false;
      returnToMainMenu();
    }
    net.leaving = false;
    if (state.inMainMenu) setMenuScreen('online');
    netSetStatus('net-status', message || '', message ? 'error' : '');
  }

  // ---------------- Host: lobby management ----------------
  function netTeamCount(room, t) { return room.players.filter(p => p.team === t && !p.watching).length; }

  function netHostOnJoin(e) {
    const room = net.room;
    const p = { id: e.id, name: e.name, team: -1, pick: room.mode === 'factions' ? 'fighter' : 'mustang', host: false, watching: room.phase === 'match' };
    if (!p.watching) p.team = netSmallestTeam(room);
    room.players.push(p);
    netBroadcastLobby();
    if (room.phase === 'match') showCombatBanner(`🌐 ${p.name} JOINED — WATCHING UNTIL THE NEXT MATCH`, false);
  }

  function netSmallestTeam(room) {
    let best = -1, bestN = Infinity;
    for (let t = 0; t < 4; t++) {
      const n = netTeamCount(room, t);
      if (n < room.teamSize && n < bestN) { best = t; bestN = n; }
    }
    return best; // -1 = every team is full: the player waits on the bench
  }

  function netHostOnLeave(e) {
    const room = net.room;
    if (!room) return;
    const p = room.players.find(x => x.id === e.id);
    room.players = room.players.filter(x => x.id !== e.id);
    if (net.selected === e.id) net.selected = null;
    if (room.phase === 'match' && p && !p.watching) netHostGuestLeftMatch(p);
    netBroadcastLobby();
  }

  function netBroadcastLobby() {
    if (!net.host || !net.room) return;
    net.host.broadcast({ t: 'lobby', room: net.room });
    if (state.inMainMenu) netRenderRoom();
  }

  function netHostOnMessage(id, msg) {
    const room = net.room;
    if (!room) return;
    const p = room.players.find(x => x.id === id);
    switch (msg.t) {
      case 'team':
        if (p && room.phase === 'lobby') netMovePlayer(p, msg.team);
        break;
      case 'pick':
        if (p && room.phase === 'lobby') { p.pick = String(msg.pick || ''); netBroadcastLobby(); }
        break;
      case 'st':
        netHostOnGuestState(id, msg);
        break;
      case 'bomb':
        netHostOnGuestBomb(id, msg);
        break;
      case 'dead':
        netHostOnGuestDeath(id, msg);
        break;
    }
  }

  function netMovePlayer(p, team) {
    const room = net.room;
    team = Number(team);
    if (team < -1 || team > 3) return;
    if (team >= 0 && p.team !== team && netTeamCount(room, team) >= room.teamSize) return;
    p.team = team;
    // A factions pick stays a role; a classic pick stays an aircraft id
    netBroadcastLobby();
  }

  function netHostSetSetting(key, value) {
    const room = net.room;
    if (!room || room.phase !== 'lobby') return;
    if (key === 'mode') {
      room.mode = value === 'factions' ? 'factions' : 'classic';
      room.players.forEach(p => { p.pick = room.mode === 'factions' ? 'fighter' : 'mustang'; });
    } else if (key === 'teamSize') {
      room.teamSize = THREE.MathUtils.clamp(Number(value) || 2, 1, 4);
      // Players over the new capacity move to a free team (or the bench)
      for (let t = 0; t < 4; t++) {
        const members = room.players.filter(p => p.team === t);
        while (members.length > room.teamSize) {
          const p = members.pop();
          p.team = -1;
          p.team = netSmallestTeam(room);
        }
      }
    } else if (key === 'bots') {
      room.bots = ['off', 'easy', 'normal', 'hard'].includes(value) ? value : 'normal';
    } else if (key === 'timeLimit') {
      room.timeLimit = [0, 10, 15, 20].includes(Number(value)) ? Number(value) : 0;
    } else if (key.startsWith('nation')) {
      const t = Number(key.slice(6));
      const other = room.nations.indexOf(value);
      if (other >= 0) room.nations[other] = room.nations[t]; // swap so nations stay unique
      room.nations[t] = value;
    }
    netBroadcastLobby();
  }

  function netRoomValidity(room) {
    const teamsWithPlayers = [0, 1, 2, 3].filter(t => netTeamCount(room, t) > 0).length;
    if (teamsWithPlayers === 0) return 'Put at least one player on a team.';
    if (room.bots === 'off' && teamsWithPlayers < 2) return 'Bots are off: players must be on at least 2 different teams (or turn bots on).';
    return '';
  }

  // ---------------- Room screen rendering (host + guests) ----------------
  function netRenderRoom() {
    const room = net.room;
    const isHost = net.role === 'host';
    const codeEl = document.getElementById('room-code');
    if (codeEl) codeEl.textContent = room ? room.code : (net.session ? net.session.code : '----');
    const awake = document.getElementById('room-awake-note');
    if (awake) awake.style.display = isHost ? '' : 'none';
    const me = room ? room.players.find(p => p.id === net.myId) : null;
    const watching = document.getElementById('room-watching');
    if (watching) watching.classList.toggle('show', Boolean(me && me.watching));
    const share = document.getElementById('room-share-btn');
    if (share) share.style.display = navigator.share ? '' : 'none';
    if (!room) {
      netSetStatus('room-status', 'Waiting for the host…', 'busy');
      return;
    }

    // Teams
    const teamsEl = document.getElementById('room-teams');
    if (teamsEl) {
      teamsEl.innerHTML = '';
      const columns = [0, 1, 2, 3, -1];
      for (const t of columns) {
        const members = room.players.filter(p => (t === -1 ? (p.team === -1 || p.watching) : (p.team === t && !p.watching)));
        if (t === -1 && !members.length) continue;
        const style = t >= 0 ? netTeamStyle(room, t) : { name: 'BENCH', color: '#94a3b8' };
        const col = document.createElement('div');
        col.className = 'room-team';
        col.style.setProperty('--team', style.color);
        const flag = (t >= 0 && room.mode === 'factions') ? `<img src="${getFlagDataUrl(room.nations[t])}" alt="" />` : '';
        col.innerHTML = `<div class="room-team-head">${flag}<span>${style.name}</span><span class="room-team-count">${t >= 0 ? `${members.length}/${room.teamSize}` : ''}</span></div>`;
        for (const p of members) {
          const row = document.createElement('div');
          const movable = isHost && room.phase === 'lobby';
          row.className = 'room-player' + (p.id === net.myId ? ' me' : '') + (movable ? ' movable' : '') + (net.selected === p.id ? ' selected' : '');
          const def = AIRCRAFT_DEFS[netPlaneFor(room, p)];
          row.innerHTML = `<span>${p.name}</span>` +
            (p.host ? '<span class="rp-badge">HOST</span>' : '') +
            (p.id === net.myId ? '<span class="rp-badge you">YOU</span>' : '') +
            (p.watching ? '<span class="rp-badge">NEXT MATCH</span>' : '') +
            `<span class="rp-plane">${def ? def.shortName : ''}</span>` +
            (isHost && !p.host ? `<button type="button" class="rp-kick" title="Remove from room">✕</button>` : '');
          if (movable) row.addEventListener('click', ev => {
            if (ev.target.classList.contains('rp-kick')) return;
            net.selected = (net.selected === p.id) ? null : p.id;
            netRenderRoom();
          });
          const kick = row.querySelector('.rp-kick');
          if (kick) kick.addEventListener('click', ev => { ev.stopPropagation(); net.host.kick(p.id); });
          col.appendChild(row);
        }
        // Bot slots preview
        if (t >= 0 && room.bots !== 'off') {
          for (let i = members.length; i < room.teamSize; i++) {
            const bot = document.createElement('div');
            bot.className = 'room-player bot';
            bot.textContent = `BOT (${room.bots})`;
            col.appendChild(bot);
          }
        }
        // Join / move buttons
        if (t >= 0 && room.phase === 'lobby') {
          const full = members.length >= room.teamSize;
          const wrap = document.createElement('div');
          wrap.className = 'room-join-team';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'net-btn';
          const moving = isHost && net.selected && net.selected !== net.myId;
          const movingPlayer = moving ? room.players.find(p => p.id === net.selected) : null;
          if (movingPlayer) {
            btn.textContent = `MOVE ${movingPlayer.name} HERE`;
            btn.disabled = full && movingPlayer.team !== t;
            btn.addEventListener('click', () => { netMovePlayer(movingPlayer, t); net.selected = null; netRenderRoom(); });
          } else {
            btn.textContent = `JOIN ${style.name}`;
            btn.disabled = (me && me.team === t) || full;
            btn.addEventListener('click', () => {
              if (isHost) { netMovePlayer(me, t); net.selected = null; }
              else net.session.send({ t: 'team', team: t });
            });
          }
          wrap.appendChild(btn);
          col.appendChild(wrap);
        }
        teamsEl.appendChild(col);
      }
    }

    // Own aircraft picker
    const planesEl = document.getElementById('room-planes');
    if (planesEl && me) {
      planesEl.innerHTML = '';
      const options = room.mode === 'factions'
        ? FACTION_ROLES.map(r => ({ pick: r, def: AIRCRAFT_DEFS[(FACTIONS[room.nations[Math.max(0, me.team)]] || FACTIONS.usa).planes[r]], sub: FACTION_ROLE_LABEL[r] }))
        : AIRCRAFT_ORDER.map(id => ({ pick: id, def: AIRCRAFT_DEFS[id], sub: AIRCRAFT_DEFS[id].specialty }));
      for (const o of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'room-plane-btn' + (me.pick === o.pick ? ' active' : '');
        b.innerHTML = `${o.def.shortName}<small>${o.sub}</small>`;
        b.disabled = room.phase !== 'lobby';
        b.addEventListener('click', () => {
          if (isHost) { me.pick = o.pick; netBroadcastLobby(); }
          else net.session.send({ t: 'pick', pick: o.pick });
        });
        planesEl.appendChild(b);
      }
    }

    // Settings (host edits, guests read only)
    const setEl = document.getElementById('room-settings');
    if (setEl) {
      const dis = (!isHost || room.phase !== 'lobby') ? 'disabled' : '';
      const sel = (key, label, opts, val) => `<label class="room-setting">${label}<select data-net-setting="${key}" ${dis}>` +
        opts.map(([v, t]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${t}</option>`).join('') + '</select></label>';
      let html = sel('mode', 'GAME MODE', [['classic', 'Classic'], ['factions', 'Factions']], room.mode) +
        sel('teamSize', 'TEAM SIZE', [[1, '1'], [2, '2'], [3, '3'], [4, '4']], room.teamSize) +
        sel('bots', 'BOTS FILL EMPTY SLOTS', [['off', 'Off'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], room.bots) +
        sel('timeLimit', 'TIME LIMIT', [[0, 'None (last team standing)'], [10, '10 min'], [15, '15 min'], [20, '20 min']], room.timeLimit);
      if (room.mode === 'factions') {
        for (let t = 0; t < 4; t++) {
          html += sel('nation' + t, `TEAM ${t + 1} NATION`, FACTION_ORDER.map(n => [n, FACTIONS[n].name]), room.nations[t]);
        }
      }
      setEl.innerHTML = html;
      setEl.querySelectorAll('select').forEach(s => s.addEventListener('change', () => netHostSetSetting(s.getAttribute('data-net-setting'), s.value)));
    }

    // Start / status
    const startBtn = document.getElementById('room-start-btn');
    const problem = netRoomValidity(room);
    if (startBtn) {
      startBtn.style.display = isHost ? '' : 'none';
      startBtn.disabled = Boolean(problem) || room.phase !== 'lobby';
    }
    if (isHost) netSetStatus('room-status', problem || `${room.players.length}/${window.AerialsNet.MAX_PLAYERS} players • ready to start`, problem ? 'error' : '');
    else netSetStatus('room-status', room.phase === 'match' ? 'A match is in progress — you will play in the next one.' : 'Waiting for the host to start the match…', 'busy');
  }

  function netInviteLink() {
    const code = net.room ? net.room.code : (net.session ? net.session.code : '');
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  // ---------------- Match start ----------------
  function netHostStartMatch() {
    const room = net.room;
    if (!room || room.phase !== 'lobby' || netRoomValidity(room)) return;
    const bases = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    room.phase = 'match';
    const roster = {
      t: 'roster',
      mode: room.mode, teamSize: room.teamSize, bots: room.bots, timeLimit: room.timeLimit,
      nations: room.nations.slice(), bases,
      players: room.players.filter(p => !p.watching && p.team >= 0).map(p => ({ id: p.id, name: p.name, team: p.team, pick: p.pick }))
    };
    net.host.broadcast({ t: 'lobby', room });
    net.host.broadcast(roster);
    netLaunchMatch(roster);
  }

  function netLaunchMatch(roster) {
    const me = roster.players.find(p => p.id === net.myId);
    if (!me) { netRenderRoom(); return; } // benched: stay in the room
    net.match = roster;
    net.match.startedAt = performance.now();
    net.match.ended = false;
    net.myTeam = me.team;
    net.entIdx = new Map(); net.entSig = ''; net.nextEnt = 1; net.clockOffset = null; net.seq = 0;
    net.snapTimer = 0; net.stateTimer = 0; net.lastAttacker = null;
    state.netRole = net.role;
    state.gameMode = roster.mode;
    state.teamSize = roster.teamSize;
    state.pilotName = me.name;
    state.menuScreen = roster.mode;
    selectMenuAircraft(netPlaneFor(roster, me));
    launchSortieFromMainMenu();
    // The overlay left on screen until the player clicks is a "take control" prompt, not a pause
    const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
    setText('menu-mode-badge', '★ ONLINE MATCH ★');
    setText('menu-main-title', 'MATCH STARTED');
    setText('menu-sub-title', `${me.name} • ${(AIRCRAFT_DEFS[state.selectedAircraft] || {}).name || ''} — the battle is live, click to take control`.toUpperCase());
    setText('lock-start-btn', 'TAKE CONTROL');
    const ping = document.getElementById('net-ping');
    if (ping) { ping.classList.add('show'); ping.textContent = net.role === 'host' ? 'HOST' : 'PING …'; }
    const note = document.getElementById('net-hud-note');
    if (note) {
      note.textContent = net.role === 'host' ? 'YOU ARE THE HOST — keep the game in the foreground' : '';
      note.classList.toggle('show', net.role === 'host');
      if (net.role === 'host') setTimeout(() => note.classList.remove('show'), 12000);
    }
    showCombatBanner(`🌐 ONLINE MATCH — ${netTeamStyle(roster, me.team).name} TEAM • ${roster.mode === 'factions' ? 'FACTIONS' : 'CLASSIC'}`, false);
  }

  // Factions life pools / nations for the local player in an online match
  function netSetupLocalRules() {
    const R = net.match;
    if (R.mode === 'factions') {
      const mine = R.nations[net.myTeam];
      state.factionMatch = { playerNation: mine, aiNations: [0, 1, 2, 3].filter(t => t !== net.myTeam).map(t => R.nations[t]) };
      state.maxLivesPerPlane = FACTION_LIVES_PER_TYPE;
      state.aircraftLives = {};
      FACTION_ROLES.forEach(r => { state.aircraftLives[FACTIONS[mine].planes[r]] = FACTION_LIVES_PER_TYPE; });
      state.pendingRespawnPlane = null;
    } else {
      state.factionMatch = null;
      state.maxLivesPerPlane = 3;
      state.aircraftLives = { mustang: 3, zero: 3, bf109: 3, il2: 3, spitfire: 3, sm79: 3 };
    }
  }

  // Same bases on every device: team t lives at airfield bases[t]
  function netAssignBases() {
    const R = net.match;
    applyAirfieldSizes();
    buildAirfields();
    clearDamageSmoke();
    state.currentAirfield = R.bases[net.myTeam];
    state.enemyHomeAirfields = [0, 1, 2, 3].filter(t => t !== net.myTeam).map(t => R.bases[t]);
    for (const af of AIRPORTS) { af.team = 'enemy'; af.nationId = null; af.sideKey = null; af.netTeam = -1; af.netColor = undefined; af.netColorCss = null; }
    for (let t = 0; t < 4; t++) {
      const af = AIRPORTS[R.bases[t]];
      af.team = (t === net.myTeam) ? 'friendly' : 'enemy';
      af.sideKey = (t === net.myTeam) ? 'player' : 'T' + t;
      af.nationId = R.mode === 'factions' ? R.nations[t] : null;
      af.netTeam = t;
      af.netColor = netTeamColorHex(R, t);
      af.netColorCss = netTeamStyle(R, t).color;
    }
    for (const aa of aaDefenseSystems) {
      let nearest = 0, best = Infinity;
      AIRPORTS.forEach((af, i) => { const d = Math.hypot(af.x - aa.x, af.z - aa.z); if (d < best) { best = d; nearest = i; } });
      aa.team = AIRPORTS[nearest].team;
      aa.sideKey = AIRPORTS[nearest].sideKey;
      aa.nationId = AIRPORTS[nearest].nationId;
      aa.netTeam = AIRPORTS[nearest].netTeam;
    }
    updateAirfieldVisuals();
    updateHomeBaseButton();
  }

  function netBotPlaneFor(t, teamPlane) {
    const R = net.match;
    if (R.mode === 'factions') return FACTIONS[R.nations[t]].planes[FACTION_ROLES[Math.floor(Math.random() * 3)]];
    return teamPlane;
  }

  // Host: bots + remote players for every team (the host's own team are allies, the rest are enemy sides)
  function initNetHostEntities() {
    const R = net.match;
    if (friendlyWingman) {
      if (friendlyWingman.group) scene.remove(friendlyWingman.group);
      if (friendlyWingman.markerEl) friendlyWingman.markerEl.remove();
      friendlyWingman = null;
    }
    removeFriendlyEscorts();
    const skill = NET_BOT_SKILL[R.bots] || NET_BOT_SKILL.normal;
    const classicTeamPlanes = [0, 1, 2, 3].map(() => AIRCRAFT_ORDER[Math.floor(Math.random() * AIRCRAFT_ORDER.length)]);

    // Host's team: remote teammates + bots as wingmen
    let slot = 0;
    const mates = R.players.filter(p => p.team === net.myTeam && p.id !== 'host');
    for (const p of mates) {
      const a = createAllyPlane(++slot, netPlaneFor(R, p));
      netMakeRemote(a, p);
    }
    if (R.bots !== 'off') {
      for (let k = mates.length + 1; k < R.teamSize; k++) {
        const a = createAllyPlane(++slot, R.mode === 'factions' ? netBotPlaneFor(net.myTeam) : state.selectedAircraft);
        a.netSkill = skill;
      }
    }
    // Every other team
    for (let t = 0; t < 4; t++) {
      if (t === net.myTeam) continue;
      const humans = R.players.filter(p => p.team === t);
      const bots = R.bots !== 'off' ? Math.max(0, R.teamSize - humans.length) : 0;
      if (humans.length + bots === 0) continue;
      createNetEnemyTeam(t, R.bases[t], humans, bots, skill, classicTeamPlanes[t]);
    }
  }

  function netMakeRemote(p, player) {
    p.remote = player.id;
    p.netName = player.name;
    p.callsign = player.name;
    p.aiState = 'remote';
    p.netState = null;
    if (p.labelEl) p.labelEl.textContent = player.name;
  }

  function createNetEnemyTeam(t, baseIdx, humans, botCount, skill, classicPlane) {
    const R = net.match;
    const hudContainer = document.getElementById('enemy-hud-container');
    const style = netTeamStyle(R, t);
    const homeAf = AIRPORTS[baseIdx];
    const sideKey = 'T' + t;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const pattern = Math.random() < 0.5 ? 'orbit' : 'figure8';
    const phase = Math.random() * Math.PI * 2;
    const bots = [];
    const total = humans.length + botCount;
    for (let m = 0; m < total; m++) {
      const human = humans[m] || null;
      const planeId = human ? netPlaneFor(R, human) : netBotPlaneFor(t, classicPlane);
      const def = AIRCRAFT_DEFS[planeId];
      const role0 = def.role || 'fighter';
      const pat = FACTION_PATROL[role0] || FACTION_PATROL.fighter;
      const modelData = createAircraftModel(planeId);
      scene.add(modelData.group);
      let markerEl = null, leadEl = null, labelEl = null, hpFillEl = null;
      if (hudContainer) {
        markerEl = document.createElement('div');
        markerEl.className = 'enemy-hud-marker faction';
        markerEl.style.setProperty('--team', style.color);
        markerEl.innerHTML = `<div class="enemy-label"><div class="enemy-title"></div><div class="enemy-hp-bar"><div class="enemy-hp-fill"></div></div></div><div class="enemy-target-box"></div>`;
        hudContainer.appendChild(markerEl);
        labelEl = markerEl.querySelector('.enemy-title');
        hpFillEl = markerEl.querySelector('.enemy-hp-fill');
        leadEl = document.createElement('div');
        leadEl.className = 'enemy-lead-reticle';
        hudContainer.appendChild(leadEl);
      }
      const memberNum = m + 1;
      const ep = {
        id: `net_${t}_${memberNum}`, teamId: sideKey, sideKey, netTeam: t,
        role: 'wingman', memberNumber: memberNum, slot: m, teamSize: total,
        callsign: human ? human.name : `${style.name} ${def.shortName} #${memberNum}`,
        partner: null, planeId, def, modelData, group: modelData.group,
        pattern, centerX: THREE.MathUtils.clamp(homeAf.x * 0.7, CONFIG.minX + pat.radius + 300, CONFIG.maxX - pat.radius - 300),
        centerZ: THREE.MathUtils.clamp(homeAf.z * 0.7, CONFIG.minZ + pat.radius + 300, CONFIG.maxZ - pat.radius - 300),
        baseAlt: pat.alt, radius: pat.radius, dir, phase,
        cruiseSpeedKmh: factionBotCruiseKmh(def), currentSpeedKmh: 0, speedMs: 0,
        bankAngle: dir * (0.3 + Math.random() * 0.2),
        currentPos: new THREE.Vector3(), velocity: new THREE.Vector3(), headingDeg: 0,
        hp: def.maxHp || 120, maxHp: def.maxHp || 120,
        lives: 3, maxLives: 3, permanentlyDead: false, isAlive: true, isDying: false,
        aiState: 'takeoff', attackTarget: 'player', tacticalState: 'pursuit', tacticalTimer: 0, evasionType: 'barrel_roll', evasionDir: 1,
        burstTimer: 0, burstCooldown: 0, airfieldIndex: baseIdx, homeAirfield: baseIdx, takeoffDelay: 0, gearPos: 1.0, breakOffTimer: 0,
        weaponHeat: 0, weaponJammed: false, weaponTimer: 0, hardpointIndex: 0, respawnTimer: 0, fallSpeed: 0, smokeTimer: 0,
        engineDamaged: false, wingDamaged: false,
        markerEl, leadEl, labelEl, hpFillEl
      };
      if (R.mode === 'factions') {
        initFactionPlaneState(ep, R.nations[t], planeId);
        if (markerEl) markerEl.style.setProperty('--team', style.color);
      }
      ep.sideKey = sideKey;
      enemyPlanes.push(ep);
      assignEnemyToHomeAirbase(ep);
      if (human) netMakeRemote(ep, human);
      else { ep.netSkill = skill; bots.push(ep); }
    }
    if (bots.length) {
      bots[0].role = 'lead';
      for (let k = 1; k < bots.length; k++) bots[k].partner = bots[0];
      bots[0].partner = bots[1] || null;
      enemyTeams.push({ teamId: sideKey, sideKey, nationId: R.mode === 'factions' ? R.nations[t] : null, planeId: bots[0].planeId, lead: bots[0], wingman: bots[1] || null, members: bots });
    }
  }

  // ---------------- Host: remote players ----------------
  function netFindRemote(id) {
    return enemyPlanes.find(e => e.remote === id) || getFriendlyAllies().find(a => a.remote === id) || null;
  }

  function netHostOnGuestState(id, m) {
    const p = netFindRemote(id);
    if (!p || !Array.isArray(m.p)) return;
    p.netState = {
      pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]),
      quat: new THREE.Quaternion(m.q[0], m.q[1], m.q[2], m.q[3]),
      vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]),
      spd: m.spd || 0, f: Boolean(m.f), a: Boolean(m.a), gnd: Boolean(m.gnd), g: m.g || 0,
      pl: AIRCRAFT_DEFS[m.pl] ? m.pl : p.planeId, hp: m.hp, mhp: m.mhp, l: m.l, sp: m.sp || 0,
      rt: performance.now()
    };
  }

  // Swap the model of a remote player / proxy when its aircraft changes
  function netSetPlaneModel(p, planeId) {
    const def = AIRCRAFT_DEFS[planeId];
    if (!def) return;
    const prevPos = p.currentPos.clone();
    const prevQuat = p.group.quaternion.clone();
    const vis = p.group.visible;
    scene.remove(p.group);
    const md = createAircraftModel(planeId);
    p.planeId = planeId; p.def = def; p.modelData = md; p.group = md.group;
    p.maxHp = def.maxHp || 120; p.planeRole = def.role || p.planeRole;
    p.hardpointIndex = 0; p.gunner = null;
    p.group.position.copy(prevPos); p.group.quaternion.copy(prevQuat); p.group.visible = vis;
    scene.add(p.group);
  }

  function updateRemoteProxy(p, dt) {
    const s = p.netState;
    if (!s) { p.group.visible = false; p.isAlive = false; return; }
    if (s.pl !== p.planeId) netSetPlaneModel(p, s.pl);
    p.lives = s.l;
    p.maxLives = Math.max(p.maxLives || 0, s.l);
    if (!s.a) {
      if (p.isAlive) {
        p.isAlive = false; p.isDying = false;
        p.group.visible = false;
        spawnExplosionAt(p.currentPos, 2.3);
      }
      p.permanentlyDead = s.l <= 0;
      return;
    }
    const jump = p.currentPos.distanceTo(s.pos) > 80 || !p.isAlive || p.netSp !== s.sp;
    p.netSp = s.sp;
    if (!p.isAlive) { p.isAlive = true; p.isDying = false; p.permanentlyDead = false; p.group.visible = true; }
    const age = Math.min(0.3, (performance.now() - s.rt) / 1000);
    const target = s.pos.clone().addScaledVector(s.vel, age);
    if (jump) { p.currentPos.copy(target); p.group.quaternion.copy(s.quat); p.netEpoch = (p.netEpoch || 0) + 1; }
    else { p.currentPos.lerp(target, Math.min(1, 12 * dt)); p.group.quaternion.slerp(s.quat, Math.min(1, 14 * dt)); }
    p.group.position.copy(p.currentPos);
    p.velocity.copy(s.vel);
    p.currentSpeedKmh = s.spd; p.speedMs = s.spd / 3.6;
    p.onGround = s.gnd;
    p.gearPos = s.g;
    if (p.modelData && p.modelData.setGearDeployment) p.modelData.setGearDeployment(s.g);
    if (typeof s.hp === 'number') p.hp = s.hp;
    if (typeof s.mhp === 'number') p.maxHp = s.mhp;
    if (p.modelData && p.modelData.propellers) for (const pr of p.modelData.propellers) pr.rotation.z += (s.spd < 30 ? 35 : 85) * dt;
    let hdg = THREE.MathUtils.radToDeg(Math.atan2(s.vel.x, -s.vel.z));
    if (hdg < 0) hdg += 360;
    p.headingDeg = hdg;
    p.isFiring = s.f && !s.gnd;
    updateEnemyWeapon(p, dt, p.isFiring);
    const hpRatio = p.maxHp ? p.hp / p.maxHp : 1;
    if (hpRatio < DAMAGE_SMOKE_HP) emitDamageSmoke(p, p.currentPos, p.group.quaternion, hpRatio, dt);
  }

  // Damage the host computed for a remote player: the guest applies it to its own aircraft
  function netForwardHit(p, dmg, module, attacker) {
    let by = 'ENEMY', bid = null;
    if (attacker === 'host') { by = state.pilotName; bid = 'host'; }
    else if (attacker && attacker.remote) { by = attacker.netName; bid = attacker.remote; }
    else if (attacker && attacker.callsign) by = attacker.callsign;
    else if (module === 'FLAK') by = 'FLAK';
    net.host.sendTo(p.remote, { t: 'hit', d: dmg, m: module, by, bid });
    if (attacker === 'host') triggerHitMarker(false);
    else if (bid) netHitConfirm(bid, false);
  }

  function netHitConfirm(guestId, kill) {
    if (!net.host || !guestId || guestId === 'host') return;
    const now = performance.now();
    if (!kill && now - (net.hcTimers[guestId] || 0) < 90) return;
    net.hcTimers[guestId] = now;
    net.host.sendTo(guestId, { t: 'hc', k: kill ? 1 : 0 });
  }

  // Kill credit + kill feed for any shoot-down decided on the host
  function netReportKill(killer, victimName) {
    if (!net.host) return;
    let by = null;
    if (killer === 'host') by = state.pilotName;
    else if (killer && killer.remote) { by = killer.netName; netHitConfirm(killer.remote, true); }
    else if (killer && killer.callsign) by = killer.callsign;
    net.host.broadcast({ t: 'ban', x: by ? `💥 ${by} shot down ${victimName}` : `💥 ${victimName} went down` });
  }

  function netHostOnGuestDeath(id, m) {
    const p = netFindRemote(id);
    const victim = p ? p.netName : 'A PILOT';
    if (m.bid === 'host') {
      state.sortieKills = (state.sortieKills || 0) + 1;
      triggerHitMarker(true);
      showCombatBanner(`🏆 YOU SHOT DOWN ${victim}! +250`, true);
    } else if (m.bid) {
      netHitConfirm(m.bid, true);
    }
    const text = m.by ? `💥 ${m.by} shot down ${victim}` : `💥 ${victim} crashed`;
    net.host.broadcast({ t: 'ban', x: text });
    if (m.bid !== 'host') showCombatBanner(text, false);
  }

  function netHostOnGuestBomb(id, m) {
    const p = netFindRemote(id);
    if (!p || !Array.isArray(m.p)) return;
    spawnFallingBomb(new THREE.Vector3(m.p[0], m.p[1], m.p[2]), new THREE.Vector3(m.v[0], m.v[1], m.v[2]), p.group.quaternion.clone());
    const b = activeBombs[activeBombs.length - 1];
    b.netOwner = id;
    b.netTeam = netTeamOfPlane(p);
  }

  function netTeamOfPlane(p) {
    if (p.netTeam !== undefined) return p.netTeam;
    return net.myTeam; // allies of the host
  }

  // A guest left mid-match: a bot takes over (bots on) or the slot goes idle
  function netHostGuestLeftMatch(player) {
    const p = netFindRemote(player.id);
    showCombatBanner(`🌐 ${player.name} LEFT THE MATCH`, false);
    net.host.broadcast({ t: 'ban', x: `🌐 ${player.name} left the match` });
    if (p) {
      if (net.match.bots !== 'off') {
        delete p.remote;
        p.netSkill = NET_BOT_SKILL[net.match.bots];
        p.callsign = `BOT ${p.def.shortName}`;
        p.netName = null;
        if (!p.isFriendly) {
          p.aiState = p.isAlive ? 'climb' : p.aiState;
          if (!p.isAlive && p.lives > 0) p.respawnTimer = 6;
          const team = enemyTeams.find(tm => tm.sideKey === p.sideKey);
          if (team) { team.members.push(p); p.partner = team.lead; }
          else {
            p.role = 'lead';
            enemyTeams.push({ teamId: p.sideKey, sideKey: p.sideKey, planeId: p.planeId, lead: p, wingman: null, members: [p] });
          }
        } else {
          p.aiState = p.isAlive ? 'patrol' : p.aiState;
          if (!p.isAlive && p.lives > 0) p.respawnTimer = 6;
        }
      } else {
        p.isAlive = false; p.isDying = false; p.permanentlyDead = true; p.lives = 0;
        p.group.visible = false;
        delete p.remote;
        p.aiState = 'remote';
      }
    }
    // Stop the match when fewer than two sides still have anyone in them
    const sides = netSideStatus().filter(s => s.participant);
    if (sides.length < 2) netHostStopToLobby(`${player.name} left, so the match was stopped.`);
  }

  // ---------------- Host: who is still in the fight ----------------
  function netSideStatus() {
    const R = net.match;
    const out = [];
    for (let t = 0; t < 4; t++) {
      let members = [];
      let lives = 0, alive = false, participant = false;
      if (t === net.myTeam) {
        const myLives = netLocalLives();
        participant = true;
        lives += myLives;
        if (!state.isDefeated && (myLives > 0 || !state.isCrashed)) alive = true;
        members = getFriendlyAllies();
      } else {
        members = enemyPlanes.filter(e => e.netTeam === t);
      }
      for (const m of members) {
        if (m.remote === undefined && m.permanentlyDead && !m.isAlive && m.aiState === 'remote') continue; // idle slot
        participant = true;
        lives += Math.max(0, m.lives || 0);
        if (!m.permanentlyDead && (m.isAlive || m.lives > 0)) alive = true;
      }
      out.push({ team: t, participant, alive, lives, name: netTeamStyle(R, t).name });
    }
    return out;
  }

  function netLocalLives() {
    if (state.isDefeated) return 0;
    if (state.factionMatch && state.gameMode === 'factions') {
      return FACTION_ROLES.reduce((s, r) => s + (state.aircraftLives[FACTIONS[state.factionMatch.playerNation].planes[r]] || 0), 0);
    }
    return state.aircraftLives[state.selectedAircraft] || 0;
  }

  function netHostCheckMatchEnd() {
    const R = net.match;
    if (!R || R.ended) return;
    const sides = netSideStatus().filter(s => s.participant);
    const alive = sides.filter(s => s.alive);
    const elapsed = (performance.now() - R.startedAt) / 60000;
    let winner = null;
    if (alive.length <= 1) winner = alive.length ? alive[0].team : -1;
    else if (R.timeLimit && elapsed >= R.timeLimit) {
      const best = alive.slice().sort((a, b) => b.lives - a.lives);
      winner = (best.length > 1 && best[0].lives === best[1].lives) ? -1 : best[0].team;
    }
    if (winner === null) return;
    R.ended = true;
    const standings = sides.map(s => ({ team: s.team, name: s.name, lives: s.lives, alive: s.alive }));
    net.host.broadcast({ t: 'end', w: winner, st: standings });
    netShowEndScreen(winner, standings);
  }

  function netHostStopToLobby(message) {
    if (!net.host || !net.room) return;
    net.room.phase = 'lobby';
    net.room.players.forEach(p => { if (p.watching) { p.watching = false; p.team = netSmallestTeam(net.room); } });
    net.host.broadcast({ t: 'tolobby', text: message || '' });
    netBroadcastLobby();
    netReturnToRoom(message);
  }

  // Tear the match down but stay in the room
  function netReturnToRoom(message) {
    net.match = null;
    net.keepRoom = true;
    returnToMainMenu();
    net.keepRoom = false;
    setMenuScreen('room');
    netRenderRoom();
    if (message) netSetStatus('room-status', message, 'error');
  }

  // ---------------- End of match screen ----------------
  function netShowEndScreen(winner, standings) {
    if (state.isVictory) return;
    showVictoryScreen();
    const R = net.match;
    const won = winner === net.myTeam;
    const winName = winner >= 0 ? netTeamStyle(R, winner).name : null;
    const badge = document.getElementById('victory-badge');
    if (badge) badge.textContent = won ? '🏆 VICTORY — YOUR TEAM WINS' : (winner >= 0 ? `☠️ DEFEAT — ${winName} WINS` : '⚖️ DRAW');
    const title = document.getElementById('victory-title');
    if (title) title.textContent = won ? 'MATCH WON' : (winner >= 0 ? 'MATCH LOST' : 'MATCH DRAWN');
    const sub = document.getElementById('victory-sub');
    if (sub) sub.textContent = winner >= 0 ? `${winName} is the last team standing.` : 'No single team came out on top.';
    const debrief = document.getElementById('victory-debrief');
    if (debrief) {
      debrief.innerHTML = '<div class="debrief-grid">' + (standings || []).map(s =>
        `<div class="debrief-item"><span class="debrief-label" style="color:${netTeamStyle(R, s.team).color}">${s.name}</span><span class="debrief-val">${s.alive ? s.lives + ' ♥ left' : 'OUT'}</span></div>`).join('') +
        `<div class="debrief-item"><span class="debrief-label">YOUR KILLS</span><span class="debrief-val" style="color:#fde047;">${state.sortieKills || 0}</span></div></div>`;
    }
    const newBtn = document.getElementById('victory-new-btn');
    if (newBtn) {
      newBtn.textContent = net.role === 'host' ? 'BACK TO LOBBY' : 'WAITING FOR HOST…';
      newBtn.disabled = net.role !== 'host';
    }
    const menuBtn = document.getElementById('victory-menu-btn');
    if (menuBtn) menuBtn.textContent = 'LEAVE ROOM';
  }

  // ---------------- Host: per-frame networking ----------------
  function netHostEntities() {
    const list = [];
    if (airplaneGroup) list.push({ key: 'host', ref: null });
    for (const a of getFriendlyAllies()) list.push({ key: a.remote ? 'r:' + a.remote : a.id, ref: a });
    for (const e of enemyPlanes) list.push({ key: e.remote ? 'r:' + e.remote : e.id, ref: e });
    return list;
  }

  function netEntIndex(key) {
    if (!net.entIdx.has(key)) net.entIdx.set(key, net.nextEnt++);
    return net.entIdx.get(key);
  }

  const R10 = v => Math.round(v * 10);
  const R1000 = v => Math.round(v * 1000);

  function netHostTick(dt) {
    net.snapTimer += dt;
    if (net.snapTimer < NET_SNAPSHOT_INTERVAL) return;
    net.snapTimer = 0;
    const R = net.match;
    const ents = netHostEntities();
    // Entity table (sent reliably only when something about it changes)
    const table = ents.map(e => {
      const r = e.ref;
      if (!r) return { n: netEntIndex('host'), pl: state.selectedAircraft, tm: net.myTeam, nm: state.pilotName, h: 1, g: 'host' };
      const tm = r.netTeam !== undefined ? r.netTeam : net.myTeam;
      return { n: netEntIndex(e.key), pl: r.planeId, tm, nm: r.netName || r.callsign || r.def.shortName, h: r.remote ? 1 : 0, g: r.remote || null };
    });
    const sig = JSON.stringify(table);
    if (sig !== net.entSig) {
      net.entSig = sig;
      net.host.broadcast({ t: 'ents', list: table });
    }
    const d = [];
    for (let i = 0; i < ents.length; i++) {
      const r = ents[i].ref;
      const n = table[i].n;
      if (!r) {
        const g = airplaneGroup, q = g.quaternion;
        const alive = !state.isCrashed && g.visible;
        const flags = (alive ? 1 : 0) | ((state.inputs.fire && !state.weapons.isJammed && alive) ? 2 : 0) | (state.gear.position > 0.5 ? 8 : 0) | (state.isDefeated ? 16 : 0);
        d.push(n, R10(g.position.x), R10(g.position.y), R10(g.position.z), R1000(q.x), R1000(q.y), R1000(q.z), R1000(q.w), flags,
          Math.round(100 * state.playerHp / (state.playerMaxHp || 1)), netLocalLives(), state.netEpoch || 0);
        continue;
      }
      const q = r.group.quaternion;
      const flags = (r.isAlive ? 1 : 0) | (r.isFiring ? 2 : 0) | (r.isDying ? 4 : 0) | ((r.gearPos || 0) > 0.5 ? 8 : 0) | (r.permanentlyDead ? 16 : 0);
      const p = r.isDying ? r.currentPos : (r.group.visible ? r.currentPos : r.currentPos);
      d.push(n, R10(p.x), R10(p.y), R10(p.z), R1000(q.x), R1000(q.y), R1000(q.z), R1000(q.w), flags,
        Math.round(100 * (r.hp || 0) / (r.maxHp || 1)), Math.max(0, r.lives || 0), r.netEpoch || 0);
    }
    net.host.broadcast({ t: 's', q: ++net.seq, ts: Math.round(performance.now()), d });
    const ping = document.getElementById('net-ping');
    if (ping) ping.textContent = `HOST • ${net.host.guests.size + 1} PLAYERS`;
    void R;
  }

  // ---------------- Guest: messages, proxies & interpolation ----------------
  function netGuestOnMessage(msg) {
    switch (msg.t) {
      case 'lobby':
        net.room = msg.room;
        if (state.inMainMenu) netRenderRoom();
        break;
      case 'roster':
        if (state.inMainMenu) netLaunchMatch(msg);
        break;
      case 'ents':
        if (netInMatch()) netGuestSyncEnts(msg.list);
        break;
      case 's':
        if (netInMatch()) netGuestOnSnapshot(msg);
        break;
      case 'hit':
        if (netInMatch() && !state.isCrashed && airplaneGroup) {
          net.lastAttacker = { by: msg.by, bid: msg.bid, at: performance.now() };
          damagePlayerAircraft(msg.d, msg.m, airplaneGroup.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { callsign: msg.by });
        }
        break;
      case 'hc':
        if (netInMatch()) {
          triggerHitMarker(Boolean(msg.k));
          if (msg.k) { state.sortieKills = (state.sortieKills || 0) + 1; showCombatBanner('🏆 KILL CONFIRMED! +250', true); }
        }
        break;
      case 'ban':
        if (netInMatch()) showCombatBanner(msg.x, false);
        break;
      case 'boom':
        if (netInMatch()) netGuestOnBoom(msg);
        break;
      case 'fk':
        if (netInMatch()) netGuestOnFlak(msg);
        break;
      case 'bl':
        if (netInMatch() && barrageBalloons[msg.i]) {
          const b = barrageBalloons[msg.i];
          net.quietHits = true;
          damageBarrageBalloon(b, 1e6, b.currentPos);
          net.quietHits = false;
        }
        break;
      case 'end':
        if (netInMatch()) { net.match.ended = true; netShowEndScreen(msg.w, msg.st); }
        break;
      case 'tolobby':
        if (net.match || !state.inMainMenu) netReturnToRoom(msg.text);
        break;
      case 'pz':
        if (!netInMatch()) break;
        state.netHostPaused = Boolean(msg.on);
        if (msg.on) { pauseGame(); const s = document.getElementById('menu-sub-title'); if (s) s.textContent = 'PAUSED BY THE HOST — waiting for the host to resume'; }
        else if (state.isPaused) resumeGame();
        break;
    }
  }

  function netGuestSyncEnts(list) {
    const R = net.match;
    const keep = new Set();
    for (const e of list) {
      if (e.g && e.g === net.myId) continue; // that's me
      keep.add(e.n);
      let p = netFindProxy(e.n);
      if (!p) p = netCreateProxy(e);
      if (p.planeId !== e.pl && AIRCRAFT_DEFS[e.pl]) netSetPlaneModel(p, e.pl);
      p.callsign = e.nm; p.netName = e.h ? e.nm : null;
      if (p.labelEl && p.isFriendly) p.labelEl.textContent = e.nm;
    }
    // Entities the host no longer has
    for (const arr of [enemyPlanes, friendlyEscorts]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        if (p.netProxy && !keep.has(p.netIdx)) {
          scene.remove(p.group);
          if (p.markerEl) p.markerEl.remove();
          if (p.leadEl) p.leadEl.remove();
          arr.splice(i, 1);
        }
      }
    }
    void R;
  }

  function netFindProxy(n) {
    return enemyPlanes.find(p => p.netIdx === n) || friendlyEscorts.find(p => p.netIdx === n) || null;
  }

  function netCreateProxy(e) {
    const R = net.match;
    const def = AIRCRAFT_DEFS[e.pl] || AIRCRAFT_DEFS.mustang;
    const md = createAircraftModel(def.id);
    scene.add(md.group);
    md.group.visible = false;
    const friendly = e.tm === net.myTeam;
    const style = netTeamStyle(R, e.tm);
    const hud = document.getElementById('enemy-hud-container');
    let markerEl = null, labelEl = null, hpFillEl = null, leadEl = null;
    if (hud) {
      markerEl = document.createElement('div');
      if (friendly) {
        markerEl.className = 'ally-hud-marker';
        markerEl.innerHTML = `<div class="ally-label"><div class="ally-title"></div><div class="ally-hp-bar"><div class="ally-hp-fill"></div></div></div><div class="ally-target-box"></div>`;
        labelEl = markerEl.querySelector('.ally-title');
        hpFillEl = markerEl.querySelector('.ally-hp-fill');
      } else {
        markerEl.className = 'enemy-hud-marker faction';
        markerEl.style.setProperty('--team', style.color);
        markerEl.innerHTML = `<div class="enemy-label"><div class="enemy-title"></div><div class="enemy-hp-bar"><div class="enemy-hp-fill"></div></div></div><div class="enemy-target-box"></div>`;
        labelEl = markerEl.querySelector('.enemy-title');
        hpFillEl = markerEl.querySelector('.enemy-hp-fill');
        leadEl = document.createElement('div');
        leadEl.className = 'enemy-lead-reticle';
        hud.appendChild(leadEl);
      }
      hud.appendChild(markerEl);
    }
    const p = {
      id: 'n' + e.n, netIdx: e.n, netProxy: true, isFriendly: friendly, slot: friendlyEscorts.length + 1,
      netTeam: e.tm, sideKey: 'T' + e.tm, planeId: def.id, def, modelData: md, group: md.group,
      currentPos: new THREE.Vector3(), velocity: new THREE.Vector3(), headingDeg: 0,
      isAlive: false, isDying: false, permanentlyDead: false, lives: 0, maxLives: 0, hp: def.maxHp, maxHp: def.maxHp,
      callsign: e.nm, netName: e.h ? e.nm : null, aiState: 'remote', role: 'wingman', def0: def,
      weaponHeat: 0, weaponJammed: false, weaponTimer: 0, hardpointIndex: 0, smokeTimer: 0, gearPos: 1,
      takenOver: false, buf: [], netEpoch: -1,
      markerEl, labelEl, hpFillEl, leadEl
    };
    if (friendly) friendlyEscorts.push(p); else enemyPlanes.push(p);
    return p;
  }

  function netGuestOnSnapshot(m) {
    const now = performance.now();
    // Host clock -> local clock (lowest observed offset = least delayed packet), plus jitter estimate
    const off = m.ts - now; // the least-delayed packet gives the largest offset; decay slowly to follow drift
    net.clockOffset = net.clockOffset === null ? off : Math.max(off, net.clockOffset - 0.5);
    if (net.lastSnapAt) {
      const gap = now - net.lastSnapAt;
      net.jitter = net.jitter * 0.9 + Math.abs(gap - NET_SNAPSHOT_INTERVAL * 1000) * 0.1;
    }
    net.lastSnapAt = now;
    net.interpDelay = THREE.MathUtils.clamp((NET_SNAPSHOT_INTERVAL * 1000 * 2.5 + net.jitter * 2) / 1000, 0.07, 0.25);
    const d = m.d;
    for (let i = 0; i + 11 < d.length; i += 12) {
      const p = netFindProxy(d[i]);
      if (!p) continue;
      p.buf.push({
        t: m.ts,
        x: d[i + 1] / 10, y: d[i + 2] / 10, z: d[i + 3] / 10,
        qx: d[i + 4] / 1000, qy: d[i + 5] / 1000, qz: d[i + 6] / 1000, qw: d[i + 7] / 1000,
        f: d[i + 8], hp: d[i + 9], l: d[i + 10], ep: d[i + 11]
      });
      if (p.buf.length > 30) p.buf.splice(0, p.buf.length - 30);
    }
  }

  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  function netGuestUpdateProxies(dt) {
    const renderT = performance.now() + (net.clockOffset || 0) - net.interpDelay * 1000;
    for (const p of enemyPlanes.concat(friendlyEscorts)) {
      if (!p.netProxy || !p.buf.length) continue;
      let a = p.buf[0], b = null;
      for (let i = p.buf.length - 1; i >= 0; i--) {
        if (p.buf[i].t <= renderT) { a = p.buf[i]; b = p.buf[i + 1] || null; break; }
      }
      // Drop old samples
      const ai = p.buf.indexOf(a);
      if (ai > 1) p.buf.splice(0, ai - 1);
      let x = a.x, y = a.y, z = a.z;
      _qa.set(a.qx, a.qy, a.qz, a.qw).normalize();
      if (b && b.ep === a.ep && b.t > a.t) {
        const k = THREE.MathUtils.clamp((renderT - a.t) / (b.t - a.t), 0, 1);
        x += (b.x - a.x) * k; y += (b.y - a.y) * k; z += (b.z - a.z) * k;
        _qb.set(b.qx, b.qy, b.qz, b.qw).normalize();
        _qa.slerp(_qb, k);
        p.velocity.set((b.x - a.x), (b.y - a.y), (b.z - a.z)).multiplyScalar(1000 / (b.t - a.t));
      } else if (b && b.ep !== a.ep) {
        // teleport (respawn / reset): snap to the newer sample
        x = b.x; y = b.y; z = b.z;
        _qa.set(b.qx, b.qy, b.qz, b.qw).normalize();
        a = b;
      }
      const latest = p.buf[p.buf.length - 1];
      const flags = a.f;
      const wasAlive = p.isAlive;
      p.isAlive = Boolean(flags & 1);
      p.isDying = Boolean(flags & 4);
      p.permanentlyDead = Boolean(flags & 16);
      p.hp = Math.round((a.hp / 100) * (p.maxHp || 120));
      p.lives = latest.l;
      p.maxLives = Math.max(p.maxLives, latest.l);
      if (wasAlive && !p.isAlive && !p.isDying) spawnExplosionAt(p.currentPos, 2.3);
      p.currentPos.set(x, y, z);
      p.group.position.copy(p.currentPos);
      p.group.quaternion.copy(_qa);
      p.group.visible = p.isAlive || p.isDying;
      p.gearPos = (flags & 8) ? 1 : 0;
      if (p.modelData && p.modelData.setGearDeployment) p.modelData.setGearDeployment(p.gearPos);
      let hdg = THREE.MathUtils.radToDeg(Math.atan2(p.velocity.x, -p.velocity.z));
      if (hdg < 0) hdg += 360;
      p.headingDeg = hdg;
      if (p.modelData && p.modelData.propellers && p.group.visible) for (const pr of p.modelData.propellers) pr.rotation.z += 80 * dt;
      // Tracers for planes the host says are firing (visual only: the host decides every hit)
      p.isFiring = Boolean(flags & 2) && p.isAlive;
      updateEnemyWeapon(p, dt, p.isFiring);
      const hpRatio = p.maxHp ? p.hp / p.maxHp : 1;
      if (p.group.visible && hpRatio < DAMAGE_SMOKE_HP) emitDamageSmoke(p, p.currentPos, p.group.quaternion, hpRatio, dt);
    }
  }

  // Guest: send our own aircraft to the host
  function netGuestTick(dt) {
    net.stateTimer += dt;
    if (net.stateTimer < NET_STATE_INTERVAL || !airplaneGroup || !net.session) return;
    net.stateTimer = 0;
    const g = airplaneGroup, q = g.quaternion, v = state.flight.velocity;
    const r2 = x => Math.round(x * 100) / 100;
    net.session.send({
      t: 'st',
      p: [r2(g.position.x), r2(g.position.y), r2(g.position.z)],
      q: [q.x, q.y, q.z, q.w].map(x => Math.round(x * 1000) / 1000),
      v: [r2(v.x), r2(v.y), r2(v.z)],
      spd: Math.round(state.flight.airspeed),
      f: (state.inputs.fire && !state.weapons.isJammed && !state.isCrashed) ? 1 : 0,
      a: (!state.isCrashed && g.visible) ? 1 : 0,
      gnd: state.flight.isOnGround ? 1 : 0,
      g: Math.round(state.gear.position * 10) / 10,
      pl: state.selectedAircraft,
      hp: state.playerHp, mhp: state.playerMaxHp,
      l: netLocalLives(),
      sp: state.netEpoch || 0
    });
  }

  function netGuestOnBoom(m) {
    const pos = new THREE.Vector3(m.p[0], m.p[1], m.p[2]);
    if (m.o !== net.myId) {
      playBombExplosionSound();
      spawnShockwave(pos);
      spawnExplosionAt(pos, 4.2);
      if (pos.y <= CONFIG.seaLevel + 1.5) spawnWaterGeyser(pos); else spawnBombCrater(pos);
      spawnBombSmokePlume(pos);
    }
    net.quietHits = m.o !== net.myId;
    net.bombTeam = m.tm;
    applyBombBlastDamage(pos, 75);
    net.quietHits = false;
    net.bombTeam = undefined;
  }

  function netGuestOnFlak(m) {
    flakShells.push({
      team: m.tm === net.myTeam ? 'friendly' : 'enemy', sideKey: null, sourceName: 'FLAK',
      pos: new THREE.Vector3(m.p[0], m.p[1], m.p[2]),
      timer: Math.max(0.05, m.f - (net.session ? net.session.rtt / 2000 : 0)),
      warning: null, visualOnly: true
    });
  }

  // ---------------- Hooks called from the single-player code ----------------
  function netTick(dt) {
    if (!netInMatch()) return;
    if (net.role === 'host') {
      netHostTick(dt);
      netHostCheckMatchEnd();
    } else {
      netGuestTick(dt);
    }
  }

  // Our own aircraft was destroyed (host or guest)
  function netOnLocalCrash(reason) {
    if (!netInMatch()) return;
    if (net.role === 'guest') {
      const la = (net.lastAttacker && performance.now() - net.lastAttacker.at < 10000) ? net.lastAttacker : null;
      net.session.send({ t: 'dead', by: la ? la.by : null, bid: la ? la.bid : null, why: reason });
      net.lastAttacker = null;
      netGuestTick(1); // tell the host right away
    } else {
      const la = (net.lastAttacker && performance.now() - net.lastAttacker.at < 10000) ? net.lastAttacker : null;
      if (la && la.remote) netReportKill(la, state.pilotName);
      else net.host.broadcast({ t: 'ban', x: `💥 ${state.pilotName} went down` });
      net.lastAttacker = null;
    }
  }

  function netOnLocalRespawn() {
    if (!netInMatch()) return;
    state.netEpoch = (state.netEpoch || 0) + 1;
    if (net.role === 'guest') netGuestTick(1);
  }

  // Bomb released on a guest: the host drops the real one (the local bomb is only visual)
  function netOnLocalBomb(pos, vel) {
    if (!netInMatch() || net.role !== 'guest') return false;
    net.session.send({ t: 'bomb', p: [pos.x, pos.y, pos.z], v: [vel.x, vel.y, vel.z] });
    return true;
  }

  // Host: every bomb impact is replayed on the guests (same blast = same damage to bases, AA and ports)
  function netOnHostBombImpact(bomb, pos) {
    if (!netInMatch() || net.role !== 'host') return;
    net.host.broadcast({ t: 'boom', p: [pos.x, pos.y, pos.z], o: bomb.netOwner || 'host', tm: bomb.netTeam !== undefined ? bomb.netTeam : net.myTeam });
  }

  function netOnHostFlakShell(aa, shell) {
    if (!netInMatch() || net.role !== 'host') return;
    net.host.broadcast({ t: 'fk', p: [Math.round(shell.pos.x), Math.round(shell.pos.y), Math.round(shell.pos.z)], f: Math.round(shell.timer * 100) / 100, tm: aa.netTeam });
  }

  function netOnHostBalloonDown(b) {
    if (!netInMatch() || net.role !== 'host') return;
    net.host.broadcast({ t: 'bl', i: barrageBalloons.indexOf(b) });
  }

  function setupNetMenu() {
    const nameInput = document.getElementById('net-name');
    if (nameInput) {
      nameInput.value = netSavedName();
      nameInput.addEventListener('keydown', e => e.stopPropagation());
      nameInput.addEventListener('input', () => { nameInput.value = nameInput.value.toUpperCase().replace(/[<>&"'`]/g, '').slice(0, 14); });
    }
    const codeInput = document.getElementById('net-code');
    if (codeInput) {
      codeInput.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') netJoinRoom(codeInput.value); });
      codeInput.addEventListener('input', () => {
        const c = window.AerialsNet ? window.AerialsNet.cleanCode(codeInput.value) : codeInput.value;
        if (codeInput.value !== c) codeInput.value = c;
      });
    }
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('mode-card-online', () => setMenuScreen('online'));
    on('net-create-btn', () => netCreateRoom());
    on('net-join-btn', () => netJoinRoom(codeInput ? codeInput.value : ''));
    on('room-leave-btn', () => netLeave(''));
    on('room-start-btn', () => netHostStartMatch());
    on('room-copy-btn', async () => {
      const link = netInviteLink();
      try { await navigator.clipboard.writeText(link); netSetStatus('room-status', 'Invite link copied.', ''); }
      catch (e) { netSetStatus('room-status', link, ''); }
    });
    on('room-share-btn', async () => {
      try { await navigator.share({ title: 'Aerials', text: `Join my Aerials room: ${net.room ? net.room.code : ''}`, url: netInviteLink() }); } catch (e) {}
    });
    // Invite link: ?room=1234 opens the online screen and joins
    try {
      const params = new URLSearchParams(location.search);
      const roomCode = params.get('room');
      if (roomCode) {
        params.delete('room');
        const q = params.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
        setTimeout(() => {
          setMenuScreen('online');
          if (codeInput) codeInput.value = window.AerialsNet ? window.AerialsNet.cleanCode(roomCode) : roomCode;
          netJoinRoom(roomCode);
        }, 300);
      }
    } catch (e) {}
  }

  // Expose state and airplaneGroup for testing & debugging
  window.state = state;
  window.getAirplaneGroup = () => airplaneGroup;
  // --- Initialize on Page Load ---
  window.addEventListener('DOMContentLoaded', () => {
    buildScene();
    setupInputs();
    animate();
  });

})();
