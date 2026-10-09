const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,timeout:60000,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio']});const report={errors:[]};try{const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));await page.route(/\/game\.js(?:\?.*)?$/,async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
window.lightningQA={game:()=>game,samples:[],last:0,freeze:false,render,drawLightningRing,useWeapon,adultShotOrigin};
const measuredLightningFrame=frame;frame=function(now){if(lightningQA.freeze){requestAnimationFrame(frame);return;}const count=game.lightningRings.length,start=performance.now();measuredLightningFrame(now);if(lightningQA.last)lightningQA.samples.push({interval:now-lightningQA.last,cpu:performance.now()-start,active:count>0||game.lightningRings.length>0,count:game.lightningRings.length});lightningQA.last=now;};`});});
await page.goto('http://127.0.0.1:4173/?playerModel=upright&modelLab=1&view=side&revision=combat-effects-v2',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.lightningQA?.game().mode==='playing',null,{polling:100,timeout:90000});await page.waitForTimeout(4000);
await page.locator('#developerWeapon').selectOption('flamethrower');
const aim=await page.evaluate(()=>{const r=document.querySelector('#game').getBoundingClientRect(),d=lightningQA.game().enemies[0];return {x:r.x+d.x/1600*r.width,y:r.y+d.y/900*r.height};});
await page.mouse.move(aim.x,aim.y);await page.waitForTimeout(150);
report.flame=await page.evaluate(()=>{const qa=lightningQA,g=qa.game();g.player.cooldown=0;g.particles=[];const muzzle=qa.adultShotOrigin();qa.useWeapon();return {muzzle,player:{x:g.player.x,y:g.player.y},particles:g.particles.map(p=>({x:p.x,y:p.y,color:p.color})),cooldown:g.player.cooldown};});
assert.equal(report.flame.particles.length,7);
for(const p of report.flame.particles){assert.equal(p.x,report.flame.muzzle.x);assert.equal(p.y,report.flame.muzzle.y);assert.notEqual(p.color,'#ffd78f');}
await page.waitForTimeout(180);await page.evaluate(()=>{lightningQA.freeze=true;lightningQA.render();});
await page.screenshot({path:'docs/progress/2026-09-17-flamethrower-muzzle.png'});
await page.evaluate(()=>{lightningQA.freeze=false;lightningQA.last=0;});await page.locator('#developerWeapon').selectOption('pistol');await page.waitForTimeout(1000);

await page.evaluate(()=>{lightningQA.samples=[];lightningQA.last=0;});await page.waitForTimeout(2000);
const summarize=()=>{const summary=list=>{const a=list.map(s=>s.interval).sort((a,b)=>a-b),mean=a.reduce((x,y)=>x+y,0)/a.length;return {frames:a.length,meanMs:mean,fps:1000/mean,p95Ms:a[Math.floor(a.length*.95)],over50:a.filter(n=>n>50).length,cpuMean:list.reduce((x,y)=>x+y.cpu,0)/list.length,maxRings:Math.max(...list.map(s=>s.count))};};return {all:summary(lightningQA.samples),active:summary(lightningQA.samples.filter(s=>s.active))};};
report.idle=await page.evaluate(summarize);await page.evaluate(()=>{lightningQA.samples=[];lightningQA.last=0;});
for(let i=0;i<4;i++){await page.evaluate(()=>{const g=lightningQA.game();g.pendingLightningRings=4;g.lightningSpawnTimer=0;g.ultimateTimer=20;});await page.waitForTimeout(1700);}
report.bursts=await page.evaluate(summarize);report.damage=await page.evaluate(()=>lightningQA.game().enemies[0].damageStats);assert.ok(report.bursts.active.frames>0);assert.ok(report.damage.total>0);assert.ok(report.bursts.active.maxRings>=3);console.log(JSON.stringify(report.bursts));
for(const [name,progress]of [['particles',.16],['wave',.48],['afterglow',.8]]){await page.evaluate(progress=>{const qa=lightningQA,g=qa.game();qa.freeze=true;g.lightningRings=[{id:71,x:g.player.x,y:g.player.y,life:.75*(1-progress),maxLife:.75,radius:32+progress*488,hitIds:new Set()}];qa.render();},progress);await page.screenshot({path:'docs/progress/2026-09-17-lightning-inner-'+name+'.png'});}
assert.deepEqual(report.errors,[]);report.passed=true;
}finally{await fs.writeFile('docs/progress/2026-09-17-combat-effects.json',JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
