import test from 'node:test';
import assert from 'node:assert/strict';
import { bossProfileForWave, bossProfilesForWave, buildWave, enemyStats } from '../src/game-core.js';
import { updateBossCombat } from '../src/boss-combat.js';
import { drawBossCombat } from '../src/boss-effects.js';
const kinds=['zombie','toxic','runner','brute','exploder','devil'];
test('first six boss waves gain weapon-scaled health while retaining each archetype contribution',()=>{
 for(let i=0;i<6;i++){
  const wave=(i+1)*10,p=bossProfileForWave(wave),base=enemyStats[kinds[i]];
  assert.equal(p.bossArchetype,kinds[i]);assert.equal(p.health,Math.ceil((2650+i*500+(base.health+wave*(i===0?2:1))*2)/50)*50);
  assert.equal(p.bossScale,1.8);assert.equal(p.radius,base.radius*1.8);assert.equal(p.bossRageAllowed,false);
  assert.equal(buildWave(wave).filter(k=>k==='boss').length,1);
 }
});
test('early bosses have distinct skill pairs while retaining health and poison balance',()=>{
 const first=bossProfileForWave(10),second=bossProfileForWave(20);
 assert.deepEqual(first.bossMoves,['slash','stomp']);assert.equal(first.bossSlashCount,1);assert.equal(first.health,2800);
 assert.equal(second.health,3350);assert.equal(second.gasRadius,164);assert.ok(second.speed<enemyStats.toxic.speed);
 assert.ok(first.health>7*9*42 && first.health<=8*9*42);
 assert.deepEqual(second.bossMoves,['toxicBurst','plague']);
});
test('70/80/90 and later boss waves choose two different random archetypes',()=>{
 const pairs=new Set();
 for(const wave of [70,80,90,100,160])for(let a=0;a<6;a++)for(let b=0;b<5;b++){
  let call=0;const p=bossProfilesForWave(wave,()=>call++===0?(a+.1)/6:(b+.1)/5);
  assert.equal(p.length,2);assert.notEqual(p[0].bossArchetype,p[1].bossArchetype);
  for(const boss of p){const base=enemyStats[boss.bossArchetype];assert.equal(boss.health,Math.ceil((2650+(wave/10-1)*500+(base.health+wave*(boss.bossArchetype==='zombie'?2:1))*2)/50)*50);}
  assert.equal(buildWave(wave).filter(k=>k==='boss').length,2);
  pairs.add(p.map(v=>v.bossArchetype).sort().join('+'));
 }
 assert.equal(pairs.size,15);
 assert.equal(buildWave(71).includes('boss'),false);
});
test('each boss uses only its archetype moves and early bosses do not enrage',()=>{
 for(let i=0;i<6;i++){
  const p=bossProfileForWave((i+1)*10),b={...p,kind:'boss',x:300,y:300,maxHealth:p.health,health:p.health*.4};
  const moves=new Set();let rage=false;
  for(let t=0;t<3000;t++){const result=updateBossCombat(b,{x:b.x+40,y:b.y},1/60);rage ||= result.events.some(e=>e.type==='rage');if(b.bossCombat.move)moves.add(b.bossCombat.move);}
  assert.deepEqual([...moves].sort(),[...p.bossMoves].sort());assert.equal(rage,false);
 }
});

import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
test('paired boss spawn waits for two slots and emits both in the same update',()=>{
 const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
 const start=source.indexOf('function updateWave(dt)');const end=source.indexOf('\nfunction ',start+1);
 const game={wave:70,waveQueue:['boss','boss'],spawnTimer:0,enemies:[{kind:'zombie'}]};
 const scope={game,developerSession:{enabled:false},getEnemySpawnLimit:()=>2,spawnEnemy:kind=>game.enemies.push({kind})};
 new Script(source.slice(start,end)+'\nthis.tick=updateWave').runInNewContext(scope);
 scope.tick(.1);assert.equal(game.waveQueue.length,2);assert.equal(game.enemies.length,1);
 game.enemies=[];scope.tick(.1);assert.equal(game.waveQueue.length,0);assert.deepEqual(game.enemies.map(e=>e.kind),['boss','boss']);
});

test('boss keeps its name overhead without an individual health bar',()=>{
 const calls=[];
 const ctx={save(){},restore(){},fillText(...args){calls.push(['text',...args]);},fillRect(...args){calls.push(['rect',...args]);}};
 drawBossCombat(ctx,{bossName:'巨型行尸',health:1400,maxHealth:2800,x:300,y:300,radius:29,bossCombat:{phase:'idle',effects:[],enraged:false}});
 assert.equal(calls.filter(([kind])=>kind==='text').length,1);
 assert.equal(calls.filter(([kind])=>kind==='rect').length,0);
});