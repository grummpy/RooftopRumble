import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOLDER_SPEED_MUL,
  MOVE_SPEED,
  ROUND_LIMIT,
  ROUND_SECONDS,
} from "../src/core/constants.js";
import { createGame, giveScroll, step, stepFrames } from "../src/core/game.js";
import { generateLevel } from "../src/core/level.js";
import { createRng } from "../src/core/rng.js";
import { flatGame, hold, onRoof } from "./helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the scroll holder scores one point per second", () => {
  const game = flatGame();
  giveScroll(game, 0);
  stepFrames(game, null, 120);
  const holder = game.players[0];
  assert.equal(holder.scoreFrames, 120);
  assert.ok(Math.abs(holder.score - 2) < 1e-9);
  assert.equal(game.players[1].scoreFrames, 0);
  assert.equal(game.phase, "play");
});

test("holder moves 10% slower and cannot strike", () => {
  const game = flatGame();
  const slow = game.players[0];
  const other = game.players[1];
  giveScroll(game, 0);
  step(game, hold(0, { right: true, secondary: true }));
  assert.equal(slow.vx, MOVE_SPEED * HOLDER_SPEED_MUL);
  assert.equal(slow.strikeT, 0);
  assert.equal(other.hitstun, 0);
  assert.equal(game.scroll.heldBy, 0);

  const free = flatGame();
  step(free, hold(0, { right: true }));
  assert.equal(free.players[0].vx, MOVE_SPEED);
});

test("a strike on the holder drops the scroll with a bounce", () => {
  const game = flatGame();
  const attacker = game.players[0];
  const holder = game.players[1];
  attacker.x = 180;
  attacker.facing = 1;
  holder.x = 210;
  giveScroll(game, 1);
  step(game, hold(0, { secondary: true }));
  assert.equal(game.scroll.heldBy, null);
  assert.equal(holder.hasScroll, false);
  assert.ok(game.scroll.vy < 0);
  assert.ok(Math.abs(game.scroll.vx) > 0);
  assert.ok(holder.hitstun > 0);
  assert.equal(holder.eliminations, 0);
});

test("first to 60 points wins the round", () => {
  const game = flatGame();
  const player = game.players[0];
  player.scoreFrames = ROUND_LIMIT * 60 - 1;
  player.score = player.scoreFrames / 60;
  giveScroll(game, 0);
  assert.equal(game.phase, "play");
  step(game);
  assert.equal(game.phase, "roundover");
  assert.equal(game.roundWinner, 0);
  assert.equal(player.rounds, 1);
  assert.ok(player.score >= ROUND_LIMIT);
});

test("highest score after 150 seconds wins, ties go to overtime", () => {
  const timed = flatGame();
  timed.players[0].scoreFrames = 400;
  timed.players[0].score = 400 / 60;
  timed.players[1].scoreFrames = 250;
  timed.players[1].score = 250 / 60;
  timed.roundFrames = ROUND_SECONDS * 60 - 1;
  step(timed);
  assert.equal(timed.phase, "roundover");
  assert.equal(timed.roundWinner, 0);

  const tied = flatGame();
  tied.players[0].scoreFrames = 300;
  tied.players[1].scoreFrames = 300;
  tied.roundFrames = ROUND_SECONDS * 60 - 1;
  step(tied);
  assert.equal(tied.phase, "play");
  assert.equal(tied.overtime, true);
  tied.players[1].scoreFrames = 301;
  step(tied);
  assert.equal(tied.phase, "roundover");
  assert.equal(tied.roundWinner, 1);
});

test("first to the configured round count wins the match", () => {
  const game = flatGame({ roundsToWin: 2 });
  game.players[2].scoreFrames = ROUND_LIMIT * 60;
  step(game);
  assert.equal(game.phase, "roundover");
  assert.equal(game.players[2].rounds, 1);
  stepFrames(game, null, 180);
  assert.equal(game.phase, "play");
  assert.equal(game.round, 2);
  assert.equal(game.players[2].scoreFrames, 0);
  game.players[2].scoreFrames = ROUND_LIMIT * 60;
  step(game);
  assert.equal(game.players[2].rounds, 2);
  stepFrames(game, null, 180);
  assert.equal(game.phase, "matchover");
  assert.equal(game.matchWinner, 2);
});

test("falling into the street eliminates and respawns on a rooftop after 2 seconds", () => {
  const game = flatGame();
  const player = game.players[0];
  giveScroll(game, 0);
  player.y = game.level.deathY + 20;
  step(game);
  assert.equal(player.alive, false);
  assert.equal(player.eliminations, 1);
  assert.equal(player.respawnFrames, 120);
  assert.equal(game.scroll.heldBy, null);
  assert.ok(game.scroll.vy < 0);
  stepFrames(game, null, 119);
  assert.equal(player.alive, false);
  step(game);
  assert.equal(player.alive, true);
  assert.ok(onRoof(game, player));
});

test("level generation and bot matches are deterministic for a seed", () => {
  const first = generateLevel(createRng(5));
  const second = generateLevel(createRng(5));
  assert.deepEqual(first, second);
  const other = generateLevel(createRng(6));
  assert.notDeepEqual(first.platforms, other.platforms);

  const slots = [0, 1, 2, 3].map(() => ({ mode: "bot" }));
  const a = createGame({ seed: 11, slots });
  const b = createGame({ seed: 11, slots });
  stepFrames(a, null, 240);
  stepFrames(b, null, 240);
  assert.deepEqual(
    a.players.map((player) => [player.x, player.y, player.scoreFrames, player.eliminations]),
    b.players.map((player) => [player.x, player.y, player.scoreFrames, player.eliminations]),
  );
  assert.ok(a.players.some((player, index) => Math.abs(player.x - b.players[index].x) < 1e-6));
  const origin = createGame({ seed: 11, slots });
  assert.ok(a.players.some((player, index) => Math.abs(player.x - origin.players[index].x) > 8));
});

test("core logic does not use Math.random", () => {
  const dir = path.join(root, "src", "core");
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    assert.equal(text.includes("Math.random"), false, file);
  }
});
