import * as THREE from 'three';

/**
 * AK-47 Type 3 Milled Receiver Assembly
 * -------------------------------------
 * Coordinate system (1 unit = 100 mm, 0.01 = 1 mm):
 *   +X = muzzle, -X = buttstock
 *   +Y = up,     -Y = down
 *   +Z = right side (ejection port, charging handle, selector)
 *   -Z = left side  (rear sling swivel mount)
 *   Origin (0, 0, 0) = bore centerline at the front face of the receiver.
 */

// ============================================================================
// Geometry & Math Utilities
// ============================================================================

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.userData && obj.userData.noCastShadow) {
        obj.castShadow = false;
      } else {
        obj.castShadow = true;
      }
      obj.receiveShadow = true;
    }
  });
}

/**
 * Computes clean box-projected UVs aligned with the rifle X axis (U along X, V along Y/Z)
 * so brushed steel grain flows consistently lengthwise along X on extruded side/top parts.
 */
function projectBoxUVsAlongX(geo, scaleU = 0.55, scaleV = 1.65) {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  if (!pos || !norm || !uv) return geo;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(norm.getX(i));
    const ay = Math.abs(norm.getY(i));
    const az = Math.abs(norm.getZ(i));
    if (ax >= ay && ax >= az) {
      // Front/rear faces (YZ plane)
      uv.setXY(i, z * scaleU, y * scaleV);
    } else if (ay >= az) {
      // Top/bottom faces (XZ plane): brush grain runs along X
      uv.setXY(i, x * scaleU, z * scaleV);
    } else {
      // Left/right faces (XY plane): brush grain runs along X
      uv.setXY(i, x * scaleU, y * scaleV);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Creates a rounded rectangle THREE.Shape centered at (0, 0) of exact width w, height h.
 */
function createRoundedRectShape(w, h, radius) {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const r = Math.min(radius, hw * 0.95, hh * 0.95);
  const shape = new THREE.Shape();

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return shape;
}

/**
 * Creates a beveled box centered at (0, 0, 0) whose outer bounding box is
 * strictly [-w/2, +w/2] x [-h/2, +h/2] x [-d/2, +d/2].
 */
function createBeveledBox(w, h, d, bevel = 0.008, bevelSegments = 2) {
  const b = Math.min(bevel, w * 0.35, h * 0.35, d * 0.35);
  const innerW = Math.max(0.001, w - 2 * b);
  const innerH = Math.max(0.001, h - 2 * b);
  const innerD = Math.max(0.001, d - 2 * b);
  const cornerR = Math.min(b * 0.65, innerW * 0.45, innerH * 0.45);

  const shape = createRoundedRectShape(innerW, innerH, cornerR);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerD,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments,
    curveSegments: 8,
  });
  geo.translate(0, 0, -innerD * 0.5);
  geo.computeVertexNormals();
  projectBoxUVsAlongX(geo, 0.55, 1.55);
  return geo;
}

/**
 * Creates a stadium (oblong rounded-end) Path centered at (cx, cy).
 * Pass clockwise = true when used as a hole inside a CCW outer Shape.
 */
function createStadiumPath(cx, cy, lengthX, heightY, clockwise = true) {
  return buildStadiumContour(new THREE.Path(), cx, cy, lengthX, heightY, clockwise);
}

/**
 * Creates a stadium (oblong rounded-end) THREE.Shape centered at (cx, cy) for ExtrudeGeometry.
 */
function createStadiumShape(cx, cy, lengthX, heightY) {
  return buildStadiumContour(new THREE.Shape(), cx, cy, lengthX, heightY, false);
}

function buildStadiumContour(path, cx, cy, lengthX, heightY, clockwise) {
  const r = Math.min(heightY * 0.5, lengthX * 0.48);
  const halfStraight = Math.max(0.001, lengthX * 0.5 - r);

  if (clockwise) {
    // Top-left -> top-right -> right semicircle down -> bottom-left -> left semicircle up (returns cleanly to start)
    path.moveTo(cx - halfStraight, cy + r);
    path.lineTo(cx + halfStraight, cy + r);
    path.absarc(cx + halfStraight, cy, r, Math.PI * 0.5, -Math.PI * 0.5, true);
    path.lineTo(cx - halfStraight, cy - r);
    path.absarc(cx - halfStraight, cy, r, -Math.PI * 0.5, Math.PI * 0.5, true);
  } else {
    path.moveTo(cx - halfStraight, cy - r);
    path.lineTo(cx + halfStraight, cy - r);
    path.absarc(cx + halfStraight, cy, r, -Math.PI * 0.5, Math.PI * 0.5, false);
    path.lineTo(cx - halfStraight, cy + r);
    path.absarc(cx - halfStraight, cy, r, Math.PI * 0.5, -Math.PI * 0.5, false);
  }
  return path;
}

/**
 * Creates a domed/beveled cylindrical steel pin spanning Z = [-halfLen, +halfLen].
 */
function createDomedPinGeometry(radius, halfLen, domeHeight = 0.007, radialSegments = 20) {
  // LatheGeometry revolves around Y; we rotate onto Z afterwards.
  // Use 0.0005 minimum pole radius to guarantee clean non-degenerate vertex normals.
  const bevel = Math.min(radius * 0.25, domeHeight);
  const pts = [
    new THREE.Vector2(0.0005, -halfLen - domeHeight),
    new THREE.Vector2(radius * 0.55, -halfLen - domeHeight * 0.82),
    new THREE.Vector2(radius * 0.88, -halfLen - bevel * 0.35),
    new THREE.Vector2(radius, -halfLen),
    new THREE.Vector2(radius, halfLen),
    new THREE.Vector2(radius * 0.88, halfLen + bevel * 0.35),
    new THREE.Vector2(radius * 0.55, halfLen + domeHeight * 0.82),
    new THREE.Vector2(0.0005, halfLen + domeHeight),
  ];
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  geo.rotateX(Math.PI * 0.5); // align lathe Y axis onto +Z
  geo.computeVertexNormals();
  return geo;
}

// ============================================================================
// 1. Type 3 Milled Receiver Body + Rear Sight Block + Trigger Guard + Mag Catch
// ============================================================================

/**
 * Builds the 2D XY side silhouette of the Type 3 milled receiver.
 * Inset slightly by `inset` so ExtrudeGeometry bevel expansion lands on exact outer bounds:
 *   X in [-2.40, 0.00], Y in [-0.44, +0.08], front-lower angled chin (-0.24, -0.44) -> (0.00, -0.26).
 */
function createReceiverSideProfile(inset = 0.008) {
  const xMin = -2.40 + inset;
  const xMax = 0.00 - inset;
  const yBot = -0.44 + inset;
  const yTopRear = 0.075 - inset;
  const yTopFront = 0.080 - inset;
  const xChinStart = -0.24 - inset * 0.4;
  const yChinFront = -0.26 + inset * 0.5;
  const rCorner = 0.010;

  const shape = new THREE.Shape();
  // Counter-clockwise outer contour
  shape.moveTo(xMin + rCorner, yBot);
  shape.lineTo(xChinStart - rCorner, yBot);
  shape.quadraticCurveTo(xChinStart, yBot, xChinStart + rCorner * 0.8, yBot + rCorner * 0.6);
  shape.lineTo(xMax - rCorner * 0.6, yChinFront - rCorner * 0.5);
  shape.quadraticCurveTo(xMax, yChinFront, xMax, yChinFront + rCorner);
  shape.lineTo(xMax, yTopFront - rCorner);
  shape.quadraticCurveTo(xMax, yTopFront, xMax - rCorner, yTopFront);
  shape.lineTo(-0.52, yTopFront);
  shape.lineTo(-0.54, yTopRear);
  shape.lineTo(xMin + rCorner, yTopRear);
  shape.quadraticCurveTo(xMin, yTopRear, xMin, yTopRear - rCorner);
  shape.lineTo(xMin, yBot + rCorner);
  shape.quadraticCurveTo(xMin, yBot, xMin + rCorner, yBot);
  return shape;
}

/**
 * Builds one left or right Type 3 milled sidewall with the authentic recessed oblong
 * lightening cut above the magwell (recessed inward 0.025 with darker inner bevel frame).
 * Left side (-Z): X = -0.91..-0.34, Y = -0.22..-0.02 (keeps auto-sear pin at -0.96 cleanly on solid steel!).
 * Right side (+Z): X = -0.86..-0.34, Y = -0.22..-0.02 so Cyrillic АВ/ОД markings, detent
 * notches, and the auto-sear pin (X = -0.96) all sit solidly on flat blued steel (authentic Type 3!).
 */
function buildReceiverSidewall(sideSign, materials) {
  const wallGroup = new THREE.Group();
  wallGroup.name = sideSign > 0 ? 'ReceiverRightWall' : 'ReceiverLeftWall';

  const bevelSize = 0.008;
  const bevelThick = 0.007;

  const cutXMin = sideSign > 0 ? -0.86 : -0.91;
  const cutXMax = -0.34;
  const cutCx = (cutXMin + cutXMax) * 0.5;
  const cutLen = cutXMax - cutXMin;
  const cutCy = -0.12;
  const cutH = 0.20;

  // --- Layer A: Outer milled wall plate with true punched oblong lightening pocket ---
  const outerShape = createReceiverSideProfile(bevelSize);
  // Expand raw hole by bevelSize so the chamfered outer lip lands cleanly on exact pocket bounds
  const pocketHole = createStadiumPath(cutCx, cutCy, cutLen + bevelSize * 1.4, cutH + bevelSize * 1.4, true);
  outerShape.holes.push(pocketHole);

  const outerDepth = 0.025 - 2 * bevelThick; // 0.011; total Z span with bevels = 0.025
  const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
    depth: outerDepth,
    bevelEnabled: true,
    bevelThickness: bevelThick,
    bevelSize,
    bevelSegments: 3,
    curveSegments: 24,
  });
  outerGeo.translate(0, 0, -outerDepth * 0.5);
  outerGeo.computeVertexNormals();
  projectBoxUVsAlongX(outerGeo, 0.55, 1.85);

  const outerMesh = new THREE.Mesh(outerGeo, materials.bluedSteel);
  // Position so outer beveled face sits strictly at |Z| = 0.180 and inner face at |Z| = 0.155
  outerMesh.position.z = sideSign * (0.180 - 0.0125);
  wallGroup.add(outerMesh);

  // --- Layer B: Solid structural inner wall backing (|Z| = 0.135 to 0.156) ---
  const innerShape = createReceiverSideProfile(0.010);
  const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
    depth: 0.020,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 1,
    curveSegments: 16,
  });
  innerGeo.translate(0, 0, -0.010);
  innerGeo.computeVertexNormals();
  projectBoxUVsAlongX(innerGeo, 0.55, 1.85);

  const innerMesh = new THREE.Mesh(innerGeo, materials.bluedSteel);
  innerMesh.position.z = sideSign * 0.145;
  wallGroup.add(innerMesh);

  // --- Layer C: Darker milled pocket inner bevel frame & machined floor accent ---
  // Creates deep machined contrast inside the Type 3 oblong lightening cut without Z-fighting.
  const floorShape = createStadiumShape(cutCx, cutCy, cutLen - 0.036, 0.176);

  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 20,
  });
  floorGeo.translate(0, 0, -0.002);
  floorGeo.computeVertexNormals();
  projectBoxUVsAlongX(floorGeo, 0.8, 1.4);

  const floorMesh = new THREE.Mesh(floorGeo, materials.parkerizedSteel);
  // Sits neatly proud of Layer B at |Z| = 0.1575, recessed 0.0225 inside outer wall |Z| = 0.180
  floorMesh.position.z = sideSign * 0.156;
  wallGroup.add(floorMesh);

  // Subtle dark shadow-frame ring hugging the recessed perimeter inside the pocket
  const frameOuter = createStadiumShape(cutCx, cutCy, cutLen - 0.004, 0.196);
  const frameHole = createStadiumPath(cutCx, cutCy, cutLen - 0.045, 0.172, true);
  frameOuter.holes.push(frameHole);

  const frameGeo = new THREE.ExtrudeGeometry(frameOuter, {
    depth: 0.005,
    bevelEnabled: false,
    curveSegments: 20,
  });
  frameGeo.translate(0, 0, -0.0025);
  frameGeo.computeVertexNormals();

  const frameMesh = new THREE.Mesh(frameGeo, materials.darkSteel);
  frameMesh.position.z = sideSign * 0.1595;
  wallGroup.add(frameMesh);

  return wallGroup;
}

/**
 * Builds the internal receiver core, hollowed magwell cavity, beveled magwell collar,
 * front barrel trunnion block, rear stock tang block, bolt guide rails, internal hammer,
 * and coiled recoil spring guide assembly.
 */
function buildReceiverCoreAndInternals(materials) {
  const core = new THREE.Group();
  core.name = 'ReceiverCore';

  // 1. Front Trunnion / Barrel Block (X = -0.32 to 0.00, matching angled front chin)
  const trunnionShape = new THREE.Shape();
  trunnionShape.moveTo(-0.32, -0.44);
  trunnionShape.lineTo(-0.24, -0.44);
  trunnionShape.lineTo(0.00, -0.26);
  trunnionShape.lineTo(0.00, 0.08);
  trunnionShape.lineTo(-0.32, 0.08);
  trunnionShape.closePath();

  const trunnionGeo = new THREE.ExtrudeGeometry(trunnionShape, {
    depth: 0.272, // spans Z = -0.136 to +0.136 seamlessly between sidewalls
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  trunnionGeo.translate(0, 0, -0.136);
  trunnionGeo.computeVertexNormals();
  projectBoxUVsAlongX(trunnionGeo, 0.55, 1.85);
  const trunnionMesh = new THREE.Mesh(trunnionGeo, materials.bluedSteel);
  core.add(trunnionMesh);

  // Dark breech chamber face & barrel throat on rear of front trunnion (visible when bolt cycles)
  const chamberGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.05, 24);
  chamberGeo.rotateZ(Math.PI * 0.5);
  const chamberMesh = new THREE.Mesh(chamberGeo, materials.darkSteel);
  chamberMesh.position.set(-0.315, 0.0, 0.0);
  core.add(chamberMesh);

  // Polished steel breech ring face around chamber mouth
  const breechRingGeo = new THREE.TorusGeometry(0.082, 0.011, 10, 24);
  breechRingGeo.rotateY(Math.PI * 0.5);
  const breechRingMesh = new THREE.Mesh(breechRingGeo, materials.parkerizedSteel);
  breechRingMesh.position.set(-0.322, 0.0, 0.0);
  core.add(breechRingMesh);

  // Angled bullet guide / feed ramp below chamber leading out of magwell
  const rampGeo = createBeveledBox(0.11, 0.055, 0.13, 0.006, 2);
  const rampMesh = new THREE.Mesh(rampGeo, materials.parkerizedSteel);
  rampMesh.position.set(-0.35, -0.115, 0.0);
  rampMesh.rotation.z = 0.42;
  core.add(rampMesh);

  // 2. Rear Solid Stock Trunnion Block (X = -2.40 to -2.10, Y = -0.44 to +0.06, Z = -0.138..+0.138)
  const rearBlockGeo = createBeveledBox(0.30, 0.50, 0.276, 0.008, 2);
  const rearBlockMesh = new THREE.Mesh(rearBlockGeo, materials.bluedSteel);
  rearBlockMesh.position.set(-2.25, -0.19, 0.0);
  core.add(rearBlockMesh);

  // 3. Receiver Bottom Floor behind Magwell (X = -2.12 to -1.06) with real Trigger Slot cutout
  const floorOuter = createRoundedRectShape(1.06, 0.276, 0.006);
  // Trigger slot centered around X = -1.48 (offset from floor center -1.59 by +0.11)
  const triggerSlot = createStadiumPath(0.11, 0.0, 0.24, 0.075, true);
  floorOuter.holes.push(triggerSlot);

  const floorGeo = new THREE.ExtrudeGeometry(floorOuter, {
    depth: 0.048,
    bevelEnabled: false,
    curveSegments: 12,
  });
  floorGeo.rotateX(Math.PI * 0.5); // shape X->X, shape Y->Z, depth along -Y
  floorGeo.computeVertexNormals();
  projectBoxUVsAlongX(floorGeo, 0.55, 1.85);
  const floorMesh = new THREE.Mesh(floorGeo, materials.bluedSteel);
  floorMesh.position.set(-1.59, -0.392, 0.0);
  core.add(floorMesh);

  // Dark trigger-slot cavity box right above slot
  const trigCavityGeo = createBeveledBox(0.28, 0.08, 0.11, 0.004, 1);
  const trigCavityMesh = new THREE.Mesh(trigCavityGeo, materials.darkSteel);
  trigCavityMesh.position.set(-1.48, -0.36, 0.0);
  core.add(trigCavityMesh);

  // 4. Hollowed Magazine Well (X = -1.06 to -0.32, Z = -0.135 to +0.135, Y = -0.44)
  // Subtle beveled magwell collar/lip framing the opening
  const magCollarOuter = createRoundedRectShape(0.79, 0.30, 0.014);
  const magCollarHole = new THREE.Path();
  // Inner opening X = -1.055..-0.325 (len 0.73), Z = -0.133..+0.133 (width 0.266)
  const hx = 0.365;
  const hz = 0.133;
  const hr = 0.010;
  magCollarHole.moveTo(-hx + hr, hz);
  magCollarHole.lineTo(hx - hr, hz);
  magCollarHole.quadraticCurveTo(hx, hz, hx, hz - hr);
  magCollarHole.lineTo(hx, -hz + hr);
  magCollarHole.quadraticCurveTo(hx, -hz, hx - hr, -hz);
  magCollarHole.lineTo(-hx + hr, -hz);
  magCollarHole.quadraticCurveTo(-hx, -hz, -hx, -hz + hr);
  magCollarHole.lineTo(-hx, hz - hr);
  magCollarHole.quadraticCurveTo(-hx, hz, -hx + hr, hz);
  magCollarOuter.holes.push(magCollarHole);

  const magCollarGeo = new THREE.ExtrudeGeometry(magCollarOuter, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 10,
  });
  magCollarGeo.rotateX(Math.PI * 0.5);
  magCollarGeo.computeVertexNormals();
  projectBoxUVsAlongX(magCollarGeo, 0.55, 1.55);
  const magCollarMesh = new THREE.Mesh(magCollarGeo, materials.bluedSteel);
  magCollarMesh.position.set(-0.69, -0.422, 0.0);
  core.add(magCollarMesh);

  // Dark recessed interior magwell throat walls (visible when magazine is detached!)
  const magWallThick = 0.016;
  const magWallH = 0.36;
  const magWallY = -0.24;

  // Front & rear dark interior liners of magwell
  const magFrontBackGeo = createBeveledBox(magWallThick, magWallH, 0.268, 0.003, 1);
  const magFrontWall = new THREE.Mesh(magFrontBackGeo, materials.darkSteel);
  magFrontWall.position.set(-0.322, magWallY, 0.0);
  core.add(magFrontWall);

  const magRearWall = new THREE.Mesh(magFrontBackGeo, materials.darkSteel);
  magRearWall.position.set(-1.058, magWallY, 0.0);
  core.add(magRearWall);

  // Left & right dark interior liners of receiver cavity (X = -2.10 to -0.32)
  const cavitySideGeo = createBeveledBox(1.76, 0.42, 0.012, 0.003, 1);
  for (const s of [-1, 1]) {
    const sideLiner = new THREE.Mesh(cavitySideGeo, materials.darkSteel);
    sideLiner.position.set(-1.21, -0.20, s * 0.132);
    core.add(sideLiner);
  }

  // Front magazine locking-lug shelf inside front lip of magwell (X = -0.34, Y = -0.40)
  const frontLugShelfGeo = createBeveledBox(0.045, 0.030, 0.15, 0.004, 1);
  const frontLugShelf = new THREE.Mesh(frontLugShelfGeo, materials.parkerizedSteel);
  frontLugShelf.position.set(-0.335, -0.395, 0.0);
  core.add(frontLugShelf);

  // Dark recessed floor inside rear fire-control cavity so looking down through open dust cover looks deep
  const fcgFloorGeo = createBeveledBox(1.02, 0.018, 0.256, 0.003, 1);
  const fcgFloor = new THREE.Mesh(fcgFloorGeo, materials.darkSteel);
  fcgFloor.position.set(-1.58, -0.385, 0.0);
  core.add(fcgFloor);

  // 5. Internal Machined Bolt Carrier Guide Rails (left & right top interior flanges)
  const railGeo = createBeveledBox(1.76, 0.032, 0.030, 0.004, 1);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, materials.parkerizedSteel);
    rail.position.set(-1.21, 0.046, s * 0.122);
    core.add(rail);
  }

  // Classic AK left-side fixed steel ejector spur protruding inward into bolt path
  const ejectorGeo = createBeveledBox(0.22, 0.022, 0.048, 0.003, 1);
  const ejector = new THREE.Mesh(ejectorGeo, materials.polishedSteel);
  ejector.position.set(-1.14, 0.036, -0.104);
  core.add(ejector);

  // 6. Internal Hammer & Fire-Control Group (visible when dust cover & bolt carrier explode!)
  const hammerGroup = new THREE.Group();
  hammerGroup.position.set(-1.24, -0.24, 0.0);
  const hammerBossGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 16);
  hammerBossGeo.rotateX(Math.PI * 0.5);
  hammerGroup.add(new THREE.Mesh(hammerBossGeo, materials.parkerizedSteel));

  const hammerArmGeo = createBeveledBox(0.065, 0.22, 0.075, 0.008, 2);
  const hammerArm = new THREE.Mesh(hammerArmGeo, materials.parkerizedSteel);
  hammerArm.position.set(-0.045, 0.10, 0.0);
  hammerArm.rotation.z = 0.42; // cocked slightly rearward
  hammerGroup.add(hammerArm);

  const hammerFaceGeo = createBeveledBox(0.09, 0.07, 0.095, 0.008, 2);
  const hammerFace = new THREE.Mesh(hammerFaceGeo, materials.polishedSteel);
  hammerFace.position.set(-0.095, 0.195, 0.0);
  hammerFace.rotation.z = 0.25;
  hammerGroup.add(hammerFace);
  core.add(hammerGroup);

  // 7. Internal Recoil Spring Guide Rod & Helical Steel Spring (X = -2.35..-1.30, Y = +0.195, Z = 0)
  // Positioned cleanly behind the upper closed dust cover arch (above the Y=0.172 charging handle slot)
  // so it stays hidden when assembled & revealed cleanly in dark tempered spring steel when exploded!
  const guideRodGeo = new THREE.CylinderGeometry(0.013, 0.013, 1.04, 12);
  guideRodGeo.rotateZ(Math.PI * 0.5);
  const guideRod = new THREE.Mesh(guideRodGeo, materials.darkSteel);
  guideRod.position.set(-1.82, 0.195, 0.0);
  core.add(guideRod);

  // Helical recoil spring along X = -2.30 to -1.32
  const springPts = [];
  const turns = 22;
  const samples = turns * 10;
  const xStart = -2.30;
  const xEnd = -1.32;
  const springR = 0.025;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = t * turns * Math.PI * 2;
    const x = xStart + (xEnd - xStart) * t;
    const y = 0.195 + Math.cos(angle) * springR;
    const z = Math.sin(angle) * springR;
    springPts.push(new THREE.Vector3(x, y, z));
  }
  const springCurve = new THREE.CatmullRomCurve3(springPts);
  const springGeo = new THREE.TubeGeometry(springCurve, samples, 0.0042, 6, false);
  const springMesh = new THREE.Mesh(springGeo, materials.parkerizedSteel);
  core.add(springMesh);

  return core;
}

/**
 * Builds the domed steel axis pins, barrel trunnion cross-pin, rear-left Type 3 sling swivel,
 * right-side selector detent notches/stop tab, and Cyrillic markings decal plate.
 */
function buildReceiverHardwareAndMarkings(materials) {
  const hw = new THREE.Group();
  hw.name = 'ReceiverHardware';

  // 1. Axis Pins & Barrel Trunnion Cross-Pin (protruding cleanly on BOTH Z sides)
  const pinSpecs = [
    // { x, y, r, dome, mat }
    { x: -1.24, y: -0.24, r: 0.025, dome: 0.008, mat: materials.polishedSteel }, // Hammer pin
    { x: -1.62, y: -0.24, r: 0.025, dome: 0.008, mat: materials.polishedSteel }, // Trigger pin
    { x: -0.96, y: -0.08, r: 0.020, dome: 0.007, mat: materials.polishedSteel }, // Auto-sear 3rd pin
    { x: -0.14, y: -0.06, r: 0.032, dome: 0.008, mat: materials.parkerizedSteel }, // Barrel trunnion cross-pin
    { x: -1.04, y: -0.355, r: 0.017, dome: 0.006, mat: materials.parkerizedSteel }, // Center support pin
  ];

  for (const p of pinSpecs) {
    const pinGeo = createDomedPinGeometry(p.r, 0.181, p.dome, 20);
    const pinMesh = new THREE.Mesh(pinGeo, p.mat);
    pinMesh.position.set(p.x, p.y, 0.0);
    hw.add(pinMesh);

    // Subtle dark recessed collar ring around each pin head on both flanks
    const ringGeo = new THREE.TorusGeometry(p.r + 0.0025, 0.0028, 8, 20);
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(ringGeo, materials.darkSteel);
      ring.position.set(p.x, p.y, s * 0.181);
      hw.add(ring);
    }
  }

  // 2. Iconic Type 3 Rear-Left Side Sling Swivel Mount Tab (X = -2.30, Y = -0.20, Z = -0.19)
  const slingGroup = new THREE.Group();
  slingGroup.name = 'RearLeftSlingMount';
  slingGroup.position.set(-2.30, -0.20, -0.18);

  // Sculpted steel mounting bracket lug protruding from receiver left flank
  const lugGeo = createBeveledBox(0.115, 0.088, 0.048, 0.008, 2);
  const lugMesh = new THREE.Mesh(lugGeo, materials.parkerizedSteel);
  lugMesh.position.set(0.0, 0.0, -0.020);
  slingGroup.add(lugMesh);

  // Cylindrical swivel hinge pin through the lug
  const hingePinGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.095, 14);
  const hingePin = new THREE.Mesh(hingePinGeo, materials.bluedSteel);
  hingePin.position.set(0.0, 0.0, -0.032);
  slingGroup.add(hingePin);

  // Bent steel oval wire sling loop hanging slightly outward & downward
  const loopPts = [];
  const loopSegs = 32;
  const rxL = 0.046;
  const ryL = 0.072;
  for (let i = 0; i < loopSegs; i++) {
    const a = (i / loopSegs) * Math.PI * 2;
    // Stadium-oval cross-section loop
    const lx = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.72) * rxL;
    const ly = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.72) * ryL - 0.048;
    loopPts.push(new THREE.Vector3(lx, ly, -0.036));
  }
  const loopCurve = new THREE.CatmullRomCurve3(loopPts, true);
  const loopGeo = new THREE.TubeGeometry(loopCurve, 40, 0.010, 10, true);
  const loopMesh = new THREE.Mesh(loopGeo, materials.parkerizedSteel);
  loopMesh.rotation.x = 0.24; // hangs naturally slightly away from receiver wall
  slingGroup.add(loopMesh);
  hw.add(slingGroup);

  // 3. Right-Side Selector Detent Notches, Arc Scratch & Selector Stop Tab (Z = +0.182)
  // Two crisp stamped/milled detent dimples at X = -1.02 aligned pixel-perfectly with
  // `materials.receiverRightPlate` АВ (V=0.66 -> Y=-0.135) & ОД (V=0.23 -> Y=-0.256) index bars!
  const detentCoords = [
    { x: -1.018, y: -0.135 }, // Auto (АВ) detent notch
    { x: -1.022, y: -0.256 }, // Semi (ОД) detent notch
  ];

  for (const d of detentCoords) {
    // Elongated horizontal-crescent dark detent slot
    const dimpleShape = createStadiumShape(0, 0, 0.056, 0.018);
    const dimpleGeo = new THREE.ExtrudeGeometry(dimpleShape, {
      depth: 0.004,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.0015,
      bevelSegments: 1,
      curveSegments: 10,
    });
    const dimple = new THREE.Mesh(dimpleGeo, materials.darkSteel);
    dimple.position.set(d.x, d.y, 0.178);
    hw.add(dimple);

    // Tiny subtle raised bright steel rim lip right under detent
    const lipGeo = createBeveledBox(0.052, 0.007, 0.005, 0.002, 1);
    const lip = new THREE.Mesh(lipGeo, materials.polishedSteel);
    lip.position.set(d.x, d.y - 0.012, 0.181);
    hw.add(lip);
  }

  // Stamped steel selector stop tab protruding at the lower travel limit below Semi (ОД)
  const stopTabGeo = createBeveledBox(0.068, 0.022, 0.022, 0.004, 2);
  const stopTab = new THREE.Mesh(stopTabGeo, materials.bluedSteel);
  stopTab.position.set(-1.035, -0.382, 0.188);
  stopTab.rotation.z = -0.32;
  hw.add(stopTab);

  // Subtle iconic Kalashnikov selector sweep witness arc along radius 1.015 from pivot (-2.02, -0.14)
  const arcPts = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const ang = 0.16 - t * 0.34; // spans Safe -> Auto -> Semi arc
    const ax = -2.02 + Math.cos(ang) * 1.015;
    const ay = -0.14 + Math.sin(ang) * 1.015;
    arcPts.push(new THREE.Vector3(ax, ay, 0.1802));
  }
  const arcCurve = new THREE.CatmullRomCurve3(arcPts);
  const arcGeo = new THREE.TubeGeometry(arcCurve, 20, 0.0009, 4, false);
  const arcMesh = new THREE.Mesh(arcGeo, materials.parkerizedSteel);
  arcMesh.userData.noCastShadow = true;
  hw.add(arcMesh);

  // 4. Cyrillic Markings & Proof Stamp Decal Plane (`materials.receiverRightPlate`)
  // Spans X = -1.06 to -0.22 (width 0.84), Y = -0.40 to -0.04 (height 0.36), at Z = +0.183:
  //   Left (U=0.04..0.28): АВ (V=0.785 -> Y=-0.117, bar V=0.735 -> Y=-0.135) &
  //                        ОД (V=0.445 -> Y=-0.240, bar V=0.400 -> Y=-0.256) aligned to detents.
  //   Lower-right flat below right lightening cut (U=0.34..0.90, V=0.11..0.33 -> X=-0.77..-0.30, Y=-0.36..-0.28):
  //                        Izhevsk arrow-in-triangle proof mark + `1955  АБ 4729` + (П)/(К) unobstructed in all modes!
  const decalGeo = new THREE.PlaneGeometry(0.84, 0.36);
  const decalMesh = new THREE.Mesh(decalGeo, materials.receiverRightPlate);
  decalMesh.name = 'ReceiverRightMarkingsDecal';
  decalMesh.position.set(-0.64, -0.22, 0.183);
  decalMesh.userData.noCastShadow = true;
  hw.add(decalMesh);

  return hw;
}

/**
 * Builds the Rear Sight Block (X = -0.52 to +0.04, Y = -0.10 to +0.46),
 * front gas tube socket at (X = +0.02, Y = +0.28, Z = 0), protective curved ears,
 * internal tangent elevation ramp, and right-side gas-tube locking lever latch.
 */
function buildRearSightBlock(materials) {
  const rsb = new THREE.Group();
  rsb.name = 'RearSightBlock';

  // 1. Main lower sculpted RSB collar blending smoothly onto top of receiver front trunnion
  // Strictly stays at Y >= +0.02 so it NEVER protrudes into the milled lightening cuts (Y = -0.22..-0.02)!
  const baseProfile = new THREE.Shape();
  baseProfile.moveTo(-0.52, 0.02);
  baseProfile.lineTo(0.03, 0.02);
  baseProfile.lineTo(0.03, 0.20);
  baseProfile.lineTo(-0.02, 0.25);
  baseProfile.lineTo(-0.50, 0.25);
  baseProfile.lineTo(-0.52, 0.20);
  baseProfile.closePath();

  const baseGeo = new THREE.ExtrudeGeometry(baseProfile, {
    depth: 0.30, // total with bevels = 0.324
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.010,
    bevelSegments: 3,
  });
  baseGeo.translate(0, 0, -0.15);
  baseGeo.computeVertexNormals();
  projectBoxUVsAlongX(baseGeo, 0.55, 1.85);
  const baseMesh = new THREE.Mesh(baseGeo, materials.bluedSteel);
  rsb.add(baseMesh);

  // Lower flared transition fillets blending RSB into receiver top rails (Y = +0.025..+0.13, strictly above pockets!)
  const flareGeo = createBeveledBox(0.56, 0.105, 0.354, 0.012, 2);
  const flareMesh = new THREE.Mesh(flareGeo, materials.bluedSteel);
  flareMesh.position.set(-0.24, 0.078, 0.0);
  rsb.add(flareMesh);

  // 2. Round Front Gas-Tube Socket at (X = +0.02, Y = +0.28, Z = 0)
  // Outer machined cylindrical housing (r = 0.114, spanning X = -0.22 to +0.04)
  const socketPts = [
    new THREE.Vector2(0.090, -0.22),
    new THREE.Vector2(0.115, -0.21),
    new THREE.Vector2(0.115, 0.025),
    new THREE.Vector2(0.104, 0.040),
    new THREE.Vector2(0.091, 0.040),
    new THREE.Vector2(0.091, -0.08),
  ];
  const socketGeo = new THREE.LatheGeometry(socketPts, 28);
  socketGeo.rotateZ(-Math.PI * 0.5); // maps lathe +Y onto +X
  socketGeo.computeVertexNormals();
  const socketMesh = new THREE.Mesh(socketGeo, materials.bluedSteel);
  socketMesh.position.set(0.0, 0.28, 0.0);
  rsb.add(socketMesh);

  // Dark inner gas-tube socket bore so looking from front/exploded view shows a deep dark cavity
  const boreGeo = new THREE.CylinderGeometry(0.090, 0.090, 0.14, 24);
  boreGeo.rotateZ(Math.PI * 0.5);
  const boreMesh = new THREE.Mesh(boreGeo, materials.darkSteel);
  boreMesh.position.set(-0.035, 0.28, 0.0);
  rsb.add(boreMesh);

  // 3. Sculpted Curved Protective Side Ears (left & right walls framing the tangent sight leaf)
  const earShape = new THREE.Shape();
  earShape.moveTo(-0.52, 0.18);
  earShape.lineTo(0.01, 0.18);
  earShape.lineTo(0.01, 0.39);
  earShape.quadraticCurveTo(0.005, 0.455, -0.06, 0.460);
  earShape.lineTo(-0.33, 0.458);
  earShape.quadraticCurveTo(-0.44, 0.455, -0.52, 0.432);
  earShape.closePath();

  const earGeo = new THREE.ExtrudeGeometry(earShape, {
    depth: 0.040,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 16,
  });
  earGeo.translate(0, 0, -0.020);
  earGeo.computeVertexNormals();
  projectBoxUVsAlongX(earGeo, 0.55, 1.85);

  // Ears sit at Z = ±0.125 (inner gap Z = -0.097..+0.097 neatly cradles the 0.155 wide sight leaf!)
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, materials.bluedSteel);
    ear.position.z = s * 0.125;
    rsb.add(ear);
  }

  // Internal stepped tangent elevation ramp bed between the ears
  const rampShape = new THREE.Shape();
  rampShape.moveTo(-0.51, 0.22);
  rampShape.lineTo(-0.04, 0.22);
  rampShape.lineTo(-0.04, 0.405);
  rampShape.quadraticCurveTo(-0.18, 0.395, -0.32, 0.365);
  rampShape.quadraticCurveTo(-0.44, 0.340, -0.51, 0.332);
  rampShape.closePath();

  const rampGeo = new THREE.ExtrudeGeometry(rampShape, {
    depth: 0.188,
    bevelEnabled: false,
    curveSegments: 12,
  });
  rampGeo.translate(0, 0, -0.094);
  rampGeo.computeVertexNormals();
  const rampMesh = new THREE.Mesh(rampGeo, materials.darkSteel);
  rsb.add(rampMesh);

  // Rear sight leaf pivot cross-pin & RSB retaining pin
  const leafPinGeo = createDomedPinGeometry(0.015, 0.156, 0.005, 16);
  const leafPin = new THREE.Mesh(leafPinGeo, materials.parkerizedSteel);
  leafPin.position.set(-0.04, 0.432, 0.0);
  rsb.add(leafPin);

  const rsbLowerPinGeo = createDomedPinGeometry(0.018, 0.165, 0.005, 16);
  const rsbLowerPin = new THREE.Mesh(rsbLowerPinGeo, materials.parkerizedSteel);
  rsbLowerPin.position.set(-0.22, 0.10, 0.0);
  rsb.add(rsbLowerPin);

  // Front top dust-cover retention lip tucked at X = -0.52, Y = +0.435
  const lipGeo = createBeveledBox(0.055, 0.025, 0.22, 0.005, 2);
  const lipMesh = new THREE.Mesh(lipGeo, materials.bluedSteel);
  lipMesh.position.set(-0.505, 0.425, 0.0);
  rsb.add(lipMesh);

  // 4. Right-Side Gas Tube Lever Latch (X = -0.12, Y = +0.34, Z = +0.185)
  const latchGroup = new THREE.Group();
  latchGroup.name = 'GasTubeLeverLatch';
  latchGroup.position.set(-0.12, 0.34, 0.156);

  // Circular pivot boss
  const bossGeo = new THREE.CylinderGeometry(0.032, 0.034, 0.034, 18);
  bossGeo.rotateX(Math.PI * 0.5);
  const bossMesh = new THREE.Mesh(bossGeo, materials.parkerizedSteel);
  bossMesh.position.set(0.0, 0.0, 0.014);
  latchGroup.add(bossMesh);

  // Teardrop stamped locking lever arm angled downward-rearward along RSB right flank
  const leverShape = new THREE.Shape();
  leverShape.absarc(0, 0, 0.026, -Math.PI * 0.5, Math.PI * 0.5, false);
  leverShape.lineTo(-0.125, 0.016);
  leverShape.absarc(-0.125, 0, 0.016, Math.PI * 0.5, Math.PI * 1.5, false);
  leverShape.closePath();

  const leverGeo = new THREE.ExtrudeGeometry(leverShape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 12,
  });
  leverGeo.computeVertexNormals();
  projectBoxUVsAlongX(leverGeo, 0.55, 1.85);
  const leverMesh = new THREE.Mesh(leverGeo, materials.bluedSteel);
  leverMesh.position.set(0.0, 0.0, 0.022);
  leverMesh.rotation.z = 0.55; // angled gracefully down-rearward
  latchGroup.add(leverMesh);

  // Small outward fingertip tab on end of latch lever
  const tabGeo = createBeveledBox(0.032, 0.024, 0.026, 0.004, 2);
  const tabMesh = new THREE.Mesh(tabGeo, materials.bluedSteel);
  tabMesh.position.set(-0.105, -0.065, 0.036);
  tabMesh.rotation.z = 0.55;
  latchGroup.add(tabMesh);

  rsb.add(latchGroup);

  return rsb;
}

/**
 * Builds the curved steel Trigger Guard (X = -1.78 to -1.16, bottom Y = -0.76, width 0.14)
 * with riveted mounting plate AND the Magazine Release Catch housing & textured thumb paddle
 * right in front of the trigger guard (X = -1.12, Y = -0.56, Z = 0, meeting rear mag lug at X = -1.04).
 */
function buildTriggerGuardAndMagCatch(materials) {
  const tgGroup = new THREE.Group();
  tgGroup.name = 'TriggerGuardAndMagCatch';

  // 1. Riveted Mounting Plate under receiver (X = -1.80 to -1.06, Y = -0.44..-0.458)
  const plateGeo = createBeveledBox(0.74, 0.018, 0.21, 0.004, 2);
  const plateMesh = new THREE.Mesh(plateGeo, materials.parkerizedSteel);
  plateMesh.position.set(-1.43, -0.448, 0.0);
  tgGroup.add(plateMesh);

  // 4 domed mounting rivets on the trigger guard plate
  const rivetGeo = new THREE.SphereGeometry(0.012, 12, 8);
  const rivetPositions = [
    [-1.76, -0.456, -0.065],
    [-1.76, -0.456, 0.065],
    [-1.11, -0.456, -0.068],
    [-1.11, -0.456, 0.068],
  ];
  for (const [rx, ry, rz] of rivetPositions) {
    const rivet = new THREE.Mesh(rivetGeo, materials.bluedSteel);
    rivet.scale.set(1, 0.55, 1);
    rivet.position.set(rx, ry, rz);
    tgGroup.add(rivet);
  }

  // 2. Curved Steel Trigger Guard Ribbon (X = -1.78 to -1.16, bottom loop Y = -0.76, width = 0.14)
  // Build as a smooth closed 2D ribbon profile in XY extruded along Z with chamfered edges
  const outerPts = [
    new THREE.Vector2(-1.785, -0.448),
    new THREE.Vector2(-1.745, -0.640),
    new THREE.Vector2(-1.690, -0.735),
    new THREE.Vector2(-1.600, -0.762),
    new THREE.Vector2(-1.310, -0.762),
    new THREE.Vector2(-1.215, -0.732),
    new THREE.Vector2(-1.175, -0.645),
    new THREE.Vector2(-1.160, -0.448),
  ];
  const innerPts = [
    new THREE.Vector2(-1.182, -0.448),
    new THREE.Vector2(-1.197, -0.635),
    new THREE.Vector2(-1.232, -0.710),
    new THREE.Vector2(-1.315, -0.736),
    new THREE.Vector2(-1.595, -0.736),
    new THREE.Vector2(-1.672, -0.712),
    new THREE.Vector2(-1.720, -0.630),
    new THREE.Vector2(-1.758, -0.448),
  ];

  const outerCurve = new THREE.SplineCurve(outerPts).getPoints(36);
  const innerCurve = new THREE.SplineCurve(innerPts).getPoints(36);
  const guardShape = new THREE.Shape();
  guardShape.moveTo(outerCurve[0].x, outerCurve[0].y);
  for (let i = 1; i < outerCurve.length; i++) {
    guardShape.lineTo(outerCurve[i].x, outerCurve[i].y);
  }
  for (let i = 0; i < innerCurve.length; i++) {
    guardShape.lineTo(innerCurve[i].x, innerCurve[i].y);
  }
  guardShape.closePath();

  const guardGeo = new THREE.ExtrudeGeometry(guardShape, {
    depth: 0.132, // with bevels = 0.140 width
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  guardGeo.translate(0, 0, -0.066);
  guardGeo.computeVertexNormals();
  projectBoxUVsAlongX(guardGeo, 0.65, 1.85);
  const guardMesh = new THREE.Mesh(guardGeo, materials.bluedSteel);
  tgGroup.add(guardMesh);

  // 3. Magazine Release Catch Housing & Textured Thumb Paddle (X = -1.12, Y = -0.56, Z = 0)
  // U-shaped steel catch housing ears straddling the paddle (X = -1.16..-1.06)
  const housingSideGeo = createBeveledBox(0.11, 0.095, 0.022, 0.004, 2);
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(housingSideGeo, materials.parkerizedSteel);
    wall.position.set(-1.11, -0.495, s * 0.056);
    tgGroup.add(wall);
  }

  // Magazine catch horizontal pivot pin + torsion spring coil
  const catchPinGeo = createDomedPinGeometry(0.014, 0.074, 0.004, 14);
  const catchPin = new THREE.Mesh(catchPinGeo, materials.polishedSteel);
  catchPin.position.set(-1.11, -0.502, 0.0);
  tgGroup.add(catchPin);

  // Sculpted Magazine Release Paddle & Upper Locking Hook (meets rear magazine lug at X = -1.04, Y = -0.44!)
  const paddleShape = new THREE.Shape();
  paddleShape.moveTo(-1.042, -0.440); // upper nose engaging magazine rear locking lug at X = -1.04
  paddleShape.lineTo(-1.040, -0.468);
  paddleShape.lineTo(-1.080, -0.485);
  paddleShape.lineTo(-1.095, -0.625);
  paddleShape.quadraticCurveTo(-1.105, -0.652, -1.128, -0.648);
  paddleShape.lineTo(-1.142, -0.620);
  paddleShape.lineTo(-1.132, -0.478);
  paddleShape.lineTo(-1.092, -0.442);
  paddleShape.closePath();

  const paddleGeo = new THREE.ExtrudeGeometry(paddleShape, {
    depth: 0.078, // sits cleanly inside housing gap (-0.045..+0.045)
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  paddleGeo.translate(0, 0, -0.039);
  paddleGeo.computeVertexNormals();
  projectBoxUVsAlongX(paddleGeo, 0.55, 1.85);
  const paddleMesh = new THREE.Mesh(paddleGeo, materials.bluedSteel);
  tgGroup.add(paddleMesh);

  // Flared textured thumb pad at bottom of mag catch paddle (X = -1.12, Y = -0.595)
  const thumbPadGeo = createBeveledBox(0.024, 0.088, 0.102, 0.004, 2);
  const thumbPad = new THREE.Mesh(thumbPadGeo, materials.parkerizedSteel);
  thumbPad.position.set(-1.124, -0.592, 0.0);
  thumbPad.rotation.z = -0.09;
  tgGroup.add(thumbPad);

  // Crisp horizontal grip serration ribs on rear face of thumb paddle
  const ribGeo = createBeveledBox(0.007, 0.007, 0.094, 0.0015, 1);
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(ribGeo, materials.bluedSteel);
    const ry = -0.624 + i * 0.013;
    const rx = -1.138 + i * 0.0012;
    rib.position.set(rx, ry, 0.0);
    tgGroup.add(rib);
  }

  return tgGroup;
}

// ============================================================================
// 2. Sculpted Stamped-Steel Dust Cover with True Hollow Wall & Ejection Cutout
// ============================================================================

/**
 * Evaluates the outer dust-cover arch cross-section at longitudinal coordinate x
 * and arch angle phi in [0, PI/2] (phi=0 is crown, phi=PI/2 is bottom skirt Y=0.06).
 * Returns { y, zMag } where z = sideSign * zMag.
 */
function sampleDustCoverHalfArch(x, phi, sideSign) {
  const xRear = -2.40;
  const xFront = -0.52;
  const tx = clamp((x - xRear) / (xFront - xRear), 0, 1);

  const yBase = 0.060;
  // Crown slopes gently from Y = +0.39 at rear (-2.40) up to Y = +0.44 at front (-0.52)
  let yTop = 0.390 + 0.050 * tx;
  // Softly round down the very rear top crown corner (X = -2.40..-2.30)
  if (tx < 0.065) {
    const r = 1 - tx / 0.065;
    yTop -= 0.024 * r * r;
  }

  const halfW = 0.1775; // full width = 0.355 matching receiver
  const sp = Math.sin(phi);
  const cp = Math.cos(phi);

  // Classic AK rounded-shoulder arch: vertical lower walls curving smoothly into domed crown
  let zMag = halfW * Math.pow(sp, 0.62);
  let yVal = yBase + (yTop - yBase) * Math.pow(cp, 0.82);

  // Subtle longitudinal stamped strengthening contours/ribs along upper shoulders (above ejection port)
  const ribFadeX = smoothstep(-2.30, -2.14, x) * (1 - smoothstep(-0.72, -0.58, x));
  if (ribFadeX > 0.0001) {
    // Upper longitudinal shoulder flute around phi = 0.64 rad (Y ~ 0.35, cleanly above port)
    const dShoulder = (phi - 0.64) / 0.14;
    const shoulderBead = Math.exp(-dShoulder * dShoulder) * 0.0065 * ribFadeX;
    zMag += shoulderBead * sp;
    yVal += shoulderBead * cp;

    // Subtle secondary lower-shoulder contour on the closed left flank (-Z)
    if (sideSign < 0) {
      const dMid = (phi - 1.08) / 0.13;
      const midBead = Math.exp(-dMid * dMid) * 0.0055 * ribFadeX;
      zMag += midBead;
    }

    // Subtle crown stiffening step along top center
    const dCrown = phi / 0.24;
    const crownLift = Math.exp(-dCrown * dCrown) * 0.004 * ribFadeX;
    yVal += crownLift;
  }

  return { y: yVal, zMag, yTop, yBase };
}

/**
 * Computes the right-side cutout height yCut(x) for the ejection port (X = -1.28..-0.55, Y = 0.06..0.305)
 * and rear charging-handle travel slot (X = -1.94..-1.28, Y = 0.06..0.188) so the bolt carrier &
 * charging handle cycle smoothly -1.10 in X with zero clipping!
 */
function dustCoverRightCutY(x) {
  const yBase = 0.060;
  const ySlot = 0.172;
  const yPort = 0.305;

  // Rear closed skirt: X <= -2.02
  if (x <= -2.02) return yBase;
  // Smooth rounded rear end of charging handle slot: -2.02 .. -1.96 (generous clearance at full -1.10 bolt travel!)
  if (x < -1.96) {
    return yBase + (ySlot - yBase) * smoothstep(-2.02, -1.96, x);
  }
  // Charging handle travel slot: -1.96 .. -1.30
  if (x <= -1.30) return ySlot;
  // Curved rear ejection port ramp: -1.30 .. -1.23
  if (x < -1.23) {
    return ySlot + (yPort - ySlot) * smoothstep(-1.30, -1.23, x);
  }
  // Main wide-open ejection port window: -1.23 .. -0.57
  if (x <= -0.57) return yPort;
  // Smooth curved front arch meeting Rear Sight Block: -0.57 .. -0.52
  return yPort + (yBase - yPort) * smoothstep(-0.57, -0.52, x);
}

/**
 * Builds the thick-walled hollow stamped-steel Dust Cover BufferGeometry
 * (outer surface, inner surface, left rail rim, right ejection-port rim, front & rear rims).
 */
function createDustCoverShellGeometry() {
  // Build non-uniform X stations concentrated around cutout transitions for silky-smooth curves
  const xStations = [];
  function pushRange(a, b, steps, skipFirst = false) {
    for (let i = skipFirst ? 1 : 0; i <= steps; i++) {
      xStations.push(a + ((b - a) * i) / steps);
    }
  }
  pushRange(-2.40, -2.26, 8, false);
  pushRange(-2.26, -2.03, 7, true);
  pushRange(-2.03, -1.95, 8, true);
  pushRange(-1.95, -1.31, 10, true);
  pushRange(-1.31, -1.22, 10, true);
  pushRange(-1.22, -0.58, 12, true);
  pushRange(-0.58, -0.52, 9, true);

  const nx = xStations.length;
  const halfSegs = 16;
  const nProf = halfSegs * 2 + 1; // 33 points per cross-section (0 = bottom-left, 16 = crown, 32 = right cutout edge)
  const wallThick = 0.015;

  const outerRings = [];
  const innerRings = [];

  for (let i = 0; i < nx; i++) {
    const x = xStations[i];
    const yCut = dustCoverRightCutY(x);
    const crownInfo = sampleDustCoverHalfArch(x, 0, 1);

    // Solve inverse arch angle phiMaxRight where right wall reaches yCut
    const ySpan = Math.max(0.001, crownInfo.yTop - crownInfo.yBase);
    const ratio = clamp((yCut - crownInfo.yBase) / ySpan, 0, 0.96);
    const phiMaxRight = Math.acos(Math.pow(ratio, 1 / 0.82));

    const outerRing = [];
    for (let j = 0; j < nProf; j++) {
      let phi, sideSign;
      if (j <= halfSegs) {
        // Left flank: bottom-left (phi = PI/2) up to crown (phi = 0)
        const f = 1 - j / halfSegs;
        phi = f * Math.PI * 0.5;
        sideSign = -1;
      } else {
        // Right flank: crown (phi = 0) down to cutout edge (phi = phiMaxRight)
        const f = (j - halfSegs) / halfSegs;
        phi = f * phiMaxRight;
        sideSign = 1;
      }

      const pt = sampleDustCoverHalfArch(x, phi, sideSign);
      let z = sideSign * pt.zMag;
      let y = pt.y;

      // Slight rolled deflector stiffening flare right along the top edge of the ejection port
      if (j === nProf - 1 && x > -1.27 && x < -0.55) {
        const edgeFade = smoothstep(-1.27, -1.20, x) * (1 - smoothstep(-0.61, -0.55, x));
        z += 0.0055 * edgeFade;
      }

      outerRing.push(new THREE.Vector3(x, y, z));
    }

    // Compute exact 2D inward normals in (Y, Z) plane to offset inner shell cleanly
    const innerRing = [];
    for (let j = 0; j < nProf; j++) {
      const prev = outerRing[Math.max(0, j - 1)];
      const next = outerRing[Math.min(nProf - 1, j + 1)];
      const dy = next.y - prev.y;
      const dz = next.z - prev.z;
      const len = Math.hypot(dy, dz) || 1;
      // Tangent (dy, dz) runs from bottom-left -> crown -> right-edge.
      // Rotating +90 deg in (Z, Y) gives outward normal (ny = +dz/len, nz = -dy/len):
      // check crown: dy=0, dz>0 -> outward ny=+1, nz=0 -> inward = (-ny, -nz) = (0, -1, 0)!
      // check left:  dy>0, dz=0 -> outward ny=0, nz=-1 -> inward = (0, 0, +1)!
      // check right: dy<0, dz=0 -> outward ny=0, nz=+1 -> inward = (0, 0, -1)!
      const inY = -dz / len;
      const inZ = dy / len;
      innerRing.push(
        new THREE.Vector3(
          x,
          outerRing[j].y + inY * wallThick,
          outerRing[j].z + inZ * wallThick
        )
      );
    }

    outerRings.push(outerRing);
    innerRings.push(innerRing);
  }

  // Assemble non-indexed/split-group vertex arrays so outer, inner, and sharp stamped sheet rims
  // each get crisp, artifact-free vertex normals (no dark normal-bleeding around 90-deg cut edges!).
  const positions = [];
  const uvs = [];
  const indices = [];

  function pushVert(v, u, w) {
    const idx = positions.length / 3;
    positions.push(v.x, v.y, v.z);
    uvs.push(u, w);
    return idx;
  }

  // --- 1. Outer Surface (verified outward winding: (i00, i01, i10), (i01, i11, i10)) ---
  const outerBaseIdx = positions.length / 3;
  for (let i = 0; i < nx; i++) {
    const u = (xStations[i] + 2.40) * 0.55;
    for (let j = 0; j < nProf; j++) {
      const vCoord = j / (nProf - 1);
      pushVert(outerRings[i][j], u, vCoord);
    }
  }
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nProf - 1; j++) {
      const i00 = outerBaseIdx + i * nProf + j;
      const i01 = outerBaseIdx + i * nProf + (j + 1);
      const i10 = outerBaseIdx + (i + 1) * nProf + j;
      const i11 = outerBaseIdx + (i + 1) * nProf + (j + 1);
      indices.push(i00, i01, i10);
      indices.push(i01, i11, i10);
    }
  }

  // --- 2. Inner Surface (reversed winding so inside of cover faces inward!) ---
  const innerBaseIdx = positions.length / 3;
  for (let i = 0; i < nx; i++) {
    const u = (xStations[i] + 2.40) * 0.55;
    for (let j = 0; j < nProf; j++) {
      const vCoord = j / (nProf - 1);
      pushVert(innerRings[i][j], u, vCoord);
    }
  }
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nProf - 1; j++) {
      const i00 = innerBaseIdx + i * nProf + j;
      const i01 = innerBaseIdx + i * nProf + (j + 1);
      const i10 = innerBaseIdx + (i + 1) * nProf + j;
      const i11 = innerBaseIdx + (i + 1) * nProf + (j + 1);
      indices.push(i00, i10, i01);
      indices.push(i01, i10, i11);
    }
  }

  // Helper to stitch a clean separate-normal rim strip between two vertex chains A and B
  function stitchRimStrip(chainA, chainB, flip = false) {
    const n = chainA.length;
    const base = positions.length / 3;
    for (let k = 0; k < n; k++) {
      const t = k / Math.max(1, n - 1);
      pushVert(chainA[k], t, 0);
      pushVert(chainB[k], t, 0.05);
    }
    for (let k = 0; k < n - 1; k++) {
      const a0 = base + k * 2;
      const b0 = a0 + 1;
      const a1 = a0 + 2;
      const b1 = a0 + 3;
      if (!flip) {
        indices.push(a0, a1, b0);
        indices.push(b0, a1, b1);
      } else {
        indices.push(a0, b0, a1);
        indices.push(b0, b1, a1);
      }
    }
  }

  // --- 3. Bottom-Left Rim (j = 0, normal points -Y): A = outer[i][0], B = inner[i][0] ---
  // (a1 - a0) = +X, (b0 - a0) = +Z -> (+X) x (+Z) = -Y! So flip = false gives -Y outward!
  stitchRimStrip(
    outerRings.map((r) => r[0]),
    innerRings.map((r) => r[0]),
    false
  );

  // --- 4. Right Cutout / Ejection-Port Rim (j = nProf - 1, normal points down/outward along cutout) ---
  // At bottom-right: (a1 - a0) = +X, (b0 - a0) = -Z -> (+X) x (-Z) = +Y, so flip = true gives -Y!
  stitchRimStrip(
    outerRings.map((r) => r[nProf - 1]),
    innerRings.map((r) => r[nProf - 1]),
    true
  );

  // --- 5. Front Rim (i = nx - 1, normal points +X) ---
  // (a1 - a0) = +dProf (left->crown->right), (b0 - a0) = inward -> dProf x inward = -X, so flip = true gives +X!
  stitchRimStrip(outerRings[nx - 1], innerRings[nx - 1], true);

  // --- 6. Rear Rim (i = 0, normal points -X) ---
  stitchRimStrip(outerRings[0], innerRings[0], false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the Dust Cover assembly (`parts.dustCover`), including its thick-walled sculpted hood,
 * contoured rear end-cap with recoil-spring button cutout, and the protruding rectangular
 * recoil spring guide release button at (X = -2.43, Y = +0.15, Z = 0).
 */
function buildDustCover(materials) {
  const dustCover = new THREE.Group();
  dustCover.name = 'DustCover';

  // 1. Main thick-walled sculpted stamped-steel hood
  const shellGeo = createDustCoverShellGeometry();
  const shellMesh = new THREE.Mesh(shellGeo, materials.parkerizedSteel);
  dustCover.add(shellMesh);

  // 2. Sculpted Rear End-Cap Wall closing X = -2.40 with crisp rectangular cutout for release button
  const capShape = new THREE.Shape();
  const halfSegs = 16;
  // Build 2D arch contour CCW in (Z, Y) plane: right bottom -> crown -> left bottom
  const capPts = [];
  for (let j = halfSegs * 2; j >= 0; j--) {
    let phi, s;
    if (j <= halfSegs) {
      phi = (1 - j / halfSegs) * Math.PI * 0.5;
      s = -1;
    } else {
      phi = ((j - halfSegs) / halfSegs) * Math.PI * 0.5;
      s = 1;
    }
    const p = sampleDustCoverHalfArch(-2.40, phi, s);
    // Inset slightly by 0.003 so bevelSize=0.003 lands strictly flush with outer shell rim
    capPts.push(new THREE.Vector2(s * Math.max(0, p.zMag - 0.003), Math.max(0.063, p.y - 0.003)));
  }
  capShape.moveTo(capPts[0].x, capPts[0].y);
  for (let k = 1; k < capPts.length; k++) {
    capShape.lineTo(capPts[k].x, capPts[k].y);
  }
  capShape.closePath();

  // Rectangular button hole (CW inside CCW outer shape) centered at (Z = 0, Y = 0.15)
  const btnHole = new THREE.Path();
  btnHole.moveTo(-0.047, 0.187);
  btnHole.lineTo(0.047, 0.187);
  btnHole.lineTo(0.047, 0.113);
  btnHole.lineTo(-0.047, 0.113);
  btnHole.closePath();
  capShape.holes.push(btnHole);

  const capGeo = new THREE.ExtrudeGeometry(capShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  // Rotate +PI/2 around Y: shape X (our Z) -> -Z (symmetric!), shape Y -> Y, depth +Z -> +X!
  capGeo.rotateY(Math.PI * 0.5);
  capGeo.computeVertexNormals();
  const capMesh = new THREE.Mesh(capGeo, materials.parkerizedSteel);
  capMesh.position.set(-2.40, 0.0, 0.0);
  dustCover.add(capMesh);

  // Dark recessed button bezel collar inside the rear dust-cover slot
  const bezelGeo = createBeveledBox(0.025, 0.076, 0.096, 0.004, 1);
  const bezelMesh = new THREE.Mesh(bezelGeo, materials.darkSteel);
  bezelMesh.position.set(-2.392, 0.15, 0.0);
  dustCover.add(bezelMesh);

  // 3. Rectangular Recoil Spring Guide Release Button at (X = -2.43, Y = +0.15, Z = 0)
  const btnGeo = createBeveledBox(0.068, 0.064, 0.082, 0.007, 2);
  const btnMesh = new THREE.Mesh(btnGeo, materials.bluedSteel);
  btnMesh.position.set(-2.418, 0.15, 0.0);
  dustCover.add(btnMesh);

  // Crisp thumb serration grooves on the rear face of the release button (X = -2.452)
  const btnRibGeo = createBeveledBox(0.006, 0.007, 0.072, 0.0015, 1);
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(btnRibGeo, materials.parkerizedSteel);
    rib.position.set(-2.452, 0.129 + i * 0.014, 0.0);
    dustCover.add(rib);
  }

  dustCover.userData.explodeOffset = new THREE.Vector3(0, 1.15, 0);
  return dustCover;
}

// ============================================================================
// 3. Tangent Rear Sight Leaf (`parts.rearSightLeaf`)
// ============================================================================

/**
 * Builds the Tangent Rear Sight Leaf (`parts.rearSightLeaf`), pivoted at (-0.04, 0.435, 0),
 * extending rearward to world X = -0.54, top graduation face at Y = +0.455 mapped with
 * `materials.sightLeaf` (V=0 rear `-X` `П`, V=1 front `+X` `8`), crisp central U-notch rear
 * sight blade aligned with ADS camera -> front sight post, and sliding elevation collar
 * with ribbed push buttons.
 */
function buildRearSightLeaf(materials) {
  const leafGroup = new THREE.Group();
  leafGroup.name = 'RearSightLeaf';
  // Pivot at front hinge (X = -0.04, Y = +0.435, Z = 0); build children in local coordinates
  leafGroup.position.set(-0.04, 0.435, 0.0);

  // 1. Main Machined Sight Leaf Bar (world X = -0.54 to -0.04 -> local X = -0.50 to 0.00)
  // Top face sits at local Y = +0.020 -> world Y = +0.455
  const barGeo = createBeveledBox(0.495, 0.036, 0.156, 0.005, 2);
  const barMesh = new THREE.Mesh(barGeo, materials.bluedSteel);
  barMesh.position.set(-0.248, 0.002, 0.0);
  leafGroup.add(barMesh);

  // Front circular hinge knuckle around local (0, 0, 0)
  const knuckleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.156, 16);
  knuckleGeo.rotateX(Math.PI * 0.5);
  const knuckleMesh = new THREE.Mesh(knuckleGeo, materials.bluedSteel);
  leafGroup.add(knuckleMesh);

  // Subtle side rails framing the engraved graduation face on top of the leaf
  const railGeo = createBeveledBox(0.455, 0.010, 0.014, 0.002, 1);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(railGeo, materials.bluedSteel);
    rail.position.set(-0.252, 0.021, s * 0.072);
    leafGroup.add(rail);
  }

  // 2. Top Graduation Scale Plate mapped with `materials.sightLeaf`
  // Explicitly construct quad facing +Y with verified UVs:
  //   V = 0 at rear (-X, `П`), V = 1 at front (+X, `8`)
  //   U = 0 at left (-Z),      U = 1 at right (+Z)
  // Spans local X = -0.465..-0.035 (world X = -0.505..-0.075), Z = -0.065..+0.065, local Y = +0.0215 (world +0.4565)
  const gradGeo = new THREE.BufferGeometry();
  const gx0 = -0.465; // rear (-X -> V=0, П)
  const gx1 = -0.035; // front (+X -> V=1, 8)
  const gz0 = -0.065; // left (-Z -> U=0)
  const gz1 = 0.065;  // right (+Z -> U=1)
  const gy = 0.0215;

  const gradPos = new Float32Array([
    gx0, gy, gz0, // 0: rear-left  (U=0, V=0)
    gx0, gy, gz1, // 1: rear-right (U=1, V=0)
    gx1, gy, gz0, // 2: front-left (U=0, V=1)
    gx1, gy, gz1, // 3: front-right(U=1, V=1)
  ]);
  const gradNorm = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ]);
  const gradUV = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    1, 1,
  ]);
  // Winding (0,1,2) & (1,3,2): (p1-p0)x(p2-p0) = (+Z)x(+X) = +Y upward normal!
  gradGeo.setAttribute('position', new THREE.BufferAttribute(gradPos, 3));
  gradGeo.setAttribute('normal', new THREE.BufferAttribute(gradNorm, 3));
  gradGeo.setAttribute('uv', new THREE.BufferAttribute(gradUV, 2));
  gradGeo.setIndex([0, 1, 2, 1, 3, 2]);

  const gradMesh = new THREE.Mesh(gradGeo, materials.sightLeaf);
  gradMesh.name = 'SightLeafGraduations';
  leafGroup.add(gradMesh);

  // 3. Rear U-Notch Sight Blade at rear end of leaf (world X = -0.54..-0.505 -> local X = -0.50..-0.465)
  // Top edge at world Y = +0.500 (local +0.065) with crisp central U-notch down to world Y = +0.472 (local +0.037)
  // Aligns dead-center through the ADS camera (-3.1, 0.52, 0) onto front sight post tip (+3.76, 0.505, 0)!
  const notchHalfW = 0.0165;
  const bladeHalfW = 0.084;
  const bladeBotY = 0.004;
  const bladeTopY = 0.065; // world Y = 0.435 + 0.065 = 0.500
  const notchBotY = 0.037; // world Y = 0.435 + 0.037 = 0.472

  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-bladeHalfW, bladeBotY);
  bladeShape.lineTo(bladeHalfW, bladeBotY);
  bladeShape.lineTo(bladeHalfW * 0.94, bladeTopY);
  bladeShape.lineTo(notchHalfW, bladeTopY);
  bladeShape.lineTo(notchHalfW, notchBotY + 0.008);
  // Crisp rounded U-notch floor centered strictly on Z = 0
  bladeShape.absarc(0, notchBotY + 0.008, notchHalfW, 0, Math.PI, true);
  bladeShape.lineTo(-notchHalfW, bladeTopY);
  bladeShape.lineTo(-bladeHalfW * 0.94, bladeTopY);
  bladeShape.closePath();

  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
    depth: 0.030,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.002,
    bevelSegments: 2,
    curveSegments: 12,
  });
  // Rotate +PI/2 around Y: shape X -> -Z (symmetric!), shape Y -> Y, depth +Z -> +X
  bladeGeo.rotateY(Math.PI * 0.5);
  bladeGeo.computeVertexNormals();
  projectBoxUVsAlongX(bladeGeo, 0.65, 1.85);

  const bladeMesh = new THREE.Mesh(bladeGeo, materials.bluedSteel);
  bladeMesh.position.set(-0.502, 0.0, 0.0);
  leafGroup.add(bladeMesh);

  // 4. Sliding Elevation Collar with Ribbed Side Push Buttons (positioned around П / 1 mark)
  const sliderGroup = new THREE.Group();
  sliderGroup.name = 'SightElevationSlider';
  sliderGroup.position.set(-0.39, 0.004, 0.0); // world X = -0.43

  // Left & right saddle clamp cheeks
  const cheekGeo = createBeveledBox(0.088, 0.056, 0.022, 0.004, 2);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, materials.parkerizedSteel);
    cheek.position.set(0.0, 0.002, s * 0.084);
    sliderGroup.add(cheek);
  }

  // Front & rear thin top bridge bars framing the graduation scale without obscuring it
  const bridgeGeo = createBeveledBox(0.018, 0.012, 0.184, 0.003, 1);
  for (const bx of [-0.035, 0.035]) {
    const bridge = new THREE.Mesh(bridgeGeo, materials.parkerizedSteel);
    bridge.position.set(bx, 0.024, 0.0);
    sliderGroup.add(bridge);
  }

  // Underside cross-saddle riding on the RSB tangent ramp
  const underBarGeo = createBeveledBox(0.072, 0.018, 0.168, 0.003, 1);
  const underBar = new THREE.Mesh(underBarGeo, materials.bluedSteel);
  underBar.position.set(0.0, -0.024, 0.0);
  sliderGroup.add(underBar);

  // Ribbed spring-loaded push buttons on both sides (Z = ±0.098)
  const pushBtnGeo = createBeveledBox(0.056, 0.040, 0.022, 0.004, 2);
  const serrationGeo = createBeveledBox(0.005, 0.034, 0.006, 0.001, 1);
  for (const s of [-1, 1]) {
    const btn = new THREE.Mesh(pushBtnGeo, materials.bluedSteel);
    btn.position.set(0.0, 0.002, s * 0.098);
    sliderGroup.add(btn);

    for (let k = -2; k <= 2; k++) {
      const ser = new THREE.Mesh(serrationGeo, materials.parkerizedSteel);
      ser.position.set(k * 0.010, 0.002, s * 0.109);
      sliderGroup.add(ser);
    }
  }

  leafGroup.add(sliderGroup);

  return leafGroup;
}

// ============================================================================
// 4. Bare Steel Bolt Carrier & Upturned Charging Handle (`parts.boltCarrier`)
// ============================================================================

/**
 * Builds the iconic AK-47 upturned curved charging handle using a smooth tapered-oval loft
 * along a 3D cubic curve emerging from (X = -0.78, Y = +0.14, Z = +0.145) outward to Z = +0.46,
 * sweeping gracefully upward to Y = +0.24 with a smoothly rounded hemispherical tip.
 */
function createChargingHandleGeometry() {
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.780, 0.140, 0.142), // solidly embedded in carrier flank
    new THREE.Vector3(-0.780, 0.140, 0.215), // straight stem clearing charging-handle slot (Y=0.06..0.188)
    new THREE.Vector3(-0.790, 0.162, 0.305), // sweeping gracefully upward
    new THREE.Vector3(-0.800, 0.205, 0.395), // iconic AK upturned horn curve
    new THREE.Vector3(-0.806, 0.240, 0.456), // tapered handle tip
  ]);

  const lengthSteps = 26;
  const tipCapSteps = 5;
  const totalSteps = lengthSteps + tipCapSteps;
  const radialSegs = 20;

  const rings = [];
  const upRef = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= totalSteps; i++) {
    const isTip = i > lengthSteps;
    const t = isTip ? 1.0 : i / lengthSteps;
    const center = spineCurve.getPoint(t);
    const tangent = spineCurve.getTangent(t).normalize();

    // Right-handed Frenet-like frame: U ~ +X, V ~ +Y, T ~ +Z (U x V = T)
    const U = new THREE.Vector3().crossVectors(upRef, tangent).normalize();
    const V = new THREE.Vector3().crossVectors(tangent, U).normalize();

    // Tapered ergonomic flat-oval cross-section (flared root fillet -> slender neck -> ergonomic tip)
    let rx, ry;
    if (!isTip) {
      const rootFlare = Math.pow(1 - smoothstep(0.0, 0.20, t), 2);
      rx = THREE.MathUtils.lerp(0.044, 0.031, t) + 0.018 * rootFlare;
      ry = THREE.MathUtils.lerp(0.029, 0.021, t) + 0.013 * rootFlare;
    } else {
      const capFrac = (i - lengthSteps) / tipCapSteps; // 0..1
      const beta = capFrac * Math.PI * 0.5;
      const scale = Math.max(0.0005, Math.cos(beta));
      rx = 0.031 * scale;
      ry = 0.021 * scale;
      center.addScaledVector(tangent, 0.018 * Math.sin(beta));
    }

    const ring = [];
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      // Slightly superelliptic oval for machined flat-sided AK charging handle feel
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ox = Math.sign(ca) * Math.pow(Math.abs(ca), 0.90) * rx;
      const oy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.90) * ry;

      const p = center.clone().addScaledVector(U, ox).addScaledVector(V, oy);
      ring.push(p);
    }
    rings.push(ring);
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const stride = radialSegs + 1;

  for (let i = 0; i <= totalSteps; i++) {
    const u = i / totalSteps;
    for (let j = 0; j <= radialSegs; j++) {
      const p = rings[i][j];
      positions.push(p.x, p.y, p.z);
      uvs.push(u * 1.4, j / radialSegs);
    }
  }

  // Verified outward winding: (dP/da) x (dP/dt) = V x T = +U (outward!) -> (i00, i01, i10), (i01, i11, i10)
  for (let i = 0; i < totalSteps; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const i00 = i * stride + j;
      const i01 = i * stride + (j + 1);
      const i10 = (i + 1) * stride + j;
      const i11 = (i + 1) * stride + (j + 1);
      indices.push(i00, i01, i10);
      indices.push(i01, i11, i10);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the bare brushed-steel Bolt Carrier & Charging Handle (`parts.boltCarrier`).
 * Cross-section is contoured cleanly inside the dust cover's inner arch so cycling `-1.10` in X
 * glides smoothly with zero clipping, while filling the ejection port with machined detail!
 */
function buildBoltCarrier(materials) {
  const boltCarrier = new THREE.Group();
  boltCarrier.name = 'BoltCarrier';

  // 1. Contoured Carrier Main Body (extruded along X so upper right curves inside dust cover arch!)
  // Cross-section in (Z, Y) plane carefully verified against dust cover inner arch at X = -2.30
  // (after bevelSize=0.006, body core right side reaches Z=+0.138, leaving Z=+0.138..+0.151 for
  // the sculpted fluted flank plate and clearing dust cover Z_inner=+0.153..+0.162 throughout travel!).
  const bodySection = new THREE.Shape();
  bodySection.moveTo(-0.092, 0.058);
  bodySection.lineTo(0.132, 0.058);
  bodySection.lineTo(0.132, 0.215);
  bodySection.quadraticCurveTo(0.128, 0.258, 0.098, 0.278);
  bodySection.quadraticCurveTo(0.068, 0.286, 0.008, 0.286);
  bodySection.quadraticCurveTo(-0.072, 0.284, -0.092, 0.238);
  bodySection.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodySection, {
    depth: 0.67, // X = -1.27 to -0.60
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.006,
    bevelSegments: 3,
    curveSegments: 16,
  });
  // rotateY(-Math.PI/2) maps (x, y, z) -> (-z, y, x) so shape +X -> +Z, depth +Z -> -X!
  bodyGeo.rotateY(-Math.PI * 0.5);
  bodyGeo.computeVertexNormals();
  projectBoxUVsAlongX(bodyGeo, 0.75, 1.85);
  const bodyMesh = new THREE.Mesh(bodyGeo, materials.polishedSteel);
  // Since depth runs along -X from 0 to -0.67, place at X = -0.59 so it spans X = -1.26 to -0.59!
  bodyMesh.position.set(-0.59, 0.0, 0.0);
  boltCarrier.add(bodyMesh);

  // 2. Sculpted Visible Right Flank Plate with Machined Longitudinal Lightening Flute
  // Top height Y = +0.215 & outer face Z = +0.151 guarantee 100% clearance inside dust cover
  // even at full -1.10 rearward bolt travel, while proudly displaying the recessed milled flute!
  const flankOuter = new THREE.Shape();
  flankOuter.moveTo(-1.26, 0.062);
  flankOuter.lineTo(-0.55, 0.062);
  flankOuter.lineTo(-0.538, 0.092);
  flankOuter.lineTo(-0.562, 0.198); // classic angled AK carrier front slope
  flankOuter.lineTo(-0.635, 0.215);
  flankOuter.lineTo(-1.245, 0.215);
  flankOuter.lineTo(-1.265, 0.196);
  flankOuter.closePath();

  // Machined longitudinal lightening flute groove (CW hole) centered cleanly in ejection port
  const fluteHole = createStadiumPath(-1.025, 0.146, 0.34, 0.058, true);
  flankOuter.holes.push(fluteHole);

  const flankGeo = new THREE.ExtrudeGeometry(flankOuter, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 16,
  });
  flankGeo.computeVertexNormals();
  projectBoxUVsAlongX(flankGeo, 0.75, 1.85);
  const flankMesh = new THREE.Mesh(flankGeo, materials.polishedSteel);
  // Back face sits at Z = +0.135, beveled front face sits cleanly at Z = +0.151!
  flankMesh.position.set(0.0, 0.0, 0.139);
  boltCarrier.add(flankMesh);

  // Subtle recessed machined flute shadow backing right behind the cutout (Z = +0.138..+0.141)
  const fluteBackShape = new THREE.Shape();
  const rFl = 0.029;
  const hsFl = 0.17 - rFl;
  fluteBackShape.moveTo(-1.025 - hsFl, 0.146 - rFl);
  fluteBackShape.lineTo(-1.025 + hsFl, 0.146 - rFl);
  fluteBackShape.absarc(-1.025 + hsFl, 0.146, rFl, -Math.PI * 0.5, Math.PI * 0.5, false);
  fluteBackShape.lineTo(-1.025 - hsFl, 0.146 + rFl);
  fluteBackShape.absarc(-1.025 - hsFl, 0.146, rFl, Math.PI * 0.5, -Math.PI * 0.5, false);
  fluteBackShape.closePath();

  const fluteBackGeo = new THREE.ExtrudeGeometry(fluteBackShape, {
    depth: 0.003,
    bevelEnabled: false,
    curveSegments: 14,
  });
  const fluteBackMesh = new THREE.Mesh(fluteBackGeo, materials.parkerizedSteel);
  fluteBackMesh.position.set(0.0, 0.0, 0.138);
  boltCarrier.add(fluteBackMesh);

  // 3. Angled Machined Front Nose of Carrier (X = -0.60 to -0.52)
  const noseGeo = createBeveledBox(0.11, 0.19, 0.21, 0.012, 2);
  const noseMesh = new THREE.Mesh(noseGeo, materials.polishedSteel);
  noseMesh.position.set(-0.575, 0.158, 0.018);
  noseMesh.rotation.z = -0.18;
  boltCarrier.add(noseMesh);

  // Lower Rotating Bolt Head & Extractor Detail nestled under front of carrier
  const boltHeadGeo = new THREE.CylinderGeometry(0.052, 0.056, 0.22, 18);
  boltHeadGeo.rotateZ(Math.PI * 0.5);
  const boltHeadMesh = new THREE.Mesh(boltHeadGeo, materials.darkSteel);
  boltHeadMesh.position.set(-0.62, 0.038, 0.02);
  boltCarrier.add(boltHeadMesh);

  const extractorGeo = createBeveledBox(0.14, 0.024, 0.024, 0.004, 1);
  const extractorMesh = new THREE.Mesh(extractorGeo, materials.polishedSteel);
  extractorMesh.position.set(-0.60, 0.048, 0.072);
  boltCarrier.add(extractorMesh);

  // 4. Internal Long-Stroke Gas Piston Collar & Stem Stub (extends forward into RSB/gas tube)
  // Completely hidden when assembled, prominently visible when dust cover / bolt carrier explode!
  const pistonCollarGeo = new THREE.CylinderGeometry(0.054, 0.062, 0.12, 20);
  pistonCollarGeo.rotateZ(Math.PI * 0.5);
  const pistonCollar = new THREE.Mesh(pistonCollarGeo, materials.polishedSteel);
  pistonCollar.position.set(-0.50, 0.268, 0.0);
  boltCarrier.add(pistonCollar);

  // Machined piston stem with authentic gas-seal rings near tip
  const pistonPts = [
    new THREE.Vector2(0.038, -0.45),
    new THREE.Vector2(0.032, -0.40),
    new THREE.Vector2(0.032, 0.02),
    new THREE.Vector2(0.046, 0.04),
    new THREE.Vector2(0.046, 0.07),
    new THREE.Vector2(0.036, 0.08), // ring groove 1
    new THREE.Vector2(0.046, 0.09),
    new THREE.Vector2(0.046, 0.12),
    new THREE.Vector2(0.036, 0.13), // ring groove 2
    new THREE.Vector2(0.046, 0.14),
    new THREE.Vector2(0.046, 0.17),
    new THREE.Vector2(0.032, 0.185),
    new THREE.Vector2(0.0005, 0.185),
  ];
  const pistonGeo = new THREE.LatheGeometry(pistonPts, 20);
  pistonGeo.rotateZ(-Math.PI * 0.5); // maps lathe +Y onto +X
  pistonGeo.computeVertexNormals();
  const pistonMesh = new THREE.Mesh(pistonGeo, materials.polishedSteel);
  pistonMesh.position.set(0.0, 0.275, 0.0);
  boltCarrier.add(pistonMesh);

  // Rear recoil spring guide tunnel bore on rear face of carrier (X = -1.275)
  const rearTunnelGeo = new THREE.CylinderGeometry(0.034, 0.034, 0.025, 16);
  rearTunnelGeo.rotateZ(Math.PI * 0.5);
  const rearTunnel = new THREE.Mesh(rearTunnelGeo, materials.darkSteel);
  rearTunnel.position.set(-1.268, 0.195, 0.0);
  boltCarrier.add(rearTunnel);

  // 5. Iconic Upturned Curved Charging Handle
  const handleGeo = createChargingHandleGeometry();
  const handleMesh = new THREE.Mesh(handleGeo, materials.polishedSteel);
  handleMesh.name = 'ChargingHandle';
  boltCarrier.add(handleMesh);

  boltCarrier.userData.explodeOffset = new THREE.Vector3(-0.55, 0.55, 0.45);
  return boltCarrier;
}

// ============================================================================
// 5. Safety / Fire Selector Lever (`parts.selectorLever`)
// ============================================================================

/**
 * Builds the Safety / Fire Selector Lever pivoted strictly at (-2.02, -0.14, +0.195).
 * Rotations:
 *   rotation.z =  0.00 -> Safe (upper dust-flap covers charging handle slot!)
 *   rotation.z = -0.18 -> Auto (АВ)
 *   rotation.z = -0.34 -> Semi (ОД)
 */
function buildSelectorLever(materials) {
  const selectorLever = new THREE.Group();
  selectorLever.name = 'SelectorLever';
  selectorLever.position.set(-2.02, -0.14, 0.195);

  // 1. Main Stamped Steel Selector Arm & Upper Dust-Flap Ledge (local coords from pivot (0,0,0))
  // Sleek authentic stamped AK lever:
  //   - Upper dust-cover flap (local x = 0.22..1.00, y up to +0.308 -> world Y = +0.168) seals the
  //     charging handle slot in Safe (0.00) and stays strictly left of АВ/ОД (X <= -0.964) in Auto/Semi.
  //   - Stepped lower front nose & finger shelf (local x = 1.04..1.18, y = +0.125..+0.182) stays
  //     cleanly below АВ (world Y <= -0.158) in Auto (-0.18) and below ОД (world Y <= -0.338) in Semi (-0.34)!
  const armShape = new THREE.Shape();
  // Start behind circular pivot hub
  armShape.absarc(0, 0, 0.066, Math.PI * 0.55, Math.PI * 1.45, false);
  // Sleek bottom edge sweeping smoothly forward to front nose (1.17, +0.125)
  armShape.lineTo(0.20, -0.025);
  armShape.lineTo(0.86, 0.095);
  armShape.lineTo(1.13, 0.126);
  armShape.quadraticCurveTo(1.18, 0.134, 1.18, 0.162);
  // Compact front tip below АВ in Auto & below ОД in Semi
  armShape.lineTo(1.16, 0.182);
  armShape.lineTo(1.045, 0.184);
  // Iconic crisp step-up onto upper dust-cover flange cleanly behind the charging handle & left of АВ
  armShape.quadraticCurveTo(1.02, 0.192, 1.01, 0.275);
  armShape.quadraticCurveTo(1.00, 0.308, 0.965, 0.308);
  // Top dust-cover edge running rearward over the charging handle slot
  armShape.lineTo(0.26, 0.225);
  armShape.quadraticCurveTo(0.18, 0.212, 0.13, 0.135);
  armShape.lineTo(0.055, 0.064);
  armShape.closePath();

  const armGeo = new THREE.ExtrudeGeometry(armShape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
    curveSegments: 14,
  });
  armGeo.translate(0, 0, -0.006);
  armGeo.computeVertexNormals();
  projectBoxUVsAlongX(armGeo, 0.55, 1.85);
  const armMesh = new THREE.Mesh(armGeo, materials.bluedSteel);
  selectorLever.add(armMesh);

  // 2. Rear Circular Pivot Boss, Stepped Axle & Inner Receiver Shaft
  const bossGeo = new THREE.CylinderGeometry(0.052, 0.058, 0.016, 20);
  bossGeo.rotateX(Math.PI * 0.5);
  const bossMesh = new THREE.Mesh(bossGeo, materials.parkerizedSteel);
  bossMesh.position.set(0, 0, 0.008);
  selectorLever.add(bossMesh);

  const rivetHeadGeo = createDomedPinGeometry(0.026, 0.012, 0.006, 16);
  const rivetHead = new THREE.Mesh(rivetHeadGeo, materials.bluedSteel);
  rivetHead.position.set(0, 0, 0.006);
  selectorLever.add(rivetHead);

  // Inner pivot shaft entering the receiver wall cleanly
  const shaftGeo = new THREE.CylinderGeometry(0.030, 0.030, 0.032, 16);
  shaftGeo.rotateX(Math.PI * 0.5);
  const shaftMesh = new THREE.Mesh(shaftGeo, materials.darkSteel);
  shaftMesh.position.set(0, 0, -0.016);
  selectorLever.add(shaftMesh);

  // 3. Stamped Longitudinal Middle Stiffening Rib on outer face of lever
  const ribGeo = createBeveledBox(0.76, 0.030, 0.012, 0.004, 2);
  const ribMesh = new THREE.Mesh(ribGeo, materials.bluedSteel);
  ribMesh.position.set(0.55, 0.112, 0.011);
  ribMesh.rotation.z = 0.18;
  selectorLever.add(ribMesh);

  // 4. Outward-Bent Ergonomic Finger Shelf / Thumb Tab at front (local Z = +0.055)
  // Positioned at local y = +0.154 so in Auto (-0.18) it sits at world Y = -0.187, cleanly below АВ (-0.117)!
  const shelfGeo = createBeveledBox(0.138, 0.026, 0.056, 0.005, 2);
  const shelfMesh = new THREE.Mesh(shelfGeo, materials.bluedSteel);
  shelfMesh.position.set(1.112, 0.154, 0.031);
  shelfMesh.rotation.z = 0.14;
  selectorLever.add(shelfMesh);

  // Subtle top grip serrations on finger shelf
  const tabRibGeo = createBeveledBox(0.009, 0.0045, 0.046, 0.001, 1);
  for (let i = -2; i <= 2; i++) {
    const tr = new THREE.Mesh(tabRibGeo, materials.parkerizedSteel);
    tr.position.set(1.112 + i * 0.021, 0.167 + i * 0.003, 0.032);
    tr.rotation.z = 0.14;
    selectorLever.add(tr);
  }

  // 5. Inner Stamped Detent Bump clicking into the АВ / ОД notches at local (0.99, +0.186, -0.011)
  const detentGeo = new THREE.SphereGeometry(0.015, 12, 10);
  const detentBump = new THREE.Mesh(detentGeo, materials.parkerizedSteel);
  detentBump.scale.set(1.3, 0.75, 0.7);
  detentBump.position.set(0.99, 0.186, -0.011);
  selectorLever.add(detentBump);

  // Corresponding outer circular punch dimple visible on outer face of selector lever
  const punchGeo = new THREE.CylinderGeometry(0.013, 0.015, 0.005, 14);
  punchGeo.rotateX(Math.PI * 0.5);
  const punchMesh = new THREE.Mesh(punchGeo, materials.darkSteel);
  punchMesh.position.set(0.99, 0.186, 0.008);
  selectorLever.add(punchMesh);

  return selectorLever;
}

// ============================================================================
// 6. Curved AK-47 Trigger (`parts.trigger`)
// ============================================================================

/**
 * Builds the smoothly curved AK-47 Trigger pivoted at (X = -1.48, Y = -0.44, Z = 0).
 * Note on kinematics:
 *   `main.js` pulls the trigger by increasing `trigger.rotation.z` from 0 to +0.25 rad.
 *   In Three.js default 'XYZ' Euler order, setting `trigger.rotation.y = Math.PI` (proper
 *   determinant +1 rotation) and mirroring the blade in local X ensures that positive
 *   `trigger.rotation.z` swings the hanging trigger tip smoothly REARWARD (-X)!
 */
function buildTrigger(materials) {
  const trigger = new THREE.Group();
  trigger.name = 'Trigger';
  trigger.position.set(-1.48, -0.44, 0.0);
  trigger.rotation.y = Math.PI;

  // Build curved AK trigger blade in local coords (mirrored in X so local -X faces world +X muzzle!)
  // Concave finger face faces local -X (world +X), hanging down from Y = +0.02 to Y = -0.26.
  const frontCurve = new THREE.SplineCurve([
    new THREE.Vector2(-0.020, 0.030),
    new THREE.Vector2(-0.022, -0.040),
    new THREE.Vector2(-0.005, -0.125),
    new THREE.Vector2(-0.024, -0.205),
    new THREE.Vector2(-0.058, -0.258),
  ]).getPoints(20);

  const backCurve = new THREE.SplineCurve([
    new THREE.Vector2(-0.036, -0.264),
    new THREE.Vector2(0.016, -0.200),
    new THREE.Vector2(0.044, -0.120),
    new THREE.Vector2(0.038, -0.035),
    new THREE.Vector2(0.036, 0.030),
  ]).getPoints(20);

  const trigShape = new THREE.Shape();
  trigShape.moveTo(frontCurve[0].x, frontCurve[0].y);
  for (let i = 1; i < frontCurve.length; i++) {
    trigShape.lineTo(frontCurve[i].x, frontCurve[i].y);
  }
  for (let i = 0; i < backCurve.length; i++) {
    trigShape.lineTo(backCurve[i].x, backCurve[i].y);
  }
  trigShape.closePath();

  const trigGeo = new THREE.ExtrudeGeometry(trigShape, {
    depth: 0.044, // authentic ~5.6mm wide ergonomic trigger shoe with bevels
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 3,
  });
  trigGeo.translate(0, 0, -0.022);
  trigGeo.computeVertexNormals();
  projectBoxUVsAlongX(trigGeo, 0.65, 1.85);

  const trigMesh = new THREE.Mesh(trigGeo, materials.bluedSteel);
  trigger.add(trigMesh);

  return trigger;
}

// ============================================================================
// Master Assembly Export
// ============================================================================

export function buildReceiver(materials) {
  const group = new THREE.Group();
  group.name = 'AK47_ReceiverAssembly';

  // 1. Fixed Type 3 Milled Receiver Body (sidewalls, core, RSB, hardware, trigger guard, mag catch)
  const receiverBody = new THREE.Group();
  receiverBody.name = 'ReceiverBody';

  receiverBody.add(buildReceiverSidewall(1, materials));
  receiverBody.add(buildReceiverSidewall(-1, materials));
  receiverBody.add(buildReceiverCoreAndInternals(materials));
  receiverBody.add(buildReceiverHardwareAndMarkings(materials));
  receiverBody.add(buildRearSightBlock(materials));
  receiverBody.add(buildTriggerGuardAndMagCatch(materials));
  group.add(receiverBody);

  // 2. Removable / Explodable Stamped Dust Cover
  const dustCover = buildDustCover(materials);
  group.add(dustCover);

  // 3. Tangent Rear Sight Leaf
  const rearSightLeaf = buildRearSightLeaf(materials);
  group.add(rearSightLeaf);

  // 4. Bare Brushed-Steel Bolt Carrier & Charging Handle
  const boltCarrier = buildBoltCarrier(materials);
  group.add(boltCarrier);

  // 5. Animated Safety / Fire Selector Lever
  const selectorLever = buildSelectorLever(materials);
  group.add(selectorLever);

  // 6. Animated Curved Trigger
  const trigger = buildTrigger(materials);
  group.add(trigger);

  enableShadows(group);

  return {
    group,
    parts: {
      receiverBody,
      dustCover,
      boltCarrier,
      selectorLever,
      trigger,
      rearSightLeaf,
    },
  };
}
