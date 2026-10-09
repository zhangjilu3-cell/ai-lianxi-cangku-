import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bossProfileForWave } from '../src/game-core.js';
import { beginBossMove, bossMoveFor, bossAttackPose, bossSpriteLayers, updateBossCombat } from '../src/boss-combat.js';
import { resolveEnemyVisual, resolveZombieSourceRect, bossSpriteGroundOffset } from '../src/zombie-animation.js';

function boss(index) {const p=bossProfileForWave(90,index);return {...p,x:400,y:400,maxHealth:p.health,animationTime:.24,animationPhase:.03};}
function bodyPixels(bytes, frame) {
  const remaining=new Set();
  for(let y=0;y<128;y++)for(let x=0;x<128;x++)if(bytes[(y*1920+frame*128+x)*4+3]>180)remaining.add(y*128+x);
  let largest=[];
  while(remaining.size){
    const first=remaining.values().next().value, component=[first];remaining.delete(first);
    for(let i=0;i<component.length;i++){
      const id=component[i],x=id%128,y=Math.floor(id/128);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const nx=x+dx,ny=y+dy,next=ny*128+nx;
        if(nx>=0&&nx<128&&ny>=0&&ny<128&&remaining.delete(next))component.push(next);
      }
    }
    if(component.length>largest.length)largest=component;
  }
  return largest.map(id=>[id%128+.5,Math.floor(id/128)+1]);
}
function weights(b) {const w=Array(10).fill(0);for(const l of bossSpriteLayers(b))w[resolveZombieSourceRect(l.action,l.time).x/128]+=l.alpha;return w;}
function near(a,b) {for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<.0001,`${a} -> ${b}`);}

test('all ground casts stay planted; only the active leap can leave the floor',()=>{
  for(let index=0;index<6;index++)for(const name of boss(index).bossMoves){
    const b=boss(index);beginBossMove(b,{x:600,y:400},name);const move=bossMoveFor(b,name);
    for(const phase of ['windup','active','recovery'])for(let i=0;i<=60;i++){
      b.bossCombat.phase=phase;b.bossCombat.elapsed=move[phase]*i/60;
      const pose=bossAttackPose(b);
      if(move.pattern==='leap'&&phase==='active')assert.ok(pose.lift<=0);
      else assert.equal(pose.lift,0,`${name}/${phase}: floating`);
    }
  }
});

test('visible frame weights are continuous at entry, phase boundaries and repeated strikes',()=>{
  for(let index=0;index<6;index++)for(const name of boss(index).bossMoves){
    const b=boss(index);beginBossMove(b,{x:600,y:400},name);const move=bossMoveFor(b,name),s=b.bossCombat;
    assert.equal(weights(b)[2],1,'entry preserves walking frame');
    s.elapsed=.16-1e-7;let before=weights(b);s.elapsed=.16;near(before,weights(b));
    s.elapsed=move.windup;before=weights(b);s.phase='active';s.elapsed=0;near(before,weights(b));
    if(name==='slash'||['targets','barrage'].includes(move.pattern))for(const t of [.34,.68]){
      if(t>=move.active)continue;s.elapsed=t-1e-7;before=weights(b);s.elapsed=t;near(before,weights(b));
    }
    s.elapsed=move.active;before=weights(b);s.phase='recovery';s.elapsed=0;near(before,weights(b));
    for(const phase of ['windup','active','recovery'])for(let i=0;i<=60;i++){
      s.phase=phase;s.elapsed=move[phase]*i/60;const layers=bossSpriteLayers(b);
      assert.ok(layers.length<=2,'two-source rendering budget');
      assert.ok(Math.abs(layers.reduce((n,l)=>n+l.alpha,0)-1)<1e-9);
    }
  }
});

test('ground compensation places actual opaque atlas pixels on the floor at both facings',()=>{
  for(let index=0;index<6;index++){
    const b=boss(index),kind=b.bossArchetype,v=resolveEnemyVisual(kind);
    const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',fileURLToPath(new URL(`../public/${kind}-atlas.webp`,import.meta.url)),'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:16*1024*1024});
    assert.equal(decoded.status,0,decoded.stderr?.toString());
    const frames=Array.from({length:10},(_,f)=>bodyPixels(decoded.stdout,f));
    const floor=Math.max(...frames[0].map(p=>p[1]))/128*v.drawHeight-v.anchorY;
    for(let f=0;f<10;f++)for(const facing of [-1,1])for(const lean of [-.35,0,.35]){
      const pose={lean,lift:0,scaleX:1.13,scaleY:.85};
      const offset=bossSpriteGroundOffset(kind,{x:f*128},v,pose,facing);
      let bottom=-Infinity;
      for(const [x,y] of frames[f])bottom=Math.max(bottom,Math.sin(lean)*pose.scaleX*facing*(x/128*v.drawWidth-v.anchorX)+Math.cos(lean)*pose.scaleY*((y+offset)/128*v.drawHeight-v.anchorY));
      assert.ok(Math.abs(bottom-floor)<1e-7,`${kind}/${f}: foot moved ${bottom-floor}`);
      assert.ok(Math.abs(offset)<64,'padded blend surface must contain shifted frame');
    }
  }
});


test('recovery-to-walk removes spawn phase offset instead of jumping to another walk pose',()=>{
  for(let i=0;i<6;i++){
    const b=boss(i);b.animationPhase=.37;const target={x:550,y:400};
    beginBossMove(b,target,b.bossMoves[0]);const m=bossMoveFor(b,b.bossMoves[0]);
    b.bossCombat.phase='recovery';b.bossCombat.elapsed=m.recovery-.000001;
    const before=bossSpriteLayers(b)[0];
    updateBossCombat(b,target,.000001);
    assert.equal(b.bossCombat.phase,'idle');assert.equal(b.animationPhase,0);
    assert.ok(Math.abs(b.animationTime-before.time-.000001)<1e-8,'walk clock stays continuous across the boundary');
  }
});


test('finishing the pose blend cannot restore a stale facing from before the cast',()=>{
  for(const direction of [-1,1]){
    const b=boss(0);b.bossFacing=-direction;
    beginBossMove(b,{x:b.x+direction*100,y:b.y},'stomp');
    assert.equal(b.bossFacing,direction);
    b.bossCombat.phase='recovery';b.bossCombat.elapsed=.3;
    assert.equal(Math.abs(bossAttackPose(b).lean),0);
    assert.equal(b.bossFacing,direction,'hold cast facing until actual locomotion changes direction');
  }
});
