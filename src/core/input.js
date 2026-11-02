/** Keyboard and gamepad mapping. Pure: no DOM. Gamepads override keyboard per player. */

export const DEFAULT_BINDINGS = [
  { left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", action: "KeyF", secondary: "KeyG" },
  { left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", action: "Slash", secondary: "Period" },
  { left: "KeyJ", right: "KeyL", up: "KeyI", down: "KeyK", action: "Semicolon", secondary: "Quote" },
  { left: "Numpad4", right: "Numpad6", up: "Numpad8", down: "Numpad5", action: "Numpad0", secondary: "NumpadEnter" },
];

export const PLAYER_KEY_HINTS = [
  "WASD  ·  F jump  ·  G strike",
  "Arrows  ·  / jump  ·  . strike",
  "IJKL  ·  ; jump  ·  ' strike",
  "Numpad  ·  0 jump  ·  Enter strike",
];

export function blankInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    action: false,
    secondary: false,
    pause: false,
  };
}

export function cloneBindings(bindings = DEFAULT_BINDINGS) {
  return bindings.map((binding) => ({ ...binding }));
}

function asIsDown(source) {
  if (typeof source === "function") return source;
  if (source instanceof Set) return (code) => source.has(code);
  if (!source) return () => false;
  return (code) => !!source[code];
}

function buttonPressed(buttons, index) {
  const button = buttons?.[index];
  if (!button) return false;
  if (typeof button === "boolean") return button;
  return !!(button.pressed || button.value > 0.5);
}

/**
 * @param {Set<string>|Record<string, boolean>|function(string): boolean} source
 * @param {Array} bindings
 */
export function keyboardToInputs(source, bindings = DEFAULT_BINDINGS) {
  const isDown = asIsDown(source);
  const players = [];
  for (let i = 0; i < 4; i++) {
    const binding = bindings[i] || DEFAULT_BINDINGS[i];
    players.push({
      left: !!isDown(binding.left),
      right: !!isDown(binding.right),
      up: !!isDown(binding.up),
      down: !!isDown(binding.down),
      action: !!isDown(binding.action),
      secondary: !!isDown(binding.secondary),
      pause: false,
    });
  }
  return { players, pause: !!isDown("Escape") };
}

/** Standard Gamepad mapping: A, B, Start, d-pad, left stick. */
export function gamepadToInput(pad) {
  if (!pad || pad.connected === false) return blankInput();
  const lx = pad.axes?.[0] ?? 0;
  const ly = pad.axes?.[1] ?? 0;
  const buttons = pad.buttons ?? [];
  const dLeft = buttonPressed(buttons, 14);
  const dRight = buttonPressed(buttons, 15);
  const dUp = buttonPressed(buttons, 12);
  const dDown = buttonPressed(buttons, 13);
  let left = lx < -0.4;
  let right = lx > 0.4;
  let up = ly < -0.4;
  let down = ly > 0.4;
  if (dLeft || dRight) {
    left = dLeft;
    right = dRight;
  }
  if (dUp || dDown) {
    up = dUp;
    down = dDown;
  }
  return {
    left,
    right,
    up,
    down,
    action: buttonPressed(buttons, 0),
    secondary: buttonPressed(buttons, 1),
    pause: buttonPressed(buttons, 9),
  };
}

/**
 * When connected[i] is true, that player's keyboard is ignored
 * and the gamepad snapshot is used instead (hot-plug).
 */
export function mergeInputs(keyboard, gamepads, connected) {
  const kb = keyboard?.players ? keyboard : { players: keyboard || [], pause: false };
  const players = [0, 1, 2, 3].map((index) => {
    if (connected?.[index]) return gamepadToInput(gamepads?.[index]);
    return { ...blankInput(), ...(kb.players[index] || {}) };
  });
  const pause =
    !!kb.pause ||
    players.some((input, index) => connected?.[index] && input.pause);
  return {
    players: players.map((input) => ({ ...input, pause: false })),
    pause,
  };
}
