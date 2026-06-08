import { watchUser, saveGameStats, db, auth } from "../firebase-shared.js";
import { ref, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const boardEl = document.getElementById("board");
const turnEl = document.getElementById("turn");
const statusEl = document.getElementById("status");
const saveEl = document.getElementById("save");
const restartButton = document.getElementById("restart");
const swapButton = document.getElementById("swap");

const players = {
  a: {
    name: "One",
    tile: "https://static.wikia.nocookie.net/numberblocks/images/2/21/DiaOne.png/revision/latest/scale-to-width-down/112?cb=20250709141239"
  },
  b: {
    name: "Two",
    tile: "https://static.wikia.nocookie.net/numberblocks/images/1/1f/DiaTwo.png/revision/latest/scale-to-width-down/112?cb=20250709141325"
  }
};

const wins = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

let board = Array(9).fill(null);
let current = "a";
let firstPlayer = "a";
let locked = false;

function renderBoard() {
  boardEl.innerHTML = "";
  board.forEach((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cell";
    button.dataset.index = String(index);
    if (value) {
      button.classList.add("is-set");
      button.dataset.player = value;
      button.innerHTML = `<span><img src="${players[value].tile}" alt="${players[value].name}"></span>`;
    } else {
      button.innerHTML = `<span></span>`;
    }
    button.addEventListener("click", () => play(index));
    boardEl.appendChild(button);
  });
}

function setStatus(message) {
  statusEl.textContent = message;
}

function updateTurn() {
  turnEl.textContent = players[current].name;
}

function finishLine(line, winner) {
  line.forEach((index) => {
    const cell = boardEl.querySelector(`[data-index="${index}"]`);
    if (cell) cell.classList.add("is-win");
  });
  setStatus(`Ganó ${players[winner].name}.`);
}

function checkWinner() {
  for (const line of wins) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  return null;
}

async function recordOutcome(outcome) {
  const user = auth.currentUser;
  if (!user) {
    saveEl.textContent = "Sesion local";
    return;
  }
  saveEl.textContent = "Guardando...";
  await runTransaction(ref(db, `users/${user.uid}/games/tateti-numberblocks/summary`), (currentValue) => {
    const data = currentValue || { plays: 0, aWins: 0, bWins: 0, draws: 0 };
    data.plays += 1;
    if (outcome === "a") data.aWins += 1;
    else if (outcome === "b") data.bWins += 1;
    else data.draws += 1;
    data.lastOutcome = outcome;
    data.updatedAt = Date.now();
    return data;
  });
  saveEl.textContent = "Guardado en Firebase";
}

async function endRound(outcome, line = null) {
  locked = true;
  if (line) finishLine(line, outcome);
  else setStatus("Empate. Quedo la mesa completa.");
  await recordOutcome(outcome);
  await saveGameStats("tateti-numberblocks", {
    lastOutcome: outcome,
    lastWinner: outcome === "draw" ? null : outcome,
    completedAt: Date.now()
  }).catch(console.error);
}

async function play(index) {
  if (locked || board[index]) return;
  board[index] = current;
  renderBoard();
  const result = checkWinner();
  if (result) {
    await endRound(result.winner, result.line);
    return;
  }
  if (board.every(Boolean)) {
    await endRound("draw");
    return;
  }
  current = current === "a" ? "b" : "a";
  updateTurn();
  setStatus(`Turno de ${players[current].name}.`);
}

function resetGame() {
  board = Array(9).fill(null);
  current = firstPlayer;
  locked = false;
  setStatus(`Turno de ${players[current].name}.`);
  updateTurn();
  renderBoard();
}

restartButton.addEventListener("click", resetGame);
swapButton.addEventListener("click", () => {
  firstPlayer = firstPlayer === "a" ? "b" : "a";
  resetGame();
});

watchUser((user) => {
  saveEl.textContent = user ? "Listo para guardar" : "Sesion local";
});

resetGame();
