import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bossProfileForWave} from '../src/game-core.js';
import {advanceBossLocomotion,bossAnimationTime,bossAttackPose,bossSpriteLayers,beginBossMove,bossMoveFor,bossRecoveryFor,updateBossCombat,BOSS_LOCOMOTION} from '../src/boss-combat.js';
function boss(i){const p=bossProfileForWave(90,i);return {...p,x:400,y:400,maxHealth:p.health,animationTime:999};}

test('six silhouettes have distinct strides and frame-rate independent distance clocks',()=>{
 assert.equal(new Set(Object.values(BOSS_LOCOMOTION).map(p=>p[0])).size,6);
 for(let i=0;i<6;i++){
  const result=[];
  for(const hz of [30,60,120]){
   const b=boss(i);for(let f=0;f<hz;f++)advanceBossLocomotion(b,60/hz,0,1/hz);
   result.push(b.bossLocomotion);assert.ok(Math.abs(bossAttackPose(b).lean)<=.055);assert.equal(bossAttackPose(b).lift,0);
  }
  for(const r of result){assert.ok(Math.abs(r.time-result[0].time)<1e-9);assert.ok(Math.abs(r.blend-result[0].blend)<1e-9);}
 }
});

test('stopping settles the feet once instead of playing a walk loop in place',()=>{
 const b=boss(2);advanceBossLocomotion(b,35,0,.3);
 for(let f=0;f<120;f++)advanceBossLocomotion(b,0,0,1/60);
 assert.equal(b.bossLocomotion.time,0);assert.equal(b.bossLocomotion.blend,0);assert.equal(bossAnimationTime(b),0);
 assert.equal(bossSpriteLayers(b)[0].time,0);
});

test('freeze holds motion exactly and skill displacement never counts as walking',()=>{
 const b=boss(3);advanceBossLocomotion(b,20,0,.2);const before=structuredClone(b.bossLocomotion);
 advanceBossLocomotion(b,300,50,1,true,true);assert.deepEqual(b.bossLocomotion,before);
 advanceBossLocomotion(b,300,50,.2,true);assert.equal(b.bossLocomotion.time,before.time);
 const saved=structuredClone(b.bossLocomotion);advanceBossLocomotion(b,NaN,0,.1);assert.deepEqual(b.bossLocomotion,saved);
});

test('travel posture blends into casting and recovery shares the same gait clock',()=>{
 for(let i=0;i<6;i++){
  const b=boss(i);advanceBossLocomotion(b,-20,0,.2);const before=bossAttackPose(b);
  beginBossMove(b,{x:300,y:400},b.bossMoves[0]);assert.deepEqual(bossAttackPose(b),before);
  const m=bossMoveFor(b,b.bossMoves[0]);b.bossCombat.phase='recovery';b.bossCombat.elapsed=bossRecoveryFor(b).blend;
  assert.ok(Math.abs(bossAttackPose(b).lean-before.lean)<1e-9);assert.equal(bossSpriteLayers(b)[0].time,b.bossLocomotion.time);
  b.bossCombat.elapsed=m.recovery;updateBossCombat(b,{x:300,y:400},.001);
  assert.equal(bossAnimationTime(b),b.bossLocomotion.time);assert.equal(b.animationPhase,0);
 }
});

test('actual enemy update samples movement after collision and passes freeze and skill control',async()=>{
 const source=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
 assert.match(source,/resolveStaticCollision\(enemy\);\s+advanceBossLocomotion\(enemy, enemy.x - gaitStartX, enemy.y - gaitStartY, dt, combat.controlled, frozen \|\| bound\)/);
 assert.match(source,/action === "walk" && !entity.bossLocomotion/);
});
