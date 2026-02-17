const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const timeValue = document.getElementById("timeValue");
const distanceValue = document.getElementById("distanceValue");
const highScoreValue = document.getElementById("highScoreValue");

const GAME = {
  width: canvas.width,
  height: canvas.height,
  laneCount: 3,
  laneWidth: canvas.width * 0.22,
  roadWidth: canvas.width * 0.7,
  roadLeft: canvas.width * 0.15,
  speed: 240,
  maxSpeed: 480,
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

const keys = new Set();
let touchActive = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

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
  player.x = canvas.width * 0.5;
  player.targetX = player.x;
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
  return GAME.roadLeft + GAME.laneWidth * 0.5 + lane * GAME.laneWidth;
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

  player.targetX = clamp(target, GAME.roadLeft + 40, GAME.roadLeft + GAME.roadWidth - 40);
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
  state.distance += GAME.speed * dt;
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
  ctx.fillStyle = "#9db0c5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#6c7a88";
  ctx.fillRect(GAME.roadLeft - 40, 0, GAME.roadWidth + 80, canvas.height);

  ctx.fillStyle = "#2b2f35";
  ctx.fillRect(GAME.roadLeft, 0, GAME.roadWidth, canvas.height);

  ctx.strokeStyle = "#f2c14e";
  ctx.lineWidth = 6;
  ctx.setLineDash([20, 24]);
  ctx.lineDashOffset = -state.distance * 0.15;

  for (let i = 1; i < GAME.laneCount; i += 1) {
    const x = GAME.roadLeft + GAME.laneWidth * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(GAME.roadLeft - 10, 0, 10, canvas.height);
  ctx.fillRect(GAME.roadLeft + GAME.roadWidth, 0, 10, canvas.height);
};

const drawCar = () => {
  ctx.save();
  ctx.translate(player.x, player.y);
  const lean = (player.x - player.targetX) * 0.01;
  ctx.rotate(lean);

  ctx.fillStyle = "#e03b35";
  ctx.fillRect(-player.width / 2, -player.height / 2, player.width, player.height);

  ctx.fillStyle = "#f7f0e8";
  ctx.fillRect(-player.width / 4, -player.height / 4, player.width / 2, player.height / 3);

  ctx.fillStyle = "#1c1f24";
  ctx.fillRect(-player.width / 2 - 6, -player.height / 3, 8, player.height * 0.8);
  ctx.fillRect(player.width / 2 - 2, -player.height / 3, 8, player.height * 0.8);

  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(-player.width / 2 + 6, -player.height / 2 + 8, 6, player.height - 16);

  ctx.restore();
};

const drawObstacle = (obstacle) => {
  ctx.save();
  ctx.translate(obstacle.x, obstacle.y);
  ctx.fillStyle = "#4b555f";
  ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
  ctx.strokeStyle = "#d0d6de";
  ctx.lineWidth = 4;
  ctx.strokeRect(-obstacle.width / 2 + 4, -obstacle.height / 2 + 4, obstacle.width - 8, obstacle.height - 8);
  ctx.restore();
};

const drawCoin = (coin) => {
  ctx.save();
  ctx.translate(coin.x, coin.y);
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
  ctx.fillStyle = "#f2c14e";
  ctx.fill();
  ctx.strokeStyle = "#f4d67b";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
};

const drawExtender = (extender) => {
  ctx.save();
  ctx.translate(extender.x, extender.y);
  ctx.fillStyle = "#2fbf71";
  ctx.fillRect(-extender.width / 2, -extender.height / 2, extender.width, extender.height);
  ctx.fillStyle = "#e7fff0";
  ctx.fillRect(-extender.width / 6, -extender.height / 3, extender.width / 3, extender.height * 0.66);
  ctx.fillRect(-extender.width / 3, -extender.height / 6, extender.width * 0.66, extender.height / 3);
  ctx.restore();
};

const drawParticles = () => {
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  for (let i = 0; i < 30; i += 1) {
    const x = Math.random() * canvas.width;
    const y = (state.distance * 0.5 + i * 100) % canvas.height;
    ctx.fillRect(x, y, 2, 12);
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
  player.targetX = clamp(x, GAME.roadLeft + 40, GAME.roadLeft + GAME.roadWidth - 40);
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

canvas.addEventListener("pointerup", () => {
  touchActive = false;
});

startBtn.addEventListener("click", () => {
  audioCtx.resume();
  startGame();
});

restartBtn.addEventListener("click", () => {
  audioCtx.resume();
  startGame();
});

setOverlay(true);
highScoreValue.textContent = `${loadHighScore().toFixed(1)}s`;
