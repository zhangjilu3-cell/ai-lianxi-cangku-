import { access, copyFile, mkdir, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_GROUPS,
  FRAME_SIZE,
  cleanActionSequence,
  validatePoseFrame,
  visiblePixelHash,
} from "./atlas-sprite-cleaner.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const atlasFiles = [
  "zombie-atlas.webp",
  "runner-atlas.webp",
  "exploder-atlas.webp",
  "toxic-atlas.webp",
  "brute-atlas.webp",
  "devil-atlas.webp",
  "boss-atlas.webp",
];
const ATLAS_WIDTH = 1920;
const ATLAS_HEIGHT = 1024;

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少目录参数`);
  return value;
}
const backupRoot = join(root, "tmp", "walk-atlas-backups");
const outputRoot = join(root, "tmp", "walk-atlas-outputs");
const transactionRoot = join(root, "tmp", "walk-atlas-transaction");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} 执行失败`);
  }
  return result.stdout.trim();
}

function probe(file) {
  const result = JSON.parse(run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,pix_fmt",
    "-of", "json",
    file,
  ]));
  return result.streams[0];
}

function decodeAtlas(file) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString("utf8") || "FFmpeg 图集解码失败");
  if (result.stdout.length !== ATLAS_WIDTH * ATLAS_HEIGHT * 4) throw new Error("图集 RGBA 长度错误");
  return result.stdout;
}

function encodeAtlas(pixels, file) {
  const result = spawnSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${ATLAS_WIDTH}x${ATLAS_HEIGHT}`,
    "-i", "-", "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1",
    "-compression_level", "6", file,
  ], { input: pixels, encoding: null, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr?.toString("utf8") || "FFmpeg 图集编码失败");
}

function extractFrame(atlas, row, column) {
  const frame = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const sourceStart = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + column * FRAME_SIZE) * 4;
    atlas.copy(frame, y * FRAME_SIZE * 4, sourceStart, sourceStart + FRAME_SIZE * 4);
  }
  return frame;
}

function pasteFrame(atlas, frame, row, column) {
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const targetStart = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + column * FRAME_SIZE) * 4;
    frame.copy(atlas, targetStart, y * FRAME_SIZE * 4, (y + 1) * FRAME_SIZE * 4);
  }
}

export function buildActionAtlas(sourcePixels) {
  const output = Buffer.alloc(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  const reports = [];
  const coveredColumns = new Set();
  for (const action of Object.values(ACTION_GROUPS)) {
    const entries = Array.from({ length: action.frames }, (_, index) => {
      const column = action.start + index;
      return { row: 0, column, pixels: extractFrame(sourcePixels, 0, column) };
    });
    const cleaned = cleanActionSequence(entries, action);
    for (let index = 0; index < cleaned.frames.length; index += 1) {
      const column = action.start + index;
      coveredColumns.add(column);
      for (let row = 0; row < 8; row += 1) pasteFrame(output, cleaned.frames[index], row, column);
    }
    reports.push({ action: action.name, replacements: cleaned.replacements });
  }
  for (let column = 0; column < 15; column += 1) {
    if (!coveredColumns.has(column)) throw new Error(`第 ${column} 列没有动作配置`);
  }
  return { output, reports };
}

export function validateActionAtlas(atlas, kind) {
  const actionHashes = new Map();
  for (const action of Object.values(ACTION_GROUPS)) {
    const rowZeroHashes = [];
    for (let index = 0; index < action.frames; index += 1) {
      const column = action.start + index;
      const rowZero = extractFrame(atlas, 0, column);
      let pose;
      try {
        pose = validatePoseFrame(rowZero, { minHeight: action.minHeight, column });
      } catch (error) {
        throw new Error(`${kind} ${action.name} column ${column}: ${error.message}`, { cause: error });
      }
      if (action.name === "hurt") validateUprightHurtPose(pose.main, kind, column);
      const expectedHash = visiblePixelHash(rowZero);
      rowZeroHashes.push(expectedHash);
      for (let row = 1; row < 8; row += 1) {
        const actualHash = visiblePixelHash(extractFrame(atlas, row, column));
        if (actualHash !== expectedHash) {
          throw new Error(`${kind} ${action.name} column ${column}: 方向行不一致`);
        }
      }
    }
    actionHashes.set(action.name, rowZeroHashes);
    if (new Set(rowZeroHashes).size < action.minUniqueFrames) {
      const columns = Array.from({ length: action.frames }, (_, index) => action.start + index).join(",");
      throw new Error(
        `${kind} ${action.name} columns ${columns}: 可见姿势不足，`
        + `至少需要 ${action.minUniqueFrames} 帧唯一姿势`,
      );
    }
  }

  const hurtHashes = actionHashes.get("hurt");
  const deathHashes = actionHashes.get("death");
  for (let deathIndex = 0; deathIndex < deathHashes.length; deathIndex += 1) {
    for (let hurtIndex = 0; hurtIndex < hurtHashes.length; hurtIndex += 1) {
      if (deathHashes[deathIndex] !== hurtHashes[hurtIndex]) continue;
      throw new Error(
        `${kind} death column ${ACTION_GROUPS.death.start + deathIndex}: `
        + `重复使用 hurt column ${ACTION_GROUPS.hurt.start + hurtIndex} 的可见姿势`,
      );
    }
  }
}

function validateUprightHurtPose(main, kind, column) {
  const aspectRatio = main.width / main.height;
  let meanX = 0;
  let meanY = 0;
  for (const offset of main.pixels) {
    const pixel = offset / 4;
    meanX += pixel % FRAME_SIZE;
    meanY += Math.floor(pixel / FRAME_SIZE);
  }
  meanX /= main.pixels.length;
  meanY /= main.pixels.length;

  let varianceX = 0;
  let varianceY = 0;
  for (const offset of main.pixels) {
    const pixel = offset / 4;
    const x = pixel % FRAME_SIZE;
    const y = Math.floor(pixel / FRAME_SIZE);
    varianceX += (x - meanX) ** 2;
    varianceY += (y - meanY) ** 2;
  }
  const varianceRatio = varianceY === 0 ? Number.POSITIVE_INFINITY : varianceX / varianceY;
  if (aspectRatio > 1.35 && varianceRatio > 2) {
    throw new Error(
      `${kind} hurt column ${column}: 受击姿势必须保持竖立`
      + `（宽高比 ${aspectRatio.toFixed(2)}，横纵方差比 ${varianceRatio.toFixed(2)}）`,
    );
  }
}

function verifyMetadata(file, kind) {
  const metadata = probe(file);
  if (metadata.width !== ATLAS_WIDTH || metadata.height !== ATLAS_HEIGHT || !metadata.pix_fmt.includes("a")) {
    throw new Error(`${kind} 输出尺寸或透明通道错误：${JSON.stringify(metadata)}`);
  }
}

async function ensureOriginalBackup(atlas, backup) {
  try {
    await access(backup);
  } catch {
    await copyFile(atlas, backup);
  }
}

export async function commitAtlasJobs(jobs, {
  copy = copyFile,
  remove = unlink,
} = {}) {
  const attempted = [];
  try {
    for (const job of jobs) {
      attempted.push(job);
      await copy(job.output, job.atlas);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const job of [...attempted].reverse()) {
      try {
        await copy(job.transactionBackup, job.atlas);
      } catch (rollbackError) {
        rollbackErrors.push({ atlas: job.atlas, error: rollbackError });
      }
    }
    if (rollbackErrors.length) error.rollbackErrors = rollbackErrors;
    throw error;
  }

  const cleanupErrors = [];
  for (const job of jobs) {
    try {
      await remove(job.output);
    } catch (error) {
      cleanupErrors.push({ output: job.output, error });
    }
  }
  return { cleanupErrors };
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes("--check");
  const sourceDirOption = optionValue(argv, "--source-dir");
  if (checkOnly && sourceDirOption) {
    throw new Error("--check 不能与 --source-dir 同时使用");
  }
  const sourceDir = sourceDirOption ? join(root, sourceDirOption) : null;

if (!checkOnly) {
  await Promise.all([
    mkdir(backupRoot, { recursive: true }),
    mkdir(outputRoot, { recursive: true }),
    mkdir(transactionRoot, { recursive: true }),
  ]);
}

const jobs = [];
for (const atlasFile of atlasFiles) {
  const kind = atlasFile.replace("-atlas.webp", "");
  const atlas = join(root, "public", atlasFile);
  const seedAtlas = sourceDir ? join(sourceDir, atlasFile) : atlas;
  verifyMetadata(seedAtlas, kind);
  const sourcePixels = decodeAtlas(seedAtlas);

  if (checkOnly) {
    validateActionAtlas(sourcePixels, kind);
    console.log(`已验证 ${atlasFile}`);
    continue;
  }

  const backup = join(backupRoot, atlasFile);
  const output = join(outputRoot, atlasFile);
  const transactionBackup = join(transactionRoot, atlasFile);
  await ensureOriginalBackup(atlas, backup);
  await copyFile(atlas, transactionBackup);
  try {
    await unlink(output);
  } catch {
    // 首次运行时输出文件不存在。
  }

  const built = buildActionAtlas(sourcePixels);
  encodeAtlas(built.output, output);
  verifyMetadata(output, kind);
  const decodedOutput = decodeAtlas(output);
  validateActionAtlas(decodedOutput, kind);
  jobs.push({ atlas, output, transactionBackup });
  console.log(`已验证 ${atlasFile}：${JSON.stringify(built.reports)}`);
}

if (!checkOnly) {
  const { cleanupErrors } = await commitAtlasJobs(jobs);
  for (const { output, error } of cleanupErrors) {
    console.warn(`临时输出清理失败：${output}：${error.message}`);
  }
}

console.log(checkOnly
  ? "七张敌人图集的全部动作均为固定朝向单一贴地主体。"
  : "七张敌人图集的全部动作已清除重影、旋转残片和浮空。"
);
}

const directRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directRun) await main();
