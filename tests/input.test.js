import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BINDINGS,
  cloneBindings,
  gamepadToInput,
  keyboardToInputs,
  mergeInputs,
} from "../src/core/input.js";

test("default keyboard bindings match the four-player split", () => {
  assert.deepEqual(DEFAULT_BINDINGS[0], {
    left: "KeyA",
    right: "KeyD",
    up: "KeyW",
    down: "KeyS",
    action: "KeyF",
    secondary: "KeyG",
  });
  assert.deepEqual(DEFAULT_BINDINGS[1], {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    action: "Slash",
    secondary: "Period",
  });
  assert.deepEqual(DEFAULT_BINDINGS[2], {
    left: "KeyJ",
    right: "KeyL",
    up: "KeyI",
    down: "KeyK",
    action: "Semicolon",
    secondary: "Quote",
  });
  assert.deepEqual(DEFAULT_BINDINGS[3], {
    left: "Numpad4",
    right: "Numpad6",
    up: "Numpad8",
    down: "Numpad5",
    action: "Numpad0",
    secondary: "NumpadEnter",
  });
});

test("keyboard codes map to the owning player only", () => {
  const down = new Set(["KeyA", "KeyF", "ArrowRight", "Period", "KeyI", "Numpad0", "Escape"]);
  const mapped = keyboardToInputs(down);
  assert.equal(mapped.players[0].left, true);
  assert.equal(mapped.players[0].action, true);
  assert.equal(mapped.players[0].right, false);
  assert.equal(mapped.players[1].right, true);
  assert.equal(mapped.players[1].secondary, true);
  assert.equal(mapped.players[1].action, false);
  assert.equal(mapped.players[2].up, true);
  assert.equal(mapped.players[2].left, false);
  assert.equal(mapped.players[3].action, true);
  assert.equal(mapped.players[3].left, false);
  assert.equal(mapped.pause, true);
});

test("remapped bindings change keyboard actions", () => {
  const bindings = cloneBindings();
  bindings[0].action = "Space";
  bindings[0].left = "KeyZ";
  const mapped = keyboardToInputs(new Set(["Space", "KeyZ", "KeyF", "KeyA"]), bindings);
  assert.equal(mapped.players[0].action, true);
  assert.equal(mapped.players[0].left, true);
  assert.equal(mapped.players[0].right, false);
});

function pad(axes, pressed) {
  const buttons = Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 }));
  return { connected: true, axes, buttons };
}

test("gamepad stick, d-pad, A, B, and Start map to actions", () => {
  const stick = gamepadToInput(pad([-0.9, 0.8], []));
  assert.equal(stick.left, true);
  assert.equal(stick.down, true);
  assert.equal(stick.action, false);

  const face = gamepadToInput(pad([0.1, -0.1], [0, 1, 9]));
  assert.equal(face.action, true);
  assert.equal(face.secondary, true);
  assert.equal(face.pause, true);
  assert.equal(face.left, false);
  assert.equal(face.up, false);

  const dpad = gamepadToInput(pad([0.95, 0.95], [12, 14]));
  assert.equal(dpad.up, true);
  assert.equal(dpad.left, true);
  assert.equal(dpad.down, false);
  assert.equal(dpad.right, false);
});

test("a connected gamepad overrides that player's keyboard and hot-unplug restores it", () => {
  const keyboard = keyboardToInputs(new Set(["KeyD", "KeyF", "ArrowLeft"]));
  const pads = [pad([-1, 0], [1]), null, null, null];
  const connected = mergeInputs(keyboard, pads, [true, false, false, false]);
  assert.equal(connected.players[0].left, true);
  assert.equal(connected.players[0].right, false);
  assert.equal(connected.players[0].action, false);
  assert.equal(connected.players[0].secondary, true);
  assert.equal(connected.players[1].left, true);

  const unplugged = mergeInputs(keyboard, pads, [false, false, false, false]);
  assert.equal(unplugged.players[0].right, true);
  assert.equal(unplugged.players[0].action, true);
  assert.equal(unplugged.players[0].left, false);
  assert.equal(unplugged.players[0].secondary, false);
});
