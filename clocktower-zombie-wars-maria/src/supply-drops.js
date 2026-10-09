import { weaponStat } from "./weapon-traits.js";

const ORDINARY_DROP_CHANCE = 0.08;
const ELITE_DROP_CHANCE = 0.5;
const AMMO_DROP_CHANCE = 0.7;
const ORDINARY_KINDS = new Set(["zombie", "runner", "exploder", "toxic"]);
const ELITE_KINDS = new Set(["brute", "devil"]);

export function dropChanceFor(kind, context = {}) {
  if (!ELITE_KINDS.has(kind) && !ORDINARY_KINDS.has(kind)) return null;
  if (context.survival === false || !Number.isInteger(context.wave) || context.wave < 1) {
    return ELITE_KINDS.has(kind) ? ELITE_DROP_CHANCE : ORDINARY_DROP_CHANCE;
  }
  // Enemy counts grow by wave. Reduce common-enemy odds to keep the arena clear,
  // while elite supplies rise gently and low resources grant a small safety boost.
  const tier = Math.floor((context.wave - 1) / 10);
  const base = ELITE_KINDS.has(kind)
    ? Math.min(0.48, 0.35 + tier * 0.015)
    : Math.max(0.035, 0.10 - tier * 0.01);
  const healthNeed = Number.isFinite(context.healthRatio)
    ? Math.max(0, Math.min(1, 1 - context.healthRatio)) : 0;
  const ammoNeed = Number.isFinite(context.ammoRatio)
    ? Math.max(0, Math.min(1, 1 - context.ammoRatio)) : 0;
  return Math.min(0.6, base + healthNeed * 0.025 + ammoNeed * 0.02);
}

export const AMMO_SUPPLIES = Object.freeze({
  shotgun: Object.freeze({
    storage: "reserve",
    amount: 8,
    max: 40,
    label: "霰弹枪",
    shortLabel: "霰",
  }),
  rocket: Object.freeze({
    storage: "ammo",
    amount: 4,
    max: 12,
    label: "火箭筒",
    shortLabel: "火",
  }),
  flamethrower: Object.freeze({
    storage: "ammo",
    amount: 100,
    max: 200,
    label: "喷火枪",
    shortLabel: "焰",
  }),
  laser: Object.freeze({
    storage: "ammo",
    amount: 5,
    max: 15,
    label: "直线激光",
    shortLabel: "光",
  }),
  ricochet: Object.freeze({
    storage: "ammo",
    amount: 6,
    max: 18,
    label: "反弹炮",
    shortLabel: "弹",
  }),
  lightning: Object.freeze({
    storage: "ammo",
    amount: 8,
    max: 24,
    label: "蓄力箭雨枪",
    shortLabel: "箭",
  }),
  turret: Object.freeze({
    storage: "ammo",
    amount: 1,
    max: 2,
    label: "机枪塔",
    shortLabel: "塔",
  }),
  freeze: Object.freeze({
    storage: "ammo",
    amount: 10,
    max: 30,
    label: "冰冻枪",
    shortLabel: "雪",
  }),
  tank: Object.freeze({
    storage: "ammo",
    amount: 1,
    max: 1,
    label: "坦克",
    shortLabel: "坦",
  }),
  watermelon: Object.freeze({
    storage: "ammo",
    amount: 3,
    max: 9,
    label: "西瓜枪",
    shortLabel: "瓜",
  }),
});

export function ammoDropCandidates(unlocked) {
  if (!Array.isArray(unlocked)) return [];
  const seen = new Set();
  return unlocked.filter((weaponId) => {
    if (!Object.hasOwn(AMMO_SUPPLIES, weaponId) || seen.has(weaponId)) return false;
    seen.add(weaponId);
    return true;
  });
}

function readRandom(random) {
  if (typeof random !== "function") return null;
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
}

export function ammoFillRatio(unlocked, player, upgrades) {
  const candidates = ammoDropCandidates(unlocked);
  if (!candidates.length || !player) return 1;
  return Math.min(...candidates.map((weaponId) => {
    const supply = AMMO_SUPPLIES[weaponId];
    const maximum = weaponStat(supply.max, upgrades, weaponId, "capacity");
    const current = player[supply.storage]?.[weaponId];
    return Number.isFinite(current) && maximum > 0
      ? Math.max(0, Math.min(1, current / maximum)) : 1;
  }));
}

function pickAmmoDrop(unlocked, roll, context = {}) {
  const candidates = ammoDropCandidates(unlocked);
  const available = context.player
    ? candidates.filter((weaponId) => resolveAmmoPickup(
      context.player, weaponId, context.infiniteAmmo, context.upgrades,
    ).collected)
    : candidates;
  if (available.length === 0) return { kind: "health" };
  return {
    kind: "ammo",
    weaponId: available[Math.floor((roll ?? 0) * available.length)],
  };
}

function ammoShare(context) {
  if (context.survival === false || !Number.isFinite(context.healthRatio)
      || !Number.isFinite(context.ammoRatio)) return AMMO_DROP_CHANCE;
  const healthNeed = Math.max(0, Math.min(1, 1 - context.healthRatio));
  const ammoNeed = Math.max(0, Math.min(1, 1 - context.ammoRatio));
  return Math.max(0.25, Math.min(0.9, 0.72 + ammoNeed * 0.2 - healthNeed * 0.55));
}

export function rollEnemyDrops(kind, unlocked, random = Math.random, context = {}) {
  if (kind === "boss") {
    return [{ kind: "health" }, pickAmmoDrop(unlocked, readRandom(random), context)];
  }
  const chance = dropChanceFor(kind, context);
  if (chance === null) return [];
  const dropRoll = readRandom(random);
  if (dropRoll === null || dropRoll >= chance) return [];
  const kindRoll = readRandom(random);
  if (kindRoll === null) return [];
  if (kindRoll >= ammoShare(context)) return [{ kind: "health" }];
  const weaponRoll = readRandom(random);
  if (weaponRoll === null) return [];
  return [pickAmmoDrop(unlocked, weaponRoll, context)];
}

export function resolveAmmoPickup(player, weaponId, infiniteAmmo, upgrades) {
  const supply = AMMO_SUPPLIES[weaponId];
  if (!supply || infiniteAmmo) return { collected: false };
  const inventory = player?.[supply.storage];
  const current = inventory?.[weaponId];
  const maximum = weaponStat(supply.max, upgrades, weaponId, "capacity");
  const amount = weaponStat(supply.amount, upgrades, weaponId, "supply");
  if (!Number.isInteger(current) || current < 0 || current >= maximum) {
    return { collected: false };
  }
  const nextValue = Math.min(maximum, current + amount);
  return {
    collected: true,
    storage: supply.storage,
    weaponId,
    nextValue,
    amount: nextValue - current,
    label: supply.label,
  };
}
