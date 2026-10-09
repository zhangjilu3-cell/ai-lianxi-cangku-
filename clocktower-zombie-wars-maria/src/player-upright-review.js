import { solveTwoBoneArm } from "./player-arm-rig.js";
import { drawWeaponModel, resolveWeaponGripPoints } from "./player-weapon-renderer.js";

export const UPRIGHT_REVIEW_ASSETS = Object.freeze({
  body: "/player-rig/adult-review-body.png",
  sideBody: "/player-rig/adult-side-review-body.png",
  upper: "/player-rig/near-upper-arm.png",
  forearm: "/player-rig/near-forearm-hand.png",
});

export function uprightView(angle, requestedView = "front") {
  // Full frontal sprite stays upright; only facing and the weapon respond to aim.
  return { view: requestedView === "side" ? "side" : "front", facing: 1 };
}

function uprightRotate(point, angle, flip, anchor) {
  const y = point.y * flip;
  return { x: anchor.x + point.x * Math.cos(angle) - y * Math.sin(angle), y: anchor.y + point.x * Math.sin(angle) + y * Math.cos(angle) };
}

export function advanceUprightGait(player, dx, dy, dt, rolling = false) {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const distance = rolling ? 0 : Math.hypot(dx, dy);
  const target = Math.min(1, distance / dt / 235);
  const previous = player.uprightMotionBlend ?? 0;
  player.uprightMotionBlend = previous + (target - previous) * (1 - Math.exp(-dt * (target > previous ? 20 : 24)));
  if (player.uprightMotionBlend < 0.001) player.uprightMotionBlend = 0;
  if (distance > 0.001) {
    player.uprightGaitPhase = ((player.uprightGaitPhase ?? 0) + distance / 132 * Math.PI * 2) % (Math.PI * 2);
    player.uprightMoveX = dx / distance;
    player.uprightMoveY = dy / distance;
  }
}

export function uprightSineArc(time = 0, moving = false, motionBlend = moving ? 1 : 0, gaitPhase, moveX = 1, moveY = 0) {
  const t = Number.isFinite(time) ? time : 0;
  const blend = Math.max(0, Math.min(1, Number.isFinite(motionBlend) ? motionBlend : 0));
  const phase = Number.isFinite(gaitPhase) ? gaitPhase : t * 11;
  const x = Math.max(-1, Math.min(1, Number.isFinite(moveX) ? moveX : 0));
  const y = Math.max(-1, Math.min(1, Number.isFinite(moveY) ? moveY : 0));
  return {
    lean: Math.sin(t * 2) * 0.009 * (1 - blend) + (x * 0.035 + Math.sin(phase) * 0.017) * blend,
    lift: (1 - Math.cos(t * 4)) * 0.1 * (1 - blend) + (1 - Math.cos(phase * 2)) * 1.1 * blend,
    blend, phase, moveX: x, moveY: y,
  };
}

// Use a downward elbow pole with a small depth component. A flat two-bone
// chain has only two bend solutions and flips above the shoulder when aiming
// backwards. Depth lets the elbow pass smoothly around the wrist direction;
// the projected sleeve shortens naturally while its actual bone length stays fixed.
export function solveUprightSideArm(shoulder, target, upperLength, forearmLength) {
  const solved = solveTwoBoneArm({ shoulder, target, upperLength, forearmLength,
    bendDirection: 1, minReachRatio: 0.001, maxReachRatio: 0.99 });
  const dx = solved.hand.x - shoulder.x, dy = solved.hand.y - shoulder.y;
  const reach = Math.hypot(dx, dy);
  const ux = dx / reach, uy = dy / reach;
  const along = (upperLength ** 2 - forearmLength ** 2 + reach ** 2) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const depthPole = 0.65;
  const poleLength = Math.hypot(ux, depthPole);
  return { ...solved, shoulder: { ...shoulder, z: 0 }, hand: { ...solved.hand, z: 0 },
    elbow: {
      x: shoulder.x + ux * along - uy * ux * height / poleLength,
      y: shoulder.y + uy * along + ux * ux * height / poleLength,
      z: depthPole * height / poleLength,
    } };
}

export function uprightPose(visual, aimAngle, options = {}) {
  const motion = uprightSineArc(options.time, options.moving, options.motionBlend, options.gaitPhase, options.moveX, options.moveY);
  // All upper-body attachments use one waist transform; the lower body remains planted without stepping.
  const angle = aimAngle - motion.lean;
  const toWorld = point => ({
    x: point.x * Math.cos(motion.lean) - (point.y + 55) * Math.sin(motion.lean),
    y: -55 + point.x * Math.sin(motion.lean) + (point.y + 55) * Math.cos(motion.lean) - motion.lift,
    ...(Number.isFinite(point.z) ? { z: point.z } : {}),
  });
  const { view, facing } = uprightView(angle, options.view);
  // Keep the 38-unit side-view reach; equal segments can tuck close to the
  // shoulder without forcing the elbow backwards when the wrist passes it.
  const upperLength = view === "side" ? 19 : 21;
  const forearmLength = view === "side" ? 19 : 23;
  if (!visual) {
    const blend = Math.max(0, Math.min(1, options.motionBlend ?? (options.moving ? 1 : 0)));
    const swing = Math.sin(motion.phase) * blend * 7;
    const nearShoulder = { x: view === "side" ? -5 : 12, y: -85 };
    const farShoulder = { x: view === "side" ? -1 : -12, y: -85 };
    const arm = (shoulder, offset, bendDirection) => solveTwoBoneArm({
      shoulder, target: { x: shoulder.x + offset, y: shoulder.y + (upperLength + forearmLength) * 0.9 },
      upperLength, forearmLength, bendDirection, minReachRatio: 0.05, maxReachRatio: 0.99,
    });
    const near = arm(nearShoulder, (view === "side" ? 6 : 4) + swing, view === "side" ? 1 : -1);
    const far = arm(farShoulder, (view === "side" ? 3 : -4) - swing, 1);
    const worldArm = value => ({ ...value, shoulder: toWorld(value.shoulder), elbow: toWorld(value.elbow), hand: toWorld(value.hand) });
    return { view, facing, recoil: 0, bob: 0, motion, upperLength, forearmLength,
      mounted: null, muzzle: null, localArms: { near, far },
      near: worldArm(near), far: worldArm(far) };
  }
  const recoil = Math.min(1, Math.max(0, Number.isFinite(options.recoilRatio) ? options.recoilRatio : 0)) * 0.38;
  const bob = 0;
  const anchor = {
    x: Math.cos(angle) * 8 + Math.max(0, -Math.sin(angle)) * 10,
    y: (view === "side" ? -68 : -62) + Math.sin(angle) * 6,
  };
  const mounted = { ...visual, width: visual.width * 0.52, height: visual.height * 0.52, playerOffsetX: -20, playerOffsetY: 0 };
  const localGrips = resolveWeaponGripPoints(mounted, recoil);
  // Continuous wrist roll keeps left-facing weapons upright without a mirror snap.
  const flip = Math.cos(angle) / Math.sqrt(Math.cos(angle) ** 2 + 0.015);
  const transform = (point) => uprightRotate(point, angle, flip, anchor);
  const grips = { main: transform(localGrips.main), support: transform(localGrips.support) };
  const nearShoulder = { x: view === "side" ? -5 : 12, y: -85 + bob };
  const farShoulder = { x: view === "side" ? -1 : -12, y: -85 + bob };
  const oneHanded = visual.src.includes("pistol") || (visual.width === 54 && visual.height === 28);
  const wrist = (grip) => ({ x: grip.x - Math.cos(angle) * 5, y: grip.y - Math.sin(angle) * 5 });
  const nearTarget = wrist(grips.main);
  const farTarget = wrist(grips.support);
  const near = view === "side" ? solveUprightSideArm(nearShoulder, nearTarget, upperLength, forearmLength) : solveTwoBoneArm({ shoulder: nearShoulder, target: nearTarget, upperLength, forearmLength, bendDirection: view === "side" ? 1 : -1, minReachRatio: 0.05, maxReachRatio: 0.99 });
  const far = view === "side" ? solveUprightSideArm(farShoulder, farTarget, upperLength, forearmLength) : solveTwoBoneArm({ shoulder: farShoulder, target: farTarget, upperLength, forearmLength, bendDirection: 1, minReachRatio: 0.05, maxReachRatio: 0.99 });
  const tilt = -mounted.recoilTilt * recoil;
  const dx = (mounted.muzzleX - mounted.gripX) * mounted.width;
  const dy = (mounted.muzzleY - mounted.gripY) * mounted.height;
  const muzzle = transform({ x: localGrips.main.x + dx * Math.cos(tilt) - dy * Math.sin(tilt), y: localGrips.main.y + dx * Math.sin(tilt) + dy * Math.cos(tilt) });
  const worldArm = arm => ({ ...arm, shoulder: toWorld(arm.shoulder), elbow: toWorld(arm.elbow), hand: toWorld(arm.hand) });
  return { view, facing, recoil, bob, motion, upperLength, forearmLength, localArms: { near, far },
    anchor: toWorld(anchor), mounted, flip,
    grips: { main: toWorld(grips.main), support: toWorld(grips.support) },
    near: worldArm(near), far: worldArm(far), nearTarget: toWorld(nearTarget),
    farTarget: toWorld(farTarget), muzzle: toWorld(muzzle), oneHanded };

}

export function uprightMuzzlePoint(visual, player, angle, options = {}) {
  const { muzzle } = uprightPose(visual, angle, { ...options, recoilRatio: options.recoilRatio ?? 1 });
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  return { x: player.x + muzzle.x * scale, y: player.y + muzzle.y * scale };
}

const bodyBounds = new WeakMap();
function visibleBody(image) {
  if (bodyBounds.has(image)) return bodyBounds.get(image);
  const width = image.naturalWidth, height = image.naturalHeight;
  let bounds = { x: 0, y: 0, width, height };
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, width, height).data;
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 20) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    if (right >= left) bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }
  bodyBounds.set(image, bounds); return bounds;
}
function drawUprightSegment(context, assets, region, from, to, thickness) {
  const image = assets[region];
  const start = 0.08, end = region === "forearm" ? 0.64 : 0.94;
  const width = Math.hypot(to.x - from.x, to.y - from.y) / (end - start);
  context.save(); context.translate(from.x, from.y);
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x));
  context.drawImage(image, 0, 0, image.naturalWidth * end, image.naturalHeight, -start * width, -thickness / 2, width * end, thickness);
  context.restore();
}
function drawUprightHand(context, image, grip, angle, flip) {
  context.save(); context.translate(grip.x, grip.y); context.rotate(angle); context.scale(1, flip);
  context.drawImage(image, image.naturalWidth * 0.64, 0, image.naturalWidth * 0.36, image.naturalHeight, -5, -5, 12, 10);
  context.restore();
}

// The source mantle covers the upper arms. Bind each side to its humerus,
// instead of leaving a second, motionless arm silhouette on the torso.
export function uprightMantleRotation(arm, side) {
  const rest = Math.atan2(20, side * 8);
  return Math.atan2(arm.elbow.y - arm.shoulder.y, arm.elbow.x - arm.shoulder.x) - rest;
}
function drawUprightLowerBody(context, image, bounds, width) {
  context.save(); context.beginPath(); context.rect(-width, -58, width * 2, 58);
  context.clip();
  context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, -width / 2, -110, width, 110);
  context.restore();
}

function drawUprightBody(context, image, pose) {
  const bounds = visibleBody(image);
  const width = 110 * bounds.width / bounds.height;
  const draw = () => context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, -width / 2, -110, width, 110);
  drawUprightLowerBody(context, image, bounds, width, pose);
  context.save(); context.translate(0, -55 - pose.motion.lift);
  context.rotate(pose.motion.lean); context.translate(0, 55);
  context.beginPath(); context.rect(-width * 2, -150, width * 4, 99); context.clip();
  // Keep head, breastplate and coat; the two side panels are rendered separately.
  context.save(); context.beginPath();
  context.moveTo(-width, -110); context.lineTo(width, -110);
  context.lineTo(width, -91); context.lineTo(8, -91);
  context.lineTo(8, -59); context.lineTo(width, -59);
  context.lineTo(width, 0); context.lineTo(-width, 0);
  context.lineTo(-width, -59); context.lineTo(-8, -59);
  context.lineTo(-8, -91); context.lineTo(-width, -91);
  context.closePath(); context.clip(); draw(); context.restore();
  for (const [arm, side] of [[pose.localArms.far, -1], [pose.localArms.near, 1]]) {
    context.save(); context.translate(arm.shoulder.x, arm.shoulder.y);
    context.rotate(uprightMantleRotation(arm, side));
    context.translate(-arm.shoulder.x, -arm.shoulder.y);
    context.beginPath(); context.rect(side < 0 ? -width : 8, -91, width - 8, 32);
    context.clip(); draw(); context.restore();
  }
  context.restore();
}

function drawUprightSideBody(context, image, pose) {
  const bounds = visibleBody(image);
  const width = 110 * bounds.width / bounds.height;
  const drawSource = () => context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, -width / 2, -110, width, 110);
  const traceHead = () => {
    context.moveTo(-100, -150); context.lineTo(100, -150);
    context.lineTo(100, -88); context.lineTo(10.5, -88);
    context.lineTo(6, -89.5); context.lineTo(0, -91.5);
    context.lineTo(-5, -93); context.lineTo(-100, -93); context.closePath();
  };
  const draw = () => {
    // Preserve the exact body pixels; only the existing head and hat turn at the neck.
    context.save(); context.beginPath(); context.rect(-100, -150, 200, 160);
    traceHead(); context.clip("evenodd"); drawSource(); context.restore();
    context.save(); context.translate(6, -89.5); context.rotate(-Math.PI / 9);
    context.translate(-6, 89.5); context.beginPath(); traceHead(); context.clip();
    drawSource(); context.restore();
  };
  drawUprightLowerBody(context, image, bounds, width, pose);
  context.save(); context.translate(0, -55 - pose.motion.lift);
  context.rotate(pose.motion.lean); context.translate(0, 55);
  context.beginPath(); context.rect(-width * 2, -150, width * 4, 99);
  context.clip(); draw(); context.restore();
}

const uprightLitSprites = new WeakMap();
const uprightLitAtlases = new WeakMap();
const uprightSpritePreparations = new Set();

function readableUprightSprite(image) {
  if (!image?.naturalWidth) return image;
  if (uprightLitSprites.has(image)) return uprightLitSprites.get(image);
  const result = document.createElement("canvas");
  const ratio = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
  result.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  result.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const target = result.getContext("2d");
  target.filter = "brightness(1.16) contrast(1.08) saturate(1.06)";
  target.shadowColor = "rgba(255, 224, 166, 0.72)";
  target.shadowBlur = 5;
  target.drawImage(image, 0, 0, result.width, result.height);
  target.shadowBlur = 0;
  target.filter = "none";
  result.naturalWidth = result.width; result.naturalHeight = result.height; result.complete = true;
  if (typeof Image === "function") {
    // A canvas source forces cross-surface readbacks on some GPUs. Freeze it as a PNG.
    uprightLitSprites.set(image, image);
    const prepared = new Image();
    const ready = new Promise(resolve => {
      prepared.onload = () => { uprightLitSprites.set(image, prepared); resolve(); };
      prepared.onerror = () => resolve();
    });
    uprightSpritePreparations.add(ready);
    ready.then(() => uprightSpritePreparations.delete(ready));
    prepared.src = result.toDataURL("image/png");
    return image;
  }
  uprightLitSprites.set(image, result);
  return result;
}

function readableUprightAtlas(atlas) {
  if (!uprightLitAtlases.has(atlas)) uprightLitAtlases.set(atlas, {});
  const prepared = uprightLitAtlases.get(atlas);
  for (const [key, image] of Object.entries(atlas)) prepared[key] = readableUprightSprite(image);
  return prepared;
}

export async function prepareUprightReviewSprites(atlas, weapons) {
  readableUprightAtlas(atlas);
  for (const weapon of weapons) readableUprightSprite(weapon);
  await Promise.all(uprightSpritePreparations);
}

export function drawUprightReviewPlayer(context, atlas, weaponImage, visual, options, review) {
  const angle = options.angle ?? 0;
  const pose = uprightPose(visual, angle, options);
  const scale = Number.isFinite(options.scale) && options.scale > 0 ? options.scale : 1;
  context.save();
  context.scale(scale, scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "low";
  // Brightness and rim lighting are baked once; the animation uses ordinary sprites.
  if (options.readability && typeof document !== "undefined") {
    atlas = readableUprightAtlas(atlas);
    weaponImage = readableUprightSprite(weaponImage);
  }

  context.fillStyle = "#0005";
  context.beginPath();
  context.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2);
  context.fill();
  if (pose.view === "side" && atlas.sideBody) {
    drawUprightSegment(context, atlas, "upper", pose.far.shoulder, pose.far.elbow, 10);
    drawUprightSegment(context, atlas, "forearm", pose.far.elbow, pose.far.hand, 8);
    drawUprightSideBody(context, atlas.sideBody, pose);
    drawUprightSegment(context, atlas, "upper", pose.near.shoulder, pose.near.elbow, 10);
    drawUprightSegment(context, atlas, "forearm", pose.near.elbow, pose.near.hand, 8);
  } else {
    for (const arm of [pose.far, pose.near]) drawUprightSegment(context, atlas, "upper", arm.shoulder, arm.elbow, 12);
    drawUprightBody(context, atlas.body, pose);
    for (const arm of [pose.far, pose.near]) drawUprightSegment(context, atlas, "forearm", arm.elbow, arm.hand, 10);
  }
  if (pose.mounted) {
    context.save();
    context.translate(pose.anchor.x, pose.anchor.y);
    context.rotate(angle);
    context.scale(1, pose.flip);
    drawWeaponModel(context, weaponImage, pose.mounted, { ...options, recoilRatio: pose.recoil });
    context.restore();
    drawUprightHand(context, atlas.forearm, pose.grips.support, angle, pose.flip);
    drawUprightHand(context, atlas.forearm, pose.grips.main, angle, pose.flip);
  } else {
    for (const arm of [pose.far, pose.near]) {
      const handAngle = Math.atan2(arm.hand.y - arm.elbow.y, arm.hand.x - arm.elbow.x);
      const palm = { x: arm.hand.x + Math.cos(handAngle) * 5, y: arm.hand.y + Math.sin(handAngle) * 5 };
      drawUprightHand(context, atlas.forearm, palm, handAngle, 1);
    }
  }
  if (review.markers.checked) {
    context.fillStyle = "#6effc3";
    for (const arm of [pose.near, pose.far]) {
      for (const point of [arm.shoulder, arm.elbow, arm.hand]) {
        context.beginPath(); context.arc(point.x, point.y, 1.1, 0, Math.PI * 2); context.fill();
      }
    }
    context.strokeStyle = "#ffcf69";
    if (pose.muzzle) context.strokeRect(pose.muzzle.x - 2, pose.muzzle.y - 2, 4, 4);
  }
  context.restore();
  review.lastView = pose.view;
}
