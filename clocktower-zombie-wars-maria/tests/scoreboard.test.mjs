import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanScoreEntries, addScoreEntry } from '../src/scoreboard.js';
const entry=(id,score,mode='normal',wave=1,kills=1)=>({id,score,mode,wave,kills,date:'2026-09-22T00:00:00.000Z'});
test('scores rank descending with wave and kills breaking ties',()=>{
 const sorted=cleanScoreEntries([entry('a',20),entry('b',50,'normal',3,4),entry('c',50,'normal',3,9),entry('d',50,'normal',4,1)]);
 assert.deepEqual(sorted.map(e=>e.id),['d','c','b','a']);
});
test('invalid storage records and duplicate ids cannot enter the board',()=>{
 const valid=entry('ok',10);
 assert.deepEqual(cleanScoreEntries([null,{},entry('x',NaN),entry('y',-1),{...valid,id:'bad',date:'bad'},{...valid,id:'bad-date',date:123},valid,valid]),[valid]);
 assert.deepEqual(cleanScoreEntries({}),[]);
});
test('each mode keeps its own highest 20 entries',()=>{
 let scores=[];for(let i=0;i<35;i++){scores=addScoreEntry(scores,entry('n'+i,i));scores=addScoreEntry(scores,entry('p'+i,1000+i,'practice'));}
 assert.equal(scores.length,40);assert.equal(scores.filter(e=>e.mode==='normal').length,20);
 assert.equal(scores.filter(e=>e.mode==='normal').at(-1).score,15);
 assert.equal(scores.filter(e=>e.mode==='practice')[0].score,1034);
});
