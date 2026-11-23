import * as THREE from 'three';

/**
 * AK-47 30-Round Curved Ribbed Steel Banana Magazine + 7.62x39mm Cartridges
 *
 * Coordinate System & Mating Contract (1 unit = 100 mm; 0.01 = 1 mm):
 *   +X = muzzle (forward), -X = buttstock (rearward), +Y = up, +Z = right, -Z = left.
 *   Origin (0, 0, 0) = bore axis at front face of receiver.
 *   Receiver magwell: Y = -0.44, X = -1.06 (rear) to -0.32 (front), Z = -0.135 to +0.135.
 *   Receiver magazine catch paddle meets rear magazine lug around X = -1.04..-1.12, Y = -0.44..-0.56.
 *
 * Pivot Hierarchy:
 *   `magazinePivot` is positioned at the front locking lug world (-0.34, -0.42, 0).
 *   All magazine geometry (`magazineBody`, `floorplate`, `cartridges`) is built in
 *   `magazinePivot`-local coordinates (offset by +0.34 in X, +0.42 in Y from world) so:
 *     - At default pose (rotation.z = 0), the magazine sits seated deep into the magwell
 *       up to world Y = -0.28 with zero air gap and front/rear lugs locked cleanly.
 *     - Rotating `magazinePivot.rotation.z` positively (0 -> +0.38 rad) rocks the bottom
 *       of the magazine forward toward the muzzle before sliding downward.
 */

// ---------------------------------------------------------------------------
// Geometry Constants & Arc Kinematics
// ---------------------------------------------------------------------------

const PIVOT_WORLD_X = -0.34;
const PIVOT_WORLD_Y = -0.42;

function toLocalX(wx) {
  return wx - PIVOT_WORLD_X;
}

function toLocalY(wy) {
  return wy - PIVOT_WORLD_Y;
}

// Authentic AK-47 30-round curved banana arc:
// World arc center (3.06, -0.28), radius R = 3.75 units (375 mm).
// At t = 0: centerline = (-0.69, -0.28); front wall = -0.352, rear wall = -1.028.
// At t = 0.56 rad (~32.1 deg): centerline = (-0.117, -2.272), arc length = 210 mm
// (+ feed lips 4.5 mm + floorplate 4 mm = 218.5 mm exact real AK-47 30-rd steel magazine!).
// Lowest floorplate rear heel sits at world Y = -2.492 (cleanly above museum floor Y = -2.55).
const ARC_R = 3.75;
const ARC_CX = toLocalX(3.06); // +3.40 in pivot-local space
const ARC_CY = toLocalY(-0.28); // +0.14 in pivot-local space
const T_MIN = 0.0;
const T_MAX = 0.56;

const MAG_HALF_DEPTH = 0.338; // 67.6 mm front-to-back shell depth
const MAG_HALF_WIDTH = 0.1225; // 24.5 mm nominal shell width (clears 27.0 mm magwell)
const MAG_WALL_THICK = 0.017; // 1.7 mm sheet-steel rim wall thickness

// ---------------------------------------------------------------------------
// Math & Mesh Utilities
// ---------------------------------------------------------------------------

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Orthonormal right-handed local frame at magazine arc angle `t`:
 *   center: (cx, cy) on arc centerline in magazinePivot-local coordinates
 *   fwd:    (+cos t, +sin t) pointing forward toward front wall (+X at t=0)
 *   up:     (-sin t, +cos t) pointing upward along arc tangent (+Y at t=0)
 *   down:   (+sin t, -cos t) pointing downward along arc tangent (-Y at t=0)
 * Note: fwd x up = +Z, and +Z x down = +fwd.
 */
function arcFrame(t) {
  const ct = Math.cos(t);
  const st = Math.sin(t);
  return {
    cx: ARC_CX - ARC_R * ct,
    cy: ARC_CY - ARC_R * st,
    fwdX: ct,
    fwdY: st,
    upX: -st,
    upY: ct,
    downX: st,
    downY: -ct,
  };
}

/**
 * Map magazine-arc local (t, u, z) into magazinePivot-local (x, y, z).
 * `u` is along fwd(t) (+ front, - rear); `z` is lateral (+ right, - left).
 */
function arcToLocal(t, u, z, out) {
  const ct = Math.cos(t);
  const st = Math.sin(t);
  const cx = ARC_CX - ARC_R * ct;
  const cy = ARC_CY - ARC_R * st;
  out.x = cx + u * ct;
  out.y = cy + u * st;
  out.z = z;
  return out;
}

function enableShadows(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return root;
}

/**
 * Smoothly average vertex normals across the closed UV seam (j = 0 and j = ringCount)
 * on a lofted BufferGeometry so lighting wraps across the front spine with zero crease.
 */
function stitchClosedSeamNormals(geometry, numStations, ringStride) {
  const norm = geometry.attributes.normal;
  if (!norm) return;
  for (let i = 0; i < numStations; i++) {
    const idx0 = i * ringStride;
    const idxLast = idx0 + (ringStride - 1);
    const nx = norm.getX(idx0) + norm.getX(idxLast);
    const ny = norm.getY(idx0) + norm.getY(idxLast);
    const nz = norm.getZ(idx0) + norm.getZ(idxLast);
    const len = Math.hypot(nx, ny, nz) || 1;
    const ux = nx / len;
    const uy = ny / len;
    const uz = nz / len;
    norm.setXYZ(idx0, ux, uy, uz);
    norm.setXYZ(idxLast, ux, uy, uz);
  }
  norm.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Cross-Section Profile & Stamped Rib Relief Field
// ---------------------------------------------------------------------------

/**
 * Base AK-47 stamped magazine flank half-width along u in [-0.292, +0.286]:
 * Captures the iconic tapered cartridge-matching cross-section with distinct
 * forward and rear longitudinal shoulder step ridges.
 */
function baseFlankHalfZ(u) {
  // Rear fluted narrow zone (u = -0.292..-0.242) -> steps out at u = -0.242..-0.202
  const rearStep = smoothstep(-0.246, -0.204, u);
  // Central cartridge-body main flank (u = -0.204..+0.092) -> steps in at u = +0.092..+0.138
  const fwdStep = 1.0 - smoothstep(0.088, 0.136, u);

  // Subtle taper from rear fluted panel (0.096) to forward bullet-nose panel (0.090)
  const noseTaper = lerp(0.096, 0.090, clamp01((u + 0.292) / 0.578));
  const mainShelf = 0.1225;

  // Combine stepped central body shelf with forward/rear fluted shoulders
  const centralMask = rearStep * fwdStep;
  // Forward mid-panel stays slightly fuller (0.104) before tapering to nose (0.090)
  const fwdPanelBoost = smoothstep(0.286, 0.132, u) * smoothstep(0.06, 0.132, u) * 0.011;

  return lerp(noseTaper + fwdPanelBoost, mainShelf, centralMask);
}

/**
 * Embossed sheet-metal relief added to flank |z| at (u, t):
 *   - Upper locking zone (t < 0.072): completely smooth inside magwell (Z <= 0.1225).
 *   - Upper reinforced collar step (t ~ 0.075..0.095) + subtle twin vertical upper ribs.
 *   - 3 bold curved/horizontal stiffening ribs embossed cleanly across both flanks.
 *   - Subtle stamped draw valleys between ribs + clean lower floorplate margin.
 */
function computeStampedRelief(u, t) {
  // Keep magwell insertion zone (Y > -0.46, t < 0.05) strictly clean so it clears Z = +/-0.135
  if (t <= 0.048) return 0.0;

  // Longitudinal envelope across the flank so ribs have cleanly rounded ends before front/rear corners
  const uMask = smoothstep(-0.260, -0.195, u) * (1.0 - smoothstep(0.165, 0.235, u));
  if (uMask <= 0.0001) return 0.0;

  let relief = 0.0;

  // 1. Subtle stepped transition below the reinforced upper locking-zone collar
  //    (upper collar t = 0.052..0.092 sits slightly proud before stepping to the ribbed panel)
  const collarFadeIn = smoothstep(0.050, 0.062, t);
  const collarStepOut = 1.0 - smoothstep(0.084, 0.100, t);
  const collarUMask = smoothstep(-0.235, -0.180, u) * (1.0 - smoothstep(0.115, 0.175, u));
  relief += 0.0055 * collarFadeIn * collarStepOut * collarUMask;

  // Pair of subtle vertical guide flats in upper locking transition zone
  const upperVertT = smoothstep(0.058, 0.072, t) * (1.0 - smoothstep(0.105, 0.122, t));
  if (upperVertT > 0) {
    const vRib1 = Math.exp(-Math.pow((u - 0.035) / 0.022, 2));
    const vRib2 = Math.exp(-Math.pow((u + 0.135) / 0.022, 2));
    relief += 0.005 * upperVertT * (vRib1 + vRib2);
  }

  // 2. Three iconic bold horizontal/curved stiffening ribs following constant-t arc radii
  const ribCenters = [0.180, 0.305, 0.430];
  const plateauHalf = 0.0165; // Crisp flat-crowned rib crest (~12.4 mm wide)
  const bevelWidth = 0.0095; // Razor-crisp stamped sheet-metal bevel flank (~3.6 mm)
  const ribHeight = 0.024; // Bold 2.4 mm outward steel emboss per side

  let ribMax = 0.0;
  for (let k = 0; k < ribCenters.length; k++) {
    const dt = Math.abs(t - ribCenters[k]);
    if (dt < plateauHalf + bevelWidth) {
      const profile = 1.0 - smoothstep(plateauHalf, plateauHalf + bevelWidth, dt);
      if (profile > ribMax) ribMax = profile;
    }
  }
  relief += ribHeight * ribMax * uMask;

  // 3. Subtle concave sheet-metal draw in the valleys between ribs for crisp studio light contrast
  const valleyBodyMask = smoothstep(0.105, 0.135, t) * (1.0 - smoothstep(0.480, 0.510, t));
  const valleyUMask = smoothstep(-0.210, -0.155, u) * (1.0 - smoothstep(0.085, 0.145, u));
  if (valleyBodyMask > 0 && valleyUMask > 0) {
    relief -= 0.0038 * valleyBodyMask * valleyUMask * (1.0 - ribMax);
  }

  // 4. Crisp subtle longitudinal strengthening crease along forward & rear shoulder steps
  const longMask = smoothstep(0.095, 0.125, t) * (1.0 - smoothstep(0.495, 0.525, t));
  if (longMask > 0) {
    const fwdCrease = Math.exp(-Math.pow((u - 0.108) / 0.014, 2));
    const rearCrease = Math.exp(-Math.pow((u + 0.218) / 0.014, 2));
    relief += 0.0045 * longMask * (fwdCrease + rearCrease) * (1.0 - 0.5 * ribMax);
  }

  return relief;
}

// Precomputed u-sampling along the right flank from front corner (+0.286) to rear corner (-0.292)
// Clustered tightly around the forward step (+0.085..+0.145) and rear step (-0.198..-0.254)
const FLANK_U_SAMPLES = [
  0.268, 0.246, 0.220, 0.192, 0.166,
  0.146, 0.132, 0.118, 0.104, 0.090,
  0.072, 0.046, 0.016, -0.018, -0.054,
  -0.090, -0.126, -0.160, -0.188,
  -0.204, -0.218, -0.232, -0.246, -0.262, -0.278,
];

/**
 * Generates one closed cross-section ring of (u, z) coordinates ordered strictly CCW
 * in the (u, z) plane starting and ending at Front Center (+MAG_HALF_DEPTH, 0):
 *   Front Center -> Front-Right Corner -> Right Flank -> Rear-Right Corner
 *   -> Rear Center -> Rear-Left Corner -> Left Flank -> Front-Left Corner -> Front Center.
 *
 * `options`:
 *   - `t`: arc angle for stamped relief (ignored when `withRelief === false`)
 *   - `withRelief`: include stamped AK ribs & steps
 *   - `inset`: uniform inward wall offset for hollow inner throat
 *   - `scaleU`, `scaleZ`: scaling factors (e.g. flared floorplate)
 */
function sampleCrossSectionRing({
  t = 0,
  withRelief = true,
  inset = 0,
  scaleU = 1,
  scaleZ = 1,
} = {}) {
  const halfPts = []; // Right side from front center (z=0) to rear center (z=0)
  const frontArcSteps = 7;
  const rearArcSteps = 7;

  const frontStartU = 0.286;
  const frontNoseLen = MAG_HALF_DEPTH - frontStartU; // 0.052
  const frontCornerZ = baseFlankHalfZ(frontStartU); // 0.090

  const rearEndU = -0.292;
  const rearNoseLen = MAG_HALF_DEPTH + rearEndU; // 0.046
  const rearCornerZ = baseFlankHalfZ(rearEndU); // 0.096

  // 1. Front-right rounded corner arc (alpha = 0..pi/2)
  for (let k = 0; k <= frontArcSteps; k++) {
    const a = (k / frontArcSteps) * (Math.PI * 0.5);
    const u = frontStartU + frontNoseLen * Math.cos(a);
    const z = frontCornerZ * Math.sin(a);
    halfPts.push([u, z]);
  }

  // 2. Right flank from front corner down to rear corner
  for (let k = 0; k < FLANK_U_SAMPLES.length; k++) {
    const u = FLANK_U_SAMPLES[k];
    const z = baseFlankHalfZ(u) + (withRelief ? computeStampedRelief(u, t) : 0);
    halfPts.push([u, z]);
  }

  // 3. Rear-right rounded corner arc (beta = 0..pi/2)
  for (let k = 0; k <= rearArcSteps; k++) {
    const b = (k / rearArcSteps) * (Math.PI * 0.5);
    const u = rearEndU - rearNoseLen * Math.sin(b);
    const z = rearCornerZ * Math.cos(b);
    halfPts.push([u, z]);
  }

  // Assemble full closed CCW ring (front -> right -> rear -> left -> front)
  const rawRing = [];
  for (let k = 0; k < halfPts.length; k++) {
    rawRing.push([halfPts[k][0], halfPts[k][1]]);
  }
  for (let k = halfPts.length - 2; k >= 0; k--) {
    rawRing.push([halfPts[k][0], -halfPts[k][1]]);
  }

  // Apply optional inward wall inset or floorplate scaling
  const ring = [];
  const uScaleInset = inset > 0 ? (MAG_HALF_DEPTH - inset) / MAG_HALF_DEPTH : 1;
  const zScaleInset = inset > 0 ? (MAG_HALF_WIDTH - inset) / MAG_HALF_WIDTH : 1;

  for (let k = 0; k < rawRing.length; k++) {
    const u = rawRing[k][0] * uScaleInset * scaleU;
    const z = rawRing[k][1] * zScaleInset * scaleZ;
    ring.push([u, z]);
  }
  return ring;
}

/**
 * Generates an adaptive sorted array of arc parameter `t` stations in [T_MIN, T_MAX]
 * with dense clustering across all stamped rib bevels and upper collar transitions so
 * vertex normals stay razor-crisp on every stamped steel ridge.
 */
function buildAdaptiveArcStations() {
  const keyBands = [
    // [start, end, step]
    [0.000, 0.048, 0.012], // Inside magwell smooth zone
    [0.048, 0.125, 0.0045], // Upper locking collar step & vertical upper flats
    [0.125, 0.144, 0.0095],
    [0.144, 0.216, 0.0040], // Rib 1 (center 0.180)
    [0.216, 0.268, 0.0085],
    [0.268, 0.342, 0.0040], // Rib 2 (center 0.305)
    [0.342, 0.394, 0.0085],
    [0.394, 0.466, 0.0040], // Rib 3 (center 0.430)
    [0.466, 0.515, 0.0080],
    [0.515, T_MAX, 0.0090], // Smooth lower floorplate seating margin
  ];

  const stations = [T_MIN];
  for (let b = 0; b < keyBands.length; b++) {
    const [t0, t1, step] = keyBands[b];
    const n = Math.max(1, Math.round((t1 - t0) / step));
    for (let i = 1; i <= n; i++) {
      const val = t0 + (t1 - t0) * (i / n);
      if (val > stations[stations.length - 1] + 1e-5) {
        stations.push(Math.min(T_MAX, val));
      }
    }
  }
  stations[stations.length - 1] = T_MAX;
  return stations;
}

// ---------------------------------------------------------------------------
// 1. Sculpted Curved Ribbed Magazine Shell + Hollow Throat + Spine Details
// ---------------------------------------------------------------------------

function buildMagazineShellGeometry() {
  const stations = buildAdaptiveArcStations();
  const numStations = stations.length;
  const sample0 = sampleCrossSectionRing({ t: 0, withRelief: true });
  const ringStride = sample0.length; // Includes closed duplicate endpoint (j = ringStride - 1)

  // Compute cumulative perimeter U parameterization on nominal ring so texture stays uniform
  const ringU = new Float32Array(ringStride);
  let totalPerim = 0;
  for (let j = 1; j < ringStride; j++) {
    const du = sample0[j][0] - sample0[j - 1][0];
    const dz = sample0[j][1] - sample0[j - 1][1];
    totalPerim += Math.hypot(du, dz);
    ringU[j] = totalPerim;
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const pt = new THREE.Vector3();

  // Scale UVs cleanly (~0.65 world units per texture repeat) so parkerizedSteel micro-grain looks crisp
  const uvScale = 1.45;

  for (let i = 0; i < numStations; i++) {
    const t = stations[i];
    const ring = sampleCrossSectionRing({ t, withRelief: true });
    const vCoord = t * ARC_R * uvScale;

    for (let j = 0; j < ringStride; j++) {
      const [u, z] = ring[j];
      arcToLocal(t, u, z, pt);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(ringU[j] * uvScale, vCoord);
    }
  }

  // Proven outward winding:
  //   dP/di = down(t), dP/dj = +Z at front => dP/dj x dP/di = +fwd(t) (OUTWARD)
  //   Quad (a, d, b) and (d, c, b) where a=(i,j), b=(i+1,j), c=(i+1,j+1), d=(i,j+1).
  for (let i = 0; i < numStations - 1; i++) {
    const row0 = i * ringStride;
    const row1 = (i + 1) * ringStride;
    for (let j = 0; j < ringStride - 1; j++) {
      const a = row0 + j;
      const b = row1 + j;
      const c = row1 + j + 1;
      const d = row0 + j + 1;
      indices.push(a, d, b, d, c, b);
    }
  }

  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shellGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  shellGeo.setIndex(indices);
  shellGeo.computeVertexNormals();
  stitchClosedSeamNormals(shellGeo, numStations, ringStride);

  return shellGeo;
}

/**
 * Bottom closing cap at t = T_MAX (hidden cleanly inside floorplate, outward normal = +down).
 */
function buildMagazineBottomCapGeometry() {
  const ring = sampleCrossSectionRing({ t: T_MAX, withRelief: true });
  const ringStride = ring.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  const pt = new THREE.Vector3();

  // Center vertex
  arcToLocal(T_MAX, 0, 0, pt);
  positions.push(pt.x, pt.y, pt.z);
  uvs.push(0.5, 0.5);

  for (let j = 0; j < ringStride; j++) {
    const [u, z] = ring[j];
    arcToLocal(T_MAX, u, z, pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(0.5 + u, 0.5 + z);
  }

  // (v_j - center) x (v_{j+1} - center) = +fwd x +Z = +down(T_MAX) (OUTWARD)
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(0, 1 + j, 1 + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Top sheet-metal rim bevel at t = 0 (outward normal = +Y) so looking down at a detached
 * or exploded magazine reveals genuine stamped wall thickness.
 */
function buildTopRimLipGeometry() {
  const outerRing = sampleCrossSectionRing({ t: 0, withRelief: false, inset: 0 });
  const innerRing = sampleCrossSectionRing({ t: 0, withRelief: false, inset: MAG_WALL_THICK });
  const ringStride = outerRing.length;

  const positions = [];
  const uvs = [];
  const indices = [];
  const pt = new THREE.Vector3();

  for (let j = 0; j < ringStride; j++) {
    arcToLocal(0, outerRing[j][0], outerRing[j][1], pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(j / (ringStride - 1), 0);
  }
  for (let j = 0; j < ringStride; j++) {
    arcToLocal(0, innerRing[j][0], innerRing[j][1], pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(j / (ringStride - 1), 1);
  }

  // Proven upward (+Y) winding: (o_j, i_j, o_{j+1}) and (i_j, i_{j+1}, o_{j+1})
  for (let j = 0; j < ringStride - 1; j++) {
    const o0 = j;
    const o1 = j + 1;
    const i0 = ringStride + j;
    const i1 = ringStride + j + 1;
    indices.push(o0, i0, o1, i0, i1, o1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Dark recessed hollow interior cavity sleeve running from t = 0 down to t = 0.125
 * with inward-facing normals + dark floor plug so top-down views look truly hollow.
 */
function buildInnerThroatGeometry() {
  const throatStations = 10;
  const tEnd = 0.125;
  const innerRing = sampleCrossSectionRing({ t: 0, withRelief: false, inset: MAG_WALL_THICK });
  const ringStride = innerRing.length;

  const positions = [];
  const uvs = [];
  const indices = [];
  const pt = new THREE.Vector3();

  for (let i = 0; i <= throatStations; i++) {
    const t = (i / throatStations) * tEnd;
    for (let j = 0; j < ringStride; j++) {
      arcToLocal(t, innerRing[j][0], innerRing[j][1], pt);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(j / (ringStride - 1), i / throatStations);
    }
  }

  // Inward-facing normals (reversed winding vs outer shell): (a, b, d) and (d, b, c)
  for (let i = 0; i < throatStations; i++) {
    const row0 = i * ringStride;
    const row1 = (i + 1) * ringStride;
    for (let j = 0; j < ringStride - 1; j++) {
      const a = row0 + j;
      const b = row1 + j;
      const c = row1 + j + 1;
      const d = row0 + j + 1;
      indices.push(a, b, d, d, b, c);
    }
  }

  // Upward-facing dark floor cap at t = tEnd inside the throat (normal = +up(tEnd))
  const capCenterIdx = positions.length / 3;
  arcToLocal(tEnd, 0, 0, pt);
  positions.push(pt.x, pt.y, pt.z);
  uvs.push(0.5, 0.5);

  const capRingStart = positions.length / 3;
  for (let j = 0; j < ringStride; j++) {
    arcToLocal(tEnd, innerRing[j][0], innerRing[j][1], pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(0.5 + innerRing[j][0], 0.5 + innerRing[j][1]);
  }
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(capCenterIdx, capRingStart + j + 1, capRingStart + j);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Lofted beveled steel strip following the magazine arc along either the rear welded spine
 * or front stamped seam crease. `profile2D` is a closed CCW loop of [u, z] points.
 */
function buildArcLoftedStripGeometry(profile2D, tStart, tEnd, segments = 44) {
  const ringStride = profile2D.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  const pt = new THREE.Vector3();

  // Compute perimeter U coords
  const pU = new Float32Array(ringStride);
  let perim = 0;
  for (let j = 1; j < ringStride; j++) {
    perim += Math.hypot(
      profile2D[j][0] - profile2D[j - 1][0],
      profile2D[j][1] - profile2D[j - 1][1]
    );
    pU[j] = perim;
  }

  const uvScale = 1.6;
  for (let i = 0; i <= segments; i++) {
    const t = lerp(tStart, tEnd, i / segments);
    const vCoord = (t - tStart) * ARC_R * uvScale;
    for (let j = 0; j < ringStride; j++) {
      arcToLocal(t, profile2D[j][0], profile2D[j][1], pt);
      positions.push(pt.x, pt.y, pt.z);
      uvs.push(pU[j] * uvScale, vCoord);
    }
  }

  // Outward winding for CCW (u, z) ring advancing in +t (downward): (a, d, b), (d, c, b)
  for (let i = 0; i < segments; i++) {
    const row0 = i * ringStride;
    const row1 = (i + 1) * ringStride;
    for (let j = 0; j < ringStride - 1; j++) {
      const a = row0 + j;
      const b = row1 + j;
      const c = row1 + j + 1;
      const d = row0 + j + 1;
      indices.push(a, d, b, d, c, b);
    }
  }

  // Cap top end (tStart, normal = +up) and bottom end (tEnd, normal = +down)
  let avgU = 0;
  let avgZ = 0;
  for (let j = 0; j < ringStride - 1; j++) {
    avgU += profile2D[j][0];
    avgZ += profile2D[j][1];
  }
  avgU /= ringStride - 1;
  avgZ /= ringStride - 1;

  // Top cap (+up)
  const topCenter = positions.length / 3;
  arcToLocal(tStart, avgU, avgZ, pt);
  positions.push(pt.x, pt.y, pt.z);
  uvs.push(0.5, 0.5);
  const topStart = positions.length / 3;
  for (let j = 0; j < ringStride; j++) {
    arcToLocal(tStart, profile2D[j][0], profile2D[j][1], pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(0.5 + (profile2D[j][0] - avgU) * 4, 0.5 + (profile2D[j][1] - avgZ) * 4);
  }
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(topCenter, topStart + j + 1, topStart + j);
  }

  // Bottom cap (+down)
  const botCenter = positions.length / 3;
  arcToLocal(tEnd, avgU, avgZ, pt);
  positions.push(pt.x, pt.y, pt.z);
  uvs.push(0.5, 0.5);
  const botStart = positions.length / 3;
  for (let j = 0; j < ringStride; j++) {
    arcToLocal(tEnd, profile2D[j][0], profile2D[j][1], pt);
    positions.push(pt.x, pt.y, pt.z);
    uvs.push(0.5 + (profile2D[j][0] - avgU) * 4, 0.5 + (profile2D[j][1] - avgZ) * 4);
  }
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(botCenter, botStart + j, botStart + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Raised welded rear spine rib + 30-round witness hole + subtle Izhmash spot-weld dimples,
 * plus a subtle stamped front spine seam bead along the front curve.
 */
function buildSpineDetails(materials) {
  const spineGroup = new THREE.Group();
  spineGroup.name = 'magazineSpineDetails';

  // Raised welded rear spine strip (CCW in (u, z) plane):
  // Embedded at u = -0.328 inside rear mag wall, proud out to u = -0.354 with crisp chamfer
  const rearSpineProfile = [
    [-0.328, 0.0],
    [-0.328, 0.036],
    [-0.346, 0.035],
    [-0.354, 0.026],
    [-0.354, 0.0],
    [-0.354, -0.026],
    [-0.346, -0.035],
    [-0.328, -0.036],
    [-0.328, 0.0],
  ];
  const rearSpineGeo = buildArcLoftedStripGeometry(rearSpineProfile, 0.004, T_MAX - 0.004, 48);
  const rearSpineMesh = new THREE.Mesh(rearSpineGeo, materials.parkerizedSteel);
  rearSpineMesh.name = 'rearWeldedSpine';
  spineGroup.add(rearSpineMesh);

  // Subtle stamped front spine seam ridge along the exposed lower front curve
  const frontSeamProfile = [
    [0.345, 0.0],
    [0.342, 0.015],
    [0.330, 0.024],
    [0.330, 0.0],
    [0.330, -0.024],
    [0.342, -0.015],
    [0.345, 0.0],
  ];
  const frontSeamGeo = buildArcLoftedStripGeometry(frontSeamProfile, 0.075, T_MAX - 0.004, 36);
  const frontSeamMesh = new THREE.Mesh(frontSeamGeo, materials.parkerizedSteel);
  frontSeamMesh.name = 'frontStampedSeam';
  spineGroup.add(frontSeamMesh);

  // Iconic 30-round witness hole on the rear spine near the bottom (t = 0.495, ~24 mm above base)
  const tHole = 0.495;
  const fHole = arcFrame(tHole);
  const witnessGroup = new THREE.Group();
  witnessGroup.name = 'witnessHole30Rd';
  // Place right on outer surface of rear spine (u = -0.354)
  witnessGroup.position.set(
    fHole.cx - 0.354 * fHole.fwdX,
    fHole.cy - 0.354 * fHole.fwdY,
    0
  );
  // Align local +Y with outward rear normal (-fwdX, -fwdY, 0):
  // Default Cylinder axis is +Y; rotating by Z = tHole + Math.PI/2 maps +Y -> (-cos t, -sin t) = -fwd!
  witnessGroup.rotation.z = tHole + Math.PI * 0.5;

  // Chamfered steel rim around witness hole
  const rimGeo = new THREE.TorusGeometry(0.018, 0.0038, 12, 28);
  rimGeo.rotateX(Math.PI * 0.5);
  const rimMesh = new THREE.Mesh(rimGeo, materials.parkerizedSteel);
  rimMesh.position.y = 0.0018;
  witnessGroup.add(rimMesh);

  // Deep dark circular witness hole opening
  const holeGeo = new THREE.CylinderGeometry(0.0165, 0.0165, 0.0035, 24);
  const holeMesh = new THREE.Mesh(holeGeo, materials.darkSteel);
  holeMesh.position.y = 0.0006;
  witnessGroup.add(holeMesh);

  // Subtle hint of brass 30th cartridge case head visible recessed inside the witness hole
  const brassGlintGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.0016, 20);
  const brassGlintMesh = new THREE.Mesh(brassGlintGeo, materials.brass);
  brassGlintMesh.position.y = 0.0018;
  witnessGroup.add(brassGlintMesh);

  spineGroup.add(witnessGroup);

  // Subtle spot-weld dimples along the rear welded spine seam (authentic stamped steel craft)
  const weldGeo = new THREE.CylinderGeometry(0.0085, 0.0095, 0.003, 14);
  const weldTs = [0.115, 0.195, 0.275, 0.355, 0.435];
  for (let i = 0; i < weldTs.length; i++) {
    const fw = arcFrame(weldTs[i]);
    const weld = new THREE.Mesh(weldGeo, materials.parkerizedSteel);
    weld.position.set(fw.cx - 0.3545 * fw.fwdX, fw.cy - 0.3545 * fw.fwdY, 0);
    weld.rotation.z = weldTs[i] + Math.PI * 0.5;
    spineGroup.add(weld);
  }

  return spineGroup;
}

// ---------------------------------------------------------------------------
// 2. Front & Rear Locking Lugs (exact mating with receiver magwell & catch)
// ---------------------------------------------------------------------------

function buildLockingLugs(materials) {
  const lugsGroup = new THREE.Group();
  lugsGroup.name = 'magazineLockingLugs';

  // --- A. Front Locking Hook Lug ---
  // Centered around world (X = -0.34, Y = -0.40, Z = 0) -> local (0.00, +0.02, 0).
  // Front wall of mag sits at world X = -0.352 (local -0.012); lug hooks forward to world X = -0.276.
  const frontLugShape = new THREE.Shape();
  frontLugShape.moveTo(toLocalX(-0.372), toLocalY(-0.434));
  frontLugShape.lineTo(toLocalX(-0.300), toLocalY(-0.434));
  frontLugShape.lineTo(toLocalX(-0.276), toLocalY(-0.412)); // Angled lower lead-in cam
  frontLugShape.lineTo(toLocalX(-0.276), toLocalY(-0.382)); // Vertical front nose
  frontLugShape.lineTo(toLocalX(-0.284), toLocalY(-0.374)); // Crisp top bevel
  frontLugShape.lineTo(toLocalX(-0.372), toLocalY(-0.374)); // Flat upper locking shelf
  frontLugShape.closePath();

  const frontLugWidth = 0.138;
  const frontLugGeo = new THREE.ExtrudeGeometry(frontLugShape, {
    depth: frontLugWidth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.0045,
    bevelSegments: 3,
  });
  frontLugGeo.translate(0, 0, -frontLugWidth * 0.5);
  const frontLugMesh = new THREE.Mesh(frontLugGeo, materials.parkerizedSteel);
  frontLugMesh.name = 'frontLockingLug';
  lugsGroup.add(frontLugMesh);

  // Stamped front lug reinforcement gusset collar hugging the tapered front nose cleanly
  const frontPlateShape = new THREE.Shape();
  frontPlateShape.moveTo(toLocalX(-0.398), toLocalY(-0.448));
  frontPlateShape.lineTo(toLocalX(-0.348), toLocalY(-0.448));
  frontPlateShape.lineTo(toLocalX(-0.348), toLocalY(-0.354));
  frontPlateShape.lineTo(toLocalX(-0.398), toLocalY(-0.354));
  frontPlateShape.closePath();

  const frontPlateW = 0.146; // Fits snugly inside tapered front nose width (~0.175) with zero protruding corners
  const frontPlateGeo = new THREE.ExtrudeGeometry(frontPlateShape, {
    depth: frontPlateW,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  frontPlateGeo.translate(0, 0, -frontPlateW * 0.5);
  const frontPlateMesh = new THREE.Mesh(frontPlateGeo, materials.parkerizedSteel);
  lugsGroup.add(frontPlateMesh);

  // --- B. Rear Locking Catch Lug ---
  // Centered around world (X = -1.04, Y = -0.44, Z = 0) -> local (-0.70, -0.02, 0).
  // Projects cleanly rearward to world X = -1.112 to engage the receiver's magazine catch paddle
  // at X = -1.12, Y = -0.56 with authentic horizontal locking shelf and lower cam ramp!
  const rearLugShape = new THREE.Shape();
  rearLugShape.moveTo(toLocalX(-1.012), toLocalY(-0.548));
  rearLugShape.lineTo(toLocalX(-1.042), toLocalY(-0.542));
  rearLugShape.lineTo(toLocalX(-1.106), toLocalY(-0.494)); // Angled lower insertion cam ramp
  rearLugShape.lineTo(toLocalX(-1.112), toLocalY(-0.486)); // Crisp catch latch corner
  rearLugShape.lineTo(toLocalX(-1.112), toLocalY(-0.446)); // Rear engagement face
  rearLugShape.lineTo(toLocalX(-1.104), toLocalY(-0.438)); // Top chamfer under magwell lip
  rearLugShape.lineTo(toLocalX(-1.012), toLocalY(-0.438));
  rearLugShape.closePath();

  const rearLugWidth = 0.136;
  const rearLugGeo = new THREE.ExtrudeGeometry(rearLugShape, {
    depth: rearLugWidth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.0045,
    bevelSegments: 3,
  });
  rearLugGeo.translate(0, 0, -rearLugWidth * 0.5);
  const rearLugMesh = new THREE.Mesh(rearLugGeo, materials.parkerizedSteel);
  rearLugMesh.name = 'rearLockingLug';
  lugsGroup.add(rearLugMesh);

  // Stamped rear reinforcement collar hugging the tapered rear spine cleanly
  const rearCollarShape = new THREE.Shape();
  rearCollarShape.moveTo(toLocalX(-1.044), toLocalY(-0.556));
  rearCollarShape.lineTo(toLocalX(-0.996), toLocalY(-0.556));
  rearCollarShape.lineTo(toLocalX(-0.996), toLocalY(-0.415));
  rearCollarShape.lineTo(toLocalX(-1.044), toLocalY(-0.415));
  rearCollarShape.closePath();

  const rearCollarW = 0.148;
  const rearCollarGeo = new THREE.ExtrudeGeometry(rearCollarShape, {
    depth: rearCollarW,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.003,
    bevelSegments: 2,
  });
  rearCollarGeo.translate(0, 0, -rearCollarW * 0.5);
  const rearCollarMesh = new THREE.Mesh(rearCollarGeo, materials.parkerizedSteel);
  lugsGroup.add(rearCollarMesh);

  // Tiny reinforcement rivet pins on rear lug collar sides
  const rivetGeo = new THREE.CylinderGeometry(0.009, 0.009, rearCollarW + 0.014, 14);
  rivetGeo.rotateX(Math.PI * 0.5);
  const rivet1 = new THREE.Mesh(rivetGeo, materials.darkSteel);
  rivet1.position.set(toLocalX(-1.018), toLocalY(-0.468), 0);
  lugsGroup.add(rivet1);

  const rivet2 = new THREE.Mesh(rivetGeo, materials.darkSteel);
  rivet2.position.set(toLocalX(-1.018), toLocalY(-0.520), 0);
  lugsGroup.add(rivet2);

  return lugsGroup;
}

// ---------------------------------------------------------------------------
// 3. Curved Feed Lips, Rear Bolt-Channel Collar & Stepped Steel Follower Plate
// ---------------------------------------------------------------------------

function buildFeedLipsAndFollower(materials) {
  const topGroup = new THREE.Group();
  topGroup.name = 'feedLipsAndFollower';

  // Right (+Z) and Left (-Z) curved stamped-steel feed lips spanning world X = -1.018 to -0.562
  // Outer wall sits flush with magazine shell (|Z| = 0.120 + 0.0025 bevel = 0.1225) and front tip
  // sweeps forward/down cleanly into the top rim like real formed sheet-steel AK feed lips!
  function createFeedLipMesh(sideSign) {
    // Points for right side (sideSign = +1) traced CCW in (z, y) plane:
    const pts = [
      [0.120, -0.285],
      [0.119, -0.258],
      [0.105, -0.236],
      [0.082, -0.224],
      [0.058, -0.225],
      [0.053, -0.232],
      [0.057, -0.239],
      [0.077, -0.239],
      [0.095, -0.247],
      [0.105, -0.264],
      [0.106, -0.285],
    ];

    const shape = new THREE.Shape();
    if (sideSign > 0) {
      shape.moveTo(pts[0][0], toLocalY(pts[0][1]));
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], toLocalY(pts[i][1]));
      }
    } else {
      // Mirror Z and reverse order so 2D contour remains strictly CCW (outward normals!)
      const last = pts.length - 1;
      shape.moveTo(-pts[last][0], toLocalY(pts[last][1]));
      for (let i = last - 1; i >= 0; i--) {
        shape.lineTo(-pts[i][0], toLocalY(pts[i][1]));
      }
    }
    shape.closePath();

    const lipLen = 0.452; // World X = -1.018 to -0.566
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: lipLen,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.0024,
      bevelSegments: 3,
    });
    // Taper the forward 0.060 of the feed lip smoothly downward toward the front rim (world Y = -0.280)
    // and gently follow the outer tapered wall near the rear end so it merges seamlessly!
    const pos = geo.attributes.position;
    const baseLocalY = toLocalY(-0.285);
    for (let i = 0; i < pos.count; i++) {
      const zExtrude = pos.getZ(i); // 0 = rear (-1.018), lipLen = front (-0.566)
      if (zExtrude > lipLen - 0.065) {
        const s = smoothstep(lipLen - 0.065, lipLen + 0.004, zExtrude);
        const curY = pos.getY(i);
        // Slope the upper arch gently down by 24% at the front cartridge-release ramp
        pos.setY(i, lerp(curY, lerp(baseLocalY, curY, 0.72), s));
      }
    }
    geo.computeVertexNormals();
    geo.rotateY(Math.PI * 0.5);
    geo.translate(toLocalX(-1.018), 0, 0);

    const mesh = new THREE.Mesh(geo, materials.darkSteel);
    mesh.name = sideSign > 0 ? 'feedLipLeft' : 'feedLipRight';
    return mesh;
  }

  // Pass -1 for right (+Z after rotateY(+PI/2)) and +1 for left (-Z)
  topGroup.add(createFeedLipMesh(-1));
  topGroup.add(createFeedLipMesh(1));

  // Rear feed-lip backstop shoulder with central bolt-stripper U-notch (world X = -1.028..-1.008)
  const rearWallShape = new THREE.Shape();
  rearWallShape.moveTo(-0.104, toLocalY(-0.286));
  rearWallShape.lineTo(0.104, toLocalY(-0.286));
  rearWallShape.lineTo(0.102, toLocalY(-0.242));
  rearWallShape.lineTo(0.056, toLocalY(-0.242));
  rearWallShape.lineTo(0.046, toLocalY(-0.276)); // Central bolt-lug passage U-slot
  rearWallShape.lineTo(-0.046, toLocalY(-0.276));
  rearWallShape.lineTo(-0.056, toLocalY(-0.242));
  rearWallShape.lineTo(-0.102, toLocalY(-0.242));
  rearWallShape.closePath();

  const rearWallGeo = new THREE.ExtrudeGeometry(rearWallShape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  rearWallGeo.rotateY(Math.PI * 0.5);
  rearWallGeo.translate(toLocalX(-1.027), 0, 0);
  const rearWallMesh = new THREE.Mesh(rearWallGeo, materials.darkSteel);
  rearWallMesh.name = 'rearFeedLipBackstop';
  topGroup.add(rearWallMesh);

  // Front bullet-guide clearance rim corners (left & right corners rise slightly, notched in center)
  const frontLipShape = new THREE.Shape();
  frontLipShape.moveTo(-0.088, toLocalY(-0.286));
  frontLipShape.lineTo(0.088, toLocalY(-0.286));
  frontLipShape.lineTo(0.084, toLocalY(-0.264));
  frontLipShape.lineTo(0.052, toLocalY(-0.264));
  frontLipShape.lineTo(0.044, toLocalY(-0.280)); // Bullet nose feed notch
  frontLipShape.lineTo(-0.044, toLocalY(-0.280));
  frontLipShape.lineTo(-0.052, toLocalY(-0.264));
  frontLipShape.lineTo(-0.084, toLocalY(-0.264));
  frontLipShape.closePath();

  const frontLipGeo = new THREE.ExtrudeGeometry(frontLipShape, {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  frontLipGeo.rotateY(Math.PI * 0.5);
  frontLipGeo.translate(toLocalX(-0.370), 0, 0);
  const frontLipMesh = new THREE.Mesh(frontLipGeo, materials.darkSteel);
  frontLipMesh.name = 'frontBulletGuideNotch';
  topGroup.add(frontLipMesh);

  // Stamped asymmetric stepped AK-47 steel follower plate visible inside throat below cartridges
  // Stepped ridge on +Z right side cradles the lower-left staggered second round cleanly
  const followerShape = new THREE.Shape();
  // Drawn in (z_in, y_in) then rotated by rotateY(+PI/2) (z_world = -z_in)
  followerShape.moveTo(-0.096, -0.028);
  followerShape.lineTo(0.096, -0.028);
  followerShape.lineTo(0.096, 0.006);
  followerShape.lineTo(0.016, 0.008); // Lower cradle shelf for left-side cartridge 2
  followerShape.lineTo(-0.004, 0.036); // Asymmetric step shoulder
  followerShape.lineTo(-0.072, 0.036); // Raised anti-tilt dummy-round rib on right side
  followerShape.lineTo(-0.096, 0.014);
  followerShape.closePath();

  const followerLen = 0.56;
  const followerGeo = new THREE.ExtrudeGeometry(followerShape, {
    depth: followerLen,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  followerGeo.rotateY(Math.PI * 0.5);
  followerGeo.translate(-followerLen * 0.5, 0, 0);

  const followerMesh = new THREE.Mesh(followerGeo, materials.parkerizedSteel);
  followerMesh.name = 'magazineFollowerPlate';
  followerMesh.position.set(toLocalX(-0.715), toLocalY(-0.452), 0);
  followerMesh.rotation.z = 0.11; // ~6.3 deg nose-up matching cartridge stack angle
  topGroup.add(followerMesh);

  return topGroup;
}

// ---------------------------------------------------------------------------
// 4. Stamped Flared Floorplate (`parts.floorplate`)
// ---------------------------------------------------------------------------

function buildFloorplate(materials) {
  const floorplate = new THREE.Group();
  floorplate.name = 'floorplate';

  // Position cleanly at bottom arc station t = T_MAX and align perpendicular to arc tangent:
  // rotation.z = +T_MAX maps local +X -> fwd(T_MAX), local +Y -> up(T_MAX), local +Z -> +Z!
  const endFrame = arcFrame(T_MAX);
  floorplate.position.set(endFrame.cx, endFrame.cy, 0);
  floorplate.rotation.z = T_MAX;

  // Multi-ring lofted stamped flared wrap-around baseplate:
  // Depth = 0.720 (scaleU = 0.360 / 0.338 = 1.065), Width = 0.275 (scaleZ = 0.1375 / 0.1225 = 1.122)
  // Vertical stations advance from top (+Y = +0.028) downward to bottom (-Y = -0.036)
  // so (a, d, b), (d, c, b) guarantees 100% outward-facing normals!
  const capStations = [
    // [localY, scaleU, scaleZ]
    [0.028, 1.012, 1.022], // Upper wrap-around lip hugging magazine shell
    [0.022, 1.032, 1.055], // Rolled side-rail flange step
    [0.012, 1.058, 1.112], // Upper rim flare bevel
    [0.004, 1.066, 1.124], // Full flared steel rim lip (width 0.275, depth 0.721)
    [-0.016, 1.065, 1.122], // Vertical perimeter skirt
    [-0.025, 1.045, 1.092], // Crisp lower chamfer
    [-0.033, 1.008, 1.045], // Inner bevel toward base
    [-0.036, 0.985, 1.015], // Flat stamped underside perimeter
  ];

  const baseRing = sampleCrossSectionRing({ t: T_MAX, withRelief: false });
  const ringStride = baseRing.length;

  // Perimeter arc-length for clean UVs
  const ringU = new Float32Array(ringStride);
  let perim = 0;
  for (let j = 1; j < ringStride; j++) {
    perim += Math.hypot(
      baseRing[j][0] - baseRing[j - 1][0],
      baseRing[j][1] - baseRing[j - 1][1]
    );
    ringU[j] = perim;
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const uvScale = 1.5;

  for (let i = 0; i < capStations.length; i++) {
    const [ly, sU, sZ] = capStations[i];
    const vCoord = (0.028 - ly) * uvScale * 4.0;
    for (let j = 0; j < ringStride; j++) {
      positions.push(baseRing[j][0] * sU, ly, baseRing[j][1] * sZ);
      uvs.push(ringU[j] * uvScale, vCoord);
    }
  }

  // Side walls (outward normals)
  for (let i = 0; i < capStations.length - 1; i++) {
    const row0 = i * ringStride;
    const row1 = (i + 1) * ringStride;
    for (let j = 0; j < ringStride - 1; j++) {
      const a = row0 + j;
      const b = row1 + j;
      const c = row1 + j + 1;
      const d = row0 + j + 1;
      indices.push(a, d, b, d, c, b);
    }
  }

  // Top closing cap at y = +0.028 (outward normal = +Y)
  const topCenterIdx = positions.length / 3;
  positions.push(0, capStations[0][0], 0);
  uvs.push(0.5, 0.5);
  const topRingStart = positions.length / 3;
  for (let j = 0; j < ringStride; j++) {
    const x = baseRing[j][0] * capStations[0][1];
    const z = baseRing[j][1] * capStations[0][2];
    positions.push(x, capStations[0][0], z);
    uvs.push(0.5 + x, 0.5 + z);
  }
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(topCenterIdx, topRingStart + j + 1, topRingStart + j);
  }

  // Bottom flat closing cap at y = -0.036 (outward normal = -Y)
  const lastSt = capStations[capStations.length - 1];
  const botCenterIdx = positions.length / 3;
  positions.push(0, lastSt[0], 0);
  uvs.push(0.5, 0.5);
  const botRingStart = positions.length / 3;
  for (let j = 0; j < ringStride; j++) {
    const x = baseRing[j][0] * lastSt[1];
    const z = baseRing[j][1] * lastSt[2];
    positions.push(x, lastSt[0], z);
    uvs.push(0.5 + x, 0.5 + z);
  }
  for (let j = 0; j < ringStride - 1; j++) {
    indices.push(botCenterIdx, botRingStart + j, botRingStart + j + 1);
  }

  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  capGeo.setIndex(indices);
  capGeo.computeVertexNormals();
  stitchClosedSeamNormals(capGeo, capStations.length, ringStride);

  const capMesh = new THREE.Mesh(capGeo, materials.parkerizedSteel);
  capMesh.name = 'floorplateBody';
  floorplate.add(capMesh);

  // Subtle stamped oblong stiffening emboss pads on floorplate underside (chamfered rounded rectangles)
  function createRoundedPad(lenX, widZ) {
    const r = 0.022;
    const hx = lenX * 0.5;
    const hz = widZ * 0.5;
    const s = new THREE.Shape();
    s.moveTo(-hx + r, -hz);
    s.lineTo(hx - r, -hz);
    s.quadraticCurveTo(hx, -hz, hx, -hz + r);
    s.lineTo(hx, hz - r);
    s.quadraticCurveTo(hx, hz, hx - r, hz);
    s.lineTo(-hx + r, hz);
    s.quadraticCurveTo(-hx, hz, -hx, hz - r);
    s.lineTo(-hx, -hz + r);
    s.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
    const g = new THREE.ExtrudeGeometry(s, {
      depth: 0.002,
      bevelEnabled: true,
      bevelThickness: 0.0022,
      bevelSize: 0.0025,
      bevelSegments: 2,
    });
    g.rotateX(Math.PI * 0.5); // Face outward along -Y
    return g;
  }

  const frontPadGeo = createRoundedPad(0.135, 0.110);
  const frontPad = new THREE.Mesh(frontPadGeo, materials.parkerizedSteel);
  frontPad.position.set(0.145, -0.036, 0);
  floorplate.add(frontPad);

  const rearPadGeo = createRoundedPad(0.135, 0.110);
  const rearPad = new THREE.Mesh(rearPadGeo, materials.parkerizedSteel);
  rearPad.position.set(-0.175, -0.036, 0);
  floorplate.add(rearPad);

  // Circular spring-retaining floorplate locking detent button protruding at center bottom
  const detentGroup = new THREE.Group();
  detentGroup.name = 'floorplateLockingButton';
  detentGroup.position.set(-0.015, -0.036, 0);

  // Dark circular bore shadow around locking button
  const recessGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.004, 28);
  const recessMesh = new THREE.Mesh(recessGeo, materials.darkSteel);
  recessMesh.position.y = -0.001;
  detentGroup.add(recessMesh);

  // Chamfered steel spring-retaining locking button (LatheGeometry around +Y, rotated upside down)
  // Ordered bottom -> top so normals face outward!
  const buttonPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.036, 0.0),
    new THREE.Vector2(0.036, 0.0075),
    new THREE.Vector2(0.030, 0.0115),
    new THREE.Vector2(0.014, 0.0124),
    new THREE.Vector2(0.0, 0.0126),
  ];
  const buttonGeo = new THREE.LatheGeometry(buttonPts, 28);
  // Flip upside down so protruding button points along -Y (out bottom of floorplate)
  buttonGeo.rotateX(Math.PI);
  const buttonMesh = new THREE.Mesh(buttonGeo, materials.parkerizedSteel);
  detentGroup.add(buttonMesh);

  floorplate.add(detentGroup);

  return floorplate;
}

// ---------------------------------------------------------------------------
// 5. 7.62x39mm M43 Cartridges (`parts.cartridges`)
// ---------------------------------------------------------------------------

/**
 * Builds one museum-grade 7.62x39mm cartridge centered at X = 0 (case base at X = -0.28,
 * copper spitzer bullet tip at X = +0.28, total length = 0.560 units = 56.0 mm,
 * base diameter = 0.1136 units = 11.36 mm, bullet diameter = 0.079 units = 7.9 mm,
 * bullet projection = 0.173 units = 17.3 mm).
 */
function createCartridgeGeometries() {
  const halfLen = 0.28; // Centers cartridge around local X = 0

  // 1. Tapered bottleneck brass case (LatheGeometry around +Y, points ordered y=0 -> y=0.387)
  //    In Three.js, LatheGeometry points ascending in Y with r >= 0 yield outward-facing normals.
  const casePts = [
    new THREE.Vector2(0.000, 0.000), // Center of base
    new THREE.Vector2(0.025, 0.000), // Primer pocket inner radius
    new THREE.Vector2(0.027, 0.002), // Subtle primer pocket groove
    new THREE.Vector2(0.0285, 0.000),
    new THREE.Vector2(0.0525, 0.000), // Case head flat
    new THREE.Vector2(0.0568, 0.003), // Rim bevel (11.36 mm diameter)
    new THREE.Vector2(0.0568, 0.014), // Extractor rim outer edge
    new THREE.Vector2(0.0550, 0.016), // Extractor groove rear shoulder
    new THREE.Vector2(0.0478, 0.0185), // Deep extractor groove floor (9.56 mm)
    new THREE.Vector2(0.0478, 0.0285),
    new THREE.Vector2(0.0565, 0.0365), // 45-degree extractor groove front ramp
    new THREE.Vector2(0.0565, 0.044), // Lower case body base
    new THREE.Vector2(0.0504, 0.300), // Iconic steep Soviet 7.62x39 tapered case body
    new THREE.Vector2(0.0497, 0.306), // Lower shoulder fillet
    new THREE.Vector2(0.0437, 0.332), // Steep bottleneck shoulder
    new THREE.Vector2(0.0430, 0.338), // Upper shoulder-to-neck fillet
    new THREE.Vector2(0.0430, 0.384), // Case neck (8.60 mm diameter)
    new THREE.Vector2(0.0422, 0.387), // Crisp chamfered case mouth lip
    new THREE.Vector2(0.0394, 0.387), // Case mouth inner edge hugging copper bullet
    new THREE.Vector2(0.0394, 0.376), // Short inner lip tuck
  ];

  const caseGeo = new THREE.LatheGeometry(casePts, 36);
  // Rotate so +Y axis becomes +X (muzzle direction), then center around X = 0
  caseGeo.rotateZ(-Math.PI * 0.5);
  caseGeo.translate(-halfLen, 0, 0);

  // 2. Pointed Spitzer FMJ Copper Bullet (diameter 0.079 -> r = 0.0395, projects 0.173 to 0.560)
  const bulletPts = [];
  bulletPts.push(new THREE.Vector2(0.000, 0.374)); // Closed base inside case mouth
  bulletPts.push(new THREE.Vector2(0.0394, 0.374));
  bulletPts.push(new THREE.Vector2(0.0394, 0.388));
  // Subtle micro-cannelure crimp ring right at case mouth
  bulletPts.push(new THREE.Vector2(0.0384, 0.390));
  bulletPts.push(new THREE.Vector2(0.0395, 0.393));
  bulletPts.push(new THREE.Vector2(0.0395, 0.408)); // Cylindrical bearing band

  // Smooth 16-segment tangent spitzer ogive from y = 0.408 (r = 0.0395) to y = 0.558 (r = 0.0042)
  const ogiveStart = 0.408;
  const ogiveEnd = 0.558;
  const rBase = 0.0395;
  const rMeplat = 0.0042;
  const ogiveSteps = 16;
  for (let i = 1; i <= ogiveSteps; i++) {
    const s = i / ogiveSteps;
    // Tangent ogive profile: starts vertical (dr/ds = 0 at s = 0) and sweeps crisply to spitzer point
    const y = lerp(ogiveStart, ogiveEnd, s);
    const r = rMeplat + (rBase - rMeplat) * Math.pow(1.0 - Math.pow(s, 1.82), 0.78);
    bulletPts.push(new THREE.Vector2(r, y));
  }
  // Slightly blunted authentic FMJ spitzer tip closed cleanly at y = 0.560
  bulletPts.push(new THREE.Vector2(0.0022, 0.5594));
  bulletPts.push(new THREE.Vector2(0.000, 0.560));

  const bulletGeo = new THREE.LatheGeometry(bulletPts, 36);
  bulletGeo.rotateZ(-Math.PI * 0.5);
  bulletGeo.translate(-halfLen, 0, 0);

  // 3. Base primer disc & dark primer pocket annulus ring at X = -0.280
  const primerRingGeo = new THREE.RingGeometry(0.0235, 0.0272, 28);
  // Rotate so face points toward -X (rearward out of cartridge base)
  primerRingGeo.rotateY(-Math.PI * 0.5);
  primerRingGeo.translate(-halfLen - 0.0004, 0, 0);

  const primerDiscGeo = new THREE.CircleGeometry(0.0235, 28);
  primerDiscGeo.rotateY(-Math.PI * 0.5);
  primerDiscGeo.translate(-halfLen - 0.0006, 0, 0);

  return { caseGeo, bulletGeo, primerRingGeo, primerDiscGeo };
}

function buildCartridges(materials) {
  const cartridges = new THREE.Group();
  cartridges.name = 'cartridges';
  // Relative to magazinePivot: when magazinePivot explodes (+0.35 X, -1.25 Y), shifting
  // cartridges (-0.22 X, +0.62 Y) yields net (+0.13 X, -0.63 Y) so the staggered 7.62x39mm
  // rounds float dead-center between receiver magwell and detached magazine feed lips,
  // clearing the exploded lower handguard cleanly!
  cartridges.userData.explodeOffset = new THREE.Vector3(-0.22, 0.62, 0);

  const { caseGeo, bulletGeo, primerRingGeo, primerDiscGeo } = createCartridgeGeometries();

  function assembleRound(name) {
    const round = new THREE.Group();
    round.name = name;

    const caseMesh = new THREE.Mesh(caseGeo, materials.brass);
    caseMesh.name = `${name}_case`;
    round.add(caseMesh);

    const bulletMesh = new THREE.Mesh(bulletGeo, materials.copper);
    bulletMesh.name = `${name}_bullet`;
    round.add(bulletMesh);

    const primerRing = new THREE.Mesh(primerRingGeo, materials.darkSteel);
    round.add(primerRing);

    const primerDisc = new THREE.Mesh(primerDiscGeo, materials.copper);
    round.add(primerDisc);

    return round;
  }

  // Top cartridge: fully visible nested cleanly under the right feed lip at world Y = -0.292,
  // tilted nose-up ~6 degrees (+0.105 rad) pointing forward toward the chamber!
  const topRound = assembleRound('cartridgeTop');
  topRound.position.set(toLocalX(-0.695), toLocalY(-0.292), 0.024);
  topRound.rotation.z = 0.105; // +6.0 degrees nose-up toward +X
  cartridges.add(topRound);

  // Second staggered double-stack cartridge nestled just beneath and offset to the left (-Z)
  // Center-to-center spacing = sqrt(0.056^2 + 0.092^2) = 0.1077 (clean tangent stack, zero clip!)
  const secondRound = assembleRound('cartridgeSecond');
  secondRound.position.set(toLocalX(-0.710), toLocalY(-0.384), -0.032);
  secondRound.rotation.z = 0.114; // +6.5 degrees nose-up following arc curvature
  cartridges.add(secondRound);

  return cartridges;
}

// ---------------------------------------------------------------------------
// Public Export: buildMagazine(materials)
// ---------------------------------------------------------------------------

export function buildMagazine(materials) {
  const group = new THREE.Group();
  group.name = 'magazineAssembly';

  // Pivot group anchored at the front locking lug world (-0.34, -0.42, 0)
  const magazinePivot = new THREE.Group();
  magazinePivot.name = 'magazinePivot';
  magazinePivot.position.set(PIVOT_WORLD_X, PIVOT_WORLD_Y, 0);
  magazinePivot.userData.explodeOffset = new THREE.Vector3(0.35, -1.25, 0);
  group.add(magazinePivot);

  // 1. Curved Ribbed Steel 30-Round Magazine Body
  const magazineBody = new THREE.Group();
  magazineBody.name = 'magazineBody';

  const shellMesh = new THREE.Mesh(buildMagazineShellGeometry(), materials.parkerizedSteel);
  shellMesh.name = 'magazineRibbedShell';
  magazineBody.add(shellMesh);

  const bottomCapMesh = new THREE.Mesh(buildMagazineBottomCapGeometry(), materials.parkerizedSteel);
  bottomCapMesh.name = 'magazineBottomCap';
  magazineBody.add(bottomCapMesh);

  const topRimMesh = new THREE.Mesh(buildTopRimLipGeometry(), materials.parkerizedSteel);
  topRimMesh.name = 'magazineTopRim';
  magazineBody.add(topRimMesh);

  const innerThroatMesh = new THREE.Mesh(buildInnerThroatGeometry(), materials.darkSteel);
  innerThroatMesh.name = 'magazineInnerThroat';
  magazineBody.add(innerThroatMesh);

  magazineBody.add(buildSpineDetails(materials));
  magazineBody.add(buildLockingLugs(materials));
  magazineBody.add(buildFeedLipsAndFollower(materials));

  magazinePivot.add(magazineBody);

  // 2. Stamped Flared Floorplate with Locking Button
  const floorplate = buildFloorplate(materials);
  magazinePivot.add(floorplate);

  // 3. Staggered 7.62x39mm Brass/Copper Cartridges at Top Feed Lips
  const cartridges = buildCartridges(materials);
  magazinePivot.add(cartridges);

  enableShadows(group);

  return {
    group,
    parts: {
      magazinePivot,
      magazineBody,
      cartridges,
      floorplate,
    },
  };
}
