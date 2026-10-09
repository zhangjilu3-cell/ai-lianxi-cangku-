import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {WEAPON_VISUALS} from '../src/weapon-visuals.js';

test('readability bakes sprite lighting once and never composites per-frame surfaces',async()=>{
 const previous=globalThis.document,previousImage=globalThis.Image;let tints=0,clears=0;const pending=[],sources=[];
 class StaticSprite { naturalWidth=128;naturalHeight=192;complete=true;set src(value){pending.push(()=>this.onload());} }
 globalThis.Image=StaticSprite;
 function canvas(){const result={width:0,height:0,toDataURL:()=>"data:image/png;base64,test"};const ctx=new Proxy({globalAlpha:1,drawImage(image){sources.push(image);},clearRect(){clears++;},getImageData(){return {data:new Uint8ClampedArray(result.width*result.height*4)};}},{get(t,k){return t[k]??(()=>{});},set(t,k,v){if(k==='filter'&&v!=='none')tints++;t[k]=v;return true;}});result.getContext=()=>ctx;return result;}
 globalThis.document={createElement:()=>canvas()};
 try{
  const {drawUprightReviewPlayer,prepareUprightReviewSprites}=await import('../src/player-upright-review.js?performance-test');
  const sprite=()=>({naturalWidth:128,naturalHeight:192,complete:true});const atlas={body:sprite(),sideBody:sprite(),upper:sprite(),forearm:sprite()},weapon=sprite();
  const review={markers:{checked:false}},options={readability:true,scale:1.65,angle:0,view:'side',time:1,recoilRatio:0};
  const draw=(opts,img=weapon)=>drawUprightReviewPlayer(canvas().getContext('2d'),atlas,img,WEAPON_VISUALS.pistol,opts,review);
  let ready=false;
  const preparation=prepareUprightReviewSprites(atlas,[weapon]).then(()=>{ready=true;});
  await Promise.resolve();assert.equal(ready,false,'startup waits for prepared sprite decoding');
  for(const loaded of pending.splice(0))loaded();
  await preparation;assert.equal(ready,true);
  draw(options);assert.equal(tints,5);const initialClears=clears;assert.equal(initialClears,0);for(const loaded of pending.splice(0))loaded();sources.length=0;
  draw({...options,scale:1});assert.equal(clears,initialClears,'magnifier reuses the lit sprites');assert.equal(tints,5);assert.ok(sources.some(image=>image instanceof StaticSprite),'decoded static images replace temporary canvases');
  draw({...options,time:2});assert.equal(clears,0);assert.equal(tints,5,'new frames never rerun sprite filters');
  draw({...options,time:2,angle:Math.PI});assert.equal(clears,0,'aim changes do not rebuild bitmap surfaces');
  review.markers.checked=true;draw({...options,time:2,angle:Math.PI});assert.equal(clears,0,'joint markers draw normally without bitmap work');
  draw({...options,time:2},sprite());assert.equal(tints,6,'new weapons receive their own cached tint');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;if(previousImage===undefined)delete globalThis.Image;else globalThis.Image=previousImage;}
});

test('unchanged weapon bar avoids DOM replacement and updates inventory and deployment changes',async()=>{
 const source=await readFile(new URL('../src/game.js',import.meta.url),'utf8');const start=source.indexOf('function renderWeaponBar() {');const body=source.slice(start,source.indexOf('\nfunction ',start+1));let writes=0,html='';const weaponBar={set innerHTML(value){writes++;html=value;}};
 const game={unlocked:['pistol','turret'],player:{weapon:'pistol',ammo:{pistol:12,turret:2}},structures:[]};const sandbox={game,weaponBar,developerSession:{enabled:false},tankTrialSession:{active:false},weapons:[{id:'pistol',name:'Pistol'},{id:'turret',name:'Turret',maxDeployed:2}]};new Script(body+'\nthis.draw=renderWeaponBar;').runInNewContext(sandbox);
 sandbox.draw();sandbox.draw();assert.equal(writes,1);game.player.ammo.pistol=11;sandbox.draw();assert.equal(writes,2);assert.match(html,/11/);
 game.structures.push({kind:'turret',health:10});sandbox.draw();assert.equal(writes,3);assert.match(html,/1\/2/);sandbox.draw();assert.equal(writes,3);
 game.player.weapon='turret';sandbox.draw();assert.equal(writes,4);
});
import { updateAdultReviewMagnifier } from '../src/player-adult-review.js';

function productionFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const open = source.indexOf('{', start); let depth = 1, end = open + 1;
  // These target functions contain no unbalanced braces in strings/comments.
  for (; depth && end < source.length; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  return source.slice(start, end);
}

test('lab hidden HUD never touches hidden nodes', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  new Script(productionFunction(source, 'updateHud') + '\nupdateHud();').runInNewContext({modelLab:true});
});

test('comparison rig deduplicates concurrent requests and retries after failure', async () => {
  const source = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  let calls = 0, fail = true;
  const sandbox = { modelLab:true, playerRigSprites:{}, PLAYER_RIG_ASSETS:{body:'body.png'}, PLAYER_WEAPON_HAND_ASSET_ENTRIES:[{key:'hand',route:'hand.png'}],
    loadImageAsset:async src=> { calls++; if (fail) throw Error('offline'); return {src}; } };
  new Script('let comparisonRigPromise=null;\n' + productionFunction(source,'loadComparisonRig')+'\nthis.load=loadComparisonRig;').runInNewContext(sandbox);
  const first = sandbox.load(); assert.equal(first, sandbox.load());
  await assert.rejects(first, /offline/); assert.equal(calls,2);
  assert.deepEqual(sandbox.playerRigSprites,{});
  fail=false;await sandbox.load(); assert.equal(calls,4);
  assert.equal(sandbox.playerRigSprites.body.src,'body.png');
  await sandbox.load();assert.equal(calls,4);
});

test('sprite loading caps decoded dimensions and falls back on bitmap failure', async () => {
  const source=await readFile(new URL('../src/game.js',import.meta.url),'utf8');
  let options, fail=false;
  class SourceImage { naturalWidth=2048;naturalHeight=1024;addEventListener(type,callback){this[type]=callback;}set src(value){queueMicrotask(()=>this.load());} }
  const sandbox={Image:SourceImage,createImageBitmap:async (image,opts)=>{options=opts;if(fail)throw Error('unsupported');return {width:opts.resizeWidth,height:opts.resizeHeight};}};
  new Script(productionFunction(source,'loadImageAsset')+'\nthis.load=loadImageAsset;').runInNewContext(sandbox);
  const resized=await sandbox.load('x','x',512);
  assert.equal(resized.naturalWidth,512);assert.equal(resized.naturalHeight,256);assert.equal(resized.complete,true);assert.equal(options.resizeQuality,'high');
  fail=true;assert.ok(await sandbox.load('x','x',512) instanceof SourceImage);
});

test('preview limits paint rate but responds immediately to controls and equipment', t => {
  let now=0, draws=0, writes=0;
  t.mock.method(performance,'now',()=>now);
  const context=new Proxy({},{get:()=>()=>{}});
  const status={value:'',get textContent(){return this.value;},set textContent(v){writes++;this.value=v;}};
  const review={panel:{hidden:false},canvas:{getContext:()=>context},zoom:{checked:true},enabled:{checked:true},markers:{checked:false},view:{value:'side'},mode:'upright',status};
  const player={aimX:1,aimY:0,weapon:'pistol'};
  const paint=()=>updateAdultReviewMagnifier(review,null,player,()=>draws++,()=>{});
  paint();now=16;paint();assert.equal(draws,1);now=34;paint();assert.equal(draws,2);assert.equal(writes,1);
  now=35;player.weapon='shotgun';paint();assert.equal(draws,3);
  review.zoom.checked=false;paint();assert.equal(review.canvas.hidden,true);assert.equal(draws,3);
  review.zoom.checked=true;paint();assert.equal(draws,4);
  review.panel.hidden=true;now=1000;paint();assert.equal(draws,4);
});
