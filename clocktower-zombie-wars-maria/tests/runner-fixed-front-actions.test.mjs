import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTION_GROUPS,
  FRAME_SIZE,
  findComponents,
  validatePoseFrame,
  visiblePixelHash,
} from "../scripts/atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

const ATLAS_WIDTH = FRAME_SIZE * 15;
const ATLAS_HEIGHT = FRAME_SIZE * 8;
const root = fileURLToPath(new URL("..", import.meta.url));
const REJECTED_REVERSE_RUNNER_HASHES = new Set([
  "10cdfb77116801c79d9b1d0ea917956d764abf9c0afdd4327e8fe0d75f96d9c0",
  "1a088aaef7f1fe985935df1cfa24df34bb672018510544f904a07af6273497c0",
  "a94f804f32d7455cb183744ee34f7f17f6b63af16621b0cbae953b65991241c0",
  "d9293135c455ff206e761240dc9fae816b807abce644ad5e56b512c197080e67",
  "65e03f5d83042875a9635b503a1076d948fbba3d7fcaae4ced9db49ab8c45a10",
  "e2ddb52133cf30b56907f0646b383df48226ca49fa60f6cd57ccc156fa5dbb8d",
  "62275fe604f5b7c74993ec015a2cbd0c86a3efea84f71d0543d6a15210fef4a3",
  "8a94548e36122fca0e213cb5295309e3904af783e56693cfdecdd3c3f7cb01b1",
  "1e5d1b9c6190b45c74a2f90527368808b971ea5058b62b1f6059e836f2c1c858",
  "efa07394572b75a627887fffdf7830de09a2916607af997960debc1e440fde9b",
  "2de6efa78c810e48711938ccfd59937adbd8866884580fac4a41d894d6e20b92",
  "1f2043999a0512ada4874a7adae72a11c7a4ae78fe870ad0ad4a64b2d7869c60",
  "f8154e01632b02acc9b5140d48112d5d32b288990b826025839ba875633b0a1d",
  "7ec8eea8bd8672c9bf47b009a80cab56c55311cbd30da69e9caf6bba75b96e83",
]);

function decodeAtlas(file) {
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  assert.equal(result.stdout.length, ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  return Buffer.from(result.stdout);
}

function extractFrame(atlas, row, column) {
  const frame = Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    const source = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + column * FRAME_SIZE) * 4;
    atlas.copy(frame, y * FRAME_SIZE * 4, source, source + FRAME_SIZE * 4);
  }
  return frame;
}

function weightedCenterX(frame, minY = 0, maxY = FRAME_SIZE - 1) {
  let weight = 0;
  let weighted = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const alpha = frame[(y * FRAME_SIZE + x) * 4 + 3];
      if (alpha < 16) continue;
      weight += alpha;
      weighted += x * alpha;
    }
  }
  return weighted / weight;
}

function silhouetteIoU(first, second) {
  let intersection = 0;
  let union = 0;
  for (let index = 3; index < first.length; index += 4) {
    const a = first[index] >= 32;
    const b = second[index] >= 32;
    if (a && b) intersection += 1;
    if (a || b) union += 1;
  }
  return union ? intersection / union : 0;
}

function visibleMagentaCount(frame) {
  let count = 0;
  for (let index = 0; index < frame.length; index += 4) {
    if (frame[index + 3] >= 16 && frame[index] > 180 && frame[index + 1] < 110 && frame[index + 2] > 170) {
      count += 1;
    }
  }
  return count;
}

test("formal runner actions reject every reverse-facing source frame and stay visually stable", () => {
  const atlas = decodeAtlas(join(root, "public", "runner-atlas.webp"));
  validateActionAtlas(atlas, "runner");
  const frames = Array.from({ length: 15 }, (_, column) => extractFrame(atlas, 0, column));
  const hashes = frames.map(visiblePixelHash);
  hashes.forEach((hash, column) => {
    assert.equal(REJECTED_REVERSE_RUNNER_HASHES.has(hash), false, `runner column ${column} still uses reverse-facing material`);
  });

  for (const action of Object.values(ACTION_GROUPS)) {
    const actionHashes = [];
    for (let index = 0; index < action.frames; index += 1) {
      const column = action.start + index;
      const frame = frames[column];
      const pose = validatePoseFrame(frame, { minHeight: action.minHeight, column });
      const significant = findComponents(frame).filter((component) => component.area >= 8);
      assert.equal(significant.length, 1, `runner column ${column} contains a remote fragment`);
      assert.equal(pose.main.maxY, 116);
      assert.ok(Math.abs(pose.main.centerX - 64) <= 6);
      assert.equal(visibleMagentaCount(frame), 0, `runner column ${column} retains visible magenta`);
      const expected = hashes[column];
      for (let row = 1; row < 8; row += 1) {
        assert.equal(visiblePixelHash(extractFrame(atlas, row, column)), expected);
      }
      actionHashes.push(expected);
    }
    assert.ok(new Set(actionHashes).size >= action.minUniqueFrames, `${action.name} lacks unique poses`);
  }

  const hurtHashes = new Set(hashes.slice(10, 12));
  assert.equal(hashes.slice(12, 15).some((hash) => hurtHashes.has(hash)), false);
  const walkReports = frames.slice(0, 6).map((frame, index) => {
    const pose = validatePoseFrame(frame, { minHeight: ACTION_GROUPS.walk.minHeight, column: index });
    const headChestMaxY = Math.floor(pose.main.minY + pose.main.height * 0.58);
    return {
      whole: weightedCenterX(frame),
      headChest: weightedCenterX(frame, pose.main.minY, headChestMaxY),
    };
  });
  const wholeRange = Math.max(...walkReports.map((entry) => entry.whole))
    - Math.min(...walkReports.map((entry) => entry.whole));
  const headChestRange = Math.max(...walkReports.map((entry) => entry.headChest))
    - Math.min(...walkReports.map((entry) => entry.headChest));
  assert.ok(wholeRange <= 4, `runner whole-body center range ${wholeRange.toFixed(2)} exceeds 4px`);
  assert.ok(headChestRange <= 4, `runner head/chest center range ${headChestRange.toFixed(2)} exceeds 4px`);
  frames.slice(0, 6).forEach((frame, index) => {
    assert.ok(silhouetteIoU(frame, frames[(index + 1) % 6]) >= 0.75, `runner walk transition ${index} ghosts`);
  });
});

test("the other six formal action atlases remain valid", () => {
  for (const kind of ["zombie", "exploder", "toxic", "brute", "devil", "boss"]) {
    validateActionAtlas(decodeAtlas(join(root, "public", `${kind}-atlas.webp`)), kind);
  }
});
