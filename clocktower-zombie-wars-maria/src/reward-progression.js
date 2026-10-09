import {
  WEAPON_TRAITS,
  availableWeaponTraits,
  traitLevel,
} from "./weapon-traits.js";

const defineTrait = (trait) => Object.freeze(trait);

export const PLAYER_TRAITS = Object.freeze([
  defineTrait({
    id: "vitality",
    name: "生命强化",
    amount: 15,
    description: "最大生命 +15，并恢复 15 点生命",
  }),
  defineTrait({
    id: "mobility",
    name: "轻盈步伐",
    amount: 0.06,
    description: "移动速度 +6%",
  }),
  defineTrait({
    id: "resilience",
    name: "坚韧体魄",
    amount: 0.05,
    max: 0.3,
    description: "受到的伤害减少 5%，上限 30%",
  }),
  defineTrait({
    id: "scavenger",
    name: "搜刮直觉",
    amount: 0.2,
    description: "拾取判定范围 +20%",
  }),
  defineTrait({
    id: "medical",
    name: "医疗增效",
    amount: 0.1,
    max: 0.8,
    description: "回血比例增加 10 个百分点，上限 80%",
  }),
]);

export function createPlayerUpgrades() {
  return Object.fromEntries(PLAYER_TRAITS.map(({ id }) => [id, 0]));
}

export function createRewardSession() {
  return {
    active: false,
    wave: null,
    stage: "category",
    category: null,
    candidates: [],
    selectedIndex: 0,
    claimedWaves: [],
  };
}

export function isRewardWave(wave) {
  return Number.isInteger(wave) && wave > 0 && wave % 20 === 0;
}

function claimedWavesOf(session) {
  return Array.isArray(session?.claimedWaves) ? session.claimedWaves : [];
}

export function openRewardSession(session, wave) {
  if (
    !session ||
    session.active ||
    !isRewardWave(wave) ||
    claimedWavesOf(session).includes(wave)
  ) {
    return session;
  }
  return {
    ...session,
    active: true,
    wave,
    stage: "category",
    category: null,
    candidates: [],
    selectedIndex: 0,
    claimedWaves: claimedWavesOf(session),
  };
}

function readRoll(random) {
  if (typeof random !== "function") return 0;
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : 0;
  } catch {
    return 0;
  }
}

function levelOf(upgrades, id) {
  const level = upgrades?.[id];
  return Number.isInteger(level) && level >= 0 ? level : 0;
}

export function buildPlayerCandidates(upgrades, random = Math.random) {
  const pool = [...PLAYER_TRAITS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(readRoll(random) * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, 3).map((trait) => ({
    ...trait,
    level: levelOf(upgrades, trait.id),
  }));
}

function takeRandom(values, random) {
  if (values.length === 0) return undefined;
  const index = Math.floor(readRoll(random) * values.length);
  return values.splice(index, 1)[0];
}

function weaponCandidate(weaponId, trait, upgrades) {
  return {
    id: `${weaponId}:${trait.id}`,
    weaponId,
    traitId: trait.id,
    name: trait.name,
    description: trait.description,
    level: traitLevel(upgrades, weaponId, trait.id),
  };
}

export function buildWeaponCandidates(
  unlocked,
  upgrades,
  registry = WEAPON_TRAITS,
  random = Math.random,
) {
  if (!Array.isArray(unlocked)) return [];
  const seen = new Set();
  const weapons = unlocked.filter((weaponId) => {
    if (
      weaponId === "tank" ||
      seen.has(weaponId) ||
      availableWeaponTraits(upgrades, weaponId, registry).length === 0
    ) {
      return false;
    }
    seen.add(weaponId);
    return true;
  });
  const pools = new Map(
    weapons.map((weaponId) => [
      weaponId,
      availableWeaponTraits(upgrades, weaponId, registry),
    ]),
  );
  const candidates = [];
  const distinctWeapons = [...weapons];
  while (candidates.length < 3 && distinctWeapons.length > 0) {
    const weaponId = takeRandom(distinctWeapons, random);
    const trait = takeRandom(pools.get(weaponId), random);
    candidates.push(weaponCandidate(weaponId, trait, upgrades));
  }

  const remaining = [];
  for (const weaponId of weapons) {
    for (const trait of pools.get(weaponId)) remaining.push({ weaponId, trait });
  }
  while (candidates.length < 3 && remaining.length > 0) {
    const { weaponId, trait } = takeRandom(remaining, random);
    candidates.push(weaponCandidate(weaponId, trait, upgrades));
  }
  return candidates;
}

export function chooseRewardCategory(session, category, candidates) {
  const validCandidateCount = category === "player"
    ? candidates?.length === 3
    : Array.isArray(candidates) && candidates.length > 0 && candidates.length <= 3;
  if (
    !session?.active ||
    !["player", "weapon"].includes(category) ||
    !Array.isArray(candidates) ||
    !validCandidateCount
  ) {
    return session;
  }
  return {
    ...session,
    stage: "traits",
    category,
    candidates: [...candidates],
    selectedIndex: 0,
  };
}

export function claimReward(session, candidateId) {
  if (
    !session?.active ||
    !Array.isArray(session.candidates) ||
    !session.candidates.some(({ id }) => id === candidateId)
  ) {
    return session;
  }
  return {
    ...session,
    active: false,
    stage: "category",
    category: null,
    candidates: [],
    selectedIndex: 0,
    claimedWaves: [...claimedWavesOf(session), session.wave],
  };
}

export function applyPlayerUpgrade(player, upgrades, traitId) {
  if (!PLAYER_TRAITS.some(({ id }) => id === traitId)) {
    return { player, upgrades };
  }
  const nextUpgrades = {
    ...upgrades,
    [traitId]: levelOf(upgrades, traitId) + 1,
  };
  if (traitId !== "vitality") {
    return { player, upgrades: nextUpgrades };
  }
  const maximum = Number.isFinite(player?.maxHealth) ? player.maxHealth : 100;
  const health = Number.isFinite(player?.health) ? player.health : maximum;
  return {
    player: {
      ...player,
      maxHealth: maximum + 15,
      health: Math.min(maximum + 15, health + 15),
    },
    upgrades: nextUpgrades,
  };
}

export function playerModifiers(upgrades) {
  return {
    maxHealthBonus: levelOf(upgrades, "vitality") * 15,
    speedMultiplier: 1.06 ** levelOf(upgrades, "mobility"),
    damageReduction: Math.min(0.3, levelOf(upgrades, "resilience") * 0.05),
    pickupMultiplier: 1.2 ** levelOf(upgrades, "scavenger"),
    healthPackRatio: Math.min(0.8, 0.3 + levelOf(upgrades, "medical") * 0.1),
  };
}
