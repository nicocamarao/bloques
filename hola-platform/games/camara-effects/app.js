import { bootstrapProfile, onProfileChange } from "../../shared/social.js";
import { db } from "../../shared/firebase.js";
import { onValue, push, ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const captureBtn = document.getElementById("captureBtn");
const effectEl = document.getElementById("effect");
const intensityEl = document.getElementById("intensity");
const glowEl = document.getElementById("glow");
const statusEl = document.getElementById("status");
const statusDetailEl = document.getElementById("statusDetail");
const snapshotEl = document.getElementById("snapshot");
const swatchesEl = document.getElementById("swatches");
const capturesListEl = document.getElementById("capturesList");

const EFFECTS = {
  none: { label: "Normal", info: "Sin filtro, solo video limpio.", css: "none" },
  grayscale: { label: "Blanco y negro", info: "Escala de grises.", css: "grayscale(1)" },
  sepia: { label: "Sepia", info: "Tono cálido tipo foto vieja.", css: "sepia(1)" },
  contrast: { label: "Contraste fuerte", info: "Sube contraste y presencia.", css: "contrast(1.6)" },
  blur: { label: "Blur suave", info: "Desenfoque leve.", css: "blur(2px)" },
  invert: { label: "Invertido", info: "Colores invertidos.", css: "invert(1)" },
  hue: { label: "Color girado", info: "Rota el tono del video.", css: "hue-rotate(160deg)" },
};

const palette = ["#7ca8ff", "#66e3c0", "#ffb86b", "#ff8fa3", "#9aa8c7"];

let stream = null;
let rafId = 0;
let me = null;
let capturesUnsub = null;

function setStatus(title, detail = "") {
  statusEl.textContent = title;
  statusDetailEl.textContent = detail;
}

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  overlay.width = Math.max(1, Math.round(rect.width));
  overlay.height = Math.max(1, Math.round(rect.height));
}

function stopCamera() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  video.srcObject = null;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  setStatus("Cámara detenida.", "Podés volver a prenderla cuando quieras.");
}

function renderFrame() {
  if (!stream || video.readyState < 2) {
    rafId = requestAnimationFrame(renderFrame);
    return;
  }

  resizeCanvas();
  const effect = EFFECTS[effectEl.value] || EFFECTS.none;
  const intensity = Number(intensityEl.value) / 100;
  const glow = Number(glowEl.value);

  video.style.filter = `${effect.css} saturate(${1 + intensity * 0.75}) brightness(${1 + intensity * 0.08})`;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (glow > 0) {
    ctx.save();
    ctx.shadowColor = palette[Math.floor(Date.now() / 400) % palette.length];
    ctx.shadowBlur = glow;
    ctx.strokeStyle = palette[Math.floor(Date.now() / 800) % palette.length];
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, overlay.width - 24, overlay.height - 24);
    ctx.restore();
  }
  rafId = requestAnimationFrame(renderFrame);
}

async function startCamera() {
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    video.srcObject = stream;
    await video.play();
    setStatus("Cámara activa.", "Elegí un efecto y guardá capturas para tu sesión.");
    renderFrame();
  } catch (error) {
    console.error(error);
    setStatus("No se pudo abrir la cámara.", "Chequeá permisos del navegador.");
  }
}

async function saveShot(dataUrl) {
  if (!me?.sessionId) return false;
  const effect = EFFECTS[effectEl.value] || EFFECTS.none;
  const payload = {
    dataUrl,
    effect: effectEl.value,
    effectLabel: effect.label,
    intensity: Number(intensityEl.value),
    glow: Number(glowEl.value),
    createdAt: Date.now(),
    sessionId: me.sessionId,
    nickname: me.nickname,
    normalized: me.normalized,
  };
  await set(push(ref(db, `chat/camara-effects/${me.sessionId}/photos`)), payload);
  await set(ref(db, `chat/camara-effects/${me.sessionId}/latest`), payload);
  return true;
}

function avatarTitle(effectLabel) {
  return `Efecto: ${effectLabel}`;
}

function renderCaptures(rows) {
  capturesListEl.innerHTML = "";

  if (!rows.length) {
    capturesListEl.innerHTML = "<li class=\"meta\">Todavía no hay capturas guardadas.</li>";
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "capture-item";
    const date = row.createdAt ? new Date(row.createdAt).toLocaleString("es-UY") : "Sin fecha";
    item.innerHTML = `
      <img src="${row.dataUrl}" alt="${avatarTitle(row.effectLabel || row.effect || "captura")}">
      <div>
        <strong>${row.effectLabel || row.effect || "Captura"}</strong>
        <span>${date}</span>
      </div>
    `;
    capturesListEl.appendChild(item);
  });
}

function watchCaptures(sessionId) {
  if (capturesUnsub) {
    capturesUnsub();
    capturesUnsub = null;
  }
  if (!sessionId) {
    renderCaptures([]);
    return;
  }

  capturesUnsub = onValue(ref(db, `chat/camara-effects/${sessionId}/photos`), (snapshot) => {
    const rows = Object.values(snapshot.val() || {})
      .map((row) => ({
        ...row,
        createdAt: Number(row.createdAt || 0),
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
    renderCaptures(rows);
  });
}

function captureSnapshot() {
  if (!stream || video.videoWidth === 0) {
    setStatus("Primero activá la cámara.", "Después podés guardar la foto.");
    return;
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const captureCtx = canvas.getContext("2d");
  captureCtx.filter = video.style.filter || "none";
  captureCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  snapshotEl.src = dataUrl;
  void saveShot(dataUrl).then((ok) => {
    setStatus(ok ? "Foto guardada." : "Foto lista.", ok ? "Se guardó en Firebase para tu sesión anónima." : "No había sesión lista para guardar.");
  });
}

function drawSwatches() {
  swatchesEl.innerHTML = "";
  palette.forEach((color) => {
    const node = document.createElement("span");
    node.className = "swatch";
    node.style.background = color;
    swatchesEl.appendChild(node);
  });
}

effectEl.addEventListener("change", () => {
  const effect = EFFECTS[effectEl.value] || EFFECTS.none;
  setStatus(effect.label, effect.info);
});
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
captureBtn.addEventListener("click", captureSnapshot);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", stopCamera);

drawSwatches();
setStatus("Listo para iniciar.", "La cámara usará tu perfil anónimo persistente.");

onProfileChange((profile) => {
  me = profile;
  if (profile) {
    setStatus("Perfil listo.", `Guardando para ${profile.nickname}.`);
    watchCaptures(profile.sessionId);
  }
});

bootstrapProfile().then((profile) => {
  me = profile;
  setStatus("Perfil listo.", `Guardando para ${profile.nickname}.`);
  watchCaptures(profile.sessionId);
});
