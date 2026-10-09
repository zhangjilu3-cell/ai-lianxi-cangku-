import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const start=source.indexOf('function drawLightningRing(ring, detailed = true) {');
const fn=source.slice(start,source.indexOf('\nfunction drawPlacementPreview()',start));
function capture(ring, detailed = true){
 const calls=[],states=[];
 const state={globalAlpha:0.8,shadowBlur:0,lineWidth:3,strokeStyle:'original',fillStyle:'original',lineCap:'butt',lineJoin:'miter'};
 const initial={...state};
 const context=new Proxy(state,{get(target,key){
  if(key in target)return target[key];
  if(key==='save')return ()=>states.push({...target});
  if(key==='restore')return ()=>Object.assign(target,states.pop());
  return (...args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n));calls.push([key,...args,target.strokeStyle,target.globalAlpha]);};
 },set(target,key,value){if(key==='shadowBlur')assert.equal(value,0,'no raster blur');if(key==='globalAlpha')assert.ok(value>=0&&value<=1);target[key]=value;return true;}});
 const scope={context,clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),TAU:Math.PI*2};
 new Script(fn+'\nthis.draw=drawLightningRing').runInNewContext(scope);
 const before=JSON.stringify(ring);scope.draw(ring, detailed);
 assert.equal(JSON.stringify(ring),before,'render cannot alter gameplay state');
 assert.deepEqual(state,initial,'canvas state is restored');assert.equal(states.length,0);
 return calls;
}
const at=p=>({id:17,x:800,y:700,life:0.75*(1-p),maxLife:0.75,radius:32+p*488,hitIds:new Set([1])});
test('electric ring particles are deterministic, finite and bounded over their lifetime',()=>{
 for(const p of [0,.03,.1,.25,.5,.8,.999]){
  const a=capture(at(p));assert.deepEqual(a,capture(at(p)));assert.ok(a.length<500,'bounded path work per ring');assert.ok(a.length>30);
  assert.ok(a.some(call=>call.includes('#ffffff')));assert.ok(a.some(call=>call.includes('#e6efff')));
 }
});
test('all effects stay around the expanding ring with no sky bolt or centre seal',()=>{
 for(const p of [.03,.15,.48,.8]){
  const ring=at(p),calls=capture(ring);
  assert.equal(calls.some(c=>c[0]==='ellipse'),false);
  for(const c of calls.filter(c=>['moveTo','lineTo'].includes(c[0]))) {
   assert.ok(Math.abs(c[1])<=ring.radius+40);
   assert.ok(Math.abs(c[2])<=ring.radius+40,'no vertical sky strike');
  }
  assert.ok(calls.some(c=>c[0]==='rect'),'wave emits visible spark heads');
 }
});
test('expired or invalid lightning effects draw nothing',()=>{
 for(const ring of [{...at(1)},{...at(.5),maxLife:0},{...at(.5),x:NaN},{...at(.5),radius:-1}])assert.equal(capture(ring).length,0);
});


test('overlapping older rings preserve the frontier with a smaller spark budget',()=>{
 const full=capture(at(.35)),trailing=capture(at(.35),false);
 assert.ok(trailing.length<full.length);
 assert.equal(trailing.filter(c=>c[0]==='closePath').length,2);
 assert.ok(trailing.some(c=>c[0]==='rect'));
 assert.ok(full.filter(c=>c[0]==='rect').length>trailing.filter(c=>c[0]==='rect').length);
});

test('ring has no interior arcs or horizontal cross glints',()=>{
 for(const p of [.1,.35,.7]){
  const ring=at(p),calls=capture(ring);
  assert.equal(calls.filter(c=>c[0]==='closePath').length,2);
  assert.equal(calls.filter(c=>c[0]==='stroke').length,2,'only the outer ring is stroked; no particle trails');
  for (const c of calls.filter(c=>c[0]==='rect')) {
   assert.ok(Math.hypot(c[1]+c[3]/2,c[2]+c[4]/2)-c[3] > ring.radius,'spark stays outside ring');
  }

  assert.equal(calls.filter(c=>c[0]==='rect').some(c=>c[3]!==c[4]),false,'spark heads are compact points, not horizontal lines');
  assert.equal(calls.some(c=>c.includes('#a68bff')),false);
 }
});
