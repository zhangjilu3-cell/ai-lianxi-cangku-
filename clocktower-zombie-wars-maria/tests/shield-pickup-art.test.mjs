import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
const spriteSource = source.match(
  /function drawShieldPack\(pickup\) \{[\s\S]*?\r?\n\}(?=\r?\n\r?\nfunction drawPickup)/,
)?.[0];

test("shield pickup is a transparent-sized PNG and has a source SVG", async () => {
  const png = await readFile(new URL("../public/shield-pickup.png", import.meta.url));
  const svg = await readFile(new URL("../tools/shield-pickup.svg", import.meta.url), "utf8");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 256);
  assert.equal(png.readUInt32BE(20), 256);
  assert.equal(png[25], 6); // PNG RGBA color type
  assert.match(svg, /<svg[^>]+viewBox="0 0 256 256"/);
  assert.match(source, /shieldPickupSprite\.src = "\/shield-pickup\.png"/);
});

test("shield pickup draws the sprite when ready and falls back when unavailable", () => {
  assert.ok(spriteSource);
  const calls = [];
  const context = new Proxy({}, { get(target, key) {
    return target[key] ?? ((...args) => calls.push({ key, args }));
  }, set(target, key, value) { target[key] = value; return true; } });
  const shieldPickupSprite = { complete: true, naturalWidth: 256 };
  const draw = new Script(`(${spriteSource})`).runInNewContext({
    context, shieldPickupSprite, game: { time: 0 }, TAU: Math.PI * 2, Math,
  });
  draw({ id: 1, x: 120, y: 140 });
  assert.deepEqual(calls.find(call => call.key === "drawImage")?.args,
    [shieldPickupSprite, -24, -24, 48, 48]);
  assert.equal(calls.filter(call => call.key === "save").length, 1);
  assert.equal(calls.filter(call => call.key === "restore").length, 1);
  calls.length = 0;
  shieldPickupSprite.naturalWidth = 0;
  draw({ id: 1, x: 120, y: 140 });
  assert.equal(calls.some(call => call.key === "drawImage"), false);
  assert.equal(calls.some(call => call.key === "stroke"), true);
  assert.equal(calls.some(call => call.key === "fillText"), false);
});

test("hosted and standalone builds include the new shield texture", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /\["\/shield-pickup\.png", "public\/shield-pickup\.png", "image\/png"\]/);
  assert.match(build, /encoded\["\/shield-pickup\.png"\]\.body/);
});
