import {
  bootstrapProfile,
  listActivePeople,
  onProfileChange,
  sendMessage,
  setPresenceHeartbeat,
  watchConversation,
} from "../../shared/social.js";

const GRID = 12;
const WORLD_SCENE = "mundo-fiuma";
const board = document.getElementById("fiuma-board");
const feed = document.getElementById("fiuma-feed");
const form = document.getElementById("fiuma-form");
const input = document.getElementById("fiuma-input");
const countEl = document.getElementById("fiuma-count");
const statusEl = document.getElementById("fiuma-status");
const mePosEl = document.getElementById("fiuma-me-pos");
const participantsEl = document.getElementById("fiuma-participants");
const moveButtons = Array.from(document.querySelectorAll("[data-move]"));

const state = {
  me: null,
  people: [],
  mePos: { x: 6, y: 6 },
  generalMessages: [],
  bubbles: new Map(),
  positionInitialized: false,
};

let peopleUnsub = null;
let spawnTimer = null;

function clamp(value) {
  return Math.max(0, Math.min(GRID - 1, value));
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function spawnFor(person) {
  const hash = hashString(person?.normalized || person?.sessionId || "fiuma");
  return {
    x: hash % GRID,
    y: Math.floor(hash / GRID) % GRID,
  };
}

function avatarFallback(name) {
  const initials = String(name || "F").slice(0, 2).toUpperCase();
  const hue = hashString(name || "fiuma") % 360;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},72%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 32) % 360},78%,44%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="40" fill="url(#g)"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="800" fill="white">${initials}</text>
    </svg>
  `)}`;
}

function colorFor(person) {
  const hue = hashString(person.normalized || person.sessionId) % 360;
  return `hsl(${hue}, 78%, 56%)`;
}

function opacityForBubble(until) {
  const remaining = until - Date.now();
  if (remaining <= 0) return 0;
  return Math.max(0.18, Math.min(1, remaining / 5000));
}

function personPosition(person) {
  if (person.sessionId === state.me?.sessionId) return state.mePos;
  if (Number.isFinite(person.worldX) && Number.isFinite(person.worldY) && person.worldX >= 0 && person.worldY >= 0) {
    return { x: clamp(person.worldX), y: clamp(person.worldY) };
  }
  return spawnFor(person);
}

function setStatus() {
  const active = state.people.filter((person) => person.online && (person.worldScene === WORLD_SCENE || person.sessionId === state.me?.sessionId)).length;
  if (countEl) countEl.textContent = `${active} conectados`;
  if (participantsEl) participantsEl.textContent = `${active} presentes`;
  if (mePosEl) mePosEl.textContent = `x:${state.mePos.x} y:${state.mePos.y}`;
  if (statusEl) statusEl.textContent = "Mundo en vivo";
}

function renderFeed() {
  if (!feed) return;
  feed.innerHTML = "";
  const rows = state.generalMessages.slice(-10);
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Todavía no hay mensajes en el mundo.";
    feed.appendChild(empty);
    return;
  }

  rows.forEach((message) => {
    const item = document.createElement("article");
    item.className = "fiuma-message";
    item.innerHTML = `
      <strong>${message.senderNickname || "Jugador"} · ${new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
      <p>${String(message.text || "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]))}</p>
    `;
    feed.appendChild(item);
  });
  feed.scrollTop = feed.scrollHeight;
}

function renderBoard() {
  if (!board) return;
  const cells = Array.from({ length: GRID * GRID }, () => `<div class="fiuma-cell"></div>`).join("");
  const activePeople = state.people.filter((person) => (person.online || person.sessionId === state.me?.sessionId) && (person.worldScene === WORLD_SCENE || person.sessionId === state.me?.sessionId));
  const occupied = new Map();

  const players = activePeople.map((person) => {
    const pos = personPosition(person);
    const key = `${pos.x}:${pos.y}`;
    const stackIndex = occupied.get(key) || 0;
    occupied.set(key, stackIndex + 1);
    const offsetX = ((stackIndex % 3) - 1) * 10;
    const offsetY = Math.floor(stackIndex / 3) * 10;
    const bubble = state.bubbles.get(person.sessionId);
    const bubbleOpacity = bubble ? opacityForBubble(bubble.until) : 0;
    const label = person.sessionId === state.me?.sessionId ? `${person.nickname} (tú)` : person.nickname;
    const avatar = person.photoDataUrl
      ? `<img src="${person.photoDataUrl}" alt="">`
      : `<span>${String(person.nickname || "F").slice(0, 2).toUpperCase()}</span>`;
    const bubbleMarkup = bubbleOpacity > 0
      ? `<span class="bubble" style="opacity:${bubbleOpacity}">${String(bubble.text || "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]))}</span>`
      : "";
    return `
      <button
        type="button"
        class="fiuma-player"
        data-session="${person.sessionId}"
        style="left:${((pos.x + 0.5) / GRID) * 100}%; top:${((pos.y + 0.5) / GRID) * 100}%; transform: translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px);"
      >
        <span class="label">${label}</span>
        ${bubbleMarkup}
        <span class="orb" style="background:${colorFor(person)}">${avatar}</span>
      </button>
    `;
  }).join("");

  board.innerHTML = `
    <div class="fiuma-cells">${cells}</div>
    <div class="fiuma-players">${players}</div>
  `;

  board.querySelectorAll(".fiuma-player").forEach((button) => {
    button.addEventListener("click", () => {
      const person = state.people.find((item) => item.sessionId === button.dataset.session);
      if (!person) return;
      window.openPlatformConversation?.({ kind: person.sessionId === state.me?.sessionId ? "self" : "direct", peer: person });
    });
  });

  setStatus();
}

async function syncWorldPosition(nextPos) {
  if (!state.me) return;
  state.mePos = { x: clamp(nextPos.x), y: clamp(nextPos.y) };
  state.positionInitialized = true;
  await setPresenceHeartbeat(state.me, {
    path: location.pathname,
    worldScene: WORLD_SCENE,
    worldX: state.mePos.x,
    worldY: state.mePos.y,
    worldUpdatedAt: Date.now(),
  });
  setStatus();
  renderBoard();
}

async function move(dx, dy) {
  const next = {
    x: clamp(state.mePos.x + dx),
    y: clamp(state.mePos.y + dy),
  };
  if (next.x === state.mePos.x && next.y === state.mePos.y) return;
  await syncWorldPosition(next);
}

function renderButtons() {
  moveButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const dir = button.dataset.move;
      if (dir === "up") move(0, -1);
      if (dir === "left") move(-1, 0);
      if (dir === "right") move(1, 0);
      if (dir === "down") move(0, 1);
    });
  });
}

function updatePositionFromPeople() {
  const liveMe = state.people.find((person) => person.sessionId === state.me?.sessionId || (person.worldScene === WORLD_SCENE && person.sessionId === state.me?.sessionId));
  if (!liveMe) return;
  if (Number.isFinite(liveMe.worldX) && Number.isFinite(liveMe.worldY) && liveMe.worldX >= 0 && liveMe.worldY >= 0 && !state.positionInitialized) {
    state.mePos = { x: clamp(liveMe.worldX), y: clamp(liveMe.worldY) };
    state.positionInitialized = true;
  }
}

function bindGeneralChat() {
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !state.me) return;
    await sendMessage({ kind: "general" }, state.me, text);
    input.value = "";
  });
}

async function bootstrap() {
  renderButtons();
  bindGeneralChat();

  state.me = await bootstrapProfile();
  const spawn = spawnFor(state.me);
  state.mePos = { x: spawn.x, y: spawn.y };
  state.positionInitialized = false;

  peopleUnsub = listActivePeople((people) => {
    state.people = people;
    updatePositionFromPeople();
    renderBoard();
    if (!state.positionInitialized && !spawnTimer) {
      spawnTimer = window.setTimeout(() => {
        if (!state.positionInitialized) {
          syncWorldPosition(state.mePos).catch(() => {});
        }
        spawnTimer = null;
      }, 900);
    }
  });

  watchConversation({ kind: "general" }, (messages) => {
    if (state.generalMessages.length) {
      const nextMessages = messages.slice(state.generalMessages.length);
      nextMessages.forEach((message) => {
        if (!message.senderSessionId) return;
        state.bubbles.set(message.senderSessionId, {
          text: message.text || "",
          until: Date.now() + 5000,
        });
      });
    }
    state.generalMessages = messages;
    renderFeed();
    renderBoard();
  });

  onProfileChange((profile) => {
    state.me = profile;
    renderBoard();
  });

  window.setInterval(() => {
    renderBoard();
  }, 300);

  window.addEventListener("beforeunload", () => {
    if (spawnTimer) window.clearTimeout(spawnTimer);
    if (peopleUnsub) peopleUnsub();
    if (state.me) {
      setPresenceHeartbeat(state.me, {
        online: false,
        path: location.pathname,
        worldScene: WORLD_SCENE,
        worldX: state.mePos.x,
        worldY: state.mePos.y,
        worldUpdatedAt: Date.now(),
      }).catch(() => {});
    }
  });

  if (window.matchMedia("(max-width: 900px)").matches) {
    window.requestAnimationFrame(() => {
      document.getElementById("fiuma-world")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
}

bootstrap().catch((error) => {
  console.error(error);
  if (statusEl) statusEl.textContent = "No se pudo cargar Mundo Fiuma.";
});
