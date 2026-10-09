import { createHash } from "node:crypto";

export const FRAME_SIZE = 128;
export const ALPHA_THRESHOLD = 32;
export const MIN_BODY_AREA = 256;
export const MIN_BODY_HEIGHT = 40;
export const MIN_PART_AREA = 8;
export const MAX_PART_GAP = 6;
export const GROUND_Y = 116;
export const MAX_HORIZONTAL_SHIFT = 6;
export const ACTION_GROUPS = Object.freeze({
  walk: Object.freeze({ name: "walk", start: 0, frames: 6, minHeight: 40, minUniqueFrames: 2 }),
  attack: Object.freeze({ name: "attack", start: 6, frames: 4, minHeight: 40, minUniqueFrames: 2 }),
  hurt: Object.freeze({ name: "hurt", start: 10, frames: 2, minHeight: 40, minUniqueFrames: 2 }),
  death: Object.freeze({ name: "death", start: 12, frames: 3, minHeight: 18, minUniqueFrames: 3 }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pixelOffset(x, y) {
  return (y * FRAME_SIZE + x) * 4;
}

function componentFromPixels(pixels) {
  let minX = FRAME_SIZE;
  let minY = FRAME_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (const index of pixels) {
    const pixel = index / 4;
    const x = pixel % FRAME_SIZE;
    const y = Math.floor(pixel / FRAME_SIZE);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return {
    pixels,
    area: pixels.length,
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    edgeCount: Number(minX === 0) + Number(minY === 0) + Number(maxX === 127) + Number(maxY === 127),
  };
}

export function findComponents(frame) {
  if (frame.length !== FRAME_SIZE * FRAME_SIZE * 4) throw new Error("行走格 RGBA 长度错误");
  const visited = new Uint8Array(FRAME_SIZE * FRAME_SIZE);
  const components = [];
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const start = y * FRAME_SIZE + x;
      if (visited[start] || frame[start * 4 + 3] < ALPHA_THRESHOLD) continue;
      const queue = [start];
      const pixels = [];
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        const cx = current % FRAME_SIZE;
        const cy = Math.floor(current / FRAME_SIZE);
        pixels.push(current * 4);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= FRAME_SIZE || ny < 0 || ny >= FRAME_SIZE) continue;
            const next = ny * FRAME_SIZE + nx;
            if (visited[next] || frame[next * 4 + 3] < ALPHA_THRESHOLD) continue;
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      components.push(componentFromPixels(pixels));
    }
  }
  return components;
}

function score(component) {
  const centerDistance = Math.hypot(component.centerX - 64, component.centerY - 64);
  return component.area + component.height * 16 - centerDistance * 20 - component.edgeCount * 2048;
}

export function selectFrameCandidate(entry, { minHeight = MIN_BODY_HEIGHT } = {}) {
  const components = findComponents(entry.pixels);
  const mains = components
    .filter((component) => component.area >= MIN_BODY_AREA && component.height >= minHeight)
    .sort((a, b) => score(b) - score(a));
  if (!mains.length) throw new Error(`第 ${entry.column} 列没有完整主体`);
  return { ...entry, main: mains[0], components };
}

export function selectCanonicalCandidate(frames) {
  const candidates = frames.flatMap((entry) => {
    const components = findComponents(entry.pixels);
    return components
      .filter((component) => component.area >= MIN_BODY_AREA && component.height >= MIN_BODY_HEIGHT)
      .map((main) => ({ ...entry, main, components, score: score(main) }));
  });
  candidates.sort((a, b) => b.score - a.score || a.row - b.row || a.column - b.column);
  if (!candidates.length) throw new Error("没有符合阈值的完整敌人主体");
  for (const candidate of candidates) {
    try {
      validateGroundedFrame(cleanCanonicalFrame(candidate));
      return candidate;
    } catch {
      // 按确定性评分顺序继续尝试下一个可清理候选。
    }
  }
  throw new Error("没有可清理为单一贴地主体的敌人候选");
}

function boxGap(first, second) {
  const xGap = Math.max(0, first.minX - second.maxX - 1, second.minX - first.maxX - 1);
  const yGap = Math.max(0, first.minY - second.maxY - 1, second.minY - first.maxY - 1);
  return Math.hypot(xGap, yGap);
}

function cleanCandidate(candidate, { targetCenterX = 64, targetGroundY = GROUND_Y } = {}) {
  const kept = candidate.components.filter((component) =>
    component === candidate.main || (component.area >= MIN_PART_AREA && boxGap(component, candidate.main) <= MAX_PART_GAP));
  const dx = Math.round(targetCenterX - candidate.main.centerX);
  const dy = targetGroundY - candidate.main.maxY;
  const output = Buffer.alloc(candidate.pixels.length);
  for (const component of kept) {
    for (const offset of component.pixels) {
      const pixel = offset / 4;
      const x = pixel % FRAME_SIZE;
      const y = Math.floor(pixel / FRAME_SIZE);
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= FRAME_SIZE || ny < 0 || ny >= FRAME_SIZE) throw new Error("主体贴地后超出行走格");
      output.set(candidate.pixels.subarray(offset, offset + 4), pixelOffset(nx, ny));
    }
  }
  return output;
}

export function cleanPoseFrame(entry, {
  referenceCenterX,
  minHeight = MIN_BODY_HEIGHT,
  maxHorizontalShift = MAX_HORIZONTAL_SHIFT,
} = {}) {
  const candidate = selectFrameCandidate(entry, { minHeight });
  const reference = referenceCenterX ?? candidate.main.centerX;
  const horizontalShift = clamp(candidate.main.centerX - reference, -maxHorizontalShift, maxHorizontalShift);
  return cleanCandidate(candidate, { targetCenterX: 64 + horizontalShift });
}

export function cleanCanonicalFrame(candidate) {
  return cleanCandidate(candidate);
}

export function validateGroundedFrame(frame) {
  const components = findComponents(frame);
  const bodies = components.filter((component) => component.area >= MIN_BODY_AREA && component.height >= MIN_BODY_HEIGHT);
  if (bodies.length !== 1) throw new Error(`主要主体数量错误：${bodies.length}`);
  const main = bodies[0];
  if (main.maxY !== GROUND_Y || Math.abs(main.centerX - 64) > 1) throw new Error("主体没有居中贴地");
  for (const component of components) {
    if (component === main) continue;
    if (component.area < MIN_PART_AREA || boxGap(component, main) > MAX_PART_GAP) throw new Error("行走格仍包含远端残片");
  }
  return { main, components };
}

function touchedNonBottomEdges(frame) {
  const edges = [];
  for (let x = 0; x < FRAME_SIZE; x += 1) {
    if (frame[pixelOffset(x, 0) + 3] >= 1) {
      edges.push("top");
      break;
    }
  }
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    if (frame[pixelOffset(0, y) + 3] >= 1) {
      edges.push("left");
      break;
    }
  }
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    if (frame[pixelOffset(FRAME_SIZE - 1, y) + 3] >= 1) {
      edges.push("right");
      break;
    }
  }
  return edges;
}

export function validatePoseFrame(frame, { minHeight = MIN_BODY_HEIGHT, column } = {}) {
  const touchedEdges = touchedNonBottomEdges(frame);
  if (touchedEdges.length) {
    const columnLabel = column === undefined ? "" : `，第 ${column} 列`;
    throw new Error(`主体触碰帧格边缘：${touchedEdges.join("/")} ${columnLabel}`);
  }
  const components = findComponents(frame);
  const bodies = components.filter((component) =>
    component.area >= MIN_BODY_AREA && component.height >= minHeight);
  if (bodies.length !== 1) throw new Error(`主要主体数量错误：${bodies.length}`);
  const main = bodies[0];
  if (main.maxY !== GROUND_Y || Math.abs(main.centerX - 64) > MAX_HORIZONTAL_SHIFT + 1) {
    throw new Error("主体没有保持允许范围内的贴地姿势");
  }
  for (const component of components) {
    if (component === main) continue;
    if (component.area < MIN_PART_AREA || boxGap(component, main) > MAX_PART_GAP) {
      throw new Error("动作帧仍包含远端残片");
    }
  }
  return { main, components };
}

function nearestValidIndex(validIndices, index) {
  const valid = validIndices
    .slice()
    .sort((a, b) => Math.abs(a - index) - Math.abs(b - index) || a - b);
  return valid[0];
}

export function cleanActionSequence(entries, action) {
  const referenceCandidate = entries
    .map((entry) => {
      try {
        return selectFrameCandidate(entry, { minHeight: action.minHeight });
      } catch {
        return null;
      }
    })
    .find(Boolean);
  if (!referenceCandidate) throw new Error(`${action.name} 没有合格帧`);

  const frames = entries.map((entry) => {
    try {
      const output = cleanPoseFrame(entry, {
        referenceCenterX: referenceCandidate.main.centerX,
        minHeight: action.minHeight,
      });
      validatePoseFrame(output, { minHeight: action.minHeight });
      return output;
    } catch {
      return null;
    }
  });
  const validIndices = frames
    .map((frame, index) => frame ? index : -1)
    .filter((index) => index >= 0);
  const replacements = [];
  for (let index = 0; index < frames.length; index += 1) {
    if (frames[index]) continue;
    const sourceIndex = nearestValidIndex(validIndices, index);
    if (sourceIndex === undefined) throw new Error(`${action.name} 没有合格帧`);
    frames[index] = Buffer.from(frames[sourceIndex]);
    replacements.push({ column: entries[index].column, sourceColumn: entries[sourceIndex].column });
  }
  const unique = new Set(frames.map(visiblePixelHash));
  if (unique.size < action.minUniqueFrames) throw new Error(`${action.name} 可见姿势不足`);
  return { frames, replacements };
}

export function visiblePixelHash(frame) {
  const visible = Buffer.from(frame);
  for (let index = 0; index < visible.length; index += 4) {
    const alpha = visible[index + 3];
    visible[index] = Math.round((visible[index] * alpha) / 255);
    visible[index + 1] = Math.round((visible[index + 1] * alpha) / 255);
    visible[index + 2] = Math.round((visible[index + 2] * alpha) / 255);
  }
  return createHash("sha256").update(visible).digest("hex");
}
