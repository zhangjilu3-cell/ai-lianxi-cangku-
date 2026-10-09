import test from 'node:test';
import assert from 'node:assert/strict';
import { bossProfileForWave } from '../src/game-core.js';
import { beginBossMove, bossMoveFor, bossStrikeTimes, bossAttackPose, bossAnimationTime, updateBossCombat, steerBoss, bossPathClear } from '../src/boss-combat.js';
import { drawBossCombat, bossWarningProgress } from '../src/boss-effects.js';
import { resolveZombieSourceRect } from '../src/zombie-animation.js';

function boss(index) {
  const profile = bossProfileForWave(90, index);
  return { ...profile, id:index+1, kind:'boss', x:300, y:450, maxHealth:profile.health, animationTime:0 };
}
function idle(b, nextMove=0) { b.bossCombat={phase:'idle',cooldown:0,nextMove,effects:[],enraged:false}; }
function capture() {
  const calls=[],state={globalAlpha:1},stack=[];
  const ctx=new Proxy(state,{get(t,key){if(key in t)return t[key];if(key==='save')return()=>stack.push({...t});if(key==='restore')return()=>{for(const k of Object.keys(t))delete t[k];Object.assign(t,stack.pop());};return(...args)=>calls.push([key,...args]);}});
  return {ctx,calls};
}

test('damage, body strike peak, attack frame and countdown agree for all stationary equipped moves',()=>{
  for(let index=0;index<6;index++)for(const name of boss(index).bossMoves){
    const b=boss(index);beginBossMove(b,{x:550,y:450},name);
    const def=bossMoveFor(b,name);
    if(def.pattern==='dash'||def.pattern==='leap')continue;
    const times=bossStrikeTimes(b);
    updateBossCombat(b,{x:550,y:450},def.windup);
    const first=times[0];
    assert.ok(first>0);
    assert.ok(updateBossCombat(b,{x:550,y:450},first-.0001).events.every(e=>!['hit','gas','volley','summon'].includes(e.type)),name);
    assert.ok(bossWarningProgress(b.bossCombat,def,0)<1,name);
    const events=updateBossCombat(b,{x:550,y:450},.0001).events;
    assert.ok(events.some(e=>['hit','gas','volley','summon'].includes(e.type)),name);
    assert.ok(Math.abs(bossWarningProgress(b.bossCombat,def,0)-1)<1e-9,name);
    assert.ok(Math.abs(bossAnimationTime(b)-.2)<1e-8,name);
    assert.equal(resolveZombieSourceRect('attack',bossAnimationTime(b)).x,8*128,name);
    for(const v of Object.values(bossAttackPose(b)))assert.ok(Number.isFinite(v));
  }
});

test('attack sprite no longer jumps backward when windup becomes active',()=>{
  for(let index=0;index<6;index++)for(const name of boss(index).bossMoves){
    const b=boss(index);beginBossMove(b,{x:550,y:450},name);const def=bossMoveFor(b,name);
    b.bossCombat.elapsed=def.windup;const before=bossAnimationTime(b);
    b.bossCombat.phase='active';b.bossCombat.elapsed=0;
    assert.equal(bossAnimationTime(b),before,name);
  }
});

test('combo and projectile warnings persist for the next strike, then clear on recovery',()=>{
  for(const [index,name] of [[0,'slash'],[5,'barrage'],[4,'meteor']]){
    const b=boss(index);beginBossMove(b,{x:500,y:450},name);const def=bossMoveFor(b,name);
    updateBossCombat(b,{x:500,y:450},def.windup);
    updateBossCombat(b,{x:500,y:450},b.bossCombat.impactTimes[0]+.01);
    const r=capture();drawBossCombat(r.ctx,b);
    if(name==='meteor')assert.ok(r.calls.some(([kind,text])=>kind==='fillText'&&text==='2'));
    else assert.ok(r.calls.some(([kind])=>kind==='fill'),'pending danger fill');
    b.bossCombat.phase='recovery';b.bossCombat.effects=[];
    const after=capture();drawBossCombat(after.ctx,b);
    assert.ok(!after.calls.some(([kind])=>kind==='fill'),'recovery has no pending danger fill');
    assert.ok(!r.calls.some(([kind,text])=>kind==='fillText'&&/蓄力|释放中|收招/.test(text)));
  }
});

test('AI rejects a dash clipped by an off-center pillar before its target',()=>{
  const b=boss(2),target={x:600,y:450,radius:16},obstacle={x:440,y:505,rx:45,ry:35};
  assert.equal(bossPathClear(b,target,[obstacle],0),true,'center ray looks open');
  b.bossMoves=['rush'];idle(b);
  updateBossCombat(b,target,.01,false,{obstacles:[obstacle],width:1600,height:900});
  assert.equal(b.bossCombat.phase,'idle','body-wide sweep is blocked');
});

test('close-range caster chooses defensive burst and can summon behind a pillar',()=>{
  const toxic=boss(1);idle(toxic,1);
  updateBossCombat(toxic,{x:340,y:450,radius:16},.01);
  assert.equal(toxic.bossCombat.move,'toxicBurst');
  const devil=boss(5);devil.bossMoves=['summon'];idle(devil);
  updateBossCombat(devil,{x:600,y:450,radius:16},.01,false,{obstacles:[{x:450,y:450,rx:70,ry:70}]});
  assert.equal(devil.bossCombat.move,'summon');
});

test('skill cooldown survives state changes and pauses while frozen',()=>{
  const b=boss(5),target={x:600,y:450,radius:16};b.bossMoves=['barrage'];beginBossMove(b,target,'barrage');
  const def=bossMoveFor(b,'barrage');updateBossCombat(b,target,def.windup);updateBossCombat(b,target,def.active);
  const saved=b.bossCombat.moveCooldowns.barrage;
  updateBossCombat(b,target,1,true);assert.equal(b.bossCombat.moveCooldowns.barrage,saved);
  updateBossCombat(b,target,def.recovery);updateBossCombat(b,target,1.11);
  assert.equal(b.bossCombat.phase,'idle','same skill has a short independent cooldown');
  updateBossCombat(b,target,1.3);assert.equal(b.bossCombat.phase,'windup');
});

test('feint marks and lands on the locked victim location instead of missing due to pose angle',()=>{
  const b=boss(2),target={x:455,y:450};beginBossMove(b,target,'feint');
  assert.ok(Math.hypot(b.bossCombat.marks[0].x-target.x,b.bossCombat.marks[0].y-target.y)<.01);
  const def=bossMoveFor(b,'feint');updateBossCombat(b,target,def.windup);
  const events=updateBossCombat(b,{x:800,y:600},def.active).events;
  const hit=events.find(e=>e.type==='hit');assert.ok(hit);assert.ok(Math.hypot(hit.x-target.x,hit.y-target.y)<.01);
});

test('ranged Boss holds its distance without jitter and finds a clear angle around a blocking rock',()=>{
  const stable=boss(5),target={x:545,y:450,radius:16};
  for(let i=0;i<120;i++)steerBoss(stable,target,1/60,100);
  assert.equal(stable.x,300);assert.equal(stable.y,450);
  const moving=boss(5),blockedTarget={x:550,y:450,radius:16},obstacle={x:425,y:450,rx:38,ry:72};
  for(let i=0;i<600;i++){
    steerBoss(moving,blockedTarget,1/60,90,{obstacles:[obstacle],width:1600,height:900});
    assert.ok(Math.hypot((moving.x-obstacle.x)/(obstacle.rx+moving.radius),(moving.y-obstacle.y)/(obstacle.ry+moving.radius))>=.999);
  }
  assert.ok(bossPathClear(moving,blockedTarget,[obstacle],0));
  assert.ok(Math.abs(moving.y-450)>40);
});


test('every archetype rotates through all equipped skills and travels after casts at 30/60/120 Hz',()=>{
  for(const hz of [30,60,120])for(const wave of [10,90])for(let index=0;index<6;index++){
    const profile=bossProfileForWave(wave,index);
    const b={...profile,id:index+1,kind:'boss',x:650,y:450,maxHealth:profile.health};
    const target={x:800,y:450,radius:16};const seen=new Set();let travel=0,prior;
    for(let frame=0;frame<hz*90;frame++){
      const result=updateBossCombat(b,target,1/hz);
      if(b.bossCombat.phase==='windup'&&prior!=='windup')seen.add(b.bossCombat.move);
      prior=b.bossCombat.phase;
      if(!result.controlled){const x=b.x,y=b.y;steerBoss(b,target,1/hz,100*(result.movementScale??1));
        if(b.bossCombat.lastMove)travel+=Math.hypot(b.x-x,b.y-y);}
    }
    assert.deepEqual([...seen].sort(),[...b.bossMoves].sort(),`${wave}/${index}/${hz}: missing skill`);
    assert.ok(travel>150,`${wave}/${index}/${hz}: post-cast travel ${travel}`);
  }
});

test('feint body heading and landing agree on both sides near the vertical axis',()=>{
  for(const dx of [-10,10]){
    const b=boss(2),target={x:b.x+dx,y:b.y+150};beginBossMove(b,target,'feint');
    assert.equal(Math.sign(Math.cos(b.bossCombat.angle)),Math.sign(dx));
    assert.equal(Math.sign(b.bossCombat.marks[0].x-b.x),Math.sign(dx));
    const angle=b.bossCombat.angle;updateBossCombat(b,{x:b.x-dx,y:b.y+150},.1);
    assert.equal(b.bossCombat.angle,angle,'warning locks the cast direction');
  }
});


test('post-cast movement stays clear of props while tracking a moving target',()=>{
  const arena={width:1600,height:900,obstacles:[{x:660,y:360,rx:38,ry:34},{x:900,y:540,rx:70,ry:55}]};
  for(let index=0;index<6;index++){
    const b=boss(index);const casts=new Set();let unlockedTravel=0;
    for(let frame=0;frame<5400;frame++){
      const target={x:800+Math.sin(frame/360)*90,y:450+Math.sin(frame/240)*35,radius:16};
      const result=updateBossCombat(b,target,1/60,false,arena);
      if(b.bossCombat.phase==='windup')casts.add(b.bossCombat.move);
      if(!result.controlled){const x=b.x,y=b.y;steerBoss(b,target,1/60,100*(result.movementScale??1),arena);
        if(b.bossCombat.lastMove)unlockedTravel+=Math.hypot(b.x-x,b.y-y);}
      assert.ok(bossPathClear(b,b,arena.obstacles,b.radius),`${index}: body overlaps prop`);
      assert.ok(b.x>=b.radius&&b.x<=1600-b.radius&&b.y>=b.radius&&b.y<=900-b.radius);
    }
    assert.ok(casts.size>=2,`${index}: repeated single move`);
    assert.ok(unlockedTravel>200,`${index}: no post-cast pursuit`);
  }
});
