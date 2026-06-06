import { db } from "../firebase-shared.js";
import {
  bootstrapNickname,
  changeNickname,
  ensureDirectThread,
  loadThreadForPair,
  normalizeNickname,
  pushDirectMessage,
  sendPresenceHeartbeat,
  threadKeyForPair,
  watchPeople,
} from "../chat-identity.js";
import {
  onValue,
  push,
  query,
  ref,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const statusEl = document.getElementById("status");
const countEl = document.getElementById("count");
const currentNickEl = document.getElementById("current-nick");
const peopleListEl = document.getElementById("people-list");
const searchPeerEl = document.getElementById("search-peer");
const currentPeerEl = document.getElementById("current-peer");
const threadTitleEl = document.getElementById("thread-title");
const messagesEl = document.getElementById("messages");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("message");
const nicknameForm = document.getElementById("nickname-form");
const nicknameInput = document.getElementById("nickname-input");
const nicknameHintEl = document.getElementById("nickname-hint");
const refreshThreadButton = document.getElementById("refresh-thread");

let me = null;
let people = [];
let selectedPeer = null;
let currentThreadKey = null;
let messagesUnsubscribe = null;
let threadMessages = [];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatTime(timestamp) {
  if (!timestamp) return "ahora";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessages() {
  messagesEl.innerHTML = "";
  if (!selectedPeer) {
    messagesEl.innerHTML = `<div class="empty-state">Elegí una persona de la lista o buscá por nickname para arrancar un chat privado.</div>`;
    return;
  }
  if (!threadMessages.length) {
    messagesEl.innerHTML = `<div class="empty-state">Todavia no hay mensajes en este hilo. Mandá el primero.</div>`;
    return;
  }

  for (const message of threadMessages) {
    const mine = message.senderNormalized === me.normalized;
    const item = document.createElement("article");
    item.className = `bubble${mine ? " mine" : ""}`;
    item.innerHTML = `
      <strong>${escapeHtml(message.sender)}<span class="meta">${formatTime(message.createdAt)}</span></strong>
      <p>${escapeHtml(message.text)}</p>
    `;
    messagesEl.appendChild(item);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPeopleList() {
  const queryText = normalizeNickname(searchPeerEl.value);
  const list = people
    .filter((person) => person.normalized !== me?.normalized)
    .filter((person) => !queryText || person.normalized.includes(queryText) || person.nickname.toLowerCase().includes(searchPeerEl.value.toLowerCase()))
    .slice(0, 24);

  countEl.textContent = String(people.length);
  peopleListEl.innerHTML = "";

  if (!list.length) {
    peopleListEl.innerHTML = `<li><span>No hay personas que coincidan.</span></li>`;
    return;
  }

  for (const person of list) {
    const li = document.createElement("li");
    li.className = person.normalized === me.normalized ? "me" : "";
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(person.nickname)}</strong>
        <span>${person.online ? "en linea" : "visto hace poco"}</span>
      </div>
      <button type="button" data-client-id="${person.clientId}">Chat</button>
    `;
    li.querySelector("button").addEventListener("click", () => startChatWith(person));
    peopleListEl.appendChild(li);
  }
}

function updateThreadHeader() {
  if (!selectedPeer) {
    threadTitleEl.textContent = "Elegí alguien para empezar";
    currentPeerEl.textContent = "Nadie seleccionado";
    return;
  }
  threadTitleEl.textContent = `Chat con ${selectedPeer.nickname}`;
  currentPeerEl.textContent = selectedPeer.nickname;
}

function syncNicknameEditor() {
  nicknameInput.value = me.nickname;
  currentNickEl.textContent = me.nickname;
}

function bindMessages(threadKey) {
  if (messagesUnsubscribe) {
    messagesUnsubscribe();
    messagesUnsubscribe = null;
  }

  threadMessages = [];
  currentThreadKey = threadKey;
  const messagesRef = query(ref(db, `chat/direct/${threadKey}/messages`), limitToLast(120));
  messagesUnsubscribe = onValue(messagesRef, (snapshot) => {
    const messages = snapshot.val() || {};
    threadMessages = Object.entries(messages)
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    renderMessages();
  });
}

async function startChatWith(person) {
  if (!person || person.normalized === me.normalized) return;
  selectedPeer = person;
  updateThreadHeader();
  const thread = await ensureDirectThread(me, person);
  bindMessages(thread.key);
  nicknameHintEl.textContent = `Conversando con ${person.nickname}. Si cambia su nick, el hilo se renombra solo.`;
}

async function refreshConversation() {
  if (!selectedPeer) return;
  const resolved = people.find((person) => person.clientId === selectedPeer.clientId);
  if (resolved) {
    selectedPeer = resolved;
    updateThreadHeader();
    const thread = await ensureDirectThread(me, resolved);
    if (thread.key !== currentThreadKey) bindMessages(thread.key);
  }
}

function wirePresence() {
  watchPeople((nextPeople) => {
    people = nextPeople;
    countEl.textContent = String(people.length);
    const updatedMe = people.find((person) => person.normalized === me.normalized);
    if (updatedMe) {
      me = updatedMe;
      syncNicknameEditor();
    }

    if (selectedPeer) {
      const resolved = people.find((person) => person.clientId === selectedPeer.clientId);
      if (resolved) {
        const expectedKey = threadKeyForPair(me.normalized, resolved.normalized);
        selectedPeer = resolved;
        updateThreadHeader();
        if (currentThreadKey !== expectedKey) {
          ensureDirectThread(me, resolved).then((thread) => bindMessages(thread.key)).catch(() => {});
        }
      }
    }

    renderPeopleList();
  });
}

async function bootstrap() {
  me = await bootstrapNickname();
  syncNicknameEditor();
  statusEl.textContent = "Tu nick quedó reservado";
  nicknameHintEl.textContent = "Cambialo cuando quieras. Se guarda en esta sesión y también actualiza los hilos.";
  wirePresence();
  renderPeopleList();
}

nicknameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextNick = nicknameInput.value.trim();
  if (!nextNick) return;
  try {
    const updated = await changeNickname(nextNick);
    me = { ...me, ...updated, nickname: updated.nickname, normalized: updated.normalized };
    syncNicknameEditor();
    statusEl.textContent = "Nickname actualizado";
    nicknameHintEl.textContent = `Ahora sos ${updated.nickname}. Los chats se renombraron en la base.`;
    if (selectedPeer) {
      const resolved = people.find((person) => person.clientId === selectedPeer.clientId);
      if (resolved) {
        const thread = await ensureDirectThread(me, resolved);
        bindMessages(thread.key);
      }
    }
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo cambiar el nickname.";
  }
});

searchPeerEl.addEventListener("input", renderPeopleList);
refreshThreadButton.addEventListener("click", refreshConversation);

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedPeer) {
    statusEl.textContent = "Elegí alguien para mandar un mensaje.";
    return;
  }

  const text = messageInput.value.trim().slice(0, 240);
  if (!text) return;

  const resolvedPeer = people.find((person) => person.clientId === selectedPeer.clientId);
  if (!resolvedPeer) {
    statusEl.textContent = "Ese nickname ya no existe o cambió. Elegí otra persona.";
    return;
  }

  const thread = await ensureDirectThread(me, resolvedPeer);
  const message = {
    sender: me.nickname,
    senderNormalized: me.normalized,
    text,
    createdAt: Date.now()
  };
  const messageId = push(ref(db, `chat/direct/${thread.key}/messages`)).key;
  await pushDirectMessage(thread.key, messageId, message);
  messageInput.value = "";
  messageInput.focus();
  statusEl.textContent = `Mensaje enviado a ${resolvedPeer.nickname}`;
});

setInterval(() => {
  if (!me) return;
  sendPresenceHeartbeat(me).catch(() => {});
}, 15000);

window.addEventListener("beforeunload", () => {
  if (!me) return;
  sendPresenceHeartbeat(me, { online: false }).catch(() => {});
});

bootstrap().catch((error) => {
  statusEl.textContent = error.message || "No se pudo iniciar el chat.";
});
