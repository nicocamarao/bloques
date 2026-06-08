import {
  bootstrapProfile,
  changeProfile,
  getCurrentConversation,
  listActivePeople,
  onProfileChange,
  recordScore,
  sendMessage,
  sendSystemMessage,
  setCurrentConversation,
  setPresenceHeartbeat,
  ensureSystemContacts,
  getSystemNicolasProfile,
  toggleContact,
  watchConversation,
  watchContacts,
  watchLeaderboard,
  watchRecentThreads,
  watchUnreadCount,
} from "./social.js";
import { blockForNumber } from "./numberblocks.js";

window.recordGameScore = window.recordGameScore || recordScore;

const resolveHref = (path) => new URL(path, import.meta.url).href;

const GAMES = [
  { id: "home", label: "Inicio", href: resolveHref("../index.html") },
  { id: "mundo-fiuma", label: "Mundo Fiuma", href: resolveHref("../games/mundo-fiuma/index.html") },
  { id: "mundo-fiuma-2", label: "Mundo Fiuma 2", href: resolveHref("../games/mundo-fiuma-2/index.html") },
  { id: "mini-territorio", label: "Mini territorio de amigos", href: resolveHref("../games/mini-territorio/index.html") },
  { id: "mundo-numberblocks", label: "Mundo Numberblocks", href: resolveHref("../games/mundo-numberblocks/index.html") },
  { id: "numberblocks-subida", label: "Numberblocks Subida", href: resolveHref("../games/numberblocks-subida/index.html") },
  { id: "memory-numberblocks", label: "Memory de Numberblocks", href: resolveHref("../games/memory-numberblocks/index.html") },
  { id: "memory-numberblocks-dificil", label: "Memory nivel dificil", href: resolveHref("../games/memory-numberblocks-dificil/index.html") },
  { id: "eco-numberblocks", label: "Eco Numberblocks", href: resolveHref("../games/eco-numberblocks/index.html") },
  { id: "tateti", label: "Tatetí Numberblocks", href: resolveHref("../games/tateti/index.html") },
  { id: "torre-numberblocks", label: "Torre Numberblocks", href: resolveHref("../games/torre-numberblocks/index.html") },
  { id: "puentes-numberblocks", label: "Puentes Numberblocks", href: resolveHref("../games/puentes-numberblocks/index.html") },
  { id: "copica-numberblocks", label: "Copica Numberblocks", href: resolveHref("../games/copica-numberblocks/index.html") },
  { id: "lombriz-numberblocks", label: "Lombriz Numberblocks", href: resolveHref("../games/lombriz-numberblocks/index.html") },
  { id: "carrera-sumas", label: "Carrera de Sumas", href: resolveHref("../games/carrera-sumas/index.html") },
  { id: "clasifica-numberblocks", label: "Clasifica Numberblocks", href: resolveHref("../games/clasifica-numberblocks/index.html") },
  { id: "jump-neon", label: "Jump Neón", href: resolveHref("../games/jump-neon/index.html") },
  { id: "pianito-online", label: "Pianito Online", href: resolveHref("../games/pianito-online/index.html") },
  { id: "ocr-chapa-uy", label: "OCR de Chapa UY", href: resolveHref("../games/ocr-chapa-uy/index.html") },
  { id: "pasa-la-lista", label: "Pasa La Lista", href: resolveHref("../games/pasa-la-lista/index.html") },
];

const slots = {
  top: document.getElementById("site-top"),
  sidebar: document.getElementById("site-sidebar"),
  main: document.getElementById("site-main"),
};

const state = {
  me: null,
  people: [],
  contacts: [],
  recentThreads: [],
  currentConversation: { kind: "general" },
  messages: [],
  unread: 0,
};

let profileModal = null;
let messagesUnsub = null;
let peopleUnsub = null;
let unreadUnsub = null;
let recentUnsub = null;
let leaderboardUnsub = null;
let contactsUnsub = null;
let heartbeatTimer = null;

function avatarFallback(name) {
  const safe = String(name || "N").slice(0, 2).toUpperCase();
  const hue = Array.from(String(name || "profile")).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue},72%,58%)"/>
          <stop offset="100%" stop-color="hsl(${(hue + 36) % 360},78%,45%)"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="22" fill="url(#g)"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="white">${safe}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function avatarSource(person) {
  return person?.photoDataUrl || avatarFallback(person?.nickname || "P");
}

function friendshipIcon(active = false) {
  const stroke = active ? "#63e6be" : "#7ca8ff";
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M16 11h6M19 8v6M8.5 11.5A3.5 3.5 0 1 0 8.5 4.5a3.5 3.5 0 0 0 0 7Z" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M3.5 19c.9-3 3.2-4.5 5-4.5s4.1 1.5 5 4.5" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;
}

function initBackgroundCarousel() {
  if (document.querySelector(".site-bg")) return;
  const bg = document.createElement("div");
  bg.className = "site-bg";
  bg.innerHTML = `
    <img class="layer-a" alt="">
    <img class="layer-b" alt="">
  `;
  document.body.prepend(bg);

  const layers = [bg.querySelector(".layer-a"), bg.querySelector(".layer-b")];
  const picks = [1, 2, 4, 5, 7, 10, 12].map((value) => blockForNumber(value).src);
  let index = 0;
  let active = 0;

  function paint() {
    const next = 1 - active;
    layers[next].src = picks[index % picks.length];
    layers[next].style.opacity = "0.15";
    layers[active].style.opacity = "0";
    layers[next].style.opacity = "0.15";
    active = next;
    index += 1;
  }

  layers[active].src = picks[index % picks.length];
  layers[active].style.opacity = "0.15";
  index += 1;
  window.setInterval(paint, 8000);
}

function pageId() {
  const parts = location.pathname.split("/").filter(Boolean);
  const gamesIndex = parts.indexOf("games");
  if (gamesIndex !== -1 && parts[gamesIndex + 1]) return parts[gamesIndex + 1].replace(/index\.html$/, "");
  return "home";
}

function currentGameLabel() {
  const id = pageId();
  return GAMES.find((game) => game.id === id)?.label || "Home";
}

function ensureFontAwesome() {
  if (document.getElementById("font-awesome-css")) return;
  const link = document.createElement("link");
  link.id = "font-awesome-css";
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css";
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

function renderTop() {
  if (!slots.top) return;
  ensureFontAwesome();
  const activeId = pageId();
  slots.top.innerHTML = `
    <header class="site-top">
      <button id="profile-button" class="profile-chip" type="button" aria-label="Editar perfil">
        <img id="profile-chip-avatar" class="avatar" alt="">
        <span>
          <strong id="profile-chip-name">Jugador</strong>
          <small><i class="fa-solid fa-pen"></i></small>
        </span>
      </button>
      <div class="site-brand">
        <span class="brand-mark">B</span>
        <div>
          <strong>Bloques Arcade</strong>
          <span>Plataforma de juegos y chat</span>
        </div>
      </div>
      <nav id="site-nav" class="site-nav" aria-label="Juegos">
        ${GAMES.map((game) => `<a href="${game.href}" class="${game.id === activeId ? "active" : ""}">${game.label}</a>`).join("")}
      </nav>
      <div class="site-top-right">
        <button id="nav-toggle" class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Mostrar juegos">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span>Juegos</span>
        </button>
        <span class="pill" id="presence-pill">${currentGameLabel()}</span>
      </div>
    </header>
  `;
}

function renderSidebar() {
  if (!slots.sidebar) return;
  slots.sidebar.innerHTML = `
    <section class="panel-block active-panel" data-panel-block>
      <button class="panel-block-toggle" type="button" data-panel-toggle aria-expanded="true">
        <div class="chat-head">
          <div>
            <span class="pill">Activos</span>
            <strong id="live-count">0 activos</strong>
          </div>
        </div>
        <span class="panel-block-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="panel-block-body" data-panel-body>
        <button class="pill" id="general-button" type="button">General</button>
        <button class="pill" id="self-button" type="button">Contigo mismo</button>
        <input id="people-search" class="chat-search" placeholder="Buscar nickname..." autocomplete="off">
        <div class="contact-section">
          <strong>Contactos fijados</strong>
          <ul id="contacts-list" class="people-list"></ul>
        </div>
        <strong class="people-heading">Personas conectadas</strong>
        <ul id="people-list" class="people-list"></ul>
        <div class="recent-wrap">
          <strong>Chats recientes</strong>
          <ul id="recent-threads" class="people-list"></ul>
        </div>
      </div>
    </section>

    <section class="panel-block current-panel" id="chat-panel" data-panel-block>
      <button class="panel-block-toggle" type="button" data-panel-toggle aria-expanded="true">
        <div class="chat-head">
          <div>
            <span class="pill">Chat fijo</span>
            <h2 id="conversation-title">General</h2>
          </div>
          <span class="unread-badge" id="unread-count">0</span>
        </div>
        <span class="panel-block-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="panel-block-body" data-panel-body>
        <div class="recent-wrap">
          <strong>Ranking</strong>
          <ul id="ranking-list" class="people-list"></ul>
        </div>
        <div class="chat-messages" id="message-list"></div>
        <form class="chat-composer" id="message-form">
          <input id="message-input" placeholder="Escribe un mensaje..." maxlength="240" autocomplete="off">
          <button type="submit">Enviar</button>
        </form>
      </div>
    </section>
  `;
}

function renderProfileModal() {
  if (document.getElementById("profile-modal")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div id="profile-modal" class="modal-backdrop" role="dialog" aria-modal="true">
        <form id="profile-form" class="modal">
          <div class="modal-head">
            <strong>Editar perfil</strong>
            <button id="profile-close" type="button">Cerrar</button>
          </div>
          <div class="profile-preview">
            <img id="profile-modal-avatar" class="avatar" alt="">
            <div>
              <span class="pill">Avatar</span>
              <strong>Nickname y foto</strong>
              <span class="muted">Se guarda en localStorage y Firebase.</span>
            </div>
          </div>
          <label class="field">
            <span>Nickname</span>
            <input id="profile-nickname" maxlength="24" autocomplete="off">
          </label>
          <label class="field">
            <span>Foto</span>
            <input id="profile-photo-input" class="hidden-file" type="file" accept="image/*">
            <button id="profile-photo-trigger" type="button">Cambiar foto</button>
          </label>
          <button type="submit">Guardar cambios</button>
        </form>
      </div>
    `,
  );
  profileModal = document.getElementById("profile-modal");
}

function els() {
  return {
    profileButton: document.getElementById("profile-button"),
    profileChipAvatar: document.getElementById("profile-chip-avatar"),
    profileChipName: document.getElementById("profile-chip-name"),
    profilePhoto: document.getElementById("profile-photo"),
    profileNickname: document.getElementById("profile-nickname"),
    profilePhotoInput: document.getElementById("profile-photo-input"),
    profilePhotoTrigger: document.getElementById("profile-photo-trigger"),
    profileForm: document.getElementById("profile-form"),
    profileClose: document.getElementById("profile-close"),
    profileModalAvatar: document.getElementById("profile-modal-avatar"),
    profileEditOpen: document.getElementById("profile-edit-open"),
    contactsList: document.getElementById("contacts-list"),
    peopleList: document.getElementById("people-list"),
    recentThreads: document.getElementById("recent-threads"),
    rankingList: document.getElementById("ranking-list"),
    peopleSearch: document.getElementById("people-search"),
    conversationTitle: document.getElementById("conversation-title"),
    unreadCount: document.getElementById("unread-count"),
    messageList: document.getElementById("message-list"),
    messageForm: document.getElementById("message-form"),
    messageInput: document.getElementById("message-input"),
    navToggle: document.getElementById("nav-toggle"),
    siteNav: document.getElementById("site-nav"),
    currentButton: document.getElementById("current-button"),
    selfButton: document.getElementById("self-button"),
    generalButton: document.getElementById("general-button"),
    liveCount: document.getElementById("live-count"),
    presencePill: document.getElementById("presence-pill"),
    panelToggles: Array.from(document.querySelectorAll("[data-panel-toggle]")),
  };
}

function setAvatar(src) {
  const nodes = [
    document.getElementById("profile-photo"),
    document.getElementById("profile-modal-avatar"),
    document.getElementById("profile-chip-avatar"),
  ];
  nodes.forEach((img) => {
    if (img) img.src = src;
  });
}

function setConversation(conversation) {
  state.currentConversation = conversation || { kind: "general" };
  setCurrentConversation(state.currentConversation);
  const name = state.currentConversation.kind === "general"
    ? "General"
    : state.currentConversation.kind === "self"
      ? "Contigo mismo"
      : state.currentConversation.peer?.nickname || state.currentConversation.nickname || "Conversacion";
  const { conversationTitle } = els();
  if (conversationTitle) conversationTitle.textContent = name;
}

function livePersonByNormalized(normalized) {
  return state.people.find((person) => person.normalized === normalized) || null;
}

function contactByNormalized(normalized) {
  return state.contacts.find((contact) => contact.contactNormalized === normalized) || null;
}

function renderContacts() {
  const { contactsList } = els();
  if (!contactsList) return;
  contactsList.innerHTML = "";

  if (state.me) {
    const li = document.createElement("li");
    li.className = state.currentConversation?.kind === "self" ? "current" : "";
    li.innerHTML = `
      <button type="button" class="person">
        <img class="avatar" src="${avatarSource(state.me)}" alt="">
        <span>
          <strong>${state.me.nickname}</strong>
          <span>Tú · chat contigo mismo</span>
        </span>
      </button>
    `;
    li.querySelector("button").addEventListener("click", () => openConversation({ kind: "self" }));
    contactsList.appendChild(li);
  }

  state.contacts.forEach((contact) => {
    const live = livePersonByNormalized(contact.contactNormalized);
    const display = live || {
      normalized: contact.contactNormalized,
      nickname: contact.contactNickname,
      photoDataUrl: contact.contactPhotoDataUrl,
      online: false,
    };
    const li = document.createElement("li");
    li.className = state.currentConversation?.peer?.normalized === display.normalized ? "current" : "";
    li.innerHTML = `
      <button type="button" class="person">
        <img class="avatar" src="${avatarSource(display)}" alt="">
        <span>
          <strong>${display.nickname}</strong>
          <span>${contact.system === "nicolas" ? "Sistema · saludo fijo" : display.online ? "en línea" : "contacto fijado"}</span>
        </span>
      </button>
      ${contact.system === "nicolas"
        ? ""
        : `<button type="button" class="contact-toggle active" aria-label="Desfijar contacto">${friendshipIcon(true)}</button>`
      }
    `;
    li.querySelector("button").addEventListener("click", () => openConversation({ kind: "direct", peer: display }));
    li.querySelector(".contact-toggle")?.addEventListener("click", async () => {
      await toggleContact(state.me, display);
    });
    contactsList.appendChild(li);
  });
}

function renderPeople() {
  const { peopleList, liveCount } = els();
  if (!peopleList) return;
  const sorted = listActivePeople(state.people, state.me?.sessionId);
  const query = (els().peopleSearch?.value || "").trim().toLowerCase();
  if (liveCount) liveCount.textContent = `${sorted.filter((person) => person.online).length} activos`;

  const currentSessionId = state.currentConversation?.peer?.sessionId || state.currentConversation?.sessionId || "";
  peopleList.innerHTML = "";

  sorted
    .filter((person) => person.sessionId !== state.me?.sessionId)
    .filter((person) => !contactByNormalized(person.normalized))
    .filter((person) => !query || person.nickname.toLowerCase().includes(query))
    .forEach((person) => {
      const li = document.createElement("li");
      li.className = currentSessionId === person.sessionId ? "current" : "";
      li.innerHTML = `
        <button type="button" class="person">
          <img class="avatar" src="${avatarSource(person)}" alt="">
          <span>
            <strong>${person.nickname}</strong>
            <span>${person.online ? "en línea" : "visto hace poco"}</span>
          </span>
        </button>
        <button type="button" class="contact-toggle" aria-label="Fijar contacto">${friendshipIcon(false)}</button>
      `;
      li.querySelector(".person").addEventListener("click", () => openConversation({ kind: "direct", peer: person }));
      li.querySelector(".contact-toggle").addEventListener("click", async () => {
        await toggleContact(state.me, person);
      });
      peopleList.appendChild(li);
    });
}

function mergeProfileForRecent(thread) {
  const found = state.people.find((person) => person.sessionId === thread.peerSessionId);
  if (found) {
    return {
      ...thread,
      peerNickname: found.nickname,
      peerPhotoDataUrl: found.photoDataUrl || thread.peerPhotoDataUrl || "",
    };
  }
  return thread;
}

function renderRecentThreads() {
  const { recentThreads } = els();
  if (!recentThreads) return;
  const currentSessionId = state.currentConversation?.peer?.sessionId || state.currentConversation?.sessionId || "";
  recentThreads.innerHTML = "";
  state.recentThreads.map(mergeProfileForRecent).forEach((thread) => {
    const li = document.createElement("li");
    li.className = currentSessionId === thread.peerSessionId ? "current" : "";
    const label = thread.kind === "general"
      ? "General"
      : thread.kind === "self"
        ? "Contigo mismo"
        : thread.peerNickname || "Reciente";
    li.innerHTML = `
      <button type="button" class="person">
        <img class="avatar" src="${thread.peerPhotoDataUrl || avatarFallback(label)}" alt="">
        <span>
          <strong>${label}</strong>
          <span>${thread.lastMessage || "Sin mensajes recientes"}</span>
        </span>
      </button>
    `;
    li.querySelector("button").addEventListener("click", () => {
      if (thread.kind === "general") openConversation({ kind: "general" });
      else if (thread.kind === "self") openConversation({ kind: "self" });
      else {
        const person = state.people.find((item) => item.sessionId === thread.peerSessionId) || {
          sessionId: thread.peerSessionId,
          nickname: thread.peerNickname,
          photoDataUrl: thread.peerPhotoDataUrl,
        };
        openConversation({ kind: "direct", peer: person });
      }
    });
    recentThreads.appendChild(li);
  });
}

function renderLeaderboard(rows) {
  const { rankingList } = els();
  if (!rankingList) return;
  const id = pageId();
  if (id === "home") {
    rankingList.innerHTML = '<li><span class="muted">Abre un juego para ver su ranking.</span></li>';
    return;
  }
  rankingList.innerHTML = "";
  if (!rows.length) {
    rankingList.innerHTML = '<li><span class="muted">Todavía no hay puntajes para este juego.</span></li>';
    return;
  }

  rows.forEach((row, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <button type="button" class="person">
        <img class="avatar" src="${row.photoDataUrl || avatarFallback(row.nickname)}" alt="">
        <span>
          <strong>#${index + 1} ${row.nickname}</strong>
          <span>${row.score} puntos</span>
        </span>
      </button>
    `;
    rankingList.appendChild(li);
  });
}

function messageAuthor(message) {
  const fromPeople = state.people.find((person) => person.sessionId === message.senderSessionId);
  if (fromPeople) return fromPeople.nickname;
  if (message.senderSessionId === state.me?.sessionId) return state.me?.nickname || message.senderNickname || "Yo";
  return message.senderNickname || "Jugador";
}

function messageAvatar(message) {
  const fromPeople = state.people.find((person) => person.sessionId === message.senderSessionId);
  if (fromPeople?.photoDataUrl) return fromPeople.photoDataUrl;
  if (message.senderSessionId === state.me?.sessionId) return state.me?.photoDataUrl || avatarFallback(state.me?.nickname || "Yo");
  return message.senderPhotoDataUrl || avatarFallback(message.senderNickname || "Jugador");
}

function renderMessages() {
  const { messageList } = els();
  if (!messageList) return;
  messageList.innerHTML = "";
  if (!state.messages.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Todavía no hay mensajes en esta conversación.";
    messageList.appendChild(empty);
    return;
  }

  state.messages.forEach((message) => {
    const mine = message.senderSessionId === state.me?.sessionId;
    const item = document.createElement("article");
    item.className = `message${mine ? " mine" : ""}`;
    item.innerHTML = `
      <strong><img class="avatar" src="${messageAvatar(message)}" alt="">${messageAuthor(message)}<span class="muted">${new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></strong>
      <p>${String(message.text || "").replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[char]))}</p>
    `;
    messageList.appendChild(item);
  });
  messageList.scrollTop = messageList.scrollHeight;
}

function openConversation(conversation) {
  setConversation(conversation);
  if (messagesUnsub) messagesUnsub();
  messagesUnsub = watchConversation(conversation, (messages) => {
    state.messages = messages;
    renderMessages();
    setPresenceHeartbeat(state.me).catch(() => {});
  });

  if (window.matchMedia("(max-width: 900px)").matches) {
    const chatPanel = document.getElementById("chat-panel");
    if (chatPanel) {
      expandPanel(chatPanel, true);
      window.requestAnimationFrame(() => {
        chatPanel.scrollIntoView({ block: "start", behavior: "smooth" });
        window.requestAnimationFrame(() => document.getElementById("message-input")?.focus());
      });
      if (location.hash !== "#chat-panel") {
        history.replaceState(null, "", "#chat-panel");
      }
    }
  }
}

window.openPlatformConversation = openConversation;

function bindModal() {
  const {
    profileButton,
    profileEditOpen,
    profilePhotoInput,
    profilePhotoTrigger,
    profileClose,
    profileModalAvatar,
    profileForm,
    profileNickname,
  } = els();
  const modal = document.getElementById("profile-modal");
  if (!modal) return;

  const open = () => modal.classList.add("open");
  const close = () => modal.classList.remove("open");

  profileButton?.addEventListener("click", open);
  profileEditOpen?.addEventListener("click", open);
  profileClose?.addEventListener("click", close);
  profilePhotoTrigger?.addEventListener("click", () => profilePhotoInput?.click());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  profilePhotoInput?.addEventListener("change", async () => {
    const file = profilePhotoInput.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    if (profileModalAvatar) profileModalAvatar.src = dataUrl;
  });

  profileForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const nextNickname = profileNickname.value.trim();
      const nextPhoto = profileModalAvatar?.src || state.me?.photoDataUrl || "";
      state.me = await changeProfile({ nickname: nextNickname || state.me.nickname, photoDataUrl: nextPhoto, current: state.me });
      syncProfileUI();
      close();
      await setPresenceHeartbeat(state.me);
    } catch (error) {
      alert(error.message || "No se pudo guardar el perfil.");
    }
  });
}

function syncProfileUI() {
  const { profileNickname, profileModalAvatar, profileChipName, profilePhoto, presencePill } = els();
  if (!state.me) return;
  if (profileNickname) profileNickname.value = state.me.nickname;
  if (profileChipName) profileChipName.textContent = state.me.nickname;
  if (profilePhoto) profilePhoto.src = state.me.photoDataUrl || avatarFallback(state.me.nickname);
  if (profileModalAvatar) profileModalAvatar.src = state.me.photoDataUrl || avatarFallback(state.me.nickname);
  setAvatar(state.me.photoDataUrl || avatarFallback(state.me.nickname));
  if (presencePill) presencePill.textContent = currentGameLabel();
}

function bindChat() {
  const { messageForm, messageInput, generalButton, selfButton } = els();

  generalButton?.addEventListener("click", () => openConversation({ kind: "general" }));
  selfButton?.addEventListener("click", () => openConversation({ kind: "self" }));

  messageForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    await sendMessage(state.currentConversation, state.me, text);
    messageInput.value = "";
  });

  els().peopleSearch?.addEventListener("input", renderPeople);
}

function bindTopMenu() {
  const { navToggle, siteNav } = els();
  if (!navToggle || !siteNav) return;

  const setOpen = (open) => {
    const top = slots.top?.querySelector(".site-top");
    if (!top) return;
    top.classList.toggle("nav-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Ocultar juegos" : "Mostrar juegos");
  };

  navToggle.addEventListener("click", () => {
    const top = slots.top?.querySelector(".site-top");
    setOpen(!top?.classList.contains("nav-open"));
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      const top = slots.top?.querySelector(".site-top");
      if (top) top.classList.remove("nav-open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Mostrar juegos");
    });
  });
}

function expandPanel(panel, open) {
  const body = panel?.querySelector?.("[data-panel-body]");
  const toggle = panel?.querySelector?.("[data-panel-toggle]");
  if (!body || !toggle) return;
  body.hidden = !open;
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  panel.classList.toggle("collapsed", !open);
}

function bindCollapsibles() {
  document.querySelectorAll("[data-panel-block]").forEach((panel) => {
    const toggle = panel.querySelector("[data-panel-toggle]");
    const body = panel.querySelector("[data-panel-body]");
    if (!toggle || !body) return;
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      expandPanel(panel, open);
    });
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function bootstrap() {
  initBackgroundCarousel();
  renderTop();
  renderSidebar();
  renderProfileModal();
  bindModal();
  bindChat();
  bindTopMenu();
  bindCollapsibles();

  state.me = await bootstrapProfile();
  syncProfileUI();
  if (pageId() === "home") {
    await ensureSystemContacts(state.me);
    const nicolas = getSystemNicolasProfile();
    await sendSystemMessage({ kind: "direct", peer: state.me }, state.me, "Hola, bienvenido otra vez", nicolas);
  }
  setConversation({ kind: "general" });

  peopleUnsub = listActivePeople((people) => {
    state.people = people;
    renderContacts();
    renderPeople();
    renderRecentThreads();
  });

  contactsUnsub = watchContacts(state.me.normalized, (contacts) => {
    state.contacts = contacts;
    renderContacts();
    renderPeople();
  });

  recentUnsub = watchRecentThreads(state.me, (threads) => {
    state.recentThreads = threads;
    renderRecentThreads();
  });

  if (leaderboardUnsub) leaderboardUnsub();
  leaderboardUnsub = watchLeaderboard(pageId(), (rows) => {
    renderLeaderboard(rows);
  });

  unreadUnsub = watchUnreadCount(state.me.sessionId, (count) => {
    state.unread = count;
    const unreadCount = document.getElementById("unread-count");
    if (unreadCount) unreadCount.textContent = String(count);
  });

  await setPresenceHeartbeat(state.me, { path: location.pathname });
  heartbeatTimer = window.setInterval(() => {
    if (state.me) setPresenceHeartbeat(state.me, { path: location.pathname }).catch(() => {});
  }, 30_000);

  onProfileChange((profile) => {
    const previousNormalized = state.me?.normalized;
    state.me = profile;
    syncProfileUI();
    if (profile.normalized && profile.normalized !== previousNormalized) {
      if (contactsUnsub) contactsUnsub();
      contactsUnsub = watchContacts(profile.normalized, (contacts) => {
        state.contacts = contacts;
        renderContacts();
        renderPeople();
      });
    }
  });

  const activePage = pageId();
  document.querySelectorAll("[data-site-page]").forEach((node) => {
    node.classList.toggle("active", node.dataset.sitePage === activePage);
  });

  window.addEventListener("beforeunload", () => {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    if (state.me) setPresenceHeartbeat(state.me, { online: false, path: location.pathname }).catch(() => {});
  });

  const storedConversation = getCurrentConversation();
  if (storedConversation?.kind === "direct" && storedConversation.peer?.sessionId) {
    openConversation(storedConversation);
  } else if (storedConversation?.kind === "self") {
    openConversation({ kind: "self" });
  } else {
    openConversation({ kind: "general" });
  }
}

bootstrap().catch((error) => {
  console.error(error);
});
