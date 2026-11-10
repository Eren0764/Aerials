/**
 * Hungarian Junkers Ju 86K-2 (Weiss Manfréd K-14 Radial Engines) 3D Model Builder
 * Magyar Királyi Honvéd Légierő (Royal Hungarian Air Force)
 * Compatible with Three.js r128+ in both Browser and Node.js
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./three.min.js'));
  } else {
    root.Ju86Builder = factory(root.THREE);
  }
}(this, function (THREE) {
  'use strict';

  // --- Texture Generation Helpers (Browser Canvas) ---
  function createHungarianChevronCanvas() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Transparent / Base
    ctx.clearRect(0, 0, 512, 512);

    // Royal Hungarian Air Force 1938-1941 Chevron Insignia
    // Bold V-chevron: Outer Red, Middle White, Inner Green, with fine black outlines
    ctx.save();
    ctx.translate(256, 256);

    // Outer Red Chevron
    ctx.beginPath();
    ctx.moveTo(0, -220);
    ctx.lineTo(210, 180);
    ctx.lineTo(130, 200);
    ctx.lineTo(0, -60);
    ctx.lineTo(-130, 200);
    ctx.lineTo(-210, 180);
    ctx.closePath();
    ctx.fillStyle = '#ce2939';
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Middle White Chevron
    ctx.beginPath();
    ctx.moveTo(0, -180);
    ctx.lineTo(160, 150);
    ctx.lineTo(110, 165);
    ctx.lineTo(0, -50);
    ctx.lineTo(-110, 165);
    ctx.lineTo(-160, 150);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Inner Green Chevron
    ctx.beginPath();
    ctx.moveTo(0, -140);
    ctx.lineTo(120, 120);
    ctx.lineTo(80, 132);
    ctx.lineTo(0, -38);
    ctx.lineTo(-80, 132);
    ctx.lineTo(-120, 120);
    ctx.closePath();
    ctx.fillStyle = '#356839';
    ctx.fill();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
    return canvas;
  }

  function createHungarianRudderCanvas() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Hungarian National Tricolor (Horizontal bands)
    // Top 1/3: Red (#ce2939)
    ctx.fillStyle = '#ce2939';
    ctx.fillRect(0, 0, 256, 85);

    // Middle 1/3: White (#ffffff)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 85, 256, 86);

    // Bottom 1/3: Green (#356839)
    ctx.fillStyle = '#356839';
    ctx.fillRect(0, 171, 256, 85);

    // Subtle ribbing / rudder hinge lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;
    for (let y = 20; y < 256; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    return canvas;
  }

  function createCamoCanvas(isUnderside) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    if (isUnderside) {
      // Light Azuro / Hellblau Underside
      ctx.fillStyle = '#829bb0';
      ctx.fillRect(0, 0, 512, 512);

      // Fine panel line grid
      ctx.strokeStyle = 'rgba(50, 70, 90, 0.35)';
      ctx.lineWidth = 1.5;
      for (let x = 64; x < 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 512);
        ctx.stroke();
      }
      for (let y = 64; y < 512; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    } else {
      // Hungarian 3-Tone Splinter Camouflage
      // Base: Dark Olive Green
      ctx.fillStyle = '#3d4e39';
      ctx.fillRect(0, 0, 512, 512);

      // Earth Brown geometric camo patches
      ctx.fillStyle = '#4e3e31';
      ctx.beginPath();
      ctx.moveTo(0, 50);
      ctx.lineTo(220, 0);
      ctx.lineTo(310, 180);
      ctx.lineTo(140, 240);
      ctx.lineTo(0, 160);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(340, 120);
      ctx.lineTo(512, 80);
      ctx.lineTo(512, 360);
      ctx.lineTo(410, 420);
      ctx.lineTo(290, 310);
      ctx.closePath();
      ctx.fill();

      // Muted Khaki-Green patches
      ctx.fillStyle = '#485536';
      ctx.beginPath();
      ctx.moveTo(110, 310);
      ctx.lineTo(280, 260);
      ctx.lineTo(330, 470);
      ctx.lineTo(180, 512);
      ctx.lineTo(60, 440);
      ctx.closePath();
      ctx.fill();

      // Panel lines and rivet rows
      ctx.strokeStyle = 'rgba(20, 25, 20, 0.4)';
      ctx.lineWidth = 1.5;
      for (let x = 64; x < 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 512);
        ctx.stroke();
      }
      for (let y = 64; y < 512; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
    }
    return canvas;
  }

  /**
   * Main Builder: createHungarianJu86
   */
  function createHungarianJu86(options) {
    options = options || {};
    const ju86 = new THREE.Group();
    ju86.name = 'Hungarian_Junkers_Ju86K2';

    // Textures (Browser only; null in Node)
    let chevronTex = null, rudderTex = null, camoUpperTex = null, camoUnderTex = null;
    if (typeof document !== 'undefined') {
      const c1 = createHungarianChevronCanvas();
      if (c1) chevronTex = new THREE.CanvasTexture(c1);

      const c2 = createHungarianRudderCanvas();
      if (c2) rudderTex = new THREE.CanvasTexture(c2);

      const c3 = createCamoCanvas(false);
      if (c3) {
        camoUpperTex = new THREE.CanvasTexture(c3);
        camoUpperTex.wrapS = THREE.RepeatWrapping;
        camoUpperTex.wrapT = THREE.RepeatWrapping;
        camoUpperTex.repeat.set(4, 2);
      }

      const c4 = createCamoCanvas(true);
      if (c4) {
        camoUnderTex = new THREE.CanvasTexture(c4);
        camoUnderTex.wrapS = THREE.RepeatWrapping;
        camoUnderTex.wrapT = THREE.RepeatWrapping;
        camoUnderTex.repeat.set(4, 2);
      }
    }

    // --- Materials Palette ---
    const matUpper = new THREE.MeshStandardMaterial({
      color: 0x3d4e39,
      map: camoUpperTex,
      roughness: 0.55,
      metalness: 0.22,
      name: 'Mat_CamoUpper'
    });

    const matBrownCamo = new THREE.MeshStandardMaterial({
      color: 0x4d3e32,
      roughness: 0.6,
      metalness: 0.18,
      name: 'Mat_CamoBrown'
    });

    const matUnderside = new THREE.MeshStandardMaterial({
      color: 0x829bb0,
      map: camoUnderTex,
      roughness: 0.5,
      metalness: 0.15,
      name: 'Mat_Underside'
    });

    const matCowl = new THREE.MeshStandardMaterial({
      color: 0x2e3b2c,
      roughness: 0.45,
      metalness: 0.35,
      name: 'Mat_EngineCowl'
    });

    const matCollectorRing = new THREE.MeshStandardMaterial({
      color: 0x8f623b,
      roughness: 0.35,
      metalness: 0.75,
      name: 'Mat_CollectorRing'
    });

    const matRadialCylinder = new THREE.MeshStandardMaterial({
      color: 0x252a30,
      roughness: 0.6,
      metalness: 0.8,
      name: 'Mat_RadialCylinders'
    });

    const matRadialCrankcase = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.35,
      metalness: 0.7,
      name: 'Mat_RadialCrankcase'
    });

    const matGlass = new THREE.MeshStandardMaterial({
      color: 0xb5d6e8,
      roughness: 0.12,
      metalness: 0.88,
      transparent: true,
      opacity: 0.62,
      name: 'Mat_CockpitGlass'
    });

    const matCockpitFrame = new THREE.MeshStandardMaterial({
      color: 0x2b3829,
      roughness: 0.5,
      metalness: 0.3,
      name: 'Mat_CockpitFrame'
    });

    const matRudder = rudderTex ? new THREE.MeshStandardMaterial({
      map: rudderTex,
      roughness: 0.5,
      name: 'Mat_HungarianRudder'
    }) : new THREE.MeshStandardMaterial({
      color: 0xce2939,
      roughness: 0.5,
      name: 'Mat_HungarianRudder'
    });

    const matHungarianRed = new THREE.MeshStandardMaterial({ color: 0xce2939, roughness: 0.5, name: 'Mat_HunRed' });
    const matHungarianWhite = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.5, name: 'Mat_HunWhite' });
    const matHungarianGreen = new THREE.MeshStandardMaterial({ color: 0x356839, roughness: 0.5, name: 'Mat_HunGreen' });

    const matPropBlade = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      roughness: 0.4,
      metalness: 0.6,
      name: 'Mat_PropellerBlade'
    });

    const matPropTip = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      name: 'Mat_PropellerTip'
    });

    const matSpinner = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.3,
      metalness: 0.8,
      name: 'Mat_Spinner'
    });

    const matTire = new THREE.MeshStandardMaterial({
      color: 0x181c20,
      roughness: 0.9,
      metalness: 0.05,
      name: 'Mat_TireRubber'
    });

    const matStrutChrome = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      roughness: 0.2,
      metalness: 0.9,
      name: 'Mat_StrutChrome'
    });

    const matGunMetal = new THREE.MeshStandardMaterial({
      color: 0x111315,
      roughness: 0.3,
      metalness: 0.95,
      name: 'Mat_GunMetal'
    });

    // ==========================================
    // 1. FUSELAGE HIERARCHY
    // ==========================================
    const fuselageGroup = new THREE.Group();
    fuselageGroup.name = 'Fuselage_Group';

    // 1A. Mid Fuselage (Oval / Rounded Box, streamlined)
    const midGeo = new THREE.CylinderGeometry(1.05, 1.15, 6.2, 16);
    midGeo.scale(0.82, 1.0, 1.05); // Oval section: Width ~1.7m, Height ~2.1m
    midGeo.rotateX(Math.PI / 2);
    const midFuselage = new THREE.Mesh(midGeo, matUpper);
    midFuselage.position.set(0, 0.2, 0.4);
    midFuselage.castShadow = true;
    midFuselage.receiveShadow = true;
    midFuselage.name = 'Fuselage_Mid';
    fuselageGroup.add(midFuselage);

    // Bomb Bay Doors on Belly
    const bombDoorGeo = new THREE.BoxGeometry(0.95, 0.08, 4.2);
    const bombDoors = new THREE.Mesh(bombDoorGeo, matUnderside);
    bombDoors.position.set(0, -0.88, 0.3);
    bombDoors.name = 'Fuselage_BombDoors';
    fuselageGroup.add(bombDoors);

    // Center divider seam on bomb bay
    const bombSeamGeo = new THREE.BoxGeometry(0.04, 0.1, 4.22);
    const bombSeam = new THREE.Mesh(bombSeamGeo, matCockpitFrame);
    bombSeam.position.set(0, -0.88, 0.3);
    fuselageGroup.add(bombSeam);

    // 1B. Forward Cockpit & Nose Transition
    const fwdGeo = new THREE.CylinderGeometry(0.75, 1.05, 3.2, 16);
    fwdGeo.scale(0.84, 1.0, 1.02);
    fwdGeo.rotateX(Math.PI / 2);
    const fwdFuselage = new THREE.Mesh(fwdGeo, matUpper);
    fwdFuselage.position.set(0, 0.26, 4.9);
    fwdFuselage.castShadow = true;
    fwdFuselage.name = 'Fuselage_Forward';
    fuselageGroup.add(fwdFuselage);

    // 1C. Glazed Bombardier / Nose Gunner Station
    // Lower flat bombardier viewing windows
    const bombGlassGeo = new THREE.BoxGeometry(0.9, 0.55, 1.6);
    const bombGlass = new THREE.Mesh(bombGlassGeo, matGlass);
    bombGlass.position.set(0, -0.25, 6.2);
    bombGlass.rotation.x = 0.22;
    bombGlass.name = 'Nose_BombardierGlass';
    fuselageGroup.add(bombGlass);

    // Glazed Nose Cone / Dome
    const noseDomeGeo = new THREE.SphereGeometry(0.68, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    noseDomeGeo.scale(0.95, 0.95, 1.5);
    noseDomeGeo.rotateX(Math.PI / 2);
    const noseDome = new THREE.Mesh(noseDomeGeo, matGlass);
    noseDome.position.set(0, 0.18, 6.4);
    noseDome.name = 'Nose_GlazedTurret';
    fuselageGroup.add(noseDome);

    // Nose Framing Struts
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
      const ribGeo = new THREE.BoxGeometry(0.04, 0.04, 1.4);
      const rib = new THREE.Mesh(ribGeo, matCockpitFrame);
      rib.position.set(Math.cos(angle) * 0.45, 0.18 + Math.sin(angle) * 0.45, 6.7);
      rib.rotation.z = angle;
      fuselageGroup.add(rib);
    }

    // Forward Nose Machine Gun (7.92mm Gebauer / MG 15)
    const noseGunSocketGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const noseGunSocket = new THREE.Mesh(noseGunSocketGeo, matGunMetal);
    noseGunSocket.position.set(0, 0.28, 7.3);
    fuselageGroup.add(noseGunSocket);

    const noseGunBarrelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8);
    noseGunBarrelGeo.rotateX(Math.PI / 2);
    const noseGunBarrel = new THREE.Mesh(noseGunBarrelGeo, matGunMetal);
    noseGunBarrel.position.set(0, 0.28, 7.8);
    noseGunBarrel.name = 'Nose_MachineGun';
    fuselageGroup.add(noseGunBarrel);

    // 1D. Main Cockpit Greenhouse (Pilot & Co-pilot)
    const cockpitGeo = new THREE.BoxGeometry(1.22, 0.95, 2.6);
    const cockpit = new THREE.Mesh(cockpitGeo, matGlass);
    cockpit.position.set(0, 1.05, 3.4);
    cockpit.name = 'Cockpit_GlassCanopy';
    fuselageGroup.add(cockpit);

    // Cockpit Roof and Mullions
    const roofGeo = new THREE.BoxGeometry(1.24, 0.12, 2.62);
    const roof = new THREE.Mesh(roofGeo, matCockpitFrame);
    roof.position.set(0, 1.54, 3.4);
    fuselageGroup.add(roof);

    // Windshield Pillars
    const pillarGeo = new THREE.BoxGeometry(0.08, 0.95, 0.08);
    for (let px of [-0.6, 0, 0.6]) {
      const pillarFwd = new THREE.Mesh(pillarGeo, matCockpitFrame);
      pillarFwd.position.set(px, 1.05, 4.65);
      fuselageGroup.add(pillarFwd);

      const pillarMid = new THREE.Mesh(pillarGeo, matCockpitFrame);
      pillarMid.position.set(px, 1.05, 3.4);
      fuselageGroup.add(pillarMid);

      const pillarAft = new THREE.Mesh(pillarGeo, matCockpitFrame);
      pillarAft.position.set(px, 1.05, 2.15);
      fuselageGroup.add(pillarAft);
    }

    // Cockpit Interior: Pilot and Co-Pilot figures
    for (let side of [-0.3, 0.3]) {
      // Seat
      const seatGeo = new THREE.BoxGeometry(0.35, 0.5, 0.35);
      const seat = new THREE.Mesh(seatGeo, matRadialCrankcase);
      seat.position.set(side, 0.7, 3.4);
      fuselageGroup.add(seat);

      // Pilot Head / Leather Helmet
      const pilotHeadGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const pilotHead = new THREE.Mesh(pilotHeadGeo, matRadialCylinder);
      pilotHead.position.set(side, 1.15, 3.4);
      fuselageGroup.add(pilotHead);

      // Goggles
      const goggleGeo = new THREE.BoxGeometry(0.24, 0.08, 0.1);
      const goggles = new THREE.Mesh(goggleGeo, matGlass);
      goggles.position.set(side, 1.16, 3.55);
      fuselageGroup.add(goggles);
    }

    // Radio Antenna Mast on Cockpit Roof
    const mastGeo = new THREE.CylinderGeometry(0.03, 0.05, 1.1, 6);
    mastGeo.rotateX(-0.15); // Slight rearward rake
    const mast = new THREE.Mesh(mastGeo, matStrutChrome);
    mast.position.set(0, 1.95, 2.4);
    mast.name = 'Cockpit_AntennaMast';
    fuselageGroup.add(mast);

    // 1E. Dorsal Gunner Station (Mid-Upper Fuselage)
    const dorsalBayGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12);
    const dorsalBay = new THREE.Mesh(dorsalBayGeo, matRadialCrankcase);
    dorsalBay.position.set(0, 1.15, -0.6);
    fuselageGroup.add(dorsalBay);

    const dorsalGunGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6);
    dorsalGunGeo.rotateX(-0.5); // Aimed upward and rearward
    const dorsalGun = new THREE.Mesh(dorsalGunGeo, matGunMetal);
    dorsalGun.position.set(0, 1.5, -0.9);
    dorsalGun.name = 'Dorsal_MachineGun';
    fuselageGroup.add(dorsalGun);

    // 1F. Ventral Retractable "Dustbin" Turret (Iconic Ju 86 "Körbchen")
    // Clearly visible extended down in user photo!
    const ventralTurretGroup = new THREE.Group();
    ventralTurretGroup.name = 'Ventral_Turret_Korbchen';

    // Turret cylindrical body
    const turretBodyGeo = new THREE.CylinderGeometry(0.46, 0.44, 0.95, 14);
    const turretBody = new THREE.Mesh(turretBodyGeo, matUnderside);
    turretBody.castShadow = true;
    ventralTurretGroup.add(turretBody);

    // Turret bottom dome
    const turretBottomGeo = new THREE.SphereGeometry(0.44, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const turretBottom = new THREE.Mesh(turretBottomGeo, matUnderside);
    turretBottom.position.y = -0.475;
    ventralTurretGroup.add(turretBottom);

    // Observation Slits / Windows around circumference
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const slitGeo = new THREE.BoxGeometry(0.18, 0.28, 0.08);
      const slit = new THREE.Mesh(slitGeo, matGlass);
      slit.position.set(Math.cos(angle) * 0.43, -0.05, Math.sin(angle) * 0.43);
      slit.rotation.y = -angle;
      ventralTurretGroup.add(slit);
    }

    // Rear / Downward firing 7.92mm MG
    const bellyGunGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.05, 8);
    bellyGunGeo.rotateX(Math.PI / 2 + 0.35); // Pointing backwards and slightly down
    const bellyGun = new THREE.Mesh(bellyGunGeo, matGunMetal);
    bellyGun.position.set(0, -0.22, -0.55);
    bellyGun.name = 'Ventral_MachineGun';
    ventralTurretGroup.add(bellyGun);

    // Position of ventral turret: Default extended as in the photo
    const turretExtendedY = -1.18;
    const turretRetractedY = -0.62;
    ventralTurretGroup.position.set(0, options.deployedTurret !== false ? turretExtendedY : turretRetractedY, -0.9);
    fuselageGroup.add(ventralTurretGroup);

    // 1G. Aft Fuselage (Graceful taper to tail cone)
    const aftGeo = new THREE.CylinderGeometry(1.05, 0.42, 6.8, 16);
    aftGeo.scale(0.8, 0.95, 1.0);
    aftGeo.rotateX(Math.PI / 2);
    const aftFuselage = new THREE.Mesh(aftGeo, matUpper);
    aftFuselage.position.set(0, 0.28, -5.4);
    aftFuselage.castShadow = true;
    aftFuselage.receiveShadow = true;
    aftFuselage.name = 'Fuselage_Aft';
    fuselageGroup.add(aftFuselage);

    // Tail cone aerodynamic fairing
    const tailConeGeo = new THREE.ConeGeometry(0.42, 1.4, 14);
    tailConeGeo.rotateX(-Math.PI / 2);
    const tailCone = new THREE.Mesh(tailConeGeo, matUpper);
    tailCone.position.set(0, 0.3, -9.4);
    fuselageGroup.add(tailCone);

    ju86.add(fuselageGroup);

    // ==========================================
    // 2. MAIN WINGS & JUNKERS "DOPPELFLÜGEL"
    // ==========================================
    const wingGroup = new THREE.Group();
    wingGroup.name = 'Wing_Group';

    // 2A. Center Wing (Zero dihedral, carries fuselage and engine nacelles)
    // Span: 7.6m (from -3.8 to +3.8), Chord: 3.4m, Thickness: 0.52m
    const centerWingGeo = new THREE.BoxGeometry(7.6, 0.48, 3.4);
    const centerWing = new THREE.Mesh(centerWingGeo, matUpper);
    centerWing.position.set(0, -0.22, 1.4);
    centerWing.castShadow = true;
    centerWing.receiveShadow = true;
    centerWing.name = 'Wing_CenterSection';
    wingGroup.add(centerWing);

    // Center Wing Lower Plate (Underside paint)
    const centerWingUnderGeo = new THREE.PlaneGeometry(7.58, 3.38);
    centerWingUnderGeo.rotateX(Math.PI / 2);
    const centerWingUnder = new THREE.Mesh(centerWingUnderGeo, matUnderside);
    centerWingUnder.position.set(0, -0.465, 1.4);
    centerWingUnder.receiveShadow = true;
    wingGroup.add(centerWingUnder);

    // 2B. Outer Wings (Left & Right with ~4.5° Dihedral and authentic Junkers Taper)
    const leftOuterWingGroup = new THREE.Group();
    leftOuterWingGroup.name = 'Wing_Left_OuterGroup';
    leftOuterWingGroup.position.set(-3.8, -0.22, 1.4);
    leftOuterWingGroup.rotation.z = -0.078; // Dihedral ~4.5 degrees

    const rightOuterWingGroup = new THREE.Group();
    rightOuterWingGroup.name = 'Wing_Right_OuterGroup';
    rightOuterWingGroup.position.set(3.8, -0.22, 1.4);
    rightOuterWingGroup.rotation.z = 0.078; // Dihedral ~4.5 degrees

    // Outer wing panel geometry: Span 7.4m, tapering chord from 3.4m to 1.4m
    function buildOuterWingMesh(isRight) {
      const panel = new THREE.Group();

      // Wing main structure using tapered segments
      const segCount = 4;
      const segSpan = 7.4 / segCount;
      for (let s = 0; s < segCount; s++) {
        const t1 = s / segCount;
        const t2 = (s + 1) / segCount;
        const chord1 = 3.4 * (1 - t1 * 0.58);
        const chord2 = 3.4 * (1 - t2 * 0.58);
        const thick1 = 0.46 * (1 - t1 * 0.55);
        const thick2 = 0.46 * (1 - t2 * 0.55);
        const avgChord = (chord1 + chord2) * 0.5;
        const avgThick = (thick1 + thick2) * 0.5;

        const segGeo = new THREE.BoxGeometry(segSpan, avgThick, avgChord);
        const segMesh = new THREE.Mesh(segGeo, matUpper);
        const xPos = (isRight ? 1 : -1) * (s * segSpan + segSpan * 0.5);
        const zShift = - (3.4 - avgChord) * 0.35; // Slight forward sweep on trailing edge
        segMesh.position.set(xPos, 0, zShift);
        segMesh.castShadow = true;
        segMesh.receiveShadow = true;
        panel.add(segMesh);

        // Underside plate
        const underGeo = new THREE.PlaneGeometry(segSpan * 0.99, avgChord * 0.99);
        underGeo.rotateX(Math.PI / 2);
        const underMesh = new THREE.Mesh(underGeo, matUnderside);
        underMesh.position.set(xPos, -avgThick * 0.505, zShift);
        underMesh.receiveShadow = true;
        panel.add(underMesh);
      }

      // Rounded Wingtip Fairing
      const tipX = (isRight ? 1 : -1) * 7.4;
      const tipGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10);
      tipGeo.scale(0.8, 1.0, 1.0);
      tipGeo.rotateX(Math.PI / 2);
      const tip = new THREE.Mesh(tipGeo, matUpper);
      tip.position.set(tipX, 0, -0.65);
      panel.add(tip);

      // Wingtip Navigation Light
      const navLightGeo = new THREE.SphereGeometry(0.09, 8, 8);
      const navMat = new THREE.MeshBasicMaterial({ color: isRight ? 0x10b981 : 0xef4444 });
      const navLight = new THREE.Mesh(navLightGeo, navMat);
      navLight.position.set(tipX + (isRight ? 0.08 : -0.08), 0, -0.4);
      panel.add(navLight);

      // Underwing Hungarian Chevron Insignia (Royal Hungarian Air Force)
      // As seen in the user's photo on the starboard wing!
      const chevronGeo = new THREE.PlaneGeometry(2.4, 2.4);
      chevronGeo.rotateX(Math.PI / 2);
      let chevronMat;
      if (chevronTex) {
        chevronMat = new THREE.MeshBasicMaterial({
          map: chevronTex,
          transparent: true,
          side: THREE.DoubleSide
        });
      } else {
        chevronMat = matHungarianRed;
      }
      const chevronMesh = new THREE.Mesh(chevronGeo, chevronMat);
      // Positioned underneath the outer wing panel
      chevronMesh.position.set((isRight ? 1 : -1) * 4.2, -0.25, -0.3);
      // Angled to match wing airflow
      chevronMesh.rotation.y = isRight ? 0 : Math.PI;
      panel.add(chevronMesh);

      // Pitot tube on port (left) wing leading edge
      if (!isRight) {
        const pitotGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6);
        pitotGeo.rotateX(Math.PI / 2);
        const pitot = new THREE.Mesh(pitotGeo, matStrutChrome);
        pitot.position.set(-6.2, 0, 1.8);
        panel.add(pitot);
      }

      return panel;
    }

    const leftOuterWing = buildOuterWingMesh(false);
    leftOuterWingGroup.add(leftOuterWing);
    wingGroup.add(leftOuterWingGroup);

    const rightOuterWing = buildOuterWingMesh(true);
    rightOuterWingGroup.add(rightOuterWing);
    wingGroup.add(rightOuterWingGroup);

    // ==========================================
    // 2C. JUNKERS "DOPPELFLÜGEL" (DOUBLE WING)
    // Separate auxiliary trailing edge flaps and ailerons slung underneath
    // ==========================================
    // Inboard Flaps (Left & Right)
    const flapGeo = new THREE.BoxGeometry(3.2, 0.1, 0.62);
    const leftFlap = new THREE.Mesh(flapGeo, matUpper);
    leftFlap.position.set(-2.2, -0.42, -0.45);
    leftFlap.name = 'Flap_Left_Inboard';
    wingGroup.add(leftFlap);

    const rightFlap = new THREE.Mesh(flapGeo, matUpper);
    rightFlap.position.set(2.2, -0.42, -0.45);
    rightFlap.name = 'Flap_Right_Inboard';
    wingGroup.add(rightFlap);

    // Outboard Ailerons (Left & Right)
    const aileronGeo = new THREE.BoxGeometry(5.8, 0.09, 0.52);
    const leftAileron = new THREE.Mesh(aileronGeo, matUpper);
    leftAileron.position.set(-3.2, -0.22, -1.25);
    leftAileron.name = 'Aileron_Left_Outboard';
    leftOuterWingGroup.add(leftAileron);

    const rightAileron = new THREE.Mesh(aileronGeo, matUpper);
    rightAileron.position.set(3.2, -0.22, -1.25);
    rightAileron.name = 'Aileron_Right_Outboard';
    rightOuterWingGroup.add(rightAileron);

    // Junkers Aerodynamic Hinge Brackets (supporting the double-wing auxiliary surfaces)
    const hingeGeo = new THREE.BoxGeometry(0.06, 0.18, 0.65);
    hingeGeo.rotateX(0.2);
    // Center wing brackets
    for (let x of [-3.4, -2.2, -1.0, 1.0, 2.2, 3.4]) {
      const hinge = new THREE.Mesh(hingeGeo, matCockpitFrame);
      hinge.position.set(x, -0.36, -0.2);
      wingGroup.add(hinge);
    }
    // Outer wing brackets
    for (let x of [-1.5, -3.2, -4.8]) {
      const hinge = new THREE.Mesh(hingeGeo, matCockpitFrame);
      hinge.position.set(x, -0.18, -0.9);
      leftOuterWingGroup.add(hinge);
    }
    for (let x of [1.5, 3.2, 4.8]) {
      const hinge = new THREE.Mesh(hingeGeo, matCockpitFrame);
      hinge.position.set(x, -0.18, -0.9);
      rightOuterWingGroup.add(hinge);
    }

    ju86.add(wingGroup);

    // ==========================================
    // 3. TWIN RADIAL ENGINES (Weiss Manfréd K-14 / Gnôme-Rhône 14K)
    // Mounted on wings at X = -3.8 and +3.8
    // ==========================================
    const engineGroup = new THREE.Group();
    engineGroup.name = 'Twin_Radial_Engines';

    const propellerMeshes = [];

    function buildRadialEngineNacelle(isRight) {
      const eng = new THREE.Group();
      eng.name = isRight ? 'Engine_Right' : 'Engine_Left';
      const xSign = isRight ? 1 : -1;

      // 3A. Main Nacelle Body (aerodynamic fairing over and under the wing)
      const nacelleBodyGeo = new THREE.CylinderGeometry(0.78, 0.65, 4.6, 16);
      nacelleBodyGeo.rotateX(Math.PI / 2);
      const nacelleBody = new THREE.Mesh(nacelleBodyGeo, matUpper);
      nacelleBody.position.set(0, 0, 1.8);
      nacelleBody.castShadow = true;
      nacelleBody.receiveShadow = true;
      eng.add(nacelleBody);

      // Nacelle underside (houses retractable landing gear well)
      const nacelleBellyGeo = new THREE.BoxGeometry(1.2, 0.65, 3.8);
      const nacelleBelly = new THREE.Mesh(nacelleBellyGeo, matUnderside);
      nacelleBelly.position.set(0, -0.45, 1.8);
      eng.add(nacelleBelly);

      // Nacelle Aft Taper
      const nacelleAftGeo = new THREE.ConeGeometry(0.65, 2.2, 14);
      nacelleAftGeo.rotateX(-Math.PI / 2);
      const nacelleAft = new THREE.Mesh(nacelleAftGeo, matUpper);
      nacelleAft.position.set(0, 0.05, -1.2);
      eng.add(nacelleAft);

      // 3B. Forward Cowling Ring (Large circular Gnôme-Rhône cowl)
      const cowlGeo = new THREE.CylinderGeometry(0.84, 0.82, 1.45, 18, 1, true);
      cowlGeo.rotateX(Math.PI / 2);
      const cowl = new THREE.Mesh(cowlGeo, matCowl);
      cowl.position.set(0, 0, 3.9);
      cowl.castShadow = true;
      eng.add(cowl);

      // Cowl Front Lip (Rounded aerodynamic inlet)
      const cowlLipGeo = new THREE.TorusGeometry(0.78, 0.08, 10, 24);
      const cowlLip = new THREE.Mesh(cowlLipGeo, matCowl);
      cowlLip.position.set(0, 0, 4.62);
      eng.add(cowlLip);

      // Front Exhaust Collector Ring (Authentic bronze/copper heat-burnished ring)
      const collectorRingGeo = new THREE.TorusGeometry(0.74, 0.05, 8, 20);
      const collectorRing = new THREE.Mesh(collectorRingGeo, matCollectorRing);
      collectorRing.position.set(0, 0, 4.58);
      eng.add(collectorRing);

      // Exhaust Pipes along outer side of engine
      const exhaustGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8);
      exhaustGeo.rotateX(Math.PI / 2);
      const exhaust = new THREE.Mesh(exhaustGeo, matCollectorRing);
      exhaust.position.set(xSign * 0.78, -0.15, 2.6);
      eng.add(exhaust);

      // Cowl Cooling Gills (Trailing edge cowl flaps)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const gillGeo = new THREE.BoxGeometry(0.12, 0.04, 0.35);
        const gill = new THREE.Mesh(gillGeo, matCockpitFrame);
        gill.position.set(Math.cos(a) * 0.82, Math.sin(a) * 0.82, 3.2);
        gill.rotation.z = a;
        eng.add(gill);
      }

      // 3C. Visible Internal 14-Cylinder Radial Engine (Two Rows of 7 Cylinders)
      const crankcaseGeo = new THREE.CylinderGeometry(0.32, 0.36, 0.8, 12);
      crankcaseGeo.rotateX(Math.PI / 2);
      const crankcase = new THREE.Mesh(crankcaseGeo, matRadialCrankcase);
      crankcase.position.set(0, 0, 4.0);
      eng.add(crankcase);

      // Radial Cylinder Heads (Front row & Back row)
      const cylinderCount = 7;
      for (let row = 0; row < 2; row++) {
        const rowZ = 4.15 - row * 0.32;
        const rowAngleOffset = (row * Math.PI) / cylinderCount;

        for (let i = 0; i < cylinderCount; i++) {
          const angle = (i * Math.PI * 2) / cylinderCount + rowAngleOffset;
          const cylGroup = new THREE.Group();
          cylGroup.position.set(0, 0, rowZ);
          cylGroup.rotation.z = angle;

          // Cylinder body with cooling fin ribs
          const cylGeo = new THREE.CylinderGeometry(0.12, 0.13, 0.42, 8);
          const cyl = new THREE.Mesh(cylGeo, matRadialCylinder);
          cyl.position.y = 0.52;
          cylGroup.add(cyl);

          // Rocker box / valve cover on top of cylinder
          const rockerGeo = new THREE.BoxGeometry(0.14, 0.09, 0.16);
          const rocker = new THREE.Mesh(rockerGeo, matRadialCrankcase);
          rocker.position.y = 0.73;
          cylGroup.add(rocker);

          // Pushrod tubes
          const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 4);
          const rod = new THREE.Mesh(rodGeo, matStrutChrome);
          rod.position.set(0.04, 0.48, 0.06);
          cylGroup.add(rod);

          eng.add(cylGroup);
        }
      }

      // Air Intake / Oil Cooler Chin Scoop
      const scoopGeo = new THREE.BoxGeometry(0.28, 0.22, 1.2);
      const scoop = new THREE.Mesh(scoopGeo, matCowl);
      scoop.position.set(0, -0.82, 3.8);
      eng.add(scoop);

      // 3D. Three-Bladed Propeller
      const propGroup = new THREE.Group();
      propGroup.name = isRight ? 'Propeller_Right' : 'Propeller_Left';

      // Spinner (Streamlined aerodynamic conical hub)
      const spinnerGeo = new THREE.ConeGeometry(0.36, 0.85, 14);
      spinnerGeo.rotateX(Math.PI / 2);
      const spinner = new THREE.Mesh(spinnerGeo, matSpinner);
      spinner.castShadow = true;
      propGroup.add(spinner);

      // 3 Blades (Diameter 3.4m)
      for (let b = 0; b < 3; b++) {
        const bladeGroup = new THREE.Group();
        bladeGroup.rotation.z = (b * Math.PI * 2) / 3;

        // Blade main body
        const bladeGeo = new THREE.BoxGeometry(0.22, 1.45, 0.04);
        const blade = new THREE.Mesh(bladeGeo, matPropBlade);
        blade.position.y = 0.95;
        blade.rotation.x = 0.22; // Blade pitch angle
        blade.castShadow = true;
        bladeGroup.add(blade);

        // High-Vis Yellow Blade Tip
        const tipGeo = new THREE.BoxGeometry(0.22, 0.25, 0.042);
        const tip = new THREE.Mesh(tipGeo, matPropTip);
        tip.position.y = 1.62;
        tip.rotation.x = 0.22;
        bladeGroup.add(tip);

        propGroup.add(bladeGroup);
      }

      propGroup.position.set(0, 0, 4.88);
      eng.add(propGroup);
      propellerMeshes.push(propGroup);

      return eng;
    }

    const leftEngine = buildRadialEngineNacelle(false);
    leftEngine.position.set(-3.8, -0.22, 0);
    engineGroup.add(leftEngine);

    const rightEngine = buildRadialEngineNacelle(true);
    rightEngine.position.set(3.8, -0.22, 0);
    engineGroup.add(rightEngine);

    ju86.add(engineGroup);

    // ==========================================
    // 4. TAIL UNIT (TWIN FINS & RUDDERS / H-TAIL)
    // Characteristic Junkers Ju 86 twin vertical tail mounted on horizontal stabilizer
    // ==========================================
    const tailGroup = new THREE.Group();
    tailGroup.name = 'Tail_Group';

    // 4A. Horizontal Stabilizer
    // Span: 6.8m (X: -3.4 to +3.4), Chord: 1.65m, Thickness: 0.22m
    const horizGeo = new THREE.BoxGeometry(6.8, 0.2, 1.65);
    const horizStab = new THREE.Mesh(horizGeo, matUpper);
    horizStab.position.set(0, 0.65, -8.0);
    horizStab.castShadow = true;
    horizStab.receiveShadow = true;
    horizStab.name = 'Tail_HorizontalStabilizer';
    tailGroup.add(horizStab);

    // Twin Elevators (Left and Right)
    const elevGeo = new THREE.BoxGeometry(3.1, 0.14, 0.68);
    const leftElevator = new THREE.Mesh(elevGeo, matUpper);
    leftElevator.position.set(-1.7, 0.65, -9.0);
    leftElevator.name = 'Elevator_Left';
    tailGroup.add(leftElevator);

    const rightElevator = new THREE.Mesh(elevGeo, matUpper);
    rightElevator.position.set(1.7, 0.65, -9.0);
    rightElevator.name = 'Elevator_Right';
    tailGroup.add(rightElevator);

    // Stabilizing Under-Brace Struts
    for (let side of [-1, 1]) {
      const strutGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6);
      strutGeo.rotateZ(side * 0.52);
      const strut = new THREE.Mesh(strutGeo, matStrutChrome);
      strut.position.set(side * 1.5, 0.15, -8.0);
      tailGroup.add(strut);
    }

    // 4B. Twin Endplate Vertical Stabilizers (Fins & Rudders)
    // Located at X = -3.4 and +3.4
    const twinRudders = [];

    function buildVerticalTail(isRight) {
      const vTail = new THREE.Group();
      vTail.name = isRight ? 'VerticalTail_Right' : 'VerticalTail_Left';

      // Vertical Fin (Fixed forward portion)
      // Height ~2.3m, Chord ~1.5m
      const finGeo = new THREE.BoxGeometry(0.14, 2.3, 1.25);
      const fin = new THREE.Mesh(finGeo, matUpper);
      fin.position.set(0, 1.25, -7.8);
      fin.castShadow = true;
      vTail.add(fin);

      // Rounded Top Fairing
      const finTopGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.25, 8);
      finTopGeo.rotateX(Math.PI / 2);
      const finTop = new THREE.Mesh(finTopGeo, matUpper);
      finTop.position.set(0, 2.4, -7.8);
      vTail.add(finTop);

      // Movable Rudder with Hungarian National Tricolor
      // Height ~2.2m, Chord ~0.75m
      const rudderGeo = new THREE.BoxGeometry(0.11, 2.2, 0.72);
      const rudder = new THREE.Mesh(rudderGeo, matRudder);
      rudder.position.set(0, 1.25, -8.78);
      rudder.castShadow = true;
      rudder.name = isRight ? 'Rudder_Right' : 'Rudder_Left';

      // Tricolor bands on rudder if procedural
      const bandHeight = 2.18 / 3;
      // Top Band: Red
      const redBandGeo = new THREE.BoxGeometry(0.12, bandHeight, 0.71);
      const redBand = new THREE.Mesh(redBandGeo, matHungarianRed);
      redBand.position.set(0, bandHeight, 0);
      rudder.add(redBand);

      // Middle Band: White
      const whiteBandGeo = new THREE.BoxGeometry(0.12, bandHeight, 0.71);
      const whiteBand = new THREE.Mesh(whiteBandGeo, matHungarianWhite);
      whiteBand.position.set(0, 0, 0);
      rudder.add(whiteBand);

      // Bottom Band: Green
      const greenBandGeo = new THREE.BoxGeometry(0.12, bandHeight, 0.71);
      const greenBand = new THREE.Mesh(greenBandGeo, matHungarianGreen);
      greenBand.position.set(0, -bandHeight, 0);
      rudder.add(greenBand);

      vTail.add(rudder);
      twinRudders.push(rudder);

      return vTail;
    }

    const leftVTail = buildVerticalTail(false);
    leftVTail.position.set(-3.4, 0, 0);
    tailGroup.add(leftVTail);

    const rightVTail = buildVerticalTail(true);
    rightVTail.position.set(3.4, 0, 0);
    tailGroup.add(rightVTail);

    // Aerial Antenna Wires (From Cockpit Mast to Twin Vertical Tails)
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1f2937, linewidth: 1.5 });
    for (let side of [-3.4, 3.4]) {
      const wirePoints = [
        new THREE.Vector3(0, 2.5, 2.4), // Mast top
        new THREE.Vector3(side, 2.3, -7.8) // Fin top
      ];
      const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
      const wire = new THREE.Line(wireGeo, wireMat);
      tailGroup.add(wire);
    }

    ju86.add(tailGroup);

    // ==========================================
    // 5. LANDING GEAR (RETRACTABLE CONVENTIONAL GEAR)
    // Main landing gear under each engine nacelle + steerable tailwheel
    // ==========================================
    const gearGroup = new THREE.Group();
    gearGroup.name = 'Landing_Gear_Group';

    function buildMainGearLeg(isRight) {
      const gearLeg = new THREE.Group();
      gearLeg.name = isRight ? 'Gear_Main_Right' : 'Gear_Main_Left';

      // Twin Main Oleo Shock Struts
      for (let s of [-0.15, 0.15]) {
        const oleoGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8);
        const oleo = new THREE.Mesh(oleoGeo, matStrutChrome);
        oleo.position.set(s, -0.65, 0);
        gearLeg.add(oleo);
      }

      // Torque Scissors (Shock absorber links)
      const scissorGeo = new THREE.BoxGeometry(0.04, 0.28, 0.16);
      const scissor = new THREE.Mesh(scissorGeo, matCockpitFrame);
      scissor.position.set(0, -0.65, 0.12);
      scissor.rotation.x = 0.4;
      gearLeg.add(scissor);

      // Wheel Axle
      const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.46, 8);
      axleGeo.rotateZ(Math.PI / 2);
      const axle = new THREE.Mesh(axleGeo, matCockpitFrame);
      axle.position.set(0, -1.35, 0);
      gearLeg.add(axle);

      // Main Wheel with Heavy Tread Tire
      const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.28, 16);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheel = new THREE.Mesh(wheelGeo, matTire);
      wheel.position.set(0, -1.35, 0);
      wheel.castShadow = true;
      gearLeg.add(wheel);

      // Wheel Rim & Hub
      const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.29, 12);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, matStrutChrome);
      rim.position.set(0, -1.35, 0);
      gearLeg.add(rim);

      // Landing Gear Well Door Fairings
      const doorGeo = new THREE.BoxGeometry(0.05, 1.1, 0.6);
      for (let d of [-0.22, 0.22]) {
        const door = new THREE.Mesh(doorGeo, matUnderside);
        door.position.set(d, -0.5, -0.2);
        gearLeg.add(door);
      }

      return gearLeg;
    }

    const leftMainGear = buildMainGearLeg(false);
    leftMainGear.position.set(-3.8, -0.2, 2.0);
    gearGroup.add(leftMainGear);

    const rightMainGear = buildMainGearLeg(true);
    rightMainGear.position.set(3.8, -0.2, 2.0);
    gearGroup.add(rightMainGear);

    // Tailwheel Assembly at Rear Fuselage
    const tailWheelLeg = new THREE.Group();
    tailWheelLeg.name = 'Gear_TailWheel';

    const tailStrutGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6);
    tailStrutGeo.rotateX(-0.25);
    const tailStrut = new THREE.Mesh(tailStrutGeo, matStrutChrome);
    tailStrut.position.set(0, -0.25, -0.05);
    tailWheelLeg.add(tailStrut);

    const tailWheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10);
    tailWheelGeo.rotateZ(Math.PI / 2);
    const tailWheel = new THREE.Mesh(tailWheelGeo, matTire);
    tailWheel.position.set(0, -0.52, -0.15);
    tailWheel.castShadow = true;
    tailWheelLeg.add(tailWheel);

    tailWheelLeg.position.set(0, -0.3, -7.6);
    gearGroup.add(tailWheelLeg);

    ju86.add(gearGroup);

    // ==========================================
    // RETURN MODEL OBJECT WITH CONTROLLERS
    // ==========================================
    return {
      group: ju86,
      fuselage: fuselageGroup,
      wingGroup: wingGroup,
      engineGroup: engineGroup,
      tailGroup: tailGroup,
      gearGroup: gearGroup,
      propellers: propellerMeshes,
      leftAileron: leftAileron,
      rightAileron: rightAileron,
      leftFlap: leftFlap,
      rightFlap: rightFlap,
      elevators: [leftElevator, rightElevator],
      rudders: twinRudders,
      ventralTurret: ventralTurretGroup,
      materials: {
        camoUpper: matUpper,
        underside: matUnderside,
        rudder: matRudder,
        glass: matGlass,
        cowl: matCowl,
        propBlade: matPropBlade,
        collectorRing: matCollectorRing
      },
      stats: {
        id: 'ju86',
        name: 'Junkers Ju 86K-2',
        nation: 'Royal Hungarian Air Force',
        type: 'Medium Bomber',
        wingspan: 22.50,
        length: 17.87,
        maxSpeed: 375, // km/h
        cruiseSpeed: 290,
        stallSpeed: 125,
        mass: 8200, // kg
        turnRateMultiplier: 0.88,
        rollRateMultiplier: 0.78,
        engineSoundFreq: 75,
        camDist: 21.0,
        camHeight: 5.0,
        cockpitOffset: new THREE.Vector3(0, 1.45, 3.4),
        wingtipSpan: 11.2,
        hardpoints: [
          new THREE.Vector3(0, 0.28, 8.35)
        ],
        weapons: {
          name: '7.92 mm MG 15',
          caliber: 7.92,
          muzzleVelocity: 760, // m/s
          fireRateRpm: 900,
          tracerColor: 0xff9f1c,
          tracerLength: 14.0
        }
      },
      setTurretDeployment: function (ratio) {
        // ratio: 0 (flush) to 1 (fully extended)
        ventralTurretGroup.position.y = THREE.MathUtils.lerp(turretRetractedY, turretExtendedY, ratio);
      },
      setFlapDroop: function (angle) {
        // angle in radians
        leftFlap.rotation.x = angle;
        rightFlap.rotation.x = angle;
      },
      setGearDeployment: function (ratio) {
        if (typeof ratio === 'boolean') ratio = ratio ? 1.0 : 0.0;
        ratio = THREE.MathUtils.clamp(ratio, 0, 1);
        leftMainGear.rotation.x = (1.0 - ratio) * 1.55;
        rightMainGear.rotation.x = (1.0 - ratio) * 1.55;
        tailWheelLeg.position.y = THREE.MathUtils.lerp(-0.05, -0.3, ratio);
        gearGroup.visible = ratio > 0.02;
      }
    };
  }

  return {
    createHungarianJu86: createHungarianJu86,
    createHungarianChevronCanvas: createHungarianChevronCanvas,
    createHungarianRudderCanvas: createHungarianRudderCanvas
  };
}));
