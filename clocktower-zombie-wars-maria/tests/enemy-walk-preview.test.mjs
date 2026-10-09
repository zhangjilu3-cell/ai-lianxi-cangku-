import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import * as previewBuilder from "../scripts/build-enemy-walk-preview.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

const FRAME_SIZE = 128;
const ATLAS_WIDTH = 1920;
const ATLAS_HEIGHT = 1024;
const root = fileURLToPath(new URL("..", import.meta.url));
const script = fileURLToPath(new URL("../scripts/build-enemy-walk-preview.mjs", import.meta.url));
const tmpRoot = join(root, "tmp");
let testRoot;
let validSeed;

function syntheticSeed() {
  const pixels = Buffer.alloc(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let column = 0; column < 15; column += 1) {
    const pose = column < 6 ? column : column < 10 ? column - 6 : column < 12 ? column - 10 : column - 12;
    const left = column * FRAME_SIZE + 40 + pose;
    for (let y = 50; y < 128; y += 1) {
      for (let x = left; x < left + 34; x += 1) {
        const offset = (y * ATLAS_WIDTH + x) * 4;
        pixels[offset] = 80 + column;
        pixels[offset + 1] = 140;
        pixels[offset + 2] = 90;
        pixels[offset + 3] = 255;
      }
    }
  }
  return pixels;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function encodeRgbaSeed(pixels, width, height, output) {
  const result = run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${width}x${height}`,
    "-i", "-", "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1", output,
  ], { input: pixels, encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
}

function probe(file) {
  const result = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,pix_fmt", "-of", "json", file,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).streams[0];
}

function decode(file) {
  const result = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return Buffer.from(result.stdout);
}

function cli(args) {
  return run(process.execPath, [script, ...args]);
}

function combinedOutput(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

before(() => {
  mkdirSync(tmpRoot, { recursive: true });
  testRoot = mkdtempSync(join(tmpRoot, "enemy-walk-preview-test-"));
  validSeed = join(testRoot, "valid-seed.webp");
  encodeRgbaSeed(syntheticSeed(), ATLAS_WIDTH, ATLAS_HEIGHT, validSeed);
});

after(() => {
  if (testRoot) rmSync(testRoot, { recursive: true, force: true });
});

test("预览构建器清理十五列并复制到八行", () => {
  const built = previewBuilder.buildPreviewPixels(syntheticSeed(), "exploder");
  assert.equal(built.reports.length, 4);
  assert.equal(built.output.length, ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let row = 1; row < 8; row += 1) {
    for (let column = 0; column < 15; column += 1) {
      const x = column * FRAME_SIZE + 50;
      const first = (70 * ATLAS_WIDTH + x) * 4;
      const copied = ((row * FRAME_SIZE + 70) * ATLAS_WIDTH + x) * 4;
      assert.deepEqual(built.output.subarray(copied, copied + 4), built.output.subarray(first, first + 4));
    }
  }
});

test("预览构建器拒绝未知敌人类型", () => {
  assert.throws(() => previewBuilder.buildPreviewPixels(syntheticSeed(), "unknown"), /未知敌人类型/);
});

test("命令行缺少参数或参数值为下一个标志时明确失败", () => {
  const cases = [
    { args: [], message: /--kind 缺少参数/ },
    { args: ["--kind", "exploder", "--seed"], message: /--seed 缺少参数/ },
    { args: ["--kind", "exploder", "--seed", "--out", "preview.webp"], message: /--seed 缺少参数/ },
    { args: ["--kind", "exploder", "--seed", validSeed, "--out"], message: /--out 缺少参数/ },
    { args: ["--kind", "exploder", "--seed", validSeed, "--out", "--kind"], message: /--out 缺少参数/ },
  ];
  for (const entry of cases) {
    const result = cli(entry.args);
    assert.notEqual(result.status, 0);
    assert.match(combinedOutput(result), entry.message);
  }
});

test("路径守卫拒绝 public、dist、项目外和源输出同路径", () => {
  assert.equal(typeof previewBuilder.assertSafePreviewPaths, "function");
  assert.throws(() => previewBuilder.assertSafePreviewPaths(validSeed, join(root, "public", "preview.webp")), /tmp/);
  assert.throws(() => previewBuilder.assertSafePreviewPaths(validSeed, join(root, "dist", "preview.webp")), /tmp/);
  assert.throws(() => previewBuilder.assertSafePreviewPaths(validSeed, resolve(root, "..", "preview.webp")), /tmp/);
  assert.throws(() => previewBuilder.assertSafePreviewPaths(validSeed, validSeed), /不能相同/);
});

test("命令行拒绝正式资源目标且文件哈希不变", () => {
  const publicAtlas = join(root, "public", "exploder-atlas.webp");
  const before = sha256(publicAtlas);
  const result = cli([
    "--kind", "exploder",
    "--seed", join(testRoot, "missing-public-seed.webp"),
    "--out", publicAtlas,
  ]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /--out 必须位于项目 tmp/);
  assert.equal(sha256(publicAtlas), before);
});

test("命令行在任何读写前拒绝源输出同路径", () => {
  const missing = join(testRoot, "same-missing.webp");
  const result = cli(["--kind", "exploder", "--seed", missing, "--out", missing]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /不能相同/);
});

test("命令行拒绝同面积但宽高错误的种子", () => {
  const wrongSeed = join(testRoot, "wrong-shape.webp");
  const output = join(testRoot, "wrong-shape-output.webp");
  encodeRgbaSeed(syntheticSeed(), 2048, 960, wrongSeed);
  const result = cli(["--kind", "exploder", "--seed", wrongSeed, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /图集尺寸必须为 1920x1024/);
});

test("命令行拒绝没有透明通道的种子", () => {
  const opaqueSeed = join(testRoot, "opaque-seed.png");
  const output = join(testRoot, "opaque-output.webp");
  const encoded = run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", `color=c=black:s=${ATLAS_WIDTH}x${ATLAS_HEIGHT}`,
    "-frames:v", "1", "-c:v", "png", opaqueSeed,
  ]);
  assert.equal(encoded.status, 0, encoded.stderr);
  const result = cli(["--kind", "exploder", "--seed", opaqueSeed, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /透明通道/);
});

test("命令行报告 FFmpeg 输入失败且不创建输出", () => {
  const missingSeed = join(testRoot, "missing.webp");
  const output = join(testRoot, "missing-output.webp");
  const result = cli(["--kind", "exploder", "--seed", missingSeed, "--out", output]);
  assert.notEqual(result.status, 0);
  assert.match(combinedOutput(result), /ffprobe 执行失败/);
});

test("真实命令行在 tmp 嵌套目录生成可验证的透明预览图集", () => {
  const output = join(testRoot, "nested", "review", "exploder-preview-atlas.webp");
  const result = cli(["--kind", "exploder", "--seed", validSeed, "--out", output]);
  assert.equal(result.status, 0, combinedOutput(result));
  const metadata = probe(output);
  assert.deepEqual({ width: metadata.width, height: metadata.height }, {
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
  });
  assert.match(metadata.pix_fmt, /a/);
  validateActionAtlas(decode(output), "exploder");
});
