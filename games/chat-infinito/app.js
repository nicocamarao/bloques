import { db } from "../firebase-shared.js";
import {
  acceptFriendRequest,
  bootstrapNickname,
  changeNickname,
  ensureDirectThread,
  normalizeNickname,
  pushDirectMessage,
  sendFriendRequest,
  sendPresenceHeartbeat,
  updateProfilePhoto,
  threadKeyForPair,
  watchFriendRequests,
  watchFriends,
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
const friendsListEl = document.getElementById("friends-list");
const requestsListEl = document.getElementById("requests-list");
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
const friendForm = document.getElementById("friend-form");
const friendInput = document.getElementById("friend-input");
const friendHintEl = document.getElementById("friend-hint");
const profileForm = document.getElementById("profile-form");
const profilePhotoFile = document.getElementById("profile-photo-file");
const profilePhotoPreview = document.getElementById("profile-photo-preview");
const profileNameEl = document.getElementById("profile-name");
const profileSummaryEl = document.getElementById("profile-summary");

let me = null;
let people = [];
let friends = [];
let requests = [];
let selectedPeer = null;
let currentThreadKey = null;
let messagesUnsubscribe = null;
let friendsUnsubscribe = null;
let requestsUnsubscribe = null;
let threadMessages = [];
let pendingPhotoDataUrl = "";

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

function avatarFallback(name) {
  const safeName = (name || "N").slice(0, 2).toUpperCase();
  const hue = Array.from(String(name || "profile")).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},70%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 38) % 360},72%,46%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="22" fill="url(#g)"/>
      <circle cx="40" cy="33" r="13" fill="rgba(255,255,255,0.22)"/>
      <path d="M18 68c4-15 18-23 22-23s18 8 22 23" fill="rgba(255,255,255,0.18)"/>
      <text x="40" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="white">${safeName}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarSource(person) {
  return person?.photoDataUrl || avatarFallback(person?.nickname || "P");
}

async function fileToPhotoDataUrl(file) {
  if (!file) return "";
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const dx = (size - drawWidth) / 2;
  const dy = (size - drawHeight) / 2;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, dx, dy, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function syncProfileEditor() {
  nicknameInput.value = me.nickname;
  currentNickEl.textContent = me.nickname;
  profileNameEl.textContent = me.nickname;
  profileSummaryEl.textContent = `@${me.normalized}`;
  const src = pendingPhotoDataUrl || me.photoDataUrl || avatarFallback(me.nickname);
  profilePhotoPreview.src = src;
}

function personByNormalized(normalized) {
  return people.find((person) => person.normalized === normalized) || null;
}

function friendByNormalized(normalized) {
  return friends.find((friend) => friend.friendNormalized === normalized) || null;
}

function requestByRequester(normalized) {
  return requests.find((request) => request.requesterNormalized === normalized) || null;
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
      <strong><img class="avatar" src="${escapeHtml(message.senderPhotoDataUrl || avatarFallback(message.sender))}" alt="">${escapeHtml(message.sender)}<span class="meta">${formatTime(message.createdAt)}</span></strong>
      <p>${escapeHtml(message.text)}</p>
    `;
    messagesEl.appendChild(item);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderFriendsList() {
  friendsListEl.innerHTML = "";

  if (!friends.length) {
    friendsListEl.innerHTML = `<li><span>Aun no tenés amigos confirmados.</span></li>`;
    return;
  }

  friends.forEach((friend) => {
    const livePerson = personByNormalized(friend.friendNormalized);
    const avatarPerson = livePerson || {
      nickname: friend.friendNickname,
      photoDataUrl: friend.friendPhotoDataUrl || ""
    };
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <img class="avatar" src="${escapeHtml(avatarSource(avatarPerson))}" alt="">
        <div class="person-meta">
          <strong>${escapeHtml(livePerson?.nickname || friend.friendNickname)}</strong>
          <span>${livePerson?.online ? "en linea" : "amigo guardado"}</span>
        </div>
      </div>
      <button type="button">Chat</button>
    `;
    li.querySelector("button").addEventListener("click", () => {
      const target = livePerson || {
        nickname: friend.friendNickname,
        normalized: friend.friendNormalized,
        clientId: friend.friendNormalized
      };
      startChatWith(target);
    });
    friendsListEl.appendChild(li);
  });
}

function renderRequestsList() {
  requestsListEl.innerHTML = "";

  if (!requests.length) {
    requestsListEl.innerHTML = `<li><span>No hay solicitudes pendientes.</span></li>`;
    return;
  }

  requests.forEach((request) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div>
        <img class="avatar" src="${escapeHtml(request.requesterPhotoDataUrl || avatarFallback(request.requesterNickname))}" alt="">
        <div class="person-meta">
          <strong>${escapeHtml(request.requesterNickname)}</strong>
          <span>quiere agregarte</span>
        </div>
      </div>
      <button type="button">Aceptar</button>
    `;
    li.querySelector("button").addEventListener("click", () => acceptRequest(request));
    requestsListEl.appendChild(li);
  });
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
    const isFriend = Boolean(friendByNormalized(person.normalized));
    const incoming = Boolean(requestByRequester(person.normalized));
    const li = document.createElement("li");
    li.className = person.normalized === me.normalized ? "me" : "";
    const actionLabel = isFriend ? "Chat" : incoming ? "Aceptar" : "Agregar";
    li.innerHTML = `
      <div>
        <img class="avatar" src="${escapeHtml(avatarSource(person))}" alt="">
        <div class="person-meta">
          <strong>${escapeHtml(person.nickname)}</strong>
          <span>${isFriend ? "amigo" : person.online ? "en linea" : "visto hace poco"}</span>
        </div>
      </div>
      <button type="button" data-action="${actionLabel.toLowerCase()}">${actionLabel}</button>
    `;
    li.querySelector("button").addEventListener("click", async () => {
      if (isFriend) {
        await startChatWith(person);
        return;
      }
      if (incoming) {
        await acceptRequest(incoming);
        return;
      }
      await addFriend(person);
    });
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
  profileNameEl.textContent = me.nickname;
  profileSummaryEl.textContent = `@${me.normalized}`;
  profilePhotoPreview.src = pendingPhotoDataUrl || me.photoDataUrl || avatarFallback(me.nickname);
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
  const resolved = personByNormalized(selectedPeer.normalized) || people.find((person) => person.clientId === selectedPeer.clientId);
  if (resolved) {
    selectedPeer = resolved;
    updateThreadHeader();
    const thread = await ensureDirectThread(me, resolved);
    if (thread.key !== currentThreadKey) bindMessages(thread.key);
  }
}

function bindRelationshipWatchers() {
  if (friendsUnsubscribe) {
    friendsUnsubscribe();
    friendsUnsubscribe = null;
  }
  if (requestsUnsubscribe) {
    requestsUnsubscribe();
    requestsUnsubscribe = null;
  }

  friendsUnsubscribe = watchFriends(me.normalized, (nextFriends) => {
    friends = nextFriends;
    renderFriendsList();
    renderPeopleList();
  });

  requestsUnsubscribe = watchFriendRequests(me.normalized, (nextRequests) => {
    requests = nextRequests;
    renderRequestsList();
    renderPeopleList();
  });
}

async function acceptRequest(request) {
  try {
    await acceptFriendRequest(me, request);
    friendHintEl.textContent = `Aceptaste a ${request.requesterNickname}. Ya aparece en tu lista de amigos.`;
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo aceptar la amistad.";
  }
}

async function addFriend(person) {
  if (!person) return;
  try {
    const incoming = requestByRequester(person.normalized);
    if (incoming) {
      await acceptRequest(incoming);
      return;
    }

    const existingFriend = friendByNormalized(person.normalized);
    if (existingFriend) {
      await startChatWith(person);
      return;
    }

    await sendFriendRequest(me, person);
    friendHintEl.textContent = `Solicitud enviada a ${person.nickname}.`;
    statusEl.textContent = "Solicitud de amistad enviada";
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo enviar la solicitud.";
  }
}

function wirePresence() {
  watchPeople((nextPeople) => {
    people = nextPeople;
    countEl.textContent = String(people.length);

    const updatedMe = personByNormalized(me.normalized);
    if (updatedMe) {
      me = updatedMe;
      syncNicknameEditor();
    }

    if (selectedPeer) {
      const resolved = personByNormalized(selectedPeer.normalized)
        || people.find((person) => person.clientId === selectedPeer.clientId);
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
    renderFriendsList();
    renderRequestsList();
  });
}

async function bootstrap() {
  me = await bootstrapNickname();
  pendingPhotoDataUrl = me.photoDataUrl || "";
  syncNicknameEditor();
  statusEl.textContent = "Tu nick quedó reservado";
  nicknameHintEl.textContent = "Cambialo cuando quieras. Se guarda en esta sesión y también actualiza los hilos y amistades.";
  wirePresence();
  bindRelationshipWatchers();
  renderPeopleList();
  renderFriendsList();
  renderRequestsList();
}

profilePhotoFile.addEventListener("change", async () => {
  const file = profilePhotoFile.files?.[0];
  if (!file) return;
  try {
    pendingPhotoDataUrl = await fileToPhotoDataUrl(file);
    syncNicknameEditor();
    profileSummaryEl.textContent = "Foto lista para guardar";
  } catch (error) {
    statusEl.textContent = "No se pudo leer la foto.";
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextNick = nicknameInput.value.trim();
  const nextPhoto = pendingPhotoDataUrl || me.photoDataUrl || "";
  try {
    const nicknameChanged = Boolean(nextNick) && normalizeNickname(nextNick) !== me.normalized;
    const photoChanged = nextPhoto !== (me.photoDataUrl || "");
    if (!nicknameChanged && !photoChanged) {
      statusEl.textContent = "No hay cambios para guardar.";
      return;
    }

    let updated = me;
    if (nicknameChanged) {
      updated = await changeNickname(nextNick, { photoDataUrl: nextPhoto });
    } else if (photoChanged) {
      updated = await updateProfilePhoto(nextPhoto);
    }

    me = { ...me, ...updated, nickname: updated.nickname, normalized: updated.normalized, photoDataUrl: updated.photoDataUrl || "" };
    pendingPhotoDataUrl = me.photoDataUrl || "";
    syncNicknameEditor();
    statusEl.textContent = "Perfil actualizado";
    nicknameHintEl.textContent = `Ahora sos ${updated.nickname}. Los chats, amistades y fotos quedaron sincronizados.`;
    bindRelationshipWatchers();
    if (selectedPeer) {
      const resolved = personByNormalized(selectedPeer.normalized)
        || people.find((person) => person.clientId === selectedPeer.clientId);
      if (resolved) {
        const thread = await ensureDirectThread(me, resolved);
        bindMessages(thread.key);
      }
    }
  } catch (error) {
    statusEl.textContent = error.message || "No se pudo guardar el perfil.";
  }
});

friendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nextNick = friendInput.value.trim();
  if (!nextNick) return;
  const normalized = normalizeNickname(nextNick);
  const target = people.find((person) => person.normalized === normalized);
  if (!target) {
    statusEl.textContent = "Ese nickname no existe en la plataforma.";
    return;
  }
  if (target.normalized === me.normalized) {
    statusEl.textContent = "No podés agregarte a vos mismo.";
    return;
  }
  await addFriend(target);
  friendInput.value = "";
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

  const resolvedPeer = personByNormalized(selectedPeer.normalized) || people.find((person) => person.clientId === selectedPeer.clientId);
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
  const messageRef = push(ref(db, `chat/direct/${thread.key}/messages`));
  await pushDirectMessage(thread.key, messageRef.key, message);
  messageInput.value = "";
  messageInput.focus();
  statusEl.textContent = `Mensaje enviado a ${resolvedPeer.nickname}`;
};

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
