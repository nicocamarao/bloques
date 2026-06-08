const STORAGE_KEY = "bloquesArcade.pasaLaLista.registry";
const ATTENDANCE_KEY = "bloquesArcade.pasaLaLista.attendance";
const MODELS_URL = "https://justadudewhohacks.github.io/face-api.js/models";

const video = document.getElementById("camera");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const scanButton = document.getElementById("scan-button");
const switchButton = document.getElementById("switch-button");
const saveButton = document.getElementById("save-button");
const nameInput = document.getElementById("name-input");
const capturePreview = document.getElementById("capture-preview");
const captureLabel = document.getElementById("capture-label");
const matchLabel = document.getElementById("match-label");
const modeTitle = document.getElementById("mode-title");
const savedCount = document.getElementById("saved-count");
const todayCount = document.getElementById("today-count");
const monthLabel = document.getElementById("month-label");
const calendarGrid = document.getElementById("calendar-grid");
const dayList = document.getElementById("day-list");
const prevMonth = document.getElementById("prev-month");
const nextMonth = document.getElementById("next-month");

const state = { mode: "register", stream: null, photo: "", scan: null, month: new Date() };

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function todayKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function registry() { return loadJson(STORAGE_KEY, []); }
function attendance() { return loadJson(ATTENDANCE_KEY, {}); }

async function ensureModels() {
  if (!window.faceapi) throw new Error("La libreria de rostro no cargó.");
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
  ]);
}

async function startCamera() {
  state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
  video.srcObject = state.stream;
  await video.play();
  resizeOverlay();
}

function resizeOverlay() {
  const rect = video.getBoundingClientRect();
  overlay.width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  overlay.height = Math.max(1, Math.round(rect.height * devicePixelRatio));
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
}

function clearOverlay() { const ctx = overlay.getContext("2d"); ctx.clearRect(0, 0, overlay.width, overlay.height); }

function drawBox(box, label, color = "#7ca8ff") {
  const ctx = overlay.getContext("2d");
  const scaleX = overlay.width / video.videoWidth;
  const scaleY = overlay.height / video.videoHeight;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * devicePixelRatio;
  ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);
  ctx.fillStyle = color;
  ctx.font = `${14 * devicePixelRatio}px Inter, sans-serif`;
  ctx.fillText(label, box.x * scaleX + 6, box.y * scaleY - 8);
}

async function captureDescriptor() {
  const detections = await window.faceapi.detectAllFaces(video, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
  if (!detections.length) throw new Error("No veo un rostro claro. Acercate un poco y mirá a cámara.");
  const best = detections[0];
  return {
    descriptor: Array.from(best.descriptor),
    box: best.detection.box,
    image: snapshotCanvas(),
  };
}

function snapshotCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function renderStats() {
  const reg = registry();
  const att = attendance()[todayKey()] || [];
  savedCount.textContent = String(reg.length);
  todayCount.textContent = String(att.length);
}

function renderCalendar() {
  const att = attendance();
  const month = state.month;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const start = new Date(year, monthIndex, 1 - ((first.getDay() + 6) % 7));
  monthLabel.textContent = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(month);
  calendarGrid.innerHTML = "";
  for (const label of ["L", "M", "X", "J", "V", "S", "D"]) {
    const head = document.createElement("div");
    head.className = "calendar-day";
    head.innerHTML = `<strong class="num">${label}</strong>`;
    calendarGrid.appendChild(head);
  }
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = todayKey(date);
    const list = att[key] || [];
    const cell = document.createElement("div");
    cell.className = `calendar-day${date.getMonth() === monthIndex ? "" : " muted"}${key === todayKey() ? " today" : ""}${list.length ? " has-attendance" : ""}`;
    cell.innerHTML = `<strong class="num">${date.getDate()}</strong><span>${list.length ? `${list.length} presentes` : ""}</span>`;
    cell.addEventListener("click", () => renderDayList(key));
    calendarGrid.appendChild(cell);
  }
  renderDayList(todayKey());
}

function renderDayList(key) {
  const reg = registry();
  const att = attendance()[key] || [];
  dayList.innerHTML = "";
  if (!att.length) {
    dayList.innerHTML = `<li>Ese día todavía no tiene asistencia marcada.</li>`;
    return;
  }
  const names = att.map((entry) => reg.find((person) => person.id === entry.id)?.name || entry.name);
  dayList.innerHTML = `<li><strong>${new Date(key).toLocaleDateString("es-ES")}</strong></li>` + names.map((name) => `<li>${escapeHtml(name)}</li>`).join("");
}

async function saveFace() {
  const name = nameInput.value.trim();
  if (!name) throw new Error("Escribí un nombre antes de guardar.");
  const { descriptor, image } = await captureDescriptor();
  const reg = registry();
  reg.push({ id: crypto.randomUUID(), name, descriptor, image });
  saveJson(STORAGE_KEY, reg);
  capturePreview.src = image;
  captureLabel.textContent = name;
  matchLabel.textContent = "Rostro guardado.";
  renderStats();
}

function compareDescriptor(descriptor) {
  const reg = registry();
  let best = null;
  for (const person of reg) {
    const distance = window.faceapi.euclideanDistance(descriptor, Float32Array.from(person.descriptor));
    if (!best || distance < best.distance) best = { ...person, distance };
  }
  return best && best.distance < 0.5 ? best : null;
}

async function scanFace() {
  const { descriptor, box, image } = await captureDescriptor();
  clearOverlay();
  drawBox(box, "Revisando...", "#ffd166");
  const match = compareDescriptor(descriptor);
  capturePreview.src = image;
  if (!match) {
    captureLabel.textContent = "Sin coincidencia";
    matchLabel.textContent = "No encontré un rostro guardado parecido.";
    drawBox(box, "Sin match", "#ff7a90");
    return;
  }
  const dayKey = todayKey();
  const att = attendance();
  att[dayKey] = att[dayKey] || [];
  if (!att[dayKey].some((entry) => entry.id === match.id)) att[dayKey].push({ id: match.id, name: match.name, at: Date.now() });
  saveJson(ATTENDANCE_KEY, att);
  captureLabel.textContent = match.name;
  matchLabel.textContent = `${match.name} asistió hoy.`;
  drawBox(box, match.name, "#63e6be");
  renderStats();
  renderCalendar();
}

function setMode(mode) {
  state.mode = mode;
  modeTitle.textContent = mode === "register" ? "Registrar rostro" : "Pasar lista";
  scanButton.textContent = mode === "register" ? "Sacar selfie" : "Escanear cara";
  saveButton.hidden = mode !== "register";
  nameInput.closest(".panel").hidden = false;
  matchLabel.textContent = mode === "register"
    ? "Toca una selfie para guardar un nombre."
    : "Apuntá la cámara para buscar coincidencias.";
}

scanButton.addEventListener("click", async () => {
  try {
    if (state.mode === "register") {
      const snap = await captureDescriptor();
      state.scan = snap;
      capturePreview.src = snap.image;
      captureLabel.textContent = "Selfie lista";
      matchLabel.textContent = "Escribí el nombre y guardalo.";
      clearOverlay();
      drawBox(snap.box, "Vista previa", "#7ca8ff");
      return;
    }
    await scanFace();
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo capturar la foto.";
  }
});

saveButton.addEventListener("click", async () => {
  try {
    if (state.scan) {
      const name = nameInput.value.trim();
      if (!name) throw new Error("Escribí un nombre antes de guardar.");
      const reg = registry();
      reg.push({ id: crypto.randomUUID(), name, descriptor: state.scan.descriptor, image: state.scan.image });
      saveJson(STORAGE_KEY, reg);
      renderStats();
      captureLabel.textContent = name;
      matchLabel.textContent = "Rostro guardado.";
      return;
    }
    await saveFace();
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo guardar.";
  }
});

switchButton.addEventListener("click", () => setMode(state.mode === "register" ? "attendance" : "register"));
prevMonth.addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
nextMonth.addEventListener("click", () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
window.addEventListener("resize", resizeOverlay);

async function boot() {
  try {
    await ensureModels();
    await startCamera();
    setMode("register");
    renderStats();
    renderCalendar();
    statusEl.textContent = "Cámara lista.";
  } catch (error) {
    statusEl.textContent = error.message || "No pude iniciar la cámara.";
  }
}

boot();
