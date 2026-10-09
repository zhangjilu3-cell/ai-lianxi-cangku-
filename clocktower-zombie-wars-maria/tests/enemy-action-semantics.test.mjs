import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ACTION_GROUPS, FRAME_SIZE } from "../scripts/atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

const ATLAS_WIDTH = FRAME_SIZE * 15;
const ATLAS_HEIGHT = FRAME_SIZE * 8;

function paintRect(buffer, row, column, x, y, width, height, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const atlasX = column * FRAME_SIZE + px;
      const atlasY = row * FRAME_SIZE + py;
      buffer.set(color, (atlasY * ATLAS_WIDTH + atlasX) * 4);
    }
  }
}

function validAtlas() {
  const atlas = Buffer.alloc(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  for (let column = 0; column < 15; column += 1) {
    const actionHeight = column >= 12 ? 36 + (column - 12) * 6 : 60 + (column % 2) * 4;
    const actionWidth = column >= 12 ? 72 - (column - 12) * 8 : 32 + (column % 3) * 4;
    const x = Math.round(64 - actionWidth / 2);
    const y = 117 - actionHeight;
    const color = [60 + column * 5, 110 + column, 70, 255];
    for (let row = 0; row < 8; row += 1) {
      paintRect(atlas, row, column, x, y, actionWidth, actionHeight, color);
    }
  }
  return atlas;
}

function replaceColumnWithPose(atlas, targetColumn, {
  width,
  height,
  color = [220, 80, 60, 255],
} = {}) {
  for (let row = 0; row < 8; row += 1) {
    const frameStart = row * FRAME_SIZE * ATLAS_WIDTH * 4 + targetColumn * FRAME_SIZE * 4;
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      atlas.fill(0, frameStart + y * ATLAS_WIDTH * 4, frameStart + y * ATLAS_WIDTH * 4 + FRAME_SIZE * 4);
    }
    paintRect(
      atlas,
      row,
      targetColumn,
      Math.round(64 - width / 2),
      117 - height,
      width,
      height,
      color,
    );
  }
}

function copyColumn(atlas, sourceColumn, targetColumn) {
  for (let row = 0; row < 8; row += 1) {
    for (let y = 0; y < FRAME_SIZE; y += 1) {
      const source = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + sourceColumn * FRAME_SIZE) * 4;
      const target = (((row * FRAME_SIZE + y) * ATLAS_WIDTH) + targetColumn * FRAME_SIZE) * 4;
      atlas.copy(atlas, target, source, source + FRAME_SIZE * 4);
    }
  }
}

function decodeAtlas(path) {
  const input = path instanceof URL ? fileURLToPath(path) : path;
  const result = spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", input,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ], { encoding: null, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr?.toString("utf8"));
  return Buffer.from(result.stdout);
}

test("死亡动作要求三帧全部为唯一可见姿势", () => {
  assert.equal(ACTION_GROUPS.death.minUniqueFrames, 3);
  const atlas = validAtlas();
  copyColumn(atlas, 12, 13);
  assert.throws(
    () => validateActionAtlas(atlas, "synthetic"),
    /synthetic.*death.*columns?.*12.*14/i,
  );
});

test("死亡动作不得复用任一受击帧", () => {
  const atlas = validAtlas();
  copyColumn(atlas, 10, 12);
  assert.throws(
    () => validateActionAtlas(atlas, "synthetic"),
    /synthetic.*death.*column.*12.*hurt.*column.*10/i,
  );
});

test("受击动作拒绝横躺姿势并报告类型动作与列号", () => {
  const atlas = validAtlas();
  replaceColumnWithPose(atlas, 11, { width: 100, height: 40 });
  assert.throws(
    () => validateActionAtlas(atlas, "synthetic"),
    /synthetic.*hurt.*column.*11/i,
  );
});

test("竖立受击和三阶段递进死亡通过语义验证", () => {
  const atlas = validAtlas();
  assert.doesNotThrow(() => validateActionAtlas(atlas, "synthetic"));
});

test("七类正式动作均通过语义验证", () => {
  for (const kind of ["zombie", "runner", "exploder", "toxic", "brute", "devil", "boss"]) {
    const atlas = decodeAtlas(new URL(`../public/${kind}-atlas.webp`, import.meta.url));
    assert.doesNotThrow(() => validateActionAtlas(atlas, kind), kind);
  }
});
