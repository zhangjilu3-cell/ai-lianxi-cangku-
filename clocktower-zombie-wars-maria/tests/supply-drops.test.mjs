import assert from "node:assert/strict";
import test from "node:test";
import {
  AMMO_SUPPLIES,
  ammoDropCandidates,
  ammoFillRatio,
  dropChanceFor,
  resolveAmmoPickup,
  rollEnemyDrops,
} from "../src/supply-drops.js";
import { createWeaponUpgrades } from "../src/weapon-traits.js";

function sequence(...values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("ordinary enemies use an eight-percent drop boundary", () => {
  for (const kind of ["zombie", "runner", "exploder", "toxic"]) {
    assert.deepEqual(
      rollEnemyDrops(kind, ["shotgun"], sequence(0.079999, 0.8)),
      [{ kind: "health" }],
      kind,
    );
    assert.deepEqual(rollEnemyDrops(kind, ["shotgun"], sequence(0.08)), [], kind);
  }
});

test("brute and devil use a fifty-percent drop boundary", () => {
  for (const kind of ["brute", "devil"]) {
    assert.deepEqual(
      rollEnemyDrops(kind, ["shotgun"], sequence(0.499999, 0.8)),
      [{ kind: "health" }],
      kind,
    );
    assert.deepEqual(rollEnemyDrops(kind, ["shotgun"], sequence(0.5)), [], kind);
  }
});

test("normal-survival drop odds follow enemy-count growth by wave", () => {
  assert.ok(dropChanceFor("zombie", { wave: 1 }) > dropChanceFor("zombie", { wave: 31 }));
  assert.ok(dropChanceFor("zombie", { wave: 31 }) > dropChanceFor("zombie", { wave: 71 }));
  assert.ok(dropChanceFor("brute", { wave: 71 }) > dropChanceFor("brute", { wave: 1 }));
  for (const kind of ["zombie", "runner", "exploder", "toxic", "brute", "devil"]) {
    const chance = dropChanceFor(kind, { wave: 31 });
    assert.deepEqual(rollEnemyDrops(kind, ["shotgun"], sequence(chance - 0.000001, 0.8), { wave: 31 }), [{ kind: "health" }]);
    assert.deepEqual(rollEnemyDrops(kind, ["shotgun"], sequence(chance), { wave: 31 }), []);
  }
  assert.deepEqual(rollEnemyDrops("zombie", ["shotgun"], sequence(0.08), { wave: 31, survival: false }), []);
});

test("successful ordinary drops split seventy percent ammo and thirty percent health", () => {
  assert.deepEqual(
    rollEnemyDrops("zombie", ["shotgun"], sequence(0, 0.699999, 0)),
    [{ kind: "ammo", weaponId: "shotgun" }],
  );
  assert.deepEqual(
    rollEnemyDrops("zombie", ["shotgun"], sequence(0, 0.7)),
    [{ kind: "health" }],
  );
});

test("boss drops one health pack and one bound ammo crate", () => {
  assert.deepEqual(
    rollEnemyDrops("boss", ["pistol", "shotgun", "rocket"], sequence(0.999999)),
    [
      { kind: "health" },
      { kind: "ammo", weaponId: "rocket" },
    ],
  );
});

test("ammo candidates only include unlocked finite-resource weapons", () => {
  assert.deepEqual(ammoDropCandidates([
    "pistol", "rocket", "lightning", "freeze", "watermelon", "shotgun",
  ]), [
    "rocket",
    "lightning",
    "freeze",
    "watermelon",
    "shotgun",
  ]);
  assert.deepEqual(ammoDropCandidates(["pistol", "unknown"]), []);
  assert.deepEqual(rollEnemyDrops("boss", ["pistol"], sequence(0)), [
    { kind: "health" },
    { kind: "health" },
  ]);
});

test("all finite-resource weapons expose the approved supply contract", () => {
  assert.deepEqual(AMMO_SUPPLIES, {
    shotgun: { storage: "reserve", amount: 8, max: 40, label: "霰弹枪", shortLabel: "霰" },
    rocket: { storage: "ammo", amount: 4, max: 12, label: "火箭筒", shortLabel: "火" },
    flamethrower: { storage: "ammo", amount: 100, max: 200, label: "喷火枪", shortLabel: "焰" },
    laser: { storage: "ammo", amount: 5, max: 15, label: "直线激光", shortLabel: "光" },
    ricochet: { storage: "ammo", amount: 6, max: 18, label: "反弹炮", shortLabel: "弹" },
    lightning: { storage: "ammo", amount: 8, max: 24, label: "蓄力箭雨枪", shortLabel: "箭" },
    turret: { storage: "ammo", amount: 1, max: 2, label: "机枪塔", shortLabel: "塔" },
    freeze: { storage: "ammo", amount: 10, max: 30, label: "冰冻枪", shortLabel: "雪" },
    tank: { storage: "ammo", amount: 1, max: 1, label: "坦克", shortLabel: "坦" },
    watermelon: { storage: "ammo", amount: 3, max: 9, label: "西瓜枪", shortLabel: "瓜" },
  });
});

test("ammo resolution is non-mutating, capped, and reports the actual gain", () => {
  const player = {
    ammo: { rocket: 10 },
    reserve: { shotgun: 35 },
  };
  assert.deepEqual(resolveAmmoPickup(player, "rocket", false), {
    collected: true,
    storage: "ammo",
    weaponId: "rocket",
    nextValue: 12,
    amount: 2,
    label: "火箭筒",
  });
  assert.deepEqual(resolveAmmoPickup(player, "shotgun", false), {
    collected: true,
    storage: "reserve",
    weaponId: "shotgun",
    nextValue: 40,
    amount: 5,
    label: "霰弹枪",
  });
  assert.deepEqual(player, {
    ammo: { rocket: 10 },
    reserve: { shotgun: 35 },
  });
});

test("full, unknown, malformed, and infinite-ammo pickups remain uncollected", () => {
  const player = {
    ammo: { rocket: 12 },
    reserve: { shotgun: 40 },
  };
  for (const weaponId of ["rocket", "shotgun", "unknown"]) {
    assert.equal(resolveAmmoPickup(player, weaponId, false).collected, false);
  }
  assert.equal(resolveAmmoPickup(player, "rocket", true).collected, false);
  assert.equal(
    resolveAmmoPickup({ ammo: {}, reserve: {} }, "rocket", false).collected,
    false,
  );
});

test("non-boss drops fail closed when any random value is unsafe", () => {
  const throwingRandom = () => {
    throw new Error("random unavailable");
  };
  for (const random of [
    null,
    throwingRandom,
    () => Number.NaN,
    () => Number.POSITIVE_INFINITY,
    () => -0.001,
    () => 1,
  ]) {
    assert.deepEqual(rollEnemyDrops("zombie", ["shotgun"], random), []);
  }
  assert.deepEqual(
    rollEnemyDrops("zombie", ["shotgun"], sequence(0, Number.NaN)),
    [],
  );
  assert.deepEqual(
    rollEnemyDrops("zombie", ["shotgun"], sequence(0, 0, 1)),
    [],
  );
});

test("boss drops remain guaranteed and use a deterministic ammo fallback", () => {
  const expected = [
    { kind: "health" },
    { kind: "ammo", weaponId: "rocket" },
  ];
  const throwingRandom = () => {
    throw new Error("random unavailable");
  };
  for (const random of [null, throwingRandom, () => Number.NaN, () => 1]) {
    assert.deepEqual(
      rollEnemyDrops("boss", ["pistol", "rocket", "shotgun"], random),
      expected,
    );
  }
  assert.deepEqual(rollEnemyDrops("boss", ["pistol"], throwingRandom), [
    { kind: "health" },
    { kind: "health" },
  ]);
});

test("unknown enemy kinds never produce supplies", () => {
  for (const kind of ["unknown", "", null, undefined]) {
    assert.deepEqual(rollEnemyDrops(kind, ["shotgun"], sequence(0, 0, 0)), []);
  }
});

test("ammo candidates preserve first-seen order without duplicates or mutation", () => {
  const unlocked = ["rocket", "pistol", "rocket", "shotgun", "rocket", "shotgun"];
  assert.deepEqual(ammoDropCandidates(unlocked), ["rocket", "shotgun"]);
  assert.deepEqual(unlocked, [
    "rocket",
    "pistol",
    "rocket",
    "shotgun",
    "rocket",
    "shotgun",
  ]);
});

test("ammo resolution rejects non-integer and negative inventory values", () => {
  for (const current of [-1, 0.5, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.deepEqual(
      resolveAmmoPickup({ ammo: { rocket: current }, reserve: {} }, "rocket", false),
      { collected: false },
    );
  }
  assert.deepEqual(
    resolveAmmoPickup({ ammo: {}, reserve: {} }, "rocket", false),
    { collected: false },
  );
});

test("ammo resolution derives upgraded capacity and supply amount without mutating constants", () => {
  const upgrades = createWeaponUpgrades();
  upgrades.rocket.capacity = 2;
  upgrades.rocket.supply = 3;
  const before = structuredClone(AMMO_SUPPLIES);

  assert.deepEqual(
    resolveAmmoPickup({ ammo: { rocket: 14 }, reserve: {} }, "rocket", false, upgrades),
    {
      collected: true,
      storage: "ammo",
      weaponId: "rocket",
      nextValue: 16,
      amount: 2,
      label: "火箭筒",
    },
  );
  assert.deepEqual(
    resolveAmmoPickup({ ammo: { rocket: 3 }, reserve: {} }, "rocket", false, upgrades),
    {
      collected: true,
      storage: "ammo",
      weaponId: "rocket",
      nextValue: 10,
      amount: 7,
      label: "火箭筒",
    },
  );
  assert.deepEqual(AMMO_SUPPLIES, before);
});

test("low health and low ammunition shift both drop odds and pack type", () => {
  const full={wave:40,healthRatio:1,ammoRatio:1};
  const injured={wave:40,healthRatio:0.2,ammoRatio:1};
  const dry={wave:40,healthRatio:1,ammoRatio:0.2};
  assert.ok(dropChanceFor("zombie",injured)>dropChanceFor("zombie",full));
  assert.ok(dropChanceFor("zombie",dry)>dropChanceFor("zombie",full));
  assert.deepEqual(rollEnemyDrops("zombie",["shotgun"],sequence(0,0.7,0),injured),[{kind:"health"}]);
  assert.deepEqual(rollEnemyDrops("zombie",["shotgun"],sequence(0,0.7,0),dry),[{kind:"ammo",weaponId:"shotgun"}]);
});

test("ammo drops target a finite weapon that can actually accept supplies", () => {
  const player={ammo:{rocket:12},reserve:{shotgun:8}};
  const context={wave:20,healthRatio:1,ammoRatio:0.2,player};
  assert.equal(ammoFillRatio(["rocket","shotgun"],player),0.2);
  assert.deepEqual(rollEnemyDrops("boss",["rocket","shotgun"],sequence(0),context),[
    {kind:"health"},{kind:"ammo",weaponId:"shotgun"},
  ]);
  assert.deepEqual(rollEnemyDrops("boss",["rocket"],sequence(0),context),[
    {kind:"health"},{kind:"health"},
  ]);
});
