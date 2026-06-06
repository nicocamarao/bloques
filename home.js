import { bootstrapNickname, watchFriends, watchPeople } from "./games/chat-identity.js";

const homeNickEl = document.getElementById("home-nick");
const homeStatusEl = document.getElementById("home-status");
const onlineCountEl = document.getElementById("online-count");
const rosterEl = document.getElementById("home-roster");
const friendCountEl = document.getElementById("home-friend-count");
const friendListEl = document.getElementById("home-friend-list");

let currentFriends = [];
let currentPeople = [];

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
      <strong>${person.nickname}${isCurrent ? " (tu)" : ""}</strong>
      <span>${isCurrent ? "sesion actual" : person.online ? "en linea" : "visto hace poco"}</span>
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
      <strong>${livePerson?.nickname || friend.friendNickname}</strong>
      <span>${livePerson?.online ? "en linea" : "amigo guardado"}</span>
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
