import { db } from "./firebase.js";
import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;
const LS_SESSION = "plataforma:session-id";
const LS_NICKNAME = "plataforma:nickname";
const LS_PHOTO = "plataforma:photo";
const LS_CONVERSATION = "plataforma:conversation";

const listeners = new Set();

let profileState = null;
let currentConversation = readStoredConversation();

function now() {
  return Date.now();
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeNickname(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "jugador";
}

function displayNickname(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 24) || "Jugador";
}

function randomNickname() {
  const a = ["Brisa", "Luna", "Nova", "Rayo", "Menta", "Luz", "Aura", "Eco", "Nube", "Pixel"];
  const b = ["Amarillo", "Azul", "Cinta", "Clave", "Senda", "Tono", "Dado", "Mapa", "Halo", "Pulso"];
  const left = a[Math.floor(Math.random() * a.length)];
  const right = b[Math.floor(Math.random() * b.length)];
  const tail = Math.floor(100 + Math.random() * 900);
  return `${left}${right}${tail}`;
}

function randomSessionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `session-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function profileRef(sessionId) {
  return ref(db, `chat/profiles/${sessionId}`);
}

function nicknameRef(normalized) {
  return ref(db, `chat/nicknames/${normalized}`);
}

function messagesRef(threadId) {
  return ref(db, `chat/messages/${threadId}`);
}

function recentRef(sessionId) {
  return ref(db, `chat/recent/${sessionId}`);
}

function unreadRef(sessionId) {
  return ref(db, `chat/unread/${sessionId}`);
}

function threadMetaRef(threadId) {
  return ref(db, `chat/threads/${threadId}`);
}

function leaderboardRef(gameId) {
  return ref(db, `chat/leaderboards/${gameId}`);
}

function contactsRef(normalized) {
  return ref(db, `chat/contacts/${normalized}`);
}

function contactsRootRef() {
  return ref(db, "chat/contacts");
}

const SYSTEM_NICOLAS = {
  sessionId: "system-nicolas",
  nickname: "Nicolás",
  normalized: "system-nicolas",
  photoDataUrl: "",
};

function getConversationId(conversation, me) {
  if (!me?.sessionId) return null;
  if (!conversation || conversation.kind === "general") return "general";
  if (conversation.kind === "self") return `self__${me.sessionId}`;
  const peerSessionId = conversation.peer?.sessionId || conversation.sessionId;
  if (!peerSessionId) return null;
  return [`dm`, me.sessionId, peerSessionId].sort().join("__");
}

function threadTitle(conversation, me) {
  if (!conversation || conversation.kind === "general") return "General";
  if (conversation.kind === "self") return "Contigo mismo";
  if (conversation.peer?.sessionId === me?.sessionId || conversation.sessionId === me?.sessionId) return "Contigo mismo";
  return conversation.peer?.nickname || conversation.nickname || "Conversacion";
}

function threadPeer(conversation, me) {
  if (!conversation || conversation.kind === "general") {
    return { kind: "general", sessionId: "general", nickname: "General", photoDataUrl: "" };
  }
  if (conversation.kind === "self") {
    return {
      kind: "self",
      sessionId: me.sessionId,
      nickname: me.nickname,
      photoDataUrl: me.photoDataUrl || "",
    };
  }
  return {
    kind: "direct",
    sessionId: conversation.peer?.sessionId || conversation.sessionId,
    nickname: conversation.peer?.nickname || conversation.nickname || "Jugador",
    photoDataUrl: conversation.peer?.photoDataUrl || conversation.photoDataUrl || "",
  };
}

function writeStoredProfile(profile) {
  localStorage.setItem(LS_SESSION, profile.sessionId);
  localStorage.setItem(LS_NICKNAME, profile.nickname);
  localStorage.setItem(LS_PHOTO, profile.photoDataUrl || "");
}

function readStoredConversation() {
  return safeJsonParse(localStorage.getItem(LS_CONVERSATION), { kind: "general" });
}

function notifyProfile() {
  for (const listener of listeners) listener(profileState);
}

async function reserveNickname(normalized, sessionId) {
  const reservation = await runTransaction(nicknameRef(normalized), (current) => {
    if (current === null || current === sessionId) return sessionId;
    return;
  });
  return Boolean(reservation.committed);
}

async function releaseNickname(normalized, sessionId) {
  if (!normalized) return;
  await runTransaction(nicknameRef(normalized), (current) => {
    if (current === sessionId) return null;
    return current;
  });
}

async function persistProfile(profile) {
  const existing = await get(profileRef(profile.sessionId));
  await set(profileRef(profile.sessionId), {
    ...(existing.val() || {}),
    sessionId: profile.sessionId,
    nickname: profile.nickname,
    normalized: profile.normalized,
    photoDataUrl: profile.photoDataUrl || "",
    createdAt: profile.createdAt,
    updatedAt: now(),
    lastSeenAt: now(),
    onlineUntil: now() + ACTIVE_WINDOW_MS,
    currentPath: location.pathname,
    currentConversation: currentConversation?.kind || "general",
  });
}

async function renameContacts(oldProfile, newProfile) {
  const snapshot = await get(contactsRootRef());
  const contacts = snapshot.val() || {};
  const updates = {};
  const nowTs = now();

  for (const [ownerNormalized, contactMap] of Object.entries(contacts)) {
    if (!contactMap) continue;

    if (ownerNormalized === oldProfile.normalized) {
      const renamedMap = {};
      for (const [contactNormalized, record] of Object.entries(contactMap)) {
        if (!record) continue;
        const nextNormalized = contactNormalized === oldProfile.normalized ? newProfile.normalized : contactNormalized;
        renamedMap[nextNormalized] = {
          ...record,
          contactNormalized: nextNormalized,
          contactNickname: contactNormalized === oldProfile.normalized ? newProfile.nickname : record.contactNickname,
          contactPhotoDataUrl: contactNormalized === oldProfile.normalized ? (newProfile.photoDataUrl || "") : (record.contactPhotoDataUrl || ""),
          updatedAt: nowTs,
        };
      }
      updates[`chat/contacts/${newProfile.normalized}`] = renamedMap;
      updates[`chat/contacts/${ownerNormalized}`] = null;
      continue;
    }

    if (contactMap[oldProfile.normalized]) {
      const nextMap = { ...contactMap };
      nextMap[newProfile.normalized] = {
        ...contactMap[oldProfile.normalized],
        contactNormalized: newProfile.normalized,
        contactNickname: newProfile.nickname,
        contactPhotoDataUrl: newProfile.photoDataUrl || "",
        updatedAt: nowTs,
      };
      delete nextMap[oldProfile.normalized];
      updates[`chat/contacts/${ownerNormalized}`] = nextMap;
    }
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

export async function bootstrapProfile() {
  if (profileState) return profileState;

  const storedSessionId = localStorage.getItem(LS_SESSION) || randomSessionId();
  const storedNickname = displayNickname(localStorage.getItem(LS_NICKNAME) || randomNickname());
  const storedPhoto = localStorage.getItem(LS_PHOTO) || "";
  const normalized = normalizeNickname(storedNickname);
  const createdAt = now();

  let candidateNickname = storedNickname;
  let candidateNormalized = normalized;
  let reserved = await reserveNickname(candidateNormalized, storedSessionId);
  let retries = 0;
  while (!reserved && retries < 16) {
    candidateNickname = displayNickname(randomNickname());
    candidateNormalized = normalizeNickname(candidateNickname);
    reserved = await reserveNickname(candidateNormalized, storedSessionId);
    retries += 1;
  }

  profileState = {
    sessionId: storedSessionId,
    nickname: candidateNickname,
    normalized: candidateNormalized,
    photoDataUrl: storedPhoto,
    createdAt,
  };

  writeStoredProfile(profileState);
  await persistProfile(profileState);
  notifyProfile();

  return profileState;
}

export function onProfileChange(callback) {
  listeners.add(callback);
  if (profileState) callback(profileState);
  return () => listeners.delete(callback);
}

export async function changeProfile({ nickname, photoDataUrl, current }) {
  const base = current || profileState || (await bootstrapProfile());
  const nextNickname = displayNickname(nickname || base.nickname);
  const nextNormalized = normalizeNickname(nextNickname);

  if (nextNormalized !== base.normalized) {
    const reserved = await reserveNickname(nextNormalized, base.sessionId);
    if (!reserved) {
      throw new Error("Ese nickname ya está en uso.");
    }
    await renameContacts(base, {
      ...base,
      nickname: nextNickname,
      normalized: nextNormalized,
      photoDataUrl: photoDataUrl || base.photoDataUrl || "",
    });
    await releaseNickname(base.normalized, base.sessionId);
  }

  profileState = {
    ...base,
    nickname: nextNickname,
    normalized: nextNormalized,
    photoDataUrl: photoDataUrl || base.photoDataUrl || "",
  };

  writeStoredProfile(profileState);
  await persistProfile(profileState);
  notifyProfile();
  return profileState;
}

export function watchContacts(normalized, callback) {
  if (!normalized) {
    callback([]);
    return () => {};
  }

  return onValue(contactsRef(normalized), (snapshot) => {
    const rows = Object.entries(snapshot.val() || {})
      .map(([contactNormalized, row]) => ({
        contactNormalized,
        contactNickname: displayNickname(row.contactNickname || contactNormalized),
        contactPhotoDataUrl: row.contactPhotoDataUrl || "",
        fixed: Boolean(row.fixed),
        system: row.system || "",
        createdAt: Number(row.createdAt || 0),
        updatedAt: Number(row.updatedAt || 0),
      }))
      .sort((a, b) => Number(b.fixed) - Number(a.fixed) || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
    callback(rows);
  });
}

export async function toggleContact(ownerProfile, targetProfile) {
  const owner = ownerProfile || profileState || (await bootstrapProfile());
  if (!owner?.normalized || !targetProfile?.normalized) return;
  if (owner.normalized === targetProfile.normalized) return;

  const itemRef = ref(db, `chat/contacts/${owner.normalized}/${targetProfile.normalized}`);
  const snapshot = await get(itemRef);
  if (snapshot.exists() && snapshot.val()?.fixed) return;
  if (snapshot.exists()) {
    await set(itemRef, null);
    return;
  }

  const nowTs = now();
  await set(itemRef, {
    contactNormalized: targetProfile.normalized,
    contactNickname: targetProfile.nickname || targetProfile.normalized,
    contactPhotoDataUrl: targetProfile.photoDataUrl || "",
    fixed: false,
    createdAt: nowTs,
    updatedAt: nowTs,
  });
}

export async function ensureSystemContacts(profile) {
  const owner = profile || profileState || (await bootstrapProfile());
  if (!owner?.normalized) return SYSTEM_NICOLAS;

  const nowTs = now();
  await set(ref(db, `chat/contacts/${owner.normalized}/${SYSTEM_NICOLAS.normalized}`), {
    contactNormalized: SYSTEM_NICOLAS.normalized,
    contactNickname: SYSTEM_NICOLAS.nickname,
    contactPhotoDataUrl: SYSTEM_NICOLAS.photoDataUrl,
    fixed: true,
    system: "nicolas",
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  return SYSTEM_NICOLAS;
}

export function getSystemNicolasProfile() {
  return { ...SYSTEM_NICOLAS };
}

export async function setPresenceHeartbeat(profile = profileState, options = {}) {
  const current = profile || (await bootstrapProfile());
  const online = options.online !== false;
  if (!current) return;
  const extra = { ...options };
  delete extra.online;
  delete extra.path;

  await update(profileRef(current.sessionId), {
    nickname: current.nickname,
    normalized: current.normalized,
    photoDataUrl: current.photoDataUrl || "",
    updatedAt: now(),
    lastSeenAt: now(),
    onlineUntil: online ? now() + ACTIVE_WINDOW_MS : now() - 1000,
    currentPath: options.path || location.pathname,
    currentConversation: currentConversation?.kind || "general",
    ...extra,
  });
}

export function setCurrentConversation(conversation) {
  currentConversation = conversation || { kind: "general" };
  localStorage.setItem(LS_CONVERSATION, JSON.stringify(currentConversation));
}

export function getCurrentConversation() {
  return currentConversation || { kind: "general" };
}

function buildPeopleFromSnapshot(snapshotValue, meSessionId) {
  const people = Object.values(snapshotValue || {})
    .map((person) => ({
      sessionId: String(person.sessionId || ""),
      nickname: displayNickname(person.nickname || ""),
      normalized: normalizeNickname(person.normalized || person.nickname || ""),
      photoDataUrl: person.photoDataUrl || "",
      lastSeenAt: Number(person.lastSeenAt || 0),
      onlineUntil: Number(person.onlineUntil || 0),
      currentPath: person.currentPath || "",
      worldX: Number(person.worldX ?? -1),
      worldY: Number(person.worldY ?? -1),
      worldUpdatedAt: Number(person.worldUpdatedAt || 0),
      online: Number(person.onlineUntil || 0) > now(),
    }))
    .filter((person) => person.sessionId);

  return listActivePeople(people, meSessionId);
}

export function listActivePeople(sourceOrCallback, meSessionId) {
  if (typeof sourceOrCallback === "function") {
    return onValue(ref(db, "chat/profiles"), (snapshot) => {
      sourceOrCallback(buildPeopleFromSnapshot(snapshot.val(), profileState?.sessionId || meSessionId));
    });
  }

  const people = Array.isArray(sourceOrCallback) ? [...sourceOrCallback] : [];
  const currentSessionId = meSessionId || profileState?.sessionId || "";
  return people.sort((a, b) => {
    if (a.sessionId === currentSessionId) return -1;
    if (b.sessionId === currentSessionId) return 1;
    if (a.online !== b.online) return Number(b.online) - Number(a.online);
    return (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0);
  });
}

export function watchRecentThreads(profile, callback) {
  const sessionId = profile?.sessionId;
  if (!sessionId) {
    callback([]);
    return () => {};
  }

  return onValue(recentRef(sessionId), (snapshot) => {
    const rows = Object.entries(snapshot.val() || {})
      .map(([threadId, row]) => ({
        threadId,
        kind: row.kind || "direct",
        peerSessionId: row.peerSessionId || "",
        peerNickname: displayNickname(row.peerNickname || ""),
        peerPhotoDataUrl: row.peerPhotoDataUrl || "",
        lastMessage: row.lastMessage || "",
        lastMessageAt: Number(row.lastMessageAt || 0),
        lastSenderSessionId: row.lastSenderSessionId || "",
      }))
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    callback(rows);
  });
}

export function watchUnreadCount(sessionId, callback) {
  if (!sessionId) {
    callback(0);
    return () => {};
  }

  return onValue(unreadRef(sessionId), (snapshot) => {
    const value = snapshot.val() || {};
    const total = Object.values(value).reduce((sum, entry) => sum + (Number(entry) || 0), 0);
    callback(total);
  });
}

export function watchConversation(conversation, callback) {
  const me = profileState;
  const threadId = getConversationId(conversation, me);
  if (!threadId) {
    callback([]);
    return () => {};
  }

  setCurrentConversation(conversation);
  if (me?.sessionId) {
    set(ref(db, `chat/unread/${me.sessionId}/${threadId}`), 0);
  }

  return onValue(messagesRef(threadId), (snapshot) => {
    const messages = Object.entries(snapshot.val() || {})
      .map(([id, message]) => ({
        id,
        threadId,
        ...message,
      }))
      .sort((a, b) => (Number(a.createdAt || 0) - Number(b.createdAt || 0)));
    callback(messages);
  });
}

async function bumpUnread(sessionId, threadId) {
  await runTransaction(ref(db, `chat/unread/${sessionId}/${threadId}`), (current) => (Number(current || 0) + 1));
}

async function syncRecent(profile, conversation, message, threadId) {
  const sender = profile;
  const peer = threadPeer(conversation, profile);
  const senderRecent = {
    kind: conversation?.kind || "direct",
    peerSessionId: peer.sessionId,
    peerNickname: peer.nickname,
    peerPhotoDataUrl: peer.photoDataUrl || "",
    lastMessage: message.text,
    lastMessageAt: message.createdAt,
    lastSenderSessionId: sender.sessionId,
  };
  await set(ref(db, `chat/recent/${sender.sessionId}/${threadId}`), senderRecent);

  if (conversation?.kind === "direct" && peer.sessionId && peer.sessionId !== sender.sessionId) {
    const peerRecent = {
      kind: "direct",
      peerSessionId: sender.sessionId,
      peerNickname: sender.nickname,
      peerPhotoDataUrl: sender.photoDataUrl || "",
      lastMessage: message.text,
      lastMessageAt: message.createdAt,
      lastSenderSessionId: sender.sessionId,
    };
    await set(ref(db, `chat/recent/${peer.sessionId}/${threadId}`), peerRecent);
  }
}

async function notifyRecipients(conversation, me, threadId, message) {
  if (conversation?.kind === "self") return;

  if (conversation?.kind === "general") {
    const snapshot = await get(ref(db, "chat/profiles"));
    const people = Object.values(snapshot.val() || {}).filter((person) => person.sessionId && person.sessionId !== me.sessionId);
    await Promise.all(people.map((person) => bumpUnread(person.sessionId, threadId)));
    return;
  }

  const peer = threadPeer(conversation, me);
  if (peer.sessionId && peer.sessionId !== me.sessionId) {
    await bumpUnread(peer.sessionId, threadId);
  }
}

export async function sendMessage(conversation, me, text) {
  const profile = me || profileState || (await bootstrapProfile());
  const threadId = getConversationId(conversation, profile);
  if (!threadId) return;

  const peer = threadPeer(conversation, profile);
  const message = {
    senderSessionId: profile.sessionId,
    senderNickname: profile.nickname,
    senderPhotoDataUrl: profile.photoDataUrl || "",
    text: String(text || "").trim().slice(0, 240),
    createdAt: now(),
    kind: conversation?.kind || "direct",
  };
  if (!message.text) return;

  await push(messagesRef(threadId), message);
  await update(threadMetaRef(threadId), {
    kind: conversation?.kind || "direct",
    updatedAt: message.createdAt,
    lastMessage: message.text,
    lastSenderSessionId: profile.sessionId,
    participants: conversation?.kind === "general"
      ? ["general"]
      : conversation?.kind === "self"
        ? [profile.sessionId]
        : [profile.sessionId, peer.sessionId].filter(Boolean),
  });

  await syncRecent(profile, conversation, message, threadId);
  await notifyRecipients(conversation, profile, threadId, message);
}

export async function sendSystemMessage(conversation, recipientProfile, text, systemProfile = SYSTEM_NICOLAS) {
  if (!recipientProfile?.sessionId || !text) return;
  const threadId = getConversationId({ kind: "direct", peer: recipientProfile }, systemProfile);
  if (!threadId) return;

  const message = {
    senderSessionId: systemProfile.sessionId,
    senderNickname: systemProfile.nickname,
    senderPhotoDataUrl: systemProfile.photoDataUrl || "",
    text: String(text || "").trim().slice(0, 240),
    createdAt: now(),
    kind: "direct",
  };
  if (!message.text) return;

  await push(messagesRef(threadId), message);
  await update(threadMetaRef(threadId), {
    kind: "direct",
    updatedAt: message.createdAt,
    lastMessage: message.text,
    lastSenderSessionId: systemProfile.sessionId,
    participants: [systemProfile.sessionId, recipientProfile.sessionId].filter(Boolean),
  });

  await set(recentRef(recipientProfile.sessionId), {
    kind: "direct",
    peerSessionId: systemProfile.sessionId,
    peerNickname: systemProfile.nickname,
    peerPhotoDataUrl: systemProfile.photoDataUrl || "",
    lastMessage: message.text,
    lastMessageAt: message.createdAt,
    lastSenderSessionId: systemProfile.sessionId,
  });
}

export async function recordScore(gameId, score, meta = {}) {
  const profile = profileState || (await bootstrapProfile());
  const numericScore = Number(score);
  if (!gameId || Number.isNaN(numericScore)) return;

  await push(leaderboardRef(gameId), {
    score: numericScore,
    nickname: profile.nickname,
    normalized: profile.normalized,
    photoDataUrl: profile.photoDataUrl || "",
    gameId,
    label: meta.label || "",
    details: meta.details || "",
    createdAt: now(),
  });
}

export function watchLeaderboard(gameId, callback) {
  if (!gameId) {
    callback([]);
    return () => {};
  }

  return onValue(leaderboardRef(gameId), (snapshot) => {
    const rows = Object.entries(snapshot.val() || {})
      .map(([id, row]) => ({
        id,
        score: Number(row.score || 0),
        nickname: row.nickname || "Jugador",
        photoDataUrl: row.photoDataUrl || "",
        createdAt: Number(row.createdAt || 0),
        details: row.details || "",
      }))
      .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
      .slice(0, 10);
    callback(rows);
  });
}
