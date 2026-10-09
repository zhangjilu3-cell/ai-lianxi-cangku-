export const TANK_TEXTURE_SRC = "/structures/tank-cold-steel.png";

// Separate source rectangles preserve the generated hull and barrel without clipping.
export const TANK_LAYERS = Object.freeze({
  hull: Object.freeze({ x: 0, y: 0, width: 960, height: 887, pivotX: 535, pivotY: 449, scale: 0.11 }),
  turret: Object.freeze({ x: 960, y: 0, width: 814, height: 887, pivotX: 278, pivotY: 462, scale: 0.11 }),
});

function drawTankLayer(context, image, layer, angle) {
  context.save();
  context.rotate(Number.isFinite(angle) ? angle : 0);
  context.drawImage(image, layer.x, layer.y, layer.width, layer.height,
    -layer.pivotX * layer.scale, -layer.pivotY * layer.scale,
    layer.width * layer.scale, layer.height * layer.scale);
  context.restore();
}

export function drawTank(context, image, aimAngle = 0, hullAngle = 0) {
  if (!image?.complete || !image.naturalWidth) return false;
  drawTankLayer(context, image, TANK_LAYERS.hull, hullAngle);
  drawTankLayer(context, image, TANK_LAYERS.turret, aimAngle);
  return true;
}
