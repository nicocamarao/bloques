import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBazRbpQJ3VA8EJhjXJ_M9X1W1OKzygqfw",
  authDomain: "pepeloco-b963b.firebaseapp.com",
  databaseURL: "https://pepeloco-b963b-default-rtdb.firebaseio.com",
  projectId: "pepeloco-b963b",
  storageBucket: "pepeloco-b963b.firebasestorage.app",
  messagingSenderId: "615563200220",
  appId: "1:615563200220:web:34c54414e61a684eac9619",
  measurementId: "G-3HZSWEXN1W"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const games = [
  { id: "blocks", title: "Bloques", view: "view-blocks" },
  { id: "subida", title: "Numberblocks Subida", view: "view-subida" },
  { id: "sumquest", title: "Numberblocks Sum Quest", view: "view-sumquest" },
  { id: "jump", title: "Numberblock Jump", view: "view-jump" },
  { id: "conga", title: "Conga Uruguaya", view: "view-conga" },
  { id: "hollow", title: "Hallownest Mini", view: "view-hollow" }
];

const $ = (selector) => document.querySelector(selector);
const statusEl = $("#connection-status");
const authStatus = $("#auth-status");
const saveState = $("#save-state");
const gameTitle = $("#game-title");
const gameNav = $("#game-nav");
let currentUser = null;
let currentGame = "blocks";

function setSaveState(text) {
  saveState.textContent = text;
}

async function saveProgress(gameId, patch) {
  if (!currentUser) return;
  setSaveState("Guardando...");
  await update(ref(db, `users/${currentUser.uid}/progress/${gameId}`), {
    ...patch,
    lastPlayedAt: Date.now()
  });
  setSaveState("Guardado");
}

function passwordScore(value) {
  return [
    value.length >= 12,
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ].filter(Boolean).length;
}

async function sha512Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-512", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setupAuth() {
  let mode = "login";
  const form = $("#auth-form");
  const password = $("#password");
  const strength = $(".strength");

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.authMode;
      document.querySelectorAll("[data-auth-mode]").forEach((item) => item.classList.toggle("active", item === button));
      $("#auth-submit").textContent = mode === "login" ? "Entrar" : "Crear usuario";
      password.autocomplete = mode === "login" ? "current-password" : "new-password";
    });
  });

  password.addEventListener("input", () => {
    strength.dataset.score = String(Math.min(4, passwordScore(password.value)));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    authStatus.textContent = "";
    const email = $("#email").value.trim();
    const pass = password.value;
    try {
      if (mode === "register") {
        if (passwordScore(pass) < 5) {
          authStatus.textContent = "Usa una password mas robusta.";
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, email, pass);
        await sendEmailVerification(credential.user);
        await set(ref(db, `users/${credential.user.uid}/profile`), {
          email,
          emailVerified: false,
          passwordSha512ClientHint: await sha512Hex(pass),
          createdAt: Date.now()
        });
        authStatus.textContent = "Usuario creado. Te envie el email de confirmacion.";
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
      }
      form.reset();
      strength.dataset.score = "0";
    } catch (error) {
      authStatus.textContent = error.message || "No se pudo autenticar.";
    }
  });

  $("#send-verification").addEventListener("click", async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    authStatus.textContent = "Email de confirmacion enviado.";
  });
  $("#sign-out").addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    $("#signed-out").hidden = Boolean(user);
    $("#signed-in").hidden = !user;
    if (!user) {
      statusEl.textContent = "Entra para jugar";
      $("#user-email").textContent = "";
      $("#verify-status").textContent = "";
      renderDisabledGrid();
      return;
    }
    $("#user-email").textContent = user.email || "Usuario";
    $("#verify-status").textContent = user.emailVerified ? "Email confirmado" : "Email pendiente de confirmar";
    statusEl.textContent = "Conectado a Firebase";
    await update(ref(db, `users/${user.uid}/profile`), {
      email: user.email || "",
      emailVerified: user.emailVerified,
      lastLoginAt: Date.now()
    });
    connectBlocks();
    loadConga();
    loadJump();
    loadHollow();
    saveProgress(currentGame, { opened: true }).catch(console.error);
  });
}

function setupNav() {
  gameNav.innerHTML = games.map((game) => `<button type="button" data-game="${game.id}">${game.title}</button>`).join("");
  gameNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-game]");
    if (!button) return;
    selectGame(button.dataset.game);
  });
  selectGame("blocks");
  selectGameFromHash();
  window.addEventListener("hashchange", selectGameFromHash);
}

function selectGame(id) {
  const game = games.find((item) => item.id === id) || games[0];
  currentGame = game.id;
  gameTitle.textContent = game.title;
  document.querySelectorAll(".game-view").forEach((view) => view.classList.toggle("active", view.id === game.view));
  document.querySelectorAll("[data-game]").forEach((button) => button.classList.toggle("active", button.dataset.game === game.id));
  if (currentUser) saveProgress(game.id, { opened: true }).catch(console.error);
  if (game.id === "jump") drawJump();
  if (game.id === "hollow") drawHollow();
}

function selectGameFromHash() {
  const hash = window.location.hash.replace("#", "");
  if (!hash) return;
  if (games.some((game) => game.id === hash)) {
    selectGame(hash);
  }
}

const GRID_SIZE = 10;
const gridEl = $("#grid");
const errorPanelEl = $("#error-panel");
const levels = [
  { name: "white", min: 0 },
  { name: "gray", min: 5 },
  { name: "orange", min: 15 },
  { name: "yellow", min: 35 },
  { name: "green", min: 65 },
  { name: "blue", min: 105 },
  { name: "red", min: 155 },
  { name: "black", min: 255 }
];
let cells = createEmptyCells();
let blocksConnected = false;

function createEmptyCells() {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({ id: String(index), clicks: 0, owner: "", ownerUid: "" }));
}

function levelFor(clicks) {
  return levels.reduce((current, level) => clicks >= level.min ? level : current, levels[0]);
}

function crossesLevel(previousClicks, nextClicks) {
  return levelFor(previousClicks).name !== levelFor(nextClicks).name;
}

function renderBlocks(disabled = false) {
  gridEl.innerHTML = "";
  for (const cell of cells) {
    const button = document.createElement("button");
    const level = levelFor(cell.clicks);
    button.type = "button";
    button.className = `cell level-${level.name}`;
    button.dataset.id = cell.id;
    button.disabled = disabled || !currentUser;
    button.title = `Bloque ${Number(cell.id) + 1}: ${cell.clicks} clicks`;
    const owner = document.createElement("span");
    owner.className = "owner";
    owner.textContent = cell.owner || "";
    const clicks = document.createElement("span");
    clicks.className = "clicks";
    clicks.textContent = cell.clicks;
    button.append(owner, clicks);
    gridEl.append(button);
  }
}

function renderDisabledGrid() {
  renderBlocks(true);
}

function connectBlocks() {
  if (blocksConnected) {
    renderBlocks(false);
    return;
  }
  blocksConnected = true;
  const cellsRef = ref(db, "games/main/cells");
  onValue(cellsRef, async (snapshot) => {
    if (!snapshot.exists()) {
      await Promise.all(createEmptyCells().map((cell) => set(ref(db, `games/main/cells/${cell.id}`), cell)));
      return;
    }
    const data = snapshot.val();
    const nextCells = createEmptyCells();
    for (const [id, cell] of Object.entries(data)) {
      nextCells[Number(id)] = {
        id,
        clicks: Number(cell.clicks) || 0,
        owner: String(cell.owner || ""),
        ownerUid: String(cell.ownerUid || "")
      };
    }
    cells = nextCells;
    renderBlocks(false);
  }, (error) => {
    errorPanelEl.hidden = false;
    errorPanelEl.textContent = error.message || "No se pudo conectar con Firebase.";
    renderDisabledGrid();
  });
}

gridEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".cell");
  if (!button || !currentUser) return;
  const id = button.dataset.id;
  const displayName = (currentUser.email || "Jugador").split("@")[0].slice(0, 24);
  await runTransaction(ref(db, `games/main/cells/${id}`), (current) => {
    const cell = current ?? { id, clicks: 0, owner: "", ownerUid: "" };
    const previousClicks = Number(cell.clicks) || 0;
    const nextClicks = previousClicks + 1;
    const shouldClaim = crossesLevel(previousClicks, nextClicks);
    return {
      id,
      clicks: nextClicks,
      owner: shouldClaim ? displayName : String(cell.owner || ""),
      ownerUid: shouldClaim ? currentUser.uid : String(cell.ownerUid || "")
    };
  });
  await saveProgress("blocks", { clicks: Date.now() });
});

const conga = { players: [], started: false, round: 0, history: [] };
function renderConga() {
  $("#conga-status").textContent = conga.started ? `Ronda ${conga.round}` : "Agrega jugadores y arranca la partida.";
  $("#conga-grid").innerHTML = conga.players.map((player, index) => `
    <div class="player-card">
      <strong>${player.name}</strong>
      <span>Total: ${player.score}</span>
      <input type="number" step="1" value="0" data-conga-delta="${index}">
    </div>
  `).join("");
  $("#conga-history").innerHTML = conga.history.map((item) => `<div>${item}</div>`).join("");
}

async function persistConga() {
  renderConga();
  await saveProgress("conga", conga);
}

async function loadConga() {
  if (!currentUser) return;
  const snap = await get(ref(db, `users/${currentUser.uid}/progress/conga`));
  if (snap.exists()) {
    const data = snap.val();
    conga.players = Array.isArray(data.players) ? data.players : [];
    conga.started = Boolean(data.started);
    conga.round = Number(data.round) || 0;
    conga.history = Array.isArray(data.history) ? data.history : [];
  }
  renderConga();
}

$("#conga-add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#conga-name");
  const name = input.value.trim().slice(0, 24);
  if (!name) return;
  conga.players.push({ name, score: 0, reenganches: 0 });
  input.value = "";
  await persistConga();
});
$("#conga-start").addEventListener("click", async () => {
  if (conga.players.length < 2) return;
  conga.started = true;
  conga.round = Math.max(1, conga.round || 1);
  conga.history.unshift("Arranco la conga.");
  await persistConga();
});
$("#conga-reset").addEventListener("click", async () => {
  conga.players = [];
  conga.started = false;
  conga.round = 0;
  conga.history = [];
  await persistConga();
});
$("#conga-round").addEventListener("click", async () => {
  if (!conga.started) return;
  const deltas = [...document.querySelectorAll("[data-conga-delta]")].map((input) => Number(input.value) || 0);
  const lines = conga.players.map((player, index) => {
    const next = player.score + deltas[index];
    player.score = Math.min(100, next);
    if (next > 100) {
      player.reenganches += 1;
      return `${player.name} paso 100 y reengancho.`;
    }
    return `${player.name} ${deltas[index] >= 0 ? "+" : ""}${deltas[index]} => ${player.score}`;
  });
  conga.round += 1;
  conga.history.unshift(lines.join(" | "));
  await persistConga();
});

const jumpCanvas = $("#jump-canvas");
const jumpCtx = jumpCanvas.getContext("2d");
const jump = { running: false, x: 84, y: 320, vy: 0, score: 0, unlocked: 1, current: 1, items: [], t: 0 };
function loadJump() {
  if (!currentUser) return;
  get(ref(db, `users/${currentUser.uid}/progress/jump`)).then((snap) => {
    if (snap.exists()) Object.assign(jump, snap.val(), { running: false, items: [] });
    drawJump();
  });
}
function resetJump() {
  Object.assign(jump, { running: true, x: 84, y: 320, vy: 0, score: 0, current: Math.max(1, jump.unlocked || 1), items: [], t: 0 });
}
function drawBlock(ctx, x, y, size, value) {
  const hue = (value * 37) % 360;
  ctx.fillStyle = `hsl(${hue} 78% 55%)`;
  ctx.strokeStyle = "rgba(255,255,255,.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `900 ${Math.floor(size * .45)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), x + size / 2, y + size / 2);
}
function drawJump() {
  jumpCtx.clearRect(0, 0, jumpCanvas.width, jumpCanvas.height);
  jumpCtx.fillStyle = "#111827";
  jumpCtx.fillRect(0, 0, jumpCanvas.width, jumpCanvas.height);
  jumpCtx.fillStyle = "#334155";
  jumpCtx.fillRect(0, 360, jumpCanvas.width, 60);
  for (const item of jump.items) drawBlock(jumpCtx, item.x, item.y, 38, item.value);
  drawBlock(jumpCtx, jump.x, jump.y, 48, jump.current);
  $("#jump-score").textContent = `Puntos: ${jump.score}`;
  $("#jump-unlocked").textContent = `Desbloqueado: ${jump.unlocked}`;
}
function stepJump() {
  if (!jump.running) return;
  jump.t += 1;
  if (jump.t % 80 === 0) jump.items.push({ x: 960, y: 315, value: Math.min(50, jump.current + 1) });
  jump.vy += .55;
  jump.y = Math.min(312, jump.y + jump.vy);
  for (const item of jump.items) item.x -= 5.6;
  jump.items = jump.items.filter((item) => item.x > -80);
  for (const item of jump.items) {
    if (!item.done && Math.abs(item.x - jump.x) < 42 && Math.abs(item.y - jump.y) < 52) {
      item.done = true;
      jump.current = item.value;
      jump.score += 10;
      jump.unlocked = Math.max(jump.unlocked, jump.current);
      saveProgress("jump", { score: jump.score, unlocked: jump.unlocked }).catch(console.error);
    }
  }
  drawJump();
  requestAnimationFrame(stepJump);
}
$("#jump-start").addEventListener("click", () => {
  resetJump();
  stepJump();
});
jumpCanvas.addEventListener("pointerdown", () => {
  if (jump.y >= 310) jump.vy = -12;
});
window.addEventListener("keydown", (event) => {
  if (currentGame === "jump" && (event.code === "Space" || event.code === "ArrowUp") && jump.y >= 310) jump.vy = -12;
});

const hkCanvas = $("#hk-canvas");
const hkCtx = hkCanvas.getContext("2d");
const hk = { running: false, x: 70, y: 360, vx: 0, vy: 0, masks: 5, soul: 0, kills: 0, stage: 1, enemies: [] };
function loadHollow() {
  if (!currentUser) return;
  get(ref(db, `users/${currentUser.uid}/progress/hollow`)).then((snap) => {
    if (snap.exists()) Object.assign(hk, snap.val(), { running: false, enemies: [] });
    drawHollow();
  });
}
function resetHollow() {
  Object.assign(hk, { running: true, x: 70, y: 360, vx: 0, vy: 0, masks: 5, soul: 0, kills: 0, stage: 1, enemies: [{ x: 620, hp: 2 }, { x: 820, hp: 2 }] });
}
function drawKnight(x, y) {
  hkCtx.fillStyle = "#f8fafc";
  hkCtx.beginPath();
  hkCtx.roundRect(x, y - 44, 30, 44, 8);
  hkCtx.fill();
  hkCtx.fillStyle = "#111827";
  hkCtx.fillRect(x + 8, y - 30, 4, 4);
  hkCtx.fillRect(x + 20, y - 30, 4, 4);
}
function drawHollow() {
  hkCtx.clearRect(0, 0, hkCanvas.width, hkCanvas.height);
  const grad = hkCtx.createLinearGradient(0, 0, 0, hkCanvas.height);
  grad.addColorStop(0, "#10172f");
  grad.addColorStop(1, "#050816");
  hkCtx.fillStyle = grad;
  hkCtx.fillRect(0, 0, hkCanvas.width, hkCanvas.height);
  hkCtx.fillStyle = "#1f2937";
  hkCtx.fillRect(0, 380, hkCanvas.width, 80);
  drawKnight(hk.x, hk.y);
  hkCtx.fillStyle = "#a78bfa";
  for (const enemy of hk.enemies) {
    hkCtx.beginPath();
    hkCtx.roundRect(enemy.x, 330, 38, 50, 9);
    hkCtx.fill();
  }
  $("#hk-status").textContent = hk.kills >= 6 ? "Hallownest liberado" : `Hallownest: nivel ${hk.stage}`;
  $("#hk-stats").textContent = `Mascaras ${hk.masks} | Alma ${hk.soul} | Kills ${hk.kills}`;
}
function stepHollow() {
  if (!hk.running) return;
  hk.vy += .6;
  hk.y = Math.min(380, hk.y + hk.vy);
  hk.x = Math.max(20, Math.min(900, hk.x + hk.vx));
  for (const enemy of hk.enemies) {
    enemy.x -= 1.6 + hk.stage * .2;
    if (enemy.x < -60) enemy.x = 960;
    if (Math.abs(enemy.x - hk.x) < 34 && hk.y > 340) {
      hk.masks = Math.max(0, hk.masks - 1);
      enemy.x = 960;
    }
  }
  if (hk.masks <= 0) hk.running = false;
  drawHollow();
  requestAnimationFrame(stepHollow);
}
function hollowAttack() {
  const enemy = hk.enemies.find((item) => Math.abs(item.x - hk.x) < 90);
  if (!enemy) return;
  enemy.hp -= 1;
  if (enemy.hp <= 0) {
    hk.kills += 1;
    hk.soul = Math.min(99, hk.soul + 25);
    enemy.x = 960 + Math.random() * 240;
    enemy.hp = 2 + Math.floor(hk.kills / 3);
    hk.stage = 1 + Math.floor(hk.kills / 3);
    saveProgress("hollow", { kills: hk.kills, soul: hk.soul, stage: hk.stage }).catch(console.error);
  }
}
$("#hk-start").addEventListener("click", () => {
  resetHollow();
  stepHollow();
});
hkCanvas.addEventListener("pointerdown", hollowAttack);
window.addEventListener("keydown", (event) => {
  if (currentGame !== "hollow") return;
  if (event.code === "ArrowLeft") hk.vx = -5;
  if (event.code === "ArrowRight") hk.vx = 5;
  if (event.code === "Space" && hk.y >= 379) hk.vy = -13;
  if (event.code === "KeyZ") hollowAttack();
});
window.addEventListener("keyup", (event) => {
  if (event.code === "ArrowLeft" || event.code === "ArrowRight") hk.vx = 0;
});

setupNav();
setupAuth();
renderDisabledGrid();
renderConga();
drawJump();
drawHollow();
