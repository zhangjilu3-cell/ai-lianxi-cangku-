import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { drawTank, TANK_LAYERS } from "../src/tank-visual.js";

function recorder() {
  const calls = [], stack = []; let angle = 0.2;
  return { calls, get angle() { return angle; }, save() { stack.push(angle); },
    restore() { angle = stack.pop(); }, rotate(a) { angle += a; },
    drawImage(...args) { calls.push({ args, angle }); } };
}
const image = { complete: true, naturalWidth: 1774 };
test("tank turret aims independently while hull stays planted and transforms restore", () => {
  for (const hull of [0, 0.4]) for (let i = -8; i <= 8; i++) {
    const ctx = recorder(), aim = i * Math.PI / 4;
    assert.equal(drawTank(ctx, image, aim, hull), true);
    assert.equal(ctx.calls.length, 2);
    assert.equal(ctx.calls[0].angle, 0.2 + hull);
    assert.equal(ctx.calls[1].angle, 0.2 + aim);
    assert.equal(ctx.angle, 0.2);
    for (const [index, layer] of Object.values(TANK_LAYERS).entries()) {
      const args = ctx.calls[index].args;
      assert.equal(args[1], layer.x);
      assert.ok(Math.abs(args[5] + layer.pivotX * args[7] / layer.width) < 1e-10);
      assert.ok(Math.abs(args[6] + layer.pivotY * args[8] / layer.height) < 1e-10);
    }
  }
});
test("tank has no image draws before loading and never introduces invalid rotations", () => {
  const ctx = recorder();
  assert.equal(drawTank(ctx, null), false);
  assert.equal(drawTank(ctx, { complete: false }), false);
  assert.equal(ctx.calls.length, 0);
  drawTank(ctx, image, NaN, Infinity);
  assert.equal(ctx.calls[0].angle, 0.2);assert.equal(ctx.calls[1].angle, 0.2);
});
test("tank atlas source regions stay inside the RGBA image without sharing part pixels", async () => {
  const png = await readFile(new URL("../public/structures/tank-cold-steel.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");assert.equal(png[25], 6);
  assert.equal(png.readUInt32BE(16), 1774);assert.equal(png.readUInt32BE(20), 887);
  const { hull, turret } = TANK_LAYERS;
  assert.equal(hull.x + hull.width, turret.x);
  assert.equal(turret.x + turret.width, png.readUInt32BE(16));
  assert.ok(hull.pivotX < hull.width && turret.pivotX < turret.width);
});
