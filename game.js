import * as THREE from 'three';

/* ================= CONFIG ================= */
const CFG = {
  worldX: [-700, 1100], worldZ: [-700, 700],
  roadCenters: [-600, -450, -300, -150, 0, 150, 300, 450, 600],
  roadW: 26,
  sandX: 722, waterX: 800,
  park:   { x0: -525, x1: -175, z0: -525, z1: -175 },
  harbor: { x0: -600, x1: 300,  z0: 560,  z1: 700 },
  spawn: [600, -540],
  carMaxF: 58, carMaxR: 16, accel: 30, brake: 46, drag: 0.35,
  steerMax: 0.62, grip: 9.5, hbGrip: 1.7, turnGrip: 3.2,
  coinN: 40, peopleN: 90,
};
const ZONES = [
  { name: 'DOWNTOWN', x0: -150, x1: 150,  z0: -150, z1: 150,  color: '#ff2e88' },
  { name: 'BEACH',    x0: 600,  x1: 1100, z0: -700, z1: 700,  color: '#ffd166' },
  { name: 'PARK',     x0: -525, x1: -175, z0: -525, z1: -175, color: '#4ade80' },
  { name: 'HARBOR',   x0: -600, x1: 300,  z0: 560,  z1: 700,  color: '#7df9ff' },
  { name: 'MARKET',   x0: -600, x1: -300, z0: -150, z1: 150,  color: '#c084fc' },
];
const SHOP_NAMES = ['CAFE','BAKERY','MOBILE HUB','FASHION','SUPERMART','HOTEL','BARBER','PIZZA','BOOKS','GYM','PHARMA','BAZAAR','TATTOO','FLORIST','ELECTRONICS','SWEETS'];

/* ================= RNG ================= */
let _s = 20261019;
const rnd = () => (_s = (_s * 1664525 + 1013904223) >>> 0, _s / 4294967296);
const rr = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[(rnd() * arr.length) | 0];

/* ================= AUDIO ================= */
const AudioSys = {
  ctx: null, master: null, muted: false,
  engOsc: null, engGain: null, engFilter: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    // engine: sawtooth -> lowpass
    this.engOsc = this.ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 60;
    this.engFilter = this.ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 500;
    this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0;
    this.engOsc.connect(this.engFilter); this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    this.engOsc.start();
    // city ambience: looped noise -> lowpass
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const ns = this.ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 320;
    const ng = this.ctx.createGain(); ng.gain.value = 0.035;
    ns.connect(nf); nf.connect(ng); ng.connect(this.master); ns.start();
  },
  engine(speedFrac, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(on ? 0.05 + speedFrac * 0.075 : 0, t, 0.1);
    this.engOsc.frequency.setTargetAtTime(55 + speedFrac * 165, t, 0.08);
    this.engFilter.frequency.setTargetAtTime(400 + speedFrac * 1400, t, 0.1);
  },
  skid(on) {
    if (!this.ctx) return;
    if (on && !this._skid) {
      const len = this.ctx.sampleRate * 0.5, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
      const g = this.ctx.createGain(); g.gain.value = 0.12;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      this._skid = { s, g };
    } else if (!on && this._skid) {
      const { s, g } = this._skid, t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.05); s.stop(t + 0.3); this._skid = null;
    }
  },
  blip(freq, dur = 0.12, type = 'sine', vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  coin()  { this.blip(988, 0.09, 'square', 0.12); this.blip(1319, 0.16, 'square', 0.12, 0.08); },
  zone()  { [523, 659, 784, 1047].forEach((f, i) => this.blip(f, 0.22, 'triangle', 0.16, i * 0.09)); },
  thud()  { this.blip(70, 0.18, 'sine', 0.35); },
  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }
};
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
/* Synthwave background music sequencer */
const Music = {
  on: false, step: 0, nextT: 0, bpm: 104,
  roots: [33, 29, 36, 31],                       // A1 F1 C2 G1
  bassPat: [0,-1,0,0, 7,-1,0,0, 0,-1,0,12, 7,-1,5,-1],
  arpNotes: [69, 72, 76, 79, 81, 79, 76, 72],
  start() { AudioSys.ensure(); this.on = true; this.step = 0; this.nextT = AudioSys.ctx.currentTime + 0.1; },
  stop() { this.on = false; },
  tick() {
    if (!this.on || AudioSys.muted || !AudioSys.ctx) return;
    const ct = AudioSys.ctx, spb = 60 / this.bpm / 4;
    if (this.nextT < ct.currentTime - 0.4) this.nextT = ct.currentTime + 0.1;  // no catch-up burst
    while (this.nextT < ct.currentTime + 0.25) {
      this.schedule(this.step, this.nextT);
      this.step = (this.step + 1) % 64; this.nextT += spb;
    }
  },
  note(midi, t, dur, type, vol) {
    const c = AudioSys.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = m2f(midi);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AudioSys.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noiseHit(t, dur, vol, freq) {
    const c = AudioSys.ctx, len = c.sampleRate * dur, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(AudioSys.master); s.start(t);
  },
  kick(t) {
    const c = AudioSys.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(AudioSys.master); o.start(t); o.stop(t + 0.2);
  },
  schedule(s, t) {
    const bar = (s >> 4) % 4, st = s % 16, root = this.roots[bar];
    const b = this.bassPat[st];
    if (b >= 0) this.note(root + b, t, 0.22, 'sawtooth', 0.11);
    if (st % 2 === 0) this.note(this.arpNotes[(s >> 1) % 8] + (bar === 3 ? -2 : 0), t, 0.16, 'square', 0.035);
    if (st % 4 === 0) this.kick(t);
    if (st % 4 === 2) this.noiseHit(t, 0.05, 0.05, 6000);
    if (st === 4 || st === 12) this.noiseHit(t, 0.12, 0.09, 1800);
  }
};

/* ================= RENDERER / SCENE ================= */
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdf9a68, 220, 1500);
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.5, 4000);

/* --- sunset sky dome --- */
{
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.0, '#1b1440'); gr.addColorStop(0.42, '#7a3f7d');
  gr.addColorStop(0.62, '#e2607a'); gr.addColorStop(0.74, '#ff9e5e');
  gr.addColorStop(0.82, '#ffd9a0'); gr.addColorStop(1.0, '#5c4a5e');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(cv); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2400, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
  // sun glow sprite
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sg = sc.getContext('2d'), rg = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,240,200,1)'); rg.addColorStop(0.25, 'rgba(255,180,120,.85)');
  rg.addColorStop(1, 'rgba(255,140,90,0)');
  sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const sunTex = new THREE.CanvasTexture(sc);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false }));
  sun.scale.set(700, 700, 1); sun.position.set(1500, 240, -300);
  scene.add(sun);
}
/* --- lights --- */
const hemi = new THREE.HemisphereLight(0xffb37a, 0x3a3f5c, 0.85);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb377, 2.1);
sunLight.position.set(320, 200, -140);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -170; sunLight.shadow.camera.right = 170;
sunLight.shadow.camera.top = 170; sunLight.shadow.camera.bottom = -170;
sunLight.shadow.camera.far = 900; sunLight.shadow.bias = -0.0004;
scene.add(sunLight); scene.add(sunLight.target);
/* --- clouds --- */
const clouds = [];
{
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = rr(40, 216), y = rr(50, 90), r = rr(18, 42);
    const gr = g.createRadialGradient(x, y, 2, x, y, r);
    gr.addColorStop(0, 'rgba(255,200,180,.55)'); gr.addColorStop(1, 'rgba(255,200,180,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(rr(280, 520), rr(110, 190)),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: rr(0.5, 0.85), fog: false, depthWrite: false })
    );
    const a = rr(0, Math.PI * 2), rad = rr(900, 1900);
    m.position.set(Math.cos(a) * rad + 200, rr(280, 520), Math.sin(a) * rad);
    m.userData.vx = rr(1.5, 4);
    scene.add(m); clouds.push(m);
  }
}
/* --- distant mountains --- */
{
  const mGeo = new THREE.ConeGeometry(1, 1, 5);
  const mMat = new THREE.MeshBasicMaterial({ color: 0x4a3d63, fog: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rr(-0.2, 0.2), rad = rr(1500, 1900);
    const m = new THREE.Mesh(mGeo, mMat);
    const h = rr(220, 460), w = rr(260, 480);
    m.scale.set(w, h, w);
    m.position.set(Math.cos(a) * rad + 200, h / 2 - 20, Math.sin(a) * rad);
    m.rotation.y = rr(0, 6);
    scene.add(m);
  }
}
/* --- environment reflections --- */
{
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, '#3a2a6a'); gr.addColorStop(0.55, '#e2607a'); gr.addColorStop(1, '#2a2a3a');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const envTex = new THREE.CanvasTexture(cv);
  envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.colorSpace = THREE.SRGBColorSpace;
  scene.environment = envTex;
}

/* ================= GROUND ================= */
const colliders = [];
const W2M_X = x => x + 700, W2M_Z = z => z + 700;   // 1px = 1m
{
  const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 1400;
  const g = cv.getContext('2d');
  const inP = CFG.park, inH = CFG.harbor;
  // base sidewalk concrete
  g.fillStyle = '#9399a0'; g.fillRect(0, 0, 1800, 1400);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${rr(0.02, 0.07)})`;
    g.fillRect(rr(0, 1800), rr(0, 1400), 2, 2);
  }
  // park grass
  g.fillStyle = '#3e7a38';
  g.fillRect(W2M_X(inP.x0), W2M_Z(inP.z0), inP.x1 - inP.x0, inP.z1 - inP.z0);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rr(20,60)|0},${rr(110,150)|0},${rr(30,70)|0},.5)`;
    g.fillRect(rr(W2M_X(inP.x0), W2M_X(inP.x1)), rr(W2M_Z(inP.z0), W2M_Z(inP.z1)), 3, 3);
  }
  // park paths (cross)
  g.fillStyle = '#b3a284';
  g.fillRect(W2M_X(inP.x0), W2M_Z(-365), inP.x1 - inP.x0, 30);
  g.fillRect(W2M_X(-365), W2M_Z(inP.z0), 30, inP.z1 - inP.z0);
  // harbor concrete + markings
  g.fillStyle = '#7e8287';
  g.fillRect(W2M_X(inH.x0), W2M_Z(inH.z0), inH.x1 - inH.x0, inH.z1 - inH.z0);
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3;
  for (let x = inH.x0 + 40; x < inH.x1; x += 75) {
    g.strokeRect(W2M_X(x), W2M_Z(inH.z0 + 60), 55, 110);
  }
  g.fillStyle = 'rgba(255,200,60,.75)'; g.font = '900 46px Arial'; g.textAlign = 'center';
  g.fillText('PORT OF VICE', W2M_X(-150), W2M_Z(590));
  // beach sand + water
  g.fillStyle = '#dfc08c'; g.fillRect(W2M_X(600), 0, CFG.sandX - 600, 1400);
  const wg = g.createLinearGradient(W2M_X(CFG.sandX), 0, 1800, 0);
  wg.addColorStop(0, '#3d8aa8'); wg.addColorStop(1, '#123a5e');
  g.fillStyle = wg; g.fillRect(W2M_X(CFG.sandX), 0, 1800 - W2M_X(CFG.sandX), 1400);
  // roads
  for (const c of CFG.roadCenters) {
    g.fillStyle = '#33373d';
    g.fillRect(W2M_X(c - 13), 0, 26, 1400);       // vertical
    g.fillRect(0, W2M_Z(c - 13), 1800, 26);       // horizontal
  }
  // road edge lines
  g.fillStyle = 'rgba(240,240,240,.85)';
  for (const c of CFG.roadCenters) {
    g.fillRect(W2M_X(c - 12.4), 0, 1.6, 1400); g.fillRect(W2M_X(c + 10.8), 0, 1.6, 1400);
    g.fillRect(0, W2M_Z(c - 12.4), 1800, 1.6); g.fillRect(0, W2M_Z(c + 10.8), 1800, 1.6);
  }
  // center dashes
  g.fillStyle = '#e8c34a';
  for (const c of CFG.roadCenters) {
    for (let k = -700; k < 1100; k += 26) {
      let onXing = false;
      for (const c2 of CFG.roadCenters) if (Math.abs(k + 7 - c2) < 20) { onXing = true; break; }
      if (!onXing) { g.fillRect(W2M_X(c - 1), W2M_Z(k), 2, 14); g.fillRect(W2M_X(k), W2M_Z(c - 1), 14, 2); }
    }
  }
  // crosswalks at intersections
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (const cx of CFG.roadCenters) for (const cz of CFG.roadCenters) {
    for (let s = -10; s <= 10; s += 5) {
      g.fillRect(W2M_X(cx + s - 1.2), W2M_Z(cz - 16), 2.4, 6);
      g.fillRect(W2M_X(cx + s - 1.2), W2M_Z(cz + 10), 2.4, 6);
      g.fillRect(W2M_X(cx - 16), W2M_Z(cz + s - 1.2), 6, 2.4);
      g.fillRect(W2M_X(cx + 10), W2M_Z(cz + s - 1.2), 6, 2.4);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1400),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(200, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  // animated water shimmer overlay
  const wc = document.createElement('canvas'); wc.width = 256; wc.height = 256;
  const wg2 = wc.getContext('2d');
  wg2.strokeStyle = 'rgba(255,255,255,.35)'; wg2.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    wg2.beginPath();
    const y = rr(0, 256); wg2.moveTo(rr(0, 256), y);
    wg2.bezierCurveTo(rr(0, 256), y + rr(-14, 14), rr(0, 256), y + rr(-14, 14), rr(0, 256), y);
    wg2.stroke();
  }
  const wtex = new THREE.CanvasTexture(wc);
  wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping; wtex.repeat.set(6, 10);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1100 - CFG.waterX, 1400),
    new THREE.MeshBasicMaterial({ map: wtex, transparent: true, opacity: 0.5, color: 0x9fd4e8 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((CFG.waterX + 1100) / 2, 0.08, 0);
  scene.add(water);
  var waterTex = wtex;
}

/* ================= BUILDINGS (realistic + shops) ================= */
function facadeTexture(style, base) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  if (style === 0) {           // pastel art-deco
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, base); gr.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, 0, 256, 10);
    for (let y = 26; y < 250; y += 34) for (let x = 12; x < 250; x += 30) {
      const lit = rnd() < 0.42;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(20,26,44,.85)';
      g.fillRect(x, y, 20, 22);
      g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, 20, 3);
    }
  } else if (style === 1) {    // concrete office
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${rr(0.03, 0.1)})`; g.fillRect(rr(0, 256), rr(0, 256), 3, 3); }
    for (let y = 18; y < 250; y += 40) for (let x = 10; x < 250; x += 34) {
      g.fillStyle = '#2b3548'; g.fillRect(x, y, 26, 28);
      g.fillStyle = rnd() < 0.35 ? 'rgba(255,230,160,.9)' : 'rgba(140,180,220,.35)';
      g.fillRect(x + 3, y + 3, 20, 22);
    }
  } else if (style === 2) {    // brick
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < 256; y += 12) for (let x = (y % 24 ? 0 : 12); x < 256; x += 24) g.fillRect(x, y, 22, 2);
    for (let y = 24; y < 250; y += 52) for (let x = 16; x < 250; x += 44) {
      g.fillStyle = '#1d2433'; g.fillRect(x, y, 26, 34);
      g.fillStyle = rnd() < 0.3 ? 'rgba(255,220,140,.85)' : 'rgba(120,150,190,.3)';
      g.fillRect(x + 3, y + 3, 20, 28);
    }
  } else {                     // glass tower
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5a7a9a'); gr.addColorStop(1, '#2e4258');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let y = 8; y < 256; y += 24) {
      g.fillStyle = 'rgba(10,16,28,.55)'; g.fillRect(0, y, 256, 5);
      g.fillStyle = `rgba(180,220,255,${rr(0.12, 0.4)})`; g.fillRect(0, y + 5, 256, 14);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const facadeTexes = [
  facadeTexture(0, '#e8b4a0'), facadeTexture(0, '#a0c4e8'),
  facadeTexture(1, '#b8b2a6'), facadeTexture(1, '#9aa2ac'),
  facadeTexture(2, '#a06850'), facadeTexture(3, '#ffffff'),
];
const pastelCols = [0xe8b4a0, 0xa0c4e8, 0xf2d8a7, 0xc9a8d8, 0xa8d8b9];
function shopSignTexture(name) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#101018'; g.fillRect(0, 0, 512, 128);
  const neon = pick(['#ff2e88', '#7df9ff', '#ffe259', '#4ade80', '#ff7518']);
  g.strokeStyle = neon; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.font = '900 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = neon; g.shadowBlur = 24; g.fillStyle = '#ffffff';
  g.fillText(name, 256, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function awningTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d'), c1 = pick(['#ff2e88', '#e11d48', '#0ea5e9', '#16a34a']), c2 = '#f5f0e6';
  for (let x = 0; x < 256; x += 32) { g.fillStyle = c1; g.fillRect(x, 0, 16, 64); g.fillStyle = c2; g.fillRect(x + 16, 0, 16, 64); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
{
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95 });
  const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, metalness: 0.4 });
  const inP = CFG.park, inH = CFG.harbor;
  const inRect = (x, z, r, e) => x > r.x0 - e && x < r.x1 + e && z > r.z0 - e && z < r.z1 + e;
  for (let i = 0; i < CFG.roadCenters.length - 1; i++) {
    for (let j = 0; j < CFG.roadCenters.length - 1; j++) {
      const bx = (CFG.roadCenters[i] + CFG.roadCenters[i + 1]) / 2;
      const bz = (CFG.roadCenters[j] + CFG.roadCenters[j + 1]) / 2;
      if (bx > 560) continue;                                   // beach side: no buildings
      if (inRect(bx, bz, inP, 60) || inRect(bx, bz, inH, 25)) continue;
      if (rnd() < 0.12) continue;
      const downtown = Math.abs(bx) < 225 && Math.abs(bz) < 225;
      const inMarket = bx > -600 && bx < -300 && bz > -150 && bz < 150;
      for (const ox of [-31, 31]) for (const oz of [-31, 31]) {
        if (rnd() < 0.08) continue;
        const w = rr(42, 58), d = rr(42, 58);
        const h = downtown ? rr(60, 130) : (Math.abs(bx) < 450 && Math.abs(bz) < 450 ? rr(30, 70) : rr(16, 42));
        const cx = bx + ox + rr(-4, 4), cz = bz + oz + rr(-4, 4);
        const style = downtown && rnd() < 0.4 ? 5 : (rnd() * 5) | 0;
        const tex = facadeTexes[style].clone(); tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, Math.round(w / 24)), Math.max(1, Math.round(h / 24)));
        const sideMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
        if (style <= 1) { sideMat.color.setHex(pick(pastelCols)); }
        const geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0);
        const mesh = new THREE.Mesh(geo, [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat]);
        mesh.position.set(cx, 0, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
        // rooftop AC units
        if (rnd() < 0.55) {
          const n = 1 + ((rnd() * 2) | 0);
          for (let k = 0; k < n; k++) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), acMat);
            ac.position.set(cx + rr(-w / 4, w / 4), h + 0.8, cz + rr(-d / 4, d / 4));
            ac.castShadow = true; scene.add(ac);
          }
        }
        // shops: sign + awning on road-facing side
        const shopChance = inMarket ? 1 : 0.5;
        if (w >= 12 && rnd() < shopChance) {
          let best = null;
          for (const c of CFG.roadCenters) {
            const dxv = Math.abs(cx - c), dzh = Math.abs(cz - c);
            if (!best || dxv < best.d) best = { d: dxv, axis: 'x', c };
            if (dzh < best.d) best = { d: dzh, axis: 'z', c };
          }
          const out = new THREE.Vector3();
          let faceRotY, half;
          if (best.axis === 'x') {
            const s = cx > best.c ? 1 : -1;
            out.set(s, 0, 0); faceRotY = s > 0 ? Math.PI / 2 : -Math.PI / 2; half = w / 2;
          } else {
            const s = cz > best.c ? 1 : -1;
            out.set(0, 0, s); faceRotY = s > 0 ? 0 : Math.PI; half = d / 2;
          }
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(16, w * 0.7), 2.6),
            new THREE.MeshBasicMaterial({ map: shopSignTexture(pick(SHOP_NAMES)) })
          );
          sign.position.set(cx + out.x * (half + 0.5), 5.4, cz + out.z * (half + 0.5));
          sign.rotation.y = faceRotY;
          scene.add(sign);
          const awn = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.min(16, w * 0.7), 3.2),
            new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.9, side: THREE.DoubleSide })
          );
          awn.rotation.order = 'YXZ';
          awn.rotation.y = faceRotY; awn.rotation.x = -Math.PI / 2 + 0.5;
          awn.position.set(cx + out.x * (half + 2), 3.9, cz + out.z * (half + 2));
          awn.castShadow = true;
          scene.add(awn);
        }
      }
    }
  }
}

/* ================= HARBOR: containers + crane ================= */
{
  const contGeo = new THREE.BoxGeometry(6, 2.6, 2.5);
  const contMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.3 });
  const spots = [];
  for (const gx of [-525, -375, -225, -75, 75, 225])
    for (const gz of [640, 672]) {
      spots.push([gx + rr(-6, 6), gz + rr(-3, 3), 1]);
      if (rnd() < 0.5) spots.push([gx + rr(-6, 6), gz + rr(-3, 3), 2]);
    }
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const contCols = [0xc0392b, 0x2471a3, 0x229954, 0xe67e22, 0xf1c40f, 0x8e44ad];
  // flatten levels into instance list
  const flat = [];
  spots.forEach(([x, z, lvl]) => { for (let l = 0; l < lvl; l++) flat.push([x, z, l]); });
  const contMesh = new THREE.InstancedMesh(contGeo, contMat, flat.length);
  flat.forEach(([x, z, l], i) => {
    dummy.position.set(x, 1.3 + l * 2.6, z);
    dummy.rotation.set(0, rr(-0.05, 0.05), 0);
    dummy.updateMatrix(); contMesh.setMatrixAt(i, dummy.matrix);
    contMesh.setColorAt(i, col.setHex(pick(contCols)));
    if (l === 0) colliders.push({ x0: x - 3.2, x1: x + 3.2, z0: z - 1.5, z1: z + 1.5 });
  });
  contMesh.instanceMatrix.needsUpdate = true;
  if (contMesh.instanceColor) contMesh.instanceColor.needsUpdate = true;
  contMesh.castShadow = true; contMesh.receiveShadow = true; contMesh.frustumCulled = false;
  scene.add(contMesh);
  // crane
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xe8a020, roughness: 0.55, metalness: 0.4 });
  const crane = new THREE.Group();
  for (const sx of [-8, 8]) for (const sz of [-6, 6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 20, 1.6), craneMat);
    leg.position.set(225 + sx, 10, 692 + sz); leg.castShadow = true; crane.add(leg);
    colliders.push({ x0: 225 + sx - 1, x1: 225 + sx + 1, z0: 692 + sz - 1, z1: 692 + sz + 1 });
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 2.2, 3), craneMat);
  beam.position.set(225, 21, 692); beam.castShadow = true; crane.add(beam);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 6), craneMat);
  cable.position.set(232, 15.5, 692); crane.add(cable);
  const hookBox = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x2471a3, roughness: 0.6, metalness: 0.3 }));
  hookBox.position.set(232, 10, 692); hookBox.castShadow = true; crane.add(hookBox);
  scene.add(crane);
}

/* ================= PARK: trees, pond, benches ================= */
{
  const inP = CFG.park;
  const clearOfPaths = (x, z) => Math.abs(z + 350) > 24 && Math.abs(x + 350) > 24;
  const clearOfPond = (x, z) => Math.hypot(x + 350, z + 350) > 40;
  const treePos = [];
  let guard = 0;
  while (treePos.length < 60 && guard++ < 800) {
    const x = rr(inP.x0 + 15, inP.x1 - 15), z = rr(inP.z0 + 15, inP.z1 - 15);
    const onRoad = CFG.roadCenters.some(c => Math.abs(x - c) < 18 || Math.abs(z - c) < 18);
    if (clearOfPaths(x, z) && clearOfPond(x, z) && !onRoad) treePos.push([x, z]);
  }
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const trunkM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.32, 0.5, 3.2, 7),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 }), treePos.length);
  const folM = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 9, 7),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }), treePos.length);
  const greens = [0x2e7d32, 0x388e3c, 0x43a047, 0x1b5e20];
  treePos.forEach(([x, z], i) => {
    const s = rr(0.8, 1.5);
    dummy.position.set(x, 1.6 * s, z); dummy.scale.set(s, s, s); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); trunkM.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, (3.2 + 1.6) * s, z); dummy.scale.set(s * rr(1.8, 2.6), s * rr(1.6, 2.2), s * rr(1.8, 2.6));
    dummy.updateMatrix(); folM.setMatrixAt(i, dummy.matrix);
    folM.setColorAt(i, col.setHex(pick(greens)));
  });
  trunkM.instanceMatrix.needsUpdate = folM.instanceMatrix.needsUpdate = true;
  if (folM.instanceColor) folM.instanceColor.needsUpdate = true;
  trunkM.castShadow = folM.castShadow = true;
  trunkM.frustumCulled = folM.frustumCulled = false;
  scene.add(trunkM); scene.add(folM);
  // pond
  const pond = new THREE.Mesh(
    new THREE.CircleGeometry(28, 28),
    new THREE.MeshStandardMaterial({ color: 0x3d8aa8, roughness: 0.15, metalness: 0.35 })
  );
  pond.rotation.x = -Math.PI / 2; pond.position.set(-350, 0.07, -350);
  scene.add(pond);
  // benches along paths
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85 });
  const benchSpots = [[-420, -332], [-280, -332], [-420, -368], [-280, -368], [-332, -420], [-332, -280], [-368, -420], [-368, -280]];
  for (const [x, z] of benchSpots) {
    const b = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.65), benchMat);
    seat.position.y = 0.55; seat.castShadow = true; b.add(seat);
    for (const sx of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.6), benchMat);
      leg.position.set(sx, 0.27, 0); b.add(leg);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), benchMat);
    back.position.set(0, 0.95, -0.3); b.add(back);
    b.position.set(x, 0, z);
    b.rotation.y = Math.abs(z + 350) < 30 ? 0 : Math.PI / 2;
    scene.add(b);
  }
}

/* ================= BILLBOARDS ================= */
function adTexture(lines, bg, fg) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 220;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 220);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, 492, 200);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 22;
  g.font = '900 64px Arial'; g.fillText(lines[0], 256, 88);
  g.font = '700 40px Arial'; g.fillText(lines[1], 256, 158);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
{
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.6 });
  const boards = [
    { p: [450, -548], ry: Math.PI, tex: adTexture(['SUNSET VICE', '★ RACING ★'], '#0c0c18', '#ff2e88') },
    { p: [-548, 200], ry: Math.PI / 2, tex: adTexture(['OCEAN DRIVE', 'BEACH PARTY'], '#08131f', '#7df9ff') },
    { p: [100, 548], ry: 0, tex: adTexture(['NITRO COLA', 'TASTE THE RUSH'], '#1c0c0c', '#ffe259') },
  ];
  for (const b of boards) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 15, 8), poleMat);
    pole.position.set(b.p[0], 7.5, b.p[1]); pole.castShadow = true; scene.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(27, 11.6),
      new THREE.MeshBasicMaterial({ map: b.tex }));
    board.position.set(b.p[0], 20, b.p[1]); board.rotation.y = b.ry;
    scene.add(board);
    colliders.push({ x0: b.p[0] - 1, x1: b.p[0] + 1, z0: b.p[1] - 1, z1: b.p[1] + 1 });
  }
}

/* ================= TRAFFIC LIGHTS ================= */
const trafficLights = [];
{
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.6, metalness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5 });
  for (const [cx, cz] of [[-450, -450], [0, 150], [150, -300], [-300, 300], [300, 0], [-150, -600]]) {
    const px = cx + 17, pz = cz + 17;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 7.5, 8), poleMat);
    pole.position.set(px, 3.75, pz); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.1, 1.1), headMat);
    head.position.set(px, 8.2, pz); scene.add(head);
    const lampCols = [0xff2b2b, 0xffc62b, 0x2bff5e];
    const mats = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: lampCols[k], emissiveIntensity: 0.12 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), m);
      lamp.position.set(px - 0.58, 9.15 - k * 0.95, pz);
      scene.add(lamp); mats.push(m);
    }
    trafficLights.push({ mats });
    colliders.push({ x0: px - 0.5, x1: px + 0.5, z0: pz - 0.5, z1: pz + 0.5 });
  }
}
function updateTrafficLights(t) {
  const phase = ((t / 4) | 0) % 3;   // 0 green, 1 yellow, 2 red
  for (const L of trafficLights)
    L.mats.forEach((m, k) => m.emissiveIntensity = (k === 2 - phase) ? 2.4 : 0.12);
}

/* ================= PALMS & STREETLIGHTS ================= */
{
  const dummy = new THREE.Object3D();
  const palmPos = [];
  for (let z = -680; z <= 680; z += 46) {
    if (rnd() < 0.85) palmPos.push([rr(636, 700), z + rr(-8, 8)]);
    if (rnd() < 0.3) palmPos.push([rr(-650, 550), pick(CFG.roadCenters) + 19]);
  }
  const trunkM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.32, 0.5, 9, 7),
    new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 }), palmPos.length);
  const frondGeo = new THREE.ConeGeometry(0.65, 5.2, 5);
  frondGeo.translate(0, 2.4, 0);
  const frondM = new THREE.InstancedMesh(frondGeo,
    new THREE.MeshStandardMaterial({ color: 0x2f8f3e, roughness: 0.85, side: THREE.DoubleSide }), palmPos.length * 6);
  let fi = 0;
  palmPos.forEach(([x, z], i) => {
    const lean = rr(-0.1, 0.1), s = rr(0.85, 1.25);
    dummy.position.set(x, 4.5 * s, z); dummy.scale.set(s, s, s);
    dummy.rotation.set(lean, rr(0, 6.28), lean); dummy.updateMatrix();
    trunkM.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 6; k++) {
      dummy.position.set(x + Math.sin(lean) * 9 * s, 9 * s - 0.4, z);
      dummy.rotation.set(0.85, (k / 6) * Math.PI * 2 + rr(0, 0.5), 0, 'YXZ');
      dummy.scale.set(s, s, s); dummy.updateMatrix();
      frondM.setMatrixAt(fi++, dummy.matrix);
    }
  });
  trunkM.instanceMatrix.needsUpdate = frondM.instanceMatrix.needsUpdate = true;
  trunkM.castShadow = frondM.castShadow = true; trunkM.frustumCulled = frondM.frustumCulled = false;
  scene.add(trunkM); scene.add(frondM);
  // streetlights at intersections
  const spots = [];
  for (const cx of CFG.roadCenters) for (const cz of CFG.roadCenters) spots.push([cx + 16, cz - 16]);
  const poleM = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.26, 8.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.5 }), spots.length);
  const bulbM = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.42, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0 }), spots.length);
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 4.25, z); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); poleM.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 8.6, z); dummy.updateMatrix(); bulbM.setMatrixAt(i, dummy.matrix);
  });
  poleM.instanceMatrix.needsUpdate = bulbM.instanceMatrix.needsUpdate = true;
  poleM.castShadow = true;
  poleM.frustumCulled = bulbM.frustumCulled = false;
  scene.add(poleM); scene.add(bulbM);
}

/* ================= PEOPLE (crowd) ================= */
const peds = [];
let pedLegs, pedBody, pedHead;
{
  const N = CFG.peopleN;
  const legGeo = new THREE.BoxGeometry(0.62, 0.55, 0.4); legGeo.translate(0, 0.28, 0);
  const bodyGeo = new THREE.BoxGeometry(0.74, 1.15, 0.44); bodyGeo.translate(0, 1.12, 0);
  const headGeo = new THREE.SphereGeometry(0.27, 10, 8); headGeo.translate(0, 1.92, 0);
  pedLegs = new THREE.InstancedMesh(legGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  pedBody = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.85 }), N);
  pedHead = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), N);
  const col = new THREE.Color();
  const shirts = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7, 0xec4899, 0x14b8a6, 0xf97316, 0xe5e7eb, 0x111827];
  const skins = [0xf1c9a5, 0xe0ac82, 0xc68e5e, 0x8d5a3a, 0x6b4226];
  const pants = [0x1f2937, 0x374151, 0x4b5563, 0x1e3a5f, 0x3f3f46];
  for (let i = 0; i < N; i++) {
    const vertical = rnd() < 0.5;
    const c = pick(CFG.roadCenters);
    const side = rnd() < 0.5 ? -19 : 19;
    peds.push({
      axis: vertical ? 'x' : 'z', fixed: c + side,
      t: rr(-650, 650), dir: rnd() < 0.5 ? 1 : -1,
      speed: rr(1.1, 2.4), phase: rr(0, 6.28),
    });
    pedBody.setColorAt(i, col.setHex(pick(shirts)));
    pedHead.setColorAt(i, col.setHex(pick(skins)));
    pedLegs.setColorAt(i, col.setHex(pick(pants)));
  }
  pedLegs.instanceColor.needsUpdate = pedBody.instanceColor.needsUpdate = pedHead.instanceColor.needsUpdate = true;
  pedLegs.castShadow = pedBody.castShadow = true;
  pedLegs.frustumCulled = pedBody.frustumCulled = pedHead.frustumCulled = false;
  scene.add(pedLegs); scene.add(pedBody); scene.add(pedHead);
}
const _pd = new THREE.Object3D();
function updatePeople(dt, elapsed) {
  for (let i = 0; i < peds.length; i++) {
    const p = peds[i];
    p.t += p.dir * p.speed * dt;
    if (p.t > 660) { p.t = 660; p.dir = -1; }
    if (p.t < -660) { p.t = -660; p.dir = 1; }
    const x = p.axis === 'x' ? p.fixed : p.t;
    const z = p.axis === 'x' ? p.t : p.fixed;
    const bob = Math.abs(Math.sin(elapsed * 7 + p.phase)) * 0.08;
    const face = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? 0 : Math.PI);
    _pd.rotation.set(0, face, 0);
    _pd.position.set(x, bob * 0.4, z); _pd.updateMatrix(); pedLegs.setMatrixAt(i, _pd.matrix);
    _pd.position.set(x, bob, z); _pd.updateMatrix(); pedBody.setMatrixAt(i, _pd.matrix);
    _pd.position.set(x, bob * 1.3, z); _pd.updateMatrix(); pedHead.setMatrixAt(i, _pd.matrix);
  }
  pedLegs.instanceMatrix.needsUpdate = pedBody.instanceMatrix.needsUpdate = pedHead.instanceMatrix.needsUpdate = true;
}

/* ================= COINS ================= */
const coins = [];
let coinMesh;
{
  const geo = new THREE.CylinderGeometry(1.15, 1.15, 0.28, 18);
  geo.rotateX(Math.PI / 2);
  coinMesh = new THREE.InstancedMesh(geo,
    new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.25, metalness: 0.9, emissive: 0x8a6d00, emissiveIntensity: 0.4 }),
    CFG.coinN);
  coinMesh.frustumCulled = false;
  for (let i = 0; i < CFG.coinN; i++) coins.push({ x: 0, z: 0, taken: false, respawn: 0, spin: rr(0, 6) });
  scene.add(coinMesh);
}
function coinSpot(c) {
  const cc = pick(CFG.roadCenters);
  if (rnd() < 0.5) { c.x = cc + rr(-8, 8); c.z = rr(-640, 640); }
  else { c.x = rr(-640, 640); c.z = cc + rr(-8, 8); }
}
coins.forEach(coinSpot);
const _cd = new THREE.Object3D();
function updateCoins(dt, elapsed, carX, carZ) {
  let collected = false;
  for (let i = 0; i < coins.length; i++) {
    const c = coins[i];
    if (c.taken) {
      c.respawn -= dt;
      if (c.respawn <= 0) { c.taken = false; coinSpot(c); }
      else { _cd.scale.set(0.001, 0.001, 0.001); _cd.position.set(0, -10, 0); _cd.updateMatrix(); coinMesh.setMatrixAt(i, _cd.matrix); continue; }
    }
    c.spin += dt * 3;
    _cd.scale.set(1, 1, 1);
    _cd.position.set(c.x, 1.4 + Math.sin(elapsed * 2 + c.spin) * 0.25, c.z);
    _cd.rotation.set(0, c.spin, 0); _cd.updateMatrix();
    coinMesh.setMatrixAt(i, _cd.matrix);
    const dx = carX - c.x, dz = carZ - c.z;
    if (dx * dx + dz * dz < 42) { c.taken = true; c.respawn = 25; collected = true; }
  }
  coinMesh.instanceMatrix.needsUpdate = true;
  return collected;
}

/* ================= CAR ================= */
const car = new THREE.Group();
let wheelFL, wheelFR, wheelRL, wheelRR, brakeL, brakeR, carBodyMat;
{
  carBodyMat = new THREE.MeshStandardMaterial({ color: 0xff2e88, roughness: 0.28, metalness: 0.75 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.05, 9.2), carBodyMat);
  body.position.y = 1.15; body.castShadow = true; car.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.72, 2.4), carBodyMat);
  nose.position.set(0, 0.95, 5.4); nose.castShadow = true; car.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.95, 4.4),
    new THREE.MeshStandardMaterial({ color: 0x18242f, roughness: 0.08, metalness: 0.9 }));
  cabin.position.set(0, 2.05, -0.7); cabin.castShadow = true; car.add(cabin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 9.0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
  stripe.position.set(0, 1.7, 0.2); car.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 1.1), carBodyMat);
  wing.position.set(0, 2.35, -4.3); wing.castShadow = true; car.add(wing);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 1.1), carBodyMat);
    fin.position.set(s * 2.2, 1.95, -4.3); car.add(fin);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.5 }));
  bumper.position.set(0, 0.62, 6.5); car.add(bumper);
  const wg = new THREE.CylinderGeometry(0.85, 0.85, 0.7, 18); wg.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.85 });
  const hm = new THREE.MeshStandardMaterial({ color: 0x9aa2ac, roughness: 0.3, metalness: 0.85 });
  const mkWheel = (x, z) => {
    const grp = new THREE.Group();
    const tire = new THREE.Mesh(wg, wm); tire.castShadow = true; grp.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.74, 10), hm);
    hub.rotation.z = Math.PI / 2; grp.add(hub);
    grp.position.set(x, 0.85, z); car.add(grp);
    return grp;
  };
  wheelFL = mkWheel(-2.25, 3.1); wheelFR = mkWheel(2.25, 3.1);
  wheelRL = mkWheel(-2.25, -3.1); wheelRR = mkWheel(2.25, -3.1);
  const hl = new THREE.SpotLight(0xfff0c8, 180, 75, 0.55, 0.5, 1.1);
  hl.position.set(0, 1.6, 6.2);
  hl.target.position.set(0, 0, 40);
  car.add(hl); car.add(hl.target);
  const coneTexC = document.createElement('canvas'); coneTexC.width = 1; coneTexC.height = 64;
  const cg = coneTexC.getContext('2d'), grd = cg.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(255,240,200,.5)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
  cg.fillStyle = grd; cg.fillRect(0, 0, 1, 64);
  const coneTex = new THREE.CanvasTexture(coneTexC);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(5.5, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ map: coneTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  cone.rotation.x = -Math.PI / 2 - 0.06; cone.position.set(0, 1.1, 18.5);
  car.add(cone);
  const tlMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.7 });
  for (const s of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.24), tlMat);
    tl.position.set(s * 1.5, 1.15, -4.65); car.add(tl);
  }
  brakeL = brakeR = tlMat;
  for (const s of [-1, 1]) {
    const hlm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.4, 0.24),
      new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffedb5, emissiveIntensity: 1.6 }));
    hlm.position.set(s * 1.5, 1.0, 6.62); car.add(hlm);
  }
  scene.add(car);
}
/* direction arrow above car */
const arrow = new THREE.Group();
{
  const aMat = new THREE.MeshBasicMaterial({ color: 0x7df9ff, transparent: true, opacity: 0.9 });
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 2.6), aMat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.6, 4), aMat);
  head.rotation.x = Math.PI / 2; head.position.z = 2;
  arrow.add(shaft); arrow.add(head);
  arrow.position.y = 5.2; scene.add(arrow);
}

/* ================= PHYSICS ================= */
const P = {
  x: CFG.spawn[0], z: CFG.spawn[1], heading: Math.PI,
  vF: 0, vL: 0, steer: 0, handbrake: false,
};
function resetCar() {
  P.x = CFG.spawn[0]; P.z = CFG.spawn[1]; P.heading = Math.PI;
  P.vF = 0; P.vL = 0; P.steer = 0;
  syncCarMesh(0);
}
function syncCarMesh(dt) {
  car.position.set(P.x, 0, P.z);
  car.rotation.y = P.heading;
  const steerVis = P.steer * 0.55;
  wheelFL.rotation.y = wheelFR.rotation.y = steerVis;
  const spin = P.vF * dt * 1.4;
  wheelFL.rotation.x += spin; wheelFR.rotation.x += spin;
  wheelRL.rotation.x += spin; wheelRR.rotation.x += spin;
}
function circleHit(x, z, r) {
  for (const b of colliders)
    if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return b;
  return null;
}
const keys = {};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  keys[k] = true;
  if (k === 'm') { const m = AudioSys.toggleMute(); toast(m ? '🔇 MUTED' : '🔊 SOUND ON'); }
  if (k === 'escape') togglePause();
  if (k === 'r' && state === 'play') { resetCar(); toast('↺ CAR RESET'); }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function stepPhysics(dt) {
  const fwdIn = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
  const turnIn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);
  P.handbrake = !!keys[' '];
  const spd = Math.abs(P.vF);
  const steerTarget = turnIn * CFG.steerMax * Math.max(0.35, 1 - spd / 130);
  P.steer += (steerTarget - P.steer) * Math.min(1, dt * 10);
  if (fwdIn > 0) P.vF += CFG.accel * dt * (1 - Math.max(0, P.vF) / CFG.carMaxF);
  else if (fwdIn < 0) {
    if (P.vF > 1) P.vF -= CFG.brake * dt;
    else P.vF -= CFG.accel * 0.55 * dt * (1 - Math.max(0, -P.vF) / CFG.carMaxR);
  } else P.vF -= P.vF * CFG.drag * dt;
  if (P.handbrake) P.vF -= P.vF * 1.4 * dt;
  P.vF = Math.max(-CFG.carMaxR, Math.min(CFG.carMaxF, P.vF));
  const grip = P.handbrake ? CFG.hbGrip : (Math.abs(turnIn) > 0 && spd > 12 ? CFG.turnGrip : CFG.grip);
  P.vL -= P.vL * Math.min(1, grip * dt);
  P.heading += (P.vF * 0.028) * P.steer * dt * 10 * (P.vF < 0 ? -1 : 1) * 0.5;
  const s = Math.sin(P.heading), c = Math.cos(P.heading);
  let nx = P.x + (s * P.vF + c * P.vL) * dt;
  let nz = P.z + (c * P.vF - s * P.vL) * dt;
  const hit = circleHit(nx, nz, 3.4);
  if (hit) {
    AudioSys.thud(); burst(P.x, P.z, 14);
    const cx = Math.max(hit.x0, Math.min(nx, hit.x1)), cz = Math.max(hit.z0, Math.min(nz, hit.z1));
    let ox = nx - cx, oz = nz - cz;
    if (ox === 0 && oz === 0) { ox = nx - P.x; oz = nz - P.z; }
    const len = Math.hypot(ox, oz) || 1; ox /= len; oz /= len;
    nx = cx + ox * 3.5; nz = cz + oz * 3.5;
    const dot = (s * P.vF + c * P.vL) * ox + (c * P.vF - s * P.vL) * oz;
    if (dot < 0) { P.vF *= 0.4; P.vL *= 0.4; }
  }
  nx = Math.max(CFG.worldX[0] + 4, Math.min(CFG.worldX[1] - 4, nx));
  nz = Math.max(CFG.worldZ[0] + 4, Math.min(CFG.worldZ[1] - 4, nz));
  P.x = nx; P.z = nz;
  const drifting = P.handbrake && spd > 14;
  AudioSys.engine(Math.min(1, spd / CFG.carMaxF), true);
  AudioSys.skid(drifting || (Math.abs(P.vL) > 7 && spd > 18));
  if (drifting && rnd() < 0.8) burst(P.x - s * 4, P.z - c * 4, 2);
  brakeL.emissiveIntensity = brakeR.emissiveIntensity = (fwdIn < 0 || P.handbrake) ? 2.6 : 0.7;
  return { fwdIn, drifting, spd };
}

/* ================= DUST ================= */
const DUSTN = 90;
const dust = [];
let dustGeo, dustMat;
{
  dustGeo = new THREE.PlaneGeometry(1.6, 1.6);
  dustMat = new THREE.MeshBasicMaterial({ color: 0xd8c9a8, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < DUSTN; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat.clone());
    m.visible = false; scene.add(m);
    dust.push({ m, life: 0, vx: 0, vz: 0 });
  }
}
let dustIdx = 0;
function burst(x, z, n) {
  for (let k = 0; k < n; k++) {
    const d = dust[dustIdx++ % DUSTN];
    d.m.visible = true; d.life = rr(0.5, 1.1);
    d.m.position.set(x + rr(-2, 2), rr(0.4, 1.4), z + rr(-2, 2));
    d.vx = rr(-4, 4); d.vz = rr(-4, 4);
    d.m.scale.set(1, 1, 1);
  }
}
function updateDust(dt) {
  for (const d of dust) {
    if (!d.m.visible) continue;
    d.life -= dt;
    if (d.life <= 0) { d.m.visible = false; continue; }
    d.m.position.x += d.vx * dt; d.m.position.z += d.vz * dt;
    d.m.position.y += dt * 1.5;
    const s = 1 + (1 - d.life) * 2.4;
    d.m.scale.set(s, s, 1);
    d.m.material.opacity = 0.55 * d.life;
    d.m.quaternion.copy(camera.quaternion);
  }
}

/* ================= MINIMAP ================= */
const mmX = x => (x - CFG.worldX[0]) / (CFG.worldX[1] - CFG.worldX[0]) * 220;
const mmZ = z => (z - CFG.worldZ[0]) / (CFG.worldZ[1] - CFG.worldZ[0]) * 220;
const mm = document.getElementById('minimap').getContext('2d');
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = 220;
{
  const g = mmBase.getContext('2d');
  g.fillStyle = '#141a26'; g.fillRect(0, 0, 220, 220);
  g.fillStyle = '#1d4e6e'; g.fillRect(mmX(CFG.sandX), 0, 220 - mmX(CFG.sandX), 220);
  g.fillStyle = '#2c5c28'; g.fillRect(mmX(-525), mmZ(-525), mmX(-175) - mmX(-525), mmZ(-175) - mmZ(-525));
  g.fillStyle = '#3a4a55'; g.fillRect(mmX(-600), mmZ(560), mmX(300) - mmX(-600), mmZ(700) - mmZ(560));
  g.strokeStyle = '#5a636e'; g.lineWidth = 2;
  for (const c of CFG.roadCenters) {
    g.beginPath(); g.moveTo(mmX(c), 0); g.lineTo(mmX(c), 220); g.stroke();
    g.beginPath(); g.moveTo(0, mmZ(c)); g.lineTo(220, mmZ(c)); g.stroke();
  }
  g.font = '700 9px Arial'; g.textAlign = 'center';
  for (const zn of ZONES) {
    g.fillStyle = zn.color + '2e';
    g.fillRect(mmX(zn.x0), mmZ(zn.z0), mmX(zn.x1) - mmX(zn.x0), mmZ(zn.z1) - mmZ(zn.z0));
    g.fillStyle = zn.color;
    g.fillText(zn.name, (mmX(zn.x0) + mmX(zn.x1)) / 2, (mmZ(zn.z0) + mmZ(zn.z1)) / 2);
  }
}
function drawMinimap() {
  mm.drawImage(mmBase, 0, 0);
  mm.fillStyle = '#ffd700';
  for (const c of coins) if (!c.taken) {
    mm.beginPath(); mm.arc(mmX(c.x), mmZ(c.z), 1.8, 0, 7); mm.fill();
  }
  const px = mmX(P.x), pz = mmZ(P.z);
  mm.save(); mm.translate(px, pz); mm.rotate(-P.heading);
  mm.fillStyle = '#ff2e88';
  mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
  mm.restore();
}

/* ================= GAME FLOW ================= */
let state = 'menu';
const S = {
  score: 0, coinCount: 0, zonesFound: new Set(), elapsed: 0,
  best: parseFloat(localStorage.getItem('svr_best_surv') || '0'),
};
const $ = id => document.getElementById(id);
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2000);
  const n = t.cloneNode(true); t.replaceWith(n);   // restart CSS animation
}
function refreshBest() {
  const b = S.best > 0 ? fmtTime(S.best) : '--:--';
  $('best-time').textContent = b; $('menu-best-time').textContent = b;
}
function startSurvival() {
  AudioSys.ensure(); Music.start();
  S.score = 0; S.coinCount = 0; S.zonesFound = new Set(); S.elapsed = 0;
  for (const c of coins) { c.taken = false; c.respawn = 0; coinSpot(c); }
  resetCar();
  for (const id of ['menu', 'finish', 'pause']) $(id).classList.add('hidden');
  $('hud').classList.remove('hidden');
  refreshBest();
  state = 'countdown';
  const cd = $('countdown'), seq = ['3', '2', '1', 'GO!'];
  let i = 0;
  cd.classList.remove('hidden');
  const stepFn = () => {
    if (state !== 'countdown') { cd.classList.add('hidden'); return; }
    if (i >= seq.length) { cd.classList.add('hidden'); state = 'play'; toast('🌆 SURVIVE THE CITY'); return; }
    cd.textContent = seq[i];
    AudioSys.blip(seq[i] === 'GO!' ? 880 : 440, 0.18, 'square', 0.2);
    i++;
    setTimeout(stepFn, seq[i - 1] === 'GO!' ? 650 : 800);
  };
  stepFn();
}
function togglePause() {
  if (state === 'play') {
    state = 'pause'; $('pause').classList.remove('hidden');
    AudioSys.engine(0, false); AudioSys.skid(false); Music.stop();
  } else if (state === 'pause') {
    state = 'play'; $('pause').classList.add('hidden'); Music.start();
  }
}
function endSession() {
  state = 'over';
  Music.stop(); AudioSys.engine(0, false); AudioSys.skid(false);
  $('pause').classList.add('hidden'); $('hud').classList.add('hidden');
  $('final-time').textContent = fmtTime(S.elapsed);
  $('final-score').textContent = S.score;
  $('final-zones').textContent = S.zonesFound.size + '/5';
  $('final-coins').textContent = S.coinCount;
  let rec = false;
  if (S.elapsed > S.best) { S.best = S.elapsed; localStorage.setItem('svr_best_surv', String(S.best)); rec = true; }
  $('new-record').classList.toggle('hidden', !rec);
  $('finish').classList.remove('hidden');
  refreshBest();
}
function checkZones() {
  for (const zn of ZONES) {
    if (S.zonesFound.has(zn.name)) continue;
    if (P.x > zn.x0 && P.x < zn.x1 && P.z > zn.z0 && P.z < zn.z1) {
      S.zonesFound.add(zn.name); S.score += 500;
      AudioSys.zone(); toast(`📍 ${zn.name} DISCOVERED +500`);
      if (S.zonesFound.size === ZONES.length) { S.score += 2000; toast('🌆 CITY EXPLORER! +2000'); AudioSys.zone(); }
    }
  }
}
function updateHUD(spd) {
  $('speed').textContent = Math.round(spd * 3.2);
  $('timer').textContent = fmtTime(S.elapsed);
  $('score-val').textContent = S.score;
  $('coins-val').textContent = S.coinCount;
  $('zones-count').textContent = S.zonesFound.size + '/5';
}
$('start-btn').addEventListener('click', startSurvival);
$('again-btn').addEventListener('click', startSurvival);
$('resume-btn').addEventListener('click', togglePause);
$('quit-btn').addEventListener('click', endSession);
$('menu-btn').addEventListener('click', () => { if (state === 'play' || state === 'countdown') togglePause(); });
refreshBest();

/* ================= CAMERA ================= */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let menuAngle = 0;
function updateCamera(dt, menu) {
  if (menu) {
    menuAngle += dt * 0.12;
    const r = 420;
    camPos.set(200 + Math.cos(menuAngle) * r, 190, Math.sin(menuAngle) * r);
    camera.position.lerp(camPos, 0.03);
    camera.lookAt(200, 30, 0);
    camera.fov += (58 - camera.fov) * 0.05; camera.updateProjectionMatrix();
    return;
  }
  const s = Math.sin(P.heading), c = Math.cos(P.heading);
  const spd = Math.abs(P.vF);
  camPos.set(P.x - s * (15 + spd * 0.14), 7.5 + spd * 0.045, P.z - c * (15 + spd * 0.14));
  camera.position.lerp(camPos, 1 - Math.pow(0.0001, dt));
  camLook.set(P.x + s * 14, 2.4, P.z + c * 14);
  const lookCur = new THREE.Vector3(); camera.getWorldDirection(lookCur);
  camera.lookAt(camLook);
  const wantFov = 64 + Math.min(1, spd / 58) * 9;
  camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  sunLight.position.set(P.x + 320, 200, P.z - 140);
  sunLight.target.position.set(P.x, 0, P.z);
}

/* ================= MAIN LOOP ================= */
const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;
  for (const cl of clouds) {
    cl.position.x += cl.userData.vx * dt;
    if (cl.position.x > 2100) cl.position.x = -1700;
  }
  waterTex.offset.x += dt * 0.008; waterTex.offset.y += dt * 0.004;
  updateTrafficLights(elapsed);
  updatePeople(dt, elapsed);
  updateDust(dt);
  Music.tick();
  if (state === 'menu' || state === 'over') {
    updateCoins(dt, elapsed, 1e9, 1e9);
    updateCamera(dt, true);
    arrow.visible = false;
  } else if (state === 'play') {
    const { spd } = stepPhysics(dt);
    if (updateCoins(dt, elapsed, P.x, P.z)) { S.score += 100; S.coinCount++; AudioSys.coin(); }
    checkZones();
    S.elapsed += dt;
    syncCarMesh(dt);
    updateCamera(dt, false);
    updateHUD(spd);
    drawMinimap();
    // arrow -> nearest undiscovered zone
    let nz = null, nd = 1e12;
    for (const zn of ZONES) {
      if (S.zonesFound.has(zn.name)) continue;
      const zx = (zn.x0 + zn.x1) / 2, zz = (zn.z0 + zn.z1) / 2;
      const d = (zx - P.x) ** 2 + (zz - P.z) ** 2;
      if (d < nd) { nd = d; nz = [zx, zz]; }
    }
    if (nz) {
      arrow.visible = true;
      arrow.position.set(P.x, 5.4 + Math.sin(elapsed * 3) * 0.3, P.z);
      arrow.rotation.y = Math.atan2(nz[0] - P.x, nz[1] - P.z);
    } else arrow.visible = false;
  } else { // countdown / pause
    updateCoins(dt, elapsed, 1e9, 1e9);
    syncCarMesh(0);
    updateCamera(dt, false);
    arrow.visible = false;
  }
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
resetCar();
animate();
