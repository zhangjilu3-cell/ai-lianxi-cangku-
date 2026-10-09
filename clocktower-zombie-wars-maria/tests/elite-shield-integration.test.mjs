import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";
import { absorbShieldDamage, refillShield, shieldCapacity } from "../src/player-shield.js";

const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");

function extract(start, next) {
  const found = source.match(new RegExp(`function ${start}\\([^]*?\\n\\}\\r?\\n\\r?\\nfunction ${next}`));
  assert.ok(found, `${start} source must remain extractable`);
  return found[0].replace(new RegExp(`\\r?\\n\\r?\\nfunction ${next}$`), "");
}

test("brute and devil each drop an extra shield while ordinary and boss drops stay unchanged", () => {
  const results = [];
  const game = { unlocked: ["pistol"], wave: 31, player: { health: 100, maxHealth: 100 }, weaponUpgrades: {} };
  const run = new Script(`(${extract("createEnemySupplies", "createSupplyPickups")})`).runInNewContext({
    game,
    tankTrialSession: { active: false },
    developerSession: { enabled: false, infiniteAmmo: false },
    rewardBossKill: () => true,
    ammoFillRatio: () => 1,
    rollEnemyDrops: (kind) => kind === "boss" ? [{ kind: "health" }] : [],
    createSupplyPickups: (drops) => results.push(drops.map(({ kind }) => kind)),
    Math,
  });
  for (const kind of ["brute", "devil", "zombie", "boss"]) run({ kind, x: 100, y: 100 });
  assert.deepEqual(results, [["shield"], ["shield"], [], ["health"]]);
});

test("three simultaneous supplies have distinct reachable positions", () => {
  const game = { nextId: 1, pickups: [] };
  const create = new Script(`(${extract("createSupplyPickups", "createGas")})`).runInNewContext({
    game, clamp: (value, min, max) => Math.max(min, Math.min(max, value)), WIDTH: 1600, HEIGHT: 900,
  });
  create([{ kind: "health" }, { kind: "ammo" }, { kind: "shield" }], 0, 0);
  assert.deepEqual(game.pickups.map(({ x, y }) => [x, y]), [[52, 52], [96, 52], [140, 52]]);
});

test("shield pickup fills to cap and remains available when already full", () => {
  const game = {
    player: { x: 100, y: 100, health: 100, maxHealth: 100, shield: 0 },
    pickups: [{ id: 1, kind: "shield", x: 100, y: 100, radius: 18 }],
  };
  const update = new Script(`(${extract("updatePickups", "updateHazards")})`).runInNewContext({
    game, shieldCapacity, refillShield,
    playerModifiers: () => ({ pickupMultiplier: 1 }),
    distance: () => 0,
    burst: () => {}, ensureSound: () => () => {},
  });
  update();
  assert.equal(game.player.shield, 20);
  assert.equal(game.pickups.length, 0);
  game.pickups.push({ id: 2, kind: "shield", x: 100, y: 100, radius: 18 });
  update();
  assert.equal(game.pickups.length, 1);
  game.player.shield = 7;
  update();
  assert.equal(game.player.shield, 20);
  assert.equal(game.pickups.length, 0);
});

test("player damage consumes shield after reduction and sends overflow to health", () => {
  const game = { player: { health: 100, maxHealth: 100, shield: 20, hitFlash: 0 }, combo: 5 };
  const hurt = new Script(`(${extract("hurtPlayer", "burst")})`).runInNewContext({
    game, absorbShieldDamage,
    developerSession: { enabled: false, invincible: false },
    playerModifiers: () => ({ damageReduction: 0.2 }),
    isPlayerInvulnerable: () => false,
    ensureSound: () => () => {}, Math,
  });
  hurt(15);
  assert.equal(game.player.shield, 8);
  assert.equal(game.player.health, 100);
  game.player.hitFlash = 0;
  hurt(20);
  assert.equal(game.player.shield, 0);
  assert.equal(game.player.health, 92);
  game.player.hitFlash = 0.24;
  hurt(20);
  assert.equal(game.player.health, 92);
});

test("blue shield meter sits above health and has a drawing path", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(html.indexOf('id="shieldMeter"') < html.indexOf('id="healthFill"'));
  assert.match(css, /\.shield-meter\[hidden\]\s*\{\s*display: none/);
  assert.match(source, /shieldMeter\.hidden = shield <= 0/);
  assert.match(source, /function drawShieldPack\(pickup\)/);
  assert.match(source, /if \(pickup\.kind === "shield"\) drawShieldPack\(pickup\)/);
});
