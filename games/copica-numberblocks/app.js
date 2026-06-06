import { watchUser, saveGameStats } from "../firebase-shared.js";
import { NUMBERBLOCKS, shuffle } from "../numberblocks-data.js";

const sequenceEl = document.getElementById("sequence");
const padEl = document.getElementById("pad");
const roundEl = document.getElementById("round");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");
const saveEl = document.getElementById("save");
const startButton = document.getElementById("start");
const resetButton = document.getElementById("reset");

const tiles = NUMBERBLOCKS.slice(0, 4);
let sequence = [];
let inputIndex = 0;
let round = 0;
let best = 0;
let playing = false;
let showing = false;
let timeouts = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function renderStats() {
  roundEl.textContent = String(round);
  bestEl.textContent = String(best);
}

function clearTimers() {
  timeouts.forEach(clearTimeout);
  timeouts = [];
}

function renderSequence() {
  sequenceEl.innerHTML = "";
  sequence.forEach((value, index) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.index = String(index);
    const tile = tiles.find((item) => item.number === value) || tiles[0];
    slot.innerHTML = `<img src="${tile.src}" alt="${tile.name}">`;
    sequenceEl.appendChild(slot);
  });
}

function flashSlot(index) {
  const slot = sequenceEl.querySelector(`[data-index="${index}"]`);
  if (!slot) return;
  slot.classList.add("on");
  const handle = setTimeout(() => slot.classList.remove("on"), 380);
  timeouts.push(handle);
}

function showSequence() {
  clearTimers();
  showing = true;
  inputIndex = 0;
  setStatus("Mirá y copiala.");
  renderSequence();
  sequence.forEach((_, index) => {
    const delay = 420 * (index + 1);
    timeouts.push(setTimeout(() => flashSlot(index), delay));
  });
  timeouts.push(setTimeout(() => {
    showing = false;
    playing = true;
    setStatus("Tu turno.");
  }, 420 * (sequence.length + 1)));
}

function nextRound() {
  sequence = [...sequence, tiles[round % tiles.length].number];
  round += 1;
  renderStats();
  renderSequence();
  showSequence();
}

async function finishGame(reason) {
  playing = false;
  showing = false;
  setStatus(reason);
  renderStats();
  await saveGameStats("copica-numberblocks", {
    bestRound: best,
    lastRound: best,
    lastResult: reason,
    updatedAt: Date.now()
  }).catch(console.error);
  saveEl.textContent = "Guardado en Firebase";
}

function resetGame() {
  clearTimers();
  sequence = [];
  inputIndex = 0;
  round = 0;
  playing = false;
  showing = false;
  renderSequence();
  renderStats();
  setStatus("Listo para arrancar.");
  saveEl.textContent = "Esperando cuenta";
}

function handlePick(number) {
  if (!playing || showing) return;
  const expected = sequence[inputIndex];
  const tileButton = padEl.querySelector(`[data-number="${number}"]`);
  if (tileButton) {
    tileButton.classList.add("active");
    const handle = setTimeout(() => tileButton.classList.remove("active"), 160);
    timeouts.push(handle);
  }
  if (number !== expected) {
    finishGame(`Fallaste en la ronda ${round}.`).catch(console.error);
    return;
  }
  inputIndex += 1;
  if (inputIndex >= sequence.length) {
    best = Math.max(best, round);
    renderStats();
    if (round >= 12) {
      finishGame(`Ganaste con ${round} rondas seguidas.`).catch(console.error);
      return;
    }
    playing = false;
    setStatus("Bien. Sube una ronda mas.");
    timeouts.push(setTimeout(() => nextRound(), 650));
  }
}

function renderPad() {
  padEl.innerHTML = "";
  tiles.forEach((tile) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile";
    button.dataset.number = String(tile.number);
    button.innerHTML = `<img src="${tile.src}" alt="${tile.name}"><strong>${tile.number}</strong>`;
    button.addEventListener("click", () => handlePick(tile.number));
    padEl.appendChild(button);
  });
}

startButton.addEventListener("click", () => {
  if (playing || showing) return;
  sequence = [];
  round = 0;
  best = Math.max(best, 0);
  renderStats();
  nextRound();
});

resetButton.addEventListener("click", resetGame);

watchUser((user) => {
  saveEl.textContent = user ? "Listo para guardar" : "Sesion local";
});

renderPad();
resetGame();
