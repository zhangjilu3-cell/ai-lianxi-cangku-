import { createGameState, enemyStats, weapons } from "./game-core.js";
import { createPlayerUpgrades } from "./reward-progression.js";
import { WEAPON_TRAITS, createWeaponUpgrades } from "./weapon-traits.js";

const PISTOL_ID = "pistol";
const TURRET_ID = "turret";
const TANK_ID = "tank";
const REQUIRED_GAME_STATE_ARRAYS = Object.freeze([
  "enemies",
  "enemyDeathAnimations",
  "bullets",
  "delayedShots",
  "damageZones",
  "slowZones",
  "structures",
  "particles",
  "beams",
  "lightningArcs",
  "arrowRains",
  "decals",
  "hazards",
  "spikeTraps",
  "terrainTraps",
  "pickups",
  "lightningRings",
  "shockwaves",
  "unlocked",
  "waveQueue",
  "waveEnhancements",
]);
const REQUIRED_GAME_STATE_RECORDS = Object.freeze([
  "playerUpgrades",
  "weaponUpgrades",
  "rewardSession",
]);

const STAGE_DEFINITIONS = [
  { targetScore: 2000, counts: { zombie: 15, runner: 8 } },
  { targetScore: 3000, counts: { zombie: 16, runner: 8, exploder: 4 } },
  { targetScore: 4000, counts: { zombie: 18, runner: 10, exploder: 4, toxic: 3 } },
  { targetScore: 5000, counts: { zombie: 20, runner: 12, exploder: 5, toxic: 4 } },
  {
    targetScore: 6000,
    counts: {
      zombie: 22,
      runner: 14,
      exploder: 6,
      toxic: 5,
      brute: 1,
      devil: 1,
    },
  },
];

function expandCounts(counts) {
  return Object.entries(counts).flatMap(([kind, count]) =>
    Array.from({ length: count }, () => kind),
  );
}

export const TANK_TRIAL_STAGES = Object.freeze(
  STAGE_DEFINITIONS.map((definition, index) => {
    const queue = Object.freeze(expandCounts(definition.counts));
    return Object.freeze({
      index,
      targetScore: definition.targetScore,
      queue,
      availableScore: queue.reduce(
        (sum, kind) => sum + enemyStats[kind].score,
        0,
      ),
    });
  }),
);

export function buildTankTrialWave(stageIndex) {
  const stage = TANK_TRIAL_STAGES[stageIndex];
  if (!stage) throw new RangeError("坦克试炼关卡无效");
  return [...stage.queue];
}

export function createTankTrialSession() {
  return {
    active: false,
    completed: false,
    stage: 0,
    fragments: 0,
    stageScore: 0,
    targetScore: TANK_TRIAL_STAGES[0].targetScore,
    failedReason: null,
    dismissedWave: null,
  };
}

export function canOfferTankTrial({
  developerEnabled,
  unlocked,
  wave,
  waveQueueLength,
  enemyCount,
  intermission,
  dismissedWave,
}) {
  return (
    !developerEnabled &&
    Array.isArray(unlocked) &&
    unlocked.includes(TURRET_ID) &&
    !unlocked.includes(TANK_ID) &&
    waveQueueLength === 0 &&
    enemyCount === 0 &&
    intermission > 0 &&
    dismissedWave !== wave
  );
}

export function dismissTankTrialOffer(session, wave) {
  return { ...session, dismissedWave: wave };
}

export function startTankTrial(session) {
  if (session.active) throw new Error("坦克试炼已经开始");
  return {
    ...createTankTrialSession(),
    active: true,
    dismissedWave: session.dismissedWave,
  };
}

export function creditTankTrialKill(session, kind, damageSource) {
  if (!session.active || damageSource !== PISTOL_ID) return session;
  const score = enemyStats[kind]?.score;
  if (!Number.isFinite(score)) return session;
  return { ...session, stageScore: session.stageScore + score };
}

export function failTankTrial(session, reason) {
  return {
    ...session,
    active: false,
    completed: false,
    fragments: 0,
    stageScore: 0,
    failedReason: reason,
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSettlementSession(session) {
  if (!isRecord(session) || session.active !== true || session.completed !== false) {
    throw new TypeError("Invalid active tank trial session");
  }
  if (
    !Number.isInteger(session.stage) ||
    session.stage < 0 ||
    session.stage >= TANK_TRIAL_STAGES.length
  ) {
    throw new TypeError("Invalid tank trial stage");
  }
  if (
    !Number.isInteger(session.fragments) ||
    session.fragments < 0 ||
    session.fragments > TANK_TRIAL_STAGES.length ||
    session.fragments !== session.stage
  ) {
    throw new TypeError("Invalid tank trial fragment sequence");
  }
  if (!Number.isFinite(session.stageScore) || session.stageScore < 0) {
    throw new TypeError("Invalid tank trial stage score");
  }
  if (session.targetScore !== TANK_TRIAL_STAGES[session.stage].targetScore) {
    throw new TypeError("Invalid tank trial target score");
  }
}

export function finishTankTrialStage(session) {
  assertSettlementSession(session);
  if (!session.active) throw new Error("坦克试炼未开始");
  const stage = TANK_TRIAL_STAGES[session.stage];
  if (!stage) throw new Error("坦克试炼关卡状态无效");
  if (session.stageScore < stage.targetScore) {
    return { session: failTankTrial(session, "score"), outcome: "failed" };
  }

  const fragments = session.fragments + 1;
  if (session.stage === TANK_TRIAL_STAGES.length - 1) {
    return {
      session: {
        ...session,
        active: false,
        completed: true,
        fragments,
        failedReason: null,
      },
      outcome: "completed",
    };
  }

  const nextStage = session.stage + 1;
  return {
    session: {
      ...session,
      stage: nextStage,
      fragments,
      stageScore: 0,
      targetScore: TANK_TRIAL_STAGES[nextStage].targetScore,
      failedReason: null,
    },
    outcome: "next",
  };
}

export function createTankTrialGame(session) {
  if (!session.active) {
    throw new Error("无法为未开始的试炼创建战场");
  }
  const trialGame = createGameState();
  const pistol = weapons.find((weapon) => weapon.id === PISTOL_ID);
  trialGame.mode = "playing";
  trialGame.wave = session.stage + 1;
  trialGame.waveQueue = buildTankTrialWave(session.stage);
  trialGame.waveEnhancements = [];
  trialGame.spawnTimer = 0;
  trialGame.intermission = 0;
  trialGame.player.health = 100;
  trialGame.player.weapon = PISTOL_ID;
  trialGame.player.ammo[PISTOL_ID] = pistol.ammo;
  trialGame.player.reserve[PISTOL_ID] = pistol.reserve;
  trialGame.playerUpgrades = createPlayerUpgrades();
  trialGame.weaponUpgrades = createWeaponUpgrades(WEAPON_TRAITS);
  trialGame.unlocked = [PISTOL_ID];
  trialGame.score = 0;
  trialGame.combo = 1;
  trialGame.comboTimer = 0;
  trialGame.kills = 0;
  trialGame.structures = [];
  trialGame.spikeTraps = [];
  trialGame.terrainTraps = [];
  trialGame.pickups = [];
  trialGame.lightningRings = [];
  trialGame.pendingLightningRings = 0;
  trialGame.notice = "坦克试炼 1/5";
  trialGame.noticeTimer = 2;
  return trialGame;
}

function assertGameStateSnapshot(snapshot) {
  if (!isRecord(snapshot) || !isRecord(snapshot.player)) {
    throw new TypeError("Invalid tank trial snapshot");
  }
  if (
    !isRecord(snapshot.player.ammo) ||
    !isRecord(snapshot.player.reserve) ||
    typeof snapshot.mode !== "string"
  ) {
    throw new TypeError("Invalid tank trial snapshot");
  }
  if (
    REQUIRED_GAME_STATE_ARRAYS.some((field) => !Array.isArray(snapshot[field])) ||
    REQUIRED_GAME_STATE_RECORDS.some((field) => !isRecord(snapshot[field])) ||
    snapshot.unlocked.some((weaponId) => typeof weaponId !== "string")
  ) {
    throw new TypeError("Invalid tank trial snapshot");
  }
}

function collectObjectReferences(value, references = new WeakSet()) {
  if (value === null || typeof value !== "object" || references.has(value)) {
    return references;
  }
  references.add(value);
  for (const nested of Object.values(value)) {
    collectObjectReferences(nested, references);
  }
  return references;
}

function sharesObjectReference(source, candidate) {
  const sourceReferences = collectObjectReferences(source);
  const visited = new WeakSet();

  function visit(value) {
    if (value === null || typeof value !== "object") return false;
    if (sourceReferences.has(value)) return true;
    if (visited.has(value)) return false;
    visited.add(value);
    return Object.values(value).some(visit);
  }

  return visit(candidate);
}

export function restoreTankTrialGame(
  snapshot,
  completed,
  clone = structuredClone,
) {
  if (typeof completed !== "boolean") {
    throw new TypeError("Tank trial completion flag must be boolean");
  }
  assertGameStateSnapshot(snapshot);
  if (!snapshot || typeof snapshot !== "object") {
    throw new TypeError("试炼恢复快照无效");
  }
  if (typeof clone !== "function") {
    throw new TypeError("Invalid tank trial clone function");
  }
  const restored = clone(snapshot);
  if (restored === snapshot) {
    throw new TypeError("Tank trial snapshot must be cloned");
  }
  assertGameStateSnapshot(restored);
  if (sharesObjectReference(snapshot, restored)) {
    throw new TypeError("Tank trial clone must not share state references");
  }
  if (completed) {
    return {
      ...restored,
      unlocked: [...new Set([...restored.unlocked, TANK_ID])],
    };
  }
  return restored;
}
