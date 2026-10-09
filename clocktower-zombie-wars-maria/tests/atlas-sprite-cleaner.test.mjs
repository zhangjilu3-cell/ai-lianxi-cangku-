import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTION_GROUPS,
  ALPHA_THRESHOLD,
  FRAME_SIZE,
  GROUND_Y,
  cleanActionSequence,
  cleanCanonicalFrame,
  cleanPoseFrame,
  findComponents,
  selectCanonicalCandidate,
  validateGroundedFrame,
  validatePoseFrame,
  visiblePixelHash,
} from "../scripts/atlas-sprite-cleaner.mjs";
import { validateActionAtlas } from "../scripts/stabilize-walk-atlases.mjs";

function frame() {
  return Buffer.alloc(FRAME_SIZE * FRAME_SIZE * 4);
}

function paintRect(buffer, x, y, width, height, rgba = [80, 100, 70, 255]) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * FRAME_SIZE + px) * 4;
      buffer.set(rgba, offset);
    }
  }
}

function pose(column, x, y, width, height) {
  const pixels = frame();
  paintRect(pixels, x, y, width, height);
  return { row: 0, column, pixels };
}

function paintAtlasRect(atlas, row, column, x, y, width, height, rgba = [80, 100, 70, 255]) {
  const atlasWidth = FRAME_SIZE * 15;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const atlasX = column * FRAME_SIZE + px;
      const atlasY = row * FRAME_SIZE + py;
      atlas.set(rgba, (atlasY * atlasWidth + atlasX) * 4);
    }
  }
}

function validActionAtlas() {
  const atlas = Buffer.alloc(FRAME_SIZE * 15 * FRAME_SIZE * 8 * 4);
  for (let column = 0; column < 15; column += 1) {
    const width = 28 + (column % 2) * 2;
    const x = Math.floor((FRAME_SIZE - width) / 2);
    for (let row = 0; row < 8; row += 1) {
      paintAtlasRect(atlas, row, column, x, 57, width, 60);
    }
  }
  return atlas;
}

test("姿势验证拒绝可见像素触碰顶左右边缘并报告边名与列号", () => {
  const cases = [
    { x: 60, y: 0, expected: /主体触碰帧格边缘.*top.*第 3 列/ },
    { x: 0, y: 70, expected: /主体触碰帧格边缘.*left.*第 3 列/ },
    { x: FRAME_SIZE - 1, y: 70, expected: /主体触碰帧格边缘.*right.*第 3 列/ },
  ];
  for (const { x, y, expected } of cases) {
    const input = pose(3, 48, 57, 32, 60).pixels;
    paintRect(input, x, y, 1, 1, [80, 100, 70, 1]);
    assert.throws(() => validatePoseFrame(input, { minHeight: 40, column: 3 }), expected);
  }
});

test("姿势验证无列号时仍报告边名，并允许脚底贴地与底边低透明像素", () => {
  const top = pose(0, 48, 57, 32, 60).pixels;
  paintRect(top, 60, 0, 1, 1, [80, 100, 70, 1]);
  assert.throws(() => validatePoseFrame(top, { minHeight: 40 }), /主体触碰帧格边缘.*top/);

  const bottom = pose(0, 48, 57, 32, 60).pixels;
  paintRect(bottom, 60, FRAME_SIZE - 1, 1, 1, [80, 100, 70, 1]);
  assert.equal(validatePoseFrame(bottom, { minHeight: 40 }).main.maxY, GROUND_Y);
});

test("动作图集验证拒绝非底边裁切并报告实际列号", () => {
  const atlas = validActionAtlas();
  paintAtlasRect(atlas, 0, 4, 60, 0, 1, 1, [80, 100, 70, 1]);
  assert.throws(() => validateActionAtlas(atlas, "zombie"), /主体触碰帧格边缘.*top.*第 4 列/);
});

test("连通轮廓忽略低透明像素并使用八邻域", () => {
  const input = frame();
  paintRect(input, 40, 35, 20, 50);
  paintRect(input, 60, 85, 2, 3);
  input[(20 * FRAME_SIZE + 20) * 4 + 3] = ALPHA_THRESHOLD - 1;
  const components = findComponents(input);
  assert.equal(components.length, 1);
  assert.equal(components[0].height, 53);
});

test("主体评分拒绝边缘残片并保持行列确定性", () => {
  const clipped = frame();
  const complete = frame();
  paintRect(clipped, 0, 20, 24, 70);
  paintRect(complete, 48, 24, 32, 72);
  const selected = selectCanonicalCandidate([
    { row: 0, column: 0, pixels: clipped },
    { row: 0, column: 1, pixels: complete },
    { row: 0, column: 2, pixels: Buffer.from(complete) },
  ]);
  assert.equal(selected.row, 0);
  assert.equal(selected.column, 1);
});

test("最高分候选清理后无效时回退到下一完整主体", () => {
  const invalid = frame();
  const valid = frame();
  paintRect(invalid, 34, 18, 32, 90);
  paintRect(invalid, 72, 40, 8, 50);
  paintRect(valid, 45, 30, 30, 70);
  const selected = selectCanonicalCandidate([
    { row: 0, column: 0, pixels: invalid },
    { row: 0, column: 1, pixels: valid },
  ]);
  assert.equal(selected.row, 0);
  assert.equal(selected.column, 1);
  assert.doesNotThrow(() => {
    validateGroundedFrame(cleanCanonicalFrame(selected));
  });
});

test("清理结果删除远端残片并把主体居中贴地", () => {
  const input = frame();
  paintRect(input, 42, 30, 36, 72);
  paintRect(input, 80, 60, 4, 5);
  paintRect(input, 6, 8, 12, 12);
  const candidate = selectCanonicalCandidate([{ row: 0, column: 0, pixels: input }]);
  const output = cleanCanonicalFrame(candidate);
  const result = validateGroundedFrame(output);
  assert.equal(result.main.maxY, GROUND_Y);
  assert.ok(Math.abs(result.main.centerX - 64) <= 1);
  assert.equal(result.components.length, 2);
  assert.equal(output[(75 * FRAME_SIZE + 85) * 4 + 3], 255);
  assert.equal(output[(23 * FRAME_SIZE + 11) * 4 + 3], 0);
});

test("主体清理支持 Uint8Array 像素输入", () => {
  const input = new Uint8Array(FRAME_SIZE * FRAME_SIZE * 4);
  paintRect(input, 48, 30, 32, 72);
  const candidate = selectCanonicalCandidate([{ row: 0, column: 0, pixels: input }]);
  const output = cleanCanonicalFrame(candidate);
  const result = validateGroundedFrame(output);
  assert.equal(result.main.maxY, GROUND_Y);
});

test("可见像素哈希忽略完全透明像素中的隐藏颜色", () => {
  const first = frame();
  const second = frame();
  first[0] = 255;
  second[1] = 255;
  assert.equal(visiblePixelHash(first), visiblePixelHash(second));
});

test("姿势清理统一脚底并保留最多六像素水平动作", () => {
  const reference = pose(0, 46, 28, 32, 72);
  const moving = pose(1, 54, 30, 32, 70);
  const cleaned = cleanPoseFrame(moving, {
    referenceCenterX: 62,
    minHeight: 40,
    maxHorizontalShift: 6,
  });
  const result = validatePoseFrame(cleaned, { minHeight: 40 });
  assert.equal(result.main.maxY, GROUND_Y);
  assert.ok(Math.abs(result.main.centerX - 70) <= 1);
  assert.ok(reference.pixels.length > 0);
});

test("动作序列用同动作最近合格帧替换异常帧", () => {
  const valid0 = pose(0, 46, 28, 32, 72);
  const broken1 = pose(1, 0, 0, 8, 8);
  const broken2 = pose(2, 0, 0, 8, 8);
  const valid3 = pose(3, 48, 26, 34, 74);
  const result = cleanActionSequence([valid0, broken1, broken2, valid3], {
    name: "walk",
    minHeight: 40,
    minUniqueFrames: 2,
  });
  assert.equal(visiblePixelHash(result.frames[1]), visiblePixelHash(result.frames[0]));
  assert.equal(visiblePixelHash(result.frames[2]), visiblePixelHash(result.frames[3]));
  assert.notEqual(visiblePixelHash(result.frames[0]), visiblePixelHash(result.frames[3]));
  assert.deepEqual(result.replacements, [
    { column: 1, sourceColumn: 0 },
    { column: 2, sourceColumn: 3 },
  ]);
});

test("死亡动作允许横向倒地但仍要求单一主体", () => {
  const standing = pose(12, 48, 30, 32, 72);
  const falling = pose(13, 35, 72, 68, 32);
  const lying = pose(14, 28, 88, 78, 24);
  const result = cleanActionSequence([standing, falling, lying], ACTION_GROUPS.death);
  assert.equal(result.frames.length, 3);
  for (const output of result.frames) {
    assert.equal(validatePoseFrame(output, { minHeight: 18 }).main.maxY, GROUND_Y);
  }
});

test("整组无合格帧或清理后只有一个可见姿势时失败", () => {
  const broken = pose(0, 0, 0, 8, 8);
  assert.throws(
    () => cleanActionSequence([broken, broken], ACTION_GROUPS.hurt),
    /hurt 没有合格帧/,
  );
  const repeated = pose(0, 48, 30, 32, 72);
  assert.throws(
    () => cleanActionSequence([repeated, { ...repeated, column: 1 }], ACTION_GROUPS.hurt),
    /hurt 可见姿势不足/,
  );
});
