/**
 * Mulberry32 seeded RNG. Same seed always yields the same sequence.
 * All gameplay randomness goes through this so tests and replays match.
 */
export function createRng(seed) {
  let s = Number(seed) >>> 0;
  if (s === 0) s = 1;

  return {
    next() {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** Integer in [0, n). */
    int(n) {
      if (n <= 1) return 0;
      return Math.floor(this.next() * n);
    },
    getState() {
      return s >>> 0;
    },
    setState(value) {
      s = Number(value) >>> 0;
      if (s === 0) s = 1;
    },
  };
}
