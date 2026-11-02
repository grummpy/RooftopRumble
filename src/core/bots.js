import { blankInput } from "./input.js";

function centerX(body) {
  return body.x + body.w / 2;
}

/** Nearest solid-enough landing whose top is within maxDrop below footY. */
function supportAt(platforms, x, footY, maxDrop) {
  let best = null;
  for (const platform of platforms) {
    if (platform.kind === "facade") continue;
    if (x < platform.x || x > platform.x + platform.w) continue;
    const top = platform.y;
    if (top < footY - 6 || top > footY + maxDrop) continue;
    if (!best || top < best.y) best = platform;
  }
  return best;
}

function nearestOther(state, player) {
  let best = null;
  let bestD = Infinity;
  for (const other of state.players) {
    if (other.id === player.id || !other.alive) continue;
    const d = Math.hypot(other.x - player.x, other.y - player.y);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

/**
 * Simple deterministic AI. Chases the scroll, flees while holding it,
 * strikes the holder up close, and throws shuriken at range.
 */
export function botInput(state, player) {
  const input = blankInput();
  if (!player.alive) return input;

  const scroll = state.scroll;
  let goalX = centerX(player);
  let goalY = player.y;
  let wantStrike = false;
  let wantThrow = false;

  if (player.hasScroll) {
    const foe = nearestOther(state, player);
    if (foe) {
      const dir = Math.sign(centerX(player) - centerX(foe)) || player.facing;
      goalX = centerX(player) + dir * 280;
      goalY = player.y;
    } else {
      goalX = centerX(player) + player.facing * 200;
    }
  } else if (scroll && scroll.heldBy != null) {
    const holder = state.players.find((candidate) => candidate.id === scroll.heldBy);
    if (holder) {
      goalX = centerX(holder);
      goalY = holder.y;
      const dx = centerX(holder) - centerX(player);
      const dy = holder.y - player.y;
      if (Math.abs(dx) < 68 && Math.abs(dy) < 52 && player.strikeT <= 0 && player.strikeCd <= 0) {
        wantStrike = true;
        if (dx !== 0) goalX = centerX(player) + Math.sign(dx) * 12;
      }
      if (
        player.shuriken > 0 &&
        Math.abs(dx) > 90 &&
        Math.abs(dx) < 340 &&
        Math.abs(dy) < 42 &&
        player.throwCd <= 0
      ) {
        wantThrow = true;
      }
    }
  } else if (scroll) {
    goalX = centerX(scroll);
    goalY = scroll.y;
  }

  if (!player.hasScroll && player.shuriken === 0) {
    let nearest = null;
    let nearestD = Infinity;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const d = Math.hypot(pickup.x - player.x, pickup.y - player.y);
      if (d < nearestD) {
        nearest = pickup;
        nearestD = d;
      }
    }
    if (nearest && nearestD < 260) {
      const goalD = Math.hypot(goalX - centerX(player), goalY - player.y);
      if (nearestD + 30 < goalD) {
        goalX = nearest.x;
        goalY = nearest.y;
        wantStrike = false;
        wantThrow = false;
      }
    }
  }

  const dx = goalX - centerX(player);
  if (dx > 12) input.right = true;
  else if (dx < -12) input.left = true;

  const dir = input.right ? 1 : input.left ? -1 : player.facing;
  const footY = player.y + player.h;
  const aheadX = centerX(player) + dir * 46;
  const here = supportAt(state.level.platforms, centerX(player), footY + 2, 28);
  const ahead = supportAt(state.level.platforms, aheadX, footY + 8, 110);
  const gap = !!here && !ahead;
  const blocked = player.wall !== 0 && player.grounded;
  const goalAbove = goalY < player.y - 40;
  const needWallJump = !player.grounded && player.wall !== 0;
  const needGroundJump = player.grounded && (gap || blocked || goalAbove);
  if (needWallJump || needGroundJump) input.action = !player.wasAction;

  if (wantThrow) {
    input.down = true;
    input.secondary = true;
  } else if (wantStrike) {
    input.secondary = true;
  }

  return input;
}
