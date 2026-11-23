# AK-47 (Type 3) • 3D Interactive Showcase

Photorealistic procedural 3D showcase of the classic **AK-47 Type 3 (1955 Izhevsk)** built with **Three.js (WebGL PBR)** and **Vite**.

## Features
- **100% Procedural Geometry**: Milled Type 3 receiver with lightening cuts, dust cover, tangent rear sight (`П 1–8`), brushed chrome bolt carrier & long-stroke piston, selector lever (`АВ` / `ОД`), stepped barrel with M14×1 LH threads, slant muzzle compensator, 45° gas block, vented gas tube, open-top front sight hood, lofted laminated birch wood furniture, checkered pistol grip, ribbed 30-round steel magazine, and 7.62×39mm cartridges.
- **Procedural PBR Materials & Studio Lighting**: High-resolution Canvas2D diffuse, normal, and roughness maps + procedural PMREM studio environments (*Studiya*, *Qurolxona*, *Taktik*).
- **Interactive Controls**:
  - 6 camera presets (*Asosiy*, *O‘ng profil*, *Chap profil*, *Zatvor va korpus*, *Stvol uchi*, *Nishonga olish / ADS*)
  - Bolt cycling, trigger pull, fire selector (`Xavfsiz`, `Avto`, `Yakka`), rock-and-lock magazine detach, and 0–100% exploded disassembly view
  - Auto-rotate and wireframe inspection modes

## Run Locally

With Node.js + Vite:
```bash
npm install
npm run dev
```

Or zero-dependency static server (uses vendored Three.js importmap):
```bash
python -m http.server 5173
```

## Build for Production
```bash
npm run build
npm run preview
```
