import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  buildRunnerSeedPixels,
  expectedRunnerFrameNames,
} from "../scripts/build-runner-action-preview.mjs";
import { FRAME_SIZE, visiblePixelHash } from "../scripts/atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/build-runner-action-preview.mjs", import.meta.url));
const publicRunner = join(root, "public", "runner-atlas.webp");
const tmpRoot = join(root, "tmp");
let testRoot;
let framesRoot;
let basePixels;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function combinedOutput(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function decode(file) {
  const result = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return Buffer.from(result.stdout);
}

function probe(file) {
  const result = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,pix_fmt", "-of", "json", file,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).streams[0];
}

function extractFrame(atlas, row, column) {
  const frame = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const source = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + column * FRAME_SIZE) * 4;
    atlas.copy(frame, y * FRAME_SIZE * 4, source, source + FRAME_SIZE * 4);
  }
  return frame;
}

function encodePng(pixels, width, height, output, pixelFormat = "rgba") {
  const result = run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", pixelFormat, "-s", `${width}x${height}`,
    "-i", "-", "-frames:v", "1", "-c:v", "png", output,
  ], { input: pixels, encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
}

function cli(args) {
  return run(process.execPath, [script, ...args]);
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function copyFrameSet(name) {
  const output = join(testRoot, name);
  cpSync(framesRoot, output, { recursive: true });
  return output;
}

before(() => {
  mkdirSync(tmpRoot, { recursive: true });
  testRoot = mkdtempSync(join(tmpRoot, "runner-action-preview-test-"));
  framesRoot = join(testRoot, "valid-frames");
  mkdirSync(framesRoot, { recursive: true });
  basePixels = decode(publicRunner);
  expectedRunnerFrameNames().forEach((name, column) => {
    encodePng(extractFrame(basePixels, 0, column), FRAME_SIZE, FRAME_SIZE, join(framesRoot, name));
  });
});

after(() => {
  if (testRoot) rmSync(testRoot, { recursive: true, force: true });
});

test("runner preview requires exactly fifteen ordered frames", () => {
  assert.deepEqual(
    expectedRunnerFrameNames(),
    Array.from({ length: 15 }, (_, index) => `runner-frame-${String(index).padStart(2, "0")}.png`),
  );
  assert.throws(() => buildRunnerSeedPixels(Buffer.alloc(ATLAS_WIDTH * ATLAS_HEIGHT * 4), []), /15/);
});

test("runner preview replaces fifteen columns and copies every frame to eight rows", () => {
  const frames = Array.from({ length: 15 }, (_, column) => extractFrame(basePixels, 0, column));
  const output = buildRunnerSeedPixels(basePixels, frames);
  validateActionAtlas(output, "runner");
  for (let column = 0; column < 15; column += 1) {
    const expected = visiblePixelHash(extractFrame(output, 0, column));
    for (let row = 1; row < 8; row += 1) {
      assert.equal(visiblePixelHash(extractFrame(output, row, column)), expected);
    }
  }
});

test("runner preview CLI writes a validated lossless atlas under tmp", () => {
  const output = join(testRoot, "nested", "runner-preview-atlas.webp");
  const result = cli(["--base", publicRunner, "--frames-dir", framesRoot, "--out", output]);
  assert.equal(result.status, 0, combinedOutput(result));
  assert.equal(existsSync(output), true);
  const metadata = probe(output);
  assert.deepEqual(
    { width: metadata.width, height: metadata.height },
    { width: ATLAS_WIDTH, height: ATLAS_HEIGHT },
  );
  assert.match(metadata.pix_fmt, /a/);
  validateActionAtlas(decode(output), "runner");
});

test("runner preview rejects public output before changing the formal runner atlas", () => {
  const before = sha256(publicRunner);
  const result = cli(["--base", publicRunner, "--frames-dir", framesRoot, "--out", publicRunner]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /不能相同|tmp/);
  assert.equal(sha256(publicRunner), before);
});

test("runner preview rejects an absent frame without creating output", () => {
  const missingFrames = copyFrameSet("missing-frames");
  unlinkSync(join(missingFrames, "runner-frame-14.png"));
  const output = join(testRoot, "missing-output.webp");
  const result = cli(["--base", publicRunner, "--frames-dir", missingFrames, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /ffprobe 执行失败/);
  assert.equal(existsSync(output), false);
});

test("runner preview rejects incorrect frame dimensions", () => {
  const wrongFrames = copyFrameSet("wrong-size-frames");
  const wrongPixels = Buffer.alloc(127 * FRAME_SIZE * 4);
  encodePng(wrongPixels, 127, FRAME_SIZE, join(wrongFrames, "runner-frame-03.png"));
  const output = join(testRoot, "wrong-size-output.webp");
  const result = cli(["--base", publicRunner, "--frames-dir", wrongFrames, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /128x128/);
  assert.equal(existsSync(output), false);
});

test("runner preview rejects a frame without alpha", () => {
  const opaqueFrames = copyFrameSet("opaque-frames");
  const rgbPixels = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 3, 64);
  encodePng(rgbPixels, FRAME_SIZE, FRAME_SIZE, join(opaqueFrames, "runner-frame-08.png"), "rgb24");
  const output = join(testRoot, "opaque-output.webp");
  const result = cli(["--base", publicRunner, "--frames-dir", opaqueFrames, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /透明通道/);
  assert.equal(existsSync(output), false);
});
