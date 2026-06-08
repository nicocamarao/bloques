import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  setPresenceHeartbeat,
} from "../../shared/social.js";
import { blockForNumber } from "../../shared/numberblocks.js";

const WORLD_ID = "mundo-fiuma-2";
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 760;
const GROUND_Y = 612;
const GRAVITY = 2200;
const MOVE_SPEED = 320;
const JUMP_SPEED = 760;
const CLIMB_SPEED = 240;
const PLAYER_W = 36;
const PLAYER_H = 86;

const canvas = document.getElementById("fiuma2-board");
const ctx = canvas.getContext("2d");
const countEl = document.getElementById("fiuma2-count");
const posEl = document.getElementById("fiuma2-pos");
const selectedEl = document.getElementById("fiuma2-selected");
const popup = document.getElementById("fiuma2-popup");
const popupAvatar = document.getElementById("fiuma2-popup-avatar");
const popupName = document.getElementById("fiuma2-popup-name");
const popupMeta = document.getElementById("fiuma2-popup-meta");
const popupChat = document.getElementById("fiuma2-popup-chat");
const popupClose = document.getElementById("fiuma2-popup-close");
const boardWrap = document.getElementById("fiuma2-world");
const moveButtons = Array.from(document.querySelectorAll("[data-move]"));
const centerButton = document.querySelector("[data-center]");
const controls = document.getElementById("fiuma2-controls");

const avatarCache = new Map();
const landings = [
  { x: 120, y: GROUND_Y - PLAYER_H },
  { x: 390, y: 520 - PLAYER_H },
  { x: 640, y: 460 - PLAYER_H },
  { x: 920, y: 390 - PLAYER_H },
  { x: 1260, y: 540 - PLAYER_H },
  { x: 1580, y: 470 - PLAYER_H },
  { x: 1900, y: 380 - PLAYER_H },
  { x: 2220, y: 500 - PLAYER_H },
  { x: 2580, y: 430 - PLAYER_H },
  { x: 2940, y: 360 - PLAYER_H },
];

const platforms = [
  { x: 0, y: GROUND_Y, w: WORLD_WIDTH, h: WORLD_HEIGHT - GROUND_Y },
  { x: 240, y: 520, w: 260, h: 18 },
  { x: 560, y: 460, w: 300, h: 18 },
  { x: 880, y: 390, w: 180, h: 18 },
  { x: 1160, y: 540, w: 260, h: 18 },
  { x: 1520, y: 470, w: 280, h: 18 },
  { x: 1860, y: 380, w: 320, h: 18 },
  { x: 2260, y: 500, w: 260, h: 18 },
  { x: 2600, y: 430, w: 260, h: 18 },
  { x: 2900, y: 360, w: 220, h: 18 },
];

const ladders = [
  { x: 660, y: 460, h: 150 },
  { x: 1645, y: 470, h: 140 },
  { x: 2010, y: 380, h: 230 },
  { x: 2340, y: 430, h: 100 },
  { x: 2695, y: 430, h: 100 },
];

const state = {
  me: null,
  people: [],
  mePos: { x: landings[0].x, y: landings[0].y },
  vx: 0,
  vy: 0,
  onGround: true,
  climbing: false,
  cameraX: 0,
  positionInitialized: false,
  popupSessionId: "",
  lastSyncAt: 0,
  mobile: { left: false, right: false, up: false, down: false },
};

let peopleUnsub = null;
let syncTimer = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash >>> 0;
}

function avatarFallback(name) {
  const initials = String(name || "F").slice(0, 2).toUpperCase();
  const hue = hashString(name || "fiuma2") % 360;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},72%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 30) % 360},78%,44%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="18" fill="url(#g)"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="800" fill="white">${initials}</text>
    </svg>
  `)}`;
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

function colorFor(person) {
  const hue = hashString(person?.normalized || person?.sessionId || person?.nickname || "fiuma2") % 360;
  return `hsl(${hue}, 78%, 56%)`;
}

function blockAvatar(person) {
  const value = (hashString(person?.normalized || person?.nickname || person?.sessionId || "fiuma2") % 12) + 1;
  return blockForNumber(value).src;
}

function scenePeople() {
  return state.people.filter((person) => (person.online || person.sessionId === state.me?.sessionId) && (person.sessionId === state.me?.sessionId || person.worldScene === WORLD_ID));
}

function spawnFor(person) {
  const hash = hashString(person?.normalized || person?.sessionId || "fiuma2");
  return landings[hash % landings.length];
}

function playerPosition(person) {
  if (person.sessionId === state.me?.sessionId) return state.mePos;
  if (person.worldScene === WORLD_ID && Number.isFinite(person.worldX) && Number.isFinite(person.worldY)) {
    return {
      x: clamp(Number(person.worldX), 0, WORLD_WIDTH - PLAYER_W),
      y: clamp(Number(person.worldY), 0, GROUND_Y - PLAYER_H),
    };
  }
  return spawnFor(person);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function worldRects() {
  return platforms;
}

function ladderAt(box) {
  return ladders.find((ladder) => rectsOverlap(box, { x: ladder.x, y: ladder.y, w: 24, h: ladder.h })) || null;
}

function inputState() {
  return {
    left: state.mobile.left,
    right: state.mobile.right,
    up: state.mobile.up,
    down: state.mobile.down,
  };
}

function syncStatus() {
  const people = scenePeople().filter((person) => person.online);
  if (countEl) countEl.textContent = `${people.length} conectados`;
  if (posEl) posEl.textContent = `x:${Math.round(state.mePos.x)} y:${Math.round(state.mePos.y)}`;
  if (selectedEl) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    selectedEl.textContent = selected ? selected.nickname : "Nadie seleccionado";
  }
}

function centerCamera() {
  const viewWidth = canvas.width / Math.max(1, (window.devicePixelRatio || 1));
  state.cameraX = clamp(state.mePos.x + PLAYER_W / 2 - viewWidth * 0.38, 0, WORLD_WIDTH - viewWidth);
}

function currentViewWidth() {
  return canvas.width / Math.max(1, (window.devicePixelRatio || 1));
}

function showPopup(person) {
  if (!popup) return;
  state.popupSessionId = person.sessionId;
  syncPopup(person);
}

function hidePopup() {
  state.popupSessionId = "";
  if (popup) popup.hidden = true;
  syncStatus();
}

function openConversation(person) {
  if (!person) return;
  window.openPlatformConversation?.({
    kind: person.sessionId === state.me?.sessionId ? "self" : "direct",
    peer: person,
  });
}

function syncPopup(person = state.people.find((item) => item.sessionId === state.popupSessionId)) {
  if (!popup || !person) return;
  const pos = playerPosition(person);
  const screenX = pos.x - state.cameraX + PLAYER_W / 2;
  const screenY = pos.y - 10;
  const wrapRect = boardWrap.getBoundingClientRect();
  popup.hidden = false;
  popup.style.left = `${clamp(screenX, 52, wrapRect.width - 52)}px`;
  popup.style.top = `${clamp(screenY, 70, wrapRect.height - 18)}px`;
  popupAvatar.src = person.photoDataUrl || blockAvatar(person);
  popupName.textContent = person.sessionId === state.me?.sessionId ? `${person.nickname} (tú)` : person.nickname;
  popupMeta.textContent = person.sessionId === state.me?.sessionId ? "Tu personaje" : person.online ? "En linea" : "Visto hace poco";
  popupChat.textContent = person.sessionId === state.me?.sessionId ? "Abrir contigo mismo" : "Chatear";
}

function updatePresenceThrottle(force = false) {
  const now = Date.now();
  if (!state.me) return;
  if (!force && now - state.lastSyncAt < 260) return;
  state.lastSyncAt = now;
  setPresenceHeartbeat(state.me, {
    path: location.pathname,
    worldScene: WORLD_ID,
    worldX: state.mePos.x,
    worldY: state.mePos.y,
    worldUpdatedAt: now,
  }).catch(() => {});
}

function moveViewportTowardPlayer() {
  const viewWidth = currentViewWidth();
  const target = clamp(state.mePos.x + PLAYER_W / 2 - viewWidth * 0.38, 0, WORLD_WIDTH - viewWidth);
  state.cameraX += (target - state.cameraX) * 0.14;
}

function applyHorizontal(dt, left, right) {
  if (left && !right) {
    state.vx = -MOVE_SPEED;
  } else if (right && !left) {
    state.vx = MOVE_SPEED;
  } else {
    state.vx *= state.onGround ? 0.82 : 0.94;
  }
  state.mePos.x += state.vx * dt;
}

function applyVertical(dt, climbMode, up, down) {
  if (climbMode) {
    state.vy = 0;
    if (up) state.mePos.y -= CLIMB_SPEED * dt;
    if (down) state.mePos.y += CLIMB_SPEED * dt;
    return;
  }

  state.vy += GRAVITY * dt;
  state.mePos.y += state.vy * dt;
}

function resolveCollisions() {
  const box = { x: state.mePos.x, y: state.mePos.y, w: PLAYER_W, h: PLAYER_H };
  state.onGround = false;

  for (const solid of worldRects()) {
    const currentBox = { x: state.mePos.x, y: state.mePos.y, w: PLAYER_W, h: PLAYER_H };
    if (!rectsOverlap(currentBox, solid)) continue;
    if (state.vy > 0) {
      state.mePos.y = solid.y - PLAYER_H - 0.1;
      state.vy = 0;
      state.onGround = true;
    } else if (state.vy < 0) {
      state.mePos.y = solid.y + solid.h + 0.1;
      state.vy = 0;
    }
    if (state.vx > 0) {
      state.mePos.x = solid.x - PLAYER_W - 0.1;
    } else if (state.vx < 0) {
      state.mePos.x = solid.x + solid.w + 0.1;
    }
    state.vx = 0;
  }

  state.mePos.x = clamp(state.mePos.x, 0, WORLD_WIDTH - PLAYER_W);
  state.mePos.y = clamp(state.mePos.y, -40, GROUND_Y - PLAYER_H);
}

function update(dt) {
  const { left, right, up, down } = inputState();
  const box = { x: state.mePos.x, y: state.mePos.y, w: PLAYER_W, h: PLAYER_H };
  const ladder = ladderAt(box);
  const climbMode = Boolean(ladder && (up || down));
  state.climbing = climbMode;

  if (up && !state.upLatch && !climbMode && state.onGround) {
    state.vy = -JUMP_SPEED;
    state.onGround = false;
    state.upLatch = true;
  }
  if (!up) state.upLatch = false;

  if (climbMode) {
    state.vx *= 0.9;
    state.mePos.x = clamp(ladder.x + 12 - PLAYER_W / 2, 0, WORLD_WIDTH - PLAYER_W);
    applyVertical(dt, true, up, down);
  } else {
    applyHorizontal(dt, left, right);
    applyVertical(dt, false, up, down);
    resolveCollisions();
  }

  state.mePos.x = clamp(state.mePos.x, 0, WORLD_WIDTH - PLAYER_W);
  state.mePos.y = clamp(state.mePos.y, -40, GROUND_Y - PLAYER_H);

  if (state.me) updatePresenceThrottle(false);
  if (state.popupSessionId) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) syncPopup(selected);
  }
  moveViewportTowardPlayer();
  syncStatus();
}

function drawBackground() {
  const w = currentViewWidth();
  const h = canvas.height / Math.max(1, (window.devicePixelRatio || 1));
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#263453");
  gradient.addColorStop(0.55, "#151b2a");
  gradient.addColorStop(1, "#0d111a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(-state.cameraX * 0.22, 0);
  for (let i = 0; i < 18; i += 1) {
    const x = i * 240 + 80;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 4) * 0.015})`;
    ctx.beginPath();
    ctx.ellipse(x, 104 + (i % 5) * 10, 92, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWorld() {
  const w = currentViewWidth();
  const h = canvas.height / Math.max(1, (window.devicePixelRatio || 1));

  drawBackground();

  ctx.save();
  ctx.translate(-state.cameraX, 0);

  ctx.fillStyle = "#1b2333";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#2d394d";
  ctx.fillRect(0, GROUND_Y - 10, WORLD_WIDTH, 10);

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 22; i += 1) {
    const x = i * 180 + 60;
    ctx.fillStyle = i % 3 === 0 ? "#7ca8ff" : i % 3 === 1 ? "#63e6be" : "#ffd166";
    roundRect(x, 150 + (i % 4) * 28, 34, 34, 10, true);
  }
  ctx.restore();

  for (const platform of platforms.slice(1)) {
    ctx.fillStyle = "#34425a";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(platform.x, platform.y, platform.w, 4);
  }

  for (const ladder of ladders) {
    ctx.fillStyle = "rgba(99,230,190,0.24)";
    ctx.fillRect(ladder.x + 10, ladder.y, 4, ladder.h);
    ctx.fillRect(ladder.x + 2, ladder.y + 8, 20, 4);
    ctx.fillRect(ladder.x + 2, ladder.y + 34, 20, 4);
    ctx.fillRect(ladder.x + 2, ladder.y + 60, 20, 4);
  }

  const visible = scenePeople();
  for (const person of visible) {
    drawCharacter(person);
  }

  ctx.restore();

  if (state.popupSessionId) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) syncPopup(selected);
  }

  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.56)";
  ctx.fillRect(14, 14, 310, 104);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Mundo Fiuma 2", 26, 42);
  ctx.font = "600 15px Trebuchet MS, sans-serif";
  ctx.fillText(`Escena: ${WORLD_ID}`, 26, 68);
  ctx.fillText(`Toca un personaje para chatear`, 26, 92);
  ctx.restore();

  if (state.me) {
    updatePresenceThrottle(false);
  }
}

function drawCharacter(person) {
  const pos = playerPosition(person);
  const screenX = pos.x;
  const screenY = pos.y;
  const isMe = person.sessionId === state.me?.sessionId;
  const name = isMe ? `${person.nickname} (tú)` : person.nickname;
  const blockValue = (hashString(person?.normalized || person?.nickname || person?.sessionId || "fiuma2") % 12) + 1;
  const blockW = 46;
  const blockH = 56;
  const blockX = screenX - 5;
  const blockY = screenY + 18;
  const icon = avatarImage(person.photoDataUrl || blockAvatar(person));
  const labelY = blockY - 10;

  ctx.save();
  ctx.translate(-1, 0);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 12px Trebuchet MS, sans-serif";
  ctx.fillText(name, blockX + blockW / 2, labelY);

  ctx.shadowColor = "rgba(0,0,0,0.26)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(blockX + 3, blockY + 4, blockW, blockH, 14, true);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = isMe ? "#5ad7ff" : colorFor(person);
  roundRect(blockX, blockY, blockW, blockH, 14, true);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundRect(blockX + 3, blockY + 3, blockW - 6, 10, 8, true);

  if (icon?.complete && icon.naturalWidth) {
    ctx.save();
    roundRect(blockX + 4, blockY + 6, blockW - 8, blockH - 10, 12, false);
    ctx.clip();
    ctx.drawImage(icon, blockX + 4, blockY + 6, blockW - 8, blockH - 10);
    ctx.restore();
  } else {
    ctx.fillStyle = "#fff";
    ctx.font = "800 16px Trebuchet MS, sans-serif";
    ctx.fillText(String(blockValue), blockX + blockW / 2, blockY + blockH / 2 + 6);
  }

  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.beginPath();
  ctx.arc(blockX + 13, blockY + 18, 2.5, 0, Math.PI * 2);
  ctx.arc(blockX + 31, blockY + 18, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function roundRect(x, y, w, h, r, fill = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
  if (fill) ctx.fill();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * (window.devicePixelRatio || 1)));
  canvas.height = Math.max(1, Math.floor(rect.height * (window.devicePixelRatio || 1)));
  ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
}

function pointerToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left + state.cameraX,
    y: event.clientY - rect.top,
  };
}

function handleBoardPointer(event) {
  const point = pointerToWorld(event);
  const clicked = scenePeople()
    .map((person) => ({ person, box: { x: playerPosition(person).x, y: playerPosition(person).y, w: PLAYER_W, h: PLAYER_H } }))
    .find(({ box }) => rectsOverlap({ x: point.x, y: point.y, w: 2, h: 2 }, box));

  if (!clicked) {
    hidePopup();
    return;
  }

  showPopup(clicked.person);
}

function bindControls() {
  moveButtons.forEach((button) => {
    const dir = button.dataset.move;
    const press = () => {
      state.mobile[dir] = true;
      if (dir === "up" || dir === "down") setTimeout(() => (state.mobile[dir] = false), 120);
    };
    const release = () => {
      state.mobile[dir] = false;
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      press();
    });
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  });

  centerButton?.addEventListener("click", () => {
    centerCamera();
    hidePopup();
  });

  popupClose?.addEventListener("click", hidePopup);
  popupChat?.addEventListener("click", () => {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) openConversation(selected);
  });

  canvas.addEventListener("pointerdown", (event) => {
    handleBoardPointer(event);
    canvas.setPointerCapture?.(event.pointerId);
  });
}

function bindMobileJumpLinks() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const target = document.querySelector(location.hash || "#fiuma2-world");
  if (target) {
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "smooth" }));
  } else {
    window.requestAnimationFrame(() => document.getElementById("fiuma2-world")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = window.setInterval(() => {
    if (state.me) updatePresenceThrottle(true);
  }, 30000);
}

async function bootstrap() {
  bindControls();
  resize();
  centerCamera();
  bindMobileJumpLinks();

  state.me = await bootstrapProfile();
  state.mePos = { ...landings[0] };
  state.positionInitialized = false;

  peopleUnsub = listActivePeople((people) => {
    state.people = people;
    if (!state.positionInitialized) {
      const liveMe = people.find((person) => person.sessionId === state.me?.sessionId);
      if (liveMe && liveMe.worldScene === WORLD_ID && Number.isFinite(liveMe.worldX) && Number.isFinite(liveMe.worldY)) {
        state.mePos = {
          x: clamp(Number(liveMe.worldX), 0, WORLD_WIDTH - PLAYER_W),
          y: clamp(Number(liveMe.worldY), 0, GROUND_Y - PLAYER_H),
        };
        state.positionInitialized = true;
      }
    }
    syncStatus();
  });

  onProfileChange((profile) => {
    state.me = profile;
  });

  updatePresenceThrottle(true);
  scheduleSync();

  window.addEventListener("resize", () => {
    resize();
    centerCamera();
  });

  window.addEventListener("beforeunload", () => {
    if (peopleUnsub) peopleUnsub();
    if (syncTimer) window.clearInterval(syncTimer);
    if (state.me) {
      setPresenceHeartbeat(state.me, {
        online: false,
        path: location.pathname,
        worldScene: WORLD_ID,
        worldX: state.mePos.x,
        worldY: state.mePos.y,
        worldUpdatedAt: Date.now(),
      }).catch(() => {});
    }
  });

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.032, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    update(dt);
    drawWorld();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function update(dt) {
  const { left, right, up, down } = inputState();
  const box = { x: state.mePos.x, y: state.mePos.y, w: PLAYER_W, h: PLAYER_H };
  const ladder = ladderAt(box);
  const climbMode = Boolean(ladder && (up || down));
  state.climbing = climbMode;

  if (up && !state.upLatch && !climbMode && state.onGround) {
    state.vy = -JUMP_SPEED;
    state.onGround = false;
    state.upLatch = true;
  }
  if (!up) state.upLatch = false;

  if (climbMode) {
    state.vx *= 0.9;
    state.vy = 0;
    state.mePos.x = clamp(ladder.x + 12 - PLAYER_W / 2, 0, WORLD_WIDTH - PLAYER_W);
    if (up) state.mePos.y -= CLIMB_SPEED * dt;
    if (down) state.mePos.y += CLIMB_SPEED * dt;
  } else {
    applyHorizontal(dt, left, right);
    applyVertical(dt, false, up, down);
    resolveCollisions();
  }

  state.mePos.x = clamp(state.mePos.x, 0, WORLD_WIDTH - PLAYER_W);
  state.mePos.y = clamp(state.mePos.y, -40, GROUND_Y - PLAYER_H);

  if (state.popupSessionId) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) {
      syncPopup(selected);
    } else {
      hidePopup();
    }
  }
}

bootstrap().catch((error) => {
  console.error(error);
});
