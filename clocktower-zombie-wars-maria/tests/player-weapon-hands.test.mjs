import assert from "node:assert/strict";
import test from "node:test";
import { HANDHELD_WEAPON_IDS } from "../src/weapon-visuals.js";
import {
  PLAYER_WEAPON_HAND_ASSET_ENTRIES,
  PLAYER_WEAPON_HAND_PROFILES,
  playerWeaponHandImageKey,
  resolvePlayerRigImages,
  resolvePlayerWeaponHandProfile,
} from "../src/player-weapon-hands.js";

test("every handheld weapon has a unique far and near hand layer", () => {
  assert.deepEqual(Object.keys(PLAYER_WEAPON_HAND_PROFILES), HANDHELD_WEAPON_IDS);
  assert.equal(PLAYER_WEAPON_HAND_ASSET_ENTRIES.length, 18);
  assert.equal(
    new Set(PLAYER_WEAPON_HAND_ASSET_ENTRIES.map((entry) => entry.route)).size,
    18,
  );

  for (const weaponId of HANDHELD_WEAPON_IDS) {
    const profile = resolvePlayerWeaponHandProfile(weaponId);
    assert.equal(Object.isFrozen(profile), true);
    for (const side of ["far", "near"]) {
      const layer = profile[side];
      assert.equal(
        layer.route,
        `/player-rig/weapons/${weaponId}/${side}-forearm-hand.png`,
      );
      assert.equal(layer.pivot.length, 4);
      assert.equal(layer.pivot.every((value) => value >= 0 && value <= 1), true);
      assert.equal(
        playerWeaponHandImageKey(weaponId, side),
        `${weaponId}-${side}-forearm-hand`,
      );
    }
  }
});

test("unknown weapons resolve to the shared fallback arms", () => {
  assert.equal(resolvePlayerWeaponHandProfile("unknown"), null);
  const images = {
    farForearm: "fallback-far",
    nearForearm: "fallback-near",
    [playerWeaponHandImageKey("pistol", "far")]: "pistol-far",
    [playerWeaponHandImageKey("pistol", "near")]: "pistol-near",
  };
  assert.deepEqual(resolvePlayerRigImages(images, "pistol"), {
    ...images,
    farForearm: "pistol-far",
    nearForearm: "pistol-near",
  });
  assert.deepEqual(resolvePlayerRigImages(images, "unknown"), images);
});
