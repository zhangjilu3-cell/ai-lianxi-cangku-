import test from 'node:test';
import assert from 'node:assert/strict';
import { bossProfileForWave } from '../src/game-core.js';
import { beginBossMove, bossMoveFor, updateBossCombat } from '../src/boss-combat.js';
import { drawBossCombat, drawBossVines } from '../src/boss-effects.js';

function recorder() {
  const calls = [], stack = [], state = { globalAlpha: 1, lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', strokeStyle: '#000', fillStyle: '#000', font: '12px serif', textAlign: 'left' };
  const ctx = new Proxy(state, { get(t, key) {
    if (key in t) return t[key];
    if (key === 'save') return () => stack.push({ ...t });
    if (key === 'restore') return () => Object.assign(t, stack.pop());
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key);
      if (key === 'arc') assert.ok(args[2] >= 0);
      if (key === 'ellipse') assert.ok(args[2] >= 0 && args[3] >= 0);
      calls.push([key, ...args]);
    };
  }, set(t, key, value) {
    assert.notEqual(key, 'shadowBlur');
    if (key === 'globalAlpha') assert.ok(value >= 0 && value <= 1);
    t[key] = value; return true;
  } });
  return { ctx, calls, state, stack };
}
function makeBoss(index) {
  const profile = bossProfileForWave(90, index);
  return { ...profile, id: index + 1, kind: 'boss', x: 500, y: 450, maxHealth: profile.health, animationTime: 0 };
}

test('all 18 equipped skills render bounded deterministic effects without badges or state mutation', () => {
  let peak = 0;
  for (let index = 0; index < 6; index++) for (const move of makeBoss(index).bossMoves) {
    const boss = makeBoss(index), target = { x: 680, y: 450, radius: 16 };
    beginBossMove(boss, target, move);
    const def = bossMoveFor(boss, move), duration = def.windup + def.active + def.recovery + .8;
    for (let time = 0; time < duration; time += 1 / 30) {
      updateBossCombat(boss, target, 1 / 30);
      const before = JSON.stringify(boss), r = recorder(), original = { ...r.state };
      drawBossCombat(r.ctx, boss);
      assert.equal(JSON.stringify(boss), before);
      assert.deepEqual(r.state, original); assert.equal(r.stack.length, 0);
      assert.ok(boss.bossCombat.effects.length <= 10);
      assert.ok(!r.calls.some(([name, value]) => name === 'fillText' && /蓄力|释放中|收招/.test(value)));
      peak = Math.max(peak, r.calls.length);
      assert.ok(r.calls.length < 1800, `${move}: ${r.calls.length} calls`);
      if (time > def.windup && time < def.windup + .08) {
        const second = recorder(); drawBossCombat(second.ctx, boss); assert.deepEqual(second.calls, r.calls);
      }
    }
    assert.equal(boss.bossCombat.effects.length, 0, `${move} must clean up its effects`);
  }
  assert.ok(peak > 200, 'exercise enhanced rendering');
});

test('each boss produces distinct effect geometry even without its palette', () => {
  const signatures = new Set();
  for (let index = 0; index < 6; index++) {
    const boss = makeBoss(index);
    boss.bossCombat = { phase: 'idle', effects: [{ kind: 'slam', x: 500, y: 450, radius: 100, angle: 0, life: .4, maxLife: .65 }], enraged: false };
    const r = recorder(); drawBossCombat(r.ctx, boss); signatures.add(JSON.stringify(r.calls));
  }
  assert.equal(signatures.size, 6);
});

test('pounce emits airborne trails before one landing hit and cancels on death', () => {
  const boss = makeBoss(2), target = { x: 700, y: 450 };
  beginBossMove(boss, target, 'pounce');
  updateBossCombat(boss, target, bossMoveFor(boss, 'pounce').windup);
  const events = [];
  for (let i = 0; i < 15; i++) events.push(...updateBossCombat(boss, target, 1 / 60).events);
  assert.ok(boss.bossCombat.effects.some(effect => effect.kind === 'trail' && effect.y < boss.y));
  assert.equal(events.filter(event => event.type === 'hit').length, 0);
  for (let i = 0; i < 35; i++) events.push(...updateBossCombat(boss, target, 1 / 60).events);
  assert.equal(events.filter(event => event.type === 'hit').length, 1);
  boss.health = 0; updateBossCombat(boss, target, 1 / 60);
  assert.equal(boss.bossCombat, null);
});


test('vine variants grow distinct stems and leaves, fade cleanly and restore canvas state', () => {
  const signatures = new Set();
  for (const variant of ['toxicBurst', 'plague', 'spores']) {
    const r = recorder(), original = { ...r.state };
    drawBossVines(r.ctx, 100, 0, 1, variant); assert.equal(r.calls.length, 0);
    drawBossVines(r.ctx, 100, .65, .8, variant);
    signatures.add(JSON.stringify(r.calls));
    assert.ok(r.calls.some(([name]) => name === 'closePath'), 'leaf silhouettes');
    assert.deepEqual(r.state, original); assert.equal(r.stack.length, 0);
    const duplicate = recorder(); drawBossVines(duplicate.ctx, 100, .65, .8, variant);
    assert.deepEqual(duplicate.calls, r.calls);
    const gone = recorder(); drawBossVines(gone.ctx, 100, 1, 0, variant); assert.equal(gone.calls.length, 0);
    const late = recorder(); drawBossVines(late.ctx, 100, .9, .8, variant);
    assert.notDeepEqual(late.calls, r.calls, 'stems must grow over time');
  }
  assert.equal(signatures.size, 3);
});

test('vine impact retains the originating move after the boss selects its next skill', () => {
  const b = makeBoss(1), target = { x: 680, y: 450 };
  beginBossMove(b, target, 'spores');
  updateBossCombat(b, target, bossMoveFor(b, 'spores').windup);
  updateBossCombat(b, target, .1);
  assert.equal(b.bossCombat.effects[0].move, 'spores');
  const effects = structuredClone(b.bossCombat.effects);
  b.bossCombat.move = 'plague'; b.bossCombat.phase = 'idle';
  const first = recorder(); drawBossCombat(first.ctx, b);
  b.bossCombat.move = 'toxicBurst';
  const second = recorder(); drawBossCombat(second.ctx, b);
  assert.deepEqual(first.calls, second.calls);
  assert.deepEqual(b.bossCombat.effects, effects);
});

test('vine warnings occur at pending locked marks and disappear on recovery or death', () => {
  const b = makeBoss(1); beginBossMove(b, { x: 680, y: 450 }, 'spores');
  b.bossCombat.elapsed = 1;
  const before = JSON.stringify(b), r = recorder(); drawBossCombat(r.ctx, b);
  assert.equal(JSON.stringify(b), before);
  for (const mark of b.bossCombat.marks) assert.ok(r.calls.some(([name, x, y]) => name === 'translate' && x === mark.x && y === mark.y));
  b.bossCombat.phase = 'recovery';
  const recovery = recorder(); drawBossCombat(recovery.ctx, b);
  assert.ok(!recovery.calls.some(([name]) => name === 'lineTo'));
  b.health = 0;
  const dead = recorder(); drawBossCombat(dead.ctx, b); assert.equal(dead.calls.length, 0);
  for (const value of [NaN, Infinity, -1, 0]) {
    const invalid = recorder(); drawBossVines(invalid.ctx, value, .5); assert.equal(invalid.calls.length, 0);
  }
});


test('windup textures differ by archetype at the same danger geometry and evolve with combat time', () => {
  const signatures = new Set();
  for (let index = 0; index < 6; index++) {
    const boss = makeBoss(index);
    // Use the same attack to compare motifs independently of skill shape and color.
    beginBossMove(boss, { x: 680, y: 450 }, 'stomp');
    const def = bossMoveFor(boss, 'stomp');
    boss.bossCombat.elapsed = def.windup * .3;
    const early = recorder(); drawBossCombat(early.ctx, boss);
    boss.bossCombat.elapsed = def.windup * .9;
    const late = recorder(); drawBossCombat(late.ctx, boss);
    assert.notDeepEqual(early.calls, late.calls, 'warning must animate while charging');
    const texture = late.calls.slice(late.calls.findIndex(([name]) => name === 'clip') + 1);
    signatures.add(JSON.stringify(texture.filter(([name]) => name !== 'fillText')));
    updateBossCombat(boss, { x: 900, y: 600 }, .25, true);
    const frozen = recorder(); drawBossCombat(frozen.ctx, boss);
    assert.deepEqual(frozen.calls, late.calls, 'frozen warning must not keep animating');
    boss.bossCombat.phase = 'recovery';
    const recovery = recorder(); drawBossCombat(recovery.ctx, boss);
    assert.ok(!recovery.calls.some(([name]) => name === 'clip'), 'no windup motifs during recovery');
  }
  assert.equal(signatures.size, 6);
});

test('textured warnings clip to every danger shape and preserve the safe ring center', () => {
  for (const [index, move, count] of [[0, 'ring', 1], [0, 'slash', 1], [1, 'spores', 3],
    [2, 'rush', 1], [2, 'pounce', 1], [3, 'cross', 4], [4, 'meteor', 3], [5, 'barrage', 1]]) {
    const boss = makeBoss(index); beginBossMove(boss, { x: 680, y: 450 }, move);
    boss.bossCombat.elapsed = bossMoveFor(boss, move).windup * .8;
    const r = recorder(); drawBossCombat(r.ctx, boss);
    assert.equal(r.calls.filter(([name, rule]) => name === 'clip' && rule === 'evenodd').length, count, move);
    if (move === 'ring') {
      const clipIndex = r.calls.findIndex(([name]) => name === 'clip');
      const inner = bossMoveFor(boss, move).innerRadius;
      assert.ok(r.calls.slice(0, clipIndex).some(([name, x, y, radius, start, end, reverse]) =>
        name === 'arc' && x === 0 && y === 0 && radius === inner && reverse === true));
    }
  }
});
