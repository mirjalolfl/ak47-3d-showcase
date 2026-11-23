import * as THREE from 'three';

/**
 * AK-47 (Type 3 / Classic Kalashnikov) Barrel, Gas System, Front Sight Tower,
 * Muzzle Compensator, Handguard Retainer, Sling Loop & Cleaning Rod.
 *
 * Coordinate contract (1 unit = 100 mm; 0.01 = 1 mm):
 *   +X = muzzle, -X = buttstock, +Y = up, +Z = right side, -Z = left side
 *   Origin (0, 0, 0) = bore centerline at front face of receiver.
 */

// ---------------------------------------------------------------------------
// Shared geometry helpers
// ---------------------------------------------------------------------------

/**
 * Create a LatheGeometry centered along the X axis.
 * Input pairs: [[x, r], ...]
 * Strictly increasing x yields outward normals; strictly decreasing x yields
 * inward normals (for recessed hollow bores).
 */
function createLatheAlongX(profileXR, radialSegments = 48) {
  const pts = profileXR.map(([x, r]) => new THREE.Vector2(Math.max(0.0005, r), x));
  const geom = new THREE.LatheGeometry(pts, radialSegments);
  // rotateZ(-PI/2) maps lathe +Y -> +X (det = +1, preserves outward normals)
  geom.rotateZ(-Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Extrude a 2D shape in the X-Y plane symmetrically along Z.
 * Subtracts 2 * bevelThickness from core depth so total thickness matches targetDepth.
 */
function extrudeXYCenteredZ(shape, targetDepth, bevel = null, curveSegments = 24) {
  const hasBevel = bevel !== null && bevel !== undefined;
  const bt = hasBevel ? (bevel.bevelThickness ?? 0.008) : 0;
  const bs = hasBevel ? (bevel.bevelSize ?? 0.006) : 0;
  const coreDepth = Math.max(0.002, targetDepth - 2 * bt);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: coreDepth,
    curveSegments,
    bevelEnabled: hasBevel,
    bevelThickness: bt,
    bevelSize: bs,
    bevelSegments: hasBevel ? (bevel.bevelSegments ?? 3) : 1,
  });
  geom.translate(0, 0, -coreDepth / 2);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Extrude a 2D shape authored in (u = Z, v = Y) along the +X axis,
 * spanning [xStart, xEnd] (accounting for bevel thickness).
 */
function extrudeYZAlongX(shape, xStart, xEnd, bevel = null, curveSegments = 28) {
  const hasBevel = bevel !== null && bevel !== undefined;
  const bt = hasBevel ? (bevel.bevelThickness ?? 0.006) : 0;
  const bs = hasBevel ? (bevel.bevelSize ?? 0.005) : 0;
  const totalLen = xEnd - xStart;
  const coreDepth = Math.max(0.002, totalLen - 2 * bt);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: coreDepth,
    curveSegments,
    bevelEnabled: hasBevel,
    bevelThickness: bt,
    bevelSize: bs,
    bevelSegments: hasBevel ? (bevel.bevelSegments ?? 3) : 1,
  });
  // ExtrudeGeometry builds in local (x, y) extruded along +z in [0, coreDepth]
  // rotateY(+PI/2) maps: x' = +z, y' = y, z' = -x
  // So u -> -Z (symmetric shapes identical; asymmetric shapes pass -Z as u)
  geom.rotateY(Math.PI / 2);
  geom.translate(xStart + bt, 0, 0);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Create a chamfered steel cross-pin aligned along the Z axis at (x, y).
 */
function createCrossPinMesh(x, y, length, radius, material) {
  const half = length / 2;
  const ch = Math.min(0.005, radius * 0.35);
  const dome = Math.min(0.004, radius * 0.25);
  const pts = [
    new THREE.Vector2(0.0005, -half - dome),
    new THREE.Vector2(radius * 0.65, -half - dome * 0.45),
    new THREE.Vector2(radius, -half + ch),
    new THREE.Vector2(radius, half - ch),
    new THREE.Vector2(radius * 0.65, half + dome * 0.45),
    new THREE.Vector2(0.0005, half + dome),
  ];
  const geom = new THREE.LatheGeometry(pts, 20);
  geom.rotateX(Math.PI / 2);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set(x, y, 0);
  return mesh;
}

/**
 * Enable shadows on all meshes inside an Object3D subtree.
 */
function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
}

// ---------------------------------------------------------------------------
// 1. Main Stepped Forged Barrel & Recessed Bore
// ---------------------------------------------------------------------------

function buildMainBarrel(materials) {
  const barrelGroup = new THREE.Group();
  barrelGroup.name = 'BarrelTube';

  // Authentic AK-47 stepped barrel profile from X = -0.02 (receiver trunnion seat)
  // to X = +4.15 (415 mm barrel) including M14x1 LH muzzle threads & crown bevel.
  const outerProfile = [
    [-0.020, 0.001],
    [-0.020, 0.115], // Heavy chamber journal seated in trunnion
    [0.540, 0.115],
    [0.555, 0.113],
    [0.585, 0.098],  // Chamber taper transition
    [0.610, 0.096],
    [1.640, 0.093],  // Mid-barrel gentle taper under lower handguard
    [1.680, 0.093],
    [1.760, 0.092],  // Handguard retainer journal
    [1.785, 0.090],
    [2.330, 0.090],  // Exposed mid-barrel ahead of retainer
    [2.350, 0.088],
    [2.680, 0.088],  // Gas block journal
    [2.692, 0.085],
    [2.712, 0.078],  // Crisp step down forward of gas block
    [3.560, 0.078],  // Exposed forward barrel
    [3.572, 0.076],
    [3.958, 0.076],  // Front sight base journal
    [3.964, 0.074],
    [4.018, 0.074],  // Unthreaded muzzle shoulder collar
    [4.022, 0.068],  // Thread relief groove
  ];

  // Authentic machined M14x1 LH muzzle threads (visible when muzzle brake explodes)
  const threadStart = 4.028;
  const threadCount = 7;
  const pitch = 0.0145;
  for (let i = 0; i < threadCount; i++) {
    const x0 = threadStart + i * pitch;
    outerProfile.push([x0, 0.0655]);
    outerProfile.push([x0 + pitch * 0.35, 0.0715]);
    outerProfile.push([x0 + pitch * 0.55, 0.0715]);
    outerProfile.push([x0 + pitch * 0.90, 0.0655]);
  }

  // Muzzle face & recessed 11-degree crown bevel leading into bore (r = 0.039)
  outerProfile.push(
    [4.138, 0.067],
    [4.147, 0.064],
    [4.150, 0.059],
    [4.150, 0.0445],
    [4.145, 0.0392],
  );

  const barrelGeom = createLatheAlongX(outerProfile, 56);
  const barrelMesh = new THREE.Mesh(barrelGeom, materials.bluedSteel);
  barrelMesh.name = 'BarrelExterior';
  barrelGroup.add(barrelMesh);

  // Dark recessed bore interior (decreasing X gives inward-facing normals)
  const boreProfile = [
    [4.146, 0.0390],
    [4.140, 0.0388],
    [2.850, 0.0388],
    [2.850, 0.0010], // Deep matte end plug far inside barrel
  ];
  const boreGeom = createLatheAlongX(boreProfile, 32);
  const boreMesh = new THREE.Mesh(boreGeom, materials.darkSteel);
  boreMesh.name = 'BarrelBoreInterior';
  barrelGroup.add(boreMesh);

  return barrelGroup;
}

// ---------------------------------------------------------------------------
// 2. Front Handguard Retainer & Front Sling Swivel Loop (X = +1.72)
// ---------------------------------------------------------------------------

function buildHandguardRetainer(materials) {
  const retainerGroup = new THREE.Group();
  retainerGroup.name = 'FrontHandguardRetainer';

  // Helper for the stamped U-shaped retainer silhouette in (u = Z, v = Y)
  function makeRetainerOuterShape(halfW, yBottom, yTop, barrelArchR) {
    const s = new THREE.Shape();
    const cornerR = 0.068;
    // Start at top-right shoulder, go clockwise / CCW consistently (CCW in 2D)
    s.moveTo(halfW, yTop);
    // Curve gracefully over the barrel crown from +halfW to -halfW
    s.quadraticCurveTo(halfW * 0.72, yTop + 0.008, barrelArchR * 0.92, barrelArchR * 0.55);
    s.absarc(0, 0, barrelArchR, Math.atan2(barrelArchR * 0.55, barrelArchR * 0.92), Math.PI - Math.atan2(barrelArchR * 0.55, barrelArchR * 0.92), false);
    s.quadraticCurveTo(-halfW * 0.72, yTop + 0.008, -halfW, yTop);
    // Left flank down to rounded bottom cradle
    s.lineTo(-halfW, yBottom + cornerR);
    s.quadraticCurveTo(-halfW, yBottom, -halfW + cornerR, yBottom);
    s.lineTo(halfW - cornerR, yBottom);
    s.quadraticCurveTo(halfW, yBottom, halfW, yBottom + cornerR);
    s.closePath();
    return s;
  }

  // Front stamped steel faceplate (X = +1.712 to +1.758) with circular cleaning-rod hole
  const faceShape = makeRetainerOuterShape(0.180, -0.218, 0.100, 0.114);
  const rodHole = new THREE.Path();
  rodHole.absarc(0, -0.148, 0.0285, 0, Math.PI * 2, true);
  faceShape.holes.push(rodHole);

  const faceGeom = extrudeYZAlongX(faceShape, 1.712, 1.758, {
    bevelThickness: 0.006,
    bevelSize: 0.005,
    bevelSegments: 3,
  });
  const faceMesh = new THREE.Mesh(faceGeom, materials.parkerizedSteel);
  faceMesh.name = 'HandguardRetainerPlate';
  retainerGroup.add(faceMesh);

  // Rear stamped steel ferrule shroud cup (X = +1.655 to +1.722) overlapping lower handguard nose
  // Open-top U-band profile (zero holes -> guaranteed clean triangulation)
  const cupOuterW = 0.186;
  const cupInnerW = 0.172;
  const cupOuterBot = -0.222;
  const cupInnerBot = -0.205;
  const cupTop = 0.106;
  const cupOutCR = 0.068;
  const cupInCR = 0.054;

  const cupShape = new THREE.Shape();
  cupShape.moveTo(cupOuterW, cupTop);
  cupShape.lineTo(cupOuterW, cupOuterBot + cupOutCR);
  cupShape.quadraticCurveTo(cupOuterW, cupOuterBot, cupOuterW - cupOutCR, cupOuterBot);
  cupShape.lineTo(-cupOuterW + cupOutCR, cupOuterBot);
  cupShape.quadraticCurveTo(-cupOuterW, cupOuterBot, -cupOuterW, cupOuterBot + cupOutCR);
  cupShape.lineTo(-cupOuterW, cupTop);
  cupShape.lineTo(-cupInnerW, cupTop);
  cupShape.lineTo(-cupInnerW, cupInnerBot + cupInCR);
  cupShape.quadraticCurveTo(-cupInnerW, cupInnerBot, -cupInnerW + cupInCR, cupInnerBot);
  cupShape.lineTo(cupInnerW - cupInCR, cupInnerBot);
  cupShape.quadraticCurveTo(cupInnerW, cupInnerBot, cupInnerW, cupInnerBot + cupInCR);
  cupShape.lineTo(cupInnerW, cupTop);
  cupShape.closePath();

  const cupGeom = extrudeYZAlongX(cupShape, 1.655, 1.722, {
    bevelThickness: 0.004,
    bevelSize: 0.0025,
    bevelSegments: 2,
  });
  const cupMesh = new THREE.Mesh(cupGeom, materials.parkerizedSteel);
  cupMesh.name = 'HandguardRetainerCup';
  retainerGroup.add(cupMesh);

  // Subtle forward barrel collar step on retainer front
  const collarGeom = createLatheAlongX([
    [1.750, 0.114],
    [1.778, 0.112],
    [1.792, 0.102],
    [1.796, 0.090],
  ], 36);
  const collarMesh = new THREE.Mesh(collarGeom, materials.parkerizedSteel);
  collarMesh.name = 'HandguardRetainerBarrelCollar';
  retainerGroup.add(collarMesh);

  // Cleaning-rod eyelet lip collar on front face
  const rodLipGeom = createLatheAlongX([
    [1.752, 0.044],
    [1.768, 0.042],
    [1.770, 0.032],
    [1.766, 0.0285],
    [1.750, 0.0285],
  ], 24);
  const rodLipMesh = new THREE.Mesh(rodLipGeom, materials.parkerizedSteel);
  rodLipMesh.position.set(0, -0.148, 0);
  retainerGroup.add(rodLipMesh);

  // Right-side (+Z) Locking Lever Arm (folded forward cleanly alongside exposed barrel)
  const leverGroup = new THREE.Group();
  leverGroup.name = 'HandguardRetainerLever';

  // Pivot boss on right upper shoulder of retainer (+Z)
  const pivotPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.021, 0.044, 18),
    materials.bluedSteel
  );
  pivotPin.rotation.x = Math.PI / 2;
  pivotPin.position.set(1.745, 0.042, 0.155);
  leverGroup.add(pivotPin);

  // Sculpted curved stamped locking lever extending forward along +X (zero wood clipping)
  const leverShape = new THREE.Shape();
  leverShape.moveTo(1.725, 0.058);
  leverShape.quadraticCurveTo(1.745, 0.068, 1.770, 0.056);
  leverShape.lineTo(1.885, 0.018);
  leverShape.quadraticCurveTo(1.918, 0.008, 1.912, -0.012);
  leverShape.quadraticCurveTo(1.904, -0.030, 1.874, -0.024);
  leverShape.lineTo(1.745, 0.022);
  leverShape.quadraticCurveTo(1.720, 0.032, 1.725, 0.058);

  const leverGeom = extrudeXYCenteredZ(leverShape, 0.020, {
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  const leverArm = new THREE.Mesh(leverGeom, materials.parkerizedSteel);
  leverArm.position.set(0, 0, 0.172);
  leverGroup.add(leverArm);

  // Subtle outward finger-tab lip at front tip of lever
  const tabGeom = new THREE.BoxGeometry(0.032, 0.034, 0.022);
  const tabMesh = new THREE.Mesh(tabGeom, materials.parkerizedSteel);
  tabMesh.position.set(1.894, -0.005, 0.184);
  tabMesh.rotation.z = -0.25;
  leverGroup.add(tabMesh);

  retainerGroup.add(leverGroup);

  // Left-side (-Z) Classic Stamped Oval Front Sling Swivel Loop
  const slingGroup = new THREE.Group();
  slingGroup.name = 'FrontSlingSwivel';

  // Welded stamped swivel knuckle bracket on left flank (Z = -0.182 to -0.222, Y = -0.05)
  const earShape = new THREE.Shape();
  earShape.moveTo(1.705, -0.012);
  earShape.lineTo(1.765, -0.012);
  earShape.quadraticCurveTo(1.778, -0.050, 1.765, -0.088);
  earShape.lineTo(1.705, -0.088);
  earShape.quadraticCurveTo(1.692, -0.050, 1.705, -0.012);
  const earGeom = extrudeXYCenteredZ(earShape, 0.042, {
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  const earMesh = new THREE.Mesh(earGeom, materials.parkerizedSteel);
  earMesh.position.set(0, 0, -0.194);
  slingGroup.add(earMesh);

  // Cylindrical swivel knuckle rivet eye
  const eyeBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.068, 18),
    materials.parkerizedSteel
  );
  eyeBarrel.rotation.z = Math.PI / 2;
  eyeBarrel.position.set(1.735, -0.050, -0.214);
  slingGroup.add(eyeBarrel);

  // Pivoting oval / rounded-rectangle stamped steel sling wire loop
  const loopPivot = new THREE.Group();
  loopPivot.position.set(1.735, -0.050, -0.214);
  // Natural relaxed outward hang angle (~18 deg toward -Z, slight rearward cant)
  loopPivot.rotation.x = 0.30;
  loopPivot.rotation.z = -0.06;

  // Build closed rounded-stadium path in local (x, y) centered at top bar y = 0
  const loopW = 0.044;  // half-width along X (total width ~0.088 + wire)
  const loopH = 0.215;  // vertical drop down to -0.215
  const loopR = 0.036;  // corner radius
  const loopPts = [];
  const addArc = (cx, cy, r, a0, a1, steps) => {
    for (let i = 0; i < steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      loopPts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0));
    }
  };
  // Top-right corner -> bottom-right -> bottom-left -> top-left
  addArc(loopW - loopR, -loopR, loopR, Math.PI / 2, 0, 6);
  addArc(loopW - loopR, -loopH + loopR, loopR, 0, -Math.PI / 2, 6);
  addArc(-loopW + loopR, -loopH + loopR, loopR, -Math.PI / 2, -Math.PI, 6);
  addArc(-loopW + loopR, -loopR, loopR, Math.PI, Math.PI / 2, 6);

  const loopCurve = new THREE.CatmullRomCurve3(loopPts, true, 'centripetal', 0.25);
  const loopGeom = new THREE.TubeGeometry(loopCurve, 48, 0.0135, 14, true);
  // Slightly flatten wire in Z to give authentic stamped-steel strap cross-section
  loopGeom.scale(1.0, 1.0, 0.78);
  loopGeom.computeVertexNormals();
  const loopMesh = new THREE.Mesh(loopGeom, materials.parkerizedSteel);
  loopMesh.name = 'FrontSlingLoop';
  loopPivot.add(loopMesh);

  slingGroup.add(loopPivot);
  retainerGroup.add(slingGroup);

  return retainerGroup;
}

// ---------------------------------------------------------------------------
// 3. Iconic 45-Degree Swept Gas Block & Bayonet / Cleaning-Rod Lug
// ---------------------------------------------------------------------------

function buildGasBlock(materials) {
  const gbGroup = new THREE.Group();
  gbGroup.name = 'GasBlock45Deg';

  // 3a. Lower barrel sleeve collar (X = +2.34 to +2.70, Y = 0)
  const lowerCollarGeom = createLatheAlongX([
    [2.338, 0.090],
    [2.348, 0.104],
    [2.368, 0.114],
    [2.662, 0.114],
    [2.688, 0.104],
    [2.700, 0.088],
  ], 44);
  const lowerCollar = new THREE.Mesh(lowerCollarGeom, materials.parkerizedSteel);
  lowerCollar.name = 'GasBlockBarrelSleeve';
  gbGroup.add(lowerCollar);

  // 3b. Upper gas cylinder sleeve (X = +2.29 to +2.53, Y = +0.28)
  // Includes recessed rear socket so gas tube seats cleanly and looks hollow when exploded!
  const upperCollarGeom = createLatheAlongX([
    [2.390, 0.085],  // Inner rear recess wall
    [2.294, 0.087],
    [2.290, 0.094],  // Rear socket mouth chamfer
    [2.290, 0.105],
    [2.302, 0.108],
    [2.448, 0.108],  // Main upper gas cylinder body
    [2.478, 0.104],
    [2.505, 0.092],  // Rounded forged front gas-port nose
    [2.526, 0.068],
    [2.536, 0.036],
    [2.540, 0.001],
  ], 44);
  const upperCollar = new THREE.Mesh(upperCollarGeom, materials.parkerizedSteel);
  upperCollar.position.set(0, 0.28, 0);
  upperCollar.name = 'GasBlockUpperCylinder';
  gbGroup.add(upperCollar);

  // Recessed dark steel internal gas chamber visible in exploded view
  // (dr > 0 at plug -> -X normal facing rearward; dx < 0 along wall -> inward normal)
  const innerChamberGeom = createLatheAlongX([
    [2.485, 0.0010],
    [2.485, 0.0840],
    [2.292, 0.0855],
  ], 28);
  const innerChamber = new THREE.Mesh(innerChamberGeom, materials.darkSteel);
  innerChamber.position.set(0, 0.28, 0);
  gbGroup.add(innerChamber);

  // 3c. Iconic 45-degree swept forged gas-port neck connecting barrel to upper cylinder
  const neckShape = new THREE.Shape();
  neckShape.moveTo(2.385, 0.015);
  neckShape.quadraticCurveTo(2.345, 0.110, 2.300, 0.210);
  neckShape.lineTo(2.300, 0.300);
  neckShape.lineTo(2.450, 0.305);
  // Crisp 45-degree front sweep from (2.465, 0.285) down-forward to (2.675, 0.075)
  neckShape.quadraticCurveTo(2.475, 0.295, 2.490, 0.265);
  neckShape.lineTo(2.670, 0.085);
  neckShape.quadraticCurveTo(2.685, 0.065, 2.680, 0.015);
  neckShape.closePath();

  const neckGeom = extrudeXYCenteredZ(neckShape, 0.168, {
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 4,
  });
  const neckMesh = new THREE.Mesh(neckGeom, materials.parkerizedSteel);
  neckMesh.name = 'GasBlock45Neck';
  gbGroup.add(neckMesh);

  // Forged cylindrical diagonal gas-port conduit spine along the 45-deg centerline
  const diagLen = Math.hypot(2.55 - 2.38, 0.26 - 0.06);
  const conduitGeom = new THREE.CylinderGeometry(0.066, 0.074, diagLen, 28);
  const conduitMesh = new THREE.Mesh(conduitGeom, materials.parkerizedSteel);
  conduitMesh.position.set((2.55 + 2.38) / 2, (0.26 + 0.06) / 2, 0);
  // Tilt top rearward (-X) at ~42 deg
  conduitMesh.rotation.z = Math.atan2(2.55 - 2.38, 0.26 - 0.06);
  gbGroup.add(conduitMesh);

  // Machined gas-port front cleanout boss / stepped flat on the 45-deg front face
  const portBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.042, 0.032, 20),
    materials.parkerizedSteel
  );
  portBoss.position.set(2.562, 0.195, 0);
  portBoss.rotation.z = -Math.PI / 4;
  gbGroup.add(portBoss);

  // 3d. Lower forged pin-boss cheek & two horizontal mounting cross-pins
  const pinBossShape = new THREE.Shape();
  pinBossShape.moveTo(2.368, -0.025);
  pinBossShape.lineTo(2.668, -0.025);
  pinBossShape.lineTo(2.658, -0.118);
  pinBossShape.lineTo(2.378, -0.118);
  pinBossShape.closePath();

  const pinBossGeom = extrudeXYCenteredZ(pinBossShape, 0.204, {
    bevelThickness: 0.010,
    bevelSize: 0.008,
    bevelSegments: 3,
  });
  gbGroup.add(new THREE.Mesh(pinBossGeom, materials.parkerizedSteel));

  gbGroup.add(createCrossPinMesh(2.435, -0.088, 0.214, 0.017, materials.bluedSteel));
  gbGroup.add(createCrossPinMesh(2.605, -0.088, 0.214, 0.017, materials.bluedSteel));

  // 3e. Under-barrel Bayonet Lug & Cleaning-Rod Pass-Through Ring (Y = -0.155)
  // Built in Y-Z plane with a genuine circular through-bore at (Y = -0.148, Z = 0, r = 0.029)
  // so the cleaning rod passes cleanly through the center with zero clipping!
  const lugShape = new THREE.Shape();
  // T-shaped bayonet lug silhouette (top neck -> cleaning rod collar -> flared T-rail bottom)
  lugShape.moveTo(0.062, -0.080);
  lugShape.lineTo(0.056, -0.140);
  lugShape.lineTo(0.044, -0.175);
  lugShape.lineTo(0.070, -0.184); // Flared bayonet rail right ear
  lugShape.lineTo(0.070, -0.214);
  lugShape.lineTo(0.052, -0.224);
  lugShape.lineTo(-0.052, -0.224);
  lugShape.lineTo(-0.070, -0.214);
  lugShape.lineTo(-0.070, -0.184); // Flared bayonet rail left ear
  lugShape.lineTo(-0.044, -0.175);
  lugShape.lineTo(-0.056, -0.140);
  lugShape.lineTo(-0.062, -0.080);
  lugShape.closePath();

  const gbRodHole = new THREE.Path();
  gbRodHole.absarc(0, -0.148, 0.029, 0, Math.PI * 2, true);
  lugShape.holes.push(gbRodHole);

  const bayonetLugGeom = extrudeYZAlongX(lugShape, 2.455, 2.655, {
    bevelThickness: 0.007,
    bevelSize: 0.005,
    bevelSegments: 2,
  });
  const bayonetLug = new THREE.Mesh(bayonetLugGeom, materials.parkerizedSteel);
  bayonetLug.name = 'GasBlockBayonetLug';
  gbGroup.add(bayonetLug);

  // Rear cleaning-rod guide collar loop extending slightly rearward under gas block (X = 2.385..2.465)
  const guideRingShape = new THREE.Shape();
  guideRingShape.moveTo(0.056, -0.088);
  guideRingShape.lineTo(0.052, -0.148);
  guideRingShape.absarc(0, -0.148, 0.052, 0, -Math.PI, true);
  guideRingShape.lineTo(-0.056, -0.088);
  guideRingShape.closePath();

  const guideHole = new THREE.Path();
  guideHole.absarc(0, -0.148, 0.029, 0, Math.PI * 2, true);
  guideRingShape.holes.push(guideHole);

  const guideRingGeom = extrudeYZAlongX(guideRingShape, 2.385, 2.465, {
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  gbGroup.add(new THREE.Mesh(guideRingGeom, materials.parkerizedSteel));

  return gbGroup;
}

// ---------------------------------------------------------------------------
// 4. Gas Tube & Vented Sleeve (parts.gasTube)
// ---------------------------------------------------------------------------

function buildGasTube(materials) {
  const gtGroup = new THREE.Group();
  gtGroup.name = 'GasTube';
  gtGroup.userData.explodeOffset = new THREE.Vector3(0, 0.80, 0);

  const CY = 0.28; // Gas tube centerline Y = +0.28

  // 4a. Main stepped steel gas tube (X = +0.01 to +2.38)
  const tubeProfile = [
    [0.010, 0.072],
    [0.010, 0.086], // Rear end seating cleanly inside Rear Sight Block socket (X = +0.02)
    [0.055, 0.086],
    [0.064, 0.095], // Rear steel collar
    [0.165, 0.095],
    [0.172, 0.084], // Slightly slender mid-tube clearing upper wooden handguard (inner r = 0.092)
    [1.602, 0.084],
    [1.615, 0.090], // Exposed forward vented sleeve (r = 0.090)
    [2.295, 0.090],
    [2.305, 0.086], // Front nose seating cleanly inside Gas Block socket (X = +2.38)
    [2.380, 0.086],
    [2.380, 0.072],
  ];
  const tubeGeom = createLatheAlongX(tubeProfile, 48);
  const tubeMesh = new THREE.Mesh(tubeGeom, materials.parkerizedSteel);
  tubeMesh.position.set(0, CY, 0);
  tubeMesh.name = 'GasTubeCylinder';
  gtGroup.add(tubeMesh);

  // Hollow dark inner bore at both open ends (visible when exploded!)
  // Rear bore: plug normal faces -X (dr > 0), wall normal faces inward (dx < 0)
  const rearInnerBore = new THREE.Mesh(
    createLatheAlongX([[0.280, 0.001], [0.280, 0.072], [0.010, 0.072]], 28),
    materials.darkSteel
  );
  rearInnerBore.position.set(0, CY, 0);
  gtGroup.add(rearInnerBore);

  // Front bore: wall normal faces inward (dx < 0), plug normal faces +X (dr < 0)
  const frontInnerBore = new THREE.Mesh(
    createLatheAlongX([[2.380, 0.072], [2.080, 0.072], [2.080, 0.001]], 28),
    materials.darkSteel
  );
  frontInnerBore.position.set(0, CY, 0);
  gtGroup.add(frontInnerBore);

  // Rear gas tube locking lug flange (engages RSB takedown lever at X = +0.02..+0.07)
  const lockLugShape = new THREE.Shape();
  lockLugShape.moveTo(0.012, CY + 0.068);
  lockLugShape.lineTo(0.072, CY + 0.068);
  lockLugShape.lineTo(0.065, CY + 0.116);
  lockLugShape.lineTo(0.018, CY + 0.116);
  lockLugShape.closePath();
  const lockLugGeom = extrudeXYCenteredZ(lockLugShape, 0.110, {
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  gtGroup.add(new THREE.Mesh(lockLugGeom, materials.parkerizedSteel));

  // Helper for stamped crescent/horseshoe upper-handguard retaining ferrule walls
  function makeUpperFerruleWallShape() {
    const s = new THREE.Shape();
    // Arch spanning Z = [-0.166, +0.166], Y = [0.172, 0.424] wrapping cleanly around gas tube
    const halfW = 0.166;
    const yBot = 0.172;
    const yTop = 0.424;
    s.moveTo(halfW, yBot);
    s.lineTo(halfW, 0.285);
    s.bezierCurveTo(halfW, 0.375, 0.095, yTop, 0, yTop);
    s.bezierCurveTo(-0.095, yTop, -halfW, 0.375, -halfW, 0.285);
    s.lineTo(-halfW, yBot);
    // Clean bottom saddle hugging the underside of the gas tube collar
    s.lineTo(-0.095, yBot);
    s.quadraticCurveTo(0, 0.184, 0.095, yBot);
    s.lineTo(halfW, yBot);
    s.closePath();
    return s;
  }

  // Open-bottom inverted-U horseshoe lip overlapping the upper wooden handguard ends
  // (zero holes -> guaranteed clean non-degenerate triangulation)
  function makeUpperFerruleLipShape() {
    const s = new THREE.Shape();
    const outW = 0.168;
    const inW = 0.150;
    const yBot = 0.172;
    const outTop = 0.426;
    const inTop = 0.408;

    // Outer arch CCW from bottom-right -> top -> bottom-left
    s.moveTo(outW, yBot);
    s.lineTo(outW, 0.285);
    s.bezierCurveTo(outW, 0.377, 0.096, outTop, 0, outTop);
    s.bezierCurveTo(-0.096, outTop, -outW, 0.377, -outW, 0.285);
    s.lineTo(-outW, yBot);
    // Step inward at left base, trace inner arch back CW -> bottom-right
    s.lineTo(-inW, yBot);
    s.lineTo(-inW, 0.285);
    s.bezierCurveTo(-inW, 0.362, -0.085, inTop, 0, inTop);
    s.bezierCurveTo(0.085, inTop, inW, 0.362, inW, 0.285);
    s.lineTo(inW, yBot);
    s.closePath();
    return s;
  }

  // 4b. Rear upper-handguard steel retention ferrule (X = +0.155 to +0.195, lip at X = +0.165)
  const rearWall = new THREE.Mesh(
    extrudeYZAlongX(makeUpperFerruleWallShape(), 0.154, 0.176, {
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: 2,
    }),
    materials.parkerizedSteel
  );
  rearWall.name = 'RearUpperHandguardRetainer';
  gtGroup.add(rearWall);

  const rearLip = new THREE.Mesh(
    extrudeYZAlongX(makeUpperFerruleLipShape(), 0.172, 0.198, {
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
    materials.parkerizedSteel
  );
  gtGroup.add(rearLip);

  // 4c. Front upper-handguard steel retaining ferrule cap (X = +1.585 to +1.630, wall at X = +1.61)
  const frontWall = new THREE.Mesh(
    extrudeYZAlongX(makeUpperFerruleWallShape(), 1.606, 1.630, {
      bevelThickness: 0.005,
      bevelSize: 0.004,
      bevelSegments: 2,
    }),
    materials.parkerizedSteel
  );
  frontWall.name = 'FrontUpperHandguardRetainer';
  gtGroup.add(frontWall);

  const frontLip = new THREE.Mesh(
    extrudeYZAlongX(makeUpperFerruleLipShape(), 1.582, 1.610, {
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
    materials.parkerizedSteel
  );
  gtGroup.add(frontLip);

  // 4d. Classic longitudinal stamped guide ribs / flutes along gas tube
  // Positioned at ±48° and ±132° around cylinder so they frame the horizontal side vents cleanly
  const ribAngles = [0.84, -0.84, Math.PI - 0.84, -(Math.PI - 0.84)];
  const fwdRibGeom = new THREE.CapsuleGeometry(0.011, 0.58, 6, 12);
  fwdRibGeom.rotateZ(Math.PI / 2);

  const midRibGeom = new THREE.CapsuleGeometry(0.009, 1.32, 6, 10);
  midRibGeom.rotateZ(Math.PI / 2);

  for (const angle of ribAngles) {
    // Forward exposed flutes (X = +1.66 to +2.26)
    const fwdRib = new THREE.Mesh(fwdRibGeom, materials.parkerizedSteel);
    fwdRib.position.set(1.96, CY + 0.084 * Math.cos(angle), 0.084 * Math.sin(angle));
    gtGroup.add(fwdRib);

    // Mid-section piston guide ribs under upper handguard (visible in exploded view!)
    const midRib = new THREE.Mesh(midRibGeom, materials.parkerizedSteel);
    midRib.position.set(0.89, CY + 0.079 * Math.cos(angle), 0.079 * Math.sin(angle));
    gtGroup.add(midRib);
  }

  // Subtle top stamped longitudinal ridge on exposed forward tube
  const topSpineGeom = new THREE.CapsuleGeometry(0.009, 0.58, 6, 10);
  topSpineGeom.rotateZ(Math.PI / 2);
  topSpineGeom.scale(1.0, 0.65, 1.35);
  const topSpine = new THREE.Mesh(topSpineGeom, materials.parkerizedSteel);
  topSpine.position.set(1.96, CY + 0.089, 0);
  gtGroup.add(topSpine);

  // 4e. 4 Circular Dark Gas Relief Ports on EACH side (8 total)
  // Placed cleanly along exposed forward section at X = +1.76, +1.88, +2.00, +2.12
  const portXs = [1.76, 1.88, 2.00, 2.12];
  const portDarkGeom = new THREE.CylinderGeometry(0.0175, 0.0175, 0.008, 20);
  portDarkGeom.rotateX(Math.PI / 2);

  const portBezelGeom = new THREE.TorusGeometry(0.019, 0.0036, 10, 24);

  for (const px of portXs) {
    for (const side of [-1, 1]) {
      // Recessed dark steel circular vent hole
      const portHole = new THREE.Mesh(portDarkGeom, materials.darkSteel);
      portHole.position.set(px, CY, side * 0.0885);
      gtGroup.add(portHole);

      // Subtle machined chamfer rim around each drilled gas relief port
      const bezel = new THREE.Mesh(portBezelGeom, materials.bluedSteel);
      bezel.position.set(px, CY, side * 0.0902);
      gtGroup.add(bezel);
    }
  }

  return gtGroup;
}

// ---------------------------------------------------------------------------
// 5. Front Sight Base (FSB) Tower & Protective Open-Top Hood (parts.frontSight)
// ---------------------------------------------------------------------------

/**
 * Custom smooth tapered & scalloped forged tower BufferGeometry (Y = 0.07 to 0.435).
 * Tapers cleanly in Z from ~0.145 at barrel sleeve to ~0.104 at windage drum boss,
 * with authentic concave rear sweep, steeper front spine, and subtle forged side hollows.
 */
function createFrontSightTowerGeometry() {
  const yMin = 0.068;
  const yMax = 0.425;
  const ySteps = 18;
  const ringSegs = 32;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iy = 0; iy <= ySteps; iy++) {
    const t = iy / ySteps;
    const y = yMin + (yMax - yMin) * t;

    // Iconic swept AK-47 FSB tower X silhouette:
    // Rear sweeps gracefully forward; front rises steeper with slight cant
    const xRear = 3.590 + 0.125 * Math.pow(t, 0.82);
    const xFront = 3.930 - 0.082 * Math.pow(t, 1.15);
    const cx = (xRear + xFront) * 0.5;
    const rx = (xFront - xRear) * 0.5;

    // Z half-thickness tapers from 0.074 near barrel up to 0.052 at windage boss
    const baseHalfZ = 0.074 - 0.022 * t;

    // Forged side lightening scallop intensity peaks mid-height of tower
    const scallopEnv = Math.sin(Math.PI * Math.max(0, Math.min(1, (t - 0.12) / 0.72)));

    for (let ir = 0; ir <= ringSegs; ir++) {
      const u = ir / ringSegs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);

      // Slightly squared stadium/forged cross-section (superellipse power 0.78)
      const signC = Math.sign(ca);
      const signS = Math.sign(sa);
      const xLocal = signC * Math.pow(Math.abs(ca), 0.72) * rx;
      let zLocal = signS * Math.pow(Math.abs(sa), 0.65) * baseHalfZ;

      // Subtle forged lightening flute indented along mid-web (where |ca| < 0.72)
      const sideFactor = Math.max(0, 1 - (ca * ca) / 0.52);
      const indent = 0.013 * scallopEnv * sideFactor * sideFactor;
      zLocal -= signS * indent;

      positions.push(cx + xLocal, y, zLocal);
      uvs.push(u, t);
    }
  }

  const stride = ringSegs + 1;
  for (let iy = 0; iy < ySteps; iy++) {
    for (let ir = 0; ir < ringSegs; ir++) {
      const a = iy * stride + ir;
      const b = (iy + 1) * stride + ir;
      const c = iy * stride + (ir + 1);
      const d = (iy + 1) * stride + (ir + 1);
      // Outward winding verified: (+dt) x (+da) points outward
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  // Cap top and bottom faces (buried inside barrel sleeve & windage boss, keeps manifold closed)
  const botCenterIdx = positions.length / 3;
  positions.push(3.76, yMin, 0);
  uvs.push(0.5, 0);
  for (let ir = 0; ir < ringSegs; ir++) {
    indices.push(botCenterIdx, ir, ir + 1);
  }

  const topCenterIdx = positions.length / 3;
  positions.push(3.78, yMax, 0);
  uvs.push(0.5, 1);
  const topStart = ySteps * stride;
  for (let ir = 0; ir < ringSegs; ir++) {
    indices.push(topCenterIdx, topStart + ir + 1, topStart + ir);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildFrontSight(materials) {
  const fsbGroup = new THREE.Group();
  fsbGroup.name = 'FrontSightBase';

  // 5a. Barrel sleeve (X = +3.56 to +3.96, Y = 0)
  // Radius steps down slightly at X = 3.74 to leave crisp clearance above cleaning rod head
  const sleeveGeom = createLatheAlongX([
    [3.560, 0.084],
    [3.582, 0.104],
    [3.730, 0.104],
    [3.742, 0.100],
    [3.950, 0.100],
    [3.960, 0.093],
    [3.960, 0.076],
  ], 44);
  const sleeveMesh = new THREE.Mesh(sleeveGeom, materials.parkerizedSteel);
  sleeveMesh.name = 'FSBBarrelSleeve';
  fsbGroup.add(sleeveMesh);

  // Lower pin-boss cheek & two horizontal cross-pins
  const fsbPinBossShape = new THREE.Shape();
  fsbPinBossShape.moveTo(3.595, -0.025);
  fsbPinBossShape.lineTo(3.925, -0.025);
  fsbPinBossShape.lineTo(3.915, -0.100);
  fsbPinBossShape.lineTo(3.605, -0.100);
  fsbPinBossShape.closePath();

  const fsbPinBossGeom = extrudeXYCenteredZ(fsbPinBossShape, 0.194, {
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  fsbGroup.add(new THREE.Mesh(fsbPinBossGeom, materials.parkerizedSteel));

  fsbGroup.add(createCrossPinMesh(3.655, -0.080, 0.204, 0.0155, materials.bluedSteel));
  fsbGroup.add(createCrossPinMesh(3.855, -0.080, 0.204, 0.0155, materials.bluedSteel));

  // 5b. Spring-loaded Muzzle Detent Plunger & Housing at (X = +3.96, Y = +0.098, Z = 0)
  const detentBossGeom = createLatheAlongX([
    [3.820, 0.026],
    [3.952, 0.026],
    [3.960, 0.022],
    [3.960, 0.014],
  ], 24);
  const detentBoss = new THREE.Mesh(detentBossGeom, materials.parkerizedSteel);
  detentBoss.position.set(0, 0.098, 0);
  fsbGroup.add(detentBoss);

  const detentPinGeom = createLatheAlongX([
    [3.930, 0.0145],
    [3.996, 0.0145],
    [4.004, 0.0115],
    [4.006, 0.0010],
  ], 20);
  const detentPin = new THREE.Mesh(detentPinGeom, materials.polishedSteel);
  detentPin.position.set(0, 0.098, 0);
  detentPin.name = 'MuzzleDetentPlunger';
  fsbGroup.add(detentPin);

  // 5c. Under-barrel Cleaning Rod Lug at X = +3.66, Y = -0.155
  // Genuine circular pass-through bore at (Y = -0.148, Z = 0, r = 0.0285)
  const rodLugShape = new THREE.Shape();
  rodLugShape.moveTo(0.056, -0.075);
  rodLugShape.lineTo(0.052, -0.148);
  rodLugShape.absarc(0, -0.148, 0.052, 0, -Math.PI, true);
  rodLugShape.lineTo(-0.056, -0.075);
  rodLugShape.closePath();

  const fsbRodHole = new THREE.Path();
  fsbRodHole.absarc(0, -0.148, 0.0285, 0, Math.PI * 2, true);
  rodLugShape.holes.push(fsbRodHole);

  const rodLugGeom = extrudeYZAlongX(rodLugShape, 3.595, 3.715, {
    bevelThickness: 0.006,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  const rodLugMesh = new THREE.Mesh(rodLugGeom, materials.parkerizedSteel);
  rodLugMesh.name = 'FSBCleaningRodLug';
  fsbGroup.add(rodLugMesh);

  // 5d. Iconic Swept Tapered Trapezoid Steel Tower (Y = 0.07 to 0.43)
  const towerMesh = new THREE.Mesh(createFrontSightTowerGeometry(), materials.parkerizedSteel);
  towerMesh.name = 'FSBTower';
  fsbGroup.add(towerMesh);

  // 5e. Horizontal Windage Drum Housing Boss & Windage Drum (X = +3.78, Y = +0.42)
  // Positioned so top stays cleanly below Y = 0.456, leaving full unobstructed sight window!
  const drumBossGeom = new THREE.CylinderGeometry(0.046, 0.046, 0.122, 28);
  drumBossGeom.rotateX(Math.PI / 2);
  const drumBoss = new THREE.Mesh(drumBossGeom, materials.parkerizedSteel);
  drumBoss.position.set(3.78, 0.410, 0);
  fsbGroup.add(drumBoss);

  // Windage adjustment drum protruding cleanly from boss sides (Z axis at Y = +0.42)
  const drumPts = [
    new THREE.Vector2(0.0005, -0.088),
    new THREE.Vector2(0.029, -0.088),
    new THREE.Vector2(0.034, -0.082),
    new THREE.Vector2(0.034, 0.082),
    new THREE.Vector2(0.029, 0.088),
    new THREE.Vector2(0.0005, 0.088),
  ];
  const windageDrumGeom = new THREE.LatheGeometry(drumPts, 28);
  windageDrumGeom.rotateX(Math.PI / 2);
  windageDrumGeom.computeVertexNormals();
  const windageDrum = new THREE.Mesh(windageDrumGeom, materials.bluedSteel);
  windageDrum.position.set(3.78, 0.42, 0);
  windageDrum.name = 'FrontSightWindageDrum';
  fsbGroup.add(windageDrum);

  // 5f. Iconic Protective Semi-Open Circular Sight Hood (Open-Top AK-47 Ears!)
  // Center: (X = +3.78, Y = +0.52, Z = 0), outer radius = 0.125, inner radius = 0.095
  const hoodCY = 0.52;
  const rOut = 0.125;
  const rIn = 0.095;
  const rMid = (rOut + rIn) * 0.5;
  const rTip = (rOut - rIn) * 0.5; // 0.015 semicircular rounded ear tips
  const gapHalfAngle = 0.46; // ~26.4 deg open top gap at crown (+Y)

  // Author in 2D (u = Z, v = Y), angles measured from +u (standard atan2):
  // Top crown (+Y) is PI/2. Right tip sits at (PI/2 - gapHalfAngle);
  // Left tip sits at (PI/2 + gapHalfAngle).
  const aRightTip = Math.PI / 2 - gapHalfAngle;
  const aLeftTip = Math.PI / 2 + gapHalfAngle;

  const hoodShape = new THREE.Shape();
  // Sweep CW around outer circle: right tip -> right -> bottom -> left -> left tip
  hoodShape.absarc(0, hoodCY, rOut, aRightTip, aLeftTip - Math.PI * 2, true);
  // Rounded semicircular cap at left ear tip bulging UPWARD toward open crown (CW: aLeftTip -> aLeftTip - PI)
  hoodShape.absarc(
    rMid * Math.cos(aLeftTip),
    hoodCY + rMid * Math.sin(aLeftTip),
    rTip,
    aLeftTip,
    aLeftTip - Math.PI,
    true
  );
  // Sweep CCW back along inner circle: left tip -> left -> bottom -> right -> right tip
  hoodShape.absarc(0, hoodCY, rIn, aLeftTip - Math.PI * 2, aRightTip, false);
  // Rounded semicircular cap at right ear tip bulging UPWARD toward open crown (CW: aRightTip + PI -> aRightTip)
  hoodShape.absarc(
    rMid * Math.cos(aRightTip),
    hoodCY + rMid * Math.sin(aRightTip),
    rTip,
    aRightTip + Math.PI,
    aRightTip,
    true
  );
  hoodShape.closePath();

  const hoodGeom = extrudeYZAlongX(hoodShape, 3.708, 3.852, {
    bevelThickness: 0.007,
    bevelSize: 0.004,
    bevelSegments: 3,
  }, 40);
  const hoodMesh = new THREE.Mesh(hoodGeom, materials.parkerizedSteel);
  hoodMesh.name = 'FrontSightProtectiveHood';
  fsbGroup.add(hoodMesh);

  // 5g. Crisp Vertical Front Sight Post (Z = 0, rising from windage drum to exact tip Y = +0.505)
  const postProfile = [
    new THREE.Vector2(0.016, 0.445), // Threaded base boss seated cleanly into windage drum
    new THREE.Vector2(0.016, 0.456),
    new THREE.Vector2(0.012, 0.460), // Tapered shoulder
    new THREE.Vector2(0.0092, 0.464),
    new THREE.Vector2(0.0092, 0.5038), // Crisp slender vertical sight post
    new THREE.Vector2(0.0080, 0.5050), // Exact flat-top sight tip at Y = +0.505
    new THREE.Vector2(0.0005, 0.5050),
  ];
  const postGeom = new THREE.LatheGeometry(postProfile, 24);
  postGeom.computeVertexNormals();
  const postMesh = new THREE.Mesh(postGeom, materials.darkSteel);
  postMesh.position.set(3.78, 0, 0);
  postMesh.name = 'FrontSightPost';
  fsbGroup.add(postMesh);

  return fsbGroup;
}

// ---------------------------------------------------------------------------
// 6. Iconic AKM Beveled Slant Muzzle Compensator (parts.muzzleBrake)
// ---------------------------------------------------------------------------

/**
 * Build a precision-machined, closed-manifold AKM slant muzzle compensator
 * with rear detent locking notch, rear knurled grip ring, 40.5° diagonal
 * upper-right bevel cut, crisp chamfered crown edges, and deep hollow bore.
 *
 * Uses duplicated vertices along hard crease boundaries so beveled facets
 * reflect razor-sharp metallic highlights.
 */
function createSlantCompensatorGeometry() {
  const segs = 64;
  const rOut = 0.098;
  const rInFront = 0.064;
  const rInThread = 0.070;
  const slantAngle = 0.42; // ~24 deg clockwise toward top-right (+Z from +Y)
  const xSlantMid = 4.245;
  const slantSlope = 0.115 / rOut; // Gives X = 4.130 at top-right, 4.360 at bottom-left

  // Evaluate rear rim X with iconic milled 12-o'clock detent notch (mating FSB detent plunger)
  function rearX(phi) {
    // Wrap phi to [-PI, PI] around top (+Y, phi = 0)
    let d = phi % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    const ad = Math.abs(d);
    const notchHalf = 0.19;
    const wallBlend = 0.05;
    if (ad <= notchHalf) return 4.006;
    if (ad < notchHalf + wallBlend) {
      const s = (ad - notchHalf) / wallBlend;
      const smooth = s * s * (3 - 2 * s);
      return 4.006 - 0.046 * smooth;
    }
    return 3.960;
  }

  // Evaluate front diagonal cut plane X(r, phi)
  function slantX(r, phi) {
    return xSlantMid - slantSlope * r * Math.cos(phi - slantAngle);
  }

  // Subtle knurled grip modulation around rear collar (32 crisp ridges)
  function knurlDelta(phi) {
    return 0.0018 * Math.cos(phi * 32);
  }

  // Define sequential ring bands; each band is a pair of stations [startFn, endFn]
  // Sharing vertices within smooth curved bands, splitting vertices at crisp edges!
  const bands = [
    // 1. Rear face annulus (inner thread -> outer rear chamfer)
    {
      rings: [
        (phi) => [rearX(phi), rInThread],
        (phi) => [rearX(phi), rOut - 0.005],
      ],
    },
    // 2. Rear outer bevel chamfer
    {
      rings: [
        (phi) => [rearX(phi), rOut - 0.005],
        (phi) => [rearX(phi) + 0.006, rOut],
      ],
    },
    // 3. Rear cylindrical collar up to knurl ring
    {
      rings: [
        (phi) => [rearX(phi) + 0.006, rOut],
        (phi) => [4.014, rOut],
      ],
    },
    // 4. Knurled rear grip collar (X = 4.014 to 4.056)
    {
      rings: [
        (phi) => [4.014, rOut],
        (phi) => [4.019, rOut + knurlDelta(phi)],
        (phi) => [4.051, rOut + knurlDelta(phi)],
        (phi) => [4.056, rOut],
      ],
    },
    // 5. Recessed machined identification groove (X = 4.056 to 4.072)
    {
      rings: [
        (phi) => [4.056, rOut],
        (phi) => [4.060, rOut - 0.0045],
        (phi) => [4.068, rOut - 0.0045],
        (phi) => [4.072, rOut],
      ],
    },
    // 6. Main forward cylindrical body up to outer slant chamfer
    {
      rings: [
        (phi) => [4.072, rOut],
        (phi) => [slantX(rOut, phi) - 0.005, rOut],
      ],
    },
    // 7. Outer slant crown chamfer bevel
    {
      rings: [
        (phi) => [slantX(rOut, phi) - 0.005, rOut],
        (phi) => [slantX(rOut - 0.005, phi), rOut - 0.005],
      ],
    },
    // 8. Machined diagonal slant front face (rOut-0.005 -> rInFront+0.005)
    {
      rings: [
        (phi) => [slantX(rOut - 0.005, phi), rOut - 0.005],
        (phi) => [slantX(rInFront + 0.005, phi), rInFront + 0.005],
      ],
    },
    // 9. Inner muzzle crown chamfer bevel
    {
      rings: [
        (phi) => [slantX(rInFront + 0.005, phi), rInFront + 0.005],
        (phi) => [slantX(rInFront, phi) - 0.005, rInFront],
      ],
    },
    // 10. Hollow inner spoon / expansion chamber wall receding back to X = 4.105
    {
      rings: [
        (phi) => [slantX(rInFront, phi) - 0.005, rInFront],
        (phi) => [4.105, rInFront],
      ],
    },
    // 11. Internal step out to threaded mounting socket (X = 4.105 back to rearX)
    {
      rings: [
        (phi) => [4.105, rInFront],
        (phi) => [4.102, rInThread],
        (phi) => [rearX(phi), rInThread],
      ],
    },
  ];

  const positions = [];
  const uvs = [];
  const indices = [];
  let vOffset = 0;

  for (const band of bands) {
    const m = band.rings.length;
    const stride = segs + 1;
    for (let s = 0; s < m; s++) {
      const fn = band.rings[s];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const phi = u * Math.PI * 2;
        const [x, r] = fn(phi);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi);
        positions.push(x, y, z);
        uvs.push(u, (x - 3.96) / 0.40);
      }
    }
    for (let s = 0; s < m - 1; s++) {
      for (let i = 0; i < segs; i++) {
        const a = vOffset + s * stride + i;
        const b = vOffset + s * stride + (i + 1);
        const c = vOffset + (s + 1) * stride + i;
        const d = vOffset + (s + 1) * stride + (i + 1);
        // Verified outward winding: (+dPhi) x (+ds)
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
    vOffset += m * stride;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function buildMuzzleBrake(materials) {
  const brakeGroup = new THREE.Group();
  brakeGroup.name = 'MuzzleCompensator';
  brakeGroup.userData.explodeOffset = new THREE.Vector3(0.85, 0, 0);

  // Main sculpted AKM slant compensator body
  const bodyMesh = new THREE.Mesh(createSlantCompensatorGeometry(), materials.parkerizedSteel);
  bodyMesh.name = 'AKMSlantBrakeBody';
  brakeGroup.add(bodyMesh);

  // Carbon-darkened recessed inner baffle throat & dark bore collar inside the compensator
  // Ensures looking straight down the muzzle shows deep pitch-dark machined throat!
  const throatGeom = createLatheAlongX([
    [4.122, 0.0628],
    [4.122, 0.0445], // Machined inner muzzle baffle shoulder
    [4.115, 0.0425],
    [4.095, 0.0425],
    [4.090, 0.0685], // Inner thread recess wall (visible from rear when exploded)
    [3.964, 0.0685],
  ], 40);
  const throatMesh = new THREE.Mesh(throatGeom, materials.darkSteel);
  throatMesh.name = 'MuzzleBrakeInnerThroat';
  brakeGroup.add(throatMesh);

  return brakeGroup;
}

// ---------------------------------------------------------------------------
// 7. Under-Barrel Cleaning Rod with Slotted Head & See-Through Hole
// ---------------------------------------------------------------------------

/**
 * Create a curved cylindrical cleaning-rod head section around X = [x0 - halfLen, x0 + halfLen]
 * with a genuine see-through circular transverse hole along the Z axis!
 * Returns { outerGeom, holeTunnelGeom }.
 */
function createDrilledRodHeadSection(x0, halfLen, R, rHole) {
  const edgeSegs = 8; // 8 segments per side of perimeter -> 32 segments around hole
  const M = edgeSegs * 4;
  const thetaPatch = 0.66; // Angular half-span of each ±Z patch around the ±Z equators

  // Perimeter points around the rectangular patch in (dx, theta) space, ordered CCW
  // when viewed from +Z (where +X is right, +Y / +theta is up).
  const patchPerimeter = [];
  // Right edge (dx = +halfLen, theta: -thetaPatch -> +thetaPatch)
  for (let i = 0; i < edgeSegs; i++) {
    const f = i / edgeSegs;
    patchPerimeter.push([halfLen, -thetaPatch + 2 * thetaPatch * f]);
  }
  // Top edge (dx: +halfLen -> -halfLen, theta = +thetaPatch)
  for (let i = 0; i < edgeSegs; i++) {
    const f = i / edgeSegs;
    patchPerimeter.push([halfLen - 2 * halfLen * f, thetaPatch]);
  }
  // Left edge (dx = -halfLen, theta: +thetaPatch -> -thetaPatch)
  for (let i = 0; i < edgeSegs; i++) {
    const f = i / edgeSegs;
    patchPerimeter.push([-halfLen, thetaPatch - 2 * thetaPatch * f]);
  }
  // Bottom edge (dx: -halfLen -> +halfLen, theta = -thetaPatch)
  for (let i = 0; i < edgeSegs; i++) {
    const f = i / edgeSegs;
    patchPerimeter.push([-halfLen + 2 * halfLen * f, -thetaPatch]);
  }

  // Corresponding CCW angles around the circular hole aligned with perimeter directions
  const holeRimPts = [];
  for (let k = 0; k < M; k++) {
    const [dxOut, thOut] = patchPerimeter[k];
    const yOut = R * Math.sin(thOut);
    const alpha = Math.atan2(yOut, dxOut);
    const hx = x0 + rHole * Math.cos(alpha);
    const hy = rHole * Math.sin(alpha);
    const hz = Math.sqrt(Math.max(1e-6, R * R - hy * hy));
    holeRimPts.push([hx, hy, hz]);
  }

  const outPos = [];
  const outUV = [];
  const outIdx = [];

  // Helper to append one curved ±Z face patch connecting hole rim -> mid ring -> perimeter
  function addSidePatch(signZ) {
    const rings = 3; // 0 = hole rim, 1 = smooth intermediate ring, 2 = outer perimeter
    const base = outPos.length / 3;
    for (let rIdx = 0; rIdx < rings; rIdx++) {
      const blend = rIdx / (rings - 1);
      for (let k = 0; k < M; k++) {
        const [hx, hy] = holeRimPts[k];
        const [dxOut, thOut] = patchPerimeter[k];
        const ox = x0 + dxOut;
        const oy = R * Math.sin(thOut);
        const x = hx + (ox - hx) * blend;
        const y = hy + (oy - hy) * blend;
        const z = signZ * Math.sqrt(Math.max(1e-6, R * R - y * y));
        outPos.push(x, y, z);
        outUV.push((x - (x0 - halfLen)) / (2 * halfLen), (y + R) / (2 * R));
      }
    }
    for (let rIdx = 0; rIdx < rings - 1; rIdx++) {
      for (let k = 0; k < M; k++) {
        const kn = (k + 1) % M;
        const a = base + rIdx * M + k;
        const b = base + rIdx * M + kn;
        const c = base + (rIdx + 1) * M + k;
        const d = base + (rIdx + 1) * M + kn;
        if (signZ > 0) {
          outIdx.push(a, c, d, a, d, b);
        } else {
          outIdx.push(a, d, c, a, b, d);
        }
      }
    }
  }

  addSidePatch(+1);
  addSidePatch(-1);

  // Add top and bottom curved cylinder strips connecting the +Z and -Z patches seamlessly
  function addBridgeStrip(phiStart, phiEnd) {
    const phiSteps = 10;
    const base = outPos.length / 3;
    const stride = edgeSegs + 1;
    for (let ip = 0; ip <= phiSteps; ip++) {
      const fp = ip / phiSteps;
      const phi = phiStart + (phiEnd - phiStart) * fp;
      const y = R * Math.cos(phi);
      const z = R * Math.sin(phi);
      for (let ix = 0; ix <= edgeSegs; ix++) {
        const fx = ix / edgeSegs;
        const x = (x0 - halfLen) + 2 * halfLen * fx;
        outPos.push(x, y, z);
        outUV.push(fx, fp);
      }
    }
    for (let ip = 0; ip < phiSteps; ip++) {
      for (let ix = 0; ix < edgeSegs; ix++) {
        const a = base + ip * stride + ix;
        const b = base + ip * stride + (ix + 1);
        const c = base + (ip + 1) * stride + ix;
        const d = base + (ip + 1) * stride + (ix + 1);
        // Verified outward winding: (+dPhi) x (+dx)
        outIdx.push(a, c, b, b, c, d);
      }
    }
  }

  // Note: phi = 0 is +Y, phi = PI/2 is +Z, phi = PI is -Y, phi = 3*PI/2 is -Z
  // +Z patch covers phi in [PI/2 - thetaPatch, PI/2 + thetaPatch]
  // -Z patch covers phi in [3*PI/2 - thetaPatch, 3*PI/2 + thetaPatch]
  // Top strip bridges -Z top edge -> +Y crown -> +Z top edge
  addBridgeStrip(-(Math.PI / 2 - thetaPatch), Math.PI / 2 - thetaPatch);
  // Bottom strip bridges +Z bottom edge -> -Y belly -> -Z bottom edge
  addBridgeStrip(Math.PI / 2 + thetaPatch, (3 * Math.PI) / 2 - thetaPatch);

  const outerGeom = new THREE.BufferGeometry();
  outerGeom.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
  outerGeom.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2));
  outerGeom.setIndex(outIdx);
  outerGeom.computeVertexNormals();

  // Inner transverse bore tunnel (inward-facing normals bridging +Z rim to -Z rim)
  const tunPos = [];
  const tunUV = [];
  const tunIdx = [];
  for (let k = 0; k < M; k++) {
    const [hx, hy, hz] = holeRimPts[k];
    tunPos.push(hx, hy, hz);
    tunUV.push(k / M, 0);
  }
  for (let k = 0; k < M; k++) {
    const [hx, hy, hz] = holeRimPts[k];
    tunPos.push(hx, hy, -hz);
    tunUV.push(k / M, 1);
  }
  for (let k = 0; k < M; k++) {
    const kn = (k + 1) % M;
    const p0 = k;
    const p1 = kn;
    const n0 = M + k;
    const n1 = M + kn;
    // Verified inward-facing bore normals
    tunIdx.push(p0, p1, n1, p0, n1, n0);
  }

  const holeTunnelGeom = new THREE.BufferGeometry();
  holeTunnelGeom.setAttribute('position', new THREE.Float32BufferAttribute(tunPos, 3));
  holeTunnelGeom.setAttribute('uv', new THREE.Float32BufferAttribute(tunUV, 2));
  holeTunnelGeom.setIndex(tunIdx);
  holeTunnelGeom.computeVertexNormals();

  return { outerGeom, holeTunnelGeom };
}

function buildCleaningRod(materials) {
  const rodGroup = new THREE.Group();
  rodGroup.name = 'CleaningRod';
  rodGroup.userData.explodeOffset = new THREE.Vector3(1.20, -0.45, 0);

  const RY = -0.148;
  const headR = 0.042;
  const holeX = 3.785;
  const holeHalfLen = 0.028;

  // 7a. Main straight steel shaft from X = +0.35 (inside lower handguard channel)
  // through gas block lug & FSB lug up to the enlarged head rear section (X = 3.757)
  const shaftProfile = [
    [0.350, 0.001],
    [0.350, 0.015], // Rear threaded cleaning-jag end (visible when exploded)
    [0.358, 0.018],
  ];
  // Subtle rear M5 thread ribs
  for (let i = 0; i < 6; i++) {
    const tx = 0.362 + i * 0.010;
    shaftProfile.push([tx, 0.0155], [tx + 0.005, 0.0188], [tx + 0.009, 0.0155]);
  }
  shaftProfile.push(
    [0.425, 0.017],
    [0.435, 0.022], // Main straight rod shaft (r = 0.022)
    [3.706, 0.022],
    [3.714, 0.028], // Smooth flared neck ahead of FSB cleaning rod lug
    [3.726, headR], // Enlarged cylindrical head starts (X = 3.72..3.86, length = 0.14)
    [holeX - holeHalfLen, headR],
  );

  const shaftMesh = new THREE.Mesh(createLatheAlongX(shaftProfile, 28), materials.bluedSteel);
  shaftMesh.position.set(0, RY, 0);
  shaftMesh.name = 'CleaningRodShaft';
  rodGroup.add(shaftMesh);

  // 7b. Central head section with genuine see-through transverse Z hole (X = 3.757 to 3.813)
  const { outerGeom, holeTunnelGeom } = createDrilledRodHeadSection(holeX, holeHalfLen, headR, 0.0145);

  const headMidMesh = new THREE.Mesh(outerGeom, materials.parkerizedSteel);
  headMidMesh.position.set(0, RY, 0);
  headMidMesh.name = 'CleaningRodHeadDrilled';
  rodGroup.add(headMidMesh);

  const headHoleWall = new THREE.Mesh(holeTunnelGeom, materials.darkSteel);
  headHoleWall.position.set(0, RY, 0);
  rodGroup.add(headHoleWall);

  // 7c. Front slotted bullet nose of cleaning rod head (X = 3.813 to 3.860)
  const noseProfile = [
    [holeX + holeHalfLen, headR],
    [3.836, headR],
    [3.848, 0.036],
    [3.857, 0.024],
    [3.860, 0.012],
    [3.860, 0.001],
  ];
  const noseMesh = new THREE.Mesh(createLatheAlongX(noseProfile, 28), materials.parkerizedSteel);
  noseMesh.position.set(0, RY, 0);
  noseMesh.name = 'CleaningRodHeadNose';
  rodGroup.add(noseMesh);

  // Iconic machined cleaning-patch slot recessed cleanly across the bullet-nose tip
  const slotMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.022, 0.007),
    materials.darkSteel
  );
  slotMesh.position.set(3.854, RY, 0);
  rodGroup.add(slotMesh);

  return rodGroup;
}

// ---------------------------------------------------------------------------
// Public Builder Export
// ---------------------------------------------------------------------------

/**
 * Build the complete AK-47 Barrel, Gas System, Front Sight Tower,
 * Muzzle Compensator, Handguard Retainer & Cleaning Rod assembly.
 *
 * @param {object} materials - Material bundle from src/materials.js
 * @returns {{
 *   group: THREE.Group,
 *   parts: {
 *     barrelAssembly: THREE.Group,
 *     muzzleBrake: THREE.Group,
 *     gasTube: THREE.Group,
 *     cleaningRod: THREE.Group,
 *     frontSight: THREE.Group
 *   }
 * }}
 */
export function buildBarrel(materials) {
  const group = new THREE.Group();
  group.name = 'AK47BarrelSystem';

  // Fixed barrel assembly: stepped barrel + front handguard retainer/sling loop + 45° gas block
  const barrelAssembly = new THREE.Group();
  barrelAssembly.name = 'BarrelAssembly';
  barrelAssembly.add(buildMainBarrel(materials));
  barrelAssembly.add(buildHandguardRetainer(materials));
  barrelAssembly.add(buildGasBlock(materials));

  // Sub-assemblies (explodable parts carry userData.explodeOffset)
  const muzzleBrake = buildMuzzleBrake(materials);
  const gasTube = buildGasTube(materials);
  const cleaningRod = buildCleaningRod(materials);
  const frontSight = buildFrontSight(materials);

  group.add(barrelAssembly, muzzleBrake, gasTube, cleaningRod, frontSight);

  enableShadows(group);

  return {
    group,
    parts: {
      barrelAssembly,
      muzzleBrake,
      gasTube,
      cleaningRod,
      frontSight,
    },
  };
}
