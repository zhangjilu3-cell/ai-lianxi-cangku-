import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ACTION_GROUPS, FRAME_SIZE, validatePoseFrame } from "./atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "./stabilize-walk-atlases.mjs";

export const ATLAS_WIDTH = FRAME_SIZE * 15;
export const ATLAS_HEIGHT = FRAME_SIZE * 8;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmpRoot = resolve(root, "tmp");

function optionValue(args, name) {
  const index = args.indexOf(name);
  const value = args[index + 1];
  if (index < 0 || !value || value.startsWith("--")) throw new Error(`${name} 缺少参数`);
  return value;
}

function outputText(value) {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const detail = outputText(result.stderr) || outputText(result.stdout) || outputText(result.error);
    throw new Error(`${command} 执行失败：${detail}`);
  }
  return result;
}

function probeImage(source) {
  const result = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,pix_fmt", "-of", "json", source,
  ]);
  const metadata = JSON.parse(result.stdout).streams?.[0];
  if (!metadata) throw new Error(`${source} 缺少图像流`);
  return metadata;
}

function verifyMetadata(source, label, width, height) {
  const metadata = probeImage(source);
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`${label}尺寸必须为 ${width}x${height}，实际为 ${metadata.width}x${metadata.height}`);
  }
  if (!metadata.pix_fmt?.includes("a")) {
    throw new Error(`${label}必须具有透明通道，实际像素格式为 ${metadata.pix_fmt || "未知"}`);
  }
  return metadata;
}

function decodeImage(source, width, height) {
  const result = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", source,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null });
  const expected = width * height * 4;
  if (result.stdout.length !== expected) {
    throw new Error(`${source} 解码后的 RGBA 长度错误`);
  }
  return Buffer.from(result.stdout);
}

function encodeAtlas(pixels, output) {
  mkdirSync(dirname(output), { recursive: true });
  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${ATLAS_WIDTH}x${ATLAS_HEIGHT}`,
    "-i", "-", "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1",
    "-compression_level", "6", output,
  ], { input: pixels, encoding: null });
}

function pasteFrame(atlas, frame, row, column) {
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const target = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + column * FRAME_SIZE) * 4;
    frame.copy(atlas, target, y * FRAME_SIZE * 4, (y + 1) * FRAME_SIZE * 4);
  }
}

function actionForColumn(column) {
  const action = Object.values(ACTION_GROUPS).find(
    (entry) => column >= entry.start && column < entry.start + entry.frames,
  );
  if (!action) throw new Error(`第 ${column} 列没有动作配置`);
  return action;
}

export function expectedRunnerFrameNames() {
  return Array.from(
    { length: 15 },
    (_, index) => `runner-frame-${String(index).padStart(2, "0")}.png`,
  );
}

export function assertSafePreviewPaths(basePath, outputPath) {
  const base = resolve(basePath);
  const output = resolve(outputPath);
  if (relative(base, output) === "") throw new Error("--base 与 --out 不能相同");
  const outputRelative = relative(tmpRoot, output);
  const outsideTmp = !outputRelative
    || outputRelative === ".."
    || outputRelative.startsWith(`..${sep}`)
    || isAbsolute(outputRelative);
  if (outsideTmp) throw new Error("--out 必须位于项目 tmp/ 内");
  return { base, output };
}

export function buildRunnerSeedPixels(basePixels, frames) {
  assert.equal(basePixels.length, ATLAS_WIDTH * ATLAS_HEIGHT * 4, "base atlas must be 1920x1024 RGBA");
  assert.equal(frames.length, 15, "runner preview requires 15 frames");
  const output = Buffer.from(basePixels);
  frames.forEach((frame, column) => {
    assert.equal(frame.length, FRAME_SIZE * FRAME_SIZE * 4, `column ${column} must be 128x128 RGBA`);
    validatePoseFrame(frame, { minHeight: actionForColumn(column).minHeight, column });
    for (let row = 0; row < 8; row += 1) pasteFrame(output, frame, row, column);
  });
  validateActionAtlas(output, "runner");
  return output;
}

export function main(args = process.argv.slice(2)) {
  const baseOption = optionValue(args, "--base");
  const framesDirectory = resolve(optionValue(args, "--frames-dir"));
  const outputOption = optionValue(args, "--out");
  const { base, output } = assertSafePreviewPaths(baseOption, outputOption);
  verifyMetadata(base, "基础图集", ATLAS_WIDTH, ATLAS_HEIGHT);
  const frames = expectedRunnerFrameNames().map((name, column) => {
    const source = join(framesDirectory, name);
    verifyMetadata(source, `第 ${column} 帧`, FRAME_SIZE, FRAME_SIZE);
    return decodeImage(source, FRAME_SIZE, FRAME_SIZE);
  });
  const pixels = buildRunnerSeedPixels(decodeImage(base, ATLAS_WIDTH, ATLAS_HEIGHT), frames);
  encodeAtlas(pixels, output);
  verifyMetadata(output, "输出图集", ATLAS_WIDTH, ATLAS_HEIGHT);
  validateActionAtlas(decodeImage(output, ATLAS_WIDTH, ATLAS_HEIGHT), "runner");
  console.log(JSON.stringify({ output, frames: expectedRunnerFrameNames() }));
}

const directRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) main();
