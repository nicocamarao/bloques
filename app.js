import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  onValue,
  ref,
  runTransaction,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDE3YreYTQrzYkLWY_E-QH_gm-kxVjwU1Y",
  authDomain: "backend-nico-6f5db.firebaseapp.com",
  databaseURL: "https://backend-nico-6f5db-default-rtdb.firebaseio.com",
  projectId: "backend-nico-6f5db",
  storageBucket: "backend-nico-6f5db.firebasestorage.app",
  messagingSenderId: "654175276624",
  appId: "1:654175276624:web:b3bc36cd0ef315da9e8b55"
};

const GRID_SIZE = 10;
const statusEl = document.querySelector("#connection-status");
const errorPanelEl = document.querySelector("#error-panel");
const gridEl = document.querySelector("#grid");

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
let store;

function createEmptyCells() {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
    id: String(index),
    clicks: 0,
    owner: ""
  }));
}

function levelFor(clicks) {
  return levels.reduce((current, level) => clicks >= level.min ? level : current, levels[0]);
}

function crossesLevel(previousClicks, nextClicks) {
  return levelFor(previousClicks).name !== levelFor(nextClicks).name;
}

function render() {
  gridEl.innerHTML = "";

  for (const cell of cells) {
    const button = document.createElement("button");
    const level = levelFor(cell.clicks);
    button.type = "button";
    button.className = `cell level-${level.name}`;
    button.dataset.id = cell.id;
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
  render();
  for (const button of gridEl.querySelectorAll(".cell")) {
    button.disabled = true;
  }
}

function showError(message, error) {
  console.error(error ?? message);
  statusEl.textContent = "Error de storage";
  errorPanelEl.hidden = false;
  errorPanelEl.textContent = message;
  renderDisabledGrid();
}

async function handleCellClick(event) {
  const button = event.target.closest(".cell");
  if (!button) return;

  const id = button.dataset.id;
  const current = cells.find((cell) => cell.id === id) ?? { id, clicks: 0, owner: "" };
  const nextClicks = current.clicks + 1;
  let owner = current.owner;

  if (crossesLevel(current.clicks, nextClicks)) {
    const name = window.prompt("Este bloque subio de nivel. Escribe tu nombre para reclamarlo:", owner);
    if (!name || !name.trim()) return;
    owner = name.trim().slice(0, 24);
  }

  await store.updateCell(id, owner);
}

function createFirebaseStore() {
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const cellsRef = ref(db, "games/main/cells");

  return {
    async connect() {
      statusEl.textContent = "Conectado a Firebase Realtime Database";
      onValue(cellsRef, async (snapshot) => {
        if (!snapshot.exists()) {
          await Promise.all(
            createEmptyCells().map((cell) => set(ref(db, `games/main/cells/${cell.id}`), cell))
          );
          return;
        }

        const data = snapshot.val();
        const nextCells = createEmptyCells();
        for (const [id, cell] of Object.entries(data)) {
          nextCells[Number(id)] = {
            id,
            clicks: Number(cell.clicks) || 0,
            owner: String(cell.owner || "")
          };
        }
        cells = nextCells;
        render();
      });
    },
    async updateCell(id, ownerFromPrompt) {
      const cellRef = ref(db, `games/main/cells/${id}`);
      await runTransaction(cellRef, (current) => {
        const cell = current ?? { id, clicks: 0, owner: "" };
        const previousClicks = Number(cell.clicks) || 0;
        const nextClicks = previousClicks + 1;
        const nextOwner = crossesLevel(previousClicks, nextClicks)
          ? ownerFromPrompt
          : String(cell.owner || "");

        return {
          id,
          clicks: nextClicks,
          owner: nextOwner
        };
      });
    }
  };
}

function hasFirebaseConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.appId &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId
  );
}

async function boot() {
  renderDisabledGrid();

  if (!hasFirebaseConfig()) {
    throw new Error("Falta configurar firebaseConfig en app.js. Sin storage remoto no se puede jugar.");
  }

  store = createFirebaseStore();
  await store.connect();
}

gridEl.addEventListener("click", handleCellClick);
boot().catch((error) => {
  showError(error.message || "No se pudo conectar al storage remoto.", error);
});
