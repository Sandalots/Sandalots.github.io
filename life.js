const canvas = document.getElementById('life');
const ctx = canvas.getContext('2d');

const GAP = 2;
const CELL = 14;
const STEP_MS = 120;
const DENSITY = 0.25;
const RESEED_GENS = 1000;
const CURATED_CHANCE = 0.4;

const BG_SATURATION = [15, 35];
const BG_LIGHTNESS = [4, 9];
const TRAIL_FADE = 0.35;

const SPORE_CHANCE = 0.008;
const SPORE_CLEARING = 3;
const MAX_COLOURS = 64;

const PAN_SPEED = 400;
const PAN_BOOST = 3;
const FRICTION = 0.94;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25
const ZOOM_EASE_MS = 90;

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const mod = (n, m) => ((n % m) + m) % m;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let background = '#0d1117';
let backgroundFade = `rgba(13, 17, 23, ${TRAIL_FADE})`;

function randomBackground() {
  const h = Math.floor(Math.random() * 360);
  const s = randInt(...BG_SATURATION);
  const l = randInt(...BG_LIGHTNESS);

  background = `hsl(${h}, ${s}%, ${l}%)`;
  backgroundFade = `hsla(${h}, ${s}%, ${l}%, ${TRAIL_FADE})`;

  document.documentElement.style.setProperty('--bg', background);
}

const CURATED = [
  ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1'],
  ['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0'],
  ['#ff9f1c', '#ffbf69', '#cbf3f0', '#2ec4b6'],
  ['#e63946', '#f1faee', '#a8dadc', '#457b9d'],
  ['#06d6a0', '#118ab2', '#ffd166', '#ef476f'],
  ['#9b5de5', '#f15bb5', '#fee440', '#00bbf9', '#00f5d4'],
  ['#d8f3dc', '#95d5b2', '#52b788', '#40916c'],
  ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff'],
  ['#cdb4db', '#ffc8dd', '#ffafcc', '#bde0fe', '#a2d2ff'],
  ['#ff4800', '#ff6000', '#ff7900', '#ff9100', '#ffaa00'],
  ['#caf0f8', '#90e0ef', '#00b4d8', '#0077b6'],
  ['#ffffff', '#adb5bd', '#6c757d'], 
];

const SCHEMES = [
  h => [0, 90, 180, 270].map(o => hsl(h + o, 80, 60)),
  h => [hsl(h, 85, 60), hsl(h + 180, 85, 60),
        hsl(h + 15, 70, 78), hsl(h + 195, 70, 78)],
  h => [0, 120, 240].map(o => hsl(h + o, 80, 62)),
  h => [-40, -20, 0, 20, 40].map(o => hsl(h + o, 75, 60)),
  h => [45, 55, 65, 75, 85].map(l => hsl(h, 70, l)),
  h => Array.from({ length: 6 }, (_, i) => hsl(h + i * 60, 100, 60)),
  h => Array.from({ length: 5 }, (_, i) => hsl(h + i * 72, 70, 82)),
  h => Array.from({ length: 12 }, (_, i) => hsl(h + i * 30, 85, 60)),
  h => [hsl(h, 90, 55), hsl(h + 150, 90, 55), hsl(h + 210, 90, 55)],
];

function randomPalette() {
  const p = Math.random() < CURATED_CHANCE
    ? pick(CURATED)
    : pick(SCHEMES)(Math.random() * 360);
  return [...p];
}

const randomColour = () => hsl(Math.random() * 360, randInt(75, 95), randInt(55, 70));

const PATTERNS = [
  [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
  [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]],
  [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
];

function orient(cells) {
  const fx = Math.random() < 0.5, fy = Math.random() < 0.5, swap = Math.random() < 0.5;
  const out = cells.map(([x, y]) => {
    const a = fx ? -x : x, b = fy ? -y : y;

    return swap ? [b, a] : [a, b];
  });

  const minX = Math.min(...out.map(c => c[0]));
  const minY = Math.min(...out.map(c => c[1]));

  return out.map(([x, y]) => [x - minX, y - minY]);
}

function randomBlob() {
  const size = randInt(5, 9);
  const cells = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (Math.random() < 0.5) cells.push([x, y]);
  return cells;
}

let dpr = 1;
let cols, rows;
let grid, next;
let colour, nextColour;
let palette = [];
let counts = new Uint32Array(MAX_COLOURS);
let gen = 0;

let camX = 0, camY = 0;
let zoom = 1, targetZoom = 1;
let zoomFX = 0, zoomFY = 0;
let needsRedraw = false;

let colX, rowY;
let visCols = [], visRows = [];

const idx = (x, y) => mod(y, rows) * cols + mod(x, cols);

function clearCanvas() {
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, innerWidth, innerHeight);
}

function seed() {
  palette = randomPalette();
  randomBackground();
  counts.fill(0);

  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < DENSITY ? 1 : 0;
    colour[i] = Math.floor(Math.random() * palette.length);

    if (grid[i]) counts[colour[i]]++;
  }
  gen = 0;
  clearCanvas();
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  cols = Math.ceil(innerWidth / (CELL * MIN_ZOOM));
  rows = Math.ceil(innerHeight / (CELL * MIN_ZOOM));

  const size = cols * rows;

  grid = new Uint8Array(size);
  next = new Uint8Array(size);
  colour = new Uint8Array(size);
  nextColour = new Uint8Array(size);
  colX = new Float32Array(cols);
  rowY = new Float32Array(rows);

  camX = camY = 0;
  seed();
}

function addColour(c) {
  if (palette.length < MAX_COLOURS) {
    palette.push(c);
    return palette.length - 1;
  }
  let best = 0;
  for (let k = 1; k < palette.length; k++) if (counts[k] < counts[best]) best = k;
  palette[best] = c;
  return best;
}

function spawnSpore() {
  const slot = addColour(randomColour());
  const cells = Math.random() < 0.75 ? orient(pick(PATTERNS)) : randomBlob();

  const w = Math.max(...cells.map(c => c[0])) + 1;
  const h = Math.max(...cells.map(c => c[1])) + 1;
  const x0 = randInt(0, cols - 1);
  const y0 = randInt(0, rows - 1);

  for (let dy = -SPORE_CLEARING; dy < h + SPORE_CLEARING; dy++)
    for (let dx = -SPORE_CLEARING; dx < w + SPORE_CLEARING; dx++)
      grid[idx(x0 + dx, y0 + dy)] = 0;

  for (const [dx, dy] of cells) {
    const i = idx(x0 + dx, y0 + dy);
    grid[i] = 1;
    colour[i] = slot;
  }
}

function birthColour(neighbours) {
  const p = [];
  for (const j of neighbours) if (grid[j]) p.push(colour[j]);

  if (p[0] === p[1] || p[0] === p[2]) return p[0];
  if (p[1] === p[2]) return p[1];

  return p[Math.floor(Math.random() * 3)];
}

function step() {
  let alive = 0;
  counts.fill(0);

  for (let y = 0; y < rows; y++) {
    const up = ((y - 1 + rows) % rows) * cols;
    const mid = y * cols;
    const down = ((y + 1) % rows) * cols;

    for (let x = 0; x < cols; x++) {
      const l = (x - 1 + cols) % cols;
      const r = (x + 1) % cols;
      const i = mid + x;
      const n =
        grid[up + l]   + grid[up + x]   + grid[up + r] +
        grid[mid + l]                   + grid[mid + r] +
        grid[down + l] + grid[down + x] + grid[down + r];

      if (grid[i] && (n === 2 || n === 3)) {
        next[i] = 1;
        nextColour[i] = colour[i];

      } else if (!grid[i] && n === 3) {
        next[i] = 1;
        nextColour[i] = birthColour([
          up + l, up + x, up + r, mid + l, mid + r, down + l, down + x, down + r,
        ]);

      } else {
        next[i] = 0;
      }

      if (next[i]) {
        alive++;
        counts[nextColour[i]]++;
      }
    }
  }
  [grid, next] = [next, grid];
  [colour, nextColour] = [nextColour, colour];

  return alive;
}

function updateScreenPositions() {
  const s = CELL * zoom;
  const W = cols * s, H = rows * s;

  visCols.length = 0;
  visRows.length = 0;

  for (let x = 0; x < cols; x++) {
    let sx = mod((x - camX) * s, W);

    if (sx > innerWidth) sx -= W;

    if (sx > -s && sx < innerWidth) {
      colX[x] = Math.round(sx);
      visCols.push(x);
    }
  }

  for (let y = 0; y < rows; y++) {
    let sy = mod((y - camY) * s, H);

    if (sy > innerHeight) sy -= H;

    if (sy > -s && sy < innerHeight) {
      rowY[y] = Math.round(sy);
      visRows.push(y);
    }
  }
}

function scrollCanvas(dx, dy) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(canvas, Math.round(-dx * dpr), Math.round(-dy * dpr));
  ctx.restore();
}

function scaleCanvas(ratio, fx, fy) {
  const px = fx * dpr, py = fy * dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(canvas, px - px * ratio, py - py * ratio,
                canvas.width * ratio, canvas.height * ratio);
  ctx.restore();
}

function draw(fade) {
  if (fade) {
    ctx.fillStyle = backgroundFade;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
  }
  updateScreenPositions();

  const s = CELL * zoom;
  const gap = s >= 6 ? Math.max(1, Math.round(s * GAP / CELL)) : 0;
  const size = Math.max(1, Math.round(s) - gap);

  let current = -1;

  for (const y of visRows) {
    const sy = rowY[y];
    const base = y * cols;

    for (const x of visCols) {
      const i = base + x;
      if (!grid[i]) continue;

      if (colour[i] !== current) {
        current = colour[i];
        ctx.fillStyle = palette[current];
      }
      ctx.fillRect(colX[x], sy, size, size);
    }
  }
  needsRedraw = false;
}

function setZoom(z, fx, fy) {
  z = clamp(z, MIN_ZOOM, MAX_ZOOM);

  if (z === zoom) return;
  const s0 = CELL * zoom, s1 = CELL * z;

  camX = mod(camX + fx / s0 - fx / s1, cols);
  camY = mod(camY + fy / s0 - fy / s1, rows);

  scaleCanvas(s1 / s0, fx, fy);

  zoom = z;
  needsRedraw = true;
}

function zoomTowards(z) {
  targetZoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
  zoomFX = innerWidth / 2;
  zoomFY = innerHeight / 2;

  if (REDUCED_MOTION) setZoom(targetZoom, zoomFX, zoomFY);
}

function updateZoom(dt) {
  if (zoom === targetZoom) return;

  const k = 1 - Math.exp(-dt / ZOOM_EASE_MS);
  let z = zoom * Math.pow(targetZoom / zoom, k);

  if (Math.abs(z / targetZoom - 1) < 0.002) z = targetZoom;
  setZoom(z, zoomFX, zoomFY);
}

function zoomAt(z, fx, fy) {
  setZoom(z, fx, fy);
  targetZoom = zoom;
}

let panAccX = 0, panAccY = 0;
let flingX = 0, flingY = 0;

function stopFling() { flingX = flingY = 0; }

const DIRS = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
};

const ZOOM_KEYS = { '+': ZOOM_STEP, '=': ZOOM_STEP, '-': 1 / ZOOM_STEP, '_': 1 / ZOOM_STEP };
const held = new Set();
let boost = false;

const keyName = e => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

addEventListener('keydown', e => {
  boost = e.shiftKey;

  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = keyName(e);

  if (DIRS[k]) {
    held.add(k);
    stopFling();
    e.preventDefault();

  } else if (ZOOM_KEYS[k]) {
    zoomTowards(targetZoom * ZOOM_KEYS[k]);
    e.preventDefault();

  } else if (k === '0') {
    zoomTowards(1);
    e.preventDefault();
  }
});
addEventListener('keyup', e => {
  boost = e.shiftKey;
  held.delete(keyName(e));
});
addEventListener('blur', () => held.clear());

const pointers = new Map();
let lastT = 0;
let velX = 0, velY = 0;
let pinchDist = 0, pinchMidX = 0, pinchMidY = 0;
let wasPinch = false;

function pinchInfo() {
  const [a, b] = [...pointers.values()];
  
  return {
    d: Math.hypot(b.x - a.x, b.y - a.y),
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  };
}

canvas.addEventListener('pointerdown', e => {
  if (pointers.size >= 2) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  lastT = e.timeStamp;
  velX = velY = 0;

  stopFling();

  if (pointers.size === 2) {
    const p = pinchInfo();

    pinchDist = p.d;
    pinchMidX = p.mx;
    pinchMidY = p.my;
    wasPinch = true;

  } else {
    wasPinch = false;
  }
});

canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);

  if (!p) return;

  if (pointers.size === 1) {
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = e.timeStamp - lastT;

    panAccX -= dx;
    panAccY -= dy;

    if (dt > 0) {
      velX = 0.8 * (-dx / dt) + 0.2 * velX;
      velY = 0.8 * (-dy / dt) + 0.2 * velY;
    }
  }

  p.x = e.clientX;
  p.y = e.clientY;

  if (pointers.size === 2) {
    const q = pinchInfo();

    panAccX -= q.mx - pinchMidX;
    panAccY -= q.my - pinchMidY;

    if (pinchDist > 0 && q.d > 0) zoomAt(zoom * (q.d / pinchDist), q.mx, q.my);
    pinchDist = q.d;
    pinchMidX = q.mx;
    pinchMidY = q.my;
  }

  lastT = e.timeStamp;
});

function endPointer(e) {
  if (!pointers.delete(e.pointerId)) return;

  if (pointers.size === 1) {
    velX = velY = 0;
    lastT = e.timeStamp;

  } else if (pointers.size === 0) {
    const recent = e.timeStamp - lastT < 80;

    if (recent && !wasPinch && !REDUCED_MOTION) {
      flingX = velX;
      flingY = velY;
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

addEventListener('wheel', e => {
  e.preventDefault();

  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  const speed = e.ctrlKey ? 0.01 : 0.0015;

  zoomAt(zoom * Math.exp(-dy * speed), e.clientX, e.clientY);
}, { passive: false });

let gestureScale = 1;
addEventListener('gesturestart', e => { e.preventDefault(); gestureScale = 1; });
addEventListener('gesturechange', e => {
  e.preventDefault();

  if (pointers.size) return; 
  zoomAt(zoom * (e.scale / gestureScale), e.clientX, e.clientY);
  gestureScale = e.scale;
});

function updateCamera(dt) {
  let vx = 0, vy = 0;

  for (const k of held) {
    vx += DIRS[k][0];
    vy += DIRS[k][1];
  }
  
  if (vx && vy) { vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
  const speed = PAN_SPEED * (boost ? PAN_BOOST : 1) * (dt / 1000);

  panAccX += vx * speed;
  panAccY += vy * speed;

  if (pointers.size === 0 && (flingX || flingY)) {
    panAccX += flingX * dt;
    panAccY += flingY * dt;

    const decay = Math.pow(FRICTION, dt / 16.67);

    flingX *= decay;
    flingY *= decay;

    if (Math.hypot(flingX, flingY) < 0.01) stopFling();
  }

  const dx = Math.trunc(panAccX), dy = Math.trunc(panAccY);

  if (!dx && !dy) return false;
  panAccX -= dx;
  panAccY -= dy;

  const s = CELL * zoom;
  camX = mod(camX + dx / s, cols);
  camY = mod(camY + dy / s, rows);

  scrollCanvas(dx, dy);

  return true;
}

let lastStep = 0, lastFrame = 0;
function loop(t) {
  const dt = lastFrame ? Math.min(t - lastFrame, 50) : 16;
  lastFrame = t;

  const moved = updateCamera(dt);
  updateZoom(dt);

  if (!REDUCED_MOTION && t - lastStep >= STEP_MS) {
    lastStep = t;
    const alive = step();
    gen++;

    if (alive < cols * rows * 0.02 || gen > RESEED_GENS) seed();

    else if (Math.random() < SPORE_CHANCE) spawnSpore();
    draw(true);

  } else if (moved || needsRedraw) {
    draw(false);
  }
  requestAnimationFrame(loop);
}

let resizeTimer;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { resize(); draw(true); }, 150);
});

resize();
draw(true);

requestAnimationFrame(loop);