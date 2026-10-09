import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER_RIG_ASSETS,
  PLAYER_RIG_VISUAL,
  drawPlayerArm,
  drawPlayerBody,
  resolvePlayerArmPose,
  resolvePlayerArmPoseForRig,
  solveTwoBoneArm,
} from "../src/player-arm-rig.js";
import { resolveWeaponGripPoints } from "../src/player-weapon-renderer.js";
import { WEAPON_VISUALS } from "../src/weapon-visuals.js";

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const finite = (point) =>
  Number.isFinite(point.x) && Number.isFinite(point.y);

test("production rig uses the approved Q arcade proportions", () => {
  assert.equal(PLAYER_RIG_VISUAL.bodySource, null);
  assert.equal(PLAYER_RIG_VISUAL.bodyRotation, Math.PI / 2);
  assert.deepEqual(PLAYER_RIG_VISUAL.bodyDraw, {
    x: -38,
    y: -30,
    width: 76,
    height: 60,
  });
  assert.equal(PLAYER_RIG_VISUAL.limbHeight, 18);
  assert.equal(PLAYER_RIG_VISUAL.recoilScale, 0.38);
  assert.deepEqual(PLAYER_RIG_VISUAL.far.shoulder, { x: 8, y: -13 });
  assert.deepEqual(PLAYER_RIG_VISUAL.near.shoulder, { x: 8, y: 13 });
  assert.equal(PLAYER_RIG_VISUAL.far.upperLength, 22);
  assert.equal(PLAYER_RIG_VISUAL.near.upperLength, 22);
  assert.equal(PLAYER_RIG_VISUAL.far.forearmLength, 20);
  assert.equal(PLAYER_RIG_VISUAL.near.forearmLength, 20);
});

function recordingContext() {
  const calls = [];
  return {
    calls,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    scale: (...args) => calls.push(["scale", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
  };
}

test("two-bone IK reaches normal targets with opposite bends", () => {
  const base = {
    shoulder: { x: 0, y: 0 },
    target: { x: 24, y: 0 },
    upperLength: 16,
    forearmLength: 16,
    minReachRatio: 0.22,
    maxReachRatio: 0.96,
  };
  const positive = solveTwoBoneArm({ ...base, bendDirection: 1 });
  const negative = solveTwoBoneArm({ ...base, bendDirection: -1 });
  assert.ok(positive.elbow.y > 0 && negative.elbow.y < 0);
  assert.ok(distance(positive.hand, base.target) < 1e-9);
  assert.ok(distance(negative.hand, base.target) < 1e-9);
});

test("IK clamps near far zero and invalid targets to finite poses", () => {
  for (const target of [
    { x: 0.001, y: 0 },
    { x: 200, y: 0 },
    { x: 0, y: 0 },
    { x: Number.NaN, y: Number.POSITIVE_INFINITY },
  ]) {
    const pose = solveTwoBoneArm({
      shoulder: { x: 1, y: 2 },
      target,
      upperLength: 16,
      forearmLength: 15,
      bendDirection: 1,
      minReachRatio: 0.22,
      maxReachRatio: 0.96,
    });
    assert.equal([pose.shoulder, pose.elbow, pose.hand].every(finite), true);
    assert.ok(pose.reachRatio >= 0.22 && pose.reachRatio <= 0.96);
  }
});

test("pose binds near hand to main grip and far hand to support grip", () => {
  const grips = { main: { x: 19, y: 1 }, support: { x: 27, y: -1 } };
  const pose = resolvePlayerArmPose(grips, { chargeRatio: 0 });
  assert.ok(distance(pose.near.hand, grips.main) < 1e-9);
  assert.ok(distance(pose.far.hand, grips.support) < 1e-9);
  assert.ok(pose.near.elbow.y > pose.near.shoulder.y);
  assert.ok(pose.far.elbow.y < pose.far.shoulder.y);
});

test("custom rig binds both hands without changing the production defaults", () => {
  const grips = {
    main: { x: 18, y: 5 },
    support: { x: 31, y: -4 },
  };
  const rig = {
    far: {
      shoulder: { x: -2, y: -9 },
      upperLength: 19,
      forearmLength: 17,
      bendDirection: -1,
      minReachRatio: 0.18,
      maxReachRatio: 0.96,
    },
    near: {
      shoulder: { x: 0, y: 9 },
      upperLength: 18,
      forearmLength: 16,
      bendDirection: 1,
      minReachRatio: 0.18,
      maxReachRatio: 0.96,
    },
  };
  const custom = resolvePlayerArmPoseForRig(grips, rig, { chargeRatio: 1 });
  const production = resolvePlayerArmPose(grips, { chargeRatio: 1 });
  assert.deepEqual(custom.near.hand, grips.main);
  assert.deepEqual(custom.far.hand, grips.support);
  assert.notDeepEqual(custom.near.elbow, production.near.elbow);
});

test("custom rig rejects malformed arm geometry", () => {
  const grips = { main: { x: 18, y: 5 }, support: { x: 31, y: -4 } };
  const validArm = {
    shoulder: { x: 0, y: 0 },
    upperLength: 18,
    forearmLength: 16,
    bendDirection: 1,
  };
  for (const rig of [
    null,
    { near: validArm },
    { far: validArm },
    { far: validArm, near: { ...validArm, shoulder: { x: NaN, y: 0 } } },
    { far: validArm, near: { ...validArm, upperLength: 0 } },
    { far: { ...validArm, forearmLength: -1 }, near: validArm },
  ]) {
    assert.equal(resolvePlayerArmPoseForRig(grips, rig), null);
  }
});

test("charge tightens elbows by at most two pixels without moving hands", () => {
  const grips = { main: { x: 20, y: 0 }, support: { x: 28, y: -1 } };
  const idle = resolvePlayerArmPose(grips, { chargeRatio: 0 });
  const charged = resolvePlayerArmPose(grips, { chargeRatio: 1 });
  assert.ok(distance(idle.near.elbow, charged.near.elbow) <= 2.01);
  assert.ok(distance(idle.far.elbow, charged.far.elbow) <= 2.01);
  assert.deepEqual(charged.near.hand, idle.near.hand);
  assert.deepEqual(charged.far.hand, idle.far.hand);
});

test("all nine weapon profiles keep both hands within half a pixel of grips", () => {
  for (const [id, visual] of Object.entries(WEAPON_VISUALS)) {
    for (const recoilRatio of [0, 0.5, 1]) {
      const grips = resolveWeaponGripPoints(visual, recoilRatio);
      const pose = resolvePlayerArmPose(grips, {
        chargeRatio: id === "watermelon" ? 1 : 0,
      });
      assert.ok(
        distance(pose.near.hand, grips.main) <= 0.5,
        id + " main grip",
      );
      assert.ok(
        distance(pose.far.hand, grips.support) <= 0.5,
        id + " support grip",
      );
    }
  }
});

test("watermelon charge keeps both hands within half a pixel of grips", () => {
  const visual = WEAPON_VISUALS.watermelon;
  for (const chargeRatio of [0, 0.5, 1]) {
    const grips = resolveWeaponGripPoints(visual, 0.5);
    const pose = resolvePlayerArmPose(grips, { chargeRatio });
    assert.ok(distance(pose.near.hand, grips.main) <= 0.5);
    assert.ok(distance(pose.far.hand, grips.support) <= 0.5);
  }
});

test("drawing requests far pair body then near pair with finite geometry", () => {
  const context = recordingContext();
  const images = Object.fromEntries(
    Object.keys(PLAYER_RIG_ASSETS).map((id) => [
      id,
      { id, naturalWidth: 320, naturalHeight: 160 },
    ]),
  );
  const pose = resolvePlayerArmPose(
    { main: { x: 20, y: 1 }, support: { x: 28, y: -1 } },
    { chargeRatio: 0.5 },
  );
  assert.equal(drawPlayerArm(context, images, pose.far, "far"), true);
  assert.equal(drawPlayerBody(context, images), true);
  assert.equal(drawPlayerArm(context, images, pose.near, "near"), true);
  assert.equal(
    context.calls.some(
      ([name, value]) => name === "rotate" && value === Math.PI / 2,
    ),
    true,
  );
  assert.deepEqual(
    context.calls
      .filter(([name]) => name === "drawImage")
      .map((call) => call[1].id),
    ["farUpper", "farForearm", "body", "nearUpper", "nearForearm"],
  );
  const numbers = context.calls.flatMap((call) =>
    call.slice(1).filter((value) => typeof value === "number"),
  );
  assert.equal(numbers.every(Number.isFinite), true);
});

test("rig drawing rejects missing pose images and context", () => {
  const context = recordingContext();
  assert.equal(drawPlayerArm(context, {}, null, "far"), false);
  assert.equal(drawPlayerBody(context, {}), false);
  assert.equal(resolvePlayerArmPose(null), null);
  assert.deepEqual(context.calls, []);
});
