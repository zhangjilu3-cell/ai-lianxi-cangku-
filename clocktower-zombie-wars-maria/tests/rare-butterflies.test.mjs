import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGameState,rollRareButterfly,createRareButterfly,grantButterflyBuff,butterflyDamageMultiplier,butterflySpeedMultiplier,weapons} from '../src/game-core.js';
import {ensureTrainingDummy,recordTrainingDamage} from '../src/training-dummy.js';

test('each butterfly has a 0.1 percent independent color range',()=>{
 assert.equal(rollRareButterfly(()=>0),'blue');assert.equal(rollRareButterfly(()=>.000999),'blue');
 assert.equal(rollRareButterfly(()=>.001),'yellow');assert.equal(rollRareButterfly(()=>.001999),'yellow');
 for(const v of [.002,.5,1,-1,NaN])assert.equal(rollRareButterfly(()=>v),null);
});
test('buffs coexist for ten seconds, refresh instead of stacking and reset with new game',()=>{
 const p=createGameState().player;grantButterflyBuff(p,'blue',20);grantButterflyBuff(p,'yellow',23);
 assert.equal(butterflyDamageMultiplier(p,29.999,'pistol'),2);assert.equal(butterflyDamageMultiplier(p,30,'pistol'),1);
 assert.equal(butterflySpeedMultiplier(p,32.999),1.5);assert.equal(butterflySpeedMultiplier(p,33),1);
 grantButterflyBuff(p,'blue',25);assert.equal(p.butterflyDamageUntil,35);assert.equal(butterflyDamageMultiplier(p,31,'rocket'),2);
 assert.equal(createGameState().player.butterflyDamageUntil,0);
 for(const source of ['enemy-exploder','spike-trap',undefined])assert.equal(butterflyDamageMultiplier(p,26,source),1);
});
test('all player weapon damage including training DPS doubles once at impact',async()=>{
 const source=await readFile(new URL('../src/game.js',import.meta.url),'utf8');const start=source.indexOf('function damageEnemy(');const fn=source.slice(start,source.indexOf('\nfunction ',start+1));
 const game=createGameState();game.time=2;grantButterflyBuff(game.player,'blue',2);
 const hit=new Function('game','weapons','butterflyDamageMultiplier','recordTrainingDamage','triggerEnemyHurt',fn+';return damageEnemy;')(game,weapons,butterflyDamageMultiplier,recordTrainingDamage,()=>{});
 for(const weapon of weapons){const e={health:1000};hit(e,32,weapon.id,0);assert.equal(e.health,936);}
 const dummy=ensureTrainingDummy(game);hit(dummy,32,'pistol',0);assert.equal(dummy.damageStats.last,64);
 game.time=12;hit(dummy,32,'pistol',0);assert.equal(dummy.damageStats.last,32);
 const butterfly=createRareButterfly(99,'blue',100,100,0);assert.equal(hit(butterfly,100,'enemy-exploder',0),false);assert.equal(butterfly.health,1);
 assert.equal(hit(butterfly,1,'pistol',0),true);assert.equal(butterfly.health,0);
});
test('training dummy reset retains live butterflies for shooting and drops expired targets',()=>{
 const game=createGameState();const butterfly=createRareButterfly(99,'yellow',100,100,0);game.enemies.push(butterfly);ensureTrainingDummy(game);
 assert.ok(game.enemies.includes(butterfly));assert.equal(butterfly.expiresAt,14);assert.equal(butterfly.damage,0);
 butterfly.health=0;ensureTrainingDummy(game);assert.equal(game.enemies.length,1);
});
