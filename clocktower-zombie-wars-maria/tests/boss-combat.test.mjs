import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_MOVES, beginBossMove, updateBossCombat, bossStrikeTouches, bossAttackPose } from '../src/boss-combat.js';
import { drawBossCombat, drawBossShockwave } from '../src/boss-effects.js';
const boss=()=>({id:1,kind:'boss',x:300,y:300,health:2400,maxHealth:2400,radius:58,animationTime:0});
const target={x:600,y:300,radius:16};
function run(b,seconds,dt=1/60){const events=[];for(let t=0;t<seconds-1e-7;t+=dt)events.push(...updateBossCombat(b,target,dt).events);return events;}
for(const move of Object.keys(BOSS_MOVES))test(move+' telegraphs without damage then recovers',()=>{
 const b=boss();beginBossMove(b,target,move);const def=BOSS_MOVES[move];
 assert.equal(run(b,def.windup-.1).some(e=>['hit','wave','summon','gas','volley'].includes(e.type)),false);
 const events=run(b,.2+def.active+def.recovery+.1);
 assert.equal(b.bossCombat.phase,'idle');assert.ok(events.some(e=>e.type==='attack'));
 assert.ok(events.some(e=>e.type===({summon:'summon',toxicBurst:'gas',plague:'gas',spores:'gas',volley:'volley',barrage:'volley',orbit:'volley'}[move]??'hit')));
});
test('target direction stays locked after the warning starts',()=>{
 const b=boss();beginBossMove(b,target,'charge');const angle=b.bossCombat.angle;
 for(let i=0;i<100;i++)updateBossCombat(b,{x:0,y:0},1/60);
 assert.equal(b.bossCombat.angle,angle);assert.equal(b.y,300);assert.ok(b.x>300);
});
test('dash is frame-rate independent and swept collision catches crossing targets',()=>{
 const positions=[];
 for(const dt of [1/30,1/60,1/120]){const b=boss();beginBossMove(b,target,'charge');run(b,2.5,dt);positions.push(b.x);}
 for(const x of positions)assert.ok(Math.abs(x-(300+590*.64))<.001);
 assert.equal(bossStrikeTouches({shape:'capsule',x:0,y:0,endX:400,endY:0,radius:42},{x:200,y:30,radius:16}),true);
 assert.equal(bossStrikeTouches({shape:'capsule',x:0,y:0,endX:400,endY:0,radius:42},{x:200,y:90,radius:16}),false);
});
test('fan attacks respect front arc, reach and target body radius',()=>{
 const hit={shape:'sector',x:0,y:0,angle:0,radius:168,halfAngle:1.05};
 assert.equal(bossStrikeTouches(hit,{x:120,y:0,radius:16}),true);
 assert.equal(bossStrikeTouches(hit,{x:-120,y:0,radius:16}),false);
 assert.equal(bossStrikeTouches(hit,{x:200,y:0,radius:16}),false);
 assert.equal(bossStrikeTouches(hit,{x:175,y:0,radius:16}),true);
});
test('rage triggers once and upgrades the next combo to three strikes',()=>{
 const normal=boss();beginBossMove(normal,target,'slash');assert.equal(run(normal,2.5).filter(e=>e.type==='hit').length,2);
 const b=boss();b.health=1200;beginBossMove(b,target,'slash');const events=run(b,2.5);
 assert.equal(events.filter(e=>e.type==='hit').length,3);assert.equal(events.filter(e=>e.type==='rage').length,1);
 assert.equal(run(b,.5).filter(e=>e.type==='rage').length,0);
});
test('freeze pauses casts; death cancels pending strikes',()=>{
 const b=boss();beginBossMove(b,target,'slam');updateBossCombat(b,target,.6);const elapsed=b.bossCombat.elapsed;
 assert.equal(updateBossCombat(b,target,2,true).events.length,0);assert.equal(b.bossCombat.elapsed,elapsed);
 b.health=0;assert.deepEqual(updateBossCombat(b,target,1).events,[]);assert.equal(b.bossCombat,null);
});
test('rotation includes every move and effects remain bounded',()=>{
 const b=boss(),moves=new Set();for(let i=0;i<3600;i++){updateBossCombat(b,target,1/60);if(b.bossCombat.move)moves.add(b.bossCombat.move);assert.ok(b.bossCombat.effects.length<=10);}
 assert.equal(moves.size,4);
});
test('telegraphs and particles restore canvas state and avoid blur',()=>{
 const state={globalAlpha:.7,lineWidth:2,lineCap:'butt',lineJoin:'miter',strokeStyle:'original',fillStyle:'original',font:'12px serif',textAlign:'left'},saved=[],calls=[];
 const ctx=new Proxy(state,{get(t,k){if(k in t)return t[k];if(k==='save')return()=>saved.push({...t});if(k==='restore')return()=>Object.assign(t,saved.pop());return(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push(k);};},set(t,k,v){assert.notEqual(k,'shadowBlur');if(k==='globalAlpha')assert.ok(v>=0&&v<=1);t[k]=v;return true;}});
 const original={...state};
 for(const name of Object.keys(BOSS_MOVES)){
  const b=boss();b.health=1000;beginBossMove(b,target,name);
  for(let i=0;i<210;i++){updateBossCombat(b,target,1/60);calls.length=0;drawBossCombat(ctx,b);assert.ok(calls.length<1800);assert.deepEqual(state,original);for(const v of Object.values(bossAttackPose(b)))assert.ok(Number.isFinite(v));}
 }
 drawBossShockwave(ctx,{x:0,y:0,radius:180,life:.5,maxLife:1});assert.deepEqual(state,original);assert.equal(saved.length,0);
});
