/**
 * WWII Barrage Balloon 3D Model Builder (British Type Z / Caquot Tethered Air Defense Balloon)
 * Compatible with Three.js r128+ in both Browser and Node.js
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./three.min.js'));
  } else {
    root.BarrageBalloonBuilder = factory(root.THREE);
  }
}(this, function (THREE) {
  'use strict';

  function buildBarrageBalloon(options) {
    options = options || {};
    const scale = options.scale || 1.0;
    const balloonGroup = new THREE.Group();
    balloonGroup.name = 'BarrageBalloon_' + (options.id || 'target');

    // --- Materials ---
    // Rubberized aluminum-doped silver canvas fabric (weather-resistant WWII spec)
    const matFabric = new THREE.MeshStandardMaterial({
      color: options.color || 0x94a3b8,
      roughness: 0.65,
      metalness: 0.22,
      name: 'Mat_BalloonFabric'
    });

    const matFabricDark = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.75,
      metalness: 0.15,
      name: 'Mat_BalloonFabricDark'
    });

    const matCable = new THREE.LineBasicMaterial({
      color: 0xc8d1d9,
      linewidth: 2,
      name: 'Mat_MooringCable'
    });

    const matMetal = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.85,
      name: 'Mat_WinchMetal'
    });

    const matRigging = new THREE.LineBasicMaterial({
      color: 0x475569,
      linewidth: 1
    });

    // --- 1. Teardrop Gas Envelope ---
    // Lathe profile for aerodynamic blunt nose and slender tail cone
    const profilePoints = [];
    const segments = 24;
    const totalLength = 18.0;
    const maxRadius = 4.2;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // 0 = tail (aft), 1 = nose (forward)
      // Longitudinal Z position: nose at +10.5m, tail at -7.5m
      const z = (t - 0.40) * totalLength;
      // Teardrop expansion: blunt nose, peak thickness at ~65% forward, tapered tail
      let r = Math.sin(t * Math.PI) * (0.85 + 0.45 * t);
      if (t > 0.90) {
        // Round off the blunt bow
        r *= Math.sqrt(Math.max(0, 1.0 - Math.pow((t - 0.90) / 0.10, 2)));
      }
      r = Math.max(0.08, r * maxRadius);
      profilePoints.push(new THREE.Vector2(r, z));
    }

    const envelopeGeo = new THREE.LatheGeometry(profilePoints, 22);
    // Orient so +Z is nose facing forward into wind, -Z is tail
    envelopeGeo.rotateX(-Math.PI / 2);

    const envelopeMesh = new THREE.Mesh(envelopeGeo, matFabric);
    envelopeMesh.castShadow = true;
    envelopeMesh.receiveShadow = true;
    balloonGroup.add(envelopeMesh);

    // --- 2. Longitudinal Panel Seams / Ribs ---
    // Subtle circumferential reinforcement bands
    for (let ringZ of [-4.5, -1.0, 2.5, 6.0]) {
      const ringGeo = new THREE.TorusGeometry(3.6, 0.04, 6, 24);
      const ringMesh = new THREE.Mesh(ringGeo, matFabricDark);
      ringMesh.position.z = ringZ;
      // Scale ring to match local radius
      let tNorm = (ringZ / totalLength) + 0.40;
      let rNorm = Math.sin(Math.max(0.1, Math.min(0.95, tNorm)) * Math.PI) * 1.1;
      ringMesh.scale.set(rNorm, rNorm, 1);
      balloonGroup.add(ringMesh);
    }

    // --- 3. Empennage Stabilizing Lobe Fins (Iconic 3-fin 120° configuration) ---
    // British & Continental barrage balloons had 3 large pressurized lobes around the tail
    const finGroup = new THREE.Group();
    finGroup.name = 'StabilizerFins';

    const finAngles = [
      0,                  // Top Vertical Fin (0 rad / +Y)
      (2 * Math.PI) / 3,  // Bottom-Left Fin (120 deg)
      (4 * Math.PI) / 3   // Bottom-Right Fin (240 deg)
    ];

    for (let angle of finAngles) {
      const singleFin = new THREE.Group();
      singleFin.rotation.z = angle;

      // Aerodynamic inflated lobe profile
      const finGeo = new THREE.BoxGeometry(0.35, 3.4, 5.8);
      // Shift so base attaches to hull and extends outward along +Y, aft along -Z
      finGeo.translate(0, 2.8, -4.5);
      const finMesh = new THREE.Mesh(finGeo, matFabricDark);
      finMesh.castShadow = true;
      singleFin.add(finMesh);

      // Warning / Camouflage Stripe on fin trailing edge
      const stripeGeo = new THREE.BoxGeometry(0.38, 1.4, 1.2);
      stripeGeo.translate(0, 3.2, -6.6);
      const stripeMat = new THREE.MeshStandardMaterial({
        color: 0xb91c1c, // British/Italian wartime red identification patch
        roughness: 0.6
      });
      const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
      singleFin.add(stripeMesh);

      finGroup.add(singleFin);
    }
    balloonGroup.add(finGroup);

    // --- 4. Catenary Rigging Harness & Bridle Ring ---
    // Bridle lines converge under the belly at (0, -4.5, 0)
    const bridlePos = new THREE.Vector3(0, -4.6, 0.5);
    const riggingCoords = [];

    const attachPoints = [
      new THREE.Vector3(-2.8, -1.8, 4.0),
      new THREE.Vector3(2.8, -1.8, 4.0),
      new THREE.Vector3(-3.2, -1.6, 0.0),
      new THREE.Vector3(3.2, -1.6, 0.0),
      new THREE.Vector3(-2.8, -1.8, -3.5),
      new THREE.Vector3(2.8, -1.8, -3.5)
    ];

    for (let pt of attachPoints) {
      riggingCoords.push(pt.x, pt.y, pt.z);
      riggingCoords.push(bridlePos.x, bridlePos.y, bridlePos.z);
    }

    const riggingGeo = new THREE.BufferGeometry();
    riggingGeo.setAttribute('position', new THREE.Float32BufferAttribute(riggingCoords, 3));
    const riggingLines = new THREE.LineSegments(riggingGeo, matRigging);
    balloonGroup.add(riggingLines);

    // Steel Junction / Mooring Ring
    const ringGeo = new THREE.TorusGeometry(0.35, 0.08, 8, 16);
    const ringMesh = new THREE.Mesh(ringGeo, matMetal);
    ringMesh.position.copy(bridlePos);
    ringMesh.rotation.x = Math.PI / 2;
    balloonGroup.add(ringMesh);

    // Apply overall scale
    if (scale !== 1.0) {
      balloonGroup.scale.set(scale, scale, scale);
    }

    return {
      group: balloonGroup,
      envelopeMesh: envelopeMesh,
      bridlePos: bridlePos,
      dimensions: {
        length: totalLength * scale,
        radius: maxRadius * scale
      }
    };
  }

  // --- Ground Winch Mooring Trailer Station Builder ---
  function buildMooringWinchTruck() {
    const truckGroup = new THREE.Group();
    truckGroup.name = 'MooringWinchStation';

    const matBody = new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.7 });
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x1f242d, metalness: 0.8, roughness: 0.3 });
    const matWheel = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.9 });

    // Chassis frame
    const chassisGeo = new THREE.BoxGeometry(3.2, 0.7, 7.5);
    const chassis = new THREE.Mesh(chassisGeo, matBody);
    chassis.position.y = 0.85;
    truckGroup.add(chassis);

    // Winch Cable Drum
    const drumGeo = new THREE.CylinderGeometry(0.9, 0.9, 1.8, 16);
    drumGeo.rotateZ(Math.PI / 2);
    const drum = new THREE.Mesh(drumGeo, matMetal);
    drum.position.set(0, 1.6, -0.6);
    truckGroup.add(drum);

    // Operator Cabin
    const cabGeo = new THREE.BoxGeometry(2.8, 1.8, 2.4);
    const cab = new THREE.Mesh(cabGeo, matBody);
    cab.position.set(0, 1.8, 2.2);
    truckGroup.add(cab);

    // Wheels (6 wheels for heavy military winch truck)
    const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12);
    wheelGeo.rotateZ(Math.PI / 2);

    for (let z of [-2.4, -0.8, 2.0]) {
      for (let x of [-1.75, 1.75]) {
        const wheel = new THREE.Mesh(wheelGeo, matWheel);
        wheel.position.set(x, 0.55, z);
        truckGroup.add(wheel);
      }
    }

    return truckGroup;
  }

  return {
    buildBarrageBalloon: buildBarrageBalloon,
    buildMooringWinchTruck: buildMooringWinchTruck
  };
}));
