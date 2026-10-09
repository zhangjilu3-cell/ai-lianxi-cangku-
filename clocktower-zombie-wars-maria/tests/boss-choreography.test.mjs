import test from 'node:test';
import assert from 'node:assert/strict';
import { bossProfileForWave } from '../src/game-core.js';
import { beginBossMove, bossMoveFor, bossAttackPose, updateBossCombat } from '../src/boss-combat.js';
import { bossWarningProgress } from '../src/boss-effects.js';
const neutral = { lean: 0, lift: 0, scaleX: 1, scaleY: 1 };
function boss(index) {
  const profile = bossProfileForWave(90, index);
  return { ...profile, x: 300, y: 400, maxHealth: profile.health };
}
function near(a, b) {
  for (const key of Object.keys(a)) assert.ok(Math.abs(a[key] - b[key]) < .00001, `${key}: ${a[key]} vs ${b[key]}`);
}
test('18 skills have distinct anticipation and continuous windup, release, recovery boundaries', () => {
  const poses = new Set();
  for (let index = 0; index < 6; index++) for (const name of boss(index).bossMoves) {
    const b = boss(index);
    beginBossMove(b, { x: 550, y: 400 }, name);
    const state = b.bossCombat, move = bossMoveFor(b, name);
    near(bossAttackPose(b), neutral);
    state.elapsed = move.windup;
    const ready = bossAttackPose(b); poses.add(JSON.stringify(ready));
    state.phase = 'active'; state.elapsed = 0; near(bossAttackPose(b), ready);
    state.elapsed = move.active;
    const settle = bossAttackPose(b);
    state.phase = 'recovery'; state.elapsed = 0; near(bossAttackPose(b), settle);
    for (const enraged of [false, true]) {
      state.enraged = enraged; state.elapsed = move.recovery * (enraged ? .75 : 1);
      near(bossAttackPose(b), neutral);
    }
    for (const phase of ['windup', 'active', 'recovery']) for (let i = 0; i <= 30; i++) {
      state.phase = phase; state.elapsed = move[phase] * i / 30;
      const pose = bossAttackPose(b);
      for (const v of Object.values(pose)) assert.ok(Number.isFinite(v));
      assert.ok(pose.scaleX > .7 && pose.scaleY > .65);
    }
  }
  assert.equal(poses.size, 18);
});
test('sequential landing countdown matches each hit and leap stays pending until landing', () => {
  const b = boss(4); beginBossMove(b, { x: 600, y: 400 }, 'meteor');
  const move = bossMoveFor(b, 'meteor'), state = b.bossCombat;
  state.elapsed = move.windup;
  assert.ok(bossWarningProgress(state, move, 0) < 1);
  assert.ok(bossWarningProgress(state, move, 1) < 1);
  assert.ok(bossWarningProgress(state, move, 2) < bossWarningProgress(state, move, 1));
  state.phase = 'active';
  for (let i = 0; i < 3; i++) {
    state.elapsed = state.impactTimes[i];
    assert.equal(bossWarningProgress(state, move, i), 1);
  }
  const leap = boss(2); beginBossMove(leap, { x: 550, y: 400 }, 'pounce');
  const def = bossMoveFor(leap, 'pounce');
  leap.bossCombat.phase = 'active'; leap.bossCombat.elapsed = 0;
  assert.ok(bossWarningProgress(leap.bossCombat, def) < 1);
  leap.bossCombat.elapsed = def.active;
  assert.equal(bossWarningProgress(leap.bossCombat, def), 1);
});
test('dash warning endpoint is clipped to the same obstacle and wall as movement', () => {
  for (const arena of [{width:1600,height:900,obstacles:[{x:490,y:400,rx:40,ry:70}]}, {width:480,height:900,obstacles:[]}]) {
    const b = boss(2); beginBossMove(b, {x:700,y:400}, 'rush', arena);
    const move = bossMoveFor(b, 'rush'), length = b.bossCombat.dashLength;
    assert.ok(length < move.speed * move.active);
    updateBossCombat(b, {x:700,y:400}, move.windup, false, arena);
    updateBossCombat(b, {x:700,y:400}, move.active, false, arena);
    assert.ok(Math.abs(b.x - 300 - length) < .001);
  }
});
