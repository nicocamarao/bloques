import { createJumpEngine } from "../jump-engine.js";

const canvas = document.getElementById("game");
const engine = createJumpEngine({
  canvas,
  title: window.JUMP_CONFIG?.title ?? "Jump Atelier",
  startValue: window.JUMP_CONFIG?.startValue ?? 1,
  speed: window.JUMP_CONFIG?.speed ?? 4.7,
  jumpForce: window.JUMP_CONFIG?.jumpForce ?? 11.8,
  scoreStep: window.JUMP_CONFIG?.scoreStep ?? 10,
  palette: window.JUMP_CONFIG?.palette ?? {},
  ui: {
    score: document.getElementById("jump-score"),
    unlocked: document.getElementById("jump-unlocked"),
    title: null,
    status: null,
  },
});

document.getElementById("start").addEventListener("click", () => engine.start(window.JUMP_CONFIG?.startValue ?? 1));
window.addEventListener("resize", () => engine.resize());
engine.render();
