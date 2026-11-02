/** Deterministic rooftop city. Roofs, facades (wall-jump walls), chimneys, clotheslines. */

export function generateLevel(rng) {
  const platforms = [];
  let x = 60;
  let y = 360;
  const streetY = 700;
  const count = 16;

  for (let i = 0; i < count; i++) {
    const w = 220 + rng.int(120);
    const delta = rng.int(121) - 60;
    y = Math.max(260, Math.min(460, y + delta));
    const roof = { x, y, w, h: 22, kind: "roof", oneWay: false };
    platforms.push(roof);

    const facadeTop = y + 22;
    const facadeBottom = streetY - 80;
    const facadeH = facadeBottom - facadeTop;
    if (facadeH > 8) {
      platforms.push({
        x,
        y: facadeTop,
        w,
        h: facadeH,
        kind: "facade",
        oneWay: false,
      });
    }

    if (w > 250 && rng.next() < 0.6) {
      const cw = 30;
      const margin = 72;
      const span = w - margin * 2 - cw;
      const cx = x + margin + (span > 0 ? rng.int(span) : 0);
      platforms.push({
        x: cx,
        y: y - 72,
        w: cw,
        h: 72,
        kind: "chimney",
        oneWay: false,
      });
    }

    x += w + 64 + rng.int(48);
  }

  const roofs = platforms.filter((platform) => platform.kind === "roof");
  for (let i = 0; i < roofs.length - 1; i++) {
    if (rng.next() > 0.8) continue;
    const a = roofs[i];
    const b = roofs[i + 1];
    const x1 = a.x + a.w;
    const x2 = b.x;
    if (x2 - x1 < 36) continue;
    const lineY = Math.min(a.y, b.y) - 36 - rng.int(28);
    platforms.push({
      x: x1,
      y: lineY,
      w: x2 - x1,
      h: 5,
      kind: "clothesline",
      oneWay: true,
    });
  }

  return {
    platforms,
    width: x + 80,
    streetY,
    deathY: streetY + 70,
  };
}

export function roofsOf(level) {
  return level.platforms.filter((platform) => platform.kind === "roof");
}
