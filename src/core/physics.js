import { GRAVITY, DT } from "./constants.js";

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resolveX(body, platforms) {
  for (let guard = 0; guard < 8; guard++) {
    let hit = null;
    for (const platform of platforms) {
      if (platform.oneWay) continue;
      if (overlaps(body, platform)) {
        hit = platform;
        break;
      }
    }
    if (!hit) return;
    const penLeft = body.x + body.w - hit.x;
    const penRight = hit.x + hit.w - body.x;
    if (body.vx > 0 || (body.vx === 0 && penLeft <= penRight)) {
      body.x = hit.x - body.w;
      body.wall = 1;
    } else {
      body.x = hit.x + hit.w;
      body.wall = -1;
    }
    body.vx = 0;
  }
}

function resolveY(body, platforms, prevBottom, prevVy, bounce) {
  for (let guard = 0; guard < 8; guard++) {
    let hit = null;
    for (const platform of platforms) {
      if (!overlaps(body, platform)) continue;
      if (platform.oneWay) {
        if (prevVy < 0) continue;
        if (prevBottom > platform.y + 1) continue;
      }
      hit = platform;
      break;
    }
    if (!hit) return;
    const fromAbove = prevBottom <= hit.y + 1.5;
    if (hit.oneWay || fromAbove) {
      body.y = hit.y - body.h;
      if (bounce > 0 && prevVy > 80) {
        body.vy = -prevVy * bounce;
        body.grounded = false;
      } else {
        body.vy = 0;
        body.grounded = true;
        body.onOneWay = !!hit.oneWay;
      }
    } else {
      body.y = hit.y + hit.h;
      body.vy = 0;
    }
  }
}

/**
 * Integrate one body against solid and one-way platforms.
 * `wall` is 1 when a wall is on the right, -1 when a wall is on the left.
 */
export function moveBody(body, platforms, dt = DT, options = {}) {
  const bounce = options.bounce ?? 0;
  const gravity = options.gravity !== false;
  if (gravity) body.vy = Math.min(1100, body.vy + GRAVITY * dt);

  body.grounded = false;
  body.wall = 0;
  body.onOneWay = false;

  body.x += body.vx * dt;
  resolveX(body, platforms);

  const prevBottom = body.y + body.h;
  const prevVy = body.vy;
  body.y += body.vy * dt;
  resolveY(body, platforms, prevBottom, prevVy, bounce);
  return body;
}
