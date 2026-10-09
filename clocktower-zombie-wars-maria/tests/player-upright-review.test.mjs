import test from "node:test";
import assert from "node:assert/strict";
import { advanceUprightGait, uprightSineArc, uprightMantleRotation, uprightPose, uprightView, uprightMuzzlePoint, drawUprightReviewPlayer, UPRIGHT_REVIEW_ASSETS } from "../src/player-upright-review.js";
import { WEAPON_VISUALS } from "../src/weapon-visuals.js";

function recorder() {
  let m=[1,0,0,1,0,0];const stack=[];const calls=[];
  const mul=([a,b,c,d,e,f])=>{const [A,B,C,D,E,F]=m;m=[A*a+C*b,B*a+D*b,A*c+C*d,B*c+D*d,A*e+C*f+E,B*e+D*f+F];};
  return new Proxy({calls,save(){stack.push([...m]);},restore(){m=stack.pop();},translate(x,y){mul([1,0,0,1,x,y]);},rotate(a){mul([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]);},scale(x,y){mul([x,0,0,y,0,0]);},drawImage(image,...args){calls.push({image,args,m:[...m]});}}, {get(t,k){return t[k]??(()=>{});}});
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const boneDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,(a.z??0)-(b.z??0));

test("full body stays frontal in every aiming direction",()=>{
  assert.deepEqual(uprightView(0),{view:"front",facing:1});
  assert.deepEqual(uprightView(Math.PI),{view:"front",facing:1});
  assert.equal(uprightView(Math.PI/2).view,"front");
  assert.equal(uprightView(-Math.PI/2).view,"front");
  assert.equal(uprightView(0,"front").view,"front");
  assert.equal(uprightView(Math.PI/2,"side").view,"side");
});

test("both full arms reach their actual targets through all views, weapons, aims and recoil phases",()=>{
  for(const visual of Object.values(WEAPON_VISUALS)) {
    const before=JSON.stringify(visual);
    for(const view of ["auto","front","side"]) for(let i=0;i<24;i++) for(const recoilRatio of [0,0.5,1]) {
      const pose=uprightPose(visual,i*Math.PI/12,{view,recoilRatio,time:1.23,moving:true});
      for(const [arm,target] of [[pose.near,pose.nearTarget],[pose.far,pose.farTarget]]) {
        assert.ok(arm.targetReachable,`${visual.src} ${view} ${i} ${recoilRatio}: ${distance(arm.hand,target)}`);
        assert.ok(distance(arm.hand,target)<1e-7);
        assert.ok(Number.isFinite(arm.elbow.x)&&Number.isFinite(arm.elbow.y));
      }
      assert.ok(Math.abs(boneDistance(pose.near.shoulder,pose.near.elbow)-pose.upperLength)<1e-7);
      assert.ok(Math.abs(boneDistance(pose.near.elbow,pose.near.hand)-pose.forearmLength)<1e-7);
    }
    assert.equal(JSON.stringify(visual),before);
  }
});

test("upright drawn muzzle and projectile origin agree including left mirroring and walking bob",()=>{
  const atlas={body:{naturalWidth:1000,naturalHeight:1400},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};const weapon={naturalWidth:800,naturalHeight:400};
  for(const visual of Object.values(WEAPON_VISUALS)) for(let i=0;i<8;i++) for(const recoilRatio of [0,0.5,1]) {
    const angle=i*Math.PI/4;const options={angle,recoilRatio,moving:true,time:1.1};const player={x:450,y:360};const ctx=recorder();ctx.translate(player.x,player.y);
    drawUprightReviewPlayer(ctx,atlas,weapon,visual,options,{markers:{checked:false}});
    const draw=ctx.calls.find(c=>c.image===weapon);assert.ok(draw);
    const pose=uprightPose(visual,angle,options);
    const [a,b,c,d,e,f]=draw.m;const x=draw.args[0]+pose.mounted.muzzleX*draw.args[2];const y=draw.args[1]+pose.mounted.muzzleY*draw.args[3];
    const expected=uprightMuzzlePoint(visual,player,angle,options);
    assert.ok(distance({x:a*x+c*y+e,y:b*x+d*y+f},expected)<1e-7);
    const body=ctx.calls.find(c=>c.image===atlas.body && c.args.at(-1)===110);
    assert.ok(body);
    const baseline=recorder();baseline.translate(player.x,player.y);
    drawUprightReviewPlayer(baseline,atlas,weapon,visual,{...options,angle:0},{markers:{checked:false}});
    assert.deepEqual(body.m,baseline.calls.find(c=>c.image===atlas.body).m,"walking body does not turn with aim");
    const armCalls=ctx.calls.filter(c=>c.image===atlas.upper||c.image===atlas.forearm);assert.equal(armCalls.length,6,"two upper arms, two forearms and two attached hands");
  }
});

test("upright walking and recoil move the rendered model without altering weapon stats",()=>{
  const v=WEAPON_VISUALS.pistol;const idle=uprightPose(v,0);const walking=uprightPose(v,0,{moving:true,time:0.1});const shot=uprightPose(v,0,{recoilRatio:1});
  assert.equal(walking.bob,0);assert.ok(shot.muzzle.x<idle.muzzle.x);
  assert.equal(v.width,54);assert.equal(v.recoilDistance,4);
  for(const path of Object.values(UPRIGHT_REVIEW_ASSETS)) assert.match(path,/^\/player-rig\/.+\.png$/);
});

test("upright drawing is confined to the renderer, outside movement simulation",async()=>{
  const {readFile}=await import("node:fs/promises");
  const source=await readFile(new URL("../src/game.js",import.meta.url),"utf8");
  const update=source.slice(source.indexOf("function updatePlayer("),source.indexOf("\nfunction ",source.indexOf("function updatePlayer(")+1));
  assert.doesNotMatch(update,/drawUprightReviewPlayer|context\.restore/);
  const draw=source.slice(source.indexOf("function drawPlayerSprite("),source.indexOf("function drawWatermelonCharge("));
  assert.match(draw,/drawUprightReviewPlayer/);
  assert.ok(draw.indexOf("drawUprightReviewPlayer")<draw.indexOf("context.rotate(baseAngle)"));
});

test("aim crossing vertical does not swap shoulders or snap elbows",()=>{
 for(const v of Object.values(WEAPON_VISUALS)) for(const a of [Math.PI/2,-Math.PI/2]) {
 const left=uprightPose(v,a-0.0001),right=uprightPose(v,a+0.0001);
 for(const name of ["near","far"]) { assert.deepEqual(left[name].shoulder,right[name].shoulder); assert.ok(distance(left[name].elbow,right[name].elbow)<0.1); assert.ok(Math.abs(distance(left[name].shoulder,left[name].elbow)-21)<1e-7); assert.ok(Math.abs(distance(left[name].elbow,left[name].hand)-23)<1e-7); }
 }
});

test("visible shoulder panels rotate with each upper arm during aiming",()=>{
 for(const side of ["near","far"]) {
 const angles=[0,Math.PI/4,Math.PI,Math.PI*1.4].map(a=>uprightMantleRotation(uprightPose(WEAPON_VISUALS.pistol,a)[side],side==="near"?1:-1));
 assert.ok(Math.max(...angles)-Math.min(...angles)>0.3,"upper arm silhouette must participate in aiming");
 }
 const atlas={body:{naturalWidth:1000,naturalHeight:1400},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
 const ctx=recorder();drawUprightReviewPlayer(ctx,atlas,{},WEAPON_VISUALS.pistol,{angle:0},{markers:{checked:false}});
 const parts=ctx.calls.filter(c=>c.image===atlas.body);assert.equal(parts.length,4);
 assert.ok(Math.abs(parts[2].m[1])>0.01);assert.ok(Math.abs(parts[3].m[1])>0.01);
});


test("upper-body sway moves shoulders and elbows while feet and arm lengths stay fixed",()=>{
 const atlas={body:{naturalWidth:1000,naturalHeight:1400},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
 const v=WEAPON_VISUALS.shotgun;
 const a=uprightPose(v,0,{time:0,moving:true}),b=uprightPose(v,0,{time:.2,moving:true});
 assert.ok(distance(a.near.shoulder,b.near.shoulder)>.1);
 assert.ok(distance(a.near.elbow,b.near.elbow)>.1);
 for(let i=0;i<60;i++) {
  const options={time:i*.13,moving:true,angle:i*.2};const p=uprightPose(v,options.angle,options);
  for(const arm of [p.near,p.far]) {
   assert.ok(Math.abs(distance(arm.shoulder,arm.elbow)-21)<1e-7);
   assert.ok(Math.abs(distance(arm.elbow,arm.hand)-23)<1e-7);
  }
  const c=recorder();drawUprightReviewPlayer(c,atlas,{},v,options,{markers:{checked:false}});
  const feet=c.calls.find(x=>x.image===atlas.body);assert.ok(feet.m.every(Number.isFinite));
  assert.ok(Math.abs(p.motion.lean)<=.06);
 }
 assert.deepEqual(uprightSineArc(.2,true),uprightSineArc(.2,true));
});


test("start-stop motion is blended continuously and shoulders stay in their downward activity sector",()=>{
 const t=1.23, a=uprightSineArc(t,true,.5),b=uprightSineArc(t,false,.5);
 assert.deepEqual(a,b,"movement key transitions must not change the pose at a fixed blend");
 for(const visual of Object.values(WEAPON_VISUALS))for(let i=0;i<72;i++)for(const recoilRatio of [0,1]) {
  const p=uprightPose(visual,i*Math.PI/36,{time:i*.1,motionBlend:.7,recoilRatio});
  for(const arm of Object.values(p.localArms)) {
   const u={x:arm.elbow.x-arm.shoulder.x,y:arm.elbow.y-arm.shoulder.y};
   assert.ok(Math.abs(Math.atan2(u.x,u.y))<85*Math.PI/180,"upper arms must not flip above the shoulders");
   assert.ok(arm.targetReachable);
  }
 }
});


test("side view uses its own body and shoulder anchors and keeps its rendered muzzle attached",()=>{
 const atlas={body:{naturalWidth:1000,naturalHeight:1400},sideBody:{naturalWidth:1024,naturalHeight:1536},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
 const weapon={naturalWidth:800,naturalHeight:400};
 for(const visual of Object.values(WEAPON_VISUALS))for(let i=0;i<16;i++) {
  const angle=i*Math.PI/8, options={view:"side",angle,recoilRatio:.7,time:1.1,motionBlend:.6};
  const pose=uprightPose(visual,angle,options),ctx=recorder();
  drawUprightReviewPlayer(ctx,atlas,weapon,visual,options,{markers:{checked:false}});
  assert.equal(pose.view,"side");assert.equal(pose.localArms.near.shoulder.x,-5);
  assert.equal(ctx.calls.filter(c=>c.image===atlas.body).length,0);
  const body=ctx.calls.find(c=>c.image===atlas.sideBody);
  const baseline=recorder();drawUprightReviewPlayer(baseline,atlas,weapon,visual,{...options,angle:0},{markers:{checked:false}});
  assert.deepEqual(body.m,baseline.calls.find(c=>c.image===atlas.sideBody).m);
  const draw=ctx.calls.find(c=>c.image===weapon),[a,b,c,d,e,f]=draw.m;
  const x=draw.args[0]+pose.mounted.muzzleX*draw.args[2],y=draw.args[1]+pose.mounted.muzzleY*draw.args[3];
  assert.ok(distance({x:a*x+c*y+e,y:b*x+d*y+f},pose.muzzle)<1e-7);
 }
});


test("side-profile elbows rest below the shoulders while the hands hold a level gun",()=>{
 for(const v of Object.values(WEAPON_VISUALS)) {
  const pose=uprightPose(v,0,{view:"side"});
  for(const arm of [pose.near,pose.far]) {
   assert.ok(arm.elbow.y>arm.shoulder.y+8);
   assert.ok(arm.elbow.x<arm.hand.x);
  }
 }
});


test("side head turns at the neck without changing the body asset or weapon anchors",()=>{
 const atlas={body:{naturalWidth:1000,naturalHeight:1400},sideBody:{naturalWidth:1024,naturalHeight:1536},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
 const ctx=recorder();drawUprightReviewPlayer(ctx,atlas,{},WEAPON_VISUALS.pistol,{view:"side",angle:0,time:0},{markers:{checked:false}});
 const parts=ctx.calls.filter(c=>c.image===atlas.sideBody);
 assert.equal(parts.length,3,"static lower body, upper body and isolated head");
 assert.deepEqual(parts[0].m,[1,0,0,1,0,0]);
 const head=parts[2],a=-Math.PI/9;
 assert.ok(Math.abs(head.m[1]-Math.sin(a))<1e-7);
 const neck={x:6,y:-89.5},m=head.m;
 assert.ok(distance({x:m[0]*neck.x+m[2]*neck.y+m[4],y:m[1]*neck.x+m[3]*neck.y+m[5]},neck)<1e-7);
});


test("empty-handed placement preserves the same front or side body and connected resting arms", () => {
  const atlas = { body: { naturalWidth: 1000, naturalHeight: 1400 }, sideBody: { naturalWidth: 1024, naturalHeight: 1536 }, upper: { naturalWidth: 600, naturalHeight: 300 }, forearm: { naturalWidth: 600, naturalHeight: 300 } };
  for (const view of ["front", "side"]) for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const options = { view, angle, time: 0.7, moving: true, motionBlend: 0.8 };
    const ctx = recorder(), armed = recorder();
    const pose = uprightPose(null, angle, options);
    drawUprightReviewPlayer(ctx, atlas, null, null, options, { markers: { checked: true } });
    drawUprightReviewPlayer(armed, atlas, {}, WEAPON_VISUALS.pistol, options, { markers: { checked: false } });
    const body = view === "side" ? atlas.sideBody : atlas.body;
    const unarmedBody = ctx.calls.find(c => c.image === body), armedBody = armed.calls.find(c => c.image === body);
    assert.deepEqual(unarmedBody.args, armedBody.args);
    assert.deepEqual(unarmedBody.m, armedBody.m);
    assert.equal(pose.mounted, null);
    assert.equal(pose.muzzle, null);
    assert.equal(ctx.calls.filter(c => c.image === atlas.upper || c.image === atlas.forearm).length, 6);
    for (const arm of [pose.near, pose.far]) {
      assert.ok(arm.targetReachable);
      assert.ok(arm.hand.y > arm.elbow.y && arm.elbow.y > arm.shoulder.y);
      assert.ok(Math.abs(distance(arm.shoulder, arm.elbow) - pose.upperLength) < 1e-7);
      assert.ok(Math.abs(distance(arm.elbow, arm.hand) - pose.forearmLength) < 1e-7);
    }
  }
});

test("switching between pistol, turret and tank always dispatches the upright character renderer", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/game.js", import.meta.url), "utf8");
  const start = source.indexOf("function drawPlayerSprite(");
  const body = source.slice(start, source.indexOf("\nfunction drawWatermelonCharge(", start));
  const calls = [];
  const review = { mode: "upright", enabled: { checked: true }, atlas: {} };
  const sprites = new Map([["pistol", { naturalWidth: 800 }]]);
  const draw = new Function("adultReview", "weaponSprites", "resolveWeaponVisual", "weaponVisualRatios", "game", "drawUprightReviewPlayer", "uprightReviewOptions", body + "\nreturn drawPlayerSprite;")(
    review, sprites, id => WEAPON_VISUALS[id] ?? null, () => ({ recoil: 0, feedback: 0 }), { time: 0 },
    (...args) => calls.push(args), () => ({ view: "side" }),
  );
  for (const weapon of ["pistol", "turret", "tank", "pistol"]) draw({ weapon, hitFlash: 0 }, 0, 0, 1, false, recorder());
  assert.equal(calls.length, 4);
  for (const call of calls) { assert.equal(call[1], review.atlas); assert.equal(call[4].view, "side"); }
  assert.equal(calls[0][3], WEAPON_VISUALS.pistol);
  assert.equal(calls[1][3], null);
  assert.equal(calls[2][3], null);
  assert.equal(calls[3][3], WEAPON_VISUALS.pistol);
});


test("scene enlargement scales the whole rig and muzzle together around the walking rig origin", () => {
  const atlas={body:{naturalWidth:1000,naturalHeight:1400},sideBody:{naturalWidth:1024,naturalHeight:1536},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
  const weapon={naturalWidth:800,naturalHeight:400},player={x:800,y:450};
  for(const view of ["front","side"]) for(const angle of [0,Math.PI/4,Math.PI,-Math.PI/2]) for(const visual of Object.values(WEAPON_VISUALS)) {
    const options={view,angle,scale:1.65,readability:true,time:.2,moving:true,recoilRatio:.5};
    const ctx=recorder();ctx.translate(player.x,player.y);
    drawUprightReviewPlayer(ctx,atlas,weapon,visual,options,{markers:{checked:false}});
    const draw=ctx.calls.find(c=>c.image===weapon),pose=uprightPose(visual,angle,options);
    const [a,b,c,d,e,f]=draw.m,x=draw.args[0]+pose.mounted.muzzleX*draw.args[2],y=draw.args[1]+pose.mounted.muzzleY*draw.args[3];
    assert.ok(distance({x:a*x+c*y+e,y:b*x+d*y+f},uprightMuzzlePoint(visual,player,angle,options))<1e-7);
    const body=ctx.calls.find(c=>c.image===(view==="side"?atlas.sideBody:atlas.body));
    const baseline=recorder();drawUprightReviewPlayer(baseline,atlas,weapon,visual,{...options,scale:1},{markers:{checked:false}});
    const original=baseline.calls.find(c=>c.image===body.image).m;
    for(let j=0;j<6;j++)assert.ok(Math.abs(body.m[j]-(original[j]*1.65+(j===4?player.x:j===5?player.y:0)))<1e-7);
    assert.equal(ctx.imageSmoothingEnabled,true);
    assert.equal(ctx.imageSmoothingQuality,"low","bilinear sampling avoids repeated expensive downscaling");
  }
});


test("side elbows sweep continuously without backwards shoulder flips or stretched bones", () => {
  for (const visual of Object.values(WEAPON_VISUALS)) for (const recoilRatio of [0, 1]) {
    let previous = null;
    for (let i = 0; i <= 720; i++) {
      const pose = uprightPose(visual, i * Math.PI / 360, {view:"side", recoilRatio, time:0});
      for (const name of ["near", "far"]) {
        const arm = pose[name];
        assert.ok(arm.targetReachable);
        assert.ok(Math.abs(boneDistance(arm.shoulder, arm.elbow) - pose.upperLength) < 1e-7);
        assert.ok(Math.abs(boneDistance(arm.elbow, arm.hand) - pose.forearmLength) < 1e-7);
        assert.ok(arm.elbow.y >= Math.min(arm.shoulder.y, arm.hand.y) - 1e-7, `${visual.src} ${i} ${name}: elbow flipped over shoulder`);
        if (previous) assert.ok(distance(arm.elbow, previous[name].elbow) < 1, "no elbow snap at vertical or backward aiming");
      }
      previous = pose;
    }
  }
});


test("gait follows distance at different frame rates, stops against a wall and ignores rolls",()=>{
 const states=[30,60,120].map(fps=>{const p={};for(let i=0;i<fps;i++)advanceUprightGait(p,270.25/fps,0,1/fps);return p;});
 for(const p of states){assert.ok(Math.abs(p.uprightGaitPhase-states[0].uprightGaitPhase)<1e-8);assert.ok(p.uprightMotionBlend>.99);}
 const p=states[0],phase=p.uprightGaitPhase;
 for(let i=0;i<20;i++)advanceUprightGait(p,0,0,1/60);
 assert.equal(p.uprightGaitPhase,phase);assert.equal(p.uprightMotionBlend,0);
 advanceUprightGait(p,50,30,.1,true);assert.equal(p.uprightGaitPhase,phase);
 advanceUprightGait(p,0,-10,.05);assert.equal(p.uprightMoveX,0);assert.equal(p.uprightMoveY,-1);assert.ok(p.uprightMotionBlend>.4);
});

test("lower body stays planted throughout movement in front and side views",()=>{
 const atlas={body:{naturalWidth:1000,naturalHeight:1400},sideBody:{naturalWidth:1024,naturalHeight:1536},upper:{naturalWidth:600,naturalHeight:300},forearm:{naturalWidth:600,naturalHeight:300}};
 for(const view of ["front","side"])for(let i=0;i<16;i++){
  const c=recorder();drawUprightReviewPlayer(c,atlas,{},WEAPON_VISUALS.pistol,{view,angle:i*.4,time:i*.1,gaitPhase:i*.4,motionBlend:1,moving:true},{markers:{checked:false}});
  const body=view==="side"?atlas.sideBody:atlas.body;
  assert.deepEqual(c.calls.find(x=>x.image===body).m,[1,0,0,1,0,0]);
 }
});
