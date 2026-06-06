import { bootstrapNickname, watchPeople } from "./games/chat-identity.js";

const homeNickEl = document.getElementById("home-nick");
const homeStatusEl = document.getElementById("home-status");
const onlineCountEl = document.getElementById("online-count");
const rosterEl = document.getElementById("home-roster");

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

const session = await bootstrapNickname();
homeNickEl.textContent = session.nickname;
homeStatusEl.textContent = "Sesion lista. Tu nick ya quedo reservado.";

watchPeople((people) => {
  const current = people.find((person) => person.normalized === session.normalized);
  onlineCountEl.textContent = `${people.length} personas`;
  renderRoster(people, current?.nickname || session.nickname);
});
