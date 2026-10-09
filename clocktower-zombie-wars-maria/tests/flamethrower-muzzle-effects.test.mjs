import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {weapons} from '../src/game-core.js';
const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\nfunction ',start+1));};
function fixture(weapon, muzzle){
 const bursts=[];const game={time:0,player:{x:800,y:450,aimX:1,aimY:0,weapon,cooldown:0,reload:0,dodgeDuration:0,ammo:{[weapon]:10}},enemies:[],particles:[],damageZones:[]};
 const sandbox={game,weapons,developerSession:{},hasUsableAmmo:()=>true,shouldConsumeAmmo:()=>false,triggerWeaponVisual(){},ensureSound:()=>()=>{},adultShotOrigin:()=>muzzle,burst:(...args)=>bursts.push(args),firePistol(){}};
 new Script(extract('fireFlame')+'\n'+extract('useWeapon')+'\nthis.fire=useWeapon;').runInNewContext(sandbox);
 return {sandbox,game,bursts};
}
test('flamethrower emits only its seven forward flame particles at the real muzzle',()=>{
 for(const muzzle of [{x:870,y:320},{x:720,y:280},{x:790,y:360}]){
  const {sandbox,game,bursts}=fixture('flamethrower',muzzle);sandbox.fire();
  assert.equal(bursts.length,0,'no generic radial sparks at the grounded player anchor');assert.equal(game.particles.length,7);
  for(const p of game.particles){assert.equal(p.x,muzzle.x);assert.equal(p.y,muzzle.y);assert.ok(p.vx>0);}
  assert.equal(game.player.cooldown,.06);assert.equal(game.player.ammo.flamethrower,10);
 }
});
test('other firearm flashes use the actual muzzle and retain the legacy model fallback',()=>{
 const active=fixture('pistol',{x:860,y:300});active.sandbox.fire();assert.deepEqual(active.bursts[0].slice(0,2),[860,300]);
 const legacy=fixture('pistol',null);legacy.sandbox.fire();assert.deepEqual(legacy.bursts[0].slice(0,2),[830,450]);
});
