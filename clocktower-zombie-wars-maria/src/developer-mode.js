import { buildWave, weapons } from "./game-core.js";
import { buildWaveEnhancements } from "./random-wave-enhancements.js";
import { createWaveTraps } from "./spike-traps.js";

export const DEVELOPER_LIMITS = Object.freeze({
  totalCount: Object.freeze({ min: 1, max: 500 }),
  concurrentLimit: Object.freeze({ min: 1, max: 100 }),
  targetWave: Object.freeze({ min: 1, max: 999 }),
});

export function normalizeDeveloperInteger(value, fallback, limits) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(limits.min, Math.min(limits.max, Math.round(number)));
}

export function createDeveloperSession(enabled = false) {
  return {
    enabled: Boolean(enabled),
    totalCount: buildWave(1).length,
    concurrentLimit: 16,
    targetWave: 1,
    weapon: "pistol",
    infiniteAmmo: false,
    invincible: false,
  };
}

export function canOpenDeveloperReward({
  developerEnabled,
  mode,
  wave,
  waveQueueLength,
  enemyCount,
  intermission,
  rewardActive,
  tankTrialActive,
  claimedWaves,
}) {
  return (
    developerEnabled === true &&
    mode === "playing" &&
    Number.isInteger(wave) &&
    wave > 0 &&
    wave % 20 === 0 &&
    waveQueueLength === 0 &&
    enemyCount === 0 &&
    intermission > 0 &&
    rewardActive !== true &&
    tankTrialActive !== true &&
    !claimedWaves?.includes?.(wave)
  );
}

function validateDeveloperInteger(value, name, limits) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError(`${name} must be a finite integer`);
  }
  if (value < limits.min || value > limits.max) {
    throw new RangeError(`${name} must be between ${limits.min} and ${limits.max}`);
  }
  return value;
}

export function buildDeveloperWave(targetWave, totalCount) {
  const waveSnapshot = validateDeveloperInteger(
    targetWave,
    "targetWave",
    DEVELOPER_LIMITS.targetWave,
  );
  const totalCountSnapshot = validateDeveloperInteger(
    totalCount,
    "totalCount",
    DEVELOPER_LIMITS.totalCount,
  );
  const base = buildWave(waveSnapshot);
  const bossIndex = base.indexOf("boss");
  if (bossIndex >= 0) {
    const ordinary = base.filter((kind) => kind !== "boss");
    const queue = Array(Math.min(totalCountSnapshot, base.filter(kind => kind === "boss").length)).fill("boss");
    for (let index = 0; queue.length < totalCountSnapshot; index += 1) {
      queue.push(ordinary[index % ordinary.length]);
    }
    return queue;
  }
  return Array.from(
    { length: totalCountSnapshot },
    (_, index) => base[index % base.length],
  );
}

const CLEARED_COMBAT_LISTS = Object.freeze([
  "enemies",
  "enemyDeathAnimations",
  "bullets",
  "delayedShots",
  "damageZones",
  "slowZones",
  "particles",
  "beams",
  "lightningArcs",
  "hazards",
  "lightningRings",
  "shockwaves",
]);

export function applyDeveloperWave(
  game,
  settings,
  random = Math.random,
  spikeContext = {},
) {
  const targetWave = settings.targetWave;
  const totalCount = settings.totalCount;
  const queue = buildDeveloperWave(targetWave, totalCount);
  const waveEnhancements = buildWaveEnhancements(targetWave, random);
  const { spikeTraps, terrainTraps } = createWaveTraps({
    wave: targetWave,
    width: spikeContext.width,
    height: spikeContext.height,
    obstacles: spikeContext.obstacles,
    structures: game.structures,
    player: game.player,
    random,
    active: true,
  });
  for (const key of CLEARED_COMBAT_LISTS) game[key] = [];
  game.pendingLightningRings = 0;
  game.lightningSpawnTimer = 0;
  game.wave = targetWave;
  game.waveQueue = queue;
  game.waveEnhancements = waveEnhancements;
  game.spikeTraps = spikeTraps;
  game.terrainTraps = terrainTraps;
  game.spawnTimer = 0;
  game.intermission = 0;
  game.notice = `开发者：第 ${game.wave} 波`;
  game.noticeTimer = 2;
  return game;
}

export function getEnemySpawnLimit(game, session) {
  return session.enabled ? session.concurrentLimit : 14 + game.wave * 2;
}

export function unlockDeveloperWeapons(game) {
  game.unlocked = weapons.map((weapon) => weapon.id);
  return game.unlocked;
}

export function hasUsableAmmo(player, weaponId, session) {
  return Boolean(session.enabled && session.infiniteAmmo) || player.ammo[weaponId] > 0;
}

export function shouldConsumeAmmo(session) {
  return !(session.enabled && session.infiniteAmmo);
}
