import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { consumeWaveEnhancement } from '../src/random-wave-enhancements.js';
import { createToxicGasTrailState } from '../src/toxic-gas-trail.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { bossProfileForWave, bossProfilesForWave, enemyStats, ARENA_PILLARS, WIDTH, HEIGHT } from '../src/game-core.js';
import { steerBoss, bossPathClear, chooseBossSpawnPosition, findBossFreePosition, resolveBossPosition } from '../src/boss-combat.js';

const obstacles = [
  ...ARENA_PILLARS.map(p => ({ ...p, type: 'pillar' })),
  { x:170, y:170, rx:105, ry:55, type:'rock' },
  { x:1430, y:720, rx:105, ry:62, type:'rock' },
  { x:1290, y:155, rx:34, ry:30, type:'tree' },
  { x:260, y:735, rx:34, ry:30, type:'tree' },
  { x:1100, y:610, rx:24, ry:24, type:'grave' },
  { x:450, y:300, rx:24, ry:24, type:'grave' },
  { x:760, y:170, rx:24, ry:24, type:'grave' },
  { x:830, y:750, rx:34, ry:30, type:'tree' },
];
const arena={obstacles,width:WIDTH,height:HEIGHT};
function boss(index, x, y, wave=90) {
 const p=bossProfileForWave(wave,index);
 return {...p,id:index+1,kind:'boss',x,y,maxHealth:p.health};
}
function clear(b, scene=arena) {
 assert.ok(b.x>=b.radius && b.x<=scene.width-b.radius, `x outside: ${b.x}`);
 assert.ok(b.y>=b.radius && b.y<=scene.height-b.radius, `y outside: ${b.y}`);
 assert.ok(bossPathClear(b,b,scene.obstacles,b.radius+2),'body overlaps model');
}

test('large boss escapes the rock/wall pocket instead of being pushed out every frame',()=>{
 const b=boss(3,42,170),target={x:800,y:450,radius:16};
 for(let i=0;i<600;i++){steerBoss(b,target,1/60,110,arena);clear(b);}
 assert.ok(Math.hypot(b.x-target.x,b.y-target.y)<350,'must make progress out of pocket');
});

test('melee boss reaches a player hugging the far side of a rock instead of choosing a blocked goal',()=>{
 const scene={obstacles:[{x:430,y:450,rx:100,ry:85}],width:WIDTH,height:HEIGHT};
 const b=boss(0,200,450),target={x:550,y:450,radius:16};
 for(let i=0;i<900;i++){steerBoss(b,target,1/60,110,scene);clear(b,scene);}
 assert.ok(b.x>550,'should route around the rock to a reachable attack side');
 assert.ok(Math.hypot(b.x-target.x,b.y-target.y)<95,'must reach melee distance');
});


test('six boss sizes across waves 10-90 spawn clear of every model on all four edges',()=>{
 for(const wave of [10,20,30,40,50,60,70,80,90]) for(let i=0;i<6;i++) {
  const requests=[{x:0,y:42},{x:170,y:42},{x:430,y:42},{x:760,y:42},
   {x:1558,y:155},{x:1558,y:720},{x:1430,y:858},{x:830,y:858},
   {x:42,y:170},{x:42,y:735}];
  for(const request of requests) {
   const b=boss(i,request.x,request.y,wave),point=chooseBossSpawnPosition(b,request,arena);
   assert.ok(point, `${wave}/${i} must have a safe entry`);Object.assign(b,point);clear(b);
   assert.ok(bossPathClear(b,b,obstacles,b.radius+12));
   assert.deepEqual(chooseBossSpawnPosition(b,request,arena),point,'deterministic placement');
  }
 }
});

test('paired bosses do not overlap and each has a route into the arena',()=>{
 for(let i=0;i<6;i++)for(let j=i+1;j<6;j++) {
  const first=boss(i,42,170),second=boss(j,42,170),request={x:42,y:170};
  Object.assign(first,chooseBossSpawnPosition(first,request,arena));
  Object.assign(second,chooseBossSpawnPosition(second,request,{...arena,enemies:[first]}));
  clear(first);clear(second);
  assert.ok(Math.hypot(first.x-second.x,first.y-second.y)>=first.radius+second.radius+24);
  for(const b of [first,second]) {
   const initial=Math.hypot(b.x-800,b.y-450);
   for(let frame=0;frame<300;frame++){steerBoss(b,{x:800,y:450,radius:16},1/60,110,arena);clear(b);}
   assert.ok(Math.hypot(b.x-800,b.y-450)<initial-80);
  }
 }
});

test('all bosses recover from the center of every scene model without leaving bounds or entering another model',()=>{
 for(let i=0;i<6;i++)for(const obstacle of obstacles) {
  const b=boss(i,obstacle.x,obstacle.y);
  const point=findBossFreePosition(b,b,arena);assert.ok(point);Object.assign(b,point);clear(b);
  const saved={x:b.x,y:b.y};assert.equal(resolveBossPosition(b,arena),false);
  assert.deepEqual({x:b.x,y:b.y},saved,'already free positions must not jitter');
 }
 const scene={width:400,height:320,obstacles:[{x:55,y:160,rx:70,ry:65},{x:150,y:160,rx:65,ry:70}]};
 const b=boss(3,55,160);assert.equal(resolveBossPosition(b,scene),true);clear(b,scene);
});

test('largest body at both rock/wall pockets stays mobile at 30/60/120Hz',()=>{
 for(const dt of [1/30,1/60,1/120])for(const position of [{x:42,y:170},{x:1558,y:720}]) {
  const b=boss(3,position.x,position.y),target={x:800,y:450,radius:16};
  for(let time=0;time<10;time+=dt){steerBoss(b,target,dt,110,arena);clear(b);}
  assert.ok(Math.hypot(b.x-target.x,b.y-target.y)<180);
 }
});

async function runtime(scene, wave=90) {
 const source=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
 const spawn=source.slice(source.indexOf('function spawnEnemy('),source.indexOf('function updatePlayer('));
 const collision=source.slice(source.indexOf('function resolveStaticCollision('),source.indexOf('function resolvePlayerCollision('));
 const waveCode=source.slice(source.indexOf('function updateWave('),source.indexOf('\nfunction ',source.indexOf('function updateWave(')+1));
 // updateWave's early queued branch runs before any later-wave helpers.
 const game={wave,nextId:1,enemies:[],waveQueue:['boss','boss'],spawnTimer:0,waveEnhancements:[],
  bossRosterWave:wave,bossRoster:[bossProfileForWave(wave,0),bossProfileForWave(wave,3)],bossRosterIndex:0};
 const math=Object.create(Math);math.random=()=>0;
 const sandbox={game,WIDTH,HEIGHT,enemyStats,bossProfilesForWave,chooseBossSpawnPosition,resolveBossPosition,
  consumeWaveEnhancement,createToxicGasTrailState,Math:math,staticObstacles:scene.obstacles,
  getEnemySpawnLimit:()=>4,developerSession:{enabled:true},tankTrialSession:{active:false}};
 new Script(spawn+collision+waveCode+'\nthis.api={spawnEnemy,resolveStaticCollision,updateWave};').runInNewContext(sandbox);
 return {sandbox,game,...sandbox.api};
}

test('real Boss spawn and static collision use profile radius and safe placement',async()=>{
 const r=await runtime(arena);
 r.spawnEnemy('boss');r.spawnEnemy('boss');assert.equal(r.game.enemies.length,2);
 for(const b of r.game.enemies)clear(b);
 assert.ok(Math.hypot(r.game.enemies[0].x-r.game.enemies[1].x,r.game.enemies[0].y-r.game.enemies[1].y)>
  r.game.enemies[0].radius+r.game.enemies[1].radius);
 const b=r.game.enemies[1];b.x=170;b.y=170;r.resolveStaticCollision(b);clear(b);
});

test('no free spawn defers the queue without consuming Boss identity then retries successfully',async()=>{
 const blocked={obstacles:[{x:800,y:450,rx:2000,ry:2000}],width:WIDTH,height:HEIGHT};
 const r=await runtime(blocked);
 assert.equal(chooseBossSpawnPosition(boss(3,42,170),{x:42,y:170},blocked),null);
 assert.equal(r.updateWave(.1),'active');
 assert.deepEqual([...r.game.waveQueue],['boss','boss']);
 assert.equal(r.game.bossRosterIndex,0);assert.equal(r.game.nextId,1);assert.equal(r.game.enemies.length,0);
 r.sandbox.staticObstacles=[];r.game.spawnTimer=0;r.updateWave(.1);
 assert.equal(r.game.waveQueue.length,0);assert.equal(r.game.enemies.length,2);
 assert.equal(r.game.bossRosterIndex,2);assert.equal(r.game.enemies[0].bossArchetype,'zombie');assert.equal(r.game.enemies[1].bossArchetype,'brute');
});
