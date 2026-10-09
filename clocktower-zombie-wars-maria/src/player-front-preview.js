export const FRONT_PREVIEW_VISUAL = Object.freeze({
  bodyDraw: Object.freeze({ x: -41, y: -58, width: 82, height: 96 }),
  weaponOffset: Object.freeze({ x: 7, y: 27 }),
  rig: Object.freeze({
    far: Object.freeze({
      shoulder: Object.freeze({ x: -18, y: -20 }),
      upperLength: 24,
      forearmLength: 22,
      bendDirection: -1,
      minReachRatio: 0.18,
      maxReachRatio: 0.96,
    }),
    near: Object.freeze({
      shoulder: Object.freeze({ x: 18, y: -20 }),
      upperLength: 24,
      forearmLength: 22,
      bendDirection: 1,
      minReachRatio: 0.18,
      maxReachRatio: 0.96,
    }),
  }),
});

export function resolvePreviewMode(search = "") {
  return new URLSearchParams(search).get("mode") === "front" ? "front" : "aim";
}

export function offsetFrontPreviewGrips(grips) {
  if (!grips?.main || !grips?.support) return null;
  const { x, y } = FRONT_PREVIEW_VISUAL.weaponOffset;
  return {
    main: { x: grips.main.x + x, y: grips.main.y + y },
    support: { x: grips.support.x + x, y: grips.support.y + y },
  };
}

export function drawFrontPlayerBody(context, images) {
  const image = images?.body;
  if (!context || !image?.naturalWidth || !image?.naturalHeight) return false;
  const target = FRONT_PREVIEW_VISUAL.bodyDraw;
  context.save();
  context.drawImage(image, target.x, target.y, target.width, target.height);
  context.restore();
  return true;
}

export function drawFrontFaceDetails(context) {
  if (!context) return false;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  context.fillStyle = "#e7b18a";
  context.beginPath();
  context.ellipse(0, -39, 14, 13, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#17191b";
  for (const x of [-5, 5]) {
    context.beginPath();
    context.ellipse(x, -40, 1.8, 2.4, 0, 0, Math.PI * 2);
    context.fill();
  }

  context.strokeStyle = "#4f332a";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(-8, -44);
  context.quadraticCurveTo(-5, -46, -2, -44.5);
  context.moveTo(2, -44.5);
  context.quadraticCurveTo(5, -46, 8, -44);
  context.stroke();

  context.strokeStyle = "#a96f55";
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(0, -40);
  context.lineTo(-1, -35.8);
  context.lineTo(1.5, -35.5);
  context.stroke();

  context.strokeStyle = "#6f342f";
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(0, -32.8, 4.2, 0.15 * Math.PI, 0.85 * Math.PI);
  context.stroke();

  context.fillStyle = "#39464a";
  context.beginPath();
  context.roundRect(-13, -58, 26, 11, 5);
  context.fill();
  context.fillStyle = "#202a2d";
  context.beginPath();
  context.roundRect(-18, -49.5, 36, 5, 2.5);
  context.fill();

  context.restore();
  return true;
}
