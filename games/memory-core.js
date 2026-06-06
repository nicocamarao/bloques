import { watchUser, saveGameStats } from "./firebase-shared.js";
import { pairSet, tileForNumber } from "./numberblocks-data.js";

const MODES = {
  classic: {
    title: "Memory Clasico",
    subtitle: "Encontrar las 12 parejas sin reloj, con tablero ancho y ritmo sereno.",
    gameId: "memory-classic",
    pairCount: 12,
    columns: 4,
    timer: false,
    accent: "gold",
    summaryLabel: "Parejas"
  },
  relampago: {
    title: "Memory Relampago",
    subtitle: "La misma familia de tiles, pero con cuenta regresiva y tablero mas apretado.",
    gameId: "memory-relampago",
    pairCount: 12,
    columns: 6,
    timer: true,
    seconds: 75,
    accent: "cyan",
    summaryLabel: "Tiempo"
  }
};

const body = document.body;
const mode = MODES[body.dataset.mode] || MODES.classic;
const grid = document.getElementById("grid");
const title = document.getElementById("title");
const subtitle = document.getElementById("subtitle");
const status = document.getElementById("status");
const score = document.getElementById("score");
const summary = document.getElementById("summary");
const restartButton = document.getElementById("restart");
const live = document.getElementById("live");

let deck = [];
let openCards = [];
let lock = false;
let matchedPairs = 0;
let moves = 0;
let timerId = null;
let timeLeft = mode.seconds || 0;
let roundStart = 0;
let best = null;

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function buildDeck() {
  deck = pairSet(mode.pairCount)
    .map((number, index) => ({
      id: `${number}-${index}`,
      number,
      tile: tileForNumber(number),
      matched: false,
      open: false
    }));
}

function setStatus(message) {
  status.textContent = message;
}

function renderTopline() {
  title.textContent = mode.title;
  subtitle.textContent = mode.subtitle;
  summary.textContent = mode.summaryLabel;
  document.title = mode.title;
  document.body.dataset.accent = mode.accent;
}

function renderMetrics() {
  if (mode.timer) {
    score.textContent = `${formatSeconds(timeLeft)} restantes`;
  } else {
    score.textContent = `${moves} intentos`;
  }
  live.textContent = `${matchedPairs}/${mode.pairCount}`;
}

function renderGrid() {
  grid.style.setProperty("--columns", mode.columns);
  grid.innerHTML = "";
  deck.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.index = String(index);
    button.setAttribute("aria-label", `Carta ${card.number}`);
    button.innerHTML = `
      <span class="card-face card-back">
        <span class="back-badge">?</span>
      </span>
      <span class="card-face card-front">
        <img src="${card.tile.src}" alt="${card.tile.name}">
        <strong>${card.number}</strong>
      </span>
    `;
    if (card.open || card.matched) button.classList.add("is-open");
    if (card.matched) button.classList.add("is-matched");
    button.addEventListener("click", () => chooseCard(index));
    grid.appendChild(button);
  });
}

function updateCard(index) {
  const button = grid.querySelector(`[data-index="${index}"]`);
  const card = deck[index];
  if (!button || !card) return;
  button.classList.toggle("is-open", card.open || card.matched);
  button.classList.toggle("is-matched", card.matched);
}

function startTimer() {
  clearInterval(timerId);
  if (!mode.timer) return;
  timeLeft = mode.seconds;
  timerId = setInterval(() => {
    if (matchedPairs >= mode.pairCount) {
      clearInterval(timerId);
      return;
    }
    timeLeft -= 1;
    renderMetrics();
    if (timeLeft <= 0) {
      clearInterval(timerId);
      timeLeft = 0;
      setStatus("Se acabo el tiempo. Volve a intentarlo.");
      revealAll(false);
      lock = true;
      saveGameStats(mode.gameId, {
        lastResult: "time-out",
        lastMoves: moves,
        lastDuration: mode.seconds,
        bestTime: best?.time || null
      }).catch(console.error);
    }
  }, 1000);
}

function revealAll(value) {
  deck.forEach((card, index) => {
    card.open = value;
    updateCard(index);
  });
}

async function finishRound() {
  clearInterval(timerId);
  const elapsed = Math.max(1, Math.round((Date.now() - roundStart) / 1000));
  setStatus(mode.timer ? `Ganaste en ${elapsed}s y ${moves} intentos.` : `Ganaste con ${moves} intentos.`);
  if (!best || (mode.timer ? elapsed < best.time : moves < best.moves)) {
    best = mode.timer ? { time: elapsed, moves } : { moves, time: elapsed };
  }
  await saveGameStats(mode.gameId, {
    completed: true,
    lastCompletedAt: Date.now(),
    lastMoves: moves,
    lastTime: elapsed,
    bestMoves: best?.moves || null,
    bestTime: best?.time || null
  }).catch(console.error);
}

function resetRound() {
  buildDeck();
  openCards = [];
  lock = false;
  matchedPairs = 0;
  moves = 0;
  roundStart = Date.now();
  timeLeft = mode.seconds || 0;
  setStatus("Dale vuelta a dos tiles y buscá la pareja.");
  renderGrid();
  renderMetrics();
  startTimer();
  if (mode.timer) {
    setStatus(`Tenes ${formatSeconds(timeLeft)} para completar el tablero.`);
  }
}

async function chooseCard(index) {
  const card = deck[index];
  if (lock || !card || card.matched || card.open) return;
  card.open = true;
  updateCard(index);
  openCards.push(index);

  if (openCards.length < 2) return;
  lock = true;
  moves += 1;
  renderMetrics();

  const [firstIndex, secondIndex] = openCards;
  const first = deck[firstIndex];
  const second = deck[secondIndex];
  if (first.number === second.number) {
    first.matched = true;
    second.matched = true;
    matchedPairs += 1;
    openCards = [];
    lock = false;
    renderMetrics();
    updateCard(firstIndex);
    updateCard(secondIndex);
    if (matchedPairs === mode.pairCount) {
      await finishRound();
    }
    return;
  }

  setTimeout(() => {
    first.open = false;
    second.open = false;
    updateCard(firstIndex);
    updateCard(secondIndex);
    openCards = [];
    lock = false;
  }, 800);
}

restartButton.addEventListener("click", resetRound);

watchUser((user) => {
  if (user) {
    status.textContent = user.emailVerified ? "Guardando en Firebase" : "Conectado, email pendiente";
  } else {
    status.textContent = "Juego listo sin cuenta";
  }
});

renderTopline();
resetRound();
