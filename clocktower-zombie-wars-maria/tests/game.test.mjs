import { chooseBossSpawnPosition } from "../src/boss-combat.js";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import assert from "node:assert/strict";
import {
  ARENA_PILLARS,
  STRUCTURE_LIMITS,
  DODGE,
  FIXED_STEP,
  HEIGHT,
  TAU,
  WIDTH,
  applyKill,
  baseZombieCount,
  bossHealthForWave,
  bossProfilesForWave,
  buildWave,
  canPlace,
  clamp,
  createGameState,
  distance,
  enemyStats,
  flameDamageAtDistance,
  getStableRollPose,
  healthAfterPack,
  isPlayerInvulnerable,
  isSurvivalOver,
  lightningRingCount,
  isLightningBurstUnlocked,
  LIGHTNING_BURST_UNLOCK_WAVE,
  normalize,
  requestDodge,
  resolveDodgeDirection,
  resolveGroundCollision,
  resetWaveLightning,
  rewardBossKill,
  startDodge,
  tickDodge,
  tickCombo,
  tickLightningHitEffects,
  tickLightningRingLifetime,
  upsertLightningHitEffect,
  unlockedForProgress,
  unlockWeaponsForProgress,
  scoreMultiplierForCombo,
  weapons,
} from "../src/game-core.js";
import {
  advanceRicochetProjectile,
  applyFreezeStatus,
  buildLightningArcGeometry,
  buildSeedAngles,
  buildWatermelonSliceAngles,
  freezeDamageMultiplier,
  freezeTargetClass,
  rayArenaIntersection,
  reflectRayAtBoundary,
  selectLightningTarget,
  shotgunPelletAngles,
  strongestSlow,
  watermelonChargeStats,
} from "../src/weapon-effects.js";
import {
  ENEMY_KINDS,
  ENEMY_RENDER_ROW,
  ENEMY_VISUALS,
  ZOMBIE_ACTIONS,
  ZOMBIE_ATLAS,
  advanceZombieDeaths,
  resolveEnemyVisual,
  resolveZombieAction,
  resolveZombieSourceRect,
} from "../src/zombie-animation.js";
import {
  applyDeveloperWave,
  unlockDeveloperWeapons,
} from "../src/developer-mode.js";
import {
  buildActionAtlas,
  commitAtlasJobs,
  validateActionAtlas,
} from "../scripts/stabilize-walk-atlases.mjs";
import {
  TANK_TRIAL_STAGES,
  buildTankTrialWave,
  canOfferTankTrial,
  creditTankTrialKill,
  createTankTrialGame,
  createTankTrialSession,
  dismissTankTrialOffer,
  failTankTrial,
  finishTankTrialStage,
  restoreTankTrialGame,
  startTankTrial,
} from "../src/tank-trial.js";
import {
  advanceToxicGasTrail,
  createToxicGasTrailState,
} from "../src/toxic-gas-trail.js";
import {
  buildWaveEnhancements,
  consumeWaveEnhancement,
} from "../src/random-wave-enhancements.js";
import {
  openRewardSession,
} from "../src/reward-progression.js";
import {
  createWeaponUpgrades,
  traitLevel,
  weaponStat,
} from "../src/weapon-traits.js";
import { resolveWeaponVisual } from "../src/weapon-visuals.js";
import {
  SPIKE_TRAP_ENEMY_DAMAGE,
  SPIKE_TRAP_PLAYER_DAMAGE,
  activateSpikeTraps,
  activateTerrainTraps,
  advanceSpikeTrap,
  createSpikeTraps,
  createWaveTraps,
  isSpikeTrapTouching,
} from "../src/spike-traps.js";

function extractGameFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0, `missing function ${name}`);
  assert.ok(end > start, `missing boundary ${nextName}`);
  return source.slice(start, end);
}

test("新游戏从独立的空地刺状态开始", () => {
  const first = createGameState();
  const second = createGameState();
  assert.deepEqual(first.spikeTraps, []);
  assert.deepEqual(first.lightningArcs, []);
  assert.deepEqual(first.lightningHitEffects, []);
  assert.deepEqual(first.iceStatues, []);
  assert.deepEqual(first.delayedShots, []);
  assert.deepEqual(first.slowZones, []);
  assert.equal(first.player.weaponVisualId, null);
  assert.equal(first.player.weaponRecoil, 0);
  assert.equal(first.player.weaponFeedback, 0);
  first.spikeTraps.push({ x: 1, y: 2 });
  first.lightningArcs.push({ id: 2 });
  first.lightningHitEffects.push({ targetId: 3 });
  first.iceStatues.push({ kind: "zombie" });
  first.delayedShots.push({ weaponId: "shotgun", delay: 0.12 });
  first.slowZones.push({ source: "freeze" });
  assert.deepEqual(second.spikeTraps, []);
  assert.deepEqual(second.lightningArcs, []);
  assert.deepEqual(second.lightningHitEffects, []);
  assert.deepEqual(second.iceStatues, []);
  assert.deepEqual(second.delayedShots, []);
  assert.deepEqual(second.slowZones, []);
});

test("lightning hit effects refresh per target and expire without stacking", () => {
  const game = createGameState();
  game.time = 2;
  const target = { id: 7, x: 100, y: 120, radius: 18 };

  assert.equal(upsertLightningHitEffect(game, target), true);
  assert.deepEqual(
    game.lightningHitEffects.map(({ targetId, x, y, radius, life, maxLife }) => ({
      targetId, x, y, radius, life, maxLife,
    })),
    [{ targetId: 7, x: 100, y: 120, radius: 18, life: 0.18, maxLife: 0.18 }],
  );

  game.time = 2.1;
  target.x = 106;
  assert.equal(upsertLightningHitEffect(game, target), true);
  assert.equal(game.lightningHitEffects.length, 1);
  assert.equal(game.lightningHitEffects[0].x, 106);

  tickLightningHitEffects(game, 0.1);
  assert.ok(Math.abs(game.lightningHitEffects[0].life - 0.08) < 1e-12);
  tickLightningHitEffects(game, 0.09);
  assert.deepEqual(game.lightningHitEffects, []);
});

test("新游戏创建独立的人物成长和奖励会话状态", () => {
  const first = createGameState();
  const second = createGameState();
  assert.equal(first.player.maxHealth, 100);
  assert.deepEqual(first.playerUpgrades, {
    vitality: 0,
    mobility: 0,
    resilience: 0,
    scavenger: 0,
    medical: 0,
  });
  assert.deepEqual(first.weaponUpgrades, createWeaponUpgrades());
  assert.equal(first.rewardSession.active, false);
  assert.deepEqual(first.rewardSession.claimedWaves, []);
  assert.notEqual(first.playerUpgrades, second.playerUpgrades);
  assert.notEqual(first.weaponUpgrades, second.weaponUpgrades);
  assert.notEqual(first.rewardSession, second.rewardSession);
  assert.notEqual(first.rewardSession.claimedWaves, second.rewardSession.claimedWaves);
});

test("毒气僵尸生成独立轨迹状态而其他敌人不变", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const spawnSource = extractGameFunction(source, "spawnEnemy", "updatePlayer");

  function spawn(kind) {
    const game = { nextId: 1, wave: 4, waveEnhancements: [], enemies: [] };
    const sandbox = {
      game,
      WIDTH,
      HEIGHT,
      enemyStats,
      bossHealthForWave,
  bossProfilesForWave,
      chooseBossSpawnPosition,
      consumeWaveEnhancement,
      createToxicGasTrailState,
      Math: Object.create(Math),
    };
    sandbox.Math.random = () => 0;
    new Script(spawnSource + "\nthis.spawnEnemy = spawnEnemy;").runInNewContext(sandbox);
    sandbox.spawnEnemy(kind);
    return game.enemies[0];
  }

  const firstToxic = spawn("toxic");
  const secondToxic = spawn("toxic");
  assert.equal(firstToxic.gasTrailTime, 5);
  assert.equal(firstToxic.gasTrailDistance, 0);
  firstToxic.gasTrailDistance = 17;
  assert.equal(secondToxic.gasTrailDistance, 0);

  for (const kind of ["zombie", "runner", "exploder", "brute", "devil", "boss"]) {
    const enemy = spawn(kind);
    assert.equal(Object.hasOwn(enemy, "gasTrailTime"), false, kind);
    assert.equal(Object.hasOwn(enemy, "gasTrailDistance"), false, kind);
  }
});

test("强化实例只消费首个对应名额并使用批准倍率", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const spawnSource = extractGameFunction(source, "spawnEnemy", "updatePlayer");

  function createSpawner(pending) {
    const game = {
      nextId: 1,
      wave: 11,
      waveEnhancements: [...pending],
      enemies: [],
    };
    const sandbox = {
      game,
      WIDTH,
      HEIGHT,
      enemyStats,
      bossHealthForWave,
  bossProfilesForWave,
      chooseBossSpawnPosition,
      consumeWaveEnhancement,
      createToxicGasTrailState,
      Math: Object.create(Math),
    };
    sandbox.Math.random = () => 0;
    new Script(spawnSource + "\nthis.spawnEnemy = spawnEnemy;").runInNewContext(sandbox);
    return { game, spawnEnemy: sandbox.spawnEnemy };
  }

  const thickRuntime = createSpawner(["zombie"]);
  thickRuntime.spawnEnemy("zombie");
  const thick = thickRuntime.game.enemies[0];
  assert.equal(thick.health, (enemyStats.zombie.health + 22) * 2);
  assert.equal(thick.maxHealth, thick.health);
  assert.equal(thick.scoreMultiplier, 2);
  assert.deepEqual(thickRuntime.game.waveEnhancements, []);

  const runnerRuntime = createSpawner(["runner"]);
  runnerRuntime.spawnEnemy("runner");
  runnerRuntime.spawnEnemy("runner");
  const [enhancedRunner, ordinaryRunner] = runnerRuntime.game.enemies;
  const runnerSpeed = enemyStats.runner.speed + Math.min(28, 11 * 1.6);
  assert.equal(enhancedRunner.speed, runnerSpeed * 1.5);
  assert.equal(enhancedRunner.scoreMultiplier, 2);
  assert.equal(ordinaryRunner.speed, runnerSpeed);
  assert.equal(ordinaryRunner.scoreMultiplier, 1);

  const exploderRuntime = createSpawner(["exploder"]);
  exploderRuntime.spawnEnemy("exploder");
  assert.equal(exploderRuntime.game.enemies[0].explosionRadius, 183);

  const toxicRuntime = createSpawner(["toxic"]);
  toxicRuntime.spawnEnemy("toxic");
  assert.equal(toxicRuntime.game.enemies[0].gasRadius, 123);

  const ordinaryRuntime = createSpawner([]);
  ordinaryRuntime.spawnEnemy("zombie");
  ordinaryRuntime.spawnEnemy("exploder");
  ordinaryRuntime.spawnEnemy("toxic");
  assert.equal(ordinaryRuntime.game.enemies[0].health, enemyStats.zombie.health + 22);
  assert.equal(ordinaryRuntime.game.enemies[0].scoreMultiplier, 1);
  assert.equal(ordinaryRuntime.game.enemies[1].explosionRadius, 122);
  assert.equal(ordinaryRuntime.game.enemies[2].gasRadius, 82);
});

test("毒气僵尸按最终移动位置提交轨迹状态并生成毒雾", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = extractGameFunction(
    source,
    "updateEnemyGasTrail",
    "spawnBossRunners",
  );
  const hazards = [];
  const sandbox = {
    advanceToxicGasTrail,
    createGas: (x, y, radius) => hazards.push({ x, y, radius }),
  };
  new Script(`${helperSource}; this.updateEnemyGasTrail = updateEnemyGasTrail;`)
    .runInNewContext(sandbox);
  const enemy = {
    kind: "toxic",
    health: 72,
    x: 65,
    y: 20,
    gasRadius: 123,
    gasTrailTime: 5,
    gasTrailDistance: 0,
  };

  sandbox.updateEnemyGasTrail(enemy, 10, 20, 1);

  assert.deepEqual(hazards, [{ x: 65, y: 20, radius: 123 }]);
  assert.equal(enemy.gasTrailTime, 4);
  assert.equal(enemy.gasTrailDistance, 0);

  const ordinary = { kind: "runner", health: 40, x: 200, y: 20 };
  sandbox.updateEnemyGasTrail(ordinary, 10, 20, 1);
  assert.equal(Object.hasOwn(ordinary, "gasTrailTime"), false);
  assert.equal(Object.hasOwn(ordinary, "gasTrailDistance"), false);
  assert.equal(hazards.length, 1);
});

test("毒气轨迹在静态碰撞和敌人分离之后采样", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateEnemies", "separateEnemy");
  assert.ok(updateSource.indexOf("const trailStartX = enemy.x") >= 0);
  assert.ok(updateSource.indexOf("const trailStartY = enemy.y") >= 0);
  assert.ok(updateSource.indexOf("resolveStaticCollision(enemy)") >= 0);
  assert.ok(
    updateSource.indexOf("resolveStaticCollision(enemy)") <
      updateSource.indexOf("separateEnemy(enemy, dt)"),
  );
  assert.ok(
    updateSource.indexOf("separateEnemy(enemy, dt)") <
      updateSource.lastIndexOf("updateEnemyGasTrail(enemy, trailStartX, trailStartY, dt)"),
  );
});

test("毒气僵尸近战与死亡仍各生成一团毒雾", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateEnemySource = extractGameFunction(source, "updateEnemies", "separateEnemy");
  const meleeGas = [];
  const meleeGame = {
    enemies: [{
      id: 1,
      kind: "toxic",
      health: 72,
      x: 100,
      y: 100,
      speed: 44,
      damage: 8,
      radius: 18,
      gasRadius: 123,
      attackCooldown: 0,
      shotCooldown: 1,
      hitFlash: 0,
      animationTime: 0,
      attackAnimation: 0,
      hurtAnimation: 0,
      gasTrailTime: 5,
      gasTrailDistance: 0,
    }],
    player: { x: 100, y: 100 },
    structures: [],
  };
  const meleeSandbox = {
    game: meleeGame,
    normalize,
    distance,
    strongestSlow,
    hurtPlayer() {},
    triggerEnemyAttack() {},
    createGas: (x, y, radius) => meleeGas.push({ x, y, radius }),
    resolveStaticCollision() {},
    separateEnemy() {},
    updateEnemyGasTrail() {},
    spawnBossRunners() {},
    Math,
  };
  new Script(updateEnemySource + "\nthis.updateEnemies = updateEnemies;")
    .runInNewContext(meleeSandbox);
  meleeSandbox.updateEnemies(1);
  assert.deepEqual(meleeGas, [{ x: 100, y: 100, radius: 123 }]);

  const updateBulletsSource = extractGameFunction(source, "updateBullets", "explode");
  const deathGas = [];
  const deathGame = {
    bullets: [],
    enemies: [{
      id: 2,
      kind: "toxic",
      health: 0,
      x: 230,
      y: 240,
      gasRadius: 123,
      scoreMultiplier: 2,
      attackAnimation: 0,
      lastDamageSource: "pistol",
    }],
    enemyDeathAnimations: [],
    decals: [],
    combo: 1,
  };
  const killCalls = [];
  const deathSandbox = {
    game: deathGame,
    tankTrialSession: { active: false },
    createGas: (x, y, radius) => deathGas.push({ x, y, radius }),
    createEnemySupplies() {},
    applyKill: (...args) => killCalls.push(args),
    burst() {},
    ensureSound: () => () => {},
    ZOMBIE_ACTIONS,
    WIDTH,
    HEIGHT,
    Math,
  };
  new Script(updateBulletsSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(deathSandbox);
  deathSandbox.updateBullets(1 / 60);
  assert.deepEqual(deathGas, [{ x: 230, y: 240, radius: 123 }]);
  assert.deepEqual(killCalls[0].slice(1), ["toxic", 1, 2]);
});

test("三秒毒雾保留半径并对重叠区域应用共享冷却", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const createSource = extractGameFunction(source, "createGas", "updatePickups");
  const updateSource = extractGameFunction(source, "updateHazards", "updateShockwaves");
  const game = {
    nextId: 1,
    hazards: [],
    player: { x: 100, y: 100 },
  };
  let damage = 0;
  const sandbox = {
    game,
    distance,
    isPlayerInvulnerable: () => false,
    hurtPlayer: (amount) => { damage += amount; },
  };
  new Script(
    `${createSource}\n${updateSource}\nthis.api = { createGas, updateHazards };`,
  ).runInNewContext(sandbox);

  sandbox.api.createGas(100, 100);
  sandbox.api.createGas(105, 100);
  sandbox.api.createGas(110, 100, 123);
  assert.equal(game.hazards.length, 3);
  assert.ok(game.hazards.every((hazard) => hazard.life === 3));
  assert.deepEqual(game.hazards.map((hazard) => hazard.radius), [82, 82, 123]);
  assert.ok(game.hazards.every((hazard) => hazard.damageCooldown === 0));

  sandbox.api.updateHazards(0.1);
  assert.equal(damage, 4);
  assert.ok(game.hazards.every((hazard) => hazard.damageCooldown === 0.45));
  sandbox.api.updateHazards(0.1);
  assert.equal(damage, 4);
});

test("地刺 active 阶段对玩家和同一敌人各结算一次", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateSpikeTraps", "updateShockwaves");
  const game = createGameState();
  game.player = {
    ...game.player,
    x: 100,
    y: 100,
    health: 100,
    hitFlash: 0,
    dodgeInvulnerability: 0,
  };
  game.enemies = [{ id: 7, kind: "zombie", x: 100, y: 100, radius: 16, health: 100 }];
  game.spikeTraps = [{
    x: 100,
    y: 100,
    radius: 36,
    wave: 31,
    armed: true,
    phase: "active",
    phaseTime: 0,
    phaseOffset: 0,
    hitIds: new Set(),
  }];
  const sandbox = {
    game,
    advanceSpikeTrap,
    isSpikeTrapTouching,
    isPlayerInvulnerable: (player) => player.dodgeInvulnerability > 0,
    SPIKE_TRAP_PLAYER_DAMAGE,
    SPIKE_TRAP_ENEMY_DAMAGE,
    hurtPlayer: (amount) => { game.player.health -= amount; game.player.hitFlash = 0.1; },
    damageEnemy: (enemy, amount, sourceName) => {
      enemy.health -= amount;
      enemy.lastDamageSource = sourceName;
    },
  };
  new Script(updateSource + "\nthis.updateSpikeTraps = updateSpikeTraps;")
    .runInNewContext(sandbox);
  sandbox.updateSpikeTraps(1 / 60);
  game.player.hitFlash = 0;
  sandbox.updateSpikeTraps(1 / 60);
  assert.equal(game.player.health, 100 - SPIKE_TRAP_PLAYER_DAMAGE);
  assert.equal(game.enemies[0].health, 100 - SPIKE_TRAP_ENEMY_DAMAGE);
  assert.equal(game.enemies[0].lastDamageSource, "spike-trap");

  game.player.dodgeInvulnerability = 0.1;
  game.spikeTraps[0].hitIds.delete("player");
  sandbox.updateSpikeTraps(1 / 60);
  assert.equal(game.player.health, 100 - SPIKE_TRAP_PLAYER_DAMAGE);
});

test("第 30 波喘息预生成收起地刺并在第 31 波开始激活", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateWaveSource = extractGameFunction(source, "updateWave", "update");
  const game = createGameState();
  game.wave = 30;
  game.waveQueue = [];
  game.enemies = [];
  game.intermission = 0;
  const deterministicMath = Object.create(Math);
  const rolls = [0.1, 0.2, 0.8, 0.2, 0.2, 0.8];
  let rollIndex = 0;
  deterministicMath.random = () => rolls[rollIndex++ % rolls.length];
  const sandbox = {
    Math: deterministicMath,
    WIDTH,
    HEIGHT,
    staticObstacles: [],
    game,
    developerSession: { enabled: false },
    tankTrialSession: { active: false },
    createSpikeTraps,
    createWaveTraps,
    activateSpikeTraps,
    activateTerrainTraps,
    buildWave,
    buildWaveEnhancements: () => [],
    getEnemySpawnLimit: () => 100,
    resetWaveLightning: () => {},
    spawnEnemy: () => assert.fail("喘息期不得生成敌人"),
    syncDeveloperControls: () => assert.fail("普通模式不得同步开发者控件"),
  };
  new Script(updateWaveSource + "\nthis.updateWave = updateWave;")
    .runInNewContext(sandbox);
  sandbox.updateWave(1 / 60);
  assert.equal(game.spikeTraps.length, 1);
  assert.ok(game.spikeTraps.every((trap) => !trap.armed && trap.phase === "retracted"));
  const prepared = game.spikeTraps;
  sandbox.updateWave(1 / 60);
  assert.equal(game.spikeTraps, prepared);
  game.intermission = 7;
  sandbox.updateWave(0);
  assert.equal(game.wave, 31);
  assert.ok(game.spikeTraps.every((trap) => trap.armed && trap.wave === 31));
});

test("毒雾使用批准的深苔绿色且不泄漏Canvas状态", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(source, "drawHazard", "drawBeam");
  const calls = [];
  const stops = [];
  let globalAlpha = 1;
  let fillStyle = "#sentinel";
  const context = {
    save() { calls.push("save"); },
    restore() { calls.push("restore"); },
    createRadialGradient() {
      return { addColorStop(offset, color) { stops.push([offset, color]); } };
    },
    beginPath() {},
    arc(...args) { assert.equal(args.every(Number.isFinite), true); },
    fill() {},
  };
  Object.defineProperty(context, "globalAlpha", {
    get: () => globalAlpha,
    set(value) { globalAlpha = value; calls.push(["globalAlpha", value]); },
  });
  Object.defineProperty(context, "fillStyle", {
    get: () => fillStyle,
    set(value) { fillStyle = value; calls.push(["fillStyle", value]); },
  });
  const sandbox = {
    context,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    game: { time: 0 },
    TAU: Math.PI * 2,
  };
  new Script(`${drawSource}; this.drawHazard = drawHazard;`).runInNewContext(sandbox);
  sandbox.drawHazard({ x: 100, y: 120, radius: 82, life: 3 });

  assert.deepEqual(stops, [
    [0, "rgba(77,126,50,.90)"],
    [0.58, "rgba(38,78,40,.64)"],
    [1, "rgba(18,43,29,0)"],
  ]);
  assert.equal(
    calls.some((entry) => entry[0] === "globalAlpha" && entry[1] === 0.66),
    true,
  );
  assert.equal(
    calls.some((entry) =>
      entry[0] === "fillStyle" && entry[1] === "rgba(99,144,59,.38)"
    ),
    true,
  );
  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
});

test("enemy damage records only the last positive damage source", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const damageSource = extractGameFunction(source, "damageEnemy", "triggerEnemyHurt");
  const flashes = [];
  const sandbox = {
    Number,
    triggerEnemyHurt: (...args) => flashes.push(args),
  };
  new Script(damageSource + "\nthis.damageEnemy = damageEnemy;").runInNewContext(sandbox);
  const enemy = { health: 100, lastDamageSource: null };

  assert.equal(sandbox.damageEnemy(enemy, 0, "shotgun", 0.1), false);
  assert.equal(sandbox.damageEnemy(enemy, Number.NaN, "rocket", 0.1), false);
  assert.equal(enemy.lastDamageSource, null);
  assert.equal(sandbox.damageEnemy(enemy, 12, "pistol", 0.08), true);
  assert.equal(enemy.health, 88);
  assert.equal(enemy.lastDamageSource, "pistol");
  assert.equal(sandbox.damageEnemy(enemy, 4, "flamethrower", 0), true);
  assert.equal(enemy.lastDamageSource, "flamethrower");
  assert.equal(flashes.length, 1);

  const deadEnemy = { health: 0, lastDamageSource: "rocket" };
  assert.equal(sandbox.damageEnemy(deadEnemy, 32, "pistol", 0.08), false);
  assert.equal(deadEnemy.health, 0);
  assert.equal(deadEnemy.lastDamageSource, "rocket");
  assert.equal(flashes.length, 1);
});

test("player and structure projectiles carry their actual source", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const fireBulletSource = extractGameFunction(source, "fireBullet", "damageEnemy");
  const game = {
    nextId: 1,
    player: { x: 20, y: 30, weapon: "pistol" },
    bullets: [],
  };
  const bulletSandbox = { game, Math };
  new Script(fireBulletSource + "\nthis.fireBullet = fireBullet;").runInNewContext(
    bulletSandbox,
  );
  for (const weaponId of ["pistol", "shotgun", "rocket", "ricochet"]) {
    game.player.weapon = weaponId;
    bulletSandbox.fireBullet(0, 10, 100);
    assert.equal(game.bullets.at(-1).source, weaponId);
  }

  const structureSource = extractGameFunction(source, "updateStructures", "densestTarget");
  const structureGame = {
    nextId: 10,
    structures: [
      { kind: "turret", x: 0, y: 0, cooldown: 0 },
      { kind: "tank", x: 0, y: 0, cooldown: 0 },
    ],
    enemies: [{ id: 1, x: 20, y: 0 }],
    bullets: [],
  };
  const structureSandbox = {
    game: structureGame,
    distance: (left, right) => Math.hypot(left.x - right.x, left.y - right.y),
    normalize,
    densestTarget: (targets) => targets[0],
    ensureSound: () => () => {},
    Math,
  };
  new Script(
    structureSource + "\nthis.updateStructures = updateStructures;",
  ).runInNewContext(structureSandbox);
  structureSandbox.updateStructures(0);
  assert.deepEqual(
    structureGame.bullets.map((bullet) => bullet.source),
    ["turret", "tank"],
  );
});

test("lightning gun begins charge without immediate damage or ammo use", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const game = createGameState(); game.player.weapon = "lightning"; game.player.ammo.lightning = 8;
  let starts = 0;
  const sandbox = { game, weapons, developerSession: {}, hasUsableAmmo: () => true,
    startArrowCharge: () => { starts++; }, hasWeaponTrait: () => false };
  new Script(extractGameFunction(source, "useWeapon", "placeStructure") + "\nthis.useWeapon=useWeapon;").runInNewContext(sandbox);
  sandbox.useWeapon();
  assert.equal(starts, 1); assert.equal(game.player.ammo.lightning, 8);
  assert.equal(game.player.cooldown, 0); assert.equal(game.lightningArcs.length, 0); assert.equal(game.bullets.length, 0);
});

test("lightning slot release creates delayed arrow rain instead of an immediate chain", async () => {
  const { buildArrowRainLayout, createArrowRain } = await import("../src/weapon-effects.js");
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const game = createGameState();
  const sandbox = { game, createArrowRain, hasWeaponTrait: () => false,
    arrowRainLayout: seconds => buildArrowRainLayout({x:800,y:450},{x:1000,y:450},seconds) };
  new Script(extractGameFunction(source, "fireLightning", "updateArrowRains") + "\nthis.fireLightning=fireLightning;").runInNewContext(sandbox);
  const rain=sandbox.fireLightning(0,{damage:60},2);
  assert.equal(rain.arrows.length,48); assert.equal(rain.damage,60);
  assert.ok(rain.arrows.every(arrow=>arrow.impactAt>0&&!arrow.impacted));
  assert.equal(game.arrowRains.length,1); assert.equal(game.lightningArcs.length,0);
});

test("lightning trait numeric stats resolve at levels zero one and five", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(adapterSource + "\nthis.lightningStats = lightningStats;")
    .runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.lightningStats() }, {
    damage: 60,
    chainRange: 230,
    retention: 0.75,
    range: 900,
    fireRate: 0.75,
    capacity: 24,
  });
  for (const id of ["damage", "chain_range", "retention", "speed", "fire_rate", "capacity"]) {
    upgrades.lightning[id] = 1;
  }
  const levelOne = sandbox.lightningStats();
  assert.ok(Math.abs(levelOne.damage - 72) < 1e-12);
  assert.ok(Math.abs(levelOne.chainRange - 264.5) < 1e-12);
  assert.ok(Math.abs(levelOne.retention - 0.8) < 1e-12);
  assert.ok(Math.abs(levelOne.range - 1035) < 1e-12);
  assert.ok(Math.abs(levelOne.fireRate - 0.675) < 1e-12);
  assert.equal(levelOne.capacity, 26);
  for (const id of ["damage", "chain_range", "retention", "speed", "fire_rate", "capacity"]) {
    upgrades.lightning[id] = 5;
  }
  const levelFive = sandbox.lightningStats();
  assert.ok(Math.abs(levelFive.damage - 60 * 1.2 ** 5) < 1e-9);
  assert.ok(Math.abs(levelFive.chainRange - 230 * 1.15 ** 5) < 1e-9);
  assert.equal(levelFive.retention, 0.9);
  assert.ok(Math.abs(levelFive.range - 900 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(levelFive.fireRate - 0.75 * 0.9 ** 5) < 1e-9);
  assert.equal(levelFive.capacity, 34);
});

test("lightning traits apply paralyze kill continuation and endpoint blasts once", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const chainSource = extractGameFunction(
    source,
    "applyLightningChain",
    "updateBullets",
  );
  const enemies = [
    { id: 1, kind: "zombie", x: 10, y: 20, health: 50, slowStatuses: [] },
    { id: 2, kind: "runner", x: 40, y: 50, health: 100, slowStatuses: [] },
    { id: 3, kind: "zombie", x: 70, y: 80, health: 100, slowStatuses: [] },
    { id: 4, kind: "boss", x: 90, y: 100, health: 500, slowStatuses: [] },
  ];
  const damageCalls = [];
  const explosions = [];
  const networkOptions = [];
  const game = {
    enemies,
    lightningArcs: [],
    lightningHitEffects: [],
    time: 10,
  };
  const sandbox = {
    game,
    buildLightningNetwork: (_first, _enemies, options) => {
      networkOptions.push(options);
      if (!options.killArc) {
        return {
          hits: [
            { targetId: 1, from: null, damage: 60, depth: 0 },
            { targetId: 2, from: 1, damage: 45, depth: 1 },
            { targetId: 4, from: 2, damage: 33.75, depth: 2 },
          ],
          segments: [
            { from: 1, to: 2 },
            { from: 2, to: 4 },
          ],
          endpoints: [{ targetId: 4 }],
        };
      }
      return {
        hits: [
          { targetId: 1, from: null, damage: 60, depth: 0 },
          { targetId: 2, from: 1, damage: 45, depth: 1 },
          { targetId: 4, from: 2, damage: 33.75, depth: 2 },
          { targetId: 3, from: 1, damage: 9, depth: 1, killArc: true },
        ],
        segments: [
          { from: 1, to: 2 },
          { from: 2, to: 4 },
          { from: 1, to: 3, killArc: true },
        ],
        endpoints: [{ targetId: 3 }, { targetId: 4 }],
      };
    },
    damageEnemy: (enemy, damage, sourceId, flash) => {
      damageCalls.push([enemy.id, damage, sourceId, flash]);
      enemy.health -= damage;
      return true;
    },
    explode: (...args) => explosions.push(args),
    readCombatRoll: () => 0.1,
    upsertLightningHitEffect,
  };
  new Script(chainSource + "\nthis.applyLightningChain = applyLightningChain;")
    .runInNewContext(sandbox);
  assert.equal(sandbox.applyLightningChain(enemies[0], {
    damage: 60,
    chainRange: 230,
    retention: 0.75,
    fork: true,
    paralyze: true,
    killArc: true,
    terminalBlast: true,
  }), 4);
  assert.deepEqual(damageCalls, [
    [1, 60, "lightning", 0.12],
    [2, 45, "lightning", 0.12],
    [4, 33.75, "lightning", 0.12],
    [3, 9, "lightning", 0.12],
  ]);
  assert.deepEqual(
    game.lightningHitEffects.map(({ targetId }) => targetId),
    [1, 2, 4, 3],
  );
  assert.match(
    source,
    /function updateParticles[\s\S]*?tickLightningHitEffects\(game, dt\)/,
  );
  assert.equal(networkOptions.length, 2);
  assert.deepEqual([...networkOptions[1].killedIds], [1]);
  assert.deepEqual(enemies[1].slowStatuses.map((status) => ({ ...status })), [
    { source: "lightning", amount: 1, expiresAt: 10.5 },
  ]);
  assert.deepEqual(enemies[3].slowStatuses, []);
  assert.equal(game.lightningArcs.length, 3);
  assert.deepEqual(explosions, [
    [70, 80, 70, 15, "lightning"],
    [90, 100, 70, 15, "lightning"],
  ]);
  assert.doesNotMatch(source, /bullet\.kind === "lightning"/);
});

test("lightning draws thick white arcs with drifting spark particles", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(source, "drawLightningArc", "drawBullet");
  const calls = [];
  const colors = [];
  const widths = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    stroke: () => calls.push("stroke"),
    arc: (...args) => calls.push(["arc", ...args]),
    fill: () => calls.push("fill"),
    fillRect: (...args) => calls.push(["particle", ...args]),
    set strokeStyle(value) { colors.push(value); },
    set fillStyle(value) { colors.push(value); },
    set lineWidth(value) { widths.push(value); },
    set lineCap(_value) {},
    set lineJoin(_value) {},
    set globalAlpha(_value) {},
    set shadowBlur(_value) {},
    set shadowColor(value) { colors.push(value); },
  };
  const sandbox = {
    context,
    buildLightningArcGeometry,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    Math,
    TAU: Math.PI * 2,
  };
  new Script(drawSource + "\nthis.drawLightningArc = drawLightningArc;")
    .runInNewContext(sandbox);
  sandbox.drawLightningArc({
    x1: 10, y1: 20, x2: 120, y2: 70, life: 0.06, maxLife: 0.12,
  });
  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
  assert.ok(calls.filter((entry) => entry === "stroke").length >= 5);
  assert.ok(calls.filter((entry) => Array.isArray(entry) && entry[0] === "line").length >= 20);
  assert.ok(colors.some((color) => /ffffff|e6efff/i.test(color)));
  assert.ok(widths.includes(11));
  assert.ok(widths.includes(5.5));
  assert.ok(calls.some(entry => Array.isArray(entry) && entry[0] === "particle"));
  assert.match(source, /for \(const arc of game\.lightningArcs\) arc\.life -= dt/);
  assert.match(source, /for \(const arc of game\.lightningArcs\) drawLightningArc\(arc\)/);
});

test("lightning impacts draw stable flashes sparks and body currents", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(
    source,
    "drawLightningHitEffect",
    "drawFreezeProjectile",
  );
  const effect = {
    targetId: 7,
    x: 100,
    y: 120,
    radius: 18,
    life: 0.09,
    maxLife: 0.18,
    seed: 42,
  };

  const render = () => {
    const calls = [];
    const context = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      beginPath: () => calls.push("begin"),
      moveTo: (...args) => calls.push(["move", ...args]),
      lineTo: (...args) => calls.push(["line", ...args]),
      stroke: () => calls.push("stroke"),
      arc: (...args) => calls.push(["arc", ...args]),
      set strokeStyle(value) { calls.push(["strokeStyle", value]); },
      set lineWidth(value) { calls.push(["lineWidth", value]); },
      set lineCap(value) { calls.push(["lineCap", value]); },
      set lineJoin(value) { calls.push(["lineJoin", value]); },
      set globalAlpha(value) { calls.push(["globalAlpha", value]); },
      set shadowBlur(value) { calls.push(["shadowBlur", value]); },
      set shadowColor(value) { calls.push(["shadowColor", value]); },
    };
    const sandbox = {
      context,
      game: { enemies: [{ id: 7, x: 104, y: 122, radius: 18, health: 50 }] },
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      Math,
      TAU: Math.PI * 2,
    };
    new Script(drawSource + "\nthis.drawLightningHitEffect = drawLightningHitEffect;")
      .runInNewContext(sandbox);
    sandbox.drawLightningHitEffect(effect);
    return calls;
  };

  const first = render();
  const second = render();
  assert.deepEqual(second, first);
  assert.equal(first[0], "save");
  assert.equal(first.at(-1), "restore");
  assert.ok(first.filter((entry) => entry === "stroke").length >= 10);
  assert.ok(first.some((entry) => Array.isArray(entry) && entry[0] === "arc"));
  assert.ok(first.some((entry) =>
    Array.isArray(entry) && entry[0] === "strokeStyle" && /ffffff|e6efff/i.test(entry[1])));
  assert.ok(first
    .filter((entry) => Array.isArray(entry) && ["move", "line", "arc"].includes(entry[0]))
    .flatMap((entry) => entry.slice(1))
    .every(Number.isFinite));
  assert.match(
    source,
    /for \(const effect of game\.lightningHitEffects \?\? \[\]\) drawLightningHitEffect\(effect\)/,
  );
});

test("freeze gun fires one white-blue finite-ammo projectile", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const firingSource = [
    extractGameFunction(source, "fireBullet", "damageEnemy"),
    extractGameFunction(source, "useWeapon", "placeStructure"),
  ].join("\n");
  const game = createGameState();
  game.player.weapon = "freeze";
  game.player.aimX = 1;
  game.player.aimY = 0;
  game.player.ammo.freeze = 10;
  const sandbox = {
    game,
    weapons,
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    hasUsableAmmo: () => true,
    shouldConsumeAmmo: () => true,
    triggerWeaponVisual: () => true,
    ensureSound: () => () => {},
    burst() {},
    beginReload() {},
    failActiveTankTrial() {},
    hasWeaponTrait: () => false,
    freezeStats: () => ({
      damage: 42,
      blastRadius: 90,
      slowPerHit: 0.25,
      duration: 2.5,
      speed: 500,
      capacity: 30,
    }),
    Math,
  };
  new Script(firingSource + "\nthis.useWeapon = useWeapon;")
    .runInNewContext(sandbox);
  sandbox.useWeapon();
  assert.equal(game.bullets.length, 1);
  assert.deepEqual(
    (({ kind, damage, radius, blastRadius, color, source, vx, vy,
      slowPerHit, slowDuration, remainingEnemyHits, contagiousFreeze, crackShot,
      frostField }) => ({
      kind, damage, radius, blastRadius, color, source, vx, vy,
      slowPerHit, slowDuration, remainingEnemyHits, contagiousFreeze, crackShot,
      frostField,
    }))(game.bullets[0]),
    {
      kind: "freeze",
      damage: 42,
      radius: 6,
      blastRadius: 90,
      color: "#dff8ff",
      source: "freeze",
      vx: 500,
      vy: 0,
      slowPerHit: 0.25,
      slowDuration: 2.5,
      remainingEnemyHits: 1,
      contagiousFreeze: false,
      crackShot: false,
      frostField: false,
    },
  );
  assert.equal(game.player.ammo.freeze, 9);
  assert.equal(game.player.cooldown, 0.65);
});

test("freeze trait numeric stats resolve at levels zero one and five", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(adapterSource + "\nthis.freezeStats = freezeStats;")
    .runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.freezeStats() }, {
    damage: 42,
    blastRadius: 90,
    slowPerHit: 0.25,
    duration: 2.5,
    speed: 500,
    capacity: 30,
  });
  for (const id of ["damage", "blast_radius", "slow_per_hit", "duration", "speed", "capacity"]) {
    upgrades.freeze[id] = 1;
  }
  const levelOne = sandbox.freezeStats();
  assert.ok(Math.abs(levelOne.damage - 50.4) < 1e-12);
  assert.ok(Math.abs(levelOne.blastRadius - 103.5) < 1e-12);
  assert.equal(levelOne.slowPerHit, 0.3);
  assert.equal(levelOne.duration, 3);
  assert.ok(Math.abs(levelOne.speed - 575) < 1e-12);
  assert.equal(levelOne.capacity, 33);
  for (const id of ["damage", "blast_radius", "slow_per_hit", "duration", "speed", "capacity"]) {
    upgrades.freeze[id] = 5;
  }
  const levelFive = sandbox.freezeStats();
  assert.ok(Math.abs(levelFive.damage - 42 * 1.2 ** 5) < 1e-9);
  assert.ok(Math.abs(levelFive.blastRadius - 90 * 1.15 ** 5) < 1e-9);
  assert.equal(levelFive.slowPerHit, 0.5);
  assert.ok(Math.abs(levelFive.duration - 2.5 * 1.2 ** 5) < 1e-9);
  assert.ok(Math.abs(levelFive.speed - 500 * 1.15 ** 5) < 1e-9);
  assert.equal(levelFive.capacity, 45);
});

test("freeze gun splash damages once and refreshes ordinary and boss slow status", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function freezeStatusAmount(");
  const explodeSource = source.slice(start, source.indexOf("function explode(", start));
  assert.ok(explodeSource);
  const enemies = [
    { id: 1, kind: "zombie", x: 0, y: 0, health: 200, slowStatuses: [] },
    { id: 2, kind: "boss", x: 80, y: 0, health: 500, slowStatuses: [] },
    { id: 3, kind: "runner", x: 91, y: 0, health: 100, slowStatuses: [] },
  ];
  const game = { enemies, particles: [], time: 10 };
  const damageCalls = [];
  const sandbox = {
    game,
    distance,
    applyFreezeStatus,
    freezeDamageMultiplier,
    freezeTargetClass,
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
    },
    burst() {},
    ensureSound: () => () => {},
  };
  new Script(explodeSource + "\nthis.explodeFreeze = explodeFreeze;")
    .runInNewContext(sandbox);

  sandbox.explodeFreeze(0, 0, 90, 42, "freeze");
  assert.deepEqual(damageCalls, [
    [1, 42, "freeze", 0.12],
    [2, 42, "freeze", 0.12],
  ]);
  assert.deepEqual({ ...enemies[0].slowStatuses[0] }, {
    source: "freeze",
    amount: 0.25,
    expiresAt: 12.5,
  });
  assert.deepEqual({ ...enemies[1].slowStatuses[0] }, {
    source: "freeze",
    amount: 0.125,
    expiresAt: 12.5,
  });
  assert.deepEqual(enemies[2].slowStatuses, []);

  game.time = 11;
  sandbox.explodeFreeze(0, 0, 90, 42, "freeze");
  assert.deepEqual({ ...enemies[0].slowStatuses[0] }, {
    source: "freeze",
    amount: 0.5,
    expiresAt: 13.5,
  });
  assert.deepEqual({ ...enemies[1].slowStatuses[0] }, {
    source: "freeze",
    amount: 0.25,
    expiresAt: 13.5,
  });
});

test("freeze cap executes ordinary enemies, shatters elites, and only slows bosses", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const explodeSource = source.slice(
    source.indexOf("function freezeStatusAmount("),
    source.indexOf("function explode(", source.indexOf("function freezeStatusAmount(")),
  );
  const enemies = [
    {
      id: 1, kind: "zombie", x: 0, y: 0, health: 200, maxHealth: 200,
      slowStatuses: [{ source: "freeze", amount: 0.5, expiresAt: 12 }],
    },
    {
      id: 2, kind: "brute", x: 300, y: 0, health: 300, maxHealth: 300,
      slowStatuses: [{ source: "freeze", amount: 0.5, expiresAt: 12 }],
    },
    {
      id: 3, kind: "boss", x: 600, y: 0, health: 1000, maxHealth: 1000,
      slowStatuses: [{ source: "freeze", amount: 0.25, expiresAt: 12 }],
    },
  ];
  const game = { enemies, particles: [], slowZones: [], time: 10 };
  const damageCalls = [];
  const sandbox = {
    game,
    distance,
    applyFreezeStatus,
    freezeDamageMultiplier,
    freezeTargetClass,
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
      return true;
    },
    burst() {},
    ensureSound: () => () => {},
  };
  new Script(explodeSource + "\nthis.explodeFreeze = explodeFreeze;")
    .runInNewContext(sandbox);
  const options = {
    perHit: 0.1,
    duration: 3,
    crackShot: true,
    frostField: true,
  };
  sandbox.explodeFreeze(0, 0, 20, 42, "freeze", options);
  sandbox.explodeFreeze(300, 0, 20, 42, "freeze", options);
  sandbox.explodeFreeze(600, 0, 20, 42, "freeze", options);
  assert.deepEqual(damageCalls, [
    [1, 63, "freeze", 0.12],
    [1, 137, "freeze", 0.12],
    [2, 63, "freeze", 0.12],
    [2, 150, "freeze", 0.12],
    [3, 42, "freeze", 0.12],
  ]);
  assert.equal(enemies[0].health, 0);
  assert.equal(enemies[0].freezeExecuted, true);
  assert.equal(enemies[1].health, 87);
  assert.equal(enemies[1].slowStatuses[0].amount, 0);
  assert.equal(enemies[2].health, 958);
  assert.equal(enemies[2].slowStatuses[0].amount, 0.3);
  assert.equal(enemies[2].freezeExecuted, undefined);
  assert.equal(game.slowZones.length, 3);
});

test("碎冰传染 chains once per event and halves freeze applied to bosses", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function freezeStatusAmount(");
  const explodeSource = source.slice(start, source.indexOf("function explode(", start));
  const enemies = [
    { id: 1, kind: "zombie", x: 0, y: 0, health: 100, maxHealth: 100,
      slowStatuses: [{ source: "freeze", amount: 0.5, expiresAt: 12 }] },
    { id: 2, kind: "runner", x: 50, y: 0, health: 100, maxHealth: 100,
      slowStatuses: [{ source: "freeze", amount: 0.4, expiresAt: 12 }] },
    { id: 3, kind: "boss", x: 70, y: 0, health: 1000, maxHealth: 1000,
      slowStatuses: [{ source: "freeze", amount: 0.1, expiresAt: 12 }] },
    { id: 4, kind: "zombie", x: 200, y: 0, health: 100, maxHealth: 100,
      slowStatuses: [] },
  ];
  const game = { enemies, particles: [], slowZones: [], time: 10 };
  const sandbox = {
    game, distance, applyFreezeStatus, freezeDamageMultiplier, freezeTargetClass,
    damageEnemy(enemy, amount) { enemy.health -= amount; return true; },
    burst() {}, ensureSound: () => () => {},
  };
  new Script(explodeSource + "\nthis.explodeFreeze = explodeFreeze;")
    .runInNewContext(sandbox);

  sandbox.explodeFreeze(0, 0, 1, 0, "freeze", {
    perHit: 0.1,
    contagiousFreeze: true,
  });
  assert.equal(enemies[0].health, 0);
  assert.equal(enemies[1].health, 0);
  assert.equal(enemies[2].health, 1000);
  assert.equal(enemies[2].slowStatuses[0].amount, 0.3);
  assert.equal(enemies[3].slowStatuses.length, 0);
});

test("freeze trait piercing snowball explodes on first and final enemy only", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeFreeze");
  const bullet = {
    kind: "freeze", owner: "player", x: 20, y: 20, vx: 0, vy: 0,
    radius: 9, blastRadius: 90, damage: 42, source: "freeze", life: 2,
    exploded: false, remainingEnemyHits: 2, hitIds: [],
  };
  const enemies = [
    { id: 1, kind: "zombie", x: 20, y: 20, radius: 18, health: 200 },
    { id: 2, kind: "runner", x: 120, y: 20, radius: 18, health: 200 },
  ];
  const game = { bullets: [bullet], enemies };
  const explosions = [];
  const sandbox = {
    game, WIDTH, HEIGHT, clamp, distance,
    tankTrialSession: { active: false },
    explodeFreeze: (...args) => explosions.push(args),
    explode() {}, burst() {},
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);
  sandbox.updateBullets(0);
  assert.equal(explosions.length, 1);
  assert.equal(game.bullets.length, 1);
  assert.deepEqual(bullet.hitIds, [1]);
  assert.equal(bullet.remainingEnemyHits, 1);
  bullet.x = 120;
  sandbox.updateBullets(0);
  assert.equal(explosions.length, 2);
  assert.equal(game.bullets.length, 0);
});

test("freeze gun explodes on expiry and arena boundary", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeFreeze");
  const game = {
    bullets: [
      { kind: "freeze", owner: "player", x: 10, y: 10, vx: 0, vy: 0, radius: 9, blastRadius: 90, damage: 42, source: "freeze", life: 0.01, exploded: false },
      { kind: "freeze", owner: "player", x: WIDTH - 1, y: 40, vx: 20, vy: 0, radius: 9, blastRadius: 90, damage: 42, source: "freeze", life: 2, exploded: false },
    ],
    enemies: [],
  };
  const explosions = [];
  const sandbox = {
    game,
    WIDTH,
    HEIGHT,
    clamp,
    distance,
    tankTrialSession: { active: false },
    explodeFreeze: (...args) => explosions.push(args),
    explode() {},
    burst() {},
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);
  sandbox.updateBullets(0.1);
  assert.equal(explosions.length, 2);
  assert.deepEqual(explosions.map((args) => args.slice(2, 5)), [
    [90, 42, "freeze"],
    [90, 42, "freeze"],
  ]);
  assert.equal(game.bullets.length, 0);
});

test("slow status changes effective enemy movement without mutating base speed", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateEnemies", "separateEnemy");
  const enemy = {
    id: 1,
    kind: "zombie",
    health: 100,
    x: 0,
    y: 100,
    speed: 100,
    damage: 8,
    radius: 18,
    attackCooldown: 1,
    shotCooldown: 1,
    hitFlash: 0,
    animationTime: 0,
    attackAnimation: 0,
    hurtAnimation: 0,
    slowStatuses: [{ source: "freeze", amount: 0.5, expiresAt: 5 }],
  };
  const game = {
    time: 2,
    enemies: [enemy],
    player: { x: 1000, y: 100 },
    structures: [],
    slowZones: [{ source: "freeze", amount: 0.2, x: 0, y: 100, radius: 200, life: 2 }],
  };
  const sandbox = {
    game,
    developerSession: { enabled: false },
    normalize,
    distance,
    strongestSlow,
    hurtPlayer() {},
    triggerEnemyAttack() {},
    createGas() {},
    resolveStaticCollision() {},
    separateEnemy() {},
    updateEnemyGasTrail() {},
    spawnBossRunners() {},
    Math,
  };
  new Script(updateSource + "\nthis.updateEnemies = updateEnemies;")
    .runInNewContext(sandbox);
  sandbox.updateEnemies(1);
  assert.equal(enemy.x, 50);
  assert.equal(enemy.speed, 100);
  assert.equal(enemy.slowStatuses.length, 1);

  game.time = 6;
  enemy.x = 0;
  enemy.frozenUntil = 7;
  sandbox.updateEnemies(1);
  assert.equal(enemy.x, 0);
  assert.equal(enemy.speed, 100);
  assert.deepEqual(enemy.slowStatuses, []);

  game.time = 8;
  enemy.x = 0;
  sandbox.updateEnemies(1);
  assert.equal(enemy.x, 80);
  game.slowZones = [];
  enemy.x = 0;
  sandbox.updateEnemies(1);
  assert.equal(enemy.x, 100);
});

test("frost field lifetime expires independently after two seconds", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateSlowZones", "updateSpikeTraps");
  const game = {
    slowZones: [
      { source: "freeze", amount: 0.2, life: 0.5 },
      { source: "freeze", amount: 0.2, life: 2 },
    ],
  };
  const sandbox = { game };
  new Script(updateSource + "\nthis.updateSlowZones = updateSlowZones;")
    .runInNewContext(sandbox);
  sandbox.updateSlowZones(1);
  assert.equal(game.slowZones.length, 1);
  assert.equal(game.slowZones[0].life, 1);
  sandbox.updateSlowZones(1);
  assert.deepEqual(game.slowZones, []);
});

test("shotgun draws a six by six round pellet with a directional highlight", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(source, "drawShotgunPellet", "drawBullet");
  const calls = [];
  const fillColors = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    beginPath: () => calls.push("begin"),
    arc: (...args) => calls.push(["arc", ...args]),
    fill: () => calls.push("fill"),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    stroke: () => calls.push("stroke"),
    set lineWidth(_value) {},
    set lineCap(_value) {},
    set strokeStyle(_value) {},
    set fillStyle(value) { fillColors.push(value); },
  };
  const sandbox = { context, Math, TAU };
  new Script(drawSource + "\nthis.drawShotgunPellet = drawShotgunPellet;")
    .runInNewContext(sandbox);

  sandbox.drawShotgunPellet({
    x: 30,
    y: 40,
    vx: 3,
    vy: 4,
    color: "#f0c779",
  });

  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
  assert.deepEqual(calls.find((entry) => Array.isArray(entry) && entry[0] === "translate"), [
    "translate", 30, 40,
  ]);
  const rotation = calls.find((entry) => Array.isArray(entry) && entry[0] === "rotate");
  assert.ok(Math.abs(rotation[1] - Math.atan2(4, 3)) < 1e-12);
  assert.deepEqual(
    calls.filter((entry) => Array.isArray(entry) && entry[0] === "arc"),
    [
      ["arc", 0, 0, 3, 0, TAU],
      ["arc", 0.75, -0.75, 0.55, 0, TAU],
    ],
  );
  assert.deepEqual(fillColors, ["#f0c779", "#fff2bd"]);
  assert.equal(calls.filter((entry) => entry === "fill").length, 2);
  assert.equal(calls.filter((entry) => entry === "stroke").length, 0);
  assert.match(
    source,
    /if \(bullet\.source === "shotgun"\) \{\s*drawShotgunPellet\(bullet\);\s*return;\s*\}/,
  );
});

test("freeze gun draws a snowball and frost intensity matches active slow", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const projectileSource = extractGameFunction(source, "drawFreezeProjectile", "drawBullet");
  const frostSource = extractGameFunction(source, "drawEnemyFrost", "drawEnemy");
  const colors = [];
  const alphas = [];
  const shadowBlurs = [];
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    arc: (...args) => calls.push(["arc", ...args]),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    set strokeStyle(value) { colors.push(value); },
    set fillStyle(value) { colors.push(value); },
    set globalAlpha(value) { alphas.push(value); },
    set lineWidth(_value) {},
    set shadowBlur(value) { shadowBlurs.push(value); },
    set shadowColor(value) { colors.push(value); },
  };
  const sandbox = {
    context,
    game: { time: 2 },
    strongestSlow,
    TAU,
    Math,
  };
  new Script(
    `${projectileSource}\n${frostSource}\nthis.drawFreezeProjectile = drawFreezeProjectile;this.drawEnemyFrost = drawEnemyFrost;`,
  ).runInNewContext(sandbox);
  sandbox.drawFreezeProjectile({ x: 30, y: 40, vx: 500, vy: 0, radius: 6 });
  sandbox.drawEnemyFrost({
    x: 80,
    y: 90,
    radius: 18,
    slowStatuses: [{ amount: 0.5, expiresAt: 5 }],
  });
  const trailStart = calls.find((entry) => Array.isArray(entry) && entry[0] === "move");
  const projectileArc = calls.find((entry) => Array.isArray(entry) && entry[0] === "arc");
  assert.deepEqual(trailStart.slice(1), [18, 40]);
  assert.deepEqual(projectileArc.slice(1), [30, 40, 6, 0, TAU]);
  assert.equal(shadowBlurs[0], 9);
  assert.equal(calls.filter((entry) => entry === "save").length, 2);
  assert.equal(calls.filter((entry) => entry === "restore").length, 2);
  assert.ok(colors.some((color) => /dff8ff|8bdcff|ffffff/i.test(color)));
  assert.ok(alphas.includes(0.5));
  assert.match(source, /function drawEnemy\(enemy\)[\s\S]*?drawEnemySprite\(enemy\);[\s\S]*?drawEnemyFrost\(enemy\)/);
  assert.match(source, /bullet\.kind === "freeze"[\s\S]*?drawFreezeProjectile\(bullet\)/);
});

test("freeze execution captures one non-interactive ice statue instead of a death animation", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeRocket");
  const enemy = {
    id: 1, kind: "runner", x: 40, y: 60, radius: 17,
    health: 0, maxHealth: 100, freezeExecuted: true,
    animationTime: 0.4, animationPhase: 0.2,
    attackAnimation: 0, hurtAnimation: 0,
    scoreMultiplier: 1,
  };
  const game = {
    enemies: [enemy], bullets: [], enemyDeathAnimations: [], iceStatues: [],
    decals: [], particles: [], combo: 1,
  };
  const sandbox = {
    game, WIDTH, HEIGHT, Math,
    tankTrialSession: { active: false },
    refillPistolOnKill() {}, createEnemySupplies() {}, applyKill() {}, burst() {},
    ensureSound: () => () => {}, resolveEnemyAction: () => "walk",
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);

  sandbox.updateBullets(0);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.enemyDeathAnimations.length, 0);
  assert.deepEqual({ ...game.iceStatues[0] }, {
    kind: "runner", x: 40, y: 60, radius: 17,
    action: "walk", animationTime: 0.4, animationPhase: 0.2,
    hitFlash: 0, life: 0.35, maxLife: 0.35,
  });
});

test("ice statues expire after 0.35 seconds", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateParticles", "failActiveTankTrial");
  const game = {
    particles: [], beams: [], lightningArcs: [], decals: [], enemyDeathAnimations: [],
    iceStatues: [{ life: 0.35, maxLife: 0.35 }],
  };
  const sandbox = {
    game,
    advanceZombieDeaths: (items) => items,
    tickLightningHitEffects: () => [],
  };
  new Script(updateSource + "\nthis.updateParticles = updateParticles;")
    .runInNewContext(sandbox);

  sandbox.updateParticles(0.2);
  assert.ok(Math.abs(game.iceStatues[0].life - 0.15) < 1e-12);
  sandbox.updateParticles(0.2);
  assert.deepEqual(game.iceStatues, []);
});

test("freeze body filter scales with ice amount and ice statue draws faceted shell", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function freezeSpriteFilter(");
  const end = source.indexOf("function drawEnemyFrost(", start);
  assert.ok(start >= 0 && end > start);
  const visualSource = source.slice(start, end);
  const calls = [];
  const filters = [];
  const context = {
    save: () => calls.push("save"), restore: () => calls.push("restore"),
    translate: (...args) => calls.push(["translate", ...args]),
    beginPath: () => calls.push("begin"), closePath: () => calls.push("close"),
    moveTo: (...args) => calls.push(["move", ...args]),
    lineTo: (...args) => calls.push(["line", ...args]),
    ellipse() {}, fill: () => calls.push("fill"), stroke: () => calls.push("stroke"),
    drawImage: () => calls.push("image"),
    set filter(value) { filters.push(value); },
    set fillStyle(_value) {}, set strokeStyle(_value) {},
    set lineWidth(_value) {}, set globalAlpha(_value) {},
  };
  const sandbox = {
    context, game: { time: 1 }, strongestSlow, clamp,
    resolveEnemyVisual: () => ({ drawWidth: 64, drawHeight: 64, anchorX: 32, anchorY: 32 }),
    enemyAtlases: new Map([["zombie", {}]]),
    resolveZombieSourceRect: () => ({ x: 0, y: 0, width: 128, height: 128 }),
    resolveEnemyAction: () => "walk", TAU, Math,
  };
  new Script(visualSource + "\nthis.api = { freezeSpriteFilter, drawIceStatue };")
    .runInNewContext(sandbox);
  assert.equal(sandbox.api.freezeSpriteFilter({ kind: "zombie", slowStatuses: [] }), "none");
  const filter = sandbox.api.freezeSpriteFilter({
    kind: "zombie",
    slowStatuses: [{ source: "freeze", amount: 0.3, expiresAt: 2 }],
  });
  assert.match(filter, /brightness\(/);
  assert.match(filter, /hue-rotate\(/);

  sandbox.api.drawIceStatue({
    kind: "zombie", x: 20, y: 30, radius: 18, action: "walk",
    animationTime: 0.2, animationPhase: 0.1, life: 0.2, maxLife: 0.35,
  });
  assert.equal(calls.filter((call) => call === "image").length, 1);
  assert.ok(calls.filter((call) => call === "close").length >= 3);
  assert.ok(filters.some((value) => /hue-rotate/.test(value)));
  assert.match(source, /\.\.\.game\.iceStatues\.map[\s\S]*?drawIceStatue\(statue\)/);
});

test("paralysis is yellow and full freeze draws a stronger frost ring", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const statusSource = extractGameFunction(source, "drawEnemyFrost", "drawEnemy");
  const colors = [];
  const widths = [];
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    set strokeStyle(value) { colors.push(value); },
    set fillStyle(value) { colors.push(value); },
    set lineWidth(value) { widths.push(value); },
    set globalAlpha(_value) {},
    set shadowBlur(_value) {},
    set shadowColor(value) { colors.push(value); },
  };
  const sandbox = { context, game: { time: 10 }, strongestSlow, TAU, Math };
  new Script(
    `${statusSource}\nthis.api = { drawEnemyFrost, drawEnemyParalysis };`,
  ).runInNewContext(sandbox);
  sandbox.api.drawEnemyFrost({
    x: 10, y: 20, radius: 18, frozenUntil: 10.8,
    slowStatuses: [{ source: "freeze", amount: 0.6, expiresAt: 12 }],
  });
  sandbox.api.drawEnemyParalysis({
    x: 30, y: 40, radius: 16,
    slowStatuses: [{ source: "lightning", amount: 1, expiresAt: 10.5 }],
  });
  assert.ok(colors.some((color) => /8bdcff|dff8ff/i.test(color)));
  assert.ok(colors.some((color) => /ffd84a|fff2a8/i.test(color)));
  assert.ok(widths.some((width) => width >= 5));
  assert.equal(calls.filter((entry) => entry === "save").length,
    calls.filter((entry) => entry === "restore").length);
  assert.match(source, /function drawEnemy\(enemy\)[\s\S]*?drawEnemyFrost\(enemy\)[\s\S]*?drawEnemyParalysis\(enemy\)/);
});

test("frost juice and fire zones render below actors with distinct colors", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const slowZoneSource = extractGameFunction(source, "drawSlowZone", "drawBeam");
  const colors = [];
  const calls = [];
  const gradient = { addColorStop: (_offset, color) => colors.push(color) };
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    createRadialGradient: () => gradient,
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    set globalAlpha(_value) {},
    set fillStyle(value) { if (typeof value === "string") colors.push(value); },
    set strokeStyle(value) { colors.push(value); },
    set lineWidth(_value) {},
  };
  const sandbox = { context, clamp, TAU, Math };
  new Script(slowZoneSource + "\nthis.drawSlowZone = drawSlowZone;")
    .runInNewContext(sandbox);
  sandbox.drawSlowZone({ source: "freeze", x: 10, y: 20, radius: 60, life: 1, maxLife: 2 });
  sandbox.drawSlowZone({ source: "watermelon", x: 30, y: 40, radius: 70, life: 2, maxLife: 3 });
  assert.ok(colors.some((color) => /8bdcff|dff8ff/i.test(color)));
  assert.ok(colors.some((color) => /d94a45|4c9b42/i.test(color)));
  assert.equal(calls.filter((entry) => entry === "save").length, 2);
  assert.equal(calls.filter((entry) => entry === "restore").length, 2);

  const renderStart = source.indexOf("function render()");
  const fireIndex = source.indexOf("for (const zone of game.damageZones) drawDamageZone(zone)", renderStart);
  const slowIndex = source.indexOf("for (const zone of game.slowZones) drawSlowZone(zone)", renderStart);
  const trapIndex = source.indexOf("for (const trap of game.spikeTraps) drawSpikeTrap(trap)", renderStart);
  const actorIndex = source.indexOf("const entities = [", renderStart);
  assert.ok(fireIndex < slowIndex && slowIndex < trapIndex && trapIndex < actorIndex);
});

test("watermelon charge state starts empty and is independent", () => {
  const first = createGameState();
  const second = createGameState();
  assert.equal(first.player.chargeWeapon, null);
  assert.equal(first.player.chargeTime, 0);
  first.player.chargeWeapon = "watermelon";
  first.player.chargeTime = 0.8;
  assert.equal(second.player.chargeWeapon, null);
  assert.equal(second.player.chargeTime, 0);
});

test("watermelon charge cancels early, fires on release, and holds at full", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const chargeSource = extractGameFunction(source, "fireBullet", "damageEnemy");
  const game = createGameState();
  game.mode = "playing";
  game.player.weapon = "watermelon";
  game.player.x = 100;
  game.player.y = 200;
  game.player.aimX = 1;
  game.player.aimY = 0;
  game.player.ammo.watermelon = 0;
  const mouse = { down: true };
  let chargeTimeLimit = 1.5;
  const sandbox = {
    game,
    mouse,
    weapons,
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    rewardDialog: { hidden: true },
    hasUsableAmmo: (player, id) => player.ammo[id] > 0,
    shouldConsumeAmmo: () => true,
    hasWeaponTrait: () => false,
    watermelonStats: () => ({
      damageMultiplier: 1,
      blastRadiusMultiplier: 1,
      chargeTime: chargeTimeLimit,
      speedMultiplier: 1,
      movementPenalty: 0.2,
      capacity: 9,
    }),
    watermelonChargeStats,
    triggerWeaponVisual: () => true,
    burst() {},
    ensureSound: () => () => {},
    Math,
  };
  new Script(
    chargeSource +
      "\nthis.startWatermelonCharge = startWatermelonCharge;" +
      "this.updateWatermelonCharge = updateWatermelonCharge;" +
      "this.releaseWatermelonCharge = releaseWatermelonCharge;",
  ).runInNewContext(sandbox);

  assert.equal(sandbox.startWatermelonCharge(), false);
  assert.equal(game.player.chargeWeapon, null);
  game.player.ammo.watermelon = 3;
  assert.equal(sandbox.startWatermelonCharge(), true);
  sandbox.updateWatermelonCharge(0.2);
  assert.equal(sandbox.releaseWatermelonCharge(), false);
  assert.equal(game.player.ammo.watermelon, 3);
  assert.equal(game.bullets.length, 0);
  assert.equal(game.player.chargeWeapon, null);

  mouse.down = true;
  assert.equal(sandbox.startWatermelonCharge(), true);
  sandbox.updateWatermelonCharge(0.9);
  assert.equal(sandbox.releaseWatermelonCharge(), true);
  assert.equal(game.player.ammo.watermelon, 2);
  assert.equal(game.bullets.length, 1);
  const chargedBullet = game.bullets[0];
  assert.deepEqual(
    (({ kind, blastRadius, radius, speed, source }) => ({
      kind, blastRadius, radius, speed, source,
    }))(chargedBullet),
    {
      kind: "watermelon",
      blastRadius: 165,
      radius: 20,
      speed: 440,
      source: "watermelon",
    },
  );
  assert.ok(Math.abs(chargedBullet.damage - 205) < 1e-9);
  assert.ok(Math.abs(chargedBullet.chargeRatio - 0.5) < 1e-9);
  assert.equal(chargedBullet.fullCharge, false);
  assert.equal(chargedBullet.seedStorm, false);
  assert.equal(chargedBullet.crushing, false);
  assert.equal(chargedBullet.ripeCore, false);
  assert.equal(chargedBullet.juiceField, false);

  game.player.cooldown = 0;
  chargeTimeLimit = 0.8;
  mouse.down = true;
  assert.equal(sandbox.startWatermelonCharge(), true);
  sandbox.updateWatermelonCharge(0.8);
  assert.equal(game.bullets.length, 1);
  assert.equal(game.player.ammo.watermelon, 2);
  assert.equal(game.player.chargeWeapon, "watermelon");
  assert.equal(game.player.chargeTime, 0.8);
  assert.equal(mouse.down, true);
  sandbox.updateWatermelonCharge(1);
  assert.equal(game.player.chargeTime, 0.8);
  assert.equal(sandbox.releaseWatermelonCharge(), true);
  assert.equal(game.bullets.length, 2);
  assert.equal(game.player.ammo.watermelon, 1);
  assert.equal(game.player.chargeWeapon, null);
  assert.equal(game.player.chargeTime, 0);
  assert.equal(mouse.down, false);
  assert.equal(game.bullets[1].fullCharge, true);
});

test("watermelon charge bar stays above player with minimum marker and full red flash", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(source, "drawWatermelonCharge", "drawPlayer");
  const calls = [];
  const colors = [];
  const context = {
    save() {}, restore() {},
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    strokeRect: (...args) => calls.push(["strokeRect", ...args]),
    beginPath() {}, moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]), stroke() {},
    set fillStyle(value) { colors.push(value); },
    set strokeStyle(value) { colors.push(value); },
    set lineWidth(_value) {},
  };
  const game = {
    time: 0,
    player: { x: 100, y: 100, chargeWeapon: "watermelon", chargeTime: 0.1 },
  };
  const sandbox = {
    context, game, clamp,
    watermelonStats: () => ({ chargeTime: 1.5 }),
    Math,
  };
  new Script(drawSource + "\nthis.drawWatermelonCharge = drawWatermelonCharge;")
    .runInNewContext(sandbox);

  sandbox.drawWatermelonCharge();
  assert.deepEqual(calls.find(([name]) => name === "strokeRect"), ["strokeRect", 68, 46, 64, 9]);
  assert.ok(calls.some(([name, x]) => name === "moveTo" && Math.abs(x - 82) < 1e-9));
  game.player.chargeTime = 1.5;
  game.time = 0.1;
  sandbox.drawWatermelonCharge();
  assert.ok(colors.some((color) => /d62f2f|ff5a4f/i.test(color)));
});

test("watermelon trait numeric stats resolve at levels zero one and five", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(adapterSource + "\nthis.watermelonStats = watermelonStats;")
    .runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.watermelonStats() }, {
    damageMultiplier: 1,
    blastRadiusMultiplier: 1,
    chargeTime: 1.5,
    speedMultiplier: 1,
    movementPenalty: 0.2,
    capacity: 9,
  });
  for (const id of ["damage", "blast_radius", "charge_time", "speed", "movement_penalty", "capacity"]) {
    upgrades.watermelon[id] = 1;
  }
  const levelOne = sandbox.watermelonStats();
  assert.equal(levelOne.damageMultiplier, 1.2);
  assert.equal(levelOne.blastRadiusMultiplier, 1.15);
  assert.equal(levelOne.chargeTime, 1.32);
  assert.equal(levelOne.speedMultiplier, 1.15);
  assert.equal(levelOne.movementPenalty, 0.16);
  assert.equal(levelOne.capacity, 10);
  for (const id of ["damage", "blast_radius", "charge_time", "speed", "movement_penalty", "capacity"]) {
    upgrades.watermelon[id] = 5;
  }
  const levelFive = sandbox.watermelonStats();
  assert.ok(Math.abs(levelFive.damageMultiplier - 1.2 ** 5) < 1e-12);
  assert.ok(Math.abs(levelFive.blastRadiusMultiplier - 1.15 ** 5) < 1e-12);
  assert.equal(levelFive.chargeTime, 0.8);
  assert.ok(Math.abs(levelFive.speedMultiplier - 1.15 ** 5) < 1e-12);
  assert.equal(levelFive.movementPenalty, 0);
  assert.equal(levelFive.capacity, 14);
});

test("watermelon charge slows player movement to eighty percent", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updatePlayer", "resolveStaticCollision");
  const game = createGameState();
  game.player.x = 100;
  game.player.y = 200;
  game.player.chargeWeapon = "watermelon";
  let movementPenalty = 0.2;
  const sandbox = {
    game,
    keys: new Set(["d"]),
    mouse: { x: 500, y: 200, down: false },
    playerModifiers: () => ({ speedMultiplier: 1 }),
    watermelonStats: () => ({ movementPenalty }),
    normalize,
    resolveDodgeDirection,
    startDodge,
    cancelReload() {},
    ensureSound: () => () => {},
    clamp,
    WIDTH,
    HEIGHT,
    resolvePlayerCollision() {},
    completeReload() {},
    tickDodge,
    tickWeaponVisual() {},
    DODGE,
    burst() {},
    updateWatermelonCharge() {},
    useWeapon() {},
    Math,
  };
  new Script(updateSource + "\nthis.updatePlayer = updatePlayer;")
    .runInNewContext(sandbox);
  sandbox.updatePlayer(1);
  assert.equal(game.player.x, 288);
  assert.equal(game.player.speed, 235);
  game.player.x = 100;
  movementPenalty = 0;
  sandbox.updatePlayer(1);
  assert.equal(game.player.x, 335);
});

test("watermelon charge input releases and every blocking transition cancels", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /canvas\.addEventListener\("pointerdown"[\s\S]*?startWatermelonCharge\(\)/);
  assert.match(source, /window\.addEventListener\("pointerup"[\s\S]*?releaseWatermelonCharge\(\)/);
  for (const functionName of [
    "openRewardDialog",
    "openTankTrialDialog",
    "togglePause",
  ]) {
    const block = extractGameFunction(
      source,
      functionName,
      functionName === "openRewardDialog"
        ? "chooseRewardCategoryFromDialog"
        : functionName === "openTankTrialDialog"
          ? "declineTankTrialDialog"
          : "isInteractiveTarget",
    );
    assert.match(block, /cancelWatermelonCharge\(\)/, `${functionName} must cancel charge`);
    assert.match(block, /game\.delayedShots\.length = 0/, `${functionName} must clear delayed shots`);
  }
  assert.match(source, /window\.addEventListener\("blur", \(\) => togglePause\(true\)\)/);
  assert.match(source, /function switchWeapon[\s\S]*?cancelWatermelonCharge\(\)/);
});

test("watermelon projectile shatters on first impact boundary or expiry", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeFreeze");
  assert.match(
    updateSource,
    /bullet\.kind === "watermelon"[\s\S]*?bullet\.life <= 0[\s\S]*?shatterWatermelon/,
  );
  assert.match(
    updateSource,
    /bullet\.kind === "watermelon"[\s\S]*?shatterWatermelon\([\s\S]*?enemy[\s\S]*?break/,
  );
  assert.doesNotMatch(updateSource, /bullet\.crushing && !heavyImpact/);
});

test("watermelon shatter damages only the direct target and spawns eight slices", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const shatterSource = extractGameFunction(source, "shatterWatermelon", "explodeFreeze");
  const direct = { id: 1, kind: "zombie", x: 0, y: 0, health: 500, radius: 18 };
  const nearby = { id: 2, kind: "runner", x: 40, y: 0, health: 500, radius: 18 };
  const game = {
    nextId: 1,
    enemies: [direct, nearby],
    bullets: [],
    slowZones: [],
    particles: [],
  };
  const damageCalls = [];
  const bursts = [];
  const sandbox = {
    game,
    buildWatermelonSliceAngles,
    buildSeedAngles,
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
      return true;
    },
    burst: (...args) => bursts.push(args),
    ensureSound: () => () => {},
    Math,
  };
  new Script(shatterSource + "\nthis.shatterWatermelon = shatterWatermelon;")
    .runInNewContext(sandbox);

  sandbox.shatterWatermelon(0, 0, {
    damage: 100,
    blastRadius: 180,
    source: "watermelon",
    fullCharge: false,
    seedStorm: false,
    crushing: false,
    ripeCore: false,
    juiceField: false,
  }, direct);

  assert.deepEqual(damageCalls, [[1, 100, "watermelon", 0.14]]);
  assert.equal(nearby.health, 500);
  const slices = game.bullets.filter(({ kind }) => kind === "watermelon-slice");
  assert.equal(slices.length, 8);
  assert.ok(slices.every((slice) =>
    slice.damage === 30 &&
    slice.radius === 7 &&
    Math.abs(slice.life - 0.5) < 1e-12 &&
    slice.hitIds.length === 1 &&
    slice.hitIds[0] === 1));
  assert.equal(new Set(slices.map(({ vx, vy }) => `${vx},${vy}`)).size, 8);
  assert.equal(bursts.reduce((sum, args) => sum + args[3], 0), 12);
  assert.doesNotMatch(shatterSource, /size:\s*radius/);
  assert.doesNotMatch(shatterSource, /distance\(\{ x, y \}, enemy\) \/ radius/);
});

test("watermelon shatter adapts crushing ripe core seeds and juice field", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const shatterSource = extractGameFunction(source, "shatterWatermelon", "explodeFreeze");
  const direct = { id: 7, kind: "brute", x: 20, y: 30, health: 1000, radius: 28 };
  const game = {
    nextId: 1,
    enemies: [direct],
    bullets: [],
    slowZones: [],
    particles: [],
  };
  const damageCalls = [];
  const sandbox = {
    game,
    buildWatermelonSliceAngles,
    buildSeedAngles,
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
      return true;
    },
    burst() {},
    ensureSound: () => () => {},
    Math,
  };
  new Script(shatterSource + "\nthis.shatterWatermelon = shatterWatermelon;")
    .runInNewContext(sandbox);

  sandbox.shatterWatermelon(20, 30, {
    damage: 100,
    blastRadius: 180,
    source: "watermelon",
    fullCharge: true,
    seedStorm: true,
    crushing: true,
    ripeCore: true,
    juiceField: true,
  }, direct);

  assert.deepEqual(damageCalls, [[7, 130, "watermelon", 0.14]]);
  assert.equal(game.bullets.filter(({ kind }) => kind === "watermelon-slice").length, 8);
  assert.ok(game.bullets
    .filter(({ kind }) => kind === "watermelon-slice")
    .every(({ damage }) => damage === 45));
  assert.equal(game.bullets.filter(({ kind }) => kind === "watermelon-seed").length, 10);
  assert.ok(game.bullets
    .filter(({ kind }) => kind === "watermelon-seed")
    .every(({ damage }) => damage === 12));
  assert.deepEqual(game.slowZones.map((zone) => ({ ...zone })), [{
    source: "watermelon",
    amount: 0.25,
    x: 20,
    y: 30,
    radius: 180,
    life: 3,
    maxLife: 3,
    excludesBoss: true,
  }]);
});

test("watermelon direct impact excludes its target from eight spawned slices", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeFreeze");
  const direct = { id: 1, kind: "zombie", x: 20, y: 20, radius: 18, health: 500 };
  const nearby = { id: 2, kind: "runner", x: 80, y: 20, radius: 18, health: 500 };
  const game = {
    nextId: 10,
    bullets: [{
      kind: "watermelon",
      owner: "player",
      x: 20,
      y: 20,
      vx: 0,
      vy: 0,
      radius: 20,
      blastRadius: 180,
      damage: 100,
      source: "watermelon",
      life: 3,
      exploded: false,
    }],
    enemies: [direct, nearby],
    particles: [],
    slowZones: [],
    enemyDeathAnimations: [],
    decals: [],
    combo: 1,
  };
  const damageCalls = [];
  const sandbox = {
    game,
    WIDTH,
    HEIGHT,
    clamp,
    distance,
    normalize,
    buildWatermelonSliceAngles,
    buildSeedAngles,
    TAU,
    tankTrialSession: { active: false },
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
      return true;
    },
    burst() {},
    ensureSound: () => () => {},
    Math,
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);

  sandbox.updateBullets(0);
  assert.deepEqual(damageCalls, [[1, 100, "watermelon", 0.14]]);
  assert.equal(nearby.health, 500);
  assert.equal(game.bullets.length, 8);
  assert.ok(game.bullets.every((slice) =>
    slice.kind === "watermelon-slice" && slice.hitIds.includes(1)));
});

test("watermelon slices hit one non-excluded enemy and expire without exploding", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explodeFreeze");
  const excluded = { id: 1, kind: "zombie", x: 50, y: 50, radius: 18, health: 500 };
  const target = { id: 2, kind: "runner", x: 50, y: 50, radius: 18, health: 500 };
  const slice = {
    id: 3,
    kind: "watermelon-slice",
    owner: "player",
    x: 50,
    y: 50,
    vx: 0,
    vy: 0,
    radius: 7,
    damage: 30,
    source: "watermelon",
    life: 0.5,
    spin: 0,
    spinSpeed: 8,
    hitIds: [1],
  };
  const game = {
    nextId: 10,
    bullets: [slice],
    enemies: [excluded, target],
    particles: [],
    enemyDeathAnimations: [],
    decals: [],
    combo: 1,
  };
  const damageCalls = [];
  const bursts = [];
  const sandbox = {
    game,
    WIDTH,
    HEIGHT,
    clamp,
    distance,
    normalize,
    buildWatermelonSliceAngles,
    buildSeedAngles,
    TAU,
    tankTrialSession: { active: false },
    damageEnemy(enemy, amount, sourceId, flash) {
      damageCalls.push([enemy.id, amount, sourceId, flash]);
      enemy.health -= amount;
      return true;
    },
    burst: (...args) => bursts.push(args),
    ensureSound: () => () => {},
    Math,
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);

  sandbox.updateBullets(0);
  assert.deepEqual(damageCalls, [[2, 30, "watermelon", 0.1]]);
  assert.equal(excluded.health, 500);
  assert.equal(game.bullets.length, 0);
  assert.equal(bursts.reduce((sum, args) => sum + args[3], 0), 4);

  game.bullets = [{ ...slice, id: 4, life: 0 }];
  damageCalls.length = 0;
  sandbox.updateBullets(0);
  assert.deepEqual(damageCalls, []);
  assert.equal(game.bullets.length, 0);
});

test("watermelon slices draw rotating red flesh green rind and dark seeds", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const sliceSource = extractGameFunction(
    source,
    "drawWatermelonSlice",
    "drawWatermelonSeed",
  );
  const colors = [];
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    beginPath: () => calls.push("begin"),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    closePath: () => calls.push("closePath"),
    ellipse: (...args) => calls.push(["ellipse", ...args]),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    set fillStyle(value) { colors.push(value); },
    set strokeStyle(value) { colors.push(value); },
    set lineWidth(_value) {},
  };
  const sandbox = { context, TAU, Math };
  new Script(sliceSource + "\nthis.drawWatermelonSlice = drawWatermelonSlice;")
    .runInNewContext(sandbox);

  sandbox.drawWatermelonSlice({ x: 30, y: 40, spin: 1.25 });
  assert.equal(calls[0], "save");
  assert.equal(calls.at(-1), "restore");
  assert.deepEqual(
    calls.find((entry) => Array.isArray(entry) && entry[0] === "translate"),
    ["translate", 30, 40],
  );
  assert.deepEqual(
    calls.find((entry) => Array.isArray(entry) && entry[0] === "rotate"),
    ["rotate", 1.25],
  );
  assert.ok(colors.some((color) => /d94a45/i.test(color)));
  assert.ok(colors.some((color) => /4c9b42/i.test(color)));
  assert.ok(colors.some((color) => /263126/i.test(color)));
  assert.equal(calls.filter((entry) => entry === "fill").length, 3);
  assert.match(
    source,
    /bullet\.kind === "watermelon-slice"[\s\S]*?drawWatermelonSlice\(bullet\)/,
  );
});

test("watermelon rendering uses rind flesh seeds and charge preview", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");

  const projectileSource = extractGameFunction(
    source,
    "drawFallbackWatermelon",
    "drawBullet",
  );
  const previewSource = extractGameFunction(
    source,
    "drawWatermelonCharge",
    "drawPlayer",
  );
  const colors = [];
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate() {},
    rotate() {},
    beginPath() {},
    ellipse() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    fillRect: () => calls.push("fillRect"),
    strokeRect: () => calls.push("strokeRect"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    set fillStyle(value) { colors.push(value); },
    set strokeStyle(value) { colors.push(value); },
    set lineWidth(_value) {},
    set globalAlpha(_value) {},
    set shadowBlur(_value) {},
    set shadowColor(value) { colors.push(value); },
  };
  const drawSandbox = new Script(
    `(() => {${projectileSource}\n${previewSource}; return { drawWatermelonProjectile, drawWatermelonSeed, drawWatermelonCharge };})()`,
  ).runInNewContext({
    context,
    game: {
      player: {
        x: 100,
        y: 100,
        aimX: 1,
        aimY: 0,
        chargeWeapon: "watermelon",
        chargeTime: 0.9,
      },
    },
    watermelonChargeStats,
    watermelonProjectileSprite: { complete: false, naturalWidth: 0 },
    clamp,
    TAU,
    Math,
  });
  drawSandbox.drawWatermelonProjectile({
    x: 30, y: 40, vx: 440, vy: 0, radius: 28, fullCharge: true,
  });
  drawSandbox.drawWatermelonSeed({
    x: 35, y: 45, vx: 560, vy: 0, radius: 3,
  });
  drawSandbox.drawWatermelonCharge();
  assert.equal(
    calls.filter((entry) => entry === "save").length,
    calls.filter((entry) => entry === "restore").length,
  );
  assert.ok(calls.filter((entry) => entry === "stroke").length >= 2);
  assert.ok(colors.filter((color) => /4c9b42|77bd55|b7d95b/i.test(color)).length >= 2);
  assert.ok(colors.some((color) => /d94a45/i.test(color)));
  assert.ok(colors.some((color) => /263126/i.test(color)));
  assert.match(source, /function drawPlayer\([\s\S]*?drawWatermelonCharge\(\)/);
});

test("watermelon projectile uses a generated square PNG with vector fallback", async () => {
  const png = await readFile(
    new URL("../public/watermelon-projectile.png", import.meta.url),
  );
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height);
  assert.ok(width >= 128);

  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /watermelonProjectileSprite\.src = "\/watermelon-projectile\.png"/);
  const start = source.indexOf("function drawFallbackWatermelon(");
  const end = source.indexOf("function drawWatermelonSeed(", start);
  assert.ok(start >= 0 && end > start);
  const drawSource = source.slice(start, end);
  const calls = [];
  const context = {
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {},
    ellipse: () => calls.push("ellipse"), fill() {}, stroke() {},
    drawImage: (...args) => calls.push(["image", ...args]),
    set fillStyle(_value) {}, set strokeStyle(_value) {}, set lineWidth(_value) {},
    set shadowBlur(_value) {}, set shadowColor(_value) {}, set globalAlpha(_value) {},
  };
  const sprite = { complete: true, naturalWidth: 256 };
  const sandbox = { context, watermelonProjectileSprite: sprite, TAU, Math };
  new Script(drawSource + "\nthis.drawWatermelonProjectile = drawWatermelonProjectile;")
    .runInNewContext(sandbox);
  sandbox.drawWatermelonProjectile({ x: 0, y: 0, vx: 1, vy: 0, radius: 20, spin: 0 });
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "image").length, 1);
  sprite.complete = false;
  sandbox.drawWatermelonProjectile({ x: 0, y: 0, vx: 1, vy: 0, radius: 20, spin: 0 });
  assert.ok(calls.filter((call) => call === "ellipse").length >= 1);
});

test("watermelon rind and flesh particles draw as visual-only fragments", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(source, "drawParticle", "drawHealthPack");
  const colors = [];
  const calls = [];
  const context = {
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath: () => calls.push("close"),
    arc: () => calls.push("arc"), fill() {},
    set globalAlpha(_value) {}, set fillStyle(value) { colors.push(value); },
  };
  const sandbox = { context, clamp, TAU, Math };
  new Script(drawSource + "\nthis.drawParticle = drawParticle;")
    .runInNewContext(sandbox);
  const base = { x: 0, y: 0, life: 0.2, maxLife: 0.4, size: 8, angle: 0, spin: 0 };
  sandbox.drawParticle({ ...base, type: "watermelon-rind", color: "#4c9b42" });
  sandbox.drawParticle({ ...base, type: "watermelon-flesh", color: "#d94a45" });
  assert.equal(calls.filter((call) => call === "close").length, 2);
  assert.equal(calls.filter((call) => call === "arc").length, 0);
  assert.ok(colors.some((color) => /4c9b42/i.test(color)));
  assert.ok(colors.some((color) => /d94a45/i.test(color)));
});

test("direct, explosive, chain, and lightning damage update attribution", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const damageSource = extractGameFunction(source, "damageEnemy", "triggerEnemyHurt");
  const flameSource = extractGameFunction(source, "fireFlame", "fireLaser");
  const laserSource = extractGameFunction(source, "fireLaser", "useWeapon");
  const directEnemy = {
    id: 1,
    kind: "zombie",
    x: 100,
    y: 0,
    radius: 16,
    health: 300,
    lastDamageSource: null,
  };
  const directGame = {
    player: { x: 0, y: 0 },
    enemies: [directEnemy],
    particles: [],
    beams: [],
  };
  const directSandbox = {
    game: directGame,
    Math,
    Number,
    flameDamageAtDistance,
    triggerEnemyHurt: () => {},
  };
  new Script(
    damageSource + flameSource + laserSource +
      "\nthis.fireFlame = fireFlame; this.fireLaser = fireLaser;",
  ).runInNewContext(directSandbox);
  directSandbox.fireFlame(0);
  assert.equal(directEnemy.lastDamageSource, "flamethrower");
  directSandbox.fireLaser(0);
  assert.equal(directEnemy.lastDamageSource, "laser");

  const explodeSource = extractGameFunction(source, "explode", "detonateEnemy");
  const detonateSource = extractGameFunction(source, "detonateEnemy", "createEnemySupplies");
  const blastEnemy = {
    id: 2,
    kind: "zombie",
    x: 10,
    y: 0,
    radius: 16,
    health: 500,
    lastDamageSource: null,
  };
  const exploder = {
    id: 3,
    kind: "exploder",
    x: 0,
    y: 0,
    radius: 17,
    health: 500,
    damage: 32,
    explosionRadius: 183,
    detonated: false,
    lastDamageSource: null,
  };
  const blastGame = {
    player: { x: 1000, y: 1000 },
    enemies: [blastEnemy, exploder],
    particles: [],
    combo: 17,
  };
  const blastSandbox = {
    game: blastGame,
    Math,
    Number,
    clamp: (value, minimum, maximum) =>
      Math.min(maximum, Math.max(minimum, value)),
    distance: (left, right) => Math.hypot(left.x - right.x, left.y - right.y),
    triggerEnemyHurt: () => {},
    burst: () => {},
    ensureSound: () => () => {},
    hurtPlayer: () => assert.fail("distant player must not be damaged"),
  };
  new Script(
    damageSource + explodeSource + detonateSource +
      "\nthis.explode = explode; this.detonateEnemy = detonateEnemy;",
  ).runInNewContext(blastSandbox);
  blastSandbox.explode(0, 0, 100, 100, "rocket");
  assert.equal(blastEnemy.lastDamageSource, "rocket");
  blastSandbox.explode(0, 0, 100, 10, "tank");
  assert.equal(blastEnemy.lastDamageSource, "tank");
  blastSandbox.detonateEnemy(exploder);
  assert.equal(blastEnemy.lastDamageSource, "enemy-exploder");
  assert.equal(blastGame.particles.at(-1).size, 183);

  const lightningSource = extractGameFunction(source, "updateLightning", "hurtPlayer");
  const lightningEnemy = {
    id: 4,
    kind: "zombie",
    x: 32,
    y: 0,
    radius: 16,
    health: 100,
    lastDamageSource: null,
  };
  const lightningGame = {
    wave: 30,
    waveQueue: ["zombie"],
    enemies: [lightningEnemy],
    ultimateTimer: 100,
    pendingLightningRings: 0,
    lightningSpawnTimer: 0,
    bossKills: 0,
    nextId: 1,
    player: { x: 0, y: 0 },
    lightningRings: [
      { id: 9, x: 0, y: 0, life: 0.75, maxLife: 0.75, radius: 32, hitIds: new Set() },
    ],
  };
  const lightningSandbox = {
    game: lightningGame,
    Math,
    Number,
    tickLightningRingLifetime: () => true,
    lightningRingCount: () => 1,
    isLightningBurstUnlocked,
    distance: (left, right) => Math.hypot(left.x - right.x, left.y - right.y),
    normalize,
    triggerEnemyHurt: () => {},
    burst: () => {},
    ensureSound: () => () => {},
  };
  new Script(
    damageSource + lightningSource + "\nthis.updateLightning = updateLightning;",
  ).runInNewContext(lightningSandbox);
  lightningSandbox.updateLightning(0);
  assert.equal(lightningEnemy.lastDamageSource, "lightning");
});

test("trial death settlement uses the final source once and preserves ordinary kills", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const damageSource = extractGameFunction(source, "damageEnemy", "triggerEnemyHurt");
  const updateBulletsSource = extractGameFunction(source, "updateBullets", "explode");
  const explodeSource = extractGameFunction(source, "explode", "detonateEnemy");
  const makeEnemy = () => ({
    id: 1,
    kind: "zombie",
    x: 0,
    y: 0,
    radius: 16,
    health: 40,
    maxHealth: 40,
    attackAnimation: 0,
    lastDamageSource: null,
  });
  const makeBullet = (id, damage, sourceId) => ({
    id,
    owner: "player",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage,
    source: sourceId,
    radius: 4,
    life: 1,
  });
  const makeGame = (enemy, bullets) => ({
    enemies: [enemy],
    bullets,
    enemyDeathAnimations: [],
    decals: [],
    particles: [],
    combo: 37,
    kills: 0,
    score: 0,
    unlocked: ["pistol"],
  });
  const sandbox = {
    game: null,
    tankTrialSession: startTankTrial(createTankTrialSession()),
    Math,
    Number,
    WIDTH,
    HEIGHT,
    ZOMBIE_ACTIONS: { death: { frames: 3, fps: 10 } },
    distance: (left, right) => Math.hypot(left.x - right.x, left.y - right.y),
    clamp: (value, minimum, maximum) =>
      Math.min(maximum, Math.max(minimum, value)),
    triggerEnemyHurt: () => {},
    triggerEnemyAttack: () => {},
    detonateEnemy: () => {},
    createGas: () => {},
    createEnemySupplies: () => {},
    burst: () => {},
    ensureSound: () => () => {},
    explode: () => {},
    creditTankTrialKill,
    applyKill,
  };
  new Script(
    damageSource + updateBulletsSource + explodeSource +
      "\nthis.updateBullets = updateBullets;",
  ).runInNewContext(sandbox);

  const rocketEnemy = makeEnemy();
  sandbox.game = makeGame(rocketEnemy, [
    { ...makeBullet(1, 100, "rocket"), kind: "rocket", blastRadius: 132, life: 0 },
    makeBullet(2, 32, "pistol"),
  ]);
  sandbox.updateBullets(0);
  assert.equal(rocketEnemy.lastDamageSource, "rocket");
  assert.equal(sandbox.tankTrialSession.stageScore, 0);

  const pistolFirstEnemy = makeEnemy();
  sandbox.game = makeGame(pistolFirstEnemy, [
    makeBullet(3, 40, "pistol"),
    makeBullet(4, 40, "shotgun"),
  ]);
  sandbox.tankTrialSession = startTankTrial(createTankTrialSession());
  sandbox.updateBullets(0);
  assert.equal(pistolFirstEnemy.lastDamageSource, "pistol");
  assert.equal(sandbox.tankTrialSession.stageScore, enemyStats.zombie.score);
  sandbox.updateBullets(0);
  assert.equal(sandbox.tankTrialSession.stageScore, enemyStats.zombie.score);

  const mixedEnemy = makeEnemy();
  sandbox.game = makeGame(mixedEnemy, [
    makeBullet(5, 10, "pistol"),
    makeBullet(6, 40, "shotgun"),
  ]);
  sandbox.tankTrialSession = startTankTrial(createTankTrialSession());
  sandbox.updateBullets(0);
  assert.equal(mixedEnemy.lastDamageSource, "shotgun");
  assert.equal(sandbox.tankTrialSession.stageScore, 0);
  assert.equal(sandbox.game.kills, 0);
  assert.equal(sandbox.game.score, 0);

  const pistolEnemy = makeEnemy();
  sandbox.game = makeGame(pistolEnemy, [makeBullet(7, 40, "pistol")]);
  sandbox.tankTrialSession = startTankTrial(createTankTrialSession());
  sandbox.updateBullets(0);
  assert.equal(sandbox.tankTrialSession.stageScore, enemyStats.zombie.score);
  assert.equal(sandbox.game.combo, 37);
  assert.equal(sandbox.game.kills, 0);
  sandbox.updateBullets(0);
  assert.equal(sandbox.tankTrialSession.stageScore, enemyStats.zombie.score);

  const exploderEnemy = { ...makeEnemy(), kind: "exploder" };
  sandbox.game = makeGame(exploderEnemy, [makeBullet(8, 40, "pistol")]);
  sandbox.tankTrialSession = startTankTrial(createTankTrialSession());
  sandbox.detonateEnemy = (enemy) => {
    enemy.lastDamageSource = "enemy-exploder";
  };
  sandbox.updateBullets(0);
  assert.equal(sandbox.tankTrialSession.stageScore, enemyStats.exploder.score);

  const ordinaryEnemy = makeEnemy();
  sandbox.game = makeGame(ordinaryEnemy, [makeBullet(9, 40, "pistol")]);
  sandbox.game.combo = 1;
  sandbox.tankTrialSession = createTankTrialSession();
  sandbox.updateBullets(0);
  assert.equal(sandbox.game.kills, 1);
  assert.equal(sandbox.game.score, enemyStats.zombie.score);

  const explosionCalls = [];
  sandbox.explode = (...args) => explosionCalls.push(args);
  const finalEnemy = makeEnemy();
  sandbox.game = makeGame(finalEnemy, [
    { ...makeBullet(10, 105, "rocket"), kind: "rocket", blastRadius: 132, life: 0 },
    { ...makeBullet(11, 110, "tank"), owner: "tank", blastRadius: 125, life: 0 },
  ]);
  sandbox.updateBullets(0);
  assert.equal(finalEnemy.lastDamageSource, "rocket");
  assert.deepEqual(
    explosionCalls.map((args) => args.at(-1)),
    ["tank"],
  );
});

test("upright player appearance does not enable developer mode in normal play", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /developerModeToggle\.checked = Boolean\(modelLab \|\| turretReview \|\| tankReview\)/);
  assert.doesNotMatch(source, /if \(adultReview \|\| turretReview \|\| tankReview\) developerModeToggle\.checked = true/);
});

test("ordinary score and wave progression never unlocks the tank directly", () => {
  assert.equal(unlockedForProgress(10000000, 10).includes("turret"), false);
  assert.equal(unlockedForProgress(2550000, 69).includes("turret"), false);
  assert.equal(unlockedForProgress(2549999, 70).includes("turret"), false);
  assert.equal(unlockedForProgress(2550000, 70).includes("turret"), true);
  assert.equal(unlockedForProgress(10000000, 100).includes("tank"), false);
});

test("developer mode still unlocks the tank directly", () => {
  const state = createGameState();
  unlockDeveloperWeapons(state);
  assert.equal(state.unlocked.includes("tank"), true);
});

test("runtime unlock requires both score and wave and excludes the tank", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = source.match(/function update\(dt\)[\s\S]*?\r?\n}\r?\n\r?\nfunction finishGame/)?.[0];
  assert.ok(updateSource);
  const executableSource = updateSource.replace(/\r?\n\r?\nfunction finishGame$/, "");
  const game = createGameState();
  game.mode = "playing";
  game.combo = 150;
  game.score = 10000000;
  game.wave = 10;
  game.unlocked = ["pistol"];
  let finishCount = 0;
  const sandbox = {
    game,
    tankTrialSession: createTankTrialSession(),
    tankTrialSnapshot: null,
    weapons,
    Math,
    updatePlayer: () => {},
    updateEnemies: () => {},
    updateStructures: () => {},
    updateShockwaves: () => {},
    updateLightning: () => {},
    updateBullets: () => {},
    updatePickups: () => {},
    updateHazards: () => {},
    updateParticles: () => {},
    updateWave: () => {},
    resolveTankTrialFrameState: () => "normal",
    tickCombo: () => {},
    unlockWeaponsForProgress,
    clamp: (value) => value,
    isSurvivalOver: () => false,
    finishGame: () => { finishCount += 1; },
  };
  new Script(executableSource + "\nthis.update = update;").runInNewContext(sandbox);

  sandbox.update(1 / 60);

  assert.deepEqual(game.unlocked, ["pistol", "shotgun", "flamethrower"]);
  game.wave = 70;
  sandbox.update(1 / 60);
  const ordinaryUnlocks = weapons.filter((weapon) => weapon.id !== "tank").map((weapon) => weapon.id);
  assert.deepEqual(game.unlocked, ordinaryUnlocks);
  assert.equal(game.unlocked.includes("tank"), false);
  assert.equal(finishCount, 0);
});

test("build declares supply hosting and standalone dependency order", async () => {
  const buildSource = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const hostedReward =
    '["/reward-progression.js", "src/reward-progression.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedReward).length - 1, 1);
  const hostedWeaponTraits =
    '["/weapon-traits.js", "src/weapon-traits.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedWeaponTraits).length - 1, 1);
  const hostedWeaponEffects =
    '["/weapon-effects.js", "src/weapon-effects.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedWeaponEffects).length - 1, 1);
  const hostedSupply =
    '["/supply-drops.js", "src/supply-drops.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedSupply).length - 1, 1);
  const hostedTankTrial =
    '["/tank-trial.js", "src/tank-trial.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedTankTrial).length - 1, 1);
  const hostedToxicTrail =
    '["/toxic-gas-trail.js", "src/toxic-gas-trail.js", "text/javascript; charset=utf-8"]';
  assert.equal(buildSource.split(hostedToxicTrail).length - 1, 1);
  assert.match(
    buildSource,
    /"\/random-wave-enhancements\.js",\s*"src\/random-wave-enhancements\.js"/,
  );
  assert.match(
    buildSource,
    /"\/spike-traps\.js",\s*"src\/spike-traps\.js"/,
  );
  assert.match(buildSource, /const standaloneSupply = supplySource/);
  assert.match(buildSource, /const standaloneWeaponTraits = weaponTraitsSource\.replace/);
  assert.match(buildSource, /const standaloneReward = rewardSource/);
  assert.match(buildSource, /const standaloneWeaponEffects = weaponEffectsSource\.replace/);
  assert.match(buildSource, /const standaloneTankTrial = tankTrialSource/);
  assert.match(buildSource, /const standaloneToxicGasTrail = toxicGasTrailSource/);
  assert.match(
    buildSource,
    /const standaloneRandomWaveEnhancements =\s*randomWaveEnhancementSource/,
  );
  assert.match(buildSource, /const standaloneSpikeTraps = spikeTrapSource/);
  assert.ok(
    buildSource.includes(
      '${standaloneWeaponTraits}\\n${standaloneReward}\\n${standaloneCore}\\n${standaloneRandomWaveEnhancements}\\n${standaloneSpikeTraps}\\n${standaloneDeveloper}\\n${standaloneSupply}\\n${standaloneShield}\\n${standaloneTankTrial}\\n${standaloneToxicGasTrail}\\n${standaloneWeaponEffects}\\n${standaloneAnimation}\\n${standaloneBossCombat}\\n${standaloneBossEffects}\\n${standaloneScoreboard}\\n${standaloneArenaProps}\\n${standaloneGame}',
    ),
  );
  const lintSource = await readFile(new URL("../scripts/lint.mjs", import.meta.url), "utf8");
  assert.match(lintSource, /"src\/weapon-traits\.js"/);
  assert.match(lintSource, /"WEAPON_TRAITS"/);
});

test("standalone game import cleanup cannot consume neighboring imports", async () => {
  const buildSource = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const standaloneGameTransform = buildSource.slice(
    buildSource.indexOf("const standaloneGame"),
    buildSource.indexOf("const standalone ="),
  );
  const broadImportCleanup = String.raw`^import\s*\{[\s\S]*?\}\s*from\s*`;
  const boundedImportCleanup = String.raw`^import\s*\{[^}]*\}\s*from\s*`;
  assert.ok(standaloneGameTransform);
  assert.ok(!standaloneGameTransform.includes(broadImportCleanup));
  assert.match(standaloneGameTransform, /player-weapon-hands/);
  assert.match(standaloneGameTransform, /player-adult-review/);
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const importCount = [...gameSource.matchAll(/^import\s*\{[^}]*\}\s*from\s*/gm)].length;
  assert.equal(standaloneGameTransform.split(boundedImportCleanup).length - 1, importCount);
});

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

function parseHtmlTree(source) {
  const root = { tagName: "#document", attributes: {}, children: [] };
  const stack = [root];
  for (const token of source.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>/g)) {
    const markup = token[0];
    const closing = markup.match(/^<\/\s*([\w-]+)/);
    if (closing) {
      const tagName = closing[1].toLowerCase();
      while (stack.length > 1 && stack.at(-1).tagName !== tagName) stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    const opening = markup.match(/^<\s*([\w-]+)\b([^>]*)>/);
    if (!opening) continue;
    const tagName = opening[1].toLowerCase();
    const attributes = {};
    for (const attribute of opening[2].matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    )) attributes[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
    const node = { tagName, attributes, children: [] };
    stack.at(-1).children.push(node);
    if (!markup.endsWith("/>") && !VOID_ELEMENTS.has(tagName)) stack.push(node);
  }
  return root;
}

function findElementById(node, id) {
  if (node.attributes?.id === id) return node;
  for (const child of node.children ?? []) {
    const match = findElementById(child, id);
    if (match) return match;
  }
  return undefined;
}

function collectCssRules(source, atRules = []) {
  const rules = [];
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
  let cursor = 0;
  while (cursor < clean.length) {
    const open = clean.indexOf("{", cursor);
    if (open < 0) break;
    const selector = clean.slice(cursor, open).trim();
    let depth = 1;
    let close = open + 1;
    while (close < clean.length && depth > 0) {
      if (clean[close] === "{") depth += 1;
      if (clean[close] === "}") depth -= 1;
      close += 1;
    }
    assert.equal(depth, 0, `CSS rule is not closed: ${selector}`);
    const body = clean.slice(open + 1, close - 1);
    if (selector.startsWith("@")) {
      rules.push(...collectCssRules(body, [...atRules, selector]));
    } else {
      rules.push({ selector, body, atRules });
    }
    cursor = close;
  }
  return rules;
}

function parseCssDeclarations(body) {
  return Object.fromEntries(body.split(";").flatMap((declaration) => {
    const separator = declaration.indexOf(":");
    if (separator < 0) return [];
    return [[
      declaration.slice(0, separator).trim().toLowerCase(),
      declaration.slice(separator + 1).trim().toLowerCase(),
    ]];
  }));
}

function selectorCanPositionDeveloperToolbar(selector) {
  return selector.split(",").some((part) => {
    const candidate = part.trim();
    if (!candidate || /::[\w-]+/.test(candidate)) return false;
    if (/(?:\.developer-toolbar|#developerToolbar)\b/.test(candidate)) return true;
    if (/^(?:div|\*|\[hidden\])(?:\b|\[|:|$)/.test(candidate)) return true;
    return /\.game-console\s+(?:>|\s)?\s*(?:div|\*|\[hidden\]|\.developer-toolbar|#developerToolbar)(?:\b|\[|:|$)/
      .test(candidate);
  });
}

test("对角线移动向量保持单位长度", () => {
  const movement = normalize(1, 1);
  assert.ok(Math.abs(Math.hypot(movement.x, movement.y) - 1) < 0.0001);
});

test("第三波加入奔跑僵尸，第九波加入血焰僵尸", () => {
  assert.equal(buildWave(2).includes("runner"), false);
  assert.equal(buildWave(3).includes("runner"), true);
  assert.equal(buildWave(8).includes("devil"), false);
  assert.equal(buildWave(9).includes("devil"), true);
});

test("积分与波次共同限制武器开放", () => {
  assert.deepEqual(unlockedForProgress(10000000, 10), ["pistol", "shotgun", "flamethrower"]);
  assert.deepEqual(unlockedForProgress(80000, 12), ["pistol", "shotgun", "flamethrower", "ricochet"]);
  assert.deepEqual(unlockedForProgress(79999, 12), ["pistol", "shotgun", "flamethrower"]);
});

test("击杀会增加分数、倍率和击杀数", () => {
  const game = createGameState();
  applyKill(game, "zombie");
  assert.equal(game.kills, 1);
  assert.equal(game.score, 100);
  assert.equal(game.combo, 2);
});

test("连杀积分倍率缓增并封顶，避免前期积分暴涨", () => {
  assert.deepEqual([1, 4, 5, 17, 37, 65, 150].map(scoreMultiplierForCombo), [1, 1, 2, 3, 4, 5, 6]);
  const game = createGameState();
  game.combo = 150;
  applyKill(game, "zombie");
  assert.equal(game.score, 600);
});
test("倍率超时会下降但不低于一", () => {
  const game = createGameState();
  game.combo = 4;
  game.comboTimer = 0;
  tickCombo(game, 1);
  assert.equal(game.combo, 3);
  game.combo = 1;
  tickCombo(game, 10);
  assert.equal(game.combo, 1);
});

test("设施不能重叠放置", () => {
  const game = createGameState();
  game.structures.push({ x: 500, y: 400 });
  assert.equal(canPlace(game, 500, 400), false);
  assert.equal(canPlace(game, 800, 170), true);
  assert.equal(canPlace(game, 750, 450), true);
});

test("翻滚优先使用移动方向，无移动时使用瞄准方向", () => {
  assert.deepEqual(resolveDodgeDirection(1, 1, -1, 0), normalize(1, 1));
  assert.deepEqual(resolveDodgeDirection(0, 0, -1, 0), { x: -1, y: 0 });
});

test("开始翻滚会锁定方向、动作时间、无敌帧和冷却", () => {
  const game = createGameState();
  assert.equal(startDodge(game.player, { x: 0, y: -1 }), true);
  assert.equal(game.player.dodgeX, 0);
  assert.equal(game.player.dodgeY, -1);
  assert.equal(game.player.dodgeDuration, DODGE.duration);
  assert.equal(game.player.dodgeInvulnerability, DODGE.invulnerability);
  assert.equal(game.player.dodgeCooldown, DODGE.cooldown);
});

test("长按空格产生的重复事件不会反复排队翻滚", () => {
  const player = createGameState().player;
  assert.equal(requestDodge(player, false), true);
  assert.equal(requestDodge(player, true), false);
  assert.equal(player.dodgePressed, true);
});

test("翻滚首个固定逻辑帧无敌，随后可以受伤", () => {
  const player = createGameState().player;
  startDodge(player, { x: 1, y: 0 });
  assert.equal(isPlayerInvulnerable(player), true);
  tickDodge(player, DODGE.invulnerability);
  assert.equal(isPlayerInvulnerable(player), false);
  assert.ok(player.dodgeDuration > 0);
  tickDodge(player, DODGE.duration - DODGE.invulnerability);
  assert.equal(player.dodgeDuration, 0);
});

test("翻滚冷却结束前不能再次触发", () => {
  const player = createGameState().player;
  startDodge(player, { x: 1, y: 0 });
  tickDodge(player, DODGE.duration);
  assert.equal(startDodge(player, { x: 0, y: 1 }), false);
  tickDodge(player, DODGE.cooldown - DODGE.duration + 0.001);
  assert.equal(startDodge(player, { x: 0, y: 1 }), true);
});

test("地面碰撞会把角色推出俯视障碍物", () => {
  const entity = { x: 100, y: 100 };
  resolveGroundCollision(entity, { x: 100, y: 100, rx: 40, ry: 20 }, 18);
  const dx = (entity.x - 100) / 58;
  const dy = (entity.y - 100) / 38;
  assert.ok(dx * dx + dy * dy >= 0.999);
});

test("生存战场扩大且翻滚只无敌一个固定帧", () => {
  assert.equal(WIDTH, 1600);
  assert.equal(HEIGHT, 900);
  assert.equal(DODGE.invulnerability, FIXED_STEP);
});

test("生存模式只因人物死亡结束", () => {
  const game = createGameState();
  assert.equal(isSurvivalOver(game), false);
  game.player.health = 0;
  assert.equal(isSurvivalOver(game), true);
});

test("翻滚姿态保持等比且角度连续", () => {
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const pose = getStableRollPose(progress);
    assert.equal(pose.scale, 1);
    assert.ok(Math.abs(pose.tilt) <= 0.55);
  }
  assert.equal(getStableRollPose(0).tilt, 0);
  assert.ok(Math.abs(getStableRollPose(1).tilt) < 0.000001);
});

test("特殊僵尸按波次加入", () => {
  assert.equal(buildWave(3).includes("exploder"), true);
  assert.equal(buildWave(5).includes("toxic"), true);
  assert.equal(buildWave(7).includes("brute"), true);
  assert.equal(buildWave(9).includes("devil"), true);
});

test("weapons unlock in the requested order only after both score and wave milestones", () => {
  const order = ["pistol", "shotgun", "flamethrower", "ricochet", "rocket", "laser", "lightning", "freeze", "watermelon", "turret"];
  const waves = [1, 2, 5, 12, 20, 30, 40, 50, 60, 70];
  const scores = [0, 3000, 15000, 80000, 220000, 480000, 850000, 1300000, 1850000, 2550000];
  for (let i = 1; i < order.length; i++) {
    assert.deepEqual(unlockedForProgress(scores[i], waves[i] - 1), order.slice(0, i));
    assert.deepEqual(unlockedForProgress(scores[i] - 1, waves[i]), order.slice(0, i));
    assert.deepEqual(unlockedForProgress(scores[i], waves[i]), order.slice(0, i + 1));
  }
  assert.deepEqual(unlockedForProgress(10000000, 100), order, "tank still requires the trial");
});


test("已解锁武器不会因连杀下降或下一次击杀而重新上锁", () => {
  const game = createGameState();
  game.wave = 20;
  game.score = 220000;
  game.combo = 60;
  applyKill(game, "zombie");
  assert.equal(game.unlocked.includes("rocket"), true);
  game.combo = 1;
  applyKill(game, "zombie");
  assert.equal(game.unlocked.includes("rocket"), true);
});

test("装备成长线包含三把新枪并保持批准的阈值顺序", () => {
  assert.deepEqual(
    weapons.map((weapon) => weapon.id),
    [
      "pistol", "shotgun", "flamethrower", "ricochet", "rocket", "laser",
      "lightning", "freeze", "watermelon", "turret", "tank",
    ],
  );
  assert.deepEqual(
    weapons
      .filter(({ id }) => ["lightning", "freeze", "watermelon"].includes(id))
      .map(({ id, unlockWave, scoreRequired, ammo, reserve, fireRate }) => ({
        id,
        unlockWave,
        scoreRequired,
        ammo,
        reserve,
        fireRate,
      })),
    [
      { id: "lightning", unlockWave: 40, scoreRequired: 850000, ammo: 8, reserve: 24, fireRate: 0.75 },
      { id: "freeze", unlockWave: 50, scoreRequired: 1300000, ammo: 10, reserve: 30, fireRate: 0.65 },
      { id: "watermelon", unlockWave: 60, scoreRequired: 1850000, ammo: 3, reserve: 9, fireRate: 1.1 },
    ],
  );
  const state = createGameState();
  assert.deepEqual(
    ["lightning", "freeze", "watermelon"].map((id) => [
      id,
      state.player.ammo[id],
      state.player.reserve[id],
    ]),
    [["lightning", 8, 24], ["freeze", 10, 30], ["watermelon", 3, 9]],
  );
});

test("波次数量增加且每十波加入一个首领", () => {
  assert.equal(baseZombieCount(1), 12);
  assert.equal(baseZombieCount(10), 48);
  assert.equal(buildWave(9).includes("boss"), false);
  assert.equal(buildWave(10).filter((kind) => kind === "boss").length, 1);
});

test("首领与雷电成长规则可预测", () => {
  assert.equal(bossHealthForWave(10), 2800);
  assert.equal(bossHealthForWave(20), 3350);
  assert.equal(lightningRingCount(0), 1);
  assert.equal(lightningRingCount(12), 13);
});

test("喷火枪在四百三十距离内衰减且范围外无伤害", () => {
  assert.equal(flameDamageAtDistance(0), 12);
  assert.equal(flameDamageAtDistance(160), 12);
  assert.equal(flameDamageAtDistance(430), 5);
  assert.equal(flameDamageAtDistance(431), 0);
});

test("同一首领奖励只结算一次", () => {
  const game = createGameState();
  const boss = { bossRewarded: false };
  assert.equal(rewardBossKill(game, boss), true);
  assert.equal(rewardBossKill(game, boss), false);
  assert.equal(game.bossKills, 1);
  assert.match(game.notice, /第30波启用/);
});


test("雷电爆发第30波解锁，此前不倒计时或释放电环", async () => {
  assert.equal(LIGHTNING_BURST_UNLOCK_WAVE, 30);
  assert.equal(isLightningBurstUnlocked(29), false);
  assert.equal(isLightningBurstUnlocked(30), true);
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const body = extractGameFunction(source, "updateLightning", "hurtPlayer");
  const game = createGameState();
  game.wave = 29;
  game.ultimateTimer = 0.1;
  game.pendingLightningRings = 2;
  game.lightningRings = [{ life: 0.75 }];
  const sandbox = {
    game, isLightningBurstUnlocked, lightningRingCount,
    tickLightningRingLifetime: () => false,
    ensureSound: () => () => {},
    Math, Set,
  };
  new Script(body + "\nthis.updateLightning = updateLightning;").runInNewContext(sandbox);
  sandbox.updateLightning(20);
  assert.equal(game.ultimateTimer, 20);
  assert.equal(game.pendingLightningRings, 0);
  assert.equal(game.lightningRings.length, 0);
  game.wave = 30;
  game.waveQueue = ["zombie"];
  game.bossKills = 2;
  sandbox.updateLightning(20);
  assert.equal(game.lightningRings.length, 1);
  assert.equal(game.pendingLightningRings, 2);
  assert.equal(game.ultimateTimer, 20);
  assert.match(game.notice, /雷电降临 ×3/);
});

test("每波开始重置雷电冷却但保留首领成长", () => {
  const game = createGameState();
  game.bossKills = 4;
  game.ultimateTimer = 3;
  game.pendingLightningRings = 5;
  game.lightningSpawnTimer = 0.08;
  game.lightningRings.push({ id: 1 });
  resetWaveLightning(game);
  assert.equal(game.ultimateTimer, 20);
  assert.equal(game.pendingLightningRings, 0);
  assert.equal(game.lightningSpawnTimer, 0);
  assert.deepEqual(game.lightningRings, []);
  assert.equal(game.bossKills, 4);
});


test("回血包按当前生命的百分之三十恢复并封顶", () => {
  assert.equal(healthAfterPack(40), 52);
  assert.equal(healthAfterPack(90), 100);
  assert.equal(healthAfterPack(0), 0);
  assert.equal(healthAfterPack(80, 130, 0.4), 112);
  assert.equal(healthAfterPack(120, 130, 0.8), 130);
});

test("游戏运行时将人物成长接入移动受伤拾取回血和生命封顶", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /playerModifiers\(game\.playerUpgrades\)/);
  assert.match(source, /player\.speed \* modifiers\.speedMultiplier/);
  assert.match(source, /\(pickup\.radius \+ 18\) \* modifiers\.pickupMultiplier/);
  assert.match(source, /healthAfterPack\([\s\S]*?game\.player\.maxHealth,[\s\S]*?modifiers\.healthPackRatio/);
  assert.match(source, /amount \* \(1 - modifiers\.damageReduction\)/);
  assert.match(source, /clamp\(game\.player\.health, 0, game\.player\.maxHealth\)/);
  assert.match(
    source,
    /const survival =\s*typeof tankTrialSession === "undefined" \|\| !tankTrialSession\.active/,
  );
  assert.match(source, /rollEnemyDrops\([\s\S]*?wave: game\.wave,\s*survival/);
});

test("清空第二十波后先打开一次奖励而不推进下一波", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateWaveSource = extractGameFunction(source, "updateWave", "update");
  const game = createGameState();
  game.wave = 20;
  game.waveQueue = [];
  game.enemies = [];
  const sandbox = {
    game,
    openRewardSession,
    openRewardDialog: () => true,
    tankTrialSession: { active: false },
    developerSession: { enabled: false },
    getEnemySpawnLimit: () => 14,
    spawnEnemy() {},
  };
  new Script(updateWaveSource + "\nthis.updateWave = updateWave;")
    .runInNewContext(sandbox);
  assert.equal(sandbox.updateWave(0.1), "reward");
  assert.equal(game.wave, 20);
  assert.equal(game.rewardSession.active, true);
  assert.equal(game.rewardSession.wave, 20);
  const opened = game.rewardSession;
  assert.equal(sandbox.updateWave(0.1), "reward");
  assert.equal(game.rewardSession, opened);
});

test("人物成长不带入坦克试炼且退出后完整恢复", () => {
  const normal = createGameState();
  normal.playerUpgrades.vitality = 2;
  normal.playerUpgrades.mobility = 3;
  normal.playerUpgrades.resilience = 1;
  normal.player.maxHealth = 130;
  normal.player.health = 117;
  normal.weaponUpgrades.pistol = { damage: 2 };
  const snapshot = structuredClone(normal);

  const trial = createTankTrialGame(startTankTrial(createTankTrialSession()));
  assert.deepEqual(trial.playerUpgrades, createGameState().playerUpgrades);
  assert.deepEqual(trial.weaponUpgrades, createWeaponUpgrades());
  assert.equal(trial.player.maxHealth, 100);

  const restored = restoreTankTrialGame(snapshot, false);
  assert.deepEqual(restored.playerUpgrades, normal.playerUpgrades);
  assert.deepEqual(restored.weaponUpgrades, normal.weaponUpgrades);
  assert.equal(restored.player.maxHealth, 130);
  assert.equal(restored.player.health, 117);
});


test("灰白庭院包含四根环绕柱且中央保持开阔", () => {
  assert.equal(ARENA_PILLARS.length, 4);
  const center = ARENA_PILLARS.find(
    (pillar) => pillar.x === WIDTH / 2 && pillar.y === HEIGHT / 2,
  );
  assert.equal(center, undefined);
  assert.deepEqual(
    ARENA_PILLARS.map((pillar) => [pillar.x, pillar.y]),
    [
      [430, 230],
      [1170, 230],
      [430, 670],
      [1170, 670],
    ],
  );
});


test("石板广场背景保留柱体且不恢复旧白线", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.equal(source.includes("drawArenaObstacle(context, obstacle)"), true);
  assert.equal(source.includes("drawArenaFloor(context, arenaFloorTexture, WIDTH, HEIGHT)"), true);
  assert.equal(source.includes("#aaa9a2"), false);
  assert.equal(source.includes("#b9bab2"), false);
});


test("雷电圈寿命归零后标记为过期", () => {
  const ring = { life: 0.1 };
  assert.equal(tickLightningRingLifetime(ring, 0.05), true);
  assert.equal(tickLightningRingLifetime(ring, 0.06), false);
  assert.equal(ring.life, 0);
});

test("休整阶段只暂停充能而不停止雷电圈消散", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.equal(source.includes("if (waveIsResting) return;"), false);
  assert.equal(source.includes("if (!waveIsResting) {"), true);
});

test("七类敌人分别映射到独立图集且显示参数完整", () => {
  assert.deepEqual(ENEMY_KINDS, [
    "zombie",
    "runner",
    "exploder",
    "toxic",
    "brute",
    "devil",
    "boss",
  ]);
  assert.deepEqual(
    ENEMY_KINDS.map((kind) => resolveEnemyVisual(kind).src),
    [
      "/zombie-atlas.webp",
      "/runner-atlas.webp",
      "/exploder-atlas.webp",
      "/toxic-atlas.webp",
      "/brute-atlas.webp",
      "/devil-atlas.webp",
      "/boss-atlas.webp",
    ],
  );
  for (const kind of ENEMY_KINDS) {
    const visual = ENEMY_VISUALS[kind];
    assert.ok(visual.drawWidth > 0);
    assert.ok(visual.drawHeight > 0);
    assert.ok(visual.anchorX >= 0);
    assert.ok(visual.anchorY >= 0);
  }
  assert.throws(() => resolveEnemyVisual("unknown"), /未知敌人视觉类型/);
  assert.throws(() => resolveEnemyVisual("__proto__"), /未知敌人视觉类型/);
});

test("敌人固定第零行并按动作切换列", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawEnemySpriteSource = source.match(
    /function drawEnemySprite[\s\S]*?\r?\n}\r?\n\r?\nfunction drawEnemyDeathSprite/,
  )?.[0];
  assert.ok(drawEnemySpriteSource);
  assert.equal(ENEMY_RENDER_ROW, 0);
  assert.equal(resolveZombieSourceRect("walk", 0, 0).x, 0);
  assert.equal(resolveZombieSourceRect("walk", 0.1, 0).x, 128);
  assert.equal(resolveZombieSourceRect("attack", 1 / 12, 0).x, 7 * 128);
  assert.equal(resolveZombieSourceRect("hurt", 1 / 15, 0).x, 11 * 128);
  assert.equal(resolveZombieSourceRect("death", 10, 0).x, 14 * 128);
  assert.equal(resolveZombieSourceRect("death", 10, 0).y, 0);
  assert.match(source, /const rect = resolveZombieSourceRect/);
  assert.doesNotMatch(drawEnemySpriteSource, /facing[XY]/);
  assert.match(drawEnemySpriteSource, /if \(entity.kind === "boss" && entity.bossCombat/);
  const ordinarySprite = drawEnemySpriteSource.replace(/  if \(entity.kind === "boss" && entity.bossCombat[^]*?\n  }/, "");
  assert.doesNotMatch(ordinarySprite, /context\.rotate/);
});

test("强化击杀按批准倍率增加分数", () => {
  const game = createGameState();
  applyKill(game, "runner", 1, 2);
  assert.equal(game.kills, 1);
  assert.equal(game.score, enemyStats.runner.score * 2);
  assert.equal(game.combo, 2);
});

test("敌人动作图集定义四组连续帧", () => {
  assert.deepEqual(ZOMBIE_ATLAS, {
    width: 1920,
    height: 1024,
    frameSize: 128,
    directions: 8,
  });
  assert.deepEqual(ZOMBIE_ACTIONS.walk, {
    start: 0,
    frames: 6,
    fps: 10,
    loop: true,
  });
  assert.deepEqual(ZOMBIE_ACTIONS.attack, {
    start: 6,
    frames: 4,
    fps: 12,
    loop: false,
  });
  assert.deepEqual(ZOMBIE_ACTIONS.hurt, {
    start: 10,
    frames: 2,
    fps: 15,
    loop: false,
  });
  assert.deepEqual(ZOMBIE_ACTIONS.death, {
    start: 12,
    frames: 3,
    fps: 10,
    loop: false,
  });
});

test("图集清理脚本覆盖十五个动作帧、八行复制和可选源目录", async () => {
  const source = await readFile(new URL("../scripts/stabilize-walk-atlases.mjs", import.meta.url), "utf8");
  for (const kind of ENEMY_KINDS) assert.match(source, new RegExp(`${kind}-atlas\\.webp`));
  assert.match(source, /ACTION_GROUPS/);
  assert.match(source, /cleanActionSequence/);
  assert.match(source, /--source-dir/);
  assert.match(source, /for \(let column = 0; column < 15; column \+= 1\)/);
  assert.match(source, /argv\.includes\("--check"\)/);
  assert.match(source, /for \(let row = 0; row < 8; row \+= 1\)/);
  assert.match(source, /validateActionAtlas/);
});

test("合成图集构建真实覆盖十五列并把每帧复制到八行", () => {
  const atlasWidth = 1920;
  const atlasHeight = 1024;
  const frameSize = 128;
  const source = Buffer.alloc(atlasWidth * atlasHeight * 4);
  for (let column = 0; column < 15; column += 1) {
    const bodyWidth = 30 + (column % 3);
    const bodyHeight = column >= 12 ? 24 + (column % 3) : 64 + (column % 2);
    const startX = column * frameSize + 48 + (column % 2);
    const startY = 28;
    for (let y = startY; y < startY + bodyHeight; y += 1) {
      for (let x = startX; x < startX + bodyWidth; x += 1) {
        const offset = (y * atlasWidth + x) * 4;
        source.set([80 + column, 100, 70, 255], offset);
      }
    }
  }

  const built = buildActionAtlas(source);
  assert.equal(built.reports.length, 4);
  assert.doesNotThrow(() => validateActionAtlas(built.output, "synthetic"));

  const frameAt = (row, column) => {
    const frame = Buffer.alloc(frameSize * frameSize * 4);
    for (let y = 0; y < frameSize; y += 1) {
      const start = (((row * frameSize + y) * atlasWidth) + column * frameSize) * 4;
      built.output.copy(frame, y * frameSize * 4, start, start + frameSize * 4);
    }
    return frame;
  };
  for (let column = 0; column < 15; column += 1) {
    const expected = frameAt(0, column);
    assert.ok(expected.some((value) => value !== 0), `第 ${column} 列应包含动作帧`);
    for (let row = 1; row < 8; row += 1) {
      assert.ok(frameAt(row, column).equals(expected), `第 ${column} 列第 ${row} 行应复制第零行`);
    }
  }
});

test("图集只检查模式始终不修改七张正式图集", async () => {
  const atlasUrls = ENEMY_KINDS.map((kind) => new URL(`../public/${kind}-atlas.webp`, import.meta.url));
  const hashes = async () => Promise.all(atlasUrls.map(async (url) =>
    createHash("sha256").update(await readFile(url)).digest("hex")));
  const before = await hashes();
  const result = spawnSync(process.execPath, ["scripts/stabilize-walk-atlases.mjs", "--check"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    assert.match(
      `${result.stderr}${result.stdout}`,
      /可见姿势不足|主体触碰帧格边缘|受击姿势必须保持竖立|重复使用 hurt/,
    );
  }
  assert.deepEqual(await hashes(), before);
});

test("图集检查模式拒绝混用源目录", () => {
  const result = spawnSync(process.execPath, [
    "scripts/stabilize-walk-atlases.mjs",
    "--check",
    "--source-dir",
    "tmp/walk-atlas-backups",
  ], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /--check 不能与 --source-dir 同时使用/);
});

test("图集事务复制失败时回滚所有已尝试的正式图集", async () => {
  const jobs = [
    { atlas: "atlas-a", output: "output-a", transactionBackup: "backup-a" },
    { atlas: "atlas-b", output: "output-b", transactionBackup: "backup-b" },
  ];
  const files = new Map([
    ["atlas-a", "old-a"], ["atlas-b", "old-b"],
    ["output-a", "new-a"], ["output-b", "new-b"],
    ["backup-a", "old-a"], ["backup-b", "old-b"],
  ]);
  const copied = [];
  const copy = async (source, target) => {
    copied.push([source, target]);
    if (source === "output-b") throw new Error("copy failed");
    files.set(target, files.get(source));
  };
  await assert.rejects(() => commitAtlasJobs(jobs, { copy, remove: async () => {} }), /copy failed/);
  assert.equal(files.get("atlas-a"), "old-a");
  assert.equal(files.get("atlas-b"), "old-b");
  assert.deepEqual(copied.slice(-2), [
    ["backup-b", "atlas-b"],
    ["backup-a", "atlas-a"],
  ]);
});

test("图集事务成功后清理失败只报告警告而不回滚", async () => {
  const jobs = [
    { atlas: "atlas-a", output: "output-a", transactionBackup: "backup-a" },
  ];
  const files = new Map([
    ["atlas-a", "old-a"], ["output-a", "new-a"], ["backup-a", "old-a"],
  ]);
  const result = await commitAtlasJobs(jobs, {
    copy: async (source, target) => files.set(target, files.get(source)),
    remove: async () => { throw new Error("locked output"); },
  });
  assert.equal(files.get("atlas-a"), "new-a");
  assert.equal(result.cleanupErrors.length, 1);
  assert.match(result.cleanupErrors[0].error.message, /locked output/);
});

test("构建脚本托管并内嵌全部七类敌人图集", async () => {
  const source = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const routes = [
    "/zombie-atlas.webp",
    "/runner-atlas.webp",
    "/exploder-atlas.webp",
    "/toxic-atlas.webp",
    "/brute-atlas.webp",
    "/devil-atlas.webp",
    "/boss-atlas.webp",
  ];
  const playerRigRoutes = [
    "/training-dummy.js",
    "/training/scarecrow.png",
    "/arena-background.js",
    "/backgrounds/city-plaza.png",
    "/tank-visual.js",
    "/structures/tank-cold-steel.png",
    "/turret-visual.js",
    "/structures/auto-turret.png",
    "/player-upright-review.js",
    "/player-rig/adult-review-body.png",
    "/player-rig/adult-side-review-body.png",
    "/player-adult-review.js",
    "/player-rig/adult-topdown-review-body.png",
    "/player-rig/adult-pistol-held-review.png",
    "/player-front-preview.js",
    "/player-rig/maria-body.png",
    "/player-rig/far-upper-arm.png",
    "/player-rig/far-forearm-hand.png",
    "/player-rig/near-upper-arm.png",
    "/player-rig/near-forearm-hand.png",
  ];
  const playerWeaponHandRoutes = [
    "/player-weapon-hands.js",
    ...[
      "pistol",
      "shotgun",
      "rocket",
      "flamethrower",
      "laser",
      "ricochet",
      "lightning",
      "freeze",
      "watermelon",
    ].flatMap((weaponId) =>
      ["far", "near"].map(
        (side) =>
          `/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`,
      ),
    ),
  ];
  const styleReviewRoutes = [
    "/player-style-review.html",
    "/player-style-review.css",
    "/player-style-review.js",
    "/player-style-rigs.js",
    ...["a", "b", "c"].flatMap((styleId) =>
      [
        "body",
        "far-upper-arm",
        "far-forearm-hand",
        "near-upper-arm",
        "near-forearm-hand",
      ].map(
        (layer) =>
          "/player-style-review/" + styleId + "/" + layer + ".png",
      ),
    ),
  ];
  for (const route of routes) assert.equal(source.includes(route), true);
  assert.match(source, /enemyAtlasAssets\.map/);
  assert.match(source, /standaloneAnimation = standaloneAnimation\.replaceAll/);
  assert.match(source, /data:image\/webp;base64/);
  assert.match(source, /entry\.type\.startsWith\("image\/"\)/);
  assert.doesNotMatch(source, /\bzombieAtlas\.src\b/);
  const devServer = await readFile(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8");
  assert.match(devServer, /"\.webp": "image\/webp"/);
  assert.match(devServer, /\["\.png", "\.webp"\]\.includes\(extension\)/);
  const tankTrialSource = await readFile(
    new URL("../src/tank-trial.js", import.meta.url),
  );
  const toxicTrailSource = await readFile(
    new URL("../src/toxic-gas-trail.js", import.meta.url),
  );
  const randomWaveEnhancementSource = await readFile(
    new URL("../src/random-wave-enhancements.js", import.meta.url),
  );
  const spikeTrapSource = await readFile(
    new URL("../src/spike-traps.js", import.meta.url),
  );
  const weaponEffectsSource = await readFile(
    new URL("../src/weapon-effects.js", import.meta.url),
  );
  const weaponTraitsSource = await readFile(
    new URL("../src/weapon-traits.js", import.meta.url),
    "utf8",
  );
  const tankTrialImage = await readFile(
    new URL("../public/tank-trial-fragments.png", import.meta.url),
  );

  const build = spawnSync(process.execPath, ["scripts/build.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  const [standalone, worker] = await Promise.all([
    readFile(new URL("../dist/standalone.html", import.meta.url), "utf8"),
    readFile(workerUrl, "utf8"),
  ]);
  const occurrences = (contents, marker) => contents.split(marker).length - 1;
  assert.equal(occurrences(standalone, "data:image/webp;base64,"), 7);
  assert.equal(occurrences(standalone, "data:image/png;base64,"), 58);
  assert.equal(occurrences(worker, "/ammo-crate.png"), 1);
  assert.equal(occurrences(worker, "/shield-pickup.png"), 1);
  assert.equal(standalone.includes('"/shield-pickup.png"'), false);
  assert.equal(standalone.includes('"/ammo-crate.png"'), false);
  for (const route of routes) {
    assert.equal(occurrences(worker, route), 1);
    assert.equal(standalone.includes(route), false);
  }
  assert.equal(occurrences(worker, "/player-arm-rig.js"), 1);
  for (const route of playerRigRoutes) {
    assert.equal(occurrences(worker, route), 1);
    assert.equal(standalone.includes(route), false);
  }
  for (const route of playerWeaponHandRoutes) {
    assert.equal(occurrences(worker, route), 1);
    assert.equal(standalone.includes(route), false);
  }
  for (const route of styleReviewRoutes) {
    assert.equal(occurrences(worker, route), 1);
    assert.equal(standalone.includes(route), false);
  }
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)player-arm-rig\.js["']/,
  );
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)player-weapon-hands\.js["']/,
  );
  assert.doesNotMatch(
    standalone,
    /from\s+"\/(?:game-core|zombie-animation)\.js"/,
  );
  assert.equal(occurrences(worker, "/developer-mode.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)developer-mode\.js["']/,
  );
  assert.equal(occurrences(worker, "/supply-drops.js"), 1);
  assert.doesNotMatch(standalone, /from "\/supply-drops\.js"/);
  assert.equal(occurrences(standalone, "function rollEnemyDrops("), 1);
  assert.equal(occurrences(standalone, "function resolveAmmoPickup("), 1);
  assert.equal(occurrences(worker, "/reward-progression.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)reward-progression\.js["']/,
  );
  assert.equal(occurrences(standalone, "function playerModifiers("), 1);
  assert.equal(occurrences(worker, "/weapon-traits.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)weapon-traits\.js["']/,
  );
  assert.equal(occurrences(standalone, "function createWeaponUpgrades("), 1);
  assert.match(weaponTraitsSource, /export const WEAPON_TRAITS/);
  assert.equal(occurrences(worker, "/weapon-effects.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)weapon-effects\.js["']/,
  );
  assert.equal(occurrences(standalone, "function buildLightningChain("), 1);
  assert.equal(occurrences(worker, "/toxic-gas-trail.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)toxic-gas-trail\.js["']/,
  );
  assert.equal(occurrences(standalone, "function advanceToxicGasTrail("), 1);
  assert.equal(occurrences(worker, "/random-wave-enhancements.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)random-wave-enhancements\.js["']/,
  );
  assert.equal(
    occurrences(standalone, "function buildWaveEnhancements("),
    1,
  );
  workerUrl.searchParams.set("cacheBust", String(Date.now()));
  const workerModule = await import(workerUrl.href);
  const response = await workerModule.default.fetch(
    new Request("https://local.test/supply-drops.js"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    await readFile(new URL("../src/supply-drops.js", import.meta.url)),
  );
  assert.equal(response.headers.get("content-type"), "text/javascript; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const toxicTrailResponse = await workerModule.default.fetch(
    new Request("https://local.test/toxic-gas-trail.js"),
  );
  assert.equal(toxicTrailResponse.status, 200);
  assert.equal(
    toxicTrailResponse.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assert.equal(
    toxicTrailResponse.headers.get("cache-control"),
    "public, max-age=300",
  );
  assert.equal(toxicTrailResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await toxicTrailResponse.arrayBuffer()),
    toxicTrailSource,
  );
  const randomWaveResponse = await workerModule.default.fetch(
    new Request("https://local.test/random-wave-enhancements.js"),
  );
  assert.equal(randomWaveResponse.status, 200);
  assert.equal(
    randomWaveResponse.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assert.deepEqual(
    Buffer.from(await randomWaveResponse.arrayBuffer()),
    randomWaveEnhancementSource,
  );
  const weaponEffectsResponse = await workerModule.default.fetch(
    new Request("https://local.test/weapon-effects.js"),
  );
  assert.equal(weaponEffectsResponse.status, 200);
  assert.equal(
    weaponEffectsResponse.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assert.equal(
    weaponEffectsResponse.headers.get("cache-control"),
    "public, max-age=300",
  );
  assert.deepEqual(
    Buffer.from(await weaponEffectsResponse.arrayBuffer()),
    weaponEffectsSource,
  );
  assert.equal(occurrences(worker, "/spike-traps.js"), 1);
  assert.doesNotMatch(
    standalone,
    /from\s+["'](?:\.\/|\/)spike-traps\.js["']/,
  );
  assert.equal(occurrences(standalone, "function createSpikeTraps("), 1);
  const spikeTrapResponse = await workerModule.default.fetch(
    new Request("https://local.test/spike-traps.js"),
  );
  assert.equal(spikeTrapResponse.status, 200);
  assert.deepEqual(
    Buffer.from(await spikeTrapResponse.arrayBuffer()),
    spikeTrapSource,
  );
  const trialModuleResponse = await workerModule.default.fetch(
    new Request("https://local.test/tank-trial.js"),
  );
  assert.equal(trialModuleResponse.status, 200);
  assert.equal(
    trialModuleResponse.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );
  assert.equal(trialModuleResponse.headers.get("cache-control"), "public, max-age=300");
  assert.equal(trialModuleResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await trialModuleResponse.arrayBuffer()),
    tankTrialSource,
  );
  const trialImageResponse = await workerModule.default.fetch(
    new Request("https://local.test/tank-trial-fragments.png"),
  );
  assert.equal(trialImageResponse.status, 200);
  assert.equal(trialImageResponse.headers.get("content-type"), "image/png");
  assert.equal(
    trialImageResponse.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(trialImageResponse.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    Buffer.from(await trialImageResponse.arrayBuffer()),
    tankTrialImage,
  );
  assert.doesNotMatch(standalone, /from\s+["'](?:\.\/|\/)tank-trial\.js["']/);
  assert.equal(standalone.includes('src="/tank-trial-fragments.png"'), false);
  const trialDataUri =
    "data:image/png;base64," + tankTrialImage.toString("base64");
  assert.equal(occurrences(standalone, trialDataUri), 12);
  assert.equal(occurrences(standalone, "function createTankTrialSession"), 1);
  for (const marker of [
    "function buildDeveloperWave",
    "function applyDeveloperWave",
    "function hasUsableAmmo",
  ]) assert.equal(occurrences(standalone, marker), 1);
  const lintSource = await readFile(
    new URL("../scripts/lint.mjs", import.meta.url),
    "utf8",
  );
  assert.match(lintSource, /src\/random-wave-enhancements\.js/);
  const inlineScript = standalone.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Script(inlineScript));
});

test("受击动作优先于攻击动作", () => {
  assert.equal(resolveZombieAction({ hitFlash: 0.01, attackAnimation: 0.2 }), "hurt");
  assert.equal(resolveZombieAction({ hitFlash: 0, attackAnimation: 0.2 }), "attack");
  assert.equal(resolveZombieAction({ hitFlash: 0, attackAnimation: 0 }), "walk");
});

test("死亡视觉按固定寿命推进并清理", () => {
  const deaths = [{ elapsed: 0, maxLife: 0.3 }];
  assert.equal(advanceZombieDeaths(deaths, 0.2).length, 1);
  assert.equal(deaths[0].elapsed, 0.2);
  assert.equal(advanceZombieDeaths(deaths, 0.11).length, 0);
});

test("新游戏状态包含独立的普通丧尸死亡视觉列表", () => {
  const first = createGameState();
  const second = createGameState();
  assert.deepEqual(first.enemyDeathAnimations, []);
  assert.notEqual(first.enemyDeathAnimations, second.enemyDeathAnimations);
  first.enemyDeathAnimations.push({ elapsed: 0, maxLife: 0.3 });
  assert.deepEqual(second.enemyDeathAnimations, []);
});

test("游戏把七类敌人统一接入独立图集且没有旧绘制回退", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /const enemyAtlases = new Map\(\)/);
  assert.match(source, /naturalWidth !== ZOMBIE_ATLAS\.width/);
  assert.match(source, /naturalHeight !== ZOMBIE_ATLAS\.height/);
  assert.match(source, /const atlas = enemyAtlases\.get\(baseKind\)/);
  assert.match(source, /resolveEnemyVisual\(baseKind\)/);
  assert.doesNotMatch(source, /facing[XY]/);
  assert.match(source, /hurtAnimation: 0/);
  assert.match(source, /enemy\.animationTime \+= dt/);
  assert.match(source, /enemy\.attackAnimation = Math\.max/);
  assert.match(source, /enemy\.hurtAnimation = Math\.max/);
  assert.match(source, /triggerEnemyAttack\(enemy\)/);
  assert.match(source, /triggerEnemyHurt\(enemy,/);
  assert.match(source, /hurtAnimation = ZOMBIE_ACTIONS\.hurt[\s\S]*animationTime = 0/);
  assert.match(source, /enemy\.kind === "exploder" && targetDistance < 62[\s\S]*triggerEnemyAttack\(enemy\)/);
  assert.match(source, /const attackLead = enemy\.kind === "exploder"/);
  assert.match(source, /drawEnemyDeathSprite\(death\)/);
  assert.match(source, /game\.enemyDeathAnimations\.push/);
  assert.match(source, /kind: enemy\.kind/);
  assert.match(source, /advanceZombieDeaths\(game\.enemyDeathAnimations, dt\)/);
  assert.match(source, /function drawEnemySprite/);
  assert.doesNotMatch(source, /zombieAtlasReady/);
  assert.doesNotMatch(source, /\bzombieAtlas\b/);
  assert.doesNotMatch(source, /function drawProgrammaticEnemy/);
  assert.doesNotMatch(source, /drawProgrammaticEnemy\(enemy\)/);
  assert.match(source, /\.\.\.game\.enemyDeathAnimations\.map/);
  assert.match(source, /drawEnemyDeathSprite\(death\)/);
});

test("敌人图集使用固定锚点且运行时没有行走浮动", async () => {
  const animation = await readFile(new URL("../src/zombie-animation.js", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawEnemySpriteSource = source.match(
    /function drawEnemySprite[\s\S]*?\r?\n}\r?\n\r?\nfunction drawEnemyDeathSprite/,
  )?.[0];
  assert.ok(drawEnemySpriteSource);
  assert.doesNotMatch(animation, /WALK_TRANSFORMS/);
  assert.doesNotMatch(animation, /resolveWalkTransform/);
  assert.doesNotMatch(drawEnemySpriteSource, /walkTransform/);
  const ordinarySprite = drawEnemySpriteSource.replace(/  if \(entity.kind === "boss" && entity.bossCombat[^]*?\n  }/, "");
  assert.doesNotMatch(ordinarySprite, /context\.scale/);
  assert.match(drawEnemySpriteSource, /context\.translate\(entity\.x, entity\.y\)/);
  assert.match(
    drawEnemySpriteSource,
    /-visual\.anchorX,[\s\S]*-visual\.anchorY,[\s\S]*visual\.drawWidth,[\s\S]*visual\.drawHeight/,
  );
});

test("七张敌人图集全部就绪前禁止开始且失败时不回退", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(html, /id="atlasStatus"/);
  assert.match(source, /Promise\.all\(/);
  assert.match(source, /ENEMY_KINDS\.map/);
  assert.match(source, /startButton\.disabled = true/);
  assert.match(source, /startButton\.disabled = false/);
  assert.match(source, /"素材加载失败：" \+ error\.message/);
  assert.doesNotMatch(source, /素材加载失败，请刷新重试/);
  assert.doesNotMatch(source, /已使用旧外观/);
  assert.doesNotMatch(source, /warnZombieAtlas/);
});

test("标题页提供开发者开关和完整顶部调试条", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  for (const marker of [
    'id="developerModeToggle"',
    'id="developerToolbar"',
    'id="developerTotalCount"',
    'id="developerConcurrentLimit"',
    'id="developerWave"',
    'id="developerWeapon"',
    'id="developerInfiniteAmmo"',
    'id="applyDeveloperSettings"',
    'id="openDeveloperReward"',
    'id="developerStatus"',
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /id="developerToolbar"[^>]*hidden/);
  assert.match(html, /<label[^>]*>[\s\S]*开发者模式[\s\S]*developerModeToggle/);

  const document = parseHtmlTree(html);
  const gameConsole = findElementById(document, "developerToolbar");
  const screenFrame = document.children
    .flatMap(function descendants(node) {
      return [node, ...(node.children ?? []).flatMap(descendants)];
    })
    .find((node) => node.attributes?.class?.split(/\s+/).includes("screen-frame"));
  assert.ok(gameConsole);
  assert.ok(screenFrame);
  const consoleParent = document.children
    .flatMap(function descendants(node) {
      return [node, ...(node.children ?? []).flatMap(descendants)];
    })
    .find((node) => node.children?.includes(gameConsole));
  assert.ok(consoleParent?.attributes.class?.split(/\s+/).includes("game-console"));
  assert.equal(consoleParent.children.includes(screenFrame), true);
  assert.ok(consoleParent.children.indexOf(gameConsole) < consoleParent.children.indexOf(screenFrame));
});

test("开发者工具条沿用紧凑钟塔视觉且不覆盖画布", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const rules = collectCssRules(css);
  const toolbarRules = rules.filter(({ selector }) =>
    /(?:\.developer-toolbar|#developerToolbar)\b/.test(selector));
  const baseRule = toolbarRules.find(({ selector, atRules }) =>
    selector.trim() === ".developer-toolbar" && atRules.length === 0);
  assert.ok(baseRule);
  const base = parseCssDeclarations(baseRule.body);
  assert.equal(base.display, "flex");
  assert.equal(base["flex-wrap"], "wrap");
  assert.equal(base.width, "100%");
  assert.equal(base["max-width"], "100%");
  assert.notEqual(base.position, "absolute");
  assert.notEqual(base.position, "fixed");
  const universalRule = rules.find(({ selector, atRules }) =>
    selector.trim() === "*" && atRules.length === 0);
  assert.equal(parseCssDeclarations(universalRule?.body ?? "")["box-sizing"], "border-box");
  assert.match(css, /\.developer-toggle\s*\{/);
  for (const rule of rules.filter(({ selector }) =>
    selectorCanPositionDeveloperToolbar(selector))) {
    assert.doesNotMatch(rule.body, /\bposition\s*:\s*(?:fixed|absolute)\b/);
  }
  const mobileRules = rules.filter(({ atRules }) =>
    atRules.some((rule) => /^@media\s*\(max-width:\s*760px\)/.test(rule)));
  const mobileDeclarations = (selector) => parseCssDeclarations(
    mobileRules.find((rule) => rule.selector.split(",").map((part) => part.trim())
      .includes(selector))?.body ?? "",
  );
  assert.equal(mobileDeclarations(".developer-toolbar").width, "100%");
  assert.match(mobileDeclarations(".developer-toolbar label:not(.developer-check)").flex, /^1 1 /);
  assert.equal(mobileDeclarations('.developer-toolbar input[type="number"]').width, "100%");
  assert.equal(mobileDeclarations(".developer-toolbar select").width, "100%");
  assert.equal(mobileDeclarations(".developer-toolbar button").width, "100%");
  const hiddenRule = toolbarRules.find(({ selector, atRules }) =>
    selector.trim() === ".developer-toolbar[hidden]" && atRules.length === 0);
  assert.equal(parseCssDeclarations(hiddenRule?.body ?? "").display, "none");
  assert.ok(rules.some(({ selector }) =>
    selector.includes(".developer-toolbar button:hover")));
  assert.ok(rules.some(({ selector }) =>
    selector.includes(".developer-toolbar button:active")));
});

test("构建与 lint 托管开发者模式模块", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const lint = await readFile(new URL("../scripts/lint.mjs", import.meta.url), "utf8");
  assert.match(build, /"\/developer-mode\.js", "src\/developer-mode\.js"/);
  assert.match(build, /developerSource/);
  assert.match(lint, /src\/developer-mode\.js/);
});

test("developer runtime manages each run, atomic apply, and spawn cap", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const extract = (start, end) => source.match(
    new RegExp(`function ${start}\\([\\s\\S]*?\\r?\\n}\\r?\\n\\r?\\nfunction ${end}`),
  )?.[0] ?? "";
  const resetGameSource = extract("resetGame", "returnToTitle");
  const returnToTitleSource = extract("returnToTitle", "togglePause");
  const applySource = extract("applyDeveloperControls", "normalizeDeveloperControl");
  const updateWaveSource = extract("updateWave", "update");
  const finishGameSource = extract("finishGame", "updateHud");

  assert.match(source, /let developerSession = createDeveloperSession\(false\)/);
  assert.match(resetGameSource, /createDeveloperSession\(developerModeToggle\.checked\)/);
  assert.match(resetGameSource, /unlockDeveloperWeapons\(game\)/);
  assert.match(resetGameSource, /developerToolbar\.hidden = !developerSession\.enabled/);
  assert.match(source, /function createNextDeveloperSession/);
  assert.match(source, /function openDeveloperRewardFromToolbar/);
  assert.match(source, /canOpenDeveloperReward\(/);
  assert.match(source, /openRewardSession\(game\.rewardSession, game\.wave\)/);
  assert.match(source, /openDeveloperReward\.addEventListener\("click", openDeveloperRewardFromToolbar\)/);
  assert.match(source, /normalizeDeveloperInteger/);
  assert.match(applySource, /try \{/);
  assert.match(applySource, /nextSession = createNextDeveloperSession\(\)/);
  assert.match(applySource, /applyDeveloperWave\(game, nextSession, Math\.random/);
  assert.match(applySource, /developerSession = nextSession/);
  assert.match(applySource, /developerStatus\.textContent/);
  assert.match(updateWaveSource, /getEnemySpawnLimit\(game, developerSession\)/);
  assert.doesNotMatch(updateWaveSource, /enemies\.length < 14 \+ game\.wave \* 2/);
  assert.match(updateWaveSource, /developerSession\.targetWave = game\.wave/);
  assert.match(updateWaveSource, /developerSession\.totalCount = game\.waveQueue\.length/);
  assert.match(returnToTitleSource, /developerToolbar\.hidden = true/);
  assert.match(finishGameSource, /developerToolbar\.hidden = true/);
  assert.doesNotMatch(source, /localStorage\.(?:getItem|setItem)\([^)]*developer/i);
});

test("boss runner summons only respect the developer spawn limit", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = source.match(
    /function spawnBossRunners[\s\S]*?\r?\n}\r?\n\r?\nfunction updateEnemies/,
  )?.[0].replace(/\r?\n\r?\nfunction updateEnemies$/, "");
  assert.ok(functionSource);

  const run = (game, session, requested) => {
    const spawnBossRunners = new Script(`(${functionSource})`).runInNewContext({
      game,
      developerSession: session,
      getEnemySpawnLimit: (state, activeSession) =>
        activeSession.enabled ? activeSession.concurrentLimit : 14 + state.wave * 2,
      spawnEnemy: (kind) => game.enemies.push({ kind }),
    });
    spawnBossRunners(requested);
  };

  const developerGame = { wave: 10, enemies: Array.from({ length: 17 }, () => ({})) };
  run(developerGame, { enabled: true, concurrentLimit: 18 }, 8);
  assert.equal(developerGame.enemies.length, 18);
  assert.equal(developerGame.enemies.at(-1).kind, "runner");

  const normalGame = { wave: 2, enemies: Array.from({ length: 17 }, () => ({})) };
  run(normalGame, { enabled: false, concurrentLimit: 1 }, 8);
  assert.equal(normalGame.enemies.length, 25);

  const fullDeveloperGame = { wave: 10, enemies: Array.from({ length: 18 }, () => ({})) };
  run(fullDeveloperGame, { enabled: true, concurrentLimit: 18 }, 8);
  assert.equal(fullDeveloperGame.enemies.length, 18);
});

test("developer weapon selection rejects unknown option values", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = source.match(
    /function selectDeveloperWeapon[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  assert.ok(functionSource);
  const selectDeveloperWeapon = new Script(`(${functionSource})`).runInNewContext({
    weapons: [{ id: "pistol" }, { id: "rocket" }],
    cancelReload: (player) => {
      player.reload = 0;
      player.reloadWeapon = null;
    },
    cancelWatermelonCharge: () => {},
  });
  const game = { player: { weapon: "pistol" } };
  const session = { weapon: "pistol" };

  assert.equal(selectDeveloperWeapon(game, session, "invalid"), false);
  assert.equal(game.player.weapon, "pistol");
  assert.equal(session.weapon, "pistol");
  assert.equal(selectDeveloperWeapon(game, session, "rocket"), true);
  assert.equal(game.player.weapon, "rocket");
  assert.equal(session.weapon, "rocket");
});

test("developer apply keeps core commit atomic and does not misreport UI refresh errors", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const nextSource = source.match(
    /function createNextDeveloperSession[\s\S]*?\r?\n}\r?\n\r?\nfunction applyDeveloperControls/,
  )?.[0].replace(/\r?\n\r?\nfunction applyDeveloperControls$/, "");
  const applySource = source.match(
    /function applyDeveloperControls[\s\S]*?\r?\n}\r?\n\r?\nfunction normalizeDeveloperControl/,
  )?.[0].replace(/\r?\n\r?\nfunction normalizeDeveloperControl$/, "");
  assert.ok(nextSource);
  assert.ok(applySource);

  const execute = ({ controls, refreshThrows = false }) => {
    const originalSession = {
      enabled: true,
      totalCount: 12,
      concurrentLimit: 16,
      targetWave: 1,
      weapon: "pistol",
      infiniteAmmo: false,
    };
    const game = { wave: 1, applied: false };
    const status = { textContent: "" };
    const context = {
      game,
      developerSession: originalSession,
      developerTotalCount: controls.totalCount,
      developerConcurrentLimit: controls.concurrentLimit,
      developerWave: controls.targetWave,
      DEVELOPER_LIMITS: {
        totalCount: { min: 1, max: 500 },
        concurrentLimit: { min: 1, max: 100 },
        targetWave: { min: 1, max: 999 },
      },
      normalizeDeveloperInteger: (value, fallback, limits) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(limits.min, Math.min(limits.max, Math.round(number)));
      },
      applyDeveloperWave: (state, next) => {
        state.wave = next.targetWave;
        state.applied = true;
      },
      Math,
      WIDTH: 1600,
      HEIGHT: 900,
      staticObstacles: [],
      developerStatus: status,
      syncDeveloperControls: () => {
        if (refreshThrows) throw new Error("refresh failed");
      },
      updateHud: () => {},
      console: { error: () => {} },
    };
    context.createNextDeveloperSession =
      new Script(`(${nextSource})`).runInNewContext(context);
    const apply = new Script(`(${applySource})`).runInNewContext(context);
    apply();
    return { context, game, status, originalSession };
  };

  const throwingControl = {};
  Object.defineProperty(throwingControl, "value", {
    get() {
      throw new Error("getter failed");
    },
  });
  const failed = execute({
    controls: {
      totalCount: throwingControl,
      concurrentLimit: { value: "6" },
      targetWave: { value: "3" },
    },
  });
  assert.equal(failed.game.applied, false);
  assert.equal(failed.context.developerSession, failed.originalSession);
  assert.match(failed.status.textContent, /应用失败/);

  const committed = execute({
    controls: {
      totalCount: { value: "20" },
      concurrentLimit: { value: "6" },
      targetWave: { value: "3" },
    },
    refreshThrows: true,
  });
  assert.equal(committed.game.applied, true);
  assert.equal(committed.context.developerSession.targetWave, 3);
  assert.match(committed.status.textContent, /已应用/);
  assert.doesNotMatch(committed.status.textContent, /失败/);
});

test("developer toolbar keyboard targets do not trigger game shortcuts", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const interactiveSource = source.match(
    /function isInteractiveTarget[\s\S]*?\r?\n}\r?\n\r?\nfunction handleGameKeyDown/,
  )?.[0].replace(/\r?\n\r?\nfunction handleGameKeyDown$/, "");
  const handlerSource = source.match(
    /function handleGameKeyDown[\s\S]*?\r?\n}\r?\n\r?\nwindow\.addEventListener\("keydown"/,
  )?.[0].replace(/\r?\n\r?\nwindow\.addEventListener\("keydown"$/, "");
  assert.ok(interactiveSource);
  assert.ok(handlerSource);

  const keys = new Set();
  const switched = [];
  const dodges = [];
  const context = {
    keys,
    game: { mode: "playing", player: {} },
    rewardDialog: { hidden: true },
    handleRewardKeyDown: () => {},
    tankTrialDialog: { hidden: true },
    declineTankTrialDialog: () => {},
    switchWeapon: (slot) => switched.push(slot),
    beginReload: () => {},
    requestDodge: (...args) => dodges.push(args),
  };
  context.isInteractiveTarget =
    new Script(`(${interactiveSource})`).runInNewContext(context);
  const handleGameKeyDown =
    new Script(`(${handlerSource})`).runInNewContext(context);

  let prevented = 0;
  const toolbarTarget = {
    closest: (selector) => selector.includes("#developerToolbar") ? {} : null,
  };
  handleGameKeyDown({
    key: "1",
    target: toolbarTarget,
    repeat: false,
    preventDefault: () => { prevented += 1; },
  });
  handleGameKeyDown({
    key: " ",
    target: toolbarTarget,
    repeat: false,
    preventDefault: () => { prevented += 1; },
  });
  assert.deepEqual(switched, []);
  assert.deepEqual(dodges, []);
  assert.equal(prevented, 0);
  assert.deepEqual([...keys], []);

  const canvasTarget = { closest: () => null };
  handleGameKeyDown({
    key: "2",
    target: canvasTarget,
    repeat: false,
    preventDefault: () => { prevented += 1; },
  });
  handleGameKeyDown({
    key: " ",
    target: canvasTarget,
    repeat: false,
    preventDefault: () => { prevented += 1; },
  });
  assert.deepEqual(switched, [1]);
  assert.equal(dodges.length, 1);
  assert.equal(prevented, 1);
});

test("developer infinite ammo preserves firearm counts and finite reload behavior", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = source.match(
    /function useWeapon[\s\S]*?\r?\n}\r?\n\r?\nfunction placeStructure/,
  )?.[0].replace(/\r?\n\r?\nfunction placeStructure$/, "");
  assert.ok(functionSource);

  const execute = ({ weaponId, ammo, reserve, session }) => {
    const player = {
      weapon: weaponId,
      ammo: { [weaponId]: ammo },
      reserve: { [weaponId]: reserve },
      cooldown: 0,
      reload: 0,
      dodgeDuration: 0,
      aimX: 1,
      aimY: 0,
      x: 10,
      y: 20,
    };
    const game = { player };
    const events = { bullets: 0, reloads: 0 };
    const context = {
      game,
      developerSession: session,
      weapons: [
        { id: "pistol", ammo: 12, fireRate: 0.2 },
        { id: "shotgun", ammo: 6, fireRate: 0.7 },
      ],
      hasUsableAmmo: (activePlayer, id, activeSession) =>
        Boolean(activeSession.enabled && activeSession.infiniteAmmo) || activePlayer.ammo[id] > 0,
      shouldConsumeAmmo: (activeSession) =>
        !(activeSession.enabled && activeSession.infiniteAmmo),
      triggerWeaponVisual: () => true,
      placeStructure: () => assert.fail("firearms must not place structures"),
      beginReload: () => { events.reloads += 1; },
      fireBullet: () => { events.bullets += 1; },
      fireFlame: () => {},
      fireLaser: () => {},
      ensureSound: () => () => {},
      burst: () => {},
      Math,
    };
    const useWeapon = new Script(`(${functionSource})`).runInNewContext(context);
    useWeapon();
    return { player, events };
  };

  for (const weaponId of ["pistol", "shotgun"]) {
    const finite = execute({
      weaponId,
      ammo: 2,
      reserve: 9,
      session: { enabled: false, infiniteAmmo: false },
    });
    assert.equal(finite.player.ammo[weaponId], 1);
    assert.equal(finite.player.reserve[weaponId], 9);
    assert.ok(finite.events.bullets > 0);

    const emptyFinite = execute({
      weaponId,
      ammo: 0,
      reserve: 9,
      session: { enabled: true, infiniteAmmo: false },
    });
    assert.equal(emptyFinite.events.reloads, 1);
    assert.equal(emptyFinite.events.bullets, 0);
    assert.equal(emptyFinite.player.ammo[weaponId], 0);
    assert.equal(emptyFinite.player.reserve[weaponId], 9);

    const infinite = execute({
      weaponId,
      ammo: 0,
      reserve: 9,
      session: { enabled: true, infiniteAmmo: true },
    });
    assert.equal(infinite.events.reloads, 0);
    assert.ok(infinite.events.bullets > 0);
    assert.equal(infinite.player.ammo[weaponId], 0);
    assert.equal(infinite.player.reserve[weaponId], 9);
  }
});

test("developer infinite ammo covers every non-structure weapon consumption path", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = source.match(
    /function useWeapon[\s\S]*?\r?\n}\r?\n\r?\nfunction placeStructure/,
  )?.[0].replace(/\r?\n\r?\nfunction placeStructure$/, "");
  assert.ok(functionSource);
  const weaponIds = ["rocket", "flamethrower", "laser", "ricochet"];

  for (const weaponId of weaponIds) {
    for (const infiniteAmmo of [false, true]) {
      const player = {
        weapon: weaponId,
        ammo: { [weaponId]: 3 },
        reserve: { [weaponId]: 7 },
        cooldown: 0,
        reload: 0,
        dodgeDuration: 0,
        aimX: 1,
        aimY: 0,
        x: 10,
        y: 20,
      };
      const game = { player };
      const fired = [];
      const session = { enabled: true, infiniteAmmo };
      const useWeapon = new Script(`(${functionSource})`).runInNewContext({
        game,
        developerSession: session,
        weapons: weaponIds.map((id) => ({ id, fireRate: 0.5 })),
        hasUsableAmmo: (activePlayer, id, activeSession) =>
          Boolean(activeSession.enabled && activeSession.infiniteAmmo) ||
          activePlayer.ammo[id] > 0,
        shouldConsumeAmmo: (activeSession) =>
          !(activeSession.enabled && activeSession.infiniteAmmo),
        triggerWeaponVisual: () => true,
        placeStructure: () => assert.fail("firearms must not place structures"),
        beginReload: () => assert.fail("special firearms must not reload"),
        fireBullet: (...args) => fired.push([weaponId, ...args]),
        fireFlame: () => fired.push([weaponId]),
        fireLaser: () => fired.push([weaponId]),
        ensureSound: () => () => {},
        burst: () => {},
        Math,
      });

      useWeapon();
      assert.ok(fired.length > 0, `${weaponId} must fire`);
      assert.equal(player.ammo[weaponId], infiniteAmmo ? 3 : 2);
      assert.equal(player.reserve[weaponId], 7);
    }
  }
});

test("reloads bind to their starting weapon and honor infinite-ammo transitions", async () => {
  assert.equal(createGameState().player.reloadWeapon, null);
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionsSource = source.match(
    /function beginReload[\s\S]*?\r?\n}\r?\n\r?\nfunction fireBullet/,
  )?.[0].replace(/\r?\n\r?\nfunction fireBullet$/, "");
  assert.ok(functionsSource);

  const execute = ({ weaponId, ammo, reserve, infiniteAmmo = false }) => {
    const player = {
      weapon: weaponId,
      ammo: { pistol: 2, shotgun: 1, [weaponId]: ammo },
      reserve: { pistol: 3, shotgun: 10, [weaponId]: reserve },
      reload: 0,
      reloadWeapon: null,
      dodgeDuration: 0,
    };
    const game = { player };
    const developerSession = { enabled: true, infiniteAmmo };
    const functions = new Script(
      `(() => {${functionsSource}; return { beginReload, completeReload };})()`,
    ).runInNewContext({
      game,
      developerSession,
      shouldConsumeAmmo: (session) => !(session.enabled && session.infiniteAmmo),
      weapons: [
        { id: "pistol", ammo: 12 },
        { id: "shotgun", ammo: 6 },
      ],
      ensureSound: () => () => {},
      cancelReload: (activePlayer) => {
        activePlayer.reload = 0;
        activePlayer.reloadWeapon = null;
      },
      Number,
      Math,
    });
    return { player, developerSession, ...functions };
  };

  for (const setup of [
    { weaponId: "pistol", ammo: 2, reserve: 3, expectedAmmo: 5, expectedReserve: 0 },
    { weaponId: "shotgun", ammo: 1, reserve: 10, expectedAmmo: 6, expectedReserve: 5 },
  ]) {
    const finite = execute(setup);
    finite.beginReload();
    assert.equal(finite.player.reloadWeapon, setup.weaponId);
    finite.player.weapon = setup.weaponId === "pistol" ? "shotgun" : "pistol";
    finite.completeReload();
    assert.equal(finite.player.ammo[setup.weaponId], setup.expectedAmmo);
    assert.equal(finite.player.reserve[setup.weaponId], setup.expectedReserve);
    assert.equal(finite.player.reload, 0);
    assert.equal(finite.player.reloadWeapon, null);
  }

  const finiteToInfinite = execute({ weaponId: "pistol", ammo: 0, reserve: 9 });
  finiteToInfinite.beginReload();
  finiteToInfinite.developerSession.infiniteAmmo = true;
  finiteToInfinite.completeReload();
  assert.equal(finiteToInfinite.player.ammo.pistol, 0);
  assert.equal(finiteToInfinite.player.reserve.pistol, 9);
  assert.equal(finiteToInfinite.player.reloadWeapon, null);

  const infiniteToFinite = execute({
    weaponId: "shotgun",
    ammo: 0,
    reserve: 5,
    infiniteAmmo: true,
  });
  infiniteToFinite.beginReload();
  assert.equal(infiniteToFinite.player.reload, 0);
  assert.equal(infiniteToFinite.player.reloadWeapon, null);
  infiniteToFinite.developerSession.infiniteAmmo = false;
  infiniteToFinite.beginReload();
  assert.equal(infiniteToFinite.player.reloadWeapon, "shotgun");
  infiniteToFinite.completeReload();
  assert.equal(infiniteToFinite.player.ammo.shotgun, 5);
  assert.equal(infiniteToFinite.player.reserve.shotgun, 0);
});

test("developer infinite ammo keeps valid and invalid structure placement aligned with preview", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const placementSource = source.match(
    /function placeStructure[\s\S]*?\r?\n}\r?\n\r?\nfunction spawnEnemy/,
  )?.[0].replace(/\r?\n\r?\nfunction spawnEnemy$/, "");
  const previewSource = source.match(
    /function drawPlacementPreview[\s\S]*?\r?\n}\r?\n\r?\nfunction validPlacement/,
  )?.[0].replace(/\r?\n\r?\nfunction validPlacement$/, "");
  assert.ok(placementSource);
  assert.ok(previewSource);

  const execute = ({ kind, ammo, session, placementValid = true }) => {
    const game = {
      nextId: 1,
      player: { weapon: kind, ammo: { [kind]: ammo }, cooldown: 0 },
      structures: [],
    };
    const mouse = { x: 500, y: 400 };
    const context2d = {
      fillStyle: "",
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
    };
    const sandbox = {
      game,
      mouse,
      developerSession: session,
      hasUsableAmmo: (activePlayer, id, activeSession) =>
        Boolean(activeSession.enabled && activeSession.infiniteAmmo) || activePlayer.ammo[id] > 0,
      shouldConsumeAmmo: (activeSession) =>
        !(activeSession.enabled && activeSession.infiniteAmmo),
      STRUCTURE_LIMITS,
      validPlacement: () => placementValid,
      ensureSound: () => () => {},
      burst: () => {},
      renderWeaponBar: () => {},
      context: context2d,
      TAU: Math.PI * 2,
    };
    const placeStructure = new Script(`(${placementSource})`).runInNewContext(sandbox);
    const drawPlacementPreview = new Script(`(${previewSource})`).runInNewContext(sandbox);
    drawPlacementPreview();
    const previewColor = context2d.fillStyle;
    placeStructure(kind);
    return { game, previewColor };
  };

  for (const kind of ["turret", "tank"]) {
    const finite = execute({
      kind,
      ammo: 1,
      session: { enabled: false, infiniteAmmo: false },
    });
    assert.equal(finite.previewColor, "#9fbd7d");
    assert.equal(finite.game.structures.length, 1);
    assert.equal(finite.game.player.ammo[kind], 0);
    assert.equal(finite.game.player.cooldown, 0.45);

    const emptyFinite = execute({
      kind,
      ammo: 0,
      session: { enabled: true, infiniteAmmo: false },
    });
    assert.equal(emptyFinite.previewColor, "#a33b43");
    assert.equal(emptyFinite.game.structures.length, 0);
    assert.equal(emptyFinite.game.player.ammo[kind], 0);
    assert.equal(emptyFinite.game.player.cooldown, 0.18);

    const infinite = execute({
      kind,
      ammo: 0,
      session: { enabled: true, infiniteAmmo: true },
    });
    assert.equal(infinite.previewColor, "#9fbd7d");
    assert.equal(infinite.game.structures.length, 1);
    assert.equal(infinite.game.player.ammo[kind], 0);
    assert.equal(infinite.game.player.cooldown, 0.45);

    const invalidInfinite = execute({
      kind,
      ammo: 4,
      session: { enabled: true, infiniteAmmo: true },
      placementValid: false,
    });
    assert.equal(invalidInfinite.previewColor, "#a33b43");
    assert.equal(invalidInfinite.game.structures.length, 0);
    assert.equal(invalidInfinite.game.player.ammo[kind], 4);
    assert.equal(invalidInfinite.game.player.cooldown, 0.18);

    const invalidFinite = execute({
      kind,
      ammo: 4,
      session: { enabled: false, infiniteAmmo: false },
      placementValid: false,
    });
    assert.equal(invalidFinite.previewColor, "#a33b43");
    assert.equal(invalidFinite.game.structures.length, 0);
    assert.equal(invalidFinite.game.player.ammo[kind], 4);
    assert.equal(invalidFinite.game.player.cooldown, 0.18);
  }
});

test("weapon bar displays infinity without changing real ammo or reserve", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = source.match(
    /function renderWeaponBar[\s\S]*?\r?\n}\r?\n\r?\nfunction drawReviewFloor/,
  )?.[0].replace(/\r?\n\r?\nfunction drawReviewFloor$/, "");
  assert.ok(functionSource);
  const ammo = { pistol: 4, turret: 2, tank: 0 };
  const reserve = { pistol: 31, turret: 0, tank: 0 };
  const game = {
    unlocked: ["pistol", "turret"],
    player: { weapon: "pistol", ammo, reserve },
  };
  const developerSession = { enabled: true, infiniteAmmo: true };
  const weaponBar = { innerHTML: "" };
  const renderWeaponBar = new Script(`(${functionSource})`).runInNewContext({
    game,
    developerSession,
    weaponBar,
    weapons: [
      { id: "pistol", name: "Pistol", threshold: 1 },
      { id: "turret", name: "Turret", threshold: 15 },
      { id: "tank", name: "Tank" },
    ],
  });

  renderWeaponBar();
  assert.equal((weaponBar.innerHTML.match(/∞/g) ?? []).length, 2);
  assert.match(weaponBar.innerHTML, /完成手枪试炼/);
  assert.doesNotMatch(weaponBar.innerHTML, /Tank ∞/);
  assert.deepEqual(ammo, { pistol: 4, turret: 2, tank: 0 });
  assert.deepEqual(reserve, { pistol: 31, turret: 0, tank: 0 });

  developerSession.infiniteAmmo = false;
  renderWeaponBar();
  assert.match(weaponBar.innerHTML, /Pistol 4/);
  assert.match(weaponBar.innerHTML, /Turret 2/);
  assert.doesNotMatch(weaponBar.innerHTML, /∞/);
  assert.match(weaponBar.innerHTML, /完成手枪试炼/);
  assert.deepEqual(ammo, { pistol: 4, turret: 2, tank: 0 });
  assert.deepEqual(reserve, { pistol: 31, turret: 0, tank: 0 });
});

test("enemy deaths create tiered supplies and boss rewards only once", async () => {
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(
    gameSource,
    /rollEnemyDrops\(enemy\.kind, game\.unlocked, Math\.random, \{[\s\S]*?wave: game\.wave,[\s\S]*?survival/,
  );
  assert.match(
    gameSource,
    /enemy\.kind !== "boss"\s*\|\|\s*rewardBossKill\(game, enemy\)/,
  );
  assert.match(gameSource, /createSupplyPickups\(drops, enemy\.x, enemy\.y\)/);
  const deathLoopSource = gameSource.slice(
    gameSource.indexOf("const dead = game.enemies.filter"),
    gameSource.indexOf("if (dead.length)", gameSource.indexOf("const dead = game.enemies.filter")),
  );
  assert.match(deathLoopSource, /createEnemySupplies\(enemy\)/);
  assert.doesNotMatch(deathLoopSource, /rollEnemyDrops|rewardBossKill/);
});

test("enemy supply gate executes ordinary rolls once and boss rewards once", async () => {
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const functionSource = gameSource.match(
    /function createEnemySupplies[\s\S]*?\r?\n}\r?\n\r?\nfunction createSupplyPickups/,
  )?.[0].replace(/\r?\n\r?\nfunction createSupplyPickups$/, "");
  assert.ok(functionSource);

  const game = { unlocked: ["shotgun"], wave: 31, player: { health: 50, maxHealth: 100 }, weaponUpgrades: {} };
  const rewardedBosses = new Set();
  const rewardCalls = [];
  const rollCalls = [];
  const creates = [];
  const createEnemySupplies = new Script(`(${functionSource})`).runInNewContext({
    game,
    developerSession: { enabled: false, infiniteAmmo: false },
    ammoFillRatio: () => 0.5,
    rewardBossKill: (_game, enemy) => {
      rewardCalls.push(enemy.id);
      if (rewardedBosses.has(enemy.id)) return false;
      rewardedBosses.add(enemy.id);
      return true;
    },
    rollEnemyDrops: (kind, unlocked, random, context) => {
      rollCalls.push({ kind, unlocked, random, context });
      return kind === "boss"
        ? [{ kind: "health" }, { kind: "ammo", weaponId: "shotgun" }]
        : [{ kind: "health" }];
    },
    createSupplyPickups: (drops, x, y) => creates.push({ drops, x, y }),
    Math,
  });

  createEnemySupplies({ id: 1, kind: "zombie", x: 10, y: 20 });
  createEnemySupplies({ id: 2, kind: "runner", x: 30, y: 40 });
  const boss = { id: 3, kind: "boss", x: 50, y: 60 };
  createEnemySupplies(boss);
  createEnemySupplies(boss);

  assert.deepEqual(rollCalls.map(({ kind }) => kind), ["zombie", "runner", "boss"]);
  assert.ok(rollCalls.every(({ unlocked }) => unlocked === game.unlocked));
  assert.ok(rollCalls.every(({ random }) => random === Math.random));
  assert.ok(rollCalls.every(({ context }) => context.wave === 31 && context.survival && context.healthRatio === 0.5 && context.ammoRatio === 0.5));
  assert.deepEqual(rewardCalls, [3, 3]);
  assert.equal(creates.length, 3);
  assert.equal(creates[0].drops.length, 1);
  assert.equal(creates[1].drops.length, 1);
  assert.equal(creates[2].drops.length, 2);
  assert.equal(creates[2].x, 50);
  assert.equal(creates[2].y, 60);
});

test("pickup collection commits ammo only after a successful pure resolution", async () => {
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(
    gameSource,
    /resolveAmmoPickup\([\s\S]*?game\.weaponUpgrades,[\s\S]*?\)/,
  );
  assert.match(
    gameSource,
    /game\.player\[result\.storage\]\[result\.weaponId\] = result\.nextValue/,
  );
  assert.match(gameSource, /if \(!result\.collected\) continue/);
  assert.doesNotMatch(gameSource, /function createHealthPack\(/);

  const createSource = gameSource.match(
    /function createSupplyPickups[\s\S]*?\r?\n}\r?\n\r?\nfunction createGas/,
  )?.[0].replace(/\r?\n\r?\nfunction createGas$/, "");
  const updateSource = gameSource.match(
    /function updatePickups[\s\S]*?\r?\n}\r?\n\r?\nfunction updateHazards/,
  )?.[0].replace(/\r?\n\r?\nfunction updateHazards$/, "");
  assert.ok(createSource);
  assert.ok(updateSource);

  const execute = ({ pickups, health, ammo, infiniteAmmo = false }) => {
    const game = {
      nextId: 10,
      pickups,
      player: {
        x: 100,
        y: 100,
        health,
        maxHealth: 100,
        ammo: { rocket: ammo },
        reserve: { shotgun: 40 },
      },
      notice: "",
      noticeTimer: 0,
    };
    const functions = new Script(
      `(() => {${createSource}; ${updateSource}; return { createSupplyPickups, updatePickups };})()`,
    ).runInNewContext({
      game,
      developerSession: { enabled: true, infiniteAmmo },
      distance: (left, right) => Math.hypot(left.x - right.x, left.y - right.y),
      healthAfterPack: (value) => Math.min(100, value + Math.ceil(value * 0.3)),
      playerModifiers: () => ({
        pickupMultiplier: 1,
        healthPackRatio: 0.3,
      }),
      resolveAmmoPickup: (player, weaponId, isInfinite) => {
        if (weaponId !== "rocket" || isInfinite || player.ammo.rocket >= 12) {
          return { collected: false };
        }
        const nextValue = Math.min(12, player.ammo.rocket + 4);
        return {
          collected: true,
          storage: "ammo",
          weaponId,
          nextValue,
          amount: nextValue - player.ammo.rocket,
          label: "火箭筒",
        };
      },
      burst: () => {},
      ensureSound: () => () => {},
      clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
      WIDTH,
      HEIGHT,
      Math,
    });
    return { game, ...functions };
  };

  const paired = execute({ pickups: [], health: 100, ammo: 10 });
  paired.createSupplyPickups(
    [{ kind: "health" }, { kind: "ammo", weaponId: "rocket" }],
    100,
    100,
  );
  assert.equal(paired.game.pickups.length, 2);
  assert.notEqual(paired.game.pickups[0].x, paired.game.pickups[1].x);

  const leftBottom = execute({ pickups: [], health: 100, ammo: 10 });
  leftBottom.createSupplyPickups(
    [{ kind: "health" }, { kind: "ammo", weaponId: "rocket" }],
    0,
    -100,
  );
  assert.deepEqual(
    leftBottom.game.pickups.map(({ x, y }) => [x, y]),
    [[52, 52], [96, 52]],
  );

  const rightTop = execute({ pickups: [], health: 100, ammo: 10 });
  rightTop.createSupplyPickups(
    [{ kind: "health" }, { kind: "ammo", weaponId: "rocket" }],
    WIDTH,
    HEIGHT + 100,
  );
  assert.deepEqual(
    rightTop.game.pickups.map(({ x, y }) => [x, y]),
    [[WIDTH - 96, HEIGHT - 52], [WIDTH - 52, HEIGHT - 52]],
  );

  const singleMinimum = execute({ pickups: [], health: 100, ammo: 10 });
  singleMinimum.createSupplyPickups([{ kind: "health" }], 0, -1);
  assert.equal(singleMinimum.game.pickups[0].x, 52);
  assert.equal(singleMinimum.game.pickups[0].y, 52);

  const singleMaximum = execute({ pickups: [], health: 100, ammo: 10 });
  singleMaximum.createSupplyPickups([{ kind: "health" }], WIDTH, HEIGHT + 1);
  assert.equal(singleMaximum.game.pickups[0].x, WIDTH - 52);
  assert.equal(singleMaximum.game.pickups[0].y, HEIGHT - 52);

  const health = execute({
    pickups: [{ id: 1, kind: "health", x: 100, y: 100, radius: 18, collected: false }],
    health: 80,
    ammo: 12,
  });
  health.updatePickups();
  assert.equal(health.game.pickups.length, 0);
  assert.equal(health.game.player.health, 100);
  assert.match(health.game.notice, /回血.*20/);

  const ammoPickup = {
    id: 2,
    kind: "ammo",
    weaponId: "rocket",
    x: 100,
    y: 100,
    radius: 18,
    collected: false,
  };
  const ammoResult = execute({ pickups: [ammoPickup], health: 100, ammo: 10 });
  ammoResult.updatePickups();
  assert.equal(ammoResult.game.pickups.length, 0);
  assert.equal(ammoResult.game.player.ammo.rocket, 12);
  assert.match(ammoResult.game.notice, /火箭筒.*2/);

  const infiniteResult = execute({
    pickups: [{ ...ammoPickup, collected: false }],
    health: 100,
    ammo: 10,
    infiniteAmmo: true,
  });
  infiniteResult.updatePickups();
  assert.equal(infiniteResult.game.pickups.length, 1);
  assert.equal(infiniteResult.game.player.ammo.rocket, 10);
});

test("pickup drawing dispatches known kinds and ignores unknown pickups", async () => {
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawAmmoSource = gameSource.match(
    /function drawAmmoPack\(pickup\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction drawPickup)/,
  )?.[0];
  const drawPickupSource = gameSource.match(
    /function drawPickup\(pickup\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction drawHazard)/,
  )?.[0];
  assert.ok(drawAmmoSource);
  assert.ok(drawPickupSource);
  assert.match(gameSource, /ammoCrateSprite.src = "\/ammo-crate.png"/);

  const calls = [];
  let healthDraws = 0;
  const canvasStateKeys = [
    "font",
    "textAlign",
    "textBaseline",
    "fillStyle",
    "strokeStyle",
    "lineWidth",
    "globalAlpha",
  ];
  const initialCanvasState = {
    font: "sentinel-font",
    textAlign: "right",
    textBaseline: "alphabetic",
    fillStyle: "#123456",
    strokeStyle: "#654321",
    lineWidth: 91,
    globalAlpha: 0.37,
  };
  const savedStates = [];
  const contextTarget = {
    ...initialCanvasState,
    save() {
      calls.push({ method: "save", args: [] });
      savedStates.push(
        Object.fromEntries(canvasStateKeys.map((key) => [key, contextTarget[key]])),
      );
    },
    restore() {
      calls.push({ method: "restore", args: [] });
      Object.assign(contextTarget, savedStates.pop());
    },
  };
  const context = new Proxy(contextTarget, {
    get(target, property) {
      if (!(property in target)) {
        target[property] = (...args) => calls.push({ method: property, args });
      }
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  const sandbox = {
    ammoCrateSprite: { complete: true, naturalWidth: 1254 },
    Math,
    TAU: Math.PI * 2,
    context,
    drawHealthPack: () => { healthDraws += 1; },
    game: { time: 2 },
  };
  new Script(
    drawAmmoSource +
      "\n" +
      drawPickupSource +
      "\nthis.drawAmmoPack = drawAmmoPack; this.drawPickup = drawPickup;",
  ).runInNewContext(sandbox);

  sandbox.drawPickup({ id: 1, kind: "health", x: 10, y: 20 });
  assert.equal(healthDraws, 1);
  assert.equal(calls.length, 0);

  sandbox.drawPickup({ id: 2, kind: "ammo", weaponId: "rocket", x: 30, y: 40 });
  assert.equal(healthDraws, 1);
  assert.equal(calls.filter(({ method }) => method === "save").length, 1);
  assert.equal(calls.filter(({ method }) => method === "restore").length, 1);
  assert.ok(
    calls.findIndex(({ method }) => method === "save") <
      calls.findIndex(({ method }) => method === "restore"),
  );
  assert.equal(calls.some(({ method }) => method === "fillText"), false);
  assert.equal(calls.find(({ method }) => method === "drawImage")?.args[0], sandbox.ammoCrateSprite);
  assert.deepEqual(
    Object.fromEntries(canvasStateKeys.map((key) => [key, context[key]])),
    initialCanvasState,
  );
  for (const { args } of calls) {
    for (const value of args.filter((argument) => typeof argument === "number")) {
      assert.equal(Number.isFinite(value), true);
    }
  }

  const callsBeforeUnknown = calls.length;
  sandbox.drawPickup({ id: 3, kind: "unknown", x: 50, y: 60 });
  assert.equal(healthDraws, 1);
  assert.equal(calls.length, callsBeforeUnknown);

  calls.length = 0;
  sandbox.drawAmmoPack({ id: 4, kind: "ammo", weaponId: "unknown", x: 70, y: 80 });
  assert.equal(calls.filter(({ method }) => method === "save").length, 1);
  assert.equal(calls.filter(({ method }) => method === "restore").length, 1);
  assert.equal(calls.some(({ method }) => method === "fillText"), false);
  assert.equal(calls.find(({ method }) => method === "drawImage")?.args[0], sandbox.ammoCrateSprite);
  for (const weaponId of ["shotgun", "rocket", "lightning", "freeze", "watermelon"]) {
    calls.length = 0;
    sandbox.drawAmmoPack({ id: 5, kind: "ammo", weaponId, x: 10, y: 20 });
    assert.equal(calls.find(({ method }) => method === "drawImage")?.args[0], sandbox.ammoCrateSprite);
    assert.equal(calls.some(({ method }) => method === "fillText"), false);
  }
  for (const complete of [false, true]) {
    calls.length = 0;
    Object.assign(sandbox.ammoCrateSprite, { complete, naturalWidth: 0 });
    sandbox.drawAmmoPack({ id: 6, kind: "ammo", weaponId: "rocket", x: 10, y: 20 });
    assert.equal(calls.some(({ method }) => method === "drawImage"), false);
    assert.equal(calls.some(({ method }) => method === "fillText"), false);
    assert.equal(calls.some(({ method }) => method === "fillRect"), true);
  }
  assert.deepEqual(
    Object.fromEntries(canvasStateKeys.map((key) => [key, context[key]])),
    initialCanvasState,
  );
  for (const { args } of calls) {
    for (const value of args.filter((argument) => typeof argument === "number")) {
      assert.equal(Number.isFinite(value), true);
    }
  }
});

test("render draws ground decals before supply pickups", async () => {
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const renderStart = gameSource.indexOf("function render()");
  const renderSource = gameSource.slice(
    renderStart,
    gameSource.indexOf("function updateHud", renderStart),
  );
  const decalIndex = renderSource.indexOf("for (const decal of game.decals)");
  const pickupIndex = renderSource.indexOf(
    "for (const pickup of game.pickups) drawPickup(pickup)",
  );
  assert.ok(decalIndex >= 0);
  assert.ok(pickupIndex > decalIndex);
});

test("收回和警示只绘制深坑，active 绘制五根立体尖锥", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function drawSpikeWarning(");
  const end = source.indexOf("function drawHazard(", start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const context = new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => calls.push({ method: property, args });
    },
    set(target, property, value) {
      target[property] = value;
      calls.push({ method: "set", property, value });
      return true;
    },
  });
  const sandbox = { context, game: { time: 1.25 }, Math, TAU, clamp };
  new Script(source.slice(start, end) + "\nthis.drawSpikeTrap = drawSpikeTrap;")
    .runInNewContext(sandbox);
  const draw = (phase, phaseTime = 0.25) => {
    calls.length = 0;
    sandbox.drawSpikeTrap({ x: 100, y: 120, radius: 36, phase, phaseTime });
    return [...calls];
  };
  const coneFaces = (entries) => entries.filter(({ method, property, value }) =>
    method === "set" && property === "fillStyle" &&
    ["#1a2022", "#8f9691"].includes(value));

  const retracted = draw("retracted", 0);
  assert.ok(retracted.filter(({ method }) => method === "ellipse").length >= 3);
  assert.equal(coneFaces(retracted).length, 0);

  const warning = draw("warning", 0.5);
  assert.ok(warning.filter(({ method }) => method === "ellipse").length >= 4);
  assert.equal(coneFaces(warning).length, 0);

  const active = draw("active", 0.25);
  assert.equal(coneFaces(active).length, 10);
  const coneTips = active
    .filter(({ method, args }) => method === "moveTo" && args[1] < -20)
    .map(({ args }) => args[1]);
  assert.equal(coneTips.length, 10);
  assert.equal(new Set(coneTips).size, 3);
  assert.equal(active.filter(({ method }) => method === "rotate").length, 0);
  assert.equal(active.filter(({ method }) => method === "save").length,
    active.filter(({ method }) => method === "restore").length);
});

test("render 在单位排序前绘制地刺地面层", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const renderStart = source.indexOf("function render()");
  const renderSource = source.slice(renderStart, source.indexOf("function frame(", renderStart));
  const trapIndex = renderSource.indexOf("for (const trap of game.spikeTraps) drawSpikeTrap(trap)");
  const entityIndex = renderSource.indexOf("const entities = [");
  assert.ok(trapIndex >= 0 && trapIndex < entityIndex);
});

test("supply pickups persist across wave and developer resets but new games start empty", async () => {
  const developerSource = await readFile(
    new URL("../src/developer-mode.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(developerSource, /"pickups"/);
  const gameSource = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const first = createGameState();
  const second = createGameState();
  assert.deepEqual(first.pickups, []);
  assert.notEqual(first.pickups, second.pickups);
  const pickup = {
    id: 1,
    kind: "ammo",
    weaponId: "rocket",
    x: 100,
    y: 100,
    radius: 18,
    collected: false,
  };
  first.pickups.push(pickup);
  const pickupsReference = first.pickups;
  applyDeveloperWave(first, { targetWave: 1, totalCount: 1 });
  assert.equal(first.pickups, pickupsReference);
  assert.deepEqual(first.pickups, [pickup]);

  first.wave = 1;
  first.waveQueue = [];
  first.enemies = [];
  first.intermission = 6.95;
  let builtWave = null;
  let lightningResets = 0;
  const updateWaveStart = gameSource.indexOf("function updateWave");
  const updateWaveSource = gameSource.slice(
    updateWaveStart,
    gameSource.indexOf("function update(", updateWaveStart),
  );
  assert.ok(updateWaveSource.startsWith("function updateWave"));
  const waveSandbox = {
    Math,
    buildWave: (wave) => {
      builtWave = wave;
      return ["zombie"];
    },
    buildWaveEnhancements: () => [],
    developerSession: { enabled: false },
    game: first,
    getEnemySpawnLimit: () => 14,
    resetWaveLightning: () => { lightningResets += 1; },
    spawnEnemy: () => assert.fail("empty wave queue must not spawn before advancing"),
    syncDeveloperControls: () => assert.fail("disabled developer mode must not sync"),
  };
  new Script(
    updateWaveSource + "\nthis.updateWave = updateWave;",
  ).runInNewContext(waveSandbox);
  waveSandbox.updateWave(0.1);
  assert.equal(first.wave, 2);
  assert.equal(builtWave, 2);
  assert.equal(lightningResets, 1);
  assert.equal(first.pickups, pickupsReference);
  assert.deepEqual(first.pickups, [pickup]);
});

test("正常后期波抽取两种强化而首领波只抽取一种", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateWaveSource = extractGameFunction(source, "updateWave", "update");

  function advanceFrom(wave) {
    const game = createGameState();
    game.wave = wave;
    game.waveQueue = [];
    game.waveEnhancements = ["toxic"];
    game.enemies = [];
    game.intermission = 7;
    const testMath = Object.create(Math);
    testMath.random = () => 0;
    const sandbox = {
      game,
      Math: testMath,
      buildWave,
      buildWaveEnhancements,
      developerSession: { enabled: false },
      tankTrialSession: { active: false },
      getEnemySpawnLimit: () => 14,
      resetWaveLightning() {},
      spawnEnemy() {},
      syncDeveloperControls() {},
    };
    new Script(updateWaveSource + "\nthis.updateWave = updateWave;")
      .runInNewContext(sandbox);
    sandbox.updateWave(0);
    return game;
  }

  const ordinary = advanceFrom(10);
  assert.equal(ordinary.wave, 11);
  assert.deepEqual(ordinary.waveEnhancements, ["zombie", "runner"]);

  const boss = advanceFrom(19);
  assert.equal(boss.wave, 20);
  assert.deepEqual(boss.waveEnhancements, ["zombie"]);
});

test("weapon bar renders eleven indexed buttons with compact keyboard labels", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const renderSource = extractGameFunction(source, "renderWeaponBar", "drawBackground");
  const game = createGameState();
  game.unlocked = weapons.map(({ id }) => id);
  const weaponBar = { innerHTML: "" };
  const renderSandbox = {
    game,
    weapons,
    weaponBar,
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    TANK_TRIAL_STAGES,
  };
  new Script(renderSource + "\nthis.renderWeaponBar = renderWeaponBar;")
    .runInNewContext(renderSandbox);
  renderSandbox.renderWeaponBar();
  assert.equal((weaponBar.innerHTML.match(/<button\b/g) ?? []).length, 11);
  assert.equal((weaponBar.innerHTML.match(/type="button"/g) ?? []).length, 11);
  for (let index = 0; index < 11; index += 1) {
    assert.match(weaponBar.innerHTML, new RegExp(`data-weapon-index="${index}"`));
  }
  assert.match(weaponBar.innerHTML, />\s*1<small>/);
  assert.match(weaponBar.innerHTML, />\s*0<small>/);
  assert.match(weaponBar.innerHTML, />\s*-<small>/);
  assert.match(source, /weaponBar\.addEventListener\("click"[\s\S]*?switchWeapon/);
  assert.match(styles, /\.weapon-bar\s*\{[\s\S]*?repeat\(11,/);
  assert.match(styles, /@media[\s\S]*?\.weapon-bar\s*\{[\s\S]*?repeat\(6,/);
});

test("weapon selection supports minus key and blocks reward and tank trial", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(
    source,
    /\/\^\[1-9\]\$\/\.test\(key\)[\s\S]*?key === "0"[\s\S]*?key === "-"/,
  );
  assert.match(source, /key === "-" \? 10/);
  const switchSource = extractGameFunction(source, "switchWeapon", "beginReload");
  const game = createGameState();
  game.mode = "playing";
  game.unlocked = weapons.map(({ id }) => id);
  const sandbox = {
    game,
    weapons,
    rewardDialog: { hidden: true },
    tankTrialSession: { active: false },
    cancelReload() {},
    cancelWatermelonCharge() {},
    renderWeaponBar() {},
    ensureSound: () => () => {},
  };
  new Script(switchSource + "\nthis.switchWeapon = switchWeapon;")
    .runInNewContext(sandbox);
  sandbox.switchWeapon(10);
  assert.equal(game.player.weapon, weapons[10].id);

  game.rewardSession.active = true;
  sandbox.switchWeapon(1);
  assert.equal(game.player.weapon, weapons[10].id);
  game.rewardSession.active = false;
  sandbox.tankTrialSession.active = true;
  sandbox.switchWeapon(0);
  assert.equal(game.player.weapon, weapons[10].id);
});

test("weapon selection click ignores locked slots and wheel wraps all eleven", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const clickSource = source.match(
    /weaponBar\.addEventListener\(\s*"click",[\s\S]*?\r?\n\}\);/,
  )?.[0] ?? "";
  const wheelSource = source.match(
    /canvas\.addEventListener\(\s*"wheel",[\s\S]*?\{ passive: false \},\s*\);/,
  )?.[0] ?? "";
  assert.ok(clickSource);
  assert.ok(wheelSource);
  const game = createGameState();
  game.mode = "playing";
  game.unlocked = weapons.map(({ id }) => id);
  game.player.weapon = weapons[10].id;
  let clickHandler;
  let wheelHandler;
  const selected = [];
  const sandbox = {
    game,
    weapons,
    rewardDialog: { hidden: true },
    tankTrialSession: { active: false },
    weaponBar: {
      addEventListener: (_type, handler) => { clickHandler = handler; },
    },
    canvas: {
      addEventListener: (_type, handler) => { wheelHandler = handler; },
    },
    switchWeapon: (index) => selected.push(index),
    cancelReload() {},
    cancelWatermelonCharge() {},
    renderWeaponBar() {},
    Math,
    Number,
  };
  new Script(clickSource + "\n" + wheelSource).runInNewContext(sandbox);
  clickHandler({
    target: { closest: () => ({ dataset: { weaponIndex: "4" } }) },
  });
  assert.deepEqual(selected, [4]);

  game.unlocked = [weapons[0].id];
  clickHandler({
    target: { closest: () => ({ dataset: { weaponIndex: "4" } }) },
  });
  assert.deepEqual(selected, [4]);

  game.unlocked = weapons.map(({ id }) => id);
  wheelHandler({ deltaY: 1, preventDefault() {} });
  assert.equal(game.player.weapon, weapons[0].id);
  game.rewardSession.active = true;
  wheelHandler({ deltaY: 1, preventDefault() {} });
  assert.equal(game.player.weapon, weapons[0].id);
});

test("all weapon-selection paths cancel a pending reload", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const cancelSource = source.match(
    /function cancelReload[\s\S]*?\r?\n}\r?\n\r?\nfunction selectDeveloperWeapon/,
  )?.[0].replace(/\r?\n\r?\nfunction selectDeveloperWeapon$/, "");
  const selectSource = source.match(
    /function selectDeveloperWeapon[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  const switchSource = source.match(
    /function switchWeapon[\s\S]*?\r?\n}\r?\n\r?\nfunction beginReload/,
  )?.[0].replace(/\r?\n\r?\nfunction beginReload$/, "");
  assert.ok(cancelSource);
  assert.ok(selectSource);
  assert.ok(switchSource);
  const wheelSource = source.match(
    /canvas\.addEventListener\(\s*"wheel",[\s\S]*?\{ passive: false \},\s*\);/,
  )?.[0] ?? "";
  assert.match(wheelSource, /cancelReload\(\)/);

  const player = { weapon: "pistol", reload: 0.82, reloadWeapon: "pistol" };
  const game = {
    mode: "playing",
    player,
    unlocked: ["pistol", "shotgun"],
    rewardSession: { active: false },
  };
  const session = { weapon: "pistol" };
  const sandbox = {
    game,
    weapons: [{ id: "pistol" }, { id: "shotgun" }],
    rewardDialog: { hidden: true },
    renderWeaponBar: () => {},
    ensureSound: () => () => {},
    cancelWatermelonCharge: () => {},
  };
  sandbox.cancelReload = new Script(`(${cancelSource})`).runInNewContext(sandbox);
  const selectDeveloperWeapon = new Script(`(${selectSource})`).runInNewContext(sandbox);
  const switchWeapon = new Script(`(${switchSource})`).runInNewContext(sandbox);

  switchWeapon(1);
  assert.equal(player.weapon, "shotgun");
  assert.equal(player.reload, 0);
  assert.equal(player.reloadWeapon, null);

  player.reload = 1.25;
  player.reloadWeapon = "shotgun";
  selectDeveloperWeapon(game, session, "pistol");
  assert.equal(player.weapon, "pistol");
  assert.equal(player.reload, 0);
  assert.equal(player.reloadWeapon, null);
});

test("wheel weapon switching executes reload cancellation only while playing", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const wheelSource = source.match(
    /canvas\.addEventListener\(\s*"wheel",[\s\S]*?\{ passive: false \},\s*\);/,
  )?.[0] ?? "";
  assert.ok(wheelSource);

  let wheelHandler;
  let registeredOptions;
  const game = {
    mode: "playing",
    unlocked: ["pistol", "shotgun", "rocket"],
    player: {
      weapon: "pistol",
      reload: 0.82,
      reloadWeapon: "pistol",
    },
  };
  let renderCount = 0;
  const sandbox = {
    canvas: {
      addEventListener: (type, handler, options) => {
        assert.equal(type, "wheel");
        wheelHandler = handler;
        registeredOptions = options;
      },
    },
    game,
    cancelReload: () => {
      game.player.reload = 0;
      game.player.reloadWeapon = null;
    },
    cancelWatermelonCharge: () => {},
    renderWeaponBar: () => { renderCount += 1; },
    Math,
  };
  new Script(wheelSource).runInNewContext(sandbox);
  assert.equal(typeof wheelHandler, "function");
  assert.equal(registeredOptions.passive, false);

  let preventCount = 0;
  wheelHandler({
    deltaY: 1,
    preventDefault: () => { preventCount += 1; },
  });
  assert.equal(game.player.weapon, "shotgun");
  assert.equal(game.player.reload, 0);
  assert.equal(game.player.reloadWeapon, null);
  assert.equal(preventCount, 1);
  assert.equal(renderCount, 1);

  game.mode = "paused";
  game.player.reload = 1.25;
  game.player.reloadWeapon = "shotgun";
  wheelHandler({
    deltaY: 1,
    preventDefault: () => { preventCount += 1; },
  });
  assert.equal(game.player.weapon, "shotgun");
  assert.equal(game.player.reload, 1.25);
  assert.equal(game.player.reloadWeapon, "shotgun");
  assert.equal(preventCount, 1);
  assert.equal(renderCount, 1);
});

test("坦克试炼选择框包含批准文案和可访问按钮", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const tree = parseHtmlTree(html);
  const entry = findElementById(tree, "tankTrialEntry");
  const dialog = findElementById(tree, "tankTrialDialog");
  const status = findElementById(tree, "tankTrialStatus");
  const decline = findElementById(tree, "declineTankTrial");
  const accept = findElementById(tree, "acceptTankTrial");
  const title = findElementById(tree, "tankTrialDialogTitle");
  const description = findElementById(tree, "tankTrialDialogDescription");
  assert.equal(entry?.tagName, "button");
  assert.equal(entry?.attributes.type, "button");
  assert.ok(Object.hasOwn(entry?.attributes ?? {}, "hidden"));
  assert.equal(dialog?.tagName, "section");
  assert.equal(dialog?.attributes.role, "dialog");
  assert.equal(dialog?.attributes["aria-modal"], "true");
  assert.equal(dialog?.attributes["aria-labelledby"], "tankTrialDialogTitle");
  assert.equal(dialog?.attributes["aria-describedby"], "tankTrialDialogDescription");
  assert.ok(Object.hasOwn(dialog?.attributes ?? {}, "hidden"));
  assert.equal(status?.attributes.role, "status");
  assert.equal(status?.attributes["aria-live"], "polite");
  assert.equal(title?.tagName, "h2");
  assert.equal(description?.tagName, "p");
  assert.equal(decline?.tagName, "button");
  assert.equal(decline?.attributes.type, "button");
  assert.equal(accept?.tagName, "button");
  assert.equal(accept?.attributes.type, "button");
  assert.match(html, /id="tankTrialEntry"[^>]*>进入坦克试炼</);
  assert.match(
    html,
    /id="tankTrialResult"[^>]*role="status"[^>]*aria-live="assertive"[^>]*hidden/,
  );
  assert.match(
    html,
    /一切的恐惧都源自于火力不足，现在有一个机会摆在你的面前，是否同意进入试炼/,
  );
  assert.match(html, /id="declineTankTrial"[^>]*>不同意</);
  assert.match(html, /id="acceptTankTrial"[^>]*>同意</);
  assert.match(html, /src="\/tank-trial-fragments\.png"/);
  const allNodes = [];
  const visit = (node) => {
    allNodes.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  const art = allNodes.filter((node) =>
    Object.hasOwn(node.attributes ?? {}, "data-tank-trial-art")
  );
  const bases = allNodes.filter((node) =>
    node.attributes?.class?.split(/\s+/).includes("tank-trial-art-base")
  );
  const fragments = allNodes.filter((node) => node.attributes?.["data-trial-fragment"]);
  assert.equal(art.length, 2);
  assert.equal(bases.length, 2);
  assert.equal(fragments.length, 10);
  for (const image of [...bases, ...fragments]) {
    assert.equal(image.tagName, "img");
    assert.equal(image.attributes.src, "/tank-trial-fragments.png");
    assert.equal(image.attributes.alt, "");
  }
  assert.deepEqual(
    fragments.map((node) => node.attributes["data-trial-fragment"]),
    ["1", "2", "3", "4", "5", "1", "2", "3", "4", "5"],
  );
});

test("奖励弹窗提供可访问的二阶段选择结构", async () => {
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  const tree = parseHtmlTree(html);
  const dialog = findElementById(tree, "rewardDialog");
  const categories = findElementById(tree, "rewardCategoryChoices");
  const traits = findElementById(tree, "rewardTraitChoices");
  const status = findElementById(tree, "rewardStatus");
  assert.equal(dialog?.tagName, "section");
  assert.equal(dialog?.attributes.role, "dialog");
  assert.equal(dialog?.attributes["aria-modal"], "true");
  assert.equal(dialog?.attributes["aria-labelledby"], "rewardDialogTitle");
  assert.equal(dialog?.attributes["aria-describedby"], "rewardDialogDescription");
  assert.ok(Object.hasOwn(dialog?.attributes ?? {}, "hidden"));
  assert.equal(categories?.tagName, "div");
  assert.equal(traits?.tagName, "div");
  assert.ok(Object.hasOwn(traits?.attributes ?? {}, "hidden"));
  assert.equal(status?.attributes.role, "status");
  assert.equal(status?.attributes["aria-live"], "polite");
  assert.match(html, /先选择人物成长或枪械成长，再从三个词条中选择一个/);
});

test("奖励弹窗使用蓝黄类别卡和响应式三词条布局", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.reward-dialog\[hidden\][\s\S]*?display:\s*none/);
  assert.match(css, /\.reward-category-player[\s\S]*?#[0-9a-f]{6}/i);
  assert.match(css, /\.reward-category-weapon[\s\S]*?#[0-9a-f]{6}/i);
  assert.match(css, /\.reward-traits[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.reward-card:focus-visible[\s\S]*?outline/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.reward-traits/);
});

test("奖励弹窗运行时生成两类与三个词条并隔离战斗输入", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  for (const marker of [
    "openRewardDialog",
    "renderRewardCategories",
    "renderRewardCandidates",
    "chooseRewardCategoryFromDialog",
    "claimSelectedReward",
    "handleRewardKeyDown",
    "trapRewardFocus",
    "buildPlayerCandidates",
    "chooseRewardCategory",
    "applyPlayerUpgrade",
    "claimReward",
  ]) assert.equal(source.includes(marker), true, marker);
  assert.match(source, /data-reward-category="player"/);
  assert.match(source, /data-reward-category="weapon"/);
  assert.match(source, /candidates\.map[\s\S]*?data-reward-trait/);
  assert.match(source, /if \(!rewardDialog\.hidden\)[\s\S]*?handleRewardKeyDown\(event\)[\s\S]*?return/);
  assert.match(source, /canvas\.addEventListener\("pointerdown"[\s\S]*?game\.rewardSession\.active[\s\S]*?return/);
  assert.match(source, /openRewardDialog\(\)/);

  const rewardGuard = source.indexOf("if (!rewardDialog.hidden)");
  const trialGuard = source.indexOf("if (!tankTrialDialog.hidden)", rewardGuard);
  assert.ok(rewardGuard >= 0 && trialGuard > rewardGuard);
});

test("奖励弹窗焦点在可用按钮间首尾循环", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const focusSource = extractGameFunction(source, "trapRewardFocus", "cancelReload");
  const first = { focus() { sandbox.document.activeElement = first; } };
  const last = { focus() { sandbox.document.activeElement = last; } };
  const sandbox = {
    rewardDialog: {
      hidden: false,
      querySelectorAll: () => [first, last],
    },
    document: { activeElement: last },
  };
  new Script(focusSource + "\nthis.trapRewardFocus = trapRewardFocus;")
    .runInNewContext(sandbox);
  let prevented = 0;
  sandbox.trapRewardFocus({
    key: "Tab",
    shiftKey: false,
    preventDefault() { prevented += 1; },
  });
  assert.equal(sandbox.document.activeElement, first);
  sandbox.document.activeElement = first;
  sandbox.trapRewardFocus({
    key: "Tab",
    shiftKey: true,
    preventDefault() { prevented += 1; },
  });
  assert.equal(sandbox.document.activeElement, last);
  sandbox.document.activeElement = {};
  sandbox.trapRewardFocus({
    key: "Tab",
    shiftKey: false,
    preventDefault() { prevented += 1; },
  });
  assert.equal(sandbox.document.activeElement, first);
  assert.equal(prevented, 3);
});

test("奖励词条支持方向键循环、Escape 返回和 Enter 领取", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const keySource = extractGameFunction(
    source,
    "handleRewardKeyDown",
    "openTankTrialDialog",
  );
  const calls = [];
  const sandbox = {
    rewardDialog: { hidden: false },
    game: {
      rewardSession: {
        stage: "traits",
        selectedIndex: 0,
        candidates: [{ id: "a" }, { id: "b" }, { id: "c" }],
      },
    },
    renderRewardCandidates: (focus) => calls.push(["render", focus]),
    returnRewardToCategories: () => calls.push("back"),
    claimSelectedReward: (id) => calls.push(["claim", id]),
  };
  new Script(keySource + "\nthis.handleRewardKeyDown = handleRewardKeyDown;")
    .runInNewContext(sandbox);
  let prevented = 0;
  const event = (key) => ({
    key,
    preventDefault() { prevented += 1; },
  });
  sandbox.handleRewardKeyDown(event("ArrowLeft"));
  assert.equal(sandbox.game.rewardSession.selectedIndex, 2);
  sandbox.handleRewardKeyDown(event("ArrowRight"));
  assert.equal(sandbox.game.rewardSession.selectedIndex, 0);
  sandbox.handleRewardKeyDown(event("Enter"));
  sandbox.handleRewardKeyDown(event("Escape"));
  assert.deepEqual(calls, [
    ["render", true],
    ["render", true],
    ["claim", "a"],
    "back",
  ]);
  assert.equal(prevented, 4);
});

test("领取人物词条后关闭奖励会话并恢复战场焦点", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const claimSource = extractGameFunction(
    source,
    "claimSelectedReward",
    "returnRewardToCategories",
  );
  const focusTarget = { id: "game" };
  let restoredFocus;
  let rendered = 0;
  const sandbox = {
    game: {
      mode: "reward",
      player: { health: 70, maxHealth: 100 },
      playerUpgrades: { vitality: 0 },
      rewardSession: {
        active: true,
        stage: "traits",
        category: "player",
        candidates: [{ id: "vitality", name: "生命强化" }],
      },
      notice: "",
      noticeTimer: 0,
    },
    rewardDialog: { hidden: false },
    rewardReturnFocus: focusTarget,
    mouse: { down: true },
    claimReward: (session) => ({ ...session, active: false, stage: "category" }),
    applyPlayerUpgrade: () => ({
      player: { health: 85, maxHealth: 115 },
      upgrades: { vitality: 1 },
    }),
    renderWeaponBar: () => { rendered += 1; },
    restorePromptFocus: (target) => { restoredFocus = target; },
  };
  new Script(claimSource + "\nthis.claimSelectedReward = claimSelectedReward;")
    .runInNewContext(sandbox);
  assert.equal(sandbox.claimSelectedReward("vitality"), true);
  assert.equal(sandbox.game.rewardSession.active, false);
  assert.equal(sandbox.game.mode, "playing");
  assert.equal(sandbox.game.player.maxHealth, 115);
  assert.equal(sandbox.game.playerUpgrades.vitality, 1);
  assert.equal(sandbox.rewardDialog.hidden, true);
  assert.equal(sandbox.mouse.down, false);
  assert.equal(sandbox.game.notice, "获得：生命强化");
  assert.equal(restoredFocus, focusTarget);
  assert.equal(rendered, 1);
});

test("weapon reward category enables only when an unlocked weapon has an available trait", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const renderSource = extractGameFunction(
    source,
    "renderRewardCategories",
    "renderRewardCandidates",
  );
  const category = { hidden: true, innerHTML: "", querySelectorAll: () => [] };
  const sandbox = {
    game: {
      unlocked: ["pistol", "tank"],
      weaponUpgrades: { pistol: { damage: 0 } },
    },
    rewardCategoryChoices: category,
    rewardTraitChoices: { hidden: false },
    rewardStatus: { textContent: "" },
    WEAPON_TRAITS: {},
    availableWeaponTraits: () => [{ id: "damage" }],
    chooseRewardCategoryFromDialog() {},
  };
  new Script(renderSource + "\nthis.renderRewardCategories = renderRewardCategories;")
    .runInNewContext(sandbox);

  sandbox.renderRewardCategories();
  assert.match(category.innerHTML, /data-reward-category="weapon"(?! disabled)/);
  assert.match(category.innerHTML, /选择一项枪械专属词条/);

  sandbox.availableWeaponTraits = () => [];
  sandbox.renderRewardCategories();
  assert.match(category.innerHTML, /data-reward-category="weapon" disabled/);
});

test("weapon reward cards show weapon, trait, level, next effect, and stable IDs", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const renderSource = extractGameFunction(
    source,
    "renderRewardCandidates",
    "openRewardDialog",
  );
  const traitChoices = { hidden: true, innerHTML: "", querySelectorAll: () => [] };
  const sandbox = {
    game: {
      rewardSession: {
        category: "weapon",
        selectedIndex: 0,
        candidates: [{
          id: "pistol:damage",
          weaponId: "pistol",
          traitId: "damage",
          name: "高压弹",
          description: "伤害 +20%",
          level: 2,
        }],
      },
    },
    weapons: [{ id: "pistol", name: "手枪" }],
    rewardCategoryChoices: { hidden: false },
    rewardTraitChoices: traitChoices,
    rewardStatus: { textContent: "" },
    claimSelectedReward() {},
  };
  new Script(renderSource + "\nthis.renderRewardCandidates = renderRewardCandidates;")
    .runInNewContext(sandbox);
  sandbox.renderRewardCandidates();

  assert.match(traitChoices.innerHTML, /data-weapon-id="pistol"/);
  assert.match(traitChoices.innerHTML, /data-trait-id="damage"/);
  assert.match(
    traitChoices.innerHTML,
    /aria-label="手枪，高压弹，当前等级 2，下一等级：伤害 \+20%"/,
  );
  assert.match(traitChoices.innerHTML, /手枪/);
  assert.match(traitChoices.innerHTML, /高压弹/);
  assert.match(traitChoices.innerHTML, /伤害 \+20%/);
  assert.match(traitChoices.innerHTML, /当前 Lv\.2/);
  assert.match(traitChoices.innerHTML, /下一等级：伤害 \+20%/);
});

test("claiming a weapon reward increments one trait, fills capacity, and closes reward", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const claimSource = extractGameFunction(
    source,
    "claimSelectedReward",
    "returnRewardToCategories",
  );
  const upgrades = createWeaponUpgrades();
  const focusTarget = { id: "game" };
  const sandbox = {
    game: {
      mode: "reward",
      player: { ammo: { pistol: 8 } },
      playerUpgrades: {},
      weaponUpgrades: upgrades,
      rewardSession: {
        active: true,
        stage: "traits",
        category: "weapon",
        candidates: [{
          id: "pistol:magazine",
          weaponId: "pistol",
          traitId: "magazine",
          name: "扩容弹匣",
        }],
      },
    },
    rewardDialog: { hidden: false },
    rewardStatus: { textContent: "" },
    rewardReturnFocus: focusTarget,
    mouse: { down: true },
    WEAPON_TRAITS: {},
    claimReward: (session) => ({ ...session, active: false, stage: "category" }),
    applyPlayerUpgrade() { throw new Error("player path must not run"); },
    incrementWeaponTrait: (state) => {
      const next = structuredClone(state);
      next.pistol.magazine += 1;
      return { upgrades: next, deltaCapacity: 3 };
    },
    renderWeaponBar() {},
    restorePromptFocus() {},
  };
  new Script(claimSource + "\nthis.claimSelectedReward = claimSelectedReward;")
    .runInNewContext(sandbox);

  assert.equal(sandbox.claimSelectedReward("pistol:magazine"), true);
  assert.equal(sandbox.game.weaponUpgrades.pistol.magazine, 1);
  assert.equal(sandbox.game.weaponUpgrades.pistol.damage, 0);
  assert.equal(sandbox.game.player.ammo.pistol, 11);
  assert.equal(sandbox.game.rewardSession.active, false);
  assert.equal(sandbox.rewardDialog.hidden, true);
  assert.equal(sandbox.game.notice, "获得：扩容弹匣");
});

test("pistol trait numeric stats resolve at levels zero one and five", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  assert.ok(adapterSource.length > 0);
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel };
  new Script(adapterSource + "\nthis.pistolStats = pistolStats;")
    .runInNewContext(sandbox);

  assert.deepEqual({ ...sandbox.pistolStats() }, {
    damage: 32,
    fireRate: 0.24,
    bulletSpeed: 870,
    magazine: 12,
    reloadTime: 0.82,
    critChance: 0,
  });
  for (const id of ["damage", "fire_rate", "bullet_speed", "magazine", "reload", "crit"]) {
    upgrades.pistol[id] = 1;
  }
  const levelOne = sandbox.pistolStats();
  assert.ok(Math.abs(levelOne.damage - 38.4) < 1e-12);
  assert.ok(Math.abs(levelOne.fireRate - 0.216) < 1e-12);
  assert.ok(Math.abs(levelOne.bulletSpeed - 1000.5) < 1e-12);
  assert.equal(levelOne.magazine, 15);
  assert.ok(Math.abs(levelOne.reloadTime - 0.697) < 1e-12);
  assert.equal(levelOne.critChance, 0.08);
  for (const id of ["damage", "fire_rate", "bullet_speed", "magazine", "reload", "crit"]) {
    upgrades.pistol[id] = 5;
  }
  const levelFive = sandbox.pistolStats();
  assert.ok(Math.abs(levelFive.damage - 32 * 1.2 ** 5) < 1e-10);
  assert.ok(Math.abs(levelFive.fireRate - 0.24 * 0.9 ** 5) < 1e-10);
  assert.ok(Math.abs(levelFive.bulletSpeed - 870 * 1.15 ** 5) < 1e-10);
  assert.equal(levelFive.magazine, 27);
  assert.ok(Math.abs(levelFive.reloadTime - 0.82 * 0.45) < 1e-10);
  assert.equal(levelFive.critChance, 0.4);
});

test("shotgun trait numeric stats resolve at levels zero one and five", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  assert.ok(adapterSource.length > 0);
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel };
  new Script(adapterSource + "\nthis.shotgunStats = shotgunStats;")
    .runInNewContext(sandbox);

  assert.deepEqual({ ...sandbox.shotgunStats() }, {
    pellets: 9,
    damage: 42,
    spread: 0.055,
    magazine: 8,
    reloadTime: 1.25,
    bulletSpeed: 760,
  });
  for (const id of ["pellets", "damage", "spread", "magazine", "reload", "bullet_speed"]) {
    upgrades.shotgun[id] = 1;
  }
  const levelOne = sandbox.shotgunStats();
  assert.equal(levelOne.pellets, 9);
  assert.ok(Math.abs(levelOne.damage - 42 * 1.12) < 1e-12);
  assert.ok(Math.abs(levelOne.spread - 0.0484) < 1e-12);
  assert.equal(levelOne.magazine, 10);
  assert.ok(Math.abs(levelOne.reloadTime - 1.1) < 1e-12);
  assert.ok(Math.abs(levelOne.bulletSpeed - 851.2) < 1e-12);
  for (const id of ["pellets", "damage", "spread", "magazine", "reload", "bullet_speed"]) {
    upgrades.shotgun[id] = 5;
  }
  const levelFive = sandbox.shotgunStats();
  assert.equal(levelFive.pellets, 9);
  assert.ok(Math.abs(levelFive.damage - 42 * 1.12 ** 5) < 1e-10);
  assert.ok(Math.abs(levelFive.spread - 0.055 * 0.88 ** 5) < 1e-10);
  assert.equal(levelFive.magazine, 18);
  assert.ok(Math.abs(levelFive.reloadTime - 1.25 * 0.88 ** 5) < 1e-10);
  assert.ok(Math.abs(levelFive.bulletSpeed - 760 * 1.12 ** 5) < 1e-10);
});

test("pistol trait fire applies crit twin shot and pierce metadata", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const fireSource = source.slice(
    source.indexOf("function fireBullet("),
    source.indexOf("function cancelWatermelonCharge("),
  );
  const game = {
    nextId: 1,
    bullets: [],
    delayedShots: [],
    player: { x: 20, y: 30, weapon: "pistol", ammo: { pistol: 12 } },
  };
  const sandbox = {
    game,
    pistolStats: () => ({ damage: 32, bulletSpeed: 870, critChance: 0.08 }),
    shotgunStats: () => ({}),
    hasWeaponTrait: (_state, weaponId, traitId) =>
      weaponId === "pistol" && ["pierce", "twin_shot"].includes(traitId),
    readCombatRoll: () => 0,
  };
  new Script(fireSource + "\nthis.firePistol = firePistol;")
    .runInNewContext(sandbox);
  sandbox.firePistol(0, () => 0);

  assert.equal(game.bullets.length, 2);
  for (const bullet of game.bullets) {
    assert.ok(Math.abs(bullet.damage - 32 * 1.8 * 0.7) < 1e-10);
    assert.equal(bullet.source, "pistol");
    assert.equal(bullet.remainingPierces, 2);
    assert.equal(bullet.originX, 20);
    assert.equal(bullet.originY, 30);
  }
  assert.notEqual(game.bullets[0].vy, game.bullets[1].vy);
});

test("pistol and shotgun trait hits apply execute close damage pierce and knockback", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const hitSource = source.slice(
    source.indexOf("function damageEnemy("),
    source.indexOf("function triggerEnemyHurt("),
  );
  const sandbox = {
    normalize,
    triggerEnemyHurt() {},
  };
  new Script(
    hitSource +
      "\nthis.playerBulletDamage = playerBulletDamage;" +
      "\nthis.applyDirectBulletHit = applyDirectBulletHit;",
  ).runInNewContext(sandbox);

  const executeBullet = { damage: 10, source: "pistol", execute: true };
  assert.equal(sandbox.playerBulletDamage(executeBullet, {
    kind: "zombie", health: 19.99, maxHealth: 100, x: 0, y: 0,
  }), 16);
  assert.equal(sandbox.playerBulletDamage(executeBullet, {
    kind: "zombie", health: 20, maxHealth: 100, x: 0, y: 0,
  }), 10);
  assert.equal(sandbox.playerBulletDamage(executeBullet, {
    kind: "boss", health: 10, maxHealth: 100, x: 0, y: 0,
  }), 10);

  const pellet = {
    damage: 10,
    source: "shotgun",
    closeDamage: true,
    knockback: true,
    originX: 0,
    originY: 0,
    vx: 100,
    vy: 0,
    remainingPierces: 1,
    hitIds: [],
    life: 1,
  };
  const enemy = {
    id: 7,
    kind: "zombie",
    health: 100,
    maxHealth: 100,
    x: 150,
    y: 0,
  };
  assert.equal(sandbox.applyDirectBulletHit(pellet, enemy), true);
  assert.equal(enemy.health, 87);
  assert.ok(enemy.x > 150);
  assert.equal(pellet.remainingPierces, 0);
  assert.equal(pellet.life, 1);
  assert.deepEqual(pellet.hitIds, [7]);

  const boss = { id: 8, kind: "boss", health: 100, maxHealth: 100, x: 20, y: 0 };
  const bossPellet = { ...pellet, remainingPierces: 0, hitIds: [], life: 1 };
  sandbox.applyDirectBulletHit(bossPellet, boss);
  assert.equal(boss.x, 20);
  assert.equal(bossPellet.life, 0);
});

test("pistol trait kill reload caps at upgraded magazine", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const hitSource = source.slice(
    source.indexOf("function damageEnemy("),
    source.indexOf("function triggerEnemyHurt("),
  );
  const game = {
    weaponUpgrades: {},
    player: { ammo: { pistol: 10 } },
  };
  const sandbox = {
    game,
    normalize,
    triggerEnemyHurt() {},
    hasWeaponTrait: () => true,
    pistolStats: () => ({ magazine: 12 }),
  };
  new Script(hitSource + "\nthis.refillPistolOnKill = refillPistolOnKill;")
    .runInNewContext(sandbox);
  assert.equal(sandbox.refillPistolOnKill("pistol"), true);
  assert.equal(game.player.ammo.pistol, 11);
  game.player.ammo.pistol = 12;
  assert.equal(sandbox.refillPistolOnKill("pistol"), false);
  assert.equal(sandbox.refillPistolOnKill("shotgun"), false);
});

test("shotgun repeatedly fires nine distinct symmetric fan rays from one muzzle", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const fireSource = source.slice(
    source.indexOf("function fireBullet("),
    source.indexOf("function updateDelayedShots("),
  );
  const game = {
    nextId: 1,
    bullets: [],
    delayedShots: [],
    player: { x: 40, y: 70, weapon: "shotgun" },
  };
  const sandbox = {
    game,
    pistolStats: () => ({}),
    shotgunStats: () => ({
      pellets: 5,
      damage: 42,
      spread: 0.055,
      bulletSpeed: 760,
    }),
    hasWeaponTrait: () => false,
    readCombatRoll: (random) => random(),
    shotgunPelletAngles,
  };
  new Script(fireSource + "\nthis.fireShotgun = fireShotgun;")
    .runInNewContext(sandbox);

  for (const angle of [0, Math.PI / 2, Math.PI, -0.7]) {
    for (let shot = 0; shot < 8; shot += 1) {
      const before = game.bullets.length;
      sandbox.fireShotgun(angle, { random: () => shot / 8 });
      const volley = game.bullets.slice(before);
      assert.equal(volley.length, 9);
      assert.equal(new Set(volley.map(({ x, y }) => `${x},${y}`)).size, 1);
      assert.equal(new Set(volley.map(({ vx, vy }) => `${vx},${vy}`)).size, 9);
      for (let index = 0; index < 9; index += 1) {
        const bullet = volley[index];
        const dx = bullet.x - (40 + Math.cos(angle) * 28);
        const dy = bullet.y - (70 + Math.sin(angle) * 18);
        assert.ok(Math.abs(dx) < 1e-9);
        assert.ok(Math.abs(dy) < 1e-9);
        assert.equal(bullet.damage, 42);
        assert.equal(bullet.radius, 3);
        assert.ok(Math.abs(Math.hypot(bullet.vx, bullet.vy) - 760) < 1e-9);
        const offset = (index - 4) * 0.0825;
        assert.ok(Math.abs(bullet.vx - Math.cos(angle + offset) * 760) < 1e-9);
        assert.ok(Math.abs(bullet.vy - Math.sin(angle + offset) * 760) < 1e-9);
        const lateral = -bullet.vx * Math.sin(angle) + bullet.vy * Math.cos(angle);
        const opposite = volley[8 - index];
        assert.ok(Math.abs(lateral - opposite.vx * Math.sin(angle) + opposite.vy * Math.cos(angle)) < 1e-9);
      }
    }
  }
});

test("legacy shotgun echo cannot add pellets or schedule free shots", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const fireSource = source.slice(
    source.indexOf("function fireBullet("),
    source.indexOf("function cancelWatermelonCharge("),
  );
  const game = {
    nextId: 1,
    bullets: [],
    delayedShots: [],
    player: { x: 0, y: 0, weapon: "shotgun", ammo: { shotgun: 5 } },
  };
  const sandbox = {
    game,
    pistolStats: () => ({}),
    shotgunStats: () => ({
      pellets: 5,
      damage: 21,
      spread: 0.05,
      bulletSpeed: 760,
    }),
    hasWeaponTrait: (_state, weaponId, traitId) =>
      weaponId === "shotgun" && ["pierce", "close_damage", "knockback", "echo"].includes(traitId),
    readCombatRoll: () => 0,
    shotgunPelletAngles,
  };
  new Script(
    fireSource +
      "\nthis.fireShotgun = fireShotgun;" +
      "\nthis.updateDelayedShots = updateDelayedShots;",
  ).runInNewContext(sandbox);

  sandbox.fireShotgun(0, { random: () => 0 });
  assert.equal(game.bullets.length, 9);
  assert.equal(game.delayedShots.length, 0);
  assert.equal(game.player.ammo.shotgun, 5);
  for (const bullet of game.bullets) {
    assert.equal(bullet.remainingPierces, 1);
    assert.equal(bullet.closeDamage, true);
    assert.equal(bullet.knockback, true);
  }
  game.delayedShots.push({ weaponId: "shotgun", angle: 0, delay: 0.12 });
  sandbox.updateDelayedShots(0.12);
  assert.equal(game.bullets.length, 9);
  assert.equal(game.delayedShots.length, 0);
  assert.equal(game.player.ammo.shotgun, 5);
});

test("rocket trait and flamethrower trait numeric adapters preserve base and stacking", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(
    adapterSource +
      "\nthis.rocketStats = rocketStats;" +
      "\nthis.flamethrowerStats = flamethrowerStats;",
  ).runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.rocketStats() }, {
    damage: 105, blastRadius: 132, speed: 520, fireRate: 1.1,
    capacity: 12, supplyAmount: 4,
  });
  assert.deepEqual({ ...sandbox.flamethrowerStats() }, {
    damage: 12, range: 430, coneAngle: Math.acos(0.72), fireRate: 0.06,
    capacity: 200, supplyAmount: 100,
  });
  for (const id of ["damage", "blast_radius", "speed", "fire_rate", "capacity", "supply"]) {
    upgrades.rocket[id] = 5;
  }
  for (const id of ["damage", "range", "cone", "fire_rate", "capacity", "supply"]) {
    upgrades.flamethrower[id] = 5;
  }
  const rocket = sandbox.rocketStats();
  assert.ok(Math.abs(rocket.damage - 105 * 1.2 ** 5) < 1e-9);
  assert.ok(Math.abs(rocket.blastRadius - 132 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(rocket.speed - 520 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(rocket.fireRate - 1.1 * 0.88 ** 5) < 1e-9);
  assert.equal(rocket.capacity, 22);
  assert.equal(rocket.supplyAmount, 9);
  const flame = sandbox.flamethrowerStats();
  assert.ok(Math.abs(flame.damage - 12 * 1.18 ** 5) < 1e-9);
  assert.ok(Math.abs(flame.range - 430 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(flame.coneAngle - Math.acos(0.72) * 1.12 ** 5) < 1e-9);
  assert.ok(Math.abs(flame.fireRate - 0.06 * 0.92 ** 5) < 1e-9);
  assert.equal(flame.capacity, 350);
  assert.equal(flame.supplyAmount, 200);
});

test("rocket blast deals full damage inside radius and resolves only once", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const rocketSource = extractGameFunction(source, "explodeRocket", "shatterWatermelon");
  const game = {
    enemies: [
      { id: 1, kind: "zombie", x: 0, y: 0, health: 500 },
      { id: 2, kind: "zombie", x: 99, y: 0, health: 500 },
      { id: 3, kind: "zombie", x: 101, y: 0, health: 500 },
    ],
    bullets: [],
    damageZones: [],
  };
  const sandbox = {
    game,
    clamp,
    distance,
    damageEnemy: (enemy, amount) => { enemy.health -= amount; },
    burst() {},
    ensureSound: () => () => {},
    TAU,
    Math,
  };
  new Script(rocketSource + "\nthis.explodeRocket = explodeRocket;")
    .runInNewContext(sandbox);
  const rocket = { x: 0, y: 0, damage: 100, blastRadius: 100, source: "rocket" };

  assert.equal(sandbox.explodeRocket(rocket), true);
  assert.deepEqual(game.enemies.map(({ health }) => health), [400, 400, 500]);
  assert.equal(sandbox.explodeRocket(rocket), false);
  assert.deepEqual(game.enemies.map(({ health }) => health), [400, 400, 500]);
});

test("rocket trait explosion creates cluster ground fire armor break and shock slow", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const rocketSource = extractGameFunction(source, "explodeRocket", "shatterWatermelon");
  const game = {
    time: 10,
    nextId: 1,
    bullets: [],
    damageZones: [],
    enemies: [
      { id: 1, kind: "boss", x: 0, y: 0, radius: 10, health: 500, maxHealth: 500, slowStatuses: [] },
      { id: 2, kind: "brute", x: 20, y: 0, radius: 10, health: 500, maxHealth: 500, slowStatuses: [] },
      { id: 3, kind: "zombie", x: 30, y: 0, radius: 10, health: 500, maxHealth: 500, slowStatuses: [] },
    ],
  };
  const sandbox = {
    game,
    distance,
    clamp,
    damageEnemy: (enemy, amount, sourceId) => {
      enemy.health -= amount;
      enemy.lastDamageSource = sourceId;
      return true;
    },
    burst() {},
    ensureSound: () => () => {},
    TAU,
    Math,
  };
  new Script(rocketSource + "\nthis.explodeRocket = explodeRocket;")
    .runInNewContext(sandbox);
  sandbox.explodeRocket({
    x: 0, y: 0, damage: 100, blastRadius: 100, source: "rocket",
    cluster: true, burningGround: true, armorBreak: true, shockSlow: true,
  });
  assert.equal(game.bullets.length, 4);
  assert.ok(game.bullets.every((bullet) => bullet.clusterChild && bullet.damage === 20));
  assert.equal(game.damageZones[0].source, "rocket");
  assert.ok(Math.abs(game.damageZones[0].radius - 55) < 1e-12);
  assert.equal(game.damageZones[0].dps, 25);
  assert.equal(game.damageZones[0].life, 3);
  assert.ok(game.enemies[0].health < game.enemies[2].health);
  assert.ok(game.enemies[1].health < game.enemies[2].health);
  assert.equal(game.enemies[0].slowStatuses.length, 0);
  assert.deepEqual({ ...game.enemies[2].slowStatuses[0] }, {
    source: "rocket-shock", amount: 0.35, expiresAt: 11.5,
  });
});

test("flamethrower trait applies burn heat armor and refreshed scorched ground", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const flameSource = extractGameFunction(source, "fireFlame", "fireLaser");
  const enemy = {
    id: 1, kind: "zombie", x: 100, y: 0, radius: 16,
    health: 200, maxHealth: 200, damageOverTime: [],
  };
  const game = {
    time: 0,
    enemies: [enemy],
    particles: [],
    damageZones: [],
    player: { x: 0, y: 0 },
  };
  const sandbox = {
    game,
    flamethrowerStats: () => ({
      damage: 12, range: 430, coneAngle: Math.acos(0.72), fireRate: 0.06,
    }),
    hasWeaponTrait: () => true,
    flameDamageAtDistance,
    damageEnemy: (target, amount, sourceId) => {
      target.health -= amount;
      target.lastDamageSource = sourceId;
      return true;
    },
    Math,
  };
  new Script(flameSource + "\nthis.fireFlame = fireFlame;")
    .runInNewContext(sandbox);
  sandbox.fireFlame(0);
  assert.equal(enemy.lastDamageSource, "flamethrower");
  assert.deepEqual({ ...enemy.damageOverTime[0] }, {
    source: "flamethrower", dps: 3, expiresAt: 2,
  });
  assert.equal(game.damageZones.length, 1);
  assert.equal(game.damageZones[0].life, 1.5);
  for (let tick = 1; tick <= 11; tick += 1) {
    game.time = tick * 0.1;
    sandbox.fireFlame(0);
  }
  assert.ok(enemy.health < 200 - 24);
  assert.equal(game.damageZones.length, 1);
  assert.equal(game.damageZones[0].life, 1.5);
});

test("flamethrower trait corpse burst and damage zones retain source attribution", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateBulletsSource = extractGameFunction(source, "updateBullets", "explode");
  const updateZonesSource = extractGameFunction(source, "updateDamageZones", "updateSpikeTraps");
  const explosions = [];
  const deadEnemy = {
    id: 1,
    kind: "zombie",
    x: 20,
    y: 30,
    radius: 16,
    health: 0,
    maxHealth: 40,
    attackAnimation: 0,
    lastDamageSource: "flamethrower",
  };
  const game = {
    enemies: [deadEnemy],
    bullets: [],
    enemyDeathAnimations: [],
    decals: [],
    particles: [],
    damageZones: [],
    combo: 1,
    kills: 0,
    score: 0,
    unlocked: ["pistol"],
  };
  const sandbox = {
    game,
    tankTrialSession: { active: false },
    WIDTH,
    HEIGHT,
    ZOMBIE_ACTIONS: { death: { frames: 3, fps: 10 } },
    Math,
    Number,
    clamp,
    distance,
    hasWeaponTrait: (_game, weaponId, traitId) =>
      weaponId === "flamethrower" && traitId === "corpse_burst",
    flamethrowerStats: () => ({ damage: 20 }),
    explode: (...args) => explosions.push(args),
    createEnemySupplies() {},
    createGas() {},
    detonateEnemy() {},
    triggerEnemyAttack() {},
    burst() {},
    ensureSound: () => () => {},
    applyKill() {},
    damageEnemy: (enemy, amount, sourceId) => {
      enemy.health -= amount;
      enemy.lastDamageSource = sourceId;
      return true;
    },
  };
  new Script(
    `${updateBulletsSource}\n${updateZonesSource}\n` +
      "this.updateBullets = updateBullets;this.updateDamageZones = updateDamageZones;",
  ).runInNewContext(sandbox);
  sandbox.updateBullets(0);
  assert.deepEqual(explosions[0], [20, 30, 70, 12, "flamethrower"]);

  const inside = { id: 2, x: 10, y: 0, radius: 10, health: 100 };
  const outside = { id: 3, x: 100, y: 0, radius: 10, health: 100 };
  game.enemies = [inside, outside];
  game.damageZones = [
    { source: "rocket", x: 0, y: 0, radius: 40, dps: 20, life: 0.75, maxLife: 3 },
  ];
  sandbox.updateDamageZones(0.5);
  assert.equal(inside.health, 90);
  assert.equal(inside.lastDamageSource, "rocket");
  assert.equal(outside.health, 100);
  assert.equal(game.damageZones[0].life, 0.25);
  sandbox.updateDamageZones(0.5);
  assert.equal(game.damageZones.length, 0);
});

test("damage zone state starts empty and is independent", () => {
  const first = createGameState();
  const second = createGameState();
  assert.deepEqual(first.damageZones, []);
  assert.notEqual(first.damageZones, second.damageZones);
  first.damageZones.push({ source: "rocket" });
  assert.deepEqual(second.damageZones, []);
});

test("laser trait and ricochet trait numeric adapters preserve base and stacking", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(
    adapterSource +
      "\nthis.laserStats = laserStats;" +
      "\nthis.ricochetStats = ricochetStats;",
  ).runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.laserStats() }, {
    damage: 145, width: 8, range: 980, fireRate: 1.35,
    capacity: 15, supplyAmount: 5,
  });
  assert.deepEqual({ ...sandbox.ricochetStats() }, {
    damage: 48, projectiles: 3, bounces: 8, speed: 620,
    radius: 7, fireRate: 0.85,
  });
  for (const id of ["damage", "width", "range", "fire_rate", "capacity", "supply"]) {
    upgrades.laser[id] = 5;
  }
  for (const id of ["damage", "projectiles", "bounces", "speed", "radius", "fire_rate"]) {
    upgrades.ricochet[id] = 5;
  }
  const laser = sandbox.laserStats();
  assert.ok(Math.abs(laser.damage - 145 * 1.2 ** 5) < 1e-9);
  assert.ok(Math.abs(laser.width - 8 * 1.25 ** 5) < 1e-9);
  assert.ok(Math.abs(laser.range - 980 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(laser.fireRate - 1.35 * 0.88 ** 5) < 1e-9);
  assert.equal(laser.capacity, 25);
  assert.equal(laser.supplyAmount, 10);
  const ricochet = sandbox.ricochetStats();
  assert.ok(Math.abs(ricochet.damage - 48 * 1.18 ** 5) < 1e-9);
  assert.equal(ricochet.projectiles, 6);
  assert.equal(ricochet.bounces, 18);
  assert.ok(Math.abs(ricochet.speed - 620 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(ricochet.radius - 7 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(ricochet.fireRate - 0.85 * 0.9 ** 5) < 1e-9);
});

test("laser trait shares one ray path for prism reflection boss focus and kill recharge", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const rayStart = source.indexOf("function fireLaserRay(");
  assert.ok(rayStart >= 0, "fireLaserRay should isolate beam collision geometry");
  const raySource = source.slice(rayStart, source.indexOf("function useWeapon(", rayStart));
  const makeEnemy = (id, kind, x, y, health) => ({
    id, kind, x, y, radius: 12, health, maxHealth: health,
  });
  const game = {
    player: { x: 100, y: 360 },
    enemies: [
      makeEnemy(1, "zombie", 220, 360, 50),
      makeEnemy(2, "zombie", 340, 360, 50),
      makeEnemy(3, "zombie", 460, 360, 50),
      makeEnemy(4, "zombie", 580, 360, 50),
      makeEnemy(5, "boss", 700, 360, 500),
    ],
    beams: [],
  };
  const stats = {
    damage: 100, width: 8, range: 1900, fireRate: 1.35,
    capacity: 15, supplyAmount: 5,
  };
  const sandbox = {
    game,
    WIDTH,
    HEIGHT,
    Math,
    normalize,
    rayArenaIntersection,
    reflectRayAtBoundary,
    laserStats: () => stats,
    hasWeaponTrait: () => true,
    damageEnemy: (enemy, amount, sourceId) => {
      if (enemy.health <= 0) return false;
      enemy.health -= amount;
      enemy.lastDamageSource = sourceId;
      return true;
    },
  };
  new Script(
    raySource + "\nthis.fireLaserRay = fireLaserRay;this.fireLaser = fireLaser;",
  ).runInNewContext(sandbox);
  const ray = sandbox.fireLaserRay(
    { x: 100, y: 360 },
    { x: 1, y: 0 },
    stats,
    { reflect: true, bossFocus: true },
  );
  assert.equal(ray.segments.length, 2);
  assert.deepEqual([...ray.hitIds], [1, 2, 3, 4, 5]);
  assert.deepEqual([...ray.killedIds], [1, 2, 3, 4]);
  assert.equal(game.enemies[4].health, 365);
  assert.equal(game.enemies[4].lastDamageSource, "laser");

  game.enemies = [
    makeEnemy(6, "zombie", 220, 360, 50),
    makeEnemy(7, "zombie", 340, 360, 50),
    makeEnemy(8, "zombie", 460, 360, 50),
    makeEnemy(9, "zombie", 580, 360, 50),
  ];
  game.beams = [];
  assert.equal(sandbox.fireLaser(0), 4);
  assert.equal(game.beams.length, 4);
  assert.equal(game.beams.filter(({ width }) => width === 8).length, 2);
  assert.equal(game.beams.filter(({ width }) => width === 4.4).length, 2);
});

test("laser trait refunds one consumed charge after at least four kills", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const useSource = extractGameFunction(source, "useWeapon", "placeStructure");
  const player = {
    weapon: "laser", cooldown: 0, reload: 0, dodgeDuration: 0,
    aimX: 1, aimY: 0, x: 100, y: 100, ammo: { laser: 2 },
  };
  const sandbox = {
    game: { player },
    weapons: [{ id: "laser", fireRate: 1.35 }],
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    hasUsableAmmo: () => true,
    shouldConsumeAmmo: () => true,
    triggerWeaponVisual: () => true,
    hasWeaponTrait: (_game, weaponId, traitId) =>
      weaponId === "laser" && traitId === "kill_recharge",
    laserStats: () => ({ fireRate: 1.1, capacity: 15 }),
    fireLaser: () => 4,
    ensureSound: () => () => {},
    burst() {},
    Math,
  };
  new Script(useSource + "\nthis.useWeapon = useWeapon;").runInNewContext(sandbox);
  sandbox.useWeapon();
  assert.equal(player.ammo.laser, 2);
  assert.equal(player.cooldown, 1.1);
});

test("ricochet trait fires numeric projectiles with safe unique metadata", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const useSource = extractGameFunction(source, "useWeapon", "placeStructure");
  const fired = [];
  const player = {
    weapon: "ricochet", cooldown: 0, reload: 0, dodgeDuration: 0,
    aimX: 1, aimY: 0, x: 100, y: 100, ammo: { ricochet: 3 },
  };
  const sandbox = {
    game: { player },
    weapons: [{ id: "ricochet", fireRate: 0.85 }],
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    hasUsableAmmo: () => true,
    shouldConsumeAmmo: () => true,
    triggerWeaponVisual: () => true,
    hasWeaponTrait: () => true,
    ricochetStats: () => ({
      damage: 60, projectiles: 4, bounces: 10, speed: 700,
      radius: 9, fireRate: 0.7,
    }),
    fireBullet: (...args) => fired.push(args),
    ensureSound: () => () => {},
    burst() {},
    Math,
  };
  new Script(useSource + "\nthis.useWeapon = useWeapon;").runInNewContext(sandbox);
  sandbox.useWeapon();
  assert.equal(fired.length, 4);
  assert.deepEqual(fired.map(([angle]) => angle), [-0.12, -0.04, 0.04, 0.12]);
  for (const [, damage, speed, radius, , metadata] of fired) {
    assert.equal(damage, 60);
    assert.equal(speed, 700);
    assert.equal(radius, 9);
    assert.equal(metadata.bounces, 10);
    assert.equal(metadata.wallBounceCount, 0);
    assert.equal(metadata.bouncePower, true);
    assert.equal(metadata.homing, true);
    assert.equal(metadata.microBlast, true);
    assert.equal(metadata.canSplit, true);
    assert.equal(metadata.isSplitChild, false);
  }
  assert.equal(player.ammo.ricochet, 2);
  assert.equal(player.cooldown, 0.7);
});

test("ricochet trait powers homes blasts once and splits once on third bounce", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateStart = source.indexOf("function nearestRicochetTarget(");
  assert.ok(updateStart >= 0, "nearestRicochetTarget should isolate homing selection");
  const updateSource = source.slice(updateStart, source.indexOf("function explodeRocket(", updateStart));
  const explosions = [];
  const target = {
    id: 1, kind: "zombie", x: 1000, y: 200, radius: 12,
    health: 1000, maxHealth: 1000,
  };
  const parent = {
    id: 1, owner: "player", kind: "ricochet", source: "ricochet",
    x: WIDTH - 8, y: 100, vx: 200, vy: 0, radius: 7,
    damage: 100, life: 6, bounces: 8, wallBounceCount: 2,
    hitIds: [], microBlastHitIds: [], bouncePower: true, homing: true,
    microBlast: true, canSplit: true, isSplitChild: false,
  };
  const game = {
    nextId: 10,
    player: { x: 0, y: 0 },
    enemies: [target],
    bullets: [parent],
    enemyDeathAnimations: [], decals: [], particles: [],
    combo: 1, kills: 0, score: 0, unlocked: ["pistol"],
  };
  const sandbox = {
    game,
    advanceRicochetProjectile,
    WIDTH,
    HEIGHT,
    ZOMBIE_ACTIONS: { death: { frames: 3, fps: 10 } },
    tankTrialSession: { active: false },
    Math,
    clamp,
    distance,
    normalize,
    damageEnemy: (enemy, amount, sourceId) => {
      enemy.health -= amount;
      enemy.lastDamageSource = sourceId;
      return true;
    },
    explode: (...args) => explosions.push(args),
    createEnemySupplies() {}, createGas() {}, detonateEnemy() {},
    triggerEnemyAttack() {}, burst() {}, ensureSound: () => () => {}, applyKill() {},
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;").runInNewContext(sandbox);
  sandbox.updateBullets(0.1);
  assert.equal(parent.wallBounceCount, 3);
  assert.ok(Math.abs(parent.damage - 112) < 1e-9);
  assert.ok(parent.vx < 0 && parent.vy > 0);
  const children = game.bullets.filter(({ isSplitChild }) => isSplitChild);
  assert.equal(children.length, 2);
  assert.ok(children.every(({ damage }) => Math.abs(damage - 50.4) < 1e-9));
  assert.ok(children.every(({ canSplit }) => canSplit === false));

  parent.x = target.x - target.radius - parent.radius - 1;
  parent.y = target.y;
  parent.vx = 200;
  parent.vy = 0;
  sandbox.updateBullets(.01);
  const [, , blastRadius, blastDamage, blastSource] = explosions.at(-1);
  assert.equal(blastRadius, 45);
  assert.ok(Math.abs(blastDamage - 50.4) < 1e-9);
  assert.equal(blastSource, "ricochet");
  const explosionCount = explosions.length;
  parent.hitIds = [];
  sandbox.updateBullets(.01);
  assert.equal(explosions.length, explosionCount);
});

test("turret trait numeric stats preserve base and stacking", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const adapterSource = source.slice(
    source.indexOf("function hasWeaponTrait("),
    source.indexOf("function switchWeapon("),
  );
  const upgrades = createWeaponUpgrades();
  const sandbox = { game: { weaponUpgrades: upgrades }, weaponStat, traitLevel, Math };
  new Script(adapterSource + "\nthis.turretStats = turretStats;")
    .runInNewContext(sandbox);
  assert.deepEqual({ ...sandbox.turretStats() }, {
    health: 120, range: 310, damage: 14, fireRate: 0.18,
    bulletSpeed: 650, capacity: 2,
  });
  for (const id of ["health", "range", "damage", "fire_rate", "speed", "capacity"]) {
    upgrades.turret[id] = 5;
  }
  const stats = sandbox.turretStats();
  assert.ok(Math.abs(stats.health - 120 * 1.25 ** 5) < 1e-9);
  assert.ok(Math.abs(stats.range - 310 * 1.15 ** 5) < 1e-9);
  assert.ok(Math.abs(stats.damage - 14 * 1.18 ** 5) < 1e-9);
  assert.ok(Math.abs(stats.fireRate - 0.18 * 0.9 ** 5) < 1e-9);
  assert.ok(Math.abs(stats.bulletSpeed - 650 * 1.15 ** 5) < 1e-9);
  assert.equal(stats.capacity, 7);
});

test("turret trait placement snapshots stats and unique flags", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const placeSource = extractGameFunction(source, "placeStructure", "spawnEnemy");
  const game = {
    nextId: 1,
    structures: [],
    player: { ammo: { turret: 2 }, cooldown: 0 },
  };
  const snapshot = {
    health: 180, range: 360, damage: 20, fireRate: 0.14,
    bulletSpeed: 720, capacity: 4,
  };
  const sandbox = {
    game,
    mouse: { x: 200, y: 300 },
    developerSession: { enabled: false, infiniteAmmo: false },
    tankTrialSession: { active: false },
    hasUsableAmmo: () => true,
    STRUCTURE_LIMITS,
    validPlacement: () => true,
    shouldConsumeAmmo: () => true,
    turretStats: () => snapshot,
    hasWeaponTrait: () => true,
    ensureSound: () => () => {},
    burst() {}, renderWeaponBar() {},
  };
  new Script(placeSource + "\nthis.placeStructure = placeStructure;")
    .runInNewContext(sandbox);
  sandbox.placeStructure("turret");
  const turret = game.structures[0];
  assert.deepEqual({
    health: turret.health,
    maxHealth: turret.maxHealth,
    attackRange: turret.attackRange,
    bulletDamage: turret.bulletDamage,
    fireRate: turret.fireRate,
    bulletSpeed: turret.bulletSpeed,
    twinBarrel: turret.twinBarrel,
    repair: turret.repair,
    grenadeCycle: turret.grenadeCycle,
    heavyTargeting: turret.heavyTargeting,
    timeSinceHit: turret.timeSinceHit,
    shotsFired: turret.shotsFired,
  }, {
    health: 180, maxHealth: 180, attackRange: 360, bulletDamage: 20,
    fireRate: 0.14, bulletSpeed: 720, twinBarrel: true, repair: true,
    grenadeCycle: true, heavyTargeting: true, timeSinceHit: 0, shotsFired: 0,
  });
  snapshot.damage = 999;
  assert.equal(turret.bulletDamage, 20);
});

test("turret trait repairs after five seconds and fires heavy eighth-shot grenade twins", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const hurtStart = source.indexOf("function hurtStructure(");
  assert.ok(hurtStart >= 0, "hurtStructure should reset the repair timer");
  const structureSource = source.slice(
    hurtStart,
    source.indexOf("function densestTarget(", hurtStart),
  );
  const turret = {
    id: 1, kind: "turret", x: 0, y: 0, radius: 24,
    health: 100, maxHealth: 200, cooldown: 0,
    attackRange: 400, bulletDamage: 14, fireRate: 0.18, bulletSpeed: 650,
    twinBarrel: true, repair: true, grenadeCycle: true, heavyTargeting: true,
    timeSinceHit: 4.9, shotsFired: 7,
  };
  const normal = { id: 1, kind: "zombie", x: 40, y: 0, health: 100 };
  const boss = { id: 2, kind: "boss", x: 200, y: 0, health: 1000 };
  const game = { nextId: 10, structures: [turret], enemies: [], bullets: [] };
  const sandbox = {
    game,
    developerSession: { enabled: false },
    distance,
    normalize,
    strongestSlow: () => 0,
    densestTarget: (targets) => targets[0],
    hurtPlayer() {},
    triggerEnemyAttack() {},
    createGas() {},
    resolveStaticCollision() {},
    updateEnemyGasTrail() {},
    spawnEnemy() {},
    ensureSound: () => () => {},
    Math,
  };
  new Script(
    structureSource +
      "\nthis.hurtStructure = hurtStructure;" +
      "this.updateEnemies = updateEnemies;this.updateStructures = updateStructures;",
  ).runInNewContext(sandbox);
  sandbox.updateStructures(0.05);
  assert.equal(turret.health, 100);
  sandbox.updateStructures(0.1);
  assert.ok(Math.abs(turret.health - 100.8) < 1e-9);
  sandbox.hurtStructure(turret, 10);
  assert.ok(Math.abs(turret.health - 90.8) < 1e-9);
  assert.equal(turret.timeSinceHit, 0);

  game.enemies = [normal, boss];
  turret.cooldown = 0;
  sandbox.updateStructures(0);
  assert.equal(turret.shotsFired, 8);
  assert.equal(game.bullets.length, 2);
  const [grenade, twin] = game.bullets;
  assert.equal(grenade.kind, "turret-grenade");
  assert.equal(grenade.blastRadius, 65);
  assert.ok(Math.abs(grenade.damage - 14 * 1.3) < 1e-9);
  assert.equal(grenade.targetId, boss.id);
  assert.ok(Math.abs(twin.damage - 14 * 1.3 * 0.55) < 1e-9);
  assert.equal(twin.source, "turret");
  assert.equal(turret.cooldown, 0.18);

  Object.assign(normal, {
    x: 0, y: 0, speed: 0, damage: 8, radius: 18,
    attackCooldown: 0, shotCooldown: 1, hitFlash: 0,
    animationTime: 0, attackAnimation: 0, hurtAnimation: 0,
  });
  game.player = { x: 1000, y: 800 };
  game.enemies = [normal];
  turret.health = 100;
  turret.timeSinceHit = 9;
  sandbox.updateEnemies(0);
  assert.equal(turret.health, 92);
  assert.equal(turret.timeSinceHit, 0);
});

test("turret trait grenade explodes on expiry with turret attribution", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "updateBullets", "explode");
  const calls = [];
  const game = {
    player: { x: 0, y: 0 },
    enemies: [],
    bullets: [{
      id: 1, owner: "player", kind: "turret-grenade", source: "turret",
      x: 100, y: 100, vx: 0, vy: 0, radius: 5,
      damage: 18, blastRadius: 65, life: 0, exploded: false,
    }],
    enemyDeathAnimations: [], decals: [], particles: [],
    combo: 1, kills: 0, score: 0, unlocked: ["pistol"],
  };
  const sandbox = {
    game, WIDTH, HEIGHT, Math, clamp, distance, normalize,
    tankTrialSession: { active: false },
    ZOMBIE_ACTIONS: { death: { frames: 3, fps: 10 } },
    explode: (...args) => calls.push(args),
    burst() {}, ensureSound: () => () => {},
  };
  new Script(updateSource + "\nthis.updateBullets = updateBullets;")
    .runInNewContext(sandbox);
  sandbox.updateBullets(0);
  assert.deepEqual(calls[0], [100, 100, 65, 18, "turret"]);
});

test("坦克试炼布局突出左侧碎片并支持窄屏与减弱动画", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const rules = collectCssRules(css);
  assert.equal(
    rules.some((rule) =>
      rule.selector === ".tank-trial-result" && rule.atRules.length === 0
    ),
    true,
  );
  const card = rules.find((rule) =>
    rule.selector === ".tank-trial-card" && rule.atRules.length === 0
  );
  const art = rules.find((rule) =>
    rule.selector === ".tank-trial-art" && rule.atRules.length === 0
  );
  const dialog = rules.find((rule) =>
    rule.selector === ".tank-trial-dialog" && rule.atRules.length === 0
  );
  const fragmentImageLayer = rules.find((rule) =>
    rule.selector.includes(".tank-trial-art-base") &&
      rule.selector.includes(".tank-trial-fragment") &&
      rule.atRules.length === 0
  );
  const hiddenDialog = rules.find((rule) =>
    rule.selector.split(",").some((selector) =>
      selector.trim() === ".tank-trial-dialog[hidden]"
    )
  );
  const mobileCard = rules.find(
    (rule) => rule.selector === ".tank-trial-card" &&
      rule.atRules.some((atRule) => /@media\s*\(max-width:\s*760px\)/.test(atRule)),
  );
  const reducedFragment = rules.find(
    (rule) => /tank-trial-fragment/.test(rule.selector) &&
      rule.atRules.some((atRule) =>
        /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(atRule)
      ),
  );
  const lowHeightDialog = rules.find(
    (rule) => rule.selector === ".tank-trial-dialog" &&
      rule.atRules.some((atRule) =>
        /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*420px\)/.test(atRule)
      ),
  );
  const lowHeightCard = rules.find(
    (rule) => rule.selector === ".tank-trial-card" &&
      rule.atRules.some((atRule) =>
        /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*420px\)/.test(atRule)
      ),
  );
  const lowHeightArt = rules.find(
    (rule) => rule.selector === ".tank-trial-art" &&
      rule.atRules.some((atRule) =>
        /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*420px\)/.test(atRule)
      ),
  );
  const lowHeightActions = rules.find(
    (rule) => rule.selector === ".tank-trial-actions" &&
      rule.atRules.some((atRule) =>
        /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*420px\)/.test(atRule)
      ),
  );
  const lowHeightButton = rules.find(
    (rule) => rule.selector === ".tank-trial-button" &&
      rule.atRules.some((atRule) =>
        /@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*420px\)/.test(atRule)
      ),
  );
  assert.equal(
    parseCssDeclarations(card?.body ?? "")["grid-template-columns"],
    "minmax(260px, 38%) 1fr",
  );
  assert.match(parseCssDeclarations(art?.body ?? "")["transform"] ?? "", /translate/);
  assert.equal(parseCssDeclarations(dialog?.body ?? "")["position"], "absolute");
  assert.equal(
    parseCssDeclarations(fragmentImageLayer?.body ?? "")["object-fit"],
    "contain",
  );
  assert.doesNotMatch(css, /url\(["']?\/tank-trial-fragments\.png["']?\)/);
  assert.equal(parseCssDeclarations(dialog?.body ?? "")["display"], "grid");
  assert.equal(parseCssDeclarations(hiddenDialog?.body ?? "")["display"], "none");
  assert.equal(
    rules.some((rule) => rule.selector.includes(".tank-trial-dialog[open]")),
    false,
  );
  assert.equal(
    parseCssDeclarations(mobileCard?.body ?? "")["grid-template-columns"],
    "1fr",
  );
  assert.ok(reducedFragment);
  assert.equal(parseCssDeclarations(lowHeightDialog?.body ?? "")["overflow"], "auto");
  assert.match(
    parseCssDeclarations(lowHeightDialog?.body ?? "")["place-items"] ?? "",
    /^start/,
  );
  assert.equal(parseCssDeclarations(lowHeightCard?.body ?? "")["align-self"], "start");
  assert.equal(parseCssDeclarations(lowHeightCard?.body ?? "")["gap"], "0");
  assert.match(parseCssDeclarations(lowHeightCard?.body ?? "")["padding"] ?? "", /^8px/);
  assert.match(parseCssDeclarations(lowHeightArt?.body ?? "")["width"] ?? "", /min\(/);
  assert.equal(parseCssDeclarations(lowHeightActions?.body ?? "")["gap"], "6px");
  assert.equal(parseCssDeclarations(lowHeightActions?.body ?? "")["margin-top"], "8px");
  assert.equal(parseCssDeclarations(lowHeightButton?.body ?? "")["min-height"], "32px");
  assert.equal(parseCssDeclarations(lowHeightButton?.body ?? "")["padding"], "5px 8px");
});

test("坦克试炼碎片资源为透明 RGBA PNG 且五个裁切层唯一覆盖真实组件", async () => {
  const png = await readFile(
    new URL("../public/tank-trial-fragments.png", import.meta.url),
  );
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, 1536);
  assert.equal(height, 1024);
  assert.equal(png[25], 6);

  const decoded = spawnSync(
    "ffmpeg",
    [
      "-v", "error", "-i",
      fileURLToPath(new URL("../public/tank-trial-fragments.png", import.meta.url)),
      "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
    ],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert.equal(decoded.stdout.length, width * height * 4);

  const alphaThreshold = 16;
  const visited = new Uint8Array(width * height);
  const componentByPixel = new Int8Array(width * height);
  componentByPixel.fill(-1);
  const queue = new Int32Array(width * height);
  const components = [];
  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = decoded.stdout[pixel * 4 + 3];
    if (alpha === 0) transparentPixels += 1;
    if (alpha > alphaThreshold) visiblePixels += 1;
    if (visited[pixel] || alpha <= alphaThreshold) continue;

    const componentIndex = components.length;
    let head = 0;
    let tail = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    queue[tail++] = pixel;
    visited[pixel] = 1;
    componentByPixel[pixel] = componentIndex;
    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (
            !visited[next] &&
            decoded.stdout[next * 4 + 3] > alphaThreshold
          ) {
            visited[next] = 1;
            componentByPixel[next] = componentIndex;
            queue[tail++] = next;
          }
        }
      }
    }
    components.push({ count, bbox: [minX, minY, maxX, maxY] });
  }
  assert.ok(transparentPixels > 0);
  assert.ok(visiblePixels > 0);
  assert.equal(components.length, 5);

  const expectedByFragment = [
    [542, 250, 977, 526],
    [1053, 335, 1282, 404],
    [216, 439, 661, 761],
    [580, 537, 959, 762],
    [882, 446, 1308, 760],
  ];
  assert.deepEqual(
    components.map(({ bbox }) => bbox).sort((left, right) => left[0] - right[0]),
    [...expectedByFragment].sort((left, right) => left[0] - right[0]),
  );

  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const rules = collectCssRules(css);
  const polygons = expectedByFragment.map((_, index) => {
    const selector = `.tank-trial-fragment[data-trial-fragment="${index + 1}"]`;
    const rule = rules.find((candidate) =>
      candidate.selector === selector && candidate.atRules.length === 0
    );
    const clipPath = parseCssDeclarations(rule?.body ?? "")["clip-path"] ?? "";
    const points = [...clipPath.matchAll(/([\d.]+)%\s+([\d.]+)%/g)].map(
      (match) => [
        Number(match[1]) * width / 100,
        Number(match[2]) * height / 100,
      ],
    );
    assert.ok(points.length >= 4, selector);
    return points;
  });
  const pointInPolygon = (x, y, polygon) => {
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
      const [currentX, currentY] = polygon[index];
      const [previousX, previousY] = polygon[previous];
      if (
        (currentY > y) !== (previousY > y) &&
        x <
          ((previousX - currentX) * (y - currentY)) /
            (previousY - currentY) +
            currentX
      ) inside = !inside;
    }
    return inside;
  };
  const componentToFragment = new Map();
  for (const [fragmentIndex, expectedBbox] of expectedByFragment.entries()) {
    const componentIndex = components.findIndex(({ bbox }) =>
      bbox.every((value, index) => value === expectedBbox[index])
    );
    assert.notEqual(componentIndex, -1);
    componentToFragment.set(componentIndex, fragmentIndex);
  }

  let missing = 0;
  let overlapping = 0;
  let misassigned = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (decoded.stdout[pixel * 4 + 3] <= alphaThreshold) continue;
    const x = (pixel % width) + 0.5;
    const y = Math.floor(pixel / width) + 0.5;
    const hits = polygons.flatMap((polygon, index) =>
      pointInPolygon(x, y, polygon) ? [index] : []
    );
    if (hits.length === 0) missing += 1;
    if (hits.length > 1) overlapping += 1;
    if (
      hits.length === 1 &&
      hits[0] !== componentToFragment.get(componentByPixel[pixel])
    ) misassigned += 1;
  }
  // Alpha <= 16 is the 6.3%-opacity antialias fringe; all materially visible pixels
  // must belong to exactly one complete connected component and one fragment layer.
  assert.equal(missing, 0);
  assert.equal(overlapping, 0);
  assert.equal(misassigned, 0);
});

function createTankTrialRuntimeHarness(
  helperSource,
  initialGame,
  { extraSource = "", sandboxOverrides = {} } = {},
) {
  const createElement = () => ({
    hidden: true,
    isConnected: true,
    dataset: {},
    focusCount: 0,
    focus() {
      if (this.hidden) return;
      this.focusCount += 1;
      document.activeElement = this;
    },
  });
  const document = {
    activeElement: null,
    querySelector: () => ({ textContent: "" }),
  };
  const canvas = createElement();
  canvas.hidden = false;
  const entry = createElement();
  entry.hidden = false;
  const decline = createElement();
  const accept = createElement();
  decline.hidden = false;
  accept.hidden = false;
  const fragments = Array.from({ length: 10 }, (_, index) => ({
    dataset: { trialFragment: String((index % 5) + 1) },
    collected: false,
    classList: {
      toggle(_name, value) {
        fragments[index].collected = value;
      },
    },
  }));
  const arts = [0, 1].map((artIndex) => ({
    dataset: {},
    querySelectorAll(selector) {
      assert.equal(selector, "[data-trial-fragment]");
      return fragments.slice(artIndex * 5, artIndex * 5 + 5);
    },
  }));
  const dialog = createElement();
  dialog.querySelectorAll = (selector) => {
    assert.equal(selector, 'button:not([disabled])');
    return [decline, accept];
  };
  const status = createElement();
  const rewardDialog = createElement();
  const result = createElement();
  result.textContent = "";
  const ultimate = createElement();
  ultimate.hidden = false;
  const atlasStatus = { dataset: {}, textContent: "" };
  const mouse = { down: true };
  const developerToolbar = createElement();
  const titlePanel = createElement();
  const pausePanel = createElement();
  const gameOverPanel = createElement();
  gameOverPanel.querySelector = () => ({ textContent: "" });
  const hud = createElement();
  let renderCount = 0;
  let titleCount = 0;
  document.activeElement = entry;

  const sandbox = {
    initialGame,
    canOfferTankTrial,
    createGameState,
    createTankTrialGame,
    createTankTrialSession,
    dismissTankTrialOffer,
    restoreTankTrialGame,
    startTankTrial,
    structuredClone,
    console,
    document,
    canvas,
    mouse,
    tankTrialEntry: entry,
    rewardDialog,
    tankTrialDialog: dialog,
    tankTrialArts: arts,
    tankTrialStatus: status,
    tankTrialResult: result,
    tankTrialStage: { textContent: "" },
    tankTrialFragmentsText: { textContent: "" },
    tankTrialScore: { textContent: "" },
    declineTankTrial: decline,
    acceptTankTrial: accept,
    ultimateStatus: ultimate,
    atlasStatus,
    developerToolbar,
    developerModeToggle: { checked: false },
    titlePanel,
    pausePanel,
    gameOverPanel,
    hud,
    records: { highScore: 0, highWave: 0 },
    pad: (value) => String(value),
    createDeveloperSession: () => ({ enabled: false }),
    unlockDeveloperWeapons: () => {},
    syncDeveloperControls: () => {},
    ensureSound: () => () => {},
    saveRecords: () => {},
    renderWeaponBar: () => { renderCount += 1; },
    returnToTitle: () => { titleCount += 1; },
    keys: new Set(),
    togglePause: () => {},
    switchWeapon: () => {},
    beginReload: () => {},
    cancelWatermelonCharge: () => {},
    requestDodge: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    ...sandboxOverrides,
  };
  new Script(`
    let game = initialGame;
    let developerSession = { enabled: false };
    let rewardReturnFocus = null;
    let tankTrialSession = createTankTrialSession();
    let tankTrialSnapshot = null;
    let tankTrialReturnFocus = null;
    let tankTrialResultTimer = null;
    ${helperSource}
    ${extraSource}
    this.runtime = {
      openTankTrialDialog,
      declineTankTrialDialog,
      acceptTankTrialDialog,
      restoreFromTankTrial,
      trapTankTrialFocus,
      renderTankTrialFragments,
      clearTankTrialResult:
        typeof clearTankTrialResult === "function" ? clearTankTrialResult : null,
      updateHud: typeof updateHud === "function" ? updateHud : null,
      handleGameKeyDown:
        typeof handleGameKeyDown === "function" ? handleGameKeyDown : null,
      resetGame: typeof resetGame === "function" ? resetGame : null,
      returnToTitle:
        typeof returnToTitle === "function" ? returnToTitle : null,
      finishGame: typeof finishGame === "function" ? finishGame : null,
      getState: () => ({
        game,
        developerSession,
        tankTrialSession,
        tankTrialSnapshot,
        tankTrialReturnFocus,
      }),
      setDeveloperEnabled: (enabled) => { developerSession.enabled = enabled; },
    };
  `).runInNewContext(sandbox);
  return {
    ...sandbox,
    runtime: sandbox.runtime,
    canvas,
    fragments,
    tankTrialResult: result,
    getRenderCount: () => renderCount,
    getTitleCount: () => titleCount,
  };
}

test("坦克试炼提示接受和拒绝保持状态边界", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = source.match(
    /function tankTrialOfferInput[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  assert.ok(helperSource);
  for (const marker of [
    "openTankTrialDialog",
    "declineTankTrialDialog",
    "acceptTankTrialDialog",
    "snapshot = structuredClone(game)",
    "createTankTrialGame(nextSession)",
    "restoreTankTrialGame",
  ]) assert.equal(source.includes(marker), true, marker);

  const normal = createGameState();
  normal.mode = "playing";
  normal.wave = 12;
  normal.waveQueue = [];
  normal.enemies = [];
  normal.intermission = 1;
  normal.unlocked = ["pistol", "turret"];
  const harness = createTankTrialRuntimeHarness(helperSource, normal);

  harness.runtime.setDeveloperEnabled(true);
  assert.equal(harness.runtime.openTankTrialDialog(), false);
  harness.runtime.setDeveloperEnabled(false);
  assert.equal(harness.runtime.openTankTrialDialog(), true);
  assert.equal(harness.tankTrialDialog.hidden, false);
  assert.equal(harness.runtime.getState().game.mode, "trial-prompt");
  assert.equal(harness.mouse.down, false);
  assert.equal(harness.declineTankTrial.focusCount, 1);

  harness.runtime.declineTankTrialDialog();
  assert.equal(harness.tankTrialDialog.hidden, true);
  assert.equal(harness.runtime.getState().game.mode, "playing");
  assert.equal(harness.runtime.getState().tankTrialSession.dismissedWave, 12);
  assert.equal(harness.tankTrialEntry.focusCount, 1);
  assert.equal(harness.runtime.openTankTrialDialog(), false);
  normal.wave = 13;
  assert.equal(harness.runtime.openTankTrialDialog(), true);
});

test("坦克试炼接受、焦点约束和恢复执行生产辅助函数", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = source.match(
    /function tankTrialOfferInput[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  assert.ok(helperSource);
  const normal = createGameState();
  normal.mode = "playing";
  normal.wave = 18;
  normal.intermission = 1;
  normal.waveQueue = [];
  normal.enemies = [];
  normal.unlocked = ["pistol", "shotgun", "turret"];
  normal.player.health = 47;
  normal.player.ammo.pistol = 3;
  normal.structures.push({ id: 7, kind: "turret", health: 90 });
  normal.pickups.push({ id: 8, kind: "health", x: 20, y: 30 });
  normal.hazards.push({ id: 9, x: 50, y: 60 });
  normal.spikeTraps.push({
    x: 200,
    y: 300,
    radius: 36,
    wave: 31,
    armed: true,
    phase: "warning",
    phaseTime: 0.25,
    phaseOffset: 0,
    hitIds: new Set([7]),
  });
  const expectedNormal = structuredClone(normal);
  const harness = createTankTrialRuntimeHarness(helperSource, normal);

  assert.equal(harness.runtime.openTankTrialDialog(), true);
  const shiftTab = { key: "Tab", shiftKey: true, preventCount: 0, preventDefault() { this.preventCount += 1; } };
  harness.document.activeElement = harness.declineTankTrial;
  harness.runtime.trapTankTrialFocus(shiftTab);
  assert.equal(shiftTab.preventCount, 1);
  assert.equal(harness.document.activeElement, harness.acceptTankTrial);
  const tab = { key: "Tab", shiftKey: false, preventCount: 0, preventDefault() { this.preventCount += 1; } };
  harness.runtime.trapTankTrialFocus(tab);
  assert.equal(tab.preventCount, 1);
  assert.equal(harness.document.activeElement, harness.declineTankTrial);

  harness.runtime.acceptTankTrialDialog();
  const accepted = harness.runtime.getState();
  assert.deepEqual(normal, expectedNormal);
  assert.equal(accepted.tankTrialSession.active, true);
  assert.equal(accepted.game.player.weapon, "pistol");
  assert.equal(accepted.game.player.health, 100);
  assert.deepEqual(accepted.game.unlocked, ["pistol"]);
  assert.deepEqual(accepted.game.structures, []);
  assert.deepEqual(accepted.game.pickups, []);
  assert.deepEqual(accepted.game.hazards, []);
  assert.deepEqual(accepted.game.spikeTraps, []);
  assert.notEqual(accepted.tankTrialSnapshot, normal);
  assert.deepEqual(accepted.tankTrialSnapshot, expectedNormal);
  assert.equal(harness.tankTrialStatus.hidden, false);
  assert.equal(harness.ultimateStatus.hidden, true);

  assert.equal(
    harness.runtime.restoreFromTankTrial(false, "坦克试炼失败，碎片已清零"),
    true,
  );
  const restored = harness.runtime.getState();
  assert.deepEqual(restored.game, expectedNormal);
  assert.deepEqual(restored.game.structures, expectedNormal.structures);
  assert.deepEqual(restored.game.pickups, expectedNormal.pickups);
  assert.deepEqual(restored.game.hazards, expectedNormal.hazards);
  assert.deepEqual(restored.game.spikeTraps, expectedNormal.spikeTraps);
  assert.equal(restored.game.player.health, 47);
  assert.equal(restored.tankTrialSnapshot, null);
  assert.equal(restored.tankTrialSession.dismissedWave, 18);
  assert.equal(harness.tankTrialStatus.hidden, true);
  assert.equal(harness.ultimateStatus.hidden, false);
  assert.equal(harness.tankTrialResult.hidden, false);
  assert.equal(
    harness.tankTrialResult.textContent,
    "坦克试炼失败，碎片已清零",
  );
  harness.runtime.clearTankTrialResult();
  assert.equal(harness.tankTrialResult.hidden, true);
  assert.equal(harness.tankTrialResult.textContent, "");
  assert.equal(harness.getRenderCount() > 0, true);

  const successGame = structuredClone(expectedNormal);
  const successHarness = createTankTrialRuntimeHarness(helperSource, successGame);
  assert.equal(successHarness.runtime.openTankTrialDialog(), true);
  successHarness.runtime.acceptTankTrialDialog();
  assert.equal(
    successHarness.runtime.restoreFromTankTrial(true, "坦克已解锁"),
    true,
  );
  assert.deepEqual(successHarness.runtime.getState().game, {
    ...expectedNormal,
    unlocked: [...expectedNormal.unlocked, "tank"],
  });
  assert.equal(successHarness.tankTrialResult.hidden, false);
  assert.equal(successHarness.tankTrialResult.textContent, "坦克已解锁");
});

test("坦克试炼 Escape 在其他快捷键前拒绝提示", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const keyboardSource = source.match(
    /function isInteractiveTarget[\s\S]*?\r?\n}\r?\n\r?\nwindow\.addEventListener\("keydown"/,
  )?.[0].replace(/\r?\n\r?\nwindow\.addEventListener\("keydown"$/, "");
  assert.ok(keyboardSource);
  const keyboardState = { declineCount: 0 };
  const sandbox = {
    rewardDialog: { hidden: true },
    handleRewardKeyDown() {},
    tankTrialDialog: { hidden: false },
    declineTankTrialDialog() { keyboardState.declineCount += 1; },
    keys: new Set(),
    togglePause: () => assert.fail("prompt Escape must not pause"),
    switchWeapon: () => assert.fail("prompt Escape must not switch weapons"),
    beginReload: () => assert.fail("prompt Escape must not reload"),
    requestDodge: () => assert.fail("prompt Escape must not dodge"),
    game: { mode: "trial-prompt", player: {} },
  };
  new Script(keyboardSource + "\nthis.handle = handleGameKeyDown;").runInNewContext(sandbox);
  const event = {
    key: "Escape",
    target: null,
    preventCount: 0,
    preventDefault() { this.preventCount += 1; },
  };
  sandbox.handle(event);
  assert.equal(event.preventCount, 1);
  assert.equal(keyboardState.declineCount, 1);
  assert.equal(sandbox.keys.size, 0);
});

test("重置、返回标题和游戏结束丢弃试炼临时状态", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const resetSource = source.match(/function resetGame\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction returnToTitle/)?.[0];
  const titleSource = source.match(/function returnToTitle\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction syncDeveloperControls/)?.[0];
  const finishSource = source.match(/function finishGame\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction updateHud/)?.[0];
  for (const block of [resetSource, titleSource, finishSource]) {
    assert.ok(block);
    assert.match(block, /tankTrialSession = createTankTrialSession\(\)/);
    assert.match(block, /tankTrialSnapshot = null/);
    assert.match(block, /tankTrialDialog\.hidden = true/);
    assert.match(block, /tankTrialStatus\.hidden = true/);
  }
  assert.match(source, /tankTrialEntry\.addEventListener\("click", openTankTrialDialog\)/);
  assert.match(source, /tankTrialDialog\.addEventListener\("keydown", trapTankTrialFocus\)/);
  assert.match(source, /tankTrialEntry\.hidden[\s\S]*canOfferTankTrial\(tankTrialOfferInput\(\)\)/);
});

test("坦克试炼提示关闭后把焦点恢复到可见目标", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../src/index.html", import.meta.url), "utf8");
  assert.match(html, /<canvas id="game"[^>]*tabindex="-1"/);
  const helperSource = source.match(
    /function tankTrialOfferInput[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  const updateHudSource = source.match(
    /function updateHud\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction renderWeaponBar/,
  )?.[0].replace(/\r?\n\r?\nfunction renderWeaponBar$/, "");
  const keyboardSource = source.match(
    /function isInteractiveTarget[\s\S]*?\r?\n}\r?\n\r?\nwindow\.addEventListener\("keydown"/,
  )?.[0].replace(/\r?\n\r?\nwindow\.addEventListener\("keydown"$/, "");
  assert.ok(helperSource);
  assert.ok(updateHudSource);
  assert.ok(keyboardSource);

  const normal = createGameState();
  Object.assign(normal, {
    mode: "playing",
    wave: 22,
    waveQueue: [],
    enemies: [],
    intermission: 1,
    unlocked: ["pistol", "turret"],
  });
  const harness = createTankTrialRuntimeHarness(helperSource, normal, {
    extraSource: updateHudSource + "\n" + keyboardSource,
  });

  assert.equal(harness.runtime.openTankTrialDialog(), true);
  harness.runtime.updateHud();
  assert.equal(harness.tankTrialEntry.hidden, true);
  harness.runtime.declineTankTrialDialog();
  assert.equal(harness.document.activeElement, harness.canvas);
  assert.equal(harness.canvas.focusCount, 1);
  assert.equal(harness.tankTrialEntry.focusCount, 0);

  normal.wave = 23;
  harness.document.activeElement = harness.tankTrialEntry;
  assert.equal(harness.runtime.openTankTrialDialog(), true);
  harness.runtime.updateHud();
  harness.runtime.handleGameKeyDown({
    key: "Escape",
    target: harness.declineTankTrial,
    preventDefault() {},
  });
  assert.equal(harness.document.activeElement, harness.canvas);
  assert.equal(harness.canvas.focusCount, 2);

  normal.wave = 24;
  harness.document.activeElement = harness.tankTrialEntry;
  assert.equal(harness.runtime.openTankTrialDialog(), true);
  harness.runtime.updateHud();
  harness.runtime.acceptTankTrialDialog();
  assert.equal(harness.document.activeElement, harness.canvas);
  assert.equal(harness.canvas.focusCount, 3);
});

test("坦克试炼接受失败保持原子且恢复失败安全回标题", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = source.match(
    /function tankTrialOfferInput[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  const titleSource = source.match(
    /function returnToTitle\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction syncDeveloperControls/,
  )?.[0].replace(/\r?\n\r?\nfunction syncDeveloperControls$/, "");
  assert.ok(helperSource);
  assert.ok(titleSource);

  const makeNormal = () => {
    const game = createGameState();
    Object.assign(game, {
      mode: "playing",
      wave: 26,
      waveQueue: [],
      enemies: [],
      intermission: 1,
      unlocked: ["pistol", "turret"],
    });
    return game;
  };

  const cloneFailureGame = makeNormal();
  const cloneFailure = createTankTrialRuntimeHarness(helperSource, cloneFailureGame, {
    sandboxOverrides: {
      structuredClone: () => { throw new Error("clone failed"); },
    },
  });
  cloneFailure.runtime.openTankTrialDialog();
  cloneFailure.runtime.acceptTankTrialDialog();
  assert.equal(cloneFailure.runtime.getState().game, cloneFailureGame);
  assert.equal(cloneFailureGame.mode, "trial-prompt");
  assert.equal(cloneFailure.runtime.getState().tankTrialSession.active, false);
  assert.equal(cloneFailure.runtime.getState().tankTrialSnapshot, null);
  assert.equal(cloneFailure.tankTrialDialog.hidden, false);

  const createFailureGame = makeNormal();
  const createFailure = createTankTrialRuntimeHarness(helperSource, createFailureGame, {
    sandboxOverrides: {
      createTankTrialGame: () => { throw new Error("create failed"); },
    },
  });
  createFailure.runtime.openTankTrialDialog();
  createFailure.runtime.acceptTankTrialDialog();
  assert.equal(createFailure.runtime.getState().game, createFailureGame);
  assert.equal(createFailureGame.mode, "trial-prompt");
  assert.equal(createFailure.runtime.getState().tankTrialSession.active, false);
  assert.equal(createFailure.runtime.getState().tankTrialSnapshot, null);
  assert.equal(createFailure.tankTrialDialog.hidden, false);

  const restoreFailureGame = makeNormal();
  const restoreFailure = createTankTrialRuntimeHarness(helperSource, restoreFailureGame, {
    extraSource: titleSource,
    sandboxOverrides: {
      restoreTankTrialGame: () => { throw new Error("restore failed"); },
    },
  });
  restoreFailure.runtime.openTankTrialDialog();
  restoreFailure.runtime.acceptTankTrialDialog();
  assert.equal(restoreFailure.runtime.restoreFromTankTrial(false, "失败"), false);
  const fallback = restoreFailure.runtime.getState();
  assert.equal(fallback.game.mode, "title");
  assert.equal(fallback.tankTrialSession.active, false);
  assert.equal(fallback.tankTrialSnapshot, null);
  assert.equal(restoreFailure.tankTrialDialog.hidden, true);
  assert.equal(restoreFailure.tankTrialStatus.hidden, true);
});

test("坦克试炼生命周期清理与监听通过生产函数执行", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = source.match(
    /function tankTrialOfferInput[\s\S]*?\r?\n}\r?\n\r?\nfunction togglePause/,
  )?.[0].replace(/\r?\n\r?\nfunction togglePause$/, "");
  const resetSource = source.match(
    /function resetGame\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction returnToTitle/,
  )?.[0].replace(/\r?\n\r?\nfunction returnToTitle$/, "");
  const titleSource = source.match(
    /function returnToTitle\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction syncDeveloperControls/,
  )?.[0].replace(/\r?\n\r?\nfunction syncDeveloperControls$/, "");
  const finishSource = source.match(
    /function finishGame\(\)[\s\S]*?\r?\n}\r?\n\r?\nfunction updateHud/,
  )?.[0].replace(/\r?\n\r?\nfunction updateHud$/, "");
  assert.ok(helperSource);
  assert.ok(resetSource);
  assert.ok(titleSource);
  assert.ok(finishSource);
  const normal = createGameState();
  const harness = createTankTrialRuntimeHarness(helperSource, normal, {
    extraSource: resetSource + "\n" + titleSource + "\n" + finishSource,
  });

  for (const lifecycle of [
    harness.runtime.resetGame,
    harness.runtime.returnToTitle,
    harness.runtime.finishGame,
  ]) {
    harness.tankTrialDialog.hidden = false;
    harness.tankTrialStatus.hidden = false;
    harness.tankTrialResult.hidden = false;
    harness.tankTrialResult.textContent = "旧提示";
    lifecycle();
    const state = harness.runtime.getState();
    assert.equal(state.tankTrialSession.active, false);
    assert.equal(state.tankTrialSnapshot, null);
    assert.equal(harness.tankTrialDialog.hidden, true);
    assert.equal(harness.tankTrialStatus.hidden, true);
    assert.equal(harness.tankTrialResult.hidden, true);
    assert.equal(harness.tankTrialResult.textContent, "");
  }
  assert.match(helperSource, /function acceptTankTrialDialog[\s\S]*clearTankTrialResult\(\)/);

  const listenerSource = source.match(
    /tankTrialEntry\.addEventListener\("click", openTankTrialDialog\);[\s\S]*?tankTrialDialog\.addEventListener\("keydown", trapTankTrialFocus\);/,
  )?.[0];
  assert.ok(listenerSource);
  const calls = [];
  const target = (name) => ({
    addEventListener(type, listener) { calls.push([name, type, listener]); },
  });
  new Script(listenerSource).runInNewContext({
    tankTrialEntry: target("entry"),
    declineTankTrial: target("decline"),
    acceptTankTrial: target("accept"),
    tankTrialDialog: target("dialog"),
    openTankTrialDialog() {},
    declineTankTrialDialog() {},
    acceptTankTrialDialog() {},
    trapTankTrialFocus() {},
  });
  assert.deepEqual(
    calls.map(([name, type]) => [name, type]),
    [["entry", "click"], ["decline", "click"], ["accept", "click"], ["dialog", "keydown"]],
  );
});

test("坦克试炼运行时按分数边界推进五关并只在最终恢复奖励", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const helperSource = [
    extractGameFunction(source, "failActiveTankTrial", "startNextTankTrialStage"),
    extractGameFunction(source, "startNextTankTrialStage", "updateTankTrialWave"),
    extractGameFunction(source, "updateTankTrialWave", "updateWave"),
  ].join("\n");
  const restoreCalls = [];
  const pistol = weapons.find((weapon) => weapon.id === "pistol");
  const sandbox = {
    game: {
      mode: "playing",
      wave: 1,
      waveQueue: [],
      waveEnhancements: ["toxic"],
      enemies: [],
      spawnTimer: 0,
      intermission: 1.5,
      player: {
        health: 37,
        weapon: "pistol",
        ammo: { pistol: 0 },
        reload: 0.4,
        reloadWeapon: "pistol",
      },
      notice: "",
      noticeTimer: 0,
    },
    tankTrialSession: startTankTrial(createTankTrialSession()),
    TANK_TRIAL_STAGES,
    buildTankTrialWave,
    createTankTrialSession,
    failTankTrial,
    finishTankTrialStage,
    weapons,
    cancelReload(player) {
      player.reload = 0;
      player.reloadWeapon = null;
    },
    renderTankTrialFragments() {},
    renderWeaponBar() {},
    spawnEnemy() {},
    restoreFromTankTrial(completed, message) {
      restoreCalls.push({ completed, message });
      return true;
    },
  };
  new Script(helperSource + "\nthis.updateTankTrialWave = updateTankTrialWave;")
    .runInNewContext(sandbox);

  sandbox.tankTrialSession.stageScore = TANK_TRIAL_STAGES[0].targetScore - 1;
  sandbox.updateTankTrialWave(0);
  assert.deepEqual(restoreCalls.map(({ completed }) => completed), [false]);

  restoreCalls.length = 0;
  sandbox.tankTrialSession = startTankTrial(createTankTrialSession());
  for (let stage = 0; stage < TANK_TRIAL_STAGES.length; stage += 1) {
    sandbox.game.waveQueue = [];
    sandbox.game.enemies = [];
    sandbox.game.intermission = 1.5;
    sandbox.game.player.health = 37;
    sandbox.game.player.ammo.pistol = 0;
    sandbox.tankTrialSession.stageScore = TANK_TRIAL_STAGES[stage].targetScore;
    sandbox.updateTankTrialWave(0);
    assert.equal(sandbox.tankTrialSession.fragments, stage + 1);
    if (stage < TANK_TRIAL_STAGES.length - 1) {
      assert.equal(sandbox.tankTrialSession.stage, stage + 1);
      assert.deepEqual(sandbox.game.waveQueue, buildTankTrialWave(stage + 1));
      assert.equal(sandbox.game.waveEnhancements.length, 0);
      assert.equal(sandbox.game.player.ammo.pistol, pistol.ammo);
      assert.equal(sandbox.game.player.health, 37);
      assert.equal(restoreCalls.length, 0);
    }
  }
  assert.deepEqual(restoreCalls.map(({ completed }) => completed), [true]);
});

test("坦克试炼恢复在真实 update 中原子终止当前帧", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const runtimeSource = [
    extractGameFunction(source, "failActiveTankTrial", "startNextTankTrialStage"),
    extractGameFunction(source, "startNextTankTrialStage", "updateTankTrialWave"),
    extractGameFunction(source, "updateTankTrialWave", "updateWave"),
    extractGameFunction(source, "updateWave", "update"),
    extractGameFunction(source, "update", "finishGame"),
  ].join("\n");

  for (const completed of [false, true]) {
    const normal = createGameState();
    Object.assign(normal, {
      mode: "playing",
      wave: 18,
      score: 88000,
      kills: 321,
      combo: 47,
      comboTimer: 0.01,
      highestCombo: 91,
      notice: "普通局提示",
      noticeTimer: 0.01,
      intermission: 4.25,
      spawnTimer: 0.17,
      waveQueue: ["runner"],
      unlocked: ["pistol", "shotgun", "turret"],
    });
    Object.assign(normal.player, {
      health: 63,
      weapon: "shotgun",
      cooldown: 0.23,
    });
    normal.player.ammo.pistol = 5;
    normal.structures.push({ id: 9, kind: "turret", health: 77, cooldown: 0.2 });
    normal.pickups.push({ id: 10, kind: "health", x: 100, y: 100 });
    const snapshot = structuredClone(normal);

    let session = startTankTrial(createTankTrialSession());
    if (completed) {
      session = {
        ...session,
        stage: 4,
        fragments: 4,
        stageScore: TANK_TRIAL_STAGES[4].targetScore,
        targetScore: TANK_TRIAL_STAGES[4].targetScore,
      };
    } else {
      session = {
        ...session,
        stageScore: TANK_TRIAL_STAGES[0].targetScore - 1,
      };
    }
    const sandbox = {
      game: {
        ...createTankTrialGame(startTankTrial(createTankTrialSession())),
        waveQueue: [],
        enemies: [],
        intermission: 1.5,
      },
      tankTrialSession: session,
      tankTrialSnapshot: snapshot,
      developerSession: { enabled: false },
      TANK_TRIAL_STAGES,
      buildTankTrialWave,
      failTankTrial,
      finishTankTrialStage,
      restoreTankTrialGame,
      createTankTrialSession,
      dismissTankTrialOffer,
      weapons,
      enemyStats,
      getEnemySpawnLimit: () => 18,
      buildWave: () => [],
      resetWaveLightning() {},
      syncDeveloperControls() {},
      cancelReload() {},
      renderTankTrialFragments() {},
      renderWeaponBar() {},
      spawnEnemy() {},
      updatePlayer() {},
      updateEnemies() {},
      updateStructures() {},
      updateShockwaves() {},
      updateLightning() {},
      updateBullets() {},
      updatePickups() {},
      updateHazards() {},
      updateParticles() {},
      tickCombo,
      clamp: (value, minimum, maximum) =>
        Math.min(maximum, Math.max(minimum, value)),
      isSurvivalOver,
      restoreFromTankTrial(didComplete) {
        sandbox.game = restoreTankTrialGame(snapshot, didComplete);
        sandbox.tankTrialSession = createTankTrialSession();
        return true;
      },
      console,
    };
    new Script(runtimeSource + "\nthis.runUpdate = update;").runInNewContext(sandbox);
    const updateOutcome = sandbox.runUpdate(0.1);

    const expected = restoreTankTrialGame(snapshot, completed);
    assert.equal(updateOutcome, "restored");
    assert.deepEqual(sandbox.game, expected);
    assert.equal(sandbox.tankTrialSession.active, false);
  }
});

test("坦克试炼真实 update 在帧入口恢复非法会话且不污染普通快照", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const runtimeSource = [
    extractGameFunction(source, "restoreFromTankTrial", "trapTankTrialFocus"),
    extractGameFunction(source, "failActiveTankTrial", "startNextTankTrialStage"),
    extractGameFunction(source, "startNextTankTrialStage", "updateTankTrialWave"),
    extractGameFunction(source, "updateTankTrialWave", "updateWave"),
    extractGameFunction(source, "updateWave", "update"),
    extractGameFunction(source, "update", "finishGame"),
  ].join("\n");
  const normal = createGameState();
  Object.assign(normal, {
    mode: "playing",
    wave: 27,
    score: 76543,
    kills: 432,
    combo: 38,
    comboTimer: 0.01,
    notice: "普通快照",
    noticeTimer: 0.01,
    waveQueue: ["runner"],
    unlocked: ["pistol", "shotgun", "turret"],
  });
  normal.player.weapon = "shotgun";
  normal.player.health = 61;
  normal.structures.push({ id: 91, kind: "turret", health: 74 });
  normal.pickups.push({ id: 92, kind: "ammo", weaponId: "shotgun" });

  function createFrameSandbox(session, snapshot) {
    const frameCalls = [];
    let titleCalls = 0;
    const sandbox = {
      game: createTankTrialGame(startTankTrial(createTankTrialSession())),
      tankTrialSession: session,
      tankTrialSnapshot: snapshot,
      tankTrialReturnFocus: null,
      tankTrialDialog: { hidden: false },
      tankTrialEntry: { hidden: false },
      tankTrialStatus: { hidden: false },
      ultimateStatus: { hidden: true },
      atlasStatus: { dataset: {}, textContent: "" },
      canvas: { hidden: false },
      developerSession: { enabled: false },
      TANK_TRIAL_STAGES,
      buildTankTrialWave,
      failTankTrial,
      finishTankTrialStage,
      restoreTankTrialGame,
      createTankTrialSession,
      dismissTankTrialOffer,
      createGameState,
      weapons,
      enemyStats,
      getEnemySpawnLimit: () => 18,
      buildWave: () => [],
      resetWaveLightning() {},
      syncDeveloperControls() {},
      cancelReload() {},
      renderTankTrialFragments() {},
      renderWeaponBar() {},
      restorePromptFocus() {},
      showTankTrialResult() {},
      spawnEnemy() {
        frameCalls.push("spawn");
      },
      updatePlayer() {
        frameCalls.push("player");
      },
      updateEnemies() {
        frameCalls.push("enemies");
      },
      updateStructures() {
        frameCalls.push("structures");
      },
      updateShockwaves() {
        frameCalls.push("shockwaves");
      },
      updateLightning() {
        frameCalls.push("lightning");
      },
      updateBullets() {
        frameCalls.push("bullets");
      },
      updatePickups() {
        frameCalls.push("pickups");
      },
      updateHazards() {
        frameCalls.push("hazards");
      },
      updateParticles() {
        frameCalls.push("particles");
      },
      unlockWeaponsForProgress,
      tickCombo() {
        frameCalls.push("combo");
      },
      clamp: (value, minimum, maximum) =>
        Math.min(maximum, Math.max(minimum, value)),
      isSurvivalOver,
      console: { error() {} },
    };
    sandbox.returnToTitle = () => {
      titleCalls += 1;
      sandbox.game = createGameState();
      sandbox.game.mode = "title";
      sandbox.tankTrialSession = createTankTrialSession();
      sandbox.tankTrialSnapshot = null;
    };
    new Script(runtimeSource + "\nthis.runUpdate = update;").runInNewContext(sandbox);
    return {
      sandbox,
      frameCalls,
      getTitleCalls: () => titleCalls,
    };
  }

  const invalidWithSnapshot = [
    null,
    undefined,
    7,
    { active: true },
    { ...createTankTrialSession(), active: false },
  ];
  for (const session of invalidWithSnapshot) {
    const harness = createFrameSandbox(session, structuredClone(normal));
    assert.doesNotThrow(() => harness.sandbox.runUpdate(0.1));
    assert.deepEqual(harness.sandbox.game, normal);
    assert.deepEqual(harness.frameCalls, []);
    assert.equal(harness.sandbox.tankTrialSnapshot, null);
    assert.equal(harness.sandbox.tankTrialSession.active, false);
    assert.equal(harness.getTitleCalls(), 0);
  }

  for (const { session, snapshot } of [
    { session: startTankTrial(createTankTrialSession()), snapshot: null },
    { session: null, snapshot: null },
    { session: undefined, snapshot: { broken: true } },
  ]) {
    const harness = createFrameSandbox(session, snapshot);
    assert.doesNotThrow(() => harness.sandbox.runUpdate(0.1));
    assert.equal(harness.sandbox.game.mode, "title");
    assert.deepEqual(harness.frameCalls, []);
    assert.equal(harness.sandbox.tankTrialSnapshot, null);
    assert.equal(harness.sandbox.tankTrialSession.active, false);
    assert.equal(harness.getTitleCalls(), 1);
  }

  const titleFrame = createFrameSandbox(null, null);
  titleFrame.sandbox.game.mode = "title";
  assert.doesNotThrow(() => titleFrame.sandbox.runUpdate(0.1));
  assert.equal(titleFrame.getTitleCalls(), 1);
  assert.equal(titleFrame.sandbox.tankTrialSession.active, false);
  assert.deepEqual(titleFrame.frameCalls, []);

  const ordinary = createFrameSandbox(createTankTrialSession(), null);
  ordinary.sandbox.game = structuredClone(normal);
  assert.doesNotThrow(() => ordinary.sandbox.runUpdate(0.1));
  assert.equal(ordinary.sandbox.game.mode, "playing");
  assert.equal(ordinary.getTitleCalls(), 0);
  assert.equal(ordinary.frameCalls.includes("player"), true);
});

test("坦克试炼真实 frame 在无逻辑步时也先清理非法会话", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const frameSource = source.match(
    /function frame\(now\)[\s\S]*?\r?\n}\r?\n\r?\nrenderWeaponBar/,
  )?.[0].replace(/\r?\n\r?\nrenderWeaponBar$/, "");
  const guardSource = extractGameFunction(
    source,
    "resolveTankTrialFrameState",
    "update",
  );
  assert.ok(frameSource);
  const calls = [];
  const sandbox = {
    game: { mode: "title" },
    tankTrialSession: null,
    tankTrialSnapshot: null,
    lastFrame: 1000,
    accumulator: 0,
    update() {
      calls.push("update");
    },
    failActiveTankTrial(reason) {
      calls.push(["fail", reason]);
      sandbox.tankTrialSession = createTankTrialSession();
    },
    drawTitleAmbient() {
      calls.push("title");
    },
    render() {
      calls.push("render");
    },
    updateHud() {
      calls.push("hud");
      void sandbox.tankTrialSession.active;
    },
    requestAnimationFrame() {
      calls.push("raf");
    },
    Math,
  };
  new Script(guardSource + "\n" + frameSource + "\nthis.frame = frame;")
    .runInNewContext(sandbox);
  assert.doesNotThrow(() => sandbox.frame(1000));
  assert.deepEqual(calls, [["fail", "state"], "title", "hud", "raf"]);

  calls.length = 0;
  sandbox.tankTrialSession = null;
  sandbox.accumulator = 1 / 60;
  assert.doesNotThrow(() => sandbox.frame(1000));
  assert.deepEqual(calls, [["fail", "state"], "title", "hud", "raf"]);
});

test("坦克试炼真实 frame 在恢复或进阶后丢弃剩余逻辑步", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const frameSource = source.match(
    /function frame\(now\)[\s\S]*?\r?\n}\r?\n\r?\nrenderWeaponBar/,
  )?.[0].replace(/\r?\n\r?\nrenderWeaponBar$/, "");
  assert.ok(frameSource);

  function runFrame(firstOutcome) {
    const normal = createGameState();
    normal.mode = "playing";
    normal.wave = 31;
    normal.score = 91827;
    normal.combo = 52;
    normal.comboTimer = 0.01;
    normal.notice = "恢复前普通局";
    normal.noticeTimer = 0.01;
    normal.unlocked = ["pistol", "shotgun", "turret"];
    normal.structures.push({ id: 301, kind: "turret", health: 68 });
    normal.pickups.push({ id: 302, kind: "health", x: 80, y: 90 });
    const snapshot = structuredClone(normal);
    let updates = 0;
    const sandbox = {
      game:
        firstOutcome === "normal"
          ? structuredClone(normal)
          : createTankTrialGame(startTankTrial(createTankTrialSession())),
      tankTrialSession:
        firstOutcome === "normal"
          ? createTankTrialSession()
          : startTankTrial(createTankTrialSession()),
      tankTrialSnapshot:
        firstOutcome === "normal" ? null : structuredClone(snapshot),
      developerSession: { enabled: false },
      lastFrame: 1000,
      accumulator: 3 / 60,
      resolveTankTrialFrameState: () =>
        firstOutcome === "normal" ? "normal" : "trial",
      update() {
        updates += 1;
        if (updates > 1) return "normal";
        if (firstOutcome === "restored") {
          sandbox.game = structuredClone(snapshot);
          sandbox.tankTrialSession = createTankTrialSession();
          sandbox.tankTrialSnapshot = null;
        } else if (firstOutcome === "advanced") {
          sandbox.tankTrialSession = {
            ...sandbox.tankTrialSession,
            stage: 1,
            fragments: 1,
            targetScore: TANK_TRIAL_STAGES[1].targetScore,
          };
        }
        return firstOutcome;
      },
      drawTitleAmbient() {},
      render() {},
      updateHud() {},
      requestAnimationFrame() {},
      Math,
    };
    new Script(frameSource + "\nthis.frame = frame;").runInNewContext(sandbox);
    sandbox.frame(1000);
    return { sandbox, snapshot, updates };
  }

  const restored = runFrame("restored");
  assert.equal(restored.updates, 1);
  assert.equal(restored.sandbox.accumulator, 0);
  assert.deepEqual(restored.sandbox.game, restored.snapshot);

  const advanced = runFrame("advanced");
  assert.equal(advanced.updates, 1);
  assert.equal(advanced.sandbox.accumulator, 0);
  assert.equal(advanced.sandbox.tankTrialSession.stage, 1);
  assert.equal(advanced.sandbox.tankTrialSession.fragments, 1);

  const ordinary = runFrame("normal");
  assert.equal(ordinary.updates, 3);
  assert.deepEqual(ordinary.sandbox.game, ordinary.snapshot);
});

test("坦克试炼非法会话和队列安全失败而不抛出动画循环", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const runtimeSource = [
    extractGameFunction(source, "failActiveTankTrial", "startNextTankTrialStage"),
    extractGameFunction(source, "startNextTankTrialStage", "updateTankTrialWave"),
    extractGameFunction(source, "updateTankTrialWave", "updateWave"),
  ].join("\n");
  const restoreCalls = [];
  const sandbox = {
    game: {
      waveQueue: [],
      enemies: [],
      spawnTimer: 0,
      intermission: 1.5,
      player: { weapon: "pistol", ammo: { pistol: 0 } },
    },
    tankTrialSession: startTankTrial(createTankTrialSession()),
    TANK_TRIAL_STAGES,
    buildTankTrialWave,
    createTankTrialSession,
    failTankTrial,
    finishTankTrialStage,
    weapons,
    enemyStats,
    cancelReload() {},
    renderTankTrialFragments() {},
    renderWeaponBar() {},
    spawnEnemy() {},
    restoreFromTankTrial(completed) {
      restoreCalls.push(completed);
      return true;
    },
    console: { error() {} },
  };
  new Script(runtimeSource + "\nthis.updateTankTrialWave = updateTankTrialWave;")
    .runInNewContext(sandbox);

  const invalidCases = [
    { session: null, queue: [] },
    { session: undefined, queue: [] },
    { session: 0, queue: [] },
    {
      session: { ...startTankTrial(createTankTrialSession()), stage: 9 },
      queue: [],
    },
    {
      session: {
        ...startTankTrial(createTankTrialSession()),
        fragments: 1,
      },
      queue: [],
    },
    {
      session: {
        ...startTankTrial(createTankTrialSession()),
        targetScore: 9999,
      },
      queue: [],
    },
    {
      session: startTankTrial(createTankTrialSession()),
      queue: null,
    },
    {
      session: startTankTrial(createTankTrialSession()),
      queue: ["unknown-enemy"],
    },
    {
      session: startTankTrial(createTankTrialSession()),
      queue: ["devil"],
    },
    {
      session: startTankTrial(createTankTrialSession()),
      queue: Array.from({ length: 16 }, () => "zombie"),
    },
    {
      session: startTankTrial(createTankTrialSession()),
      queue: Array.from({ length: 15 }, () => "zombie"),
      enemies: [{ kind: "zombie" }],
    },
  ];
  for (const invalid of invalidCases) {
    sandbox.tankTrialSession = invalid.session;
    sandbox.game.waveQueue = invalid.queue;
    sandbox.game.enemies = invalid.enemies ?? [];
    sandbox.game.intermission = 1.5;
    const before = restoreCalls.length;
    let outcome;
    assert.doesNotThrow(() => {
      outcome = sandbox.updateTankTrialWave(0);
    });
    assert.equal(outcome, "restored");
    assert.equal(restoreCalls.length, before + 1);
    assert.equal(restoreCalls.at(-1), false);
  }
});

test("坦克试炼损坏会话优先恢复有效快照且损坏快照安全回标题", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const runtimeSource = [
    extractGameFunction(source, "restoreFromTankTrial", "trapTankTrialFocus"),
    extractGameFunction(source, "failActiveTankTrial", "startNextTankTrialStage"),
  ].join("\n");
  const normal = createGameState();
  normal.mode = "playing";
  normal.wave = 23;
  normal.score = 45678;
  normal.combo = 31;
  normal.unlocked = ["pistol", "turret"];
  normal.structures.push({ id: 7, kind: "turret", health: 88 });
  const sandbox = {
    game: createTankTrialGame(startTankTrial(createTankTrialSession())),
    tankTrialSession: null,
    tankTrialSnapshot: structuredClone(normal),
    tankTrialReturnFocus: null,
    tankTrialDialog: { hidden: false },
    tankTrialEntry: { hidden: false },
    tankTrialStatus: { hidden: false },
    ultimateStatus: { hidden: true },
    atlasStatus: { dataset: {}, textContent: "" },
    canvas: { hidden: false },
    restoreTankTrialGame,
    failTankTrial,
    createTankTrialSession,
    dismissTankTrialOffer,
    createGameState,
    renderTankTrialFragments() {},
    renderWeaponBar() {},
    restorePromptFocus() {},
    showTankTrialResult() {},
    console: { error() {} },
  };
  sandbox.returnToTitle = () => {
    sandbox.game.mode = "title";
    sandbox.tankTrialSession = createTankTrialSession();
    sandbox.tankTrialSnapshot = null;
  };
  new Script(runtimeSource + "\nthis.failActiveTankTrial = failActiveTankTrial;")
    .runInNewContext(sandbox);

  let restored;
  assert.doesNotThrow(() => {
    restored = sandbox.failActiveTankTrial("state");
  });
  assert.equal(restored, true);
  assert.deepEqual(sandbox.game, normal);

  sandbox.game = createTankTrialGame(startTankTrial(createTankTrialSession()));
  sandbox.tankTrialSession = undefined;
  sandbox.tankTrialSnapshot = { broken: true };
  let fallback;
  assert.doesNotThrow(() => {
    fallback = sandbox.failActiveTankTrial("state");
  });
  assert.equal(fallback, false);
  assert.equal(sandbox.game.mode, "title");
  assert.equal(sandbox.tankTrialSnapshot, null);
  assert.equal(sandbox.tankTrialSession.active, false);
});

test("坦克试炼同帧死亡先于清波结算", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const updateSource = extractGameFunction(source, "update", "finishGame");
  const calls = [];
  const sandbox = {
    game: {
      mode: "playing",
      time: 0,
      player: { health: 100, weapon: "pistol" },
      structures: [],
      enemies: [{ id: 1, health: 1 }],
    },
    tankTrialSession: {
      ...startTankTrial(createTankTrialSession()),
      fragments: 4,
    },
    tankTrialSnapshot: {},
    developerSession: {},
    weapons: [],
    clamp: (value) => value,
    isSurvivalOver: (state) => state.player.health <= 0,
    failActiveTankTrial: (reason) => calls.push(["fail", reason]),
    resolveTankTrialFrameState: () => "trial",
    finishGame: () => calls.push(["finish"]),
    updateWave: () => {
      calls.push(["finish"]);
      sandbox.tankTrialSession.fragments = 5;
      return "restored";
    },
    updatePlayer() {},
    updateEnemies() {},
    updateStructures() {},
    updateShockwaves() {},
    updateLightning: () => calls.push(["lightning"]),
    updateBullets() {},
    updatePickups() {},
    updateHazards() {
      sandbox.game.player.health = 0;
      sandbox.game.enemies = [];
    },
    updateParticles: () => calls.push(["particles"]),
    tickCombo: () => calls.push(["combo"]),
  };
  new Script(updateSource + "\nthis.update = update;").runInNewContext(sandbox);
  sandbox.update(1 / 60);
  assert.deepEqual(calls, [["fail", "death"]]);
  assert.equal(sandbox.tankTrialSession.fragments, 4);
});

test("坦克试炼运行时拒绝切枪、非手枪开火和设施放置", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const game = createGameState();
  game.mode = "playing";
  game.unlocked = ["pistol", "shotgun", "turret"];
  game.player.weapon = "shotgun";
  const failures = [];
  const sandbox = {
    game,
    tankTrialSession: startTankTrial(createTankTrialSession()),
    tankTrialSnapshot: {},
    weapons,
    developerSession: { enabled: true, weapon: "shotgun" },
    cancelReload() {},
    renderWeaponBar() {},
    ensureSound: () => () => {},
    failActiveTankTrial: (reason) => failures.push(reason),
    hasUsableAmmo: () => true,
    beginReload() {},
    fireBullet() {},
    fireFlame() {},
    fireLaser() {},
    shouldConsumeAmmo: () => true,
    mouse: { x: 0, y: 0 },
    STRUCTURE_LIMITS,
    validPlacement: () => true,
    burst() {},
    Math,
  };
  const runtimeSource = [
    extractGameFunction(source, "selectDeveloperWeapon", "togglePause"),
    extractGameFunction(source, "switchWeapon", "beginReload"),
    extractGameFunction(source, "useWeapon", "placeStructure"),
    extractGameFunction(source, "placeStructure", "spawnEnemy"),
  ].join("\n");
  new Script(
    runtimeSource +
      "\nthis.api = { selectDeveloperWeapon, switchWeapon, useWeapon, placeStructure };",
  ).runInNewContext(sandbox);

  assert.equal(sandbox.api.selectDeveloperWeapon(game, sandbox.developerSession, "pistol"), false);
  sandbox.api.switchWeapon(0);
  assert.equal(game.player.weapon, "shotgun");
  sandbox.api.useWeapon();
  sandbox.api.placeStructure("turret");
  assert.deepEqual(failures, ["non-pistol", "structure"]);
  assert.equal(game.structures.length, 0);

  const frameFailures = [];
  const updateSandbox = {
    game: {
      mode: "playing",
      player: { health: 100, weapon: "shotgun" },
      structures: [],
    },
    tankTrialSession: startTankTrial(createTankTrialSession()),
    tankTrialSnapshot: {},
    isSurvivalOver: () => false,
    failActiveTankTrial: (reason) => frameFailures.push(reason),
    resolveTankTrialFrameState: () => "trial",
  };
  new Script(
    extractGameFunction(source, "update", "finishGame") + "\nthis.update = update;",
  ).runInNewContext(updateSandbox);
  updateSandbox.update(1 / 60);
  assert.deepEqual(frameFailures, ["non-pistol"]);
});

test("weapon visual feedback is triggered only by successful handheld fire", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const useSource = extractGameFunction(source, "useWeapon", "placeStructure");
  const releaseSource = extractGameFunction(
    source,
    "releaseWatermelonCharge",
    "updateWatermelonCharge",
  );
  const updateSource = extractGameFunction(
    source,
    "updatePlayer",
    "resolveStaticCollision",
  );

  assert.match(
    useSource,
    /player\.cooldown = fireRate;[\s\S]*?triggerWeaponVisual\(player, weapon\.id\)/,
  );
  assert.match(
    releaseSource,
    /player\.cooldown = weapon\?\.fireRate \?\? 1\.1;[\s\S]*?triggerWeaponVisual\(player, "watermelon"\)/,
  );
  assert.match(updateSource, /tickWeaponVisual\(player, dt\)/);
  assert.doesNotMatch(
    extractGameFunction(source, "placeStructure", "spawnEnemy"),
    /triggerWeaponVisual/,
  );
});

test("Maria rig and nine weapon images join the required asset gate", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  assert.match(source, /const weaponSprites = new Map\(\)/);
  assert.match(source, /const playerRigSprites = Object\.create\(null\)/);
  assert.match(source, /loadPlayerVisualAssets\(\)/);
  assert.match(
    source,
    /Promise\.all\(\[\s*modelLab \? Promise\.resolve\(\) : Promise\.all\(ENEMY_KINDS\.map\(loadEnemyAtlas\)\),\s*loadPlayerVisualAssets\(\),?\s*\]\)/,
  );
  assert.match(source, /PLAYER_RIG_ASSETS/);
  assert.match(source, /PLAYER_WEAPON_HAND_ASSET_ENTRIES/);
  assert.match(source, /resolvePlayerWeaponHandProfile/);
  assert.match(source, /resolvePlayerRigImages/);
  assert.match(source, /Object\.entries\(PLAYER_RIG_ASSETS\)/);
  assert.match(
    source,
    /loadImageAsset\(src, "Maria " \+ id, 512\)/,
  );
  assert.match(source, /Object\.assign\(playerRigSprites, Object\.fromEntries\(entries\)\)/);
  assert.match(source, /PLAYER_WEAPON_HAND_ASSET_ENTRIES\.map/);
  assert.match(source, /HANDHELD_WEAPON_IDS\.map/);
  assert.match(source, /WEAPON_VISUALS\[weaponId\]\.src/);
  assert.match(source, /startButton\.disabled = true/);
  assert.match(source, /"素材加载失败：" \+ error\.message/);
  assert.doesNotMatch(source, /maria-topdown-clean\.png/);
});

test("player sprite binds Q arcade hands around the weapon without full recoil clipping", async () => {
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const drawSource = extractGameFunction(
    source,
    "drawPlayerSprite",
    "drawWatermelonCharge",
  );
  assert.match(drawSource, /resolveWeaponVisual\(player\.weapon\)/);
  assert.match(drawSource, /weaponSprites\.get\(player\.weapon\)/);
  assert.match(drawSource, /weaponVisualRatios\(player, player\.weapon\)/);
  assert.match(drawSource, /drawWeaponModel\(context, weaponSprite, visual/);
  assert.match(
    drawSource,
    /const visualRecoil = ratios\.recoil \* PLAYER_RIG_VISUAL\.recoilScale/,
  );
  assert.match(drawSource, /resolveWeaponGripPoints\(visual, visualRecoil\)/);
  assert.match(drawSource, /resolvePlayerArmPose\(grips, \{ chargeRatio \}\)/);
  assert.match(drawSource, /resolvePlayerWeaponHandProfile\(player\.weapon\)/);
  assert.match(drawSource, /resolvePlayerRigImages\(playerRigSprites, player\.weapon\)/);
  assert.match(drawSource, /chargeRatio/);
  assert.doesNotMatch(drawSource, /fillRect\(14, -4, 42, 8\)/);
  const bodyIndex = drawSource.indexOf("drawPlayerBody(context, activeRigImages)");
  const farIndex = drawSource.indexOf(
    'drawPlayerArm(context, activeRigImages, pose.far, "far", handProfile)',
  );
  const weaponIndex = drawSource.indexOf(
    "drawWeaponModel(context, weaponSprite, visual",
  );
  const nearIndex = drawSource.indexOf(
    'drawPlayerArm(context, activeRigImages, pose.near, "near", handProfile)',
  );
  assert.ok(bodyIndex >= 0 && farIndex > bodyIndex);
  assert.ok(weaponIndex > farIndex && nearIndex > weaponIndex);
  assert.doesNotMatch(drawSource, /mariaTopdownSprite/);
});

test("placeable equipment has no handheld visual profile", () => {
  assert.equal(resolveWeaponVisual("turret"), null);
  assert.equal(resolveWeaponVisual("tank"), null);
});
