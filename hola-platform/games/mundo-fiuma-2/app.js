import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  setPresenceHeartbeat,
} from "../../shared/social.js";
import { blockForNumber } from "../../shared/numberblocks.js";

const WORLD_ID = "mundo-fiuma-2";
const WORLD_WIDTH = 480;
const BASE_Y = 640;
const GRAVITY = 2200;
const MOVE_SPEED = 320;
const JUMP_SPEED = 760;
const PLAYER_W = 56;
const PLAYER_H = 56;

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
const resetButton = document.querySelector("[data-reset]");

const avatarCache = new Map();
const towerPlatforms = buildTowerPlatforms();
const bottomSpawns = [
  { x: 118, y: 590 },
  { x: 166, y: 590 },
  { x: 214, y: 590 },
  { x: 262, y: 590 },
  { x: 310, y: 590 },
  { x: 214, y: 546 },
];

const state = {
  me: null,
  people: [],
  mePos: { x: bottomSpawns[2].x, y: bottomSpawns[2].y },
  vx: 0,
  vy: 0,
  onGround: false,
  upLatch: false,
  cameraY: 0,
  positionInitialized: false,
  popupSessionId: "",
  lastSyncAt: 0,
  mobile: { left: false, right: false, jump: false },
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

function blockAvatar(person) {
  const value = (hashString(person?.normalized || person?.nickname || person?.sessionId || "fiuma2") % 12) + 1;
  return blockForNumber(value).src;
}

function colorFor(person) {
  const hue = hashString(person?.normalized || person?.sessionId || person?.nickname || "fiuma2") % 360;
  return `hsl(${hue}, 78%, 56%)`;
}

function buildTowerPlatforms() {
  const platforms = [
    { x: 92, y: BASE_Y, w: 296, h: 18, color: "#546a94", type: "base" },
  ];

  let currentY = BASE_Y - 88;
  for (let i = 0; i < 8; i += 1) {
    const width = i < 3 ? 164 : i < 6 ? 150 : 138;
    let x = i % 2 === 0 ? 48 + i * 18 : 228 - i * 8;
    x = Math.max(28, Math.min(WORLD_WIDTH - width - 28, x));
    platforms.push({
      x,
      y: currentY,
      w: width,
      h: 18,
      color: i % 2 === 0 ? "#6f82b9" : "#516b9a",
      type: "normal",
    });
    currentY -= i < 4 ? 95 : 102;
  }

  return platforms;
}

function scenePeople() {
  return state.people.filter(
    (person) => (person.online || person.sessionId === state.me?.sessionId)
      && (person.sessionId === state.me?.sessionId || person.worldScene === WORLD_ID),
  );
}

function spawnFor(person) {
  const hash = hashString(person?.normalized || person?.sessionId || "fiuma2");
  return bottomSpawns[hash % bottomSpawns.length];
}

function playerPosition(person) {
  if (person.sessionId === state.me?.sessionId) return state.mePos;
  if (person.worldScene === WORLD_ID && Number.isFinite(person.worldX) && Number.isFinite(person.worldY)) {
    return {
      x: clamp(Number(person.worldX), 0, WORLD_WIDTH - PLAYER_W),
      y: clamp(Number(person.worldY), -140, BASE_Y - PLAYER_H),
    };
  }
  return spawnFor(person);
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function currentViewHeight() {
  return canvas.height / Math.max(1, (window.devicePixelRatio || 1));
}

function inputState() {
  return {
    left: state.mobile.left,
    right: state.mobile.right,
    jump: state.mobile.jump,
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
  state.cameraY = Math.min(0, state.mePos.y - 420);
}

function moveViewportTowardPlayer() {
  const target = Math.min(0, state.mePos.y - 420);
  state.cameraY += (target - state.cameraY) * 0.14;
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

  if (window.matchMedia("(max-width: 900px)").matches) {
    const chatPanel = document.getElementById("chat-panel");
    if (chatPanel) {
      chatPanel.scrollIntoView({ block: "start", behavior: "smooth" });
      window.requestAnimationFrame(() => document.getElementById("message-input")?.focus());
      if (location.hash !== "#chat-panel") {
        history.replaceState(null, "", "#chat-panel");
      }
    }
  }
}

function syncPopup(person = state.people.find((item) => item.sessionId === state.popupSessionId)) {
  if (!popup || !person) return;
  const pos = playerPosition(person);
  const screenX = pos.x + PLAYER_W / 2;
  const screenY = pos.y - state.cameraY - 10;
  const wrapRect = boardWrap.getBoundingClientRect();
  popup.hidden = false;
  popup.style.left = `${clamp(screenX, 52, wrapRect.width - 52)}px`;
  popup.style.top = `${clamp(screenY, 70, wrapRect.height - 18)}px`;
  popupAvatar.src = person.photoDataUrl || blockAvatar(person);
  popupName.textContent = person.sessionId === state.me?.sessionId ? `${person.nickname} (tú)` : person.nickname;
  popupMeta.textContent = person.sessionId === state.me?.sessionId ? "Tu personaje" : person.online ? "En línea" : "Visto hace poco";
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

function applyVertical(dt, jumpPressed) {
  if (jumpPressed && !state.upLatch && state.onGround) {
    state.vy = -JUMP_SPEED;
    state.onGround = false;
    state.upLatch = true;
  }
  if (!jumpPressed) state.upLatch = false;

  state.vy += GRAVITY * dt;
  state.mePos.y += state.vy * dt;
}

function resolveCollisions() {
  state.onGround = false;

  for (const solid of [ { x: -240, y: BASE_Y, w: 960, h: 80 }, ...towerPlatforms ]) {
    const playerBox = { x: state.mePos.x, y: state.mePos.y, w: PLAYER_W, h: PLAYER_H };
    if (!rectsOverlap(playerBox, solid)) continue;

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
  state.mePos.y = clamp(state.mePos.y, -140, BASE_Y - PLAYER_H);
}

function resetWorld(snapToBottom = true) {
  state.mePos = snapToBottom ? { ...bottomSpawns[2] } : { ...state.mePos };
  state.vx = 0;
  state.vy = 0;
  state.onGround = false;
  state.cameraY = 0;
  state.popupSessionId = "";
  if (popup) popup.hidden = true;
  if (state.me) updatePresenceThrottle(true);
  syncStatus();
}

function update(dt) {
  const { left, right, jump } = inputState();
  applyHorizontal(dt, left, right);
  applyVertical(dt, jump);
  resolveCollisions();

  if (state.me) updatePresenceThrottle(false);

  if (state.popupSessionId) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) {
      syncPopup(selected);
    } else {
      hidePopup();
    }
  }

  moveViewportTowardPlayer();
  syncStatus();

  if (state.mePos.y - state.cameraY > currentViewHeight() + 90) {
    resetWorld(true);
  }
}

function drawBackground() {
  const w = canvas.width / Math.max(1, (window.devicePixelRatio || 1));
  const h = currentViewHeight();
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, "#263453");
  gradient.addColorStop(0.55, "#151b2a");
  gradient.addColorStop(1, "#0d111a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(0, 0);
  for (let i = 0; i < 18; i += 1) {
    const x = i * 240 + 80;
    ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 4) * 0.015})`;
    ctx.beginPath();
    ctx.ellipse(x, 104 + (i % 5) * 10, 92, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatform(platform) {
  const y = platform.y - state.cameraY;
  if (y < -80 || y > currentViewHeight() + 100) return;

  if (platform.type === "base") {
    ctx.fillStyle = "#7f8fb4";
    roundRect(platform.x, y, platform.w, platform.h, 8, true);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(platform.x, y, platform.w, 4);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(platform.x, y + platform.h - 3, platform.w, 3);
    return;
  }

  ctx.fillStyle = platform.color;
  roundRect(platform.x, y, platform.w, platform.h, 8, true);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(platform.x, y, platform.w, 4);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(platform.x, y + platform.h - 3, platform.w, 3);
}

function drawNumberBlock(x, y, w, h, value, fill, shadow, isHero = false, src = null) {
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

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(3, 3, w - 6, 7);

  const image = src ? avatarImage(src) : null;
  let drewImage = false;
  if (image?.complete && image.naturalWidth) {
    ctx.save();
    roundRect(0, 0, w, h, 10, false);
    ctx.clip();
    ctx.drawImage(image, 0, 0, w, h);
    ctx.restore();
    drewImage = true;
  }

  if (!drewImage) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(12, Math.min(18, h * 0.28))}px Trebuchet MS, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), w / 2, h / 2 + 1);
  }

  ctx.fillStyle = isHero ? "#fff" : "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(w * 0.33, h * 0.36, 2.3, 0, Math.PI * 2);
  ctx.arc(w * 0.67, h * 0.36, 2.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer(person) {
  const pos = playerPosition(person);
  const x = pos.x;
  const y = pos.y - state.cameraY;
  const isMe = person.sessionId === state.me?.sessionId;
  const blockValue = (hashString(person?.normalized || person?.nickname || person?.sessionId || "fiuma2") % 12) + 1;
  const fill = isMe ? "#5ad7ff" : colorFor(person);
  const shadow = isMe ? "#053447" : "#332206";
  const imageSrc = person.photoDataUrl || blockAvatar(person);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 11px Trebuchet MS, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(isMe ? `${person.nickname} (tú)` : person.nickname, x + PLAYER_W / 2, y - 10);

  drawNumberBlock(x, y, PLAYER_W, PLAYER_H, blockValue, fill, shadow, isMe, imageSrc);
}

function drawWorld() {
  drawBackground();

  ctx.save();
  ctx.translate(0, 0);

  ctx.fillStyle = "#1b2333";
  ctx.fillRect(0, BASE_Y, WORLD_WIDTH, currentViewHeight() - BASE_Y + 120);
  ctx.fillStyle = "#2d394d";
  ctx.fillRect(0, BASE_Y - 10, WORLD_WIDTH, 10);

  for (const platform of towerPlatforms) {
    drawPlatform(platform);
  }

  const visible = scenePeople().slice().sort((a, b) => playerPosition(a).y - playerPosition(b).y);
  for (const person of visible) {
    drawPlayer(person);
  }

  ctx.restore();

  if (state.popupSessionId) {
    const selected = state.people.find((person) => person.sessionId === state.popupSessionId);
    if (selected) syncPopup(selected);
  }

  ctx.save();
  ctx.fillStyle = "rgba(8, 12, 20, 0.56)";
  ctx.fillRect(14, 14, 324, 104);
  ctx.fillStyle = "#f5f7ff";
  ctx.font = "700 18px Trebuchet MS, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Mundo Fiuma 2", 26, 42);
  ctx.font = "600 15px Trebuchet MS, sans-serif";
  ctx.fillText(`Escena: torre Numberblocks`, 26, 68);
  ctx.fillText(`Toca un bloque para chatear`, 26, 92);
  ctx.restore();

  if (state.me) {
    updatePresenceThrottle(false);
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
    x: event.clientX - rect.left,
    y: event.clientY - rect.top + state.cameraY,
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
      if (dir === "up") state.mobile.jump = true;
      if (dir === "left") state.mobile.left = true;
      if (dir === "right") state.mobile.right = true;
      if (dir === "down") state.mobile.jump = true;
      if (dir === "up" || dir === "down") setTimeout(() => {
        state.mobile.jump = false;
      }, 140);
    };
    const release = () => {
      if (dir === "left") state.mobile.left = false;
      if (dir === "right") state.mobile.right = false;
      if (dir === "up" || dir === "down") state.mobile.jump = false;
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

  resetButton?.addEventListener("click", () => {
    resetWorld(true);
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
  const target = document.querySelector(location.hash || "#fiuma2-stage");
  if (target) {
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "smooth" }));
  } else {
    window.requestAnimationFrame(() => document.getElementById("fiuma2-stage")?.scrollIntoView({ block: "start", behavior: "smooth" }));
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
  state.mePos = { ...bottomSpawns[2] };
  state.positionInitialized = false;

  peopleUnsub = listActivePeople((people) => {
    state.people = people;
    if (!state.positionInitialized) {
      const liveMe = people.find((person) => person.sessionId === state.me?.sessionId);
      if (liveMe && liveMe.worldScene === WORLD_ID && Number.isFinite(liveMe.worldX) && Number.isFinite(liveMe.worldY)) {
        state.mePos = {
          x: clamp(Number(liveMe.worldX), 0, WORLD_WIDTH - PLAYER_W),
          y: clamp(Number(liveMe.worldY), -140, BASE_Y - PLAYER_H),
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

bootstrap().catch((error) => {
  console.error(error);
});
