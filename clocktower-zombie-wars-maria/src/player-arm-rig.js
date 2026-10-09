const EPSILON = 1e-6;

export const PLAYER_RIG_ASSETS = Object.freeze({
  body: "/player-rig/maria-body.png",
  farUpper: "/player-rig/far-upper-arm.png",
  farForearm: "/player-rig/far-forearm-hand.png",
  nearUpper: "/player-rig/near-upper-arm.png",
  nearForearm: "/player-rig/near-forearm-hand.png",
});

export const PLAYER_RIG_VISUAL = Object.freeze({
  bodySource: null,
  bodyRotation: Math.PI / 2,
  bodyDraw: Object.freeze({ x: -38, y: -30, width: 76, height: 60 }),
  far: Object.freeze({
    shoulder: Object.freeze({ x: 8, y: -13 }),
    upperLength: 22,
    forearmLength: 20,
    bendDirection: -1,
    minReachRatio: 0.18,
    maxReachRatio: 0.96,
    upperAsset: "farUpper",
    forearmAsset: "farForearm",
  }),
  near: Object.freeze({
    shoulder: Object.freeze({ x: 8, y: 13 }),
    upperLength: 22,
    forearmLength: 20,
    bendDirection: 1,
    minReachRatio: 0.18,
    maxReachRatio: 0.96,
    upperAsset: "nearUpper",
    forearmAsset: "nearForearm",
  }),
  limbHeight: 18,
  recoilScale: 0.38,
  upperArmPivot: Object.freeze([0.06, 0.5, 0.94, 0.5]),
  forearmPivot: Object.freeze([0.06, 0.5, 0.94, 0.5]),
});

function finitePoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > EPSILON ? value : fallback;
}

export function solveTwoBoneArm(options = {}) {
  const shoulder = finitePoint(options.shoulder)
    ? { ...options.shoulder }
    : { x: 0, y: 0 };
  const upperLength = positive(options.upperLength, 16);
  const forearmLength = positive(options.forearmLength, 15);
  const total = upperLength + forearmLength;
  const minRatio = Math.min(
    0.95,
    Math.max(
      0.05,
      Number.isFinite(options.minReachRatio) ? options.minReachRatio : 0.22,
    ),
  );
  const maxRatio = Math.min(
    0.99,
    Math.max(
      minRatio,
      Number.isFinite(options.maxReachRatio) ? options.maxReachRatio : 0.96,
    ),
  );
  const target = finitePoint(options.target)
    ? options.target
    : { x: shoulder.x + total * 0.72, y: shoulder.y };
  let dx = target.x - shoulder.x;
  let dy = target.y - shoulder.y;
  let rawDistance = Math.hypot(dx, dy);
  if (rawDistance < EPSILON) {
    dx = 1;
    dy = 0;
    rawDistance = 1;
  }
  const minReach = Math.max(
    Math.abs(upperLength - forearmLength) + EPSILON,
    total * minRatio,
  );
  const distance = Math.min(
    total * maxRatio,
    Math.max(minReach, rawDistance),
  );
  const unitX = dx / rawDistance;
  const unitY = dy / rawDistance;
  const hand = {
    x: shoulder.x + unitX * distance,
    y: shoulder.y + unitY * distance,
  };
  const along =
    (upperLength ** 2 - forearmLength ** 2 + distance ** 2) /
    (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const bend = options.bendDirection < 0 ? -1 : 1;
  const elbow = {
    x: shoulder.x + unitX * along - unitY * height * bend,
    y: shoulder.y + unitY * along + unitX * height * bend,
  };
  return {
    shoulder,
    elbow,
    hand,
    reachRatio: distance / total,
    targetReachable: Math.abs(distance - rawDistance) < EPSILON,
  };
}

function configuredArm(config, target, chargeRatio) {
  const pose = solveTwoBoneArm({ ...config, target });
  const charge = Math.min(
    1,
    Math.max(0, Number.isFinite(chargeRatio) ? chargeRatio : 0),
  );
  if (!charge) return pose;
  const dx = pose.hand.x - pose.shoulder.x;
  const dy = pose.hand.y - pose.shoulder.y;
  const length = Math.max(EPSILON, Math.hypot(dx, dy));
  return {
    ...pose,
    elbow: {
      x:
        pose.elbow.x +
        (-dy / length) * config.bendDirection * charge * 2,
      y:
        pose.elbow.y +
        (dx / length) * config.bendDirection * charge * 2,
    },
  };
}

function validRigArm(config) {
  return (
    finitePoint(config?.shoulder) &&
    Number.isFinite(config?.upperLength) &&
    config.upperLength > EPSILON &&
    Number.isFinite(config?.forearmLength) &&
    config.forearmLength > EPSILON &&
    Number.isFinite(config?.bendDirection)
  );
}

export function resolvePlayerArmPoseForRig(grips, rig, options = {}) {
  if (!finitePoint(grips?.main) || !finitePoint(grips?.support)) return null;
  if (!validRigArm(rig?.far) || !validRigArm(rig?.near)) return null;
  return {
    far: configuredArm(
      rig.far,
      grips.support,
      options.chargeRatio,
    ),
    near: configuredArm(
      rig.near,
      grips.main,
      options.chargeRatio,
    ),
  };
}

export function resolvePlayerArmPose(grips, options = {}) {
  return resolvePlayerArmPoseForRig(grips, PLAYER_RIG_VISUAL, options);
}

function readyImage(image) {
  return Boolean(image?.naturalWidth > 0 && image?.naturalHeight > 0);
}

function drawSegment(context, image, from, to, pivot, limbHeight) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (
    !context ||
    !readyImage(image) ||
    !Number.isFinite(length) ||
    !Array.isArray(pivot) ||
    pivot.length !== 4 ||
    !pivot.every(Number.isFinite)
  ) {
    return false;
  }
  const sourceDx = (pivot[2] - pivot[0]) * image.naturalWidth;
  const sourceDy = (pivot[3] - pivot[1]) * image.naturalHeight;
  const pivotSpan = Math.max(EPSILON, Math.hypot(sourceDx, sourceDy));
  const sourceAngle = Math.atan2(sourceDy, sourceDx);
  context.save();
  context.translate(from.x, from.y);
  context.rotate(Math.atan2(to.y - from.y, to.x - from.x) - sourceAngle);
  context.scale(
    length / pivotSpan,
    limbHeight / image.naturalHeight,
  );
  context.drawImage(
    image,
    -pivot[0] * image.naturalWidth,
    -pivot[1] * image.naturalHeight,
  );
  context.restore();
  return true;
}

export function drawPlayerArm(context, images, pose, side, handProfile = null, rig = PLAYER_RIG_VISUAL) {
  const config = rig[side];
  if (!context || !config || !pose) return false;
  const upper = images?.[config.upperAsset];
  const forearm = images?.[config.forearmAsset];
  if (!readyImage(upper) || !readyImage(forearm)) return false;
  drawSegment(
    context,
    upper,
    pose.shoulder,
    pose.elbow,
    rig.upperArmPivot,
    rig.limbHeight,
  );
  drawSegment(
    context,
    forearm,
    pose.elbow,
    pose.hand,
    handProfile?.[side]?.pivot ?? rig.forearmPivot,
    rig.limbHeight,
  );
  return true;
}

export function drawPlayerBody(context, images, rig = PLAYER_RIG_VISUAL) {
  const image = images?.body;
  if (!context || !readyImage(image)) return false;
  const target = rig.bodyDraw;
  context.save();
  context.rotate(rig.bodyRotation);
  context.drawImage(
    image,
    target.x,
    target.y,
    target.width,
    target.height,
  );
  context.restore();
  return true;
}
