import test from "node:test";
import assert from "node:assert/strict";

import { createGameState, enemyStats, weapons } from "../src/game-core.js";
import {
  TANK_TRIAL_STAGES,
  buildTankTrialWave,
  canOfferTankTrial,
  createTankTrialSession,
  creditTankTrialKill,
  dismissTankTrialOffer,
  failTankTrial,
  finishTankTrialStage,
  restoreTankTrialGame,
  startTankTrial,
  createTankTrialGame,
} from "../src/tank-trial.js";

const expectedTargets = [2000, 3000, 4000, 5000, 6000];
const expectedCounts = [
  { zombie: 15, runner: 8 },
  { zombie: 16, runner: 8, exploder: 4 },
  { zombie: 18, runner: 10, exploder: 4, toxic: 3 },
  { zombie: 20, runner: 12, exploder: 5, toxic: 4 },
  { zombie: 22, runner: 14, exploder: 6, toxic: 5, brute: 1, devil: 1 },
];

test("tank trial uses fixed five-stage targets and enemy queues", () => {
  assert.deepEqual(
    TANK_TRIAL_STAGES.map((stage) => stage.targetScore),
    expectedTargets,
  );
  assert.equal(Object.isFrozen(TANK_TRIAL_STAGES), true);

  for (const [index, counts] of expectedCounts.entries()) {
    const queue = buildTankTrialWave(index);
    const actualCounts = Object.fromEntries(
      [...new Set(queue)].map((kind) => [
        kind,
        queue.filter((entry) => entry === kind).length,
      ]),
    );
    assert.deepEqual(actualCounts, counts);
    const availableScore = queue.reduce(
      (sum, kind) => sum + enemyStats[kind].score,
      0,
    );
    assert.equal(availableScore, TANK_TRIAL_STAGES[index].availableScore);
    assert.ok(availableScore > TANK_TRIAL_STAGES[index].targetScore);
    assert.notEqual(queue, buildTankTrialWave(index));
  }
});

test("offer is available only between normal waves after turret unlock", () => {
  const eligible = {
    developerEnabled: false,
    unlocked: ["pistol", "turret"],
    wave: 12,
    waveQueueLength: 0,
    enemyCount: 0,
    intermission: 0.1,
    dismissedWave: null,
  };
  assert.equal(canOfferTankTrial(eligible), true);
  assert.equal(canOfferTankTrial({ ...eligible, developerEnabled: true }), false);
  assert.equal(canOfferTankTrial({ ...eligible, unlocked: ["pistol"] }), false);
  assert.equal(
    canOfferTankTrial({
      ...eligible,
      unlocked: [...eligible.unlocked, "tank"],
    }),
    false,
  );
  assert.equal(canOfferTankTrial({ ...eligible, waveQueueLength: 1 }), false);
  assert.equal(canOfferTankTrial({ ...eligible, enemyCount: 1 }), false);
  assert.equal(canOfferTankTrial({ ...eligible, intermission: 0 }), false);
  assert.equal(canOfferTankTrial({ ...eligible, dismissedWave: 12 }), false);
});

test("dismissing the offer only hides it for the current normal wave", () => {
  const dismissed = dismissTankTrialOffer(createTankTrialSession(), 12);
  assert.equal(dismissed.dismissedWave, 12);
  assert.equal(dismissed.active, false);
});

test("only pistol final blows add the enemy base score", () => {
  let session = startTankTrial(createTankTrialSession());
  session = creditTankTrialKill(session, "runner", "pistol");
  assert.equal(session.stageScore, enemyStats.runner.score);
  session = creditTankTrialKill(session, "brute", "shotgun");
  session = creditTankTrialKill(session, "devil", "enemy-exploder");
  session = creditTankTrialKill(session, "zombie", "lightning");
  assert.equal(session.stageScore, enemyStats.runner.score);
});

test("trial scoring requires the exact pistol source identifier", () => {
  const active = startTankTrial(createTankTrialSession());
  const credited = creditTankTrialKill(active, "zombie", "pistol");
  assert.equal(credited.stageScore, enemyStats.zombie.score);
  for (const source of [null, undefined, "Pistol", "pistol-burn", "turret"]) {
    assert.equal(
      creditTankTrialKill(active, "zombie", source).stageScore,
      0,
    );
  }
});

test("five successful stages award five fragments and complete the trial", () => {
  let session = startTankTrial(createTankTrialSession());
  for (let stage = 0; stage < 5; stage += 1) {
    session = {
      ...session,
      stageScore: TANK_TRIAL_STAGES[stage].targetScore,
    };
    const result = finishTankTrialStage(session);
    session = result.session;
    assert.equal(session.fragments, stage + 1);
    assert.equal(result.outcome, stage === 4 ? "completed" : "next");
  }
  assert.equal(session.completed, true);
  assert.equal(session.active, false);
});

test("insufficient score or explicit failure clears every fragment", () => {
  const progressed = {
    ...startTankTrial(createTankTrialSession()),
    stage: 2,
    fragments: 2,
    stageScore: 3999,
    targetScore: 4000,
  };
  const scoreFailure = finishTankTrialStage(progressed);
  assert.equal(scoreFailure.outcome, "failed");
  assert.equal(scoreFailure.session.fragments, 0);
  assert.equal(scoreFailure.session.failedReason, "score");

  const weaponFailure = failTankTrial(progressed, "non-pistol");
  assert.equal(weaponFailure.active, false);
  assert.equal(weaponFailure.fragments, 0);
  assert.equal(weaponFailure.failedReason, "non-pistol");
});

test("trial battlefield is isolated from normal play and pistol only", () => {
  const normal = createGameState();
  normal.wave = 12;
  normal.waveEnhancements = ["runner", "toxic"];
  normal.score = 45678;
  normal.structures.push({ id: 99, kind: "turret", health: 120 });
  normal.pickups.push({ id: 100, kind: "health" });
  normal.player.health = 47;
  normal.player.ammo.pistol = 3;
  normal.playerUpgrades.vitality = 3;
  normal.weaponUpgrades.lightning.fork = 2;
  normal.rewardSession.claimedWaves = [20];
  normal.player.chargeWeapon = "watermelon";
  normal.player.chargeTime = 0.7;
  normal.delayedShots.push({ kind: "seed", delay: 0.1 });
  normal.damageZones.push({ kind: "fire", life: 1 });
  normal.slowZones.push({ kind: "juice", life: 2 });
  normal.lightningArcs.push({ life: 0.08, segments: [] });

  const session = startTankTrial(createTankTrialSession());
  const trial = createTankTrialGame(session);
  const pistol = weapons.find((weapon) => weapon.id === "pistol");
  assert.deepEqual(trial.unlocked, ["pistol"]);
  assert.equal(trial.player.weapon, "pistol");
  assert.equal(trial.player.health, 100);
  assert.equal(trial.player.ammo.pistol, pistol.ammo);
  assert.ok(Object.values(trial.playerUpgrades).every((level) => level === 0));
  assert.ok(Object.values(trial.weaponUpgrades).every((levels) =>
    Object.values(levels).every((level) => level === 0)));
  assert.deepEqual(trial.rewardSession.claimedWaves, []);
  assert.equal(trial.player.chargeWeapon, null);
  assert.equal(trial.player.chargeTime, 0);
  assert.equal(trial.structures.length, 0);
  assert.equal(trial.pickups.length, 0);
  assert.deepEqual(trial.delayedShots, []);
  assert.deepEqual(trial.damageZones, []);
  assert.deepEqual(trial.slowZones, []);
  assert.deepEqual(trial.lightningArcs, []);
  assert.deepEqual(trial.waveEnhancements, []);
  assert.equal(
    trial.waveQueue.length,
    TANK_TRIAL_STAGES[0].queue.length,
  );
  assert.equal(normal.score, 45678);
  assert.equal(normal.structures.length, 1);
});

test("restoration merges the tank unlock only after success", () => {
  const normal = createGameState();
  normal.unlocked.push("turret");
  normal.score = 12345;
  normal.waveEnhancements = ["runner"];
  const snapshot = structuredClone(normal);

  const failed = restoreTankTrialGame(snapshot, false);
  assert.equal(failed.unlocked.includes("tank"), false);
  assert.equal(failed.score, 12345);
  assert.deepEqual(failed.waveEnhancements, ["runner"]);

  const completed = restoreTankTrialGame(snapshot, true);
  assert.equal(completed.unlocked.includes("tank"), true);
  assert.equal(completed.score, 12345);
  assert.deepEqual(completed.waveEnhancements, ["runner"]);
  assert.equal(snapshot.unlocked.includes("tank"), false);
});

test("failure and completion restore the exact normal state except the tank reward", () => {
  const normal = createGameState();
  Object.assign(normal, {
    wave: 18,
    score: 88000,
    kills: 321,
    combo: 47,
    comboTimer: 2.3,
    highestCombo: 91,
    intermission: 4.25,
    spawnTimer: 0.17,
    waveQueue: ["runner", "toxic"],
  });
  Object.assign(normal.player, {
    health: 63,
    weapon: "shotgun",
    cooldown: 0.23,
    reload: 0.4,
    reloadWeapon: "shotgun",
  });
  normal.player.ammo.pistol = 5;
  normal.player.reserve.shotgun = 17;
  normal.structures.push({ id: 9, kind: "turret", health: 77, cooldown: 0.2 });
  normal.pickups.push({ id: 10, kind: "health", x: 100, y: 100 });
  normal.hazards.push({ id: 11, x: 120, y: 140, life: 3 });
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
  normal.unlocked = ["pistol", "shotgun", "rocket", "turret"];
  normal.playerUpgrades.mobility = 4;
  normal.weaponUpgrades.freeze.full_freeze = 1;
  normal.rewardSession.claimedWaves = [20, 40];
  normal.player.chargeWeapon = "watermelon";
  normal.player.chargeTime = 0.85;
  normal.delayedShots.push({ kind: "seed", delay: 0.12 });
  normal.slowZones.push({ kind: "frost", x: 80, y: 90, life: 1.5 });
  normal.lightningArcs.push({ life: 0.08, segments: [{ fromId: 1, toId: 2 }] });
  const snapshot = structuredClone(normal);

  const failed = restoreTankTrialGame(snapshot, false);
  const completed = restoreTankTrialGame(snapshot, true);
  assert.deepEqual(failed, normal);
  assert.deepEqual(
    { ...completed, unlocked: completed.unlocked.filter((id) => id !== "tank") },
    normal,
  );
  assert.deepEqual(completed.unlocked, [...normal.unlocked, "tank"]);
  assert.deepEqual(snapshot, normal);
});

test("试炼战场显式清空地刺且快照严格校验地刺数组", () => {
  const active = startTankTrial(createTankTrialSession());
  assert.deepEqual(createTankTrialGame(active).spikeTraps, []);
  const normal = createGameState();
  for (const spikeTraps of [null, {}, "invalid"]) {
    const malformed = { ...normal, spikeTraps };
    assert.throws(() => restoreTankTrialGame(malformed, false), TypeError);
  }
});

test("stage settlement rejects invalid scores and sequence state without mutation", () => {
  const active = startTankTrial(createTankTrialSession());
  const invalidSessions = [
    { ...active, stageScore: Number.NaN },
    { ...active, stageScore: undefined },
    { ...active, stageScore: -1 },
    { ...active, stage: -1 },
    { ...active, stage: 0.5 },
    { ...active, stage: TANK_TRIAL_STAGES.length },
    { ...active, fragments: -1 },
    { ...active, fragments: TANK_TRIAL_STAGES.length + 1 },
    { ...active, fragments: 1 },
    { ...active, targetScore: TANK_TRIAL_STAGES[1].targetScore },
  ];

  for (const session of invalidSessions) {
    const before = structuredClone(session);
    assert.throws(() => finishTankTrialStage(session), TypeError);
    assert.deepEqual(session, before);
  }
});

test("restoration rejects malformed snapshots and invalid clone results", () => {
  const normal = createGameState();
  const invalidSnapshots = [
    null,
    [],
    {},
    { ...normal, unlocked: undefined },
    { ...normal, unlocked: {} },
    { ...normal, player: null },
    { ...normal, enemies: {} },
    { ...normal, structures: null },
    { ...normal, pickups: "invalid" },
    { ...normal, waveQueue: null },
    { ...normal, waveEnhancements: null },
    { ...normal, slowZones: null },
    { ...normal, playerUpgrades: null },
    { ...normal, weaponUpgrades: [] },
    { ...normal, rewardSession: "invalid" },
  ];

  for (const snapshot of invalidSnapshots) {
    const before =
      snapshot && typeof snapshot === "object"
        ? structuredClone(snapshot)
        : snapshot;
    assert.throws(() => restoreTankTrialGame(snapshot, true), TypeError);
    assert.deepEqual(snapshot, before);
  }

  const invalidClone = {};
  assert.throws(
    () => restoreTankTrialGame(normal, true, () => invalidClone),
    TypeError,
  );
  assert.deepEqual(invalidClone, {});
  assert.throws(
    () => restoreTankTrialGame(normal, true, () => normal),
    TypeError,
  );
  assert.equal(normal.unlocked.includes("tank"), false);
});

test("restoration requires a boolean completion flag before cloning", () => {
  const normal = createGameState();
  normal.unlocked.push("turret");
  const before = structuredClone(normal);

  assert.equal(
    restoreTankTrialGame(normal, false).unlocked.includes("tank"),
    false,
  );
  assert.equal(
    restoreTankTrialGame(normal, true).unlocked.includes("tank"),
    true,
  );

  let cloneCalls = 0;
  const trackedClone = (snapshot) => {
    cloneCalls += 1;
    return structuredClone(snapshot);
  };
  for (const completed of ["false", undefined]) {
    assert.throws(
      () => restoreTankTrialGame(normal, completed, trackedClone),
      TypeError,
    );
  }
  assert.equal(cloneCalls, 0);
  assert.deepEqual(normal, before);
});

test("restoration rejects clones that share nested game-state references", () => {
  const normal = createGameState();
  normal.unlocked.push("turret");
  normal.structures.push({ id: 7, kind: "turret", health: 120 });
  const before = structuredClone(normal);

  assert.throws(
    () => restoreTankTrialGame(normal, true, (snapshot) => ({ ...snapshot })),
    TypeError,
  );
  assert.throws(
    () =>
      restoreTankTrialGame(normal, true, (snapshot) => ({
        ...structuredClone(snapshot),
        structures: snapshot.structures,
      })),
    TypeError,
  );
  assert.deepEqual(normal, before);
});
