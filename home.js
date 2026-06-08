import { bootstrapNickname, watchFriends, watchPeople } from "./games/chat-identity.js";

const homeNickEl = document.getElementById("home-nick");
const homeStatusEl = document.getElementById("home-status");
const onlineCountEl = document.getElementById("online-count");
const rosterEl = document.getElementById("home-roster");
const friendCountEl = document.getElementById("home-friend-count");
const friendListEl = document.getElementById("home-friend-list");

let currentFriends = [];
let currentPeople = [];

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
      <text x="40" y="46" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="white">${safeName}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderRoster(people, currentNickname) {
  rosterEl.innerHTML = "";
  const visible = people.slice(0, 4);

  if (!visible.length) {
    rosterEl.innerHTML = "<li>No hay actividad todavia.</li>";
    return;
  }

  visible.forEach((person) => {
    const item = document.createElement("li");
    const isCurrent = person.nickname === currentNickname;
    item.innerHTML = `
      <div class="person-mini">
        <img class="avatar" src="${person.photoDataUrl || avatarFallback(person.nickname)}" alt="">
        <div>
          <strong>${person.nickname}${isCurrent ? " (tu)" : ""}</strong>
          <span>${isCurrent ? "sesion actual" : person.online ? "en linea" : "visto hace poco"}</span>
        </div>
      </div>
    `;
    rosterEl.appendChild(item);
  });
}

function renderFriends() {
  friendCountEl.textContent = String(currentFriends.length);
  friendListEl.innerHTML = "";
  const preview = currentFriends.slice(0, 3);

  if (!preview.length) {
    friendListEl.innerHTML = "<li><strong>Todavia no sumaste amigos</strong><span>tu lista va a aparecer aca</span></li>";
    return;
  }

  preview.forEach((friend) => {
    const livePerson = currentPeople.find((person) => person.normalized === friend.friendNormalized);
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="person-mini">
        <img class="avatar" src="${livePerson?.photoDataUrl || friend.friendPhotoDataUrl || avatarFallback(friend.friendNickname)}" alt="">
        <div>
          <strong>${livePerson?.nickname || friend.friendNickname}</strong>
          <span>${livePerson?.online ? "en linea" : "amigo guardado"}</span>
        </div>
      </div>
    `;
    friendListEl.appendChild(li);
  });
}

const session = await bootstrapNickname();
homeNickEl.textContent = session.nickname;
homeStatusEl.textContent = "Sesion lista. Tu nick ya quedo reservado.";

watchPeople((people) => {
  currentPeople = people;
  const current = people.find((person) => person.normalized === session.normalized);
  onlineCountEl.textContent = `${people.length} personas`;
  renderRoster(people, current?.nickname || session.nickname);
});

watchFriends(session.normalized, (friends) => {
  currentFriends = friends;
  renderFriends();
});
