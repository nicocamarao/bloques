import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  recordScore,
  setPresenceHeartbeat,
  watchLeaderboard,
} from "../../shared/social.js";

const WORLD_ID = "mundo-fiuma-3";
const EMOJIS = ["👋", "✨", "💛", "🔥", "😂", "🎉"];

const board = document.getElementById("fiuma3-board");
const countEl = document.getElementById("fiuma3-count");
const statusEl = document.getElementById("fiuma3-status");
const selectedEl = document.getElementById("fiuma3-selected");
const subtitleEl = document.getElementById("fiuma3-subtitle");
const emojiBar = document.getElementById("fiuma3-emojis");
const leaderboardEl = document.getElementById("fiuma3-leaderboard");

const state = {
  me: null,
  people: [],
  selectedSessionId: "",
  mePos: { x: 0, y: 0 },
  lastSyncAt: 0,
  leaderboard: [],
};

let peopleUnsub = null;
let leaderboardUnsub = null;
let heartbeatTimer = null;

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash >>> 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function avatarFallback(name) {
  const initials = String(name || "F").slice(0, 2).toUpperCase();
  const hue = hashString(name || "fiuma3") % 360;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},72%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 28) % 360},78%,44%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="24" fill="url(#g)"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="800" fill="white">${initials}</text>
    </svg>
  `)}`;
}

function colorFor(person) {
  const hue = hashString(person.normalized || person.sessionId || "fiuma3") % 360;
  return `hsl(${hue}, 78%, 58%)`;
}

function spawnFor(person) {
  const seed = hashString(person.normalized || person.sessionId || "fiuma3");
  return {
    x: 12 + (seed % 76),
    y: 20 + ((seed >> 6) % 56),
  };
}

function activePeople() {
  return state.people.filter((person) => person.online || person.sessionId === state.me?.sessionId);
}

function syncHeader() {
  const people = activePeople();
  countEl.textContent = `${people.length} online`;
  statusEl.textContent = "Toca una persona y luego un emoji";
  const selected = state.people.find((person) => person.sessionId === state.selectedSessionId);
  selectedEl.textContent = selected ? selected.nickname : "Nadie seleccionado";
  subtitleEl.textContent = selected
    ? `Listo para enviar algo a ${selected.nickname}.`
    : "Un mundo limpio para mirar, tocar y reaccionar.";
}

function renderLeaderboard() {
  leaderboardEl.innerHTML = "";
  const rows = state.leaderboard.slice(0, 5);
  if (!rows.length) {
    const li = document.createElement("li");
    li.className = "fiuma3-empty";
    li.textContent = "Todavía no hay movimientos.";
    leaderboardEl.appendChild(li);
    return;
  }

  rows.forEach((row, index) => {
    const li = document.createElement("li");
    li.className = "fiuma3-rank";
    li.innerHTML = `
      <span class="rank-pos">${index + 1}</span>
      <img class="avatar" src="${row.photoDataUrl || avatarFallback(row.nickname)}" alt="">
      <div>
        <strong>${row.nickname}</strong>
        <span>${row.score} reacciones</span>
      </div>
    `;
    leaderboardEl.appendChild(li);
  });
}

function bubbleFor(person) {
  const reaction = state.people.find((item) => item.sessionId !== person.sessionId && item.reactionTargetSessionId === person.sessionId && Number(item.reactionUntil || 0) > Date.now());
  if (!reaction) return "";
  return `<span class="fiuma3-bubble">${reaction.reactionEmoji || "✨"}</span>`;
}

function renderBoard() {
  if (!board) return;
  const people = activePeople();
  const items = people.map((person) => {
    const pos = person.sessionId === state.me?.sessionId ? state.mePos : (Number.isFinite(person.worldX) && Number.isFinite(person.worldY) ? {
      x: clamp(Number(person.worldX), 4, 96),
      y: clamp(Number(person.worldY), 10, 88),
    } : spawnFor(person));
    const isSelected = person.sessionId === state.selectedSessionId;
    const isMe = person.sessionId === state.me?.sessionId;
    return `
      <button
        type="button"
        class="fiuma3-player ${isSelected ? "selected" : ""}"
        data-session="${person.sessionId}"
        style="left:${pos.x}%; top:${pos.y}%;"
      >
        ${bubbleFor(person)}
        <span class="fiuma3-orb" style="background:${colorFor(person)}">
          ${person.photoDataUrl ? `<img src="${person.photoDataUrl}" alt="">` : `<span>${String(person.nickname || "F").slice(0, 2).toUpperCase()}</span>`}
        </span>
        <span class="fiuma3-name">${person.nickname}${isMe ? " (tú)" : ""}</span>
      </button>
    `;
  }).join("");

  board.innerHTML = items || `<div class="fiuma3-empty-board">No hay personas conectadas.</div>`;
  board.querySelectorAll("[data-session]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSessionId = button.dataset.session;
      syncHeader();
      renderBoard();
    });
  });
}

async function syncPresence(extra = {}) {
  if (!state.me) return;
  const now = Date.now();
  if (now - state.lastSyncAt < 240 && !extra.force) return;
  state.lastSyncAt = now;
  await setPresenceHeartbeat(state.me, {
    path: location.pathname,
    worldScene: WORLD_ID,
    worldX: state.mePos.x,
    worldY: state.mePos.y,
    worldUpdatedAt: now,
    ...extra,
  });
}

async function sendEmoji(emoji) {
  const target = state.people.find((person) => person.sessionId === state.selectedSessionId);
  if (!state.me || !target || target.sessionId === state.me.sessionId) return;
  const until = Date.now() + 3200;
  await syncPresence({
    reactionEmoji: emoji,
    reactionUntil: until,
    reactionTargetSessionId: target.sessionId,
    reactionTargetNickname: target.nickname,
  });
  await recordScore(WORLD_ID, 1, { label: "Reacción", details: `${emoji} -> ${target.nickname}` });
  state.me = { ...state.me, reactionEmoji: emoji, reactionUntil: until, reactionTargetSessionId: target.sessionId };
  renderBoard();
  renderLeaderboard();
}

function renderEmojiBar() {
  emojiBar.innerHTML = "";
  EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => sendEmoji(emoji));
    emojiBar.appendChild(button);
  });
}

function initKeyboard() {
  window.addEventListener("keydown", (event) => {
    if (!state.me) return;
    if (event.key === "ArrowLeft") state.mePos.x = clamp(state.mePos.x - 2.2, 4, 96);
    if (event.key === "ArrowRight") state.mePos.x = clamp(state.mePos.x + 2.2, 4, 96);
    if (event.key === "ArrowUp") state.mePos.y = clamp(state.mePos.y - 2.2, 10, 88);
    if (event.key === "ArrowDown") state.mePos.y = clamp(state.mePos.y + 2.2, 10, 88);
    syncPresence().catch(() => {});
    renderBoard();
  });
}

async function bootstrap() {
  renderEmojiBar();
  initKeyboard();

  state.me = await bootstrapProfile();
  const seed = spawnFor(state.me);
  state.mePos = { x: seed.x, y: seed.y };
  state.selectedSessionId = state.me.sessionId;

  peopleUnsub = listActivePeople((people) => {
    state.people = people;
    if (!state.selectedSessionId || !people.find((person) => person.sessionId === state.selectedSessionId)) {
      state.selectedSessionId = people.find((person) => person.sessionId !== state.me?.sessionId)?.sessionId || state.me?.sessionId || "";
    }
    syncHeader();
    renderBoard();
  });

  leaderboardUnsub = watchLeaderboard(WORLD_ID, (rows) => {
    state.leaderboard = rows;
    renderLeaderboard();
  });

  onProfileChange((profile) => {
    state.me = profile;
    renderBoard();
  });

  heartbeatTimer = window.setInterval(() => {
    syncPresence().catch(() => {});
    renderBoard();
  }, 1400);

  await syncPresence({ force: true });
  syncHeader();
  renderBoard();

  window.addEventListener("beforeunload", () => {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    peopleUnsub?.();
    leaderboardUnsub?.();
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
}

bootstrap().catch((error) => {
  console.error(error);
  statusEl.textContent = "No se pudo cargar Mundo Fiuma 3.";
});
