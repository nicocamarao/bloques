import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  recordScore,
  setPresenceHeartbeat,
} from "../../shared/social.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("nb3-score");
const countEl = document.getElementById("nb3-count");
const stageEl = document.getElementById("nb3-stage");
const selectedEl = document.getElementById("nb3-selected");
const subtitleEl = document.getElementById("nb3-subtitle");
const unlockControls = document.getElementById("nb3-unlocks");
const characterSelect = document.getElementById("nb3-character");
const petToggle = document.getElementById("nb3-pet");

const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
const WORLD_HEIGHT = 540;
const GRAVITY = 2200;
const MOVE_SPEED = 320;
const JUMP_SPEED = 760;
const PLAYER_BASE = 24;
const PLAYER_H = 49;
const LEVEL_LENGTH = 1200;
const GATE_WIDTH = 26;
const WORLD_ID = "mundo-numberblocks-3";
const TOTAL_STAGES = 30;
const PLAYER_SCREEN_X = 180;
const ITEM_COLORS = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan", "lime", "gold"];
const ITEM_STYLES = {
  red: { fill: "#ff5c7a", band: "#ffd1da", glow: "rgba(255, 92, 122, 0.35)", label: "roja" },
  blue: { fill: "#5ad7ff", band: "#d5f6ff", glow: "rgba(90, 215, 255, 0.35)", label: "azul" },
  green: { fill: "#62e6a2", band: "#c6f6dd", glow: "rgba(98, 230, 162, 0.35)", label: "verde" },
  yellow: { fill: "#ffd166", band: "#fff0bf", glow: "rgba(255, 209, 102, 0.35)", label: "amarilla" },
  purple: { fill: "#b197fc", band: "#e5dbff", glow: "rgba(177, 151, 252, 0.35)", label: "violeta" },
  orange: { fill: "#ff9f43", band: "#ffd8a8", glow: "rgba(255, 159, 67, 0.35)", label: "naranja" },
  pink: { fill: "#ff87c8", band: "#ffd6eb", glow: "rgba(255, 135, 200, 0.35)", label: "rosa" },
  cyan: { fill: "#63e6be", band: "#c3fae8", glow: "rgba(99, 230, 190, 0.35)", label: "cian" },
  lime: { fill: "#a9e34b", band: "#e9fac8", glow: "rgba(169, 227, 75, 0.35)", label: "lima" },
  gold: { fill: "#f59f00", band: "#ffe8a3", glow: "rgba(245, 159, 0, 0.35)", label: "dorada" },
};
const SPRITE_SRC = new URL("./character.png", import.meta.url).href;
const PLAYER_SPRITES = {
  mira: SPRITE_SRC,
  zoey: new URL("./zoey.png", import.meta.url).href,
  rumi: new URL("./rumi.png", import.meta.url).href,
};
const STORY_SPRITES = {
  jinu: new URL("./jinu.png", import.meta.url).href,
  saja: new URL("./saja-boys.png", import.meta.url).href,
  demon: new URL("./demon.png", import.meta.url).href,
  honmoon: new URL("./honmoon.png", import.meta.url).href,
  mascota: new URL("./mascota.png", import.meta.url).href,
};

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
let inventory = { keys: {}, chestsOpen: {} };
let playerForm = "mira";
let dialogue = null;
let petUnlocked = false;
let newGamePlus = false;
let finishStartedAt = 0;
const sprites = {};
const avatarCache = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function avatarFallback(name) {
  const initials = String(name || "N").slice(0, 2).toUpperCase();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <rect width="80" height="80" rx="24" fill="#2c3550"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="white">${initials}</text>
    </svg>
  `)}`;
}

function avatarImage(src) {
  if (!src) return null;
  if (!avatarCache.has(src)) {
    const img = new Image();
    img.src = src;
    avatarCache.set(src, img);
  }
  return avatarCache.get(src);
}

function loadSprites() {
  Object.entries({ ...PLAYER_SPRITES, ...STORY_SPRITES }).forEach(([name, src]) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    sprites[name] = image;
  });
}

function colorStyle(color) {
  return ITEM_STYLES[color] || ITEM_STYLES.red;
}

function stageColor(index) {
  return ITEM_COLORS[Math.floor(index / 2) % ITEM_COLORS.length];
}

function pairForStage() {
  const first = 1 + Math.floor(Math.random() * 9);
  const second = 10 - first;
  return Math.random() < 0.5 ? [first, second] : [second, first];
}

function spawnFor(person) {
  const hash = Array.from(String(person?.sessionId || person?.nickname || "f")).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return { x: (hash % 160) + 40, y: 410 };
}

function stageData() {
  return world[currentStage];
}

function makeStage(index) {
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
  ];
  const [a, b] = pairForStage();
  const color = stageColor(index);
  const stage = {
    index,
    target: (index + 1) * 10,
    baseX,
    groundY,
    gateX,
    platforms,
    gateOpen: false,
    completed: false,
    friends: [
      { x: friendLayout[0].x, y: friendLayout[0].y, w: 32, h: 40, value: a, collected: false },
      { x: friendLayout[1].x, y: friendLayout[1].y, w: 32, h: 40, value: b, collected: false },
    ],
  };
  if (index >= 9) {
    const secondColor = ITEM_COLORS[(ITEM_COLORS.indexOf(color) + 1) % ITEM_COLORS.length];
    stage.keys = [
      { color, x: baseX + 230, y: groundY - 40, opened: false },
      { color: secondColor, x: baseX + 500, y: 246, opened: false },
    ];
    stage.chests = [
      { color, x: baseX + 690, y: 408, opened: false },
      { color: secondColor, x: baseX + 930, y: 408, opened: false },
    ];
  } else if (index % 2 === 0) {
    stage.key = { color, x: baseX + 180, y: groundY - 40, opened: false };
  } else {
    stage.chest = { color, x: baseX + 260, y: 408, opened: false };
  }
  if (index === 4) stage.npc = { name: "Jinu", sprite: "jinu", x: baseX + 720, y: 276, w: 92, h: 148, message: "Hola Mira, ahora puedes jugar como Zoey.", form: "zoey", triggered: false };
  if (index === 9) stage.npc = { name: "Saja Boys", sprite: "saja", x: baseX + 690, y: 268, w: 150, h: 128, message: "Hola Zoey, ahora puedes jugar como Rumi!", form: "rumi", triggered: false };
  return stage;
}

function buildWorld() {
  world.length = 0;
  for (let i = 0; i < TOTAL_STAGES; i += 1) world.push(makeStage(i));
}

function enterStage(index, entrySide = "left") {
  currentStage = clamp(index, 0, Math.max(0, world.length - 1));
  const stage = currentStageData();
  const groundY = stage?.groundY ?? 458;
  player.x = entrySide === "right"
    ? stage.gateX - player.w - 32
    : stage.baseX + PLAYER_SCREEN_X;
  player.y = groundY - player.h - 1;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player._jumpLatch = false;
  cameraX = player.x - PLAYER_SCREEN_X;
  stage.gateOpen = false;
}

function syncHUD() {
  const active = people.filter((p) => p.online || p.sessionId === me?.sessionId).length;
  countEl.textContent = `${active} online`;
  scoreEl.textContent = `Puntos: ${points}`;
  stageEl.textContent = `Escenario ${currentStage + 1} / ${world.length}`;
  const selected = people.find((p) => p.sessionId === selectedSessionId);
  selectedEl.textContent = selected ? `Cerca: ${selected.nickname}` : "Nadie cerca";
  subtitleEl.textContent = selected
    ? `Compartiendo el mismo recorrido con ${selected.nickname}.`
    : "La cámara sigue al personaje mientras avanzás por los muros.";
}

function resetGame(preserveProgress = false) {
  if (!world.length) buildWorld();
  gameState = "playing";
  winFlash = 0;
  startTime = performance.now();
  player = {
    x: PLAYER_SCREEN_X,
    y: 410,
    w: PLAYER_BASE,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    total: 0,
    onGround: true,
    _jumpLatch: false,
  };
  if (!preserveProgress) {
    points = 0;
    inventory = { keys: {}, chestsOpen: {} };
    playerForm = "mira";
    petUnlocked = false;
    buildWorld();
  }
  enterStage(0);
  dialogue = preserveProgress ? null : {
    name: "Misión",
    message: "Derrota a los demonios y Recupera los Honmoon",
    startedAt: performance.now(),
    changed: false,
  };
  if (preserveProgress && stageData()) stageData().gateOpen = false;
  syncHUD();
}

function startUnlockedRun() {
  if (!newGamePlus && characterSelect) characterSelect.value = playerForm;
  const selectedForm = characterSelect?.value || playerForm;
  const petEnabled = petToggle?.checked ?? true;
  points = 0;
  inventory = { keys: {}, chestsOpen: {} };
  buildWorld();
  world.forEach((stage) => {
    if (stage.npc) stage.npc.triggered = true;
  });
  player = {
    x: PLAYER_SCREEN_X,
    y: 410,
    w: PLAYER_BASE,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    total: 0,
    onGround: true,
    _jumpLatch: false,
  };
  newGamePlus = true;
  gameState = "playing";
  dialogue = null;
  playerForm = selectedForm;
  petUnlocked = petEnabled;
  unlockControls.hidden = false;
  enterStage(0);
  syncHUD();
}

function currentStageData() {
  return world[currentStage];
}

function isGateSatisfied(stage) {
  return player.total === stage.target;
}

function openGateIfReady(stage) {
  if (stage.completed) {
    stage.gateOpen = true;
    return;
  }
  const requiredChests = stage.chests || (stage.chest ? [stage.chest] : []);
  if (requiredChests.some((chest) => !chest.opened)) {
    stage.gateOpen = false;
    return;
  }
  stage.gateOpen = isGateSatisfied(stage);
}

function getInput() {
  return {
    left: keys.has("ArrowLeft") || keys.has("KeyA") || mobile.left,
    right: keys.has("ArrowRight") || keys.has("KeyD") || mobile.right,
    jumpPressed: keys.has("ArrowUp") || keys.has("Space") || keys.has("KeyW") || mobile.jump,
  };
}

function jump() {
  if (player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
  }
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

function stagePlatforms(stage) {
  return [{ x: stage.baseX - 1000, y: stage.groundY, w: 3000, h: 80 }, ...stage.platforms];
}

function moveAndCollide(dt) {
  player.x += player.vx * dt;
  resolveHorizontal();
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  player.onGround = false;
  resolveVertical();
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
      recordScore(WORLD_ID, points, { label: "Numberblocks 3", details: `Escenario ${currentStage + 1}` }).catch(() => {});
    }
  }
}

function pickupSpecialItems() {
  const stage = currentStageData();
  const body = { x: player.x - 2, y: player.y - 4, w: player.w + 4, h: player.h + 8 };
  const keysInStage = stage.keys || (stage.key ? [stage.key] : []);
  const chestsInStage = stage.chests || (stage.chest ? [stage.chest] : []);
  for (const key of keysInStage) {
    if (key.opened) continue;
    const keyBody = { x: key.x - 8, y: key.y - 8, w: 48, h: 48 };
    if (rectsOverlap(body, keyBody)) {
      key.opened = true;
      inventory.keys[key.color] = true;
      points += 5;
      syncHUD();
    }
  }
  for (const chest of chestsInStage) {
    if (chest.opened) continue;
    const chestBody = { x: chest.x - 8, y: chest.y - 8, w: 56, h: 44 };
    if (rectsOverlap(body, chestBody) && inventory.keys[chest.color]) {
      chest.opened = true;
      inventory.chestsOpen[chest.color] = true;
      points += 10;
      syncHUD();
    }
  }
}

function triggerStory(stage) {
  const npc = stage.npc;
  if (!npc || npc.triggered || dialogue) return;
  const playerBody = { x: player.x, y: player.y, w: player.w, h: player.h };
  const npcBody = { x: npc.x - 30, y: npc.y - 20, w: npc.w + 60, h: npc.h + 40 };
  if (!rectsOverlap(playerBody, npcBody)) return;
  npc.triggered = true;
  dialogue = { ...npc, startedAt: performance.now(), changed: false };
}

function updateDialogue(now) {
  if (!dialogue) return;
  const typed = Math.floor((now - dialogue.startedAt) / 34);
  if (typed >= dialogue.message.length && !dialogue.changed) {
    if (dialogue.form) playerForm = dialogue.form;
    dialogue.changed = true;
  }
  if (typed >= dialogue.message.length && now - dialogue.startedAt > dialogue.message.length * 34 + 1400) dialogue = null;
}

function advanceStageIfNeeded() {
  const stage = currentStageData();
  openGateIfReady(stage);
  if (stage.gateOpen && player.x + player.w > stage.gateX + GATE_WIDTH + 8) {
    stage.completed = true;
    if (stage.target === 200) petUnlocked = true;
    currentStage += 1;
    if (currentStage >= world.length) {
      gameState = "finishing";
      finishStartedAt = performance.now();
      winFlash = 1;
      currentStage = world.length - 1;
      const score = Math.max(0, 8000 - Math.floor((performance.now() - startTime) / 8) + points * 100);
      recordScore(WORLD_ID, score, { label: "Mundo Numberblocks 3" }).catch(() => {});
      return;
    }
    enterStage(currentStage);
    syncHUD();
    return;
  }
  if (currentStage > 0 && player.x + player.w < stage.baseX) {
    currentStage -= 1;
    enterStage(currentStage, "right");
    syncHUD();
  }
}

function update(dt) {
  if (gameState !== "playing") {
    if (gameState === "finishing" && performance.now() - finishStartedAt > 2400) startUnlockedRun();
    return;
  }
  updateDialogue(performance.now());
  if (dialogue) return;
  handleMovement(dt);
  moveAndCollide(dt);
  pickupFriends();
  pickupSpecialItems();
  triggerStory(currentStageData());
  advanceStageIfNeeded();
  cameraX = player.x - PLAYER_SCREEN_X;
  if (player.y > WORLD_HEIGHT + 200) {
    if (newGamePlus) startUnlockedRun();
    else resetGame();
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

function drawKey(item) {
  if (!item || item.opened) return;
  const x = item.x - cameraX;
  const image = sprites.demon;
  ctx.save();
  ctx.shadowColor = colorStyle(item.color).glow;
  ctx.shadowBlur = 16;
  if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, x, item.y - 26, 42, 72);
  ctx.restore();
}

function drawChest(item) {
  if (!item || item.opened) return;
  const x = item.x - cameraX;
  const image = sprites.honmoon;
  ctx.save();
  ctx.shadowColor = colorStyle(item.color).glow;
  ctx.shadowBlur = 18;
  if (image?.complete && image.naturalWidth > 0) ctx.drawImage(image, x, item.y - 8, 54, 54);
  ctx.restore();
}

function drawNpc(stage) {
  const npc = stage.npc;
  if (!npc || npc.triggered) return;
  const image = sprites[npc.sprite];
  const x = npc.x - cameraX;
  if (image?.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, x, npc.y, npc.w, npc.h);
  }
  ctx.fillStyle = "#fff";
  ctx.font = "700 14px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(npc.name, x + npc.w / 2, npc.y - 10);
}

function drawPlayer() {
  const x = PLAYER_SCREEN_X;
  const pet = sprites.mascota;
  if (petUnlocked && pet?.complete && pet.naturalWidth > 0) {
    ctx.drawImage(pet, x - 12, player.y + 25, 50, 37);
  }
  const sprite = sprites[playerForm];
  if (sprite?.complete && sprite.naturalWidth > 0) {
    const ratio = sprite.naturalWidth / sprite.naturalHeight;
    const h = playerForm === "mira" ? player.h + 1 : player.h + 17;
    const w = Math.max(player.w, h * ratio);
    const rideOffset = petUnlocked ? 18 : 0;
    ctx.drawImage(sprite, x + (player.w - w) / 2, player.y - (h - player.h) - rideOffset, w, h);
  } else {
    const fallback = avatarImage(me?.photoDataUrl || avatarFallback(me?.nickname || "Tú"));
    if (fallback && fallback.complete && fallback.naturalWidth > 0) {
      ctx.drawImage(fallback, x, player.y, player.w, player.h);
    } else {
      roundRect(x, player.y, player.w, player.h, 12, true, "#5ad7ff");
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${me?.nickname || "Tú"} · ${player.total}`, x + player.w / 2, player.y - 8);
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
    const img = avatarImage(person.photoDataUrl || avatarFallback(person.nickname));
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - cameraX, y, w, h);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(person.nickname, x - cameraX + w / 2, y - 8);
  }
}

function drawHUD(stage) {
  const w = canvas.width / DPR;
  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
  roundRect(14, 14, 340, 142, 18, true, "rgba(8, 12, 20, 0.55)");
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Escenario ${stage.index + 1} / ${world.length}`, 18, 32);
  ctx.font = "600 15px Trebuchet MS, sans-serif";
  ctx.fillText(`Suma actual: ${player.total}`, 18, 60);
  ctx.fillText(`Puntos comidos: ${points}`, 18, 82);
  ctx.fillText(`Meta del muro: ${stage.target}`, 18, 104);
  const stageKeys = stage.keys || (stage.key ? [stage.key] : []);
  const stageChests = stage.chests || (stage.chest ? [stage.chest] : []);
  const specialLabel = stageChests.length
    ? `Honmoon: ${stageChests.filter((chest) => chest.opened).length}/${stageChests.length} recuperados`
    : `Demonio: ${stageKeys[0]?.opened ? "derrotado" : "pendiente"}`;
  ctx.fillText(specialLabel, 18, 126);
  ctx.restore();
}

function drawDialogue() {
  if (!dialogue) return;
  const now = performance.now();
  const typed = Math.floor((now - dialogue.startedAt) / 34);
  const text = dialogue.message.slice(0, typed);
  const w = canvas.width / DPR;
  const h = canvas.height / DPR;
  ctx.save();
  ctx.fillStyle = "rgba(2, 4, 12, 0.68)";
  ctx.fillRect(0, 0, w, h);
  const image = sprites[dialogue.sprite];
  if (image?.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, w - 210, 40, 150, 190);
  }
  roundRect(38, h - 156, w - 76, 112, 18, true, "rgba(12, 18, 36, 0.96)");
  ctx.strokeStyle = "rgba(255, 209, 102, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.font = "800 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(dialogue.name, 58, h - 124);
  ctx.fillStyle = "#fff";
  ctx.font = "600 20px monospace";
  const words = text.split(" ");
  let line = "";
  let lineY = h - 88;
  const maxWidth = w - 116;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      ctx.fillText(line, 58, lineY);
      line = word;
      lineY += 25;
    } else {
      line = candidate;
    }
  }
  if (line) ctx.fillText(line, 58, lineY);
  ctx.restore();
}

function render() {
  const stage = currentStageData();
  drawBackground(stage);
  drawPlatforms(stage);
  drawGate(stage);
  drawFriends(stage);
  (stage.keys || (stage.key ? [stage.key] : [])).forEach(drawKey);
  (stage.chests || (stage.chest ? [stage.chest] : [])).forEach(drawChest);
  drawNpc(stage);
  drawPeople(stage);
  drawPlayer();
  drawHUD(stage);
  drawDialogue();
  if (gameState === "finishing") {
    const w = canvas.width / DPR;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
    ctx.fillRect(0, 0, w, canvas.height / DPR);
    ctx.fillStyle = "#ffd166";
    ctx.font = "900 72px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("FIN", w / 2, 230);
    ctx.fillStyle = "#fff";
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.fillText("Muro 300 superado", w / 2, 266);
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
  });
}

function selectedAtPlayer() {
  const near = people.find((person) => person.sessionId !== me?.sessionId && person.worldScene === WORLD_ID && Math.abs((person.worldX ?? -999) - player.x) < 60 && Math.abs((person.worldY ?? -999) - player.y) < 60);
  selectedSessionId = near?.sessionId || "";
}

function bootPeople() {
  peopleUnsub = listActivePeople((list) => {
    people = list;
    selectedAtPlayer();
    syncHUD();
  });
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
  if (e.code === "KeyR") resetGame(true);
  if (["ArrowUp", "Space", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyW"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));

document.querySelectorAll("[data-action], [data-reset]").forEach((button) => {
  if (button.hasAttribute("data-reset")) {
    button.addEventListener("pointerdown", () => resetGame(true));
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

characterSelect?.addEventListener("change", () => {
  if (newGamePlus && PLAYER_SPRITES[characterSelect.value]) playerForm = characterSelect.value;
});

petToggle?.addEventListener("change", () => {
  if (newGamePlus) petUnlocked = petToggle.checked;
});

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  mobile.jump = true;
  setTimeout(() => (mobile.jump = false), 120);
});

async function bootstrap() {
  me = await bootstrapProfile();
  loadSprites();
  const spawn = spawnFor(me);
  resetGame();
  player.x = spawn.x;
  player.y = stageData().groundY - player.h - 1;
  player.onGround = true;
  cameraX = player.x - PLAYER_SCREEN_X;
  bootPeople();
  onProfileChange((profile) => {
    me = profile;
    syncHUD();
  });
  heartbeatTimer = window.setInterval(() => {
    updatePresence(true).catch(() => {});
  }, 140);
  await updatePresence(true);
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
  subtitleEl.textContent = "No se pudo cargar Mundo Numberblocks 3.";
});
