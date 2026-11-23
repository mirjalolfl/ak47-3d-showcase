import * as THREE from 'three';

/**
 * Procedurally sculpts the AK-47 Type 3 / AKM laminated birch wood furniture
 * (buttstock, lower handguard, upper handguard) and contoured checkered pistol grip.
 *
 * Coordinate contract (1 unit = 100 mm; 0.01 = 1 mm):
 *  +X = muzzle, -X = buttstock, +Y = up, +Z = right side, -Z = left side
 *  Origin (0, 0, 0) = bore centerline at the front face of the receiver.
 */

// ---------------------------------------------------------------------------
// Utility math & spline helpers
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Evaluate a piecewise smooth cubic Hermite (Catmull-Rom-like monotonic-safe)
 * 1D curve defined by sorted [x, y] control points.
 */
function sampleCurve(points, x) {
  const n = points.length;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];

  let i = 0;
  while (i < n - 2 && x > points[i + 1][0]) i++;

  const [x0, y0] = points[i];
  const [x1, y1] = points[i + 1];
  const dx = x1 - x0;
  const t = (x - x0) / dx;

  // Finite-difference Fritsch-Carlson monotonic tangents to avoid spline overshoot
  const secant = (k) => (points[k + 1][1] - points[k][1]) / (points[k + 1][0] - points[k][0]);
  const dCurr = secant(i);

  let m0 = dCurr;
  if (i > 0) {
    const dPrev = secant(i - 1);
    m0 = dPrev * dCurr <= 0 ? 0 : (dPrev + dCurr) * 0.5;
  }

  let m1 = dCurr;
  if (i < n - 2) {
    const dNext = secant(i + 1);
    m1 = dCurr * dNext <= 0 ? 0 : (dCurr + dNext) * 0.5;
  }

  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * y0 + h10 * dx * m0 + h01 * y1 + h11 * dx * m1;
}

/**
 * Signed superellipse power helper: sign(v) * |v|^p
 */
function spow(v, p) {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

/**
 * Enable castShadow and receiveShadow recursively on an Object3D tree.
 */
function enableShadows(obj) {
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Bulletproof Lofted BufferGeometry Builder (outward winding + seamless seam)
// ---------------------------------------------------------------------------

/**
 * Build a smooth lofted BufferGeometry from an array of closed cross-section rings.
 *
 * Each ring is an array of `N + 1` vertices `{ x, y, z, u, v }` where index `N`
 * duplicates index `0`'s `(x, y, z)` position for clean UV wrapping across the seam.
 *
 * Automatically determines exact outward triangle winding via 2D signed shoelace area
 * in the plane perpendicular to the loft direction (works for BOTH convex and non-convex
 * profiles like U-cradles and arches!), averages normals across the UV seam, and optionally
 * adds crisp ear-clipped planar end caps (handling non-convex caps cleanly!).
 */
function buildLoftGeometry(rings, options = {}) {
  const {
    capStart = true,
    capEnd = true,
    smoothSeam = true,
    capUVScale = 1.0,
    capUVMode = 'yz', // 'yz' (for X-axis lofts) or 'xz' (for Y-axis lofts)
  } = options;

  const numStations = rings.length;
  const ringStride = rings[0].length; // N + 1 (index N duplicates index 0)
  const uniqueCount = ringStride - 1;

  // Determine loft forward tangent T_i at mid-loft
  const midIdx = Math.floor((numStations - 1) / 2);
  const ringCentroid = (ring) => {
    const c = new THREE.Vector3();
    for (let j = 0; j < uniqueCount; j++) {
      c.x += ring[j].x;
      c.y += ring[j].y;
      c.z += ring[j].z;
    }
    return c.divideScalar(uniqueCount);
  };

  const cMid0 = ringCentroid(rings[midIdx]);
  const cMid1 = ringCentroid(rings[midIdx + 1]);
  const loftDir = new THREE.Vector3().subVectors(cMid1, cMid0).normalize();

  // Build right-handed orthonormal basis (e1, e2, loftDir) with e1 x e2 = loftDir
  const ref = Math.abs(loftDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(ref, loftDir).normalize();
  const e2 = new THREE.Vector3().crossVectors(loftDir, e1).normalize();

  // Signed 2D area of mid-ring projected into (e1, e2)
  let signedArea = 0;
  const midRing = rings[midIdx];
  for (let j = 0; j < uniqueCount; j++) {
    const pA = midRing[j];
    const pB = midRing[(j + 1) % uniqueCount];
    const ax = (pA.x - cMid0.x) * e1.x + (pA.y - cMid0.y) * e1.y + (pA.z - cMid0.z) * e1.z;
    const ay = (pA.x - cMid0.x) * e2.x + (pA.y - cMid0.y) * e2.y + (pA.z - cMid0.z) * e2.z;
    const bx = (pB.x - cMid0.x) * e1.x + (pB.y - cMid0.y) * e1.y + (pB.z - cMid0.z) * e1.z;
    const by = (pB.x - cMid0.x) * e2.x + (pB.y - cMid0.y) * e2.y + (pB.z - cMid0.z) * e2.z;
    signedArea += ax * by - bx * ay;
  }
  // If signedArea > 0, ring is CCW in (e1, e2), so outward normal = T_j x T_i -> wind (a, d, c), (a, c, b)
  // If signedArea < 0, ring is CW in (e1, e2), so outward normal = T_i x T_j -> wind (a, b, c), (a, c, d)
  const ccwInBasis = signedArea > 0;

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i < numStations; i++) {
    const ring = rings[i];
    for (let j = 0; j < ringStride; j++) {
      const p = ring[j];
      positions.push(p.x, p.y, p.z);
      uvs.push(p.u, p.v);
    }
  }

  for (let i = 0; i < numStations - 1; i++) {
    const row0 = i * ringStride;
    const row1 = (i + 1) * ringStride;
    for (let j = 0; j < uniqueCount; j++) {
      const a = row0 + j;
      const b = row1 + j;
      const c = row1 + j + 1;
      const d = row0 + j + 1;
      if (ccwInBasis) {
        indices.push(a, d, c, a, c, b);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  const sideVertCount = positions.length / 3;

  // Helper to append an ear-clipped planar cap (handles convex AND concave cross-sections!)
  const appendCap = (ring, desiredNormalDir) => {
    const baseIndex = positions.length / 3;
    const c = ringCentroid(ring);
    const nDir = desiredNormalDir.clone().normalize();

    const r = Math.abs(nDir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(r, nDir).normalize();
    const vAxis = new THREE.Vector3().crossVectors(nDir, uAxis).normalize();

    const contour2D = [];
    for (let j = 0; j < uniqueCount; j++) {
      const p = ring[j];
      positions.push(p.x, p.y, p.z);
      if (capUVMode === 'xz') {
        uvs.push(p.x * capUVScale, p.z * capUVScale);
      } else {
        uvs.push(p.z * capUVScale, p.y * capUVScale);
      }
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dz = p.z - c.z;
      contour2D.push(
        new THREE.Vector2(
          dx * uAxis.x + dy * uAxis.y + dz * uAxis.z,
          dx * vAxis.x + dy * vAxis.y + dz * vAxis.z
        )
      );
    }

    const faces = THREE.ShapeUtils.triangulateShape(contour2D, []);
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const eAB = new THREE.Vector3();
    const eAC = new THREE.Vector3();
    const triN = new THREE.Vector3();

    for (const [f0, f1, f2] of faces) {
      const i0 = baseIndex + f0;
      const i1 = baseIndex + f1;
      const i2 = baseIndex + f2;
      vA.set(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
      vB.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
      vC.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
      eAB.subVectors(vB, vA);
      eAC.subVectors(vC, vA);
      triN.crossVectors(eAB, eAC);
      if (triN.dot(nDir) >= 0) {
        indices.push(i0, i1, i2);
      } else {
        indices.push(i0, i2, i1);
      }
    }
  };

  if (capStart) {
    const c0 = ringCentroid(rings[0]);
    const c1 = ringCentroid(rings[1]);
    appendCap(rings[0], new THREE.Vector3().subVectors(c0, c1));
  }
  if (capEnd) {
    const cLast = ringCentroid(rings[numStations - 1]);
    const cPrev = ringCentroid(rings[numStations - 2]);
    appendCap(rings[numStations - 1], new THREE.Vector3().subVectors(cLast, cPrev));
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  // Smooth normals seamlessly across the j=0 / j=uniqueCount UV seam on the side shell
  if (smoothSeam) {
    const normAttr = geom.getAttribute('normal');
    const n0 = new THREE.Vector3();
    const nN = new THREE.Vector3();
    for (let i = 0; i < numStations; i++) {
      const idx0 = i * ringStride;
      const idxN = idx0 + uniqueCount;
      if (idxN < sideVertCount) {
        n0.fromBufferAttribute(normAttr, idx0);
        nN.fromBufferAttribute(normAttr, idxN);
        n0.add(nN).normalize();
        normAttr.setXYZ(idx0, n0.x, n0.y, n0.z);
        normAttr.setXYZ(idxN, n0.x, n0.y, n0.z);
      }
    }
    normAttr.needsUpdate = true;
  }

  return geom;
}

/**
 * Helper: create a realistic countersunk slotted steel screw aligned along local +Y.
 * Head sits at y = 0 (slightly proud dome + dark crisp screwdriver slot).
 */
function createSlottedScrew(radius, materials, slotAngle = 0.35) {
  const g = new THREE.Group();

  // Recessed chamfer bezel ring
  const bezelGeom = new THREE.CylinderGeometry(radius * 1.12, radius * 1.02, radius * 0.25, 20);
  const bezel = new THREE.Mesh(bezelGeom, materials.darkSteel);
  bezel.position.y = -radius * 0.1;
  g.add(bezel);

  // Slightly domed machined steel screw head
  const headGeom = new THREE.CylinderGeometry(radius * 0.96, radius * 0.72, radius * 0.38, 22);
  const head = new THREE.Mesh(headGeom, materials.bluedSteel);
  head.position.y = -radius * 0.04;
  g.add(head);

  const domeGeom = new THREE.SphereGeometry(
    radius * 0.96,
    20,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.38
  );
  domeGeom.scale(1, 0.26, 1);
  const dome = new THREE.Mesh(domeGeom, materials.parkerizedSteel);
  dome.position.y = radius * 0.09;
  g.add(dome);

  // Crisp recessed dark screwdriver slot across the dome
  const slotGeom = new THREE.BoxGeometry(radius * 1.82, radius * 0.28, radius * 0.26);
  const slot = new THREE.Mesh(slotGeom, materials.darkSteel);
  slot.position.y = radius * 0.14;
  slot.rotation.y = slotAngle;
  g.add(slot);

  return g;
}

// ---------------------------------------------------------------------------
// 1. BUTTSTOCK ASSEMBLY (parts.buttstock)
// ---------------------------------------------------------------------------

function buildButtstock(materials) {
  const buttstock = new THREE.Group();
  buttstock.name = 'buttstock';

  // Exact anatomical AK-47 Type 3 laminated buttstock profiles
  // Stations run strictly from X = -4.635 (rear butt) to X = -2.395 (flush inside receiver rear -2.40)
  const combCurve = [
    [-4.64, -0.220], // Heel
    [-4.20, -0.162],
    [-3.70, -0.100],
    [-3.20, -0.045], // Comb crest shoulder
    [-2.92, -0.025],
    [-2.72, -0.020], // Wrist neck dip
    [-2.56, +0.018],
    [-2.43, +0.058],
    [-2.395, +0.064], // Mates flush against receiver rear (Y=+0.08 top rails)
  ];

  const bellyCurve = [
    [-4.64, -1.380], // Toe
    [-4.12, -1.165], // Rear sling swivel mount zone
    [-3.55, -0.925],
    [-3.05, -0.708],
    [-2.75, -0.580], // Wrist belly inflection
    [-2.58, -0.478],
    [-2.43, -0.422],
    [-2.395, -0.426], // Mates flush against receiver rear (Y=-0.44 bottom)
  ];

  const halfWidthCurve = [
    [-4.64, 0.190], // Butt base half-width (vertical taper yields 0.36 top -> 0.40 lower-mid!)
    [-4.15, 0.193],
    [-3.60, 0.191], // Cheek weld swell (~0.382 width)
    [-3.12, 0.174],
    [-2.72, 0.150], // Slender contoured wrist (0.30 width)
    [-2.50, 0.169],
    [-2.41, 0.176], // 0.352 matching 0.36 receiver cleanly
    [-2.395, 0.175],
  ];

  // Superellipse exponent: rounder ovoid at wrist/cheek, crisper beveled rectangle at receiver
  const expCurve = [
    [-4.64, 2.55],
    [-3.80, 2.30],
    [-3.10, 2.15],
    [-2.72, 2.08],
    [-2.50, 2.75],
    [-2.41, 3.50],
    [-2.395, 3.60],
  ];

  // Dense non-uniform X stations for smooth wrist sweeps and crisp receiver/buttplate junctions
  const xStations = [
    -4.636, -4.626, -4.600, -4.540, -4.440, -4.320, -4.180, -4.040, -3.900,
    -3.750, -3.600, -3.450, -3.300, -3.150, -3.020, -2.920, -2.840, -2.780,
    -2.720, -2.660, -2.600, -2.540, -2.490, -2.450, -2.420, -2.404, -2.395,
  ];

  const radialSegs = 36;
  const stockRings = [];

  for (let i = 0; i < xStations.length; i++) {
    const x = xStations[i];
    const yTop = sampleCurve(combCurve, x);
    const yBot = sampleCurve(bellyCurve, x);
    const halfW = sampleCurve(halfWidthCurve, x);
    const superExp = sampleCurve(expCurve, x);

    const cy = (yTop + yBot) * 0.5;
    const ry = (yTop - yBot) * 0.5;

    // Slight chamfer bevel on the very front 4 mm seating into receiver
    const frontEase = smoothstep(-2.404, -2.395, x);
    const scaleY = 1 - 0.015 * frontEase;
    const scaleZ = 1 - 0.018 * frontEase;

    // Butt-end subtle bevel easing into the steel buttplate rim
    const buttEase = 1 - smoothstep(-4.636, -4.620, x);
    const buttScale = 1 - 0.016 * buttEase;

    // Vertical fullness factor: authentic Russian AK stock is slightly sleeker at comb crest
    // and subtly fuller at lower-mid cheek/butt (0.36 top -> 0.40 lower-mid at butt!)
    const buttFactor = smoothstep(-2.85, -4.55, x);

    const pts = [];
    for (let j = 0; j <= radialSegs; j++) {
      // Start seam at bottom centerline (phi = -PI/2) where belly/tang sits
      const frac = j / radialSegs;
      const phi = -Math.PI * 0.5 + frac * Math.PI * 2;
      const s = Math.sin(phi); // -1 at belly, +1 at comb
      const c = Math.cos(phi); // +1 at +Z right, -1 at -Z left

      const powFactor = 2 / superExp;
      const ny = spow(s, powFactor);
      const nz = spow(c, powFactor);

      // Subtle ovoid taper: slightly narrower at upper comb, fuller at lower-mid
      const verticalWidthMod =
        1.0 + buttFactor * (-0.055 * ny + 0.055 * Math.exp(-Math.pow((ny + 0.35) / 0.55, 2)));

      const py = cy + ny * ry * scaleY * buttScale;
      const pz = nz * halfW * verticalWidthMod * scaleZ * buttScale;
      pts.push({ x, y: py, z: pz, u: 0, v: 0 });
    }

    // Arc-length parameterization around ring for distortion-free laminated grain UVs
    const cumArc = [0];
    for (let j = 1; j <= radialSegs; j++) {
      const dy = pts[j].y - pts[j - 1].y;
      const dz = pts[j].z - pts[j - 1].z;
      cumArc.push(cumArc[j - 1] + Math.hypot(dy, dz));
    }
    const totalArc = cumArc[radialSegs] || 1;

    // U runs lengthwise along X; V wraps cleanly 0..2 around ring (integer repeat -> zero seam!)
    // Matches materials.js laminatedWood (14 plies per V unit -> ~14 realistic plies across each side!)
    const uCoord = (x + 4.64) * 0.48;
    for (let j = 0; j <= radialSegs; j++) {
      pts[j].u = uCoord;
      pts[j].v = (cumArc[j] / totalArc) * 2.0;
    }

    stockRings.push(pts);
  }

  const woodGeom = buildLoftGeometry(stockRings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 0.75,
    capUVMode: 'yz',
  });
  const woodMesh = new THREE.Mesh(woodGeom, materials.laminatedWood);
  woodMesh.name = 'buttstockWood';
  buttstock.add(woodMesh);

  // --- Upper & Lower Steel Receiver Tangs + Countersunk Slotted Screws ---
  const buildTangStrap = (isUpper) => {
    const tangGroup = new THREE.Group();
    const xStart = -2.394;
    const xEnd = isUpper ? -2.79 : -2.76;
    const baseHalfW = isUpper ? 0.068 : 0.064;
    const thickness = 0.017;
    const steps = 16;
    const profileSegs = 12;
    const rings = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps; // 0 = rear tip (xEnd), 1 = receiver junction (xStart)
      const x = THREE.MathUtils.lerp(xEnd, xStart, t);
      const surfY = sampleCurve(isUpper ? combCurve : bellyCurve, x);
      // Rounded semicircular rear tongue tip at t -> 0
      const tipRound = t < 0.22 ? Math.sqrt(Math.max(0.04, 1 - Math.pow(1 - t / 0.22, 2))) : 1.0;
      const hw = baseHalfW * tipRound;
      const th = thickness * (t < 0.10 ? smoothstep(0, 0.10, t) * 0.6 + 0.4 : 1.0);
      const dir = isUpper ? 1 : -1;

      const ring = [];
      for (let j = 0; j <= profileSegs; j++) {
        const a = (j / profileSegs) * Math.PI * 2;
        const nz = spow(Math.cos(a), 0.55); // Beveled flat strap cross-section
        const ny = spow(Math.sin(a), 0.55);
        // Embed inner half slightly into wood so zero gap exists on curved comb/belly
        const localY = surfY + dir * (ny * th * 0.5 + th * 0.18) - dir * (nz * nz * 0.008);
        ring.push({
          x,
          y: localY,
          z: nz * hw,
          u: t,
          v: j / profileSegs,
        });
      }
      rings.push(ring);
    }

    const tangGeom = buildLoftGeometry(rings, {
      capStart: true,
      capEnd: true,
      smoothSeam: true,
      capUVScale: 2.0,
    });
    const tangMesh = new THREE.Mesh(tangGeom, materials.parkerizedSteel);
    tangGroup.add(tangMesh);

    // Countersunk slotted tang screw aligned to local comb/belly surface normal
    const screwX = isUpper ? -2.62 : -2.60;
    const y0 = sampleCurve(isUpper ? combCurve : bellyCurve, screwX - 0.03);
    const y1 = sampleCurve(isUpper ? combCurve : bellyCurve, screwX + 0.03);
    const slope = Math.atan2(y1 - y0, 0.06);
    const screwY = sampleCurve(isUpper ? combCurve : bellyCurve, screwX) + (isUpper ? 0.011 : -0.011);

    const screw = createSlottedScrew(0.033, materials, isUpper ? 0.45 : -0.55);
    screw.position.set(screwX, screwY, 0);
    screw.rotation.z = isUpper ? slope : slope + Math.PI;
    tangGroup.add(screw);

    return tangGroup;
  };

  buttstock.add(buildTangStrap(true));
  buttstock.add(buildTangStrap(false));

  // --- Contoured Stamped Steel Buttplate, Trapdoor & Buttplate Screws ---
  const buttplateGroup = new THREE.Group();
  buttplateGroup.name = 'steelButtplate';

  const bpStations = [
    { x: -4.702, scaleY: 0.945, scaleZ: 0.880 }, // Soft crowned rear face edge
    { x: -4.696, scaleY: 0.992, scaleZ: 0.985 }, // Rounded rear shoulder bevel
    { x: -4.670, scaleY: 1.012, scaleZ: 1.032 }, // Full stamped plate body
    { x: -4.635, scaleY: 1.012, scaleZ: 1.032 }, // Wrap-around rim gripping wood
    { x: -4.614, scaleY: 1.005, scaleZ: 1.018 }, // Tapered front wrap lip
  ];

  const buttYTop = sampleCurve(combCurve, -4.64);
  const buttYBot = sampleCurve(bellyCurve, -4.64);
  const buttCy = (buttYTop + buttYBot) * 0.5;
  const buttRy = (buttYTop - buttYBot) * 0.5;
  const buttHalfW = sampleCurve(halfWidthCurve, -4.64);
  const buttExp = sampleCurve(expCurve, -4.64);

  const bpRings = bpStations.map((st, sIdx) => {
    const ring = [];
    for (let j = 0; j <= radialSegs; j++) {
      const frac = j / radialSegs;
      const phi = -Math.PI * 0.5 + frac * Math.PI * 2;
      const ny = spow(Math.sin(phi), 2 / buttExp);
      const nz = spow(Math.cos(phi), 2 / buttExp);
      const verticalWidthMod =
        1.0 + (-0.055 * ny + 0.055 * Math.exp(-Math.pow((ny + 0.35) / 0.55, 2)));
      // Subtle stamped heel/toe cup curve on rear plate face
      const crownX = sIdx === 0 ? -0.004 * (1 - ny * ny * 0.6) : 0;
      ring.push({
        x: st.x + crownX,
        y: buttCy + ny * buttRy * st.scaleY,
        z: nz * buttHalfW * verticalWidthMod * st.scaleZ,
        u: sIdx / (bpStations.length - 1),
        v: frac * 2.0,
      });
    }
    return ring;
  });

  const bpGeom = buildLoftGeometry(bpRings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 1.5,
  });
  const bpMesh = new THREE.Mesh(bpGeom, materials.parkerizedSteel);
  buttplateGroup.add(bpMesh);

  // Subtle stamped horizontal traction ribs on upper and lower buttplate face
  const ribPositionsY = [-0.47, -0.52, -0.57, -0.62, -0.97, -1.02, -1.07, -1.12];
  for (const ryPos of ribPositionsY) {
    const yNorm = clamp((ryPos - buttCy) / buttRy, -0.95, 0.95);
    const localHalfW =
      buttHalfW *
      Math.pow(Math.max(0.05, 1 - Math.pow(Math.abs(yNorm), buttExp)), 1 / buttExp) *
      0.82;
    const ribGeom = new THREE.BoxGeometry(0.010, 0.016, localHalfW * 2);
    const rib = new THREE.Mesh(ribGeom, materials.parkerizedSteel);
    rib.position.set(-4.702, ryPos, 0);
    buttplateGroup.add(rib);
  }

  // Iconic Circular Cleaning-Kit Trapdoor centered at (X = -4.70, Y = -0.78, Z = 0)
  const trapdoorGroup = new THREE.Group();
  trapdoorGroup.position.set(-4.700, -0.78, 0);

  // Outer stamped circular retaining rim (proud collar framing recessed door)
  const trapBezelGeom = new THREE.TorusGeometry(0.100, 0.011, 12, 28);
  trapBezelGeom.rotateY(Math.PI * 0.5);
  const trapBezel = new THREE.Mesh(trapBezelGeom, materials.parkerizedSteel);
  trapBezel.position.x = -0.006;
  trapdoorGroup.add(trapBezel);

  // Deep circular dark shadow recess around spring-loaded door
  const trapRecessGeom = new THREE.CylinderGeometry(0.095, 0.095, 0.010, 28);
  trapRecessGeom.rotateZ(Math.PI * 0.5);
  const trapRecess = new THREE.Mesh(trapRecessGeom, materials.darkSteel);
  trapRecess.position.x = -0.002;
  trapdoorGroup.add(trapRecess);

  // Hinged spring-loaded circular steel trapdoor disc recessed smoothly inside bezel
  const trapLidGeom = new THREE.CylinderGeometry(0.083, 0.083, 0.008, 28);
  trapLidGeom.rotateZ(Math.PI * 0.5);
  const trapLid = new THREE.Mesh(trapLidGeom, materials.bluedSteel);
  trapLid.position.x = -0.005;
  trapdoorGroup.add(trapLid);

  // Subtle finger push-dimple near top of trapdoor + tiny bottom hinge boss
  const dimpleGeom = new THREE.SphereGeometry(0.021, 14, 10);
  dimpleGeom.scale(0.32, 1, 1);
  const dimple = new THREE.Mesh(dimpleGeom, materials.darkSteel);
  dimple.position.set(-0.009, 0.036, 0);
  trapdoorGroup.add(dimple);

  const hingeGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.056, 12);
  hingeGeom.rotateX(Math.PI * 0.5);
  const hinge = new THREE.Mesh(hingeGeom, materials.parkerizedSteel);
  hinge.position.set(-0.007, -0.092, 0);
  trapdoorGroup.add(hinge);

  buttplateGroup.add(trapdoorGroup);

  // Two recessed slotted steel buttplate screws (top & bottom)
  const topButtScrew = createSlottedScrew(0.034, materials, 0.25);
  topButtScrew.position.set(-4.701, -0.34, 0);
  topButtScrew.rotation.z = Math.PI * 0.5;
  buttplateGroup.add(topButtScrew);

  const botButtScrew = createSlottedScrew(0.034, materials, -0.40);
  botButtScrew.position.set(-4.701, -1.25, 0);
  botButtScrew.rotation.z = Math.PI * 0.5;
  buttplateGroup.add(botButtScrew);

  buttstock.add(buttplateGroup);

  // --- Rear Sling Swivel (mounted underside-left near X = -4.12, Y = -1.20) ---
  const swivelGroup = new THREE.Group();
  const swX = -4.12;
  const swY = sampleCurve(bellyCurve, swX);
  const swSlope = Math.atan2(
    sampleCurve(bellyCurve, swX + 0.06) - sampleCurve(bellyCurve, swX - 0.06),
    0.12
  );
  // Seat cleanly on underside-left contour of belly
  swivelGroup.position.set(swX, swY + 0.014, -0.042);
  swivelGroup.rotation.order = 'ZYX';
  swivelGroup.rotation.z = swSlope;
  swivelGroup.rotation.x = 0.24; // Subtle natural left cant along lower-left belly curve

  // Oval stamped steel mounting bracket plate (extruded beveled stadium shape)
  const plateShape = new THREE.Shape();
  const pLen = 0.165;
  const pWid = 0.056;
  plateShape.absarc(-pLen + pWid, 0, pWid, Math.PI * 0.5, Math.PI * 1.5, false);
  plateShape.absarc(pLen - pWid, 0, pWid, -Math.PI * 0.5, Math.PI * 0.5, false);
  plateShape.closePath();

  const plateGeom = new THREE.ExtrudeGeometry(plateShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 3,
    curveSegments: 16,
  });
  plateGeom.rotateX(Math.PI * 0.5);
  const plateMesh = new THREE.Mesh(plateGeom, materials.parkerizedSteel);
  plateMesh.position.y = 0.004;
  swivelGroup.add(plateMesh);

  // Two tiny mounting wood screws fore & aft on the oval bracket
  for (const sx of [-0.115, 0.115]) {
    const s = createSlottedScrew(0.020, materials, sx > 0 ? 0.6 : -0.3);
    s.position.set(sx, -0.016, 0);
    s.rotation.z = Math.PI;
    swivelGroup.add(s);
  }

  // Swivel clevis boss + rivet cross-pin
  const lugGeom = new THREE.BoxGeometry(0.072, 0.058, 0.046);
  const lugMesh = new THREE.Mesh(lugGeom, materials.parkerizedSteel);
  lugMesh.position.set(0, -0.036, 0);
  swivelGroup.add(lugMesh);

  const pinGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.062, 12);
  pinGeom.rotateX(Math.PI * 0.5);
  const pinMesh = new THREE.Mesh(pinGeom, materials.bluedSteel);
  pinMesh.position.set(0, -0.052, 0);
  swivelGroup.add(pinMesh);

  // Hanging stamped steel rectangular-oval sling loop
  const loopPts = [
    new THREE.Vector3(-0.024, -0.052, 0),
    new THREE.Vector3(-0.145, -0.062, 0),
    new THREE.Vector3(-0.158, -0.112, 0),
    new THREE.Vector3(-0.135, -0.156, 0),
    new THREE.Vector3(0.0, -0.162, 0),
    new THREE.Vector3(0.135, -0.156, 0),
    new THREE.Vector3(0.158, -0.112, 0),
    new THREE.Vector3(0.145, -0.062, 0),
    new THREE.Vector3(0.024, -0.052, 0),
  ];
  const loopCurve = new THREE.CatmullRomCurve3(loopPts, true, 'catmullrom', 0.25);
  const loopGeom = new THREE.TubeGeometry(loopCurve, 44, 0.013, 10, true);
  // Flatten cross-section slightly along Z like stamped steel bar stock
  loopGeom.scale(1, 1, 0.85);
  const loopMesh = new THREE.Mesh(loopGeom, materials.parkerizedSteel);
  loopMesh.rotation.x = 0.28; // Hang gracefully slightly outward to the left
  swivelGroup.add(loopMesh);

  buttstock.add(swivelGroup);

  buttstock.userData.explodeOffset = new THREE.Vector3(-1.15, 0, 0);
  enableShadows(buttstock);
  return buttstock;
}

// ---------------------------------------------------------------------------
// 2. LOWER WOODEN HANDGUARD (parts.lowerHandguard)
// ---------------------------------------------------------------------------

function buildLowerHandguard(materials) {
  const lowerHandguard = new THREE.Group();
  lowerHandguard.name = 'lowerHandguard';

  // Non-uniform X-stations from X = -0.005 (flush seat into receiver at 0.00)
  // to X = +1.718 (seats cleanly inside front HandguardRetainerCup X = 1.655..1.722!)
  const xStations = [
    -0.005, 0.012, 0.040, 0.080, 0.130, 0.190, 0.250, 0.310, 0.360,
    0.405, 0.440, 0.475, 0.512, 0.550, 0.588, 0.625, 0.660, 0.695,
    0.740, 0.790, 0.840, 0.890, 0.935, 0.975, 1.012, 1.050, 1.088,
    1.125, 1.160, 1.200, 1.250, 1.300, 1.350, 1.400, 1.455, 1.510,
    1.560, 1.605, 1.635, 1.652, 1.662, 1.685, 1.708, 1.718,
  ];

  // Bottom height profile Y_bot(x): -0.26 near receiver -> tapers smoothly to -0.196 inside front retainer cup (inBot = -0.200)
  const bottomCurve = [
    [-0.005, -0.258],
    [0.06, -0.260],
    [0.45, -0.256],
    [0.95, -0.240],
    [1.42, -0.216],
    [1.62, -0.204],
    [1.656, -0.196],
    [1.718, -0.195],
  ];

  // Top rail edge Y_top(x): rises to +0.110 (clean shadow gap below upper handguard at +0.162),
  // steps cleanly to +0.085 inside HandguardRetainerCup (inTop = +0.088)!
  const topCurve = [
    [-0.005, +0.088],
    [0.05, +0.106],
    [0.18, +0.110],
    [1.56, +0.110],
    [1.632, +0.104],
    [1.656, +0.086],
    [1.718, +0.085],
  ];

  // Base half-width before palm swell (0.36 at receiver -> steps cleanly to 0.160 inside retainer cup inW = 0.164!)
  const baseHalfWCurve = [
    [-0.005, 0.178],
    [0.04, 0.181],
    [0.40, 0.184],
    [1.25, 0.184],
    [1.58, 0.178],
    [1.636, 0.173],
    [1.656, 0.160],
    [1.718, 0.159],
  ];

  // Smooth pill-shaped vent pocket indentation on outer flank
  const ventIndent = (x, y) => {
    const vents = [
      { cx: 0.55, cy: 0.058, hx: 0.104, hy: 0.017 },
      { cx: 1.05, cy: 0.058, hx: 0.104, hy: 0.017 },
    ];
    let d = 0;
    for (const v of vents) {
      const dx = Math.max(0, Math.abs(x - v.cx) - (v.hx - v.hy));
      const dy = y - v.cy;
      const dist = Math.hypot(dx, dy) / v.hy;
      if (dist < 1.45) {
        const s = 1 - smoothstep(0.65, 1.45, dist);
        d = Math.max(d, s);
      }
    }
    return d;
  };

  // Evaluate outer flank half-width at arbitrary (x, y) for exact vent/groove alignment
  const evalFlankZAtY = (x, y, includeVentIndent = false) => {
    const yBot = sampleCurve(bottomCurve, x);
    const yTop = sampleCurve(topCurve, x);
    const outerTopY = yTop - 0.014;
    const baseHalfW = sampleCurve(baseHalfWCurve, x);
    const yDrop = clamp((outerTopY - y) / Math.max(0.01, outerTopY - yBot), 0, 1);
    const sinTh = Math.pow(yDrop, 1 / 1.38);
    const cosTh = Math.sqrt(Math.max(0, 1 - sinTh * sinTh));
    const zUnit = spow(cosTh, 0.72);

    const swellEnv = smoothstep(0.28, 0.66, x) * (1 - smoothstep(1.22, 1.56, x));
    const grooveEnv = smoothstep(0.24, 0.42, x) * (1 - smoothstep(1.36, 1.54, x));

    let halfW = baseHalfW;
    halfW += 0.066 * swellEnv * Math.exp(-Math.pow((y + 0.065) / 0.095, 2));
    halfW -= 0.020 * grooveEnv * Math.exp(-Math.pow((y - 0.012) / 0.028, 2));
    if (includeVentIndent) {
      halfW -= 0.016 * ventIndent(x, y);
    }
    return zUnit * halfW;
  };

  /**
   * Closed thick-walled U-cradle cross-section at station x:
   *  1. Outer U wall: top-right shoulder -> right flank -> underside -> left flank -> top-left shoulder
   *  2. Rounded top-left wood lip arching smoothly over yTop into inner left vertical wall
   *  3. Inner vertical left wall down to Y = 0
   *  4. Inner semicircular barrel trough (clearing chamber r = 0.115) with central cleaning-rod trough (Y = -0.148, r = 0.025)
   *  5. Inner vertical right wall up to inner top lip
   *  6. Rounded top-right wood lip arching smoothly back to outer top-right shoulder
   */
  const outerSegs = 28;
  const lipSegs = 5;
  const innerWallSegs = 3;
  const innerArcSegs = 18;

  const rings = [];

  for (let i = 0; i < xStations.length; i++) {
    const x = xStations[i];
    const yBot = sampleCurve(bottomCurve, x);
    const yTop = sampleCurve(topCurve, x);
    const outerTopY = yTop - 0.014; // Top rounded lip crowns cleanly at yTop!
    const baseHalfW = sampleCurve(baseHalfWCurve, x);

    const rearLip = 1 - smoothstep(-0.005, 0.022, x);
    const frontLip = smoothstep(1.700, 1.718, x);
    const endBevel = Math.max(rearLip, frontLip);

    const swellEnv = smoothstep(0.28, 0.66, x) * (1 - smoothstep(1.22, 1.56, x));
    const grooveEnv = smoothstep(0.24, 0.42, x) * (1 - smoothstep(1.36, 1.54, x));

    // Inner barrel clearance radius (clears heavy chamber r=0.115 and mid-barrel r=0.090)
    const innerBarrelR = 0.124 - 0.008 * smoothstep(0.45, 0.88, x);

    const pts = [];

    const evalOuterPoint = (theta) => {
      const c = Math.cos(theta); // +1 right, -1 left
      const s = Math.sin(theta); // 0 top shoulder, +1 bottom

      const zUnit = spow(c, 0.72);
      const yDrop = Math.pow(s, 1.38);

      let y = outerTopY - (outerTopY - yBot) * yDrop;
      let halfW = baseHalfW * (1 - 0.012 * endBevel);

      // Ergonomic AKM side palm swell (~0.43 total width across X = 0.65..1.25)
      const palmVertBand = Math.exp(-Math.pow((y + 0.065) / 0.095, 2));
      halfW += 0.066 * swellEnv * palmVertBand;

      // Sculpted longitudinal finger groove above palm swell
      const fingerGrooveBand = Math.exp(-Math.pow((y - 0.012) / 0.028, 2));
      halfW -= 0.020 * grooveEnv * fingerGrooveBand;

      // Sculpted recessed pockets for the 2 side cooling vents
      halfW -= 0.016 * ventIndent(x, y);

      // Subtle exterior central underside channel echoing the cleaning rod path
      const bottomCenterFactor = Math.exp(-Math.pow(zUnit / 0.24, 2)) * Math.pow(s, 3.0);
      y += 0.006 * bottomCenterFactor * smoothstep(0.15, 0.55, x);

      return { x, y, z: zUnit * halfW };
    };

    // 1. Outer U wall: top-right (theta = 0) -> bottom -> top-left (theta = PI)
    for (let k = 0; k <= outerSegs; k++) {
      pts.push(evalOuterPoint((k / outerSegs) * Math.PI));
    }

    const outerTopLeft = pts[pts.length - 1];
    const outerTopRight = pts[0];
    const innerTopY = outerTopY;
    const innerTopZ = innerBarrelR;

    // 2. Smoothly rounded top-left wood lip arching from outerTopLeft -> (-innerTopZ, innerTopY)
    const lipMidZLeft = (outerTopLeft.z - innerTopZ) * 0.5;
    const lipRadLeft = Math.abs(outerTopLeft.z + innerTopZ) * 0.5;
    for (let k = 1; k < lipSegs; k++) {
      const a = (k / lipSegs) * Math.PI; // 0 = outer, PI = inner
      pts.push({
        x,
        y: innerTopY + Math.sin(a) * 0.014,
        z: lipMidZLeft - Math.cos(a) * lipRadLeft,
      });
    }

    // 3. Smooth inner vertical left wall down from (-innerTopZ, innerTopY) to (-innerBarrelR, 0)
    for (let k = 0; k < innerWallSegs; k++) {
      const f = k / innerWallSegs;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(innerTopY, 0, f),
        z: -innerBarrelR,
      });
    }

    // 4. Inner semicircular barrel trough + central cleaning-rod channel (Y = -0.148, r = 0.025 -> -0.175)
    for (let k = 0; k <= innerArcSegs; k++) {
      const a = Math.PI - (k / innerArcSegs) * Math.PI; // PI (-Z) -> PI/2 (bottom) -> 0 (+Z)
      const iz = Math.cos(a) * innerBarrelR;
      let iy = -Math.sin(a) * innerBarrelR;
      const rodSlot = Math.exp(-Math.pow(iz / 0.036, 2));
      iy = THREE.MathUtils.lerp(iy, Math.min(iy, -0.175), rodSlot);
      // Maintain solid >= 1.6 mm lower wood wall above outer bottom
      iy = Math.max(iy, yBot + 0.016);
      pts.push({ x, y: iy, z: iz });
    }

    // 5. Smooth inner vertical right wall up from (+innerBarrelR, 0) to (+innerTopZ, innerTopY)
    for (let k = 1; k <= innerWallSegs; k++) {
      const f = k / innerWallSegs;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(0, innerTopY, f),
        z: innerBarrelR,
      });
    }

    // 6. Smoothly rounded top-right wood lip arching from (+innerTopZ, innerTopY) -> outerTopRight
    const lipMidZRight = (outerTopRight.z + innerTopZ) * 0.5;
    const lipRadRight = Math.abs(outerTopRight.z - innerTopZ) * 0.5;
    for (let k = 1; k < lipSegs; k++) {
      const a = (k / lipSegs) * Math.PI; // 0 = inner, PI = outer
      pts.push({
        x,
        y: innerTopY + Math.sin(a) * 0.014,
        z: lipMidZRight - Math.cos(a) * lipRadRight,
      });
    }

    // Close seam explicitly
    pts.push({ x: pts[0].x, y: pts[0].y, z: pts[0].z });

    const cumArc = [0];
    for (let j = 1; j < pts.length; j++) {
      cumArc.push(
        cumArc[j - 1] + Math.hypot(pts[j].y - pts[j - 1].y, pts[j].z - pts[j - 1].z)
      );
    }
    const totalArc = cumArc[pts.length - 1] || 1;
    // Match buttstock physical ply density (2.0 V wrap around ~1.5-unit full U-loop -> ~8 plies per visible flank)
    const uCoord = x * 0.50;

    rings.push(
      pts.map((p, idx) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        u: uCoord,
        v: (cumArc[idx] / totalArc) * 2.0,
      }))
    );
  }

  const lhGeom = buildLoftGeometry(rings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 0.85,
  });
  const lhMesh = new THREE.Mesh(lhGeom, materials.laminatedWood);
  lhMesh.name = 'lowerHandguardWood';
  lowerHandguard.add(lhMesh);

  // --- Sculpted Dark-Wood Longitudinal Finger Groove Accent Strips ---
  for (const side of [-1, 1]) {
    const groovePts = [];
    const gSteps = 20;
    for (let i = 0; i <= gSteps; i++) {
      const gx = THREE.MathUtils.lerp(0.36, 1.40, i / gSteps);
      const surfZ = evalFlankZAtY(gx, 0.012, false);
      groovePts.push(new THREE.Vector3(gx, 0.012, side * (surfZ - 0.002)));
    }
    const gCurve = new THREE.CatmullRomCurve3(groovePts);
    const gGeom = new THREE.TubeGeometry(gCurve, 26, 0.0065, 8, false);
    gGeom.scale(1, 1.3, 0.45);
    const gMesh = new THREE.Mesh(gGeom, materials.woodDarkEdge);
    lowerHandguard.add(gMesh);
  }

  // --- 2 Authentic Recessed Side Cooling Vents on BOTH Left & Right Sides ---
  const buildCoolingVent = (vx, side) => {
    const ventGroup = new THREE.Group();
    const vy = 0.058;
    const flankZ = evalFlankZAtY(vx, vy, false);

    const makePillShape = (halfLen, radius) => {
      const sh = new THREE.Shape();
      const straight = Math.max(0.001, halfLen - radius);
      sh.absarc(-straight, 0, radius, Math.PI * 0.5, Math.PI * 1.5, false);
      sh.absarc(straight, 0, radius, -Math.PI * 0.5, Math.PI * 0.5, false);
      sh.closePath();
      return sh;
    };

    // Chamfered dark end-grain wood surround seated smoothly in sculpted wood depression
    const frameShape = makePillShape(0.110, 0.0185);
    frameShape.holes.push(makePillShape(0.092, 0.0115));

    const frameGeom = new THREE.ExtrudeGeometry(frameShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
      curveSegments: 16,
    });
    frameGeom.translate(0, 0, -0.008);
    const frameMesh = new THREE.Mesh(frameGeom, materials.woodDarkEdge);
    frameMesh.position.set(vx, vy, side * (flankZ - 0.014));
    ventGroup.add(frameMesh);

    // Deep dark recessed vent slot interior
    const slotGeom = new THREE.ExtrudeGeometry(makePillShape(0.096, 0.0125), {
      depth: 0.016,
      bevelEnabled: false,
      curveSegments: 14,
    });
    slotGeom.translate(0, 0, -0.008);
    const slotMesh = new THREE.Mesh(slotGeom, materials.darkSteel);
    slotMesh.position.set(vx, vy, side * (flankZ - 0.020));
    ventGroup.add(slotMesh);

    return ventGroup;
  };

  for (const side of [-1, 1]) {
    lowerHandguard.add(buildCoolingVent(0.55, side));
    lowerHandguard.add(buildCoolingVent(1.05, side));
  }

  // --- Solid Two-Walled Stamped Internal Heat-Shield Liner (authentic AKM detail in Exploded View) ---
  // Sits cleanly along the bottom (-Y) of the inner barrel trough, clearing barrel & cleaning rod!
  const shieldArcSegs = 14;
  const rIn = 0.116;
  const rOut = 0.121;
  const shieldHalfAng = 1.05; // ±60° around bottom -Y
  const shieldXs = [0.24, 1.48];
  const shieldRings = shieldXs.map((sx, sIdx) => {
    const pts = [];
    // Outer bottom arc (-Y) from right to left
    for (let k = 0; k <= shieldArcSegs; k++) {
      const a = -Math.PI * 0.5 + THREE.MathUtils.lerp(shieldHalfAng, -shieldHalfAng, k / shieldArcSegs);
      pts.push({ x: sx, y: Math.sin(a) * rOut, z: Math.cos(a) * rOut });
    }
    // Inner bottom arc from left back to right
    for (let k = 0; k <= shieldArcSegs; k++) {
      const a = -Math.PI * 0.5 + THREE.MathUtils.lerp(-shieldHalfAng, shieldHalfAng, k / shieldArcSegs);
      pts.push({ x: sx, y: Math.sin(a) * rIn, z: Math.cos(a) * rIn });
    }
    pts.push({ x: pts[0].x, y: pts[0].y, z: pts[0].z });
    return pts.map((p, idx) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      u: sIdx,
      v: idx / (pts.length - 1),
    }));
  });
  const shieldGeom = buildLoftGeometry(shieldRings, {
    capStart: true,
    capEnd: true,
    smoothSeam: false,
  });
  const shieldMesh = new THREE.Mesh(shieldGeom, materials.darkSteel);
  shieldMesh.name = 'lowerHandguardHeatShield';
  lowerHandguard.add(shieldMesh);

  lowerHandguard.userData.explodeOffset = new THREE.Vector3(0.15, -0.65, 0);
  enableShadows(lowerHandguard);
  return lowerHandguard;
}

// ---------------------------------------------------------------------------
// 3. UPPER WOODEN HANDGUARD (parts.upperHandguard)
// ---------------------------------------------------------------------------

function buildUpperHandguard(materials) {
  const upperHandguard = new THREE.Group();
  upperHandguard.name = 'upperHandguard';

  // Spans X = +0.174 to X = +1.606:
  // End tenons (0.174..0.196 & 1.584..1.606) seat cleanly INSIDE barrel.js steel gas-tube retainer
  // pockets (inW = 0.148, inBot = 0.184, inTop = 0.408); main arch flares smoothly to width 0.34,
  // crown Y = +0.422, bottom rails Y = +0.162 (clean shadow gap Y = +0.11..+0.162!).
  const xStations = [
    0.174, 0.186, 0.195, 0.206, 0.228, 0.265, 0.330, 0.420, 0.540,
    0.680, 0.820, 0.960, 1.100, 1.240, 1.370, 1.470, 1.535, 1.568,
    1.582, 1.594, 1.606,
  ];

  const gasCenterY = 0.28;
  const innerArchR = 0.095; // Clears gas tube (r = 0.084..0.090 & mid-ribs 0.088) cleanly!
  const outerSegs = 24;
  const lipSegs = 4;
  const innerWallSegs = 2;
  const innerArcSegs = 16;

  const rings = [];

  for (let i = 0; i < xStations.length; i++) {
    const x = xStations[i];

    // Step cleanly inside the steel retainer lips at X < 0.198 and X > 1.582
    const rearLipBlend = smoothstep(0.194, 0.228, x);
    const frontLipBlend = 1 - smoothstep(1.552, 1.586, x);
    const bodyFactor = Math.min(rearLipBlend, frontLipBlend);

    // Gentle organic crown fullness in center of handguard
    const midSwell = Math.sin(clamp((x - 0.174) / (1.606 - 0.174), 0, 1) * Math.PI);

    // Tenon fits inside steel lip pocket (halfW=0.144 < 0.148, crown=0.403 < 0.408, bot=0.186 > 0.184)
    const halfW = THREE.MathUtils.lerp(0.144, 0.170, bodyFactor) + 0.004 * midSwell * bodyFactor;
    const crownY = THREE.MathUtils.lerp(0.403, 0.420, bodyFactor) + 0.003 * midSwell * bodyFactor;
    const bottomY = THREE.MathUtils.lerp(0.186, 0.162, bodyFactor);
    const outerStartY = bottomY + 0.011; // Bottom rounded lip crests cleanly down to bottomY

    const pts = [];

    // 1. Outer rounded arch: bottom-right (+Z) -> top crown -> bottom-left (-Z)
    for (let k = 0; k <= outerSegs; k++) {
      const theta = (k / outerSegs) * Math.PI;
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      const zShape = spow(c, 0.86);
      const yShape = Math.pow(s, 0.92);
      pts.push({
        x,
        y: outerStartY + (crownY - outerStartY) * yShape,
        z: zShape * halfW,
      });
    }

    const outerLeft = pts[pts.length - 1];
    const outerRight = pts[0];
    const innerEntryY = bottomY + 0.014;
    const innerEntryZ = innerArchR + 0.006;

    // 2. Smoothly rounded bottom-left wood lip bridging outerLeft -> (-innerEntryZ, innerEntryY)
    const lipMidZLeft = (outerLeft.z - innerEntryZ) * 0.5;
    const lipRadLeft = Math.abs(outerLeft.z + innerEntryZ) * 0.5;
    for (let k = 1; k < lipSegs; k++) {
      const frac = k / lipSegs;
      const a = frac * Math.PI;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(outerLeft.y, innerEntryY, frac) - Math.sin(a) * 0.011,
        z: lipMidZLeft - Math.cos(a) * lipRadLeft,
      });
    }

    // 3. Smooth inner left side wall rising from (-innerEntryZ, innerEntryY) to gas-tube arch start
    const archStartPhi = Math.PI + 0.22;
    const archStartZ = Math.cos(archStartPhi) * innerArchR;
    const archStartY = gasCenterY + Math.sin(archStartPhi) * innerArchR;
    for (let k = 0; k < innerWallSegs; k++) {
      const f = k / innerWallSegs;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(innerEntryY, archStartY, f),
        z: THREE.MathUtils.lerp(-innerEntryZ, archStartZ, f),
      });
    }

    // 4. Inner semicircular arch clearing gas tube (left -> crown -> right)
    for (let k = 0; k <= innerArcSegs; k++) {
      const phi = THREE.MathUtils.lerp(archStartPhi, -0.22, k / innerArcSegs);
      pts.push({
        x,
        y: gasCenterY + Math.sin(phi) * innerArchR,
        z: Math.cos(phi) * innerArchR,
      });
    }

    // 5. Smooth inner right side wall descending from arch end back to (+innerEntryZ, innerEntryY)
    const archEndPhi = -0.22;
    const archEndZ = Math.cos(archEndPhi) * innerArchR;
    const archEndY = gasCenterY + Math.sin(archEndPhi) * innerArchR;
    for (let k = 1; k <= innerWallSegs; k++) {
      const f = k / innerWallSegs;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(archEndY, innerEntryY, f),
        z: THREE.MathUtils.lerp(archEndZ, innerEntryZ, f),
      });
    }

    // 6. Smoothly rounded bottom-right wood lip bridging (+innerEntryZ, innerEntryY) -> outerRight
    const lipMidZRight = (outerRight.z + innerEntryZ) * 0.5;
    const lipRadRight = Math.abs(outerRight.z - innerEntryZ) * 0.5;
    for (let k = 1; k < lipSegs; k++) {
      const frac = k / lipSegs;
      const a = frac * Math.PI;
      pts.push({
        x,
        y: THREE.MathUtils.lerp(innerEntryY, outerRight.y, frac) - Math.sin(a) * 0.011,
        z: lipMidZRight - Math.cos(a) * lipRadRight,
      });
    }

    // Close loop seamlessly
    pts.push({ x: pts[0].x, y: pts[0].y, z: pts[0].z });

    const cumArc = [0];
    for (let j = 1; j < pts.length; j++) {
      cumArc.push(
        cumArc[j - 1] + Math.hypot(pts[j].y - pts[j - 1].y, pts[j].z - pts[j - 1].z)
      );
    }
    const totalArc = cumArc[pts.length - 1] || 1;
    const uCoord = x * 0.50;

    rings.push(
      pts.map((p, idx) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        u: uCoord,
        v: cumArc[idx] / totalArc,
      }))
    );
  }

  const uhGeom = buildLoftGeometry(rings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 0.85,
  });
  const uhMesh = new THREE.Mesh(uhGeom, materials.laminatedWood);
  uhMesh.name = 'upperHandguardWood';
  upperHandguard.add(uhMesh);

  upperHandguard.userData.explodeOffset = new THREE.Vector3(0, 0.95, 0);
  enableShadows(upperHandguard);
  return upperHandguard;
}

// ---------------------------------------------------------------------------
// 4. CONTOURED CHECKERED PISTOL GRIP (parts.pistolGrip)
// ---------------------------------------------------------------------------

function buildPistolGrip(materials) {
  const pistolGrip = new THREE.Group();
  pistolGrip.name = 'pistolGrip';

  // Spine sweeps down & rearward at ~22.2° from (X = -2.02, Y = -0.48) to (X = -2.42, Y = -1.46)
  // Trigger guard ends at X = -1.78 -> keep grip front edge strictly behind X = -1.80!
  const spineCenterX = (t) => {
    // Slight ergonomic S-curve: concave thumb web near top, fuller palm curve mid-height, slight rear heel flare
    const linearX = THREE.MathUtils.lerp(-2.02, -2.42, t);
    const webShift = +0.012 * Math.sin(t * Math.PI * 1.15) - 0.010 * Math.pow(t, 3);
    return linearX + webShift;
  };

  // X half-depth (front-to-back) along grip t in [0 (top), 1 (bottom)]
  const halfXCurve = [
    [0.00, 0.175], // Neck inside ferrule (front edge <= -1.845, well clear of -1.80!)
    [0.10, 0.178], // Slender thumb web neck (X depth ~0.356)
    [0.24, 0.198],
    [0.45, 0.228], // Palm swell (X depth ~0.456)
    [0.64, 0.229],
    [0.82, 0.214], // Lower palm taper
    [0.92, 0.224], // Subtle ergonomic heel flare
    [0.965, 0.224],
    [0.990, 0.212], // Smooth rounded bottom heel curve
    [1.00, 0.196], // Clean rounded bottom base edge
  ];

  // Z half-width (left-to-right) along grip t in [0 (top), 1 (bottom)]
  const halfZCurve = [
    [0.00, 0.129], // Slender neck inside steel ferrule
    [0.12, 0.129],
    [0.28, 0.141],
    [0.50, 0.153], // Mid-height palm swell (Z width ~0.306!)
    [0.70, 0.148],
    [0.86, 0.138],
    [0.94, 0.145], // Flared heel
    [0.975, 0.144],
    [0.992, 0.136],
    [1.00, 0.124], // Clean rounded bottom edge
  ];

  // Authentic ergonomic AK ovoid cross-section at parameter (t, theta)
  // theta = 0 -> backstrap (-X), theta = PI/2 -> right flank (+Z), theta = PI -> front strap (+X), 3*PI/2 -> left (-Z)
  const evalGripPoint = (t, theta, scaleRad = 1.0) => {
    const cx = spineCenterX(t);
    const cy = THREE.MathUtils.lerp(-0.515, -1.448, t);
    const hx = sampleCurve(halfXCurve, t) * scaleRad;
    const hz = sampleCurve(halfZCurve, t) * scaleRad;

    const c = Math.cos(theta); // +1 at rear (-X), -1 at front (+X)
    const s = Math.sin(theta); // +1 at right (+Z), -1 at left (-Z)

    // Asymmetric ovoid: slightly narrower rounded front finger strap, slightly fuller backstrap
    const frontFactor = c < 0 ? 1.0 - 0.14 * (-c) : 1.0 + 0.04 * c;
    const exp = THREE.MathUtils.lerp(2.45, 2.15, smoothstep(0.05, 0.45, t));

    const localBackX = spow(c, 2 / exp) * hx;
    const localZ = spow(s, 2 / exp) * hz * frontFactor;

    // Tilt lower stations perpendicular to the ~22° swept grip spine (+sin tilts rear UP, front DOWN -> clean rounded AK heel!)
    const baseTilt = 0.24 * smoothstep(0.60, 1.0, t);
    const px = cx - localBackX * Math.cos(baseTilt);
    const py = cy + localBackX * Math.sin(baseTilt);

    return { x: px, y: py, z: localZ };
  };

  // --- Sculpted Checkered Grip Body ---
  const tStations = [
    0.00, 0.04, 0.09, 0.15, 0.22, 0.30, 0.38, 0.46, 0.54, 0.62,
    0.70, 0.78, 0.85, 0.90, 0.94, 0.968, 0.984, 0.994, 1.00,
  ];
  const radialSegs = 40;

  // Track cumulative spine arc length so V scales at exact 1:1 physical ratio with U
  // -> guarantees crisp 45° diamond checkering with zero vertical/horizontal stretching!
  const spineCum = [0];
  for (let i = 1; i < tStations.length; i++) {
    const p0 = evalGripPoint(tStations[i - 1], Math.PI * 0.5);
    const p1 = evalGripPoint(tStations[i], Math.PI * 0.5);
    spineCum.push(spineCum[i - 1] + Math.hypot(p1.x - p0.x, p1.y - p0.y));
  }

  // Average perimeter at mid-height is ~1.21 units -> map 2.0 U repeats around circumference
  // and equivalent scale (2.0 / 1.21 ≈ 1.65) along spine V for exact 1:1 diamond aspect!
  const uvPerUnit = 2.0 / 1.21;
  const gripRings = [];

  for (let i = 0; i < tStations.length; i++) {
    const t = tStations[i];
    const pts = [];
    for (let j = 0; j <= radialSegs; j++) {
      // Seam placed cleanly on backstrap midline (theta = 0) with averaged normals
      const theta = (j / radialSegs) * Math.PI * 2;
      pts.push(evalGripPoint(t, theta));
    }

    const cumArc = [0];
    for (let j = 1; j <= radialSegs; j++) {
      cumArc.push(
        cumArc[j - 1] +
          Math.hypot(
            pts[j].x - pts[j - 1].x,
            pts[j].y - pts[j - 1].y,
            pts[j].z - pts[j - 1].z
          )
      );
    }
    const totalArc = cumArc[radialSegs] || 1;
    const vCoord = spineCum[i] * uvPerUnit;

    gripRings.push(
      pts.map((p, idx) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        u: (cumArc[idx] / totalArc) * 2.0,
        v: vCoord,
      }))
    );
  }

  const gripGeom = buildLoftGeometry(gripRings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 1.4,
    capUVMode: 'xz',
  });
  const gripMesh = new THREE.Mesh(gripGeom, materials.checkeredGrip);
  gripMesh.name = 'pistolGripBody';
  pistolGrip.add(gripMesh);

  // --- Top Stamped Steel Grip Ferrule Collar (hugging Y = -0.436 to -0.556 with rolled lower lip) ---
  const ferruleStations = [
    { y: -0.436, scaleX: 1.076, scaleZ: 1.096, exp: 3.1 }, // Flush upper flange seating into receiver underside
    { y: -0.448, scaleX: 1.084, scaleZ: 1.106, exp: 3.0 }, // Crisp stamped upper shoulder
    { y: -0.486, scaleX: 1.064, scaleZ: 1.082, exp: 2.7 }, // Tapered stamped steel collar body
    { y: -0.530, scaleX: 1.058, scaleZ: 1.074, exp: 2.55 }, // Lower ferrule wall
    { y: -0.542, scaleX: 1.084, scaleZ: 1.098, exp: 2.50 }, // Crisp rolled lower bead lip (catches rim light!)
    { y: -0.551, scaleX: 1.074, scaleZ: 1.088, exp: 2.48 }, // Lower bead return
    { y: -0.557, scaleX: 1.012, scaleZ: 1.016, exp: 2.45 }, // Clean bevel hugging checkered grip neck
  ];

  const fSegs = 36;
  const makeFerruleRing = (y, scaleX, scaleZ, exp, vCoord) => {
    const tApprox = clamp((-y - 0.515) / (1.448 - 0.515), 0, 0.08);
    const cx = THREE.MathUtils.lerp(-2.02, spineCenterX(tApprox), clamp((-y - 0.436) / 0.12, 0, 1));
    const hx = 0.176 * scaleX; // Max front edge <= -1.829, strictly behind -1.80!
    const hz = 0.129 * scaleZ;
    const ring = [];
    for (let j = 0; j <= fSegs; j++) {
      const frac = j / fSegs;
      const theta = frac * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const frontFactor = c < 0 ? 1.0 - 0.12 * (-c) : 1.0 + 0.03 * c;
      const px = cx - spow(c, 2 / exp) * hx;
      const pz = spow(s, 2 / exp) * hz * frontFactor;
      ring.push({ x: px, y, z: pz, u: frac * 2.0, v: vCoord });
    }
    return ring;
  };

  const ferruleRings = ferruleStations.map((st, idx) =>
    makeFerruleRing(st.y, st.scaleX, st.scaleZ, st.exp, idx / (ferruleStations.length - 1))
  );

  // Leave top un-capped on parkerized shell and close cleanly with dark recessed steel socket plate
  // so exploded view never displays a bright flat gray top disc!
  const ferruleGeom = buildLoftGeometry(ferruleRings, {
    capStart: false,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 2.0,
    capUVMode: 'xz',
  });
  const ferruleMesh = new THREE.Mesh(ferruleGeom, materials.parkerizedSteel);
  ferruleMesh.name = 'gripFerrule';
  pistolGrip.add(ferruleMesh);

  // Dark oxidized steel top socket plate & subtle recessed mounting stud (realistic in exploded view!)
  const topSocketRings = [
    makeFerruleRing(-0.4355, 1.074, 1.094, 3.1, 0),
    makeFerruleRing(-0.444, 1.068, 1.088, 3.1, 1),
  ];
  const topSocketGeom = buildLoftGeometry(topSocketRings, {
    capStart: true,
    capEnd: true,
    smoothSeam: true,
    capUVScale: 2.0,
    capUVMode: 'xz',
  });
  const topSocketMesh = new THREE.Mesh(topSocketGeom, materials.darkSteel);
  topSocketMesh.name = 'gripFerruleTopSocket';
  pistolGrip.add(topSocketMesh);

  // Subtle recessed dark-blued grip mounting screw stud centered in ferrule socket
  const studGeom = new THREE.CylinderGeometry(0.030, 0.034, 0.022, 18);
  const studMesh = new THREE.Mesh(studGeom, materials.bluedSteel);
  studMesh.position.set(-2.02, -0.432, 0);
  pistolGrip.add(studMesh);

  // --- Bottom Face Recessed Steel Grip-Nut Ferrule & Slotted Grip Screw ---
  const baseGroup = new THREE.Group();
  const baseCx = spineCenterX(1.0);
  const baseTilt = 0.24;
  baseGroup.position.set(baseCx, -1.448, 0);
  // Align cleanly perpendicular to the angled grip base face (-baseTilt tilts local -Y toward -X matching +sin tilt!)
  baseGroup.rotation.z = -baseTilt;

  // Stamped outer circular escutcheon washer flush with grip bottom
  const escOuterGeom = new THREE.CylinderGeometry(0.074, 0.078, 0.014, 24);
  const escOuter = new THREE.Mesh(escOuterGeom, materials.parkerizedSteel);
  escOuter.position.y = 0.002;
  baseGroup.add(escOuter);

  // Deep dark circular screw well cavity
  const wellGeom = new THREE.CylinderGeometry(0.060, 0.060, 0.016, 24);
  const well = new THREE.Mesh(wellGeom, materials.darkSteel);
  well.position.y = -0.001;
  baseGroup.add(well);

  // Recessed slotted steel grip retaining screw visible in bottom face
  const gripScrew = createSlottedScrew(0.048, materials, 0.55);
  gripScrew.position.y = -0.006;
  gripScrew.rotation.z = Math.PI;
  baseGroup.add(gripScrew);

  pistolGrip.add(baseGroup);

  pistolGrip.userData.explodeOffset = new THREE.Vector3(-0.15, -0.75, 0);
  enableShadows(pistolGrip);
  return pistolGrip;
}

// ---------------------------------------------------------------------------
// Public Entry Point
// ---------------------------------------------------------------------------

/**
 * Builds the complete AK-47 furniture assembly.
 *
 * @param {object} materials - Material set returned by createMaterials()
 * @returns {{ group: THREE.Group, parts: { buttstock: THREE.Group, lowerHandguard: THREE.Group, upperHandguard: THREE.Group, pistolGrip: THREE.Group } }}
 */
export function buildFurniture(materials) {
  const group = new THREE.Group();
  group.name = 'furnitureAssembly';

  const buttstock = buildButtstock(materials);
  const lowerHandguard = buildLowerHandguard(materials);
  const upperHandguard = buildUpperHandguard(materials);
  const pistolGrip = buildPistolGrip(materials);

  group.add(buttstock, lowerHandguard, upperHandguard, pistolGrip);

  return {
    group,
    parts: {
      buttstock,
      lowerHandguard,
      upperHandguard,
      pistolGrip,
    },
  };
}
