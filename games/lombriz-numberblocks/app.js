import { watchUser, saveGameStats } from "../firebase-shared.js";
import { tileForNumber, shuffle } from "../numberblocks-data.js";

const boardEl = document.getElementById("board");
const lengthEl = document.getElementById("length");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");
const saveEl = document.getElementById("save");
const restartButton = document.getElementById("restart");
const pauseButton = document.getElementById("pause");
const padButtons = document.querySelectorAll("[data-dir]");

const size = 10;
const maxLength = 12;
const cells = [];
let snake = [];
let food = null;
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let timer = null;
let paused = false;
let best = 1;
let alive = true;

for (let i = 0; i < size * size; i += 1) {
  const cell = document.createElement("div");
  cell.className = "cell";
  boardEl.appendChild(cell);
  cells.push(cell);
}

function setStatus(text) {
  statusEl.textContent = text;
}

function indexOf(point) {
  return point.y * size + point.x;
}

function samePoint(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function render() {
  cells.forEach((cell) => {
    cell.className = "cell";
    cell.innerHTML = "";
  });

  snake.forEach((segment, index) => {
    const cell = cells[indexOf(segment)];
    if (!cell) return;
    cell.classList.add(index === 0 ? "head" : "body");
    const tile = tileForNumber(index + 1);
    cell.innerHTML = `<img src="${tile.src}" alt="${tile.name}">`;
  });

  if (food) {
    const cell = cells[indexOf(food)];
    if (cell) {
      cell.classList.add("food");
      const tile = tileForNumber(snake.length + 1);
      cell.innerHTML = `<img src="${tile.src}" alt="${tile.name}">`;
    }
  }

  lengthEl.textContent = String(snake.length);
  bestEl.textContent = String(best);
}

function placeFood() {
  const open = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const point = { x, y };
      if (!snake.some((segment) => samePoint(segment, point))) {
        open.push(point);
      }
    }
  }
  food = open[Math.floor(Math.random() * open.length)] || null;
}

function resetGame() {
  snake = [{ x: 4, y: 5 }];
  direction = { x: 1, y: 0 };
  nextDirection = { x: 1, y: 0 };
  paused = false;
  alive = true;
  pauseButton.textContent = "Pausar";
  setStatus("Listo para mover.");
  placeFood();
  render();
  clearInterval(timer);
  timer = setInterval(tick, 180);
}

function gameOver(message) {
  alive = false;
  clearInterval(timer);
  best = Math.max(best, snake.length);
  render();
  setStatus(message);
  saveGameStats("lombriz-numberblocks", {
    bestLength: best,
    lastLength: snake.length,
    lastResult: message,
    updatedAt: Date.now()
  }).catch(console.error);
  saveEl.textContent = "Guardado en Firebase";
}

async function winGame() {
  alive = false;
  clearInterval(timer);
  best = Math.max(best, snake.length);
  render();
  setStatus("Llegaste a Twelve. Ganaste.");
  await saveGameStats("lombriz-numberblocks", {
    bestLength: best,
    lastLength: snake.length,
    lastResult: "win",
    completedAt: Date.now()
  }).catch(console.error);
  saveEl.textContent = "Guardado en Firebase";
}

function tick() {
  if (!alive || paused) return;
  direction = nextDirection;
  const head = snake[0];
  const next = { x: head.x + direction.x, y: head.y + direction.y };
  if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) {
    gameOver("Te chocaste con una pared.");
    return;
  }
  if (snake.some((segment) => samePoint(segment, next))) {
    gameOver("Te chocaste con tu propio cuerpo.");
    return;
  }
  snake.unshift(next);
  if (food && samePoint(next, food)) {
    best = Math.max(best, snake.length);
    if (snake.length >= maxLength) {
      render();
      winGame().catch(console.error);
      return;
    }
    placeFood();
  } else {
    snake.pop();
  }
  render();
}

function setDirection(dir) {
  const next = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  }[dir];
  if (!next) return;
  if (direction.x + next.x === 0 && direction.y + next.y === 0) return;
  nextDirection = next;
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") setDirection("up");
  if (event.key === "ArrowDown") setDirection("down");
  if (event.key === "ArrowLeft") setDirection("left");
  if (event.key === "ArrowRight") setDirection("right");
  if (event.key === " ") {
    event.preventDefault();
    paused = !paused;
    pauseButton.textContent = paused ? "Seguir" : "Pausar";
    setStatus(paused ? "Pausado." : "En marcha.");
  }
});

padButtons.forEach((button) => {
  button.addEventListener("click", () => setDirection(button.dataset.dir));
});

restartButton.addEventListener("click", resetGame);
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Seguir" : "Pausar";
  setStatus(paused ? "Pausado." : "En marcha.");
});

watchUser((user) => {
  saveEl.textContent = user ? "Listo para guardar" : "Sesion local";
});

resetGame();
