/**
 * Museum-grade dark glassmorphic HUD for the AK-47 (Type 3) 3D Showcase.
 * Uzbek interface labels with concise technical firearm terminology.
 */

const CAMERA_PRESETS = [
  { id: 'hero', label: 'Asosiy' },
  { id: 'right', label: "O'ng profil" },
  { id: 'left', label: 'Chap profil' },
  { id: 'receiver', label: 'Zatvor va korpus' },
  { id: 'muzzle', label: 'Stvol uchi' },
  { id: 'ads', label: 'Nishonga olish' },
];

const SELECTOR_MODES = [
  { id: 'safe', label: 'Xavfsiz', code: 'П' },
  { id: 'auto', label: 'Avto', code: 'АВ' },
  { id: 'semi', label: 'Yakka', code: 'ОД' },
];

const LIGHTING_MODES = [
  { id: 'studio', label: 'Studiya' },
  { id: 'armory', label: 'Qurolxona' },
  { id: 'tactical', label: 'Taktik' },
];

export function createUI(container, callbacks = {}) {
  const root = container || document.getElementById('hud-root') || document.body;
  root.innerHTML = '';

  // 1. Museum Title Plaque (top-left)
  const titleCard = document.createElement('header');
  titleCard.className = 'hud-title-card';
  titleCard.innerHTML = `
    <div class="hud-eyebrow">
      <span class="hud-eyebrow-dot"></span>
      <span>1955 • Ijevsk • 3D Muzey</span>
    </div>
    <h1 class="hud-title">AK-47 (Type 3) • 7.62×39mm</h1>
    <p class="hud-subtitle">Frezalangan korpus • Qayin fanerasi • Klassik Kalashnikov</p>
    <div class="hud-specs">
      <span class="spec-chip">870 mm</span>
      <span class="spec-chip">Stvol 415 mm</span>
      <span class="spec-chip">30 patron</span>
      <span class="spec-chip">600 o'q/daq</span>
    </div>
  `;
  root.appendChild(titleCard);

  // 2. Right Collapsible Control Panel
  const panelWrap = document.createElement('aside');
  panelWrap.className = 'hud-panel-wrap';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'panel-toggle-btn';
  toggleBtn.setAttribute('aria-expanded', 'true');
  toggleBtn.innerHTML = `
    <span>Boshqaruv</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
  panelWrap.appendChild(toggleBtn);

  const panel = document.createElement('div');
  panel.className = 'hud-panel';

  // --- Section: Mechanisms ---
  const mechSection = document.createElement('section');
  mechSection.className = 'panel-section';
  mechSection.innerHTML = `
    <div class="section-header">
      <span class="section-label">Mexanizmlar</span>
    </div>
  `;

  const actionRow = document.createElement('div');
  actionRow.className = 'btn-row';

  const boltBtn = document.createElement('button');
  boltBtn.type = 'button';
  boltBtn.className = 'ctrl-btn primary';
  boltBtn.textContent = 'Zatvor tortish';

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'ctrl-btn';
  triggerBtn.textContent = 'Tepki bosish';

  actionRow.append(boltBtn, triggerBtn);
  mechSection.appendChild(actionRow);

  // Selector mode segmented control
  const selHeader = document.createElement('div');
  selHeader.className = 'section-header';
  selHeader.style.marginTop = '4px';
  selHeader.innerHTML = `
    <span class="section-label">O't ochish rejimi</span>
    <span class="section-value" data-ref="selector-label">ОД</span>
  `;
  mechSection.appendChild(selHeader);

  const selectorGroup = document.createElement('div');
  selectorGroup.className = 'segmented-group';
  const selectorButtons = new Map();
  for (const mode of SELECTOR_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn';
    btn.dataset.mode = mode.id;
    btn.innerHTML = `${mode.label}<span class="seg-code">${mode.code}</span>`;
    btn.addEventListener('click', () => callbacks.onSelector?.(mode.id));
    selectorButtons.set(mode.id, btn);
    selectorGroup.appendChild(btn);
  }
  mechSection.appendChild(selectorGroup);

  // Magazine toggle button
  const magBtn = document.createElement('button');
  magBtn.type = 'button';
  magBtn.className = 'ctrl-btn full';
  magBtn.innerHTML = `
    <span data-ref="mag-label">Magazinni yechish</span>
    <span class="btn-badge" data-ref="mag-badge">O'rnatilgan</span>
  `;
  mechSection.appendChild(magBtn);

  panel.appendChild(mechSection);

  // --- Section: Exploded View ---
  const explodeSection = document.createElement('section');
  explodeSection.className = 'panel-section';
  explodeSection.innerHTML = `
    <div class="section-header">
      <span class="section-label">Qismlarga ajratish</span>
      <span class="section-value" data-ref="explode-value">0%</span>
    </div>
  `;

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'slider-wrap';

  const explodeSlider = document.createElement('input');
  explodeSlider.type = 'range';
  explodeSlider.className = 'range-input';
  explodeSlider.min = '0';
  explodeSlider.max = '100';
  explodeSlider.step = '1';
  explodeSlider.value = '0';
  explodeSlider.setAttribute('aria-label', 'Qismlarga ajratish darajasi');

  const ticks = document.createElement('div');
  ticks.className = 'slider-ticks';
  ticks.innerHTML = `
    <button type="button" class="slider-tick-btn" data-explode="0">Yig'ilgan</button>
    <button type="button" class="slider-tick-btn" data-explode="50">50%</button>
    <button type="button" class="slider-tick-btn" data-explode="100">To'liq sxema</button>
  `;
  ticks.querySelectorAll('.slider-tick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.explode) / 100;
      callbacks.onExplode?.(val);
    });
  });

  sliderWrap.append(explodeSlider, ticks);
  explodeSection.appendChild(sliderWrap);
  panel.appendChild(explodeSection);

  // --- Section: Lighting & View ---
  const viewSection = document.createElement('section');
  viewSection.className = 'panel-section';
  viewSection.innerHTML = `
    <div class="section-header">
      <span class="section-label">Yoritish muhiti</span>
    </div>
  `;

  const lightingGroup = document.createElement('div');
  lightingGroup.className = 'segmented-group';
  const lightingButtons = new Map();
  for (const preset of LIGHTING_MODES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn';
    btn.dataset.mode = preset.id;
    btn.textContent = preset.label;
    btn.addEventListener('click', () => callbacks.onLighting?.(preset.id));
    lightingButtons.set(preset.id, btn);
    lightingGroup.appendChild(btn);
  }
  viewSection.appendChild(lightingGroup);

  const viewTogglesRow = document.createElement('div');
  viewTogglesRow.className = 'btn-row';

  const autoRotateBtn = document.createElement('button');
  autoRotateBtn.type = 'button';
  autoRotateBtn.className = 'ctrl-btn';
  autoRotateBtn.textContent = 'Aylanish';

  const wireframeBtn = document.createElement('button');
  wireframeBtn.type = 'button';
  wireframeBtn.className = 'ctrl-btn';
  wireframeBtn.textContent = 'Karkas';

  viewTogglesRow.append(autoRotateBtn, wireframeBtn);
  viewSection.appendChild(viewTogglesRow);
  panel.appendChild(viewSection);

  panelWrap.appendChild(panel);
  root.appendChild(panelWrap);

  // 3. Bottom Camera Dock
  const cameraDock = document.createElement('nav');
  cameraDock.className = 'camera-dock';
  cameraDock.setAttribute('aria-label', 'Kamera rakurslari');
  const cameraButtons = new Map();
  for (const cam of CAMERA_PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cam-btn';
    btn.dataset.preset = cam.id;
    btn.textContent = cam.label;
    btn.addEventListener('click', () => callbacks.onCameraPreset?.(cam.id));
    cameraButtons.set(cam.id, btn);
    cameraDock.appendChild(btn);
  }
  root.appendChild(cameraDock);

  // 4. Controls Hint (bottom-left)
  const hint = document.createElement('div');
  hint.className = 'hud-hint';
  hint.textContent = "Aylantirish: chap tugma • Yaqinlashtirish: g'ildirak • Surish: o'ng tugma";
  root.appendChild(hint);

  // 5. Status Toast
  const toastEl = document.createElement('div');
  toastEl.className = 'hud-toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  root.appendChild(toastEl);

  let toastTimer = null;
  function showToast(message) {
    if (!message) return;
    toastEl.textContent = message;
    toastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 1800);
  }

  // Event bindings
  let isCollapsed = false;
  function setCollapsed(collapsed) {
    isCollapsed = Boolean(collapsed);
    panelWrap.classList.toggle('collapsed', isCollapsed);
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
  }

  toggleBtn.addEventListener('click', () => setCollapsed(!isCollapsed));
  boltBtn.addEventListener('click', () => callbacks.onCycleBolt?.());
  triggerBtn.addEventListener('click', () => callbacks.onPullTrigger?.());
  magBtn.addEventListener('click', () => callbacks.onToggleMagazine?.());
  autoRotateBtn.addEventListener('click', () => callbacks.onToggleAutoRotate?.());
  wireframeBtn.addEventListener('click', () => callbacks.onToggleWireframe?.());

  explodeSlider.addEventListener('input', () => {
    const t = Number(explodeSlider.value) / 100;
    callbacks.onExplode?.(t);
  });

  // Refs for state sync
  const selectorLabelEl = panel.querySelector('[data-ref="selector-label"]');
  const magLabelEl = magBtn.querySelector('[data-ref="mag-label"]');
  const magBadgeEl = magBtn.querySelector('[data-ref="mag-badge"]');
  const explodeValueEl = panel.querySelector('[data-ref="explode-value"]');

  function updateSliderBackground(percent) {
    const p = Math.max(0, Math.min(100, percent));
    explodeSlider.style.background = `linear-gradient(90deg, rgba(235, 178, 111, 0.85) 0%, rgba(216, 150, 78, 0.85) ${p}%, rgba(255, 255, 255, 0.12) ${p}%, rgba(255, 255, 255, 0.12) 100%)`;
  }

  function syncState(state) {
    if (!state) return;

    if (state.cameraPreset !== undefined) {
      cameraButtons.forEach((btn, id) => {
        btn.classList.toggle('active', id === state.cameraPreset);
      });
    }

    if (state.selector !== undefined) {
      selectorButtons.forEach((btn, id) => {
        btn.classList.toggle('active', id === state.selector);
      });
      const meta = SELECTOR_MODES.find((m) => m.id === state.selector);
      if (selectorLabelEl && meta) {
        selectorLabelEl.textContent = meta.code;
      }
      triggerBtn.classList.toggle('blocked', state.selector === 'safe');
    }

    if (state.magDetached !== undefined) {
      magBtn.classList.toggle('active', Boolean(state.magDetached));
      if (magLabelEl) {
        magLabelEl.textContent = state.magDetached ? "Magazinni o'rnatish" : 'Magazinni yechish';
      }
      if (magBadgeEl) {
        magBadgeEl.textContent = state.magDetached ? 'Yechilgan' : "O'rnatilgan";
      }
    }

    if (state.explode !== undefined) {
      const pct = Math.round(Math.max(0, Math.min(1, state.explode)) * 100);
      explodeSlider.value = String(pct);
      if (explodeValueEl) explodeValueEl.textContent = `${pct}%`;
      updateSliderBackground(pct);
    }

    if (state.lighting !== undefined) {
      lightingButtons.forEach((btn, id) => {
        btn.classList.toggle('active', id === state.lighting);
      });
    }

    if (state.autoRotate !== undefined) {
      autoRotateBtn.classList.toggle('active', Boolean(state.autoRotate));
    }

    if (state.wireframe !== undefined) {
      wireframeBtn.classList.toggle('active', Boolean(state.wireframe));
    }
  }

  function setVisible(visible) {
    root.classList.toggle('hud-hidden', !visible);
  }

  // Collapse by default on very small viewports so the rifle is unobstructed
  if (window.innerWidth <= 760) {
    setCollapsed(true);
  }

  return {
    syncState,
    showToast,
    setCollapsed,
    setVisible,
  };
}
