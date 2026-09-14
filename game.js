'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca, 8 bloques con hueco central
];

const LINE_SCORES = [0, 100, 300, 500, 800];

// ---- Skins ----
// Cada skin define su paleta de colores (índice 0 = vacío, 1-8 = piezas) y su
// propia función de dibujado de bloque. drawBlock() (más abajo) despacha al
// skin activo sin cambiar su firma, así draw()/drawNext() no se tocan.

function pathRoundRect(context, x, y, w, h, r) {
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  // Fallback manual con arcTo para navegadores sin roundRect
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function retroDrawBlock(context, x, y, color, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.globalAlpha = 1;
}

function neonDrawBlock(context, x, y, color, size, alpha) {
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  context.save();
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.fillStyle = 'rgba(10,10,16,0.85)';
  context.fillRect(px, py, w, w);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 1, py + 1, w - 2, w - 2);
  context.shadowBlur = 0;
  context.restore();
  context.globalAlpha = 1;
}

function pastelDrawBlock(context, x, y, color, size, alpha) {
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  pathRoundRect(context, px, py, w, w, 6);
  context.fill();
  context.strokeStyle = 'rgba(80,80,90,0.25)';
  context.lineWidth = 1;
  pathRoundRect(context, px, py, w, w, 6);
  context.stroke();
  context.globalAlpha = 1;
}

// Cachea la textura de sub-píxeles por color+tamaño en un canvas fuera de
// pantalla: sin esto, pixelDrawBlock repetiría ~25 fillRect por bloque en
// cada frame del rAF loop (hasta ~200 bloques con el tablero lleno).
const pixelTextureCache = new Map();

function getPixelTexture(color, size) {
  const key = color + '|' + size;
  let tex = pixelTextureCache.get(key);
  if (tex) return tex;
  const w = size - 2;
  tex = document.createElement('canvas');
  tex.width = w;
  tex.height = w;
  const tctx = tex.getContext('2d');
  tctx.fillStyle = color;
  tctx.fillRect(0, 0, w, w);
  // patrón de sub-píxeles alternando tonos claros/oscuros del mismo color
  const step = Math.max(2, Math.round(size / 5));
  let toggle = 0;
  for (let sy = 0; sy < w; sy += step) {
    for (let sx = 0; sx < w; sx += step) {
      const dark = (toggle % 2) === 0;
      tctx.fillStyle = dark ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
      const sw = Math.min(step, w - sx);
      const sh = Math.min(step, w - sy);
      tctx.fillRect(sx, sy, sw, sh);
      toggle++;
    }
    toggle++;
  }
  pixelTextureCache.set(key, tex);
  return tex;
}

function pixelDrawBlock(context, x, y, color, size, alpha) {
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.drawImage(getPixelTexture(color, size), px, py);
  context.strokeStyle = 'rgba(0,0,0,0.6)';
  context.lineWidth = 1;
  context.strokeRect(px, py, w, w);
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    colors: [
      null,
      '#4dd0e1', // I - cyan
      '#ffd54f', // O - yellow
      '#ba68c8', // T - purple
      '#81c784', // S - green
      '#e57373', // Z - red
      '#90caf9', // J - pale blue
      '#ffb74d', // L - orange
      '#b0bec5', // N - tuerca (nut), gris metálico
    ],
    draw: retroDrawBlock,
  },
  neon: {
    colors: [
      null,
      '#00e5ff', // I
      '#ffea00', // O
      '#e040fb', // T
      '#00e676', // S
      '#ff1744', // Z
      '#448aff', // J
      '#ff9100', // L
      '#b2ff59', // N
    ],
    draw: neonDrawBlock,
  },
  pastel: {
    colors: [
      null,
      '#a8dfe6', // I
      '#f7e6a3', // O
      '#d9b8e0', // T
      '#b9e0bd', // S
      '#f0b6b6', // Z
      '#b8cdf0', // J
      '#f5cfa3', // L
      '#d3d8dd', // N
    ],
    draw: pastelDrawBlock,
  },
  pixel: {
    colors: [
      null,
      '#3fd0e0',
      '#e8c93a',
      '#a84fc0',
      '#5fb86a',
      '#d14c4c',
      '#6f9fe0',
      '#e08a30',
      '#93a0a8',
    ],
    draw: pixelDrawBlock,
  },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const skinSelect = document.getElementById('skin-select');

const THEME_STORAGE_KEY = 'tetris-theme'; // legacy, solo se lee para migración
const SKIN_STORAGE_KEY = 'tetris-skin';
let gridLineColor = '#22222e';
let activeSkin = 'retro';

function applySkin(skin) {
  if (!SKINS[skin]) skin = 'retro';
  activeSkin = skin;
  document.body.dataset.skin = skin;
  if (skinSelect) skinSelect.value = skin;
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  try {
    localStorage.setItem(SKIN_STORAGE_KEY, skin);
  } catch (e) {
    // modo privado / storage no disponible: no persiste, pero el skin sigue aplicado
  }
}

function loadInitialSkin() {
  let stored = null;
  try {
    stored = localStorage.getItem(SKIN_STORAGE_KEY);
  } catch (e) {
    stored = null;
  }
  if (stored && SKINS[stored]) return stored;

  // Migración: el toggle claro/oscuro anterior pasa a ser el skin 'pastel'.
  let legacyTheme = null;
  try {
    legacyTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (e) {
    legacyTheme = null;
  }
  return legacyTheme === 'light' ? 'pastel' : 'retro';
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const skin = SKINS[activeSkin];
  skin.draw(context, x, y, skin.colors[colorIndex], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridLineColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    applySkin(skinSelect.value);
    draw();
  });
}

applySkin(loadInitialSkin());
init();
