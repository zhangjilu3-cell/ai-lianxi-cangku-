import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createGameState,weapons} from '../src/game-core.js';
import {arrowRainChargeStats,buildArrowRainLayout,pointInArrowRain,createArrowRain} from '../src/weapon-effects.js';
import {createTrainingDummy,recordTrainingDamage} from '../src/training-dummy.js';
const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf('\n}',start+1)+2);};
const functions=['cancelWatermelonCharge','canChargeArrowRain','startArrowCharge','updateArrowCharge','arrowRainLayout','releaseArrowCharge','fireLightning','updateArrowRains','cancelReload','selectDeveloperWeapon','togglePause','useWeapon'];
function fixture(traits=[]){
 const game=createGameState();game.mode='playing';game.player.weapon='lightning';game.player.ammo.lightning=8;
 const hits=[],bursts=[];const stats={damage:60,chainRange:230,retention:.75,range:900,fireRate:.75,capacity:24};
 const sandbox={game,weapons,mouse:{x:1000,y:450,down:true},WIDTH:1600,HEIGHT:900,developerSession:{infiniteAmmo:false},rewardDialog:{hidden:true},tankTrialSession:{active:false},pausePanel:{hidden:true},
 buildArrowRainLayout,pointInArrowRain,createArrowRain,lightningStats:()=>stats,hasWeaponTrait:(_,w,t)=>traits.includes(t),
 hasUsableAmmo:p=>sandbox.developerSession.infiniteAmmo||p.ammo.lightning>0,shouldConsumeAmmo:()=>!sandbox.developerSession.infiniteAmmo,
 triggerWeaponVisual(){},ensureSound:()=>()=>{},burst:(...args)=>bursts.push(args),
 damageEnemy:(enemy,amount,from)=>{hits.push({id:enemy.id,amount,from});if(enemy.isTrainingDummy)recordTrainingDamage(enemy,amount,from,game.time);else enemy.health-=amount;},
 Math:Object.assign(Object.create(Math),{random:()=>0}),};
 new Script(functions.map(extract).join('\n')+'\nObject.assign(this,{'+functions.join(',')+'});').runInNewContext(sandbox);
 return {s:sandbox,game,hits,bursts,stats};
}
test('charge clamps at two seconds and both arrow count and trapezoid area grow',()=>{
 let previous=arrowRainChargeStats(0);assert.equal(previous.count,8);
 for(let i=1;i<=40;i++){const next=arrowRainChargeStats(i/20);assert.ok(next.count>previous.count);assert.ok(next.depth*(next.nearWidth+next.farWidth)>previous.depth*(previous.nearWidth+previous.farWidth));previous=next;}
 assert.equal(previous.count,48);assert.deepEqual(arrowRainChargeStats(100),previous);
 for(const bad of [-2,NaN,Infinity])assert.equal(arrowRainChargeStats(bad).ratio,0);
 assert.equal(arrowRainChargeStats(2,{extraArrows:100,areaScale:100}).count,72);
});
test('rotated trapezoid keeps every arrow and corner in the arena even near all edges',()=>{
 for(const origin of [{x:800,y:450},{x:52,y:72},{x:1548,y:852}]){
 for(let i=0;i<360;i+=3){const a=i*Math.PI/180;const target={x:origin.x+1700*Math.cos(a),y:origin.y+1700*Math.sin(a)};
 const layout=buildArrowRainLayout(origin,target,2,{areaScale:1.5,extraArrows:24});
 assert.equal(layout.points.length,72);
 for(const p of [...layout.points,...layout.corners]){assert.ok(p.x>=16-1e-8&&p.x<=1584+1e-8);assert.ok(p.y>=16-1e-8&&p.y<=884+1e-8);assert.ok(pointInArrowRain(p,layout));}
 const near=Math.hypot(layout.corners[0].x-layout.corners[3].x,layout.corners[0].y-layout.corners[3].y);
 const far=Math.hypot(layout.corners[1].x-layout.corners[2].x,layout.corners[1].y-layout.corners[2].y);assert.ok(far>near);
 }}
});
test('zero-distance targeting remains finite and target preview is deterministic',()=>{
 const p={x:800,y:450};const a=buildArrowRainLayout(p,p,2);assert.deepEqual(a,buildArrowRainLayout(p,p,2));assert.ok(a.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 assert.equal(pointInArrowRain({x:a.center.x+a.depth,y:a.center.y},a),false);
});
test('holding does not fire, reset charge, or spend ammo; release fires exactly once at fixed damage',()=>{
 const {s,game}=fixture();assert.equal(s.startArrowCharge(),true);s.updateArrowCharge(1);s.startArrowCharge();assert.equal(game.player.chargeTime,1);
 s.updateArrowCharge(9);assert.equal(game.player.chargeTime,2);assert.equal(game.arrowRains.length,0);assert.equal(game.player.ammo.lightning,8);
 assert.equal(s.releaseArrowCharge(),true);assert.equal(s.releaseArrowCharge(),false);assert.equal(game.player.ammo.lightning,7);assert.equal(game.arrowRains.length,1);
 assert.equal(game.arrowRains[0].arrows.length,48);assert.equal(game.arrowRains[0].damage,60);assert.equal(game.player.cooldown,.75);assert.equal(game.player.chargeWeapon,null);assert.equal(game.lightningArcs.length,0);
});
test('tap gives eight arrows at the same per-arrow damage and infinite ammo remains unchanged',()=>{
 const {s,game}=fixture();s.developerSession.infiniteAmmo=true;s.startArrowCharge();s.releaseArrowCharge();assert.equal(game.arrowRains[0].arrows.length,8);assert.equal(game.arrowRains[0].damage,60);assert.equal(game.player.ammo.lightning,8);
});
test('empty ammo cooldown reload dodge reward and trial block charging',()=>{
 for(const block of [f=>f.game.player.ammo.lightning=0,f=>f.game.player.cooldown=.2,f=>f.game.player.reload=1,f=>f.game.player.dodgeDuration=.1,f=>f.game.rewardSession.active=true,f=>f.s.rewardDialog.hidden=false,f=>f.s.tankTrialSession.active=true]){const f=fixture();block(f);assert.equal(f.s.startArrowCharge(),false);assert.equal(f.game.arrowRains.length,0);}
});
test('pause and developer weapon switch cancel without spending or releasing arrows',()=>{
 for(const cancel of [f=>f.s.togglePause(true),f=>f.s.selectDeveloperWeapon(f.game,{},'pistol'),f=>{f.game.rewardSession.active=true;f.s.updateArrowCharge(.1);},f=>{f.game.player.dodgeDuration=.3;f.s.updateArrowCharge(.1);},f=>{f.s.mouse.down=false;f.s.updateArrowCharge(.1);}]){
 const f=fixture();f.s.startArrowCharge();f.s.updateArrowCharge(1);cancel(f);assert.equal(f.game.player.chargeWeapon,null);assert.equal(f.s.releaseArrowCharge(),false);assert.equal(f.game.player.ammo.lightning,8);assert.equal(f.game.arrowRains.length,0);
 }
});
test('pointer tracking before release changes the footprint; afterwards the footprint stays locked',()=>{
 const {s,game}=fixture();s.startArrowCharge();s.updateArrowCharge(1);s.mouse.x=700;s.mouse.y=240;const preview=s.arrowRainLayout(1);s.releaseArrowCharge();assert.deepEqual(game.arrowRains[0].layout,preview);s.mouse.x=1200;assert.deepEqual(game.arrowRains[0].layout,preview);
});
test('arrow damage waits for visible impact, happens once per arrow, and excludes outside targets',()=>{
 const {s,game,hits}=fixture();s.startArrowCharge();s.releaseArrowCharge();const rain=game.arrowRains[0];rain.arrows=rain.arrows.slice(0,1);
 const a=rain.arrows[0];game.enemies=[{id:1,x:a.x,y:a.y,radius:20,health:1000},{id:2,x:rain.layout.center.x+rain.layout.depth,y:a.y,radius:1000,health:1000}];
 s.updateArrowRains(.53);assert.equal(hits.length,0);s.updateArrowRains(.01);assert.deepEqual(hits,[{id:1,amount:60,from:'lightning'}]);s.updateArrowRains(.1);assert.equal(hits.length,1);s.updateArrowRains(2);assert.equal(game.arrowRains.length,0);
});
test('moving out before impact avoids damage and training dummy attribution remains intact',()=>{
 const {s,game,hits}=fixture();s.startArrowCharge();s.releaseArrowCharge();const rain=game.arrowRains[0];rain.arrows=rain.arrows.slice(0,1);const a=rain.arrows[0];
 const dummy=createTrainingDummy(1,a.x,a.y);game.enemies=[dummy];s.updateArrowRains(.55);assert.equal(dummy.health,1000);assert.equal(dummy.damageStats.total,60);assert.equal(dummy.lastDamageSource,'lightning');
 const f=fixture();f.s.startArrowCharge();f.s.releaseArrowCharge();const point=f.game.arrowRains[0].arrows[0];f.game.enemies=[{id:1,x:point.x,y:point.y,health:100}];f.game.enemies[0].x=10;f.s.updateArrowRains(2);assert.equal(f.hits.length,0);
});
test('upgrades add arrows and size without changing charge duration or per-arrow damage',()=>{
 const {s,game,stats}=fixture(['fork']);stats.retention=.9;stats.chainRange=460;s.startArrowCharge();s.updateArrowCharge(2);s.releaseArrowCharge();const rain=game.arrowRains[0];assert.equal(rain.arrows.length,72);assert.equal(rain.layout.depth,450);assert.equal(rain.damage,60);
});
test('kill follow-up arrow is delayed, stays inside footprint, and cannot recursively create arrows',()=>{
 const {s,game}=fixture(['kill_arc']);s.startArrowCharge();s.releaseArrowCharge();const rain=game.arrowRains[0];rain.arrows=rain.arrows.slice(0,1);const p=rain.arrows[0];
 game.enemies=[{id:1,x:p.x,y:p.y,health:30},{id:2,x:p.x+45,y:p.y,health:30},{id:3,x:p.x+50,y:p.y,health:100}];
 s.updateArrowRains(.55);assert.equal(rain.echoes,1);assert.equal(rain.arrows.length,2);assert.equal(rain.arrows[1].impacted,false);assert.ok(pointInArrowRain(rain.arrows[1],rain.layout));s.updateArrowRains(.51);assert.equal(rain.echoes,1);assert.equal(rain.arrows.length,2);
});
test('splash does not hit targets outside the trapezoid and stun excludes bosses',()=>{
 const {s,game,hits}=fixture(['terminal_blast','paralyze']);s.startArrowCharge();s.releaseArrowCharge();const rain=game.arrowRains[0];rain.arrows=rain.arrows.slice(0,1);const p=rain.arrows[0];
 game.enemies=[{id:1,kind:'boss',x:p.x,y:p.y,health:1000},{id:2,x:p.x,y:p.y+50,health:100},{id:3,x:p.x-71,y:p.y,health:100}];
 s.updateArrowRains(1);assert.equal(game.enemies[0].slowStatuses,undefined);assert.deepEqual(hits.map(h=>[h.id,h.amount]),[[1,60],[2,15]]);
});
test('rendering is bounded, finite, and draws clear arrowheads without canvas blur',()=>{
 const {s,game}=fixture();s.startArrowCharge();s.updateArrowCharge(2);s.releaseArrowCharge();let calls=0;
 const context=new Proxy({}, {get:(t,k)=>t[k]??((...args)=>{calls++;for(const a of args)if(typeof a==='number')assert.ok(Number.isFinite(a),k);}),set:(t,k,v)=>{assert.notEqual(k,'shadowBlur');t[k]=v;return true;}});
 Object.assign(s,{context,clamp:(n,l,h)=>Math.max(l,Math.min(h,n)),TAU:Math.PI*2});new Script(['drawArrowRains'].map(extract).join('\n')+'\nthis.draw=drawArrowRains;').runInNewContext(s);
 for(const age of [0,.25,.5,.75,1.1]){calls=0;game.arrowRains[0].age=age;s.draw();assert.ok(calls<2500,calls);}
});
test('fresh games own independent empty arrow arrays',()=>{const a=createGameState(),b=createGameState();a.arrowRains.push({});assert.equal(b.arrowRains.length,0);});
