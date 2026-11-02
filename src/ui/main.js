import { DEFAULT_ROUNDS_TO_WIN } from "../core/constants.js";
import { createGame, step } from "../core/game.js";
import {
  DEFAULT_BINDINGS,
  cloneBindings,
  keyboardToInputs,
  mergeInputs,
} from "../core/input.js";
import { createAudio } from "./audio.js";
import { render } from "./render.js";

const SETTINGS_KEY = "rooftoprumble.settings";
const BINDINGS_KEY = "rooftoprumble.bindings";
const ACTION_FIELDS = ["left", "right", "up", "down", "action", "secondary"];

const canvas = document.getElementById("game");
const live = document.getElementById("live");
const ctx = canvas.getContext("2d");
const audio = createAudio();
const params = new URLSearchParams(location.search);
const held = new Set();
const queue = [];

let screen = "title";
let game = null;
let slots = [{ mode: "bot" }, { mode: "bot" }, { mode: "bot" }, { mode: "bot" }];
let menuIndex = 0;
let controlPlayer = 0;
let capture = null;
let settings = loadSettings();
let bindings = loadBindings();
let cam = null;
let particles = [];
let prevPause = false;
let prevMenuAction = false;
let last = performance.now();
let acc = 0;
const cover = new Image();
cover.src = "assets/cover.jpg";

audio.setVolume(settings.volume);
audio.setMuted(settings.muted);

function loadSettings() {
  const fallback = { volume: 0.7, roundsToWin: DEFAULT_ROUNDS_TO_WIN, muted: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!parsed) return fallback;
    return {
      volume: clamp(Number(parsed.volume ?? fallback.volume), 0, 1),
      roundsToWin: clamp(Math.round(Number(parsed.roundsToWin ?? 3)), 1, 5),
      muted: !!parsed.muted,
    };
  } catch {
    return fallback;
  }
}

function loadBindings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BINDINGS_KEY) || "null");
    if (!Array.isArray(parsed) || parsed.length !== 4) return cloneBindings();
    return parsed.map((binding, index) => {
      const next = { ...DEFAULT_BINDINGS[index] };
      for (const field of ACTION_FIELDS) {
        if (typeof binding?.[field] === "string" && binding[field]) next[field] = binding[field];
      }
      return next;
    });
  } catch {
    return cloneBindings();
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode */
  }
}

function saveBindings() {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    /* private mode */
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function padSnapshots() {
  const connected = [false, false, false, false];
  const pads = [null, null, null, null];
  const source = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 4; i++) {
    const pad = source && source[i];
    if (pad && pad.connected) {
      connected[i] = true;
      pads[i] = pad;
    }
  }
  return { connected, pads };
}

function readInputs() {
  let pads = { connected: [false, false, false, false], pads: [null, null, null, null] };
  try {
    pads = padSnapshots();
  } catch {
    /* gamepad API unavailable */
  }
  const keyboard = keyboardToInputs(held, bindings);
  const merged = mergeInputs(keyboard, pads.pads, pads.connected);
  return { ...merged, connected: pads.connected };
}

function startMatch() {
  const active = slots.filter((slot) => slot.mode !== "off");
  if (!active.length) return;
  const seed = Number(params.get("seed")) || (Date.now() % 999983) || 1;
  game = createGame({
    seed,
    slots: slots.map((slot) => ({ mode: slot.mode })),
    roundsToWin: settings.roundsToWin,
  });
  cam = null;
  particles = [];
  screen = "play";
  menuIndex = 0;
  audio.startTheme();
}

function snapshot() {
  if (!game) return { screen, slots: slots.map((slot) => slot.mode) };
  return {
    screen,
    phase: game.phase,
    round: game.round,
    roundTime: game.roundTime,
    overtime: game.overtime,
    paused: !!game.paused,
    frames: game.frames,
    roundWinner: game.roundWinner,
    matchWinner: game.matchWinner,
    camera: { ...game.camera },
    scroll: game.scroll
      ? { x: game.scroll.x, y: game.scroll.y, heldBy: game.scroll.heldBy }
      : null,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      bot: player.bot,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      score: player.score,
      rounds: player.rounds,
      eliminations: player.eliminations,
      shuriken: player.shuriken,
      hasScroll: player.hasScroll,
      alive: player.alive,
      facing: player.facing,
    })),
  };
}

function burst(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * 140,
      vy: Math.sin(angle) * 140,
      life: 1,
      color,
    });
  }
}

function playEvents(events) {
  for (const event of events) {
    audio.play(event.type);
    if (event.type === "hit" || event.type === "ko" || event.type === "shuriken") {
      const player = game.players.find((candidate) => candidate.id === event.id);
      if (player) burst(player.x + player.w / 2, player.y + 16, player.color);
    }
  }
}

function isActionCode(code) {
  return bindings.some((binding) => binding.action === code) || code === "Enter" || code === "Space";
}

function slotForCode(code, field) {
  return bindings.findIndex((binding) => binding[field] === code);
}

function handleMenuKey(code) {
  const inputs = readInputs();
  const up = code === "ArrowUp" || code === "KeyW" || code === bindings[0].up;
  const down = code === "ArrowDown" || code === "KeyS" || code === bindings[0].down;
  const left = code === "ArrowLeft" || code === "KeyA" || code === bindings[0].left;
  const right = code === "ArrowRight" || code === "KeyD" || code === bindings[0].right;
  const confirm = isActionCode(code) || code === "Enter";

  if (screen === "title") {
    if (confirm || code === "Enter" || inputs.pause) {
      screen = "join";
      audio.unlock();
    }
    return;
  }

  if (screen === "join") {
    if (code === "Escape") {
      screen = "title";
      return;
    }
    if (code === "Enter") {
      startMatch();
      return;
    }
    const join = slotForCode(code, "action");
    if (join >= 0) slots[join].mode = "human";
    const toggle = slotForCode(code, "secondary");
    if (toggle >= 0) {
      const mode = slots[toggle].mode;
      slots[toggle].mode = mode === "human" ? "bot" : mode === "bot" ? "off" : "bot";
    }
    return;
  }

  if (screen === "pause") {
    const count = 4;
    if (up) menuIndex = (menuIndex + count - 1) % count;
    if (down) menuIndex = (menuIndex + 1) % count;
    if (code === "Escape") {
      resume();
      return;
    }
    if (confirm) {
      if (menuIndex === 0) resume();
      else if (menuIndex === 1) {
        screen = "settings";
        menuIndex = 0;
      } else if (menuIndex === 2) {
        screen = "controls";
        menuIndex = 0;
        controlPlayer = 0;
      } else quit();
    }
    return;
  }

  if (screen === "settings") {
    if (up) menuIndex = (menuIndex + 3) % 4;
    if (down) menuIndex = (menuIndex + 1) % 4;
    if (menuIndex === 0 && left) settings.volume = clamp(settings.volume - 0.1, 0, 1);
    if (menuIndex === 0 && right) settings.volume = clamp(settings.volume + 0.1, 0, 1);
    if (menuIndex === 1 && left) settings.roundsToWin = clamp(settings.roundsToWin - 1, 1, 5);
    if (menuIndex === 1 && right) settings.roundsToWin = clamp(settings.roundsToWin + 1, 1, 5);
    if ((menuIndex === 2 && confirm) || (menuIndex === 2 && (left || right))) {
      settings.muted = !settings.muted;
    }
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);
    saveSettings();
    if ((menuIndex === 3 && confirm) || code === "Escape") {
      screen = game ? "pause" : "title";
      menuIndex = 0;
    }
    return;
  }

  if (screen === "controls") {
    if (capture) {
      if (code === "Escape") {
        capture = null;
        return;
      }
      const field = ACTION_FIELDS[capture.row];
      for (const binding of bindings) {
        for (const key of ACTION_FIELDS) {
          if (binding[key] === code) binding[key] = bindings[capture.player][field];
        }
      }
      bindings[capture.player][field] = code;
      capture = null;
      saveBindings();
      return;
    }
    const count = 8;
    if (up) menuIndex = (menuIndex + count - 1) % count;
    if (down) menuIndex = (menuIndex + 1) % count;
    if (left) controlPlayer = (controlPlayer + 3) % 4;
    if (right) controlPlayer = (controlPlayer + 1) % 4;
    if (code === "Escape") {
      screen = game ? "pause" : "join";
      menuIndex = 0;
      return;
    }
    if (confirm && menuIndex < 6) capture = { player: controlPlayer, row: menuIndex };
    if (confirm && menuIndex === 6) {
      bindings[controlPlayer] = { ...DEFAULT_BINDINGS[controlPlayer] };
      saveBindings();
    }
    if (confirm && menuIndex === 7) {
      screen = game ? "pause" : "join";
      menuIndex = 0;
    }
    return;
  }

  if (screen === "match") {
    const extra = game ? game.players.length : 0;
    const count = extra + 2;
    if (up) menuIndex = (menuIndex + count - 1) % count;
    if (down) menuIndex = (menuIndex + 1) % count;
    if (code === "Escape") quit();
    if (confirm && menuIndex === extra) startMatch();
    if (confirm && menuIndex === extra + 1) quit();
  }
}

function resume() {
  if (game) game.paused = false;
  screen = "play";
}

function quit() {
  audio.stopTheme();
  game = null;
  cam = null;
  screen = "title";
  menuIndex = 0;
}

function pause() {
  if (!game || game.phase === "matchover") return;
  game.paused = true;
  screen = "pause";
  menuIndex = 0;
}

function updateParticles(dt) {
  particles = particles.filter((particle) => {
    particle.life -= dt * 1.8;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 400 * dt;
    return particle.life > 0;
  });
}

function updateLive() {
  if (!live) return;
  if (!game) {
    live.textContent = screen === "join" ? "Join screen" : "Rooftop Rumble title";
    return;
  }
  const scores = game.players.map((player) => `${player.name} ${Math.floor(player.score)}`).join(", ");
  live.textContent = `${screen} round ${game.round} ${game.phase} ${scores}`;
}

window.addEventListener("keydown", (event) => {
  const bound = bindings.some((binding) => ACTION_FIELDS.some((field) => binding[field] === event.code));
  if (bound || ["Enter", "Space", "Escape", "KeyM", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }
  held.add(event.code);
  if (event.repeat) return;
  queue.push(event.code);
  audio.unlock();
});

window.addEventListener("keyup", (event) => {
  held.delete(event.code);
});

window.addEventListener("blur", () => held.clear());

if (params.get("bots") === "4") {
  slots = [{ mode: "bot" }, { mode: "bot" }, { mode: "bot" }, { mode: "bot" }];
  startMatch();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const inputs = readInputs();
  const pauseEdge = inputs.pause && !prevPause;
  prevPause = inputs.pause;

  let handledPauseKey = false;
  while (queue.length) {
    const code = queue.shift();
    if (code === "KeyM" && screen !== "controls") {
      settings.muted = audio.toggleMuted();
      saveSettings();
      continue;
    }
    if (code === "Escape") {
      handledPauseKey = true;
      if (screen === "play") pause();
      else if (screen === "pause") resume();
      else if (screen === "title") screen = "join";
      else handleMenuKey(code);
      continue;
    }
    if (screen !== "play") handleMenuKey(code);
  }

  if (pauseEdge && !handledPauseKey) {
    if (screen === "play") pause();
    else if (screen === "pause") resume();
    else if (screen === "title") screen = "join";
  }

  const menuAction = !!(inputs.players[0] && inputs.players[0].action);
  if (menuAction && !prevMenuAction && screen !== "play" && !queue.length) {
    handleMenuKey(bindings[0].action);
  }
  prevMenuAction = menuAction;

  if (screen === "play" && game && !game.paused && game.phase !== "matchover") {
    acc += dt;
    let guard = 0;
    while (acc >= 1 / 60 && guard++ < 5) {
      acc -= 1 / 60;
      step(game, inputs);
      playEvents(game.events);
      if (game.phase === "matchover") break;
    }
  } else {
    acc = 0;
  }

  if (game && game.phase === "matchover" && screen === "play") {
    screen = "match";
    menuIndex = game.players.length;
  }

  if (game) {
    if (!cam) cam = { x: game.camera.x, y: game.camera.y, zoom: game.camera.zoom };
    else {
      cam.x += (game.camera.x - cam.x) * 0.18;
      cam.y += (game.camera.y - cam.y) * 0.18;
      cam.zoom += (game.camera.zoom - cam.zoom) * 0.18;
    }
  }
  updateParticles(dt);
  audio.tickTheme();
  render(ctx, {
    screen,
    game,
    cover,
    pads: inputs.connected,
    slots,
    menuIndex,
    settings,
    bindings,
    capture,
    cam,
    time: now / 1000,
    particles,
    controlPlayer,
  });
  updateLive();
  requestAnimationFrame(frame);
}

window.__ROOFTOP__ = {
  getScreen: () => screen,
  getSnapshot: snapshot,
  startBots() {
    slots = [{ mode: "bot" }, { mode: "bot" }, { mode: "bot" }, { mode: "bot" }];
    startMatch();
  },
};

requestAnimationFrame(frame);
