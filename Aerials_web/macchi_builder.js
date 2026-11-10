/**
 * Macchi C.202 Folgore 3D Model Builder
 * Regia Aeronautica (Italian Royal Air Force) / Desert Camouflage
 * Compatible with Three.js r128+ in both Browser and Node.js
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./three.min.js'), require('./macchi_c202_data.js'));
  } else {
    root.MacchiBuilder = factory(root.THREE, root.MacchiC202Data);
  }
}(this, function (THREE, MacchiC202Data) {
  'use strict';

  function createMacchiC202(options) {
    options = options || {};
    const group = new THREE.Group();
    group.name = 'Macchi_C202_Folgore';

    // 1. Get Geometry from pre-transformed Data Buffer
    let geometry = null;
    if (MacchiC202Data && typeof MacchiC202Data.getGeometry === 'function') {
      geometry = MacchiC202Data.getGeometry(THREE);
    } else {
      // Fallback simple fighter geometry if data not loaded
      geometry = new THREE.BoxGeometry(10.58, 2.5, 8.85);
    }

    // 2. Texture & Material
    let texture = null;
    if (MacchiC202Data && typeof MacchiC202Data.getTexture === 'function') {
      texture = MacchiC202Data.getTexture(THREE);
    }
    if (!texture && typeof document !== 'undefined' && typeof THREE.TextureLoader !== 'undefined') {
      try {
        const loader = new THREE.TextureLoader();
        texture = loader.load('macchi_c202.jpg', function (tex) {
          tex.needsUpdate = true;
        });
        if (texture) {
          texture.flipY = true;
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
        }
      } catch (e) {
        console.warn('Could not load macchi_c202.jpg:', e);
      }
    }

    // Italian matte camouflage lacquer finish (Giallo Mimetico sand base, Verde smoke-rings, white band)
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      roughness: 0.65,
      metalness: 0.08,
      name: 'Mat_Macchi_Desert_Camo'
    });

    const airframeMesh = new THREE.Mesh(geometry, material);
    airframeMesh.castShadow = true;
    airframeMesh.receiveShadow = true;
    airframeMesh.name = 'Macchi_Airframe';
    group.add(airframeMesh);

    // 3. Dynamic Spinning Propeller Hub & Disc (Positioned at nose: Z = 4.41, Y = -0.12)
    const propellerGroup = new THREE.Group();
    propellerGroup.name = 'Propeller_C202';
    propellerGroup.position.set(0, -0.12, 4.41);

    // Aerodynamic Propeller Hub Cap
    const spinnerMat = new THREE.MeshStandardMaterial({
      color: 0x1f2428,
      roughness: 0.35,
      metalness: 0.75
    });
    const spinnerGeo = new THREE.CylinderGeometry(0.12, 0.22, 0.16, 16);
    spinnerGeo.rotateX(Math.PI / 2);
    const spinner = new THREE.Mesh(spinnerGeo, spinnerMat);
    spinner.castShadow = true;
    propellerGroup.add(spinner);

    // 3 Propeller Blades (Piaggio P.1001 variable-pitch constant-speed propeller)
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x181a1b,
      roughness: 0.4,
      metalness: 0.6
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.4
    });

    for (let b = 0; b < 3; b++) {
      const bladeArm = new THREE.Group();
      bladeArm.rotation.z = (b * Math.PI * 2) / 3;

      const bladeGeo = new THREE.BoxGeometry(0.18, 1.25, 0.035);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.78;
      blade.rotation.x = 0.25;
      blade.castShadow = true;
      bladeArm.add(blade);

      // Yellow Blade Tip
      const tipGeo = new THREE.BoxGeometry(0.18, 0.22, 0.038);
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.y = 1.35;
      tip.rotation.x = 0.25;
      bladeArm.add(tip);

      propellerGroup.add(bladeArm);
    }

    // High-speed semi-transparent propeller blur disc (visible when engine is running fast)
    const blurDiscGeo = new THREE.CylinderGeometry(1.48, 1.48, 0.04, 24);
    blurDiscGeo.rotateX(Math.PI / 2);
    const blurDiscMat = new THREE.MeshBasicMaterial({
      color: 0x667788,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const blurDisc = new THREE.Mesh(blurDiscGeo, blurDiscMat);
    blurDisc.position.z = 0.1;
    propellerGroup.add(blurDisc);

    group.add(propellerGroup);

    // 3B. Twin 12.7mm Breda-SAFAT Cowling Machine Guns (Firing through propeller arc)
    const matGunMetal = new THREE.MeshStandardMaterial({
      color: 0x1f2328,
      roughness: 0.35,
      metalness: 0.85,
      name: 'Mat_BredaSAFAT'
    });
    for (let side of [-0.22, 0.22]) {
      // Gun Blast Trough Fairing in upper cowling
      const troughGeo = new THREE.BoxGeometry(0.09, 0.06, 1.25);
      const trough = new THREE.Mesh(troughGeo, matGunMetal);
      trough.position.set(side, 0.38, 2.85);
      group.add(trough);

      // Gun Barrel tip protruding forward
      const barrelGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.65, 8);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, matGunMetal);
      barrel.position.set(side, 0.40, 3.45);
      group.add(barrel);
    }

    // 3C. Twin 7.7mm Breda-SAFAT Wing Machine Guns (Leading edge apertures)
    for (let side of [-2.20, 2.20]) {
      const wingBarrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.55, 8);
      wingBarrelGeo.rotateX(Math.PI / 2);
      const wingBarrel = new THREE.Mesh(wingBarrelGeo, matGunMetal);
      wingBarrel.position.set(side, 0.08, 0.65);
      group.add(wingBarrel);
    }

    // 4. Cockpit Gunner / Pilot details (if desired in cockpit camera)
    const pilotHeadGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const pilotMat = new THREE.MeshStandardMaterial({ color: 0x332b24, roughness: 0.8 });
    const pilotHead = new THREE.Mesh(pilotHeadGeo, pilotMat);
    pilotHead.position.set(0, 0.68, 0.15);
    group.add(pilotHead);

    // 5. Retractable Landing Gear (Wide-track Inward Retracting Gear)
    const gearGroup = new THREE.Group();
    gearGroup.name = 'Macchi_Landing_Gear';

    const matStrut = new THREE.MeshStandardMaterial({ color: 0xc8d1d9, metalness: 0.85, roughness: 0.25 });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x1b1f23, roughness: 0.95 });
    const matHub = new THREE.MeshStandardMaterial({ color: 0x768390, metalness: 0.6, roughness: 0.4 });
    const matDoor = new THREE.MeshStandardMaterial({ color: 0x8c734b, roughness: 0.7 }); // Desert sand underside

    function buildMacchiGearLeg(isRight) {
      const leg = new THREE.Group();
      leg.name = isRight ? 'Macchi_Gear_Right' : 'Macchi_Gear_Left';

      // Oleo Shock Strut
      const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8);
      const strut = new THREE.Mesh(strutGeo, matStrut);
      strut.position.y = -0.62;
      leg.add(strut);

      // Torque Scissor link
      const scissorGeo = new THREE.BoxGeometry(0.04, 0.22, 0.12);
      const scissor = new THREE.Mesh(scissorGeo, matHub);
      scissor.position.set(0, -0.65, 0.08);
      scissor.rotation.x = 0.35;
      leg.add(scissor);

      // Wheel Axle
      const axleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8);
      axleGeo.rotateZ(Math.PI / 2);
      const axle = new THREE.Mesh(axleGeo, matHub);
      axle.position.set(0, -1.22, 0);
      leg.add(axle);

      // Main Tire
      const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 16);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, matTire);
      tire.position.set(0, -1.22, 0);
      tire.castShadow = true;
      leg.add(tire);

      // Wheel Hub Rim
      const rimGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.19, 12);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, matHub);
      rim.position.set(0, -1.22, 0);
      leg.add(rim);

      // Aerodynamic Outer Gear Door Fairing
      const doorGeo = new THREE.BoxGeometry(0.03, 1.05, 0.45);
      const door = new THREE.Mesh(doorGeo, matDoor);
      door.position.set(isRight ? 0.12 : -0.12, -0.60, 0);
      leg.add(door);

      return leg;
    }

    const leftMainGear = buildMacchiGearLeg(false);
    leftMainGear.position.set(-1.65, -0.28, 0.45);
    gearGroup.add(leftMainGear);

    const rightMainGear = buildMacchiGearLeg(true);
    rightMainGear.position.set(1.65, -0.28, 0.45);
    gearGroup.add(rightMainGear);

    // Steerable Tailwheel
    const tailWheelLeg = new THREE.Group();
    tailWheelLeg.name = 'Macchi_TailWheel';

    const tailStrutGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6);
    tailStrutGeo.rotateX(-0.25);
    const tailStrut = new THREE.Mesh(tailStrutGeo, matStrut);
    tailStrut.position.set(0, -0.18, -0.05);
    tailWheelLeg.add(tailStrut);

    const tailWheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10);
    tailWheelGeo.rotateZ(Math.PI / 2);
    const tailWheel = new THREE.Mesh(tailWheelGeo, matTire);
    tailWheel.position.set(0, -0.38, -0.12);
    tailWheel.castShadow = true;
    tailWheelLeg.add(tailWheel);

    tailWheelLeg.position.set(0, -0.22, -3.2);
    gearGroup.add(tailWheelLeg);

    group.add(gearGroup);

    return {
      group: group,
      airframe: airframeMesh,
      propellers: [propellerGroup],
      blurDisc: blurDisc,
      gearGroup: gearGroup,
      materials: {
        body: material,
        spinner: spinnerMat
      },
      stats: {
        id: 'c202',
        name: 'Macchi C.202 Folgore',
        nation: 'Regia Aeronautica',
        type: 'Fighter / Interceptor',
        wingspan: 10.58,
        length: 8.85,
        maxSpeed: 600, // km/h
        cruiseSpeed: 430,
        stallSpeed: 140,
        mass: 2930, // kg
        turnRateMultiplier: 1.35,
        rollRateMultiplier: 1.55,
        engineSoundFreq: 115, // High DB 601 V-12 pitch
        camDist: 15.2,
        camHeight: 3.8,
        cockpitOffset: new THREE.Vector3(0, 0.88, 0.25),
        wingtipSpan: 5.29,
        hardpoints: [
          new THREE.Vector3(-0.22, 0.40, 3.80),
          new THREE.Vector3(0.22, 0.40, 3.80),
          new THREE.Vector3(-2.20, 0.08, 0.65),
          new THREE.Vector3(2.20, 0.08, 0.65)
        ],
        weapons: {
          name: '12.7 mm Breda-SAFAT',
          caliber: 12.7,
          muzzleVelocity: 765, // m/s
          fireRateRpm: 750,    // per gun
          tracerColor: 0xffb703,
          tracerLength: 18.0
        }
      },
      setGearDeployment: function (ratio) {
        if (typeof ratio === 'boolean') ratio = ratio ? 1.0 : 0.0;
        ratio = THREE.MathUtils.clamp(ratio, 0, 1);
        // Main gear legs swing inwards into wing root underside
        leftMainGear.rotation.z = (1.0 - ratio) * 1.50;
        rightMainGear.rotation.z = -(1.0 - ratio) * 1.50;
        tailWheelLeg.position.y = THREE.MathUtils.lerp(-0.06, -0.22, ratio);
        gearGroup.visible = ratio > 0.02;
      }
    };
  }

  return {
    createMacchiC202: createMacchiC202
  };
}));
