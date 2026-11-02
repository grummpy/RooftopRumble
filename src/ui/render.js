import { PLAYER_NAMES, ROUND_SECONDS } from "../core/constants.js";
import { PLAYER_KEY_HINTS } from "../core/input.js";
import { createRng } from "../core/rng.js";

const W = 1280;
const H = 720;
const skyCache = new Map();

function formatCode(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Arrow")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  const named = { Slash: "/", Period: ".", Semicolon: ";", Quote: "'", Space: "Space", Enter: "Enter", Escape: "Esc" };
  return named[code] || code;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function skyline(game) {
  const key = `${game.seed}:${game.level.width}`;
  if (skyCache.has(key)) return skyCache.get(key);
  const rng = createRng((game.seed * 97) ^ game.level.width);
  const buildings = [];
  let x = 0;
  while (x < game.level.width + 200) {
    const w = 70 + rng.int(90);
    const h = 80 + rng.int(220);
    const windows = [];
    for (let wy = 16; wy < h - 16; wy += 18) {
      for (let wx = 10; wx < w - 10; wx += 16) {
        if (rng.next() > 0.35) windows.push({ x: wx, y: wy, lit: rng.next() > 0.4 });
      }
    }
    buildings.push({ x, w, h, windows });
    x += w + 12 + rng.int(20);
  }
  const stars = [];
  for (let i = 0; i < 80; i++) stars.push({ x: rng.int(game.level.width), y: rng.int(260), s: rng.next() });
  skyCache.set(key, { buildings, stars });
  return skyCache.get(key);
}

function drawBackground(ctx, game, cam) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#140820");
  sky.addColorStop(0.55, "#2a1460");
  sky.addColorStop(1, "#4a2a58");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const deco = skyline(game);
  ctx.save();
  ctx.translate(-cam.x * cam.zoom * 0.15, 0);
  for (const star of deco.stars) {
    ctx.globalAlpha = 0.4 + star.s * 0.6;
    ctx.fillStyle = "#efe6ff";
    ctx.fillRect(star.x * 0.15, 30 + star.y * 0.25, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.fillStyle = "#f3e2b0";
  ctx.beginPath();
  ctx.arc(1080, 168, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#140820";
  ctx.beginPath();
  ctx.arc(1094, 160, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(-cam.x * cam.zoom * 0.35, 80);
  ctx.scale(cam.zoom, cam.zoom);
  for (const building of deco.buildings) {
    ctx.fillStyle = "#1a1030";
    ctx.fillRect(building.x, 420 - building.h, building.w, building.h + 80);
    for (const window of building.windows) {
      ctx.fillStyle = window.lit ? "#ffc45a" : "#6aa7c8";
      ctx.globalAlpha = window.lit ? 0.85 : 0.25;
      ctx.fillRect(building.x + window.x, 420 - building.h + window.y, 6, 8);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPlatforms(ctx, level) {
  for (const platform of level.platforms) {
    if (platform.kind === "facade") {
      ctx.fillStyle = "#24182f";
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = "#120c18";
      for (let y = platform.y + 18; y < platform.y + platform.h - 10; y += 28) {
        for (let x = platform.x + 14; x < platform.x + platform.w - 14; x += 26) {
          ctx.fillStyle = ((x + y) / 8) % 2 < 1 ? "#ffbf55" : "#1b2838";
          ctx.globalAlpha = ctx.fillStyle === "#ffbf55" ? 0.55 : 0.9;
          ctx.fillRect(x, y, 8, 10);
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  const street = level.streetY;
  ctx.fillStyle = "#100914";
  ctx.fillRect(-200, street, level.width + 400, 400);
  ctx.fillStyle = "#2a2030";
  ctx.fillRect(-200, street, level.width + 400, 8);
  ctx.strokeStyle = "#f2c14a";
  ctx.globalAlpha = 0.25;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  ctx.moveTo(-200, street + 36);
  ctx.lineTo(level.width + 200, street + 36);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  for (const platform of level.platforms) {
    if (platform.kind === "roof") {
      ctx.fillStyle = "#4a3548";
      ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
      ctx.fillStyle = "#c4554a";
      ctx.fillRect(platform.x, platform.y, platform.w, 6);
      ctx.fillStyle = "#6a4a55";
      for (let x = platform.x + 8; x < platform.x + platform.w - 4; x += 18) {
        ctx.fillRect(x, platform.y + 8, 10, platform.h - 10);
      }
    } else if (platform.kind === "chimney") {
      ctx.fillStyle = "#3a2e38";
      ctx.fillRect(platform.x, platform.y + 8, platform.w, platform.h - 8);
      ctx.fillStyle = "#5c4a52";
      ctx.fillRect(platform.x - 4, platform.y, platform.w + 8, 10);
    } else if (platform.kind === "clothesline") {
      ctx.strokeStyle = "#ddd6ea";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(platform.x, platform.y + 2);
      ctx.lineTo(platform.x + platform.w, platform.y + 2);
      ctx.stroke();
      const colors = ["#e23b3b", "#3b7de2", "#e2b33b", "#efe8df"];
      for (let i = 0; i < platform.w - 10; i += 28) {
        ctx.fillStyle = colors[(i / 28) % colors.length | 0];
        ctx.fillRect(platform.x + 6 + i, platform.y + 3, 12, 10);
      }
    }
  }
}

function drawNinja(ctx, player, time) {
  if (!player.alive) return;
  if (player.invuln > 0 && Math.floor(time * 24) % 2 === 0) ctx.globalAlpha = 0.45;
  const { x, y, w, h, facing, color } = player;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h + 2, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1a1a22";
  ctx.fillRect(x + 4, y + 20, w - 8, h - 22);
  ctx.fillStyle = color;
  ctx.fillRect(x + 6, y + 8, w - 12, 16);
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(x + (facing > 0 ? w - 12 : 4), y + 13, 8, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + (facing > 0 ? -6 : w - 4), y + 14, 10, 4);
  ctx.fillStyle = "#111";
  ctx.fillRect(x + 7, y + h - 14, 5, 12);
  ctx.fillRect(x + w - 12, y + h - 14, 5, 12);

  if (player.strikeT > 0) {
    ctx.strokeStyle = "#fff4d2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sx = facing > 0 ? x + w : x;
    ctx.moveTo(sx, y + 16);
    ctx.lineTo(sx + facing * 34, y + 28);
    ctx.stroke();
  }
  if (player.hasScroll) {
    ctx.fillStyle = "#ffd15a";
    ctx.fillRect(facing > 0 ? x - 6 : x + w - 8, y + 10, 12, 16);
    ctx.fillStyle = "#d23b3b";
    ctx.fillRect(facing > 0 ? x - 6 : x + w - 8, y + 16, 12, 3);
  }
  ctx.globalAlpha = 1;
}

function drawScrollItem(ctx, scroll, time) {
  if (!scroll || scroll.heldBy != null) return;
  const bob = Math.sin(time * 4) * 2;
  ctx.save();
  ctx.translate(scroll.x + scroll.w / 2, scroll.y + scroll.h / 2 + bob);
  ctx.rotate(Math.sin(time * 2) * 0.08);
  ctx.fillStyle = "#ffd15a";
  roundRect(ctx, -11, -8, 22, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#e23b3b";
  ctx.fillRect(-11, -1, 22, 3);
  ctx.fillStyle = "#fff4c2";
  ctx.fillRect(-3, -5, 6, 10);
  ctx.restore();
}

function drawShurikenShape(ctx, x, y, r, spin) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = "#e7f2ff";
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r, 3);
    ctx.lineTo(r + 6, 0);
    ctx.lineTo(r, -3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, game, pads) {
  ctx.fillStyle = "rgba(8, 6, 16, 0.82)";
  ctx.fillRect(0, 0, W, 92);
  const remain = game.overtime ? 0 : Math.max(0, ROUND_SECONDS - game.roundTime);
  const mins = Math.floor(remain / 60);
  const secs = Math.floor(remain % 60);
  const label = game.overtime ? "OVERTIME" : `${mins}:${String(secs).padStart(2, "0")}`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff6df";
  ctx.font = "700 18px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillText(label, W / 2, 20);
  ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
  ctx.fillStyle = "#d8ccea";
  ctx.fillText(`Round ${game.round}  ·  first to ${game.roundsToWin}`, W / 2, 36);
  ctx.textAlign = "left";

  const width = W / 4;
  for (const player of game.players) {
    const x = player.id * width;
    ctx.fillStyle = player.color;
    ctx.fillRect(x + 14, 48, 8, 34);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "700 16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(player.name, x + 30, 64);
    ctx.font = "700 18px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(String(Math.floor(player.score)), x + 30, 84);
    let pipX = x + 78;
    for (let i = 0; i < game.roundsToWin; i++) {
      ctx.fillStyle = i < player.rounds ? player.color : "#3a3148";
      ctx.beginPath();
      ctx.arc(pipX, 80, 4, 0, Math.PI * 2);
      ctx.fill();
      pipX += 12;
    }
    ctx.font = "13px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillStyle = "#d5e7ff";
    ctx.fillText(`shuriken ${player.shuriken}`, x + 130, 64);
    if (player.hasScroll) {
      ctx.fillStyle = "#ffd15a";
      ctx.fillText("scroll", x + 220, 84);
    }
    if (!player.alive) {
      ctx.fillStyle = "#ffb4b4";
      ctx.fillText(`${(player.respawnFrames / 60).toFixed(1)}s`, x + 220, 64);
    } else if (player.bot) {
      ctx.fillStyle = "#9aa4b8";
      ctx.fillText("BOT", x + 230, 64);
    }
    if (pads?.[player.id]) {
      ctx.strokeStyle = "#9be7ff";
      ctx.strokeRect(x + width - 34, 52, 16, 11);
      ctx.fillStyle = "#9be7ff";
      ctx.fillRect(x + width - 30, 56, 3, 3);
      ctx.fillRect(x + width - 24, 56, 3, 3);
    }
  }

  if (game.roundFrames < 90 && game.phase === "play") {
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff4d2";
    ctx.font = "700 64px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(`ROUND ${game.round}`, W / 2, 280);
    ctx.font = "24px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("First to 60 holds the scroll", W / 2, 320);
    ctx.textAlign = "left";
  }
  if (game.phase === "roundover") {
    const winner = game.players.find((player) => player.id === game.roundWinner);
    ctx.fillStyle = "rgba(6, 4, 12, 0.45)";
    ctx.fillRect(0, 180, W, 220);
    ctx.textAlign = "center";
    ctx.fillStyle = winner ? winner.color : "#fff";
    ctx.font = "700 64px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText(`${winner ? winner.name : "Ninja"} takes the round`, W / 2, 300);
    ctx.textAlign = "left";
  }
}

function drawMenuPanel(ctx, title, lines, selected) {
  ctx.fillStyle = "rgba(8, 6, 14, 0.78)";
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 340, 120, 600, 460, 18);
  ctx.fillStyle = "#1b1228";
  ctx.fill();
  ctx.strokeStyle = "#e2b33b";
  ctx.stroke();
  ctx.fillStyle = "#ffe7a8";
  ctx.font = "700 40px Trebuchet MS, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, 180);
  ctx.font = "24px Trebuchet MS, Segoe UI, sans-serif";
  lines.forEach((line, index) => {
    const y = 250 + index * 52;
    if (index === selected) {
      ctx.fillStyle = "#3a2a18";
      roundRect(ctx, 390, y - 28, 500, 42, 8);
      ctx.fill();
    }
    ctx.fillStyle = index === selected ? "#fff6df" : "#d9d0e4";
    ctx.fillText(line, W / 2, y);
  });
  ctx.textAlign = "left";
}

export function render(ctx, view) {
  const { screen, game, cover, pads, slots, menuIndex, settings, bindings, capture, cam, time } = view;
  ctx.clearRect(0, 0, W, H);

  if (screen === "title") {
    if (cover && cover.complete && cover.naturalWidth) {
      ctx.drawImage(cover, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#1a1030";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffcf5a";
      ctx.font = "700 72px Trebuchet MS, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("ROOFTOP RUMBLE", W / 2, 300);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, H - 120, W, 120);
    ctx.fillStyle = "#fff6df";
    ctx.font = "700 28px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    const blink = Math.floor(time * 2) % 2 === 0;
    ctx.globalAlpha = blink ? 1 : 0.45;
    ctx.fillText("Press Enter / Start", W / 2, H - 68);
    ctx.globalAlpha = 1;
    ctx.font = "18px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillStyle = "#f0e6ff";
    ctx.fillText("Four ninjas. One scroll. The rooftops are not a suggestion.", W / 2, H - 32);
    ctx.textAlign = "left";
    return;
  }

  if (screen === "join") {
    ctx.fillStyle = "#140c22";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffe7a8";
    ctx.font = "700 48px Trebuchet MS, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Choose your ninja", W / 2, 80);
    ctx.font = "18px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillStyle = "#d9d0e4";
    ctx.fillText("Action joins  ·  Secondary toggles bot / off  ·  Enter starts", W / 2, 118);
    slots.forEach((slot, index) => {
      const x = 70 + index * 310;
      ctx.fillStyle = "#241833";
      roundRect(ctx, x, 170, 280, 360, 16);
      ctx.fill();
      ctx.fillStyle = ["#e23b3b", "#3b7de2", "#3bbf6a", "#e2b33b"][index];
      ctx.fillRect(x, 170, 280, 12);
      ctx.fillStyle = "#fff6df";
      ctx.font = "700 28px Trebuchet MS, Segoe UI, sans-serif";
      ctx.fillText(PLAYER_NAMES[index], x + 140, 230);
      ctx.font = "15px Trebuchet MS, Segoe UI, sans-serif";
      ctx.fillStyle = "#d9d0e4";
      ctx.fillText(PLAYER_KEY_HINTS[index], x + 140, 270);
      const label = slot.mode === "human" ? "JOINED" : slot.mode === "bot" ? "BOT" : "OFF";
      ctx.fillStyle = slot.mode === "off" ? "#887" : "#fff";
      ctx.font = "700 36px Trebuchet MS, Segoe UI, sans-serif";
      ctx.fillText(label, x + 140, 360);
      if (pads?.[index]) {
        ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
        ctx.fillStyle = "#9be7ff";
        ctx.fillText("Gamepad connected", x + 140, 410);
      }
    });
    ctx.font = "18px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillStyle = "#f0e6ff";
    ctx.fillText("Empty slots can stay bots so a single player can rumble.", W / 2, 620);
    ctx.textAlign = "left";
    return;
  }

  if (!game || !cam) return;

  drawBackground(ctx, game, cam);
  ctx.save();
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.x * cam.zoom, -cam.y * cam.zoom);
  drawPlatforms(ctx, game.level);
  for (const pickup of game.pickups) {
    if (!pickup.active) continue;
    drawShurikenShape(ctx, pickup.x + 9, pickup.y + 9, 7, time * 3);
  }
  for (const star of game.projectiles) {
    drawShurikenShape(ctx, star.x + 8, star.y + 5, 6, star.x * 0.05);
  }
  drawScrollItem(ctx, game.scroll, time);
  for (const player of game.players) drawNinja(ctx, player, time);
  for (const particle of view.particles || []) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawHud(ctx, game, pads);

  if (screen === "pause") {
    drawMenuPanel(ctx, "Paused", ["Resume", "Settings", "Controls", "Quit to title"], menuIndex);
    ctx.textAlign = "center";
    ctx.fillStyle = "#b9adc8";
    ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("M mutes  ·  Esc resumes", W / 2, 560);
    ctx.textAlign = "left";
  } else if (screen === "settings") {
    const lines = [
      `Volume  ${Math.round(settings.volume * 100)}%`,
      `Rounds to win  ${settings.roundsToWin}`,
      `Sound  ${settings.muted ? "Muted" : "On"}`,
      "Back",
    ];
    drawMenuPanel(ctx, "Settings", lines, menuIndex);
  } else if (screen === "controls") {
    const actions = ["left", "right", "up", "down", "action", "secondary"];
    const names = ["Left", "Right", "Up", "Down", "Jump", "Strike"];
    const binding = bindings[view.controlPlayer];
    const lines = names.map((name, index) => `${name}  ${formatCode(binding[actions[index]])}`);
    lines.push("Reset this ninja");
    lines.push("Back");
    const title = capture
      ? `Press a key for ${PLAYER_NAMES[view.controlPlayer]}`
      : `${PLAYER_NAMES[view.controlPlayer]} controls`;
    drawMenuPanel(ctx, title, lines, menuIndex);
    ctx.textAlign = "center";
    ctx.fillStyle = "#b9adc8";
    ctx.font = "16px Trebuchet MS, Segoe UI, sans-serif";
    ctx.fillText("Left / right switches ninja", W / 2, 600);
    ctx.textAlign = "left";
  } else if (screen === "match" || game.phase === "matchover") {
    const ranked = [...game.players].sort((a, b) => b.rounds - a.rounds || b.score - a.score);
    const lines = ranked.map((player, index) => `${index + 1}. ${player.name}  ·  ${player.rounds} rounds`);
    lines.push("Rematch");
    lines.push("Title");
    const winner = game.players.find((player) => player.id === game.matchWinner);
    drawMenuPanel(ctx, winner ? `${winner.name} wins the night` : "Match over", lines, menuIndex);
  }
}

export { formatCode };
