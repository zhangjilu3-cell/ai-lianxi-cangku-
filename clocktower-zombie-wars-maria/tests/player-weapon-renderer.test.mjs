import test from "node:test";
import assert from "node:assert/strict";
import {
  drawWeaponModel,
  resolveWeaponDrawRect,
  resolveWeaponGripPoints,
} from "../src/player-weapon-renderer.js";
import { WEAPON_VISUALS } from "../src/weapon-visuals.js";

function recordingContext() {
  const calls = [];
  const context = {
    calls,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    translate: (...args) => calls.push(["translate", ...args]),
    rotate: (...args) => calls.push(["rotate", ...args]),
    drawImage: (...args) => calls.push(["drawImage", ...args]),
    beginPath: () => calls.push(["beginPath"]),
    moveTo: (...args) => calls.push(["moveTo", ...args]),
    lineTo: (...args) => calls.push(["lineTo", ...args]),
    stroke: () => calls.push(["stroke"]),
    fill: () => calls.push(["fill"]),
    arc: (...args) => calls.push(["arc", ...args]),
    ellipse: (...args) => calls.push(["ellipse", ...args]),
    fillRect: (...args) => calls.push(["fillRect", ...args]),
    set globalAlpha(value) {
      calls.push(["globalAlpha", value]);
    },
    set fillStyle(value) {
      calls.push(["fillStyle", value]);
    },
    set strokeStyle(value) {
      calls.push(["strokeStyle", value]);
    },
    set lineWidth(value) {
      calls.push(["lineWidth", value]);
    },
    set shadowBlur(value) {
      calls.push(["shadowBlur", value]);
    },
    set shadowColor(value) {
      calls.push(["shadowColor", value]);
    },
    set lineCap(value) {
      calls.push(["lineCap", value]);
    },
  };
  return context;
}

test("weapon draw rect aligns normalized grip and moves backward under recoil", () => {
  const visual = WEAPON_VISUALS.shotgun;
  const rest = resolveWeaponDrawRect(visual, 0);
  const kicked = resolveWeaponDrawRect(visual, 1);
  assert.equal(rest.x + visual.gripX * visual.width, 20 + visual.playerOffsetX);
  assert.equal(rest.y + visual.gripY * visual.height, visual.playerOffsetY);
  assert.equal(kicked.x, rest.x - visual.recoilDistance);
  assert.equal(kicked.rotation, -visual.recoilTilt);
});

test("renderer draws every supported feedback family with finite geometry", () => {
  for (const visual of Object.values(WEAPON_VISUALS)) {
    const context = recordingContext();
    const image = { id: visual.src };
    assert.equal(
      drawWeaponModel(context, image, visual, {
        recoilRatio: 0.75,
        feedbackRatio: 0.8,
        chargeRatio: visual.effectType === "watermelon" ? 0.9 : 0,
        time: 1.25,
      }),
      true,
    );
    assert.equal(context.calls[0][0], "save");
    assert.equal(context.calls.at(-1)[0], "restore");
    assert.equal(
      context.calls.filter(([name]) => name === "drawImage").length,
      1,
    );
    const numbers = context.calls.flatMap((call) =>
      call.slice(1).filter((value) => typeof value === "number"),
    );
    assert.equal(numbers.every(Number.isFinite), true, visual.src);
  }
});

test("ricochet feedback draws a deterministic prism loop and muzzle diamond", () => {
  const options = {
    recoilRatio: 0,
    feedbackRatio: 0.8,
    chargeRatio: 0,
    time: 1.25,
  };
  const first = recordingContext();
  const second = recordingContext();
  assert.equal(
    drawWeaponModel(first, { id: "ricochet" }, WEAPON_VISUALS.ricochet, options),
    true,
  );
  assert.equal(
    drawWeaponModel(second, { id: "ricochet" }, WEAPON_VISUALS.ricochet, options),
    true,
  );
  assert.deepEqual(first.calls, second.calls);
  assert.deepEqual(
    first.calls
      .filter(([name]) => name === "strokeStyle")
      .map(([, value]) => value),
    ["#d7b7ff", "#68ece3", "#f3e5ff"],
  );
  assert.equal(
    first.calls.filter(([name]) => name === "stroke").length,
    3,
  );
  const drawIndex = first.calls.findIndex(([name]) => name === "drawImage");
  const feedbackIndex = first.calls.findIndex(([name]) => name === "beginPath");
  assert.ok(drawIndex >= 0 && feedbackIndex > drawIndex);
  const numbers = first.calls.flatMap((call) =>
    call.slice(1).filter((value) => typeof value === "number"),
  );
  assert.equal(numbers.every(Number.isFinite), true);
});

test("renderer refuses missing image or visual without drawing", () => {
  const context = recordingContext();
  assert.equal(drawWeaponModel(context, null, WEAPON_VISUALS.pistol), false);
  assert.equal(drawWeaponModel(context, {}, null), false);
  assert.deepEqual(context.calls, []);
});

test("grip points share recoil translation and rotation", () => {
  const visual = WEAPON_VISUALS.shotgun;
  const rest = resolveWeaponGripPoints(visual, 0);
  const kicked = resolveWeaponGripPoints(visual, 1);
  assert.deepEqual(rest.main, {
    x: 20 + visual.playerOffsetX,
    y: visual.playerOffsetY,
  });
  assert.equal(kicked.main.x, rest.main.x - visual.recoilDistance);
  assert.equal(kicked.main.y, rest.main.y);
  assert.ok(kicked.support.x < rest.support.x);
  assert.notEqual(kicked.support.y, rest.support.y);
  for (const point of [rest.main, rest.support, kicked.main, kicked.support]) {
    assert.equal(Number.isFinite(point.x) && Number.isFinite(point.y), true);
  }
});

test("grip resolver rejects missing and invalid visuals", () => {
  assert.equal(resolveWeaponGripPoints(null, 0), null);
  assert.equal(
    resolveWeaponGripPoints(
      { ...WEAPON_VISUALS.pistol, supportGripX: Number.NaN },
      0,
    ),
    null,
  );
});
