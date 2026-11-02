import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("arcade.json is valid and points at existing files", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "arcade.json"), "utf8"));
  assert.equal(manifest.name, "Rooftop Rumble");
  assert.equal(manifest.id, "rooftoprumble");
  assert.equal(manifest.icon, "assets/icon.jpg");
  assert.equal(manifest.cover, "assets/cover.jpg");
  assert.equal(manifest.players, 4);
  assert.equal(manifest.minPlayers, 1);
  assert.equal(manifest.port, 8818);
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.input, ["keyboard", "gamepad"]);
  assert.equal(manifest.launch.mac, "./launch-mac.command");
  assert.equal(manifest.launch.windows, "launch-windows.bat");
  assert.equal(manifest.launch.linux, "./launch-linux.sh");
  assert.equal(manifest.launch.web, "index.html");

  for (const relative of [manifest.icon, manifest.cover, manifest.launch.web, "server.py"]) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, relative);
  }
  for (const launcher of [manifest.launch.mac, manifest.launch.windows, manifest.launch.linux]) {
    const file = path.join(root, launcher.replace(/^\.\//, ""));
    const text = fs.readFileSync(file, "utf8");
    assert.ok(text.includes("server.py"), launcher);
    assert.ok(/python/i.test(text), launcher);
  }
});

test("the page and scripts stay offline with no CDN", () => {
  const files = ["index.html"];
  const stack = [path.join(root, "src")];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else files.push(full);
    }
  }
  for (const file of files) {
    const text = fs.readFileSync(file.startsWith(root) ? file : path.join(root, file), "utf8");
    assert.equal(/https?:\/\//.test(text), false, file);
  }
});
