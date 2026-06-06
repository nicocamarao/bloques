const notes = [
  { label: "Do", freq: 261.63, key: "A" },
  { label: "Re", freq: 293.66, key: "S" },
  { label: "Mi", freq: 329.63, key: "D" },
  { label: "Fa", freq: 349.23, key: "F" },
  { label: "Sol", freq: 392.0, key: "G" },
  { label: "La", freq: 440.0, key: "H" },
  { label: "Si", freq: 493.88, key: "J" },
];

const piano = document.getElementById("piano");
const currentNote = document.getElementById("current-note");
const audio = new (window.AudioContext || window.webkitAudioContext)();
const activeOsc = new Map();

function play(freq, label) {
  if (audio.state === "suspended") audio.resume();
  stop(label);
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(0.0001, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0.18, audio.currentTime + 0.02);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  activeOsc.set(label, { osc, gain });
  currentNote.textContent = `Nota: ${label}`;
}

function stop(label) {
  const node = activeOsc.get(label);
  if (!node) return;
  const now = audio.currentTime;
  node.gain.gain.cancelScheduledValues(now);
  node.gain.gain.setTargetAtTime(0.0001, now, 0.03);
  node.osc.stop(now + 0.12);
  activeOsc.delete(label);
}

notes.forEach((note) => {
  const key = document.createElement("button");
  key.type = "button";
  key.className = "key";
  key.innerHTML = `<span>${note.label}</span><span class="note">${note.key}</span>`;
  key.addEventListener("pointerdown", () => {
    key.classList.add("active");
    play(note.freq, note.label);
  });
  key.addEventListener("pointerup", () => {
    key.classList.remove("active");
    stop(note.label);
  });
  key.addEventListener("pointerleave", () => {
    key.classList.remove("active");
    stop(note.label);
  });
  piano.appendChild(key);
});

window.addEventListener("keydown", (event) => {
  const note = notes.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
  if (!note || event.repeat) return;
  const index = notes.indexOf(note);
  const button = piano.children[index];
  button?.classList.add("active");
  play(note.freq, note.label);
});

window.addEventListener("keyup", (event) => {
  const note = notes.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
  if (!note) return;
  const index = notes.indexOf(note);
  const button = piano.children[index];
  button?.classList.remove("active");
  stop(note.label);
});
