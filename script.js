const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const startBtnInline = document.getElementById("startBtnInline");
const timeValue = document.getElementById("timeValue");
const distanceValue = document.getElementById("distanceValue");
const highScoreValue = document.getElementById("highScoreValue");

const GAME = {
  width: canvas.width,
  height: canvas.height,
  laneCount: 3,
  roadWidth: canvas.width * 0.7,
  roadLeft: canvas.width * 0.15,
  speed: 260,
  maxSpeed: 520,
  baseTime: 60,
  timeBonus: 8,
};

const state = {
  running: false,
  lastTime: 0,
  timeLeft: GAME.baseTime,
  elapsed: 0,
  distance: 0,
  laneOffset: 0,
  maxTimeAchieved: GAME.baseTime,
  obstacles: [],
  coins: [],
  extenders: [],
  spawnTimer: 0,
  extendTimer: 0,
  sparkTimer: 0,
};

const player = {
  x: canvas.width * 0.5,
  y: canvas.height * 0.72,
  width: 52,
  height: 92,
  targetX: canvas.width * 0.5,
  speed: 420,
};

const world = {
  roadWidth: GAME.roadWidth,
  roadLeft: GAME.roadLeft,
  laneWidth: 0,
};

const keys = new Set();
let touchActive = false;

const audioCtx = window.AudioContext || window.webkitAudioContext
  ? new (window.AudioContext || window.webkitAudioContext)()
  : null;

const loadHighScore = () => {
  const stored = localStorage.getItem("velocityRidgeHighTime");
  return stored ? Number.parseFloat(stored) : 0;
};

const saveHighScore = (value) => {
  localStorage.setItem("velocityRidgeHighTime", value.toFixed(1));
};

const playTone = (freq, duration, gainValue) => {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.stop(now + duration + 0.02);
};

const playCollectSound = () => playTone(620, 0.2, 0.08);
const playExtendSound = () => playTone(420, 0.35, 0.1);
const playImpactSound = () => playTone(180, 0.25, 0.12);

const setOverlay = (visible) => {
  overlay.classList.toggle("overlay--visible", visible);
};

const resetGame = () => {
  state.running = false;
  state.timeLeft = GAME.baseTime;
  state.elapsed = 0;
  state.distance = 0;
  state.laneOffset = 0;
  state.maxTimeAchieved = GAME.baseTime;
  state.obstacles = [];
  state.coins = [];
  state.extenders = [];
  state.spawnTimer = 0;
  state.extendTimer = 0;
  resizeCanvas();
  updateHUD();
};

const startGame = () => {
  resetGame();
  state.running = true;
  state.lastTime = performance.now();
  setOverlay(false);
  requestAnimationFrame(loop);
};

const endGame = () => {
  state.running = false;
  const best = Math.max(loadHighScore(), state.maxTimeAchieved);
  saveHighScore(best);
  updateHUD();
  setOverlay(true);
};

const updateHUD = () => {
  timeValue.textContent = `${state.timeLeft.toFixed(1)}s`;
  distanceValue.textContent = `${(state.distance / 1000).toFixed(1)}km`;
  highScoreValue.textContent = `${loadHighScore().toFixed(1)}s`;
};

const updateMaxTime = () => {
  const total = state.elapsed + state.timeLeft;
  if (total > state.maxTimeAchieved) {
    state.maxTimeAchieved = total;
  }
};

const spawnObstacle = () => {
  const lane = Math.floor(Math.random() * GAME.laneCount);
  const size = 50 + Math.random() * 25;
  state.obstacles.push({
    x: laneCenter(lane),
    y: -100,
    width: size,
    height: size * 0.9,
    speed: GAME.speed + Math.random() * 80,
  });
};

const spawnCoin = () => {
  const lane = Math.floor(Math.random() * GAME.laneCount);
  state.coins.push({
    x: laneCenter(lane),
    y: -120,
    radius: 16,
    speed: GAME.speed + 80,
  });
};

const spawnExtender = () => {
  const lane = Math.floor(Math.random() * GAME.laneCount);
  state.extenders.push({
    x: laneCenter(lane),
    y: -140,
    width: 34,
    height: 34,
    speed: GAME.speed + 60,
  });
};

const laneCenter = (lane) => {
  return world.roadLeft + world.laneWidth * 0.5 + lane * world.laneWidth;
};

const resizeCanvas = () => {
  const ratio = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  canvas.width = Math.round(displayWidth * ratio);
  canvas.height = Math.round(displayHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  world.roadWidth = displayWidth * 0.7;
  world.roadLeft = (displayWidth - world.roadWidth) * 0.5;
  world.laneWidth = world.roadWidth / GAME.laneCount;

  player.y = displayHeight * 0.72;
  player.x = clamp(player.x, world.roadLeft + 40, world.roadLeft + world.roadWidth - 40);
  player.targetX = player.x;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const updatePlayer = (dt) => {
  const move = player.speed * dt;
  let target = player.targetX;

  if (keys.has("ArrowLeft") || keys.has("a")) {
    target -= move;
  }
  if (keys.has("ArrowRight") || keys.has("d")) {
    target += move;
  }

  player.targetX = clamp(target, world.roadLeft + 40, world.roadLeft + world.roadWidth - 40);
  const delta = player.targetX - player.x;
  player.x += delta * Math.min(1, dt * 6);
};

const updateEntities = (items, dt) => {
  items.forEach((item) => {
    item.y += item.speed * dt;
  });
  return items.filter((item) => item.y < canvas.height + 120);
};

const checkCollision = (rect, target) => {
  const rx = rect.x - rect.width / 2;
  const ry = rect.y - rect.height / 2;
  return (
    rx < target.x + target.width / 2 &&
    rx + rect.width > target.x - target.width / 2 &&
    ry < target.y + target.height / 2 &&
    ry + rect.height > target.y - target.height / 2
  );
};

const checkCircleCollision = (circle, target) => {
  const dx = Math.abs(circle.x - target.x);
  const dy = Math.abs(circle.y - target.y);
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < circle.radius + Math.min(target.width, target.height) * 0.4;
};

const updateGame = (dt) => {
  state.elapsed += dt;
  state.timeLeft -= dt;
  const speed = Math.min(GAME.speed + state.elapsed * 2.2, GAME.maxSpeed);
  state.distance += speed * dt;
  updateMaxTime();

  state.spawnTimer += dt;
  state.extendTimer += dt;

  if (state.spawnTimer > 0.9) {
    spawnObstacle();
    if (Math.random() > 0.4) {
      spawnCoin();
    }
    state.spawnTimer = 0;
  }

  if (state.extendTimer > 4.5) {
    spawnExtender();
    state.extendTimer = 0;
  }

  updatePlayer(dt);

  state.obstacles = updateEntities(state.obstacles, dt);
  state.coins = updateEntities(state.coins, dt);
  state.extenders = updateEntities(state.extenders, dt);

  state.obstacles.forEach((obstacle) => {
    if (checkCollision(obstacle, player)) {
      playImpactSound();
      state.timeLeft = Math.max(0, state.timeLeft - 6);
      obstacle.y = canvas.height + 200;
    }
  });

  state.coins = state.coins.filter((coin) => {
    if (checkCircleCollision(coin, player)) {
      playCollectSound();
      state.distance += 120;
      return false;
    }
    return true;
  });

  state.extenders = state.extenders.filter((extender) => {
    if (checkCollision(extender, player)) {
      playExtendSound();
      state.timeLeft += GAME.timeBonus;
      updateMaxTime();
      return false;
    }
    return true;
  });

  updateHUD();

  if (state.timeLeft <= 0) {
    endGame();
  }
};

const drawRoad = () => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, width, height);

  const shoulder = 50;
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(world.roadLeft - shoulder, 0, world.roadWidth + shoulder * 2, height);

  ctx.fillStyle = "#0f1628";
  ctx.fillRect(world.roadLeft, 0, world.roadWidth, height);

  ctx.strokeStyle = "rgba(0, 245, 255, 0.45)";
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 32]);
  ctx.lineDashOffset = -state.distance * 0.18;

  for (let i = 1; i < GAME.laneCount; i += 1) {
    const x = world.roadLeft + world.laneWidth * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(0, 245, 255, 0.12)";
  ctx.fillRect(world.roadLeft - 12, 0, 8, height);
  ctx.fillRect(world.roadLeft + world.roadWidth + 4, 0, 8, height);
};

const drawCar = () => {
  ctx.save();
  ctx.translate(player.x, player.y);
  const lean = (player.x - player.targetX) * 0.01;
  ctx.rotate(lean);

  const gradient = ctx.createLinearGradient(0, -player.height / 2, 0, player.height / 2);
  gradient.addColorStop(0, "#00f5ff");
  gradient.addColorStop(1, "#4b00ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);

  ctx.fillStyle = "rgba(7, 10, 20, 0.8)";
  ctx.fillRect(-player.width / 3, -player.height / 4, player.width / 1.5, player.height / 3);

  ctx.fillStyle = "#05060a";
  ctx.fillRect(-player.width / 2 - 6, -player.height / 3, 8, player.height * 0.8);
  ctx.fillRect(player.width / 2 - 2, -player.height / 3, 8, player.height * 0.8);

  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(-player.width / 2 + 6, -player.height / 2 + 8, 6, player.height - 16);

  ctx.restore();
};

const drawObstacle = (obstacle) => {
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  ctx.fillStyle = "#141d30";
  ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
  ctx.strokeStyle = "rgba(0, 245, 255, 0.5)";
  ctx.lineWidth = 4;
  ctx.strokeRect(-obstacle.width / 2 + 4, -obstacle.height / 2 + 4, obstacle.width - 8, obstacle.height - 8);
  ctx.restore();
};

const drawCoin = (coin) => {
  ctx.save();
  ctx.translate(coin.x, coin.y);
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#f8c537";
  ctx.fill();
  ctx.strokeStyle = "rgba(248, 197, 55, 0.7)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
};

const drawExtender = (extender) => {
  ctx.save();
  ctx.translate(extender.x, extender.y);
  ctx.fillStyle = "#00f5ff";
  ctx.fillRect(-extender.width / 2, -extender.height / 2, extender.width, extender.height);
  ctx.fillStyle = "rgba(4, 8, 16, 0.8)";
  ctx.fillRect(-extender.width / 6, -extender.height / 3, extender.width / 3, extender.height * 0.66);
  ctx.fillRect(-extender.width / 3, -extender.height / 6, extender.width * 0.66, extender.height / 3);
  ctx.restore();
};

const drawParticles = () => {
  ctx.fillStyle = "rgba(0, 245, 255, 0.18)";
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  for (let i = 0; i < 30; i += 1) {
    const x = (i * 37) % width;
    const y = (state.distance * 0.6 + i * 110) % height;
    ctx.fillRect(x, y, 2, 14);
  }
};

const render = () => {
  drawRoad();
  drawParticles();
  state.obstacles.forEach(drawObstacle);
  state.coins.forEach(drawCoin);
  state.extenders.forEach(drawExtender);
  drawCar();
};

const loop = (timestamp) => {
  if (!state.running) return;
  const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;
  updateGame(dt);
  render();
  requestAnimationFrame(loop);
};

const handleKey = (event, isDown) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "a" || event.key === "d") {
    event.preventDefault();
  }
  if (isDown) {
    keys.add(event.key);
  } else {
    keys.delete(event.key);
  }
};

const handlePointer = (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  player.targetX = clamp(x, world.roadLeft + 40, world.roadLeft + world.roadWidth - 40);
};

window.addEventListener("keydown", (event) => handleKey(event, true));
window.addEventListener("keyup", (event) => handleKey(event, false));

canvas.addEventListener("pointerdown", (event) => {
  touchActive = true;
  handlePointer(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (!touchActive) return;
  handlePointer(event);
});

const endPointer = () => {
  touchActive = false;
};

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("pointerleave", endPointer);

const resumeAudio = () => {
  if (audioCtx) {
    audioCtx.resume();
  }
};

[startBtn, restartBtn, startBtnInline].forEach((button) => {
  if (!button) return;
  button.addEventListener("click", () => {
    resumeAudio();
    startGame();
  });
});

setOverlay(true);
highScoreValue.textContent = `${loadHighScore().toFixed(1)}s`;

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
