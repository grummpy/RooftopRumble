import {
  BANNER_FRAMES,
  COYOTE,
  DEFAULT_ROUNDS_TO_WIN,
  DT,
  HITSTUN,
  HOLDER_SPEED_MUL,
  INVULN,
  JUMP_BUFFER,
  JUMP_VELOCITY,
  KNOCK_VX,
  KNOCK_VY,
  MOVE_SPEED,
  PICKUP_RESPAWN,
  PLAYER_COLORS,
  PLAYER_H,
  PLAYER_NAMES,
  PLAYER_W,
  RESPAWN_FRAMES,
  ROUND_LIMIT,
  ROUND_SECONDS,
  SCROLL_H,
  SCROLL_W,
  SHURIKEN_LIFE,
  SHURIKEN_SPEED,
  SHURIKEN_USES,
  STRIKE_CD,
  STRIKE_DASH,
  STRIKE_REACH,
  STRIKE_TIME,
  VIEW_H,
  VIEW_W,
  WALL_JUMP_VX,
  WALL_JUMP_VY,
  WALL_SLIDE,
} from "./constants.js";
import { botInput } from "./bots.js";
import { blankInput } from "./input.js";
import { generateLevel, roofsOf } from "./level.js";
import { moveBody, overlaps } from "./physics.js";
import { createRng } from "./rng.js";

function emit(state, type, extra = {}) {
  state.events.push({ type, ...extra });
}

function makePlayer(id, bot) {
  return {
    id,
    name: PLAYER_NAMES[id] || `Player ${id + 1}`,
    color: PLAYER_COLORS[id] || "#ffffff",
    bot,
    x: 0,
    y: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    wall: 0,
    onOneWay: false,
    coyote: COYOTE,
    jumpBuf: 0,
    jumpHold: false,
    wasAction: false,
    wasUp: false,
    wasSecondary: false,
    strikeT: 0,
    strikeCd: 0,
    strikeVictims: [],
    hitstun: 0,
    invuln: 0,
    dropLock: 0,
    throwCd: 0,
    alive: true,
    respawnFrames: 0,
    shuriken: 0,
    hasScroll: false,
    score: 0,
    scoreFrames: 0,
    rounds: 0,
    eliminations: 0,
  };
}

function makeScroll(x, y) {
  return {
    x,
    y,
    w: SCROLL_W,
    h: SCROLL_H,
    vx: 0,
    vy: 0,
    heldBy: null,
    grounded: false,
    wall: 0,
    onOneWay: false,
    grace: 0,
  };
}

export function computeCamera(players, viewW = VIEW_W, viewH = VIEW_H) {
  const active = players.filter((player) => player.alive);
  const list = active.length ? active : players;
  if (!list.length) return { x: 0, y: 0, zoom: 1, viewW, viewH };

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const player of list) {
    minX = Math.min(minX, player.x);
    maxX = Math.max(maxX, player.x + player.w);
    minY = Math.min(minY, player.y);
    maxY = Math.max(maxY, player.y + player.h);
  }
  const padX = 180;
  const padY = 130;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  const spanX = Math.max(220, maxX - minX);
  const spanY = Math.max(220, maxY - minY);
  let zoom = Math.min(viewW / spanX, viewH / spanY);
  zoom = Math.max(0.42, Math.min(zoom, 1.45));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: cx - viewW / 2 / zoom,
    y: cy - viewH / 2 / zoom,
    zoom,
    viewW,
    viewH,
  };
}

function leaderInfo(state) {
  let best = null;
  let bestScore = -1;
  let tie = false;
  for (const player of state.players) {
    if (player.scoreFrames > bestScore) {
      best = player;
      bestScore = player.scoreFrames;
      tie = false;
    } else if (player.scoreFrames === bestScore) {
      tie = true;
    }
  }
  return { id: best ? best.id : null, tie, scoreFrames: bestScore };
}

function endRound(state, winnerId) {
  const winner = state.players.find((player) => player.id === winnerId);
  if (winner) winner.rounds += 1;
  state.roundWinner = winnerId;
  state.phase = "roundover";
  state.bannerFrames = BANNER_FRAMES;
  state.overtime = false;
  emit(state, "round", { id: winnerId });
}

function dropScroll(state, player, dir) {
  const scroll = state.scroll;
  if (!scroll || scroll.heldBy !== player.id) return;
  scroll.heldBy = null;
  player.hasScroll = false;
  player.dropLock = 0.45;
  scroll.x = player.x + player.w / 2 - scroll.w / 2;
  const aboveStreet = state.level.deathY - scroll.h - 48;
  scroll.y = Math.min(player.y + 4, aboveStreet);
  scroll.vx = (dir || player.facing || 1) * 240;
  scroll.vy = -280;
  scroll.grounded = false;
  scroll.grace = 0.3;
  emit(state, "drop", { id: player.id });
}

function eliminate(state, player) {
  if (!player.alive) return;
  if (state.scroll?.heldBy === player.id) dropScroll(state, player, player.facing);
  player.alive = false;
  player.respawnFrames = RESPAWN_FRAMES;
  player.vx = 0;
  player.vy = 0;
  player.strikeT = 0;
  player.eliminations += 1;
  emit(state, "ko", { id: player.id });
}

function roofSpawnSpots(level) {
  return roofsOf(level).map((roof) => ({
    x: roof.x + roof.w / 2 - PLAYER_W / 2,
    y: roof.y - PLAYER_H,
  }));
}

function pickSpawn(state, self) {
  const spots = roofSpawnSpots(state.level);
  if (!spots.length) return { x: 40, y: 40 };
  let bestScore = -1;
  const scored = spots.map((spot) => {
    let minD = Infinity;
    for (const other of state.players) {
      if (other.id === self.id || !other.alive) continue;
      const d = Math.hypot(other.x - spot.x, other.y - spot.y);
      if (d < minD) minD = d;
    }
    if (!Number.isFinite(minD)) minD = 1000;
    if (minD > bestScore) bestScore = minD;
    return { spot, minD };
  });
  const candidates = scored.filter((entry) => entry.minD >= bestScore - 48);
  const choice = candidates[state.rng.int(candidates.length)] || scored[0];
  return choice.spot;
}

function respawn(state, player) {
  const spot = pickSpawn(state, player);
  player.x = spot.x;
  player.y = spot.y;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  player.grounded = true;
  player.coyote = COYOTE;
  player.invuln = 0.8;
  player.hitstun = 0;
  player.respawnFrames = 0;
  emit(state, "respawn", { id: player.id });
}

function placeScroll(state, at) {
  if (at) {
    state.scroll = makeScroll(at.x, at.y);
    return;
  }
  const roofs = roofsOf(state.level);
  const roof = roofs[state.rng.int(roofs.length)] || { x: 80, y: 400, w: 200 };
  state.scroll = makeScroll(roof.x + roof.w / 2 - SCROLL_W / 2, roof.y - SCROLL_H);
}

function placePickups(state) {
  state.pickups = [];
  if (state.pickupsEnabled === false) return;
  const roofs = roofsOf(state.level);
  const used = new Set();
  let guard = 0;
  while (state.pickups.length < 3 && used.size < roofs.length && guard++ < 40) {
    const index = state.rng.int(roofs.length);
    if (used.has(index)) continue;
    used.add(index);
    const roof = roofs[index];
    state.pickups.push({
      x: roof.x + 28,
      y: roof.y - 20,
      w: 18,
      h: 18,
      active: true,
      respawn: 0,
    });
  }
}

function placePlayers(state, spawns) {
  const spots = roofSpawnSpots(state.level);
  state.players.forEach((player, index) => {
    const spot = spawns?.[index] || spots[Math.min(spots.length - 1, index * 3)] || spots[index % spots.length] || { x: 80 + index * 80, y: 200 };
    player.x = spot.x;
    player.y = spot.y;
    player.vx = 0;
    player.vy = 0;
    player.facing = 1;
    player.alive = true;
    player.grounded = true;
    player.coyote = COYOTE;
    player.wall = 0;
    player.score = 0;
    player.scoreFrames = 0;
    player.hasScroll = false;
    player.strikeT = 0;
    player.strikeCd = 0;
    player.strikeVictims = [];
    player.hitstun = 0;
    player.invuln = 0;
    player.dropLock = 0;
    player.throwCd = 0;
    player.shuriken = 0;
    player.respawnFrames = 0;
    player.wasAction = false;
    player.wasUp = false;
    player.wasSecondary = false;
    player.jumpBuf = 0;
    player.jumpHold = false;
  });
}

function spawnRound(state, { initial = false, spawns = null, scrollAt = null } = {}) {
  if (!initial && !state.customLevel) {
    state.level = generateLevel(state.rng);
  }
  state.phase = "play";
  state.roundTime = 0;
  state.roundFrames = 0;
  state.overtime = false;
  state.bannerFrames = 0;
  state.roundWinner = null;
  state.projectiles = [];
  placePlayers(state, initial ? state.initialSpawns : spawns);
  placeScroll(state, initial ? state.initialScrollAt : scrollAt);
  placePickups(state);
  state.camera = computeCamera(state.players);
  emit(state, "roundstart", { round: state.round });
}

export function createGame(options = {}) {
  const seed = options.seed ?? 1;
  const rng = createRng(seed);
  const slots = options.slots ?? [
    { mode: "human" },
    { mode: "bot" },
    { mode: "bot" },
    { mode: "bot" },
  ];
  const players = [];
  slots.slice(0, 4).forEach((slot, id) => {
    const mode = slot.mode || "bot";
    if (mode === "off") return;
    players.push(makePlayer(id, mode === "bot"));
  });

  const customLevel = !!options.level;
  const level = options.level ?? generateLevel(rng);
  const state = {
    seed,
    rng,
    level,
    customLevel,
    players,
    scroll: null,
    projectiles: [],
    pickups: [],
    pickupsEnabled: options.pickups !== false,
    initialSpawns: options.spawns || null,
    initialScrollAt: options.scrollAt || null,
    round: 1,
    roundsToWin: options.roundsToWin ?? DEFAULT_ROUNDS_TO_WIN,
    roundTime: 0,
    roundFrames: 0,
    phase: "play",
    overtime: false,
    bannerFrames: 0,
    roundWinner: null,
    matchWinner: null,
    paused: false,
    camera: { x: 0, y: 0, zoom: 1, viewW: VIEW_W, viewH: VIEW_H },
    events: [],
    frames: 0,
  };
  spawnRound(state, { initial: true, spawns: options.spawns || null, scrollAt: options.scrollAt || null });
  state.events = [];
  return state;
}

export function giveScroll(state, playerId) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !state.scroll) return;
  for (const candidate of state.players) candidate.hasScroll = candidate.id === playerId;
  state.scroll.heldBy = playerId;
  state.scroll.vx = 0;
  state.scroll.vy = 0;
  player.dropLock = 0;
}

function normalizeInputs(inputSet) {
  if (!inputSet) return [null, null, null, null];
  if (Array.isArray(inputSet)) return inputSet;
  return inputSet.players || [null, null, null, null];
}

function knock(state, target, dir) {
  if (!target.alive || target.invuln > 0) return false;
  const sign = dir === 0 ? 1 : Math.sign(dir);
  target.vx = sign * KNOCK_VX;
  target.vy = KNOCK_VY;
  target.hitstun = HITSTUN;
  target.invuln = INVULN;
  target.grounded = false;
  target.jumpHold = false;
  if (target.hasScroll || state.scroll?.heldBy === target.id) dropScroll(state, target, sign);
  emit(state, "hit", { id: target.id });
  return true;
}

function throwShuriken(state, player) {
  if (player.shuriken <= 0 || player.throwCd > 0) return;
  player.shuriken -= 1;
  player.throwCd = 0.28;
  const dir = player.facing || 1;
  state.projectiles.push({
    x: player.x + (dir > 0 ? player.w - 2 : -16),
    y: player.y + 16,
    w: 16,
    h: 10,
    vx: dir * SHURIKEN_SPEED,
    vy: 0,
    owner: player.id,
    life: SHURIKEN_LIFE,
  });
  emit(state, "throw", { id: player.id });
}

function startStrike(state, player) {
  player.strikeT = STRIKE_TIME;
  player.strikeCd = STRIKE_CD;
  player.strikeVictims = [];
  player.vx = player.facing * STRIKE_DASH;
  player.jumpHold = false;
  emit(state, "strike", { id: player.id });
}

function groundJump(state, player) {
  player.vy = JUMP_VELOCITY;
  player.grounded = false;
  player.coyote = 0;
  player.jumpBuf = 0;
  player.jumpHold = true;
  emit(state, "jump", { id: player.id });
}

function wallJump(state, player) {
  const sign = player.wall === 0 ? player.facing : -player.wall;
  player.vy = WALL_JUMP_VY;
  player.vx = sign * WALL_JUMP_VX;
  player.facing = sign || player.facing;
  player.wall = 0;
  player.grounded = false;
  player.coyote = 0;
  player.jumpBuf = 0;
  player.jumpHold = true;
  emit(state, "jump", { id: player.id, wall: true });
}

function updatePlayer(state, player, input) {
  player.strikeCd = Math.max(0, player.strikeCd - DT);
  player.hitstun = Math.max(0, player.hitstun - DT);
  player.invuln = Math.max(0, player.invuln - DT);
  player.dropLock = Math.max(0, player.dropLock - DT);
  player.throwCd = Math.max(0, player.throwCd - DT);
  player.hasScroll = state.scroll?.heldBy === player.id;

  if (!player.alive) {
    player.respawnFrames -= 1;
    if (player.respawnFrames <= 0) respawn(state, player);
    return;
  }

  const control = player.hitstun > 0 ? blankInput() : input;
  const actionEdge = !!control.action && !player.wasAction;
  const upEdge = !!control.up && !player.wasUp;
  const secondaryEdge = !!control.secondary && !player.wasSecondary;
  player.wasAction = !!control.action;
  player.wasUp = !!control.up;
  player.wasSecondary = !!control.secondary;

  if (player.hitstun <= 0 && player.strikeT <= 0) {
    if (control.left && !control.right) player.facing = -1;
    else if (control.right && !control.left) player.facing = 1;
  }

  if (actionEdge || upEdge) player.jumpBuf = JUMP_BUFFER;
  else player.jumpBuf = Math.max(0, player.jumpBuf - DT);

  let wallJumped = false;
  if (player.jumpBuf > 0 && player.hitstun <= 0 && player.strikeT <= 0) {
    if (player.wall !== 0 && !player.grounded) {
      wallJump(state, player);
      wallJumped = true;
    } else if (player.coyote > 0) {
      groundJump(state, player);
    }
  }

  if (secondaryEdge && player.hitstun <= 0) {
    if (control.down && player.shuriken > 0) throwShuriken(state, player);
    else if (!player.hasScroll && player.strikeCd <= 0) startStrike(state, player);
  }

  if (player.strikeT > 0) {
    player.strikeT -= DT;
    player.vx = player.facing * STRIKE_DASH;
    if (player.strikeT <= 0) player.vx *= 0.25;
  } else if (player.hitstun > 0) {
    player.vx *= 0.94;
  } else if (!wallJumped) {
    const speed = MOVE_SPEED * (player.hasScroll ? HOLDER_SPEED_MUL : 1);
    const dir = (control.left ? -1 : 0) + (control.right ? 1 : 0);
    if (dir !== 0) player.vx = dir * speed;
    else if (player.grounded) player.vx = 0;
    else player.vx *= 0.9;
  }

  if (player.jumpHold && !control.action && !control.up && player.vy < 0) {
    player.vy *= 0.5;
    player.jumpHold = false;
  }

  if (control.down && !control.secondary && player.grounded && player.onOneWay) {
    player.y += 6;
    player.grounded = false;
    player.onOneWay = false;
    player.coyote = 0;
  }

  moveBody(player, state.level.platforms, DT);

  if (player.grounded) player.coyote = COYOTE;
  else player.coyote = Math.max(0, player.coyote - DT);

  if (player.wall !== 0 && !player.grounded && player.vy > WALL_SLIDE) {
    player.vy = WALL_SLIDE;
  }

  if (
    player.jumpBuf > 0 &&
    player.grounded &&
    player.hitstun <= 0 &&
    player.strikeT <= 0
  ) {
    groundJump(state, player);
  }

  if (player.strikeT > 0) {
    const hitbox = {
      x: player.facing > 0 ? player.x + player.w * 0.35 : player.x - STRIKE_REACH + player.w * 0.15,
      y: player.y + 6,
      w: STRIKE_REACH,
      h: player.h - 10,
    };
    for (const other of state.players) {
      if (other.id === player.id || !other.alive) continue;
      if (player.strikeVictims.includes(other.id)) continue;
      if (!overlaps(hitbox, other)) continue;
      player.strikeVictims.push(other.id);
      knock(state, other, player.facing);
    }
  }

  if (player.y > state.level.deathY) eliminate(state, player);
}

function updateProjectiles(state) {
  const next = [];
  for (const star of state.projectiles) {
    star.life -= DT;
    star.x += star.vx * DT;
    star.y += star.vy * DT;
    if (star.life <= 0) continue;
    let blocked = false;
    for (const platform of state.level.platforms) {
      if (platform.oneWay) continue;
      if (overlaps(star, platform)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    let consumed = false;
    for (const player of state.players) {
      if (player.id === star.owner || !player.alive || player.invuln > 0) continue;
      if (!overlaps(star, player)) continue;
      if (knock(state, player, Math.sign(star.vx) || 1)) {
        consumed = true;
        emit(state, "shuriken", { id: player.id, owner: star.owner });
        break;
      }
    }
    if (!consumed) next.push(star);
  }
  state.projectiles = next;
}

function updateScroll(state) {
  const scroll = state.scroll;
  if (!scroll) return;
  if (scroll.grace > 0) scroll.grace = Math.max(0, scroll.grace - DT);
  if (scroll.heldBy != null) {
    const holder = state.players.find((player) => player.id === scroll.heldBy);
    if (!holder || !holder.alive) {
      if (holder) dropScroll(state, holder, holder.facing);
      else scroll.heldBy = null;
    } else {
      holder.hasScroll = true;
      scroll.x = holder.facing > 0 ? holder.x - 8 : holder.x + holder.w - 8;
      scroll.y = holder.y + 8;
      scroll.vx = 0;
      scroll.vy = 0;
      return;
    }
  }
  moveBody(scroll, state.level.platforms, DT, { bounce: 0.55 });
  if (scroll.grounded) scroll.vx *= 0.86;
  else scroll.vx *= 0.995;
  if (scroll.y > state.level.deathY) {
    const roofs = roofsOf(state.level);
    const roof = roofs[state.rng.int(roofs.length)] || { x: 40, y: 400, w: 180 };
    scroll.x = roof.x + roof.w / 2 - scroll.w / 2;
    scroll.y = roof.y - scroll.h;
    scroll.vx = 0;
    scroll.vy = 0;
    emit(state, "scrollrespawn", {});
  }
}

function updatePickups(state) {
  for (const player of state.players) {
    if (!player.alive || player.dropLock > 0) continue;
    if (state.scroll && state.scroll.heldBy == null && state.scroll.grace <= 0 && overlaps(player, state.scroll)) {
      state.scroll.heldBy = player.id;
      player.hasScroll = true;
      state.scroll.vx = 0;
      state.scroll.vy = 0;
      emit(state, "pickup", { id: player.id, kind: "scroll" });
    }
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      if (!overlaps(player, pickup)) continue;
      pickup.active = false;
      pickup.respawn = PICKUP_RESPAWN;
      player.shuriken = SHURIKEN_USES;
      emit(state, "pickup", { id: player.id, kind: "shuriken" });
    }
  }
  for (const pickup of state.pickups) {
    if (pickup.active) continue;
    pickup.respawn -= DT;
    if (pickup.respawn <= 0) {
      pickup.active = true;
      pickup.respawn = 0;
    }
  }
}

function updateScores(state) {
  const holderId = state.scroll?.heldBy;
  if (holderId == null) return;
  const holder = state.players.find((player) => player.id === holderId && player.alive);
  if (!holder) return;
  holder.scoreFrames += 1;
  holder.score = holder.scoreFrames / 60;
}

function checkRoundEnd(state) {
  const reached = state.players.find((player) => player.scoreFrames >= ROUND_LIMIT * 60);
  if (reached) {
    endRound(state, reached.id);
    return;
  }
  if (state.roundFrames >= ROUND_SECONDS * 60) {
    const top = leaderInfo(state);
    if (!top.tie && top.id != null) endRound(state, top.id);
    else state.overtime = true;
  }
}

export function step(state, inputSet) {
  state.events = [];
  if (state.paused) return state;

  if (state.phase === "roundover") {
    state.bannerFrames -= 1;
    state.frames += 1;
    if (state.bannerFrames <= 0) {
      const champ = [...state.players].sort((a, b) => b.rounds - a.rounds || a.id - b.id)[0];
      if (champ && champ.rounds >= state.roundsToWin) {
        state.phase = "matchover";
        state.matchWinner = champ.id;
        emit(state, "match", { id: champ.id });
      } else {
        state.round += 1;
        spawnRound(state);
      }
    }
    return state;
  }

  if (state.phase === "matchover") return state;

  const provided = normalizeInputs(inputSet);
  state.frames += 1;
  state.roundFrames += 1;
  state.roundTime = state.roundFrames / 60;

  for (const player of state.players) {
    const input = player.bot ? botInput(state, player) : provided[player.id] || blankInput();
    updatePlayer(state, player, input);
  }
  updateProjectiles(state);
  updateScroll(state);
  updatePickups(state);
  updateScores(state);
  if (state.phase === "play") checkRoundEnd(state);
  state.camera = computeCamera(state.players);
  return state;
}

export function stepFrames(state, inputSet, frames) {
  for (let i = 0; i < frames; i++) step(state, inputSet);
  return state;
}
