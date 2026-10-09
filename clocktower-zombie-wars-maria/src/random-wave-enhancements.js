export const ENHANCED_ENEMY_KINDS = Object.freeze([
  "zombie",
  "runner",
  "exploder",
  "toxic",
]);

const ENHANCEMENTS = Object.freeze({
  zombie: Object.freeze({
    kind: "zombie",
    healthMultiplier: 2,
    scoreMultiplier: 2,
  }),
  runner: Object.freeze({
    kind: "runner",
    speedMultiplier: 1.5,
    scoreMultiplier: 2,
  }),
  exploder: Object.freeze({
    kind: "exploder",
    explosionRadius: 183,
    scoreMultiplier: 2,
  }),
  toxic: Object.freeze({
    kind: "toxic",
    gasRadius: 123,
    scoreMultiplier: 2,
  }),
});

function readRandom(random) {
  if (typeof random !== "function") return null;
  try {
    const value = random();
    return Number.isFinite(value) && value >= 0 && value < 1 ? value : null;
  } catch {
    return null;
  }
}

export function buildWaveEnhancements(wave, random = Math.random) {
  if (!Number.isInteger(wave) || wave < 11) return [];
  const count = wave % 10 === 0 ? 1 : 2;
  const pool = [...ENHANCED_ENEMY_KINDS];
  const selected = [];
  for (let index = 0; index < count; index += 1) {
    const roll = readRandom(random);
    if (roll === null) return [];
    selected.push(pool.splice(Math.floor(roll * pool.length), 1)[0]);
  }
  return selected;
}

export function consumeWaveEnhancement(pending, kind) {
  const valid =
    Array.isArray(pending) &&
    pending.every((entry) => ENHANCED_ENEMY_KINDS.includes(entry)) &&
    new Set(pending).size === pending.length;
  if (!valid) return { enhancement: null, remaining: [] };
  const remaining = [...pending];
  const index = remaining.indexOf(kind);
  if (index < 0) return { enhancement: null, remaining };
  remaining.splice(index, 1);
  return { enhancement: ENHANCEMENTS[kind], remaining };
}
