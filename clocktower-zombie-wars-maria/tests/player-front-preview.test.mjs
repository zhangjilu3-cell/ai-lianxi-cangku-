import test from "node:test";
import assert from "node:assert/strict";
import {
  FRONT_PREVIEW_VISUAL,
  drawFrontFaceDetails,
  drawFrontPlayerBody,
  offsetFrontPreviewGrips,
  resolvePreviewMode,
} from "../src/player-front-preview.js";

test("front preview mode is enabled only by the explicit query value", () => {
  assert.equal(resolvePreviewMode("?mode=front"), "front");
  assert.equal(resolvePreviewMode("?revision=ricochet-prism"), "aim");
  assert.equal(resolvePreviewMode("?mode=side"), "aim");
});

test("front preview offsets both weapon grips without mutating input", () => {
  const grips = { main: { x: 2, y: 3 }, support: { x: 8, y: 5 } };
  const result = offsetFrontPreviewGrips(grips);
  assert.deepEqual(result, {
    main: {
      x: 2 + FRONT_PREVIEW_VISUAL.weaponOffset.x,
      y: 3 + FRONT_PREVIEW_VISUAL.weaponOffset.y,
    },
    support: {
      x: 8 + FRONT_PREVIEW_VISUAL.weaponOffset.x,
      y: 5 + FRONT_PREVIEW_VISUAL.weaponOffset.y,
    },
  });
  assert.deepEqual(grips, { main: { x: 2, y: 3 }, support: { x: 8, y: 5 } });
});

test("front body and face use the current Maria body plus readable facial marks", () => {
  const calls = [];
  const context = new Proxy(
    { fillStyle: "", strokeStyle: "", lineWidth: 0 },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        calls.push([key, value]);
        target[key] = value;
        return true;
      },
    },
  );
  const body = { naturalWidth: 405, naturalHeight: 472 };
  assert.equal(drawFrontPlayerBody(context, { body }), true);
  assert.equal(drawFrontFaceDetails(context), true);
  assert.equal(calls.some(([name]) => name === "drawImage"), true);
  assert.equal(calls.filter(([name]) => name === "ellipse").length >= 3, true);
  assert.equal(
    calls.some(
      ([name, value]) => name === "fillStyle" && value === "#17191b",
    ),
    true,
  );
  assert.equal(
    calls.some(
      ([name, value]) => name === "strokeStyle" && value === "#6f342f",
    ),
    true,
  );
});
