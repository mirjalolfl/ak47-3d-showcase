import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createMaterials, createStudioEnvironment } from './materials.js';
import { buildReceiver } from './parts/receiver.js';
import { buildBarrel } from './parts/barrel.js';
import { buildFurniture } from './parts/furniture.js';
import { buildMagazine } from './parts/magazine.js';
import { createUI } from './ui.js';

// ============================================================================
// Configuration & Presets
// ============================================================================

const SELECTOR_ANGLES = {
  safe: 0.0,
  auto: -0.18,
  semi: -0.34,
};

const CAMERA_PRESETS = {
  hero: {
    pos: new THREE.Vector3(3.45, 1.78, 12.6),
    target: new THREE.Vector3(1.22, -0.64, 0.0),
    fov: 38,
    responsiveScale: true,
  },
  right: {
    pos: new THREE.Vector3(1.05, -0.48, 12.0),
    target: new THREE.Vector3(1.05, -0.48, 0.0),
    fov: 38,
    responsiveScale: true,
  },
  left: {
    pos: new THREE.Vector3(-1.35, -0.48, -12.0),
    target: new THREE.Vector3(-1.35, -0.48, 0.0),
    fov: 38,
    responsiveScale: true,
  },
  receiver: {
    pos: new THREE.Vector3(-1.32, 0.98, 2.88),
    target: new THREE.Vector3(-0.72, -0.06, 0.02),
    fov: 35,
    responsiveScale: false,
  },
  muzzle: {
    pos: new THREE.Vector3(4.95, 0.66, 3.2),
    target: new THREE.Vector3(3.48, 0.06, 0.0),
    fov: 34,
    responsiveScale: false,
  },
  ads: {
    pos: new THREE.Vector3(-2.55, 0.501, 0.0),
    target: new THREE.Vector3(4.5, 0.505, 0.0),
    fov: 24,
    responsiveScale: false,
  },
};

const LIGHTING_PRESETS = {
  studio: {
    bgColor: new THREE.Color('#131822'),
    domeTop: new THREE.Color('#111620'),
    domeMid: new THREE.Color('#283244'),
    domeBottom: new THREE.Color('#0e121a'),
    envIntensity: 1.18,
    exposure: 1.12,
    keyColor: new THREE.Color('#fff7ec'),
    keyIntensity: 2.35,
    keyPos: new THREE.Vector3(4.6, 7.6, 5.6),
    rimColor: new THREE.Color('#b6d4ff'),
    rimIntensity: 1.65,
    rimPos: new THREE.Vector3(-4.8, 5.2, -6.2),
    fillColor: new THREE.Color('#ffdcb8'),
    fillIntensity: 0.72,
    fillPos: new THREE.Vector3(-2.6, -2.1, 4.8),
    accentColor: new THREE.Color('#d8e6ff'),
    accentIntensity: 0.55,
    hemiSky: new THREE.Color('#c7d6ec'),
    hemiGround: new THREE.Color('#2d2219'),
    hemiIntensity: 0.34,
    floorTint: new THREE.Color('#151a22'),
    ringOpacity: 0.28,
  },
  armory: {
    bgColor: new THREE.Color('#17120e'),
    domeTop: new THREE.Color('#140f0b'),
    domeMid: new THREE.Color('#30241a'),
    domeBottom: new THREE.Color('#0f0b08'),
    envIntensity: 1.24,
    exposure: 1.16,
    keyColor: new THREE.Color('#ffe0b2'),
    keyIntensity: 2.55,
    keyPos: new THREE.Vector3(3.8, 6.8, 5.2),
    rimColor: new THREE.Color('#ffb978'),
    rimIntensity: 1.45,
    rimPos: new THREE.Vector3(-5.0, 4.6, -5.6),
    fillColor: new THREE.Color('#ffca91'),
    fillIntensity: 0.85,
    fillPos: new THREE.Vector3(-2.0, -2.2, 4.5),
    accentColor: new THREE.Color('#ffe3be'),
    accentIntensity: 0.55,
    hemiSky: new THREE.Color('#f0cfa5'),
    hemiGround: new THREE.Color('#26180f'),
    hemiIntensity: 0.38,
    floorTint: new THREE.Color('#1a140f'),
    ringOpacity: 0.36,
  },
  tactical: {
    bgColor: new THREE.Color('#0a0f18'),
    domeTop: new THREE.Color('#090e16'),
    domeMid: new THREE.Color('#19283e'),
    domeBottom: new THREE.Color('#070b11'),
    envIntensity: 1.08,
    exposure: 1.1,
    keyColor: new THREE.Color('#dceaff'),
    keyIntensity: 2.25,
    keyPos: new THREE.Vector3(2.8, 8.2, 4.2),
    rimColor: new THREE.Color('#6db4ff'),
    rimIntensity: 2.3,
    rimPos: new THREE.Vector3(-5.2, 5.4, -6.4),
    fillColor: new THREE.Color('#9db9db'),
    fillIntensity: 0.58,
    fillPos: new THREE.Vector3(-2.4, -1.9, 5.2),
    accentColor: new THREE.Color('#70b4ff'),
    accentIntensity: 0.8,
    hemiSky: new THREE.Color('#8cb5e8'),
    hemiGround: new THREE.Color('#121822'),
    hemiIntensity: 0.26,
    floorTint: new THREE.Color('#0f1520'),
    ringOpacity: 0.34,
  },
};

const DEFAULT_EXPLODE_OFFSETS = {
  dustCover: new THREE.Vector3(0, 1.15, 0),
  boltCarrier: new THREE.Vector3(-0.55, 0.55, 0.45),
  muzzleBrake: new THREE.Vector3(0.85, 0, 0),
  gasTube: new THREE.Vector3(0, 0.8, 0),
  cleaningRod: new THREE.Vector3(1.2, -0.45, 0),
  buttstock: new THREE.Vector3(-1.35, 0, 0),
  lowerHandguard: new THREE.Vector3(0, -0.68, 0),
  upperHandguard: new THREE.Vector3(0, 0.65, 0),
  pistolGrip: new THREE.Vector3(-0.2, -0.85, 0),
  magazinePivot: new THREE.Vector3(0.18, -0.95, 0),
  cartridges: new THREE.Vector3(0.18, 0.45, 0),
};

const EXPLODABLE_PART_KEYS = [
  'dustCover',
  'boltCarrier',
  'muzzleBrake',
  'gasTube',
  'cleaningRod',
  'buttstock',
  'lowerHandguard',
  'upperHandguard',
  'pistolGrip',
  'magazinePivot',
  'cartridges',
];

const FLOOR_REST_Y = -2.55;
const FLOOR_LOW_Y = -3.65;

// ============================================================================
// Math & Easing Helpers
// ============================================================================

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t) {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

function easeInOutCubic(t) {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function dampFactor(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

// ============================================================================
// Procedural Studio Backdrop & Display Pedestal Floor
// ============================================================================

function createStudioBackdrop(initialPreset) {
  const geometry = new THREE.SphereGeometry(48, 40, 28);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      uTopColor: { value: initialPreset.domeTop.clone() },
      uMidColor: { value: initialPreset.domeMid.clone() },
      uBottomColor: { value: initialPreset.domeBottom.clone() },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldDir;
      void main() {
        float h = vWorldDir.y;
        float horizonGlow = exp(-pow((h - 0.05) * 2.1, 2.0));
        vec3 base = h >= 0.0
          ? mix(uMidColor, uTopColor, smoothstep(0.0, 0.72, h))
          : mix(uMidColor, uBottomColor, smoothstep(0.0, 0.55, -h));
        vec3 col = mix(base, uMidColor * 1.48, horizonGlow * 0.56);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -10;
  return { mesh, material };
}

function createRadialFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Subtle dark brushed radial pedestal fade-out
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.04,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.38, 'rgba(220, 224, 232, 0.72)');
  grad.addColorStop(0.72, 'rgba(150, 155, 165, 0.24)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createMuseumFloor(initialPreset) {
  const floorGroup = new THREE.Group();
  floorGroup.name = 'MuseumDisplayFloor';
  floorGroup.position.set(-0.18, FLOOR_REST_Y, 0);

  const alphaMap = createRadialFloorTexture();

  // Main seamless dark matte studio floor beneath the plinth receiving soft shadows
  const floorGeo = new THREE.CircleGeometry(24, 96);
  const floorMat = new THREE.MeshStandardMaterial({
    color: initialPreset.floorTint.clone(),
    roughness: 0.88,
    metalness: 0.12,
    transparent: true,
    opacity: 0.96,
    alphaMap,
    depthWrite: false,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.062;
  floorMesh.receiveShadow = true;
  floorGroup.add(floorMesh);

  // Sleek low-profile circular museum plinth disc whose top face sits exactly at Y = FLOOR_REST_Y
  const plinthGeo = new THREE.CylinderGeometry(5.15, 5.34, 0.06, 96);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: initialPreset.floorTint.clone(),
    roughness: 0.64,
    metalness: 0.28,
  });
  const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
  plinthMesh.position.y = -0.03;
  plinthMesh.receiveShadow = true;
  floorGroup.add(plinthMesh);

  // Subtle inlaid warm-brass museum exhibition hairline ring on the plinth top
  const ringGeo = new THREE.RingGeometry(5.11, 5.152, 96);
  const ringMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c88b4b'),
    roughness: 0.34,
    metalness: 0.82,
    transparent: true,
    opacity: initialPreset.ringOpacity,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.0018;
  ringMesh.receiveShadow = true;
  floorGroup.add(ringMesh);

  // Subtle inner museum reference hairline ring
  const innerRingGeo = new THREE.RingGeometry(3.55, 3.57, 96);
  const innerRingMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7f8da3'),
    roughness: 0.5,
    metalness: 0.5,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
  const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
  innerRingMesh.rotation.x = -Math.PI / 2;
  innerRingMesh.position.y = 0.0012;
  floorGroup.add(innerRingMesh);

  return {
    group: floorGroup,
    floorMat,
    plinthMat,
    ringMat,
    dispose: () => {
      alphaMap.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      innerRingGeo.dispose();
      innerRingMat.dispose();
    },
  };
}

// ============================================================================
// Main Application Bootstrap
// ============================================================================

function initApp() {
  const mountEl = document.getElementById('app') || document.body;

  // 1. Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LIGHTING_PRESETS.studio.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mountEl.appendChild(renderer.domElement);

  // 2. Scene & Studio Backdrop
  const scene = new THREE.Scene();
  scene.background = LIGHTING_PRESETS.studio.bgColor.clone();
  scene.environmentIntensity = LIGHTING_PRESETS.studio.envIntensity;

  const backdrop = createStudioBackdrop(LIGHTING_PRESETS.studio);
  scene.add(backdrop.mesh);

  const museumFloor = createMuseumFloor(LIGHTING_PRESETS.studio);
  scene.add(museumFloor.group);

  // 3. Camera & OrbitControls
  const camera = new THREE.PerspectiveCamera(
    CAMERA_PRESETS.hero.fov,
    window.innerWidth / window.innerHeight,
    0.04,
    120
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.rotateSpeed = 0.72;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = 0.85;
  controls.maxDistance = 18.0;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.autoRotate = false;
  controls.autoRotateSpeed = 1.15;

  // 4. Studio Lighting Rig
  const keyLight = new THREE.DirectionalLight(
    LIGHTING_PRESETS.studio.keyColor,
    LIGHTING_PRESETS.studio.keyIntensity
  );
  keyLight.position.copy(LIGHTING_PRESETS.studio.keyPos);
  keyLight.target.position.set(-0.2, -0.35, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -6;
  keyLight.shadow.camera.right = 6;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 24;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.015;
  keyLight.shadow.radius = 2.4;
  scene.add(keyLight);
  scene.add(keyLight.target);

  const rimLight = new THREE.DirectionalLight(
    LIGHTING_PRESETS.studio.rimColor,
    LIGHTING_PRESETS.studio.rimIntensity
  );
  rimLight.position.copy(LIGHTING_PRESETS.studio.rimPos);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(
    LIGHTING_PRESETS.studio.fillColor,
    LIGHTING_PRESETS.studio.fillIntensity
  );
  fillLight.position.copy(LIGHTING_PRESETS.studio.fillPos);
  scene.add(fillLight);

  const accentLight = new THREE.DirectionalLight(
    LIGHTING_PRESETS.studio.accentColor,
    LIGHTING_PRESETS.studio.accentIntensity
  );
  accentLight.position.set(5.4, 2.0, -3.4);
  scene.add(accentLight);

  const hemiLight = new THREE.HemisphereLight(
    LIGHTING_PRESETS.studio.hemiSky,
    LIGHTING_PRESETS.studio.hemiGround,
    LIGHTING_PRESETS.studio.hemiIntensity
  );
  scene.add(hemiLight);

  // Environment PMREM
  let currentEnv = null;
  function applyEnvironmentMap(mode) {
    try {
      const nextEnv = createStudioEnvironment(renderer, mode);
      if (nextEnv && nextEnv.envMap) {
        scene.environment = nextEnv.envMap;
        if (currentEnv && typeof currentEnv.dispose === 'function') {
          currentEnv.dispose();
        }
        currentEnv = nextEnv;
      }
    } catch (err) {
      console.error('[AK-47] Failed to create studio environment:', err);
    }
  }
  applyEnvironmentMap('studio');

  // 5. Build Materials & AK-47 Rifle Assembly (defensive against partial modules)
  const materials = createMaterials();
  const rifleRoot = new THREE.Group();
  rifleRoot.name = 'AK47_Type3_Root';
  scene.add(rifleRoot);

  const parts = {};

  function mountAssembly(label, builderFn) {
    try {
      if (typeof builderFn !== 'function') return;
      const result = builderFn(materials);
      if (!result) return;
      if (result.group) {
        rifleRoot.add(result.group);
      }
      if (result.parts && typeof result.parts === 'object') {
        Object.assign(parts, result.parts);
      }
    } catch (err) {
      console.error(`[AK-47] Failed to build ${label}:`, err);
    }
  }

  mountAssembly('receiver', buildReceiver);
  mountAssembly('barrel', buildBarrel);
  mountAssembly('furniture', buildFurniture);
  mountAssembly('magazine', buildMagazine);

  // Ensure meshes have clean shadow flags (prevent transparent decals from casting rectangular shadows)
  rifleRoot.traverse((obj) => {
    if (obj.isMesh) {
      const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      const isDecal = Boolean(mat && mat.transparent && mat.depthWrite === false);
      obj.castShadow = !isDecal;
      obj.receiveShadow = true;
    }
  });

  // 6. Save Base Transforms & Collect Explodable Parts
  const explodableEntries = [];
  const explodableSet = new Set();

  function registerExplodable(obj, fallbackOffset) {
    if (!obj || explodableSet.has(obj)) return;
    const offset =
      obj.userData && obj.userData.explodeOffset instanceof THREE.Vector3
        ? obj.userData.explodeOffset
        : fallbackOffset;
    if (!offset) return;

    if (!obj.userData) obj.userData = {};
    obj.userData.basePos = obj.position.clone();
    obj.userData.baseRot = obj.rotation.clone();
    if (!(obj.userData.explodeOffset instanceof THREE.Vector3)) {
      obj.userData.explodeOffset = offset.clone();
    }
    explodableSet.add(obj);
    explodableEntries.push(obj);
  }

  // First register every named explodable part in the contract
  for (const key of EXPLODABLE_PART_KEYS) {
    if (parts[key]) {
      registerExplodable(parts[key], DEFAULT_EXPLODE_OFFSETS[key]);
    }
  }

  // Also discover any other object in the hierarchy carrying userData.explodeOffset
  rifleRoot.traverse((obj) => {
    if (obj.userData && obj.userData.explodeOffset instanceof THREE.Vector3) {
      registerExplodable(obj, null);
    }
  });

  // Save base transforms for non-exploded animated mechanisms too
  for (const mechKey of ['selectorLever', 'trigger', 'boltCarrier', 'magazinePivot']) {
    const obj = parts[mechKey];
    if (obj) {
      if (!obj.userData) obj.userData = {};
      if (!obj.userData.basePos) obj.userData.basePos = obj.position.clone();
      if (!obj.userData.baseRot) obj.userData.baseRot = obj.rotation.clone();
    }
  }

  // ============================================================================
  // Interactive State & Animation Controllers
  // ============================================================================

  const state = {
    cameraPreset: 'hero',
    lighting: 'studio',
    selector: 'semi', // Default to Semi (ОД) so polished bolt carrier & АВ markings shine cleanly
    magDetached: false,
    explodeTarget: 0,
    explodeCurrent: 0,
    autoRotate: false,
    wireframe: false,
  };

  // Mechanism animation state
  const anim = {
    selectorAngle: SELECTOR_ANGLES[state.selector],

    // Bolt cycle kinematics
    boltCycling: false,
    boltTime: 0,
    boltOffsetX: 0,
    boltFreezeRatio: null, // Used only when debug forces a frozen bolt travel position
    recoilTime: 0,
    recoilActive: false,

    // Trigger pull kinematics
    triggerPulling: false,
    triggerTime: 0,
    triggerBlocked: false,
    triggerAngle: 0,

    // Magazine rock-and-lock scalar [0 = seated, 1 = detached]
    magProgress: 0,

    // Camera transition state
    camTransitioning: false,
    camStartPos: new THREE.Vector3(),
    camStartTarget: new THREE.Vector3(),
    camStartFov: CAMERA_PRESETS.hero.fov,
    camGoalPos: new THREE.Vector3(),
    camGoalTarget: new THREE.Vector3(),
    camGoalFov: CAMERA_PRESETS.hero.fov,
    camProgress: 1,
    camDuration: 0.72,
  };

  // Compute responsive pose so the full AK-47 fits comfortably on narrower screens too
  function computePresetPose(presetName) {
    const preset = CAMERA_PRESETS[presetName] || CAMERA_PRESETS.hero;
    const pos = preset.pos.clone();
    const target = preset.target.clone();
    const fov = preset.fov;

    if (preset.responsiveScale) {
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      if (aspect < 1.55) {
        const scale = clamp(1.55 / Math.max(0.75, aspect), 1.0, 1.55);
        const offset = pos.clone().sub(target).multiplyScalar(scale);
        pos.copy(target).add(offset);
      }
    }

    return { pos, target, fov };
  }

  // Set initial Hero camera immediately
  {
    const initialPose = computePresetPose('hero');
    camera.position.copy(initialPose.pos);
    camera.fov = initialPose.fov;
    camera.updateProjectionMatrix();
    controls.target.copy(initialPose.target);
    controls.update();
  }

  // Interrupt camera preset lerp if the user manually grabs OrbitControls
  controls.addEventListener('start', () => {
    anim.camTransitioning = false;
  });

  // ============================================================================
  // State Mutation Functions
  // ============================================================================

  let ui = null;

  function syncUI() {
    ui?.syncState({
      cameraPreset: state.cameraPreset,
      selector: state.selector,
      magDetached: state.magDetached,
      explode: state.explodeTarget,
      lighting: state.lighting,
      autoRotate: state.autoRotate,
      wireframe: state.wireframe,
    });
  }

  function setCameraPreset(presetName, instant = false) {
    if (!CAMERA_PRESETS[presetName]) return;
    state.cameraPreset = presetName;
    const pose = computePresetPose(presetName);

    // Disable auto-rotate in ADS view so aiming down the iron sights stays steady
    if (presetName === 'ads' && state.autoRotate) {
      state.autoRotate = false;
      controls.autoRotate = false;
    }

    if (instant) {
      anim.camTransitioning = false;
      anim.camProgress = 1;
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      controls.update();
    } else {
      anim.camStartPos.copy(camera.position);
      anim.camStartTarget.copy(controls.target);
      anim.camStartFov = camera.fov;
      anim.camGoalPos.copy(pose.pos);
      anim.camGoalTarget.copy(pose.target);
      anim.camGoalFov = pose.fov;
      anim.camProgress = 0;
      anim.camTransitioning = true;
    }

    syncUI();
  }

  function setSelector(mode, instant = false) {
    if (!(mode in SELECTOR_ANGLES)) return;
    state.selector = mode;
    if (instant) {
      anim.selectorAngle = SELECTOR_ANGLES[mode];
      applyTransforms();
    }
    syncUI();
  }

  function setExplode(t, instant = false) {
    const clamped = clamp(Number(t) || 0, 0, 1);
    state.explodeTarget = clamped;
    if (instant) {
      state.explodeCurrent = clamped;
      applyTransforms();
    }
    syncUI();
  }

  function setMagDetached(detached, instant = false) {
    state.magDetached = Boolean(detached);
    if (instant) {
      anim.magProgress = state.magDetached ? 1 : 0;
      applyTransforms();
    }
    syncUI();
  }

  function cycleBolt(freezeRatio) {
    // If called with an explicit numeric ratio (e.g. from debug verifier), hold bolt at that travel
    if (typeof freezeRatio === 'number' && Number.isFinite(freezeRatio)) {
      if (state.selector === 'safe') {
        setSelector('semi', true);
      }
      anim.boltFreezeRatio = clamp(freezeRatio, 0, 1);
      anim.boltCycling = false;
      anim.boltOffsetX = -1.1 * anim.boltFreezeRatio;
      applyTransforms();
      return;
    }

    // Release any frozen debug bolt state and run full mechanical cycle
    anim.boltFreezeRatio = null;

    // On a real AK-47 the safety lever blocks the charging handle slot; lower it smoothly first
    if (state.selector === 'safe') {
      setSelector('semi', false);
      ui?.showToast("Xavfsizlik qulfi ochildi (ОД) — zatvor tortildi");
    }

    anim.boltCycling = true;
    anim.boltTime = 0;
  }

  function pullTrigger() {
    anim.triggerPulling = true;
    anim.triggerTime = 0;

    if (state.selector === 'safe') {
      anim.triggerBlocked = true;
      ui?.showToast("Xavfsizlik qulfi yoqilgan — tepki bloklangan");
      return;
    }

    anim.triggerBlocked = false;
    // Brief subtle mechanical impulse on dry-fire / sear release
    anim.recoilActive = true;
    anim.recoilTime = 0;
  }

  function setLighting(mode, instant = false) {
    if (!LIGHTING_PRESETS[mode]) return;
    state.lighting = mode;
    applyEnvironmentMap(mode);

    if (instant) {
      applyLightingImmediate(LIGHTING_PRESETS[mode]);
    }
    syncUI();
  }

  function setAutoRotate(enabled) {
    state.autoRotate = Boolean(enabled);
    controls.autoRotate = state.autoRotate;
    syncUI();
  }

  function setWireframe(enabled) {
    state.wireframe = Boolean(enabled);
    const seenMaterials = new Set();
    rifleRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat && 'wireframe' in mat && !seenMaterials.has(mat)) {
          seenMaterials.add(mat);
          mat.wireframe = state.wireframe;
        }
      }
    });
    syncUI();
  }

  function applyLightingImmediate(preset) {
    scene.background.copy(preset.bgColor);
    scene.environmentIntensity = preset.envIntensity;
    renderer.toneMappingExposure = preset.exposure;

    backdrop.material.uniforms.uTopColor.value.copy(preset.domeTop);
    backdrop.material.uniforms.uMidColor.value.copy(preset.domeMid);
    backdrop.material.uniforms.uBottomColor.value.copy(preset.domeBottom);

    keyLight.color.copy(preset.keyColor);
    keyLight.intensity = preset.keyIntensity;
    keyLight.position.copy(preset.keyPos);

    rimLight.color.copy(preset.rimColor);
    rimLight.intensity = preset.rimIntensity;
    rimLight.position.copy(preset.rimPos);

    fillLight.color.copy(preset.fillColor);
    fillLight.intensity = preset.fillIntensity;
    fillLight.position.copy(preset.fillPos);

    accentLight.color.copy(preset.accentColor);
    accentLight.intensity = preset.accentIntensity;

    hemiLight.color.copy(preset.hemiSky);
    hemiLight.groundColor.copy(preset.hemiGround);
    hemiLight.intensity = preset.hemiIntensity;

    museumFloor.floorMat.color.copy(preset.floorTint);
    museumFloor.plinthMat.color.copy(preset.floorTint);
    museumFloor.ringMat.opacity = preset.ringOpacity;
  }

  function lerpLighting(preset, alpha) {
    scene.background.lerp(preset.bgColor, alpha);
    scene.environmentIntensity = THREE.MathUtils.lerp(
      scene.environmentIntensity,
      preset.envIntensity,
      alpha
    );
    renderer.toneMappingExposure = THREE.MathUtils.lerp(
      renderer.toneMappingExposure,
      preset.exposure,
      alpha
    );

    backdrop.material.uniforms.uTopColor.value.lerp(preset.domeTop, alpha);
    backdrop.material.uniforms.uMidColor.value.lerp(preset.domeMid, alpha);
    backdrop.material.uniforms.uBottomColor.value.lerp(preset.domeBottom, alpha);

    keyLight.color.lerp(preset.keyColor, alpha);
    keyLight.intensity = THREE.MathUtils.lerp(keyLight.intensity, preset.keyIntensity, alpha);
    keyLight.position.lerp(preset.keyPos, alpha);

    rimLight.color.lerp(preset.rimColor, alpha);
    rimLight.intensity = THREE.MathUtils.lerp(rimLight.intensity, preset.rimIntensity, alpha);
    rimLight.position.lerp(preset.rimPos, alpha);

    fillLight.color.lerp(preset.fillColor, alpha);
    fillLight.intensity = THREE.MathUtils.lerp(fillLight.intensity, preset.fillIntensity, alpha);
    fillLight.position.lerp(preset.fillPos, alpha);

    accentLight.color.lerp(preset.accentColor, alpha);
    accentLight.intensity = THREE.MathUtils.lerp(
      accentLight.intensity,
      preset.accentIntensity,
      alpha
    );

    hemiLight.color.lerp(preset.hemiSky, alpha);
    hemiLight.groundColor.lerp(preset.hemiGround, alpha);
    hemiLight.intensity = THREE.MathUtils.lerp(hemiLight.intensity, preset.hemiIntensity, alpha);

    museumFloor.floorMat.color.lerp(preset.floorTint, alpha);
    museumFloor.plinthMat.color.lerp(preset.floorTint, alpha);
    museumFloor.ringMat.opacity = THREE.MathUtils.lerp(
      museumFloor.ringMat.opacity,
      preset.ringOpacity,
      alpha
    );
  }

  // ============================================================================
  // Deterministic Part Transform Composer
  // ============================================================================

  function applyTransforms() {
    const exp = state.explodeCurrent;

    // 1. Apply Exploded View offsets from saved basePos for every explodable sub-group
    for (let i = 0; i < explodableEntries.length; i++) {
      const obj = explodableEntries[i];
      const basePos = obj.userData.basePos;
      const offset = obj.userData.explodeOffset;
      if (basePos && offset) {
        obj.position.set(
          basePos.x + offset.x * exp,
          basePos.y + offset.y * exp,
          basePos.z + offset.z * exp
        );
      }
    }

    // 2. Bolt Carrier cycling translation (-X up to -1.10 from its exploded/base X)
    if (parts.boltCarrier) {
      parts.boltCarrier.position.x += anim.boltOffsetX;
    }

    // 3. Fire Selector Lever rotation.z (0 Safe, -0.18 Auto, -0.34 Semi)
    if (parts.selectorLever) {
      const baseRotZ = parts.selectorLever.userData?.baseRot?.z ?? 0;
      parts.selectorLever.rotation.z = baseRotZ + anim.selectorAngle;
    }

    // 4. Trigger pull rotation.z (0 to +0.25)
    if (parts.trigger) {
      const baseRotZ = parts.trigger.userData?.baseRot?.z ?? 0;
      parts.trigger.rotation.z = baseRotZ + anim.triggerAngle;
    }

    // 5. Magazine authentic AK rock-and-lock detach/attach curve
    if (parts.magazinePivot) {
      const p = anim.magProgress;
      // Phase 1 (0 -> 0.45): rock forward around front lug pivot (0 -> +0.38 rad)
      const rockT = smoothstep(0.0, 0.45, p);
      // Phase 2 (0.45 -> 1.0): drop down by -1.10 and forward +0.25 in X
      const dropT = p > 0.45 ? easeInOutCubic((p - 0.45) / 0.55) : 0;

      const baseRotZ = parts.magazinePivot.userData?.baseRot?.z ?? 0;
      parts.magazinePivot.rotation.z = baseRotZ + 0.38 * rockT;
      parts.magazinePivot.position.x += 0.25 * dropT;
      parts.magazinePivot.position.y += -1.1 * dropT;
    }

    // 6. Subtle floor clearance when magazine drops or full exploded view expands downward
    const clearanceNeed = Math.max(
      anim.magProgress > 0.45 ? smoothstep(0.45, 1.0, anim.magProgress) : 0,
      exp * 0.85
    );
    museumFloor.group.position.y = THREE.MathUtils.lerp(FLOOR_REST_Y, FLOOR_LOW_Y, clearanceNeed);
  }

  // Apply initial selector position (Semi) right away
  applyTransforms();

  // ============================================================================
  // UI Wiring
  // ============================================================================

  ui = createUI(document.getElementById('hud-root'), {
    onCameraPreset: (preset) => setCameraPreset(preset, false),
    onCycleBolt: () => cycleBolt(),
    onPullTrigger: () => pullTrigger(),
    onSelector: (mode) => setSelector(mode, false),
    onToggleMagazine: () => setMagDetached(!state.magDetached, false),
    onExplode: (t) => setExplode(t, false),
    onLighting: (mode) => setLighting(mode, false),
    onToggleAutoRotate: () => setAutoRotate(!state.autoRotate),
    onToggleWireframe: () => setWireframe(!state.wireframe),
  });
  syncUI();

  // ============================================================================
  // Animation Loop
  // ============================================================================

  const clock = new THREE.Clock();

  function updateAnimations(dt) {
    // 1. Explode smooth damping
    state.explodeCurrent = THREE.MathUtils.lerp(
      state.explodeCurrent,
      state.explodeTarget,
      dampFactor(10.5, dt)
    );
    if (Math.abs(state.explodeCurrent - state.explodeTarget) < 0.0004) {
      state.explodeCurrent = state.explodeTarget;
    }

    // 2. Selector lever smooth rotation
    const targetSelAngle = SELECTOR_ANGLES[state.selector] ?? 0;
    anim.selectorAngle = THREE.MathUtils.lerp(
      anim.selectorAngle,
      targetSelAngle,
      dampFactor(16.0, dt)
    );

    // 3. Magazine rock-and-lock progress
    const targetMag = state.magDetached ? 1 : 0;
    const magSpeed = 1.45;
    if (anim.magProgress < targetMag) {
      anim.magProgress = Math.min(targetMag, anim.magProgress + dt * magSpeed);
    } else if (anim.magProgress > targetMag) {
      anim.magProgress = Math.max(targetMag, anim.magProgress - dt * magSpeed);
    }

    // 4. Bolt carrier cycle curve
    if (anim.boltFreezeRatio !== null) {
      anim.boltOffsetX = -1.1 * anim.boltFreezeRatio;
    } else if (anim.boltCycling) {
      anim.boltTime += dt;
      const t = anim.boltTime;
      const pullDur = 0.16;
      const holdDur = 0.11;
      const snapDur = 0.11;

      if (t < pullDur) {
        // Sharp rearward charging handle pull
        anim.boltOffsetX = -1.1 * easeOutCubic(t / pullDur);
      } else if (t < pullDur + holdDur) {
        // Brief dwell at full rear travel
        anim.boltOffsetX = -1.1;
      } else if (t < pullDur + holdDur + snapDur) {
        // Snappy spring-driven return into battery
        const r = (t - pullDur - holdDur) / snapDur;
        anim.boltOffsetX = -1.1 * (1 - r * r);
      } else {
        anim.boltOffsetX = 0;
        anim.boltCycling = false;
        // Trigger damped micro-recoil impulse as bolt slams into battery
        anim.recoilActive = true;
        anim.recoilTime = 0;
      }
    } else {
      anim.boltOffsetX = 0;
    }

    // 5. Damped micro-recoil impulse on rifleRoot
    if (anim.recoilActive) {
      anim.recoilTime += dt;
      const rt = anim.recoilTime;
      if (rt < 0.32) {
        const env = Math.exp(-15 * rt);
        const osc = Math.sin(rt * 42);
        rifleRoot.position.x = -0.028 * env * osc;
        rifleRoot.rotation.z = 0.006 * env * Math.sin(rt * 34);
      } else {
        rifleRoot.position.x = 0;
        rifleRoot.rotation.z = 0;
        anim.recoilActive = false;
      }
    }

    // 6. Trigger pull curve
    if (anim.triggerPulling) {
      anim.triggerTime += dt;
      const tt = anim.triggerTime;
      if (anim.triggerBlocked) {
        // Tiny hard-stop shudder against safety lug
        const dur = 0.16;
        if (tt < dur) {
          anim.triggerAngle = 0.032 * Math.sin((tt / dur) * Math.PI);
        } else {
          anim.triggerAngle = 0;
          anim.triggerPulling = false;
        }
      } else {
        const pullDur = 0.11;
        const releaseDur = 0.16;
        if (tt < pullDur) {
          anim.triggerAngle = 0.25 * easeOutCubic(tt / pullDur);
        } else if (tt < pullDur + releaseDur) {
          const r = (tt - pullDur) / releaseDur;
          anim.triggerAngle = 0.25 * (1 - easeInOutCubic(r));
        } else {
          anim.triggerAngle = 0;
          anim.triggerPulling = false;
        }
      }
    }

    // 7. Camera preset smooth ease-out lerp
    if (anim.camTransitioning) {
      anim.camProgress = Math.min(1, anim.camProgress + dt / anim.camDuration);
      const k = easeOutCubic(anim.camProgress);
      camera.position.lerpVectors(anim.camStartPos, anim.camGoalPos, k);
      controls.target.lerpVectors(anim.camStartTarget, anim.camGoalTarget, k);
      const nextFov = THREE.MathUtils.lerp(anim.camStartFov, anim.camGoalFov, k);
      if (Math.abs(camera.fov - nextFov) > 0.005) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }
      if (anim.camProgress >= 1) {
        anim.camTransitioning = false;
      }
    }

    // 8. Lighting preset smooth interpolation
    const lightPreset = LIGHTING_PRESETS[state.lighting] || LIGHTING_PRESETS.studio;
    lerpLighting(lightPreset, dampFactor(6.5, dt));

    // Apply composed part transforms
    applyTransforms();
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    updateAnimations(dt);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // ============================================================================
  // Resize Handling
  // ============================================================================

  function handleResize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', handleResize);

  // ============================================================================
  // Debug & Visual Verification API (window.__ak47Debug)
  // ============================================================================

  function renderNow() {
    rifleRoot.updateMatrixWorld(true);
    controls.update();
    renderer.render(scene, camera);
  }

  window.__ak47Debug = {
    setCamera(preset, instant = true) {
      setCameraPreset(preset, instant);
      if (instant) renderNow();
      return state.cameraPreset;
    },
    setExplode(t, instant = true) {
      setExplode(t, instant);
      if (instant) renderNow();
      return state.explodeTarget;
    },
    setMagDetached(detached, instant = true) {
      setMagDetached(detached, instant);
      if (instant) renderNow();
      return state.magDetached;
    },
    setSelector(mode, instant = true) {
      setSelector(mode, instant);
      if (instant) renderNow();
      return state.selector;
    },
    cycleBolt(freezeRatio) {
      cycleBolt(freezeRatio);
      renderNow();
      return {
        cycling: anim.boltCycling,
        boltOffsetX: anim.boltOffsetX,
      };
    },
    pullTrigger() {
      pullTrigger();
      return state.selector !== 'safe';
    },
    setLighting(mode, instant = true) {
      setLighting(mode, instant);
      if (instant) renderNow();
      return state.lighting;
    },
    setAutoRotate(enabled) {
      setAutoRotate(enabled);
      return state.autoRotate;
    },
    setWireframe(enabled) {
      setWireframe(enabled);
      renderNow();
      return state.wireframe;
    },
    setUIVisible(visible) {
      ui?.setVisible(visible);
    },
    setPanelCollapsed(collapsed) {
      ui?.setCollapsed(collapsed);
    },
    getBounds() {
      rifleRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rifleRoot);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      return {
        min: { x: +box.min.x.toFixed(4), y: +box.min.y.toFixed(4), z: +box.min.z.toFixed(4) },
        max: { x: +box.max.x.toFixed(4), y: +box.max.y.toFixed(4), z: +box.max.z.toFixed(4) },
        size: { x: +size.x.toFixed(4), y: +size.y.toFixed(4), z: +size.z.toFixed(4) },
        center: {
          x: +center.x.toFixed(4),
          y: +center.y.toFixed(4),
          z: +center.z.toFixed(4),
        },
        partNames: Object.keys(parts),
      };
    },
    getState() {
      return {
        cameraPreset: state.cameraPreset,
        lighting: state.lighting,
        selector: state.selector,
        magDetached: state.magDetached,
        explode: state.explodeCurrent,
        autoRotate: state.autoRotate,
        wireframe: state.wireframe,
        boltOffsetX: anim.boltOffsetX,
      };
    },
  };

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('resize', handleResize);
    controls.dispose();
    if (currentEnv && typeof currentEnv.dispose === 'function') currentEnv.dispose();
    if (materials && typeof materials.dispose === 'function') materials.dispose();
    museumFloor.dispose();
    backdrop.mesh.geometry.dispose();
    backdrop.material.dispose();
    renderer.dispose();
  });
}

initApp();
