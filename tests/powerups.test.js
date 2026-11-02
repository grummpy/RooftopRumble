import assert from "node:assert/strict";
import test from "node:test";
import { SHURIKEN_USES } from "../src/core/constants.js";
import { giveScroll, step, stepFrames } from "../src/core/game.js";
import { flatGame, hold } from "./helpers.js";

test("shuriken pickups grant three ranged uses", () => {
  const game = flatGame({ pickups: true });
  const player = game.players[0];
  const pickup = {
    x: player.x,
    y: player.y,
    w: 18,
    h: 18,
    active: true,
    respawn: 0,
  };
  game.pickups = [pickup];
  step(game);
  assert.equal(player.shuriken, SHURIKEN_USES);
  assert.equal(pickup.active, false);
  assert.ok(pickup.respawn > 0);
});

test("down plus secondary throws a shuriken and spends a charge", () => {
  const game = flatGame();
  const player = game.players[0];
  player.shuriken = 3;
  player.facing = 1;
  step(game, hold(0, { down: true, secondary: true }));
  assert.equal(player.shuriken, 2);
  assert.equal(game.projectiles.length, 1);
  assert.ok(game.projectiles[0].vx > 0);
  assert.equal(game.projectiles[0].owner, 0);
});

test("a shuriken knocks the holder and drops the scroll", () => {
  const game = flatGame();
  const attacker = game.players[0];
  const holder = game.players[1];
  attacker.x = 200;
  attacker.facing = 1;
  attacker.shuriken = 1;
  holder.x = 280;
  giveScroll(game, 1);
  step(game, hold(0, { down: true, secondary: true }));
  assert.equal(attacker.shuriken, 0);
  let dropped = game.scroll.heldBy == null;
  for (let i = 0; i < 20 && !dropped; i++) {
    step(game);
    dropped = game.scroll.heldBy == null;
  }
  assert.equal(dropped, true);
  assert.ok(holder.hitstun > 0 || holder.invuln > 0);
  assert.equal(game.projectiles.length, 0);
});

test("charges stop at zero and a plain secondary still strikes", () => {
  const game = flatGame();
  const player = game.players[0];
  player.shuriken = 1;
  player.facing = 1;
  step(game, hold(0, { down: true, secondary: true }));
  assert.equal(player.shuriken, 0);
  stepFrames(game, hold(0, { left: true }), 30);
  const before = game.projectiles.length;
  step(game, hold(0, { down: true, secondary: true }));
  assert.equal(player.shuriken, 0);
  assert.equal(game.projectiles.length, before);

  const striker = flatGame();
  striker.players[0].shuriken = 2;
  striker.players[0].facing = 1;
  striker.players[1].x = striker.players[0].x + 36;
  step(striker, hold(0, { secondary: true }));
  assert.equal(striker.players[0].shuriken, 2);
  assert.equal(striker.projectiles.length, 0);
  assert.ok(striker.players[0].strikeT > 0);
  assert.ok(striker.players[1].hitstun > 0);
});
