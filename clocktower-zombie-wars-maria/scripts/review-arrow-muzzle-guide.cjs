const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true,timeout:60000,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--mute-audio']});const report={errors:[],directions:[]};try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.route(/\/game\.js(?:\?.*)?$/,async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`
 window.aimQA={game:()=>game,freeze:false,review:adultReview,render,arrowRainLayout,adultShotOrigin,drawArrowRainAimIndicator,context};const aimFrame=frame;frame=function(now){if(aimQA.freeze){requestAnimationFrame(frame);return;}aimFrame(now);};`});});
 await page.goto('http://127.0.0.1:4173/?playerModel=upright&modelLab=1&view=side&revision=arrow-muzzle-guide',{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>window.aimQA?.game().mode==='playing',null,{polling:100,timeout:90000});await page.locator('#developerWeapon').selectOption('lightning');
 await page.evaluate(()=>{const g=aimQA.game();g.ultimateTimer=999;g.pendingLightningRings=0;g.lightningRings=[];g.noticeTimer=0;aimQA.review.panel.style.pointerEvents="none";});
 const canvas=await page.locator('#game').boundingBox();
 for(const [x,y]of [[1100,360],[400,400],[800,140],[800,800],[1590,890]]){
  await page.mouse.move(canvas.x+x/1600*canvas.width,canvas.y+y/900*canvas.height);await page.waitForTimeout(100);
  const result=await page.evaluate(()=>{const q=aimQA,c=q.context,muzzle=q.adultShotOrigin(),target=q.arrowRainLayout(0).center;let anchor,angle;const translate=c.translate,rotate=c.rotate;c.translate=function(x,y){anchor={x,y};return translate.call(this,x,y);};c.rotate=function(a){angle=a;return rotate.call(this,a);};try{q.drawArrowRainAimIndicator();}finally{c.translate=translate;c.rotate=rotate;}return {muzzle,target,anchor,angle};});
  assert.ok(result.anchor);assert.ok(Math.abs(result.angle-Math.atan2(result.target.y-result.muzzle.y,result.target.x-result.muzzle.x))<1e-9);const gap=Math.hypot(result.anchor.x-result.muzzle.x,result.anchor.y-result.muzzle.y);assert.ok(gap>0&&gap<=22.0001);report.directions.push(result);
 }
 await page.mouse.move(canvas.x+980/1600*canvas.width,canvas.y+360/900*canvas.height);await page.mouse.down();await page.waitForFunction(()=>aimQA.game().player.chargeTime===2,null,{polling:100,timeout:15000});await page.evaluate(()=>{aimQA.freeze=true;aimQA.render();});
 await page.screenshot({path:'docs/progress/2026-09-18-arrow-muzzle-guide.png'});
 await page.screenshot({path:'docs/progress/2026-09-18-arrow-muzzle-guide-detail.png',clip:{x:canvas.x+690/1600*canvas.width,y:canvas.y+220/900*canvas.height,width:440/1600*canvas.width,height:300/900*canvas.height}});
 await page.mouse.up();assert.deepEqual(report.errors,[]);report.passed=true;console.log(JSON.stringify({passed:true,directions:report.directions.length,errors:report.errors}));
}finally{await fs.writeFile('docs/progress/2026-09-18-arrow-muzzle-guide.json',JSON.stringify(report,null,2));await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
