const FULL_CIRCLE = Math.PI * 2;

function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function resolveWeaponDrawRect(visual, recoilRatio = 0) {
  const recoil = clamp01(recoilRatio);
  return {
    x:
      20 +
      visual.playerOffsetX -
      visual.gripX * visual.width -
      visual.recoilDistance * recoil,
    y: visual.playerOffsetY - visual.gripY * visual.height,
    width: visual.width,
    height: visual.height,
    rotation: -visual.recoilTilt * recoil,
  };
}

function finiteVisualGrip(visual) {
  return [
    "width",
    "height",
    "gripX",
    "gripY",
    "supportGripX",
    "supportGripY",
    "playerOffsetX",
    "playerOffsetY",
    "recoilDistance",
    "recoilTilt",
  ].every((key) => Number.isFinite(visual?.[key]));
}

export function resolveWeaponGripPoints(visual, recoilRatio = 0) {
  if (!finiteVisualGrip(visual)) return null;
  const rect = resolveWeaponDrawRect(visual, recoilRatio);
  const main = {
    x: rect.x + visual.gripX * visual.width,
    y: rect.y + visual.gripY * visual.height,
  };
  const dx = (visual.supportGripX - visual.gripX) * visual.width;
  const dy = (visual.supportGripY - visual.gripY) * visual.height;
  const cosine = Math.cos(rect.rotation);
  const sine = Math.sin(rect.rotation);
  return {
    main,
    support: {
      x: main.x + dx * cosine - dy * sine,
      y: main.y + dx * sine + dy * cosine,
    },
  };
}

function drawHeat(context, visual, feedback) {
  context.globalAlpha = 0.35 + feedback * 0.65;
  context.fillStyle = "#ff6b2d";
  context.shadowColor = "#ff3b1f";
  context.shadowBlur = 8 + feedback * 10;
  context.beginPath();
  context.ellipse(
    visual.width * 0.48,
    visual.height * 0.48,
    7 + feedback * 3,
    4 + feedback * 2,
    0,
    0,
    FULL_CIRCLE,
  );
  context.fill();
}

function drawCrystal(context, visual, feedback) {
  context.globalAlpha = 0.4 + feedback * 0.6;
  context.strokeStyle = "#d8b5ff";
  context.shadowColor = "#9d5cff";
  context.shadowBlur = 6 + feedback * 12;
  context.lineWidth = 1.5 + feedback;
  context.beginPath();
  context.moveTo(visual.width * 0.46, visual.height * 0.32);
  context.lineTo(visual.width * 0.73, visual.height * 0.5);
  context.lineTo(visual.width * 0.46, visual.height * 0.68);
  context.stroke();
}

function drawRicochetPrism(context, visual, feedback) {
  const width = visual.width;
  const height = visual.height;
  const muzzleX = visual.width * visual.muzzleX;
  const muzzleY = visual.height * visual.muzzleY;
  const pulse = 0.3 + feedback * 0.7;

  context.globalAlpha = pulse;
  context.strokeStyle = "#d7b7ff";
  context.shadowColor = "#8e4cff";
  context.shadowBlur = 4 + feedback * 9;
  context.lineWidth = 1.2 + feedback * 0.8;
  context.beginPath();
  context.moveTo(width * 0.38, height * 0.5);
  context.lineTo(width * 0.48, height * 0.24);
  context.lineTo(width * 0.6, height * 0.5);
  context.lineTo(width * 0.48, height * 0.76);
  context.lineTo(width * 0.38, height * 0.5);
  context.stroke();

  context.strokeStyle = "#68ece3";
  context.shadowColor = "#4bd7d0";
  context.shadowBlur = 3 + feedback * 7;
  context.lineWidth = 1.1 + feedback * 0.5;
  context.beginPath();
  context.moveTo(width * 0.53, height * 0.36);
  context.lineTo(width * 0.64, height * 0.22);
  context.lineTo(width * 0.8, height * 0.3);
  context.lineTo(muzzleX, muzzleY);
  context.stroke();

  const flare = 2 + feedback * 2;
  context.strokeStyle = "#f3e5ff";
  context.shadowColor = "#b770ff";
  context.shadowBlur = 4 + feedback * 8;
  context.lineWidth = 1 + feedback * 0.6;
  context.beginPath();
  context.moveTo(muzzleX - 2, muzzleY);
  context.lineTo(muzzleX, muzzleY - flare);
  context.lineTo(muzzleX + flare, muzzleY);
  context.lineTo(muzzleX, muzzleY + flare);
  context.lineTo(muzzleX - 2, muzzleY);
  context.stroke();
}

function drawTesla(context, visual, feedback, time) {
  const muzzleX = visual.width * visual.muzzleX;
  const muzzleY = visual.height * visual.muzzleY;
  context.globalAlpha = 0.45 + feedback * 0.55;
  context.strokeStyle = "#ffe46b";
  context.shadowColor = "#ffd428";
  context.shadowBlur = 7 + feedback * 10;
  context.lineWidth = 1.3;
  for (let strand = 0; strand < 2; strand += 1) {
    const phase = time * 24 + strand * 2.3;
    context.beginPath();
    for (let index = 0; index < 5; index += 1) {
      const ratio = index / 4;
      const x = visual.width * 0.48 + (muzzleX - visual.width * 0.48) * ratio;
      const y =
        visual.height * 0.48 +
        (muzzleY - visual.height * 0.48) * ratio +
        Math.sin(phase + index * 2.1) * (2 + feedback * 3);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function drawFrost(context, visual, feedback, time) {
  const muzzleX = visual.width * visual.muzzleX;
  const muzzleY = visual.height * visual.muzzleY;
  context.globalAlpha = 0.18 + feedback * 0.42;
  context.fillStyle = "#dffbff";
  context.shadowColor = "#83e8ff";
  context.shadowBlur = 5 + feedback * 8;
  for (let index = 0; index < 3; index += 1) {
    const drift = (time * 12 + index * 7) % 8;
    context.beginPath();
    context.ellipse(
      muzzleX + drift,
      muzzleY + (index - 1) * visual.height * 0.14,
      4 + feedback * 3,
      2 + feedback * 2,
      0,
      0,
      FULL_CIRCLE,
    );
    context.fill();
  }
}

function drawFeedback(context, visual, options) {
  const feedback = clamp01(options.feedbackRatio);
  if (visual.effectType === "none") return;
  if (visual.effectType === "heat") drawHeat(context, visual, feedback);
  if (visual.effectType === "crystal") drawCrystal(context, visual, feedback);
  if (visual.effectType === "ricochet") {
    drawRicochetPrism(context, visual, feedback);
  }
  if (visual.effectType === "tesla") {
    drawTesla(context, visual, feedback, options.time ?? 0);
  }
  if (visual.effectType === "frost") {
    drawFrost(context, visual, feedback, options.time ?? 0);
  }
}

export function drawWeaponModel(context, image, visual, options = {}) {
  if (!context || !image || !visual) return false;
  const rect = resolveWeaponDrawRect(visual, options.recoilRatio);
  context.save();
  context.translate(
    rect.x + visual.gripX * visual.width,
    rect.y + visual.gripY * visual.height,
  );
  context.rotate(rect.rotation);
  context.translate(
    -visual.gripX * visual.width,
    -visual.gripY * visual.height,
  );
  context.drawImage(image, 0, 0, rect.width, rect.height);
  drawFeedback(context, visual, options);
  context.restore();
  return true;
}
