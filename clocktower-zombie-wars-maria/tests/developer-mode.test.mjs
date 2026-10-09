import test from "node:test";
import assert from "node:assert/strict";
import { buildWave, createGameState, weapons } from "../src/game-core.js";
import {
  DEVELOPER_LIMITS,
  applyDeveloperWave,
  buildDeveloperWave,
  canOpenDeveloperReward,
  createDeveloperSession,
  getEnemySpawnLimit,
  hasUsableAmmo,
  normalizeDeveloperInteger,
  shouldConsumeAmmo,
  unlockDeveloperWeapons,
} from "../src/developer-mode.js";

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

test("开发者数字输入取整、限幅并回退最近合法值", () => {
  assert.equal(normalizeDeveloperInteger("12.8", 4, DEVELOPER_LIMITS.totalCount), 13);
  assert.equal(normalizeDeveloperInteger(-9, 4, DEVELOPER_LIMITS.totalCount), 1);
  assert.equal(normalizeDeveloperInteger(900, 4, DEVELOPER_LIMITS.totalCount), 500);
  assert.equal(normalizeDeveloperInteger("", 17, DEVELOPER_LIMITS.totalCount), 17);
  assert.equal(normalizeDeveloperInteger("abc", 17, DEVELOPER_LIMITS.totalCount), 17);
  assert.equal(normalizeDeveloperInteger(Infinity, 17, DEVELOPER_LIMITS.totalCount), 17);
});

test("开发者会话使用正常第一波默认值且不共享状态", () => {
  const first = createDeveloperSession(true);
  const second = createDeveloperSession(true);
  assert.deepEqual(first, {
    enabled: true,
    totalCount: buildWave(1).length,
    concurrentLimit: 16,
    targetWave: 1,
    weapon: "pistol",
    infiniteAmmo: false,
    invincible: false,
  });
  first.totalCount = 99;
  assert.notEqual(second.totalCount, 99);
});

test("开发者奖励只在未领取的奖励波喘息期开放", () => {
  const eligible = {
    developerEnabled: true,
    mode: "playing",
    wave: 20,
    waveQueueLength: 0,
    enemyCount: 0,
    intermission: 0.1,
    rewardActive: false,
    tankTrialActive: false,
    claimedWaves: [],
  };
  assert.equal(canOpenDeveloperReward(eligible), true);
  for (const override of [
    { developerEnabled: false },
    { mode: "paused" },
    { wave: 19 },
    { waveQueueLength: 1 },
    { enemyCount: 1 },
    { intermission: 0 },
    { rewardActive: true },
    { tankTrialActive: true },
    { claimedWaves: [20] },
  ]) {
    assert.equal(canOpenDeveloperReward({ ...eligible, ...override }), false);
  }
});

test("普通波按原构成确定性缩减和循环扩充", () => {
  const base = buildWave(3);
  assert.deepEqual(buildDeveloperWave(3, 2), base.slice(0, 2));
  assert.deepEqual(
    buildDeveloperWave(3, base.length + 2),
    [...base, base[0], base[1]],
  );
});

test("首领波永远保留一个首领且扩充不复制首领", () => {
  assert.deepEqual(buildDeveloperWave(10, 1), ["boss"]);
  const expanded = buildDeveloperWave(10, 80);
  assert.equal(expanded.length, 80);
  assert.equal(expanded.filter((kind) => kind === "boss").length, 1);
});

test("开发者波次严格拒绝非法波次和总数", () => {
  for (const wave of [undefined, null, NaN, Infinity, 0, -1, 1.5, 1000, "2"]) {
    assert.throws(() => buildDeveloperWave(wave, 1), /targetWave/);
  }
  for (const totalCount of [undefined, null, NaN, Infinity, 0, -1, 1.5, 501, "2"]) {
    assert.throws(() => buildDeveloperWave(1, totalCount), /totalCount/);
  }
});

test("应用开发者波次原子清除战斗层并保留玩家得分和建筑", () => {
  const game = createGameState();
  game.player.health = 73;
  game.score = 900;
  game.combo = 4;
  game.playerUpgrades.vitality = 2;
  game.weaponUpgrades.watermelon.damage = 3;
  game.rewardSession.claimedWaves = [20];
  game.structures.push({ id: 9, kind: "turret", x: 300, y: 400 });
  for (const key of [
    "enemies", "enemyDeathAnimations", "bullets", "delayedShots", "damageZones",
    "slowZones", "particles", "beams", "lightningArcs", "hazards", "lightningRings",
    "shockwaves",
  ]) game[key].push({ stale: key });
  game.pendingLightningRings = 3;
  game.lightningSpawnTimer = 2;
  game.spawnTimer = 5;
  game.intermission = 6;

  applyDeveloperWave(game, { targetWave: 10, totalCount: 7 });

  assert.equal(game.wave, 10);
  assert.equal(game.waveQueue.length, 7);
  assert.equal(game.waveQueue.filter((kind) => kind === "boss").length, 1);
  for (const key of [
    "enemies", "enemyDeathAnimations", "bullets", "delayedShots", "damageZones",
    "slowZones", "particles", "beams", "lightningArcs", "hazards", "lightningRings",
    "shockwaves",
  ]) assert.deepEqual(game[key], []);
  assert.equal(game.pendingLightningRings, 0);
  assert.equal(game.lightningSpawnTimer, 0);
  assert.equal(game.spawnTimer, 0);
  assert.equal(game.intermission, 0);
  assert.equal(game.player.health, 73);
  assert.equal(game.score, 900);
  assert.equal(game.combo, 4);
  assert.equal(game.structures.length, 1);
  assert.equal(game.playerUpgrades.vitality, 2);
  assert.equal(game.weaponUpgrades.watermelon.damage, 3);
  assert.deepEqual(game.rewardSession.claimedWaves, [20]);
});

test("新游戏不携带强化名额，开发者跳到后期波会原子生成", () => {
  const game = createGameState();
  assert.deepEqual(game.waveEnhancements, []);
  applyDeveloperWave(
    game,
    { targetWave: 11, totalCount: buildWave(11).length },
    sequence([0, 0]),
  );
  assert.equal(game.wave, 11);
  assert.deepEqual(game.waveEnhancements, ["zombie", "runner"]);
});

test("开发者跳波按目标波生成运行地刺或清空地刺", () => {
  const game = createGameState();
  const context = { width: 1600, height: 900, obstacles: [] };
  applyDeveloperWave(
    game,
    { targetWave: 31, totalCount: 1 },
    sequence([0.1, 0.2, 0.8, 0.2, 0.2, 0.8]),
    context,
  );
  assert.equal(game.spikeTraps.length, 1);
  assert.ok(game.spikeTraps.every((trap) => trap.armed && trap.wave === 31));

  applyDeveloperWave(game, { targetWave: 30, totalCount: 1 }, () => 0.1, context);
  assert.deepEqual(game.spikeTraps, []);
});

test("开发者派生失败时不会留下半更新状态", () => {
  const game = createGameState();
  game.waveEnhancements = ["runner"];
  game.spikeTraps = [{ wave: 31, x: 100, y: 100 }];
  const before = structuredClone(game);
  const brokenContext = {
    get width() { throw new TypeError("bad context"); },
    height: 900,
    obstacles: [],
  };
  assert.throws(() => applyDeveloperWave(
    game,
    { targetWave: 31, totalCount: 1 },
    () => 0,
    brokenContext,
  ), TypeError);
  assert.deepEqual(game, before);
});

test("开发者非法设置不会改变旧强化名单", () => {
  const game = createGameState();
  game.waveEnhancements = ["toxic"];
  const before = structuredClone(game);
  assert.throws(() =>
    applyDeveloperWave(game, { targetWave: 0, totalCount: 7 }, () => 0));
  assert.deepEqual(game, before);
});

test("非法开发者波次应用失败时游戏状态完全不变", () => {
  const invalidWaves = [undefined, null, NaN, Infinity, 0, -1, 1.5, 1000, "2"];
  const invalidTotals = [undefined, null, NaN, Infinity, 0, -1, 1.5, 501, "2"];
  const settingsCases = [
    ...invalidWaves.map((targetWave) => ({ targetWave, totalCount: 7 })),
    ...invalidTotals.map((totalCount) => ({ targetWave: 10, totalCount })),
  ];
  for (const settings of settingsCases) {
    const game = createGameState();
    game.enemies.push({ id: 42, kind: "zombie" });
    game.bullets.push({ id: 43 });
    const before = structuredClone(game);
    assert.throws(() => applyDeveloperWave(game, settings));
    assert.deepEqual(game, before);
  }
});

test("开发者波次设置只读取一次且读取失败绝不清场", () => {
  const game = createGameState();
  game.enemies.push({ id: 42, kind: "zombie" });
  const before = structuredClone(game);
  const invalidReads = { targetWave: 0, totalCount: 0 };
  const settings = {
    get targetWave() {
      invalidReads.targetWave += 1;
      if (invalidReads.targetWave > 1) throw new Error("targetWave read twice");
      return 0;
    },
    get totalCount() {
      invalidReads.totalCount += 1;
      if (invalidReads.totalCount > 1) throw new Error("totalCount read twice");
      return 7;
    },
  };

  assert.throws(() => applyDeveloperWave(game, settings), /targetWave/);
  assert.deepEqual(invalidReads, { targetWave: 1, totalCount: 1 });
  assert.deepEqual(game, before);

  const validGame = createGameState();
  const reads = { targetWave: 0, totalCount: 0 };
  applyDeveloperWave(validGame, {
    get targetWave() {
      reads.targetWave += 1;
      if (reads.targetWave > 1) throw new Error("targetWave read twice");
      return 3;
    },
    get totalCount() {
      reads.totalCount += 1;
      if (reads.totalCount > 1) throw new Error("totalCount read twice");
      return 2;
    },
  });
  assert.deepEqual(reads, { targetWave: 1, totalCount: 1 });
  assert.equal(validGame.wave, 3);
  assert.equal(validGame.waveQueue.length, 2);
});

test("场上上限只在启用开发者会话时替代正常公式", () => {
  assert.equal(getEnemySpawnLimit({ wave: 7 }, createDeveloperSession(false)), 28);
  const session = createDeveloperSession(true);
  session.concurrentLimit = 9;
  assert.equal(getEnemySpawnLimit({ wave: 7 }, session), 9);
});

test("开发者模式解锁全部武器且无限弹药不依赖真实余量", () => {
  const game = createGameState();
  unlockDeveloperWeapons(game);
  assert.deepEqual(game.unlocked, weapons.map((weapon) => weapon.id));
  for (const weaponId of ["lightning", "freeze", "watermelon"]) {
    assert.equal(game.unlocked.includes(weaponId), true);
  }
  game.player.ammo.rocket = 0;
  assert.equal(hasUsableAmmo(game.player, "rocket", { enabled: true, infiniteAmmo: true }), true);
  assert.equal(hasUsableAmmo(game.player, "rocket", { enabled: true, infiniteAmmo: false }), false);
  assert.equal(hasUsableAmmo(game.player, "rocket", { enabled: false, infiniteAmmo: true }), false);
  assert.equal(shouldConsumeAmmo({ enabled: true, infiniteAmmo: true }), false);
  assert.equal(shouldConsumeAmmo({ enabled: true, infiniteAmmo: false }), true);
});

test("高阶开发者跳波保留双Boss且尊重总数设置", () => {
  for (const wave of [70, 80, 90]) {
    assert.deepEqual(buildDeveloperWave(wave, 2), ["boss", "boss"]);
    assert.equal(buildDeveloperWave(wave, 20).filter(kind => kind === "boss").length, 2);
    assert.deepEqual(buildDeveloperWave(wave, 1), ["boss"]);
  }
});
