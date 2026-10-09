import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { drawAutomaticTurret, TURRET_LAYERS } from "../src/turret-visual.js";

function recorder() {
  const calls = [], stack = [];
  let angle = 0.3;
  return { calls, get angle() { return angle; },
    save() { stack.push(angle); }, restore() { angle = stack.pop(); },
    rotate(value) { angle += value; },
    drawImage(...args) { calls.push({ args, angle }); },
  };
}
const atlas = { complete: true, naturalWidth: 1774 };
test("turret pedestal stays fixed and head pivot stays centered through full rotation", () => {
  for (let i = -8; i <= 8; i++) {
    const ctx = recorder(), angle = i * Math.PI / 4;
    assert.equal(drawAutomaticTurret(ctx, atlas, angle), true);
    assert.equal(ctx.calls.length, 2);
    assert.equal(ctx.calls[0].angle, 0.3);
    assert.equal(ctx.calls[1].angle, 0.3 + angle);
    assert.equal(ctx.angle, 0.3);
    for (const [index, layer] of Object.values(TURRET_LAYERS).entries()) {
      const args = ctx.calls[index].args;
      assert.equal(args[1], layer.x);
      assert.ok(Math.abs(args[5] + layer.pivotX * args[7] / layer.cell) < 1e-10);
      assert.ok(Math.abs(args[6] + layer.pivotY * args[8] / layer.cell) < 1e-10);
    }
  }
});
test("turret waits for image readiness and handles invalid aim", () => {
  const ctx = recorder();
  assert.equal(drawAutomaticTurret(ctx, null), false);
  assert.equal(drawAutomaticTurret(ctx, { complete: false }), false);
  assert.equal(drawAutomaticTurret(ctx, { complete: true, naturalWidth: 0 }), false);
  assert.equal(ctx.calls.length, 0);
  drawAutomaticTurret(ctx, atlas, NaN);
  assert.equal(ctx.calls[1].angle, 0.3);
});
test("turret atlas has RGBA pixels and matches calibrated dimensions", async () => {
  const png = await readFile(new URL("../public/structures/auto-turret.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1774);
  assert.equal(png.readUInt32BE(20), 887);
  assert.equal(png[25], 6);
});
