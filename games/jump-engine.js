const DEFAULT_BLOCKS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function createJumpEngine(options = {}) {
  const canvas = options.canvas;
  const ctx = canvas.getContext("2d");
  const ui = options.ui ?? {};
  const config = {
    title: options.title ?? "Numberblock Jump",
    palette: options.palette ?? {},
    startValue: options.startValue ?? 1,
    blockSequence: options.blockSequence ?? DEFAULT_BLOCKS,
    speed: options.speed ?? 5.2,
    gravity: options.gravity ?? 0.55,
    jumpForce: options.jumpForce ?? 11.5,
    floorY: options.floorY ?? 360,
    blockSize: options.blockSize ?? 40,
    scoreStep: options.scoreStep ?? 10,
  };

  const state = {
    running: false,
    score: 0,
    unlocked: 1,
    current: config.startValue,
    x: 90,
    y: config.floorY - 40,
    vy: 0,
    blocks: [],
    frame: 0,
  };
  let rafId = null;

  function hue(value) {
    if (config.palette[value]) return config.palette[value];
    const h = (value * 37) % 360;
    return {
      bg: `hsl(${h} 78% 55%)`,
      fg: "#ffffff",
      border: `hsl(${h} 78% 35%)`,
    };
  }

  function resize() {
    const w = canvas.parentElement?.clientWidth || 960;
    canvas.width = Math.max(320, Math.floor(w));
    canvas.height = 420;
  }

  function spawnBlock() {
    const value = config.blockSequence[state.frame % config.blockSequence.length];
    const y = config.floorY - config.blockSize;
    state.blocks.push({
      value,
      x: canvas.width + 40,
      y,
      taken: false,
    });
  }

  function drawRoundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawBlock(x, y, size, value, accent = false) {
    const colors = hue(value);
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = accent ? colors.border : "rgba(0,0,0,0.18)";
    ctx.fillStyle = accent ? colors.bg : "rgba(255,255,255,0.08)";
    drawRoundedRect(x, y, size, size, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = accent ? "rgba(255,255,255,0.22)" : colors.border;
    ctx.stroke();
    ctx.fillStyle = colors.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${Math.max(18, Math.floor(size * 0.44))}px Inter, system-ui, sans-serif`;
    ctx.fillText(String(value), x + size / 2, y + size / 2 + 1);
    ctx.restore();
  }

  function render() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#08111f");
    bg.addColorStop(1, "#02050a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#283449";
    ctx.fillRect(0, config.floorY, w, h - config.floorY);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(i * 120, 70 + (i % 2) * 28, 60, 2);
    }
    for (const block of state.blocks) {
      drawBlock(block.x, block.y, config.blockSize, block.value, block.value <= state.unlocked);
    }
    drawBlock(state.x, state.y, 48, state.current, true);
    if (ui.score) ui.score.textContent = `Puntos: ${state.score}`;
    if (ui.unlocked) ui.unlocked.textContent = `Desbloqueado: ${state.unlocked}`;
    if (ui.title) ui.title.textContent = config.title;
    if (ui.status) ui.status.textContent = state.running ? "Corriendo" : "Listo";
  }

  function reset(startValue = config.startValue) {
    state.running = true;
    state.score = 0;
    state.unlocked = Math.max(1, startValue);
    state.current = startValue;
    state.x = 90;
    state.y = config.floorY - 40;
    state.vy = 0;
    state.blocks = [];
    state.frame = 0;
    render();
  }

  function step() {
    if (!state.running) return;
    state.frame += 1;
    if (state.frame % 55 === 0) spawnBlock();

    state.vy += config.gravity;
    state.y = Math.min(config.floorY - 40, state.y + state.vy);
    if (state.y >= config.floorY - 40) state.vy = 0;

    for (const block of state.blocks) {
      block.x -= config.speed;
      if (!block.taken) {
        const nearX = Math.abs(block.x - state.x) < 40;
        const nearY = Math.abs(block.y - state.y) < 45;
        if (nearX && nearY) {
          block.taken = true;
          state.current = block.value;
          state.score += config.scoreStep;
          state.unlocked = Math.max(state.unlocked, block.value);
        }
      }
    }
    state.blocks = state.blocks.filter((block) => block.x > -80);
    render();
    rafId = requestAnimationFrame(step);
  }

  canvas.addEventListener("pointerdown", () => {
    if (state.y >= config.floorY - 40) {
      state.vy = -config.jumpForce;
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!state.running) return;
    if (event.code === "Space" || event.code === "ArrowUp") {
      if (state.y >= config.floorY - 40) {
        state.vy = -config.jumpForce;
      }
    }
  });

  resize();
  render();

  return {
    resize,
    reset,
    start(startValue = config.startValue) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      reset(startValue);
      rafId = requestAnimationFrame(step);
    },
    render,
    state,
  };
}
