import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  recordScore,
  setPresenceHeartbeat,
} from "../../shared/social.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("nb2-score");
const countEl = document.getElementById("nb2-count");
const stageEl = document.getElementById("nb2-stage");
const selectedEl = document.getElementById("nb2-selected");
const subtitleEl = document.getElementById("nb2-subtitle");

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
const WORLD_HEIGHT = 540;
const GRAVITY = 2200;
const MOVE_SPEED = 320;
const JUMP_SPEED = 760;
const PLAYER_BASE = 30;
const PLAYER_H = 42;
const LEVEL_LENGTH = 1200;
const GATE_WIDTH = 26;
const WORLD_ID = "mundo-numberblocks-2";

const stageTemplates = [
  { target: 10, friends: [9] },
  { target: 20, friends: [4, 6] },
  { target: 30, friends: [7, 3] },
  { target: 40, friends: [2, 8] },
  { target: 50, friends: [5, 5] },
];

const keys = new Set();
const mobile = { left: false, right: false, jump: false };
const world = [];
let player;
let cameraX = 0;
let currentStage = 0;
let gameState = "playing";
let winFlash = 0;
let lastTime = performance.now();
let startTime = performance.now();
let me = null;
let people = [];
let peopleUnsub = null;
let heartbeatTimer = null;
let selectedSessionId = "";
let points = 0;
const avatarCache = new Map();
const COLORS = ["red", "blue", "green", "yellow", "purple", "orange"];
const COLOR_HEX = {
  red: "#ff5c7a",
  blue: "#5ad7ff",
  green: "#62e6a2",
  yellow: "#ffd166",
  purple: "#9f7aea",
  orange: "#ff9f43",
};
let projectiles = [];
let lastStageColorSeed = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash >>> 0;
}

function avatarFallback(name) {
  const initials = String(name || "F").slice(0, 2).toUpperCase();
  const hue = hashString(name || "fiuma") % 360;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},72%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 28) % 360},78%,44%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="24" fill="url(#g)"/>
      <circle cx="31" cy="33" r="4" fill="white"/>
      <circle cx="49" cy="33" r="4" fill="white"/>
      <path d="M27 47c3.5 4 22.5 4 26 0" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>
      <text x="40" y="69" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="800" fill="white">${initials}</text>
    </svg>
  `)}`;
}

function spawnFor(person) {
  const hash = hashString(person?.normalized || person?.sessionId || "fiuma");
  return { x: hash % 180, y: 410 };
}

function pickStageColor(seedValue = 0) {
  const seed = hashString(`${WORLD_ID}:${currentStage}:${seedValue}:${Date.now()}`);
  return COLORS[seed % COLORS.length];
}

function syncCurrentColor(force = false) {
  if (!me) return;
  if (!force && lastStageColorSeed === currentStage) return;
  lastStageColorSeed = currentStage;
  me = {
    ...me,
    stageColor: pickStageColor(currentStage),
    hp: Number.isFinite(me.hp) ? me.hp : 10,
  };
}

function faceFor(person) {
  return person.photoDataUrl || avatarFallback(person.nickname);
}

function avatarImage(src) {
  if (!src) return null;
  if (!avatarCache.has(src)) {
    const image = new Image();
    image.src = src;
    avatarCache.set(src, image);
  }
  return avatarCache.get(src);
}

function stageData() {
  return world[currentStage];
}

function makeStage(index, template) {
  const baseX = index * LEVEL_LENGTH;
  const groundY = 458;
  const gateX = baseX + LEVEL_LENGTH - 150;
  const platforms = [
    { x: baseX + 120, y: 380, w: 120, h: 18 },
    { x: baseX + 320, y: 324, w: 112, h: 18 },
    { x: baseX + 540, y: 286, w: 130, h: 18 },
    { x: baseX + 780, y: 348, w: 132, h: 18 },
  ];
  const friendLayout = [
    { x: baseX + 220, y: groundY - 40 },
    { x: baseX + 430, y: 284 },
    { x: baseX + 645, y: 246 },
    { x: baseX + 860, y: 308 },
    { x: baseX + 990, y: groundY - 40 },
  ];
  const friends = template.friends.map((value, i) => ({
    x: friendLayout[i].x,
    y: friendLayout[i].y,
    w: 32,
    h: 40,
    value,
    collected: false,
  }));
  return { index, target: template.target, baseX, groundY, gateX, platforms, friends, gateOpen: false };
}

function buildWorld() {
  world.length = 0;
  stageTemplates.forEach((template, index) => world.push(makeStage(index, template)));
}

function syncHUD() {
  const active = people.filter((person) => person.online || person.sessionId === me?.sessionId).length;
  countEl.textContent = `${active} online`;
  scoreEl.textContent = `Puntos: ${points} | HP: ${Math.max(0, Number(me?.hp ?? 10))}`;
  stageEl.textContent = `Escenario ${currentStage + 1} / ${world.length}`;
  const selected = people.find((person) => person.sessionId === selectedSessionId);
  selectedEl.textContent = selected ? `Cerca: ${selected.nickname} (${selected.stageColor || "sin color"})` : "Nadie cerca";
  subtitleEl.textContent = selected
    ? `Compartiendo el mismo recorrido con ${selected.nickname}.`
    : "La cara, el color y la posición viajan por Realtime Database, como en Fiuma.";
}

function resetGame() {
  buildWorld();
  currentStage = 0;
  gameState = "playing";
  winFlash = 0;
  startTime = performance.now();
  player = {
    x: 90,
    y: 410,
    w: PLAYER_BASE,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    total: 1,
    hp: 10,
    stageColor: pickStageColor(0),
    onGround: false,
    _jumpLatch: false,
  };
  cameraX = 0;
  points = 0;
  syncHUD();
}

function currentStageData() {
  return world[currentStage];
}

function isGateSatisfied(stage) {
  return player.total === stage.target;
}

function openGateIfReady(stage) {
  stage.gateOpen = isGateSatisfied(stage);
}

function jump() {
  if (player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }
}

function getInput() {
  return {
    left: keys.has("ArrowLeft") || keys.has("KeyA") || mobile.left,
    right: keys.has("ArrowRight") || keys.has("KeyD") || mobile.right,
    jumpPressed: keys.has("ArrowUp") || keys.has("Space") || keys.has("KeyW") || mobile.jump,
  };
}

function handleMovement(dt) {
  const { left, right, jumpPressed } = getInput();
  const accel = 1800;
  const friction = player.onGround ? 0.82 : 0.94;
  if (left) player.vx -= accel * dt;
  if (right) player.vx += accel * dt;
  if (!left && !right) player.vx *= friction;
  player.vx = clamp(player.vx, -MOVE_SPEED, MOVE_SPEED);
  if (jumpPressed && !player._jumpLatch) {
    jump();
    player._jumpLatch = true;
  }
  if (!jumpPressed) player._jumpLatch = false;
}

function moveAndCollide(dt) {
  player.x += player.vx * dt;
  resolveHorizontal();
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  player.onGround = false;
  resolveVertical();
}

function stagePlatforms(stage) {
  return [{ x: stage.baseX - 1000, y: stage.groundY, w: 3000, h: 80 }, ...stage.platforms];
}

function resolveHorizontal() {
  const stage = currentStageData();
  const solids = stagePlatforms(stage);
  for (const solid of solids) {
    const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectsOverlap(playerBox, solid)) {
      if (player.vx > 0) player.x = solid.x - player.w - 0.1;
      else if (player.vx < 0) player.x = solid.x + solid.w + 0.1;
      player.vx = 0;
    }
  }
  const gate = { x: stage.gateX, y: 0, w: GATE_WIDTH, h: WORLD_HEIGHT };
  if (!stage.gateOpen) {
    const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectsOverlap(playerBox, gate)) {
      if (player.vx > 0) player.x = gate.x - player.w - 0.1;
      else if (player.vx < 0) player.x = gate.x + gate.w + 0.1;
      player.vx = 0;
    }
  }
}

function resolveVertical() {
  const stage = currentStageData();
  const solids = stagePlatforms(stage);
  for (const solid of solids) {
    const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
    if (rectsOverlap(playerBox, solid)) {
      if (player.vy > 0) {
        player.y = solid.y - player.h - 0.1;
        player.vy = 0;
        player.onGround = true;
      } else if (player.vy < 0) {
        player.y = solid.y + solid.h + 0.1;
        player.vy = 0;
      }
    }
  }
  player.y = clamp(player.y, -100, WORLD_HEIGHT - player.h);
}

function pickupFriends() {
  const stage = currentStageData();
  for (const friend of stage.friends) {
    if (friend.collected) continue;
    const playerBody = { x: player.x - 2, y: player.y - 4, w: player.w + 4, h: player.h + 8 };
    const friendBody = { x: friend.x - 8, y: friend.y - 8, w: friend.w + 16, h: friend.h + 16 };
    if (rectsOverlap(playerBody, friendBody) && player.vy >= -120) {
      friend.collected = true;
      player.total += friend.value;
      points += friend.value;
      syncHUD();
      player.y = friend.y - player.h - 0.1;
      player.vy = 0;
      player.onGround = true;
      setPresence().catch(() => {});
      recordScore(WORLD_ID, points, { label: "Numberblocks 2", details: `Escenario ${currentStage + 1}` }).catch(() => {});
    }
  }
}

function advanceStageIfNeeded() {
  const stage = currentStageData();
  openGateIfReady(stage);
  if (stage.gateOpen && player.x + player.w > stage.gateX + GATE_WIDTH + 8) {
    currentStage += 1;
    if (currentStage >= world.length) {
      gameState = "won";
      winFlash = 1;
      currentStage = world.length - 1;
      const score = Math.max(0, 8000 - Math.floor((performance.now() - startTime) / 8) + points * 100);
      recordScore(WORLD_ID, score, { label: "Mundo Numberblocks 2" }).catch(() => {});
      return;
    }
    const nextStage = currentStageData();
    player.x = nextStage.baseX + 50;
    player.y = 410;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    cameraX = nextStage.baseX;
    player.hp = 10;
    player.stageColor = pickStageColor(currentStage);
    projectiles = [];
    syncHUD();
    updatePresence(true).catch(() => {});
  }
}

function update(dt) {
  if (gameState !== "playing") {
    if (gameState === "won") winFlash = Math.max(0, winFlash - dt * 0.12);
    return;
  }
  handleMovement(dt);
  moveAndCollide(dt);
  pickupFriends();
  updateProjectiles(dt);
  advanceStageIfNeeded();
  cameraX += (player.x - cameraX - canvas.width / DPR / 2) * Math.min(1, dt * 3.5);
  cameraX = clamp(cameraX, currentStageData().baseX - 40, currentStageData().baseX + LEVEL_LENGTH - canvas.width / DPR + 120);
  if (player.y > WORLD_HEIGHT + 200) resetGame();
}

function drawFace(x, y, w, h, person = null, isHero = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundRect(0, 0, w, h, 12, true, isHero ? "#5ad7ff" : "#ffd166");
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  const img = avatarImage(faceFor(person));
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save();
    roundRect(2, 2, w - 4, h - 4, 10, false);
    ctx.clip();
    ctx.drawImage(img, 2, 2, w - 4, h - 4);
    ctx.restore();
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(w * 0.33, h * 0.34, 2.4, 0, Math.PI * 2);
    ctx.arc(w * 0.67, h * 0.34, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 3;
    ctx.arc(w * 0.5, h * 0.54, 8, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = COLOR_HEX[person?.stageColor] || (isHero ? "#5ad7ff" : "#ffd166");
  roundRect(0, 0, w, h, 12, true);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(3, 3, w - 6, 7);
  ctx.fillStyle = "#fff";
  ctx.font = "700 11px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(Number(person?.hp ?? 10)), w / 2, h - 6);
  ctx.restore();
}

function drawNumberFace(x, y, w, h, value, fill, shadow) {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  roundRect(0, 0, w, h, 10, true, fill);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = shadow;
  ctx.fillRect(w * 0.2, h * 0.28, 4, 4);
  ctx.fillRect(w * 0.65, h * 0.28, 4, 4);
  ctx.fillRect(w * 0.28, h * 0.58, w * 0.44, 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${Math.max(14, Math.min(24, h * 0.5))}px Trebuchet MS, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), w / 2, h / 2 + 1);
  ctx.restore();
}

function drawProjectiles() {
  for (const shot of projectiles) {
    ctx.save();
    ctx.fillStyle = COLOR_HEX[shot.color] || "#fff";
    ctx.shadowColor = COLOR_HEX[shot.color] || "#fff";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(shot.x - cameraX, shot.y, 22, 8, 999);
    ctx.fill();
    ctx.restore();
  }
}

function roundRect(x, y, w, h, r, fill = false, fillStyle = null) {
  if (fillStyle) ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
}

function drawBackground(stage) {
  const w = canvas.width / DPR;
  const h = canvas.height / DPR;
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#263453");
  gradient.addColorStop(0.55, "#151b2a");
  gradient.addColorStop(1, "#0d111a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function drawPlatforms(stage) {
  const h = canvas.height / DPR;
  ctx.fillStyle = "#343c4e";
  for (const solid of stagePlatforms(stage)) {
    if (solid.h < 40) {
      const x = solid.x - cameraX;
      if (x < -200 || x > canvas.width / DPR + 200) continue;
      roundRect(x, solid.y, solid.w, solid.h, 8, true, "#4d5c78");
    } else {
      ctx.fillStyle = "#233041";
      ctx.fillRect(solid.x - cameraX, solid.y, solid.w, solid.h);
      ctx.fillStyle = "#3d475a";
      ctx.fillRect(solid.x - cameraX, solid.y, solid.w, 12);
    }
  }
  const ground = stage.groundY;
  ctx.fillStyle = "#1b2333";
  ctx.fillRect(stage.baseX - cameraX - 240, ground, LEVEL_LENGTH + 480, h - ground);
  ctx.fillStyle = "#2d394d";
  ctx.fillRect(stage.baseX - cameraX - 240, ground - 10, LEVEL_LENGTH + 480, 10);
}

function drawGate(stage) {
  const x = stage.gateX - cameraX;
  const gateColor = stage.gateOpen ? "#62e6a2" : "#ff5c7a";
  ctx.fillStyle = gateColor;
  ctx.fillRect(x, 0, GATE_WIDTH, WORLD_HEIGHT);
  ctx.fillStyle = "rgba(6,10,16,0.4)";
  ctx.fillRect(x + 6, 0, 4, WORLD_HEIGHT);
  ctx.fillRect(x + 16, 0, 4, WORLD_HEIGHT);
  ctx.save();
  ctx.translate(x + GATE_WIDTH / 2, 78);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#fff";
  ctx.font = "700 26px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(stage.target), 0, 0);
  ctx.restore();
}

function drawFriends(stage) {
  for (const friend of stage.friends) {
    if (friend.collected) continue;
    drawNumberFace(friend.x - cameraX, friend.y, friend.w, friend.h, friend.value, "#ffd166", "#3b2500");
  }
}

function drawPeople(stage) {
  const active = people.filter((person) => person.online || person.sessionId === me?.sessionId);
  for (const person of active) {
    if (person.sessionId === me?.sessionId) continue;
    if (person.worldScene !== WORLD_ID) continue;
    const x = Number.isFinite(person.worldX) ? person.worldX : spawnFor(person).x;
    const y = Number.isFinite(person.worldY) ? person.worldY : 410;
    const w = 32;
    const h = 42;
    drawFace(x - cameraX, y, w, h, person, false);
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(person.nickname, x - cameraX + w / 2, y - 8);
  }
}

function drawPlayer() {
  drawFace(player.x - cameraX, player.y, player.w, player.h, me, true);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${me?.nickname || "Tú"} · ${player.total}`, player.x - cameraX + player.w / 2, player.y - 8);
}

function firePower() {
  if (!me || gameState !== "playing") return;
  projectiles.push({
    x: player.x + player.w + 2,
    y: player.y + player.h / 2 - 4,
    vx: 720,
    color: me.stageColor || "blue",
    ownerSessionId: me.sessionId,
  });
}

function applyDamage(target, shot) {
  const same = String(shot.color) === String(target.stageColor);
  const nextHp = clamp(Number(target.hp ?? 10) + (same ? 1 : -1), 0, 10);
  target.hp = nextHp;
  if (target.sessionId === me?.sessionId) {
    me = { ...me, hp: nextHp };
  } else {
    const index = people.findIndex((item) => item.sessionId === target.sessionId);
    if (index !== -1) people[index] = { ...people[index], hp: nextHp };
  }
  return same;
}

function updateProjectiles(dt) {
  const activeTargets = people.filter((person) => person.online || person.sessionId === me?.sessionId);
  projectiles = projectiles.filter((shot) => {
    shot.x += shot.vx * dt;
    const shotBox = { x: shot.x, y: shot.y, w: 22, h: 8 };
    const target = activeTargets.find((person) => {
      if (person.sessionId === shot.ownerSessionId) return false;
      if (person.worldScene !== WORLD_ID && person.sessionId !== me?.sessionId) return false;
      const px = person.sessionId === me?.sessionId ? player.x : (Number.isFinite(person.worldX) ? person.worldX : spawnFor(person).x);
      const py = person.sessionId === me?.sessionId ? player.y : (Number.isFinite(person.worldY) ? person.worldY : spawnFor(person).y);
      return rectsOverlap(shotBox, { x: px, y: py, w: 32, h: 42 });
    });
    if (target) {
      applyDamage(target, shot);
      syncHUD();
      return false;
    }
    return shot.x - cameraX < canvas.width / DPR + 80;
  });
}

function drawHUD(stage) {
  const w = canvas.width / DPR;
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
  roundRect(14, 14, 300, 118, 18, true, "rgba(8, 12, 20, 0.55)");
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Escenario ${stage.index + 1} / ${world.length}`, 18, 32);
  ctx.font = "600 15px Trebuchet MS, sans-serif";
  ctx.fillText(`Suma actual: ${player.total}`, 18, 60);
  ctx.fillText(`Puntos comidos: ${points}`, 18, 82);
  ctx.fillText(`Meta del muro: ${stage.target}`, 18, 104);
  ctx.fillText(`Amigos restantes: ${stage.friends.filter((f) => !f.collected).length}`, 18, 126);
  ctx.restore();

  if (gameState === "won") {
    ctx.save();
    ctx.globalAlpha = 0.88 + Math.sin(performance.now() * 0.008) * 0.08;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(w / 2 - 170, 54, 340, 92, 20, true, "rgba(0,0,0,0.45)");
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 30px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("¡Mundo Numberblocks 2 completado!", w / 2, 96);
    ctx.font = "600 16px Trebuchet MS, sans-serif";
    ctx.fillText("Llegaste al final con las caras online.", w / 2, 124);
    ctx.restore();
  }
}

function render() {
  const stage = currentStageData();
  drawBackground(stage);
  drawPlatforms(stage);
  drawGate(stage);
  drawFriends(stage);
  drawPeople(stage);
  drawProjectiles();
  drawPlayer();
  drawHUD(stage);
  if (gameState !== "playing") {
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${winFlash})`;
    ctx.fillRect(0, 0, canvas.width / DPR, canvas.height / DPR);
    ctx.restore();
  }
}

function updatePresence(online = true) {
  if (!me) return Promise.resolve();
  return setPresenceHeartbeat(me, {
    online,
    path: location.pathname,
    worldScene: WORLD_ID,
    worldX: player.x,
    worldY: player.y,
    worldUpdatedAt: Date.now(),
    stageColor: me.stageColor,
    hp: Number(me.hp ?? 10),
  });
}

function selectedAtPlayer() {
  const near = people.find((person) => person.sessionId !== me?.sessionId && person.worldScene === WORLD_ID && Math.abs((person.worldX ?? -999) - player.x) < 60 && Math.abs((person.worldY ?? -999) - player.y) < 60);
  selectedSessionId = near?.sessionId || "";
}

function nearestTarget() {
  return people.find((person) => person.sessionId !== me?.sessionId && person.worldScene === WORLD_ID && Math.abs((person.worldX ?? -999) - player.x) < 140 && Math.abs((person.worldY ?? -999) - player.y) < 80);
}

function fireAtNearest() {
  const target = nearestTarget();
  if (target) selectedSessionId = target.sessionId;
  firePower();
}

function bootPeople() {
  peopleUnsub = listActivePeople((list) => {
    people = list;
    selectedAtPlayer();
    syncHUD();
  });
}

async function setPresence() {
  await updatePresence(true);
  syncHUD();
}

function loop(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  selectedAtPlayer();
  syncHUD();
  render();
  requestAnimationFrame(loop);
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * DPR));
  canvas.height = Math.max(1, Math.floor(rect.height * DPR));
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "KeyR") resetGame();
  if (e.code === "KeyF" || e.code === "KeyJ") fireAtNearest();
  if (["ArrowUp", "Space", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyW"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

document.querySelectorAll("[data-action], [data-reset]").forEach((button) => {
  if (button.hasAttribute("data-reset")) {
    button.addEventListener("pointerdown", () => resetGame());
    return;
  }
  const action = button.dataset.action;
  const down = () => {
    mobile[action] = true;
    if (action === "jump") setTimeout(() => (mobile.jump = false), 120);
  };
  const up = () => { mobile[action] = false; };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointerleave", up);
  button.addEventListener("pointercancel", up);
});

document.querySelector("[data-fire]")?.addEventListener("pointerdown", () => fireAtNearest());

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  mobile.jump = true;
  setTimeout(() => (mobile.jump = false), 120);
});

async function bootstrap() {
  me = await bootstrapProfile();
  const spawn = spawnFor(me);
  player.x = spawn.x;
  player.y = spawn.y;
  resetGame();
  syncCurrentColor(true);
  bootPeople();
  onProfileChange((profile) => {
    me = profile;
    syncCurrentColor(true);
    syncHUD();
  });
  heartbeatTimer = window.setInterval(() => {
    updatePresence(true).catch(() => {});
  }, 1400);
  await setPresence();
  window.addEventListener("beforeunload", () => {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    peopleUnsub?.();
    updatePresence(false).catch(() => {});
  });
  resize();
  requestAnimationFrame(loop);
}

bootstrap().catch((error) => {
  console.error(error);
  subtitleEl.textContent = "No se pudo cargar Mundo Numberblocks 2.";
});
