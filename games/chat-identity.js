import { db } from "./firebase-shared.js";
import {
  get,
  onValue,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const CLIENT_KEY = "bloquesArcade.chatClientId";
const NICK_KEY = "bloquesArcade.chatNickname";
const NICK_NORMALIZED_KEY = "bloquesArcade.chatNicknameNormalized";
const PHOTO_KEY = "bloquesArcade.chatPhotoDataUrl";

const ADJECTIVES = [
  "Brisa",
  "Luna",
  "Nova",
  "Pixel",
  "Cobre",
  "Atlas",
  "Nube",
  "Rayo",
  "Marea",
  "Eco"
];

const NAMES = [
  "Uno",
  "Atlas",
  "Vela",
  "Punto",
  "Chispa",
  "Orbit",
  "Milo",
  "Nexo",
  "Luna",
  "Senda"
];

export function getSessionClientId() {
  let clientId = sessionStorage.getItem(CLIENT_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, clientId);
  }
  return clientId;
}

export function normalizeNickname(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

export function displayNickname(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned;
}

export function randomNickname() {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${adjective}${name}-${suffix}`;
}

export function getStoredNickname() {
  const profile = getStoredProfile();
  return profile ? { nickname: profile.nickname, normalized: profile.normalized } : null;
}

export function getStoredProfile() {
  const nickname = sessionStorage.getItem(NICK_KEY) || "";
  const normalized = sessionStorage.getItem(NICK_NORMALIZED_KEY) || normalizeNickname(nickname);
  const photoDataUrl = sessionStorage.getItem(PHOTO_KEY) || "";
  return nickname ? { nickname, normalized, photoDataUrl } : null;
}

export function saveStoredProfile(profile) {
  const nickname = displayNickname(profile?.nickname || "");
  const normalized = normalizeNickname(nickname);
  const photoDataUrl = profile?.photoDataUrl || "";
  sessionStorage.setItem(NICK_KEY, nickname);
  sessionStorage.setItem(NICK_NORMALIZED_KEY, normalized);
  if (photoDataUrl) {
    sessionStorage.setItem(PHOTO_KEY, photoDataUrl);
  } else {
    sessionStorage.removeItem(PHOTO_KEY);
  }
  return { nickname, normalized, photoDataUrl };
}

export function saveStoredNickname(nickname) {
  return saveStoredProfile({ nickname });
}

export function saveStoredPhotoDataUrl(photoDataUrl) {
  const profile = getStoredProfile();
  if (!profile) return null;
  return saveStoredProfile({ ...profile, photoDataUrl });
}

function nicknameRef(normalized) {
  return ref(db, `chat/nicknames/${normalized}`);
}

function peopleRef(normalized = "") {
  return ref(db, normalized ? `chat/people/${normalized}` : "chat/people");
}

function threadsRef() {
  return ref(db, "chat/direct");
}

function friendsRootRef() {
  return ref(db, "chat/friends");
}

function requestsRootRef() {
  return ref(db, "chat/friendRequests");
}

export function threadKeyForPair(first, second) {
  return [first, second].sort().join("__");
}

async function reserveNickname(nickname, clientId) {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return { ok: false, reason: "empty", normalized: "" };

  const result = await runTransaction(nicknameRef(normalized), (current) => {
    if (current && current.clientId !== clientId) return;
    return {
      nickname: displayNickname(nickname),
      normalized,
      clientId,
      updatedAt: Date.now(),
      createdAt: current?.createdAt || Date.now()
    };
  });

  return { ok: result.committed, normalized };
}

async function releaseNickname(normalized, clientId) {
  if (!normalized) return;
  await runTransaction(nicknameRef(normalized), (current) => {
    if (!current) return current;
    if (current.clientId !== clientId) return current;
    return null;
  });
}

async function upsertProfile(profile) {
  await set(peopleRef(profile.normalized), {
    ...profile,
    online: true,
    lastSeenAt: Date.now(),
    updatedAt: Date.now()
  });
}

async function renameDirectThreads(oldProfile, newProfile) {
  const snap = await get(threadsRef());
  const threads = snap.val() || {};
  const updates = {};

  for (const [threadKey, thread] of Object.entries(threads)) {
    const participants = thread?.participantsNormalized || [];
    if (!participants.includes(oldProfile.normalized)) continue;

    const nextParticipants = participants.map((value) => (
      value === oldProfile.normalized ? newProfile.normalized : value
    ));
    const peerNormalized = nextParticipants.find((value) => value !== newProfile.normalized);
    if (!peerNormalized) continue;

    const newThreadKey = threadKeyForPair(nextParticipants[0], nextParticipants[1]);
    const messages = thread?.messages || {};
    const remappedMessages = {};

    for (const [messageId, message] of Object.entries(messages)) {
      remappedMessages[messageId] = {
        ...message,
        senderNormalized: message.senderNormalized === oldProfile.normalized ? newProfile.normalized : message.senderNormalized,
        sender: message.senderNormalized === oldProfile.normalized ? newProfile.nickname : message.sender,
        senderPhotoDataUrl: message.senderNormalized === oldProfile.normalized ? (newProfile.photoDataUrl || "") : (message.senderPhotoDataUrl || ""),
      };
    }

    updates[`chat/direct/${newThreadKey}`] = {
      ...thread,
      participantsNormalized: nextParticipants,
      participants: (() => {
        const participants = { ...(thread.participants || {}) };
        delete participants[oldProfile.normalized];
        participants[newProfile.normalized] = {
          nickname: newProfile.nickname,
          photoDataUrl: newProfile.photoDataUrl || "",
          normalized: newProfile.normalized
        };
        return participants;
      })(),
      messages: remappedMessages,
      updatedAt: Date.now()
    };
    updates[`chat/direct/${threadKey}`] = null;
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

async function renameFriendships(oldProfile, newProfile) {
  const [friendsSnap, requestsSnap] = await Promise.all([
    get(friendsRootRef()),
    get(requestsRootRef())
  ]);

  const updates = {};
  const friends = friendsSnap.val() || {};
  const requests = requestsSnap.val() || {};
  const now = Date.now();

  for (const [ownerNormalized, friendMap] of Object.entries(friends)) {
    if (!friendMap) continue;

    if (ownerNormalized === oldProfile.normalized) {
      const renamedFriendMap = {};
      for (const [friendNormalized, record] of Object.entries(friendMap)) {
        if (!record) continue;
        renamedFriendMap[friendNormalized] = {
          ...record,
          ownerNickname: newProfile.nickname,
          ownerPhotoDataUrl: newProfile.photoDataUrl || "",
          updatedAt: now
        };
      }
      updates[`chat/friends/${newProfile.normalized}`] = renamedFriendMap;
      updates[`chat/friends/${ownerNormalized}`] = null;
      continue;
    }

    if (friendMap[oldProfile.normalized]) {
      const nextMap = { ...friendMap };
      nextMap[newProfile.normalized] = {
        ...friendMap[oldProfile.normalized],
        friendNormalized: newProfile.normalized,
        friendNickname: newProfile.nickname,
        friendPhotoDataUrl: newProfile.photoDataUrl || "",
        updatedAt: now
      };
      delete nextMap[oldProfile.normalized];
      updates[`chat/friends/${ownerNormalized}`] = nextMap;
    }
  }

  for (const [targetNormalized, requestMap] of Object.entries(requests)) {
    if (!requestMap) continue;

    if (targetNormalized === oldProfile.normalized) {
      const renamedRequestMap = {};
      for (const [requesterNormalized, record] of Object.entries(requestMap)) {
        if (!record) continue;
        renamedRequestMap[requesterNormalized] = {
          ...record,
          targetNormalized: newProfile.normalized,
          targetNickname: newProfile.nickname,
          targetPhotoDataUrl: newProfile.photoDataUrl || "",
          updatedAt: now
        };
      }
      updates[`chat/friendRequests/${newProfile.normalized}`] = renamedRequestMap;
      updates[`chat/friendRequests/${targetNormalized}`] = null;
      continue;
    }

    if (requestMap[oldProfile.normalized]) {
      const nextMap = { ...requestMap };
      nextMap[newProfile.normalized] = {
        ...requestMap[oldProfile.normalized],
        requesterNormalized: newProfile.normalized,
        requesterNickname: newProfile.nickname,
        requesterPhotoDataUrl: newProfile.photoDataUrl || "",
        updatedAt: now
      };
      delete nextMap[oldProfile.normalized];
      updates[`chat/friendRequests/${targetNormalized}`] = nextMap;
    }
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

async function syncProfileReferences(profile) {
  const [friendsSnap, requestsSnap, threadsSnap] = await Promise.all([
    get(friendsRootRef()),
    get(requestsRootRef()),
    get(threadsRef())
  ]);

  const updates = {};
  const friends = friendsSnap.val() || {};
  const requests = requestsSnap.val() || {};
  const threads = threadsSnap.val() || {};
  const now = Date.now();

  updates[`chat/people/${profile.normalized}`] = {
    nickname: profile.nickname,
    normalized: profile.normalized,
    photoDataUrl: profile.photoDataUrl || "",
    clientId: profile.clientId,
    updatedAt: now,
    lastSeenAt: now,
    online: true
  };
  updates[`chat/nicknames/${profile.normalized}`] = {
    nickname: profile.nickname,
    normalized: profile.normalized,
    photoDataUrl: profile.photoDataUrl || "",
    clientId: profile.clientId,
    updatedAt: now
  };

  for (const [ownerNormalized, friendMap] of Object.entries(friends)) {
    if (!friendMap) continue;
    if (ownerNormalized === profile.normalized) {
      const nextMap = {};
      for (const [friendNormalized, record] of Object.entries(friendMap)) {
        if (!record) continue;
        nextMap[friendNormalized] = {
          ...record,
          ownerNickname: profile.nickname,
          ownerPhotoDataUrl: profile.photoDataUrl || "",
          updatedAt: now
        };
      }
      updates[`chat/friends/${ownerNormalized}`] = nextMap;
      continue;
    }

    if (friendMap[profile.normalized]) {
      const nextMap = { ...friendMap };
      nextMap[profile.normalized] = {
        ...friendMap[profile.normalized],
        friendNickname: profile.nickname,
        friendPhotoDataUrl: profile.photoDataUrl || "",
        updatedAt: now
      };
      updates[`chat/friends/${ownerNormalized}`] = nextMap;
    }
  }

  for (const [targetNormalized, requestMap] of Object.entries(requests)) {
    if (!requestMap) continue;
    if (targetNormalized === profile.normalized) {
      const nextMap = {};
      for (const [requesterNormalized, record] of Object.entries(requestMap)) {
        if (!record) continue;
        nextMap[requesterNormalized] = {
          ...record,
          targetNickname: profile.nickname,
          targetPhotoDataUrl: profile.photoDataUrl || "",
          updatedAt: now
        };
      }
      updates[`chat/friendRequests/${targetNormalized}`] = nextMap;
      continue;
    }

    if (requestMap[profile.normalized]) {
      const nextMap = { ...requestMap };
      nextMap[profile.normalized] = {
        ...requestMap[profile.normalized],
        requesterNickname: profile.nickname,
        requesterPhotoDataUrl: profile.photoDataUrl || "",
        updatedAt: now
      };
      updates[`chat/friendRequests/${targetNormalized}`] = nextMap;
    }
  }

  for (const [threadKey, thread] of Object.entries(threads)) {
    const participants = thread?.participantsNormalized || [];
    if (!participants.includes(profile.normalized)) continue;

    const nextParticipants = { ...(thread.participants || {}) };
    nextParticipants[profile.normalized] = {
      ...(nextParticipants[profile.normalized] || {}),
      nickname: profile.nickname,
      photoDataUrl: profile.photoDataUrl || "",
      normalized: profile.normalized
    };

    const messages = thread?.messages || {};
    const nextMessages = {};
    for (const [messageId, message] of Object.entries(messages)) {
      nextMessages[messageId] = {
        ...message,
        sender: message.senderNormalized === profile.normalized ? profile.nickname : message.sender,
        senderPhotoDataUrl: message.senderNormalized === profile.normalized ? (profile.photoDataUrl || "") : (message.senderPhotoDataUrl || "")
      };
    }

    updates[`chat/direct/${threadKey}`] = {
      ...thread,
      participants: nextParticipants,
      messages: nextMessages,
      updatedAt: now
    };
  }

  if (Object.keys(updates).length) {
    await update(ref(db), updates);
  }
}

export async function bootstrapNickname() {
  const clientId = getSessionClientId();
  const stored = getStoredNickname();
  const candidates = [];
  if (stored?.nickname) candidates.push(stored.nickname);

  while (true) {
    if (!candidates.length) candidates.push(randomNickname());
    const candidate = displayNickname(candidates.shift());
    const reservation = await reserveNickname(candidate, clientId);
    if (reservation.ok) {
      const normalized = reservation.normalized;
      saveStoredProfile({ nickname: candidate, photoDataUrl: getStoredProfile()?.photoDataUrl || "" });
      await upsertProfile({
        nickname: candidate,
        normalized,
        photoDataUrl: getStoredProfile()?.photoDataUrl || "",
        clientId,
        joinedAt: Date.now()
      });
      return { nickname: candidate, normalized, clientId, photoDataUrl: getStoredProfile()?.photoDataUrl || "" };
    }
  }
}

export async function changeNickname(nextNickname, options = {}) {
  const clientId = getSessionClientId();
  const next = displayNickname(nextNickname);
  const nextNormalized = normalizeNickname(next);
  const photoDataUrl = options.photoDataUrl || getStoredProfile()?.photoDataUrl || "";
  if (!nextNormalized) {
    throw new Error("El nickname no puede quedar vacío.");
  }

  const current = getStoredNickname();
  if (current?.normalized === nextNormalized) {
    if ((options.photoDataUrl || "") !== (current.photoDataUrl || "")) {
      return updateProfilePhoto(options.photoDataUrl || "");
    }
    return { nickname: next, normalized: nextNormalized, clientId };
  }

  const reservation = await reserveNickname(next, clientId);
  if (!reservation.ok) {
    throw new Error("Ese nickname ya existe.");
  }

  const previous = current ? { ...current, nickname: current.nickname } : null;
  const nextProfile = {
    nickname: next,
    normalized: nextNormalized,
    clientId,
    photoDataUrl,
    changedAt: Date.now()
  };

  if (previous?.normalized) {
    await renameDirectThreads(
      { ...previous, nickname: previous.nickname },
      nextProfile
    );
    await renameFriendships(
      { ...previous, nickname: previous.nickname },
      nextProfile
    );
    await releaseNickname(previous.normalized, clientId);
    await remove(peopleRef(previous.normalized));
  }

  saveStoredNickname(next);
  saveStoredProfile({ nickname: next, photoDataUrl });
  await upsertProfile({
    nickname: next,
    normalized: nextNormalized,
    photoDataUrl,
    clientId,
    changedAt: Date.now()
  });
  await syncProfileReferences({
    nickname: next,
    normalized: nextNormalized,
    photoDataUrl,
    clientId
  });

  return nextProfile;
}

export async function updateProfilePhoto(photoDataUrl) {
  const current = getStoredProfile();
  if (!current) {
    throw new Error("No hay perfil activo.");
  }

  const nextProfile = {
    ...current,
    photoDataUrl: photoDataUrl || ""
  };

  saveStoredProfile(nextProfile);
  await upsertProfile({
    nickname: current.nickname,
    normalized: current.normalized,
    photoDataUrl: nextProfile.photoDataUrl,
    clientId: getSessionClientId(),
    photoUpdatedAt: Date.now()
  });
  await syncProfileReferences({
    ...nextProfile,
    clientId: getSessionClientId()
  });

  return nextProfile;
}

export function watchPeople(callback) {
  return onValue(peopleRef(), (snapshot) => {
    const people = snapshot.val() || {};
    callback(
      Object.values(people)
        .filter(Boolean)
        .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
    );
  });
}

export async function sendPresenceHeartbeat(profile, extra = {}) {
  await update(peopleRef(profile.normalized), {
    ...profile,
    ...extra,
    online: extra.online ?? true,
    lastSeenAt: Date.now(),
    updatedAt: Date.now()
  });
}

export async function loadThreadForPair(myNormalized, peerNormalized) {
  if (!myNormalized || !peerNormalized) return null;
  const key = threadKeyForPair(myNormalized, peerNormalized);
  const snap = await get(ref(db, `chat/direct/${key}`));
  return snap.exists() ? { key, value: snap.val() } : { key, value: null };
}

export async function ensureDirectThread(myProfile, peerProfile) {
  const key = threadKeyForPair(myProfile.normalized, peerProfile.normalized);
  const threadRef = ref(db, `chat/direct/${key}`);
  const snap = await get(threadRef);
  if (snap.exists()) return { key, value: snap.val() };

  const base = {
    participantsNormalized: [myProfile.normalized, peerProfile.normalized],
    participants: {
      [myProfile.normalized]: myProfile.nickname,
      [peerProfile.normalized]: peerProfile.nickname
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: {}
  };
  await set(threadRef, base);
  return { key, value: base };
}

export async function pushDirectMessage(threadKey, messageId, message) {
  await set(ref(db, `chat/direct/${threadKey}/messages/${messageId}`), message);
  await update(ref(db, `chat/direct/${threadKey}`), {
    updatedAt: Date.now()
  });
}

function friendListRef(normalized) {
  return ref(db, `chat/friends/${normalized}`);
}

function friendRequestsRef(normalized) {
  return ref(db, `chat/friendRequests/${normalized}`);
}

export function watchFriends(normalized, callback) {
  return onValue(friendListRef(normalized), (snapshot) => {
    const friends = snapshot.val() || {};
    callback(
      Object.values(friends)
        .filter(Boolean)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    );
  });
}

export function watchFriendRequests(normalized, callback) {
  return onValue(friendRequestsRef(normalized), (snapshot) => {
    const requests = snapshot.val() || {};
    callback(
      Object.values(requests)
        .filter(Boolean)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    );
  });
}

export async function sendFriendRequest(fromProfile, toProfile) {
  if (!fromProfile?.normalized || !toProfile?.normalized) {
    throw new Error("No se pudo preparar la solicitud.");
  }
  if (fromProfile.normalized === toProfile.normalized) {
    throw new Error("No podés agregarte a vos mismo.");
  }

  const now = Date.now();
  const payload = {
    requesterNormalized: fromProfile.normalized,
    requesterNickname: fromProfile.nickname,
    requesterPhotoDataUrl: fromProfile.photoDataUrl || "",
    targetNormalized: toProfile.normalized,
    targetNickname: toProfile.nickname,
    targetPhotoDataUrl: toProfile.photoDataUrl || "",
    createdAt: now,
    updatedAt: now,
    status: "pending"
  };

  await set(ref(db, `chat/friendRequests/${toProfile.normalized}/${fromProfile.normalized}`), payload);
  return payload;
}

export async function acceptFriendRequest(myProfile, request) {
  if (!myProfile?.normalized || !request?.requesterNormalized) {
    throw new Error("No se pudo aceptar la amistad.");
  }

  const requesterNormalized = request.requesterNormalized;
  const requesterNickname = request.requesterNickname || requesterNormalized;
  const requesterPhotoDataUrl = request.requesterPhotoDataUrl || "";
  const now = Date.now();
  const friendshipForMe = {
    friendNormalized: requesterNormalized,
    friendNickname: requesterNickname,
    friendPhotoDataUrl: requesterPhotoDataUrl,
    sinceAt: request.createdAt || now,
    updatedAt: now,
    status: "accepted"
  };
  const friendshipForThem = {
    friendNormalized: myProfile.normalized,
    friendNickname: myProfile.nickname,
    friendPhotoDataUrl: myProfile.photoDataUrl || "",
    sinceAt: request.createdAt || now,
    updatedAt: now,
    status: "accepted"
  };

  await update(ref(db), {
    [`chat/friends/${myProfile.normalized}/${requesterNormalized}`]: friendshipForMe,
    [`chat/friends/${requesterNormalized}/${myProfile.normalized}`]: friendshipForThem,
    [`chat/friendRequests/${myProfile.normalized}/${requesterNormalized}`]: null,
    [`chat/friendRequests/${requesterNormalized}/${myProfile.normalized}`]: null
  });
  return friendshipForMe;
}
