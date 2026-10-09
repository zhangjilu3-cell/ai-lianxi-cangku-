import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {ensureTrainingDummy} from '../src/training-dummy.js';
const source=readFileSync(new URL('../src/game.js',import.meta.url),'utf8');
const extract=name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\nfunction ',start+1));};
test('model lab keeps its immortal target without hostiles for two simulated minutes',()=>{
 const game={mode:'playing',time:0,enemies:[{}],waveQueue:['runner'],hazards:[{}],pickups:[{}],player:{x:800,y:450,health:1,maxHealth:100},structures:[],nextId:1,noticeTimer:8};let ticks=0;
 const scope={modelLab:true,game,ensureTrainingDummy,trainingLab:{autoFire:{checked:false}},updateEnemies(){},updateDamageZones(){},updatePlayer:()=>ticks++,updateDelayedShots(){},updateBullets(){},updateSlowZones(){},updateShockwaves(){},updateLightning(){},updateParticles(){}};
 vm.createContext(scope);vm.runInContext(extract('update'),scope);
 for(let i=0;i<7200;i++)vm.runInContext('update(1/60)',scope);
 assert.equal(ticks,7200);for(const name of ['waveQueue','hazards','pickups'])assert.equal(game[name].length,0);
 assert.equal(game.enemies.length,1);assert.equal(game.enemies[0].isTrainingDummy,true);assert.equal(game.enemies[0].health,1000);
 assert.equal(game.player.health,100);assert.equal(game.noticeTimer,0);
 game.mode='paused';vm.runInContext('update(1)',scope);assert.equal(ticks,7200);
});
test('lab blocks direct spawning and wave progression without relying on empty queues',()=>{
 const scope={modelLab:true};vm.createContext(scope);
 vm.runInContext(extract('spawnEnemy'),scope);vm.runInContext(extract('updateWave'),scope);
 assert.equal(vm.runInContext('spawnEnemy("runner")',scope),undefined);
 assert.equal(vm.runInContext('updateWave(60)',scope),'model-lab');
});
