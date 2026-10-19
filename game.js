import * as THREE from 'three';

/* ================================================================
   SUNSET VICE RACING — a 3D Vice-City-style city racing game
   Static files only: runs on any desktop browser via GitHub Pages.
   ================================================================ */

// ---------------- Config ----------------
const CFG = {
  worldX0: -700, worldW: 1800,   // x: -700 .. 1100
  worldZ0: -700, worldD: 1400,   // z: -700 .. 700
  roadX0: -600, roadStep: 150, roadN: 9, roadW: 26,
  beachX: 600, sandEnd: 722, waterEnd: 1100,
  carMaxF: 58, carMaxR: -16, carAccel: 30, carBrake: 46,
  gates: [
    [600,-450],[600,-150],[600,150],[600,450],[300,600],
    [-150,600],[-600,450],[-600,150],[-600,-150],[-600,-450],[-150,-600],[300,-600]
  ],
  spawn: { x: 600, z: -540, heading: 0 },
};

// ---------------- Seeded RNG ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261019);
const rr = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length) % arr.length];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

// ---------------- Canvas texture helper ----------------
function makeTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ================================================================
//  AUDIO (all synthesized with WebAudio — no assets needed)
// ================================================================
const AudioSys = {
  ctx: null, muted: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    this.master.connect(c.destination);
    // engine: sawtooth -> lowpass
    this.engOsc = c.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 70;
    this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square'; this.engOsc2.frequency.value = 35;
    this.engFilter = c.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 700;
    this.engGain = c.createGain(); this.engGain.gain.value = 0.0;
    this.engOsc.connect(this.engFilter); this.engOsc2.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc.start(); this.engOsc2.start();
    // skid: looping noise -> bandpass
    const len = c.sampleRate * 1;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.skidSrc = c.createBufferSource(); this.skidSrc.buffer = buf; this.skidSrc.loop = true;
    this.skidFilter = c.createBiquadFilter(); this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1000; this.skidFilter.Q.value = 1.2;
    this.skidGain = c.createGain(); this.skidGain.gain.value = 0.0;
    this.skidSrc.connect(this.skidFilter); this.skidFilter.connect(this.skidGain);
    this.skidGain.connect(this.master); this.skidSrc.start();
  },
  engine(speedRatio, on) {
    if (!this.ctx || this.muted) { if (this.ctx) this.engGain.gain.value = 0; return; }
    const t = this.ctx.currentTime;
    const f = 65 + speedRatio * 175;
    this.engOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engFilter.frequency.setTargetAtTime(500 + speedRatio * 1400, t, 0.1);
    this.engGain.gain.setTargetAtTime(on ? 0.10 + speedRatio * 0.06 : 0.0, t, 0.08);
  },
  skid(on) {
    if (!this.ctx) return;
    this.skidGain.gain.setTargetAtTime(on && !this.muted ? 0.14 : 0.0, this.ctx.currentTime, 0.06);
  },
  blip(freq, dur = 0.12, type = 'sine', vol = 0.25, when = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  checkpoint() { this.blip(660, 0.14); this.blip(990, 0.22, 'sine', 0.25, 0.1); },
  countdownGo() { this.blip(880, 0.4, 'sawtooth', 0.2); },
  countTick() { this.blip(440, 0.12, 'square', 0.15); },
  thud() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const len = c.sampleRate * 0.18;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0.5;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }
};

// ================================================================
//  RENDERER / SCENE / SKY / LIGHTS
// ================================================================
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdf9a68, 260, 1750);

const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.5, 5000);
camera.position.set(600, 60, -620);

// --- sky dome (sunset gradient) ---
const skyTex = makeTex(32, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0.0, '#1b2452');
  gr.addColorStop(0.35, '#4a3f7e');
  gr.addColorStop(0.55, '#b95f7a');
  gr.addColorStop(0.68, '#ff9e64');
  gr.addColorStop(0.75, '#ffd9a0');
  gr.addColorStop(0.78, '#3a2b3f');
  gr.addColorStop(1.0, '#14141f');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2600, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
);
scene.add(sky);

// --- sun glow sprite ---
const glowTex = makeTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,210,1)');
  gr.addColorStop(0.25, 'rgba(255,190,120,0.85)');
  gr.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, fog: false, depthWrite: false }));
sunSprite.scale.set(700, 700, 1);
sunSprite.position.set(1500, 420, -1900);
scene.add(sunSprite);

// --- lights ---
const hemi = new THREE.HemisphereLight(0xffd9b0, 0x3a4a5a, 0.55);
scene.add(hemi);
const sunDir = new THREE.Vector3(0.55, 0.42, -0.5).normalize();
const sun = new THREE.DirectionalLight(0xffb37a, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -170; sun.shadow.camera.right = 170;
sun.shadow.camera.top = 170; sun.shadow.camera.bottom = -170;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);

// --- environment reflections (tiny procedural equirect) for car paint ---
const envTex = makeTex(64, 32, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3a4a7e'); gr.addColorStop(0.45, '#ff9e64');
  gr.addColorStop(0.55, '#5a4a52'); gr.addColorStop(1, '#14141c');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
envTex.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = envTex;

// ================================================================
//  CITY — ground texture, buildings, palms, lamps, water, sign
// ================================================================
const colliders = [];   // {minX,maxX,minZ,maxZ}
const SX = 2048 / CFG.worldW, SZ = 1600 / CFG.worldD;
const px = (x) => (x - CFG.worldX0) * SX;
const pz = (z) => (z - CFG.worldZ0) * SZ;
const roadCenters = [];
for (let i = 0; i < CFG.roadN; i++) roadCenters.push(CFG.roadX0 + i * CFG.roadStep);

// --- ground texture: roads, sidewalks, crosswalks, beach, water ---
const groundTex = makeTex(2048, 1600, (g) => {
  // base
  g.fillStyle = '#6e675c'; g.fillRect(0, 0, 2048, 1600);
  // city blocks: sidewalk + inner plaza
  for (let i = 0; i < CFG.roadN - 1; i++) {
    for (let j = 0; j < CFG.roadN - 1; j++) {
      const x0 = roadCenters[i] + CFG.roadW / 2, x1 = roadCenters[i + 1] - CFG.roadW / 2;
      const z0 = roadCenters[j] + CFG.roadW / 2, z1 = roadCenters[j + 1] - CFG.roadW / 2;
      g.fillStyle = '#8f887c';
      g.fillRect(px(x0), pz(z0), (x1 - x0) * SX, (z1 - z0) * SZ);
      g.fillStyle = '#7c756a';
      g.fillRect(px(x0 + 7), pz(z0 + 7), (x1 - x0 - 14) * SX, (z1 - z0 - 14) * SZ);
    }
  }
  // roads
  g.fillStyle = '#2f3238';
  for (const c of roadCenters) {
    g.fillRect(px(c - CFG.roadW / 2), pz(CFG.worldZ0), CFG.roadW * SX, CFG.worldD * SZ); // vertical
    g.fillRect(px(CFG.worldX0), pz(c - CFG.roadW / 2), CFG.worldW * SX, CFG.roadW * SZ); // horizontal
  }
  // lane dashes
  g.fillStyle = 'rgba(232,222,180,0.85)';
  for (const c of roadCenters) {
    for (let z = CFG.worldZ0 + 20; z < CFG.worldZ0 + CFG.worldD - 20; z += 26)
      g.fillRect(px(c) - 1.2, pz(z), 2.4, 13);
    for (let x = CFG.worldX0 + 20; x < CFG.waterEnd - 20; x += 26)
      g.fillRect(px(x), pz(c) - 1.2, 13, 2.4);
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(240,240,240,0.75)';
  for (const cx of roadCenters) for (const cz of roadCenters) {
    for (let k = -2; k <= 2; k++) {
      g.fillRect(px(cx + k * 4.4) - 1.6, pz(cz - CFG.roadW / 2 + 3), 3.2, 7);
      g.fillRect(px(cx + k * 4.4) - 1.6, pz(cz + CFG.roadW / 2 - 10), 3.2, 7);
    }
  }
  // beach sand + wet strip
  const sandG = g.createLinearGradient(px(CFG.beachX), 0, px(CFG.sandEnd), 0);
  sandG.addColorStop(0, '#d9b47c'); sandG.addColorStop(0.8, '#e8c98a'); sandG.addColorStop(1, '#c9a05e');
  g.fillStyle = sandG;
  g.fillRect(px(CFG.beachX), 0, (CFG.sandEnd - CFG.beachX) * SX, 1600);
  // water
  const wG = g.createLinearGradient(px(CFG.sandEnd), 0, px(CFG.waterEnd), 0);
  wG.addColorStop(0, '#3fa8c4'); wG.addColorStop(0.25, '#2a86b0'); wG.addColorStop(1, '#155a8c');
  g.fillStyle = wG;
  g.fillRect(px(CFG.sandEnd), 0, (CFG.waterEnd - CFG.sandEnd) * SX, 1600);
  // foam edge
  g.fillStyle = 'rgba(255,255,255,0.65)';
  for (let z = 0; z < 1600; z += 26) {
    const wob = Math.sin(z * 0.05) * 8;
    g.fillRect(px(CFG.sandEnd) - 6 + wob, z, 14, 12);
  }
});
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.worldW, CFG.worldD),
  new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(CFG.worldX0 + CFG.worldW / 2, 0, CFG.worldZ0 + CFG.worldD / 2);
ground.receiveShadow = true;
scene.add(ground);

// --- animated water shimmer overlay ---
const waterTex = makeTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3;
  for (let y = 12; y < h; y += 34) {
    g.beginPath();
    for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.09 + y) * 5);
    g.stroke();
  }
});
waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
waterTex.repeat.set(6, 18);
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.waterEnd - CFG.sandEnd, CFG.worldD),
  new THREE.MeshBasicMaterial({ map: waterTex, transparent: true, opacity: 0.28, depthWrite: false })
);
water.rotation.x = -Math.PI / 2;
water.position.set((CFG.sandEnd + CFG.waterEnd) / 2, 0.08, CFG.worldZ0 + CFG.worldD / 2);
scene.add(water);

// --- building facade textures (3 variants, each with emissive lit-windows) ---
function facadeTextures() {
  const variants = [];
  for (let v = 0; v < 3; v++) {
    const lit = [];
    const map = makeTex(128, 256, (g, w, h) => {
      g.fillStyle = '#cfd2d8'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, w, 10);
      const cols = 6, rows = 12, cw = w / cols, rh = h / rows;
      for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
        const isLit = rand() < 0.42;
        lit.push(isLit);
        g.fillStyle = isLit ? '#ffd98a' : '#2b3a4e';
        g.fillRect(cx * cw + cw * 0.22, ry * rh + rh * 0.22, cw * 0.56, rh * 0.56);
      }
    });
    const emissive = makeTex(128, 256, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const cols = 6, rows = 12, cw = w / cols, rh = h / rows;
      let k = 0;
      for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
        if (lit[k++]) {
          g.fillStyle = '#ffca7a';
          g.fillRect(cx * cw + cw * 0.22, ry * rh + rh * 0.22, cw * 0.56, rh * 0.56);
        }
      }
    });
    variants.push({ map, emissive });
  }
  return variants;
}
const facades = facadeTextures();
const pastel = [0xff9eb5, 0x7fe3d0, 0xffe8c9, 0xc3b2ff, 0xffb37a, 0x9ad0ff, 0xf6f0e6];
const sideMats = [], roofMats = [];
for (let f = 0; f < 3; f++) for (let b = 0; b < 3; b++) {
  const t = facades[f];
  const m = t.map.clone(); m.needsUpdate = true; m.repeat.set(1, b + 1);
  const e = t.emissive.clone(); e.needsUpdate = true; e.repeat.set(1, b + 1);
  sideMats.push(new THREE.MeshStandardMaterial({
    color: 0xffffff, map: m, emissiveMap: e,
    emissive: new THREE.Color(0xffbe78), emissiveIntensity: 0.9,
    roughness: 0.85, metalness: 0.05,
  }));
}
for (const c of pastel) roofMats.push(new THREE.MeshStandardMaterial({ color: new THREE.Color(c).multiplyScalar(0.55), roughness: 0.95 }));
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.translate(0, 0.5, 0); // origin at base

function addBuilding(x, z, w, h, d, colorHex) {
  const band = clamp(Math.floor(h / 48), 0, 2);
  const f = Math.floor(rand() * 3);
  const side = sideMats[f * 3 + band].clone();
  side.color.set(colorHex);
  const roof = pick(roofMats);
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const mesh = new THREE.Mesh(boxGeo, [side, side, roof, roof, side, side]);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  return mesh;
}

// --- populate city blocks ---
const downtownX = 0, downtownZ = 0;
for (let i = 0; i < CFG.roadN - 1; i++) {
  for (let j = 0; j < CFG.roadN - 1; j++) {
    const bx0 = roadCenters[i] + CFG.roadW / 2, bx1 = roadCenters[i + 1] - CFG.roadW / 2;
    const bz0 = roadCenters[j] + CFG.roadW / 2, bz1 = roadCenters[j + 1] - CFG.roadW / 2;
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2;
    if (rand() < 0.12) continue; // empty plaza block
    const dc = Math.hypot(cx - downtownX, cz - downtownZ);
    const tall = clamp(1.35 - dc / 750, 0.45, 1.35);
    for (let lx = 0; lx < 2; lx++) for (let lz = 0; lz < 2; lz++) {
      if (rand() < 0.24) continue;
      const lotW = (bx1 - bx0 - 14) / 2, lotD = (bz1 - bz0 - 14) / 2;
      const wx = bx0 + 7 + lotW * (lx + 0.5), wz = bz0 + 7 + lotD * (lz + 0.5);
      const w = rr(36, 52), d = rr(36, 52);
      const h = rr(24, 60) * tall + rr(0, 26);
      addBuilding(wx + rr(-3, 3), wz + rr(-3, 3), w, h, d, pick(pastel));
    }
  }
}

// --- palm trees (instanced) ---
const palmPos = [];
for (let z = -640; z <= 640; z += 44) { palmPos.push([rr(636, 660), z + rr(-8, 8)]); palmPos.push([rr(668, 692), z + 22 + rr(-8, 8)]); }
for (let k = 0; k < 40; k++) {
  const i = Math.floor(rr(0, CFG.roadN - 1)), j = Math.floor(rr(0, CFG.roadN - 1));
  palmPos.push([roadCenters[i] + CFG.roadW / 2 + 6, roadCenters[j] + rr(20, 100)]);
}
const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 10, 6);
trunkGeo.translate(0, 5, 0);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, palmPos.length);
trunkMesh.castShadow = true;
const frondTex = makeTex(128, 64, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#2f7a3d'; g.lineWidth = 7; g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    g.beginPath(); g.moveTo(64, 32);
    g.quadraticCurveTo(64 + Math.cos(a) * 34, 32 + Math.sin(a) * 34 - 10, 64 + Math.cos(a) * 58, 32 + Math.sin(a) * 30 + 12);
    g.stroke();
  }
});
const frondGeo = new THREE.PlaneGeometry(11, 5.5);
const frondMat = new THREE.MeshStandardMaterial({ map: frondTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: 0x9fdf9f });
const frondMesh = new THREE.InstancedMesh(frondGeo, frondMat, palmPos.length * 2);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let fi = 0;
  palmPos.forEach(([x, z], idx) => {
    const lean = rr(-0.06, 0.06), hgt = rr(0.85, 1.2);
    e.set(lean, rr(0, Math.PI * 2), lean); q.setFromEuler(e); p.set(x, 0, z); s.set(1, hgt, 1);
    m.compose(p, q, s); trunkMesh.setMatrixAt(idx, m);
    for (let layer = 0; layer < 2; layer++) {
      e.set(-Math.PI / 2 + (layer === 0 ? -0.35 : 0.15), rr(0, Math.PI * 2), 0); q.setFromEuler(e);
      p.set(x, 10 * hgt - layer * 1.2, z); s.set(1, 1, 1);
      m.compose(p, q, s); frondMesh.setMatrixAt(fi++, m);
    }
  });
  trunkMesh.instanceMatrix.needsUpdate = true;
  frondMesh.instanceMatrix.needsUpdate = true;
}
scene.add(trunkMesh); scene.add(frondMesh);

// --- streetlights (instanced) ---
const lampPos = [];
for (const c of roadCenters) {
  for (let z = -630; z <= 630; z += 130) {
    if (Math.abs(c) > 610) continue;
    lampPos.push([c + 16, z]); lampPos.push([c - 16, z + 65]);
  }
}
const poleGeo = new THREE.CylinderGeometry(0.22, 0.3, 11, 6);
poleGeo.translate(0, 5.5, 0);
const poleMesh = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.6 }), lampPos.length);
const bulbGeo = new THREE.SphereGeometry(0.75, 10, 8);
const bulbMesh = new THREE.InstancedMesh(bulbGeo, new THREE.MeshStandardMaterial({ color: 0x554433, emissive: 0xffc37a, emissiveIntensity: 2.2 }), lampPos.length);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  lampPos.forEach(([x, z], idx) => {
    p.set(x, 0, z); m.compose(p, q, s); poleMesh.setMatrixAt(idx, m);
    p.set(x, 11.2, z); m.compose(p, q, s); bulbMesh.setMatrixAt(idx, m);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  bulbMesh.instanceMatrix.needsUpdate = true;
}
scene.add(poleMesh); scene.add(bulbMesh);

// --- neon billboard near the start (on guaranteed-empty sand) ---
const signTex = makeTex(512, 160, (g, w, h) => {
  g.fillStyle = '#0c0c18'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ff2e88'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
  g.font = '900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2e88'; g.shadowBlur = 26;
  g.fillStyle = '#ffd7e8'; g.fillText('SUNSET VICE', w / 2, h / 2 - 14);
  g.font = '700 30px Arial'; g.shadowColor = '#7df9ff'; g.shadowBlur = 18;
  g.fillStyle = '#d8fbff'; g.fillText('★ RACING ★', w / 2, h / 2 + 44);
});
{
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.6 });
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 22, 8), poleMat);
    pole.position.set(628, 11, -540 + s * 16);
    pole.castShadow = true;
    scene.add(pole);
  }
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 14),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: false })
  );
  signMesh.position.set(628, 27, -540);
  signMesh.rotation.y = -Math.PI / 2; // face the beachfront road
  scene.add(signMesh);
}

// ================================================================
//  CHECKPOINTS
// ================================================================
const gateGroups = [];
const gateState = []; // 'upcoming' | 'next' | 'done'
const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 13, 10);
const beamGeo = new THREE.CylinderGeometry(2.2, 2.2, 70, 10, 1, true);
CFG.gates.forEach(([gx, gz], idx) => {
  const grp = new THREE.Group();
  const col = idx === 0 ? 0x7df9ff : 0x2affd8;
  const pilMat = new THREE.MeshStandardMaterial({ color: 0x123338, emissive: col, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(pillarGeo, pilMat);
    p.position.set(gx + s * 9, 6.5, gz);
    p.castShadow = true;
    grp.add(p);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(gx, 35, gz);
  grp.add(beam);
  grp.userData = { pilMat, beamMat, baseEmissive: 1.6 };
  scene.add(grp);
  gateGroups.push(grp);
  gateState.push(idx === 0 ? 'next' : 'upcoming');
});

// ================================================================
//  CAR
// ================================================================
const car = new THREE.Group();
const carBodyMat = new THREE.MeshStandardMaterial({ color: 0xff2e88, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.1 });
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.95, 4.6), carBodyMat);
  body.position.y = 0.85; body.castShadow = true;
  car.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.2), carBodyMat);
  nose.position.set(0, 0.68, 2.75); nose.castShadow = true;
  car.add(nose);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.75, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.9, roughness: 0.12, envMapIntensity: 1.4 })
  );
  cabin.position.set(0, 1.55, -0.3); cabin.castShadow = true;
  car.add(cabin);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), carBodyMat);
  spoiler.position.set(0, 1.55, -2.15); spoiler.castShadow = true;
  car.add(spoiler);
  for (const s of [-1, 1]) {
    const sup = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.3), carBodyMat);
    sup.position.set(s * 0.9, 1.25, -2.15);
    car.add(sup);
  }
}
const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 16);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.9 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.9, roughness: 0.3 });
const wheels = [];
for (const [wx, wz, front] of [[-1.2, 1.55, true], [1.2, 1.55, true], [-1.2, -1.55, false], [1.2, -1.55, false]]) {
  const steerG = new THREE.Group();
  steerG.position.set(wx, 0.55, wz);
  const wm = new THREE.Mesh(wheelGeo, wheelMat);
  wm.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.52, 10), hubMat);
  hub.geometry.rotateZ(Math.PI / 2);
  steerG.add(wm); steerG.add(hub);
  car.add(steerG);
  wheels.push({ steerG, spin: wm, hub, front });
}
// headlights + taillights
const headMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xfff3d0, emissiveIntensity: 3 });
for (const s of [-1, 1]) {
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.15), headMat);
  hl.position.set(s * 0.75, 0.85, 3.32);
  car.add(hl);
}
const tailMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 1.2 });
for (const s of [-1, 1]) {
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.26, 0.15), tailMat);
  tl.position.set(s * 0.75, 0.95, -2.32);
  car.add(tl);
}
// headlight beam
const headlight = new THREE.SpotLight(0xfff0c8, 160, 70, 0.55, 0.5, 1.1);
headlight.position.set(0, 1.4, 2.8);
const headTarget = new THREE.Object3D();
headTarget.position.set(0, 0.2, 30);
car.add(headlight); car.add(headTarget);
headlight.target = headTarget;
// light cone (fake volumetrics)
const coneTex = makeTex(64, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const cone = new THREE.Mesh(
  new THREE.ConeGeometry(5.5, 26, 12, 1, true),
  new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
);
cone.rotation.x = -Math.PI / 2 - 0.06;
cone.position.set(0, 1.0, 15.5);
car.add(cone);
scene.add(car);

// direction arrow to next checkpoint
const arrow = new THREE.Mesh(
  new THREE.ConeGeometry(1.1, 2.6, 4),
  new THREE.MeshBasicMaterial({ color: 0x7df9ff, fog: false })
);
arrow.rotation.x = Math.PI / 2;
scene.add(arrow);

// ================================================================
//  INPUT
// ================================================================
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'm') {
    const m = AudioSys.toggleMute();
    toast(m ? '🔇 MUTED' : '🔊 SOUND ON');
  }
  if (e.key.toLowerCase() === 'r') resetToCheckpoint();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
const input = {
  get up() { return keys['w'] || keys['arrowup']; },
  get down() { return keys['s'] || keys['arrowdown']; },
  get left() { return keys['a'] || keys['arrowleft']; },
  get right() { return keys['d'] || keys['arrowright']; },
  get brake() { return keys[' ']; },
};

// ================================================================
//  CAR STATE + PHYSICS
// ================================================================
const carState = {
  pos: new THREE.Vector3(CFG.spawn.x, 0, CFG.spawn.z),
  vel: new THREE.Vector3(),
  heading: CFG.spawn.heading,
  steer: 0,
  nextGate: 0,
  startTime: 0, racing: false, finished: false,
  lastThud: 0,
};
function forwardVec(h, out) { return out.set(Math.sin(h), 0, Math.cos(h)); }
const _fwd = new THREE.Vector3(), _lat = new THREE.Vector3();

function stepPhysics(dt) {
  const s = carState;
  forwardVec(s.heading, _fwd);
  const fSpeed = s.vel.dot(_fwd);

  // throttle / brake
  let engine = 0;
  if (input.up) engine = CFG.carAccel;
  if (input.down) engine = fSpeed > 1 ? -CFG.carBrake : -CFG.carAccel * 0.5;
  tailMat.emissiveIntensity = input.down ? 3.2 : 1.2;

  // steering
  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  s.steer += (steerTarget - s.steer) * (1 - Math.exp(-11 * dt));
  const spd = s.vel.length();
  const gripF = clamp(spd / 9, 0, 1);
  const dir = fSpeed >= 0 ? 1 : -1;
  s.heading += s.steer * 2.5 * gripF * dir * (input.brake ? 1.4 : 1) * dt;
  forwardVec(s.heading, _fwd);

  // forces
  s.vel.addScaledVector(_fwd, engine * dt);

  // split velocity: forward keeps, lateral decays (drift on handbrake)
  const f2 = s.vel.dot(_fwd);
  _lat.copy(s.vel).addScaledVector(_fwd, -f2);
  const grip = input.brake ? 1.7 : 9.5;
  _lat.multiplyScalar(Math.exp(-grip * dt));
  let f = f2 * Math.exp(-0.32 * dt);
  f = clamp(f, CFG.carMaxR, CFG.carMaxF);
  s.vel.copy(_fwd).multiplyScalar(f).add(_lat);

  // integrate
  s.pos.addScaledVector(s.vel, dt);

  // world bounds
  const bx0 = -680, bx1 = 1070, bz0 = -680, bz1 = 680;
  if (s.pos.x < bx0) { s.pos.x = bx0; s.vel.x = Math.abs(s.vel.x) * 0.4; }
  if (s.pos.x > bx1) { s.pos.x = bx1; s.vel.x = -Math.abs(s.vel.x) * 0.4; }
  if (s.pos.z < bz0) { s.pos.z = bz0; s.vel.z = Math.abs(s.vel.z) * 0.4; }
  if (s.pos.z > bz1) { s.pos.z = bz1; s.vel.z = -Math.abs(s.vel.z) * 0.4; }

  // building collisions (circle vs AABB)
  const r = 1.8;
  for (const c of colliders) {
    if (s.pos.x < c.minX - 30 || s.pos.x > c.maxX + 30 || s.pos.z < c.minZ - 30 || s.pos.z > c.maxZ + 30) continue;
    const cx = clamp(s.pos.x, c.minX, c.maxX);
    const cz = clamp(s.pos.z, c.minZ, c.maxZ);
    let dx = s.pos.x - cx, dz = s.pos.z - cz;
    let d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 0.001) { dx = s.pos.x - (c.minX + c.maxX) / 2; dz = s.pos.z - (c.minZ + c.maxZ) / 2; d = Math.hypot(dx, dz) || 1; }
      const nx = dx / d, nz = dz / d;
      s.pos.x = cx + nx * r; s.pos.z = cz + nz * r;
      const vn = s.vel.x * nx + s.vel.z * nz;
      if (vn < 0) {
        const impact = -vn;
        s.vel.x -= nx * vn * 1.5; s.vel.z -= nz * vn * 1.5;
        if (impact > 6 && performance.now() - s.lastThud > 350) {
          s.lastThud = performance.now();
          AudioSys.thud();
          spawnDust(s.pos.x - nx * 2, s.pos.z - nz * 2, 10);
        }
      }
    }
  }

  // apply to mesh
  car.position.copy(s.pos);
  car.rotation.y = s.heading;
  const wSpin = (s.vel.dot(_fwd) / 0.55) * dt;
  for (const w of wheels) {
    w.spin.rotation.x += wSpin;
    w.hub.rotation.x += wSpin;
    w.steerG.rotation.y = w.front ? s.steer * 0.42 : 0;
  }
  const drifting = _lat.length() > 5 && spd > 12;
  if (drifting) {
    const bx = s.pos.x - _fwd.x * 2, bz = s.pos.z - _fwd.z * 2;
    spawnDust(bx, bz, 2);
  }
  AudioSys.engine(clamp(spd / CFG.carMaxF, 0, 1), s.racing && !s.finished);
  AudioSys.skid(drifting && s.racing);
  return { drifting, speed: spd };
}

function resetToCheckpoint() {
  const s = carState;
  let x = CFG.spawn.x, z = CFG.spawn.z, h = CFG.spawn.heading;
  if (s.nextGate > 0) {
    const [gx, gz] = CFG.gates[s.nextGate - 1];
    const [nx, nz] = CFG.gates[s.nextGate % CFG.gates.length];
    x = gx; z = gz;
    h = Math.atan2(nx - gx, nz - gz);
  }
  s.pos.set(x, 0, z); s.vel.set(0, 0, 0); s.heading = h; s.steer = 0;
}

// ================================================================
//  DUST PARTICLES
// ================================================================
const dustTex = makeTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(216,192,160,0.85)');
  gr.addColorStop(1, 'rgba(216,192,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const dustPool = [];
for (let i = 0; i < 90; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, transparent: true, opacity: 0, depthWrite: false }));
  sp.position.set(0, -50, 0);
  scene.add(sp);
  dustPool.push({ sp, life: 0, max: 1, vel: new THREE.Vector3() });
}
function spawnDust(x, z, n) {
  let c = 0;
  for (const p of dustPool) {
    if (p.life > 0) continue;
    p.life = p.max = rr(0.45, 0.85);
    p.sp.position.set(x + rr(-1.5, 1.5), rr(0.4, 1.2), z + rr(-1.5, 1.5));
    p.vel.set(rr(-2.5, 2.5), rr(2, 5.5), rr(-2.5, 2.5));
    const s = rr(1.6, 2.6);
    p.sp.scale.set(s, s, 1);
    if (++c >= n) break;
  }
}
function updateDust(dt) {
  for (const p of dustPool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.sp.material.opacity = 0; p.sp.position.y = -50; continue; }
    const t = 1 - p.life / p.max;
    p.sp.position.addScaledVector(p.vel, dt);
    p.vel.y *= (1 - dt * 1.5);
    const s = p.sp.scale.x + dt * 5;
    p.sp.scale.set(s, s, 1);
    p.sp.material.opacity = 0.5 * (1 - t);
  }
}

// ================================================================
//  MINIMAP
// ================================================================
const mmC = document.getElementById('minimap');
const mm = mmC.getContext('2d');
const mmBase = document.createElement('canvas');
mmBase.width = mmBase.height = 220;
{
  const g = mmBase.getContext('2d');
  const S = 220 / CFG.worldW, OY = (220 - CFG.worldD * S) / 2;
  const X = (x) => (x - CFG.worldX0) * S, Z = (z) => (z - CFG.worldZ0) * S + OY;
  g.fillStyle = 'rgba(8,10,20,0.9)'; g.fillRect(0, 0, 220, 220);
  g.fillStyle = '#1d6f9c'; g.fillRect(X(CFG.sandEnd), 0, (CFG.waterEnd - CFG.sandEnd) * S, 220);
  g.fillStyle = '#c9a05e'; g.fillRect(X(CFG.beachX), 0, (CFG.sandEnd - CFG.beachX) * S, 220);
  g.strokeStyle = '#4a5160'; g.lineWidth = Math.max(2, CFG.roadW * S);
  for (const c of roadCenters) {
    g.beginPath(); g.moveTo(X(c), 0); g.lineTo(X(c), 220); g.stroke();
    g.beginPath(); g.moveTo(0, Z(c)); g.lineTo(220, Z(c)); g.stroke();
  }
}
const mmS = 220 / CFG.worldW, mmOY = (220 - CFG.worldD * mmS) / 2;
const mmX = (x) => (x - CFG.worldX0) * mmS;
const mmZ = (z) => (z - CFG.worldZ0) * mmS + mmOY;
function drawMinimap(t) {
  mm.clearRect(0, 0, 220, 220);
  mm.drawImage(mmBase, 0, 0);
  // gates
  CFG.gates.forEach(([gx, gz], i) => {
    const st = gateState[i];
    mm.beginPath();
    mm.arc(mmX(gx), mmZ(gz), st === 'next' ? 5 + Math.sin(t * 6) * 1.6 : 3.4, 0, Math.PI * 2);
    mm.fillStyle = st === 'done' ? 'rgba(42,255,216,0.45)' : st === 'next' ? '#7df9ff' : 'rgba(42,255,216,0.8)';
    mm.fill();
  });
  // car
  const s = carState;
  forwardVec(s.heading, _fwd);
  mm.save();
  mm.translate(mmX(s.pos.x), mmZ(s.pos.z));
  mm.rotate(Math.atan2(_fwd.x, -_fwd.z));
  mm.fillStyle = '#ff2e88';
  mm.strokeStyle = '#fff'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(0, -8); mm.lineTo(5.5, 6); mm.lineTo(-5.5, 6); mm.closePath();
  mm.fill(); mm.stroke();
  mm.restore();
}

// ================================================================
//  HUD / UI helpers
// ================================================================
const speedEl = document.getElementById('speed');
const timerEl = document.getElementById('timer');
const cpEl = document.getElementById('cp-count');
const bestEl = document.getElementById('best-time');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1600);
}
function fmtTime(ms) {
  const t = ms / 1000;
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
function loadBest() {
  const b = parseInt(localStorage.getItem('svr_best') || '0', 10);
  return b > 0 ? b : null;
}
function refreshBestLabels() {
  const b = loadBest();
  bestEl.textContent = b ? fmtTime(b) : '--:--.-';
  const mb = document.getElementById('menu-best');
  if (b) { mb.classList.remove('hidden'); document.getElementById('menu-best-time').textContent = fmtTime(b); }
}
function applyGateVisual(i) {
  const u = gateGroups[i].userData, st = gateState[i];
  if (st === 'next') { u.pilMat.emissive.set(0x7df9ff); u.beamMat.color.set(0x7df9ff); }
  else if (st === 'done') { u.pilMat.emissive.set(0x1a8a6a); u.beamMat.color.set(0x2affd8); }
  else { u.pilMat.emissive.set(0x2affd8); u.beamMat.color.set(0x2affd8); }
}

// ================================================================
//  RACE FLOW
// ================================================================
function resetRace() {
  const s = carState;
  s.pos.set(CFG.spawn.x, 0, CFG.spawn.z);
  s.vel.set(0, 0, 0);
  s.heading = CFG.spawn.heading; s.steer = 0;
  s.nextGate = 0; s.finished = false; s.racing = false;
  for (let i = 0; i < CFG.gates.length; i++) {
    gateState[i] = i === 0 ? 'next' : 'upcoming';
    applyGateVisual(i);
    const u = gateGroups[i].userData;
    u.pilMat.emissiveIntensity = 1.4; u.beamMat.opacity = 0.14;
  }
  cpEl.textContent = `0/${CFG.gates.length}`;
  timerEl.textContent = '0:00.0';
  speedEl.textContent = '0';
}
function startCountdown() {
  const el = document.getElementById('countdown');
  const seq = ['3', '2', '1', 'GO!'];
  let i = 0;
  el.classList.remove('hidden');
  const stepFn = () => {
    if (i < seq.length) {
      el.textContent = seq[i];
      if (seq[i] === 'GO!') AudioSys.countdownGo(); else AudioSys.countTick();
      i++;
      setTimeout(stepFn, seq[i - 1] === 'GO!' ? 650 : 850);
    } else {
      el.classList.add('hidden');
      carState.racing = true;
      carState.startTime = performance.now();
    }
  };
  stepFn();
}
function onGateReached() {
  const s = carState;
  gateState[s.nextGate] = 'done';
  applyGateVisual(s.nextGate);
  const u = gateGroups[s.nextGate].userData;
  u.pilMat.emissiveIntensity = 0.25; u.beamMat.opacity = 0.05;
  s.nextGate++;
  AudioSys.checkpoint();
  if (s.nextGate >= CFG.gates.length) {
    s.finished = true; s.racing = false;
    const ms = performance.now() - s.startTime;
    const prev = loadBest();
    const isRecord = !prev || ms < prev;
    if (isRecord) localStorage.setItem('svr_best', String(Math.round(ms)));
    document.getElementById('final-time').textContent = fmtTime(ms);
    document.getElementById('new-record').classList.toggle('hidden', !isRecord);
    document.getElementById('finish').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    AudioSys.engine(0, false); AudioSys.skid(false);
    refreshBestLabels();
  } else {
    gateState[s.nextGate] = 'next';
    applyGateVisual(s.nextGate);
    cpEl.textContent = `${s.nextGate}/${CFG.gates.length}`;
    toast(`CHECKPOINT ${s.nextGate}/${CFG.gates.length}`);
  }
}

// menu wiring
refreshBestLabels();
document.getElementById('start-btn').addEventListener('click', () => {
  AudioSys.init();
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  resetRace();
  startCountdown();
  toast('REACH ALL CHECKPOINTS!');
});
document.getElementById('again-btn').addEventListener('click', () => {
  document.getElementById('finish').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  resetRace();
  startCountdown();
});

// ================================================================
//  CAMERA
// ================================================================
const camDesired = new THREE.Vector3(), camLook = new THREE.Vector3();
let menuCamA = 0;
function updateCamera(dt, t) {
  const s = carState;
  if (!s.racing && !s.finished && document.getElementById('menu').classList.contains('hidden') === false) {
    // cinematic menu orbit
    menuCamA += dt * 0.08;
    camera.position.set(Math.cos(menuCamA) * 520, 130, Math.sin(menuCamA) * 520);
    camera.lookAt(0, 20, 0);
    if (Math.abs(camera.fov - 58) > 0.1) { camera.fov = 58; camera.updateProjectionMatrix(); }
    return;
  }
  forwardVec(s.heading, _fwd);
  camDesired.copy(s.pos).addScaledVector(_fwd, -11).add(camLook.set(-_fwd.z, 0, _fwd.x).multiplyScalar(s.steer * 1.4));
  camDesired.y = 4.8;
  camera.position.lerp(camDesired, 1 - Math.exp(-6.5 * dt));
  camLook.copy(s.pos).addScaledVector(_fwd, 7); camLook.y = 1.6;
  camera.lookAt(camLook);
  const spdR = clamp(s.vel.length() / CFG.carMaxF, 0, 1);
  const fovT = 64 + spdR * 9;
  if (Math.abs(camera.fov - fovT) > 0.05) { camera.fov += (fovT - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix(); }
}

// ================================================================
//  MAIN LOOP
// ================================================================
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const s = carState;

  if (s.racing && !s.finished) {
    const { speed } = stepPhysics(dt);
    speedEl.textContent = String(Math.round(speed * 3.6));
    timerEl.textContent = fmtTime(performance.now() - s.startTime);
    // checkpoint check
    const [gx, gz] = CFG.gates[s.nextGate];
    if (Math.hypot(s.pos.x - gx, s.pos.z - gz) < 11) onGateReached();
  }

  // sun follows car for tight shadows
  sun.position.copy(s.pos).addScaledVector(sunDir, 420);
  sun.target.position.copy(s.pos);
  sun.target.updateMatrixWorld();

  // gate pulse
  for (let i = 0; i < gateGroups.length; i++) {
    const u = gateGroups[i].userData;
    if (gateState[i] === 'next') {
      const p = 0.5 + 0.5 * Math.sin(t * 6);
      u.pilMat.emissiveIntensity = 1.6 + p * 1.2;
      u.beamMat.opacity = 0.2 + p * 0.14;
    }
  }

  // next-gate arrow
  if (!s.finished && s.nextGate < CFG.gates.length && (s.racing || s.nextGate > 0)) {
    const [gx, gz] = CFG.gates[s.nextGate];
    arrow.visible = true;
    arrow.position.set(s.pos.x, 5.2 + Math.sin(t * 4) * 0.35, s.pos.z);
    arrow.lookAt(gx, 5.2, gz);
    arrow.rotateX(Math.PI / 2);
  } else arrow.visible = false;

  waterTex.offset.x = (t * 0.014) % 1;
  waterTex.offset.y = (t * 0.007) % 1;

  updateDust(dt);
  updateCamera(dt, t);
  if (!document.getElementById('hud').classList.contains('hidden')) drawMinimap(t);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
