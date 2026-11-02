import { PLAYER_H, SCROLL_H } from "../src/core/constants.js";
import { createGame } from "../src/core/game.js";
import { blankInput } from "../src/core/input.js";

export function flatLevel() {
  return {
    platforms: [{ x: 0, y: 400, w: 4000, h: 40, kind: "roof", oneWay: false }],
    width: 4000,
    streetY: 720,
    deathY: 800,
  };
}

export function flatGame(overrides = {}) {
  const humans = [0, 1, 2, 3].map(() => ({ mode: "human" }));
  return createGame({
    seed: 1,
    slots: humans,
    level: flatLevel(),
    spawns: [
      { x: 100, y: 400 - PLAYER_H },
      { x: 220, y: 400 - PLAYER_H },
      { x: 700, y: 400 - PLAYER_H },
      { x: 900, y: 400 - PLAYER_H },
    ],
    scrollAt: { x: 3200, y: 400 - SCROLL_H },
    pickups: false,
    roundsToWin: 3,
    ...overrides,
  });
}

export function hold(index, partial) {
  const players = [null, null, null, null];
  players[index] = { ...blankInput(), ...partial };
  return players;
}

export function onRoof(state, player) {
  return state.level.platforms.some(
    (platform) =>
      platform.kind === "roof" &&
      player.x + player.w > platform.x + 1 &&
      player.x < platform.x + platform.w - 1 &&
      Math.abs(player.y + player.h - platform.y) <= 2,
  );
}
