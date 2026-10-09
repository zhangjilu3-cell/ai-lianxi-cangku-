import test from "node:test";
import assert from "node:assert/strict";
import { ADULT_REVIEW_RIG, ADULT_REVIEW_PISTOL, adultWeaponVisual, adultAttachmentPose, adultMuzzlePoint, drawAdultReviewPlayer, createAdultReview } from "../src/player-adult-review.js";
import { WEAPON_VISUALS } from "../src/weapon-visuals.js";
import { PLAYER_RIG_VISUAL } from "../src/player-arm-rig.js";

function recordingContext() {
  let matrix = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const calls = [];
  const multiply = ([a, b, c, d, e, f]) => {
    const [A, B, C, D, E, F] = matrix;
    matrix = [A*a+C*b, B*a+D*b, A*c+C*d, B*c+D*d, A*e+C*f+E, B*e+D*f+F];
  };
  const context = new Proxy({
    calls,
    save() { stack.push([...matrix]); },
    restore() { matrix = stack.pop(); },
    translate(x, y) { multiply([1, 0, 0, 1, x, y]); },
    rotate(a) { multiply([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    scale(x, y) { multiply([x, 0, 0, y, 0, 0]); },
    drawImage(image, ...args) { calls.push({ image, args, matrix: [...matrix] }); },
  }, { get(target, key) { return target[key] ?? (() => {}); } });
  return context;
}
const image = (id) => ({ id, naturalWidth: 1000, naturalHeight: 500 });
const images = { body: image("default-body"), farUpper: image("far-upper"), nearUpper: image("near-upper"), farForearm: image("far-forearm"), nearForearm: image("near-forearm") };
function reviewState() {
  return { body: image("adult-body"), pistol: image("held-pistol"), palm: image("palm-source"), markers: { checked: false } };
}

test("independent adult palms follow grips without shoulders or elbows for all weapons", () => {
  for (const visual of Object.values(WEAPON_VISUALS)) {
    const snapshot = JSON.stringify(visual);
    for (let step = 0; step <= 20; step += 1) {
      for (const charge of [0, 0.5, 1]) {
        const { hands, grips } = adultAttachmentPose(visual, step / 20, charge);
        assert.ok(hands.length >= 1 && hands.length <= 2);
        for (const hand of hands) {
          const target = hand.side === "near" ? grips.main : grips.support;
          assert.deepEqual(hand.position, target);
          assert.equal("shoulder" in hand, false);
          assert.equal("elbow" in hand, false);
          assert.ok(Number.isFinite(hand.rotation));
        }
      }
    }
    assert.equal(JSON.stringify(visual), snapshot);
  }
});

test("adult held pistol and body remain isolated from default role and weapon", () => {
  assert.equal(ADULT_REVIEW_RIG.bodyRotation, -Math.PI / 2);
  assert.equal(PLAYER_RIG_VISUAL.limbHeight, 18);
  const pistol = adultWeaponVisual(WEAPON_VISUALS.pistol);
  assert.equal(pistol.src, ADULT_REVIEW_PISTOL);
  assert.ok(pistol.height / pistol.width < 0.5, "foreshortened upright-held sprite");
  assert.ok(pistol.playerOffsetY >= 23, "mounted beside face");
  assert.equal(WEAPON_VISUALS.pistol.src, "/weapons/pistol.png");
  assert.equal(WEAPON_VISUALS.pistol.playerOffsetY, 1);
  assert.equal(adultAttachmentPose(WEAPON_VISUALS.pistol, 0, 0).hands.length, 1);
});

test("actual drawn muzzle matches world projectile origin across nine weapons, eight directions and recoil", () => {
  for (const [id, visual] of Object.entries(WEAPON_VISUALS)) {
    for (const recoil of [0, 0.25, 0.5, 1]) {
      for (let i = 0; i < 8; i += 1) {
        const angle = i * Math.PI / 4;
        const player = { x: 400, y: 300 };
        const context = recordingContext();
        const review = reviewState();
        const weaponImage = image(id);
        context.translate(player.x, player.y);
        context.rotate(angle);
        drawAdultReviewPlayer(context, images, weaponImage, visual, null, { recoilRatio: recoil, chargeRatio: 1 }, review);
        const drawn = context.calls.find((call) => call.image === (id === "pistol" ? review.pistol : weaponImage));
        assert.ok(drawn, id);
        const mounted = adultWeaponVisual(visual);
        const [a, b, c, d, e, f] = drawn.matrix;
        const x = drawn.args[0] + mounted.muzzleX * drawn.args[2];
        const y = drawn.args[1] + mounted.muzzleY * drawn.args[3];
        const world = adultMuzzlePoint(visual, player, angle, recoil);
        assert.ok(Math.hypot(a*x+c*y+e-world.x, b*x+d*y+f-world.y) < 1e-8, `${id} direction=${i} recoil=${recoil}`);
      }
    }
  }
});

test("adult renderer draws no arm assets and only palm source regions for long weapons", () => {
  for (const [id, visual] of Object.entries(WEAPON_VISUALS)) {
    const context = recordingContext();
    const review = reviewState();
    drawAdultReviewPlayer(context, images, image(id), visual, null, { recoilRatio: 1 }, review);
    assert.equal(context.calls.some((call) => Object.values(images).includes(call.image)), false);
    const palms = context.calls.filter((call) => call.image === review.palm);
    assert.equal(palms.length, id === "pistol" ? 0 : 2);
    for (const call of palms) {
      assert.equal(call.args.length, 8);
      assert.ok(call.args[0] >= 0.56 * review.palm.naturalWidth, "no sleeve or forearm");
      assert.ok(call.args[6] <= 14 && call.args[7] <= 11, "compact isolated palm");
    }
  }
});

test("adult review is opt-in and starts with clean view and live magnifier", () => {
  const selectors = {};
  const panel = { querySelector(selector) { return selectors[selector] ??= {}; } };
  const doc = { createElement() { return panel; }, body: { append() {} } };
  panel.style = {};
  assert.equal(createAdultReview("", doc), null);
  const review = createAdultReview("?playerModel=adult&revision=independent-palms", doc);
  assert.ok(review);
  assert.match(panel.innerHTML, /独立手掌/);
  assert.doesNotMatch(panel.innerHTML, /data-markers checked/);
  assert.match(panel.innerHTML, /data-zoom checked/);
  assert.doesNotMatch(panel.innerHTML, /肩|肘/);
});


test("upright game uses side view even with an older back-view URL",()=>{
 const panel={style:{},querySelector(){return {};}};
 const doc={createElement(){return panel;},body:{append(){}}};
 const review=createAdultReview("?playerModel=upright&view=back",doc);
 assert.equal(review.view.value,"side");assert.match(panel.innerHTML,/侧面/);
});
