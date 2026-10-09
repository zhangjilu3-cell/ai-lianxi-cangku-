import assert from "node:assert/strict";
import test from "node:test";
import { absorbShieldDamage, refillShield, shieldCapacity } from "../src/player-shield.js";
import { createGameState } from "../src/game-core.js";

test("shield holds twenty percent of maximum health and new games start empty", () => {
  assert.equal(shieldCapacity(100), 20);
  assert.equal(shieldCapacity(150), 30);
  assert.equal(shieldCapacity(-1), 0);
  assert.equal(createGameState().player.shield, 0);
});

test("shield pickup refills to cap without stacking", () => {
  assert.equal(refillShield(150), 30);
  assert.equal(refillShield(-1), 0);
  assert.equal(refillShield(100), 20);
});

test("shield absorbs damage before health and preserves overflow", () => {
  assert.deepEqual(absorbShieldDamage(12, 8, 100), { shield: 4, healthDamage: 0 });
  assert.deepEqual(absorbShieldDamage(12, 15, 100), { shield: 0, healthDamage: 3 });
  assert.deepEqual(absorbShieldDamage(0, 15, 100), { shield: 0, healthDamage: 15 });
  assert.deepEqual(absorbShieldDamage(20, 30, 100), { shield: 0, healthDamage: 10 });
});
