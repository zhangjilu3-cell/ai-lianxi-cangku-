import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { createGameState, WIDTH, HEIGHT } from "../src/game-core.js";
import { applyDeveloperWave } from "../src/developer-mode.js";
import {
  MUD_TRAP_MIN_WAVE,
  MUD_SLOW_AMOUNT,
  VINE_TRAP_MIN_WAVE,
  VINE_BIND_SECONDS,
  VINE_REARM_SECONDS,
  activateSpikeTraps,
  activateTerrainTraps,
  advanceTerrainTrap,
  createSpikeTraps,
  createTerrainTraps,
  createWaveTraps,
  trapKindsForWave,
  isTerrainTrapTouching,
} from "../src/spike-traps.js";

function randomSeed(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function layout(wave, seed = 1) {
  return createWaveTraps({
    wave, width: WIDTH, height: HEIGHT, obstacles: [], structures: [],
    player: { x: WIDTH / 2, y: HEIGHT / 2 }, random: randomSeed(seed),
  });
}

test("新陷阱首次单独出现，随后全场随机1到2个且不重叠", () => {
  assert.equal(layout(30).spikeTraps.length + layout(30).terrainTraps.length, 0);
  for (const [wave, kind] of [[31, "spike"], [41, "mud"], [51, "vine"]]) {
    const { spikeTraps, terrainTraps } = layout(wave);
    const all = [...spikeTraps, ...terrainTraps];
    assert.equal(all.length, 1);
    assert.equal(all[0].kind ?? "spike", kind);
  }
  assert.equal(trapKindsForWave(32, () => 0.99).join(","), "spike,spike");
  const lateKinds = trapKindsForWave(52, () => 0.99);
  assert.equal(lateKinds.length, 2);
  assert.notEqual(lateKinds[0], lateKinds[1]);

  for (const wave of [32, 40, 42, 50, 52, 80, 100]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { spikeTraps, terrainTraps } = layout(wave, seed);
      const all = [...spikeTraps, ...terrainTraps];
      assert.ok(all.length >= 1 && all.length <= 2);
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          assert.ok(
            Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >=
              Math.max(128, all[i].radius + all[j].radius + 38) - 0.001,
            "陷阱之间不得重叠或贴得过近",
          );
        }
      }
    }
  }
});


test("藤蔓首次出现时应待命，敌人接触立刻束缚", () => {
  const { terrainTraps } = createWaveTraps({
    wave: 51, width: WIDTH, height: HEIGHT,
    player: { x: WIDTH / 2, y: HEIGHT / 2 },
    obstacles: [], structures: [], random: randomSeed(), active: true,
  });
  assert.equal(terrainTraps.length, 1);
  assert.equal(terrainTraps[0].kind, "vine");
  assert.equal(terrainTraps[0].phase, "active");
  assert.equal(isTerrainTrapTouching(terrainTraps[0], {
    x: terrainTraps[0].x, y: terrainTraps[0].y, radius: 16,
  }), true);
});

test("泥潭整波持续减速，藤蔓命中后收拢7秒再待命", () => {
  const traps = activateTerrainTraps(createTerrainTraps({
    wave: 51, width: WIDTH, height: HEIGHT, obstacles: [], structures: [],
    player: { x: WIDTH / 2, y: HEIGHT / 2 },
    random: randomSeed(), kinds: ["mud", "vine"],
  }));
  let mud = traps.find(trap => trap.kind === "mud");
  let vine = traps.find(trap => trap.kind === "vine");
  assert.equal(mud.phase, "active");
  assert.equal(vine.phase, "active");
  vine.rearmTime = VINE_REARM_SECONDS;
  vine.phase = "dormant";
  assert.equal(isTerrainTrapTouching(vine, { x: vine.x, y: vine.y, radius: 16 }), false);
  mud = advanceTerrainTrap(mud, 4.1);
  vine = advanceTerrainTrap(vine, 4.1);
  assert.equal(mud.phase, "active");
  assert.equal(isTerrainTrapTouching(mud, { x: mud.x, y: mud.y, radius: 16 }), true);
  assert.equal(vine.phase, "dormant");
  vine = advanceTerrainTrap(vine, 3);
  assert.equal(vine.phase, "active");
  mud = advanceTerrainTrap(mud, 4);
  assert.equal(mud.phase, "active");
});

test("藤蔓命中僵尸只施加一次完整的5秒束缚", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function updateTerrainTraps(");
  const end = source.indexOf("\nfunction updateShockwaves(", start);
  assert.ok(start >= 0 && end > start);
  const game = createGameState();
  game.time = 10;
  game.enemies = [{ id: 7, kind: "zombie", health: 100, x: 100, y: 100, radius: 16 }];
  game.terrainTraps = [{
    kind: "vine", x: 100, y: 100, radius: 44, armed: true, phase: "active",
    cycleTime: 4, phaseOffset: 4, activeTime: 2, hitIds: new Set(),
  }];
  const bursts = [];
  const sandbox = { game, advanceTerrainTrap, isTerrainTrapTouching, VINE_BIND_SECONDS, VINE_REARM_SECONDS,
    burst: (...args) => bursts.push(args) };
  new Script(source.slice(start, end) + "\nthis.updateTerrainTraps = updateTerrainTraps;")
    .runInNewContext(sandbox);
  sandbox.updateTerrainTraps(0.01);
  assert.equal(game.enemies[0].entangledUntil, 15);
  assert.equal(game.enemies[0].entangledStartedAt, 10);
  assert.equal(game.terrainTraps[0].phase, "dormant");
  assert.equal(game.terrainTraps[0].rearmTime, VINE_REARM_SECONDS);
  assert.equal(bursts.length, 1);
  game.time = 12;
  sandbox.updateTerrainTraps(0.01);
  assert.equal(game.enemies[0].entangledUntil, 15);
  assert.equal(bursts.length, 1);
  assert.equal(game.enemies[0].entangledUntil > 14.99, true);
  assert.equal(game.enemies[0].entangledUntil > 15.01, false);
  game.time = 17;
  sandbox.updateTerrainTraps(7);
  assert.equal(game.terrainTraps[0].phase, "active");
  assert.equal(game.enemies[0].entangledUntil, 15, "仍站在藤蔓中的敌人不应被无限续绑");
  game.enemies[0].x = 300;
  sandbox.updateTerrainTraps(0.1);
  game.enemies[0].x = 100;
  game.time = 17.2;
  sandbox.updateTerrainTraps(0.1);
  assert.equal(game.enemies[0].entangledUntil, 22.2, "离开后重新踏入才能再触发");
});

test("泥潭和藤蔓在上一波喘息时预生成，新波次才启用", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function updateWave(");
  const end = source.indexOf("\nfunction update(", start);
  assert.ok(start >= 0 && end > start);
  for (const [wave, expectedKind] of [[40, "mud"], [50, "vine"]]) {
    const game = createGameState();
    game.wave = wave;
    game.waveQueue = [];
    game.enemies = [];
    const math = Object.create(Math);
    math.random = randomSeed();
    const sandbox = {
      game, Math: math, WIDTH, HEIGHT, staticObstacles: [],
      developerSession: { enabled: false }, tankTrialSession: { active: false },
      createWaveTraps, activateSpikeTraps, activateTerrainTraps,
      buildWave: () => ["zombie"], buildWaveEnhancements: () => [],
      getEnemySpawnLimit: () => 100, resetWaveLightning: () => {},
      openRewardSession: () => ({ active: false }),
    };
    new Script(source.slice(start, end) + "\nthis.updateWave = updateWave;")
      .runInNewContext(sandbox);
    sandbox.updateWave(1 / 60);
    assert.equal(game.spikeTraps.length + game.terrainTraps.length, 1);
    assert.equal(game.terrainTraps[0].kind, expectedKind);
    assert.ok(game.terrainTraps.every(trap => !trap.armed && trap.phase === "dormant"));
    const prepared = game.terrainTraps;
    sandbox.updateWave(1 / 60);
    assert.equal(game.terrainTraps, prepared);
    game.intermission = 7;
    sandbox.updateWave(0);
    assert.equal(game.wave, wave + 1);
    assert.ok(game.terrainTraps.every(trap => trap.armed && trap.wave === wave + 1));
  }
});


test("泥潭将僵尸移速降低55%，藤蔓束缚期间保持原地", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function updateEnemies(");
  const end = source.indexOf("\nfunction separateEnemy(", start);
  assert.ok(start >= 0 && end > start);
  const game = createGameState();
  game.time = 10;
  game.player.x = 300;
  game.player.y = 100;
  game.enemies = [{
    id: 3, kind: "zombie", health: 100, x: 100, y: 100, radius: 16,
    speed: 100, attackCooldown: 0, shotCooldown: 0, animationTime: 0,
    attackAnimation: 0, hurtAnimation: 0, hitFlash: 0,
  }];
  game.terrainTraps = [{
    ...activateTerrainTraps(layout(41).terrainTraps)[0], x: -10, y: 100,
  }];
  const sandbox = {
    game, MUD_SLOW_AMOUNT, isTerrainTrapTouching,
    strongestSlow: () => 0,
    distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    normalize: (x, y) => { const length = Math.hypot(x, y) || 1; return { x: x / length, y: y / length }; },
    resolveStaticCollision: () => {},
    separateEnemy: () => {},
    updateEnemyGasTrail: () => {},
    spawnBossRunners: () => {},
  };
  new Script(source.slice(start, end) + "\nthis.updateEnemies = updateEnemies;")
    .runInNewContext(sandbox);
  sandbox.updateEnemies(1);
  assert.equal(game.enemies[0].x, 145);
  game.enemies[0].x = 100;
  game.enemies[0].entangledUntil = 15;
  sandbox.updateEnemies(1);
  assert.equal(game.enemies[0].x, 100);
  game.time = 15;
  game.terrainTraps[0].phase = "dormant";
  sandbox.updateEnemies(1);
  assert.equal(game.enemies[0].x, 200);
});


test("泥潭接触粒子有节流且激活脉冲只发一次", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function updateTerrainTraps(");
  const end = source.indexOf("\nfunction updateShockwaves(", start);
  const game = createGameState();
  game.player.x = 100;
  game.player.y = 100;
  game.terrainTraps = [{
    kind: "mud", x: 100, y: 100, radius: 52, armed: true,
    phase: "active", cycleTime: 0, phaseOffset: 0, activeTime: 3,
    hitIds: new Set(),
  }];
  const bursts = [];
  const sandbox = { game, advanceTerrainTrap, isTerrainTrapTouching, VINE_BIND_SECONDS, VINE_REARM_SECONDS,
    burst: (...args) => bursts.push(args) };
  new Script(source.slice(start, end) + "\nthis.updateTerrainTraps = updateTerrainTraps;")
    .runInNewContext(sandbox);
  sandbox.updateTerrainTraps(0.01);
  assert.equal(bursts.length, 1);
  sandbox.updateTerrainTraps(0.1);
  assert.equal(bursts.length, 1);
  sandbox.updateTerrainTraps(0.15);
  assert.equal(bursts.length, 2);
  game.terrainTraps[0].cycleTime = 7.99;
  game.terrainTraps[0].phase = "dormant";
  sandbox.updateTerrainTraps(0.02);
  assert.equal(bursts.length, 3);
});

test("开发者跳波也遵守单一亮相和全场至多两个陷阱", () => {
  for (const wave of [31, 41, 51, 52, 80]) {
    const game = createGameState();
    applyDeveloperWave(
      game, { targetWave: wave, totalCount: 8 }, randomSeed(wave),
      { width: WIDTH, height: HEIGHT, obstacles: [] },
    );
    const all = [...game.spikeTraps, ...game.terrainTraps];
    assert.ok(all.length >= 1 && all.length <= 2);
    if ([31, 41, 51].includes(wave)) assert.equal(all.length, 1);
  }
});

test("larger mud covers the new boundary and scales the artwork in both states", async () => {
  const [mud] = activateTerrainTraps(layout(41).terrainTraps);
  assert.equal(mud.radius, 104);
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const target = distance => ({ x: mud.x + dx * distance, y: mud.y + dy * distance, radius: 16 });
    assert.equal(isTerrainTrapTouching(mud, target(110)), true, "new outer band slows enemies");
    assert.equal(isTerrainTrapTouching(mud, target(120)), true);
    assert.equal(isTerrainTrapTouching(mud, target(120.01)), false);
  }
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function drawMudTrap(");
  const end = source.indexOf("\nfunction drawVineTrap(", start);
  assert.ok(start >= 0 && end > start);
  const scales = [];
  const context = new Proxy({ scale: (...args) => scales.push(args) }, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  const sandbox = { context, TAU: Math.PI * 2, game: { time: 10 } };
  new Script(source.slice(start, end) + "\nthis.drawMudTrap = drawMudTrap;").runInNewContext(sandbox);
  sandbox.drawMudTrap({ ...mud, armed: false }, false);
  sandbox.drawMudTrap(mud, true);
  assert.deepEqual(scales, [[2, 2], [2, 2]]);
});

test("two enlarged mud traps retain safe spacing within the same batch", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const traps = createTerrainTraps({
      wave: 41, width: WIDTH, height: HEIGHT, random: randomSeed(seed), kinds: ["mud", "mud"],
    });
    assert.equal(traps.length, 2);
    const [a, b] = traps;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius + 38,
      `seed ${seed}: expanded mud edges must keep 38 units of clearance`);
    for (const trap of traps) {
      assert.ok(trap.x >= trap.radius && trap.x + trap.radius <= WIDTH);
      assert.ok(trap.y >= trap.radius && trap.y + trap.radius <= HEIGHT);
    }
  }
});
