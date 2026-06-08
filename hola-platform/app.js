import "./shared/site.js";
import { blockForNumber } from "./shared/numberblocks.js";

const main = document.getElementById("site-main");

const games = [
  {
    id: "mini-territorio",
    title: "Mini territorio de amigos",
    href: "./games/mini-territorio/index.html",
    description: "Conquista el mapa con toques, cubre casillas y domina el tablero.",
    kind: "numberblocks",
    number: 5,
    accent: "territorio",
    category: "Aventura",
    preview: { kind: "emoji", value: "🧱" },
  },
  {
    id: "mundo-fiuma",
    title: "Mundo Fiuma",
    href: "./games/mundo-fiuma/index.html",
    description: "El mundo principal en tiempo real, con chat, movimiento y presencia viva.",
    kind: "symbol",
    symbol: "🌍",
    accent: "mundo",
    category: "Mundo",
    preview: { kind: "emoji", value: "🌍" },
  },
  {
    id: "mundo-fiuma-2",
    title: "Mundo Fiuma 2",
    href: "./games/mundo-fiuma-2/index.html",
    description: "Una torre vertical donde Fiuma 2 vive en el mismo lenguaje que Numberblocks Subida.",
    kind: "symbol",
    symbol: "🧍",
    accent: "mundo",
    category: "Mundo",
    preview: { kind: "emoji", value: "🧍" },
  },
  {
    id: "pasa-la-lista",
    title: "Pasa La Lista",
    href: "./games/pasa-la-lista/index.html",
    description: "Toma selfies, guarda rostros por nombre y marca asistencia con reconocimiento facial.",
    kind: "symbol",
    symbol: "📷",
    accent: "utilidad",
    category: "Utilidades",
    preview: { kind: "emoji", value: "📷" },
  },
  {
    id: "mundo-numberblocks",
    title: "Mundo Numberblocks",
    href: "./games/mundo-numberblocks/index.html",
    description: "Acompaña la suma, ajusta el recorrido y llega exacto al objetivo.",
    kind: "numberblocks",
    number: 7,
    accent: "aventura",
    category: "Aventura",
    preview: { kind: "sequence", values: [5, 5, 10] },
  },
  {
    id: "numberblocks-subida",
    title: "Numberblocks Subida",
    href: "./games/numberblocks-subida/index.html",
    description: "Sube por la ruta, suma de a poco y apunta a 100.",
    kind: "numberblocks",
    number: 10,
    accent: "subida",
    category: "Aventura",
    preview: { kind: "sequence", values: [1, 2, 10] },
  },
  {
    id: "memory-numberblocks",
    title: "Memory de Numberblocks",
    href: "./games/memory-numberblocks/index.html",
    description: "Memoria visual con Numberblocks y parejas para emparejar.",
    kind: "numberblocks",
    number: 2,
    accent: "memoria",
    category: "Memoria",
    preview: { kind: "sequence", values: [1] },
  },
  {
    id: "memory-numberblocks-dificil",
    title: "Memory de Numberblocks nivel dificil",
    href: "./games/memory-numberblocks-dificil/index.html",
    description: "La versión larga: más parejas, más tablero y cero reloj.",
    kind: "numberblocks",
    number: 8,
    accent: "memoria",
    category: "Memoria",
    preview: { kind: "sequence", values: [1, 8] },
  },
  {
    id: "eco-numberblocks",
    title: "Eco Numberblocks",
    href: "./games/eco-numberblocks/index.html",
    description: "Escucha la secuencia y repitela con toques grandes.",
    kind: "numberblocks",
    number: 4,
    accent: "memoria",
    category: "Memoria",
    preview: { kind: "sequence", values: [4, 2, 3] },
  },
  {
    id: "tateti",
    title: "Tatetí Numberblocks",
    href: "./games/tateti/index.html",
    description: "Tres en raya simple, táctil y con piezas Numberblocks.",
    kind: "numberblocks",
    number: 3,
    accent: "tablero",
    category: "Tableros",
    preview: { kind: "sequence", values: [1, 2, 3] },
  },
  {
    id: "torre-numberblocks",
    title: "Torre Numberblocks",
    href: "./games/torre-numberblocks/index.html",
    description: "Apila bloques y completa las torres exactas sin pasarte.",
    kind: "numberblocks",
    number: 6,
    accent: "tablero",
    category: "Tableros",
    preview: { kind: "sequence", values: [6, 8, 10] },
  },
  {
    id: "puentes-numberblocks",
    title: "Puentes Numberblocks",
    href: "./games/puentes-numberblocks/index.html",
    description: "Une bloques que sumen exacto y deja el mapa despejado.",
    kind: "numberblocks",
    number: 9,
    accent: "tablero",
    category: "Tableros",
    preview: { kind: "sequence", values: [9, 3, 12] },
  },
  {
    id: "copica-numberblocks",
    title: "Copica Numberblocks",
    href: "./games/copica-numberblocks/index.html",
    description: "Repite la secuencia y sigue el ritmo de colores y bloques.",
    kind: "numberblocks",
    number: 4,
    accent: "ritmo",
    category: "Ritmo",
    preview: { kind: "emoji", value: "🎵" },
  },
  {
    id: "lombriz-numberblocks",
    title: "Lombriz Numberblocks",
    href: "./games/lombriz-numberblocks/index.html",
    description: "Una lombriz más lenta, pensada para móvil y pantalla táctil.",
    kind: "numberblocks",
    number: 6,
    accent: "arcade",
    category: "Arcade",
    preview: { kind: "emoji", value: "🪱" },
  },
  {
    id: "carrera-sumas",
    title: "Carrera de Sumas",
    href: "./games/carrera-sumas/index.html",
    description: "Avanza por carriles y llega al número objetivo con el menor desvío.",
    kind: "numberblocks",
    number: 11,
    accent: "arcade",
    category: "Arcade",
    preview: { kind: "sequence", values: [11, 8, 2] },
  },
  {
    id: "clasifica-numberblocks",
    title: "Clasifica Numberblocks",
    href: "./games/clasifica-numberblocks/index.html",
    description: "Ordena bloques por rango con toques rápidos y claros.",
    kind: "numberblocks",
    number: 12,
    accent: "arcade",
    category: "Arcade",
    preview: { kind: "sequence", values: [1, 6, 12] },
  },
  {
    id: "jump-neon",
    title: "Jump Neón",
    href: "./games/jump-neon/index.html",
    description: "Salta, encadena combos y evita tocar los bloques del piso.",
    kind: "symbol",
    symbol: "↗",
    accent: "neon",
    category: "Arcade",
    preview: { kind: "emoji", value: "↗" },
  },
  {
    id: "pianito-online",
    title: "Pianito Online",
    href: "./games/pianito-online/index.html",
    description: "Un teclado táctil para tocar melodías desde el celular.",
    kind: "symbol",
    symbol: "♪",
    accent: "musica",
    category: "Utilidades",
    preview: { kind: "emoji", value: "♪" },
  },
  {
    id: "ocr-chapa-uy",
    title: "OCR de Chapa UY",
    href: "./games/ocr-chapa-uy/index.html",
    description: "Una utilidad para leer chapas, con el mismo top y chat fijo.",
    kind: "symbol",
    symbol: "UY",
    accent: "utilidad",
    category: "Utilidades",
    preview: { kind: "emoji", value: "UY" },
  },
];

function renderMedia(game) {
  if (game.preview?.kind === "sequence") {
    return `
      <div class="game-media sequence">
        ${game.preview.values.map((value) => {
          const block = blockForNumber(value);
          return `<img src="${block.src}" alt="${block.name}">`;
        }).join("")}
      </div>
    `;
  }

  if (game.preview?.kind === "emoji") {
    return `
      <div class="game-media emoji ${game.accent}">
        <span>${game.preview.value}</span>
      </div>
    `;
  }

  if (game.kind === "numberblocks") {
    const block = blockForNumber(game.number);
    return `
      <div class="game-media image">
        <img src="${block.src}" alt="${block.name}">
        <span class="game-tag">${block.name}</span>
      </div>
    `;
  }
  return `
    <div class="game-media symbol ${game.accent}">
      <span>${game.symbol}</span>
    </div>
  `;
}

function renderHome() {
  if (!main) return;

  const categories = ["Mundo", "Aventura", "Memoria", "Tableros", "Ritmo", "Arcade", "Utilidades"];

  main.innerHTML = `
    <section class="home-hero">
      <div class="hero-copy">
        <p class="eyebrow">Plataforma de juegos</p>
        <h1>Juega, chatea y salta entre mundos sin salir del sitio.</h1>
        <p class="hero-text">
          Unificamos todos los juegos en una sola experiencia: nick único por sesión, chat fijo a la izquierda,
          presencia activa y navegación rápida en el top superior.
        </p>
      </div>
      <div class="hero-panel">
        <strong>Acceso rápido</strong>
        <p>Elige un juego o sigue conversando mientras se mantiene tu presencia en Firebase.</p>
        <div class="hero-actions">
          <a class="game-action" href="./games/mini-territorio/index.html">Mini territorio</a>
          <a class="game-action" href="./games/mundo-fiuma/index.html">Mundo Fiuma</a>
          <a class="game-action" href="./games/mundo-fiuma-2/index.html">Mundo Fiuma 2</a>
          <a class="game-action" href="./games/mundo-numberblocks/index.html">Mundo Numberblocks</a>
        </div>
      </div>
    </section>

    ${categories.map((category) => {
      const categoryGames = games.filter((game) => game.category === category);
      if (!categoryGames.length) return "";
      return `
        <section class="library-group">
          <section class="library-head">
            <div>
              <p class="eyebrow">${category}</p>
              <h2>${category}</h2>
            </div>
            <p class="library-copy">${categoryGames.length} juego${categoryGames.length === 1 ? "" : "s"} listos para tocar.</p>
          </section>
          <section class="game-grid">
            ${categoryGames.map((game) => `
              <a class="game-card ${game.accent}" href="${game.href}" data-game-card="${game.id}">
                ${renderMedia(game)}
                <div class="game-copy">
                  <strong>${game.title}</strong>
                  <p>${game.description}</p>
                </div>
              </a>
            `).join("")}
          </section>
        </section>
      `;
    }).join("")}
  `;
}

document.title = "Bloques Arcade";
renderHome();
