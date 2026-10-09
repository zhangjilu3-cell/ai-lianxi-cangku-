import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { bossProfileForWave } from '../src/game-core.js';
import { beginBossMove, bossMoveFor, bossAttackPose, updateBossCombat, bossRecoveryFor, bossSpriteLayers, steerBoss } from '../src/boss-combat.js';
import { resolveZombieSourceRect, resolveEnemyVisual, bossSpriteGroundOffset } from '../src/zombie-animation.js';

function boss(wave, index) {
  const profile = bossProfileForWave(wave, index);
  return { ...profile, id: index + 1, kind: 'boss', x: 350, y: 450, maxHealth: profile.health, animationTime: 0 };
}
function finishActive(b, move) {
  const target = { x: 580, y: 450, radius: 16 };
  beginBossMove(b, target, move);
  const def = bossMoveFor(b, move);
  updateBossCombat(b, target, def.windup);
  updateBossCombat(b, target, def.active);
  assert.equal(b.bossCombat.phase, 'recovery');
  return { target, def };
}
const neutral = { lean: 0, lift: 0, scaleX: 1, scaleY: 1 };

test('wave 10 stomp exits crouched atlas frame within 16 frames and unlocks pursuit at frame 20', () => {
  const b = boss(10, 0), { target, def } = finishActive(b, 'stomp');
  const recovery = bossRecoveryFor(b);
  assert.equal(recovery.blend, 16 / 60);
  assert.equal(recovery.unlock, 20 / 60);
  assert.equal(def.recovery, 1.2, 'original attack lock remains');
  assert.equal(bossSpriteLayers(b)[0].action, 'attack');
  updateBossCombat(b, target, recovery.blend);
  assert.deepEqual(bossAttackPose(b), neutral);
  assert.deepEqual(bossSpriteLayers(b), [{ action: 'walk', time: 0, alpha: 1 }]);
  const result = updateBossCombat(b, target, recovery.unlock - recovery.blend + .000001);
  assert.equal(result.controlled, false); assert.equal(result.movementScale, .55);
  assert.equal(b.bossCombat.phase, 'recovery');
  const beforeX = b.x; steerBoss(b, target, 1 / 60, b.speed * result.movementScale);
  assert.ok(b.x > beforeX, 'unlocked recovery pursues instead of remaining frozen');
});

test('stomp impact cannot double-compress the body with the crouched atlas', () => {
  const b = boss(10, 0); beginBossMove(b, { x: 480, y: 450 }, 'stomp');
  const def = bossMoveFor(b, 'stomp'); b.bossCombat.phase = 'active'; b.bossCombat.elapsed = def.active * .22;
  const pose = bossAttackPose(b);
  assert.ok(Math.abs(pose.scaleY - .946) < 1e-9);
  assert.ok(pose.scaleX < 1.06);
});

test('every equipped boss move stands up, unlocks motion and keeps attack cooldown through recovery', () => {
  for (const wave of [10, 20, 30, 40, 50, 60, 70, 80, 90]) for (let index = 0; index < 6; index++) {
    for (const move of boss(wave, index).bossMoves) for (const enraged of [false, true]) {
      const b = boss(wave, index), { target, def } = finishActive(b, move);
      b.bossCombat.enraged = enraged;
      const recovery = bossRecoveryFor(b), duration = def.recovery * (enraged ? .75 : 1);
      assert.ok(recovery.blend <= recovery.unlock && recovery.unlock < duration, move);
      updateBossCombat(b, target, recovery.blend * .5);
      const layers = bossSpriteLayers(b);
      assert.equal(layers.length, 2, move);
      assert.equal(layers[0].action, 'attack'); assert.equal(layers[1].action, 'walk');
      assert.ok(Math.abs(layers.reduce((sum, layer) => sum + layer.alpha, 0) - 1) < 1e-9);
      const before = structuredClone(layers), pose = bossAttackPose(b), elapsed = b.bossCombat.elapsed;
      const frozen = updateBossCombat(b, target, 2, true);
      assert.equal(frozen.controlled, true); assert.equal(b.bossCombat.elapsed, elapsed);
      assert.deepEqual(bossSpriteLayers(b), before); assert.deepEqual(bossAttackPose(b), pose);
      const unlocked = updateBossCombat(b, target, recovery.unlock - elapsed + .000001);
      assert.equal(unlocked.controlled, false, move);
      assert.equal(b.bossCombat.phase, 'recovery', move);
      assert.ok(unlocked.events.every(e => !['hit', 'gas', 'volley', 'summon', 'attack'].includes(e.type)), move);
      assert.deepEqual(bossAttackPose(b), neutral, move);
      const lastElapsed = duration - .0001;
      b.bossCombat.elapsed = lastElapsed;
      const walkBefore = bossSpriteLayers(b)[0].time;
      const complete = updateBossCombat(b, target, .0001);
      assert.equal(b.bossCombat.phase, 'idle', move);
      assert.equal(complete.controlled, false, 'no extra controlled frame after recovery');
      assert.ok(Math.abs(bossSpriteLayers(b)[0].time - walkBefore - .0001) < 1e-8, move);
      assert.ok(b.bossCombat.cooldown > 0, move);
      assert.ok(b.bossCombat.moveCooldowns[move] > 0, move);
      b.health = 0;
      assert.equal(updateBossCombat(b, target, .01).controlled, true);
      assert.equal(b.bossCombat, null);
    }
  }
});

test('actual sprite renderer blends recovery into walk without rendering death or hurt atlas cells', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const start = source.indexOf('function drawEnemySprite('), end = source.indexOf('function drawEnemyDeathSprite(', start);
  const calls = [], scales = [], scratchCalls = [], state = { globalAlpha: 1 }, stack = [];
  let allocations = 0;
  class ScratchCanvas {
    constructor(width, height) { this.width = width; this.height = height; allocations++; }
    getContext() { return this.ctx ??= { globalAlpha: 1, globalCompositeOperation: 'source-over', clearRect() {},
      drawImage(...args) { scratchCalls.push({ args, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); } }; }
  }
  const context = new Proxy(state, { get(t, key) {
    if (key in t) return t[key];
    if (key === 'save') return () => stack.push({ ...t });
    if (key === 'restore') return () => { for (const k of Object.keys(t)) delete t[k]; Object.assign(t, stack.pop()); };
    return (...args) => { if (key === 'scale') scales.push(args); if (key === 'drawImage') calls.push({ args, alpha: t.globalAlpha }); };
  } });
  const sandbox = { context, bossSpriteGroundOffset, OffscreenCanvas: ScratchCanvas, resolveEnemyVisual, resolveZombieSourceRect, bossSpriteLayers, bossAttackPose,
    enemyAtlases: new Map([['zombie', {}]]), resolveEnemyAction: () => 'attack',
    freezeSpriteFilter: () => 'none', TAU: Math.PI * 2 };
  new Script(source.slice(start, end) + '\nthis.drawEnemySprite = drawEnemySprite;').runInNewContext(sandbox);
  const b = boss(10, 0); finishActive(b, 'stomp');
  b.bossCombat.elapsed = bossRecoveryFor(b).blend * .5;
  sandbox.drawEnemySprite(b);
  assert.equal(calls.length, 1, 'blend composites into one world draw');
  assert.equal(scratchCalls.length, 2);
  assert.equal(scratchCalls[0].args[1], 9 * 128); assert.equal(scratchCalls[1].args[1], 0);
  assert.equal(scratchCalls[0].alpha, .5); assert.equal(scratchCalls[1].alpha, .5);
  assert.ok(scratchCalls.every(call => call.composite === 'lighter'));
  assert.equal(calls[0].alpha, 1);
  sandbox.drawEnemySprite(b); assert.equal(allocations, 1, 'scratch surface reused');
  calls.length = 0; b.bossCombat.elapsed = .5;
  sandbox.drawEnemySprite(b);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args[1] < 6 * 128, 'late recovery uses only the walking atlas');
  assert.equal(state.globalAlpha, 1); assert.equal(stack.length, 0);
  for (const angle of [0, Math.PI]) {
    b.bossCombat.phase = 'windup'; b.bossCombat.elapsed = .3; b.bossCombat.angle = angle;
    sandbox.drawEnemySprite(b);
    assert.equal(Math.sign(scales.at(-1)[0]), Math.cos(angle) < 0 ? -1 : 1, 'actual body mirrors toward locked skill');
  }
  assert.ok(source.includes('effectiveSpeed * (combat.movementScale ?? 1)'));
});
