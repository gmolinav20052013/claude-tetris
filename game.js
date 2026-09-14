'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (nut), gris metálico
];

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
const themeToggleInput = document.getElementById('theme-toggle-input');

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const startBestStats = document.getElementById('start-best-stats');
const playBtn = document.getElementById('play-btn');
const clearRecordsBtn = document.getElementById('clear-records-btn');
const gameContainer = document.querySelector('.game-container');
const overlayRecords = document.getElementById('overlay-records');
const overlayRecordsBody = document.getElementById('overlay-records-body');
const overlayBestStats = document.getElementById('overlay-best-stats');
const nameEntry = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name-input');
const saveRecordBtn = document.getElementById('save-record-btn');

const THEME_STORAGE_KEY = 'tetris-theme';
const RECORDS_STORAGE_KEY = 'tetris-records';
let gridLineColor = '#22222e';

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  themeToggleInput.checked = isLight;
  themeToggleInput.setAttribute('aria-pressed', String(isLight));
  gridLineColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function defaultRecords() {
  return { scores: [], bestCombo: 0, bestLines: 0 };
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) return defaultRecords();
    const parsed = JSON.parse(raw);
    return {
      scores: Array.isArray(parsed.scores) ? parsed.scores : [],
      bestCombo: typeof parsed.bestCombo === 'number' ? parsed.bestCombo : 0,
      bestLines: typeof parsed.bestLines === 'number' ? parsed.bestLines : 0,
    };
  } catch (e) {
    return defaultRecords();
  }
}

function saveRecords(r) {
  try {
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(r));
  } catch (e) {
    // localStorage no disponible (p.ej. modo privado) — se ignora
  }
}

function qualifies(scoreValue) {
  const records = loadRecords();
  return records.scores.length < 5 || scoreValue > records.scores[records.scores.length - 1].score;
}

function insertRecord(entry) {
  const records = loadRecords();
  records.scores.push(entry);
  records.scores.sort((a, b) => b.score - a.score);
  records.scores = records.scores.slice(0, 5);
  saveRecords(records);
  return records;
}

function resetRecords() {
  saveRecords(defaultRecords());
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderRecordsTable(tbodyEl, highlightIndex) {
  if (!tbodyEl) return;
  const records = loadRecords();
  tbodyEl.innerHTML = '';
  if (records.scores.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'records-empty';
    td.textContent = 'Sin records todavía';
    tr.appendChild(td);
    tbodyEl.appendChild(tr);
    return;
  }
  records.scores.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'record-row' + (idx === highlightIndex ? ' highlight' : '');
    tr.innerHTML = `<td>${escapeHtml(entry.name)}</td><td>${entry.score.toLocaleString()}</td><td>${entry.lines}</td><td>${entry.level}</td>`;
    tbodyEl.appendChild(tr);
  });
}

function renderBestStats(el) {
  if (!el) return;
  const records = loadRecords();
  el.textContent = `Mejor combo: ${records.bestCombo} · Máx. líneas: ${records.bestLines}`;
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo, maxCombo;

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
  if (cleared > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
  } else {
    combo = 0;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  // border, keeps pieces/ghost readable against light backgrounds too
  context.strokeStyle = 'rgba(0,0,0,0.35)';
  context.lineWidth = 1;
  context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.globalAlpha = 1;
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

  const records = loadRecords();
  records.bestCombo = Math.max(records.bestCombo, maxCombo);
  records.bestLines = Math.max(records.bestLines, lines);
  saveRecords(records);

  if (qualifies(score)) {
    nameEntry.classList.remove('hidden');
    playerNameInput.value = 'ANON';
    playerNameInput.focus();
    playerNameInput.select();
  } else {
    nameEntry.classList.add('hidden');
  }
  overlayRecords.classList.remove('hidden');
  renderRecordsTable(overlayRecordsBody, -1);
  renderBestStats(overlayBestStats);
  overlay.classList.remove('hidden');
}

function saveRecordHandler() {
  const name = (playerNameInput.value.trim() || 'ANON').slice(0, 12);
  const entry = { name, score, lines, level, date: new Date().toISOString() };
  const updated = insertRecord(entry);
  const idx = updated.scores.indexOf(entry);
  nameEntry.classList.add('hidden');
  renderRecordsTable(overlayRecordsBody, idx);
  renderBestStats(overlayBestStats);
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
    overlayRecords.classList.add('hidden');
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
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  gameContainer.classList.remove('hidden');
  startScreen.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  cancelAnimationFrame(animId);
  gameContainer.classList.add('hidden');
  overlay.classList.add('hidden');
  startScreen.classList.remove('hidden');
  renderRecordsTable(startRecordsBody, -1);
  renderBestStats(startBestStats);
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
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

playBtn.addEventListener('click', init);

clearRecordsBtn.addEventListener('click', () => {
  if (confirm('¿Borrar todos los records?')) {
    resetRecords();
    renderRecordsTable(startRecordsBody, -1);
    renderBestStats(startBestStats);
  }
});

saveRecordBtn.addEventListener('click', saveRecordHandler);

themeToggleInput.addEventListener('change', () => {
  applyTheme(themeToggleInput.checked ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
showStartScreen();
