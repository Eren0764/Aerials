/**
 * WWII Iconic Aircraft 3D Model Builders
 * 1. North American P-51C Mustang ("Red Tail" Tuskegee Airmen) - Higher Speed
 * 2. Mitsubishi A6M2 Zero (IJN Ame-iro Grey) - Higher Maneuverability
 * 3. Messerschmitt Bf 109E ("Yellow 14" Luftwaffe) - Higher Damage
 * 4. Ilyushin Il-2 Sturmovik (Soviet VVS "Flying Tank") - Higher Health
 * 5. Supermarine Spitfire Mk I ("QV" RAF Fighter Command) - All-Rounder
 * 6. Savoia-Marchetti SM.79 Sparviero ("258-6" Regia Aeronautica) - Heavy Bomber
 *
 * Compatible with Three.js r128+ in both Browser and Node.js
 */

(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory(require('./three.min.js'));
  } else {
    root.WW2AircraftBuilders = factory(root.THREE);
  }
}(this, function (THREE) {
  'use strict';

  // =========================================================================
  // --- Procedural Insignia & Marking Canvas Textures ---
  // =========================================================================

  function createUSStarTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);

    // Blue outer outline for bars
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(18, 44, 220, 40);
    // White bars
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(24, 50, 208, 28);

    // Central dark blue roundel
    ctx.beginPath();
    ctx.arc(128, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = '#1e3a8a';
    ctx.fill();

    // 5-pointed white star
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerAngle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const innerAngle = outerAngle + Math.PI / 5;
      const ox = 128 + Math.cos(outerAngle) * 38;
      const oy = 64 + Math.sin(outerAngle) * 38;
      const ix = 128 + Math.cos(innerAngle) * 15;
      const iy = 64 + Math.sin(innerAngle) * 15;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  function createCheckerTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const rows = 4;
    const cols = 16;
    const cw = canvas.width / cols;
    const ch = canvas.height / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#facc15' : '#111827';
        ctx.fillRect(c * cw, r * ch, cw, ch);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createHinomaruTexture(withBorder) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    // Optional thin white border (early A6M2s on grey carried a plain red disc)
    if (withBorder !== false) {
      ctx.beginPath();
      ctx.arc(128, 128, 96, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();
    }

    // Crimson Hinomaru disc
    ctx.beginPath();
    ctx.arc(128, 128, 88, 0, Math.PI * 2);
    ctx.fillStyle = '#a3121c';
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  function createBalkenkreuzTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    // White outer cross
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(92, 16, 72, 224);
    ctx.fillRect(16, 92, 224, 72);

    // Black inner cross
    ctx.fillStyle = '#111827';
    ctx.fillRect(104, 16, 48, 224);
    ctx.fillRect(16, 104, 224, 48);

    return new THREE.CanvasTexture(canvas);
  }

  function createSovietStarTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);

    function drawStar(radius, color) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerAngle = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const innerAngle = outerAngle + Math.PI / 5;
        const ox = 128 + Math.cos(outerAngle) * radius;
        const oy = 128 + Math.sin(outerAngle) * radius;
        const ix = 128 + Math.cos(innerAngle) * (radius * 0.40);
        const iy = 128 + Math.sin(innerAngle) * (radius * 0.40);
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    drawStar(108, '#ffffff');
    drawStar(94, '#dc2626');

    return new THREE.CanvasTexture(canvas);
  }

  // Shared helper for creating propeller + motion blur disc
  // opts.bladeColor (default black), opts.tipColor (default yellow, null = no tip stripe)
  function buildPropellerAssembly(bladeCount, radius, spinnerColor, spinnerLen, zPos, opts) {
    opts = opts || {};
    const propGroup = new THREE.Group();
    propGroup.position.set(0, 0, zPos);

    // Spinner cone
    const spinnerPoints = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const r = Math.sin(t * Math.PI * 0.5) * 0.46;
      const y = (1.0 - t) * spinnerLen;
      spinnerPoints.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    const spinnerGeo = new THREE.LatheGeometry(spinnerPoints, 20);
    spinnerGeo.rotateX(Math.PI / 2);
    const spinnerMat = new THREE.MeshStandardMaterial({
      color: spinnerColor,
      roughness: 0.25,
      metalness: 0.35
    });
    const spinner = new THREE.Mesh(spinnerGeo, spinnerMat);
    propGroup.add(spinner);

    // Paddle blades (widest ~45% out, rounded tip) with optional painted tip stripe
    const bladeMat = new THREE.MeshStandardMaterial({
      color: opts.bladeColor !== undefined ? opts.bladeColor : 0x18181b,
      roughness: 0.45,
      metalness: 0.55
    });
    const tipColor = opts.tipColor === undefined ? 0xfacc15 : opts.tipColor;
    const tipMat = tipColor === null ? null : new THREE.MeshStandardMaterial({ color: tipColor, roughness: 0.5 });
    const rootY = 0.22;
    const tipBand = 0.14;

    function bladeHalfWidth(y) {
      const t = y / radius;
      const t0 = rootY / radius;
      let w = t < 0.45
        ? 0.06 + 0.065 * Math.max(0, (t - t0) / (0.45 - t0))
        : 0.125 - 0.045 * ((t - 0.45) / 0.45);
      if (t > 0.9) w *= Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.9) / 0.1, 2)));
      return Math.max(0, w);
    }

    function bladeGeometry(y0, y1) {
      const pts = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const y = y0 + (y1 - y0) * (i / n);
        pts.push(new THREE.Vector2(-bladeHalfWidth(y), y));
      }
      for (let i = n; i >= 0; i--) {
        const y = y0 + (y1 - y0) * (i / n);
        pts.push(new THREE.Vector2(bladeHalfWidth(y), y));
      }
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(dedupeOutline(pts)), { depth: 0.035, bevelEnabled: false });
      geo.translate(0, 0, -0.0175);
      return geo;
    }

    const bodyGeo = bladeGeometry(rootY, tipMat ? radius - tipBand : radius);
    const tipGeo = tipMat ? bladeGeometry(radius - tipBand, radius) : null;

    for (let i = 0; i < bladeCount; i++) {
      const bHolder = new THREE.Group();
      bHolder.rotation.z = (i * Math.PI * 2) / bladeCount;

      const blade = new THREE.Mesh(bodyGeo, bladeMat);
      blade.rotation.y = 0.22;
      bHolder.add(blade);

      if (tipGeo) {
        const tip = new THREE.Mesh(tipGeo, tipMat);
        tip.rotation.y = 0.22;
        bHolder.add(tip);
      }
      propGroup.add(bHolder);
    }

    // Motion Blur Disc
    const discGeo = new THREE.CircleGeometry(radius, 28);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const blurDisc = new THREE.Mesh(discGeo, discMat);
    blurDisc.position.set(0, 0, zPos + 0.08);

    return { propGroup, blurDisc };
  }

  // Shared helper for retractable main gear + tailwheel
  function buildRetractableGear(trackWidth, strutLen, zPos, tailWheelZ = -3.5) {
    const gearGroup = new THREE.Group();
    const matStrut = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });

    function makeLeg(sideSign) {
      const pivot = new THREE.Group();
      pivot.position.set(sideSign * trackWidth, -0.25, zPos);

      const strutGeo = new THREE.CylinderGeometry(0.055, 0.045, strutLen, 10);
      strutGeo.translate(0, -strutLen / 2, 0);
      const strut = new THREE.Mesh(strutGeo, matStrut);
      pivot.add(strut);

      const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.20, 16);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, matTire);
      tire.position.set(sideSign * 0.10, -strutLen, 0);
      pivot.add(tire);

      return pivot;
    }

    const leftLeg = makeLeg(-1);
    const rightLeg = makeLeg(1);
    gearGroup.add(leftLeg);
    gearGroup.add(rightLeg);

    // Tailwheel
    const tailWheelPivot = new THREE.Group();
    tailWheelPivot.position.set(0, -0.35, tailWheelZ);
    const twTire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.10, 10).rotateZ(Math.PI / 2),
      matTire
    );
    twTire.position.set(0, -0.28, 0);
    tailWheelPivot.add(twTire);
    gearGroup.add(tailWheelPivot);

    function setGearDeployment(ratio) {
      if (typeof ratio === 'boolean') ratio = ratio ? 1.0 : 0.0;
      ratio = THREE.MathUtils.clamp(ratio, 0, 1);
      leftLeg.rotation.z = (1.0 - ratio) * 1.48;
      rightLeg.rotation.z = -(1.0 - ratio) * 1.48;
      tailWheelPivot.rotation.x = -(1.0 - ratio) * 1.2;
      const vis = ratio > 0.02;
      leftLeg.visible = vis;
      rightLeg.visible = vis;
      tailWheelPivot.visible = vis;
    }

    return { gearGroup, setGearDeployment };
  }

  // =========================================================================
  // --- Shared Realistic-Shape Helpers (skins, planforms, hinged surfaces, decals) ---
  // =========================================================================

  // Canvas textures are shared between every copy of a model (player, wingman, enemies, menu photos)
  const textureCache = {};
  function cachedTexture(key, factory) {
    if (!Object.prototype.hasOwnProperty.call(textureCache, key)) textureCache[key] = factory();
    return textureCache[key];
  }

  // Skin with panel lines. On a lathe fuselage: frames = rings along the length, stringers = seams along it.
  function createPanelTexture(baseColor, lineColor, frames, stringers, seed) {
    if (typeof document === 'undefined') return null;
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const rand = makeSeededRandom(seed || 7);
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, S, S);

    const pw = S / stringers;
    const ph = S / frames;
    // Subtle per-panel tint so the skin does not read as one flat colour
    for (let r = 0; r < frames; r++) {
      for (let c = 0; c < stringers; c++) {
        const a = rand() * 0.07;
        ctx.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
        ctx.fillRect(c * pw, r * ph, pw, ph);
      }
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let r = 0; r <= frames; r++) {
      ctx.moveTo(0, r * ph);
      ctx.lineTo(S, r * ph);
    }
    for (let c = 0; c <= stringers; c++) {
      ctx.moveTo(c * pw, 0);
      ctx.lineTo(c * pw, S);
    }
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // Painted camouflage. On a lathe fuselage u runs around it (0 / 1 = belly, 0.5 = spine).
  // o: base, topBand {color,u0,u1}, splinter [{color,count,size,u0?,u1?}], blobs [{color,count,size}],
  //    rings [{color,count,size,width}], mottle [{color,count,size,u0,u1}], under {color,width}, seed
  function createCamoTexture(o) {
    if (typeof document === 'undefined') return null;
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const rand = makeSeededRandom(o.seed || 1);

    ctx.fillStyle = o.base;
    ctx.fillRect(0, 0, S, S);

    if (o.topBand) {
      ctx.fillStyle = o.topBand.color;
      ctx.fillRect(o.topBand.u0 * S, 0, (o.topBand.u1 - o.topBand.u0) * S, S);
    }

    // Straight-edged splinter polygons (Luftwaffe style)
    for (const layer of (o.splinter || [])) {
      const banded = layer.u0 !== undefined;
      ctx.save();
      if (banded) {
        ctx.beginPath();
        ctx.rect(layer.u0 * S, 0, (layer.u1 - layer.u0) * S, S);
        ctx.clip();
      }
      ctx.fillStyle = layer.color;
      for (let b = 0; b < layer.count; b++) {
        const cx = (banded ? layer.u0 + rand() * (layer.u1 - layer.u0) : rand()) * S;
        const cy = rand() * S;
        const n = 4 + Math.floor(rand() * 2);
        const angles = [];
        for (let v = 0; v < n; v++) angles.push(rand() * Math.PI * 2);
        angles.sort((a, c) => a - c);
        ctx.beginPath();
        angles.forEach((a, v) => {
          const r = layer.size * (0.6 + rand() * 0.8);
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Soft-edged blobs (RAF / VVS style)
    for (const layer of (o.blobs || [])) {
      ctx.fillStyle = layer.color;
      for (let b = 0; b < layer.count; b++) {
        const cx = rand() * S;
        const cy = rand() * S;
        const rad = layer.size + rand() * layer.size * 1.18;
        const verts = 10;
        ctx.beginPath();
        for (let v = 0; v <= verts; v++) {
          const a = (v / verts) * Math.PI * 2;
          const r = rad * (0.65 + rand() * 0.55);
          const px = cx + Math.cos(a) * r * 1.4;
          const py = cy + Math.sin(a) * r;
          if (v === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Hand-painted rings / loops (Regia Aeronautica "smoke ring" style)
    for (const layer of (o.rings || [])) {
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.width || 3;
      for (let i = 0; i < layer.count; i++) {
        ctx.beginPath();
        ctx.ellipse(rand() * S, rand() * S, layer.size * (0.6 + rand() * 0.7), layer.size * (0.5 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Sprayed mottle spots
    for (const layer of (o.mottle || [])) {
      ctx.fillStyle = layer.color;
      const u0 = layer.u0 !== undefined ? layer.u0 : 0;
      const u1 = layer.u1 !== undefined ? layer.u1 : 1;
      for (let i = 0; i < layer.count; i++) {
        ctx.beginPath();
        ctx.arc((u0 + rand() * (u1 - u0)) * S, rand() * S, layer.size * (0.5 + rand()), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (o.under) {
      const w = o.under.width * S;
      ctx.fillStyle = o.under.color;
      ctx.fillRect(0, 0, w, S);
      ctx.fillRect(S - w, 0, w, S);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function createTextTexture(text, o) {
    if (typeof document === 'undefined') return null;
    o = o || {};
    const w = o.width || 256;
    const h = o.height || 128;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.font = o.font || 'bold 104px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.strokeWidth || 10;
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(text, w / 2, h / 2 + 4);
    }
    ctx.fillStyle = o.color || '#111827';
    ctx.fillText(text, w / 2, h / 2 + 4);
    return new THREE.CanvasTexture(canvas);
  }

  // Lit, depth-offset material for painted markings
  function decalMat(tex) {
    if (!tex) return new THREE.MeshBasicMaterial({ visible: false });
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      roughness: 0.6,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
  }

  // --- Fuselages: Vector2(radius, z) profiles from tail to nose ---
  function profileRadius(profile, z) {
    if (z <= profile[0].y) return profile[0].x;
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      if (z <= b.y) return a.x + (b.x - a.x) * ((z - a.y) / (b.y - a.y));
    }
    return profile[profile.length - 1].x;
  }

  function latheFromProfile(profile, sx, sy, material, segments) {
    const geo = new THREE.LatheGeometry(profile, segments || 24);
    geo.rotateX(Math.PI / 2);
    geo.scale(sx, sy, 1.0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Painted shell hugging the fuselage between z0..z1; o.phiCenter / o.phiWidth limit it to an arc (PI = spine)
  function fuselageBand(profile, sx, sy, z0, z1, material, o) {
    o = o || {};
    const steps = o.steps || 10;
    const off = o.offset || 0.008;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const z = z0 + (z1 - z0) * (i / steps);
      pts.push(new THREE.Vector2(profileRadius(profile, z) + off, z));
    }
    const width = o.phiWidth || Math.PI * 2;
    const start = o.phiWidth ? o.phiCenter - width / 2 : 0;
    const geo = new THREE.LatheGeometry(pts, o.segments || 24, start, width);
    geo.rotateX(Math.PI / 2);
    geo.scale(sx, sy, 1.0);
    return new THREE.Mesh(geo, material);
  }

  // X of the fuselage side surface at (y, z), for placing side markings and fittings
  function fuselageSideX(profile, sx, sy, z, y) {
    const r = profileRadius(profile, z);
    const k = 1 - Math.pow(y / (r * sy), 2);
    return r * sx * Math.sqrt(Math.max(0, k)) + 0.012;
  }

  function addSideDecals(group, material, w, h, x, y, z) {
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      m.position.set(side * x, y, z);
      m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(m);
    }
  }

  // --- Planforms: le(x) / te(x) give leading / trailing edge Z at span station x >= 0 ---
  // tipRound (0..1) rounds the outer share of the span elliptically onto the mid-chord line.
  function makePlanform(span, le, te, tipRound, rootThick, tipThick) {
    const xs = span * (1 - (tipRound || 0));
    function edges(x) {
      const ax = Math.min(Math.abs(x), span);
      let l = le(ax);
      let t = te(ax);
      if (ax > xs && span > xs) {
        const u = (ax - xs) / (span - xs);
        const k = Math.sqrt(Math.max(0, 1 - u * u));
        const mid = (l + t) / 2;
        const half = (l - t) / 2;
        l = mid + half * k;
        t = mid - half * k;
      }
      return [l, t];
    }
    return {
      span,
      edges,
      thickness(x) {
        return rootThick + (tipThick - rootThick) * Math.min(1, Math.abs(x) / span);
      },
      // Outline between span stations x0..x1 on one side, as Vector2(x, z); samples cluster towards x1
      outline(x0, x1, side, steps) {
        steps = steps || 28;
        const xsAt = [];
        for (let i = 0; i <= steps; i++) {
          const tt = i / steps;
          xsAt.push(x0 + (x1 - x0) * (1 - (1 - tt) * (1 - tt)));
        }
        const pts = [];
        for (const x of xsAt) pts.push(new THREE.Vector2(side * x, edges(x)[0]));
        for (let i = xsAt.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(side * xsAt[i], edges(xsAt[i])[1]));
        return dedupeOutline(pts);
      }
    };
  }

  // Part of a planform whose chord lies inside zMin..zMax (splits fixed surfaces from hinged ones)
  function planformPiece(pf, side, zMin, zMax, steps) {
    steps = steps || 24;
    const clampZ = z => Math.min(zMax, Math.max(zMin, z));
    const N = 160;
    let xa = -1;
    let xb = -1;
    for (let i = 0; i <= N; i++) {
      const x = pf.span * (i / N);
      const e = pf.edges(x);
      if (clampZ(e[0]) - clampZ(e[1]) > 1e-3) {
        if (xa < 0) xa = x;
        xb = x;
      }
    }
    if (xa < 0) return null;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = xa + (xb - xa) * (i / steps);
      pts.push(new THREE.Vector2(side * x, clampZ(pf.edges(x)[0])));
    }
    for (let i = steps; i >= 0; i--) {
      const x = xa + (xb - xa) * (i / steps);
      pts.push(new THREE.Vector2(side * x, clampZ(pf.edges(x)[1])));
    }
    return dedupeOutline(pts);
  }

  // Strip between chord fractions f0..f1 (0 = trailing edge, 1 = leading edge) over span x0..x1
  function chordStrip(pf, side, x0, x1, f0, f1, steps) {
    steps = steps || 12;
    const at = (x, f) => {
      const e = pf.edges(x);
      return e[1] + f * (e[0] - e[1]);
    };
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * (i / steps);
      pts.push(new THREE.Vector2(side * x, at(x, f1)));
    }
    for (let i = steps; i >= 0; i--) {
      const x = x0 + (x1 - x0) * (i / steps);
      pts.push(new THREE.Vector2(side * x, at(x, f0)));
    }
    return dedupeOutline(pts);
  }

  // Flat slab from an outline whose thickness follows the planform taper (root -> tip)
  function taperedSlab(pts, pf, scale) {
    const geo = slabFromOutline(pts, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) * pf.thickness(pos.getX(i)) * (scale || 1));
    }
    geo.computeVertexNormals();
    return geo;
  }

  function planformSlab(pf, side, material) {
    const mesh = new THREE.Mesh(taperedSlab(pf.outline(0, pf.span, side, 32), pf), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // Thin paint skin over span x0..x1 on the top (face 1) or bottom (face -1) of a planform
  function planformSkin(pf, side, x0, x1, face, material, lift) {
    let pts = pf.outline(x0, x1, side, 20);
    if (face > 0) pts = pts.map(p => new THREE.Vector2(p.x, -p.y));
    const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
    geo.rotateX(face > 0 ? -Math.PI / 2 : Math.PI / 2);
    const pos = geo.attributes.position;
    const l = lift || 0.004;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, face * (pf.thickness(pos.getX(i)) / 2 + l));
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, material);
  }

  // Marking lying on the top (face 1) or bottom (face -1) of a planform, image top pointing forward
  function planformDecal(pf, side, x, z, w, h, material, face) {
    const geo = new THREE.PlaneGeometry(w, h);
    if (face > 0) {
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(Math.PI);
    } else {
      geo.rotateX(Math.PI / 2);
    }
    const m = new THREE.Mesh(geo, material);
    m.position.set(side * x, face * (pf.thickness(x) / 2 + 0.015), z);
    return m;
  }

  function planformMidZ(pf, x) {
    const e = pf.edges(x);
    return (e[0] + e[1]) / 2;
  }

  // Wrap a mesh (built in parent coordinates) in a pivot Group at px,py,pz so it rotates about its hinge
  function hingeAt(mesh, px, py, pz) {
    const g = new THREE.Group();
    g.position.set(px, py, pz);
    mesh.position.set(-px, -py, -pz);
    g.add(mesh);
    return g;
  }

  // Aileron on the trailing 25% of chord between x0..x1, standing slightly proud of the wing skin
  function makeAileron(pf, side, x0, x1, material) {
    const geo = taperedSlab(chordStrip(pf, side, x0, x1, 0, 0.25), pf, 1.12);
    const xm = (x0 + x1) / 2;
    const e = pf.edges(xm);
    return hingeAt(new THREE.Mesh(geo, material), side * xm, 0, e[1] + 0.25 * (e[0] - e[1]));
  }

  // Vertical fin + rudder split at hingeZ. pf span = fin height, edges give Z at height h.
  function addFinAndRudder(group, pf, o) {
    const toFin = pts => pts.map(p => new THREE.Vector2(p.y, p.x)); // (h, z) -> (z, h)
    const fin = new THREE.Mesh(finFromOutline(toFin(planformPiece(pf, 1, o.hingeZ, Infinity)), o.thick), o.finMat);
    fin.position.y = o.yBase;
    fin.castShadow = true;
    group.add(fin);

    const rudder = new THREE.Mesh(
      finFromOutline(toFin(planformPiece(pf, 1, -Infinity, o.hingeZ)), o.thick * 0.92),
      o.rudderMat || o.finMat
    );
    const rudderGroup = hingeAt(rudder, 0, 0, o.hingeZ);
    rudderGroup.position.y += o.yBase;
    group.add(rudderGroup);
    return rudderGroup;
  }

  // Horizontal tailplane + elevators split at hingeZ; both elevator halves share one pivot group
  function addStabAndElevator(group, pf, o) {
    const elevatorGroup = new THREE.Group();
    elevatorGroup.position.set(0, o.y, o.hingeZ);
    for (const side of [-1, 1]) {
      const stab = new THREE.Mesh(taperedSlab(planformPiece(pf, side, o.hingeZ, Infinity), pf), o.mat);
      stab.position.y = o.y;
      stab.castShadow = true;
      group.add(stab);

      const elev = new THREE.Mesh(taperedSlab(planformPiece(pf, side, -Infinity, o.hingeZ), pf, 0.92), o.elevMat || o.mat);
      elev.position.set(0, 0, -o.hingeZ);
      elevatorGroup.add(elev);
    }
    group.add(elevatorGroup);
    return elevatorGroup;
  }

  // Half-ellipsoid canopy with arch frames (o.frames = offsets along the length, -1..1) and a spine rail
  function addFramedCanopy(group, o) {
    const glassGeo = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    glassGeo.scale(o.w, o.h, o.len);
    const glass = new THREE.Mesh(glassGeo, o.glass);
    glass.position.set(0, o.y, o.z);
    group.add(glass);

    for (const f of o.frames) {
      const s = Math.sqrt(Math.max(0.04, 1 - f * f));
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 18, Math.PI), o.frame);
      arch.scale.set(o.w * s * 1.02, o.h * s * 1.02, 0.5);
      arch.position.set(0, o.y, o.z + f * o.len);
      group.add(arch);
    }

    const railGeo = new THREE.TorusGeometry(1, 0.025, 6, 28, Math.PI);
    railGeo.rotateY(Math.PI / 2);
    const rail = new THREE.Mesh(railGeo, o.frame);
    rail.scale.set(1, o.h * 1.01, o.len * 1.01);
    rail.position.set(0, o.y, o.z);
    group.add(rail);
  }

  // Angular framed canopy (Bf 109 style): trapezoid-section glass prism with frame rings
  function addPrismCanopy(group, o) {
    const shape = new THREE.Shape();
    shape.moveTo(-o.wBottom / 2, 0);
    shape.lineTo(o.wBottom / 2, 0);
    shape.lineTo(o.wTop / 2, o.h);
    shape.lineTo(-o.wTop / 2, o.h);
    shape.closePath();
    const glass = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: o.z1 - o.z0, bevelEnabled: false }),
      o.glass
    );
    glass.position.set(0, o.y, o.z0);
    group.add(glass);

    const ring = new THREE.Shape();
    ring.moveTo(-o.wBottom / 2 - 0.03, -0.01);
    ring.lineTo(o.wBottom / 2 + 0.03, -0.01);
    ring.lineTo(o.wTop / 2 + 0.03, o.h + 0.03);
    ring.lineTo(-o.wTop / 2 - 0.03, o.h + 0.03);
    ring.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-o.wBottom / 2 + 0.03, 0.04);
    hole.lineTo(o.wBottom / 2 - 0.03, 0.04);
    hole.lineTo(o.wTop / 2 - 0.03, o.h - 0.03);
    hole.lineTo(-o.wTop / 2 + 0.03, o.h - 0.03);
    hole.closePath();
    ring.holes.push(hole);
    const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: 0.05, bevelEnabled: false });
    for (const z of o.frames) {
      const frame = new THREE.Mesh(ringGeo, o.frame);
      frame.position.set(0, o.y, z - 0.025);
      group.add(frame);
    }
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, o.z1 - o.z0), o.frame);
    topRail.position.set(0, o.y + o.h + 0.01, (o.z0 + o.z1) / 2);
    group.add(topRail);
  }

  function strutBetween(a, b, radius, material) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 6), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return m;
  }

  function gunBarrel(radius, length, material) {
    return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8).rotateX(Math.PI / 2), material);
  }

  function pilotHead(x, y, z) {
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.85 })
    );
    head.position.set(x, y, z);
    return head;
  }

  function glassMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0xbfdbfe,
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0.2
    });
  }

  // =========================================================================
  // 1. P-51C MUSTANG ("Red Tail" Tuskegee Airmen) - SPECIALTY: HIGHER SPEED
  // =========================================================================
  function createP51Mustang(opts) {
    const group = new THREE.Group();
    group.name = (opts && opts.bubble) ? 'P51D_Mustang_RedTail' : 'P51_Mustang_RedTail';

    // Bare aluminium with panel lines (moderate metalness: the scene has no env map)
    const fuseTex = cachedTexture('p51_fuse', () => createPanelTexture('#cfd5dc', 'rgba(60,70,82,0.5)', 14, 10, 51));
    const wingTex = cachedTexture('p51_wing', () => {
      const t = createPanelTexture('#c2c9d1', 'rgba(60,70,82,0.45)', 6, 8, 52);
      if (t) t.repeat.set(1 / 2.6, 1 / 1.3);
      return t;
    });
    const matMetal = new THREE.MeshStandardMaterial({ map: fuseTex || null, color: fuseTex ? 0xffffff : 0xcfd5dc, metalness: 0.4, roughness: 0.32 });
    const matWingMetal = new THREE.MeshStandardMaterial({ map: wingTex || null, color: wingTex ? 0xffffff : 0xcfd5dc, metalness: 0.4, roughness: 0.32 });
    const matRed = new THREE.MeshStandardMaterial({ color: 0xc81e1e, metalness: 0.2, roughness: 0.4 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xf5c518, roughness: 0.45 });
    const matOlive = new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.85 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0xaab2bc, metalness: 0.5, roughness: 0.35 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const matExhaust = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6, roughness: 0.6 });
    const matGlass = glassMaterial();

    // 1. Laminar Fuselage, red nose band & olive anti-glare panel
    const FUSE = [
      new THREE.Vector2(0.06, -4.45),
      new THREE.Vector2(0.20, -3.8),
      new THREE.Vector2(0.36, -2.8),
      new THREE.Vector2(0.50, -1.6),
      new THREE.Vector2(0.60, -0.4),
      new THREE.Vector2(0.63, 0.6),
      new THREE.Vector2(0.62, 1.6),
      new THREE.Vector2(0.56, 2.6),
      new THREE.Vector2(0.46, 3.45),
      new THREE.Vector2(0.40, 3.85)
    ];
    const SX = 0.86;
    const SY = 1.14;
    group.add(latheFromProfile(FUSE, SX, SY, matMetal, 26));
    group.add(fuselageBand(FUSE, SX, SY, 3.3, 3.85, matRed));
    group.add(fuselageBand(FUSE, SX, SY, 1.1, 3.3, matOlive, { phiCenter: Math.PI, phiWidth: 0.9 }));

    // Ventral radiator scoop (Meredith-effect duct)
    const SCOOP = [
      new THREE.Vector2(0.04, -2.3),
      new THREE.Vector2(0.22, -1.9),
      new THREE.Vector2(0.33, -1.2),
      new THREE.Vector2(0.34, -0.3),
      new THREE.Vector2(0.31, 0.35)
    ];
    const scoop = latheFromProfile(SCOOP, 1.0, 0.82, matMetal, 18);
    scoop.position.set(0, -0.62, 0);
    group.add(scoop);
    const intake = new THREE.Mesh(new THREE.CircleGeometry(0.29, 18), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    intake.scale.y = 0.82;
    intake.position.set(0, -0.62, 0.351);
    group.add(intake);

    // Packard Merlin exhaust stubs (6 per side)
    for (let side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.12), matExhaust);
        stub.position.set(side * 0.47, 0.22, 2.3 + i * 0.19);
        group.add(stub);
      }
    }

    // 2. P-51C "Birdcage" framed canopy & pilot (P-51D: clear bubble canopy with a single rear frame)
    if (opts && opts.bubble) {
      addFramedCanopy(group, { z: 0.25, y: 0.55, len: 1.15, w: 0.37, h: 0.52, frames: [0.62], glass: matGlass, frame: matFrame });
      group.add(pilotHead(0, 0.76, 0.2));
    } else {
      addFramedCanopy(group, { z: 0.35, y: 0.56, len: 1.0, w: 0.36, h: 0.44, frames: [-0.7, -0.25, 0.2, 0.62], glass: matGlass, frame: matFrame });
      group.add(pilotHead(0, 0.72, 0.25));
    }

    // 3. Laminar-flow wings: yellow ID bands, red tips, 6x .50 cal
    const WING = makePlanform(5.35, x => 1.1 - 0.3 * (x / 5.35), x => -1.15 + 0.85 * (x / 5.35), 0.06, 0.22, 0.08);
    const starMat = decalMat(cachedTexture('us_star', createUSStarTexture));
    let leftAileron = null;
    let rightAileron = null;

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(WING, side, matWingMetal));
      for (let face of [1, -1]) {
        wSide.add(planformSkin(WING, side, 2.85, 3.35, face, matYellow));
        wSide.add(planformSkin(WING, side, 4.85, 5.35, face, matRed));
      }

      for (let gx of [1.85, 2.15, 2.45]) {
        const barrel = gunBarrel(0.022, 0.2, matGun);
        barrel.position.set(side * gx, -0.02, WING.edges(gx)[0] + 0.03);
        wSide.add(barrel);
      }

      // Star-and-bar: upper left wing, lower right wing
      if (side < 0) wSide.add(planformDecal(WING, side, 3.95, planformMidZ(WING, 3.95), 1.4, 0.7, starMat, 1));
      else wSide.add(planformDecal(WING, side, 3.95, planformMidZ(WING, 3.95), 1.4, 0.7, starMat, -1));

      const aileron = makeAileron(WING, side, 3.4, 4.85, matWingMetal);
      wSide.add(aileron);
      if (side < 0) leftAileron = aileron;
      else rightAileron = aileron;

      wSide.rotation.z = side * 0.06; // ~3.5 deg dihedral
      wSide.position.set(0, -0.27, 0.5);
      group.add(wSide);
    }

    // Fuselage markings: "4 [star] 2A" and nose "TUSKEGEE"
    addSideDecals(group, starMat, 1.2, 0.6, fuselageSideX(FUSE, SX, SY, -1.55, 0.05), 0.05, -1.55);
    const codeMat4 = decalMat(cachedTexture('p51_code_4', () => createTextTexture('4', { width: 128, color: '#111827' })));
    addSideDecals(group, codeMat4, 0.4, 0.4, fuselageSideX(FUSE, SX, SY, -2.45, 0.05), 0.05, -2.45);
    const codeMat2A = decalMat(cachedTexture('p51_code_2a', () => createTextTexture('2A', { color: '#111827' })));
    addSideDecals(group, codeMat2A, 0.62, 0.31, fuselageSideX(FUSE, SX, SY, -0.62, 0.05), 0.05, -0.62);
    const nameMat = decalMat(cachedTexture('p51_name', () => createTextTexture('TUSKEGEE', { width: 512, height: 96, font: 'italic bold 64px Georgia, serif', color: '#111827' })));
    addSideDecals(group, nameMat, 0.75, 0.14, fuselageSideX(FUSE, SX, SY, 2.15, 0.05), 0.05, 2.15);

    // 4. Red Tail empennage
    const FIN = makePlanform(1.85, h => -3.2 - 0.8 * (h / 1.85), h => -4.55 + 0.12 * (h / 1.85), 0.3, 0.12, 0.12);
    const rudderGroup = addFinAndRudder(group, FIN, { yBase: 0.1, hingeZ: -4.1, thick: 0.12, finMat: matRed });
    const STAB = makePlanform(1.75, x => -3.45 - 0.2 * (x / 1.75), x => -4.5 + 0.18 * (x / 1.75), 0.25, 0.1, 0.05);
    const elevatorGroup = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -4.15, mat: matRed });

    // 5. 4-Blade Hamilton Standard Propeller + Red Spinner
    const propData = buildPropellerAssembly(4, 1.68, 0xc81e1e, 0.82, 3.85);
    group.add(propData.propGroup);
    group.add(propData.blurDisc);

    // 6. Retractable Landing Gear
    const gearData = buildRetractableGear(1.85, 1.35, 0.85);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers: [propData.propGroup],
      blurDisc: propData.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // 2. MITSUBISHI A6M2 ZERO (IJN Ame-iro Grey) - SPECIALTY: HIGHER MANEUVERABILITY
  // =========================================================================
  function createA6MZero() {
    const group = new THREE.Group();
    group.name = 'A6M2_Zero';

    const fuseTex = cachedTexture('zero_fuse', () => createPanelTexture('#b9b79e', 'rgba(70,72,60,0.45)', 12, 8, 21));
    const wingTex = cachedTexture('zero_wing', () => {
      const t = createPanelTexture('#b9b79e', 'rgba(70,72,60,0.4)', 6, 8, 22);
      if (t) t.repeat.set(1 / 2.4, 1 / 1.3);
      return t;
    });
    const matSkin = new THREE.MeshStandardMaterial({ map: fuseTex || null, color: fuseTex ? 0xffffff : 0xc9c7b0, metalness: 0.15, roughness: 0.5 });
    const matWingSkin = new THREE.MeshStandardMaterial({ map: wingTex || null, color: wingTex ? 0xffffff : 0xc9c7b0, metalness: 0.15, roughness: 0.5 });
    const matCowl = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.4, roughness: 0.32 });
    const matEngine = new THREE.MeshStandardMaterial({ color: 0x5b6170, metalness: 0.75, roughness: 0.4 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x8f9184, roughness: 0.5 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const matGlass = glassMaterial();

    // 1. Long tapered fuselage with black Sakae cowling
    const FUSE = [
      new THREE.Vector2(0.05, -4.35),
      new THREE.Vector2(0.20, -3.6),
      new THREE.Vector2(0.38, -2.5),
      new THREE.Vector2(0.55, -1.2),
      new THREE.Vector2(0.66, 0.2),
      new THREE.Vector2(0.70, 1.4),
      new THREE.Vector2(0.71, 2.4),
      new THREE.Vector2(0.73, 2.9),
      new THREE.Vector2(0.72, 3.4),
      new THREE.Vector2(0.62, 3.78)
    ];
    const SX = 0.92;
    const SY = 1.05;
    group.add(latheFromProfile(FUSE, SX, SY, matSkin, 26));
    group.add(fuselageBand(FUSE, SX, SY, 2.45, 3.78, matCowl, { offset: 0.01 }));

    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.045, 8, 28), matCowl);
    lip.scale.set(SX, SY, 1);
    lip.position.set(0, 0, 3.76);
    group.add(lip);

    // Radial engine face: crankcase + 14 cylinder heads in a ring
    const crankcase = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6 }));
    crankcase.position.set(0, 0, 3.64);
    group.add(crankcase);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.16), matEngine);
      head.position.set(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 3.7);
      head.rotation.z = a - Math.PI / 2;
      group.add(head);
    }

    // Exhaust stubs behind the cowl & twin 7.7mm Type 97 cowl guns
    for (let side of [-1, 1]) {
      const exhaust = gunBarrel(0.05, 0.22, matGun);
      exhaust.position.set(side * 0.64, -0.22, 2.38);
      group.add(exhaust);
      const cowlGun = gunBarrel(0.018, 0.6, matGun);
      cowlGun.position.set(side * 0.22, 0.66, 3.3);
      group.add(cowlGun);
    }

    // 2. Long greenhouse canopy, pilot & antenna mast
    addFramedCanopy(group, { z: 0.2, y: 0.6, len: 1.35, w: 0.38, h: 0.45, frames: [-0.85, -0.5, -0.15, 0.2, 0.5, 0.8], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.76, 0.35));
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.6, 0.06), matSkin);
    mast.position.set(0, 1.08, -1.15);
    mast.rotation.x = -0.12;
    group.add(mast);

    // Centreline drop tank
    const tankGeo = new THREE.SphereGeometry(0.26, 14, 10);
    tankGeo.scale(0.85, 0.85, 3.6);
    const dropTank = new THREE.Mesh(tankGeo, matSkin);
    dropTank.position.set(0, -0.82, 0.65);
    group.add(dropTank);

    // 3. Broad wings with rounded tips (high lift / high agility)
    const WING = makePlanform(5.75, x => 1.15 - 0.12 * (x / 5.75), x => -1.2 + 0.72 * (x / 5.75), 0.22, 0.22, 0.08);
    const hinomaruMat = decalMat(cachedTexture('hinomaru_plain', () => createHinomaruTexture(false)));
    let leftAileron = null;
    let rightAileron = null;

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(WING, side, matWingSkin));

      const cannon = gunBarrel(0.026, 0.55, matGun);
      cannon.position.set(side * 2.25, -0.02, WING.edges(2.25)[0] + 0.16);
      wSide.add(cannon);

      for (let face of [1, -1]) {
        wSide.add(planformDecal(WING, side, 3.7, planformMidZ(WING, 3.7), 1.25, 1.25, hinomaruMat, face));
      }

      const aileron = makeAileron(WING, side, 3.6, 5.0, matWingSkin);
      wSide.add(aileron);
      if (side < 0) leftAileron = aileron;
      else rightAileron = aileron;

      wSide.rotation.z = side * 0.09; // ~5 deg dihedral
      wSide.position.set(0, -0.3, 0.6);
      group.add(wSide);
    }
    addSideDecals(group, hinomaruMat, 0.9, 0.9, fuselageSideX(FUSE, SX, SY, -1.75, 0.05), 0.05, -1.75);

    // 4. Rounded tail surfaces
    const FIN = makePlanform(1.65, h => -3.25 - 0.7 * (h / 1.65), h => -4.35 + 0.05 * (h / 1.65), 0.35, 0.11, 0.11);
    const rudderGroup = addFinAndRudder(group, FIN, { yBase: 0.1, hingeZ: -3.98, thick: 0.11, finMat: matWingSkin });
    const STAB = makePlanform(1.85, x => -3.35 - 0.22 * (x / 1.85), x => -4.2 + 0.15 * (x / 1.85), 0.3, 0.09, 0.05);
    const elevatorGroup = addStabAndElevator(group, STAB, { y: 0.12, hingeZ: -3.92, mat: matWingSkin });

    // 5. 3-Blade Sumitomo propeller (natural metal, red tip) + silver spinner
    const propData = buildPropellerAssembly(3, 1.55, 0xc0c6cc, 0.52, 3.8, { bladeColor: 0xa9afb7, tipColor: 0xb91c1c });
    group.add(propData.propGroup);
    group.add(propData.blurDisc);

    // 6. Retractable Landing Gear
    const gearData = buildRetractableGear(1.75, 1.30, 0.90);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers: [propData.propGroup],
      blurDisc: propData.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // 3. MESSERSCHMITT BF 109E ("Yellow 14" Luftwaffe) - SPECIALTY: HIGHER DAMAGE
  // =========================================================================
  function createBf109() {
    const group = new THREE.Group();
    group.name = 'Messerschmitt_Bf109';

    const RLM71 = '#4d5641'; // Dark Green
    const RLM02 = '#6f7363'; // Grey-Green
    const RLM65 = '#a3b8c9'; // Light Blue

    // Fuselage: splinter spine, mottled light-blue sides, light-blue belly
    const fuseTex = cachedTexture('bf109_fuse', () => createCamoTexture({
      base: RLM65,
      seed: 109,
      topBand: { color: RLM71, u0: 0.38, u1: 0.62 },
      splinter: [{ color: RLM02, count: 7, size: 34, u0: 0.38, u1: 0.62 }],
      mottle: [
        { color: 'rgba(111,115,99,0.55)', count: 110, size: 6, u0: 0.24, u1: 0.38 },
        { color: 'rgba(111,115,99,0.55)', count: 110, size: 6, u0: 0.62, u1: 0.76 },
        { color: 'rgba(77,86,65,0.45)', count: 50, size: 5, u0: 0.26, u1: 0.74 }
      ]
    }));
    const wingTex = cachedTexture('bf109_wing', () => {
      const t = createCamoTexture({ base: RLM71, seed: 1091, splinter: [{ color: RLM02, count: 7, size: 60 }] });
      if (t) t.repeat.set(1 / 4.5, 1 / 2.2);
      return t;
    });
    const finTex = cachedTexture('bf109_fin', () => {
      const t = createCamoTexture({ base: RLM65, seed: 1092, mottle: [{ color: 'rgba(111,115,99,0.6)', count: 140, size: 7 }] });
      if (t) t.repeat.set(1 / 1.4, 1 / 1.4);
      return t;
    });
    const matFuse = new THREE.MeshStandardMaterial({ map: fuseTex || null, color: fuseTex ? 0xffffff : 0x4d5641, roughness: 0.62, metalness: 0.15 });
    const matWing = new THREE.MeshStandardMaterial({ map: wingTex || null, color: wingTex ? 0xffffff : 0x4d5641, roughness: 0.62, metalness: 0.15 });
    const matFin = new THREE.MeshStandardMaterial({ map: finTex || null, color: finTex ? 0xffffff : 0xa3b8c9, roughness: 0.62, metalness: 0.15 });
    const matBlue = new THREE.MeshStandardMaterial({ color: 0xa3b8c9, roughness: 0.6, metalness: 0.1 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xf2c318, roughness: 0.4, metalness: 0.12 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x4d5641, roughness: 0.6 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85, roughness: 0.3 });
    const matGlass = glassMaterial();

    // 1. Slim fuselage with yellow DB 601 cowling
    const FUSE = [
      new THREE.Vector2(0.06, -4.3),
      new THREE.Vector2(0.20, -3.6),
      new THREE.Vector2(0.36, -2.4),
      new THREE.Vector2(0.50, -1.0),
      new THREE.Vector2(0.57, 0.3),
      new THREE.Vector2(0.58, 1.5),
      new THREE.Vector2(0.56, 2.5),
      new THREE.Vector2(0.46, 3.4),
      new THREE.Vector2(0.38, 3.85)
    ];
    const SX = 0.8;
    const SY = 1.14;
    group.add(latheFromProfile(FUSE, SX, SY, matFuse, 26));
    group.add(fuselageBand(FUSE, SX, SY, 1.6, 3.85, matYellow));

    // Chin oil cooler, supercharger intake (port side), inverted-V12 exhausts, MG 17 cowl guns
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.9), matYellow);
    chin.position.set(0, -0.6, 2.6);
    group.add(chin);
    const supercharger = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 12).rotateX(Math.PI / 2), matYellow);
    supercharger.position.set(-fuselageSideX(FUSE, SX, SY, 2.05, 0.05) - 0.03, 0.05, 2.05);
    group.add(supercharger);
    for (let side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.11), matGun);
        stub.position.set(side * fuselageSideX(FUSE, SX, SY, 2.25 + i * 0.17, -0.12), -0.12, 2.25 + i * 0.17);
        group.add(stub);
      }
      const cowlGun = gunBarrel(0.02, 0.5, matGun);
      cowlGun.position.set(side * 0.18, 0.56, 3.25);
      group.add(cowlGun);
    }

    // 2. Angular framed canopy & antenna mast
    addPrismCanopy(group, { z0: -0.5, z1: 1.15, y: 0.5, wBottom: 0.6, wTop: 0.34, h: 0.42, frames: [-0.48, -0.05, 0.4, 0.8, 1.13], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.78, 0.2));
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.06), matFrame);
    mast.position.set(0, 0.95, -0.9);
    mast.rotation.x = -0.1;
    group.add(mast);

    // 3. Straight tapered wings with squared tips, yellow tips, slats & underwing radiators
    const WING = makePlanform(4.85, x => 1.05 - 0.22 * (x / 4.85), x => -1.0 + 0.58 * (x / 4.85), 0.07, 0.2, 0.08);
    const crossMat = decalMat(cachedTexture('balkenkreuz', createBalkenkreuzTexture));
    let leftAileron = null;
    let rightAileron = null;

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(WING, side, matWing));
      wSide.add(planformSkin(WING, side, 0, WING.span, -1, matBlue));
      for (let face of [1, -1]) {
        wSide.add(planformSkin(WING, side, 4.3, 4.85, face, matYellow, 0.008));
        wSide.add(planformDecal(WING, side, 3.25, planformMidZ(WING, 3.25), 0.95, 0.95, crossMat, face));
      }

      const slat = new THREE.Mesh(taperedSlab(chordStrip(WING, side, 2.7, 4.25, 0.86, 1.0), WING, 1.08), matWing);
      wSide.add(slat);

      const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 1.0), matBlue);
      radiator.position.set(side * 1.55, -WING.thickness(1.55) / 2 - 0.07, 0.0);
      wSide.add(radiator);

      const cannon = gunBarrel(0.028, 0.5, matGun);
      cannon.position.set(side * 2.1, -0.02, WING.edges(2.1)[0] + 0.12);
      wSide.add(cannon);

      const aileron = makeAileron(WING, side, 2.8, 4.25, matWing);
      wSide.add(aileron);
      if (side < 0) leftAileron = aileron;
      else rightAileron = aileron;

      wSide.rotation.z = side * 0.065;
      wSide.position.set(0, -0.26, 0.55);
      group.add(wSide);
    }

    // Fuselage cross and yellow "14" (black outline)
    addSideDecals(group, crossMat, 0.82, 0.82, fuselageSideX(FUSE, SX, SY, -1.75, 0.05), 0.05, -1.75);
    const numberMat = decalMat(cachedTexture('bf109_14', () => createTextTexture('14', { color: '#f2c318', stroke: '#111827', strokeWidth: 12 })));
    addSideDecals(group, numberMat, 0.7, 0.35, fuselageSideX(FUSE, SX, SY, -0.85, 0.05), 0.05, -0.85);

    // 4. Fin with yellow rudder; tailplane high on the fin with bracing struts
    const FIN = makePlanform(1.55, h => -3.3 - 0.55 * (h / 1.55), h => -4.42 + 0.04 * (h / 1.55), 0.3, 0.11, 0.11);
    const rudderGroup = addFinAndRudder(group, FIN, { yBase: 0.12, hingeZ: -4.02, thick: 0.11, finMat: matFin, rudderMat: matYellow });
    const STAB = makePlanform(1.6, x => -3.42 - 0.12 * (x / 1.6), x => -4.15 + 0.14 * (x / 1.6), 0.25, 0.08, 0.05);
    const elevatorGroup = addStabAndElevator(group, STAB, { y: 0.62, hingeZ: -3.9, mat: matWing });
    for (let side of [-1, 1]) {
      group.add(strutBetween(
        new THREE.Vector3(side * 0.65, 0.58, -3.72),
        new THREE.Vector3(side * 0.12, 0.12, -3.6),
        0.018, matFrame
      ));
    }

    // 5. 3-Blade VDM propeller (black-green) + dark spinner
    const propData = buildPropellerAssembly(3, 1.52, 0x1c2118, 0.68, 3.85, { bladeColor: 0x2a3125, tipColor: null });
    group.add(propData.propGroup);
    group.add(propData.blurDisc);

    // 6. Narrow-track outward-retracting landing gear
    const gearData = buildRetractableGear(1.25, 1.32, 0.95);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers: [propData.propGroup],
      blurDisc: propData.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // 4. ILYUSHIN IL-2 STURMOVIK ("Flying Tank") - SPECIALTY: HIGHER HEALTH
  // =========================================================================
  function createIl2Sturmovik() {
    const group = new THREE.Group();
    group.name = 'Ilyushin_Il2_Sturmovik';

    // AMT-4 green / AMT-6 black-green upper camo, AMT-7 light blue underside
    const fuseTex = cachedTexture('il2_fuse', () => createCamoTexture({
      base: '#5c6b3a',
      seed: 2,
      blobs: [{ color: '#2b3124', count: 8, size: 26 }],
      under: { color: '#9db7c9', width: 0.2 }
    }));
    const wingTex = cachedTexture('il2_wing', () => {
      const t = createCamoTexture({ base: '#5c6b3a', seed: 3, blobs: [{ color: '#2b3124', count: 7, size: 30 }] });
      if (t) t.repeat.set(1 / 6, 1 / 3);
      return t;
    });
    const matFuse = new THREE.MeshStandardMaterial({ map: fuseTex || null, color: fuseTex ? 0xffffff : 0x5c6b3a, roughness: 0.66, metalness: 0.18 });
    const matWing = new THREE.MeshStandardMaterial({ map: wingTex || null, color: wingTex ? 0xffffff : 0x5c6b3a, roughness: 0.66, metalness: 0.18 });
    const matUnder = new THREE.MeshStandardMaterial({ color: 0x9db7c9, roughness: 0.6, metalness: 0.1 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x4a5a30, roughness: 0.6 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.85, roughness: 0.3 });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const matRocket = new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.55, metalness: 0.3 });
    const matWarhead = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.4, metalness: 0.6 });
    const matGlass = glassMaterial();

    // 1. Long armoured fuselage
    const FUSE = [
      new THREE.Vector2(0.08, -4.85),
      new THREE.Vector2(0.22, -4.0),
      new THREE.Vector2(0.38, -2.8),
      new THREE.Vector2(0.55, -1.4),
      new THREE.Vector2(0.70, 0.0),
      new THREE.Vector2(0.74, 1.2),
      new THREE.Vector2(0.72, 2.2),
      new THREE.Vector2(0.62, 3.2),
      new THREE.Vector2(0.48, 4.0),
      new THREE.Vector2(0.42, 4.2)
    ];
    const SX = 0.92;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matFuse, 26));

    // Engine air intake on the cowl top & AM-38 exhaust stacks
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.8), matFuse);
    intake.position.set(0, 0.8, 2.05);
    group.add(intake);
    for (let side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = 2.4 + i * 0.2;
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.13), matGun);
        stub.position.set(side * fuselageSideX(FUSE, SX, SY, z, 0.2), 0.2, z);
        group.add(stub);
      }
    }

    // 2. Long two-seat canopy, pilot, gunner & rear 12.7mm UBT
    addFramedCanopy(group, { z: 0.1, y: 0.66, len: 1.55, w: 0.42, h: 0.5, frames: [-0.9, -0.6, -0.25, 0.1, 0.45, 0.75, 0.92], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.86, 0.55));
    group.add(pilotHead(0, 0.84, -0.85));
    const rearGun = gunBarrel(0.025, 0.95, matGun);
    rearGun.position.set(0, 1.0, -1.45);
    rearGun.rotation.x = -0.25;
    group.add(rearGun);

    // 3. Wings: straight centre section, swept outer panels, gear pods, cannons & RS-82 rockets
    const WING = makePlanform(
      6.1,
      x => (x < 1.9 ? 1.25 : 1.25 - (x - 1.9) * 0.3),
      x => (x < 1.9 ? -1.1 : -1.1 + (x - 1.9) * 0.08),
      0.1, 0.26, 0.1
    );
    const starMat = decalMat(cachedTexture('soviet_star', createSovietStarTexture));
    let leftAileron = null;
    let rightAileron = null;

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(WING, side, matWing));
      wSide.add(planformSkin(WING, side, 0, WING.span, -1, matUnder));

      // Main-gear nacelle with the wheel left partly exposed when retracted
      const podGeo = new THREE.SphereGeometry(0.3, 14, 10);
      podGeo.scale(1.0, 1.0, 4.3);
      const pod = new THREE.Mesh(podGeo, matWing);
      pod.position.set(side * 1.95, -0.3, -0.2);
      wSide.add(pod);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 16).rotateZ(Math.PI / 2), matTire);
      wheel.position.set(side * 1.95, -0.48, 0.05);
      wSide.add(wheel);

      // 23mm VYa-23 cannon & 7.62mm ShKAS
      const vya = gunBarrel(0.035, 1.0, matGun);
      vya.position.set(side * 2.45, -0.02, WING.edges(2.45)[0] + 0.35);
      wSide.add(vya);
      const shkas = gunBarrel(0.02, 0.45, matGun);
      shkas.position.set(side * 3.1, -0.02, WING.edges(3.1)[0] + 0.12);
      wSide.add(shkas);

      // 4x RS-82 rockets on rails
      for (let rx of [3.45, 3.8, 4.15, 4.5]) {
        const zMid = planformMidZ(WING, rx) + 0.15;
        const yUnder = -WING.thickness(rx) / 2;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.85), matGun);
        rail.position.set(side * rx, yUnder - 0.03, zMid);
        wSide.add(rail);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.7, 10).rotateX(Math.PI / 2), matRocket);
        body.position.set(side * rx, yUnder - 0.1, zMid);
        wSide.add(body);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 10).rotateX(Math.PI / 2), matWarhead);
        nose.position.set(side * rx, yUnder - 0.1, zMid + 0.42);
        wSide.add(nose);
        const fins = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), matRocket);
        fins.scale.set(1, 0.12, 1);
        fins.position.set(side * rx, yUnder - 0.1, zMid - 0.33);
        wSide.add(fins);
      }

      const aileron = makeAileron(WING, side, 4.3, 5.9, matWing);
      wSide.add(aileron);
      if (side < 0) leftAileron = aileron;
      else rightAileron = aileron;

      wSide.rotation.z = side * 0.05;
      wSide.position.set(0, -0.32, 0.5);
      group.add(wSide);
    }

    // Red stars (white outline) on fuselage and fin
    addSideDecals(group, starMat, 0.92, 0.92, fuselageSideX(FUSE, SX, SY, -2.2, 0.05), 0.05, -2.2);

    // 4. Large rounded tail
    const FIN = makePlanform(1.75, h => -3.95 - 0.6 * (h / 1.75), h => -5.05 + 0.08 * (h / 1.75), 0.35, 0.13, 0.13);
    const rudderGroup = addFinAndRudder(group, FIN, { yBase: 0.1, hingeZ: -4.72, thick: 0.13, finMat: matWing });
    addSideDecals(group, starMat, 0.7, 0.7, 0.13 / 2 + 0.008, 0.85, -4.35);
    const STAB = makePlanform(2.0, x => -4.0 - 0.25 * (x / 2.0), x => -5.0 + 0.2 * (x / 2.0), 0.25, 0.1, 0.05);
    const elevatorGroup = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -4.65, mat: matWing });

    // 5. 3-Blade VISh-22 propeller + green spinner
    const propData = buildPropellerAssembly(3, 1.72, 0x4a5a32, 0.76, 4.2, { bladeColor: 0x18181b, tipColor: null });
    group.add(propData.propGroup);
    group.add(propData.blurDisc);

    // 6. Heavy retractable landing gear
    const gearData = buildRetractableGear(1.95, 1.38, 0.85);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers: [propData.propGroup],
      blurDisc: propData.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // 5. SUPERMARINE SPITFIRE MK I ("QV" RAF Fighter Command) - SPECIALTY: ALL-ROUNDER
  // =========================================================================

  // Deterministic RNG so every Spitfire wears the same camouflage pattern
  function makeSeededRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // RAF Temperate Land Scheme: Dark Green base with Dark Earth blobs.
  // skyUnderside: paint lathe underside (u near 0 / 1 = belly) in Sky.
  function createRAFCamoTexture(skyUnderside) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const rand = makeSeededRandom(1940);

    ctx.fillStyle = '#4a5233'; // Dark Green
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#7a6444'; // Dark Earth
    for (let b = 0; b < 7; b++) {
      const cx = rand() * 256;
      const cy = rand() * 256;
      const rad = 34 + rand() * 40;
      const verts = 10;
      ctx.beginPath();
      for (let v = 0; v <= verts; v++) {
        const a = (v / verts) * Math.PI * 2;
        const r = rad * (0.65 + rand() * 0.55);
        const px = cx + Math.cos(a) * r * 1.4;
        const py = cy + Math.sin(a) * r;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    if (skyUnderside) {
      ctx.fillStyle = '#c3cfb0'; // Sky
      ctx.fillRect(0, 0, 50, 256);
      ctx.fillRect(206, 0, 50, 256);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  // rings: [[radiusFrac, cssColor], ...] from outermost to innermost
  function createRAFRoundelTexture(rings) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    for (const [frac, color] of rings) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(64, 64, 62 * frac, 0, Math.PI * 2);
      ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }

  function createSquadronCodeTexture(code) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = '#9ca3af'; // Medium Sea Grey code letters
    ctx.font = 'bold 112px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, 128, 68);
    return new THREE.CanvasTexture(canvas);
  }

  // Red / White / Blue vertical fin flash (red at canvas left)
  function createFinFlashTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const stripes = ['#c81e1e', '#f1f5f9', '#1f2f6b'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = stripes[i];
      ctx.fillRect(i * 32, 0, 32, 128);
    }
    return new THREE.CanvasTexture(canvas);
  }

  function ellipticChord(c0, b, x) {
    const k = 1 - (x * x) / (b * b);
    return k > 0 ? c0 * Math.sqrt(k) : 0;
  }

  // Outline of an elliptical planform between span stations x0..x1 (out along LE, back along TE).
  // x = span, y = chord-forward. leFrac = share of the local chord ahead of y = 0.
  function ellipticOutline(b, c0, leFrac, x0, x1, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * (i / steps);
      pts.push(new THREE.Vector2(x, leFrac * ellipticChord(c0, b, x)));
    }
    for (let i = steps; i >= 0; i--) {
      const x = x0 + (x1 - x0) * (i / steps);
      pts.push(new THREE.Vector2(x, -(1 - leFrac) * ellipticChord(c0, b, x)));
    }
    return dedupeOutline(pts);
  }

  function dedupeOutline(pts) {
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (!last || last.distanceTo(p) > 1e-5) out.push(p);
    }
    if (out.length > 2 && out[0].distanceTo(out[out.length - 1]) < 1e-5) out.pop();
    return out;
  }

  // Horizontal slab from a 2D outline (x -> world X, y -> world Z), centred on world Y = 0
  function slabFromOutline(pts, thickness) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: thickness, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, thickness / 2, 0);
    return geo;
  }

  // Vertical slab from a 2D outline (x -> world Z, y -> world Y), centred on world X = 0
  function finFromOutline(pts, thickness) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: thickness, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    geo.translate(thickness / 2, 0, 0);
    return geo;
  }

  function createSpitfireMk1() {
    const group = new THREE.Group();
    group.name = 'Supermarine_Spitfire_Mk1';

    const wingCamoTex = createRAFCamoTexture(false);
    if (wingCamoTex) wingCamoTex.repeat.set(1 / 5.5, 1 / 2.8); // ExtrudeGeometry UVs are in metres
    const fuseCamoTex = createRAFCamoTexture(true);
    if (fuseCamoTex) fuseCamoTex.repeat.set(1, 2);

    const matWingCamo = new THREE.MeshStandardMaterial({
      map: wingCamoTex || null,
      color: wingCamoTex ? 0xffffff : 0x4a5233,
      roughness: 0.68,
      metalness: 0.15
    });
    const matFuseCamo = new THREE.MeshStandardMaterial({
      map: fuseCamoTex || null,
      color: fuseCamoTex ? 0xffffff : 0x4a5233,
      roughness: 0.66,
      metalness: 0.15
    });
    const matGreen = new THREE.MeshStandardMaterial({ color: 0x4a5233, roughness: 0.68, metalness: 0.15 });
    const matSky = new THREE.MeshStandardMaterial({ color: 0xc3cfb0, roughness: 0.7, metalness: 0.1 });
    const matRedPatch = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 });
    const matGlass = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.42,
      roughness: 0.1,
      metalness: 0.1
    });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });

    // 1. Slim Fuselage with long Merlin nose
    const fusePts = [
      new THREE.Vector2(0.07, -4.5),
      new THREE.Vector2(0.22, -3.6),
      new THREE.Vector2(0.38, -2.2),
      new THREE.Vector2(0.50, -0.8),
      new THREE.Vector2(0.56, 0.4),
      new THREE.Vector2(0.56, 1.6),
      new THREE.Vector2(0.50, 2.8),
      new THREE.Vector2(0.42, 4.05)
    ];
    const fuseGeo = new THREE.LatheGeometry(fusePts, 22);
    fuseGeo.rotateX(Math.PI / 2);
    fuseGeo.scale(0.82, 1.12, 1.0);
    const fuselage = new THREE.Mesh(fuseGeo, matFuseCamo);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    group.add(fuselage);

    // Rolls-Royce Merlin Exhaust Stubs (6 per side)
    for (let side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.13), matGun);
        stub.position.set(side * 0.44, 0.20, 2.15 + i * 0.2);
        group.add(stub);
      }
    }

    // Starboard Underwing Radiator & Port Oil Cooler (asymmetric, Mk I)
    const radiator = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.30, 1.15), matSky);
    radiator.position.set(1.15, -0.50, 0.15);
    group.add(radiator);
    const oilCooler = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.75, 10).rotateX(Math.PI / 2),
      matSky
    );
    oilCooler.position.set(-1.05, -0.46, 0.35);
    group.add(oilCooler);

    // 2. Blown "Malcolm Hood" Canopy, Pilot & Antenna Mast
    const canopyGeo = new THREE.SphereGeometry(0.42, 16, 12);
    canopyGeo.scale(0.78, 0.82, 2.2);
    const canopy = new THREE.Mesh(canopyGeo, matGlass);
    canopy.position.set(0, 0.64, -0.05);
    group.add(canopy);

    const pilotHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.8 })
    );
    pilotHead.position.set(0, 0.68, -0.05);
    group.add(pilotHead);

    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.55, 0.07), matGreen);
    mast.position.set(0, 0.88, -1.15);
    mast.rotation.x = -0.28;
    group.add(mast);

    // 3. Iconic Elliptical Wings (8x .303 Browning, red-doped gun ports)
    const WING_B = 5.35;
    const WING_C0 = 1.95;
    const WING_LE = 0.42;
    const WING_T = 0.13;
    const roundelBTex = createRAFRoundelTexture([[1, '#1f2f6b'], [0.42, '#c81e1e']]);
    const roundelBMat = roundelBTex
      ? new THREE.MeshBasicMaterial({ map: roundelBTex, transparent: true, depthWrite: false })
      : new THREE.MeshBasicMaterial({ color: 0x1f2f6b });

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      const outline = ellipticOutline(WING_B, WING_C0, WING_LE, 0, side * WING_B, 28);

      const wingMesh = new THREE.Mesh(slabFromOutline(outline, WING_T), matWingCamo);
      wingMesh.castShadow = true;
      wingMesh.receiveShadow = true;
      wSide.add(wingMesh);

      // Sky underside skin
      const underGeo = new THREE.ShapeGeometry(new THREE.Shape(outline));
      underGeo.rotateX(Math.PI / 2);
      const underside = new THREE.Mesh(underGeo, matSky);
      underside.position.y = -WING_T / 2 - 0.004;
      wSide.add(underside);

      // Gun ports with red fabric patches along the leading edge
      for (let gx of [1.85, 2.15, 2.45, 2.75]) {
        const leZ = WING_LE * ellipticChord(WING_C0, WING_B, gx);
        const patch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), matRedPatch);
        patch.position.set(side * gx, 0, leZ - 0.02);
        wSide.add(patch);
        const muzzle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6).rotateX(Math.PI / 2),
          matGun
        );
        muzzle.position.set(side * gx, -0.02, leZ + 0.04);
        wSide.add(muzzle);
      }

      // Type B upper wing roundel
      const roundel = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), roundelBMat);
      roundel.position.set(side * 3.25, WING_T / 2 + 0.006, 0.05);
      wSide.add(roundel);

      wSide.rotation.z = side * 0.06; // ~3.5 deg dihedral
      wSide.position.set(0, -0.28, 0.55);
      group.add(wSide);
    }

    // Ailerons
    const leftAileron = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.26), matGreen);
    leftAileron.position.set(-3.6, -0.06, -0.12);
    group.add(leftAileron);

    const rightAileron = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.26), matGreen);
    rightAileron.position.set(3.6, -0.06, -0.12);
    group.add(rightAileron);

    // 4. Fuselage Markings: Type A1 roundel + "QV" squadron code (both sides)
    const roundelA1Tex = createRAFRoundelTexture([
      [1, '#facc15'], [0.83, '#1f2f6b'], [0.55, '#f1f5f9'], [0.24, '#c81e1e']
    ]);
    const codeTex = createSquadronCodeTexture('QV');
    for (let side of [-1, 1]) {
      const rot = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (roundelA1Tex) {
        const fRoundel = new THREE.Mesh(
          new THREE.PlaneGeometry(0.66, 0.66),
          new THREE.MeshBasicMaterial({ map: roundelA1Tex, transparent: true, depthWrite: false })
        );
        fRoundel.position.set(side * 0.36, 0.04, -1.75);
        fRoundel.rotation.y = rot;
        group.add(fRoundel);
      }
      if (codeTex) {
        const fCode = new THREE.Mesh(
          new THREE.PlaneGeometry(0.76, 0.38),
          new THREE.MeshBasicMaterial({ map: codeTex, transparent: true, depthWrite: false })
        );
        fCode.position.set(side * 0.43, 0.02, -0.80);
        fCode.rotation.y = rot;
        group.add(fCode);
      }
    }

    // 5. Elliptical Tail: fin + rudder split at the hinge line, tailplane + elevator
    const TAIL_Z = -3.95;
    const FIN_A = 0.64;
    const FIN_H = 1.5;
    const RUDDER_HINGE = -0.12;
    const FIN_T = 0.11;
    function finOutline(x0, x1) {
      const pts = [];
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const x = x1 + (x0 - x1) * (i / steps);
        const k = 1 - (x * x) / (FIN_A * FIN_A);
        pts.push(new THREE.Vector2(x, k > 0 ? FIN_H * Math.sqrt(k) : 0));
      }
      pts.push(new THREE.Vector2(x0, 0));
      pts.push(new THREE.Vector2(x1, 0));
      return dedupeOutline(pts);
    }

    const fin = new THREE.Mesh(finFromOutline(finOutline(RUDDER_HINGE, FIN_A), FIN_T), matFuseCamo);
    fin.position.set(0, 0.22, TAIL_Z);
    group.add(fin);

    const rudderGroup = new THREE.Group();
    rudderGroup.position.set(0, 0.22, TAIL_Z + RUDDER_HINGE);
    const rudderGeo = finFromOutline(finOutline(-FIN_A, RUDDER_HINGE), FIN_T * 0.9);
    rudderGeo.translate(0, 0, -RUDDER_HINGE);
    rudderGroup.add(new THREE.Mesh(rudderGeo, matGreen));
    group.add(rudderGroup);

    // Fin flash ahead of the rudder hinge (red stripe forward on both sides)
    const flashTex = createFinFlashTexture();
    if (flashTex) {
      for (let side of [-1, 1]) {
        const tex = side > 0 ? flashTex : flashTex.clone();
        if (side < 0) {
          tex.wrapS = THREE.RepeatWrapping;
          tex.repeat.x = -1;
          tex.needsUpdate = true;
        }
        const flash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.42, 0.62),
          new THREE.MeshBasicMaterial({ map: tex })
        );
        flash.position.set(side * (FIN_T / 2 + 0.004), 0.62, TAIL_Z + 0.12);
        flash.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(flash);
      }
    }

    const STAB_B = 1.75;
    const STAB_C0 = 0.95;
    const STAB_LE = 0.45;
    const ELEV_HINGE = -0.30;
    // Span stations where the trailing edge reaches the hinge line
    const hingeX = STAB_B * Math.sqrt(1 - Math.pow(-ELEV_HINGE / ((1 - STAB_LE) * STAB_C0), 2));

    const stabPts = [];
    const sSteps = 24;
    for (let i = 0; i <= sSteps; i++) { // leading edge, port tip -> starboard tip
      const x = -STAB_B + (2 * STAB_B) * (i / sSteps);
      stabPts.push(new THREE.Vector2(x, STAB_LE * ellipticChord(STAB_C0, STAB_B, x)));
    }
    for (let i = 0; i <= 6; i++) { // starboard trailing edge back to the hinge
      const x = STAB_B + (hingeX - STAB_B) * (i / 6);
      stabPts.push(new THREE.Vector2(x, -(1 - STAB_LE) * ellipticChord(STAB_C0, STAB_B, x)));
    }
    stabPts.push(new THREE.Vector2(-hingeX, ELEV_HINGE)); // hinge line across
    for (let i = 0; i <= 6; i++) { // port trailing edge out to the tip
      const x = -hingeX + (hingeX - STAB_B) * (i / 6);
      stabPts.push(new THREE.Vector2(x, -(1 - STAB_LE) * ellipticChord(STAB_C0, STAB_B, x)));
    }
    const hStab = new THREE.Mesh(slabFromOutline(dedupeOutline(stabPts), 0.06), matWingCamo);
    hStab.position.set(0, 0.22, TAIL_Z);
    group.add(hStab);

    const elevPts = [new THREE.Vector2(-hingeX, ELEV_HINGE), new THREE.Vector2(hingeX, ELEV_HINGE)];
    for (let i = 0; i <= 16; i++) {
      const x = hingeX - (2 * hingeX) * (i / 16);
      elevPts.push(new THREE.Vector2(x, -(1 - STAB_LE) * ellipticChord(STAB_C0, STAB_B, x)));
    }
    const elevGeo = slabFromOutline(dedupeOutline(elevPts), 0.055);
    elevGeo.translate(0, 0, -ELEV_HINGE);
    const elevatorGroup = new THREE.Group();
    elevatorGroup.position.set(0, 0.22, TAIL_Z + ELEV_HINGE);
    elevatorGroup.add(new THREE.Mesh(elevGeo, matGreen));
    group.add(elevatorGroup);

    // 6. 3-Blade de Havilland / Rotol Propeller + Black Spinner
    const propData = buildPropellerAssembly(3, 1.6, 0x18181b, 0.72, 4.05);
    group.add(propData.propGroup);
    group.add(propData.blurDisc);

    // 7. Narrow-Track Outward-Retracting Landing Gear
    const gearData = buildRetractableGear(1.0, 1.32, 0.95);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers: [propData.propGroup],
      blurDisc: propData.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // 6. SAVOIA-MARCHETTI SM.79 SPARVIERO ("258-6" Regia Aeronautica) - SPECIALTY: HEAVY BOMBER
  // =========================================================================
  // Built at ~75% of real size so the three-engined bomber still fits the runways and chase camera.

  // Simplified Italian wing marking: white disc with a black ring
  function createItalianWingMarkTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fill();
    return new THREE.CanvasTexture(canvas);
  }

  // White cross across the rudder
  function createRudderCrossTexture() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 160);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(48, 0, 32, 160);
    ctx.fillRect(0, 56, 128, 32);
    return new THREE.CanvasTexture(canvas);
  }

  function createSM79Sparviero() {
    const group = new THREE.Group();
    group.name = 'SM79_Sparviero';

    // Sand base with brown & green hand-painted rings, light grey underside
    const camoRings = [
      { color: '#5e4426', count: 95, size: 9, width: 4 },
      { color: '#4d5c32', count: 70, size: 8, width: 4 }
    ];
    const fuseTex = cachedTexture('sm79_fuse', () => createCamoTexture({
      base: '#b48f58',
      seed: 79,
      rings: camoRings,
      mottle: [{ color: 'rgba(111,82,48,0.5)', count: 120, size: 3 }],
      under: { color: '#b8b9ae', width: 0.18 }
    }));
    const wingTex = cachedTexture('sm79_wing', () => {
      const t = createCamoTexture({ base: '#b48f58', seed: 791, rings: camoRings, mottle: [{ color: 'rgba(111,82,48,0.5)', count: 120, size: 3 }] });
      if (t) t.repeat.set(1 / 5, 1 / 2.5);
      return t;
    });
    const matFuse = new THREE.MeshStandardMaterial({ map: fuseTex || null, color: fuseTex ? 0xffffff : 0xc9a86a, roughness: 0.66, metalness: 0.15 });
    const matWing = new THREE.MeshStandardMaterial({ map: wingTex || null, color: wingTex ? 0xffffff : 0xc9a86a, roughness: 0.66, metalness: 0.15 });
    const matUnder = new THREE.MeshStandardMaterial({ color: 0xb8b9ae, roughness: 0.6, metalness: 0.1 });
    const matYellow = new THREE.MeshStandardMaterial({ color: 0xe9b824, roughness: 0.4, metalness: 0.15 });
    const matWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
    const matEngine = new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.7, roughness: 0.45 });
    const matCrankcase = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });
    const matFrame = new THREE.MeshStandardMaterial({ color: 0x6f5230, roughness: 0.6 });
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const matGlass = glassMaterial();

    // Radial engine face: dark crankcase with a ring of cylinder heads
    function addRadialFace(parent, x, y, z, radius, cylinders) {
      const crank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 18).rotateX(Math.PI / 2), matCrankcase);
      crank.position.set(x, y, z);
      parent.add(crank);
      for (let i = 0; i < cylinders; i++) {
        const a = (i / cylinders) * Math.PI * 2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.16), matEngine);
        head.position.set(x + Math.cos(a) * radius * 0.82, y + Math.sin(a) * radius * 0.82, z + 0.05);
        head.rotation.z = a - Math.PI / 2;
        parent.add(head);
      }
    }

    // 1. Fuselage: deep forward section tapering to a slim tail boom
    const FUSE = [
      new THREE.Vector2(0.08, -7.0),
      new THREE.Vector2(0.30, -6.0),
      new THREE.Vector2(0.52, -4.2),
      new THREE.Vector2(0.78, -2.0),
      new THREE.Vector2(0.92, -0.2),
      new THREE.Vector2(0.95, 1.6),
      new THREE.Vector2(0.88, 3.2),
      new THREE.Vector2(0.74, 4.35)
    ];
    const SX = 0.82;
    const SY = 1.12;
    group.add(latheFromProfile(FUSE, SX, SY, matFuse, 26));
    group.add(fuselageBand(FUSE, SX, SY, -3.45, -2.85, matWhite)); // white identification band

    // The "Gobbo" hump over the cockpit, glazed at the front, with fixed & dorsal 12.7mm guns
    const humpGeo = new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    humpGeo.scale(0.5, 0.6, 1.65);
    const hump = new THREE.Mesh(humpGeo, matFuse);
    hump.position.set(0, 0.95, -0.15);
    group.add(hump);
    addFramedCanopy(group, { z: 1.85, y: 0.95, len: 0.9, w: 0.55, h: 0.58, frames: [-0.55, -0.05, 0.45], glass: matGlass, frame: matFrame });
    group.add(pilotHead(-0.2, 1.22, 1.85));
    group.add(pilotHead(0.2, 1.22, 1.85));
    const fwdGun = gunBarrel(0.03, 0.8, matGun);
    fwdGun.position.set(0, 1.55, 1.95);
    group.add(fwdGun);
    // Dorsal gunner station (as on the real "Sparviero"): open gun well right behind the hump, with the
    // gunner standing in it facing aft and a slender 12.7mm Breda on a pivot mount. The pivot (dorsalTurret) is
    // returned so the game can swing the gun toward whatever it is shooting at.
    const gunnerKit = new THREE.Group();
    gunnerKit.position.set(0, 0.84, -2.1);
    group.add(gunnerKit);
    const matWell = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
    const matSuit = new THREE.MeshStandardMaterial({ color: 0x4a4a3a, roughness: 0.9 });
    const well = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.95), matWell);
    well.position.set(0, 0.07, 0);
    gunnerKit.add(well);
    for (let side of [-1, 1]) {
      const coaming = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.95), matFuse);
      coaming.position.set(side * 0.33, 0.14, 0);
      gunnerKit.add(coaming);
    }
    // Gunner: torso, shoulders and head
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), matSuit);
    torso.position.set(0, 0.22, 0.1);
    gunnerKit.add(torso);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.18), matSuit);
    shoulders.position.set(0, 0.4, 0.1);
    gunnerKit.add(shoulders);
    gunnerKit.add(pilotHead(0, 0.56, 0.1));
    // Fixed pedestal and the swivelling gun
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 8), matGun);
    pedestal.position.set(0, 0.3, -0.2);
    gunnerKit.add(pedestal);
    const dorsalTurret = new THREE.Group();
    dorsalTurret.position.set(0, 1.36, -2.3); // same point as the game's dorsalGunner mount
    group.add(dorsalTurret);
    const dorsalGun = gunBarrel(0.03, 0.95, matGun);
    dorsalGun.position.set(0, 0, 0.5);
    dorsalTurret.add(dorsalGun);
    const gunBlock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), matGun);
    gunBlock.position.set(0, 0, 0.05);
    dorsalTurret.add(gunBlock);
    const ammoDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 10).rotateZ(Math.PI / 2), matGun);
    ammoDrum.position.set(0.1, -0.02, 0.05);
    dorsalTurret.add(ammoDrum);
    const restAim = new THREE.Vector3(0, 0.3, -1).normalize();
    dorsalTurret.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), restAim);
    // Ventral bombardier gondola with side windows
    const gondolaGeo = new THREE.SphereGeometry(1, 16, 12);
    gondolaGeo.scale(0.36, 0.3, 1.4);
    const gondola = new THREE.Mesh(gondolaGeo, matUnder);
    gondola.position.set(0, -1.02, -0.3);
    group.add(gondola);
    for (let side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.2 }));
      win.position.set(side * 0.35, -1.0, -0.3);
      group.add(win);
    }

    // 2. Nose engine: yellow Alfa Romeo 126 cowling
    const COWL = [new THREE.Vector2(0.70, 4.3), new THREE.Vector2(0.80, 4.7), new THREE.Vector2(0.74, 5.15)];
    group.add(latheFromProfile(COWL, 1, 1, matYellow, 22));
    addRadialFace(group, 0, 0, 5.08, 0.62, 9);

    // 3. Wings with two engine nacelles (yellow cowlings), ailerons and wing markings
    const WING = makePlanform(8.0, x => 1.55 - 0.5 * (x / 8), x => -1.45 + 0.75 * (x / 8), 0.14, 0.4, 0.12);
    const markMat = decalMat(cachedTexture('it_wing_mark', createItalianWingMarkTexture));
    const NACELLE_X = 2.9;
    const NACELLE = [
      new THREE.Vector2(0.05, -2.3),
      new THREE.Vector2(0.32, -1.4),
      new THREE.Vector2(0.50, 0.0),
      new THREE.Vector2(0.58, 1.2),
      new THREE.Vector2(0.60, 1.7)
    ];
    const NACELLE_COWL = [new THREE.Vector2(0.60, 1.65), new THREE.Vector2(0.68, 2.0), new THREE.Vector2(0.62, 2.4)];
    const noseProp = buildPropellerAssembly(3, 1.4, 0x1f2937, 0.55, 5.2, { bladeColor: 0x1f2937, tipColor: null });
    const propellers = [noseProp.propGroup];
    let leftAileron = null;
    let rightAileron = null;

    for (let side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(WING, side, matWing));
      wSide.add(planformSkin(WING, side, 0, WING.span, -1, matUnder));
      for (let face of [1, -1]) {
        wSide.add(planformDecal(WING, side, 5.0, planformMidZ(WING, 5.0), 1.5, 1.5, markMat, face));
      }

      const nacelle = latheFromProfile(NACELLE, 1, 1, matWing, 18);
      nacelle.position.set(side * NACELLE_X, 0.12, 0);
      wSide.add(nacelle);
      const cowl = latheFromProfile(NACELLE_COWL, 1, 1, matYellow, 18);
      cowl.position.set(side * NACELLE_X, 0.12, 0);
      wSide.add(cowl);
      addRadialFace(wSide, side * NACELLE_X, 0.12, 2.34, 0.5, 7);

      const wingProp = buildPropellerAssembly(3, 1.2, 0x1f2937, 0.45, 2.45, { bladeColor: 0x1f2937, tipColor: null });
      wingProp.propGroup.position.x = side * NACELLE_X;
      wingProp.propGroup.position.y = 0.12;
      wingProp.blurDisc.position.x = side * NACELLE_X;
      wingProp.blurDisc.position.y = 0.12;
      wingProp.blurDisc.material = noseProp.blurDisc.material; // all three discs fade with the throttle
      wSide.add(wingProp.propGroup);
      wSide.add(wingProp.blurDisc);
      propellers.push(wingProp.propGroup);

      const aileron = makeAileron(WING, side, 5.2, 7.6, matWing);
      wSide.add(aileron);
      if (side < 0) leftAileron = aileron;
      else rightAileron = aileron;

      wSide.rotation.z = side * 0.045;
      wSide.position.set(0, -0.45, 0.4);
      group.add(wSide);
    }

    // Fuselage code "258-" with the red "6" painted on the white band
    const codeMat = decalMat(cachedTexture('sm79_code', () => createTextTexture('258-', { color: '#111827' })));
    addSideDecals(group, codeMat, 1.0, 0.5, fuselageSideX(FUSE, SX, SY, -4.1, 0.1), 0.1, -4.1);
    const sixMat = decalMat(cachedTexture('sm79_six', () => createTextTexture('6', { width: 128, color: '#c81e1e' })));
    addSideDecals(group, sixMat, 0.5, 0.5, fuselageSideX(FUSE, SX, SY, -3.15, 0.1) + 0.01, 0.1, -3.15);

    // 4. Tall rounded fin & rudder (white cross), braced tailplane
    const FIN = makePlanform(2.3, h => -5.3 - 1.0 * (h / 2.3), h => -7.05 + 0.15 * (h / 2.3), 0.35, 0.14, 0.14);
    const rudderGroup = addFinAndRudder(group, FIN, { yBase: 0.2, hingeZ: -6.55, thick: 0.14, finMat: matFuse });
    const crossMat = decalMat(cachedTexture('sm79_cross', createRudderCrossTexture));
    for (let side of [-1, 1]) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), crossMat);
      cross.position.set(side * (0.14 * 0.46 + 0.01), 1.25 - 0.2, -6.8 + 6.55);
      cross.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      rudderGroup.add(cross);
    }
    const STAB = makePlanform(3.1, x => -5.75 - 0.3 * (x / 3.1), x => -6.95 + 0.25 * (x / 3.1), 0.25, 0.12, 0.06);
    const elevatorGroup = addStabAndElevator(group, STAB, { y: 0.45, hingeZ: -6.55, mat: matWing });
    for (let side of [-1, 1]) {
      group.add(strutBetween(
        new THREE.Vector3(side * 1.3, 0.4, -6.2),
        new THREE.Vector3(side * 0.18, 0.0, -5.9),
        0.022, matFrame
      ));
    }

    group.add(noseProp.propGroup);
    group.add(noseProp.blurDisc);

    // 5. Main gear retracting into the engine nacelles, tailwheel under the tail boom
    const gearData = buildRetractableGear(NACELLE_X, 1.25, 0.5, -6.0);
    group.add(gearData.gearGroup);

    return {
      group,
      propellers,
      blurDisc: noseProp.blurDisc,
      leftAileron,
      rightAileron,
      elevators: [elevatorGroup],
      rudders: [rudderGroup],
      dorsalTurret,
      setGearDeployment: gearData.setGearDeployment,
      setFlapDroop: function (droop) {
        leftAileron.rotation.x = droop;
        rightAileron.rotation.x = droop;
      }
    };
  }

  // =========================================================================
  // === FACTIONS AIRCRAFT KIT: shared parts for the nation-specific heavy fighters, bombers & fighters ===
  // =========================================================================
  const V2 = (r, z) => new THREE.Vector2(r, z);
  const Z_AXIS = new THREE.Vector3(0, 0, 1);

  function fxMat(color, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      color,
      roughness: o.roughness !== undefined ? o.roughness : 0.6,
      metalness: o.metalness !== undefined ? o.metalness : 0.15
    });
  }

  function fxTexMat(tex, fallback, o) {
    o = o || {};
    return new THREE.MeshStandardMaterial({
      map: tex || null,
      color: tex ? 0xffffff : fallback,
      roughness: o.roughness !== undefined ? o.roughness : 0.62,
      metalness: o.metalness !== undefined ? o.metalness : 0.15
    });
  }

  // Painted skin pair (fuselage + wing share the scheme; wing texture is stretched over the larger area)
  function fxCamoPair(key, camo, wingRep) {
    const fuseTex = cachedTexture(key + '_fuse', () => createCamoTexture(camo));
    const wingTex = cachedTexture(key + '_wing', () => {
      const t = createCamoTexture(Object.assign({}, camo, { under: undefined, seed: (camo.seed || 1) + 1 }));
      if (t) t.repeat.set(wingRep ? wingRep[0] : 0.2, wingRep ? wingRep[1] : 0.4);
      return t;
    });
    return { fuse: fxTexMat(fuseTex, camo.base), wing: fxTexMat(wingTex, camo.base) };
  }

  // Bare aluminium with panel lines
  function fxMetalPair(key, color, seed, wingRep) {
    const fuseTex = cachedTexture(key + '_mfuse', () => createPanelTexture(color, 'rgba(60,70,82,0.5)', 14, 10, seed));
    const wingTex = cachedTexture(key + '_mwing', () => {
      const t = createPanelTexture(color, 'rgba(60,70,82,0.45)', 6, 8, seed + 1);
      if (t) t.repeat.set(wingRep ? wingRep[0] : 0.25, wingRep ? wingRep[1] : 0.5);
      return t;
    });
    return {
      fuse: fxTexMat(fuseTex, 0xcfd5dc, { metalness: 0.4, roughness: 0.32 }),
      wing: fxTexMat(wingTex, 0xcfd5dc, { metalness: 0.4, roughness: 0.32 })
    };
  }

  // Wing pair from a planform; o: y, z, dihedral, top, under, aileron [x0,x1], aileronMat, perSide(side, wSide)
  function fxWings(group, pf, o) {
    let left = null;
    let right = null;
    for (const side of [-1, 1]) {
      const wSide = new THREE.Group();
      wSide.add(planformSlab(pf, side, o.top));
      if (o.under) wSide.add(planformSkin(pf, side, o.underFrom || 0, pf.span, -1, o.under));
      if (o.aileron) {
        const a = makeAileron(pf, side, o.aileron[0], o.aileron[1], o.aileronMat || o.top);
        wSide.add(a);
        if (side < 0) left = a; else right = a;
      }
      if (o.perSide) o.perSide(side, wSide);
      wSide.rotation.z = side * (o.dihedral !== undefined ? o.dihedral : 0.04);
      wSide.position.set(0, o.y, o.z);
      group.add(wSide);
    }
    return { left, right };
  }

  function fxRadialFace(parent, x, y, z, radius, count, matCrank, matHead) {
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.08, 18).rotateX(Math.PI / 2), matCrank);
    crank.position.set(x, y, z);
    parent.add(crank);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.16), matHead);
      head.position.set(x + Math.cos(a) * radius * 0.82, y + Math.sin(a) * radius * 0.82, z + 0.05);
      head.rotation.z = a - Math.PI / 2;
      parent.add(head);
    }
  }

  // Engine nacelle: tapered body z0..z1, cowling z1..zNose, then either a radial engine face or a plain inline nose
  function fxNacelle(parent, o) {
    const sy = o.sy || 1;
    const body = [V2(0.05, o.z0), V2(o.r * 0.5, o.z0 + (o.z1 - o.z0) * 0.3), V2(o.r * 0.92, o.z0 + (o.z1 - o.z0) * 0.7), V2(o.r, o.z1)];
    const m = latheFromProfile(body, 1, sy, o.mat, 18);
    m.position.set(o.x, o.y, 0);
    parent.add(m);
    if (o.radial) {
      const cowl = latheFromProfile([V2(o.r, o.z1 - 0.02), V2(o.r * 1.07, o.z1 + (o.zNose - o.z1) * 0.35), V2(o.r * 1.0, o.zNose)], 1, sy, o.cowlMat || o.mat, 20);
      cowl.position.set(o.x, o.y, 0);
      parent.add(cowl);
      fxRadialFace(parent, o.x, o.y, o.zNose - 0.04, o.r * 0.82, o.radial, fxMat(0x1f2937), fxMat(0x4b5563, { metalness: 0.7, roughness: 0.45 }));
    } else {
      const nose = latheFromProfile([V2(o.r, o.z1 - 0.02), V2(o.r * 0.96, o.z1 + (o.zNose - o.z1) * 0.5), V2(o.r * 0.55, o.zNose)], 1, sy, o.cowlMat || o.mat, 20);
      nose.position.set(o.x, o.y, 0);
      parent.add(nose);
    }
  }

  // Propeller at (x, y, z); every disc of an aircraft shares the first disc's material so they fade with the throttle
  function fxProp(group, props, x, y, z, blades, radius, spinnerColor, spinLen, opts) {
    const p = buildPropellerAssembly(blades, radius, spinnerColor, spinLen, z, opts);
    p.propGroup.position.x = x;
    p.propGroup.position.y = y;
    p.blurDisc.position.x = x;
    p.blurDisc.position.y = y;
    if (props.length) p.blurDisc.material = props[0].blurDisc.material;
    group.add(p.propGroup);
    group.add(p.blurDisc);
    props.push({ propGroup: p.propGroup, blurDisc: p.blurDisc });
    return p;
  }

  // Tricycle landing gear: two main legs and a nose leg; everything folds backwards when retracted
  function fxTricycleGear(o) {
    const gearGroup = new THREE.Group();
    const matStrut = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const tireR = o.tireR || 0.4;
    function leg(x, y, z, len, tw) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const strutGeo = new THREE.CylinderGeometry(0.06, 0.05, len, 10);
      strutGeo.translate(0, -len / 2, 0);
      pivot.add(new THREE.Mesh(strutGeo, matStrut));
      const tireGeo = new THREE.CylinderGeometry(tireR, tireR, tw, 16);
      tireGeo.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, matTire);
      tire.position.set(0, -len, 0);
      pivot.add(tire);
      gearGroup.add(pivot);
      return pivot;
    }
    const mains = [leg(-o.trackX, o.y0, o.zMain, o.strutLen, 0.22), leg(o.trackX, o.y0, o.zMain, o.strutLen, 0.22)];
    const nose = leg(0, o.yNose !== undefined ? o.yNose : o.y0, o.zNose, o.noseLen || o.strutLen, 0.18);
    function setGearDeployment(ratio) {
      if (typeof ratio === 'boolean') ratio = ratio ? 1.0 : 0.0;
      ratio = THREE.MathUtils.clamp(ratio, 0, 1);
      mains.forEach(m => { m.rotation.x = -(1.0 - ratio) * 1.5; m.visible = ratio > 0.02; });
      nose.rotation.x = (1.0 - ratio) * 1.5;
      nose.visible = ratio > 0.02;
    }
    return { gearGroup, setGearDeployment };
  }

  // Gun turret: fixed glass dome + a rotating gun pivot at (x,y,z) (the game aims the pivot at targets).
  // Returns the pivot; the game's dorsalGunner.mount for this aircraft must be the same point.
  function fxTurret(group, x, y, z, o) {
    o = o || {};
    const matGun = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const domeGeo = new THREE.SphereGeometry(o.r || 0.5, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    domeGeo.scale(1, o.squash || 0.8, 1.15);
    const dome = new THREE.Mesh(domeGeo, o.glass || glassMaterial());
    dome.position.set(x, y - (o.domeDrop !== undefined ? o.domeDrop : 0.25), z);
    group.add(dome);
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const twin = o.twin !== false;
    for (const gx of (twin ? [-0.07, 0.07] : [0])) {
      const b = gunBarrel(0.028, o.len || 0.95, matGun);
      b.position.set(gx, 0, (o.len || 0.95) / 2 + 0.05);
      pivot.add(b);
    }
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.3), matGun);
    block.position.set(0, 0, 0.05);
    pivot.add(block);
    group.add(pivot);
    pivot.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(0, 0.3, -1).normalize());
    return pivot;
  }

  // Large glazed nose / tail cone: ellipsoid of glass with frames
  function fxGlassBlob(group, x, y, z, rx, ry, rz, glassMat, frameMat, frames) {
    const geo = new THREE.SphereGeometry(1, 20, 14);
    geo.scale(rx, ry, rz);
    const m = new THREE.Mesh(geo, glassMat);
    m.position.set(x, y, z);
    group.add(m);
    for (const f of (frames || [])) {
      const s = Math.sqrt(Math.max(0.05, 1 - f * f));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 20), frameMat);
      ring.scale.set(rx * s * 1.01, ry * s * 1.01, 1);
      ring.position.set(x, y, z + f * rz);
      group.add(ring);
    }
  }

  // Stand-alone vertical tail on a sub-group offset in X (twin fins, H-tails)
  function fxFinAt(group, x, pf, o) {
    const sub = new THREE.Group();
    sub.position.x = x;
    const rudder = addFinAndRudder(sub, pf, o);
    group.add(sub);
    return rudder;
  }

  function fxFinishModel(group, props, parts) {
    return Object.assign({
      group,
      propellers: props.map(p => p.propGroup),
      blurDisc: props[0] ? props[0].blurDisc : null
    }, parts);
  }

  // =========================================================================
  // F1. LOCKHEED P-38L LIGHTNING (USAAF): twin booms, central gun pod, tricycle gear
  // =========================================================================
  function createP38Lightning() {
    const group = new THREE.Group();
    group.name = 'P38L_Lightning';
    const metal = fxMetalPair('p38', '#cfd4dc', 38);
    const matMetal = metal.fuse;
    const matWing = metal.wing;
    const matOD = fxMat(0x3f4a1e, { roughness: 0.85 });
    const matDark = fxMat(0x1f2937, { metalness: 0.4 });
    const matGlass = glassMaterial();
    const matFrame = fxMat(0xaab2bc, { metalness: 0.5, roughness: 0.35 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];
    const BOOM_X = 2.45;

    // Central crew pod with the nose battery: 4 x .50 cal + 1 x 20mm
    const POD = [V2(0.05, -2.3), V2(0.22, -1.7), V2(0.44, -0.7), V2(0.6, 0.4), V2(0.64, 1.3), V2(0.5, 2.3), V2(0.34, 3.0), V2(0.3, 3.35)];
    group.add(latheFromProfile(POD, 0.92, 1.1, matMetal, 22));
    group.add(fuselageBand(POD, 0.92, 1.1, 1.9, 3.35, matOD, { phiCenter: Math.PI, phiWidth: 1.2 })); // anti-glare panel
    addFramedCanopy(group, { z: 0.55, y: 0.6, len: 1.05, w: 0.5, h: 0.52, frames: [-0.65, -0.15, 0.35, 0.8], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.82, 0.5));
    for (const [gx, gy, len] of [[-0.13, 0.07, 0.8], [0.13, 0.07, 0.8], [-0.07, -0.1, 0.65], [0.07, -0.1, 0.65], [0, 0.0, 1.05]]) {
      const b = gunBarrel(0.03, len, matGun);
      b.position.set(gx, gy, 3.3 + len / 2 - 0.12);
      group.add(b);
    }

    // Twin booms: Allison V-1710 engines ahead of the wing, tail ends carry the fins
    const BOOM = [V2(0.04, -6.1), V2(0.14, -5.3), V2(0.3, -3.6), V2(0.42, -1.6), V2(0.5, 0.2), V2(0.52, 1.7), V2(0.48, 3.0)];
    const BOOM_NOSE = [V2(0.48, 2.95), V2(0.5, 3.3), V2(0.44, 3.9), V2(0.3, 4.25)];
    for (const side of [-1, 1]) {
      const boom = latheFromProfile(BOOM, 1, 1.0, matMetal, 20);
      boom.position.set(side * BOOM_X, 0, 0);
      group.add(boom);
      const nose = latheFromProfile(BOOM_NOSE, 1, 1.0, matMetal, 20);
      nose.position.set(side * BOOM_X, 0, 0);
      group.add(nose);
      // Turbo-supercharger bulge on top of each boom aft of the wing, radiator scoops on the sides
      const turbo = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.9), matDark);
      turbo.position.set(side * BOOM_X, 0.5, -1.3);
      group.add(turbo);
      for (const s2 of [-1, 1]) {
        const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.55), matDark);
        scoop.position.set(side * BOOM_X + s2 * 0.5, 0.0, -0.3);
        group.add(scoop);
      }
      fxProp(group, props, side * BOOM_X, 0, 4.25, 3, 1.55, 0x2b2f36, 0.7, { tipColor: 0xfacc15 });
    }

    // High-aspect wing with the long centre section between the booms
    const WING = makePlanform(6.7, x => 1.0 - 0.25 * (x / 6.7), x => -1.5 + 1.2 * (x / 6.7), 0.1, 0.3, 0.1);
    const starMat = decalMat(cachedTexture('us_star', createUSStarTexture));
    const wings = fxWings(group, WING, {
      y: -0.14, z: 0.2, dihedral: 0.03, top: matWing, under: matWing, aileron: [4.4, 6.2],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 5.0, planformMidZ(WING, 5.0), 1.5, 0.75, starMat, side < 0 ? 1 : -1));
      }
    });

    // Tail: fins on the boom ends, tailplane between them
    const FIN = makePlanform(1.5, h => -4.7 - 0.9 * (h / 1.5), h => -6.05 + 0.35 * (h / 1.5), 0.3, 0.12, 0.1);
    const rudders = [-1, 1].map(side => fxFinAt(group, side * BOOM_X, FIN, { yBase: 0.05, hingeZ: -5.5, thick: 0.12, finMat: matMetal }));
    const STAB = makePlanform(3.1, x => -4.9 - 0.1 * (x / 3.1), x => -5.9 + 0.2 * (x / 3.1), 0.12, 0.1, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 1.1, hingeZ: -5.4, mat: matMetal });

    // Fuselage star-and-bar on the pod, boom codes
    addSideDecals(group, starMat, 1.1, 0.55, fuselageSideX(POD, 0.92, 1.1, -0.9, 0.05), 0.05, -0.9);

    const gear = fxTricycleGear({ trackX: BOOM_X, strutLen: 1.28, y0: -0.3, zMain: 0.3, zNose: 2.0, noseLen: 1.2, tireR: 0.38 });
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 6.6, y: -0.05, z: 0.1 }, tails: rudders.map((r, i) => ({ x: (i ? 1 : -1) * BOOM_X, y: 1.3, z: -5.7 })) }
    });
  }

  // =========================================================================
  // F2. NORTH AMERICAN B-25J MITCHELL (USAAF): glazed nose, H-tail, twin Cyclones, dorsal turret
  // =========================================================================
  const B25_TURRET = [0, 1.28, 0.4];
  function createB25Mitchell() {
    const group = new THREE.Group();
    group.name = 'B25J_Mitchell';
    const camo = fxCamoPair('b25', {
      base: '#3f4a1d', seed: 25,
      mottle: [{ color: 'rgba(58,66,28,0.5)', count: 90, size: 4 }],
      under: { color: '#a3a8a6', width: 0.2 }
    }, [0.12, 0.25]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xa3a8a6);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x4b5320, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];

    // Fuselage: slim, deep waist, glazed nose
    const FUSE = [V2(0.06, -6.9), V2(0.18, -6.2), V2(0.34, -4.6), V2(0.55, -2.6), V2(0.78, -0.6), V2(0.9, 1.2), V2(0.9, 2.8), V2(0.72, 4.2), V2(0.5, 5.2), V2(0.34, 5.7)];
    const SX = 0.9;
    const SY = 1.05;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 26));
    fxGlassBlob(group, 0, -0.04, 5.45, 0.34, 0.34, 0.72, matGlass, matFrame, [-0.5, 0.0, 0.5]);
    for (const [gx, gy] of [[-0.12, 0.1], [0.12, 0.1], [-0.12, -0.1], [0.12, -0.1]]) {
      const b = gunBarrel(0.028, 0.7, matGun);
      b.position.set(gx, gy, 6.2);
      group.add(b);
    }

    // Raised flight deck and the Bendix top turret
    addFramedCanopy(group, { z: 3.1, y: 0.7, len: 1.2, w: 0.6, h: 0.5, frames: [-0.75, -0.25, 0.25, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(-0.2, 0.9, 3.0));
    group.add(pilotHead(0.2, 0.9, 3.0));
    const dorsalTurret = fxTurret(group, B25_TURRET[0], B25_TURRET[1], B25_TURRET[2], { r: 0.46, glass: matGlass });

    // Tail gun cone
    fxGlassBlob(group, 0, 0.0, -6.85, 0.16, 0.16, 0.38, matGlass, matFrame, []);

    // Mid wing with two Wright Cyclone nacelles
    const WING = makePlanform(8.7, x => 1.6 - 0.7 * (x / 8.7), x => -1.2 + 0.8 * (x / 8.7), 0.1, 0.4, 0.12);
    const starMat = decalMat(cachedTexture('us_star', createUSStarTexture));
    const NACELLE_X = 2.75;
    const wings = fxWings(group, WING, {
      y: 0.2, z: 0.0, dihedral: 0.03, top: matWing, under: matUnder, aileron: [5.6, 8.2],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 6.4, planformMidZ(WING, 6.4), 1.7, 0.85, starMat, side < 0 ? 1 : -1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * NACELLE_X, y: 0.05, z0: -2.6, z1: 2.6, zNose: 3.1, r: 0.7, sy: 0.95, mat: matBody, cowlMat: fxMat(0x2b3138, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * NACELLE_X, 0.05, 3.12, 3, 1.75, 0x2b3138, 0.62, { tipColor: 0xfacc15 });
    }

    // H-tail: tailplane with a fin and rudder on each end
    const FIN = makePlanform(2.1, h => -5.6 - 0.3 * (h / 2.1), h => -6.9 + 0.1 * (h / 2.1), 0.6, 0.14, 0.1);
    const rudders = [-1, 1].map(side => fxFinAt(group, side * 2.6, FIN, { yBase: -0.35, hingeZ: -6.3, thick: 0.14, finMat: matWing }));
    const STAB = makePlanform(3.2, x => -5.6 - 0.15 * (x / 3.2), x => -6.9 + 0.3 * (x / 3.2), 0.15, 0.14, 0.06);
    const elevators = addStabAndElevator(group, STAB, { y: 0.15, hingeZ: -6.35, mat: matWing });

    addSideDecals(group, starMat, 1.5, 0.75, fuselageSideX(FUSE, SX, SY, -3.2, 0.05), 0.05, -3.2);

    const gear = fxTricycleGear({ trackX: NACELLE_X, strutLen: 1.25, y0: -0.4, zMain: 0.5, zNose: 4.3, noseLen: 1.0, tireR: 0.42 });
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders,
      dorsalTurret,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 8.6, y: 0.4, z: 0.55 }, tails: [-1, 1].map(s => ({ x: s * 2.6, y: 1.35, z: -6.3 })) }
    });
  }

  // =========================================================================
  // F3. MESSERSCHMITT Bf 110G (Luftwaffe Zerstoerer): long glasshouse, twin DB 605 engines, twin fins
  // =========================================================================
  function createBf110() {
    const group = new THREE.Group();
    group.name = 'Bf110G';
    const camo = fxCamoPair('bf110', {
      base: '#77838f', seed: 110,
      splinter: [{ color: '#5b6770', count: 16, size: 24 }, { color: '#47525d', count: 10, size: 20 }],
      mottle: [{ color: 'rgba(60,70,80,0.35)', count: 70, size: 3 }],
      under: { color: '#9db4c8', width: 0.22 }
    }, [0.17, 0.33]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x9db4c8);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x3d4650, { metalness: 0.4 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const matDark = fxMat(0x20262d, { metalness: 0.5 });
    const props = [];

    const FUSE = [V2(0.05, -5.6), V2(0.2, -4.8), V2(0.38, -3.2), V2(0.55, -1.4), V2(0.63, 0.2), V2(0.62, 1.6), V2(0.5, 2.8), V2(0.36, 3.8), V2(0.3, 4.4)];
    const SX = 0.85;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    // Nose battery: 2 x MK 108 30mm + 2 x MG FF 20mm
    for (const [gx, gy, len] of [[-0.15, 0.1, 0.8], [0.15, 0.1, 0.8], [-0.1, -0.1, 0.65], [0.1, -0.1, 0.65]]) {
      const b = gunBarrel(0.034, len, matGun);
      b.position.set(gx, gy, 4.3 + len / 2 - 0.05);
      group.add(b);
    }
    // Long glasshouse for pilot and radio operator / rear gunner
    addFramedCanopy(group, { z: 0.35, y: 0.6, len: 1.8, w: 0.42, h: 0.52, frames: [-0.85, -0.45, -0.05, 0.35, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.82, 1.1));
    group.add(pilotHead(0, 0.78, -0.2));
    const rearGun = gunBarrel(0.02, 0.5, matGun);
    rearGun.position.set(0, 0.78, -1.45);
    group.add(rearGun);

    const WING = makePlanform(6.9, x => 1.2 - 0.3 * (x / 6.9), x => -1.5 + 1.15 * (x / 6.9), 0.12, 0.3, 0.1);
    const balk = decalMat(cachedTexture('balkenkreuz', createBalkenkreuzTexture));
    const ENG_X = 2.0;
    const wings = fxWings(group, WING, {
      y: -0.25, z: 0.3, dihedral: 0.045, top: matWing, under: matUnder, aileron: [4.5, 6.5],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 5.2, planformMidZ(WING, 5.2), 1.3, 1.3, balk, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 5.2, planformMidZ(WING, 5.2), 1.3, 1.3, balk, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.12, z0: -1.7, z1: 2.1, zNose: 3.05, r: 0.46, mat: matBody, cowlMat: fxMat(0x39434d, { metalness: 0.4 }) });
      fxProp(group, props, side * ENG_X, -0.12, 3.08, 3, 1.5, 0x2c3a46, 0.62, { tipColor: null });
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.9), matDark);
      rad.position.set(side * ENG_X, -0.55, 0.9);
      group.add(rad);
    }

    const FIN = makePlanform(1.4, h => -4.75 - 0.75 * (h / 1.4), h => -5.5 + 0.3 * (h / 1.4), 0.3, 0.1, 0.08);
    const rudders = [-1, 1].map(side => fxFinAt(group, side * 2.45, FIN, { yBase: -0.05, hingeZ: -5.1, thick: 0.1, finMat: matWing }));
    const STAB = makePlanform(2.7, x => -4.8 - 0.1 * (x / 2.7), x => -5.55 + 0.15 * (x / 2.7), 0.14, 0.09, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -5.2, mat: matWing });

    addSideDecals(group, balk, 1.0, 1.0, fuselageSideX(FUSE, SX, SY, -2.5, 0.05), 0.05, -2.5);

    const gear = buildRetractableGear(ENG_X, 1.3, 0.6, -4.7);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 6.8, y: -0.05, z: 0.2 }, tails: [-1, 1].map(s => ({ x: s * 2.45, y: 1.1, z: -5.35 })) }
    });
  }

  // =========================================================================
  // F4. HEINKEL He 111H (Luftwaffe): fully glazed nose, twin Jumo 211, single tall fin, dorsal gun
  // =========================================================================
  const HE111_GUN = [0, 1.0, -1.25];
  function createHe111() {
    const group = new THREE.Group();
    group.name = 'He111H';
    const camo = fxCamoPair('he111', {
      base: '#3a4a3a', seed: 111,
      splinter: [{ color: '#2a382c', count: 14, size: 26 }, { color: '#52644a', count: 10, size: 20 }],
      under: { color: '#8fa7b8', width: 0.28 }
    }, [0.1, 0.2]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x8fa7b8);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2a382c, { metalness: 0.3 });
    const matDark = fxMat(0x20262d, { metalness: 0.5 });
    const props = [];

    const FUSE = [V2(0.06, -7.0), V2(0.18, -6.3), V2(0.36, -4.8), V2(0.58, -2.6), V2(0.78, -0.6), V2(0.88, 1.0), V2(0.88, 3.0), V2(0.8, 4.4), V2(0.66, 5.1)];
    const SX = 0.9;
    const SY = 1.0;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 26));
    // The famous fully glazed "greenhouse" nose
    fxGlassBlob(group, 0, 0.12, 5.0, 0.68, 0.66, 1.0, matGlass, matFrame, [-0.75, -0.45, -0.15, 0.2, 0.55, 0.85]);
    group.add(pilotHead(-0.2, 0.3, 4.4));
    group.add(pilotHead(0.15, 0.3, 5.2));
    const noseGun = gunBarrel(0.022, 0.6, fxMat(0x1e293b, { metalness: 0.85 }));
    noseGun.position.set(0.1, 0.2, 6.2);
    group.add(noseGun);
    // Dorsal gun position behind the cockpit and ventral "Bola" gondola
    const dorsalTurret = fxTurret(group, HE111_GUN[0], HE111_GUN[1], HE111_GUN[2], { r: 0.36, glass: matGlass, twin: false, len: 0.8, domeDrop: 0.18 });
    const bola = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.3, 0.28, 0.8), matGlass);
    bola.position.set(0, -0.8, 3.2);
    group.add(bola);

    const WING = makePlanform(9.6, x => 1.4 - 0.55 * (x / 9.6), x => -1.5 + 0.9 * (x / 9.6), 0.18, 0.38, 0.12);
    const balk = decalMat(cachedTexture('balkenkreuz', createBalkenkreuzTexture));
    const ENG_X = 2.9;
    const wings = fxWings(group, WING, {
      y: -0.55, z: 0.5, dihedral: 0.03, top: matWing, under: matUnder, aileron: [6.4, 9.1],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 6.0, planformMidZ(WING, 6.0), 1.5, 1.5, balk, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 6.0, planformMidZ(WING, 6.0), 1.5, 1.5, balk, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.45, z0: -2.2, z1: 2.4, zNose: 3.35, r: 0.5, mat: matBody, cowlMat: fxMat(0x39434d, { metalness: 0.4 }) });
      fxProp(group, props, side * ENG_X, -0.45, 3.38, 3, 1.72, 0x2c3a46, 0.66, { tipColor: null });
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.9), matDark);
      rad.position.set(side * ENG_X, -0.9, 1.1);
      group.add(rad);
    }

    // Single tall fin with the large rudder, braced tailplane
    const FIN = makePlanform(2.3, h => -5.7 - 0.85 * (h / 2.3), h => -7.15 + 0.4 * (h / 2.3), 0.3, 0.14, 0.1);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.1, hingeZ: -6.5, thick: 0.14, finMat: matBody });
    const STAB = makePlanform(3.2, x => -5.9 - 0.2 * (x / 3.2), x => -7.0 + 0.3 * (x / 3.2), 0.2, 0.12, 0.06);
    const elevators = addStabAndElevator(group, STAB, { y: 0.5, hingeZ: -6.5, mat: matWing });
    for (const side of [-1, 1]) {
      group.add(strutBetween(new THREE.Vector3(side * 1.4, 0.45, -6.4), new THREE.Vector3(side * 0.2, 0.0, -6.0), 0.025, matFrame));
    }

    addSideDecals(group, balk, 1.3, 1.3, fuselageSideX(FUSE, SX, SY, -3.4, 0.05), 0.05, -3.4);

    const gear = buildRetractableGear(ENG_X, 1.25, 0.8, -6.2);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      dorsalTurret,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 9.5, y: -0.3, z: 0.6 }, tails: [{ x: 0, y: 2.0, z: -6.4 }] }
    });
  }

  // =========================================================================
  // F5. BRISTOL BEAUFIGHTER Mk VI (RAF Coastal Command): two Hercules radials, cannon belly, single fin
  // =========================================================================
  function createBeaufighter() {
    const group = new THREE.Group();
    group.name = 'Beaufighter_VI';
    const camo = fxCamoPair('beau', {
      base: '#3f4a4c', seed: 66,
      blobs: [{ color: '#2c3639', count: 7, size: 36 }],
      under: { color: '#d7ddd9', width: 0.24 }
    }, [0.16, 0.3]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xd7ddd9);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];

    const FUSE = [V2(0.05, -5.2), V2(0.2, -4.4), V2(0.38, -2.8), V2(0.55, -1.0), V2(0.66, 0.6), V2(0.7, 1.8), V2(0.6, 3.0), V2(0.42, 3.9), V2(0.32, 4.4)];
    const SX = 0.85;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    // Four 20mm Hispano cannon under the nose
    for (const [gx, gy] of [[-0.16, -0.3], [0.16, -0.3], [-0.16, -0.43], [0.16, -0.43]]) {
      const b = gunBarrel(0.034, 0.8, matGun);
      b.position.set(gx, gy, 4.55);
      group.add(b);
    }
    addFramedCanopy(group, { z: 2.2, y: 0.66, len: 0.9, w: 0.42, h: 0.46, frames: [-0.6, -0.1, 0.4, 0.8], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.88, 2.15));
    // Navigator's astrodome behind the wing
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matGlass);
    dome.position.set(0, 0.72, -0.9);
    group.add(dome);

    const WING = makePlanform(7.5, x => 1.2 - 0.45 * (x / 7.5), x => -1.4 + 1.0 * (x / 7.5), 0.1, 0.32, 0.1);
    const roundelWing = decalMat(cachedTexture('raf_round_b', () => createRAFRoundelTexture([[1.0, '#1f2f6b'], [0.7, '#f1f5f9'], [0.36, '#c81e1e']])));
    const roundelBody = decalMat(cachedTexture('raf_round_c', () => createRAFRoundelTexture([[1.0, '#f2c230'], [0.82, '#1f2f6b'], [0.58, '#f1f5f9'], [0.3, '#c81e1e']])));
    const ENG_X = 2.35;
    const wings = fxWings(group, WING, {
      y: -0.3, z: 0.4, dihedral: 0.04, top: matWing, under: matUnder, aileron: [4.8, 7.1],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 5.5, planformMidZ(WING, 5.5), 1.5, 1.5, roundelWing, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 5.5, planformMidZ(WING, 5.5), 1.5, 1.5, roundelWing, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.15, z0: -2.0, z1: 2.5, zNose: 3.25, r: 0.78, sy: 0.95, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * ENG_X, -0.15, 3.27, 3, 1.85, 0x20262d, 0.6, { tipColor: null });
    }

    const FIN = makePlanform(1.9, h => -4.2 - 0.9 * (h / 1.9), h => -5.3 + 0.45 * (h / 1.9), 0.3, 0.12, 0.09);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.1, hingeZ: -4.8, thick: 0.12, finMat: matBody });
    const STAB = makePlanform(2.5, x => -4.0 - 0.2 * (x / 2.5), x => -4.95 + 0.25 * (x / 2.5), 0.18, 0.1, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.6, hingeZ: -4.55, mat: matWing });

    addSideDecals(group, roundelBody, 1.2, 1.2, fuselageSideX(FUSE, SX, SY, -2.2, 0.05), 0.05, -2.2);
    const flashMat = decalMat(cachedTexture('raf_flash', createFinFlashTexture));
    for (const side of [-1, 1]) {
      const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), flashMat);
      flash.position.set(side * 0.08, 1.1, -4.55);
      flash.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(flash);
    }

    const gear = buildRetractableGear(ENG_X, 1.3, 0.6, -4.7);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 7.4, y: -0.1, z: 0.3 }, tails: [{ x: 0, y: 1.8, z: -4.9 }] }
    });
  }

  // =========================================================================
  // F6. AVRO LANCASTER B Mk I (RAF Bomber Command): four Merlins, twin fins, three gun turrets
  // =========================================================================
  const LANC_TURRET = [0, 1.25, 0.6];
  function createLancaster() {
    const group = new THREE.Group();
    group.name = 'Lancaster_BI';
    const camo = fxCamoPair('lanc', {
      base: '#404c2b', seed: 617,
      blobs: [{ color: '#5f4d31', count: 8, size: 38 }],
      under: { color: '#1a1a1a', width: 0.25 }
    }, [0.07, 0.14]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x1c1c1c);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];

    const FUSE = [V2(0.06, -8.8), V2(0.2, -7.8), V2(0.42, -5.4), V2(0.66, -2.8), V2(0.84, -0.4), V2(0.9, 1.8), V2(0.88, 3.8), V2(0.7, 5.4), V2(0.46, 6.6), V2(0.3, 7.2)];
    const SX = 0.88;
    const SY = 1.05;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 26));
    // Bomb aimer's blister and the nose turret
    fxGlassBlob(group, 0, -0.08, 6.95, 0.3, 0.28, 0.5, matGlass, matFrame, [0]);
    const noseTurret = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matGlass);
    noseTurret.position.set(0, 0.5, 6.4);
    group.add(noseTurret);
    for (const gx of [-0.08, 0.08]) {
      const b = gunBarrel(0.02, 0.5, matGun);
      b.position.set(gx, 0.62, 6.85);
      group.add(b);
    }
    addFramedCanopy(group, { z: 4.4, y: 0.72, len: 1.15, w: 0.58, h: 0.5, frames: [-0.75, -0.25, 0.25, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(-0.12, 0.92, 4.3));
    const dorsalTurret = fxTurret(group, LANC_TURRET[0], LANC_TURRET[1], LANC_TURRET[2], { r: 0.5, glass: matGlass });
    // Rear turret: glazed cone with four .303 barrels
    fxGlassBlob(group, 0, 0.0, -8.95, 0.24, 0.26, 0.5, matGlass, matFrame, []);
    for (const [gx, gy] of [[-0.07, 0.07], [0.07, 0.07], [-0.07, -0.05], [0.07, -0.05]]) {
      const b = gunBarrel(0.018, 0.55, matGun);
      b.position.set(gx, gy, -9.55);
      group.add(b);
    }

    const WING = makePlanform(13.2, x => 1.8 - 0.55 * (x / 13.2), x => -1.4 + 1.0 * (x / 13.2), 0.1, 0.42, 0.13);
    const roundelWing = decalMat(cachedTexture('raf_round_b', () => createRAFRoundelTexture([[1.0, '#1f2f6b'], [0.7, '#f1f5f9'], [0.36, '#c81e1e']])));
    const roundelBody = decalMat(cachedTexture('raf_round_c', () => createRAFRoundelTexture([[1.0, '#f2c230'], [0.82, '#1f2f6b'], [0.58, '#f1f5f9'], [0.3, '#c81e1e']])));
    const ENG_X = [2.9, 5.7];
    const wings = fxWings(group, WING, {
      y: 0.25, z: 0.6, dihedral: 0.03, top: matWing, under: matUnder, aileron: [9.4, 12.7],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 8.6, planformMidZ(WING, 8.6), 2.0, 2.0, roundelWing, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 8.6, planformMidZ(WING, 8.6), 2.0, 2.0, roundelWing, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      for (const ex of ENG_X) {
        fxNacelle(group, { x: side * ex, y: 0.05, z0: -1.4, z1: 2.3, zNose: 3.3, r: 0.5, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.4 }) });
        fxProp(group, props, side * ex, 0.05, 3.33, 3, 1.55, 0x20262d, 0.6, { tipColor: null });
      }
    }

    // Twin oval fins and rudders at the ends of the tailplane
    const FIN = makePlanform(2.1, h => -7.2 - 0.6 * (h / 2.1), h => -8.7 + 0.45 * (h / 2.1), 0.5, 0.14, 0.1);
    const rudders = [-1, 1].map(side => fxFinAt(group, side * 3.1, FIN, { yBase: -0.2, hingeZ: -8.0, thick: 0.14, finMat: matWing }));
    const STAB = makePlanform(3.5, x => -7.4 - 0.2 * (x / 3.5), x => -8.6 + 0.3 * (x / 3.5), 0.15, 0.14, 0.06);
    const elevators = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -8.0, mat: matWing });

    addSideDecals(group, roundelBody, 1.6, 1.6, fuselageSideX(FUSE, SX, SY, -4.9, 0.05), 0.05, -4.9);

    const gear = buildRetractableGear(ENG_X[0], 1.3, 0.8, -7.8);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders,
      dorsalTurret,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 13.1, y: 0.4, z: 0.7 }, tails: [-1, 1].map(s => ({ x: s * 3.1, y: 1.5, z: -8.3 })) }
    });
  }

  // Soviet VVS scheme: dark green / black-green top, light blue underside, red stars
  function vvsCamo(key, seed, base) {
    return fxCamoPair(key, {
      base: base || '#3e4c2c', seed,
      blobs: [{ color: '#27311f', count: 8, size: 28 }, { color: '#6b6140', count: 3, size: 20 }],
      under: { color: '#8db3cc', width: 0.24 }
    }, [0.2, 0.4]);
  }

  // =========================================================================
  // F7. YAKOVLEV Yak-1 (Soviet VVS): small, light, inline-engined fighter with a red spinner
  // =========================================================================
  function createYak1() {
    const group = new THREE.Group();
    group.name = 'Yak1';
    const camo = vvsCamo('yak1', 101);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x8db3cc);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const matDark = fxMat(0x20262d, { metalness: 0.5 });
    const props = [];

    const FUSE = [V2(0.05, -3.7), V2(0.18, -3.1), V2(0.34, -2.0), V2(0.48, -0.8), V2(0.55, 0.3), V2(0.54, 1.4), V2(0.46, 2.4), V2(0.4, 3.2), V2(0.34, 3.6)];
    const SX = 0.86;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    // Cowl guns: 20mm ShVAK through the hub and a 12.7mm UBS on top
    for (const [gx, gy] of [[-0.1, 0.4], [0.1, 0.4]]) {
      const b = gunBarrel(0.024, 0.45, matGun);
      b.position.set(gx, gy, 3.65);
      group.add(b);
    }
    addFramedCanopy(group, { z: 0.15, y: 0.5, len: 0.95, w: 0.34, h: 0.4, frames: [-0.7, -0.2, 0.3, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.68, 0.1));
    // Oil cooler / radiator scoop under the nose
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.8), matDark);
    scoop.position.set(0, -0.5, 0.7);
    group.add(scoop);

    const WING = makePlanform(4.3, x => 1.0 - 0.3 * (x / 4.3), x => -0.9 + 0.55 * (x / 4.3), 0.1, 0.2, 0.08);
    const star = decalMat(cachedTexture('soviet_star', createSovietStarTexture));
    const wings = fxWings(group, WING, {
      y: -0.28, z: 0.4, dihedral: 0.05, top: matWing, under: matUnder, aileron: [2.6, 4.0],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 3.0, planformMidZ(WING, 3.0), 1.0, 1.0, star, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 3.0, planformMidZ(WING, 3.0), 1.0, 1.0, star, side < 0 ? -1 : 1));
      }
    });
    const FIN = makePlanform(1.3, h => -2.7 - 0.6 * (h / 1.3), h => -3.75 + 0.2 * (h / 1.3), 0.35, 0.1, 0.07);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.05, hingeZ: -3.3, thick: 0.1, finMat: matBody });
    const STAB = makePlanform(1.5, x => -2.9 - 0.1 * (x / 1.5), x => -3.7 + 0.15 * (x / 1.5), 0.25, 0.08, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -3.3, mat: matWing });

    addSideDecals(group, star, 0.9, 0.9, fuselageSideX(FUSE, SX, SY, -2.0, 0.05), 0.05, -2.0);
    fxProp(group, props, 0, 0, 3.6, 3, 1.4, 0xc81e1e, 0.62, { tipColor: null });

    const gear = buildRetractableGear(1.0, 1.3, 0.7, -3.3);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 4.25, y: -0.1, z: 0.3 }, tails: [{ x: 0, y: 1.1, z: -3.5 }] }
    });
  }

  // =========================================================================
  // F8. YAKOVLEV Yak-2 (Soviet VVS): twin M-103 inline engines, glazed nose, single fin
  // =========================================================================
  function createYak2() {
    const group = new THREE.Group();
    group.name = 'Yak2';
    const camo = vvsCamo('yak2', 202, '#3a4a2a');
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x8db3cc);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const matDark = fxMat(0x20262d, { metalness: 0.5 });
    const props = [];

    const FUSE = [V2(0.05, -4.6), V2(0.18, -3.9), V2(0.36, -2.5), V2(0.52, -1.0), V2(0.62, 0.4), V2(0.6, 1.8), V2(0.5, 3.0), V2(0.36, 3.9), V2(0.28, 4.3)];
    const SX = 0.85;
    const SY = 1.08;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    fxGlassBlob(group, 0, 0.06, 3.9, 0.3, 0.3, 0.6, matGlass, matFrame, [-0.3, 0.3]);
    for (const [gx, gy] of [[-0.12, 0.1], [0.12, 0.1], [-0.12, -0.08], [0.12, -0.08]]) {
      const b = gunBarrel(0.018, 0.55, matGun);
      b.position.set(gx, gy, 4.55);
      group.add(b);
    }
    addFramedCanopy(group, { z: 1.4, y: 0.62, len: 0.95, w: 0.38, h: 0.42, frames: [-0.6, 0, 0.6], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.82, 1.35));

    const WING = makePlanform(6.1, x => 1.2 - 0.4 * (x / 6.1), x => -1.2 + 0.85 * (x / 6.1), 0.1, 0.26, 0.09);
    const star = decalMat(cachedTexture('soviet_star', createSovietStarTexture));
    const ENG_X = 1.85;
    const wings = fxWings(group, WING, {
      y: -0.1, z: 0.3, dihedral: 0.04, top: matWing, under: matUnder, aileron: [3.8, 5.7],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 4.7, planformMidZ(WING, 4.7), 1.2, 1.2, star, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 4.7, planformMidZ(WING, 4.7), 1.2, 1.2, star, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.05, z0: -1.6, z1: 2.1, zNose: 2.9, r: 0.42, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.4 }) });
      fxProp(group, props, side * ENG_X, -0.05, 2.92, 3, 1.45, 0xc81e1e, 0.6, { tipColor: null });
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.8), matDark);
      rad.position.set(side * ENG_X, -0.45, 0.7);
      group.add(rad);
    }

    const FIN = makePlanform(1.7, h => -3.6 - 0.7 * (h / 1.7), h => -4.75 + 0.3 * (h / 1.7), 0.35, 0.11, 0.08);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.05, hingeZ: -4.2, thick: 0.11, finMat: matBody });
    const STAB = makePlanform(2.0, x => -3.8 - 0.1 * (x / 2.0), x => -4.6 + 0.15 * (x / 2.0), 0.2, 0.09, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.3, hingeZ: -4.15, mat: matWing });

    addSideDecals(group, star, 1.0, 1.0, fuselageSideX(FUSE, SX, SY, -2.4, 0.05), 0.05, -2.4);

    const gear = buildRetractableGear(ENG_X, 1.28, 0.6, -4.0);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 6.0, y: 0.0, z: 0.3 }, tails: [{ x: 0, y: 1.4, z: -4.3 }] }
    });
  }

  // =========================================================================
  // F9. ILYUSHIN Il-4 (Soviet long-range bomber): glazed nose, twin M-88 radials, open dorsal gun
  // =========================================================================
  const IL4_GUN = [0, 0.95, -1.5];
  function createIl4() {
    const group = new THREE.Group();
    group.name = 'Il4';
    const camo = fxCamoPair('il4', {
      base: '#34462c', seed: 404,
      blobs: [{ color: '#1f2a1b', count: 8, size: 34 }],
      under: { color: '#86a8c0', width: 0.26 }
    }, [0.1, 0.2]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0x86a8c0);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x1f2a1b, { metalness: 0.3 });
    const props = [];

    const FUSE = [V2(0.06, -6.4), V2(0.18, -5.7), V2(0.36, -4.2), V2(0.56, -2.2), V2(0.7, -0.2), V2(0.76, 1.6), V2(0.72, 3.2), V2(0.56, 4.4), V2(0.4, 5.1)];
    const SX = 0.88;
    const SY = 1.05;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    fxGlassBlob(group, 0, 0.0, 4.85, 0.44, 0.44, 0.85, matGlass, matFrame, [-0.5, 0, 0.5]);
    addFramedCanopy(group, { z: 2.6, y: 0.66, len: 1.0, w: 0.44, h: 0.42, frames: [-0.6, 0, 0.6], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.85, 2.5));
    const dorsalTurret = fxTurret(group, IL4_GUN[0], IL4_GUN[1], IL4_GUN[2], { r: 0.34, glass: matGlass, twin: false, len: 0.8, domeDrop: 0.16 });

    const WING = makePlanform(9.1, x => 1.5 - 0.6 * (x / 9.1), x => -1.3 + 0.8 * (x / 9.1), 0.12, 0.36, 0.11);
    const star = decalMat(cachedTexture('soviet_star', createSovietStarTexture));
    const ENG_X = 2.55;
    const wings = fxWings(group, WING, {
      y: -0.3, z: 0.3, dihedral: 0.035, top: matWing, under: matUnder, aileron: [6.0, 8.6],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 6.8, planformMidZ(WING, 6.8), 1.7, 1.7, star, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 6.8, planformMidZ(WING, 6.8), 1.7, 1.7, star, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.15, z0: -2.0, z1: 2.3, zNose: 3.1, r: 0.62, sy: 0.95, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * ENG_X, -0.15, 3.12, 3, 1.7, 0x20262d, 0.6, { tipColor: null });
    }

    const FIN = makePlanform(2.4, h => -4.9 - 0.8 * (h / 2.4), h => -6.3 + 0.5 * (h / 2.4), 0.4, 0.14, 0.1);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.05, hingeZ: -5.6, thick: 0.14, finMat: matBody });
    const STAB = makePlanform(3.0, x => -5.1 - 0.15 * (x / 3.0), x => -6.2 + 0.3 * (x / 3.0), 0.2, 0.12, 0.06);
    const elevators = addStabAndElevator(group, STAB, { y: 0.3, hingeZ: -5.7, mat: matWing });

    addSideDecals(group, star, 1.4, 1.4, fuselageSideX(FUSE, SX, SY, -3.4, 0.05), 0.05, -3.4);

    const gear = buildRetractableGear(ENG_X, 1.3, 0.7, -5.6);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      dorsalTurret,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 9.0, y: -0.1, z: 0.4 }, tails: [{ x: 0, y: 2.05, z: -5.9 }] }
    });
  }

  // =========================================================================
  // F10. KAWASAKI Ki-45 Toryu "Nick" (Imperial Japanese Army): slim twin-radial heavy fighter, 37mm nose gun
  // =========================================================================
  function createKi45() {
    const group = new THREE.Group();
    group.name = 'Ki45_Toryu';
    const camo = fxCamoPair('ki45', {
      base: '#4a5a3a', seed: 45,
      mottle: [{ color: 'rgba(60,72,46,0.5)', count: 90, size: 4 }],
      under: { color: '#bfc4c2', width: 0.22 }
    }, [0.18, 0.35]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xbfc4c2);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const matYellow = fxMat(0xf5c518, { roughness: 0.45 });
    const props = [];

    const FUSE = [V2(0.05, -4.9), V2(0.18, -4.2), V2(0.34, -2.8), V2(0.5, -1.2), V2(0.58, 0.3), V2(0.56, 1.6), V2(0.44, 2.9), V2(0.3, 3.9), V2(0.24, 4.3)];
    const SX = 0.82;
    const SY = 1.12;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    // 37mm Ho-203 cannon under the nose, 2 x 12.7mm Ho-103 in the nose
    const cannon = gunBarrel(0.05, 1.3, matGun);
    cannon.position.set(0, -0.28, 4.4);
    group.add(cannon);
    for (const gx of [-0.1, 0.1]) {
      const b = gunBarrel(0.022, 0.5, matGun);
      b.position.set(gx, 0.08, 4.55);
      group.add(b);
    }
    addFramedCanopy(group, { z: 0.5, y: 0.58, len: 1.7, w: 0.36, h: 0.5, frames: [-0.85, -0.45, -0.05, 0.35, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.78, 1.0));
    group.add(pilotHead(0, 0.74, -0.2));

    const WING = makePlanform(6.4, x => 1.1 - 0.3 * (x / 6.4), x => -1.3 + 0.95 * (x / 6.4), 0.12, 0.28, 0.09);
    const hinomaru = decalMat(cachedTexture('hinomaru_b', () => createHinomaruTexture(true)));
    const ENG_X = 1.95;
    const wings = fxWings(group, WING, {
      y: -0.18, z: 0.3, dihedral: 0.04, top: matWing, under: matUnder, aileron: [4.2, 6.0],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 4.9, planformMidZ(WING, 4.9), 1.3, 1.3, hinomaru, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 4.9, planformMidZ(WING, 4.9), 1.3, 1.3, hinomaru, side < 0 ? -1 : 1));
        w.add(planformSkin(WING, side, 5.7, 6.4, 1, matYellow));  // wingtip ID panel
        w.add(planformSkin(WING, side, 5.7, 6.4, -1, matYellow));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.1, z0: -1.9, z1: 2.3, zNose: 3.05, r: 0.5, sy: 0.95, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * ENG_X, -0.1, 3.07, 3, 1.5, 0x20262d, 0.55, { tipColor: null });
    }

    const FIN = makePlanform(1.6, h => -3.8 - 0.8 * (h / 1.6), h => -4.95 + 0.4 * (h / 1.6), 0.35, 0.11, 0.08);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.05, hingeZ: -4.4, thick: 0.11, finMat: matBody });
    const STAB = makePlanform(2.2, x => -3.95 - 0.1 * (x / 2.2), x => -4.8 + 0.2 * (x / 2.2), 0.2, 0.09, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.28, hingeZ: -4.35, mat: matWing });

    addSideDecals(group, hinomaru, 1.0, 1.0, fuselageSideX(FUSE, SX, SY, -2.4, 0.05), 0.05, -2.4);

    const gear = buildRetractableGear(ENG_X, 1.28, 0.6, -4.2);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 6.3, y: 0.0, z: 0.3 }, tails: [{ x: 0, y: 1.55, z: -4.6 }] }
    });
  }

  // =========================================================================
  // F11. MITSUBISHI G4M "Betty" (IJN bomber): cigar fuselage, twin Kasei radials, glazed tail cone
  // =========================================================================
  const G4M_GUN = [0, 1.42, -1.0];
  function createG4M() {
    const group = new THREE.Group();
    group.name = 'G4M_Betty';
    const camo = fxCamoPair('g4m', {
      base: '#3f5538', seed: 44,
      mottle: [{ color: 'rgba(40,56,36,0.5)', count: 80, size: 5 }],
      under: { color: '#aab4b0', width: 0.3 }
    }, [0.09, 0.18]);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xaab4b0);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3a28, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];

    // The Betty's deep, round "cigar" fuselage
    const FUSE = [V2(0.08, -8.4), V2(0.24, -7.4), V2(0.5, -5.4), V2(0.82, -2.8), V2(1.0, -0.2), V2(1.06, 2.4), V2(0.98, 4.8), V2(0.74, 6.6), V2(0.42, 7.7)];
    const SX = 0.95;
    const SY = 1.05;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 28));
    fxGlassBlob(group, 0, 0.05, 7.3, 0.4, 0.4, 0.7, matGlass, matFrame, [0]);
    addFramedCanopy(group, { z: 4.9, y: 0.82, len: 1.2, w: 0.6, h: 0.5, frames: [-0.7, -0.2, 0.3, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(-0.2, 1.05, 4.8));
    const dorsalTurret = fxTurret(group, G4M_GUN[0], G4M_GUN[1], G4M_GUN[2], { r: 0.42, glass: matGlass, twin: false, len: 0.9 });
    // Glazed tail cone with a 20mm cannon
    fxGlassBlob(group, 0, 0.0, -8.5, 0.22, 0.24, 0.5, matGlass, matFrame, []);
    const tailCannon = gunBarrel(0.03, 0.7, matGun);
    tailCannon.position.set(0, 0, -9.0);
    group.add(tailCannon);

    const WING = makePlanform(10.6, x => 1.7 - 0.65 * (x / 10.6), x => -1.5 + 1.0 * (x / 10.6), 0.12, 0.42, 0.12);
    const hinomaru = decalMat(cachedTexture('hinomaru_b', () => createHinomaruTexture(true)));
    const ENG_X = 3.4;
    const wings = fxWings(group, WING, {
      y: -0.1, z: 0.4, dihedral: 0.035, top: matWing, under: matUnder, aileron: [7.0, 10.0],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 7.6, planformMidZ(WING, 7.6), 2.0, 2.0, hinomaru, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 7.6, planformMidZ(WING, 7.6), 2.0, 2.0, hinomaru, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.2, z0: -2.4, z1: 2.4, zNose: 3.3, r: 0.64, sy: 0.95, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * ENG_X, -0.2, 3.32, 3, 1.75, 0x20262d, 0.6, { tipColor: null });
    }

    const FIN = makePlanform(2.7, h => -6.2 - 0.7 * (h / 2.7), h => -7.9 + 0.5 * (h / 2.7), 0.4, 0.14, 0.1);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.25, hingeZ: -7.2, thick: 0.14, finMat: matBody });
    const STAB = makePlanform(3.4, x => -6.5 - 0.2 * (x / 3.4), x => -7.7 + 0.35 * (x / 3.4), 0.2, 0.13, 0.06);
    const elevators = addStabAndElevator(group, STAB, { y: 0.4, hingeZ: -7.2, mat: matWing });

    addSideDecals(group, hinomaru, 1.9, 1.9, fuselageSideX(FUSE, SX, SY, -4.2, 0.05), 0.05, -4.2);

    const gear = buildRetractableGear(ENG_X, 1.3, 0.9, -7.0);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      dorsalTurret,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 10.5, y: 0.1, z: 0.5 }, tails: [{ x: 0, y: 2.35, z: -7.5 }] }
    });
  }

  // Regia Aeronautica sand scheme with green mottle and a grey underside
  function italianCamo(key, seed) {
    return fxCamoPair(key, {
      base: '#a38650', seed,
      rings: [{ color: '#4d5e30', count: 80, size: 9, width: 5 }],
      mottle: [{ color: 'rgba(77,94,48,0.55)', count: 130, size: 5 }],
      under: { color: '#aeb4aa', width: 0.2 }
    }, [0.2, 0.4]);
  }

  // =========================================================================
  // F12. MACCHI C.205 Veltro (Regia Aeronautica): DB 605 inline fighter, white fuselage band, tricolour cross
  // =========================================================================
  function createC205() {
    const group = new THREE.Group();
    group.name = 'C205_Veltro';
    const camo = italianCamo('c205', 205);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xaeb4aa);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const matWhite = fxMat(0xf1f5f9, { roughness: 0.5 });
    const matDark = fxMat(0x20262d, { metalness: 0.5 });
    const props = [];

    const FUSE = [V2(0.05, -3.9), V2(0.18, -3.3), V2(0.36, -2.2), V2(0.5, -1.0), V2(0.58, 0.2), V2(0.58, 1.3), V2(0.5, 2.4), V2(0.4, 3.2), V2(0.34, 3.7)];
    const SX = 0.86;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    group.add(fuselageBand(FUSE, SX, SY, -2.9, -2.35, matWhite)); // white fascia
    for (const gx of [-0.12, 0.12]) { // cowl 12.7mm Breda
      const b = gunBarrel(0.024, 0.4, matGun);
      b.position.set(gx, 0.4, 3.55);
      group.add(b);
    }
    addFramedCanopy(group, { z: 0.2, y: 0.5, len: 1.0, w: 0.34, h: 0.42, frames: [-0.7, -0.2, 0.3, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.7, 0.15));
    // Round oil / radiator scoop under the belly
    const scoop = latheFromProfile([V2(0.05, -0.2), V2(0.24, 0.3), V2(0.3, 1.2), V2(0.26, 1.6)], 1.0, 0.8, matDark, 14);
    scoop.position.set(0, -0.55, 0.0);
    group.add(scoop);

    const WING = makePlanform(4.5, x => 1.0 - 0.28 * (x / 4.5), x => -0.95 + 0.6 * (x / 4.5), 0.18, 0.21, 0.08);
    const wingMark = decalMat(cachedTexture('it_wing_mark', createItalianWingMarkTexture));
    const wings = fxWings(group, WING, {
      y: -0.28, z: 0.4, dihedral: 0.05, top: matWing, under: matUnder, aileron: [2.7, 4.2],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 3.2, planformMidZ(WING, 3.2), 1.0, 1.0, wingMark, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 3.2, planformMidZ(WING, 3.2), 1.0, 1.0, wingMark, side < 0 ? -1 : 1));
        for (const gx of [1.7]) { // wing-root 20mm MG 151 muzzle
          const b = gunBarrel(0.03, 0.5, matGun);
          b.position.set(gx, -0.02, WING.edges(gx)[0] + 0.15);
          w.add(b);
        }
      }
    });
    const FIN = makePlanform(1.4, h => -2.8 - 0.6 * (h / 1.4), h => -3.95 + 0.2 * (h / 1.4), 0.35, 0.1, 0.07);
    const rudder = addFinAndRudder(group, FIN, { yBase: 0.05, hingeZ: -3.5, thick: 0.1, finMat: matBody });
    const crossMat = decalMat(cachedTexture('sm79_cross', createRudderCrossTexture));
    for (const side of [-1, 1]) {
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.6), crossMat);
      cross.position.set(side * 0.07, 0.75, -3.8 + 3.5);
      cross.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      rudder.add(cross);
    }
    const STAB = makePlanform(1.55, x => -3.0 - 0.1 * (x / 1.55), x => -3.85 + 0.15 * (x / 1.55), 0.25, 0.08, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.2, hingeZ: -3.45, mat: matWing });

    fxProp(group, props, 0, 0, 3.7, 3, 1.4, 0x2c3a46, 0.62, { tipColor: null });

    const gear = buildRetractableGear(1.05, 1.3, 0.7, -3.4);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders: [rudder],
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 4.45, y: -0.1, z: 0.3 }, tails: [{ x: 0, y: 1.1, z: -3.6 }] }
    });
  }

  // =========================================================================
  // F13. BREDA Ro.57 (Regia Aeronautica): twin A.74 radials, single-seat canopy, twin fins
  // =========================================================================
  function createRo57() {
    const group = new THREE.Group();
    group.name = 'Ro57';
    const camo = italianCamo('ro57', 57);
    const matBody = camo.fuse;
    const matWing = camo.wing;
    const matUnder = fxMat(0xaeb4aa);
    const matGlass = glassMaterial();
    const matFrame = fxMat(0x2b3438, { metalness: 0.3 });
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    const props = [];

    const FUSE = [V2(0.05, -4.4), V2(0.18, -3.7), V2(0.34, -2.4), V2(0.5, -1.0), V2(0.58, 0.3), V2(0.56, 1.5), V2(0.42, 2.7), V2(0.3, 3.5), V2(0.24, 3.9)];
    const SX = 0.84;
    const SY = 1.1;
    group.add(latheFromProfile(FUSE, SX, SY, matBody, 24));
    for (const gx of [-0.1, 0.1]) {
      const b = gunBarrel(0.024, 0.55, matGun);
      b.position.set(gx, 0.04, 4.1);
      group.add(b);
    }
    addFramedCanopy(group, { z: 0.5, y: 0.56, len: 1.2, w: 0.36, h: 0.46, frames: [-0.7, -0.2, 0.3, 0.75], glass: matGlass, frame: matFrame });
    group.add(pilotHead(0, 0.76, 0.5));

    const WING = makePlanform(5.4, x => 1.1 - 0.35 * (x / 5.4), x => -1.15 + 0.8 * (x / 5.4), 0.14, 0.26, 0.09);
    const wingMark = decalMat(cachedTexture('it_wing_mark', createItalianWingMarkTexture));
    const ENG_X = 1.75;
    const wings = fxWings(group, WING, {
      y: -0.22, z: 0.3, dihedral: 0.04, top: matWing, under: matUnder, aileron: [3.4, 5.0],
      perSide: (side, w) => {
        w.add(planformDecal(WING, side, 4.1, planformMidZ(WING, 4.1), 1.2, 1.2, wingMark, side < 0 ? 1 : -1));
        w.add(planformDecal(WING, side, 4.1, planformMidZ(WING, 4.1), 1.2, 1.2, wingMark, side < 0 ? -1 : 1));
      }
    });
    for (const side of [-1, 1]) {
      fxNacelle(group, { x: side * ENG_X, y: -0.12, z0: -1.7, z1: 2.0, zNose: 2.8, r: 0.5, sy: 0.95, mat: matWing, cowlMat: fxMat(0x39434d, { metalness: 0.5 }), radial: 14 });
      fxProp(group, props, side * ENG_X, -0.12, 2.82, 3, 1.5, 0x20262d, 0.55, { tipColor: null });
    }

    // Twin fins on the ends of the tailplane
    const crossMat = decalMat(cachedTexture('sm79_cross', createRudderCrossTexture));
    const FIN = makePlanform(1.3, h => -3.3 - 0.6 * (h / 1.3), h => -4.35 + 0.25 * (h / 1.3), 0.4, 0.1, 0.07);
    const rudders = [-1, 1].map(side => {
      const r = fxFinAt(group, side * 2.0, FIN, { yBase: -0.1, hingeZ: -3.9, thick: 0.1, finMat: matBody });
      return r;
    });
    const STAB = makePlanform(2.4, x => -3.4 - 0.1 * (x / 2.4), x => -4.2 + 0.15 * (x / 2.4), 0.2, 0.09, 0.05);
    const elevators = addStabAndElevator(group, STAB, { y: 0.15, hingeZ: -3.85, mat: matWing });
    for (const r of rudders) {
      for (const side of [-1, 1]) {
        const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), crossMat);
        cross.position.set(side * 0.06, 0.6, -4.05 + 3.9);
        cross.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        r.add(cross);
      }
    }

    const gear = buildRetractableGear(ENG_X, 1.28, 0.6, -3.7);
    group.add(gear.gearGroup);

    return fxFinishModel(group, props, {
      leftAileron: wings.left,
      rightAileron: wings.right,
      elevators: [elevators],
      rudders,
      setGearDeployment: gear.setGearDeployment,
      setFlapDroop: d => { wings.left.rotation.x = d; wings.right.rotation.x = d; },
      teamMarks: { wingtip: { x: 5.3, y: 0.0, z: 0.3 }, tails: [-1, 1].map(s => ({ x: s * 2.0, y: 1.0, z: -4.1 })) }
    });
  }

  // =========================================================================
  // F14. SUPERMARINE SPITFIRE Mk IX (RAF): the Mk I airframe with the 4-blade Merlin 61 propeller and cannon armament
  // =========================================================================
  function createSpitfireMk9() {
    const m = createSpitfireMk1();
    const group = m.group;
    group.name = 'Spitfire_IX';
    // Replace the 3-blade propeller with the Mk IX's 4-blade Rotol
    group.remove(m.propellers[0]);
    group.remove(m.blurDisc);
    const props = [];
    fxProp(group, props, 0, 0, 4.05, 4, 1.62, 0x18181b, 0.74, { tipColor: null });
    // 20mm Hispano cannon barrels sticking out of the wing leading edges
    const matGun = fxMat(0x1e293b, { metalness: 0.85, roughness: 0.3 });
    for (const side of [-1, 1]) {
      const b = gunBarrel(0.034, 0.55, matGun);
      b.position.set(side * 1.95, -0.22, 1.55);
      group.add(b);
    }
    return Object.assign(m, {
      propellers: props.map(p => p.propGroup),
      blurDisc: props[0].blurDisc,
      teamMarks: { wingtip: { x: 5.1, y: -0.12, z: 0.3 }, tails: [{ x: 0, y: 1.2, z: -4.4 }] }
    });
  }

  function createAircraftById(planeId) {
    switch (planeId) {
      case 'p51d':
        return createP51Mustang({ bubble: true });
      case 'yak1':
        return createYak1();
      case 'yak2':
        return createYak2();
      case 'il4':
        return createIl4();
      case 'ki45':
        return createKi45();
      case 'g4m':
        return createG4M();
      case 'c205':
        return createC205();
      case 'ro57':
        return createRo57();
      case 'spitfire9':
        return createSpitfireMk9();
      case 'bf110':
        return createBf110();
      case 'he111':
        return createHe111();
      case 'beaufighter':
        return createBeaufighter();
      case 'lancaster':
        return createLancaster();
      case 'p38':
        return createP38Lightning();
      case 'b25':
        return createB25Mitchell();
      case 'mustang':
        return createP51Mustang();
      case 'zero':
        return createA6MZero();
      case 'bf109':
        return createBf109();
      case 'il2':
        return createIl2Sturmovik();
      case 'spitfire':
        return createSpitfireMk1();
      case 'sm79':
        return createSM79Sparviero();
      default:
        return createP51Mustang();
    }
  }

  return {
    createP51Mustang,
    createA6MZero,
    createBf109,
    createIl2Sturmovik,
    createSpitfireMk1,
    createSM79Sparviero,
    createAircraftById
  };
}));
