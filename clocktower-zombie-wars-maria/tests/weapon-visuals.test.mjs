import test from "node:test";
import assert from "node:assert/strict";
import {
  HANDHELD_WEAPON_IDS,
  SUPPORTED_WEAPON_EFFECTS,
  WEAPON_VISUALS,
  resolveWeaponVisual,
  tickWeaponVisual,
  triggerWeaponVisual,
  weaponVisualRatios,
} from "../src/weapon-visuals.js";
import { createGameState } from "../src/game-core.js";

const expectedIds = [
  "pistol",
  "shotgun",
  "rocket",
  "flamethrower",
  "laser",
  "ricochet",
  "lightning",
  "freeze",
  "watermelon",
];

test("handheld weapon visuals map exactly nine non-placeable weapons", () => {
  assert.deepEqual(HANDHELD_WEAPON_IDS, expectedIds);
  assert.deepEqual(Object.keys(WEAPON_VISUALS), expectedIds);
  assert.equal(resolveWeaponVisual("turret"), null);
  assert.equal(resolveWeaponVisual("tank"), null);
});

test("ricochet uses its own prism feedback instead of generic rails", () => {
  assert.equal(SUPPORTED_WEAPON_EFFECTS.has("ricochet"), true);
  assert.equal(SUPPORTED_WEAPON_EFFECTS.has("rails"), false);
  assert.equal(WEAPON_VISUALS.ricochet.effectType, "ricochet");
});

test("weapon visual paths anchors and feedback values are valid and unique", () => {
  const paths = new Set();
  for (const id of expectedIds) {
    const visual = WEAPON_VISUALS[id];
    assert.equal(visual.src, "/weapons/" + id + ".png");
    assert.equal(paths.has(visual.src), false);
    paths.add(visual.src);
    for (const key of [
      "width",
      "height",
      "gripX",
      "gripY",
      "supportGripX",
      "supportGripY",
      "muzzleX",
      "muzzleY",
      "playerOffsetX",
      "playerOffsetY",
      "recoilDistance",
      "recoilTilt",
      "recoilDuration",
      "feedbackDuration",
    ]) {
      assert.equal(Number.isFinite(visual[key]), true, id + "." + key);
    }
    assert.ok(visual.width > 0 && visual.height > 0);
    assert.ok(visual.gripX >= 0 && visual.gripX <= 1);
    assert.ok(visual.gripY >= 0 && visual.gripY <= 1);
    assert.ok(visual.supportGripX > visual.gripX, id + " support ahead of grip");
    assert.ok(
      visual.supportGripX < visual.muzzleX,
      id + " support behind muzzle",
    );
    assert.ok(visual.supportGripY >= 0 && visual.supportGripY <= 1);
    assert.ok(visual.muzzleX > visual.gripX && visual.muzzleX <= 1);
    assert.ok(visual.muzzleY >= 0 && visual.muzzleY <= 1);
    assert.equal(SUPPORTED_WEAPON_EFFECTS.has(visual.effectType), true);
  }
});

test("weapon visual trigger decays and stale feedback does not cross weapon switches", () => {
  const player = createGameState().player;
  assert.deepEqual(
    {
      weaponVisualId: player.weaponVisualId,
      weaponRecoil: player.weaponRecoil,
      weaponFeedback: player.weaponFeedback,
    },
    { weaponVisualId: null, weaponRecoil: 0, weaponFeedback: 0 },
  );

  assert.equal(triggerWeaponVisual(player, "shotgun"), true);
  assert.equal(player.weaponVisualId, "shotgun");
  assert.ok(player.weaponRecoil > 0);
  assert.ok(player.weaponFeedback >= 0);
  assert.ok(weaponVisualRatios(player, "shotgun").recoil > 0);
  assert.deepEqual(
    weaponVisualRatios(player, "pistol"),
    { recoil: 0, feedback: 0 },
  );

  tickWeaponVisual(player, 10);
  assert.equal(player.weaponRecoil, 0);
  assert.equal(player.weaponFeedback, 0);
  assert.deepEqual(
    weaponVisualRatios(player, "shotgun"),
    { recoil: 0, feedback: 0 },
  );
  assert.equal(triggerWeaponVisual(player, "turret"), false);
});
