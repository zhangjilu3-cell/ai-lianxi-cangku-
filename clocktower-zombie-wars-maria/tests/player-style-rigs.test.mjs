import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER_STYLE_IDS,
  PLAYER_STYLE_RIGS,
  buildStyleWeaponReviewCells,
  resolvePlayerStyleRig,
} from "../src/player-style-rigs.js";
import {
  HANDHELD_WEAPON_IDS,
  resolveWeaponVisual,
} from "../src/weapon-visuals.js";
import { resolveWeaponGripPoints } from "../src/player-weapon-renderer.js";
import { resolvePlayerArmPoseForRig } from "../src/player-arm-rig.js";

const expectedLayers = [
  "body",
  "farUpper",
  "farForearm",
  "nearUpper",
  "nearForearm",
];

test("three style rigs expose five isolated layers and distinct silhouettes", () => {
  assert.deepEqual(PLAYER_STYLE_IDS, ["a", "b", "c"]);
  const bodyRects = new Set();
  for (const styleId of PLAYER_STYLE_IDS) {
    const style = resolvePlayerStyleRig(styleId);
    assert.deepEqual(Object.keys(style.assets), expectedLayers);
    assert.match(
      style.assets.body,
      new RegExp("/player-style-review/" + styleId + "/body\.png$"),
    );
    assert.ok(style.visual.limbHeight >= 14);
    for (const side of ["far", "near"]) {
      const arm = style.visual[side];
      assert.equal(Number.isFinite(arm.shoulder.x), true);
      assert.equal(Number.isFinite(arm.shoulder.y), true);
      assert.ok(arm.upperLength > 0);
      assert.ok(arm.forearmLength > 0);
    }
    bodyRects.add(JSON.stringify(style.visual.bodyDraw));
  }
  assert.equal(bodyRects.size, 3);
  assert.equal(resolvePlayerStyleRig("unknown"), null);
});

test("style rig registry is immutable at every public level", () => {
  const style = PLAYER_STYLE_RIGS.a;
  assert.equal(Object.isFrozen(PLAYER_STYLE_IDS), true);
  assert.equal(Object.isFrozen(PLAYER_STYLE_RIGS), true);
  assert.equal(Object.isFrozen(style), true);
  assert.equal(Object.isFrozen(style.assets), true);
  assert.equal(Object.isFrozen(style.visual), true);
  assert.equal(Object.isFrozen(style.visual.bodyDraw), true);
  assert.equal(Object.isFrozen(style.visual.far), true);
  assert.equal(Object.isFrozen(style.visual.far.shoulder), true);
});

test("review matrix contains every style and official handheld weapon once", () => {
  const cells = buildStyleWeaponReviewCells();
  assert.equal(cells.length, 27);
  assert.deepEqual(
    cells.map(({ styleId, weaponId }) => styleId + ":" + weaponId),
    PLAYER_STYLE_IDS.flatMap((styleId) =>
      HANDHELD_WEAPON_IDS.map((weaponId) => styleId + ":" + weaponId),
    ),
  );
  assert.equal(cells.every(Object.isFrozen), true);
  assert.notEqual(buildStyleWeaponReviewCells(), cells);
});

test("every review style reaches both official weapon grips without detaching", () => {
  for (const styleId of PLAYER_STYLE_IDS) {
    const style = resolvePlayerStyleRig(styleId);
    for (const weaponId of HANDHELD_WEAPON_IDS) {
      const grips = resolveWeaponGripPoints(resolveWeaponVisual(weaponId), 0);
      const pose = resolvePlayerArmPoseForRig(grips, style.visual);
      assert.equal(
        pose.far.targetReachable,
        true,
        styleId + ":" + weaponId + ":far",
      );
      assert.equal(
        pose.near.targetReachable,
        true,
        styleId + ":" + weaponId + ":near",
      );
    }
  }
});
