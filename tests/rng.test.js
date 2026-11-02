import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../src/core/rng.js";

test("same seed produces the same sequence", () => {
  const a = createRng(42);
  const b = createRng(42);
  const seqA = Array.from({ length: 12 }, () => a.next());
  const seqB = Array.from({ length: 12 }, () => b.next());
  assert.deepEqual(seqA, seqB);
  assert.deepEqual(
    Array.from({ length: 8 }, () => a.int(10)),
    Array.from({ length: 8 }, () => b.int(10)),
  );
});

test("different seeds diverge", () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 5 }, () => a.next());
  const seqB = Array.from({ length: 5 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test("int stays inside the requested range", () => {
  const rng = createRng(99);
  for (let i = 0; i < 100; i++) {
    const value = rng.int(7);
    assert.ok(value >= 0 && value < 7);
    assert.equal(value, Math.floor(value));
  }
  assert.equal(rng.int(1), 0);
});

test("state can be saved and restored for replays", () => {
  const rng = createRng(7);
  rng.next();
  rng.int(4);
  const saved = rng.getState();
  const ahead = [rng.next(), rng.next(), rng.int(5)];
  rng.setState(saved);
  assert.deepEqual([rng.next(), rng.next(), rng.int(5)], ahead);
});
