import assert from "node:assert/strict";
import test from "node:test";
import { PLAYER_H, PLAYER_W } from "../src/core/constants.js";
import { computeCamera, createGame, step } from "../src/core/game.js";
import { moveBody, overlaps } from "../src/core/physics.js";
import { flatGame, hold } from "./helpers.js";

test("overlaps detects AABB intersection", () => {
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 10, h: 10 }), true);
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 12, w: 4, h: 4 }), false);
});

test("a body lands on a solid platform and stays there", () => {
  const platform = { x: 0, y: 200, w: 400, h: 30, oneWay: false };
  const body = { x: 40, y: 40, w: 26, h: 44, vx: 0, vy: 0, grounded: false, wall: 0, onOneWay: false };
  let grounded = false;
  for (let i = 0; i < 180; i++) {
    moveBody(body, [platform]);
    if (body.grounded) grounded = true;
  }
  assert.equal(grounded, true);
  assert.equal(body.grounded, true);
  assert.ok(Math.abs(body.y + body.h - platform.y) < 0.01);
  const settled = body.y;
  for (let i = 0; i < 30; i++) moveBody(body, [platform]);
  assert.equal(body.y, settled);
});

test("one-way platforms catch falls from above and let jumps pass through", () => {
  const line = { x: 0, y: 180, w: 200, h: 6, oneWay: true, kind: "clothesline" };
  const falling = { x: 20, y: 80, w: 26, h: 44, vx: 0, vy: 0, grounded: false, wall: 0, onOneWay: false };
  for (let i = 0; i < 180; i++) moveBody(falling, [line]);
  assert.equal(falling.grounded, true);
  assert.equal(falling.onOneWay, true);
  assert.ok(Math.abs(falling.y + falling.h - line.y) < 0.01);

  const rising = { x: 20, y: 200, w: 26, h: 44, vx: 0, vy: -700, grounded: false, wall: 0, onOneWay: false };
  let crossed = false;
  for (let i = 0; i < 20; i++) {
    moveBody(rising, [line]);
    if (rising.y + rising.h < line.y) crossed = true;
  }
  assert.equal(crossed, true);
});

test("solids block horizontal movement", () => {
  const wall = { x: 300, y: 300, w: 40, h: 120, oneWay: false, kind: "chimney" };
  const floor = { x: 0, y: 400, w: 800, h: 40, oneWay: false, kind: "roof" };
  const body = { x: 250, y: 400 - 44, w: 26, h: 44, vx: 250, vy: 0, grounded: true, wall: 0, onOneWay: false };
  for (let i = 0; i < 40; i++) {
    body.vx = 250;
    moveBody(body, [wall, floor]);
  }
  assert.ok(body.x + body.w <= wall.x + 0.01);
  assert.equal(body.wall, 1);
});

test("bounce reverses a hard landing", () => {
  const floor = { x: 0, y: 300, w: 400, h: 20, oneWay: false };
  const body = { x: 30, y: 240, w: 18, h: 14, vx: 40, vy: 420, grounded: false, wall: 0, onOneWay: false };
  let bounced = false;
  for (let i = 0; i < 40; i++) {
    moveBody(body, [floor], 1 / 60, { bounce: 0.55 });
    if (body.vy < 0) bounced = true;
  }
  assert.equal(bounced, true);
});

test("action jumps and a wall contact sets up a wall jump", () => {
  const game = flatGame();
  const player = game.players[0];
  const startY = player.y;
  step(game, hold(0, { action: true }));
  assert.ok(player.vy < 0);
  assert.ok(player.y < startY);

  const walled = createGame({
    seed: 3,
    slots: [{ mode: "human" }, { mode: "off" }, { mode: "off" }, { mode: "off" }],
    pickups: false,
    level: {
      platforms: [
        { x: 0, y: 0, w: 48, h: 520, kind: "facade", oneWay: false },
        { x: 0, y: 520, w: 1200, h: 40, kind: "roof", oneWay: false },
      ],
      width: 1200,
      streetY: 700,
      deathY: 900,
    },
    spawns: [{ x: 80, y: 520 - PLAYER_H }],
    scrollAt: { x: 900, y: 100 },
  });
  const ninja = walled.players[0];
  ninja.x = 40;
  ninja.y = 180;
  ninja.vy = 40;
  ninja.grounded = false;
  step(walled);
  assert.equal(ninja.wall, -1);
  assert.equal(ninja.grounded, false);
  step(walled, hold(0, { action: true }));
  assert.ok(ninja.vx > 100);
  assert.ok(ninja.vy < 0);
});

test("shared camera zooms out when players spread apart", () => {
  const game = flatGame();
  game.players[0].x = 100;
  game.players[1].x = 140;
  game.players[2].x = 180;
  game.players[3].x = 220;
  step(game);
  const closeZoom = game.camera.zoom;
  game.players[1].x = 1800;
  game.players[2].x = 2100;
  game.players[3].x = 2500;
  step(game);
  assert.ok(game.camera.zoom < closeZoom);
  assert.ok(closeZoom > 1);
  const direct = computeCamera(game.players);
  assert.equal(direct.zoom, game.camera.zoom);
});

test("player width constant matches spawned bodies", () => {
  const game = flatGame();
  assert.equal(game.players[0].w, PLAYER_W);
  assert.equal(game.players[0].h, PLAYER_H);
});
