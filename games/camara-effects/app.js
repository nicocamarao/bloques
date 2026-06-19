import { db, watchUser } from "../firebase-shared.js";
import { push, ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const statusEl = document.getElementById("status");
const statusDetailEl = document.getElementById("statusDetail");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const captureBtn = document.getElementById("captureBtn");
const effectEl = document.getElementById("effect");
const intensityEl = document.getElementById("intensity");
const glowEl = document.getElementById("glow");
const snapshotEl = document.getElementById("snapshot");
const effectInfoEl = document.getElementById("effectInfo");
const swatchesEl = document.getElementById("swatches");

let stream = null;
let rafId = 0;
let currentUser = null;

const EFFECTS = {
  none: { label: "Normal", info: "Normal: mantiene el feed limpio y natural.", css: "none" },
  grayscale: { label: "Blanco y negro", info: "Blanco y negro: deja el video en escala de grises.", css: "grayscale(1)" },
  sepia: { label: "Sepia", info: "Sepia: un look cálido, tipo foto vieja.", css: "sepia(1)" },
  contrast: { label: "Contraste fuerte", info: "Contraste fuerte: levanta brillos y sombras.", css: "contrast(1.7)" },
  blur: { label: "Blur suave", info: "Blur suave: desenfoque leve para un aire soñador.", css: "blur(2px)" },
  invert: { label: "Invertido", info: "Invertido: invierte los colores del video.", css: "invert(1)" },
  hue: { label: "Color girado", info: "Color girado: rota el tono para jugar con la paleta.", css: "hue-rotate(150deg)" },
};

const palette = ["#7fa8ff", "#66e3c0", "#ffb86b", "#ff8fa3", "#9aa8c7"];

function setStatus(title, detail = "") {
  statusEl.textContent = title;
  statusDetailEl.textContent = detail;
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
  setStatus("Cámara detenida.", "Volvé a activarla cuando quieras seguir probando efectos.");
}

function resizeCanvas() {
  const rect = video.getBoundingClientRect();
  overlay.width = Math.max(1, Math.round(rect.width));
  overlay.height = Math.max(1, Math.round(rect.height));
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
  const width = overlay.width;
  const height = overlay.height;

  video.style.filter = `${effect.css} saturate(${1 + intensity * 0.75}) brightness(${1 + intensity * 0.08})`;
  ctx.clearRect(0, 0, width, height);

  if (glow > 0) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.shadowColor = palette[Math.floor(Date.now() / 400) % palette.length];
    ctx.shadowBlur = glow;
    ctx.strokeStyle = palette[Math.floor(Date.now() / 800) % palette.length];
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, width - 24, height - 24);
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = palette[Math.floor(Date.now() / 1200) % palette.length];
  for (let i = 0; i < 4; i += 1) {
    const x = (width * ((i * 0.23) + ((Date.now() / 7000) % 1))) % width;
    const y = height * (0.18 + i * 0.18);
    ctx.beginPath();
    ctx.arc(x, y, 18 + i * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  rafId = requestAnimationFrame(renderFrame);
}

async function startCamera() {
  try {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    setStatus("Cámara activa.", "Elegí un efecto y ajustá la intensidad para jugar con el feed.");
    renderFrame();
  } catch (error) {
    console.error(error);
    setStatus("No pudimos abrir la cámara.", "Chequeá permisos del navegador y probá de nuevo.");
  }
}

function captureSnapshot() {
  if (!stream || video.videoWidth === 0) {
    setStatus("Primero activá la cámara.", "Después podés capturar el resultado del filtro.");
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
  void savePhoto(dataUrl);
  setStatus(
    "Captura lista.",
    currentUser ? "La foto se guardó automáticamente en Firebase." : "La foto quedó lista; iniciá sesión para guardarla en Firebase."
  );
}

async function savePhoto(dataUrl) {
  if (!currentUser) return false;

  const effect = EFFECTS[effectEl.value] || EFFECTS.none;
  const payload = {
    dataUrl,
    effect: effectEl.value,
    effectLabel: effect.label,
    intensity: Number(intensityEl.value),
    glow: Number(glowEl.value),
    createdAt: Date.now(),
    userUid: currentUser.uid,
    userEmail: currentUser.email || ""
  };

  try {
    await set(push(ref(db, `users/${currentUser.uid}/games/camara-effects/photos`)), payload);
    await set(ref(db, `users/${currentUser.uid}/games/camara-effects/latest`), payload);
    return true;
  } catch (error) {
    console.error(error);
    setStatus("No se pudo guardar la foto.", "Revisá tu conexión o permisos de Firebase.");
    return false;
  }
}

function updateEffectInfo() {
  const effect = EFFECTS[effectEl.value] || EFFECTS.none;
  effectInfoEl.textContent = effect.info;
}

function drawSwatches() {
  swatchesEl.innerHTML = "";
  palette.forEach((color) => {
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = color;
    swatchesEl.appendChild(swatch);
  });
}

effectEl.addEventListener("change", updateEffectInfo);
intensityEl.addEventListener("input", () => {
  updateEffectInfo();
});
glowEl.addEventListener("input", () => {
  updateEffectInfo();
});
startBtn.addEventListener("click", startCamera);
stopBtn.addEventListener("click", stopCamera);
captureBtn.addEventListener("click", captureSnapshot);
window.addEventListener("resize", resizeCanvas);
window.addEventListener("beforeunload", stopCamera);

drawSwatches();
updateEffectInfo();
setStatus("Listo para iniciar.", "Necesitás dar permiso de cámara para ver el feed en vivo.");

watchUser((user) => {
  currentUser = user;
  if (user) {
    setStatus("Usuario listo.", "Las capturas se van a guardar automáticamente en Firebase.");
  } else {
    setStatus("Sin sesión.", "Podés usar la cámara igual, pero no se van a guardar las fotos.");
  }
});
