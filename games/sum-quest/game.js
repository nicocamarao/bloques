(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const WORLD_HEIGHT = 540;
  const GRAVITY = 2200;
  const MOVE_SPEED = 320;
  const JUMP_SPEED = 760;
  const PLAYER_BASE = 28;
  const BLOCK_HEIGHT = 40;
  const GATE_WIDTH = 26;
  const LEVEL_LENGTH = 1200;

  const keys = new Set();
  const mobile = { left: false, right: false, jump: false };

  const stageTemplates = [
    { target: 10, friends: [9] },
    { target: 20, friends: [4, 6] },
    { target: 30, friends: [7, 3] },
    { target: 40, friends: [2, 8] },
    { target: 50, friends: [5, 5] },
  ];

  const world = [];
  let player;
  let cameraX = 0;
  let currentStage = 0;
  let gameState = "playing";
  let winFlash = 0;
  let lastTime = performance.now();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  function makeStage(index, template) {
    const baseX = index * LEVEL_LENGTH;
    const groundY = 458;
    const gateX = baseX + LEVEL_LENGTH - 150;

    const platforms = [
      { x: baseX + 120, y: 380, w: 120, h: 18 },
      { x: baseX + 320, y: 324, w: 112, h: 18 },
      { x: baseX + 540, y: 286, w: 130, h: 18 },
      { x: baseX + 780, y: 348, w: 132, h: 18 },
    ];

    const friendLayout = [
      { x: baseX + 220, y: groundY - 40 },
      { x: baseX + 430, y: 284 },
      { x: baseX + 645, y: 246 },
      { x: baseX + 860, y: 308 },
      { x: baseX + 990, y: groundY - 40 },
    ];

    const friends = template.friends.map((value, i) => ({
      x: friendLayout[i].x,
      y: friendLayout[i].y,
      w: 32,
      h: 40,
      value,
      collected: false,
    }));

    return {
      index,
      target: template.target,
      baseX,
      groundY,
      gateX,
      platforms,
      friends,
      gateOpen: false,
      hint: `Meta ${template.target}`,
    };
  }

  function buildWorld() {
    world.length = 0;
    stageTemplates.forEach((template, index) => {
      world.push(makeStage(index, template));
    });
  }

  function resetGame() {
    buildWorld();
    currentStage = 0;
    gameState = "playing";
    winFlash = 0;
    player = {
      x: 90,
      y: 410,
      w: PLAYER_BASE,
      h: BLOCK_HEIGHT,
      vx: 0,
      vy: 0,
      total: 1,
      onGround: false,
      face: "🙂",
      coyote: 0,
    };
    syncPlayerSize();
    cameraX = 0;
  }

  function syncPlayerSize() {
    const total = player.total;
    player.w = clamp(PLAYER_BASE + total * 1.35, 28, 78);
    player.h = BLOCK_HEIGHT + Math.floor(total / 10) * 2;
  }

  function currentStageData() {
    return world[currentStage];
  }

  function isGateSatisfied(stage) {
    return player.total === stage.target;
  }

  function openGateIfReady(stage) {
    stage.gateOpen = isGateSatisfied(stage);
  }

  function jump() {
    if (player.onGround || player.coyote > 0) {
      player.vy = -JUMP_SPEED;
      player.onGround = false;
      player.coyote = 0;
    }
  }

  function getInput() {
    const left = keys.has("ArrowLeft") || keys.has("KeyA") || mobile.left;
    const right = keys.has("ArrowRight") || keys.has("KeyD") || mobile.right;
    const jumpPressed =
      keys.has("ArrowUp") || keys.has("Space") || keys.has("KeyW") || mobile.jump;
    return { left, right, jumpPressed };
  }

  function handleMovement(dt) {
    const { left, right, jumpPressed } = getInput();
    const accel = 1800;
    const friction = player.onGround ? 0.82 : 0.94;

    if (left) player.vx -= accel * dt;
    if (right) player.vx += accel * dt;
    if (!left && !right) player.vx *= friction;
    player.vx = clamp(player.vx, -MOVE_SPEED, MOVE_SPEED);

    if (jumpPressed && !player._jumpLatch) {
      jump();
      player._jumpLatch = true;
    }
    if (!jumpPressed) player._jumpLatch = false;
  }

  function moveAndCollide(dt) {
    player.x += player.vx * dt;
    resolveHorizontal();

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    player.onGround = false;
    resolveVertical();
  }

  function stagePlatforms(stage) {
    return [
      { x: stage.baseX - 1000, y: stage.groundY, w: 3000, h: 80 },
      ...stage.platforms,
    ];
  }

  function resolveHorizontal() {
    const stage = currentStageData();
    const solids = stagePlatforms(stage);
    for (const solid of solids) {
      const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectsOverlap(playerBox, solid)) {
        if (player.vx > 0) player.x = solid.x - player.w - 0.1;
        else if (player.vx < 0) player.x = solid.x + solid.w + 0.1;
        player.vx = 0;
      }
    }

    const gate = {
      x: stage.gateX,
      y: 0,
      w: GATE_WIDTH,
      h: WORLD_HEIGHT,
    };
    if (!stage.gateOpen) {
      const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectsOverlap(playerBox, gate)) {
        if (player.vx > 0) player.x = gate.x - player.w - 0.1;
        else if (player.vx < 0) player.x = gate.x + gate.w + 0.1;
        player.vx = 0;
      }
    }
  }

  function resolveVertical() {
    const stage = currentStageData();
    const solids = stagePlatforms(stage);
    for (const solid of solids) {
      const playerBox = { x: player.x, y: player.y, w: player.w, h: player.h };
      if (rectsOverlap(playerBox, solid)) {
        if (player.vy > 0) {
          player.y = solid.y - player.h - 0.1;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = solid.y + solid.h + 0.1;
          player.vy = 0;
        }
      }
    }

    player.y = clamp(player.y, -100, WORLD_HEIGHT - player.h);
  }

  function pickupFriends() {
    const stage = currentStageData();
    for (const friend of stage.friends) {
      if (friend.collected) continue;
      const playerFeet = {
        x: player.x + 2,
        y: player.y + player.h - 2,
        w: player.w - 4,
        h: 4,
      };
      const friendTop = {
        x: friend.x,
        y: friend.y,
        w: friend.w,
        h: 14,
      };

      if (rectsOverlap(playerFeet, friendTop) && player.vy >= 0) {
        friend.collected = true;
        player.total += friend.value;
        syncPlayerSize();
        player.y = friend.y - player.h - 0.1;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }

  function advanceStageIfNeeded() {
    const stage = currentStageData();
    openGateIfReady(stage);
    if (stage.gateOpen && player.x + player.w > stage.gateX + GATE_WIDTH + 8) {
      currentStage += 1;
      if (currentStage >= world.length) {
        gameState = "won";
        winFlash = 1;
        currentStage = world.length - 1;
        return;
      }
      const nextStage = currentStageData();
      player.x = nextStage.baseX + 50;
      player.y = 410;
      player.vx = 0;
      player.vy = 0;
      player.onGround = false;
      cameraX = nextStage.baseX;
    }
  }

  function update(dt) {
    if (gameState !== "playing") {
      if (gameState === "won") winFlash = Math.max(0, winFlash - dt * 0.12);
      return;
    }

    handleMovement(dt);
    moveAndCollide(dt);
    pickupFriends();
    advanceStageIfNeeded();
    cameraX += (player.x - cameraX - canvas.width / DPR / 2) * Math.min(1, dt * 3.5);
    cameraX = clamp(cameraX, currentStageData().baseX - 40, currentStageData().baseX + LEVEL_LENGTH - canvas.width / DPR + 120);
    if (player.y > WORLD_HEIGHT + 200) resetGame();
  }

  function drawBackground(stage) {
    const w = canvas.width / DPR;
    const h = canvas.height / DPR;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "#263453");
    gradient.addColorStop(0.55, "#151b2a");
    gradient.addColorStop(1, "#0d111a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(-cameraX * 0.22, 0);
    for (let i = 0; i < 16; i++) {
      const x = i * 240 + (stage.index * 180) % 260;
      ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.02})`;
      ctx.beginPath();
      ctx.ellipse(x, 110 + (i % 4) * 12, 90, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatforms(stage) {
    const h = canvas.height / DPR;
    ctx.fillStyle = "#343c4e";
    for (const solid of stagePlatforms(stage)) {
      if (solid.h < 40) {
        const x = solid.x - cameraX;
        if (x < -200 || x > canvas.width / DPR + 200) continue;
        ctx.fillStyle = "#4d5c78";
        roundRect(x, solid.y, solid.w, solid.h, 8, true);
      } else {
        ctx.fillStyle = "#233041";
        ctx.fillRect(solid.x - cameraX, solid.y, solid.w, solid.h);
        ctx.fillStyle = "#3d475a";
        ctx.fillRect(solid.x - cameraX, solid.y, solid.w, 12);
      }
    }

    const ground = stage.groundY;
    ctx.fillStyle = "#1b2333";
    ctx.fillRect(stage.baseX - cameraX - 240, ground, LEVEL_LENGTH + 480, h - ground);
    ctx.fillStyle = "#2d394d";
    ctx.fillRect(stage.baseX - cameraX - 240, ground - 10, LEVEL_LENGTH + 480, 10);
  }

  function drawGate(stage) {
    const x = stage.gateX - cameraX;
    const gateColor = stage.gateOpen ? "#62e6a2" : "#ff5c7a";
    ctx.fillStyle = gateColor;
    ctx.fillRect(x, 0, GATE_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = "rgba(6,10,16,0.4)";
    ctx.fillRect(x + 6, 0, 4, WORLD_HEIGHT);
    ctx.fillRect(x + 16, 0, 4, WORLD_HEIGHT);

    ctx.save();
    ctx.translate(x + GATE_WIDTH / 2, 78);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "#fff";
    ctx.font = "700 26px Trebuchet MS, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(stage.target), 0, 0);
    ctx.restore();
  }

  function drawFriends(stage) {
    for (const friend of stage.friends) {
      if (friend.collected) continue;
      drawNumberBlock(friend.x - cameraX, friend.y, friend.w, friend.h, friend.value, "#ffd166", "#3b2500");
    }
  }

  function drawPlayer() {
    drawNumberBlock(player.x - cameraX, player.y, player.w, player.h, player.total, "#5ad7ff", "#053447", true);
  }

  function drawNumberBlock(x, y, w, h, value, fill, shadow, isHero = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(0, 0, w, h, 10, true, fill);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = shadow;
    ctx.fillRect(w * 0.2, h * 0.28, 4, 4);
    ctx.fillRect(w * 0.65, h * 0.28, 4, 4);
    ctx.fillRect(w * 0.28, h * 0.58, w * 0.44, 4);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(3, 3, w - 6, 7);

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.max(14, Math.min(24, h * 0.5))}px Trebuchet MS, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), w / 2, h / 2 + 1);

    ctx.fillStyle = isHero ? "#fff" : "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(w * 0.33, h * 0.36, 2.3, 0, Math.PI * 2);
    ctx.arc(w * 0.67, h * 0.36, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function roundRect(x, y, w, h, r, fill = false, fillStyle = null) {
    if (fillStyle) ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
  }

  function drawHUD(stage) {
    const w = canvas.width / DPR;
    const lineX = 18;
    const lineY = 24;
    ctx.save();
    ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
    roundRect(14, 14, 290, 118, 18, true, "rgba(8, 12, 20, 0.55)");
    ctx.fillStyle = "#f5f7ff";
    ctx.font = "700 18px Trebuchet MS, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Escenario ${stage.index + 1} / ${world.length}`, lineX, lineY + 8);
    ctx.font = "600 15px Trebuchet MS, sans-serif";
    ctx.fillText(`Suma actual: ${player.total}`, lineX, lineY + 36);
    ctx.fillText(`Muros: 10, 20, 30, 40 y 50`, lineX, lineY + 58);
    ctx.fillText(`Meta del muro: ${stage.target}`, lineX, lineY + 80);
    ctx.fillText(`Amigos restantes: ${stage.friends.filter((f) => !f.collected).length}`, lineX, lineY + 102);
    ctx.restore();

    if (gameState === "won") {
      ctx.save();
      ctx.globalAlpha = 0.88 + Math.sin(performance.now() * 0.008) * 0.08;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      roundRect(w / 2 - 170, 54, 340, 92, 20, true, "rgba(0,0,0,0.45)");
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 30px Trebuchet MS, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("¡Juego completado!", w / 2, 96);
      ctx.font = "600 16px Trebuchet MS, sans-serif";
      ctx.fillText("Llegaste a 50 sumando a todos los amigos.", w / 2, 124);
      ctx.restore();
    }
  }

  function render() {
    const stage = currentStageData();
    drawBackground(stage);
    drawPlatforms(stage);
    drawGate(stage);
    drawFriends(stage);
    drawPlayer();
    drawHUD(stage);

    if (gameState !== "playing") {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${winFlash})`;
      ctx.fillRect(0, 0, canvas.width / DPR, canvas.height / DPR);
      ctx.restore();
    }
  }

  function loop(now) {
    const dt = Math.min(0.032, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * DPR));
    canvas.height = Math.max(1, Math.floor(rect.height * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    if (e.code === "KeyR") resetGame();
    if (["ArrowUp", "Space", "ArrowLeft", "ArrowRight", "KeyA", "KeyD", "KeyW"].includes(e.code)) {
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    const action = button.dataset.action;
    const down = () => {
      mobile[action] = true;
      if (action === "jump") setTimeout(() => (mobile.jump = false), 120);
    };
    const up = () => {
      mobile[action] = false;
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointerleave", up);
    button.addEventListener("pointercancel", up);
  });

  resize();
  resetGame();
  requestAnimationFrame(loop);
})();
