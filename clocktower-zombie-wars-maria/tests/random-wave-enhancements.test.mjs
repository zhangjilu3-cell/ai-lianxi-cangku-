import test from "node:test";
import assert from "node:assert/strict";
import {
  ENHANCED_ENEMY_KINDS,
  buildWaveEnhancements,
  consumeWaveEnhancement,
} from "../src/random-wave-enhancements.js";

function sequence(values) {
  let index = 0;
  return () => values[index++];
}

test("第十波以前没有强化，第十一波抽取两个不同类型", () => {
  assert.deepEqual(buildWaveEnhancements(10, () => 0), []);
  assert.deepEqual(
    buildWaveEnhancements(11, sequence([0, 0])),
    ["zombie", "runner"],
  );
});

test("第二十波首领波只抽取一个类型", () => {
  assert.deepEqual(buildWaveEnhancements(20, () => 0.99), ["toxic"]);
});

test("强化名额仅由首个对应类型消费", () => {
  const first = consumeWaveEnhancement(["runner", "toxic"], "runner");
  assert.equal(first.enhancement.kind, "runner");
  assert.equal(first.enhancement.speedMultiplier, 1.5);
  assert.deepEqual(first.remaining, ["toxic"]);
  const second = consumeWaveEnhancement(first.remaining, "runner");
  assert.equal(second.enhancement, null);
  assert.deepEqual(second.remaining, ["toxic"]);
});

test("非法随机源与畸形名单安全降级", () => {
  for (const random of [
    null,
    () => Number.NaN,
    () => -0.1,
    () => 1,
    () => {
      throw new Error("random unavailable");
    },
  ]) {
    assert.deepEqual(buildWaveEnhancements(11, random), []);
  }
  assert.deepEqual(
    consumeWaveEnhancement(["runner", "runner"], "runner"),
    { enhancement: null, remaining: [] },
  );
  assert.deepEqual(
    consumeWaveEnhancement(null, "runner"),
    { enhancement: null, remaining: [] },
  );
});

test("四种配置与批准倍率一致", () => {
  assert.deepEqual(ENHANCED_ENEMY_KINDS, [
    "zombie",
    "runner",
    "exploder",
    "toxic",
  ]);
  const expected = {
    zombie: ["healthMultiplier", 2],
    runner: ["speedMultiplier", 1.5],
    exploder: ["explosionRadius", 183],
    toxic: ["gasRadius", 123],
  };
  for (const kind of ENHANCED_ENEMY_KINDS) {
    const result = consumeWaveEnhancement([kind], kind);
    assert.equal(result.enhancement.kind, kind);
    assert.equal(result.enhancement.scoreMultiplier, 2);
    assert.equal(result.enhancement[expected[kind][0]], expected[kind][1]);
  }
});
