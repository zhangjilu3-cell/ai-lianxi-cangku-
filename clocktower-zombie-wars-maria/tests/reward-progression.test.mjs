import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAYER_TRAITS,
  applyPlayerUpgrade,
  buildPlayerCandidates,
  buildWeaponCandidates,
  chooseRewardCategory,
  claimReward,
  createPlayerUpgrades,
  createRewardSession,
  isRewardWave,
  openRewardSession,
  playerModifiers,
} from "../src/reward-progression.js";
import {
  WEAPON_TRAITS,
  createWeaponUpgrades,
} from "../src/weapon-traits.js";

test("reward waves occur only on positive multiples of twenty", () => {
  for (const wave of [20, 40, 60, 200]) assert.equal(isRewardWave(wave), true);
  for (const wave of [undefined, null, NaN, Infinity, -20, 0, 1, 19, 20.5, "20"]) {
    assert.equal(isRewardWave(wave), false);
  }
});

test("reward sessions open once per eligible wave and own independent state", () => {
  const first = createRewardSession();
  const second = createRewardSession();
  assert.notEqual(first.claimedWaves, second.claimedWaves);
  assert.equal(openRewardSession(first, 19), first);

  const opened = openRewardSession(first, 20);
  assert.deepEqual(opened, {
    active: true,
    wave: 20,
    stage: "category",
    category: null,
    candidates: [],
    selectedIndex: 0,
    claimedWaves: [],
  });
  assert.equal(openRewardSession(opened, 40), opened);

  const withClaim = { ...first, claimedWaves: [20] };
  assert.equal(openRewardSession(withClaim, 20), withClaim);
});

test("player candidates are three distinct stable traits and random failures fall back", () => {
  const upgrades = createPlayerUpgrades();
  assert.deepEqual(Object.keys(upgrades), PLAYER_TRAITS.map(({ id }) => id));
  const candidates = buildPlayerCandidates(upgrades, () => 0.999999);
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map(({ id }) => id)).size, 3);
  assert.ok(candidates.every(({ level }) => level === 0));

  const throwing = () => { throw new Error("random unavailable"); };
  const invalid = buildPlayerCandidates({ ...upgrades, vitality: 2 }, throwing);
  assert.equal(invalid.length, 3);
  assert.equal(new Set(invalid.map(({ id }) => id)).size, 3);
  const vitality = invalid.find(({ id }) => id === "vitality");
  if (vitality) assert.equal(vitality.level, 2);
});

test("category selection and claims fail closed and settle a wave once", () => {
  const closed = createRewardSession();
  assert.equal(chooseRewardCategory(closed, "player", [{}, {}, {}]), closed);
  const opened = openRewardSession(closed, 20);
  assert.equal(chooseRewardCategory(opened, "unknown", [{}, {}, {}]), opened);
  assert.equal(chooseRewardCategory(opened, "player", [{}, {}]), opened);

  const candidates = buildPlayerCandidates(createPlayerUpgrades(), () => 0);
  const choosing = chooseRewardCategory(opened, "player", candidates);
  assert.equal(choosing.stage, "traits");
  assert.equal(choosing.category, "player");
  assert.equal(claimReward(choosing, "unknown"), choosing);

  const claimed = claimReward(choosing, candidates[0].id);
  assert.equal(claimed.active, false);
  assert.deepEqual(claimed.claimedWaves, [20]);
  assert.deepEqual(claimed.candidates, []);
  assert.equal(claimReward(claimed, candidates[0].id), claimed);
});

test("weapon category accepts every non-empty set of up to three unique cards", () => {
  const opened = openRewardSession(createRewardSession(), 20);
  for (const candidates of [
    [{ id: "pistol:damage" }],
    [{ id: "pistol:damage" }, { id: "pistol:fire_rate" }],
    [{ id: "pistol:damage" }, { id: "shotgun:damage" }, { id: "rocket:damage" }],
  ]) {
    const choosing = chooseRewardCategory(opened, "weapon", candidates);
    assert.equal(choosing.category, "weapon");
    assert.equal(choosing.candidates.length, candidates.length);
  }
  assert.equal(chooseRewardCategory(opened, "weapon", []), opened);
  assert.equal(
    chooseRewardCategory(opened, "weapon", [{}, {}, {}, {}]),
    opened,
  );
});

test("player upgrades are immutable and vitality raises and restores maximum health", () => {
  const player = { health: 64, maxHealth: 100, speed: 250 };
  const upgrades = createPlayerUpgrades();
  const vitality = applyPlayerUpgrade(player, upgrades, "vitality");
  assert.deepEqual(vitality.player, { health: 79, maxHealth: 115, speed: 250 });
  assert.equal(vitality.upgrades.vitality, 1);
  assert.deepEqual(player, { health: 64, maxHealth: 100, speed: 250 });
  assert.equal(upgrades.vitality, 0);

  const mobility = applyPlayerUpgrade(vitality.player, vitality.upgrades, "mobility");
  assert.equal(mobility.upgrades.mobility, 1);
  assert.equal(mobility.player, vitality.player);
  assert.deepEqual(applyPlayerUpgrade(player, upgrades, "unknown"), { player, upgrades });
});

test("player modifiers stack and cap the approved attributes", () => {
  const modifiers = playerModifiers({
    vitality: 3,
    mobility: 2,
    resilience: 9,
    scavenger: 2,
    medical: 9,
  });
  assert.equal(modifiers.maxHealthBonus, 45);
  assert.equal(modifiers.speedMultiplier, 1.06 ** 2);
  assert.equal(modifiers.damageReduction, 0.3);
  assert.equal(modifiers.pickupMultiplier, 1.2 ** 2);
  assert.equal(modifiers.healthPackRatio, 0.8);
  assert.equal(playerModifiers(createPlayerUpgrades()).healthPackRatio, 0.3);
});

test("weapon candidates prefer three distinct eligible weapons and exclude tank", () => {
  const upgrades = createWeaponUpgrades();
  const candidates = buildWeaponCandidates(
    ["pistol", "shotgun", "tank", "rocket", "pistol"],
    upgrades,
    WEAPON_TRAITS,
    () => 0.999999,
  );
  assert.equal(candidates.length, 3);
  assert.equal(new Set(candidates.map(({ weaponId }) => weaponId)).size, 3);
  assert.ok(candidates.every(({ weaponId }) => weaponId !== "tank"));
  assert.ok(candidates.every(({ id, weaponId, traitId }) => id === `${weaponId}:${traitId}`));
  assert.ok(candidates.every(({ level }) => level === 0));
});

test("weapon candidates exclude capped traits and fill when fewer than three weapons qualify", () => {
  const upgrades = createWeaponUpgrades();
  for (const trait of WEAPON_TRAITS.pistol) {
    upgrades.pistol[trait.id] = trait.maxLevel;
  }
  upgrades.pistol.damage = 4;
  upgrades.pistol.fire_rate = 4;
  const candidates = buildWeaponCandidates(
    ["tank", "pistol", "unknown"],
    upgrades,
    WEAPON_TRAITS,
    () => 0,
  );
  assert.deepEqual(candidates.map(({ id }) => id), [
    "pistol:damage",
    "pistol:fire_rate",
  ]);
  assert.deepEqual(candidates.map(({ level }) => level), [4, 4]);
});

test("weapon candidates fail random values closed to a deterministic fallback", () => {
  const upgrades = createWeaponUpgrades();
  const throwing = () => {
    throw new Error("random unavailable");
  };
  const expected = buildWeaponCandidates(
    ["pistol", "shotgun", "rocket"],
    upgrades,
    WEAPON_TRAITS,
    () => 0,
  );
  for (const random of [null, throwing, () => Number.NaN, () => -1, () => 1]) {
    assert.deepEqual(
      buildWeaponCandidates(
        ["pistol", "shotgun", "rocket"],
        upgrades,
        WEAPON_TRAITS,
        random,
      ),
      expected,
    );
  }
});
