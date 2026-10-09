import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_MOVES, beginBossMove } from '../src/boss-combat.js';
import { BOSS_SKILL_GLYPHS, drawBossSkillIcon, drawBossSkillBadge, bossSkillBadgeLayout } from '../src/boss-effects.js';

function recorder() {
  const calls = [], stack = [];
  const state = { canvas: { width: 1600 }, fillStyle: 'original', strokeStyle: 'original', globalAlpha: .6,
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '12px serif', textAlign: 'center' };
  const original = { ...state };
  const ctx = new Proxy(state, { get(target, name) {
    if (name in target) return target[name];
    if (name === 'save') return () => stack.push({ ...target });
    if (name === 'restore') return () => Object.assign(target, stack.pop());
    return (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      calls.push([name, ...args]);
    };
  } });
  return { ctx, calls, stack, state, original };
}

test('every skill has distinct monochrome geometry at small and large sizes', () => {
  assert.deepEqual(Object.keys(BOSS_SKILL_GLYPHS).sort(), Object.keys(BOSS_MOVES).sort());
  const signatures = new Set();
  for (const move of Object.keys(BOSS_MOVES)) {
    for (const size of [20, 28, 56]) {
      const r = recorder(); drawBossSkillIcon(r.ctx, move, 0, 0, size, '#ffffff');
      assert.deepEqual(r.state, r.original); assert.equal(r.stack.length, 0);
      assert.ok(r.calls.length > 5 && r.calls.length < 100);
      if (size === 28) signatures.add(JSON.stringify(r.calls));
    }
  }
  assert.equal(signatures.size, Object.keys(BOSS_MOVES).length);
});

test('skill plate shows cast and release but hides recovery', () => {
  const boss = { x: 600, y: 400, radius: 40, bossArchetype: 'zombie' };
  beginBossMove(boss, { x: 700, y: 400 }, 'stomp');
  for (const phase of ['windup', 'active']) for (const elapsed of [0, .5, 20]) {
    const r = recorder(); boss.bossCombat.phase = phase; boss.bossCombat.elapsed = elapsed;
    drawBossSkillBadge(r.ctx, boss);
    const labels = r.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    assert.equal(labels[0], '撼地践踏');
    assert.match(labels[1], phase === 'windup' ? /^蓄力 · \d+\.\ds$/ : /^释放中$/);
    const progress = r.calls.filter(([name, x, y]) => name === 'fillRect' && x === 62 && y === 47).at(-1);
    assert.ok(progress[3] >= 0 && progress[3] <= 126);
    assert.deepEqual(r.state, r.original); assert.equal(r.stack.length, 0);
  }
  for (const phase of ['idle', 'recovery']) {
    boss.bossCombat.phase = phase; const r = recorder(); drawBossSkillBadge(r.ctx, boss); assert.equal(r.calls.length, 0);
  }
});

test('skill plate remains inside the viewport at both edges and above the actor', () => {
  for (const x of [0, 800, 1600]) for (const radius of [29, 84]) {
    const badge = bossSkillBadgeLayout({ x, y: 500, radius });
    assert.ok(badge.x >= 8 && badge.x + badge.width <= 1592);
    assert.ok(badge.y + badge.height <= 500 - Math.max(132, radius * 2 + 48));
  }
  assert.equal(bossSkillBadgeLayout({ x: 100, y: 0, radius: 30 }).y, 30);
});

import { drawBossCombat } from '../src/boss-effects.js';
test('combat hides all skill plates while retaining names telegraphs and impact effects', () => {
  for (const move of Object.keys(BOSS_MOVES)) for (const phase of ['windup', 'active', 'recovery', 'idle']) {
    const boss = { x: 600, y: 400, radius: 40, health: 100, bossName: '测试首领', bossArchetype: 'zombie', animationTime: 0 };
    beginBossMove(boss, { x: 750, y: 400 }, move);
    boss.bossCombat.phase = phase;
    boss.bossCombat.effects = [{ kind: 'slam', x: 600, y: 400, radius: 80, angle: 0, life: .5, maxLife: .65 }];
    const r = recorder(); drawBossCombat(r.ctx, boss);
    const texts = r.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    assert.ok(texts.includes('测试首领'));
    assert.ok(!texts.includes(BOSS_MOVES[move].name));
    assert.ok(!texts.some(text => /蓄力|释放中|收招/.test(text)));
    assert.ok(!r.calls.some(([name,x,y]) => name === 'fillRect' && x === 62 && y === 47));
    assert.ok(r.calls.some(([name]) => name === 'ellipse'), 'impact effect remains visible');
    if (phase === 'windup') assert.ok(r.calls.some(([name]) => name === 'fill' || name === 'fillRect'), 'ground warning remains visible');
    assert.deepEqual(r.state, r.original); assert.equal(r.stack.length, 0);
  }
});
