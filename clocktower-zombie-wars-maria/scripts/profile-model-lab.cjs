const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true,timeout:45000,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio']});
 const report={errors:[],stages:{},interaction:{}};
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.route(/\/game\.js(?:\?.*)?$/,async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:await response.text()+`
window.labQA={game:()=>game,mouse:()=>mouse,review:adultReview,samples:[],last:0,rig:()=>playerRigSprites};
const originalFrame=frame; frame=function(now){const start=performance.now();originalFrame(now);if(labQA.last)labQA.samples.push({interval:now-labQA.last,cpu:performance.now()-start});labQA.last=now;};`});
  });
  await page.goto('http://127.0.0.1:4173/?playerModel=upright&modelLab=1&view=side&revision=lab-performance-v2',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.labQA?.game().mode==='playing',null,{polling:100,timeout:90000});
  await page.waitForTimeout(4000);
  report.resources=await page.evaluate(()=>({comparisonRigLoaded:!!labQA.rig().body,images:performance.getEntriesByType('resource').filter(r=>/\.png|\.webp/.test(r.name)).length,comparisonHandRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/player-rig/weapons/')).length,canvas:[document.querySelector('#game').width,document.querySelector('#game').height]}));
  assert.equal(report.resources.comparisonRigLoaded,false);assert.equal(report.resources.comparisonHandRequests,0);
  async function measure(name,ms=5000){
   await page.evaluate(()=>{labQA.samples=[];labQA.last=0;});
   await page.waitForTimeout(ms);
   report.stages[name]=await page.evaluate(()=>{const s=labQA.samples,sorted=s.map(x=>x.interval).sort((a,b)=>a-b),mean=s.reduce((n,x)=>n+x.interval,0)/s.length;return {frames:s.length,meanMs:mean,fps:1000/mean,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),over50:s.filter(x=>x.interval>50).length,cpuMeanMs:s.reduce((n,x)=>n+x.cpu,0)/s.length,hidden:document.hidden};});
   console.log(name,JSON.stringify(report.stages[name]));
  }
  async function point(x,y){const r=await page.locator('#game').boundingBox();return {x:r.x+x/1600*r.width,y:r.y+y/900*r.height};}
  async function aimDummy(){const d=await page.evaluate(()=>{const d=labQA.game().enemies[0];return {x:d.x,y:d.y};});const p=await point(d.x,d.y);await page.mouse.move(p.x,p.y);}
  async function stats(){return await page.evaluate(()=>{const d=labQA.game().enemies[0];return {hits:d.damageStats.hits,total:d.damageStats.total,health:d.health,last:d.damageStats.last,source:d.damageStats.source};});}
  await measure('idle');
  const before=await page.evaluate(()=>labQA.game().player.x);
  await page.locator('#game').focus();await page.keyboard.down('a');await measure('moving',1000);await page.keyboard.up('a');
  report.interaction.movedX=await page.evaluate(()=>labQA.game().player.x)-before;assert.ok(report.interaction.movedX<-50);
  await aimDummy();await page.mouse.down();await measure('pistol');await page.mouse.up();report.interaction.pistol=await stats();assert.ok(report.interaction.pistol.hits>0);assert.equal(report.interaction.pistol.last,32);
  await page.locator('#developerWeapon').selectOption('shotgun');await aimDummy();await page.mouse.down();await measure('shotgun',3000);await page.mouse.up();report.interaction.shotgun=await stats();assert.equal(report.interaction.shotgun.last,42);assert.equal(report.interaction.shotgun.health,1000);
  for(const [weapon,points] of [['turret',[[500,430],[620,430],[740,430]]],['tank',[[510,550],[710,550]]]]){
   await page.locator('#developerWeapon').selectOption(weapon);
   for(const [x,y] of points){const p=await point(x,y);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();await page.waitForTimeout(650);}
  }
  report.interaction.structures=await page.evaluate(()=>labQA.game().structures.map(s=>s.kind));
  assert.equal(report.interaction.structures.filter(x=>x==='turret').length,2);assert.equal(report.interaction.structures.filter(x=>x==='tank').length,1);
  await page.locator('[data-auto-fire]').check();await measure('facilities',3000);await page.locator('[data-auto-fire]').uncheck();
  await page.locator('[data-adult]').click();
  await page.waitForFunction(()=>!!labQA.rig().body && !labQA.review.enabled.checked,null,{polling:100,timeout:45000});report.interaction.comparisonLoaded=true;
  await page.locator('[data-adult]').check();await page.locator('#developerWeapon').selectOption('pistol');
  await page.locator('[data-zoom]').uncheck();await page.setViewportSize({width:1100,height:850});await page.waitForTimeout(500);
  const hitsBefore=(await stats()).hits;await aimDummy();await page.mouse.down();await page.waitForTimeout(1200);await page.mouse.up();
  report.interaction.resized=await page.evaluate(()=>({canvas:[document.querySelector('#game').width,document.querySelector('#game').height],mouse:{...labQA.mouse()}}));
  assert.ok((await stats()).hits>hitsBefore,'mouse-to-world mapping after resize');
  await page.setViewportSize({width:1440,height:1000});await page.locator('[data-zoom]').check();await page.waitForTimeout(1500);
  await page.screenshot({path:'docs/progress/2026-09-17-lab-performance.png'});
  assert.deepEqual(report.errors,[]);
  report.passed=true;
 } catch(error){report.failure=error.stack;throw error;}
 finally{await fs.writeFile('docs/progress/2026-09-17-lab-performance.json',JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
