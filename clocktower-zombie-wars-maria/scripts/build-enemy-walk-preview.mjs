import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ENEMY_KINDS } from "../src/zombie-animation.js";
import { buildActionAtlas, validateActionAtlas } from "./stabilize-walk-atlases.mjs";

export const ATLAS_WIDTH = 1920;
export const ATLAS_HEIGHT = 1024;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmpRoot = resolve(root, "tmp");

function optionValue(args, name) {
  const index = args.indexOf(name);
  const value = args[index + 1];
  if (index < 0 || !value || value.startsWith("--")) throw new Error(`${name} 缺少参数`);
  return args[index + 1];
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

function probeAtlas(source) {
  const result = run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,pix_fmt", "-of", "json", source,
  ]);
  const metadata = JSON.parse(result.stdout).streams?.[0];
  if (!metadata) throw new Error("图集缺少视频流");
  return metadata;
}

function verifyAtlasMetadata(source, label) {
  const metadata = probeAtlas(source);
  if (metadata.width !== ATLAS_WIDTH || metadata.height !== ATLAS_HEIGHT) {
    throw new Error(`${label}图集尺寸必须为 ${ATLAS_WIDTH}x${ATLAS_HEIGHT}，实际为 ${metadata.width}x${metadata.height}`);
  }
  if (!metadata.pix_fmt?.includes("a")) {
    throw new Error(`${label}图集必须具有透明通道，实际像素格式为 ${metadata.pix_fmt || "未知"}`);
  }
  return metadata;
}

function decodeAtlas(source) {
  const result = run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", source,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null });
  const expected = ATLAS_WIDTH * ATLAS_HEIGHT * 4;
  if (result.stdout.length !== expected) {
    throw new Error(`图集尺寸必须为 ${ATLAS_WIDTH}x${ATLAS_HEIGHT}`);
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

export function assertSafePreviewPaths(seedPath, outputPath) {
  const seed = resolve(seedPath);
  const output = resolve(outputPath);
  if (relative(seed, output) === "") {
    throw new Error("--seed 与 --out 不能相同");
  }
  const outputRelative = relative(tmpRoot, output);
  const outsideTmp = !outputRelative
    || outputRelative === ".."
    || outputRelative.startsWith(`..${sep}`)
    || isAbsolute(outputRelative);
  if (outsideTmp) {
    throw new Error("--out 必须位于项目 tmp/ 内");
  }
  return { seed, output };
}

export function buildPreviewPixels(sourcePixels, kind) {
  if (!ENEMY_KINDS.includes(kind)) throw new Error(`未知敌人类型：${kind}`);
  const built = buildActionAtlas(sourcePixels);
  validateActionAtlas(built.output, kind);
  return built;
}

export function main(args = process.argv.slice(2)) {
  const kind = optionValue(args, "--kind");
  const seedOption = optionValue(args, "--seed");
  const outputOption = optionValue(args, "--out");
  const { seed, output } = assertSafePreviewPaths(seedOption, outputOption);
  if (!ENEMY_KINDS.includes(kind)) throw new Error(`未知敌人类型：${kind}`);
  verifyAtlasMetadata(seed, "种子");
  const built = buildPreviewPixels(decodeAtlas(seed), kind);
  encodeAtlas(built.output, output);
  verifyAtlasMetadata(output, "输出");
  validateActionAtlas(decodeAtlas(output), kind);
  console.log(JSON.stringify({ kind, output, reports: built.reports }));
}

const directRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) main();
