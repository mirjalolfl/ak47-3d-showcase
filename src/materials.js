import * as THREE from 'three';

/**
 * Procedural PBR Materials & Studio PMREM Environment for AK-47 (Type 3)
 * 100% procedural Canvas2D textures — zero external asset dependencies.
 *
 * UV Conventions (Three.js default flipY = true: v=0 is canvas bottom, v=1 is canvas top):
 *
 * 1. `sightLeaf` (512x1024, ClampToEdgeWrapping):
 *    - U = 0.0 -> Left edge (-Z), U = 1.0 -> Right edge (+Z)
 *    - V = 0.0 -> Rear notch end (-X, closest to shooter)
 *    - V = 1.0 -> Front pivot end (+X, toward muzzle)
 *    - Graduations `П`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8` run sequentially from
 *      V = 0.12 (`П` near rear) up to V = 0.88 (`8` near front), centered at U = 0.50,
 *      with symmetrical horizontal tick bars on both sides.
 *
 * 2. `receiverRightPlate` (1024x512, transparent decal, ClampToEdgeWrapping):
 *    - Designed for a +Z-facing PlaneGeometry(0.84, 0.36) on the right receiver flank
 *      centered at (-0.64, -0.22, 0.183), spanning X = -1.06..-0.22, Y = -0.40..-0.04:
 *    - U = 0.0 -> Rear edge (-X = -1.06, viewer's left), U = 1.0 -> Front edge (+X = -0.22, viewer's right)
 *    - V = 0.0 -> Bottom edge (Y = -0.40), V = 1.0 -> Top edge (Y = -0.04)
 *    - Left (U = 0.04..0.28): Cyrillic fire-selector markings `АВ` at (U=0.19, V=0.785) with
 *      detent bar at V=0.735, and `ОД` at (U=0.19, V=0.445) with detent bar at V=0.400.
 *    - Lower-right flat below lightening cut (U = 0.34..0.90, V = 0.11..0.33): Soviet Izhevsk
 *      arrow-in-triangle proof mark, `1955  АБ 4729` serial, and `(П)`/`⟨К⟩` acceptance stamps.
 *
 * 3. `laminatedWood` (1024x1024, RepeatWrapping):
 *    - Russian laminated birch ply contours & wood fibers flow horizontally along U (rifle X length)
 *      with wavy laminated cathedral bands stepping across V.
 *
 * 4. `checkeredGrip` (1024x1024, RepeatWrapping):
 *    - Seamless 45-degree Soviet diamond checkering (24 diamonds per UV tile) over
 *      mottled reddish-brown Bakelite / dark walnut swirls.
 */

// ---------------------------------------------------------------------------
// Deterministic PRNG & Seamless Tileable Value Noise
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoiseGrid(size, seed) {
  const rand = mulberry32(seed);
  const data = new Float32Array(size * size);
  for (let i = 0; i < data.length; i++) {
    data[i] = rand();
  }
  return { size, mask: size - 1, data };
}

function sampleTileNoise(grid, u, v, freqU, freqV) {
  const { size, data } = grid;
  const x = u * freqU;
  const y = v * freqV;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;

  // Quintic smoothstep for C2-continuous normals without grid creases
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);

  // Wrap modulo period (<= size) so ANY integer freqU/freqV tiles 100% seamlessly at u=0/1 & v=0/1
  const pU = freqU <= size ? freqU : size;
  const pV = freqV <= size ? freqV : size;

  const x0 = ((xi % pU) + pU) % pU;
  const x1 = x0 + 1 < pU ? x0 + 1 : 0;
  const iy0 = ((yi % pV) + pV) % pV;
  const iy1 = iy0 + 1 < pV ? iy0 + 1 : 0;
  const y0 = iy0 * size;
  const y1 = iy1 * size;

  const n00 = data[y0 + x0];
  const n10 = data[y0 + x1];
  const n01 = data[y1 + x0];
  const n11 = data[y1 + x1];

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Canvas & Texture Conversion Utilities
// ---------------------------------------------------------------------------

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function configureTexture(canvas, {
  isColor = false,
  repeat = true,
  repeatX = 1,
  repeatY = 1,
  anisotropy = 8,
} = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.repeat.set(repeatX, repeatY);
  }
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function heightFieldToGrayscaleCanvas(height, width, heightPx, minOut = 0, maxOut = 255) {
  const canvas = makeCanvas(width, heightPx);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, heightPx);
  const d = img.data;
  const span = maxOut - minOut;
  for (let i = 0, j = 0; i < height.length; i++, j += 4) {
    const v = clampByte(minOut + clamp01(height[i]) * span);
    d[j] = v;
    d[j + 1] = v;
    d[j + 2] = v;
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Seamless OpenGL/Three.js tangent-space normal map via 3x3 Sobel kernel.
 * +X (Red) = right (+U), +Y (Green) = up (+V / -canvasY), +Z (Blue) = outward.
 */
function heightFieldToNormalCanvas(height, width, heightPx, strength = 2.0, wrap = true) {
  const canvas = makeCanvas(width, heightPx);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, heightPx);
  const d = img.data;

  const sample = (x, y) => {
    let sx = x;
    let sy = y;
    if (wrap) {
      sx = (x + width) % width;
      sy = (y + heightPx) % heightPx;
    } else {
      sx = x < 0 ? 0 : x >= width ? width - 1 : x;
      sy = y < 0 ? 0 : y >= heightPx ? heightPx - 1 : y;
    }
    return height[sy * width + sx];
  };

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < width; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      // Three.js flipY=true: canvas +Y is -V, so ny = +dy * strength
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * width + x) * 4;
      d[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// 1. Blued Steel (Milled Type 3 Receiver, Barrel) — 1024x1024
// ---------------------------------------------------------------------------

function buildBluedSteelMaps(trackTex) {
  const W = 1024;
  const H = 1024;
  const albedoCanvas = makeCanvas(W, H);
  const albedoCtx = albedoCanvas.getContext('2d');
  const albedoImg = albedoCtx.createImageData(W, H);
  const aData = albedoImg.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gOil1 = createNoiseGrid(32, 1011);
  const gOil2 = createNoiseGrid(64, 1023);
  const gMill1 = createNoiseGrid(128, 1039);
  const gFine = createNoiseGrid(256, 1051);
  const gMicro = createNoiseGrid(256, 1069);
  const rand = mulberry32(1947);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Subtle organic gun-oil wiping clouds (drives smooth gloss drift, very gentle albedo modulation)
      const oilWarp = sampleTileNoise(gOil1, u, v, 4, 4) * 0.12;
      const oil1 = sampleTileNoise(gOil1, u + oilWarp, v - oilWarp * 0.6, 5, 5);
      const oil2 = sampleTileNoise(gOil2, u - oilWarp * 0.4, v + oilWarp, 11, 11);
      const oilMask = oil1 * 0.65 + oil2 * 0.35;

      // Finely milled CNC satin Russian steel micro-grain (kept delicate & nearly isotropic
      // so elongated receiver UV projections stay silky-smooth, never bark-like)
      const satinFine = sampleTileNoise(gFine, u, v, 28, 144);
      const cncGrain = sampleTileNoise(gMicro, u, v, 192, 192);
      const millWhisper = sampleTileNoise(gMill1, u, v, 72, 24);
      const sparkle = rand();

      const microSurface = satinFine * 0.38 + cncGrain * 0.36 + millWhisper * 0.14 + sparkle * 0.12;

      // Restrained micro-relief heightfield (silky finely milled forged steel)
      heightField[idx] = clamp01(0.5 + (microSurface - 0.5) * 0.28);

      // Authentic satin hot-salt blued steel (#1d242e shadow to #28313e mid-satin)
      const oilDarken = 1.0 - smoothstep(0.42, 0.85, oilMask) * 0.11;
      const toneShift = (satinFine - 0.5) * 6.5 + (cncGrain - 0.5) * 4.5 + (millWhisper - 0.5) * 2.5;

      const r = (33 + toneShift * 0.86) * oilDarken;
      const g = (40 + toneShift * 0.95) * oilDarken;
      const b = (51 + toneShift * 1.12 + (1.0 - oilMask) * 2.5) * oilDarken;

      const p = idx * 4;
      aData[p] = clampByte(r);
      aData[p + 1] = clampByte(g);
      aData[p + 2] = clampByte(b);
      aData[p + 3] = 255;

      // Calibrated satin hot-blued roughness: ~0.29..0.38 (avg ~0.335)
      const rough = 0.365 - oilMask * 0.068 + (0.5 - satinFine) * 0.028 + (cncGrain - 0.5) * 0.022;
      roughField[idx] = clamp01(Math.max(0.28, Math.min(0.40, rough)));
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);

  // Whisper-thin deterministic handling micro-hairlines (subtle museum patina)
  const scratchCanvas = makeCanvas(W, H);
  const sCtx = scratchCanvas.getContext('2d');
  sCtx.clearRect(0, 0, W, H);

  for (let i = 0; i < 85; i++) {
    const sx = rand() * W;
    const sy = rand() * H;
    const len = 14 + rand() * 64;
    const ang = (rand() - 0.5) * 0.45 + (rand() < 0.25 ? (rand() - 0.5) * Math.PI : 0);
    const ex = sx + Math.cos(ang) * len;
    const ey = sy + Math.sin(ang) * len;
    const alpha = 0.016 + rand() * 0.032;
    const lw = 0.45 + rand() * 0.65;

    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x1 = sx + ox * W;
        const y1 = sy + oy * H;
        const x2 = ex + ox * W;
        const y2 = ey + oy * H;
        if (Math.max(x1, x2) < -2 || Math.min(x1, x2) > W + 2) continue;
        if (Math.max(y1, y2) < -2 || Math.min(y1, y2) > H + 2) continue;

        albedoCtx.strokeStyle = `rgba(128, 142, 162, ${alpha})`;
        albedoCtx.lineWidth = lw;
        albedoCtx.beginPath();
        albedoCtx.moveTo(x1, y1);
        albedoCtx.lineTo(x2, y2);
        albedoCtx.stroke();

        sCtx.strokeStyle = `rgba(255, 255, 255, ${alpha * 2.0})`;
        sCtx.lineWidth = lw;
        sCtx.beginPath();
        sCtx.moveTo(x1, y1);
        sCtx.lineTo(x2, y2);
        sCtx.stroke();
      }
    }
  }

  const sData = sCtx.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i++) {
    const sc = sData[i * 4 + 3] / 255;
    if (sc > 0.01) {
      heightField[i] = clamp01(heightField[i] - sc * 0.12);
      roughField[i] = clamp01(roughField[i] - sc * 0.06);
    }
  }

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 0.72, true);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true })),
  };
}

// ---------------------------------------------------------------------------
// 2. Parkerized Steel (Dust Cover, Magazine, Gas Block, FSB, Buttplate) — 1024x1024
// ---------------------------------------------------------------------------

function buildParkerizedSteelMaps(trackTex) {
  const W = 1024;
  const H = 1024;
  const albedoCanvas = makeCanvas(W, H);
  const albedoCtx = albedoCanvas.getContext('2d');
  const albedoImg = albedoCtx.createImageData(W, H);
  const aData = albedoImg.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gMacro = createNoiseGrid(32, 2017);
  const gMed = createNoiseGrid(128, 2029);
  const gFine = createNoiseGrid(256, 2053);
  const rand = mulberry32(2081);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Subtle dip-tank manganese phosphate tonal clouding (albedo & roughness ONLY — no lumpy bumps)
      const cloud = sampleTileNoise(gMacro, u, v, 5, 5) * 0.65
        + sampleTileNoise(gMed, u, v, 14, 14) * 0.35;

      // Tight, silky-fine bead-blasted manganese-phosphate micro-crystallinity
      const gritTight = sampleTileNoise(gFine, u, v, 256, 256);
      const gritUltra = sampleTileNoise(gMed, u, v, 128, 128);
      const crystal = rand();

      const micro = gritTight * 0.50 + crystal * 0.38 + gritUltra * 0.12;
      // Pure fine bead-blast micro-relief (zero coarse low-frequency asphalt lumps!)
      heightField[idx] = clamp01(0.5 + (micro - 0.5) * 0.65);

      // Matte charcoal-slate manganese phosphate (#262a30 core, cleanly distinct from blue-black bluedSteel)
      const base = 43 + (cloud - 0.5) * 9 + (micro - 0.5) * 10;
      const p = idx * 4;
      aData[p] = clampByte(base * 0.96);
      aData[p + 1] = clampByte(base * 1.00);
      aData[p + 2] = clampByte(base * 1.04);
      aData[p + 3] = 255;

      // Matte phosphate roughness strictly 0.50..0.67
      const rVal = 0.59 + (0.5 - cloud) * 0.08 + (0.5 - micro) * 0.09;
      roughField[idx] = clamp01(Math.max(0.49, Math.min(0.67, rVal)));
    }
  }

  albedoCtx.putImageData(albedoImg, 0, 0);

  // Faint burnished handling sheen spots on stamped steel (seamlessly tile-wrapped)
  for (let i = 0; i < 48; i++) {
    const sx = rand() * W;
    const sy = rand() * H;
    const rad = 16 + rand() * 42;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = sx + ox * W;
        const cy = sy + oy * H;
        if (cx + rad < 0 || cx - rad > W || cy + rad < 0 || cy - rad > H) continue;
        const grad = albedoCtx.createRadialGradient(cx, cy, 1, cx, cy, rad);
        grad.addColorStop(0, 'rgba(88, 94, 104, 0.055)');
        grad.addColorStop(1, 'rgba(88, 94, 104, 0.0)');
        albedoCtx.fillStyle = grad;
        albedoCtx.beginPath();
        albedoCtx.arc(cx, cy, rad, 0, Math.PI * 2);
        albedoCtx.fill();
      }
    }
  }

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const bumpCanvas = heightFieldToGrayscaleCanvas(heightField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 0.85, true);

  // 2x2 repeat doubles bead-blast crystal density so close-up ADS dust cover reads silky-fine
  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true, repeatX: 2, repeatY: 2 })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true, repeatX: 2, repeatY: 2 })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: true, repeatX: 2, repeatY: 2 })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true, repeatX: 2, repeatY: 2 })),
  };
}

// ---------------------------------------------------------------------------
// 3. Dark Oxidized Steel (Bore Interior, Vent Recesses, Magwell Throat) — 256x256
// ---------------------------------------------------------------------------

function buildDarkSteelMaps(trackTex) {
  const W = 256;
  const H = 256;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const g1 = createNoiseGrid(64, 3011);
  const rand = mulberry32(3023);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = sampleTileNoise(g1, x / W, y / H, 16, 16) * 0.65 + rand() * 0.35;
      const v = 13 + n * 10;
      const p = (y * W + x) * 4;
      d[p] = clampByte(v * 0.94);
      d[p + 1] = clampByte(v * 1.0);
      d[p + 2] = clampByte(v * 1.12);
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true, anisotropy: 4 })),
  };
}

// ---------------------------------------------------------------------------
// 4. Polished Bare Steel (Bolt Carrier, Charging Handle, Pins) — 1024x1024
// ---------------------------------------------------------------------------

function buildPolishedSteelMaps(trackTex) {
  const W = 1024;
  const H = 1024;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gBand = createNoiseGrid(64, 4007);
  const gStroke1 = createNoiseGrid(128, 4019);
  const gStroke2 = createNoiseGrid(256, 4049);
  const gMicro = createNoiseGrid(256, 4073);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Refined fine satin-brushed steel micro-strokes (smooth, zero harsh zebra striping)
      const s1 = sampleTileNoise(gStroke1, u, v, 10, 128);
      const s2 = sampleTileNoise(gStroke2, u, v, 20, 256);
      const s3 = sampleTileNoise(gMicro, u, v, 48, 256);
      const band = sampleTileNoise(gBand, u, v, 8, 16);

      const brush = s1 * 0.35 + s2 * 0.40 + s3 * 0.25;
      heightField[idx] = clamp01(0.5 + (brush - 0.5) * 0.36 + (band - 0.5) * 0.08);

      // Sleek bare stainless / chrome-white machined steel (#c6cdd6..#dde3eb)
      const val = 208 + (brush - 0.5) * 14 + (band - 0.5) * 8;
      const p = idx * 4;
      aData[p] = clampByte(val * 0.975);
      aData[p + 1] = clampByte(val * 1.00);
      aData[p + 2] = clampByte(val * 1.03);
      aData[p + 3] = 255;

      // Refined satin-brushed roughness 0.18..0.28 (avg ~0.225)
      const rVal = 0.225 + (0.5 - brush) * 0.068 + (0.5 - band) * 0.032;
      roughField[idx] = clamp01(Math.max(0.18, Math.min(0.28, rVal)));
    }
  }

  ctx.putImageData(img, 0, 0);

  // Delicate horizontal slide-cycling micro-burnish hairlines (seamlessly tile-wrapped)
  const rand = mulberry32(4111);
  for (let i = 0; i < 80; i++) {
    const sy = rand() * H;
    const sx = rand() * W;
    const len = 70 + rand() * 240;
    const dy = (rand() - 0.5) * 1.4;
    const bright = rand() > 0.45;
    ctx.strokeStyle = bright
      ? `rgba(245, 248, 254, ${0.024 + rand() * 0.032})`
      : `rgba(176, 184, 194, ${0.02 + rand() * 0.028})`;
    ctx.lineWidth = 0.5 + rand() * 0.7;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x1 = sx + ox * W;
        const y1 = sy + oy * H;
        if (x1 + len < -2 || x1 > W + 2 || y1 < -4 || y1 > H + 4) continue;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + len, y1 + dy);
        ctx.stroke();
      }
    }
  }

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const bumpCanvas = heightFieldToGrayscaleCanvas(heightField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 0.65, true);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: true })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true })),
  };
}

// ---------------------------------------------------------------------------
// 5. Russian Laminated Birch Wood (Buttstock, Handguards) — 1024x1024
// ---------------------------------------------------------------------------

function buildLaminatedWoodMaps(trackTex) {
  const W = 1024;
  const H = 1024;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gWarp1 = createNoiseGrid(32, 5003);
  const gWarp2 = createNoiseGrid(64, 5021);
  const gFiber1 = createNoiseGrid(128, 5051);
  const gFiber2 = createNoiseGrid(256, 5077);
  const gPore = createNoiseGrid(256, 5099);
  const gPatina = createNoiseGrid(32, 5113);

  // Authentic Soviet shellac-finished laminated Russian birch palette:
  // Deep warm russet-chestnut (#632812), rich Russian amber (#883d19), warm honey-birch (#b9672e),
  // and soft feathered mahogany-phenolic glue seam (#42190b) — zero neon orange or thick black outlines!
  const honey = [184, 103, 46];
  const amber = [136, 61, 25];
  const chestnut = [94, 38, 17];
  const glueSoft = [62, 23, 10];

  const numPlies = 18; // Finer parallel birch veneer layers, integer count for 100% seamless V wrap

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Gentle low-amplitude sweeping laminated birch wave (no cartoon bullseye rings or closed knots!)
      const w1 = sampleTileNoise(gWarp1, u, v, 2, 3) - 0.5;
      const w2 = sampleTileNoise(gWarp2, u, v, 5, 7) - 0.5;
      const wave = Math.sin(u * Math.PI * 2 * 1 + v * Math.PI * 2 * 1) * 0.20
        + Math.sin(u * Math.PI * 2 * 2) * 0.14;
      const plyCoord = v * numPlies + w1 * 1.05 + w2 * 0.28 + wave;

      const plyIndex = Math.floor(plyCoord);
      const plyFrac = plyCoord - plyIndex; // 0..1 across each birch veneer sheet

      // Wrap ply index modulo numPlies so v=0 and v=1 match 100% seamlessly
      const wrappedPly = ((plyIndex % numPlies) + numPlies) % numPlies;

      // Subtle authentic ply-to-ply birch sheen variation
      const plyHash = Math.sin(wrappedPly * 12.9898 + 4.1414) * 43758.5453;
      const plyTone = plyHash - Math.floor(plyHash);
      const isDarkPly = (wrappedPly & 1) === 0;

      // Soft, delicate feathered phenolic resin glue seam (no harsh black contour outline)
      const seamDist = Math.min(plyFrac, 1.0 - plyFrac);
      const glueLine = 1.0 - smoothstep(0.012, 0.065, seamDist);

      // Subtle smooth tonal arch across each veneer layer
      const innerArch = Math.sin(plyFrac * Math.PI);

      // Rich fine lengthwise birch wood fibers & silky chatoyance running cleanly along U
      const uShift = plyTone * 0.37;
      const fiberBroad = sampleTileNoise(gFiber1, u + uShift, v + w1 * 0.04, 6, 96);
      const fiberMid = sampleTileNoise(gFiber2, u + uShift, v + w2 * 0.02, 16, 224);
      const fiberSilky = sampleTileNoise(gPore, u + uShift * 0.7, v, 32, 256);
      const grain = fiberBroad * 0.44 + fiberMid * 0.36 + fiberSilky * 0.20;

      // Fine open birch vessel pores (delicate dark elongated dashes along U)
      const poreNoise = sampleTileNoise(gPore, u + uShift * 0.5, v, 56, 256);
      const pore = smoothstep(0.80, 0.95, poreNoise);

      // Subtle aged hand-rubbed shellac patina & gentle sheen variation
      const patina = sampleTileNoise(gPatina, u, v, 3, 3);

      // Blend rich russet-chestnut / Russian amber / warm honey birch tones
      let r, g, b;
      if (isDarkPly) {
        const t = clamp01(0.24 + plyTone * 0.32 + innerArch * 0.22 + (grain - 0.5) * 0.34);
        r = lerp(chestnut[0], amber[0], t);
        g = lerp(chestnut[1], amber[1], t);
        b = lerp(chestnut[2], amber[2], t);
      } else {
        const t = clamp01(0.18 + plyTone * 0.30 + innerArch * 0.26 + (grain - 0.5) * 0.36);
        r = lerp(amber[0], honey[0], t);
        g = lerp(amber[1], honey[1], t);
        b = lerp(amber[2], honey[2], t);
      }

      // Subtle longitudinal fiber streaks layered into birch veneer
      const fiberContrast = 0.90 + grain * 0.20;
      const patinaShade = 0.88 + patina * 0.20;
      r *= fiberContrast * patinaShade;
      g *= fiberContrast * patinaShade * 0.985;
      b *= fiberContrast * patinaShade * 0.96;

      // Soft feathered phenolic glue seam (subtle & natural, max 0.38 blend)
      if (glueLine > 0.001) {
        const gl = glueLine * 0.38;
        r = lerp(r, glueSoft[0], gl);
        g = lerp(g, glueSoft[1], gl);
        b = lerp(b, glueSoft[2], gl);
      }

      // Delicate open birch pores
      if (pore > 0.001) {
        const pk = 1.0 - pore * 0.30;
        r *= pk;
        g *= pk * 0.94;
        b *= pk * 0.90;
      }

      const p = idx * 4;
      aData[p] = clampByte(r);
      aData[p + 1] = clampByte(g);
      aData[p + 2] = clampByte(b);
      aData[p + 3] = 255;

      // Smooth hand-sanded satin wood micro-relief (gentle grain & fine pores, no deep trenches)
      const h = clamp01(0.55 + (grain - 0.5) * 0.26 - pore * 0.24 - glueLine * 0.05);
      heightField[idx] = h;

      // Authentic satin Russian shellac lacquer roughness strictly 0.34..0.44 (avg ~0.385)
      const rough = 0.365 + (1.0 - patina) * 0.035 + (0.5 - grain) * 0.04 + pore * 0.055 + glueLine * 0.02;
      roughField[idx] = clamp01(Math.max(0.335, Math.min(0.445, rough)));
    }
  }

  ctx.putImageData(img, 0, 0);

  // Subtle historical handling micro-marks (seamlessly wrapped)
  const rand = mulberry32(5197);
  for (let i = 0; i < 32; i++) {
    const sx = rand() * W;
    const sy = rand() * H;
    const len = 10 + rand() * 34;
    const ang = (rand() - 0.5) * 0.35;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    ctx.strokeStyle = `rgba(48, 18, 7, ${0.035 + rand() * 0.045})`;
    ctx.lineWidth = 0.7 + rand() * 1.0;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x1 = sx + ox * W;
        const y1 = sy + oy * H;
        if (Math.max(x1, x1 + dx) < -2 || Math.min(x1, x1 + dx) > W + 2) continue;
        if (Math.max(y1, y1 + dy) < -2 || Math.min(y1, y1 + dy) > H + 2) continue;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + dx, y1 + dy);
        ctx.stroke();
      }
    }
  }

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const bumpCanvas = heightFieldToGrayscaleCanvas(heightField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 1.15, true);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: true })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true })),
  };
}

// ---------------------------------------------------------------------------
// 6. Dark Oiled End-Grain Wood (Palm-Swell Recesses & Vent Cutouts) — 512x512
// ---------------------------------------------------------------------------

function buildWoodDarkEdgeMaps(trackTex) {
  const W = 512;
  const H = 512;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const g1 = createNoiseGrid(64, 6011);
  const g2 = createNoiseGrid(128, 6037);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      const grain = sampleTileNoise(g1, u, v, 8, 48);
      const pore = sampleTileNoise(g2, u, v, 32, 128);
      const pat = sampleTileNoise(g1, u, v, 6, 6);

      // Rich dark oiled chestnut end-grain (#3e190a core)
      const shade = 0.72 + grain * 0.34 + (pat - 0.5) * 0.22 - smoothstep(0.7, 0.95, pore) * 0.28;
      const p = idx * 4;
      aData[p] = clampByte(66 * shade);
      aData[p + 1] = clampByte(27 * shade);
      aData[p + 2] = clampByte(11 * shade);
      aData[p + 3] = 255;

      heightField[idx] = clamp01(0.5 + (grain - 0.5) * 0.45 - smoothstep(0.68, 0.92, pore) * 0.35);
      roughField[idx] = clamp01(0.46 + (1.0 - grain) * 0.10 + smoothstep(0.68, 0.92, pore) * 0.08);
    }
  }

  ctx.putImageData(img, 0, 0);

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 2.0, true);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true, anisotropy: 4 })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true, anisotropy: 4 })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true, anisotropy: 4 })),
  };
}

// ---------------------------------------------------------------------------
// 7. Checkered Bakelite / Walnut Pistol Grip (45° Diamond Checkering) — 1024x1024
// ---------------------------------------------------------------------------

function buildCheckeredGripMaps(trackTex) {
  const W = 1024;
  const H = 1024;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gSwirl1 = createNoiseGrid(32, 7001);
  const gSwirl2 = createNoiseGrid(64, 7019);
  const gFiber = createNoiseGrid(128, 7043);

  // 24 seamless 45-degree diamond pyramids per tile -> crisp, tactile, moiré-free
  const N = 24;

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Mottled Soviet Bakelite / dark walnut phenolic resin swirls (#5b2012 base)
      const wx = sampleTileNoise(gSwirl1, u, v, 5, 5) - 0.5;
      const wy = sampleTileNoise(gSwirl2, u, v, 5, 5) - 0.5;
      const swirl = sampleTileNoise(gSwirl2, u + wx * 0.25, v + wy * 0.25, 7, 14);
      const fiber = sampleTileNoise(gFiber, u + wy * 0.08, v + wx * 0.14, 24, 64);

      // Rich reddish-brown Bakelite tones (#391108 dark resin -> #5e2112 body -> #8a381d amber fiber wisp)
      const wisp = smoothstep(0.62, 0.90, swirl * 0.6 + fiber * 0.4);
      let r = lerp(62, 108, swirl) + wisp * 34;
      let g = lerp(19, 39, swirl) + wisp * 18;
      let b = lerp(10, 20, swirl) + wisp * 8;

      // Exact seamless 45-degree diamond checkering coordinates
      const a = (u + v) * N;
      const bCoord = (u - v) * N;
      const fa = Math.abs((a - Math.floor(a)) - 0.5) * 2.0; // 0 at peak, 1 at V-groove
      const fb = Math.abs((bCoord - Math.floor(bCoord)) - 0.5) * 2.0;
      const edgeDist = Math.max(fa, fb); // diamond pyramid cross-section

      // Cut V-groove with slightly flat-crested tactile pyramid crown
      // edgeDist in [0..0.14] = flat tip (1.0), [0.14..0.88] = crisp bevel slope, [0.88..1.0] = V-groove floor (0.0)
      const pyramid = clamp01((0.90 - edgeDist) / 0.74);
      // Slight subtle chamfer on slope + micro resin texture
      const checkH = Math.pow(pyramid, 0.92);
      heightField[idx] = clamp01(checkH * 0.92 + fiber * 0.08);

      // Ambient-occlusion darkening inside deep V-grooves + subtle hand-polished highlight on diamond peaks
      const ao = 0.40 + 0.60 * Math.pow(checkH, 0.72);
      const tipWear = smoothstep(0.82, 1.0, checkH) * 14;
      const p = idx * 4;
      aData[p] = clampByte(r * ao + tipWear);
      aData[p + 1] = clampByte(g * ao + tipWear * 0.55);
      aData[p + 2] = clampByte(b * ao + tipWear * 0.35);
      aData[p + 3] = 255;

      // Diamond peaks are smooth hand-rubbed Bakelite (~0.28), V-grooves are rough matte (~0.70)
      roughField[idx] = clamp01(lerp(0.70, 0.28, checkH) + (fiber - 0.5) * 0.05);
    }
  }

  ctx.putImageData(img, 0, 0);

  const roughCanvas = heightFieldToGrayscaleCanvas(roughField, W, H, 0, 255);
  const bumpCanvas = heightFieldToGrayscaleCanvas(heightField, W, H, 0, 255);
  const normalCanvas = heightFieldToNormalCanvas(heightField, W, H, 4.2, true);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: true })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: true })),
    normalMap: trackTex(configureTexture(normalCanvas, { isColor: false, repeat: true })),
  };
}

// ---------------------------------------------------------------------------
// 8. Cartridge Brass (7.62x39mm Case) — 512x512
// ---------------------------------------------------------------------------

function buildBrassMaps(trackTex) {
  const W = 512;
  const H = 512;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gLathe = createNoiseGrid(256, 8009);
  const gTarnish = createNoiseGrid(32, 8039);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      // Fine radial lathe-turning lines around circumference (U)
      const lathe = sampleTileNoise(gLathe, u, v, 4, 128) * 0.65
        + sampleTileNoise(gLathe, u, v, 12, 256) * 0.35;
      const tarnish = sampleTileNoise(gTarnish, u, v, 6, 6);

      // Authentic cartridge brass (#cfa34c)
      const k = 0.91 + lathe * 0.14 + (tarnish - 0.5) * 0.08;
      const p = idx * 4;
      aData[p] = clampByte(207 * k);
      aData[p + 1] = clampByte(163 * k);
      aData[p + 2] = clampByte(76 * k);
      aData[p + 3] = 255;

      heightField[idx] = clamp01(lathe);
      roughField[idx] = clamp01(0.24 + (0.5 - lathe) * 0.08 + (0.5 - tarnish) * 0.05);
    }
  }

  ctx.putImageData(img, 0, 0);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true, anisotropy: 4 })),
    roughnessMap: trackTex(configureTexture(heightFieldToGrayscaleCanvas(roughField, W, H), { isColor: false, repeat: true, anisotropy: 4 })),
    bumpMap: trackTex(configureTexture(heightFieldToGrayscaleCanvas(heightField, W, H), { isColor: false, repeat: true, anisotropy: 4 })),
  };
}

// ---------------------------------------------------------------------------
// 9. Copper FMJ Bullet Jacket — 512x512
// ---------------------------------------------------------------------------

function buildCopperMaps(trackTex) {
  const W = 512;
  const H = 512;
  const albedoCanvas = makeCanvas(W, H);
  const ctx = albedoCanvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const aData = img.data;

  const roughField = new Float32Array(W * H);
  const heightField = new Float32Array(W * H);

  const gDraw = createNoiseGrid(128, 9007);
  const gTone = createNoiseGrid(32, 9029);

  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const idx = y * W + x;

      const draw = sampleTileNoise(gDraw, u, v, 6, 128);
      const tone = sampleTileNoise(gTone, u, v, 6, 6);

      // Warm metallic copper jacket (#c96f43)
      const k = 0.92 + draw * 0.13 + (tone - 0.5) * 0.07;
      const p = idx * 4;
      aData[p] = clampByte(201 * k);
      aData[p + 1] = clampByte(111 * k);
      aData[p + 2] = clampByte(67 * k);
      aData[p + 3] = 255;

      heightField[idx] = clamp01(draw);
      roughField[idx] = clamp01(0.22 + (0.5 - draw) * 0.08 + (0.5 - tone) * 0.04);
    }
  }

  ctx.putImageData(img, 0, 0);

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: true, anisotropy: 4 })),
    roughnessMap: trackTex(configureTexture(heightFieldToGrayscaleCanvas(roughField, W, H), { isColor: false, repeat: true, anisotropy: 4 })),
    bumpMap: trackTex(configureTexture(heightFieldToGrayscaleCanvas(heightField, W, H), { isColor: false, repeat: true, anisotropy: 4 })),
  };
}

// ---------------------------------------------------------------------------
// 10. Tangent Rear Sight Leaf Graduations (`П`, `1`..`8`) — 512x1024
// ---------------------------------------------------------------------------

function buildSightLeafMaps(trackTex) {
  const W = 512;
  const H = 1024;

  const albedoCanvas = makeCanvas(W, H);
  const aCtx = albedoCanvas.getContext('2d');

  const bumpCanvas = makeCanvas(W, H);
  const bCtx = bumpCanvas.getContext('2d');

  const roughCanvas = makeCanvas(W, H);
  const rCtx = roughCanvas.getContext('2d');

  // 1) Dark brushed blued steel leaf base
  const baseGrad = aCtx.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0.0, '#171b22');
  baseGrad.addColorStop(0.11, '#262d38');
  baseGrad.addColorStop(0.50, '#1f252f');
  baseGrad.addColorStop(0.89, '#262d38');
  baseGrad.addColorStop(1.0, '#171b22');
  aCtx.fillStyle = baseGrad;
  aCtx.fillRect(0, 0, W, H);

  bCtx.fillStyle = '#c8c8c8'; // Raised flat steel surface
  bCtx.fillRect(0, 0, W, H);

  rCtx.fillStyle = '#5c5c5c'; // ~0.36 blued steel roughness
  rCtx.fillRect(0, 0, W, H);

  // Subtle longitudinal satin steel lines (running along V / rifle X axis)
  const rand = mulberry32(104729);
  for (let i = 0; i < 280; i++) {
    const x = rand() * W;
    const shade = rand() > 0.5 ? 'rgba(95, 110, 132, 0.045)' : 'rgba(10, 12, 16, 0.08)';
    aCtx.strokeStyle = shade;
    aCtx.lineWidth = 0.6 + rand() * 1.0;
    aCtx.beginPath();
    aCtx.moveTo(x, 0);
    aCtx.lineTo(x + (rand() - 0.5) * 3, H);
    aCtx.stroke();
  }

  // Machined subtle side rail channels along left & right edges
  aCtx.strokeStyle = 'rgba(130, 145, 168, 0.25)';
  aCtx.lineWidth = 4;
  aCtx.strokeRect(24, 18, W - 48, H - 36);

  bCtx.strokeStyle = '#686868';
  bCtx.lineWidth = 5;
  bCtx.strokeRect(24, 18, W - 48, H - 36);

  // Subtle dark central alignment hairline running along the scale
  aCtx.strokeStyle = 'rgba(12, 15, 20, 0.45)';
  aCtx.lineWidth = 3;
  aCtx.beginPath();
  aCtx.moveTo(W * 0.5, 42);
  aCtx.lineTo(W * 0.5, H - 42);
  aCtx.stroke();

  // 2) Crisp engraved graduations:
  //    V = 0.12 -> 'П' (rear, canvasY = (1 - 0.12) * H = 901)
  //    V = 0.88 -> '8' (front, canvasY = (1 - 0.88) * H = 123)
  const marks = ['П', '1', '2', '3', '4', '5', '6', '7', '8'];
  const vStart = 0.12;
  const vEnd = 0.88;

  const drawEngravedLine = (x1, y1, x2, y2, width) => {
    // Dark stamped recess outline
    aCtx.strokeStyle = 'rgba(8, 10, 14, 0.9)';
    aCtx.lineWidth = width + 3;
    aCtx.lineCap = 'round';
    aCtx.beginPath();
    aCtx.moveTo(x1, y1);
    aCtx.lineTo(x2, y2);
    aCtx.stroke();

    // Crisp silver-white chalk-filled engraving
    aCtx.strokeStyle = '#e7edf6';
    aCtx.lineWidth = width;
    aCtx.beginPath();
    aCtx.moveTo(x1, y1);
    aCtx.lineTo(x2, y2);
    aCtx.stroke();

    // Recessed bump & matte paint roughness
    bCtx.strokeStyle = '#242424';
    bCtx.lineWidth = width + 2;
    bCtx.lineCap = 'round';
    bCtx.beginPath();
    bCtx.moveTo(x1, y1);
    bCtx.lineTo(x2, y2);
    bCtx.stroke();

    rCtx.strokeStyle = '#9e9e9e'; // ~0.62 matte paint fill
    rCtx.lineWidth = width + 1;
    rCtx.lineCap = 'round';
    rCtx.beginPath();
    rCtx.moveTo(x1, y1);
    rCtx.lineTo(x2, y2);
    rCtx.stroke();
  };

  for (let i = 0; i < marks.length; i++) {
    const v = lerp(vStart, vEnd, i / (marks.length - 1));
    const cy = (1.0 - v) * H;
    const isMajor = i === 0 || i % 2 === 0;
    const tickInner = isMajor ? 182 : 162;

    // Symmetrical left & right horizontal graduation ticks
    drawEngravedLine(48, cy, tickInner, cy, isMajor ? 8 : 6);
    drawEngravedLine(W - tickInner, cy, W - 48, cy, isMajor ? 8 : 6);

    // Intermediate half-step ticks between graduations
    if (i < marks.length - 1) {
      const vMid = lerp(vStart, vEnd, (i + 0.5) / (marks.length - 1));
      const cyMid = (1.0 - vMid) * H;
      drawEngravedLine(48, cyMid, 114, cyMid, 4);
      drawEngravedLine(W - 114, cyMid, W - 48, cyMid, 4);
    }

    // Crisp centered engraved numeral at U = 0.5
    const label = marks[i];
    const fontSize = label === 'П' ? 66 : 62;
    const font = `700 ${fontSize}px "Segoe UI", "Roboto", "Arial", sans-serif`;

    aCtx.font = font;
    aCtx.textAlign = 'center';
    aCtx.textBaseline = 'middle';

    // Dark recessed steel bevel behind lettering
    aCtx.strokeStyle = 'rgba(7, 9, 13, 0.92)';
    aCtx.lineWidth = 6;
    aCtx.lineJoin = 'round';
    aCtx.strokeText(label, W * 0.5, cy + 1);

    // Bright engraved silver-white fill
    aCtx.fillStyle = '#edf2fa';
    aCtx.fillText(label, W * 0.5, cy);

    // Recessed bump map lettering
    bCtx.font = font;
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillStyle = '#1c1c1c';
    bCtx.fillText(label, W * 0.5, cy);

    // Matte chalk-infill roughness
    rCtx.font = font;
    rCtx.textAlign = 'center';
    rCtx.textBaseline = 'middle';
    rCtx.fillStyle = '#a4a4a4';
    rCtx.fillText(label, W * 0.5, cy);
  }

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: false })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: false })),
    roughnessMap: trackTex(configureTexture(roughCanvas, { isColor: false, repeat: false })),
  };
}

// ---------------------------------------------------------------------------
// 11. Receiver Right-Side Stamped Markings Decal (`АВ`, `ОД`, Izhevsk, Serial) — 1024x512
// ---------------------------------------------------------------------------

function buildReceiverRightPlateMaps(trackTex) {
  const W = 1024;
  const H = 512;

  // Target geometry is PlaneGeometry(0.84, 0.36) -> aspect 2.3333 vs canvas 2.0
  // Pre-compress X by (2.0 / 2.3333 = 0.85714) around each stamp anchor so symbols & letters
  // render with exact unstretched proportions (round circles, equilateral triangle).
  const aspectX = (W / H) / (0.84 / 0.36);

  const albedoCanvas = makeCanvas(W, H);
  const aCtx = albedoCanvas.getContext('2d');
  aCtx.clearRect(0, 0, W, H); // 100% transparent background

  const bumpCanvas = makeCanvas(W, H);
  const bCtx = bumpCanvas.getContext('2d');
  bCtx.fillStyle = '#c0c0c0';
  bCtx.fillRect(0, 0, W, H);

  /**
   * Draws an aspect-corrected stamped steel mark: crisp dark recessed shadow + bright
   * silvered metallic catchlight rim so markings read cleanly on satin blued steel.
   */
  const drawStampedText = (text, x, y, font, align = 'center') => {
    aCtx.save();
    aCtx.translate(x, y);
    aCtx.scale(aspectX, 1);
    aCtx.font = font;
    aCtx.textAlign = align;
    aCtx.textBaseline = 'middle';

    // Dark die-struck indentation shadow halo
    aCtx.strokeStyle = 'rgba(7, 9, 13, 0.88)';
    aCtx.lineWidth = 4.5;
    aCtx.lineJoin = 'round';
    aCtx.strokeText(text, -1.5, -1.5);

    // Crisp silver-etched metallic catchlight
    aCtx.fillStyle = 'rgba(224, 232, 242, 0.90)';
    aCtx.fillText(text, 0, 0);

    // Subtle inner stamp recess tone
    aCtx.fillStyle = 'rgba(22, 27, 36, 0.32)';
    aCtx.fillText(text, -1.2, -1.2);
    aCtx.restore();

    bCtx.save();
    bCtx.translate(x, y);
    bCtx.scale(aspectX, 1);
    bCtx.font = font;
    bCtx.textAlign = align;
    bCtx.textBaseline = 'middle';
    bCtx.fillStyle = '#202020';
    bCtx.fillText(text, 0, 0);
    bCtx.restore();
  };

  const drawStampedStroke = (cx, cy, drawLocalPathFn, lineWidth, useAspect = true) => {
    const sx = useAspect ? aspectX : 1;

    aCtx.save();
    aCtx.translate(cx - 1.5, cy - 1.5);
    aCtx.scale(sx, 1);
    aCtx.lineCap = 'round';
    aCtx.lineJoin = 'round';
    aCtx.strokeStyle = 'rgba(7, 9, 13, 0.88)';
    aCtx.lineWidth = lineWidth + 2.4;
    aCtx.beginPath();
    drawLocalPathFn(aCtx);
    aCtx.stroke();
    aCtx.restore();

    aCtx.save();
    aCtx.translate(cx, cy);
    aCtx.scale(sx, 1);
    aCtx.lineCap = 'round';
    aCtx.lineJoin = 'round';
    aCtx.strokeStyle = 'rgba(224, 232, 242, 0.88)';
    aCtx.lineWidth = lineWidth;
    aCtx.beginPath();
    drawLocalPathFn(aCtx);
    aCtx.stroke();
    aCtx.restore();

    bCtx.save();
    bCtx.translate(cx, cy);
    bCtx.scale(sx, 1);
    bCtx.lineCap = 'round';
    bCtx.lineJoin = 'round';
    bCtx.strokeStyle = '#202020';
    bCtx.lineWidth = lineWidth + 1.5;
    bCtx.beginPath();
    drawLocalPathFn(bCtx);
    bCtx.stroke();
    bCtx.restore();
  };

  const uToX = (u) => u * W;
  const vToY = (v) => (1.0 - v) * H;

  // --- LEFT REGION (U = 0.04..0.28): Fire-Selector Markings (`АВ` / `ОД`) & Detent Bars ---
  // Plane spans X = -1.06..-0.22, Y = -0.40..-0.04; receiver detents sit at U≈0.048, V=0.736 & 0.400.

  // Auto (`АВ`) centered at (U=0.19, V=0.785) — cleanly clear above selector lever in Auto mode
  drawStampedText(
    'АВ',
    uToX(0.19),
    vToY(0.785),
    '700 60px "Segoe UI", "Roboto", "Arial", sans-serif',
    'center'
  );
  // Horizontal Auto detent index bar at V=0.735 (U=0.080..0.136)
  drawStampedStroke(
    uToX(0.108),
    vToY(0.735),
    (c) => {
      c.moveTo(-28, 0);
      c.lineTo(28, 0);
    },
    4.2,
    false
  );

  // Semi (`ОД`) centered at (U=0.19, V=0.445) — cleanly clear above selector lever in Semi mode
  drawStampedText(
    'ОД',
    uToX(0.19),
    vToY(0.445),
    '700 60px "Segoe UI", "Roboto", "Arial", sans-serif',
    'center'
  );
  // Horizontal Semi detent index bar at V=0.400 (U=0.080..0.136)
  drawStampedStroke(
    uToX(0.108),
    vToY(0.400),
    (c) => {
      c.moveTo(-28, 0);
      c.lineTo(28, 0);
    },
    4.2,
    false
  );

  // --- LOWER-RIGHT UNOBSTRUCTED FLAT BELOW LIGHTENING CUT (U = 0.34..0.90, V = 0.11..0.33) ---
  // Centerline V = 0.22 (world Y = -0.321, safely below lightening cut Y = -0.22 and clear of all pins)
  const rowY = vToY(0.22);

  // 1) Soviet Izhevsk Arsenal Mark (equilateral triangle enclosing vertical fletched arrow) at U=0.395
  const ix = uToX(0.395);
  const triR = 44;
  drawStampedStroke(
    ix,
    rowY,
    (c) => {
      c.moveTo(0, -triR);
      c.lineTo(triR * 0.92, triR * 0.72);
      c.lineTo(-triR * 0.92, triR * 0.72);
      c.closePath();
    },
    4.2,
    true
  );
  drawStampedStroke(
    ix,
    rowY,
    (c) => {
      // Arrow shaft
      c.moveTo(0, triR * 0.56);
      c.lineTo(0, -triR * 0.66);
      // Arrowhead
      c.moveTo(-9.5, -triR * 0.32);
      c.lineTo(0, -triR * 0.68);
      c.lineTo(9.5, -triR * 0.32);
      // Feather fletching
      c.moveTo(-10.5, triR * 0.56);
      c.lineTo(0, triR * 0.34);
      c.lineTo(10.5, triR * 0.56);
      c.moveTo(-9.5, triR * 0.36);
      c.lineTo(0, triR * 0.14);
      c.lineTo(9.5, triR * 0.36);
    },
    3.2,
    true
  );

  // 2) Year & Cyrillic Serial Number: `1955  АБ 4729` (U = 0.450..0.745, V = 0.22)
  drawStampedText(
    '1955  АБ 4729',
    uToX(0.450),
    rowY + 2,
    '700 48px "Consolas", "Segoe UI", "Arial", monospace',
    'left'
  );

  // 3) Soviet Arsenal Acceptance Proof Stamps `(П)` & `⟨К⟩` (U = 0.805 & U = 0.870, V = 0.22)
  const px = uToX(0.805);
  drawStampedStroke(
    px,
    rowY,
    (c) => {
      c.arc(0, 0, 23, 0, Math.PI * 2);
    },
    2.8,
    true
  );
  drawStampedText('П', px, rowY + 1, '700 25px "Segoe UI", "Arial", sans-serif', 'center');

  const kx = uToX(0.870);
  drawStampedStroke(
    kx,
    rowY,
    (c) => {
      c.moveTo(0, -23);
      c.lineTo(23, 0);
      c.lineTo(0, 23);
      c.lineTo(-23, 0);
      c.closePath();
    },
    2.8,
    true
  );
  drawStampedText('К', kx, rowY + 1, '700 23px "Segoe UI", "Arial", sans-serif', 'center');

  return {
    map: trackTex(configureTexture(albedoCanvas, { isColor: true, repeat: false })),
    bumpMap: trackTex(configureTexture(bumpCanvas, { isColor: false, repeat: false })),
  };
}

// ---------------------------------------------------------------------------
// Public API: createMaterials()
// ---------------------------------------------------------------------------

export function createMaterials() {
  const textures = [];
  const materials = [];

  const trackTex = (tex) => {
    textures.push(tex);
    return tex;
  };
  const trackMat = (mat) => {
    materials.push(mat);
    return mat;
  };

  // Generate procedural PBR texture sets
  const bluedMaps = buildBluedSteelMaps(trackTex);
  const parkerizedMaps = buildParkerizedSteelMaps(trackTex);
  const darkMaps = buildDarkSteelMaps(trackTex);
  const polishedMaps = buildPolishedSteelMaps(trackTex);
  const woodMaps = buildLaminatedWoodMaps(trackTex);
  const woodEdgeMaps = buildWoodDarkEdgeMaps(trackTex);
  const gripMaps = buildCheckeredGripMaps(trackTex);
  const brassMaps = buildBrassMaps(trackTex);
  const copperMaps = buildCopperMaps(trackTex);
  const sightLeafMaps = buildSightLeafMaps(trackTex);
  const receiverPlateMaps = buildReceiverRightPlateMaps(trackTex);

  // 1. Hot-salt blued milled steel (refined satin Russian milled steel)
  const bluedSteel = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: bluedMaps.map,
    roughnessMap: bluedMaps.roughnessMap,
    normalMap: bluedMaps.normalMap,
    normalScale: new THREE.Vector2(0.12, 0.12),
    metalness: 0.86,
    roughness: 1.0, // Driven precisely by roughnessMap (~0.29..0.38, avg 0.335)
    clearcoat: 0.22,
    clearcoatRoughness: 0.34,
    reflectivity: 0.85,
    envMapIntensity: 1.32,
  }));

  // 2. Matte charcoal manganese-phosphate parkerized stamped steel (fine tight bead-blast)
  const parkerizedSteel = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: parkerizedMaps.map,
    roughnessMap: parkerizedMaps.roughnessMap,
    bumpMap: parkerizedMaps.bumpMap,
    bumpScale: 0.001,
    normalMap: parkerizedMaps.normalMap,
    normalScale: new THREE.Vector2(0.20, 0.20),
    metalness: 0.78,
    roughness: 1.0, // Driven precisely by roughnessMap (0.50..0.67)
    envMapIntensity: 1.02,
  }));

  // 3. Deep dark oxidized interior steel (bore, vents, magwell cavity)
  const darkSteel = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: darkMaps.map,
    metalness: 0.70,
    roughness: 0.65,
    envMapIntensity: 0.55,
  }));

  // 4. In-the-white satin-brushed stainless / bare machined steel (bolt carrier & pins)
  const polishedSteel = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: polishedMaps.map,
    roughnessMap: polishedMaps.roughnessMap,
    bumpMap: polishedMaps.bumpMap,
    bumpScale: 0.0008,
    normalMap: polishedMaps.normalMap,
    normalScale: new THREE.Vector2(0.10, 0.10),
    metalness: 0.96,
    roughness: 1.0, // Driven precisely by roughnessMap (0.18..0.28, avg 0.225)
    envMapIntensity: 1.32,
  }));

  // 5. Authentic Soviet shellac-finished laminated Russian birch wood furniture
  const laminatedWood = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: woodMaps.map,
    roughnessMap: woodMaps.roughnessMap,
    bumpMap: woodMaps.bumpMap,
    bumpScale: 0.0015,
    normalMap: woodMaps.normalMap,
    normalScale: new THREE.Vector2(0.26, 0.26),
    metalness: 0.0,
    roughness: 1.0, // Driven precisely by roughnessMap (0.34..0.44)
    clearcoat: 0.28,
    clearcoatRoughness: 0.34,
    sheen: 0.12,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color('#c8763c'),
    envMapIntensity: 1.12,
  }));

  // 6. Darker oiled end-grain wood (recesses, vents)
  const woodDarkEdge = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: woodEdgeMaps.map,
    roughnessMap: woodEdgeMaps.roughnessMap,
    normalMap: woodEdgeMaps.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    metalness: 0.0,
    roughness: 1.0, // Driven precisely by roughnessMap (~0.46..0.60, avg 0.52)
    envMapIntensity: 0.85,
  }));

  // 7. Soviet reddish-brown Bakelite / walnut diamond-checkered pistol grip
  const checkeredGrip = trackMat(new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: gripMaps.map,
    roughnessMap: gripMaps.roughnessMap,
    bumpMap: gripMaps.bumpMap,
    bumpScale: 0.004,
    normalMap: gripMaps.normalMap,
    normalScale: new THREE.Vector2(1.18, 1.18),
    metalness: 0.04,
    roughness: 1.0, // Driven precisely by roughnessMap (0.28 peaks .. 0.70 grooves)
    clearcoat: 0.25,
    clearcoatRoughness: 0.34,
    envMapIntensity: 1.1,
  }));

  // 8. Cartridge case brass
  const brass = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: brassMaps.map,
    roughnessMap: brassMaps.roughnessMap,
    bumpMap: brassMaps.bumpMap,
    bumpScale: 0.0022,
    metalness: 0.92,
    roughness: 1.0, // Avg ~0.24
    envMapIntensity: 1.25,
  }));

  // 9. FMJ copper bullet jacket
  const copper = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: copperMaps.map,
    roughnessMap: copperMaps.roughnessMap,
    bumpMap: copperMaps.bumpMap,
    bumpScale: 0.0018,
    metalness: 0.90,
    roughness: 1.0, // Avg ~0.22
    envMapIntensity: 1.25,
  }));

  // 10. Tangent rear sight leaf with engraved `П`, `1`..`8` graduations
  const sightLeaf = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: sightLeafMaps.map,
    bumpMap: sightLeafMaps.bumpMap,
    bumpScale: 0.006,
    roughnessMap: sightLeafMaps.roughnessMap,
    metalness: 0.82,
    roughness: 1.0,
    envMapIntensity: 1.18,
  }));

  // 11. Transparent stamped decal for right receiver flank (`АВ`, `ОД`, Izhevsk, serial)
  const receiverRightPlate = trackMat(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: receiverPlateMaps.map,
    bumpMap: receiverPlateMaps.bumpMap,
    bumpScale: 0.004,
    transparent: true,
    depthWrite: false,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    metalness: 0.62,
    roughness: 0.42,
    envMapIntensity: 1.15,
  }));

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const tex of textures) {
      tex.dispose();
    }
    for (const mat of materials) {
      mat.dispose();
    }
    textures.length = 0;
    materials.length = 0;
  };

  return {
    bluedSteel,
    parkerizedSteel,
    darkSteel,
    polishedSteel,
    laminatedWood,
    woodDarkEdge,
    checkeredGrip,
    brass,
    copper,
    sightLeaf,
    receiverRightPlate,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// Procedural Studio HDR-like PMREM Environment
// ---------------------------------------------------------------------------

function createSoftboxTexture() {
  const W = 256;
  const H = 256;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Optical studio diffusion scrim: intense hot center tapering smoothly to dark edges
  // so curved metal specular highlights exhibit genuine softbox roll-off
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const ny = (y / (H - 1)) * 2 - 1;
    const fy = 1.0 - smoothstep(0.55, 1.0, Math.abs(ny));
    for (let x = 0; x < W; x++) {
      const nx = (x / (W - 1)) * 2 - 1;
      const fx = 1.0 - smoothstep(0.62, 1.0, Math.abs(nx));
      const hotCenter = 0.78 + 0.22 * (1.0 - Math.min(1, nx * nx * 0.5 + ny * ny * 0.5));
      const v = clampByte(fx * fy * hotCenter * 255);
      const p = (y * W + x) * 4;
      d[p] = v;
      d[p + 1] = v;
      d[p + 2] = v;
      d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createStudioDomeTexture(topHex, midHex, botHex) {
  const W = 64;
  const H = 256;
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, topHex);
  grad.addColorStop(0.46, midHex);
  grad.addColorStop(0.54, botHex);
  grad.addColorStop(1.0, botHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const ENV_PRESETS = {
  studio: {
    domeTop: '#1c2330',
    domeMid: '#131822',
    domeBot: '#07090d',
    panels: [
      // Long overhead museum softbox strip (sweeps specular ribbon across barrel & receiver top)
      { pos: [0, 7.6, 0.8], target: [0, 0, 0], size: [18.5, 3.2], color: '#f5f8ff', intensity: 6.4 },
      // Front-right hero key fill softbox (reveals receiver right flank, bolt carrier, wood)
      { pos: [4.2, 3.0, 9.2], target: [0, -0.3, 0], size: [9.5, 4.6], color: '#fff4e3', intensity: 3.5 },
      // Cool cyan-blue rear-top rim strip (razor-sharp silhouette edge on dark blued steel)
      { pos: [-1.2, 5.2, -9.2], target: [0, 0.2, 0], size: [16.5, 2.5], color: '#a8d4ff', intensity: 5.8 },
      // Low warm amber bounce card (lifts underside bevels, trigger guard, magazine floorplate)
      { pos: [2.5, -5.2, 6.2], target: [0, -0.5, 0], size: [12.0, 3.6], color: '#ffdfb8', intensity: 1.7 },
      // Muzzle-end vertical specular accent strip
      { pos: [11.0, 1.6, 3.8], target: [0, 0, 0], size: [2.8, 7.5], color: '#dce8f8', intensity: 2.9 },
      // Buttstock-end soft fill strip
      { pos: [-11.0, 1.8, 4.2], target: [0, 0, 0], size: [3.2, 6.8], color: '#f2e8dc', intensity: 2.3 },
      // Opposite low rear edge kicker (separates dark wood & steel when orbiting to left profile)
      { pos: [-4.5, 2.2, -9.5], target: [0, -0.2, 0], size: [8.5, 3.6], color: '#d8e6f8', intensity: 3.0 },
    ],
  },

  armory: {
    domeTop: '#24180f',
    domeMid: '#150e09',
    domeBot: '#090604',
    panels: [
      // Overhead warm tungsten gunsmith lamp strip
      { pos: [0.5, 7.4, 1.2], target: [0, 0, 0], size: [17.0, 3.5], color: '#ffd18a', intensity: 6.6 },
      // Front-right warm golden workshop key bounce
      { pos: [4.5, 2.8, 8.8], target: [0, -0.3, 0], size: [10.0, 5.0], color: '#ffb966', intensity: 4.1 },
      // Subtle cool evening-window back rim (keeps blued steel reading metallic against warm tungsten)
      { pos: [-2.0, 5.4, -9.0], target: [0, 0.1, 0], size: [15.0, 2.6], color: '#82aad6', intensity: 3.4 },
      // Warm oiled-wood workbench upward bounce
      { pos: [0.0, -5.4, 4.5], target: [0, -0.4, 0], size: [14.0, 4.5], color: '#d97b34', intensity: 2.2 },
      // Muzzle-side warm lamp kicker
      { pos: [10.8, 1.4, 3.5], target: [0, 0, 0], size: [3.2, 6.8], color: '#ffc070', intensity: 3.1 },
      // Rear-left warm lantern bounce
      { pos: [-5.2, 2.4, -8.8], target: [0, -0.2, 0], size: [8.5, 4.0], color: '#f0b068', intensity: 2.6 },
    ],
  },

  tactical: {
    domeTop: '#0b1220',
    domeMid: '#05080f',
    domeBot: '#020306',
    panels: [
      // Stark narrow overhead spotlight strip
      { pos: [0, 7.8, 0.2], target: [0, 0, 0], size: [19.0, 1.9], color: '#ddf0ff', intensity: 8.2 },
      // Dramatic high-contrast steel-blue rear-top rim blade
      { pos: [-0.8, 4.8, -8.8], target: [0, 0.2, 0], size: [18.0, 2.1], color: '#58adff', intensity: 7.4 },
      // Tight cool front-right specular slash (carves receiver edges without washing out shadows)
      { pos: [5.5, 2.6, 9.4], target: [0, -0.2, 0], size: [7.5, 2.4], color: '#c4deff', intensity: 2.9 },
      // Moody front-left icy steel rim strip (illuminates left profile dramatically)
      { pos: [5.0, 3.8, -9.0], target: [0, 0, 0], size: [9.0, 2.0], color: '#6cbcff', intensity: 5.5 },
      // Muzzle hard silver rim accent
      { pos: [11.2, 1.2, 3.0], target: [0, 0, 0], size: [2.0, 7.5], color: '#cce4ff', intensity: 4.0 },
      // Minimal deep steel-indigo under-bounce
      { pos: [1.5, -5.8, 5.0], target: [0, -0.5, 0], size: [11.0, 2.8], color: '#3b64a6', intensity: 1.4 },
    ],
  },
};

export function createStudioEnvironment(renderer, mode = 'studio') {
  const preset = ENV_PRESETS[mode] || ENV_PRESETS.studio;
  const pmrem = new THREE.PMREMGenerator(renderer);

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(preset.domeBot);

  const tempGeos = [];
  const tempMats = [];
  const tempTexs = [];

  // Dark negative-fill studio dome so reflections on blued steel stay razor-sharp & dramatic
  const domeGeo = new THREE.SphereGeometry(28, 32, 24);
  const domeTex = createStudioDomeTexture(preset.domeTop, preset.domeMid, preset.domeBot);
  const domeMat = new THREE.MeshBasicMaterial({
    map: domeTex,
    side: THREE.BackSide,
    toneMapped: false,
  });
  tempGeos.push(domeGeo);
  tempMats.push(domeMat);
  tempTexs.push(domeTex);
  envScene.add(new THREE.Mesh(domeGeo, domeMat));

  // Shared optical softbox scrim texture + unit plane geometry
  const softboxTex = createSoftboxTexture();
  const panelGeo = new THREE.PlaneGeometry(1, 1);
  tempTexs.push(softboxTex);
  tempGeos.push(panelGeo);

  for (const cfg of preset.panels) {
    const hdrColor = new THREE.Color(cfg.color).multiplyScalar(cfg.intensity);
    const mat = new THREE.MeshBasicMaterial({
      color: hdrColor,
      map: softboxTex,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    tempMats.push(mat);

    const mesh = new THREE.Mesh(panelGeo, mat);
    mesh.scale.set(cfg.size[0], cfg.size[1], 1);
    mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    mesh.lookAt(cfg.target[0], cfg.target[1], cfg.target[2]);
    envScene.add(mesh);
  }

  // Bake HDR PMREM cubemap with tight sigma (0.015) so polished & blued metal stay razor sharp
  const renderTarget = pmrem.fromScene(envScene, 0.015, 0.1, 100);

  // Immediately clean up temporary offscreen light-box resources
  for (const geo of tempGeos) geo.dispose();
  for (const mat of tempMats) mat.dispose();
  for (const tex of tempTexs) tex.dispose();

  let disposed = false;
  return {
    envMap: renderTarget.texture,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      renderTarget.dispose();
      pmrem.dispose();
    },
  };
}
