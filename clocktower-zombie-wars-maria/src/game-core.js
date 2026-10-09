import {
  createPlayerUpgrades,
  createRewardSession,
} from "./reward-progression.js";
import { createWeaponUpgrades } from "./weapon-traits.js";

export const WIDTH = 1600;
export const HEIGHT = 900;
export const TAU = Math.PI * 2;
export const FIXED_STEP = 1 / 60;

export const ARENA_PILLARS = Object.freeze([
  { x: 430, y: 230, rx: 38, ry: 34 },
  { x: 1170, y: 230, rx: 38, ry: 34 },
  { x: 430, y: 670, rx: 38, ry: 34 },
  { x: 1170, y: 670, rx: 38, ry: 34 },
]);

export const DODGE = Object.freeze({
  duration: 0.32,
  invulnerability: FIXED_STEP,
  cooldown: 0.75,
  speed: 620,
});

export const STRUCTURE_LIMITS = Object.freeze({ turret: 2, tank: 1 });

// Score requirements sit slightly above the no-combo total at their target wave.
// A modest streak opens each weapon on time; wave gates prevent early full unlocks.
export const weapons = [
  { id: "pistol", name: "手枪", unlockWave: 1, scoreRequired: 0, ammo: 12, reserve: Infinity, fireRate: 0.24 },
  { id: "shotgun", name: "霰弹枪", unlockWave: 2, scoreRequired: 3000, ammo: 8, reserve: 40, fireRate: 0.7 },
  { id: "flamethrower", name: "喷火枪", unlockWave: 5, scoreRequired: 15000, ammo: 100, reserve: 200, fireRate: 0.06 },
  { id: "ricochet", name: "反弹炮", unlockWave: 12, scoreRequired: 80000, ammo: 6, reserve: 18, fireRate: 0.85 },
  { id: "rocket", name: "火箭筒", unlockWave: 20, scoreRequired: 220000, ammo: 4, reserve: 12, fireRate: 1.1 },
  { id: "laser", name: "直线激光", unlockWave: 30, scoreRequired: 480000, ammo: 5, reserve: 15, fireRate: 1.35 },
  { id: "lightning", name: "蓄力箭雨枪", unlockWave: 40, scoreRequired: 850000, ammo: 8, reserve: 24, fireRate: 0.75 },
  { id: "freeze", name: "冰冻枪", unlockWave: 50, scoreRequired: 1300000, ammo: 10, reserve: 30, fireRate: 0.65 },
  { id: "watermelon", name: "西瓜枪", unlockWave: 60, scoreRequired: 1850000, ammo: 3, reserve: 9, fireRate: 1.1 },
  { id: "turret", name: "机枪塔", unlockWave: 70, scoreRequired: 2550000, ammo: 2, reserve: 2, fireRate: 0.6, maxDeployed: STRUCTURE_LIMITS.turret },
  { id: "tank", name: "坦克", ammo: 1, reserve: 1, fireRate: 0.8, maxDeployed: STRUCTURE_LIMITS.tank },
];

export function rollRareButterfly(random = Math.random) {
  const roll = random();
  return roll >= 0 && roll < 0.001 ? "blue" : roll >= 0.001 && roll < 0.002 ? "yellow" : null;
}

export function createRareButterfly(id, color, x, y, now) {
  return { id, kind: "zombie", isRareButterfly: true, butterflyColor: color,
    x, y, anchorX: x, anchorY: y, bornAt: now, expiresAt: now + 14,
    health: 1, maxHealth: 1, radius: 19, speed: 0, damage: 0,
    attackCooldown: 0, shotCooldown: 0, hitFlash: 0, animationTime: 0,
    animationPhase: 0, attackAnimation: 0, hurtAnimation: 0,
    slowStatuses: [], damageOverTime: [], scoreMultiplier: 0 };
}

export function grantButterflyBuff(player, color, now) {
  if (color === "blue") player.butterflyDamageUntil = now + 10;
  if (color === "yellow") player.butterflySpeedUntil = now + 10;
}

export function butterflyDamageMultiplier(player, now, source) {
  const playerSource = weapons.some(weapon => weapon.id === source) || source === "rocket-shock";
  return playerSource && (player.butterflyDamageUntil ?? 0) > now ? 2 : 1;
}

export function butterflySpeedMultiplier(player, now) {
  return (player.butterflySpeedUntil ?? 0) > now ? 1.5 : 1;
}

export const enemyStats = {
  zombie: { health: 45, speed: 48, damage: 11, score: 100, radius: 16 },
  runner: { health: 28, speed: 105, damage: 9, score: 170, radius: 14 },
  exploder: { health: 38, speed: 72, damage: 32, score: 260, radius: 17 },
  toxic: { health: 72, speed: 44, damage: 8, score: 320, radius: 18 },
  brute: { health: 240, speed: 27, damage: 28, score: 600, radius: 34 },
  devil: { health: 95, speed: 38, damage: 18, score: 420, radius: 18 },
  boss: { health: 2400, speed: 26, damage: 32, score: 5000, radius: 58 },
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalize(x, y) {
  const length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function resolveDodgeDirection(moveX, moveY, aimX, aimY) {
  const movement = normalize(moveX, moveY);
  if (movement.x || movement.y) return movement;
  const aim = normalize(aimX, aimY);
  return aim.x || aim.y ? aim : { x: 1, y: 0 };
}

export function requestDodge(player, repeated) {
  if (repeated || player.dodgePressed) return false;
  player.dodgePressed = true;
  return true;
}

export function startDodge(player, direction) {
  if (player.dodgeDuration > 0 || player.dodgeCooldown > 0) return false;
  player.dodgeX = direction.x;
  player.dodgeY = direction.y;
  player.dodgeDuration = DODGE.duration;
  player.dodgeInvulnerability = DODGE.invulnerability;
  player.dodgeCooldown = DODGE.cooldown;
  return true;
}

export function tickDodge(player, dt) {
  player.dodgeDuration = Math.max(0, player.dodgeDuration - dt);
  player.dodgeInvulnerability = Math.max(0, player.dodgeInvulnerability - dt);
  player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
}

export function isPlayerInvulnerable(player) {
  return player.dodgeInvulnerability > 0;
}

export function getStableRollPose(progress) {
  const p = clamp(progress, 0, 1);
  return { scale: 1, tilt: Math.sin(p * Math.PI) * 0.55 };
}

export function isSurvivalOver(state) {
  return state.player.health <= 0;
}

export function resolveGroundCollision(entity, obstacle, radius = 18) {
  const width = obstacle.rx + radius;
  const height = obstacle.ry + radius;
  let dx = (entity.x - obstacle.x) / width;
  let dy = (entity.y - obstacle.y) / height;
  let length = Math.hypot(dx, dy);
  if (length >= 1) return false;
  if (length === 0) {
    dx = 1;
    dy = 0;
    length = 1;
  }
  entity.x = obstacle.x + (dx / length) * width;
  entity.y = obstacle.y + (dy / length) * height;
  return true;
}

export function scoreMultiplierForCombo(combo) {
  const streak = Number.isFinite(combo) ? Math.max(1, Math.floor(combo)) : 1;
  return Math.min(6, 1 + Math.floor(Math.sqrt(streak - 1) / 2));
}

export function unlockedForProgress(score, wave) {
  if (!Number.isFinite(score) || !Number.isFinite(wave)) return [];
  return weapons
    .filter((weapon) => weapon.id !== "tank" && wave >= weapon.unlockWave && score >= weapon.scoreRequired)
    .map((weapon) => weapon.id);
}

export function unlockWeaponsForProgress(state) {
  const available = unlockedForProgress(state.score, state.wave);
  const fresh = available.filter((id) => !state.unlocked.includes(id));
  if (!fresh.length) return [];
  state.unlocked = [...new Set([...state.unlocked, ...fresh])];
  const weapon = weapons.find((entry) => entry.id === fresh.at(-1));
  state.notice = `已解锁：${weapon.name}`;
  state.noticeTimer = 2.4;
  return fresh;
}

export function baseZombieCount(wave) {
  return 8 + wave * 4;
}

export function isBossWave(wave) {
  return wave > 0 && wave % 10 === 0;
}

export const BOSS_ARCHETYPES = Object.freeze([
  { baseKind: "zombie", name: "巨型行尸", moves: ["slash", "stomp"], speedFactor: 0.85 },
  { baseKind: "toxic", name: "腐毒巨尸", moves: ["toxicBurst", "plague"], speedFactor: 0.4 },
  { baseKind: "runner", name: "疾猎巨尸", moves: ["rush", "feint"], speedFactor: 0.95 },
  { baseKind: "brute", name: "重甲巨尸", moves: ["slam", "fissure"], speedFactor: 0.8 },
  { baseKind: "exploder", name: "爆破巨尸", moves: ["blast", "bombard"], speedFactor: 0.55 },
  { baseKind: "devil", name: "恶魔巨尸", moves: ["barrage", "summon"], speedFactor: 0.85 },
]);

export function bossProfileForWave(wave, archetypeIndex = null) {
  const level = Math.max(1, Math.floor(wave / 10));
  const cycle = Math.floor((level - 1) / BOSS_ARCHETYPES.length);
  const entry = BOSS_ARCHETYPES[archetypeIndex ?? ((level - 1) % BOSS_ARCHETYPES.length)];
  const stats = enemyStats[entry.baseKind];
  const scale = Math.min(2.3, 1.8 + cycle * 0.1);
  const ordinaryHealth = stats.health + wave * (entry.baseKind === "zombie" ? 2 : 1);
  // Wave 10 survives about eight full, unupgraded shotgun volleys (9 x 42 damage).
  // Each later boss wave gains durability while preserving the archetype's
  // doubled ordinary-health contribution. Paired bosses each use this budget.
  const health = Math.ceil((2650 + (level - 1) * 500 + ordinaryHealth * 2) / 50) * 50;
  const damage = stats.damage;
  return {
    bossArchetype: entry.baseKind, bossName: entry.name, bossScale: scale,
    bossCycle: cycle, bossMoves: [...entry.moves, ...(wave >= 70 ? [{
      zombie: "ring", toxic: "spores", runner: "pounce", brute: "cross", exploder: "meteor", devil: "orbit",
    }[entry.baseKind]] : [])],
    bossPreferredRange: ["toxic", "devil", "exploder"].includes(entry.baseKind) ? 245 : 75, bossRageAllowed: cycle > 0,
    bossSlashCount: wave >= 80 ? 2 : 1,
    health, speed: (stats.speed + Math.min(28, wave * 1.6)) * entry.speedFactor,
    damage, radius: stats.radius * scale,
    gasRadius: entry.baseKind === "toxic" ? 164 : undefined,
    explosionRadius: entry.baseKind === "exploder" ? 244 : undefined,
    bossMoveOverrides: {
      slash: { name: entry.baseKind === "zombie" ? "巨尸挥爪" : "重爪横扫", radius: stats.radius * scale + 58, damage, active: wave >= 80 ? 1.05 : 0.75 },
      charge: { speed: 420, damage }, slam: { damage },
      stomp: { radius: wave >= 80 ? 180 : 155 },
      plague: { radius: wave >= 80 ? 85 : 70 },
      rush: { speed: wave >= 80 ? 700 : 650 },
      fissure: { range: wave >= 80 ? 430 : 360 },
      bombard: { radius: wave >= 80 ? 115 : 100 },
      barrage: { count: wave >= 80 ? 7 : 5 },
      ring: { radius: wave >= 90 ? 275 : 235 },
      spores: { radius: wave >= 90 ? 82 : 68 },
      pounce: { range: wave >= 90 ? 400 : 340 },
      cross: { range: wave >= 90 ? 350 : 290 },
      meteor: { radius: wave >= 90 ? 92 : 78 },
      orbit: { count: wave >= 90 ? 17 : 13 },
      toxicBurst: { radius: 164, damage }, blast: { radius: 244, damage }, volley: { damage },
    },
  };
}

export function bossProfilesForWave(wave, random = Math.random) {
  if (wave < 70) return [bossProfileForWave(wave)];
  const first = Math.min(5, Math.max(0, Math.floor(random() * 6)));
  const offset = 1 + Math.min(4, Math.max(0, Math.floor(random() * 5)));
  const second = (first + offset) % BOSS_ARCHETYPES.length;
  return [bossProfileForWave(wave, first), bossProfileForWave(wave, second)];
}

export function bossHealthForWave(wave) {
  return bossProfileForWave(wave).health;
}

export const LIGHTNING_BURST_UNLOCK_WAVE = 30;

export function isLightningBurstUnlocked(wave) {
  return Number.isInteger(wave) && wave >= LIGHTNING_BURST_UNLOCK_WAVE;
}

export function lightningRingCount(bossKills) {
  return 1 + Math.max(0, bossKills);
}

export function flameDamageAtDistance(range) {
  if (range < 0 || range > 430) return 0;
  if (range <= 160) return 12;
  return 12 - ((range - 160) / 270) * 7;
}

export function buildWave(wave) {
  const queue = Array.from({ length: baseZombieCount(wave) }, () => "zombie");
  if (wave >= 3) {
    for (let index = 0; index < Math.ceil(wave / 2); index += 1) {
      queue.splice((index * 4 + 2) % queue.length, 0, "runner");
    }
    queue.splice(Math.min(4, queue.length), 0, "exploder");
  }
  if (wave >= 5) {
    for (let index = 0; index < Math.ceil((wave - 3) / 3); index += 1) {
      queue.splice((index * 6 + 3) % queue.length, 0, "toxic");
    }
  }
  if (wave >= 7) {
    for (let index = 0; index < Math.ceil((wave - 5) / 4); index += 1) {
      queue.splice((index * 8 + 5) % queue.length, 0, "brute");
    }
  }
  if (wave >= 9) {
    for (let index = 0; index < Math.ceil((wave - 7) / 3); index += 1) {
      queue.splice((index * 7 + 5) % queue.length, 0, "devil");
    }
  }
  if (isBossWave(wave)) { queue.push("boss"); if (wave >= 70) queue.push("boss"); }
  return queue;
}

export function createGameState() {
  const ammo = Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon.ammo]));
  const reserve = Object.fromEntries(weapons.map((weapon) => [weapon.id, weapon.reserve]));
  return {
    mode: "title",
    time: 0,
    nextId: 1,
    player: {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      aimX: 1,
      aimY: 0,
      health: 100,
      maxHealth: 100,
      shield: 0,
      speed: 235,
      uprightMotionBlend: 0,
      uprightGaitPhase: 0,
      uprightMoveX: 1,
      uprightMoveY: 0,
      butterflyDamageUntil: 0,
      butterflySpeedUntil: 0,
      weapon: "pistol",
      ammo,
      reserve,
      cooldown: 0,
      reload: 0,
      reloadWeapon: null,
      chargeWeapon: null,
      chargeTime: 0,
      weaponVisualId: null,
      weaponRecoil: 0,
      weaponFeedback: 0,
      hitFlash: 0,
      dodgeDuration: 0,
      dodgeInvulnerability: 0,
      dodgeCooldown: 0,
      dodgeX: 1,
      dodgeY: 0,
      dodgePressed: false,
    },
    enemies: [],
    enemyDeathAnimations: [],
    iceStatues: [],
    bullets: [],
    delayedShots: [],
    damageZones: [],
    slowZones: [],
    structures: [],
    particles: [],
    beams: [],
    lightningArcs: [],
    arrowRains: [],
    lightningHitEffects: [],
    decals: [],
    hazards: [],
    spikeTraps: [],
    terrainTraps: [],
    pickups: [],
    lightningRings: [],
    shockwaves: [],
    playerUpgrades: createPlayerUpgrades(),
    weaponUpgrades: createWeaponUpgrades(),
    rewardSession: createRewardSession(),
    score: 0,
    combo: 1,
    comboTimer: 0,
    highestCombo: 1,
    bossKills: 0,
    ultimateTimer: 20,
    pendingLightningRings: 0,
    lightningSpawnTimer: 0,
    unlocked: ["pistol"],
    wave: 1,
    waveQueue: buildWave(1),
    waveEnhancements: [],
    spawnTimer: 0,
    intermission: 0,
    kills: 0,
    notice: "第一波",
    noticeTimer: 2,
  };
}

export function healthAfterPack(currentHealth, maximumHealth = 100, ratio = 0.3) {
  const maximum = Number.isFinite(maximumHealth) && maximumHealth > 0
    ? maximumHealth
    : 100;
  const recoveryRatio = Number.isFinite(ratio) && ratio >= 0 ? ratio : 0.3;
  const health = clamp(currentHealth, 0, maximum);
  if (health <= 0) return 0;
  return clamp(health * (1 + recoveryRatio), 0, maximum);
}

export function rewardBossKill(state, boss) {
  if (boss.bossRewarded) return false;
  boss.bossRewarded = true;
  state.bossKills += 1;
  state.notice = isLightningBurstUnlocked(state.wave)
    ? "雷电增幅＋1" : `雷电增幅已储备＋1 · 第${LIGHTNING_BURST_UNLOCK_WAVE}波启用`;
  state.noticeTimer = 2.4;
  return true;
}

export function tickLightningRingLifetime(ring, dt) {
  ring.life = Math.max(0, ring.life - dt);
  return ring.life > 0;
}

export function upsertLightningHitEffect(state, target) {
  if (
    state === null ||
    typeof state !== "object" ||
    target === null ||
    typeof target !== "object" ||
    !(typeof target.id === "string" || Number.isFinite(target.id)) ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y)
  ) return false;

  if (!Array.isArray(state.lightningHitEffects)) state.lightningHitEffects = [];
  const life = 0.18;
  const radius = Number.isFinite(target.radius) && target.radius > 0
    ? target.radius
    : 16;
  const effect = {
    targetId: target.id,
    x: target.x,
    y: target.y,
    radius,
    life,
    maxLife: life,
    seed:
      (Number.isFinite(state.time) ? state.time : 0) * 997 +
      target.x * 0.73 +
      target.y * 0.37,
  };
  const index = state.lightningHitEffects.findIndex(
    (candidate) => candidate?.targetId === target.id,
  );
  if (index >= 0) state.lightningHitEffects[index] = effect;
  else state.lightningHitEffects.push(effect);
  return true;
}

export function tickLightningHitEffects(state, dt) {
  if (state === null || typeof state !== "object") return [];
  if (!Array.isArray(state.lightningHitEffects)) state.lightningHitEffects = [];
  const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
  for (const effect of state.lightningHitEffects) {
    effect.life = Math.max(0, effect.life - elapsed);
  }
  state.lightningHitEffects = state.lightningHitEffects.filter(
    (effect) => Number.isFinite(effect?.life) && effect.life > 0,
  );
  return state.lightningHitEffects;
}

export function resetWaveLightning(state) {
  state.ultimateTimer = 20;
  state.pendingLightningRings = 0;
  state.lightningSpawnTimer = 0;
  state.lightningRings = [];
}

export function applyKill(state, kind, multiKill = 1, scoreMultiplier = 1) {
  const base = enemyStats[kind].score;
  const multiplier =
    Number.isFinite(scoreMultiplier) && scoreMultiplier > 0
      ? scoreMultiplier
      : 1;
  state.kills += 1;
  state.score += Math.round(base * scoreMultiplierForCombo(state.combo) * multiplier);
  state.combo = clamp(state.combo + Math.max(1, multiKill), 1, 150);
  state.highestCombo = Math.max(state.highestCombo, state.combo);
  state.comboTimer = 3.4;
  unlockWeaponsForProgress(state);
}

export function tickCombo(state, dt) {
  if (state.combo <= 1) return;
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) {
    state.combo -= 1;
    state.comboTimer = state.combo > 1 ? 0.48 : 0;
  }
}

export function canPlace(state, x, y, kind = state.player?.weapon) {
  const limit = STRUCTURE_LIMITS[kind];
  if (limit && state.structures.filter(s => s.kind === kind && s.health > 0).length >= limit) return false;
  if (x < 90 || x > WIDTH - 90 || y < 105 || y > HEIGHT - 75) return false;
  return !state.structures.some((structure) => (structure.health === undefined || structure.health > 0) && Math.hypot(x - structure.x, y - structure.y) < 58);
}
