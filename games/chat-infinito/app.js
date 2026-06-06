import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  serverTimestamp,
  onChildAdded,
  query,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDE3YreYTQrzYkLWY_E-QH_gm-kxVjwU1Y",
  authDomain: "backend-nico-6f5db.firebaseapp.com",
  databaseURL: "https://backend-nico-6f5db-default-rtdb.firebaseio.com",
  projectId: "backend-nico-6f5db",
  storageBucket: "backend-nico-6f5db.firebasestorage.app",
  messagingSenderId: "654175276624",
  appId: "1:654175276624:web:b3bc36cd0ef315da9e8b55"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messagesRef = query(ref(db, "chat/infinite/messages"), limitToLast(120));

const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const nameInput = document.getElementById("name");
const messageInput = document.getElementById("message");

let count = 0;

function renderMessage(message) {
  const el = document.createElement("div");
  el.className = "msg";
  const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "ahora";
  el.innerHTML = `<strong>${escapeHtml(message.name || "Anon")}<span class="meta">${time}</span></strong><div>${escapeHtml(message.text || "")}</div>`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

statusEl.textContent = "Conectado a Firebase";
onChildAdded(messagesRef, (snapshot) => {
  const message = snapshot.val();
  renderMessage(message);
  count += 1;
  countEl.textContent = `${count} mensajes`;
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim().slice(0, 24) || "Anon";
  const text = messageInput.value.trim().slice(0, 240);
  if (!text) return;
  await push(ref(db, "chat/infinite/messages"), {
    name,
    text,
    createdAt: Date.now(),
    serverAt: serverTimestamp()
  });
  messageInput.value = "";
  messageInput.focus();
});
