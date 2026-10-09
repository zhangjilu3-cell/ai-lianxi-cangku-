import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  FRAME_SIZE,
  findComponents,
  validatePoseFrame,
  visiblePixelHash,
} from "../scripts/atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

const ATLAS_WIDTH = FRAME_SIZE * 15;
const ATLAS_HEIGHT = FRAME_SIZE * 8;
const ZOMBIE_ATLAS = new URL("../public/zombie-atlas.webp", import.meta.url);
const OTHER_ENEMIES = Object.freeze(["runner", "exploder", "toxic", "brute", "devil", "boss"]);

const PROTECTED_ZOMBIE_ACTION_HASHES = Object.freeze({
  6: "b308cec53b7baf6ba2649cb589d6c8dc820de2c6a166d3aef1ea451ad3308cea",
  7: "544d01da4926ac1b85003b66cf31ab43bce7eebe34f7b213127cae2f6216bc7f",
  8: "85df91dfc95e750c04216849991fd3acdb3c8759b07b1f1d0616f919df48d846",
  9: "0f8f94e395c8cd13b57a309458f5c3913f3504b37c1ede79108a40aa9d3e5c1c",
  10: "ca27dd725d044e46c90518cbe4cc051fc9fe9b43448d83991b5ad4bd3f17d464",
  11: "5d2f2ac874f2fce0f626187e7ec42f01d9e870f1f01cbc02883960b65d7f8549",
  12: "236dd84ead50a49807d57abb577521a7bfb5d8bf0c1e47ac6e177fa2aeaf553f",
  13: "bb41fa96b92247ed33a2f3e0ff5993d4003c289ee8ec5868c439ee5a53d3739a",
  14: "0197b07a139546820578e3c039c656d622f4ebdcaa9f203e71ead9572787c39a",
});

function decodeAtlas(path) {
  const input = path instanceof URL ? fileURLToPath(path) : path;
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", input,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null, maxBuffer: 32 * 1024 * 1024 });
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

function alphaWeightedCenterX(frame) {
  let weightedX = 0;
  let totalAlpha = 0;
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const alpha = frame[(y * FRAME_SIZE + x) * 4 + 3];
      weightedX += x * alpha;
      totalAlpha += alpha;
    }
  }
  assert.ok(totalAlpha > 0, "frame must contain visible pixels");
  return weightedX / totalAlpha;
}

function silhouetteIoU(left, right) {
  let intersection = 0;
  let union = 0;
  for (let index = 3; index < left.length; index += 4) {
    const leftVisible = left[index] >= 32;
    const rightVisible = right[index] >= 32;
    if (leftVisible && rightVisible) intersection += 1;
    if (leftVisible || rightVisible) union += 1;
  }
  return intersection / union;
}

test("ordinary zombie walk loop keeps its visual mass stable without silhouette ghosts", () => {
  const atlas = decodeAtlas(ZOMBIE_ATLAS);
  const frames = [];
  const hashes = [];
  for (let column = 0; column < 6; column += 1) {
    const frame = extractFrame(atlas, 0, column);
    frames.push(frame);
    const { main } = validatePoseFrame(frame, { minHeight: 48, column });
    const centerX = alphaWeightedCenterX(frame);
    assert.ok(Math.abs(centerX - 63.5) <= 1, `column ${column} visual center ${centerX}`);
    assert.equal(main.maxY, 116, `column ${column} ground`);
    assert.equal(
      findComponents(frame).filter((entry) => entry.area >= 24).length,
      1,
      `column ${column} connected components`,
    );
    assert.ok(
      main.minX > 0 && main.maxX < FRAME_SIZE - 1 && main.minY > 0,
      `column ${column} must not touch the frame edge`,
    );
    const expectedHash = visiblePixelHash(frame);
    hashes.push(expectedHash);
    for (let row = 1; row < 8; row += 1) {
      assert.equal(
        visiblePixelHash(extractFrame(atlas, row, column)),
        expectedHash,
        `column ${column} row ${row}`,
      );
    }
  }
  assert.equal(new Set(hashes.slice(0, 4)).size, 4, "the forward half-cycle must keep four poses");
  assert.equal(hashes[4], hashes[2], "frame five must reverse through pose three");
  assert.equal(hashes[5], hashes[1], "frame six must reverse through pose two");
  for (let column = 0; column < frames.length; column += 1) {
    const next = frames[(column + 1) % frames.length];
    assert.ok(
      silhouetteIoU(frames[column], next) >= 0.72,
      `columns ${column} and ${(column + 1) % frames.length} must not create a silhouette ghost`,
    );
  }
});

test("ordinary zombie non-walk actions retain their fixed visible pixels", () => {
  const atlas = decodeAtlas(ZOMBIE_ATLAS);
  for (const [columnText, expectedHash] of Object.entries(PROTECTED_ZOMBIE_ACTION_HASHES)) {
    const column = Number(columnText);
    for (let row = 0; row < 8; row += 1) {
      assert.equal(
        visiblePixelHash(extractFrame(atlas, row, column)),
        expectedHash,
        `protected column ${column} row ${row}`,
      );
    }
  }
});

test("the other six formal action atlases remain valid", () => {
  for (const kind of OTHER_ENEMIES) {
    const atlas = decodeAtlas(new URL(`../public/${kind}-atlas.webp`, import.meta.url));
    assert.doesNotThrow(() => validateActionAtlas(atlas, kind), kind);
  }
});
