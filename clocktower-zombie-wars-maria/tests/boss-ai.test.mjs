import test from "node:test";
import assert from "node:assert/strict";
import { bossProfileForWave } from "../src/game-core.js";
import { BOSS_MOVES, beginBossMove, updateBossCombat, bossAttackPose, bossStrikeTouches, steerBoss, bossPathClear } from "../src/boss-combat.js";

function boss(index = 0, wave = 90) {
  const profile = bossProfileForWave(wave, index);
  return { ...profile, id: index + 1, kind: "boss", x: 200, y: 450, maxHealth: profile.health, animationTime: 0 };
}
function tick(b, seconds, target = { x: 500, y: 450, radius: 16 }, arena = {}, dt = 1 / 60) {
  const events = [];
  for (let time = 0; time < seconds - 1e-7; time += dt) events.push(...updateBossCombat(b, target, dt, false, arena).events);
  return events;
}

test("all six identities have disjoint move sets, unique poses and identity-specific tier upgrades", () => {
  const seen = new Set(), poses = new Set();
  const ultimate = ["ring", "spores", "pounce", "cross", "meteor", "orbit"];
  for (let i = 0; i < 6; i++) {
    const b = boss(i);
    assert.equal(b.bossMoves.length, 3);
    assert.equal(b.bossMoves.at(-1), ultimate[i]);
    for (const name of b.bossMoves) { assert.ok(BOSS_MOVES[name]); assert.ok(!seen.has(name), name); seen.add(name); }
    beginBossMove(b, { x: 300, y: 450 }, b.bossMoves[0]);
    b.bossCombat.elapsed = .5;
    poses.add(JSON.stringify(bossAttackPose(b)));
    assert.equal(bossProfileForWave(60, i).bossMoves.length, 2);
    assert.notDeepEqual(bossProfileForWave(70, i).bossMoveOverrides, bossProfileForWave(80, i).bossMoveOverrides);
    assert.notDeepEqual(bossProfileForWave(80, i).bossMoveOverrides, bossProfileForWave(90, i).bossMoveOverrides);
  }
  assert.equal(poses.size, 6);
});

test("AI skips out-of-range melee and pairs never start simultaneous casts", () => {
  const b = boss(1), target = { x: 540, y: 450, radius: 16 };
  b.bossCombat = { phase: "idle", cooldown: 0, nextMove: 0, effects: [], enraged: false };
  updateBossCombat(b, target, .01);
  assert.equal(b.bossCombat.move, "plague");
  const other = boss(5);
  other.bossCombat = { phase: "idle", cooldown: 0, nextMove: 0, effects: [], enraged: false };
  updateBossCombat(other, target, .01, false, { enemies: [b, other] });
  assert.equal(other.bossCombat.phase, "idle");
  b.bossCombat.phase = "recovery";
  updateBossCombat(other, target, .01, false, { enemies: [b, other] });
  assert.equal(other.bossCombat.phase, "windup");
});

test("locked poison and bombard marks do not track a dodging player", () => {
  for (const [index, move, type] of [[1, "plague", "gas"], [1, "spores", "gas"], [4, "bombard", "hit"], [4, "meteor", "hit"]]) {
    const b = boss(index), target = { x: 500, y: 450 };
    beginBossMove(b, target, move);
    const marks = b.bossCombat.marks.map(({ x, y }) => ({ x, y }));
    const def = BOSS_MOVES[move];
    const events = tick(b, def.windup + def.active + .08, { x: 900, y: 800 }).filter(event => event.type === type);
    assert.deepEqual(events.map(({ x, y }) => ({ x, y })), marks);
  }
});

test("ring has a safe center and cross lanes share a single hit budget", () => {
  const ring = { shape: "ring", x: 0, y: 0, radius: 235, innerRadius: 110 };
  assert.equal(bossStrikeTouches(ring, { x: 50, y: 0, radius: 16 }), false);
  assert.equal(bossStrikeTouches(ring, { x: 100, y: 0, radius: 16 }), true);
  assert.equal(bossStrikeTouches(ring, { x: 252, y: 0, radius: 16 }), false);
  const b = boss(3); beginBossMove(b, { x: 500, y: 450 }, "cross");
  const hits = tick(b, 2.2).filter(event => event.type === "hit");
  assert.equal(hits.length, 4);
  assert.ok(hits.every(hit => hit.hitIds === hits[0].hitIds && hit.displaced === false));
  assert.equal(b.x, 200);
});

test("dash and leap stop before an obstacle at 30, 60 and 120 Hz", () => {
  const obstacle = { x: 400, y: 450, rx: 40, ry: 90 };
  for (const move of ["rush", "pounce", "feint"]) for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const b = boss(2), arena = { obstacles: [obstacle], width: 1600, height: 900 };
    beginBossMove(b, { x: 650, y: 450 }, move, arena);
    const marked = { ...b.bossCombat.marks[0] };
    const hits = tick(b, 2.5, { x: 900, y: 500 }, arena, dt).filter(event => event.type === "hit");
    assert.ok(bossPathClear({ x: 200, y: 450 }, b, [obstacle], b.radius));
    if (move === "pounce") {
      assert.ok(Math.abs(hits[0].x - marked.x) < .01);
      assert.ok(Math.abs(hits[0].y - marked.y) < .01);
    }
  }
});

test("pursuit navigates around a rock without penetrating or oscillating in place", () => {
  const b = boss(0), obstacle = { x: 430, y: 450, rx: 100, ry: 85 };
  const arena = { obstacles: [obstacle], width: 1600, height: 900 };
  let maxDeviation = 0;
  for (let i = 0; i < 900; i++) {
    steerBoss(b, { x: 850, y: 450, radius: 16 }, 1 / 60, 110, arena);
    maxDeviation = Math.max(maxDeviation, Math.abs(b.y - 450));
    assert.ok(Math.hypot((b.x - obstacle.x) / (obstacle.rx + b.radius), (b.y - obstacle.y) / (obstacle.ry + b.radius)) >= .999);
  }
  assert.ok(maxDeviation > 100);
  assert.ok(b.x > 740, `boss stopped at ${b.x}, ${b.y}`);
});

test("ranged caster retreats to its preferred distance while freeze preserves pending skills", () => {
  const b = boss(5), target = { x: 260, y: 450, radius: 16 };
  for (let i = 0; i < 300; i++) steerBoss(b, target, 1 / 60, 80);
  assert.ok(Math.hypot(b.x - target.x, b.y - target.y) > 220);
  for (const move of ["spores", "meteor", "pounce", "cross"]) {
    const enemy = boss(); beginBossMove(enemy, { x: 500, y: 450 }, move);
    const saved = JSON.stringify(enemy.bossCombat);
    assert.deepEqual(updateBossCombat(enemy, target, 1, true).events, []);
    assert.equal(JSON.stringify(enemy.bossCombat), saved);
    enemy.health = 0; assert.deepEqual(updateBossCombat(enemy, target, 1).events, []);
    assert.equal(enemy.bossCombat, null);
  }
});

import { bossAnimationTime } from "../src/boss-combat.js";
test("skill animation uses its own clock and carries settle into each barrage strike", () => {
  const b = boss(5); b.animationTime = 999;
  beginBossMove(b, { x: 500, y: 450 }, "barrage");
  assert.equal(bossAnimationTime(b), 0);
  b.bossCombat.phase = "active"; b.bossCombat.elapsed = .35;
  assert.ok(bossAnimationTime(b) > .28 && bossAnimationTime(b) <= .3);
  b.bossCombat.elapsed = .34; assert.equal(bossAnimationTime(b), .3);
  b.bossCombat.elapsed = .6; assert.ok(bossAnimationTime(b) > .2);
  b.bossCombat.phase = "recovery"; assert.equal(bossAnimationTime(b), .3);
});
