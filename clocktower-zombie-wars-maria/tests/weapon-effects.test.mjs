import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";

import {
  applyFreezeStatus,
  buildLightningArcGeometry,
  buildSeedAngles,
  buildWatermelonSliceAngles,
  buildLightningChain,
  buildLightningNetwork,
  freezeDamageMultiplier,
  freezeTargetClass,
  rayArenaIntersection,
  reflectRayAtBoundary,
  selectLightningTarget,
  shotgunPelletAngles,
  strongestSlow,
  watermelonChargeWindow,
  watermelonMovementMultiplier,
  watermelonChargeStats,
} from "../src/weapon-effects.js";

const options = {
  damage: 60,
  range: 230,
  retention: 0.75,
  floorRatio: 0.15,
};

test("lightning arc geometry is stable and uses bounded medium-density cracks", () => {
  const arc = { x1: 10, y1: 20, x2: 210, y2: 100 };
  const first = buildLightningArcGeometry(arc);
  const second = buildLightningArcGeometry(arc);

  assert.deepEqual(second, first);
  assert.equal(first.points.length, 9);
  assert.equal(first.branches.length, 6);
  assert.ok(first.branches.every((branch) => branch.length === 3));
  assert.ok(
    [...first.points, ...first.branches.flat()].every(({ x, y }) =>
      Number.isFinite(x) && Number.isFinite(y)),
  );

  assert.equal(
    buildLightningArcGeometry({ x1: 0, y1: 0, x2: 100, y2: 0 }).branches.length,
    3,
  );
  assert.equal(
    buildLightningArcGeometry({ x1: 0, y1: 0, x2: 1000, y2: 0 }).branches.length,
    7,
  );
});

test("lightning arc geometry varies with its endpoints without per-frame randomness", () => {
  const horizontal = buildLightningArcGeometry({ x1: 0, y1: 0, x2: 180, y2: 0 });
  const diagonal = buildLightningArcGeometry({ x1: 0, y1: 0, x2: 180, y2: 40 });

  assert.notDeepEqual(horizontal.points, diagonal.points);
  assert.notDeepEqual(horizontal.branches, diagonal.branches);
});

test("shotgun pellet angles form a deterministic symmetric five-pellet fan", () => {
  const angles = shotgunPelletAngles(1);
  assert.equal(angles.length, 5);
  assert.equal(angles[2], 1);
  for (let index = 0; index < angles.length; index += 1) {
    assert.ok(Math.abs(angles[index] + angles.at(-index - 1) - 2) < 1e-12);
  }
  assert.deepEqual(shotgunPelletAngles(1), angles);
  assert.ok(Math.abs(angles[0] - 0.89) < 1e-12);
  assert.ok(Math.abs(angles.at(-1) - 1.11) < 1e-12);
});

test("shotgun extra pellets fill the same fan with uniform spacing", () => {
  for (const count of [1, 5, 7, 9, 15]) {
    for (const spread of [0.055, 0.055 * 0.88 ** 5]) {
      const angles = shotgunPelletAngles(0.7, count, spread);
      assert.equal(angles.length, count);
      assert.ok(Math.abs(angles[(count - 1) / 2] - 0.7) < 1e-12);
      if (count === 1) continue;
      assert.ok(Math.abs(angles.at(-1) - angles[0] - spread * 4) < 1e-12);
      const step = angles[1] - angles[0];
      for (let index = 1; index < count; index += 1) {
        assert.ok(Math.abs(angles[index] - angles[index - 1] - step) < 1e-12);
      }
    }
  }
});

test("lightning aim cone selects the nearest valid target and breaks ties by ID", () => {
  const enemies = [
    { id: 9, kind: "zombie", x: 100, y: 5, health: 100 },
    { id: 4, kind: "runner", x: 100, y: -5, health: 100 },
    { id: 2, kind: "zombie", x: 90, y: 80, health: 100 },
    { id: 1, kind: "zombie", x: 50, y: 0, health: 0 },
  ];
  assert.equal(
    selectLightningTarget({ x: 0, y: 0 }, 0, enemies, {
      range: 150,
      halfAngle: 0.2,
    })?.id,
    4,
  );
  assert.equal(
    selectLightningTarget({ x: 0, y: 0 }, 0, enemies, {
      range: 80,
      halfAngle: 0.2,
    }),
    null,
  );
});

test("freeze target class distinguishes ordinary, elite, and boss enemies", () => {
  assert.equal(freezeTargetClass({ kind: "zombie" }), "ordinary");
  assert.equal(freezeTargetClass({ kind: "brute" }), "elite");
  assert.equal(freezeTargetClass({ kind: "runner", scoreMultiplier: 1.5 }), "elite");
  assert.equal(freezeTargetClass({ kind: "boss", scoreMultiplier: 3 }), "boss");
});

test("crack shot gains damage only above half freeze", () => {
  assert.equal(freezeDamageMultiplier(0.49, true), 1);
  assert.equal(freezeDamageMultiplier(0.5, true), 1.5);
  assert.equal(freezeDamageMultiplier(1, false), 1);
});

test("lightning chain follows nearest targets and excludes bosses after first hit", () => {
  const enemies = [
    { id: 1, kind: "zombie", x: 0, y: 0, health: 100 },
    { id: 2, kind: "zombie", x: 100, y: 0, health: 100 },
    { id: 3, kind: "boss", x: 180, y: 0, health: 1000 },
  ];
  assert.deepEqual(
    buildLightningChain(enemies[0], enemies, options)
      .map(({ targetId, from, damage }) => [targetId, from, damage]),
    [[1, null, 60], [2, 1, 45]],
  );

  assert.deepEqual(
    buildLightningChain(enemies[2], enemies, options)
      .map(({ targetId }) => targetId),
    [3, 2, 1],
  );
});

test("lightning chain breaks equal distances by ID and floors decayed damage", () => {
  const enemies = [
    { id: 10, kind: "zombie", x: 0, y: 0, health: 100 },
    { id: 3, kind: "runner", x: 10, y: 0, health: 100 },
    { id: 2, kind: "runner", x: -10, y: 0, health: 100 },
    { id: "a", kind: "zombie", x: 0, y: 11, health: 100 },
  ];
  const chain = buildLightningChain(enemies[0], enemies, {
    damage: 100,
    range: 15,
    retention: 0.1,
    floorRatio: 0.15,
  });
  assert.deepEqual(
    chain.map(({ targetId, damage }) => [targetId, damage]),
    [[10, 100], [2, 15], ["a", 15], [3, 15]],
  );
  assert.equal(new Set(chain.map(({ targetId }) => targetId)).size, chain.length);
});

test("lightning chain fails closed for invalid inputs and dead first targets", () => {
  const first = { id: 1, kind: "zombie", x: 0, y: 0, health: 100 };
  for (const [target, enemies, settings] of [
    [null, [first], options],
    [first, null, options],
    [first, [first], { ...options, damage: 0 }],
    [first, [first], { ...options, range: Number.NaN }],
    [first, [first], { ...options, retention: 0 }],
    [{ ...first, health: 0 }, [{ ...first, health: 0 }], options],
    [{ ...first, x: Infinity }, [{ ...first, x: Infinity }], options],
  ]) assert.deepEqual(buildLightningChain(target, enemies, settings), []);
});

test("lightning chain handles depths beyond recursive call limits", () => {
  const enemies = Array.from({ length: 12000 }, (_, index) => ({
    id: index,
    kind: "zombie",
    x: index,
    y: 0,
    health: 1,
  }));
  const chain = buildLightningChain(enemies[0], enemies, {
    damage: 1,
    range: 1.01,
    retention: 0.99,
    floorRatio: 0.1,
  });
  assert.equal(chain.length, enemies.length);
  assert.equal(chain.at(-1).targetId, enemies.length - 1);
});

test("lightning network forks once with shared deduplication and FIFO order", () => {
  const enemies = [
    { id: 1, kind: "zombie", x: 0, y: 0, health: 100 },
    { id: 2, kind: "zombie", x: 10, y: 0, health: 100 },
    { id: 3, kind: "runner", x: -10, y: 0, health: 100 },
    { id: 4, kind: "zombie", x: 20, y: 0, health: 100 },
    { id: 5, kind: "zombie", x: -20, y: 0, health: 100 },
  ];
  const result = buildLightningNetwork(enemies[0], enemies, {
    damage: 60,
    range: 15,
    retention: 0.75,
    floorRatio: 0.15,
    fork: true,
  });
  assert.deepEqual(
    result.hits.map(({ targetId, from, damage, depth }) => [
      targetId, from, damage, depth,
    ]),
    [
      [1, null, 60, 0],
      [2, 1, 45, 1],
      [3, 1, 45, 1],
      [4, 2, 33.75, 2],
      [5, 3, 33.75, 2],
    ],
  );
  assert.equal(new Set(result.hits.map(({ targetId }) => targetId)).size, result.hits.length);
  assert.deepEqual(result.segments.map(({ from, to }) => [from, to]), [
    [1, 2], [1, 3], [2, 4], [3, 5],
  ]);
  assert.deepEqual(result.endpoints.map(({ targetId }) => targetId), [4, 5]);
});

test("lightning network adds one floor-damage kill arc without revisiting targets", () => {
  const enemies = [
    { id: 1, kind: "zombie", x: 0, y: 0, health: 100 },
    { id: 2, kind: "zombie", x: 10, y: 0, health: 100 },
    { id: 3, kind: "runner", x: -10, y: 0, health: 100 },
    { id: 4, kind: "zombie", x: 20, y: 0, health: 100 },
    { id: 5, kind: "zombie", x: -20, y: 0, health: 100 },
    { id: 6, kind: "zombie", x: 10, y: 20, health: 100 },
  ];
  const result = buildLightningNetwork(enemies[0], enemies, {
    damage: 60,
    range: 25,
    retention: 0.75,
    floorRatio: 0.15,
    fork: true,
    killArc: true,
    killedIds: new Set([2]),
  });
  assert.equal(new Set(result.hits.map(({ targetId }) => targetId)).size, result.hits.length);
  const continuation = result.hits.find(({ killArc }) => killArc);
  assert.deepEqual(
    (({ targetId, from, damage, killArc }) => ({ targetId, from, damage, killArc }))(continuation),
    { targetId: 6, from: 2, damage: 9, killArc: true },
  );
});

test("large lightning network visits two thousand grid enemies once within budget", () => {
  const enemies = Array.from({ length: 2000 }, (_, index) => ({
    id: index,
    kind: "zombie",
    x: (index % 50) * 18,
    y: Math.floor(index / 50) * 18,
    health: 100,
  }));
  const startedAt = performance.now();
  const result = buildLightningNetwork(enemies[0], enemies, {
    damage: 60,
    range: 26,
    retention: 0.75,
    floorRatio: 0.15,
    fork: true,
  });
  const elapsed = performance.now() - startedAt;
  assert.equal(result.hits.length, enemies.length);
  assert.equal(new Set(result.hits.map(({ targetId }) => targetId)).size, enemies.length);
  assert.ok(elapsed < 250, `large lightning network took ${elapsed.toFixed(1)}ms`);
});

test("freeze status stacks to ordinary and boss caps and refreshes duration", () => {
  let result = applyFreezeStatus({}, "zombie", 10);
  assert.deepEqual(result, {
    status: { amount: 0.25, expiresAt: 12.5 },
    reachedCap: false,
  });
  result = applyFreezeStatus(result.status, "zombie", 11);
  assert.deepEqual(result.status, { amount: 0.5, expiresAt: 13.5 });
  assert.equal(result.reachedCap, false);
  result = applyFreezeStatus(result.status, "zombie", 20);
  assert.deepEqual(result.status, { amount: 0.6, expiresAt: 22.5 });
  assert.equal(result.reachedCap, true);

  let boss = applyFreezeStatus({}, "boss", 2);
  assert.deepEqual(boss.status, { amount: 0.125, expiresAt: 4.5 });
  boss = applyFreezeStatus(boss.status, "boss", 3);
  assert.deepEqual(boss.status, { amount: 0.25, expiresAt: 5.5 });
  boss = applyFreezeStatus(boss.status, "boss", 4);
  assert.deepEqual(boss.status, { amount: 0.3, expiresAt: 6.5 });
  assert.equal(boss.reachedCap, false);
});

test("freeze cap is reported once for non-boss targets only", () => {
  const ready = applyFreezeStatus(
    { amount: 0.55, expiresAt: 9 },
    "zombie",
    10,
    {
      perHit: 0.05,
    },
  );
  assert.deepEqual(ready, {
    status: { amount: 0.6, expiresAt: 12.5 },
    reachedCap: true,
  });
  const capped = applyFreezeStatus(ready.status, "zombie", 11, {
    perHit: 0.05,
  });
  assert.equal(capped.reachedCap, false);
  const boss = applyFreezeStatus({ amount: 0.3 }, "boss", 10, {
    perHit: 0.6,
  });
  assert.equal(boss.reachedCap, false);
  assert.equal(boss.status.amount, 0.3);
});

test("strongest slow selects only active finite statuses", () => {
  assert.equal(strongestSlow(5, [
    { amount: 0.25, expiresAt: 6 },
    { amount: 0.6, expiresAt: 5 },
    { amount: 0.5, expiresAt: 8 },
    { amount: Number.NaN, expiresAt: 9 },
    null,
  ]), 0.5);
  assert.equal(strongestSlow(8, [
    { amount: 0.5, expiresAt: 8 },
  ]), 0);
  assert.equal(strongestSlow(1, null), 0);
});

test("watermelon charge cancels before minimum and reaches exact endpoints", () => {
  assert.deepEqual(watermelonChargeStats(0.299999), {
    ready: false,
    full: false,
  });
  assert.deepEqual(watermelonChargeStats(Number.NaN), {
    ready: false,
    full: false,
  });
  assert.deepEqual(watermelonChargeStats(0.3), {
    ready: true,
    full: false,
    ratio: 0,
    damage: 90,
    radius: 100,
    projectileRadius: 12,
    speed: 360,
  });
  assert.deepEqual(watermelonChargeStats(1.5), {
    ready: true,
    full: true,
    ratio: 1,
    damage: 320,
    radius: 230,
    projectileRadius: 28,
    speed: 520,
  });
  assert.deepEqual(watermelonChargeStats(2), watermelonChargeStats(1.5));
});

test("watermelon charge interpolates linearly between minimum and maximum", () => {
  const stats = watermelonChargeStats(0.9);
  assert.equal(stats.ready, true);
  assert.equal(stats.full, false);
  for (const [key, expected] of [
    ["ratio", 0.5],
    ["damage", 205],
    ["radius", 165],
    ["projectileRadius", 20],
    ["speed", 440],
  ]) assert.ok(Math.abs(stats[key] - expected) < 1e-9, key);
});

test("watermelon trait helpers cap charge time, remove movement penalty, and space seeds", () => {
  assert.deepEqual(watermelonChargeWindow(0), { minimum: 0.3, maximum: 1.5 });
  assert.deepEqual(watermelonChargeWindow(1), { minimum: 0.3, maximum: 1.32 });
  assert.deepEqual(watermelonChargeWindow(5), { minimum: 0.3, maximum: 0.8 });
  assert.equal(watermelonMovementMultiplier(0), 0.8);
  assert.equal(watermelonMovementMultiplier(1), 0.84);
  assert.equal(watermelonMovementMultiplier(5), 1);
  const angles = buildSeedAngles(10);
  assert.equal(angles.length, 10);
  assert.equal(new Set(angles).size, 10);
  assert.ok(Math.abs(angles[1] - angles[0] - Math.PI / 5) < 1e-12);
  assert.deepEqual(buildSeedAngles(0), []);
});

test("watermelon slice angles form eight stable uneven directions", () => {
  const first = buildWatermelonSliceAngles(120, 80);
  const second = buildWatermelonSliceAngles(120, 80);

  assert.deepEqual(second, first);
  assert.equal(first.length, 8);
  assert.equal(new Set(first).size, 8);
  for (let index = 0; index < first.length; index += 1) {
    const base = index * Math.PI * 2 / 8;
    assert.ok(Math.abs(first[index] - base) <= 0.080000000001);
  }
  assert.notDeepEqual(first, buildWatermelonSliceAngles(121, 80));
});

test("watermelon slice angles fail closed for invalid impact coordinates", () => {
  assert.deepEqual(buildWatermelonSliceAngles(Number.NaN, 80), []);
  assert.deepEqual(buildWatermelonSliceAngles(120, Infinity), []);
});

test("ray finds horizontal, vertical, and corner arena intersections", () => {
  assert.deepEqual(
    rayArenaIntersection(
      { x: 640, y: 360 },
      { x: 1, y: 0 },
      { width: 1280, height: 720 },
    ),
    { x: 1280, y: 360, distance: 640, boundaries: ["right"] },
  );
  assert.deepEqual(
    rayArenaIntersection(
      { x: 640, y: 360 },
      { x: 0, y: -2 },
      { width: 1280, height: 720 },
    ),
    { x: 640, y: 0, distance: 360, boundaries: ["top"] },
  );
  const cornerDirection = { x: 640, y: -360 };
  const corner = rayArenaIntersection(
    { x: 640, y: 360 },
    cornerDirection,
    { width: 1280, height: 720 },
  );
  assert.ok(Math.abs(corner.x - 1280) < 1e-9);
  assert.ok(Math.abs(corner.y) < 1e-9);
  assert.ok(Math.abs(corner.distance - Math.hypot(640, 360)) < 1e-9);
  assert.deepEqual(corner.boundaries, ["right", "top"]);
});

test("ray reflection flips only the components of touched boundaries", () => {
  assert.deepEqual(
    reflectRayAtBoundary({ x: 0.8, y: -0.6 }, { boundaries: ["top"] }),
    { x: 0.8, y: 0.6 },
  );
  assert.deepEqual(
    reflectRayAtBoundary(
      { x: 0.8, y: -0.6 },
      { boundaries: ["right", "top"] },
    ),
    { x: -0.8, y: 0.6 },
  );
  assert.equal(
    rayArenaIntersection(
      { x: 10, y: 10 },
      { x: 0, y: 0 },
      { width: 1280, height: 720 },
    ),
    null,
  );
  assert.equal(reflectRayAtBoundary({ x: 1, y: 0 }, null), null);
});
