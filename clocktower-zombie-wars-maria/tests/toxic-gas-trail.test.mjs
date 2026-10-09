import test from "node:test";
import assert from "node:assert/strict";
import {
  TOXIC_GAS_TRAIL,
  advanceToxicGasTrail,
  createToxicGasTrailState,
} from "../src/toxic-gas-trail.js";

test("毒气僵尸获得独立五秒轨迹状态，其他敌人不获得", () => {
  assert.deepEqual(TOXIC_GAS_TRAIL, { duration: 5, spacing: 55 });
  assert.deepEqual(createToxicGasTrailState("toxic"), {
    gasTrailTime: 5,
    gasTrailDistance: 0,
  });
  assert.deepEqual(createToxicGasTrailState("zombie"), {});
  assert.notEqual(
    createToxicGasTrailState("toxic"),
    createToxicGasTrailState("toxic"),
  );
});

function advance(overrides = {}) {
  return advanceToxicGasTrail({
    kind: "toxic",
    health: 72,
    gasTrailTime: 5,
    gasTrailDistance: 0,
    startX: 10,
    startY: 20,
    endX: 10,
    endY: 20,
    dt: 1,
    ...overrides,
  });
}

test("累计54像素不释放，达到55像素释放一团", () => {
  const first = advance({ endX: 64 });
  assert.deepEqual(first.points, []);
  assert.equal(first.gasTrailDistance, 54);
  assert.equal(first.gasTrailTime, 4);

  const second = advance({
    gasTrailTime: first.gasTrailTime,
    gasTrailDistance: first.gasTrailDistance,
    startX: 64,
    endX: 65,
  });
  assert.deepEqual(second.points, [{ x: 65, y: 20 }]);
  assert.equal(second.gasTrailDistance, 0);
  assert.equal(second.gasTrailTime, 3);
});

test("单帧跨越多个间距时在线段上补齐全部采样点", () => {
  const result = advance({ startX: 10, endX: 130, dt: 0.5 });
  assert.deepEqual(result.points, [
    { x: 65, y: 20 },
    { x: 120, y: 20 },
  ]);
  assert.equal(result.gasTrailDistance, 10);
  assert.equal(result.gasTrailTime, 4.5);
});

test("窗口在帧中结束时只采样移动线段前段", () => {
  const result = advance({
    gasTrailTime: 0.25,
    startX: 0,
    startY: 0,
    endX: 220,
    endY: 0,
    dt: 1,
  });
  assert.deepEqual(result.points, [{ x: 55, y: 0 }]);
  assert.equal(result.gasTrailDistance, 0);
  assert.equal(result.gasTrailTime, 0);
});

test("静止会消耗窗口但不会重复释放，窗口结束后继续移动也不释放", () => {
  const stationary = advance({ dt: 5 });
  assert.deepEqual(stationary.points, []);
  assert.equal(stationary.gasTrailTime, 0);
  const expired = advance({ gasTrailTime: 0, endX: 200 });
  assert.deepEqual(expired.points, []);
  assert.equal(expired.gasTrailDistance, 0);
});

test("非毒气、死亡或非法数据全部 fail closed", () => {
  for (const overrides of [
    { kind: "runner", endX: 200 },
    { health: 0, endX: 200 },
    { startX: Number.NaN, endX: 200 },
    { endY: Number.POSITIVE_INFINITY, endX: 200 },
    { dt: 0, endX: 200 },
    { dt: -1, endX: 200 },
    { gasTrailTime: Number.NaN, endX: 200 },
    { gasTrailDistance: Number.NaN, endX: 200 },
  ]) {
    const result = advance(overrides);
    assert.deepEqual(result.points, []);
    assert.equal(Number.isFinite(result.gasTrailTime), true);
    assert.equal(Number.isFinite(result.gasTrailDistance), true);
  }
});

test("派生位移溢出时快速 fail closed", { timeout: 100 }, () => {
  const result = advance({
    startX: -Number.MAX_VALUE,
    endX: Number.MAX_VALUE,
  });
  assert.deepEqual(result.points, []);
  assert.equal(result.gasTrailTime, 0);
  assert.equal(result.gasTrailDistance, 0);
});

test("有限超大位移超过单步采样上限时快速 fail closed", { timeout: 100 }, () => {
  const result = advance({
    startX: 0,
    startY: 0,
    endX: Number.MAX_VALUE,
    endY: 0,
  });
  assert.deepEqual(result.points, []);
  assert.equal(result.gasTrailTime, 0);
  assert.equal(result.gasTrailDistance, 0);
});

test("浮点误差略低于55像素的斜线仍释放边界采样点", () => {
  const diagonal = 55 / Math.sqrt(2);
  assert.equal(Math.hypot(diagonal, diagonal) < 55, true);
  const result = advance({
    startX: 0,
    startY: 0,
    endX: diagonal,
    endY: diagonal,
  });
  assert.equal(result.points.length, 1);
  assert.deepEqual(result.points[0], { x: diagonal, y: diagonal });
  assert.equal(result.gasTrailDistance, 0);
});

test("连续小时间步在五秒后严格归零且下一帧不释放", () => {
  let state = { gasTrailTime: 5, gasTrailDistance: 0 };
  for (let frame = 0; frame < 50; frame += 1) {
    state = advance({ ...state, dt: 0.1 });
  }
  assert.equal(state.gasTrailTime, 0);

  const expired = advance({
    ...state,
    startX: 0,
    startY: 0,
    endX: 110,
    endY: 0,
    dt: 0.1,
  });
  assert.deepEqual(expired.points, []);
  assert.equal(expired.gasTrailTime, 0);
});

test("累计距离接近55像素时微小移动不会吞掉采样", () => {
  const result = advance({
    gasTrailDistance: 55 - 5e-10,
    startX: 0,
    startY: 0,
    endX: 1e-9,
    endY: 0,
  });
  assert.equal(result.points.length, 1);
  assert.equal(Number.isFinite(result.points[0].x), true);
  assert.equal(Number.isFinite(result.points[0].y), true);
  assert.equal(result.points[0].x >= 0 && result.points[0].x <= 1e-9, true);
});
