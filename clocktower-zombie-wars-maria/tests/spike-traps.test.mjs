import test from "node:test";
import assert from "node:assert/strict";
import {
  SPIKE_TRAP_COUNT,
  SPIKE_TRAP_RADIUS,
  activateSpikeTraps,
  advanceSpikeTrap,
  createSpikeTraps,
  isSpikeTrapTouching,
  isSpikeTrapWave,
} from "../src/spike-traps.js";

function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

const arena = Object.freeze({
  width: 1600,
  height: 900,
  obstacles: Object.freeze([{ x: 430, y: 230, rx: 38, ry: 34 }]),
  structures: Object.freeze([{ x: 800, y: 300 }]),
  player: Object.freeze({ x: 800, y: 450 }),
});

test("地刺只在第 31 波及以后启用", () => {
  for (const wave of [undefined, null, NaN, Infinity, -1, 0, 30, 30.5, "31"]) {
    assert.equal(isSpikeTrapWave(wave), false);
    assert.deepEqual(createSpikeTraps({ ...arena, wave }), []);
  }
  assert.equal(isSpikeTrapWave(31), true);
});

test("正常场景生成三个合法、分离且错峰的收起地刺", () => {
  const traps = createSpikeTraps({
    ...arena,
    wave: 31,
    random: sequence([0.1, 0.2, 0.8, 0.2, 0.2, 0.8]),
  });
  assert.equal(traps.length, SPIKE_TRAP_COUNT);
  assert.deepEqual(traps.map((trap) => trap.phaseOffset), [0, 1, 2]);
  assert.ok(traps.every((trap) =>
    trap.radius === SPIKE_TRAP_RADIUS &&
    trap.phase === "retracted" &&
    trap.armed === false &&
    trap.hitIds instanceof Set));
  for (const trap of traps) {
    assert.ok(trap.x >= 92 && trap.x <= arena.width - 92);
    assert.ok(trap.y >= 92 && trap.y <= arena.height - 92);
    assert.ok(Math.hypot(trap.x - arena.player.x, trap.y - arena.player.y) >= 128);
    assert.ok(Math.hypot(trap.x - arena.structures[0].x, trap.y - arena.structures[0].y) >= 94);
    const obstacle = arena.obstacles[0];
    const ellipseDistance = Math.hypot(
      (trap.x - obstacle.x) / (obstacle.rx + SPIKE_TRAP_RADIUS + 18),
      (trap.y - obstacle.y) / (obstacle.ry + SPIKE_TRAP_RADIUS + 18),
    );
    assert.ok(ellipseDistance >= 1);
  }
  for (let left = 0; left < traps.length; left += 1) {
    for (let right = left + 1; right < traps.length; right += 1) {
      assert.ok(Math.hypot(traps[left].x - traps[right].x, traps[left].y - traps[right].y) >= 128);
    }
  }
});

test("非法随机源降级到通过统一校验的安全候选点", () => {
  const sources = [
    () => Number.NaN,
    () => -1,
    () => 1,
    () => { throw new Error("bad rng"); },
  ];
  for (const random of sources) {
    const traps = createSpikeTraps({ ...arena, wave: 31, random });
    assert.equal(traps.length, SPIKE_TRAP_COUNT);
    assert.ok(traps.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  }
});

test("确实没有合法空间时不会创建非法坐标", () => {
  const traps = createSpikeTraps({
    wave: 31,
    width: 180,
    height: 180,
    obstacles: [],
    structures: [],
    player: { x: 90, y: 90 },
    random: () => 0.5,
  });
  assert.deepEqual(traps, []);
});

test("激活后按 1/0.5/1.5 秒循环并支持大帧跨阶段", () => {
  const traps = activateSpikeTraps(createSpikeTraps({
    ...arena,
    wave: 31,
    random: sequence([0.1, 0.2, 0.8, 0.2, 0.2, 0.8]),
  }));
  assert.deepEqual(traps.map((trap) => trap.phase), ["warning", "active", "retracted"]);
  const warning = traps[0];
  const active = advanceSpikeTrap(warning, 1);
  assert.equal(active.phase, "active");
  active.hitIds.add(9);
  const wrapped = advanceSpikeTrap(active, 2);
  assert.equal(wrapped.phase, "warning");
  assert.equal(wrapped.phaseTime, 0);
  assert.deepEqual([...wrapped.hitIds], [9]);
  const nextActive = advanceSpikeTrap(wrapped, 1);
  assert.equal(nextActive.phase, "active");
  assert.deepEqual([...nextActive.hitIds], []);
});

test("非法时间和畸形地刺不会传播 NaN", () => {
  assert.equal(advanceSpikeTrap(null, 1), null);
  const trap = advanceSpikeTrap({
    x: 100,
    y: 100,
    radius: 36,
    armed: true,
    phase: "broken",
    phaseTime: Number.NaN,
    hitIds: [],
  }, 1);
  assert.equal(trap.phase, "retracted");
  assert.ok(Number.isFinite(trap.phaseTime));
  assert.ok(trap.hitIds instanceof Set);
});

test("命中几何包含目标半径并拒绝非 active 或畸形对象", () => {
  const trap = { x: 100, y: 100, radius: 36, phase: "active" };
  assert.equal(isSpikeTrapTouching(trap, { x: 150, y: 100, radius: 14 }), true);
  assert.equal(isSpikeTrapTouching({ ...trap, phase: "warning" }, { x: 100, y: 100, radius: 14 }), false);
  assert.equal(isSpikeTrapTouching({ ...trap, x: NaN }, { x: 100, y: 100, radius: 14 }), false);
});
