import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { weapons, createGameState, canPlace, STRUCTURE_LIMITS } from "../src/game-core.js";
import { drawArenaFloor } from "../src/arena-background.js";
import { TANK_LAYERS } from "../src/tank-visual.js";

test("deployment stocks and enlarged tank match requested values", () => {
  const game = createGameState();
  for (const [kind, count] of [["turret", 2], ["tank", 1]]) {
    const spec = weapons.find(w => w.id === kind);
    assert.equal(spec.ammo, count); assert.equal(spec.reserve, count);
    assert.equal(spec.maxDeployed, count); assert.equal(STRUCTURE_LIMITS[kind], count);
    assert.equal(game.player.ammo[kind], count);
  }
  assert.equal(TANK_LAYERS.hull.scale, 0.11);
  assert.equal(TANK_LAYERS.turret.scale, TANK_LAYERS.hull.scale);
});

test("production placement and preview enforce independent limits even with infinite ammo", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const place = source.slice(source.indexOf("function placeStructure("), source.indexOf("function spawnEnemy("));
  const preview = source.slice(source.indexOf("function drawPlacementPreview("), source.indexOf("function validPlacement("));
  for (const infiniteAmmo of [false, true]) {
    const game = createGameState();game.player.ammo.turret = infiniteAmmo ? 0 : 5;game.player.ammo.tank = infiniteAmmo ? 0 : 5;
    const mouse = { x: 300, y: 300 };
    const context = { save(){}, restore(){}, beginPath(){}, arc(){}, fill(){} };
    const sandbox = { game, mouse, context, STRUCTURE_LIMITS, TAU: Math.PI * 2,
      developerSession: { enabled: true, infiniteAmmo },
      validPlacement: (x, y, kind) => canPlace(game, x, y, kind),
      hasUsableAmmo: (player, kind) => infiniteAmmo || player.ammo[kind] > 0,
      shouldConsumeAmmo: () => !infiniteAmmo,
      ensureSound: () => () => {}, burst(){}, renderWeaponBar(){} };
    new Script(place + preview + "\nthis.api={placeStructure,drawPlacementPreview}").runInNewContext(sandbox);
    for (const kind of ["turret", "tank"]) {
      game.player.weapon = kind;
      for (let n = 0; n < STRUCTURE_LIMITS[kind]; n++) {
        sandbox.api.placeStructure(kind);mouse.x += 110;
      }
      const ammo = game.player.ammo[kind];
      sandbox.api.drawPlacementPreview();assert.equal(context.fillStyle, "#a33b43");
      sandbox.api.placeStructure(kind);
      assert.equal(game.structures.filter(s => s.kind === kind && s.health > 0).length, STRUCTURE_LIMITS[kind]);
      assert.equal(game.player.ammo[kind], ammo);assert.match(game.notice, /最多部署/);
      game.structures.find(s => s.kind === kind).health = 0;
      sandbox.api.drawPlacementPreview();assert.equal(context.fillStyle, "#9fbd7d");
      sandbox.api.placeStructure(kind);mouse.x += 110;
      assert.equal(game.structures.filter(s => s.kind === kind && s.health > 0).length, STRUCTURE_LIMITS[kind]);
    }
  }
});

test("city plaza floor repeats at a stable scale and restores canvas state", () => {
  const stack = [], fills = [];let scale = 1, patterns = 0;
  const context = { save(){ stack.push(scale); }, restore(){ scale = stack.pop(); },
    fillRect(x,y,w,h){ fills.push({w:w*scale,h:h*scale}); }, scale(x){ scale *= x; },
    createPattern(image, mode){ assert.equal(mode,"repeat");patterns++;return {}; } };
  assert.equal(drawArenaFloor(context,null,1600,900),false);
  const image = { complete: true, naturalWidth: 1254 };
  for (let i=0;i<2;i++) { assert.equal(drawArenaFloor(context,image,1600,900),true);assert.equal(scale,1); }
  assert.equal(patterns,1);
  for (const fill of fills) { assert.ok(Math.abs(fill.w-1600)<1e-7);assert.ok(Math.abs(fill.h-900)<1e-7); }
});
