import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { advanceRicochetProjectile } from '../src/weapon-effects.js';

const shot = (overrides = {}) => ({ x: 100, y: 450, vx: 1000, vy: 0, radius: 7, life: 6, bounces: 8, ...overrides });
function run(bullet, dt, obstacles = [], enemies = []) {
  const hits = [];
  advanceRicochetProjectile(bullet, dt, { width: 1600, height: 900, obstacles, enemies }, hit => {
    hits.push(hit); if (--bullet.bounces < 0) bullet.life = 0;
  });
  return hits;
}

test('swept ricochet hits a monster crossed completely during one update', () => {
  const b = shot(), enemy = { x: 200, y: 450, radius: 16, health: 100 };
  const hits = run(b, .2, [], [enemy]);
  assert.equal(hits.length, 1); assert.equal(hits[0].object, enemy);
  assert.equal(hits[0].x, 177); assert.equal(b.vx, -1000);
  assert.ok(Math.abs(b.x - 53.95) < .001);
});

test('rocks and pillars reflect before a monster behind them and preserve speed', () => {
  for (const [rx, ry] of [[105, 55], [38, 34]]) {
    const obstacle = { x: 280, y: 450, rx, ry }, b = shot();
    const hits = run(b, .18, [obstacle], [{ x: 340, y: 450, radius: 16, health: 100 }]);
    assert.equal(hits[0].type, 'obstacle'); assert.equal(hits[0].object, obstacle);
    assert.equal(hits.some(hit => hit.type === 'enemy'), false);
    assert.equal(Math.hypot(b.vx, b.vy), 1000);
  }
  const b = shot({ y: 420 }), obstacle = { x: 280, y: 450, rx: 100, ry: 55 };
  run(b, .16, [obstacle]);
  assert.ok(b.vy < 0); assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 1000) < 1e-8);
});

test('multiple contacts use remaining frame travel and agree across frame rates', () => {
  const positions = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const b = shot({ x: 90, vx: 900, bounces: 100 });
    for (let i = 0; i < Math.round(.5 / dt); i++) run(b, dt, [{ x: 200, y: 450, rx: 30, ry: 80 }]);
    positions.push([b.x, b.vx, b.bounces]);
  }
  for (const p of positions) { assert.ok(Math.abs(p[0] - positions[0][0]) < .001); assert.deepEqual(p.slice(1), positions[0].slice(1)); }
});

test('homing cannot immediately redirect into the contacted surface', () => {
  const b = shot(); let count = 0;
  advanceRicochetProjectile(b, .1, { width: 1600, height: 900, enemies: [{ x: 200, y: 450, radius: 16, health: 100 }] }, () => {
    count++; b.vx = 1000; b.vy = 0;
  });
  assert.equal(count, 1); assert.equal(b.vx, -1000);
});

test('dead targets are ignored, corner consumes one bounce, and exhausted shots stop', () => {
  const b = shot(); assert.equal(run(b, .1, [], [{ x: 150, y: 450, radius: 20, health: 0 }]).length, 0);
  const corner = shot({ x: 1583, y: 883, vx: 100, vy: 100 });
  assert.equal(run(corner, .2).length, 1); assert.equal(corner.vx, -100); assert.equal(corner.vy, -100);
  const exhausted = shot({ bounces: 0 }); const hits = run(exhausted, 1, [{ x: 200, y: 450, rx: 30, ry: 40 }]);
  assert.equal(hits.length, 1); assert.equal(exhausted.life, 0);
});

test('flame damage never restarts hurt animation while other weapons retain feedback', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const start = source.indexOf('function damageEnemy('), end = source.indexOf('\nfunction playerBulletDamage(', start);
  const calls = [], sandbox = { triggerEnemyHurt: (...args) => calls.push(args) };
  new Script(source.slice(start, end) + '\nthis.hit = damageEnemy;').runInNewContext(sandbox);
  const enemy = { health: 1000, animationTime: 7, hurtAnimation: 0, hitFlash: 0 };
  for (let i = 0; i < 20; i++) sandbox.hit(enemy, 12, 'flamethrower', .05);
  assert.equal(enemy.health, 760); assert.equal(enemy.animationTime, 7); assert.equal(enemy.hurtAnimation, 0); assert.equal(enemy.hitFlash, 0); assert.equal(enemy.flameHitFlash, .12);
  assert.equal(calls.length, 0); sandbox.hit(enemy, 10, 'pistol', .08); assert.equal(calls.length, 1);
});

test('flame red tint expires independently and does not select a hurt action', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const start = source.indexOf('  context.filter = entity.flameHitFlash > 0');
  assert.ok(start >= 0);
  const expression = source.slice(start, source.indexOf(';', start) + 1);
  const entity = { flameHitFlash: .12, hitFlash: 0, hurtAnimation: 0, animationTime: 7 };
  const sandbox = { entity, enemy: entity, dt: .06, context: {}, freezeSpriteFilter: () => 'none' };
  const render = new Script(expression);
  render.runInNewContext(sandbox);
  assert.equal(sandbox.context.filter, 'sepia(1) saturate(7) hue-rotate(-45deg)');
  const tick = new Script(source.match(/enemy\.flameHitFlash = Math\.max\(0, \(enemy\.flameHitFlash \?\? 0\) - dt\);/)[0]);
  tick.runInNewContext(sandbox); tick.runInNewContext(sandbox);
  render.runInNewContext(sandbox);
  assert.equal(entity.flameHitFlash, 0); assert.equal(sandbox.context.filter, 'none');
  assert.equal(entity.animationTime, 7); assert.equal(entity.hurtAnimation, 0); assert.equal(entity.hitFlash, 0);
  entity.hitFlash = .08; render.runInNewContext(sandbox);
  assert.equal(sandbox.context.filter, 'brightness(1.75) saturate(.7)');
});
