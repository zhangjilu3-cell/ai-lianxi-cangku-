import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createDeveloperSession } from '../src/developer-mode.js';
const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const hurt = source.slice(source.indexOf('function hurtPlayer(amount)'), source.indexOf('\nfunction burst('));
function setup(enabled, invincible) {
  const context = {
    developerSession: { enabled, invincible },
    game: { player: { health: 100, maxHealth: 100, shield: 20, hitFlash: 0 }, combo: 10 },
    isPlayerInvulnerable: () => false,
    playerModifiers: () => ({ damageReduction: 0 }),
    absorbShieldDamage: (shield, amount) => ({ shield: Math.max(0, shield - amount), healthDamage: Math.max(0, amount - shield) }),
    ensureSound: () => () => {},
  };
  new Script(hurt + '\nthis.hurt = hurtPlayer;').runInNewContext(context);
  return context;
}
test('developer invincibility blocks shield, health and hit feedback, disabling restores damage', () => {
  const context = setup(true, true);
  for (const damage of [4, 18, 60, 1000]) context.hurt(damage);
  assert.deepEqual(context.game.player, { health: 100, maxHealth: 100, shield: 20, hitFlash: 0 });
  assert.equal(context.game.combo, 10);
  context.developerSession.invincible = false;
  context.hurt(30);
  assert.equal(context.game.player.health, 90);
  assert.equal(context.game.player.shield, 0);
  assert.equal(context.game.player.hitFlash, .24);
});
test('invincibility cannot affect ordinary mode and resets for a new session', () => {
  const context = setup(false, true);
  context.hurt(30);
  assert.equal(context.game.player.health, 90);
  assert.equal(createDeveloperSession(true).invincible, false);
  assert.equal(createDeveloperSession(false).invincible, false);
});
test('developer checkbox updates invincibility immediately without applying a wave', () => {
  const context = {
    developerSession: createDeveloperSession(true),
    developerInvincible: { checked: true, addEventListener: (_, fn) => { context.change = fn; } },
    developerStatus: {},
  };
  const start = source.indexOf('developerInvincible.addEventListener');
  new Script(source.slice(start, source.indexOf('\nfunction isInteractiveTarget', start))).runInNewContext(context);
  context.change();
  assert.equal(context.developerSession.invincible, true);
  context.developerInvincible.checked = false;
  context.change();
  assert.equal(context.developerSession.invincible, false);
  context.developerSession.enabled = false;
  context.developerInvincible.checked = true;
  context.change();
  assert.equal(context.developerSession.invincible, false);
  const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="developerInvincible" type="checkbox"/);
});
