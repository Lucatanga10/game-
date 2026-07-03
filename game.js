/* ============================================================
   8 BALL POOL 3D — webapp completa
   Fisica realistica, regole ufficiali 8-ball, bot a 5 livelli,
   mira assistita, potenza, suoni sintetizzati, monete.
   ============================================================ */
'use strict';

/* ---------------- COSTANTI DI GIOCO ---------------- */
const PLAY_W = 2.24, PLAY_H = 1.12;          // area di gioco (m)
const HW = PLAY_W / 2, HH = PLAY_H / 2;
const R = 0.0286;                             // raggio palla (m)
const BALL_MASS = 0.17;
const MAX_SHOT_SPEED = 8.6;                   // m/s al 100% potenza
const FRICTION = 0.9;                         // decelerazione (m/s^2)
const DRAG = 0.24;                            // attrito proporzionale
const STOP_SPEED = 0.02;
const BALL_REST = 0.94;                       // restituzione palla-palla
const CUSHION_REST = 0.72;                    // restituzione sponda
const SUBDT = 1 / 300;                        // passo fisico fisso
const TURN_TIME = 40;                         // secondi per turno

const POCKETS = [
  { x: -HW - 0.012, z: -HH - 0.012, r: 0.060, corner: true },
  { x:  HW + 0.012, z: -HH - 0.012, r: 0.060, corner: true },
  { x: -HW - 0.012, z:  HH + 0.012, r: 0.060, corner: true },
  { x:  HW + 0.012, z:  HH + 0.012, r: 0.060, corner: true },
  { x: 0, z: -HH - 0.032, r: 0.054, corner: false },
  { x: 0, z:  HH + 0.032, r: 0.054, corner: false },
];
const CORNER_GAP = 0.085;   // apertura sponda vicino a buca d'angolo
const SIDE_GAP = 0.068;     // apertura sponda vicino a buca centrale

const BALL_COLORS = {
  1: '#fdd017', 2: '#1560bd', 3: '#e02a1e', 4: '#6a0dad', 5: '#f97316',
  6: '#0f7a3d', 7: '#8b1a1a', 8: '#111111',
  9: '#fdd017', 10: '#1560bd', 11: '#e02a1e', 12: '#6a0dad', 13: '#f97316',
  14: '#0f7a3d', 15: '#8b1a1a',
};

const BOTS = [
  { name: 'Gino',    emoji: '🐢', level: 'SCARSO',     color: '#84cc16', desc: 'Sbaglia spesso, perfetto per iniziare', bet: 100,
    aimErr: 0.055, powErr: 0.30, blunder: 0.45, think: 1.6 },
  { name: 'Marta',   emoji: '🎯', level: 'MEDIO',      color: '#38bdf8', desc: 'Gioca discretamente, ogni tanto sbaglia', bet: 250,
    aimErr: 0.024, powErr: 0.18, blunder: 0.22, think: 1.3 },
  { name: 'Diego',   emoji: '🔥', level: 'FORTE',      color: '#fb923c', desc: 'Preciso e aggressivo, difficile da battere', bet: 500,
    aimErr: 0.010, powErr: 0.10, blunder: 0.08, think: 1.1 },
  { name: 'Viktor',  emoji: '🦈', level: 'FORTISSIMO', color: '#f472b6', desc: 'Uno squalo del biliardo, quasi infallibile', bet: 1000,
    aimErr: 0.004, powErr: 0.05, blunder: 0.02, think: 0.9 },
  { name: 'AXION',   emoji: '⚡', level: 'LEGGENDA',   color: '#fbbf24', desc: 'Ultra mega forte: ti batte facilmente', bet: 2500,
    aimErr: 0.0012, powErr: 0.02, blunder: 0.0, think: 0.7 },
];

const CUE_COLORS = [
  { name: 'Classica', hex: '#8b5a2b' },
  { name: 'Nera',     hex: '#23272f' },
  { name: 'Rossa',    hex: '#c0392b' },
  { name: 'Blu',      hex: '#2563eb' },
  { name: 'Viola',    hex: '#7c3aed' },
  { name: 'Oro',      hex: '#d4af37' },
];

/* ---------------- SALVATAGGI ---------------- */
const store = {
  get coins() { return parseInt(localStorage.getItem('pool8.coins') || '1000', 10); },
  set coins(v) { localStorage.setItem('pool8.coins', String(Math.max(0, Math.round(v)))); },
  get cue() { return parseInt(localStorage.getItem('pool8.cue') || '0', 10); },
  set cue(v) { localStorage.setItem('pool8.cue', String(v)); },
  get bot() { return parseInt(localStorage.getItem('pool8.bot') || '0', 10); },
  set bot(v) { localStorage.setItem('pool8.bot', String(v)); },
  get hints() { return localStorage.getItem('pool8.hints') !== '0'; },
  set hints(v) { localStorage.setItem('pool8.hints', v ? '1' : '0'); },
  get sound() { return localStorage.getItem('pool8.sound') !== '0'; },
  set sound(v) { localStorage.setItem('pool8.sound', v ? '1' : '0'); },
};

/* ---------------- AUDIO (sintetizzato, nessun file) ---------------- */
const Sound = (() => {
  let ctx = null, lastPlay = {};
  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function limited(key, minGap) {
    const t = performance.now();
    if (lastPlay[key] && t - lastPlay[key] < minGap) return true;
    lastPlay[key] = t; return false;
  }
  function env(gainNode, t0, peak, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.004);
    g.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noiseBuf(c) {
    const b = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let _noise = null;
  function playNoise(freq, q, vol, dur) {
    const c = ac(); if (!_noise) _noise = noiseBuf(c);
    const src = c.createBufferSource(); src.buffer = _noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); env(g, c.currentTime, vol, dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(); src.stop(c.currentTime + dur + 0.05);
  }
  function playTone(freq, type, vol, dur, t0off = 0, slide = 0) {
    const c = ac();
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), c.currentTime + t0off + dur);
    const g = c.createGain(); env(g, c.currentTime + t0off, vol, dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + t0off); o.stop(c.currentTime + t0off + dur + 0.05);
  }
  return {
    unlock() { try { ac(); } catch (e) {} },
    click(strength) { // palla contro palla
      if (!store.sound || limited('click', 30)) return;
      const v = Math.min(0.5, 0.06 + strength * 0.09);
      playNoise(2600, 1.2, v, 0.05); playTone(900 + strength * 300, 'sine', v * 0.5, 0.03);
    },
    cushion(strength) {
      if (!store.sound || limited('cush', 40)) return;
      playNoise(420, 1.0, Math.min(0.3, 0.04 + strength * 0.05), 0.07);
    },
    cueHit(p) {
      if (!store.sound) return;
      playNoise(3200, 1.5, 0.12 + p * 0.25, 0.04); playTone(1400, 'sine', 0.1, 0.025);
    },
    pocket() {
      if (!store.sound || limited('pocket', 60)) return;
      playTone(300, 'sine', 0.25, 0.16, 0, -180); playNoise(180, 0.8, 0.22, 0.22);
    },
    foul() {
      if (!store.sound) return;
      playTone(180, 'square', 0.12, 0.16); playTone(140, 'square', 0.12, 0.22, 0.14);
    },
    win() {
      if (!store.sound) return;
      [523, 659, 784, 1047, 1319].forEach((f, i) => playTone(f, 'triangle', 0.16, 0.32, i * 0.13));
    },
    lose() {
      if (!store.sound) return;
      [392, 330, 262, 196].forEach((f, i) => playTone(f, 'triangle', 0.13, 0.3, i * 0.17));
    },
    turn() {
      if (!store.sound) return;
      playTone(660, 'sine', 0.07, 0.09);
    },
  };
})();

/* ---------------- TEXTURE GENERATE (canvas) ---------------- */
function ballTexture(num) {
  const w = 512, h = 256;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const col = BALL_COLORS[num];
  if (num === 0) { // bianca
    c.fillStyle = '#f6f3ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d64545';
    c.beginPath(); c.arc(w * 0.25, h * 0.5, 7, 0, 7); c.fill();
    c.beginPath(); c.arc(w * 0.75, h * 0.5, 7, 0, 7); c.fill();
  } else if (num <= 8) { // piene
    c.fillStyle = col; c.fillRect(0, 0, w, h);
  } else { // spezzate: banda colorata centrale su fondo bianco
    c.fillStyle = '#f6f3ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = col; c.fillRect(0, h * 0.24, w, h * 0.52);
  }
  if (num > 0) {
    for (const u of [0.25, 0.75]) {
      c.fillStyle = '#f6f3ea';
      c.beginPath(); c.arc(w * u, h * 0.5, 40, 0, 7); c.fill();
      c.fillStyle = '#111';
      c.font = 'bold 52px Arial';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(num), w * u, h * 0.5 + 3);
      if (num === 6 || num === 9) { // sottolinea per non confondere
        c.fillRect(w * u - 16, h * 0.5 + 26, 32, 4);
      }
    }
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  return tx;
}

function clothTexture() {
  const s = 512;
  const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
  const c = cv.getContext('2d');
  c.fillStyle = '#0e8a44'; c.fillRect(0, 0, s, s);
  // fibre del panno: rumore fine, effetto "prato" soffice
  const img = c.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n * 0.4; img.data[i + 1] += n; img.data[i + 2] += n * 0.5;
  }
  c.putImageData(img, 0, 0);
  c.globalAlpha = 0.08;
  for (let i = 0; i < 260; i++) { // fili d'erba/pelo del panno
    c.strokeStyle = Math.random() > 0.5 ? '#1db058' : '#0a6b34';
    c.beginPath();
    const x = Math.random() * s, y = Math.random() * s;
    c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14);
    c.stroke();
  }
  c.globalAlpha = 1;
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 8;
  return tx;
}

function woodTexture() {
  const w = 512, h = 256;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#5a3417'); g.addColorStop(0.5, '#7a4a22'); g.addColorStop(1, '#4d2c12');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.globalAlpha = 0.25;
  for (let i = 0; i < 40; i++) { // venature
    c.strokeStyle = i % 2 ? '#3c2210' : '#8a5a2e';
    c.lineWidth = 1 + Math.random() * 3;
    c.beginPath();
    const y = Math.random() * h;
    c.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 8);
    c.stroke();
  }
  c.globalAlpha = 1;
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function envTexture() { // ambiente per i riflessi delle palle
  const w = 64, h = 32;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3b4b5a'); g.addColorStop(0.5, '#141a20'); g.addColorStop(1, '#06090c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff8e0'; // lampada sopra il tavolo
  c.fillRect(w * 0.35, 0, w * 0.3, h * 0.14);
  const tx = new THREE.CanvasTexture(cv);
  tx.mapping = THREE.EquirectangularReflectionMapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

/* ---------------- SCENA 3D ---------------- */
let renderer, scene, camera;
const canvas = document.getElementById('canvas3d');

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a1210');
  scene.environment = envTexture();
  scene.fog = new THREE.Fog('#0a1210', 6, 14);

  camera = new THREE.PerspectiveCamera(50, 1, 0.05, 30);
  camera.position.set(-2, 1.4, 0);

  // luci
  scene.add(new THREE.HemisphereLight('#cfe8d8', '#0c1a12', 0.55));
  const sun = new THREE.DirectionalLight('#fff6e0', 2.0);
  sun.position.set(0.6, 3.2, 0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1.8; sun.shadow.camera.right = 1.8;
  sun.shadow.camera.top = 1.4; sun.shadow.camera.bottom = -1.4;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 7;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#bcd9ff', 0.5);
  fill.position.set(-1.5, 2.0, -1.2);
  scene.add(fill);

  buildTable();
  buildBalls();
  buildCue();
  buildAimHelpers();
  onResize();
  window.addEventListener('resize', onResize);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/* ---------------- TAVOLO ---------------- */
const clothMat = () => new THREE.MeshStandardMaterial({ map: TEX.cloth, roughness: 0.92, metalness: 0 });
let TEX = {};

function buildTable() {
  TEX.cloth = clothTexture();
  TEX.wood = woodTexture();

  // panno di gioco
  const clothTop = TEX.cloth.clone(); clothTop.repeat.set(4, 2); clothTop.needsUpdate = true;
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(PLAY_W + 0.16, 0.04, PLAY_H + 0.16),
    new THREE.MeshStandardMaterial({ map: clothTop, roughness: 0.93 })
  );
  bed.position.y = -0.02;
  bed.receiveShadow = true;
  scene.add(bed);

  // sponde (cuscini) in panno
  const cushMat = clothMat();
  const CH = 0.045, CW = 0.055, CY = CH / 2;
  const addCush = (cx, cz, sx, sz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, CH, sz), cushMat);
    m.position.set(cx, CY, cz);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  };
  // sponde lunghe (z = ±HH), spezzate dalla buca centrale
  for (const sz of [-1, 1]) {
    const zPos = sz * (HH + CW / 2 - 0.004);
    const x1a = -HW + CORNER_GAP, x1b = -SIDE_GAP;
    const x2a = SIDE_GAP, x2b = HW - CORNER_GAP;
    addCush((x1a + x1b) / 2, zPos, x1b - x1a, CW);
    addCush((x2a + x2b) / 2, zPos, x2b - x2a, CW);
  }
  // sponde corte (x = ±HW)
  for (const sx of [-1, 1]) {
    const xPos = sx * (HW + CW / 2 - 0.004);
    const za = -HH + CORNER_GAP, zb = HH - CORNER_GAP;
    addCush(xPos, (za + zb) / 2, CW, zb - za);
  }

  // cornice in legno
  const woodMat = new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.5, metalness: 0.05 });
  const FW = 0.13, FH = 0.075;
  const frame = new THREE.Group();
  const fLong = new THREE.BoxGeometry(PLAY_W + 0.42, FH, FW);
  const fShort = new THREE.BoxGeometry(FW, FH, PLAY_H + 0.42);
  for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(fLong, woodMat);
    m.position.set(0, FH / 2 - 0.035, sz * (HH + CW + FW / 2 - 0.005));
    frame.add(m);
  }
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(fShort, woodMat);
    m.position.set(sx * (HW + CW + FW / 2 - 0.005), FH / 2 - 0.035, 0);
    frame.add(m);
  }
  frame.children.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  scene.add(frame);

  // diamanti decorativi sulla cornice
  const diaMat = new THREE.MeshStandardMaterial({ color: '#f5f0dc', roughness: 0.3 });
  const diaGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.004, 12);
  for (const sz of [-1, 1]) for (let i = 1; i <= 7; i++) {
    if (i === 4) continue;
    const d = new THREE.Mesh(diaGeo, diaMat);
    d.position.set(-HW + (PLAY_W * i) / 8, FH - 0.033, sz * (HH + CW + FW / 2 - 0.005));
    scene.add(d);
  }
  for (const sx of [-1, 1]) for (let i = 1; i <= 3; i++) {
    const d = new THREE.Mesh(diaGeo, diaMat);
    d.position.set(sx * (HW + CW + FW / 2 - 0.005), FH - 0.033, -HH + (PLAY_H * i) / 4);
    scene.add(d);
  }

  // buche
  const holeMat = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: '#1c1c22', roughness: 0.4, metalness: 0.5 });
  for (const p of POCKETS) {
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 0.004, p.r + 0.004, 0.06, 24), holeMat);
    hole.position.set(p.x, 0.003, p.z);
    scene.add(hole);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r + 0.006, 0.008, 10, 28), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(p.x, 0.012, p.z);
    scene.add(rim);
  }

  // gambe + pavimento
  const legGeo = new THREE.BoxGeometry(0.12, 0.72, 0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, woodMat);
    leg.position.set(sx * (HW - 0.05), -0.4, sz * (HH - 0.02));
    leg.castShadow = true;
    scene.add(leg);
  }
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 40),
    new THREE.MeshStandardMaterial({ color: '#20140c', roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.76;
  floor.receiveShadow = true;
  scene.add(floor);

  // linea di battuta (kitchen)
  const lineMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18 });
  const kitchenLine = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.001, PLAY_H), lineMat);
  kitchenLine.position.set(-HW / 2, 0.0012, 0);
  scene.add(kitchenLine);
}

/* ---------------- PALLE ---------------- */
const balls = []; // {id, mesh, pos, vel, active, sinking, sinkT, pocket}

function buildBalls() {
  const geo = new THREE.SphereGeometry(R, 28, 20);
  for (let id = 0; id <= 15; id++) {
    const mat = new THREE.MeshStandardMaterial({
      map: ballTexture(id), roughness: 0.12, metalness: 0.0,
      envMapIntensity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    scene.add(mesh);
    balls.push({
      id, mesh,
      pos: new THREE.Vector3(0, R, 0),
      vel: new THREE.Vector3(),
      active: true, sinking: false, sinkT: 0, pocket: null,
    });
  }
}

const cueBall = () => balls[0];

function rackBalls() {
  // rack ufficiale: 8 al centro della terza fila, angoli di tipo diverso
  const rows = [[1], [9, 2], [3, 8, 10], [11, 7, 14, 4], [5, 13, 15, 6, 12]];
  const footX = HW / 2;
  const gap = 2 * R * 1.006;
  for (const b of balls) {
    b.active = true; b.sinking = false; b.sinkT = 0; b.pocket = null;
    b.vel.set(0, 0, 0);
    b.mesh.visible = true;
    b.mesh.scale.setScalar(1);
    b.mesh.quaternion.identity();
  }
  rows.forEach((row, r) => {
    row.forEach((id, k) => {
      const b = balls[id];
      b.pos.set(
        footX + r * gap * Math.sqrt(3) / 2 + (Math.random() - 0.5) * 0.0006,
        R,
        (k - r / 2) * gap + (Math.random() - 0.5) * 0.0006
      );
    });
  });
  cueBall().pos.set(-HW / 2 - 0.15, R, 0);
  balls.forEach(syncMesh);
}

function syncMesh(b) { b.mesh.position.copy(b.pos); }

/* ---------------- STECCA ---------------- */
let cueGroup, cueMesh;
function buildCue() {
  cueGroup = new THREE.Group();
  const len = 1.45;
  const geo = new THREE.CylinderGeometry(0.0065, 0.016, len, 14);
  geo.rotateZ(Math.PI / 2);          // lungo +X
  geo.translate(-len / 2, 0, 0);     // punta a x=0, estesa verso -X
  const mat = new THREE.MeshStandardMaterial({ color: CUE_COLORS[store.cue].hex, roughness: 0.35, metalness: 0.15 });
  cueMesh = new THREE.Mesh(geo, mat);
  cueMesh.castShadow = true;
  // punta bianca + ghiera
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 12),
    new THREE.MeshStandardMaterial({ color: '#dfe8f5', roughness: 0.6 }));
  tip.geometry.rotateZ(Math.PI / 2);
  tip.position.x = -0.005;
  cueMesh.add(tip);
  cueMesh.rotation.z = -0.075;       // leggera inclinazione, calcio più alto
  cueGroup.add(cueMesh);
  scene.add(cueGroup);
}
function setCueColor(i) {
  cueMesh.material.color.set(CUE_COLORS[i].hex);
}

/* ---------------- LINEE DI MIRA ---------------- */
let aimLine, targetLine, deflectLine, ghostRing, hintLine, hintRingBall, hintRingPocket, invalidRing;

function makeFlatLine(color, opacity, width = 0.008) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.0016, width),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
  );
  m.visible = false;
  scene.add(m);
  return m;
}
function layFlatLine(mesh, ax, az, bx, bz, y = 0.0035) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.scale.x = len;
  mesh.position.set((ax + bx) / 2, y, (az + bz) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
}

function buildAimHelpers() {
  aimLine = makeFlatLine('#ffffff', 0.85);
  targetLine = makeFlatLine('#ffe066', 0.9);
  deflectLine = makeFlatLine('#9ad0ff', 0.65, 0.006);
  hintLine = makeFlatLine('#fbbf24', 0.35, 0.006);

  const ringGeo = new THREE.RingGeometry(R * 0.75, R, 26);
  ghostRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ghostRing.rotation.x = -Math.PI / 2; ghostRing.visible = false;
  scene.add(ghostRing);

  hintRingBall = new THREE.Mesh(new THREE.RingGeometry(R * 1.15, R * 1.5, 26),
    new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  hintRingBall.rotation.x = -Math.PI / 2; hintRingBall.visible = false;
  scene.add(hintRingBall);

  hintRingPocket = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.066, 26),
    new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  hintRingPocket.rotation.x = -Math.PI / 2; hintRingPocket.visible = false;
  scene.add(hintRingPocket);

  invalidRing = new THREE.Mesh(new THREE.RingGeometry(R * 1.1, R * 1.45, 26),
    new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  invalidRing.rotation.x = -Math.PI / 2; invalidRing.visible = false;
  scene.add(invalidRing);
}

/* ---------------- STATO PARTITA ---------------- */
const HUMAN = 0, BOT = 1;
const G = {
  phase: 'menu',          // menu | aim | shooting | over
  turn: HUMAN,
  aimAngle: 0,
  power: 0,
  charging: false,
  ballInHand: false,
  kitchenOnly: false,
  breakShot: true,
  groups: [null, null],   // 'solid' | 'stripe'
  bot: BOTS[0],
  bet: 0,
  timer: TURN_TIME,
  timerOn: false,
  camMode: 'aim',         // aim | watch | top
  zoom: 1,
  shot: null,             // dati del tiro in corso
  botToken: 0,            // invalida azioni bot programmate
  over: false,
  draggingBall: false,
  hint: null,
  simTime: 0,
  strikeAnim: null,
  endPending: false,
};
const scheduled = [];
function schedule(delay, fn) { scheduled.push({ t: G.simTime + delay, fn, token: G.botToken }); }
function runScheduled() {
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const s = scheduled[i];
    if (s.token !== G.botToken) { scheduled.splice(i, 1); continue; }
    if (G.simTime >= s.t) { scheduled.splice(i, 1); s.fn(); }
  }
}

const aimDir = () => new THREE.Vector3(Math.cos(G.aimAngle), 0, Math.sin(G.aimAngle));

/* ---------------- FISICA ---------------- */
function activeBalls() { return balls.filter(b => b.active && !b.sinking); }

function anyMotion() {
  return balls.some(b => (b.active && b.vel.lengthSq() > 1e-6) || b.sinking);
}

function stepPhysics(dt) {
  const act = activeBalls();
  // integrazione + attrito
  for (const b of act) {
    const sp = b.vel.length();
    if (sp > 0) {
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      let ns = sp - FRICTION * dt - sp * DRAG * dt;
      if (ns < STOP_SPEED && sp < 0.35) ns = 0;
      b.vel.multiplyScalar(sp > 0 ? Math.max(ns, 0) / sp : 0);
    }
  }
  // collisioni palla-palla
  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i], b = act[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= 4 * R * R || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      // separazione
      const overlap = (2 * R - d) / 2 + 0.00005;
      a.pos.x -= nx * overlap; a.pos.z -= nz * overlap;
      b.pos.x += nx * overlap; b.pos.z += nz * overlap;
      // impulso (masse uguali)
      const rvx = b.vel.x - a.vel.x, rvz = b.vel.z - a.vel.z;
      const vn = rvx * nx + rvz * nz;
      if (vn >= 0) continue;
      const jimp = -(1 + BALL_REST) * vn / 2;
      a.vel.x -= jimp * nx; a.vel.z -= jimp * nz;
      b.vel.x += jimp * nx; b.vel.z += jimp * nz;
      const impactSpeed = -vn;
      if (impactSpeed > 0.12) Sound.click(Math.min(impactSpeed / 4, 1));
      if (G.shot) {
        if (G.shot.firstHit === null && (a.id === 0 || b.id === 0)) {
          G.shot.firstHit = a.id === 0 ? b.id : a.id;
        }
      }
    }
  }
  // buche + sponde
  for (const b of act) {
    // cattura in buca
    for (const p of POCKETS) {
      const dx = b.pos.x - p.x, dz = b.pos.z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) { capture(b, p); break; }
    }
    if (b.sinking) continue;
    // sponde con aperture per le buche
    const nearCornerX = HW - Math.abs(b.pos.x) < CORNER_GAP;
    const nearCornerZ = HH - Math.abs(b.pos.z) < CORNER_GAP;
    const inCornerMouth = nearCornerX && nearCornerZ;
    const inSideMouth = Math.abs(b.pos.x) < SIDE_GAP;
    if (!inCornerMouth) {
      if (b.pos.x < -HW + R && b.vel.x < 0) bounce(b, 'x', -HW + R);
      else if (b.pos.x > HW - R && b.vel.x > 0) bounce(b, 'x', HW - R);
    }
    if (!inCornerMouth && !inSideMouth) {
      if (b.pos.z < -HH + R && b.vel.z < 0) bounce(b, 'z', -HH + R);
      else if (b.pos.z > HH - R && b.vel.z > 0) bounce(b, 'z', HH - R);
    }
    // sicurezza: mai oltre il bordo esterno
    if (Math.abs(b.pos.x) > HW + 0.12 || Math.abs(b.pos.z) > HH + 0.12) {
      let best = POCKETS[0], bd = 1e9;
      for (const p of POCKETS) {
        const d = (b.pos.x - p.x) ** 2 + (b.pos.z - p.z) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      capture(b, best);
    }
  }
}

function bounce(b, axis, limit) {
  if (axis === 'x') { b.pos.x = limit; b.vel.x *= -CUSHION_REST; b.vel.z *= 0.92; }
  else { b.pos.z = limit; b.vel.z *= -CUSHION_REST; b.vel.x *= 0.92; }
  const sp = b.vel.length();
  if (sp > 0.15) Sound.cushion(Math.min(sp / 4, 1));
  if (G.shot && G.shot.firstHit !== null) G.shot.rail = true;
}

function capture(b, p) {
  if (b.sinking) return;
  b.sinking = true; b.sinkT = 0; b.pocket = p;
  b.vel.multiplyScalar(0.3);
  Sound.pocket();
  if (G.shot) {
    if (b.id === 0) G.shot.cuePocket = true;
    else G.shot.pocketed.push(b.id);
  }
}

function updateSinking(dt) {
  for (const b of balls) {
    if (!b.sinking) continue;
    b.sinkT += dt;
    const p = b.pocket;
    b.pos.x += (p.x - b.pos.x) * Math.min(1, dt * 14);
    b.pos.z += (p.z - b.pos.z) * Math.min(1, dt * 14);
    b.pos.y -= dt * 0.45;
    b.mesh.scale.setScalar(Math.max(0.4, 1 - b.sinkT * 1.6));
    if (b.sinkT > 0.32) {
      b.sinking = false; b.active = false; b.mesh.visible = false;
      b.pos.y = R;
    }
  }
}

function updateBallSpin(dt) {
  const q = new THREE.Quaternion(), axis = new THREE.Vector3();
  for (const b of balls) {
    if (!b.active || b.sinking) continue;
    const sp = b.vel.length();
    if (sp < 0.001) continue;
    axis.set(b.vel.z, 0, -b.vel.x).normalize();
    q.setFromAxisAngle(axis, (sp * dt) / R);
    b.mesh.quaternion.premultiply(q);
  }
}

/* ---------------- PREVISIONE DI MIRA ---------------- */
function firstBallOnRay(px, pz, dx, dz, ignoreId) {
  let bestT = Infinity, bestBall = null;
  for (const b of activeBalls()) {
    if (b.id === ignoreId) continue;
    const cx = b.pos.x - px, cz = b.pos.z - pz;
    const proj = cx * dx + cz * dz;
    if (proj <= 0) continue;
    const perp2 = cx * cx + cz * cz - proj * proj;
    const rr = 4 * R * R;
    if (perp2 >= rr) continue;
    const t = proj - Math.sqrt(rr - perp2);
    if (t > 0.0005 && t < bestT) { bestT = t; bestBall = b; }
  }
  return bestBall ? { t: bestT, ball: bestBall } : null;
}

function cushionHit(px, pz, dx, dz) {
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (HW - R - px) / dx);
  if (dx < 0) t = Math.min(t, (-HW + R - px) / dx);
  if (dz > 0) t = Math.min(t, (HH - R - pz) / dz);
  if (dz < 0) t = Math.min(t, (-HH + R - pz) / dz);
  return Math.max(t, 0);
}

function updateAimHelpers() {
  const aiming = G.phase === 'aim' && !G.over && !anyMotion();
  aimLine.visible = targetLine.visible = deflectLine.visible = ghostRing.visible = false;
  updateCueVisual(aiming); // la stecca si vede anche quando mira il bot
  if (!aiming || G.turn !== HUMAN || G.draggingBall) return;

  const cue = cueBall();
  const d = aimDir();
  const hit = firstBallOnRay(cue.pos.x, cue.pos.z, d.x, d.z, 0);
  if (hit) {
    const gx = cue.pos.x + d.x * hit.t, gz = cue.pos.z + d.z * hit.t;
    layFlatLine(aimLine, cue.pos.x, cue.pos.z, gx, gz);
    ghostRing.visible = true;
    ghostRing.position.set(gx, 0.0035, gz);
    // direzione palla colpita
    let nx = hit.ball.pos.x - gx, nz = hit.ball.pos.z - gz;
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const dot = d.x * nx + d.z * nz;
    const powerFactor = 0.25 + G.power * 0.75;
    const tl = (0.12 + 0.55 * Math.max(dot, 0.05)) * powerFactor;
    layFlatLine(targetLine, hit.ball.pos.x, hit.ball.pos.z,
      hit.ball.pos.x + nx * tl, hit.ball.pos.z + nz * tl);
    // deviazione della bianca (tangente)
    let tx = d.x - dot * nx, tz = d.z - dot * nz;
    const tll = Math.hypot(tx, tz);
    if (tll > 0.05) {
      tx /= tll; tz /= tll;
      const dl = (0.06 + 0.3 * tll) * powerFactor;
      layFlatLine(deflectLine, gx, gz, gx + tx * dl, gz + tz * dl);
    }
  } else {
    const t = Math.min(cushionHit(cue.pos.x, cue.pos.z, d.x, d.z), 3);
    layFlatLine(aimLine, cue.pos.x, cue.pos.z, cue.pos.x + d.x * t, cue.pos.z + d.z * t);
  }
}

function updateCueVisual(show) {
  const visible = show && !G.draggingBall;
  cueGroup.visible = visible;
  if (!visible) return;
  const cue = cueBall();
  cueGroup.position.copy(cue.pos);
  cueGroup.rotation.y = -G.aimAngle;
  const pull = G.strikeAnim != null ? Math.max(0.002, G.strikeAnim) : 0.03 + G.power * 0.26;
  cueMesh.position.x = -(R + pull);
  cueMesh.position.y = 0.012;
}

/* ---------------- CAMERA ---------------- */
const camLook = new THREE.Vector3(0, 0, 0);
function updateCamera(dt) {
  const cue = cueBall();
  const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
  const fitD = Math.max(
    (HH + 0.35) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
    (HW + 0.35) / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
  );
  if (G.camMode === 'top') {
    tPos.set(0, fitD, fitD * 0.06);
    tLook.set(0, 0, 0);
  } else if (G.phase === 'shooting' || (G.turn === BOT && !G.over)) {
    tPos.set(0, fitD * 0.82, fitD * 0.5);
    tLook.set(0, 0, 0);
  } else {
    const d = aimDir();
    const dist = 0.95 * G.zoom, h = 0.5 * G.zoom;
    tPos.set(cue.pos.x - d.x * dist, h, cue.pos.z - d.z * dist);
    tLook.set(cue.pos.x + d.x * 0.4, 0.02, cue.pos.z + d.z * 0.4);
  }
  const k = 1 - Math.exp(-6.5 * dt);
  camera.position.lerp(tPos, k);
  camLook.lerp(tLook, k);
  camera.lookAt(camLook);
}

/* ---------------- REGOLE 8-BALL ---------------- */
function groupOf(id) { return id >= 1 && id <= 7 ? 'solid' : id >= 9 && id <= 15 ? 'stripe' : 'eight'; }
function remaining(group) { return activeBalls().filter(b => groupOf(b.id) === group && b.id !== 8).length; }
function playerCleared(p) { return G.groups[p] && remaining(G.groups[p]) === 0; }

function legalTargetBalls(p) {
  const g = G.groups[p];
  const act = activeBalls().filter(b => b.id !== 0);
  if (!g) return act.filter(b => b.id !== 8); // tavolo aperto
  if (playerCleared(p)) return act.filter(b => b.id === 8);
  return act.filter(b => groupOf(b.id) === g);
}

function beginShot() {
  G.shot = { firstHit: null, rail: false, pocketed: [], cuePocket: false, shooter: G.turn, wasBreak: G.breakShot };
  G.phase = 'shooting';
  G.timerOn = false;
  G.ballInHand = false;
  G.kitchenOnly = false;
  G.endPending = false;
  document.getElementById('ballInHandMsg').style.display = 'none';
  hideHint();
  updateHUD();
}

function endShot() {
  const s = G.shot; G.shot = null;
  const shooter = s.shooter, opp = 1 - shooter;
  let foul = null;

  // conta le palle del gruppo del tiratore rimaste PRIMA del tiro
  const ownPocketedNow = s.pocketed.filter(id => id !== 8 && G.groups[shooter] && groupOf(id) === G.groups[shooter]).length;
  const ownRemainingBefore = G.groups[shooter] ? remaining(G.groups[shooter]) + ownPocketedNow : 99;
  const shooterWasOnEight = G.groups[shooter] != null && ownRemainingBefore === 0;

  // --- falli ---
  if (s.cuePocket) foul = 'La bianca è finita in buca!';
  else if (s.firstHit === null) foul = 'Nessuna palla colpita: fallo!';
  else if (!s.wasBreak) {
    const g = G.groups[shooter];
    if (g) {
      if (shooterWasOnEight) {
        if (s.firstHit !== 8) foul = 'Dovevi colpire prima la palla 8!';
      } else if (groupOf(s.firstHit) !== g) {
        foul = s.firstHit === 8 ? 'Hai colpito prima la 8: fallo!' : 'Hai colpito prima una palla avversaria!';
      }
    } else if (s.firstHit === 8) {
      foul = 'Tavolo aperto: non puoi colpire prima la 8!';
    }
  }
  if (!foul && s.pocketed.length === 0 && !s.cuePocket && !s.rail && !s.wasBreak) {
    foul = 'Nessuna sponda dopo il contatto: fallo!';
  }

  // --- palla 8 in buca ---
  if (s.pocketed.includes(8)) {
    if (s.wasBreak) {
      if (s.cuePocket) { gameOver(opp, 'La 8 in buca al break con la bianca in buca'); }
      else gameOver(shooter, '🎱 La 8 in buca al break: colpo leggendario!');
      return;
    }
    if (!shooterWasOnEight) { gameOver(opp, 'La 8 è finita in buca troppo presto'); return; }
    if (foul) { gameOver(opp, 'La 8 in buca ma con fallo: partita persa'); return; }
    gameOver(shooter, 'Palla 8 imbucata: partita vinta!');
    return;
  }

  // --- assegnazione gruppi (tavolo aperto) ---
  const nonEight = s.pocketed.filter(id => id !== 8);
  if (!G.groups[shooter] && !s.wasBreak && !foul && nonEight.length > 0) {
    const g = groupOf(nonEight[0]);
    G.groups[shooter] = g;
    G.groups[opp] = g === 'solid' ? 'stripe' : 'solid';
    const mine = G.groups[HUMAN] === 'solid' ? 'PIENE (1-7)' : 'SPEZZATE (9-15)';
    toast(`🎯 Hai le ${mine}`, 2600);
    Sound.turn();
  }

  G.breakShot = false;

  // --- rimetti la bianca se in buca ---
  if (s.cuePocket) respawnCue();

  // --- prosegue il turno? ---
  let keepTurn = false;
  if (!foul && nonEight.length > 0) {
    if (s.wasBreak) keepTurn = true;
    else if (!G.groups[shooter]) keepTurn = true;
    else if (nonEight.some(id => groupOf(id) === G.groups[shooter])) keepTurn = true;
  }

  if (foul) {
    toast('⚠️ ' + foul + '\nPalla in mano per l\'avversario', 2800);
    Sound.foul();
    startTurn(opp, true);
  } else if (keepTurn) {
    if (nonEight.length > 0) toast(shooter === HUMAN ? '👍 Bel colpo! Tira ancora' : `${G.bot.name} continua...`, 1600);
    startTurn(shooter, false);
  } else {
    startTurn(opp, false);
  }
}

function respawnCue() {
  const cue = cueBall();
  cue.active = true; cue.sinking = false; cue.mesh.visible = true;
  cue.mesh.scale.setScalar(1);
  cue.vel.set(0, 0, 0);
  // posizione libera vicino alla battuta
  let placed = false;
  for (let i = 0; i < 200 && !placed; i++) {
    const x = -HW / 2 - 0.1 + (Math.random() - 0.5) * 0.7;
    const z = (Math.random() - 0.5) * (PLAY_H - 4 * R);
    if (isFreeSpot(x, z, 0)) { cue.pos.set(x, R, z); placed = true; }
  }
  if (!placed) cue.pos.set(0, R, 0);
  syncMesh(cue);
}

function isFreeSpot(x, z, ignoreId) {
  if (Math.abs(x) > HW - R || Math.abs(z) > HH - R) return false;
  for (const b of activeBalls()) {
    if (b.id === ignoreId) continue;
    if ((b.pos.x - x) ** 2 + (b.pos.z - z) ** 2 < (2.05 * R) ** 2) return false;
  }
  return true;
}

/* ---------------- FLUSSO DI GIOCO ---------------- */
function newGame() {
  G.botToken++;
  scheduled.length = 0;
  G.over = false;
  G.groups = [null, null];
  G.breakShot = true;
  G.power = 0; G.charging = false;
  G.shot = null;
  G.camMode = 'aim';
  G.zoom = 1;
  rackBalls();
  hideHint();
  document.getElementById('endOverlay').style.display = 'none';
  document.getElementById('quitOverlay').style.display = 'none';

  // paga la puntata
  store.coins = store.coins - G.bet;
  updateHUD();

  // chi spacca? casuale
  const breaker = Math.random() < 0.5 ? HUMAN : BOT;
  toast(breaker === HUMAN ? '🎱 Spacchi tu! Puoi spostare la bianca dietro la linea' : `🎱 Spacca ${G.bot.name}`, 2400);
  startTurn(breaker, false, true);
}

function startTurn(p, ballInHand, isBreak = false) {
  if (G.over) return;
  G.turn = p;
  G.phase = 'aim';
  G.power = 0;
  setPowerUI(0);
  G.ballInHand = ballInHand || isBreak;
  G.kitchenOnly = isBreak;
  G.timer = TURN_TIME;
  G.timerOn = p === HUMAN;
  G.camMode = G.camMode === 'top' ? 'top' : 'aim';

  // mira iniziale sensata: verso la palla legale più vicina
  const targets = legalTargetBalls(p);
  const cue = cueBall();
  if (targets.length) {
    let best = targets[0], bd = 1e9;
    for (const t of targets) {
      const d = (t.pos.x - cue.pos.x) ** 2 + (t.pos.z - cue.pos.z) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    G.aimAngle = Math.atan2(best.pos.z - cue.pos.z, best.pos.x - cue.pos.x);
  }

  document.getElementById('ballInHandMsg').style.display =
    (p === HUMAN && G.ballInHand) ? 'block' : 'none';

  updateHUD();
  if (p === HUMAN) {
    Sound.turn();
    if (store.hints) showHint();
  } else {
    hideHint();
    botPlay();
  }
}

function shoot(power) {
  if (G.phase !== 'aim' || G.over) return;
  const cue = cueBall();
  const d = aimDir();
  const p = Math.max(0.05, Math.min(1, power));
  G.strikeAnim = 0.03 + p * 0.26; // la stecca scatta in avanti dalla posizione caricata
  beginShot();
  schedule(0.06, () => {
    Sound.cueHit(p);
    cue.vel.set(d.x, 0, d.z).multiplyScalar(0.5 + p * (MAX_SHOT_SPEED - 0.5));
    G.strikeAnim = null;
  });
  G.power = 0;
  setPowerUI(0);
}

function gameOver(winner, reason) {
  G.over = true;
  G.phase = 'over';
  G.timerOn = false;
  G.botToken++;
  scheduled.length = 0;
  hideHint();
  const win = winner === HUMAN;
  const pot = G.bet * 2;
  if (win) store.coins = store.coins + pot;
  const ov = document.getElementById('endOverlay');
  document.getElementById('endEmoji').textContent = win ? '🏆' : '😞';
  const t = document.getElementById('endTitle');
  t.textContent = win ? 'VITTORIA!' : 'SCONFITTA';
  t.className = win ? 'win' : 'lose';
  document.getElementById('endCoins').textContent = win ? `+${pot} 🪙` : `-${G.bet} 🪙`;
  document.getElementById('endReason').textContent = reason;
  ov.style.display = 'flex';
  if (win) { Sound.win(); confetti(); } else Sound.lose();
  updateHUD();
}

function confetti() {
  const host = document.getElementById('game');
  const emo = ['🎉', '🎊', '⭐', '🪙', '🎱'];
  for (let i = 0; i < 34; i++) {
    const s = document.createElement('span');
    s.className = 'confetti';
    s.textContent = emo[i % emo.length];
    s.style.cssText = `position:absolute;top:-40px;left:${Math.random() * 100}%;font-size:${16 + Math.random() * 18}px;z-index:22;pointer-events:none;transition:transform ${2 + Math.random() * 2}s linear,opacity 3s;`;
    host.appendChild(s);
    requestAnimationFrame(() => {
      s.style.transform = `translateY(${window.innerHeight + 80}px) rotate(${Math.random() * 720 - 360}deg)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 4200);
  }
}

/* ---------------- BOT ---------------- */
function gauss() { // rumore gaussiano ~N(0,1)
  let s = 0; for (let i = 0; i < 6; i++) s += Math.random();
  return (s - 3) / Math.sqrt(0.5);
}

function pathBlocked(ax, az, bx, bz, ignore) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const ux = dx / len, uz = dz / len;
  for (const b of activeBalls()) {
    if (ignore.includes(b.id)) continue;
    const cx = b.pos.x - ax, cz = b.pos.z - az;
    const proj = cx * ux + cz * uz;
    if (proj < -R || proj > len + R) continue;
    const perp2 = cx * cx + cz * cz - proj * proj;
    if (perp2 < (1.92 * R) ** 2) return true;
  }
  return false;
}

function evaluateShots(player) {
  const cue = cueBall();
  const targets = legalTargetBalls(player);
  const shots = [];
  for (const tb of targets) {
    for (const p of POCKETS) {
      let px = p.x, pz = p.z;
      // mira leggermente dentro la buca
      const toPx = px - tb.pos.x, toPz = pz - tb.pos.z;
      const pd = Math.hypot(toPx, toPz);
      if (pd < 0.05) continue;
      const tux = toPx / pd, tuz = toPz / pd;
      // palla fantasma: dove deve arrivare la bianca
      const gx = tb.pos.x - tux * 2 * R, gz = tb.pos.z - tuz * 2 * R;
      if (Math.abs(gx) > HW + 0.02 || Math.abs(gz) > HH + 0.02) continue;
      const cdx = gx - cue.pos.x, cdz = gz - cue.pos.z;
      const cd = Math.hypot(cdx, cdz);
      if (cd < R) continue;
      const cux = cdx / cd, cuz = cdz / cd;
      // angolo di taglio: la bianca deve spingere la palla verso la buca
      const cut = cux * tux + cuz * tuz;
      if (cut < 0.18) continue; // taglio impossibile (>~80°)
      // percorsi liberi?
      if (pathBlocked(cue.pos.x, cue.pos.z, gx, gz, [0, tb.id])) continue;
      if (pathBlocked(tb.pos.x, tb.pos.z, px - tux * p.r * 0.5, pz - tuz * p.r * 0.5, [0, tb.id])) continue;
      const angle = Math.atan2(cdz, cdx);
      const score = Math.pow(cut, 2.2) * (p.corner ? 1 : 0.82) / ((0.35 + cd) * (0.3 + pd));
      // potenza necessaria
      const need = Math.min(1, (cd * 0.55 + (pd / Math.max(cut, 0.3)) * 0.5 + 0.35) / MAX_SHOT_SPEED * 2.4);
      shots.push({ ball: tb, pocket: p, angle, power: need, score, cut, gx, gz });
    }
  }
  shots.sort((a, b) => b.score - a.score);
  return shots;
}

function botPlace() {
  // palla in mano del bot: cerca una posizione con un tiro facile
  const cue = cueBall();
  const targets = legalTargetBalls(BOT);
  let bestPos = null, bestScore = -1;
  for (const tb of targets) {
    for (const p of POCKETS) {
      const tux0 = p.x - tb.pos.x, tuz0 = p.z - tb.pos.z;
      const pd = Math.hypot(tux0, tuz0);
      if (pd < 0.05) continue;
      const tux = tux0 / pd, tuz = tuz0 / pd;
      // dritto dietro la palla fantasma
      for (const back of [0.3, 0.45, 0.2]) {
        const x = tb.pos.x - tux * (2 * R + back);
        const z = tb.pos.z - tuz * (2 * R + back);
        if (!isFreeSpot(x, z, 0)) continue;
        if (pathBlocked(tb.pos.x, tb.pos.z, p.x, p.z, [0, tb.id])) continue;
        const score = 1 / (0.3 + pd) + (p.corner ? 0.2 : 0);
        if (score > bestScore) { bestScore = score; bestPos = { x, z }; }
      }
    }
  }
  // bot scarsi piazzano male
  if (G.bot.blunder > 0.3 || !bestPos) {
    for (let i = 0; i < 100; i++) {
      const x = (Math.random() - 0.5) * (PLAY_W - 4 * R);
      const z = (Math.random() - 0.5) * (PLAY_H - 4 * R);
      if (isFreeSpot(x, z, 0)) { bestPos = bestPos || { x, z }; break; }
    }
  }
  if (bestPos) { cue.pos.set(bestPos.x, R, bestPos.z); syncMesh(cue); }
}

function botPlay() {
  const token = G.botToken;
  schedule(G.bot.think * (0.7 + Math.random() * 0.6), () => {
    if (G.over || G.turn !== BOT || G.phase !== 'aim') return;
    if (G.ballInHand && !G.breakShot) botPlace();

    let targetAngle, power;
    if (G.breakShot) {
      const cue = cueBall();
      targetAngle = Math.atan2(-cue.pos.z, HW / 2 - cue.pos.x) + (Math.random() - 0.5) * 0.02;
      power = 1;
    } else {
      const shots = evaluateShots(BOT);
      let pick = shots[0];
      // i bot deboli a volte scelgono un tiro peggiore o sbagliano proprio
      if (shots.length > 1 && Math.random() < G.bot.blunder) {
        pick = shots[Math.min(shots.length - 1, 1 + Math.floor(Math.random() * 3))];
      }
      if (!pick) {
        // nessun tiro: colpo di salvezza sulla palla legale più vicina
        const targets = legalTargetBalls(BOT);
        const cue = cueBall();
        let best = null, bd = 1e9;
        for (const t of targets) {
          const d = (t.pos.x - cue.pos.x) ** 2 + (t.pos.z - cue.pos.z) ** 2;
          if (d < bd) { bd = d; best = t; }
        }
        targetAngle = best ? Math.atan2(best.pos.z - cue.pos.z, best.pos.x - cue.pos.x) : Math.random() * Math.PI * 2;
        power = 0.3 + Math.random() * 0.2;
      } else {
        targetAngle = pick.angle;
        power = pick.power;
      }
      // errore di mira e potenza secondo la difficoltà
      targetAngle += gauss() * G.bot.aimErr;
      power = Math.max(0.08, Math.min(1, power * (1 + gauss() * G.bot.powErr)));
    }

    // animazione: ruota la mira verso il bersaglio, poi tira
    const startAngle = G.aimAngle;
    let delta = targetAngle - startAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const dur = 0.8;
    const t0 = G.simTime;
    const animate = () => {
      if (G.botToken !== token || G.over || G.phase !== 'aim') return;
      const k = Math.min(1, (G.simTime - t0) / dur);
      G.aimAngle = startAngle + delta * (1 - Math.cos(k * Math.PI)) / 2;
      if (k < 1) schedule(0, animate);
      else {
        // carica e tira
        let pk = 0;
        const charge = () => {
          if (G.botToken !== token || G.over || G.phase !== 'aim') return;
          pk = Math.min(power, pk + 0.045);
          G.power = pk; setPowerUI(pk);
          if (pk < power) schedule(0.016, charge);
          else schedule(0.15, () => {
            if (G.botToken !== token || G.over || G.phase !== 'aim') return;
            shoot(power);
          });
        };
        schedule(0.25, charge);
      }
    };
    animate();
  });
}

/* ---------------- CONSIGLI DI MIRA ---------------- */
function showHint() {
  if (!store.hints || G.turn !== HUMAN || G.over) { hideHint(); return; }
  const shots = evaluateShots(HUMAN);
  const best = shots[0];
  const el = document.getElementById('hintText');
  if (!best) {
    G.hint = null;
    hintLine.visible = hintRingBall.visible = hintRingPocket.visible = false;
    el.textContent = legalTargetBalls(HUMAN).length ? '💡 Nessun tiro diretto: prova un colpo di sponda o gioca di difesa' : '';
    return;
  }
  G.hint = best;
  layFlatLine(hintLine, best.ball.pos.x, best.ball.pos.z, best.pocket.x, best.pocket.z, 0.003);
  hintRingBall.visible = true;
  hintRingBall.position.set(best.ball.pos.x, 0.003, best.ball.pos.z);
  hintRingPocket.visible = true;
  hintRingPocket.position.set(best.pocket.x, 0.004, best.pocket.z);
  const powTxt = best.power < 0.35 ? 'piano' : best.power < 0.65 ? 'media' : 'forte';
  el.textContent = `💡 Consiglio: palla ${best.ball.id} nella buca evidenziata • potenza ${powTxt}`;
}
function hideHint() {
  hintLine.visible = hintRingBall.visible = hintRingPocket.visible = false;
  document.getElementById('hintText').textContent = '';
}

/* ---------------- INPUT: MIRA E PALLA IN MANO ---------------- */
const pointers = new Map();
let pinchDist = 0;

function pointerPos(e) {
  return { x: e.clientX, y: e.clientY };
}

function screenToTable(x, y) {
  const rect = canvas.getBoundingClientRect();
  const nx = ((x - rect.left) / rect.width) * 2 - 1;
  const ny = -((y - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  const out = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, out) ? out : null;
}

canvas.addEventListener('pointerdown', (e) => {
  Sound.unlock();
  if (G.over || G.phase !== 'aim' || G.turn !== HUMAN) return;
  canvas.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  pointers.set(e.pointerId, { ...p, startAngle: G.aimAngle });

  if (pointers.size === 2) {
    const pts = [...pointers.values()];
    pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    return;
  }
  // palla in mano: tocco vicino alla bianca?
  if (G.ballInHand) {
    const hit = screenToTable(p.x, p.y);
    const cue = cueBall();
    if (hit && Math.hypot(hit.x - cue.pos.x, hit.z - cue.pos.z) < 0.14) {
      G.draggingBall = true;
      invalidRing.visible = false;
    }
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const p = pointerPos(e);

  if (pointers.size === 2) { // pinch zoom
    pointers.set(e.pointerId, { ...prev, ...p });
    const pts = [...pointers.values()];
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist > 0) {
      G.zoom = Math.max(0.6, Math.min(1.8, G.zoom * (pinchDist / d)));
    }
    pinchDist = d;
    return;
  }

  if (G.draggingBall) {
    const hit = screenToTable(p.x, p.y);
    if (hit) {
      const cue = cueBall();
      let x = THREE.MathUtils.clamp(hit.x, -HW + R, HW - R);
      let z = THREE.MathUtils.clamp(hit.z, -HH + R, HH - R);
      if (G.kitchenOnly) x = Math.min(x, -HW / 2 - R);
      cue.pos.set(x, R, z);
      syncMesh(cue);
      const ok = isFreeSpot(x, z, 0);
      invalidRing.visible = !ok;
      invalidRing.position.set(x, 0.004, z);
    }
  } else {
    const dx = p.x - prev.x;
    G.aimAngle += dx * 0.0042 / Math.max(G.zoom * 0.8, 0.6);
  }
  pointers.set(e.pointerId, { ...prev, ...p });
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (G.draggingBall && pointers.size === 0) {
    G.draggingBall = false;
    const cue = cueBall();
    if (!isFreeSpot(cue.pos.x, cue.pos.z, 0)) {
      // trova il punto libero più vicino
      for (let r = 0.03; r < 1.5; r += 0.03) {
        let done = false;
        for (let a = 0; a < Math.PI * 2; a += 0.4) {
          const x = cue.pos.x + Math.cos(a) * r, z = cue.pos.z + Math.sin(a) * r;
          const xc = G.kitchenOnly ? Math.min(x, -HW / 2 - R) : x;
          if (isFreeSpot(xc, z, 0)) { cue.pos.set(xc, R, z); done = true; break; }
        }
        if (done) break;
      }
      syncMesh(cue);
    }
    invalidRing.visible = false;
    if (store.hints) showHint();
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

/* ---------------- SLIDER POTENZA ---------------- */
const powerTrack = document.getElementById('powerTrack');
const powerFill = document.getElementById('powerFill');
const powerKnob = document.getElementById('powerKnob');
const powerValue = document.getElementById('powerValue');
let powerPointer = null;

function setPowerUI(p) {
  powerFill.style.height = (p * 100) + '%';
  powerKnob.style.top = `calc(${(1 - p) * 100}% - ${(1 - p) * 40}px - 2px)`;
  const lbl = p === 0 ? '' : p < 0.3 ? 'Piano' : p < 0.55 ? 'Media' : p < 0.8 ? 'Forte' : 'FORTISSIMA!';
  powerValue.textContent = p === 0 ? '' : `${Math.round(p * 100)}% ${lbl}`;
}

function powerFromEvent(e) {
  const rect = powerTrack.getBoundingClientRect();
  return THREE.MathUtils.clamp((e.clientY - rect.top) / rect.height, 0, 1);
}

powerTrack.addEventListener('pointerdown', (e) => {
  Sound.unlock();
  if (G.over || G.phase !== 'aim' || G.turn !== HUMAN) return;
  powerPointer = e.pointerId;
  powerTrack.setPointerCapture(e.pointerId);
  G.charging = true;
  G.power = powerFromEvent(e);
  setPowerUI(G.power);
  e.stopPropagation();
});
powerTrack.addEventListener('pointermove', (e) => {
  if (powerPointer !== e.pointerId || !G.charging) return;
  G.power = powerFromEvent(e);
  setPowerUI(G.power);
});
function powerEnd(e) {
  if (powerPointer !== e.pointerId) return;
  powerPointer = null;
  if (!G.charging) return;
  G.charging = false;
  const p = G.power;
  G.power = 0;
  if (p > 0.04 && G.phase === 'aim' && G.turn === HUMAN && !G.over) {
    shoot(p);
  } else {
    setPowerUI(0);
  }
}
powerTrack.addEventListener('pointerup', powerEnd);
powerTrack.addEventListener('pointercancel', powerEnd);

/* ---------------- HUD ---------------- */
function miniBallHTML(id, done) {
  const striped = id >= 9;
  return `<div class="mini-ball ${striped ? 'striped' : ''} ${done ? 'done' : ''}" style="background:${BALL_COLORS[id]}"></div>`;
}

function updateHUD() {
  document.getElementById('menuCoins').textContent = store.coins.toLocaleString('it-IT');
  if (G.phase === 'menu') return;
  document.getElementById('betAmount').textContent = (G.bet * 2).toLocaleString('it-IT');
  document.getElementById('nameP2').textContent = `${G.bot.name} · ${G.bot.level}`;
  document.getElementById('avatarP2').textContent = G.bot.emoji;
  document.getElementById('avatarP2').style.background = `linear-gradient(145deg, ${G.bot.color}55, #0f172a)`;

  document.getElementById('cardP1').classList.toggle('active', G.turn === HUMAN && !G.over);
  document.getElementById('cardP2').classList.toggle('active', G.turn === BOT && !G.over);
  document.getElementById('turnLabel').textContent =
    G.over ? 'Partita finita' : G.turn === HUMAN ? (G.phase === 'shooting' ? '...' : 'TOCCA A TE') : `Turno di ${G.bot.name}`;

  // palline rimanenti
  for (const p of [HUMAN, BOT]) {
    const el = document.getElementById(p === HUMAN ? 'ballsP1' : 'ballsP2');
    const g = G.groups[p];
    if (!g) { el.innerHTML = '<span style="font-size:10px;opacity:.6">tavolo aperto</span>'; continue; }
    const ids = g === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
    let html = ids.map(id => miniBallHTML(id, !balls[id].active)).join('');
    if (playerCleared(p)) html += miniBallHTML(8, !balls[8].active);
    el.innerHTML = html;
  }
}

function updateTimerUI() {
  const ring1 = document.getElementById('ringP1');
  const ring2 = document.getElementById('ringP2');
  const txt = document.getElementById('timerText');
  const C = 169.6;
  if (G.timerOn && G.turn === HUMAN && !G.over) {
    const f = Math.max(0, G.timer / TURN_TIME);
    ring1.style.strokeDashoffset = C * (1 - f);
    ring1.style.stroke = f < 0.25 ? '#f87171' : '#4ade80';
    ring2.style.strokeDashoffset = C;
    txt.textContent = `⏱ ${Math.ceil(G.timer)}s`;
    txt.classList.toggle('low', G.timer < 10);
  } else {
    ring1.style.strokeDashoffset = C;
    ring2.style.strokeDashoffset = G.turn === BOT && !G.over ? 0 : C;
    ring2.style.stroke = '#38bdf8';
    txt.textContent = '';
    txt.classList.remove('low');
  }
}

let toastTimer = null;
function toast(msg, dur = 2000) {
  const el = document.getElementById('toast');
  el.innerHTML = msg.replace(/\n/g, '<br>');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

/* ---------------- MENU ---------------- */
let selBot = store.bot, selCue = store.cue;

function buildMenu() {
  const list = document.getElementById('botList');
  list.innerHTML = '';
  BOTS.forEach((b, i) => {
    const card = document.createElement('div');
    card.className = 'bot-card' + (i === selBot ? ' selected' : '');
    card.innerHTML = `
      <div class="bavatar" style="background:linear-gradient(145deg, ${b.color}66, #0f172a)">${b.emoji}</div>
      <div>
        <div class="bname">${b.name} <span class="blevel" style="color:${b.color}">· ${b.level}</span></div>
        <div class="bdesc">${b.desc}</div>
      </div>
      <div class="bbet">🪙 ${b.bet}<small>vinci ${b.bet * 2}</small></div>`;
    card.addEventListener('click', () => {
      selBot = i; store.bot = i;
      list.querySelectorAll('.bot-card').forEach((c, j) => c.classList.toggle('selected', j === i));
      updatePlayBtn();
    });
    list.appendChild(card);
  });

  const cues = document.getElementById('cueColors');
  cues.innerHTML = '';
  CUE_COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'cue-swatch' + (i === selCue ? ' selected' : '');
    sw.style.background = c.hex;
    sw.title = c.name;
    sw.addEventListener('click', () => {
      selCue = i; store.cue = i;
      setCueColor(i);
      cues.querySelectorAll('.cue-swatch').forEach((s, j) => s.classList.toggle('selected', j === i));
    });
    cues.appendChild(sw);
  });

  document.getElementById('hintToggle').checked = store.hints;
  document.getElementById('soundToggle').checked = store.sound;
  document.getElementById('hintToggle').addEventListener('change', (e) => { store.hints = e.target.checked; });
  document.getElementById('soundToggle').addEventListener('change', (e) => {
    store.sound = e.target.checked;
    document.getElementById('soundBtn').textContent = store.sound ? '🔊' : '🔇';
  });

  updatePlayBtn();
}

function updatePlayBtn() {
  const b = BOTS[selBot];
  const btn = document.getElementById('playBtn');
  const can = store.coins >= b.bet;
  document.getElementById('playBet').textContent = `· 🪙 ${b.bet}`;
  btn.disabled = !can;
  btn.style.opacity = can ? '1' : '0.45';
  const refill = document.getElementById('refillBtn');
  refill.style.display = store.coins < b.bet ? 'inline-block' : 'none';
}

document.getElementById('refillBtn').addEventListener('click', () => {
  store.coins = store.coins + 500;
  updateHUD(); updatePlayBtn();
  toastMenu('+500 🪙 ricarica gratuita!');
});
function toastMenu(msg) { /* piccolo feedback nel menu */
  const w = document.querySelector('.wallet');
  w.style.boxShadow = '0 0 18px #fbbf24';
  setTimeout(() => w.style.boxShadow = '', 600);
}

document.getElementById('playBtn').addEventListener('click', () => {
  Sound.unlock();
  const b = BOTS[selBot];
  if (store.coins < b.bet) return;
  G.bot = b; G.bet = b.bet;
  document.getElementById('menu').style.display = 'none';
  document.getElementById('game').style.display = 'block';
  G.phase = 'aim';
  newGame();
});

/* ---------------- PULSANTI DI GIOCO ---------------- */
document.getElementById('viewBtn').addEventListener('click', () => {
  G.camMode = G.camMode === 'top' ? 'aim' : 'top';
  document.getElementById('viewBtn').textContent = G.camMode === 'top' ? '🎯' : '🔝';
});
document.getElementById('soundBtn').addEventListener('click', () => {
  store.sound = !store.sound;
  document.getElementById('soundBtn').textContent = store.sound ? '🔊' : '🔇';
  document.getElementById('soundToggle').checked = store.sound;
});
document.getElementById('menuBtn').addEventListener('click', () => {
  if (G.over) { backToMenu(); return; }
  document.getElementById('quitBet').textContent = G.bet;
  document.getElementById('quitOverlay').style.display = 'flex';
});
document.getElementById('quitNo').addEventListener('click', () => {
  document.getElementById('quitOverlay').style.display = 'none';
});
document.getElementById('quitYes').addEventListener('click', () => {
  document.getElementById('quitOverlay').style.display = 'none';
  backToMenu(); // la puntata è già stata pagata
});
document.getElementById('rematchBtn').addEventListener('click', () => {
  if (store.coins < G.bet) { backToMenu(); return; }
  newGame();
});
document.getElementById('backMenuBtn').addEventListener('click', backToMenu);

function backToMenu() {
  G.botToken++;
  scheduled.length = 0;
  G.over = true;
  G.phase = 'menu';
  G.timerOn = false;
  document.getElementById('game').style.display = 'none';
  document.getElementById('menu').style.display = 'block';
  document.getElementById('endOverlay').style.display = 'none';
  updateHUD(); updatePlayBtn();
}

/* ---------------- LOOP PRINCIPALE ---------------- */
let lastT = 0, physAcc = 0;
let fpsAcc = 0, fpsN = 0, fpsLast = 0;

function loop(tms) {
  const t = tms / 1000;
  let dt = lastT ? t - lastT : 0.016;
  lastT = t;
  dt = Math.min(dt, 0.05);
  G.simTime += dt;

  // FPS
  fpsAcc += dt; fpsN++;
  if (t - fpsLast > 0.5) {
    document.getElementById('fpsBadge').textContent = `${Math.round(fpsN / fpsAcc)} FPS`;
    fpsAcc = 0; fpsN = 0; fpsLast = t;
  }

  runScheduled();

  if (G.phase !== 'menu') {
    // fisica a passo fisso
    if (G.phase === 'shooting') {
      physAcc += dt;
      const maxSteps = 40;
      let steps = 0;
      while (physAcc >= SUBDT && steps < maxSteps) {
        stepPhysics(SUBDT);
        physAcc -= SUBDT;
        steps++;
      }
      if (!anyMotion() && G.shot && G.strikeAnim == null && !G.endPending) {
        G.endPending = true;
        schedule(0.15, () => { if (G.shot) endShot(); });
      }
    }
    updateSinking(dt);
    updateBallSpin(dt);
    for (const b of balls) if (b.active || b.sinking) syncMesh(b);

    // animazione colpo stecca (scatto in avanti fino al contatto)
    if (G.strikeAnim != null) {
      G.strikeAnim = Math.max(0.002, G.strikeAnim - dt * 5);
      updateCueVisual(true);
    } else {
      updateAimHelpers();
    }

    // timer del turno
    if (G.timerOn && G.turn === HUMAN && G.phase === 'aim' && !G.over) {
      G.timer -= dt;
      if (G.timer <= 0) {
        G.timerOn = false;
        G.charging = false; G.power = 0; setPowerUI(0);
        toast('⏱ Tempo scaduto! Palla in mano per ' + G.bot.name, 2400);
        Sound.foul();
        startTurn(BOT, true);
      }
    }
    updateTimerUI();

    // pulsazione dei consigli
    if (hintRingBall.visible) {
      const s = 1 + 0.12 * Math.sin(G.simTime * 5);
      hintRingBall.scale.setScalar(s);
      hintRingPocket.scale.setScalar(s);
    }

    updateCamera(dt);
    renderer.render(scene, camera);
  }
}

/* ---------------- AVVIO ---------------- */
try {
  initScene();
  buildMenu();
  updateHUD();
  rackBalls();
  renderer.setAnimationLoop(loop);
} catch (err) {
  document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif;color:#fff">
    <h2>😞 Il tuo dispositivo non supporta WebGL</h2><p>${err.message}</p></div>`;
}
