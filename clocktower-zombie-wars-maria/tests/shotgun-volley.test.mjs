import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { shotgunPelletAngles } from "../src/weapon-effects.js";

test("each accepted shotgun trigger consumes one shell for nine pellets; blocked triggers consume none", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const fire = source.slice(source.indexOf("function fireBullet("), source.indexOf("function updateDelayedShots("));
  const use = source.slice(source.indexOf("function useWeapon("), source.indexOf("function placeStructure("));
  for (const fallback of [false, true]) {
    const player = { x: 40, y: 70, aimX: 1, aimY: 0, weapon: "shotgun", ammo: { shotgun: 8 }, cooldown: 0, reload: 0, dodgeDuration: 0 };
    let reloads = 0;
    const sandbox = {
      game: { player, nextId: 1, bullets: [], delayedShots: [] },
      weapons: [{ id: "shotgun", fireRate: 0.7 }],
      developerSession: {},
      hasUsableAmmo: (p, id) => p.ammo[id] > 0,
      shouldConsumeAmmo: () => true,
      beginReload: () => { reloads += 1; },
      shotgunStats: () => ({ pellets: 9, damage: 29.4, spread: 0.055, bulletSpeed: 760 }),
      hasWeaponTrait: () => false,
      shotgunPelletAngles,
      ensureSound: () => () => {},
      triggerWeaponVisual: () => {},
      burst: () => {},
    };
    new Script(fire + use + (fallback ? "\nfireShotgun = undefined;" : "") + "\nthis.shoot = useWeapon;").runInNewContext(sandbox);
    for (let shot = 1; shot <= 8; shot += 1) {
      player.cooldown = 0;
      sandbox.shoot();
      assert.equal(player.ammo.shotgun, 8 - shot);
      assert.equal(sandbox.game.bullets.length, shot * 9);
      assert.equal(new Set(sandbox.game.bullets.slice(-9).map(({ x, y }) => `${x},${y}`)).size, 1);
      assert.equal(new Set(sandbox.game.bullets.slice(-9).map(({ vx, vy }) => `${vx},${vy}`)).size, 9);
      sandbox.shoot();
      assert.equal(player.ammo.shotgun, 8 - shot);
      assert.equal(sandbox.game.bullets.length, shot * 9);
    }
    player.cooldown = 0;
    sandbox.shoot();
    assert.equal(reloads, 1);
    assert.equal(player.ammo.shotgun, 0);
    assert.equal(sandbox.game.bullets.length, 72);
    assert.equal(sandbox.game.delayedShots.length, 0);
  }
});
