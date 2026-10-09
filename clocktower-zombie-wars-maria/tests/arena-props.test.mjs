import test from 'node:test';
import assert from 'node:assert/strict';
import {paintArenaObstacle} from '../src/arena-props.js';
function recorder(){const calls=[],stack=[],state={fillStyle:'original',strokeStyle:'original',lineWidth:3,lineCap:'butt',lineJoin:'miter'};const ctx=new Proxy(state,{get(t,k){if(k in t)return t[k];if(k==='save')return()=>stack.push({...t});if(k==='restore')return()=>Object.assign(t,stack.pop());if(k==='createLinearGradient')return()=>({addColorStop(){}});return(...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push([k,...args]);};},set(t,k,v){assert.ok(!['filter','shadowBlur'].includes(k));t[k]=v;return true;}});return{ctx,calls,state,stack};}
test('detailed props are deterministic, finite and preserve canvas and collision state',()=>{
 for(const type of ['pillar','rock','tree','grave']){const o={type,x:430,y:230,rx:type==='rock'?105:38,ry:34};const initial=JSON.stringify(o);const a=recorder(),b=recorder(),saved={...a.state};paintArenaObstacle(a.ctx,o);paintArenaObstacle(b.ctx,o);assert.deepEqual(a.calls,b.calls);assert.deepEqual(a.state,saved);assert.equal(a.stack.length,0);assert.equal(JSON.stringify(o),initial);assert.ok(a.calls.length<1800);}
});
test('preparation caches props so subsequent frames use only image draws',async()=>{
 const oldDoc=globalThis.document,oldImage=globalThis.Image;let canvases=0,draws=0;
 globalThis.document={createElement(){canvases++;return{width:0,height:0,getContext:()=>recorder().ctx,toDataURL:()=> 'data:image/png;base64,test'};}};
 globalThis.Image=class{set src(v){queueMicrotask(()=>this.onload());}};
 try{const {prepareArenaObstacles,drawArenaObstacle}=await import('../src/arena-props.js?cache-test');const objects=[{type:'pillar',x:100,y:100,rx:38,ry:34},{type:'tree',x:300,y:200,rx:34,ry:30}];await prepareArenaObstacles(objects);await prepareArenaObstacles(objects);assert.equal(canvases,2);const ctx={drawImage(image,...args){assert.ok(image instanceof Image);for(const n of args)assert.ok(Number.isFinite(n));draws++;}};for(let i=0;i<100;i++)for(const o of objects)drawArenaObstacle(ctx,o);assert.equal(canvases,2);assert.equal(draws,200);}finally{if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;}
});

test('opposite arena rocks have distinct raised silhouettes and clipped surface detail', () => {
  const left = { type: 'rock', x: 170, y: 170, rx: 105, ry: 55 };
  const right = { type: 'rock', x: 1430, y: 720, rx: 105, ry: 62 };
  const shapes = [];
  for (const rock of [left, right]) {
    const { ctx, calls, stack } = recorder();
    paintArenaObstacle(ctx, rock);
    const vertices = calls.filter(([name]) => name === 'moveTo' || name === 'lineTo');
    assert.ok(vertices.some(([, , y]) => y < -rock.ry - 10), 'rock has an elevated crown');
    assert.ok(vertices.every(([, x, y]) => Math.abs(x) <= rock.rx && y <= rock.ry), 'solid rock stays within lateral footprint');
    assert.equal(calls.filter(([name]) => name === 'clip').length, 1);
    assert.equal(stack.length, 0);
    assert.ok(calls.length < 600, 'cached sprite generation stays lightweight');
    shapes.push(vertices);
  }
  assert.notDeepEqual(shapes[0], shapes[1]);
});
